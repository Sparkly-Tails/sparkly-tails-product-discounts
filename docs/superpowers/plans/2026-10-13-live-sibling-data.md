# Live Sibling Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop copying sibling titles, handles and image URLs into each product's tier-discount metafield; store IDs only and let Liquid read the live values through reference metafields.

**Architecture:** The admin writer stores `siblings` as IDs and writes two reference-list metafields per product (`sibling_products`, `sibling_variants`). The theme Liquid resolves them live and falls back to old copied fields while old data exists. The widget script builds its mix & match list from what Liquid emits.

**Tech Stack:** Next.js / TypeScript (vitest), Shopify Admin GraphQL (`metafieldsSet` / `metafieldsDelete`), theme extension Liquid, plain-JS widget script tested with `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-13-live-sibling-data-design.md`

## Global Constraints

- Work in the worktree `.claude/worktrees/live-sibling-data` on branch `feat/live-sibling-data`. Never commit to `main`.
- Before every push: `gh pr view feat/live-sibling-data --json state` — if merged, cut a new branch from `origin/main` and open a new PR.
- Every code commit bumps the version in `package.json` and the two top fields of `package-lock.json` (docs-only commits skip it): Task 2 → `0.22.0`, Task 3 → `0.22.1`, Task 4 → `0.22.2`. Command: `npm version <v> --no-git-tag-version`.
- Pure functions: pass values in as arguments; do not close over outer-scope state.
- No hardcoded colours.
- Each shell: `source ~/.nvm/nvm.sh && nvm use 22.23.3`.
- Run vitest one process at a time (jsdom suites are timing-sensitive). In vitest `beforeEach`, use a block body (`beforeEach(() => { vi.restoreAllMocks() })`), never an arrow that returns the mock.
- Extension tests: `node --test extensions/product-tier-pricing-tests/*.test.js`.
- Namespace stays `sparkly_product_discounts` (the `$app:smooth_discount` move is on hold and out of scope).
- Merging and `shopify app deploy --config shopify.app.toml` are the user's actions; do not run them.
- Never touch production data. The gate (Task 1) runs on a demo store.
- Commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A sibling no longer resolves (deleted, unpublished, draft):** the row disappears from the mix & match list but its units still count toward the combined quantity. Pinned in Task 3 (`listedMixMatchItems` test) and Task 4 (Liquid keeps the entry with `listed: false`).
2. **A discount with more siblings than Liquid can loop over:** Liquid loops over a reference list return only the first 50 items. The writer caps each list at `SIBLING_REFERENCE_LIMIT = 50`; the JSON `siblings` still has every ID, so the extra rows are counted but not listed. Pinned in Task 2 (limit test).
3. **A product that ends up with no siblings** (single-member discount, or the others were removed): no empty list is written and any old list is deleted, so stale references cannot linger. Pinned in Task 2.
4. **Whole-product sibling vs. variant sibling:** each goes to the right list and keeps member order. Pinned in Task 2.
5. **Old data in the store (live discounts) while the new Liquid is deployed:** the fallback shows the copied fields so the widget never blanks. Covered by the Task 4 live check and the fallback block being easy to find and remove later.

---

### Task 1: Gate — prove the Liquid assumptions on a demo store (user-run, no repo code)

This task needs a **demo or development store** (never production), its Admin API token, and a dev theme. The user runs it; nothing from it is committed except the recorded results. Do not start Tasks 2–4 until the results are recorded.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-live-sibling-data-design.md` (append "Gate results")
- Create (conditional, only if the gate fails assumption 1): `scripts/create-sibling-definitions.mjs`

**Interfaces:**
- Produces: the recorded answers to the four spec assumptions, and the confirmed value of `SIBLING_REFERENCE_LIMIT` used by Task 2.

- [ ] **Step 1: Write the probe script outside the repo**

Save as `/private/tmp/claude-501/-Users-rubencamposdeteba-Documents-sparkly-tails-product-discounts/4a177611-6115-45c3-bebd-a4d24173b6b9/scratchpad/probe-references.mjs`:

```js
// Throwaway probe. Usage:
//   DEMO_SHOP=<demo>.myshopify.com DEMO_TOKEN=<token> node probe-references.mjs <ownerProductGid> <wholeProductGid> <variantGid>
const [owner, whole, variant] = process.argv.slice(2)
const shop = process.env.DEMO_SHOP
const token = process.env.DEMO_TOKEN
if (!owner || !whole || !variant || !shop || !token) {
  console.error('Set DEMO_SHOP and DEMO_TOKEN and pass three GIDs.')
  process.exit(1)
}
if (!shop.endsWith('.myshopify.com')) {
  console.error('DEMO_SHOP must be a .myshopify.com domain.')
  process.exit(1)
}
async function gql(query, variables) {
  const res = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}
const set = `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { key } userErrors { field message } } }`
const del = `mutation($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { deletedMetafields { key } userErrors { field message } } }`
const ns = 'sparkly_product_discounts'

console.log('1. set both reference lists on the owner product')
console.log(JSON.stringify(await gql(set, { m: [
  { ownerId: owner, namespace: ns, key: 'sibling_products', type: 'list.product_reference', value: JSON.stringify([whole]) },
  { ownerId: owner, namespace: ns, key: 'sibling_variants', type: 'list.variant_reference', value: JSON.stringify([variant]) },
] }), null, 2))

console.log('2. delete a key that does not exist (must give no userErrors)')
console.log(JSON.stringify(await gql(del, { m: [{ ownerId: owner, namespace: ns, key: 'sibling_never_written' }] }), null, 2))

