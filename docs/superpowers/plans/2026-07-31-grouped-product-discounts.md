# Grouped Product Discounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "group" discounts — a merchant-defined set of products sharing one price, where a shared quantity tier (with the existing percent/anchor-price mechanics) is evaluated against the combined quantity of any mix of the group's products in the cart, and the storefront widget shows live cross-product progress toward that tier.

**Architecture:** Extend the existing shop-metafield config (`sparkly_product_discounts.config`) with a new `groups` array alongside the existing `products` array, reusing the same admin-app/Function/widget plumbing that already exists for standalone per-product tiers. The Discount Function sums quantity across a group's cart lines and reuses the standalone anchor formula verbatim, splitting the resulting discount proportionally by quantity when it has to divide across lines. The widget polls `/cart.js` to sum group quantity by product handle and feeds that combined total into the existing, unmodified tier-math functions.

**Tech Stack:** Next.js 16 (Server Actions) admin app, Rust Shopify Discount Function (`shopify_function` crate v2.2.0), vanilla JS theme app extension block, Vitest (admin app), `node --test` (theme extension), `cargo test` (Function).

## Global Constraints

- Node version: run `nvm use 20.20.2` before any node/npm/shopify command in this repo (this repo's `engines` floor is 20.9.0, but the working Node install used for this project's tooling is 20.20.2).
- Bump `version` in `package.json` (and `package-lock.json`'s matching two `version` fields) on this change — this is a new feature, so a **minor** bump (0.14.1 → 0.15.0), done in the same commit as the last code task, per this project's own versioning convention (patch for fixes, minor for features, no exceptions).
- Full spec at `docs/superpowers/specs/2026-07-31-grouped-product-discounts-design.md` — every task below implements one section of it; re-read the relevant section if a step's rationale is unclear.
- All money math rounds explicitly to whole pence (`Math.round(x*100)/100` in TS/JS, `(x*100.0).round()/100.0` in Rust) — never rely on Shopify's own downstream rounding. This is an established project-wide discipline, not new to this feature.
- Commit after every task (not every step) unless a step's own instructions say otherwise.

---

## Task 1: Group data model + membership validation

**Files:**
- Modify: `src/lib/config.ts`
- Test: `tests/lib/config.test.ts`

**Interfaces:**
- Produces: `export interface GroupDiscount { groupId: string; name: string; status: 'draft' | 'live'; productIds: string[]; tiers: Tier[] }`, `Config.groups: GroupDiscount[]`, `export function isProductAvailable(config: Config, productId: string, excludeGroupId?: string): boolean`

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/config.test.ts` (the existing `it('returns an empty product list when no metafield exists yet', ...)` test needs its expectation updated too — change its `expect(config).toEqual({ products: [] })` to `expect(config).toEqual({ products: [], groups: [] })`):

```ts
it('defaults groups to [] when the stored config predates the groups field', async () => {
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify({ products: [] }) } },
  })
  const config = await getConfig()
  expect(config).toEqual({ products: [], groups: [] })
})

it('parses a stored config that includes groups', async () => {
  const stored = {
    products: [],
    groups: [
      {
        groupId: 'grp_1',
        name: 'Soups',
        status: 'live',
        productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
        tiers: [{ minQty: 7, percentOff: 10 }],
      },
    ],
  }
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify(stored) } },
  })
  const config = await getConfig()
  expect(config).toEqual(stored)
})
```

Add a new `describe` block in the same file:

```ts
import { getConfig, saveConfig, isProductAvailable, type Config } from '@/lib/config'

describe('isProductAvailable', () => {
  const baseConfig: Config = {
    products: [{ productId: 'gid://shopify/Product/1', status: 'draft', tiers: [] }],
    groups: [
      { groupId: 'grp_a', name: 'A', status: 'draft', productIds: ['gid://shopify/Product/2'], tiers: [] },
    ],
  }

  it('is false for a product already in a standalone discount', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/1')).toBe(false)
  })

  it('is false for a product already in another group', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2')).toBe(false)
  })

  it('is true for a product in neither', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/3')).toBe(true)
  })

  it('is true for a product already in the group being excluded', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'grp_a')).toBe(true)
  })

  it('is still false for a product in a different, non-excluded group', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'grp_other')).toBe(false)
  })
})
```

(The top `import` line in the test file already imports `getConfig, saveConfig, type Config` — update it to also import `isProductAvailable` as shown above.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && npm test -- tests/lib/config.test.ts`
Expected: FAIL — `isProductAvailable` is not exported, and the groups-default tests fail because `getConfig()` doesn't yet return a `groups` key.

- [ ] **Step 3: Implement**

In `src/lib/config.ts`, add the new interface after `ProductDiscount` and update `Config`:

```ts
export interface GroupDiscount {
  groupId: string
  name: string
  status: 'draft' | 'live'
  productIds: string[]
  tiers: Tier[]
}

export interface Config {
  products: ProductDiscount[]
  groups: GroupDiscount[]
}

/**
 * True when productId isn't already claimed by a standalone discount or by
 * any group other than excludeGroupId — pass the group's own id when
 * validating an in-progress edit so it doesn't flag its own members.
 */
export function isProductAvailable(config: Config, productId: string, excludeGroupId?: string): boolean {
  if (config.products.some((p) => p.productId === productId)) return false
  return !config.groups.some((g) => g.groupId !== excludeGroupId && g.productIds.includes(productId))
}
```

Update `getConfig()`'s body (replace the `if (!data.shop.metafield) { return { products: [] } }` early return and the final `return JSON.parse(...)` line):

```ts
export async function getConfig(): Promise<Config> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) {
    return { products: [], groups: [] }
  }

  const parsed = JSON.parse(data.shop.metafield.value) as Partial<Config>
  return { products: parsed.products ?? [], groups: parsed.groups ?? [] }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/config.test.ts`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts tests/lib/config.test.ts
git commit -m "Add group discount data model and membership validation"
```

---

## Task 2: `getGroupProductInfo` — batch title/price/handle lookup

**Files:**
- Modify: `src/lib/products.ts`
- Test: `tests/lib/products.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery<T>(query, variables)` from `@/lib/shopify-client`
- Produces: `export interface GroupProductInfo { productId: string; title: string; basePrice: number; handle: string }`, `export function getGroupProductInfo(productIds: string[]): Promise<GroupProductInfo[]>`

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/products.test.ts`:

```ts
import { searchProducts, getProductInfo, getGroupProductInfo } from '@/lib/products'

describe('getGroupProductInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns title, price, and handle for each product', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/1',
          title: 'Tuna Soup',
          handle: 'tuna-soup',
          variants: { edges: [{ node: { price: '1.49' } }] },
        },
        {
          id: 'gid://shopify/Product/2',
          title: 'Chicken Soup',
          handle: 'chicken-soup',
          variants: { edges: [{ node: { price: '1.49' } }] },
        },
      ],
    })

    const result = await getGroupProductInfo(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    expect(result).toEqual([
      { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/2', title: 'Chicken Soup', handle: 'chicken-soup', basePrice: 1.49 },
    ])
  })

  it('skips products that no longer exist or have no variants', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [null, { id: 'gid://shopify/Product/2', title: 'No Variant', handle: 'no-variant', variants: { edges: [] } }],
    })
    const result = await getGroupProductInfo(['gid://shopify/Product/999', 'gid://shopify/Product/2'])
    expect(result).toEqual([])
  })

  it('returns an empty array without calling shopifyQuery for an empty id list', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await getGroupProductInfo([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})
```