console.log('3. a list of 129 references (must be refused) — reusing the whole product 129 times')
console.log(JSON.stringify(await gql(set, { m: [
  { ownerId: owner, namespace: ns, key: 'sibling_products_limit_probe', type: 'list.product_reference', value: JSON.stringify(Array(129).fill(whole)) },
] }), null, 2))
```

- [ ] **Step 2: Run it against the demo store**

Pick three IDs on the demo store: an owner product, a different whole product, and a variant of a third (multi-variant) product. Run:

```bash
DEMO_SHOP=<demo>.myshopify.com DEMO_TOKEN=<token> node probe-references.mjs gid://shopify/Product/<owner> gid://shopify/Product/<whole> gid://shopify/ProductVariant/<variant>
```

Expected: step 1 has no `userErrors`; step 2 has no `userErrors` (deleting a missing key is not an error); step 3 returns a `userErrors` entry about too many items.

- [ ] **Step 3: Probe the Liquid on a dev theme**

Add `snippets/probe.liquid` to the demo dev theme and render it from the product template with `{% render 'probe' %}`:

```liquid
{%- assign probe_products = product.metafields.sparkly_product_discounts.sibling_products.value -%}
{%- for p in probe_products -%}
  PRODUCT {{ p.id }} | {{ p.title }} | {{ p.url }} | {{ p.featured_image | image_url: width: 160 }}<br>
{%- endfor -%}
{%- assign probe_variants = product.metafields.sparkly_product_discounts.sibling_variants.value -%}
{%- for v in probe_variants -%}
  VARIANT {{ v.id }} | {{ v.title }} | {{ v.product.title }} | {{ v.product.url }} | {{ v.featured_image | image_url: width: 160 }} | {{ v.product.featured_image | image_url: width: 160 }}<br>
{%- endfor -%}
```

Load the owner product's page and check:

1. Both lines print with real values (assumptions 1 and 2). The variant line shows a variant title, the product title and an image (variant image or the product's).
2. Rename the whole product in the demo admin, reload: the line shows the new title (live).
3. Set the whole product to Draft, reload: its line disappears (assumption 4).
4. Write a list of exactly 51 references (edit step 1's script to repeat `whole` 51 times under a throwaway key and loop over that key in the snippet): the loop prints 50 lines (assumption 3: the Liquid loop limit).

- [ ] **Step 4: Record the results in the spec**

Append to `docs/superpowers/specs/2026-10-13-live-sibling-data-design.md`:

```markdown

## Gate results (2026-10-13)

1. References resolve without a definition: <yes | no>
2. Variant reference gives `variant.title`, `variant.product.title` and an image: <yes | no, with detail>
3. Maximum list size: write limit 128; Liquid loop returns <50 | other> items
4. Draft/unpublished product disappears from the resolved list: <yes | no>
5. `metafieldsDelete` on a missing key gives no userErrors: <yes | no>
```

Fill every `<…>` with what you saw before committing. If anything differs from the plan's assumptions (definition required, loop limit not 50, delete of a missing key errors), stop and tell the controller: Tasks 2–4 change as follows.

- Definition required → run Step 5.
- Loop limit is not 50 → use the observed number for `SIBLING_REFERENCE_LIMIT` in Task 2.
- Deleting a missing key returns a userError → stop and tell the controller; Task 2's writer must then skip the delete for a key that was never written, and the plan changes.

- [ ] **Step 5 (only if assumption 1 failed): create storefront-readable definitions**

TOML definitions are for app-owned namespaces only, so use GraphQL definitions in the existing merchant namespace. Create `scripts/create-sibling-definitions.mjs`:

```js
// Run once per store, manually. Usage: node scripts/create-sibling-definitions.mjs
const shop = process.env.SHOPIFY_SHOP
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
if (!shop || !accessToken) {
  console.error('Set SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN before running this script.')
  process.exit(1)
}

const definitions = [
  { key: 'sibling_products', name: 'Tier discount sibling products', type: 'list.product_reference' },
  { key: 'sibling_variants', name: 'Tier discount sibling variants', type: 'list.variant_reference' },
]

for (const def of definitions) {
  const res = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: JSON.stringify({
      query: `mutation($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id key }
          userErrors { field message code }
        }
      }`,
      variables: {
        definition: {
          name: def.name,
          namespace: 'sparkly_product_discounts',
          key: def.key,
          type: def.type,
          ownerType: 'PRODUCT',
          access: { storefront: 'PUBLIC_READ' },
        },
      },
    }),
  })
  const json = await res.json()
  console.log(def.key, JSON.stringify(json.data?.metafieldDefinitionCreate ?? json))
}
```

Run it on the demo store, repeat Step 3 check 1 to confirm resolution now works, and add "run `scripts/create-sibling-definitions.mjs` on the real store before step 3 of the rollout" to the rollout list in the spec.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-10-13-live-sibling-data-design.md
# only if Step 5 ran:
git add scripts/create-sibling-definitions.mjs
git commit -m "docs: record the sibling-reference gate results

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Writer — IDs only, plus the two reference lists

**Files:**
- Modify: `src/lib/product-tiers.ts` (whole file rewritten below)
- Test: `tests/lib/product-tiers.test.ts` (whole file rewritten below)
- Modify: `package.json`, `package-lock.json` (version `0.22.0`)

**Interfaces:**
- Consumes: `Discount`, `DiscountMember` from `@/lib/config` (`Discount.members: { productId: string; variantId?: string }[]`, plus `discountId`, `title`, `pricingMode`, `tiers`); `shopifyQuery` from `@/lib/shopify-client`.
- Produces (exported, used by Task 4's drift test and by callers):
  - `SIBLING_REFERENCE_LIMIT: number` (50)
  - `SIBLING_PRODUCTS_KEY: 'sibling_products'`, `SIBLING_VARIANTS_KEY: 'sibling_variants'`
  - `buildProductMetafields(discount: Discount, productId: string, limit: number): ProductMetafields`
  - `metafieldWrites(productId: string, built: ProductMetafields): { toSet: MetafieldSetInput[]; toDelete: MetafieldIdentifier[] }`
  - `syncDiscountMetafields(discount)` and `clearDiscountMetafields(members)` keep their signatures.

- [ ] **Step 0: Make dependencies available in the worktree**

```bash
cd /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/.claude/worktrees/live-sibling-data
test -e node_modules || ln -s /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/node_modules node_modules
git status --short   # expected: nothing (node_modules is ignored)
```

- [ ] **Step 1: Write the failing tests**

Replace the whole of `tests/lib/product-tiers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildProductMetafields,
  metafieldWrites,
  syncDiscountMetafields,
  clearDiscountMetafields,
  SIBLING_REFERENCE_LIMIT,
  SIBLING_PRODUCTS_KEY,
  SIBLING_VARIANTS_KEY,
} from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'
import * as products from '@/lib/products'
import type { Discount } from '@/lib/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const P3 = 'gid://shopify/Product/3'
const V20 = 'gid://shopify/ProductVariant/20'
const V21 = 'gid://shopify/ProductVariant/21'

const mix: Discount = {
  discountId: 'disc_1', name: 'Mix', title: 'Mix & Match', status: 'live', pricingMode: 'percent',
  members: [{ productId: P1 }, { productId: P2, variantId: V20 }, { productId: P2, variantId: V21 }],
  tiers: [{ minQty: 7, percentOff: 4 }],
}

describe('buildProductMetafields', () => {
  it('a whole-product member gets variant siblings as IDs only, and no copied display fields', () => {
    const built = buildProductMetafields(mix, P1, SIBLING_REFERENCE_LIMIT)
    expect(built.value).toEqual({
      discountId: 'disc_1',
      title: 'Mix & Match',
      pricingMode: 'percent',
      tiers: [{ minQty: 7, percentOff: 4 }],
      ownVariantIds: null,
      siblings: [
        { productId: P2, variantId: V20 },
        { productId: P2, variantId: V21 },
      ],
    })
    expect(built.productRefs).toEqual([])
    expect(built.variantRefs).toEqual([V20, V21])
  })

  it('a product with several of its own variants lists them in ownVariantIds and gets the whole-product sibling as a product reference', () => {
    const built = buildProductMetafields(mix, P2, SIBLING_REFERENCE_LIMIT)
    expect(built.value.ownVariantIds).toEqual([V20, V21])
    expect(built.value.siblings).toEqual([{ productId: P1 }])
    expect(built.productRefs).toEqual([P1])
    expect(built.variantRefs).toEqual([])
    expect('ownVariantOptions' in built.value).toBe(false)
  })

  it('keeps member order in the siblings and in each reference list', () => {
    const discount: Discount = {
      ...mix,
      members: [{ productId: P1 }, { productId: P2, variantId: V20 }, { productId: P3 }, { productId: P2, variantId: V21 }],
    }
    const built = buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT)
    expect(built.value.siblings).toEqual([
      { productId: P2, variantId: V20 },
      { productId: P3 },
      { productId: P2, variantId: V21 },
    ])
    expect(built.productRefs).toEqual([P3])
    expect(built.variantRefs).toEqual([V20, V21])
  })

  it('caps each reference list at the limit but still keeps every sibling ID, so extra rows are counted though not listed', () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ productId: `gid://shopify/Product/${100 + i}` }))
    const discount: Discount = { ...mix, members: [{ productId: P1 }, ...many] }
    const built = buildProductMetafields(discount, P1, 2)
    expect(built.productRefs).toEqual(['gid://shopify/Product/100', 'gid://shopify/Product/101'])
    expect(built.value.siblings).toHaveLength(4)
  })

  it('a product that is the only member has no siblings and no references', () => {
    const discount: Discount = { ...mix, members: [{ productId: P1 }] }
    const built = buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT)
    expect(built.value.siblings).toEqual([])
    expect(built.productRefs).toEqual([])
    expect(built.variantRefs).toEqual([])
  })
})

describe('metafieldWrites', () => {
  it('sets the discount and each non-empty list, and deletes each empty list', () => {
    const built = buildProductMetafields(mix, P1, SIBLING_REFERENCE_LIMIT)
    const { toSet, toDelete } = metafieldWrites(P1, built)
    expect(toSet.map((m) => m.key)).toEqual(['discount', SIBLING_VARIANTS_KEY])
    expect(toSet[1]).toEqual({
      ownerId: P1, namespace: 'sparkly_product_discounts', key: SIBLING_VARIANTS_KEY,
      type: 'list.variant_reference', value: JSON.stringify([V20, V21]),
    })
    expect(toDelete).toEqual([{ ownerId: P1, namespace: 'sparkly_product_discounts', key: SIBLING_PRODUCTS_KEY }])
  })

  it('a product with no siblings sets only the discount and deletes both lists', () => {
    const discount: Discount = { ...mix, members: [{ productId: P1 }] }
    const { toSet, toDelete } = metafieldWrites(P1, buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT))
    expect(toSet.map((m) => m.key)).toEqual(['discount'])
    expect(toDelete.map((m) => m.key)).toEqual([SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY])
  })
})