(Update the existing top import in the file to include `getGroupProductInfo` as shown.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/products.test.ts`
Expected: FAIL — `getGroupProductInfo` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/products.ts`, after `getProductInfo`:

```ts
export interface GroupProductInfo {
  productId: string
  title: string
  basePrice: number
  handle: string
}

/**
 * Batch title/price/handle lookup for group membership. Silently skips any
 * id that no longer resolves to a product or has no variant, mirroring
 * getProductInfo's null-on-missing behavior rather than throwing — a stale
 * id in a group shouldn't take down the whole group's admin page.
 */
export async function getGroupProductInfo(productIds: string[]): Promise<GroupProductInfo[]> {
  if (productIds.length === 0) return []

  const data = await shopifyQuery<{
    nodes: ({
      id: string
      title: string
      handle: string
      variants: { edges: { node: { price: string } }[] }
    } | null)[]
  }>(
    `query getGroupProductInfo($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          handle
          variants(first: 1) {
            edges { node { price } }
          }
        }
      }
    }`,
    { ids: productIds },
  )

  const results: GroupProductInfo[] = []
  for (const node of data.nodes) {
    if (!node) continue
    const firstVariant = node.variants.edges[0]?.node
    if (!firstVariant) continue
    results.push({
      productId: node.id,
      title: node.title,
      handle: node.handle,
      basePrice: parseFloat(firstVariant.price),
    })
  }
  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/products.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/products.ts tests/lib/products.test.ts
git commit -m "Add getGroupProductInfo for batch group-member lookups"
```

---

## Task 3: `syncGroupTierMetafield`

**Files:**
- Modify: `src/lib/product-tiers.ts`
- Test: `tests/lib/product-tiers.test.ts`

**Interfaces:**
- Consumes: `Tier` from `@/lib/config`, `shopifyQuery` from `@/lib/shopify-client`
- Produces: `export interface GroupTierSyncData { tiers: Tier[]; siblings: { title: string; handle: string }[] }`, `export function syncGroupTierMetafield(productId: string, data: GroupTierSyncData | null): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/product-tiers.test.ts`:

```ts
import { syncProductTierMetafield, syncGroupTierMetafield } from '@/lib/product-tiers'

describe('syncGroupTierMetafield', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the group tiers + siblings JSON to the product metafield', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncGroupTierMetafield('gid://shopify/Product/1', {
      tiers: [{ minQty: 7, percentOff: 10 }],
      siblings: [{ title: 'Chicken Soup', handle: 'chicken-soup' }],
    })

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      {
        metafields: [
          {
            ownerId: 'gid://shopify/Product/1',
            namespace: 'sparkly_product_discounts',
            key: 'group',
            type: 'json',
            value: JSON.stringify({
              tiers: [{ minQty: 7, percentOff: 10 }],
              siblings: [{ title: 'Chicken Soup', handle: 'chicken-soup' }],
            }),
          },
        ],
      },
    )
  })

  it('deletes the metafield when data is null', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [] },
    })

    await syncGroupTierMetafield('gid://shopify/Product/1', null)

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsDelete'),
      {
        metafields: [
          { ownerId: 'gid://shopify/Product/1', namespace: 'sparkly_product_discounts', key: 'group' },
        ],
      },
    )
  })

  it('throws when metafieldsSet reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] },
    })

    await expect(
      syncGroupTierMetafield('gid://shopify/Product/1', { tiers: [], siblings: [] }),
    ).rejects.toThrow('Invalid JSON')
  })
})
```