describe('syncDiscountMetafields', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('writes IDs and reference lists per unique product without looking up product details', async () => {
    const memberInfo = vi.spyOn(products, 'getMemberInfo')
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
      metafieldsDelete: { userErrors: [] },
    })

    await syncDiscountMetafields(mix)

    expect(memberInfo).not.toHaveBeenCalled()
    // two products, each: one set call and one delete call (one empty list each)
    expect(querySpy).toHaveBeenCalledTimes(4)

    const setFor = (ownerId: string) =>
      querySpy.mock.calls.find((c) => (c[0] as string).includes('metafieldsSet') && (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === ownerId)!
    const metafields = (call: ReturnType<typeof setFor>) => (call[1] as { metafields: { key: string; type: string; value: string }[] }).metafields

    const p1 = metafields(setFor(P1))
    expect(JSON.parse(p1[0].value).siblings).toEqual([{ productId: P2, variantId: V20 }, { productId: P2, variantId: V21 }])
    expect(p1[1]).toMatchObject({ key: SIBLING_VARIANTS_KEY, type: 'list.variant_reference', value: JSON.stringify([V20, V21]) })

    const p2 = metafields(setFor(P2))
    expect(JSON.parse(p2[0].value).ownVariantIds).toEqual([V20, V21])
    expect(p2[1]).toMatchObject({ key: SIBLING_PRODUCTS_KEY, type: 'list.product_reference', value: JSON.stringify([P1]) })
  })

  it('sets before it deletes, so a failed delete never leaves a product without fresh data', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
      metafieldsDelete: { userErrors: [] },
    })
    await syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })
    expect(querySpy.mock.calls.map((c) => ((c[0] as string).includes('metafieldsSet') ? 'set' : 'delete'))).toEqual(['set', 'delete'])
  })

  it('throws when metafieldsSet reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] },
      metafieldsDelete: { userErrors: [] },
    })
    await expect(syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })).rejects.toThrow('Invalid JSON')
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Cannot delete' }] },
    })
    await expect(syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })).rejects.toThrow('Cannot delete')
  })
})

describe('clearDiscountMetafields', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('deletes the discount and both sibling lists, one call per unique product', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })

    await clearDiscountMetafields([{ productId: P1 }, { productId: P2 }, { productId: P2 }])

    expect(querySpy).toHaveBeenCalledTimes(2)
    const keys = (querySpy.mock.calls[0][1] as { metafields: { key: string }[] }).metafields.map((m) => m.key)
    expect(keys).toEqual(['discount', SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY])
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Not found' }] },
    })
    await expect(clearDiscountMetafields([{ productId: P1 }])).rejects.toThrow('Not found')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
source ~/.nvm/nvm.sh && nvm use 22.23.3
npx vitest run tests/lib/product-tiers.test.ts
```

Expected: FAIL (the new exports do not exist yet).

- [ ] **Step 3: Rewrite `src/lib/product-tiers.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'
import type { Discount } from '@/lib/config'

const NAMESPACE = 'sparkly_product_discounts'

export const SIBLING_PRODUCTS_KEY = 'sibling_products'
export const SIBLING_VARIANTS_KEY = 'sibling_variants'

/**
 * Liquid loops over a reference list return only the first 50 items, so a longer
 * list would silently lose rows. Each list is cut at this size; the `siblings`
 * IDs in the discount JSON stay complete, so the extra rows still count toward
 * the combined quantity, they are just not listed.
 */
export const SIBLING_REFERENCE_LIMIT = 50

interface DiscountMetafieldSibling {
  productId: string
  variantId?: string
}

interface DiscountMetafieldValue {
  discountId: string
  title: string
  pricingMode: 'percent' | 'fixed'
  tiers: Discount['tiers']
  /** null = single-variant whole-product member; array = these specific variants of THIS product are members. */
  ownVariantIds: string[] | null
  /** IDs only: the theme reads each sibling's title, link and image live through the reference lists. */
  siblings: DiscountMetafieldSibling[]
}

export interface ProductMetafields {
  value: DiscountMetafieldValue
  /** Whole-product siblings, in member order, cut at the limit. */
  productRefs: string[]
  /** Variant siblings, in member order, cut at the limit. */
  variantRefs: string[]
}

interface MetafieldSetInput {
  ownerId: string
  namespace: string
  key: string
  type: string
  value: string
}

interface MetafieldIdentifier {
  ownerId: string
  namespace: string
  key: string
}

/**
 * What one product's metafields should hold for this discount. siblings has one
 * entry per OTHER member (not per other product) so a sibling product with two
 * variants in the discount produces two entries. A product with more than one
 * of its own variants in the discount gets ownVariantIds listing exactly which;
 * a whole-product member gets ownVariantIds: null.
 */
export function buildProductMetafields(discount: Discount, productId: string, limit: number): ProductMetafields {
  const own = discount.members.filter((m) => m.productId === productId)
  const others = discount.members.filter((m) => m.productId !== productId)
  const ownVariantIds = own.some((m) => m.variantId == null) ? null : own.map((m) => m.variantId!)

  return {
    value: {
      discountId: discount.discountId,
      title: discount.title,
      pricingMode: discount.pricingMode,
      tiers: discount.tiers,
      ownVariantIds,
      siblings: others.map((m) => (m.variantId == null ? { productId: m.productId } : { productId: m.productId, variantId: m.variantId })),
    },
    productRefs: others.filter((m) => m.variantId == null).map((m) => m.productId).slice(0, limit),
    variantRefs: others.filter((m) => m.variantId != null).map((m) => m.variantId!).slice(0, limit),
  }
}

/** The metafields to set and to delete for one product. An empty list is deleted, never written. */
export function metafieldWrites(productId: string, built: ProductMetafields): { toSet: MetafieldSetInput[]; toDelete: MetafieldIdentifier[] } {
  const lists = [
    { key: SIBLING_PRODUCTS_KEY, type: 'list.product_reference', ids: built.productRefs },
    { key: SIBLING_VARIANTS_KEY, type: 'list.variant_reference', ids: built.variantRefs },
  ]
  return {
    toSet: [
      { ownerId: productId, namespace: NAMESPACE, key: 'discount', type: 'json', value: JSON.stringify(built.value) },
      ...lists
        .filter((l) => l.ids.length > 0)
        .map((l) => ({ ownerId: productId, namespace: NAMESPACE, key: l.key, type: l.type, value: JSON.stringify(l.ids) })),
    ],
    toDelete: lists.filter((l) => l.ids.length === 0).map((l) => ({ ownerId: productId, namespace: NAMESPACE, key: l.key })),
  }
}

/**
 * Writes the `discount` metafield, and the two sibling reference lists, for every
 * unique product touched by this discount's members.
 */
export async function syncDiscountMetafields(discount: Discount): Promise<void> {
  const uniqueProductIds = [...new Set(discount.members.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map((productId) => {
      const { toSet, toDelete } = metafieldWrites(productId, buildProductMetafields(discount, productId, SIBLING_REFERENCE_LIMIT))
      return writeProductMetafields(toSet, toDelete)
    }),
  )

  throwIfRejected(results)
}

async function writeProductMetafields(toSet: MetafieldSetInput[], toDelete: MetafieldIdentifier[]): Promise<void> {
  // Set first: if the delete fails, the product still has fresh data.
  await setMetafields(toSet)
  if (toDelete.length > 0) await deleteMetafields(toDelete)
}

async function setMetafields(metafields: MetafieldSetInput[]): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    { metafields },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

async function deleteMetafields(metafields: MetafieldIdentifier[]): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteDiscountMetafield($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    { metafields },
  )

  if (data.metafieldsDelete.userErrors.length > 0) {
    throw new Error(data.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
  }
}

function throwIfRejected(results: PromiseSettledResult<void>[]): void {
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => r.reason?.message ?? String(r.reason)).join('; '))
  }
}