(Update the file's top import to add `syncGroupTierMetafield`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/product-tiers.test.ts`
Expected: FAIL — `syncGroupTierMetafield` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/product-tiers.ts`, after `syncProductTierMetafield`:

```ts
export interface GroupTierSyncData {
  tiers: Tier[]
  siblings: { title: string; handle: string }[]
}

/**
 * Same shape as syncProductTierMetafield but under the 'group' key, so a
 * product can carry both an unrelated standalone-tiers metafield (never, in
 * practice, since membership is mutually exclusive) without collision, and
 * so the theme block can tell which mode to render from a single metafield
 * lookup per key.
 */
export async function syncGroupTierMetafield(productId: string, data: GroupTierSyncData | null): Promise<void> {
  if (data === null) {
    const result = await shopifyQuery<{
      metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
    }>(
      `mutation deleteProductGroupTiers($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        metafields: [
          { ownerId: productId, namespace: NAMESPACE, key: 'group' },
        ],
      },
    )

    if (result.metafieldsDelete.userErrors.length > 0) {
      throw new Error(result.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
    }
    return
  }

  const result = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setProductGroupTiers($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'group',
          type: 'json',
          value: JSON.stringify(data),
        },
      ],
    },
  )

  if (result.metafieldsSet.userErrors.length > 0) {
    throw new Error(result.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/product-tiers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-tiers.ts tests/lib/product-tiers.test.ts
git commit -m "Add syncGroupTierMetafield for per-member group metafield sync"
```

---

## Task 4: `addGroupProductAction` — live add-time validation

**Files:**
- Create: `src/actions/groupProductActions.ts`
- Test: `tests/actions/groupProductActions.test.ts`

**Interfaces:**
- Consumes: `getProductInfo` from `@/lib/products`, `getConfig`/`isProductAvailable` from `@/lib/config`
- Produces: `export interface GroupProductCandidate { id: string; title: string; price: number }`, `export type AddGroupProductResult = { ok: true; product: GroupProductCandidate } | { ok: false; error: string }`, `export function addGroupProductAction(candidateId: string, currentPrice: number | null, excludeGroupId?: string): Promise<AddGroupProductResult>`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/groupProductActions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addGroupProductAction } from '@/actions/groupProductActions'
import * as products from '@/lib/products'
import * as configLib from '@/lib/config'

describe('addGroupProductAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a product that does not exist', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue(null)
    const result = await addGroupProductAction('gid://shopify/Product/999', null)
    expect(result).toEqual({ ok: false, error: 'Product not found' })
  })

  it('rejects a price mismatch against the group so far', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Ocean Soup', basePrice: 1.69 })
    const result = await addGroupProductAction('gid://shopify/Product/3', 1.49)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Price mismatch')
  })

  it('rejects a product that already has a standalone discount', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Tuna Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/1', status: 'draft', tiers: [] }],
      groups: [],
    })
    const result = await addGroupProductAction('gid://shopify/Product/1', null)
    expect(result).toEqual({ ok: false, error: 'This product already has a discount or belongs to another group' })
  })

  it('rejects a product that already belongs to another group', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Tuna Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_other', name: 'Other', status: 'draft', productIds: ['gid://shopify/Product/1'], tiers: [] }],
    })
    const result = await addGroupProductAction('gid://shopify/Product/1', null)
    expect(result).toEqual({ ok: false, error: 'This product already has a discount or belongs to another group' })
  })

  it('allows a product already in the group currently being edited', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Tuna Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'A', status: 'draft', productIds: ['gid://shopify/Product/1'], tiers: [] }],
    })
    const result = await addGroupProductAction('gid://shopify/Product/1', 1.49, 'grp_a')
    expect(result).toEqual({ ok: true, product: { id: 'gid://shopify/Product/1', title: 'Tuna Soup', price: 1.49 } })
  })

  it('succeeds for a valid, price-matching, unclaimed product', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Chicken Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const result = await addGroupProductAction('gid://shopify/Product/2', 1.49)
    expect(result).toEqual({ ok: true, product: { id: 'gid://shopify/Product/2', title: 'Chicken Soup', price: 1.49 } })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/actions/groupProductActions.test.ts`
Expected: FAIL — module `@/actions/groupProductActions` doesn't exist.

- [ ] **Step 3: Implement**

Create `src/actions/groupProductActions.ts`:

```ts
'use server'

import { getProductInfo } from '@/lib/products'
import { getConfig, isProductAvailable } from '@/lib/config'

export interface GroupProductCandidate {
  id: string
  title: string
  price: number
}

export type AddGroupProductResult =
  | { ok: true; product: GroupProductCandidate }
  | { ok: false; error: string }

/**
 * Validates a candidate product before it's added to a group in the UI:
 * must exist, must match the group's current shared price (if any products
 * are already selected), and must not already belong to a standalone
 * discount or a different group. excludeGroupId lets an in-progress edit of
 * an existing group re-validate without flagging its own current members.
 */
export async function addGroupProductAction(
  candidateId: string,
  currentPrice: number | null,
  excludeGroupId?: string,
): Promise<AddGroupProductResult> {
  const info = await getProductInfo(candidateId)
  if (!info) return { ok: false, error: 'Product not found' }

  if (currentPrice != null && Math.abs(info.basePrice - currentPrice) > 0.001) {
    return {
      ok: false,
      error: `Price mismatch: this product is £${info.basePrice.toFixed(2)}, the group is £${currentPrice.toFixed(2)}`,
    }
  }

  const config = await getConfig()
  if (!isProductAvailable(config, candidateId, excludeGroupId)) {
    return { ok: false, error: 'This product already has a discount or belongs to another group' }
  }

  return { ok: true, product: { id: candidateId, title: info.title, price: info.basePrice } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/actions/groupProductActions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/groupProductActions.ts tests/actions/groupProductActions.test.ts
git commit -m "Add addGroupProductAction for live group-membership validation"
```

---

## Task 5: `GroupProductPicker` client component

**Files:**
- Create: `src/components/GroupProductPicker.tsx`

**Interfaces:**
- Consumes: `searchProductsAction` from `@/actions/productSearchAction`, `addGroupProductAction` from `@/actions/groupProductActions`, `ProductSearchResult` from `@/lib/products`
- Produces: `export type SelectedGroupProduct = { id: string; title: string; price: number }`, default export `GroupProductPicker({ initialProducts?: SelectedGroupProduct[]; excludeGroupId?: string })` — renders hidden inputs named `product-{i}-id` for each selected product, consumed server-side by `parseGroupProductIdsFromForm` in Task 6.

No automated test for this file — it's a `'use client'` component, matching this codebase's existing convention (`TierFields.tsx` and `ProductPicker.tsx` have no test files either). Verified manually in Task 8's build check and Task 13's live check.

- [ ] **Step 1: Write the component**

Create `src/components/GroupProductPicker.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { searchProductsAction } from '@/actions/productSearchAction'
import { addGroupProductAction } from '@/actions/groupProductActions'
import type { ProductSearchResult } from '@/lib/products'

export type SelectedGroupProduct = { id: string; title: string; price: number }

export default function GroupProductPicker({
  initialProducts,
  excludeGroupId,
}: {
  initialProducts?: SelectedGroupProduct[]
  excludeGroupId?: string
}) {
  const [selected, setSelected] = useState<SelectedGroupProduct[]>(initialProducts ?? [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  function handleQueryChange(value: string) {
    setQuery(value)
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
      ++generationRef.current
      return
    }

    setSearching(true)
    const generation = ++generationRef.current

    debounceRef.current = setTimeout(async () => {
      const matches = await searchProductsAction(value)
      if (generation === generationRef.current) {
        setResults(matches)
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  async function selectProduct(candidate: ProductSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setError(null)

    if (selected.some((p) => p.id === candidate.id)) return

    const currentPrice = selected[0]?.price ?? null
    const result = await addGroupProductAction(candidate.id, currentPrice, excludeGroupId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelected((prev) => [...prev, result.product])
  }

  function removeProduct(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div>
      {selected.map((p, i) => (
        <div key={p.id} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <input type="hidden" name={`product-${i}-id`} value={p.id} />
          <span className="text-sm truncate">
            {p.title} — £{p.price.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={() => removeProduct(p.id)}
            aria-label={`Remove ${p.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="relative">
        <label htmlFor="group-product-search" className="sr-only">
          Search for a product to add to the group
        </label>
        <input
          id="group-product-search"
          type="text"
          placeholder="Search for a product to add…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseDown={() => selectProduct(product)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {product.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GroupProductPicker.tsx
git commit -m "Add GroupProductPicker client component"
```

---

## Task 6: `discountActions.ts` — preserve full config on save + `createGroup`

**Files:**
- Modify: `src/actions/discountActions.ts:1-45`
- Test: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `isProductAvailable`, `type GroupDiscount` from `@/lib/config`
- Produces: `export function createGroup(formData: FormData): Promise<void>`; internal `parseGroupProductIdsFromForm(formData: FormData): string[]` (not exported, used by Task 7 too — keep in this file)

This task also fixes a latent bug: `createDiscount` and `deleteDiscount` currently build a **new** config object with only the `products` key (`saveConfig({ products: [...] })`), silently dropping any other top-level key. That was harmless while `Config` only had `products`, but now that `groups` exists, calling either of those two actions would wipe out every group. `updateTiers` and `setStatus` are already safe — they mutate the fetched `config` object in place and save the whole thing.

- [ ] **Step 1: Write the failing tests**

Add to `tests/actions/discountActions.test.ts` (these two additions extend the existing `createDiscount` and `deleteDiscount` describe blocks — the mocked `getConfig` now includes a non-empty `groups` array so the test can prove it survives the save):

```ts
it('preserves existing groups when saving a new standalone discount', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [],
    groups: [{ groupId: 'grp_a', name: 'A', status: 'live', productIds: ['gid://shopify/Product/9'], tiers: [] }],
  })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

  const formData = new FormData()
  formData.set('productId', 'gid://shopify/Product/111')
  formData.set('tier-0-minQty', '5')
  formData.set('tier-0-percentOff', '10')

  await createDiscount(formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [{ minQty: 5, percentOff: 10 }] }],
    groups: [{ groupId: 'grp_a', name: 'A', status: 'live', productIds: ['gid://shopify/Product/9'], tiers: [] }],
  })
})
```

(add this inside `describe('createDiscount', ...)`, after the existing tests)

```ts
it('preserves existing groups when deleting a standalone discount', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [] }],
    groups: [{ groupId: 'grp_a', name: 'A', status: 'live', productIds: ['gid://shopify/Product/9'], tiers: [] }],
  })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  await deleteDiscount('gid://shopify/Product/111')

  expect(saveSpy).toHaveBeenCalledWith({
    products: [],
    groups: [{ groupId: 'grp_a', name: 'A', status: 'live', productIds: ['gid://shopify/Product/9'], tiers: [] }],
  })
})
```

(add this inside `describe('deleteDiscount', ...)`, after the existing tests)

Add a new `describe('createGroup', ...)` block at the end of the file:

```ts
import { createDiscount, updateTiers, setStatus, deleteDiscount, createGroup } from '@/actions/discountActions'

describe('createGroup', () => {
  beforeEach(() => vi.restoreAllMocks())

  function formWithProducts(ids: string[]): FormData {
    const formData = new FormData()
    ids.forEach((id, i) => formData.set(`product-${i}-id`, id))
    return formData
  }

  it('creates a draft group with parsed tiers and products', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111')

    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Mix & Match Soups')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')

    await createGroup(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [
        {
          groupId: 'grp_11111111-1111-1111-1111-111111111111',
          name: 'Mix & Match Soups',
          status: 'draft',
          productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
          tiers: [{ minQty: 7, percentOff: 10 }],
        },
      ],
    })
    expect(authRedirect.redirectWithToken).toHaveBeenCalledWith(
      '/discounts/groups/grp_11111111-1111-1111-1111-111111111111',
    )
  })

  it('throws when the name is blank', async () => {
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('A group name is required')
  })

  it('throws when fewer than 2 products are provided', async () => {
    const formData = formWithProducts(['gid://shopify/Product/1'])
    formData.set('name', 'Solo')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('at least 2 products')
  })

  it('throws when no valid tier is provided', async () => {
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Soups')
    await expect(createGroup(formData)).rejects.toThrow('At least one tier is required')
  })

  it('throws when a product already has a standalone discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/1', status: 'draft', tiers: [] }],
      groups: [],
    })
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Soups')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('already has a discount or belongs to another group')
  })

  it('throws when a product already belongs to another group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_other', name: 'Other', status: 'draft', productIds: ['gid://shopify/Product/2'], tiers: [] }],
    })
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Soups')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('already has a discount or belongs to another group')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: FAIL — `createGroup` is not exported, and the two "preserves existing groups" tests fail because `createDiscount`/`deleteDiscount` currently drop the `groups` key.

- [ ] **Step 3: Implement**

In `src/actions/discountActions.ts`, update the top import line:

```ts
import { getConfig, saveConfig, isProductAvailable, type Tier, type ProductDiscount, type GroupDiscount } from '@/lib/config'
```

Fix `createDiscount`'s save call (replace `await saveConfig({ products: [...config.products, newDiscount] })`):

```ts
  await saveConfig({ ...config, products: [...config.products, newDiscount] })
```

Fix `deleteDiscount`'s save call (replace `await saveConfig({ products: remaining })`):

```ts
  const remaining = config.products.filter((p) => p.productId !== productId)
  await saveConfig({ ...config, products: remaining })
```

Add `parseGroupProductIdsFromForm` right after `parseTiersFromForm`, and `createGroup` at the end of the file:

```ts
function parseGroupProductIdsFromForm(formData: FormData): string[] {
  const ids: string[] = []
  let i = 0
  while (formData.has(`product-${i}-id`)) {
    const id = String(formData.get(`product-${i}-id`) ?? '').trim()
    if (id) ids.push(id)
    i++
  }
  return ids
}

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('A group name is required')

  const productIds = parseGroupProductIdsFromForm(formData)
  if (productIds.length < 2) throw new Error('A group needs at least 2 products')

  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  for (const productId of productIds) {
    if (!isProductAvailable(config, productId)) {
      throw new Error(`Product ${productId} already has a discount or belongs to another group`)
    }
  }

  const groupId = `grp_${crypto.randomUUID()}`
  const newGroup: GroupDiscount = { groupId, name, status: 'draft', productIds, tiers }
  await saveConfig({ ...config, groups: [...config.groups, newGroup] })

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts
git commit -m "Fix config-clobbering bug in save calls and add createGroup"
```

---

## Task 7: `discountActions.ts` — group edit/lifecycle actions

**Files:**
- Modify: `src/actions/discountActions.ts` (end of file, after Task 6's additions)
- Test: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `getGroupProductInfo` from `@/lib/products`, `syncGroupTierMetafield` from `@/lib/product-tiers`, `parseGroupProductIdsFromForm` (from Task 6, same file)
- Produces: `export function updateGroupProducts(groupId: string, formData: FormData): Promise<void>`, `export function updateGroupTiers(groupId: string, formData: FormData): Promise<void>`, `export function setGroupStatus(groupId: string, status: 'draft' | 'live'): Promise<void>`, `export function deleteGroup(groupId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add to `tests/actions/discountActions.test.ts` (update the top imports first):

```ts
import {
  createDiscount, updateTiers, setStatus, deleteDiscount,
  createGroup, updateGroupProducts, updateGroupTiers, setGroupStatus, deleteGroup,
} from '@/actions/discountActions'
import * as products from '@/lib/products'
```

```ts
describe('updateGroupTiers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('replaces the tiers for an existing group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateGroupTiers('grp_a', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 3, percentOff: 5 }] }],
    })
  })

  it('throws when the group does not exist', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const formData = new FormData()
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(updateGroupTiers('grp_missing', formData)).rejects.toThrow('not found')
  })

  it('re-syncs every member metafield when the group is live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getGroupProductInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'Tuna', handle: 'tuna', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/2', title: 'Chicken', handle: 'chicken', basePrice: 1.49 },
    ])
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateGroupTiers('grp_a', formData)

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/1', {
      tiers: [{ minQty: 3, percentOff: 5 }],
      siblings: [{ title: 'Chicken', handle: 'chicken' }],
    })
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', {
      tiers: [{ minQty: 3, percentOff: 5 }],
      siblings: [{ title: 'Tuna', handle: 'tuna' }],
    })
  })

  it('does not sync metafields when the group is still draft', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateGroupTiers('grp_a', formData)

    expect(syncSpy).not.toHaveBeenCalled()
  })
})

describe('updateGroupProducts', () => {
  beforeEach(() => vi.restoreAllMocks())

  function formWithProducts(ids: string[]): FormData {
    const formData = new FormData()
    ids.forEach((id, i) => formData.set(`product-${i}-id`, id))
    return formData
  }

  it('replaces the product list for a draft group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/3']))

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/3'], tiers: [] }],
    })
  })

  it('throws when fewer than 2 products are provided', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    await expect(updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1']))).rejects.toThrow(
      'at least 2 products',
    )
  })

  it('allows re-submitting the group\'s own current members without a membership conflict', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2']))

    expect(saveSpy).toHaveBeenCalled()
  })

  it('clears metafields from products removed from a live group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getGroupProductInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'Tuna', handle: 'tuna', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/3', title: 'Ocean', handle: 'ocean', basePrice: 1.49 },
    ])
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/3']))

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', null)
  })
})

describe('setGroupStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes metafields to every member when flipping to live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getGroupProductInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'Tuna', handle: 'tuna', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/2', title: 'Chicken', handle: 'chicken', basePrice: 1.49 },
    ])
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await setGroupStatus('grp_a', 'live')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    expect(syncSpy).toHaveBeenCalledTimes(2)
  })

  it('clears metafields from every member when flipping to draft', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await setGroupStatus('grp_a', 'draft')

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/1', null)
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', null)
  })
})

describe('deleteGroup', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes the group and clears every member metafield', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [
        { groupId: 'grp_a', name: 'Soups', status: 'live', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] },
        { groupId: 'grp_b', name: 'Other', status: 'draft', productIds: ['gid://shopify/Product/9'], tiers: [] },
      ],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await deleteGroup('grp_a')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_b', name: 'Other', status: 'draft', productIds: ['gid://shopify/Product/9'], tiers: [] }],
    })
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/1', null)
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', null)
  })

  it('throws when the group does not exist', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    await expect(deleteGroup('grp_missing')).rejects.toThrow('not found')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: FAIL — none of `updateGroupProducts`, `updateGroupTiers`, `setGroupStatus`, `deleteGroup` are exported yet.

- [ ] **Step 3: Implement**

Update the top import line in `src/actions/discountActions.ts` to add `getGroupProductInfo` and `syncGroupTierMetafield`:

```ts
import { getConfig, saveConfig, isProductAvailable, type Tier, type ProductDiscount, type GroupDiscount } from '@/lib/config'
import { redirectWithToken } from '@/lib/auth-redirect'
import { syncProductTierMetafield, syncGroupTierMetafield } from '@/lib/product-tiers'
import { getGroupProductInfo } from '@/lib/products'
```

Append to the end of `src/actions/discountActions.ts`:

```ts
async function syncGroupMetafields(group: GroupDiscount): Promise<void> {
  const members = await getGroupProductInfo(group.productIds)
  await Promise.all(
    group.productIds.map((productId) => {
      const siblings = members
        .filter((m) => m.productId !== productId)
        .map((m) => ({ title: m.title, handle: m.handle }))
      return syncGroupTierMetafield(productId, { tiers: group.tiers, siblings })
    }),
  )
}

async function clearGroupMetafields(productIds: string[]): Promise<void> {
  await Promise.all(productIds.map((productId) => syncGroupTierMetafield(productId, null)))
}

export async function updateGroupProducts(groupId: string, formData: FormData): Promise<void> {
  const productIds = parseGroupProductIdsFromForm(formData)
  if (productIds.length < 2) throw new Error('A group needs at least 2 products')

  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  for (const productId of productIds) {
    if (!isProductAvailable(config, productId, groupId)) {
      throw new Error(`Product ${productId} already has a discount or belongs to another group`)
    }
  }

  const removedProductIds = group.productIds.filter((id) => !productIds.includes(id))
  group.productIds = productIds
  await saveConfig(config)

  if (removedProductIds.length > 0) {
    await clearGroupMetafields(removedProductIds)
  }
  if (group.status === 'live') {
    await syncGroupMetafields(group)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}

export async function updateGroupTiers(groupId: string, formData: FormData): Promise<void> {
  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  group.tiers = tiers
  await saveConfig(config)

  if (group.status === 'live') {
    await syncGroupMetafields(group)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}

export async function setGroupStatus(groupId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  group.status = status
  await saveConfig(config)

  if (status === 'live') {
    await syncGroupMetafields(group)
  } else {
    await clearGroupMetafields(group.productIds)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}

export async function deleteGroup(groupId: string): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const remaining = config.groups.filter((g) => g.groupId !== groupId)
  await saveConfig({ ...config, groups: remaining })

  await clearGroupMetafields(group.productIds)

  await redirectWithToken('/')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts
git commit -m "Add group edit/lifecycle actions: products, tiers, status, delete"
```

---

## Task 8: Admin pages — group create/edit + home page section

**Files:**
- Create: `src/app/discounts/groups/new/page.tsx`
- Create: `src/app/discounts/groups/[groupId]/page.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `createGroup`, `updateGroupProducts`, `updateGroupTiers`, `setGroupStatus`, `deleteGroup` from `@/actions/discountActions`; `getGroupProductInfo` from `@/lib/products`; `GroupProductPicker` from `@/components/GroupProductPicker`; `TierFields`, `ConfirmForm` (existing); `resultingPrice`, `totalAtThreshold` from `@/lib/tier-math`

No automated test — matches this codebase's existing convention of untested page components (`src/app/discounts/new/page.tsx` and `src/app/discounts/[productId]/page.tsx` have no test files either). Verified via a successful `npm run build` and later, live, in Task 13.

- [ ] **Step 1: Create the "new group" page**

Create `src/app/discounts/groups/new/page.tsx`:

```tsx
import { createGroup } from '@/actions/discountActions'
import GroupProductPicker from '@/components/GroupProductPicker'
import TierFields from '@/components/TierFields'

export default function NewGroupPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add group discount</h1>

      <form action={createGroup} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="e.g. Mix & Match Soups"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Products</p>
          <GroupProductPicker />
          <p className="text-xs text-muted mt-2">All products in a group must share the same price.</p>
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <TierFields />
          <p className="text-xs text-muted mt-2">
            Tiers apply to the combined quantity of every product in the group.
          </p>
        </div>

        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Create draft group
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Create the group edit page**

Create `src/app/discounts/groups/[groupId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/config'
import { getGroupProductInfo } from '@/lib/products'
import { resultingPrice, totalAtThreshold } from '@/lib/tier-math'
import { updateGroupProducts, updateGroupTiers, setGroupStatus, deleteGroup } from '@/actions/discountActions'
import GroupProductPicker from '@/components/GroupProductPicker'
import TierFields from '@/components/TierFields'
import ConfirmForm from '@/components/ConfirmForm'

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId: encodedGroupId } = await params
  const groupId = decodeURIComponent(encodedGroupId)

  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) notFound()

  const members = await getGroupProductInfo(group.productIds)
  const sharedPrice = members[0]?.basePrice ?? 0

  const updateProductsWithId = updateGroupProducts.bind(null, groupId)
  const updateTiersWithId = updateGroupTiers.bind(null, groupId)
  const goLive = setGroupStatus.bind(null, groupId, 'live')
  const goDraft = setGroupStatus.bind(null, groupId, 'draft')
  const remove = deleteGroup.bind(null, groupId)

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{group.name}</h1>
      <p className="text-sm text-muted mb-6">{group.status}</p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Products</h2>
        <form action={updateProductsWithId} className="space-y-3">
          <GroupProductPicker
            initialProducts={members.map((m) => ({ id: m.productId, title: m.title, price: m.basePrice }))}
            excludeGroupId={groupId}
          />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save products
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <form action={updateTiersWithId} className="space-y-3">
          <TierFields initial={group.tiers} />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {members.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting prices</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-1">Min qty</th>
                <th className="py-1">% off</th>
                <th className="py-1">Per-unit price</th>
                <th className="py-1">Total at min qty</th>
              </tr>
            </thead>
            <tbody>
              {group.tiers.map((tier) => (
                <tr key={tier.minQty} className="border-b border-line">
                  <td className="py-1">{tier.minQty}+</td>
                  <td className="py-1">{tier.percentOff}%</td>
                  <td className="py-1">£{resultingPrice(sharedPrice, tier.percentOff).toFixed(2)}</td>
                  <td className="py-1">
                    £{totalAtThreshold(sharedPrice, tier).toFixed(2)}
                    {tier.anchorPrice != null && <span className="text-muted text-xs"> (anchored)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex gap-3">
        {group.status === 'draft' ? (
          <ConfirmForm
            action={goLive}
            confirmMessage={`Go live with this group discount? This creates a real, active discount for all its products immediately.`}
          >
            <button
              type="submit"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Go live
            </button>
          </ConfirmForm>
        ) : (
          <ConfirmForm
            action={goDraft}
            confirmMessage={`Take this group discount offline? It stops applying immediately.`}
          >
            <button
              type="submit"
              className="bg-danger hover:bg-danger-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              Take offline
            </button>
          </ConfirmForm>
        )}
        <ConfirmForm
          action={remove}
          confirmMessage={`Delete this group discount entirely? This cannot be undone.`}
        >
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Delete
          </button>
        </ConfirmForm>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Add the "Group Discounts" section to the home page**

Replace the full contents of `src/app/page.tsx` with:

```tsx
import { headers } from 'next/headers'
import { getConfig } from '@/lib/config'
import { getProductInfo } from '@/lib/products'
import AuthLink from '@/components/AuthLink'

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const rows = await Promise.all(
    config.products.map(async (p) => {
      const info = await getProductInfo(p.productId)
      return { ...p, title: info?.title ?? `${p.productId} — not found` }
    }),
  )

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Product Discounts</h1>
        <AuthLink
          href="/discounts/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add discount
        </AuthLink>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">No product discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.productId} className="py-4">
              <AuthLink
                href={`/discounts/${encodeURIComponent(row.productId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.title}
              </AuthLink>
              <p className="text-sm text-muted">
                {row.status} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between mb-6 mt-12">
        <h2 className="text-2xl font-semibold">Group Discounts</h2>
        <AuthLink
          href="/discounts/groups/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add group
        </AuthLink>
      </div>

      {config.groups.length === 0 ? (
        <p className="text-muted">No group discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {config.groups.map((group) => (
            <li key={group.groupId} className="py-4">
              <AuthLink
                href={`/discounts/groups/${encodeURIComponent(group.groupId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {group.name}
              </AuthLink>
              <p className="text-sm text-muted">
                {group.status} · {group.productIds.length} product{group.productIds.length === 1 ? '' : 's'} ·{' '}
                {group.tiers.length} tier{group.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Verify the app builds and existing tests still pass**

Run: `nvm use 20.20.2 && npm run build && npm test`
Expected: build succeeds with no type errors; all Vitest suites pass (aside from the two pre-existing, unrelated stale-worktree failures noted in project memory, if the worktree is still present).

- [ ] **Step 5: Commit**

```bash
git add src/app/discounts/groups/new/page.tsx src/app/discounts/groups/\[groupId\]/page.tsx src/app/page.tsx
git commit -m "Add group discount admin pages and home page section"
```

---

## Task 9: Discount Function — group evaluation logic (Rust)

**Files:**
- Modify: `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`

**Interfaces:**
- Produces: `GroupConfig { group_id: String, status: String, product_ids: Vec<String>, tiers: Vec<Tier> }`, `Config.groups: Vec<GroupConfig>` (defaults to empty when the JSON key is absent, for backward compatibility with configs saved before this feature)

Note on backward compatibility: the `shopify_function` crate (confirmed by reading `shopify_function-2.2.0/tests/derive_deserialize_default_test.rs` in the local cargo registry) supports `#[shopify_function(default)]` on a field to make it default (via `Default::default()`, i.e. an empty `Vec`) when the JSON key is missing or null — this is the mechanism, not plain `#[serde(default)]`. This matters because real shop metafield configs saved before this feature won't have a `"groups"` key at all, and the Function must not error on them.

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` block in `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`, after the existing tests:

```rust
    #[test]
    fn applies_a_group_percent_tier_to_each_matching_line_independently() -> Result<()> {
        // Two different products, same price, combined quantity (4+3=7)
        // reaches the group's tier — each line gets its own Percentage
        // candidate, no split math since there's no anchor.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 4,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [],
                            "groups": [
                                {
                                    "groupId": "grp_1",
                                    "status": "live",
                                    "productIds": ["gid://shopify/Product/1", "gid://shopify/Product/2"],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => {
                assert_eq!(op.candidates.len(), 2);
                assert_eq!(op.selection_strategy, schema::ProductDiscountSelectionStrategy::All);
                for candidate in &op.candidates {
                    match &candidate.value {
                        schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 8.0),
                        _ => panic!("expected a Percentage value when the group tier has no anchor"),
                    }
                }
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn applies_no_group_discount_below_the_combined_threshold() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [],
                            "groups": [
                                {
                                    "groupId": "grp_1",
                                    "status": "live",
                                    "productIds": ["gid://shopify/Product/1", "gid://shopify/Product/2"],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn ignores_a_draft_group() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 10,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [],
                            "groups": [
                                {
                                    "groupId": "grp_1",
                                    "status": "draft",
                                    "productIds": ["gid://shopify/Product/1"],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn defaults_groups_to_empty_when_the_stored_config_predates_the_field() -> Result<()> {
        // No "groups" key at all in shop.metafield.jsonValue — must not error,
        // for backward compatibility with configs saved before this feature.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        Ok(())
    }

    #[test]
    fn splits_an_anchored_group_discount_proportionally_with_penny_remainder_to_the_earliest_line() -> Result<()> {
        // 3 lines, each quantity 1 (total 3, exactly the tier's min_qty, so
        // extra_units is 0). unit_price=1.00, anchor_price=2.50:
        // discount_amount_total = (1.00*3) - 2.50 = 0.50 (50 pence).
        // Each line's naive proportional share is 50 * (1/3) = 16.666...,
        // which rounds to 17 pence — three lines at 17 is 51, one penny over
        // the 50-penny total, so the remainder (-1) must land on the
        // earliest line (index 0) by cart order, giving [16, 17, 17].
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/2",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/3" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [],
                            "groups": [
                                {
                                    "groupId": "grp_1",
                                    "status": "live",
                                    "productIds": [
                                        "gid://shopify/Product/1",
                                        "gid://shopify/Product/2",
                                        "gid://shopify/Product/3"
                                    ],
                                    "tiers": [{ "minQty": 3, "percentOff": 10.0, "anchorPrice": 2.50 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => {
                assert_eq!(op.candidates.len(), 3);
                let amounts: Vec<f64> = op
                    .candidates
                    .iter()
                    .map(|c| match &c.value {
                        schema::ProductDiscountCandidateValue::FixedAmount(f) => f.amount.0,
                        _ => panic!("expected a FixedAmount value when the group tier has an anchor"),
                    })
                    .collect();
                assert_eq!(amounts, vec![0.16, 0.17, 0.17]);
                let total: f64 = amounts.iter().sum();
                assert!((total - 0.50).abs() < 1e-9, "amounts must sum exactly to the total discount, got {}", total);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_group_discount_and_a_standalone_discount_coexist_in_one_cart() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "cost": { "amountPerQuantity": { "amount": "2.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/9" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 4,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/2",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.49" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/9",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 25.0 }]
                                }
                            ],
                            "groups": [
                                {
                                    "groupId": "grp_1",
                                    "status": "live",
                                    "productIds": ["gid://shopify/Product/1", "gid://shopify/Product/2"],
                                    "tiers": [{ "minQty": 7, "percentOff": 8.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => {
                assert_eq!(op.candidates.len(), 3);
                assert_eq!(op.selection_strategy, schema::ProductDiscountSelectionStrategy::All);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extensions/product-discount && cargo test`
Expected: FAIL to compile — `groups` is not a field on the JSON fixtures' expected `Config` struct yet (the struct doesn't have a `groups` field at all).

- [ ] **Step 3: Implement**

Add the `GroupConfig` struct after `ProductConfig` in `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`:

```rust
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct GroupConfig {
    group_id: String,
    status: String,
    product_ids: Vec<String>,
    tiers: Vec<Tier>,
}
```

Update `Config` to add the `groups` field with the backward-compatible default:

```rust
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    products: Vec<ProductConfig>,
    #[shopify_function(default)]
    groups: Vec<GroupConfig>,
}
```

Insert the group-evaluation loop right after the closing `}` of the existing `for line in input.cart().lines().iter() { ... }` loop, and before the `if candidates.is_empty() { ... }` check:

```rust
    for group in config.groups.iter().filter(|g| g.status == "live") {
        let mut line_ids = vec![];
        let mut line_quantities: Vec<i32> = vec![];
        let mut line_unit_price = 0.0_f64;

        for line in input.cart().lines().iter() {
            let variant = match line.merchandise() {
                schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
                _ => continue,
            };
            let product_id = variant.product().id();

            if !group.product_ids.iter().any(|id| id == product_id) {
                continue;
            }

            line_unit_price = line.cost().amount_per_quantity().amount().as_f64();
            line_ids.push(line.id().clone());
            line_quantities.push(*line.quantity());
        }

        if line_ids.is_empty() {
            continue;
        }

        let total_quantity: i32 = line_quantities.iter().sum();

        let best_tier = group
            .tiers
            .iter()
            .filter(|t| t.min_qty <= total_quantity)
            .max_by_key(|t| t.min_qty);

        let tier = match best_tier {
            Some(t) => t,
            None => continue,
        };

        match tier.anchor_price {
            None => {
                // Plain percentage off — no split math needed, it's
                // line-local by construction, so every matching line gets
                // its own independent Percentage candidate.
                for id in &line_ids {
                    candidates.push(schema::ProductDiscountCandidate {
                        targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                            schema::CartLineTarget { id: id.clone(), quantity: None },
                        )],
                        message: Some(format!("{}% off", tier.percent_off)),
                        value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                            value: Decimal(tier.percent_off),
                        }),
                        associated_discount_code: None,
                        prerequisites: None,
                    });
                }
            }
            Some(anchor_price) => {
                // Same anchor formula as the standalone case, generalized to
                // the group's combined quantity and shared unit price (the
                // admin app guarantees every member shares one price).
                let extra_units = (total_quantity - tier.min_qty) as f64;
                let discount_amount_total = (line_unit_price * tier.min_qty as f64) - anchor_price
                    + extra_units * line_unit_price * (tier.percent_off / 100.0);
                let discount_amount_total = (discount_amount_total * 100.0).round() / 100.0;
                let discount_amount_total = discount_amount_total.max(0.0);

                // Split proportionally by quantity share, in whole pence,
                // with any rounding remainder assigned to the largest line
                // — ties broken toward the earliest line by cart order —
                // so the per-line amounts always sum exactly to
                // discount_amount_total.
                let total_pence = (discount_amount_total * 100.0).round() as i64;
                let mut pence_per_line: Vec<i64> = line_quantities
                    .iter()
                    .map(|qty| {
                        let share = discount_amount_total * (*qty as f64 / total_quantity as f64);
                        (share * 100.0).round() as i64
                    })
                    .collect();

                let allocated: i64 = pence_per_line.iter().sum();
                let leftover = total_pence - allocated;
                if leftover != 0 {
                    let largest_idx = line_quantities
                        .iter()
                        .enumerate()
                        .max_by_key(|(i, qty)| (**qty, std::cmp::Reverse(*i)))
                        .map(|(i, _)| i)
                        .unwrap_or(0);
                    pence_per_line[largest_idx] += leftover;
                }

                for (id, pence) in line_ids.iter().zip(pence_per_line.iter()) {
                    candidates.push(schema::ProductDiscountCandidate {
                        targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                            schema::CartLineTarget { id: id.clone(), quantity: None },
                        )],
                        message: Some(format!("{}% off", tier.percent_off)),
                        value: schema::ProductDiscountCandidateValue::FixedAmount(
                            schema::ProductDiscountCandidateFixedAmount {
                                amount: Decimal(*pence as f64 / 100.0),
                                applies_to_each_item: Some(false),
                            },
                        ),
                        associated_discount_code: None,
                        prerequisites: None,
                    });
                }
            }
        }
    }

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test`
Expected: PASS — all 15 tests (9 pre-existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add extensions/product-discount/src/cart_lines_discounts_generate_run.rs
git commit -m "Add group discount evaluation to the Discount Function"
```

---

## Task 10: Widget — `sumGroupQuantityInCart` (pure, tested)

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`
- Test: `extensions/product-tier-pricing-tests/tier-pricing.test.js`

**Interfaces:**
- Produces: `function sumGroupQuantityInCart(cartItems: { handle: string; quantity: number }[], handles: string[]): number` — exported via the existing `module.exports` guard alongside `computeTierState`/`perUnitPrice`, so it's Node-testable independent of the DOM.

- [ ] **Step 1: Write the failing tests**

Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js`:

```js
const { computeTierState, perUnitPrice, sumGroupQuantityInCart } = require('../product-tier-pricing/assets/tier-pricing.js')

test('sumGroupQuantityInCart: sums quantities of cart items matching the given handles', () => {
  const items = [
    { handle: 'tuna-soup', quantity: 3 },
    { handle: 'chicken-soup', quantity: 2 },
    { handle: 'unrelated-product', quantity: 5 },
  ]
  const result = sumGroupQuantityInCart(items, ['tuna-soup', 'chicken-soup', 'ocean-soup'])
  assert.equal(result, 5)
})

test('sumGroupQuantityInCart: returns 0 for an empty cart', () => {
  assert.equal(sumGroupQuantityInCart([], ['tuna-soup']), 0)
})

test('sumGroupQuantityInCart: ignores items whose handle is not in the list', () => {
  const items = [{ handle: 'unrelated', quantity: 10 }]
  assert.equal(sumGroupQuantityInCart(items, ['tuna-soup']), 0)
})
```

(update the file's existing top `require` line to add `sumGroupQuantityInCart` as shown)

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: FAIL — `sumGroupQuantityInCart` is undefined.

- [ ] **Step 3: Implement**

In `extensions/product-tier-pricing/assets/tier-pricing.js`, add this function right after `perUnitPrice` and before the `if (typeof module !== 'undefined' ...)` export guard:

```js
function sumGroupQuantityInCart(cartItems, handles) {
  return cartItems
    .filter((item) => handles.includes(item.handle))
    .reduce((sum, item) => sum + item.quantity, 0)
}
```

Update the export guard to include it:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeTierState, perUnitPrice, sumGroupQuantityInCart }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS — 15 tests (12 pre-existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing-tests/tier-pricing.test.js
git commit -m "Add sumGroupQuantityInCart helper for widget group-cart matching"
```

---

## Task 11: Widget — group mode wiring (Liquid, browser JS, CSS)

**Files:**
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid`
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js` (browser-only section, below the `module.exports` guard from Task 10)
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.css`

No automated test — this is DOM/network-integration code exercised through the theme editor, verified manually via `shopify app dev`/`shopify app build` succeeding, and later live in Task 13.

- [ ] **Step 1: Wire the group metafield into the block's Liquid**

In `extensions/product-tier-pricing/blocks/tier-pricing.liquid`, replace the metafield-reading assigns at the top (everything before the `<div ...>`) with:

```liquid
{%- assign tiers_metafield = product.metafields.sparkly_product_discounts.tiers -%}
{%- assign group_metafield = product.metafields.sparkly_product_discounts.group -%}
{%- if group_metafield != blank -%}
  {%- assign group_json = group_metafield.value | json -%}
{%- else -%}
  {%- assign group_json = 'null' -%}
{%- endif -%}
{%- if tiers_metafield != blank -%}
  {%- assign tiers_json = tiers_metafield.value | json -%}
{%- else -%}
  {%- assign tiers_json = '{"tiers":[]}' -%}
{%- endif -%}
<div
  id="sparkly-tier-pricing-{{ block.id }}"
  class="sparkly-tier-pricing"
  data-sparkly-tier-pricing
  data-tiers='{{ tiers_json }}'
  data-group='{{ group_json }}'
  data-product-handle="{{ product.handle | json }}"
  data-base-price="{{ product.selected_or_first_available_variant.price | divided_by: 100.0 | json }}"
  data-money-format='{{ shop.money_format | json }}'
  style="--sparkly-tier-price-font-size: {{ block.settings.price_font_size }}px;"
>
  <p class="sparkly-tier-pricing__price" data-tier-pricing-price>
    {{ product.selected_or_first_available_variant.price | money }}
  </p>
  <p class="sparkly-tier-pricing__message" data-tier-pricing-message></p>
  <p class="sparkly-tier-pricing__group-links" data-tier-pricing-group-links></p>
</div>
```

- [ ] **Step 2: Add CSS for the sibling-links line**

Append to `extensions/product-tier-pricing/assets/tier-pricing.css`:

```css
.sparkly-tier-pricing__group-links {
  font-size: 0.85em;
  opacity: 0.75;
}

.sparkly-tier-pricing__group-links a {
  text-decoration: underline;
}
```

- [ ] **Step 3: Add group-awareness to the browser-only JS**

In `extensions/product-tier-pricing/assets/tier-pricing.js`, inside the `if (typeof document !== 'undefined') { ... }` block:

Change `renderTierPricing`'s signature and quantity resolution (replace the line `const quantity = quantityInput ? Number(quantityInput.value) || 1 : 1`):

```js
  function renderTierPricing(container, tiers, moneyFormat, quantityOverride) {
    const priceEl = container.querySelector('[data-tier-pricing-price]')
    const messageEl = container.querySelector('[data-tier-pricing-message]')
    const basePrice = Number(container.dataset.basePrice)
    const quantityInput = document.querySelector('input[name="quantity"]')
    const selectorQuantity = quantityInput ? Number(quantityInput.value) || 1 : 1
    const quantity = quantityOverride != null ? quantityOverride : selectorQuantity
```

(the rest of `renderTierPricing`'s body is unchanged)

Add these two helpers right after `renderTierPricing`, before `initTierPricing`:

```js
  async function fetchCart() {
    const res = await fetch('/cart.js')
    return res.json()
  }

  function renderGroupLinks(container, siblings) {
    const linksEl = container.querySelector('[data-tier-pricing-group-links]')
    if (!linksEl) return
    if (!siblings || siblings.length === 0) {
      linksEl.innerHTML = ''
      return
    }
    linksEl.innerHTML = siblings
      .map((s) => '<a href="/products/' + s.handle + '">' + s.title + '</a>')
      .join(', ')
  }
```

Replace the body of `initTierPricing` with:

```js
  function initTierPricing() {
    const containers = document.querySelectorAll('[data-sparkly-tier-pricing]')
    containers.forEach((container) => {
      const standaloneTiers = JSON.parse(container.dataset.tiers).tiers
      const moneyFormat = JSON.parse(container.dataset.moneyFormat)
      const group = JSON.parse(container.dataset.group)
      const productHandle = JSON.parse(container.dataset.productHandle)
      const tiers = group ? group.tiers : standaloneTiers

      function currentSelectorQuantity() {
        const quantityInput = document.querySelector('input[name="quantity"]')
        return quantityInput ? Number(quantityInput.value) || 1 : 1
      }

      // Group mode needs the combined quantity of every group product
      // already in the cart (this product's own line included) plus
      // whatever's set in the quantity selector but not yet added — plain
      // single-product mode just renders with the selector value, same as
      // before this feature.
      async function renderWithGroupAwareness() {
        if (!group) {
          renderTierPricing(container, tiers, moneyFormat)
          return
        }
        const handles = [productHandle].concat(group.siblings.map((s) => s.handle))
        let cartQuantity = 0
        try {
          const cart = await fetchCart()
          cartQuantity = sumGroupQuantityInCart(cart.items, handles)
        } catch {
          cartQuantity = 0
        }
        const effectiveQuantity = cartQuantity + currentSelectorQuantity()
        renderTierPricing(container, tiers, moneyFormat, effectiveQuantity)
        renderGroupLinks(container, group.siblings)
      }

      renderWithGroupAwareness()

      const quantityInput = document.querySelector('input[name="quantity"]')
      if (quantityInput) {
        quantityInput.addEventListener('input', renderWithGroupAwareness)
        quantityInput.addEventListener('change', renderWithGroupAwareness)

        // The theme's +/- quantity stepper sets `.value` programmatically
        // without dispatching an `input`/`change` event, so the listeners
        // above never fire for stepper clicks. Poll for a value change as a
        // theme-agnostic fallback.
        let lastQuantity = quantityInput.value
        setInterval(() => {
          if (quantityInput.value !== lastQuantity) {
            lastQuantity = quantityInput.value
            renderWithGroupAwareness()
          }
        }, 200)
      }

      // This theme's <product-variants> custom element dispatches a plain
      // Event('VARIANT_CHANGE') on itself (not document, and it doesn't
      // bubble) — not the generic "variant:change" CustomEvent-on-document
      // convention some themes use. Variant data lives at
      // event.target.currentVariant. See
      // assets/component-product-form.js (ProductVariants.onVariantChange)
      // in the theme.
      const productVariantsEl = document.querySelector('product-variants')
      if (productVariantsEl) {
        productVariantsEl.addEventListener('VARIANT_CHANGE', (event) => {
          const variant = event.target.currentVariant
          if (variant && typeof variant.price === 'number') {
            container.dataset.basePrice = String(variant.price / 100)
          }
          renderWithGroupAwareness()
        })
      }

      // Loop Subscriptions' one-time/subscribe toggle doesn't change the
      // variant, and only fires Loop's own undocumented internal events —
      // not a stable contract to hook directly. Loop already renders the
      // correct per-unit price for whichever purchase option is selected,
      // so poll that instead.
      let lastLoopPriceText = null
      setInterval(() => {
        const loopPriceEl = document.querySelector(
          '.loop-w-btn-group-purchase-option-selected .loop-w-btn-group-purchase-option-price',
        )
        if (!loopPriceEl) return
        const text = loopPriceEl.textContent
        if (text === lastLoopPriceText) return
        lastLoopPriceText = text
        const match = text.match(/\d+\.\d{2}|\d+/)
        if (match) {
          container.dataset.basePrice = match[0]
          renderWithGroupAwareness()
        }
      }, 200)

      // Group mode's whole point is reacting to OTHER group products being
      // added to the cart from elsewhere on the page (or the cart drawer)
      // while this page is open — there's no local DOM event for that, so
      // poll /cart.js. Only active in group mode; plain single-product
      // pages get no extra network traffic.
      if (group) {
        setInterval(renderWithGroupAwareness, 1000)
      }
    })
  }
```

- [ ] **Step 4: Verify the extension still passes its existing tests and the app builds**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js && cd /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts && npm run build`
Expected: JS test suite still passes (unchanged from Task 10 — this task only touches the untested browser-only section); admin app build succeeds (unaffected by this task, confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add extensions/product-tier-pricing/blocks/tier-pricing.liquid extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing/assets/tier-pricing.css
git commit -m "Wire group mode into the storefront tier-pricing widget"
```

---

## Task 12: Version bump

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.14.1"` to `"version": "0.15.0"`.

In `package-lock.json`, change both occurrences of `"version": "0.14.1"` (the top-level package entry and the `packages[""]` entry) to `"version": "0.15.0"`.

- [ ] **Step 2: Verify**

Run: `grep -n '"version"' package.json package-lock.json | head -5`
Expected: all three occurrences now read `0.15.0`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Bump version to 0.15.0 for grouped product discounts"
```

---

## Task 13: Deploy and live verification

Not a code task — this closes the loop per the spec's "Live verification" testing-plan bullet. No automated test; these are manual steps against the real store.

- [ ] **Step 1: Push and deploy**

```bash
git push
```

Then deploy the updated Discount Function and theme extension:

```bash
nvm use 20.20.2 && shopify app deploy --allow-updates
```

- [ ] **Step 2: Create a real 2–3 product test group**

In the admin app, create a group from two or three real same-priced products (e.g. the existing Tuna Soup / Chicken Soup pair used in prior live testing), add a tier (e.g. min qty 7, 8% off, no anchor first), and go live.

- [ ] **Step 3: Verify cart math end-to-end**

Add a mix of the group's products to a real cart via the storefront (e.g. 4 of one, 3 of another) totaling at or above the tier threshold. Confirm the cart/checkout discount matches what the admin's "Resulting prices" table predicts.

- [ ] **Step 4: Verify the widget's cross-product awareness**

With some group items already in the cart, load a *different* group member's product page (one not yet in the cart) and confirm its widget shows the combined progress (already-in-cart quantity + this page's selector value) and lists the other group products as links. Add more from that page and confirm the progress updates within ~1 second without a page reload.

- [ ] **Step 5: Test an anchored group tier live**

Edit the group's tier to add an anchor price (e.g. £10.00 for min qty 7), confirm the "Resulting prices" table shows the anchored total, then repeat step 3 with that tier and confirm the checkout total matches exactly, and that adding units beyond the anchor threshold accrues at the plain percentage rate as expected.

- [ ] **Step 6: Clean up test data**

Remove the test cart contents and either delete the test group or take it back to draft, so it doesn't remain live against real customer traffic.