/** Deletes the `discount` metafield and both sibling lists from every unique product in the list. */
export async function clearDiscountMetafields(members: { productId: string }[]): Promise<void> {
  const uniqueProductIds = [...new Set(members.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map((productId) =>
      deleteMetafields(
        ['discount', SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY].map((key) => ({ ownerId: productId, namespace: NAMESPACE, key })),
      ),
    ),
  )

  throwIfRejected(results)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/lib/product-tiers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Type-check, lint, and run the whole suite**

```bash
npx tsc --noEmit
npx eslint src/lib/product-tiers.ts tests/lib/product-tiers.test.ts
npx vitest run
```

Expected: tsc and eslint print nothing; every vitest test passes (run it as the only vitest process).

- [ ] **Step 6: Bump the version and commit**

```bash
npm version 0.22.0 --no-git-tag-version
git add src/lib/product-tiers.ts tests/lib/product-tiers.test.ts package.json package-lock.json
git commit -m "feat: store sibling IDs only and write live reference lists

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Widget script — build the list from what Liquid provides

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js` (functions `buildMixMatchRows`, `buildDisplayMixMatchItems`, `parseWidgetConfig`, exports)
- Test: `extensions/product-tier-pricing-tests/tier-pricing.test.js`
- Modify: `package.json`, `package-lock.json` (version `0.22.1`)

**Interfaces:**
- Consumes (the shape Task 4's Liquid emits into `data-discount`):
  - `siblings: [{ productId, variantId|null, title, url, imageUrl|null, listed: boolean }]`
  - `ownVariantOptions: [{ variantId, title, url }]`
- Produces: `listedMixMatchItems(siblings)` (new, exported); `buildMixMatchRows(products, cartItems)` now reads `product.url`; `buildDisplayMixMatchItems(config)` rows are `{ productId, variantId, title, url, imageUrl }`.

- [ ] **Step 1: Update the tests first**

In `extensions/product-tier-pricing-tests/tier-pricing.test.js`:

1. On line 3, add `listedMixMatchItems` to the destructured import list (after `buildDisplayMixMatchItems`).
2. Delete the eight tests from `test('buildMixMatchRows: builds one row per product with its live cart quantity and product-page link'` through the end of `test('buildDisplayMixMatchItems: single-variant product (no ownVariantOptions) returns just the siblings'` (currently lines 649–742) and insert this block in their place:

```js
test('buildMixMatchRows: builds one row per product with its live cart quantity and the link Liquid provided', () => {
  const products = [
    { title: 'Canagan Tuna Soup for Cats', url: '/products/canagan-tuna-soup-for-cats', productId: 'gid://shopify/Product/1', imageUrl: 'https://example.com/tuna.png' },
    { title: 'Canagan Chicken Soup for Cats', url: '/products/canagan-chicken-soup-for-cats', productId: 'gid://shopify/Product/2', imageUrl: null },
  ]
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 5 },
    { product_id: 3, variant_id: 30, quantity: 2 },
  ]
  assert.deepEqual(buildMixMatchRows(products, cartItems), [
    { href: '/products/canagan-tuna-soup-for-cats', title: 'Canagan Tuna Soup for Cats', imageUrl: 'https://example.com/tuna.png', qtyLabel: '5 in cart' },
    { href: '/products/canagan-chicken-soup-for-cats', title: 'Canagan Chicken Soup for Cats', imageUrl: null, qtyLabel: '0 in cart' },
  ])
})

test('buildMixMatchRows: singular "1 in cart" label', () => {
  const rows = buildMixMatchRows(
    [{ title: 'X', url: '/products/x', productId: 'gid://shopify/Product/9', imageUrl: null }],
    [{ product_id: 9, variant_id: 90, quantity: 1 }],
  )
  assert.equal(rows[0].qtyLabel, '1 in cart')
})

test('buildMixMatchRows: a variant-scoped member matches only that exact variant\'s cart quantity', () => {
  const rows = buildMixMatchRows(
    [{ title: 'X', url: '/products/x?variant=90', productId: 'gid://shopify/Product/9', variantId: 'gid://shopify/ProductVariant/90', imageUrl: null }],
    [
      { product_id: 9, variant_id: 90, quantity: 3 },
      { product_id: 9, variant_id: 91, quantity: 4 },
    ],
  )
  assert.equal(rows[0].qtyLabel, '3 in cart')
})

test('buildMixMatchRows: the link is exactly the url Liquid provided, including a ?variant= query', () => {
  const rows = buildMixMatchRows(
    [{ title: 'Salmon', url: '/products/wet-cat-food?variant=90', productId: 'gid://shopify/Product/9', variantId: 'gid://shopify/ProductVariant/90', imageUrl: null }],
    [],
  )
  assert.equal(rows[0].href, '/products/wet-cat-food?variant=90')
})

test('buildDisplayMixMatchItems: includes every one of this product\'s own other member-variants, INCLUDING the currently-displayed one', () => {
  const config = {
    productId: '2',
    ownVariantOptions: [
      { variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20' },
      { variantId: '21', title: 'Salmon', url: '/products/wet-cat-food?variant=21' },
      { variantId: '22', title: 'Duck', url: '/products/wet-cat-food?variant=22' },
    ],
    mixMatchListItems: [],
  }
  const items = buildDisplayMixMatchItems(config) // viewing Salmon, but it still gets a row — a customer's own already-in-cart quantity for the variant they're on must stay visible
  assert.deepEqual(items, [
    { productId: '2', variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20', imageUrl: null },
    { productId: '2', variantId: '21', title: 'Salmon', url: '/products/wet-cat-food?variant=21', imageUrl: null },
    { productId: '2', variantId: '22', title: 'Duck', url: '/products/wet-cat-food?variant=22', imageUrl: null },
  ])
})

test('buildDisplayMixMatchItems: cross-product siblings are appended after this product\'s own-variant rows', () => {
  const config = {
    productId: '2',
    ownVariantOptions: [{ variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20' }],
    mixMatchListItems: [{ productId: 'gid://shopify/Product/1', title: 'Tuna Soup', url: '/products/tuna-soup', imageUrl: null }],
  }
  const items = buildDisplayMixMatchItems(config)
  assert.deepEqual(items, [
    { productId: '2', variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20', imageUrl: null },
    { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', url: '/products/tuna-soup', imageUrl: null },
  ])
})

test('buildDisplayMixMatchItems: single-variant product (no ownVariantOptions) returns just the siblings', () => {
  const config = {
    productId: '1',
    ownVariantOptions: [],
    mixMatchListItems: [{ productId: 'gid://shopify/Product/2', title: 'Wet Cat Food', url: '/products/wet-cat-food', imageUrl: null }],
  }
  const items = buildDisplayMixMatchItems(config)
  assert.deepEqual(items, [
    { productId: 'gid://shopify/Product/2', title: 'Wet Cat Food', url: '/products/wet-cat-food', imageUrl: null },
  ])
})

test('listedMixMatchItems: leaves out siblings that no longer resolve, but never changes the list it was given', () => {
  const siblings = [
    { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', url: '/products/tuna-soup', imageUrl: null, listed: true },
    { productId: 'gid://shopify/Product/2', title: null, url: null, imageUrl: null, listed: false },
  ]
  const listed = listedMixMatchItems(siblings)
  assert.deepEqual(listed, [siblings[0]])
  assert.equal(siblings.length, 2) // the unlisted one is still there for the combined-quantity count
})

test('listedMixMatchItems: no siblings at all gives an empty list', () => {
  assert.deepEqual(listedMixMatchItems(undefined), [])
  assert.deepEqual(listedMixMatchItems([]), [])
})
```

- [ ] **Step 2: Run the extension tests to verify they fail**

```bash
source ~/.nvm/nvm.sh && nvm use 22.23.3
node --test extensions/product-tier-pricing-tests/*.test.js
```

Expected: FAIL (`listedMixMatchItems` is not exported; `href` still built from handle).

- [ ] **Step 3: Change `buildMixMatchRows`**

In `tier-pricing.js`, replace the `href` handling inside `buildMixMatchRows` (the `const href = …` line and the `href,` property) so the function reads:

```js
function buildMixMatchRows(products, cartItems) {
  return products.map((product) => {
    const member = { productId: extractNumericId(product.productId), variantId: product.variantId ? extractNumericId(product.variantId) : undefined }
    const qty = sumMemberQuantityInCart(cartItems || [], [member])
    return {
      // The theme (Liquid) builds the link from the live product, including any ?variant= query.
      href: product.url,
      title: product.title,
      imageUrl: product.imageUrl || null,
      qtyLabel: qty === 1 ? '1 in cart' : qty + ' in cart',
    }
  })
}
```

- [ ] **Step 4: Change `buildDisplayMixMatchItems` and add `listedMixMatchItems`**

Replace the `ownRows` mapping and add the new function directly below it:

```js
function buildDisplayMixMatchItems(config) {
  const ownRows = (config.ownVariantOptions || []).map((opt) => ({
    productId: config.productId,
    variantId: opt.variantId,
    title: opt.title,
    url: opt.url,
    imageUrl: null,
  }))
  return ownRows.concat(config.mixMatchListItems)
}

// Siblings that still resolve in the store. A sibling whose product was deleted
// or unpublished stays in `siblings` (its units still count toward the combined
// quantity) but is not shown in the list.
function listedMixMatchItems(siblings) {
  return (siblings || []).filter((sibling) => sibling.listed)
}
```

(Keep the long comment above `buildDisplayMixMatchItems` unchanged.)

- [ ] **Step 5: Use them in `parseWidgetConfig` and export**

In `parseWidgetConfig`, change the `ownVariantOptions` mapping and the `mixMatchListItems` line:

```js
    const ownVariantOptions = (discount.ownVariantOptions || []).map((o) => ({
      variantId: extractNumericId(o.variantId),
      title: o.title,
      url: o.url,
    }))
```

```js
      mixMatchListItems: listedMixMatchItems(discount.siblings),
```

Leave `siblingMembers` / `allMembers` exactly as they are (they read every sibling ID, listed or not). Add `listedMixMatchItems,` to the `module.exports` object next to `buildDisplayMixMatchItems,`.

- [ ] **Step 6: Run the extension tests to verify they pass**

```bash
node --test extensions/product-tier-pricing-tests/*.test.js
```

Expected: PASS, all tests (the previous total with the 8 replaced tests now 10).

- [ ] **Step 7: Bump the version and commit**

```bash
npm version 0.22.1 --no-git-tag-version
git add extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing-tests/tier-pricing.test.js package.json package-lock.json
git commit -m "feat: build the mix and match list from live links and drop unresolved siblings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Liquid — read the live values, with the temporary fallback

**Files:**
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid` (lines 9–41, the discount block)
- Test: `tests/lib/siblingLiquidContract.test.ts` (new)
- Modify: `package.json`, `package-lock.json` (version `0.22.2`)

**Interfaces:**
- Consumes: the metafields written by Task 2 (`discount` JSON with ID-only `siblings` and `ownVariantIds`; `sibling_products` and `sibling_variants` lists) and the old shape (siblings carrying `title`, `handle`, `imageUrl`).
- Produces: the `data-discount` JSON Task 3 reads: `siblings: [{ productId, variantId, title, url, imageUrl, listed }]` and `ownVariantOptions: [{ variantId, title, url }]`.

- [ ] **Step 1: Write the failing contract test**

Create `tests/lib/siblingLiquidContract.test.ts` (Liquid has no runner here, so this pins the names that must stay in step between the writer and the theme):

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY } from '@/lib/product-tiers'

const liquid = readFileSync(join(process.cwd(), 'extensions/product-tier-pricing/blocks/tier-pricing.liquid'), 'utf8')

describe('tier-pricing.liquid reads what the writer writes', () => {
  it('reads both sibling reference lists by the exact keys the writer uses', () => {
    expect(liquid).toContain(`sparkly_product_discounts.${SIBLING_PRODUCTS_KEY}`)
    expect(liquid).toContain(`sparkly_product_discounts.${SIBLING_VARIANTS_KEY}`)
  })

  it('no longer reads copied own-variant titles from the metafield', () => {
    expect(liquid).not.toContain('discount_metafield.value.ownVariantOptions')
  })

  it('marks each sibling listed or not, so the widget can hide unresolved ones', () => {
    expect(liquid).toContain('"listed"')
  })

  it('keeps the temporary fallback in one clearly marked block', () => {
    expect(liquid).toContain('TEMPORARY FALLBACK')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22.23.3
npx vitest run tests/lib/siblingLiquidContract.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Replace lines 9–41 of `tier-pricing.liquid`**

Replace everything from `{%- assign discount_metafield = …` through the closing `{%- endif -%}` of the `if discount_metafield != blank` block (the line before `{%- assign time_discount_metafield = …`) with:

```liquid
{%- assign discount_metafield = product.metafields.sparkly_product_discounts.discount -%}
{%- assign selected_variant_id = product.selected_or_first_available_variant.id | prepend: 'gid://shopify/ProductVariant/' -%}
{%- assign discount_json = '{"tiers":[]}' -%}
{%- if discount_metafield != blank -%}
  {%- assign sibling_product_refs = product.metafields.sparkly_product_discounts.sibling_products.value -%}
  {%- assign sibling_variant_refs = product.metafields.sparkly_product_discounts.sibling_variants.value -%}
  {%- capture siblings_json -%}
    [
    {%- for sibling in discount_metafield.value.siblings -%}
      {%- assign sib_listed = false -%}
      {%- assign sib_title = nil -%}
      {%- assign sib_url = nil -%}
      {%- assign sib_image = nil -%}
      {%- if sibling.variantId != blank -%}
        {%- for ref in sibling_variant_refs -%}
          {%- assign ref_gid = ref.id | prepend: 'gid://shopify/ProductVariant/' -%}
          {%- if ref_gid == sibling.variantId -%}
            {%- assign sib_listed = true -%}
            {%- capture sib_title -%}{{ ref.product.title }} – {{ ref.title }}{%- endcapture -%}
            {%- capture sib_url -%}{{ ref.product.url }}?variant={{ ref.id }}{%- endcapture -%}
            {%- assign sib_image_source = ref.featured_image | default: ref.product.featured_image -%}
            {%- if sib_image_source != blank -%}
              {%- assign sib_image = sib_image_source | image_url: width: 160 -%}
            {%- endif -%}
          {%- endif -%}
        {%- endfor -%}
      {%- else -%}
        {%- for ref in sibling_product_refs -%}
          {%- assign ref_gid = ref.id | prepend: 'gid://shopify/Product/' -%}
          {%- if ref_gid == sibling.productId -%}
            {%- assign sib_listed = true -%}
            {%- assign sib_title = ref.title -%}
            {%- assign sib_url = ref.url -%}
            {%- if ref.featured_image != blank -%}
              {%- assign sib_image = ref.featured_image | image_url: width: 160 -%}
            {%- endif -%}
          {%- endif -%}
        {%- endfor -%}
      {%- endif -%}
      {%- comment -%}
        TEMPORARY FALLBACK (remove in the cleanup PR once every live tier discount has been re-saved):
        a discount saved before sibling data became live still carries copied title / handle /
        imageUrl on each sibling. Use them only when the live reference did not resolve.
      {%- endcomment -%}
      {%- if sib_listed == false and sibling.title != blank -%}
        {%- assign sib_listed = true -%}
        {%- assign sib_title = sibling.title -%}
        {%- capture sib_url -%}/products/{{ sibling.handle }}{%- if sibling.variantId != blank -%}?variant={{ sibling.variantId | split: '/' | last }}{%- endif -%}{%- endcapture -%}
        {%- assign sib_image = sibling.imageUrl -%}
      {%- endif -%}
      {
        "productId": {{ sibling.productId | json }},
        "variantId": {{ sibling.variantId | default: null | json }},
        "title": {{ sib_title | default: null | json }},
        "url": {{ sib_url | default: null | json }},
        "imageUrl": {{ sib_image | default: null | json }},
        "listed": {{ sib_listed }}
      }{%- unless forloop.last -%},{%- endunless -%}
    {%- endfor -%}
    ]
  {%- endcapture -%}
  {%- capture own_variant_options_json -%}
    [
    {%- assign own_first = true -%}
    {%- for own_id in discount_metafield.value.ownVariantIds -%}
      {%- for own_variant in product.variants -%}
        {%- assign own_variant_gid = own_variant.id | prepend: 'gid://shopify/ProductVariant/' -%}
        {%- if own_variant_gid == own_id -%}
          {%- unless own_first -%},{%- endunless -%}
          {%- assign own_first = false -%}
          { "variantId": {{ own_id | json }}, "title": {{ own_variant.title | json }}, "url": {{ product.url | append: '?variant=' | append: own_variant.id | json }} }
        {%- endif -%}
      {%- endfor -%}
    {%- endfor -%}
    ]
  {%- endcapture -%}
  {%- capture discount_json_raw -%}
    {
      "title": {{ discount_metafield.value.title | json }},
      "tiers": {{ discount_metafield.value.tiers | json }},
      "siblings": {{ siblings_json }},
      "ownVariantIds": {{ discount_metafield.value.ownVariantIds | json }},
      "ownVariantOptions": {{ own_variant_options_json }},
      "selfVariantId": {{ selected_variant_id | json }}
    }
  {%- endcapture -%}
  {%- assign discount_json = discount_json_raw | strip | escape -%}
{%- endif -%}
```

Notes for the implementer: variable names must not start with an underscore (the theme linter rejects that); `sib_listed` prints as `true`/`false`, which is valid JSON; the en dash in `{{ ref.product.title }} – {{ ref.title }}` is the same "Product – Variant" label the admin used before.

- [ ] **Step 4: Run the contract test and the full suites**

```bash
npx vitest run tests/lib/siblingLiquidContract.test.ts
npx vitest run
node --test extensions/product-tier-pricing-tests/*.test.js
```

Expected: all PASS (vitest as the only vitest process).

- [ ] **Step 5: Lint the theme extension if the CLI can**

```bash
shopify theme check --path extensions/product-tier-pricing 2>&1 | tail -20
```

Expected: no new errors in `tier-pricing.liquid`. If the command is unavailable or reports only pre-existing issues in other files, say so in the report; do not change other files.

- [ ] **Step 6: Bump the version and commit**

```bash
npm version 0.22.2 --no-git-tag-version
git add extensions/product-tier-pricing/blocks/tier-pricing.liquid tests/lib/siblingLiquidContract.test.ts package.json package-lock.json
git commit -m "feat: read sibling title, link and image live in the tier widget, with a temporary fallback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (controller, not a task)

Run the full verification once more (`npx tsc --noEmit`, `npx vitest run`, extension tests, `npx next build --webpack`), then check the PR state before pushing (`gh pr view feat/live-sibling-data --json state`; none exists yet) and open the PR. The PR description must state the rollout order from the spec (merge → user runs `shopify app deploy --config shopify.app.toml` → re-save each live tier discount, only after the deploy → live check → later cleanup PR), the 50-sibling listing limit, and that the fallback block is marked `TEMPORARY FALLBACK` in `tier-pricing.liquid`. The user merges and deploys.

**Live check list (user, after deploy and re-save):**
1. A tier product page: the mix & match list shows the right titles and thumbnails.
2. Rename a sibling product and change its image in the admin, reload: the list updates with no re-save.
3. A variant sibling shows "Product – Variant" and links with `?variant=`.
4. Set a sibling to Draft: its row disappears; the combined cart quantity still counts its units.
5. A single-variant product and a multi-variant product both still price and show the tiers.
