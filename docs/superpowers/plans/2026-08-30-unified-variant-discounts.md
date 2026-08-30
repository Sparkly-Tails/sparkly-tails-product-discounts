# Unified Variant-Aware Discounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's separate standalone-product and group discount concepts with one unified `Discount` whose members can be whole products and/or specific variants, freely mixed, through one guided admin flow, with tier pricing modes gated on whether the selected members share a base price.

**Architecture:** One data shape (`Discount { members: {productId, variantId?}[], ... }`) flows through every layer that today branches on "product vs. group": the admin's config/actions/sync, the theme extension's Liquid+JS, and the Rust discount Function's config/matching. No migration — old metafields are simply superseded; the 4 live discounts are recreated manually post-deploy.

**Tech Stack:** Next.js (App Router, Server Actions) + TypeScript + Vitest (admin app, Node 20.20.2 per `.nvmrc`); vanilla JS + Node's built-in test runner (theme app extension, Node 22.23.1); Rust + Shopify Functions + `cargo test` (discount Function).

**Spec:** [docs/superpowers/specs/2026-08-30-unified-variant-discounts-design.md](../specs/2026-08-30-unified-variant-discounts-design.md)

## Global Constraints

- No migration of existing live discounts — old metafield keys (`tiers`, `group`) and the old shop-level `config` shape (`{products, groups}`) are fully replaced, not dual-read. The 4 live discounts + 1 standalone discount are recreated manually by the user after deploy (spec §3, §13).
- A product with more than one variant can never be added as an ambiguous "whole product" member — the merchant must explicitly tick which variant(s) (spec §4, §6).
- Price-uniformity comparison uses the existing codebase convention — parsed `number` prices compared with `Math.abs(a - b) > 0.001` tolerance (matching `groupProductActions.ts`'s existing check), not string comparison (spec §5 mentions string comparison; this plan follows the codebase's actual existing convention instead, since it's already proven and simpler).
- `pricingMode: 'fixed'` and any tier's `anchorPrice` are only permitted when every member's resolved price is uniform; otherwise only `pricingMode: 'percent'` with no `anchorPrice` on any tier is valid (spec §5).
- Every new/modified TypeScript module gets Vitest coverage in the matching `tests/` path, following this repo's existing `vi.spyOn(shopifyClient, 'shopifyQuery')` mocking convention (see `tests/lib/config.test.ts`).
- Every new/modified Rust matching logic gets a `#[test]` in the same file's `mod tests` block, following the existing `run_function_with_input` fixture pattern.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/config.ts` | `Discount`/`DiscountMember`/`Tier` types, `Config`, `getConfig`/`saveConfig`, `isProductAvailable`, `pricesUniform` |
| `src/lib/products.ts` | Shopify product/variant lookups: search, single-member info, batch member info, listing a product's variants |
| `src/lib/product-tiers.ts` | `syncDiscountMetafields` / `clearDiscountMetafields` — the one metafield sync path |
| `src/actions/discountActions.ts` | `createDiscount`, `updateDiscountMembers`, `updateDiscountTiers`, `updateDiscountTitle`, `setDiscountStatus`, `deleteDiscount` |
| `src/actions/memberPickerActions.ts` | Replaces `groupProductActions.ts` — server actions backing the picker UI: add-a-member validation, listing a product's variants |
| `src/components/MemberPicker.tsx` | Replaces `ProductPicker.tsx` + `GroupProductPicker.tsx` — one picker for 1..N members, with per-product variant expansion |
| `src/components/PricingModeTierFields.tsx` | Gains `allowPriceBasedModes` prop |
| `src/components/TierFields.tsx` | Gains `allowAnchorPrice` prop |
| `src/app/discounts/new/page.tsx` | The one "New discount" entry point |
| `src/app/discounts/[discountId]/page.tsx` | Replaces both `[productId]/page.tsx` and `groups/[groupId]/page.tsx` |
| `src/app/page.tsx` | One discount list instead of two |
| `extensions/product-tier-pricing/blocks/tier-pricing.liquid` | Reads the one `discount` metafield key |
| `extensions/product-tier-pricing/assets/tier-pricing.js` | Unified config parsing, variant-eligibility check, variant-aware cart matching |
| `extensions/product-discount/src/cart_lines_discounts_generate_run.rs` | Unified `Discount`/`Member` structs, one matching loop |
| `extensions/product-discount/src/cart_lines_discounts_generate_run.graphql` | Adds `id` on `ProductVariant` |

Deleted: `src/components/ProductPicker.tsx`, `src/components/GroupProductPicker.tsx`, `src/actions/groupProductActions.ts`, `src/app/discounts/[productId]/page.tsx`, `src/app/discounts/groups/[groupId]/page.tsx`, `src/app/discounts/groups/new/page.tsx`, and their corresponding test files.

---

### Task 1: Unified config data model

**Files:**
- Modify: `src/lib/config.ts`
- Test: `tests/lib/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DiscountMember { productId: string; variantId?: string }
  interface Discount {
    discountId: string
    name: string
    title: string
    status: 'draft' | 'live'
    pricingMode: 'percent' | 'fixed'
    members: DiscountMember[]
    tiers: Tier[]
  }
  interface Config { discounts: Discount[] }
  function isProductAvailable(config: Config, productId: string, variantId: string | undefined, excludeDiscountId?: string): boolean
  function pricesUniform(prices: number[]): boolean
  ```

- [ ] **Step 1: Write the failing tests for the new types, `pricesUniform`, and `isProductAvailable`**

Replace the entire contents of `tests/lib/config.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, isProductAvailable, pricesUniform, type Config } from '@/lib/config'
import * as shopifyClient from '@/lib/shopify-client'

describe('getConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses the stored config JSON', async () => {
    const stored = {
      discounts: [
        {
          discountId: 'disc_1',
          name: 'Tuna Soup',
          title: 'Canagan Tuna Soup',
          status: 'live',
          pricingMode: 'percent',
          members: [{ productId: 'gid://shopify/Product/1' }],
          tiers: [{ minQty: 5, percentOff: 10 }],
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })

    const config = await getConfig()
    expect(config).toEqual(stored)
  })

  it('returns an empty discount list when no metafield exists yet', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })

    const config = await getConfig()
    expect(config).toEqual({ discounts: [] })
  })
})

describe('saveConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the config as a JSON shop metafield', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: Config = {
      discounts: [
        {
          discountId: 'disc_1', name: 'Tuna Soup', title: 'Some Title', status: 'draft',
          pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
        },
      ],
    }
    await saveConfig(config)

    expect(shopIdSpy).toHaveBeenCalledTimes(2)
    expect(shopIdSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            ownerId: 'gid://shopify/Shop/1',
            namespace: 'sparkly_product_discounts',
            key: 'config',
            type: 'json',
            value: JSON.stringify(config),
          }),
        ],
      }),
    )
  })

  it('throws when Shopify reports userErrors', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] } })

    await expect(saveConfig({ discounts: [] })).rejects.toThrow('Invalid JSON')
  })
})

describe('isProductAvailable', () => {
  const baseConfig: Config = {
    discounts: [
      {
        discountId: 'disc_1', name: 'Solo', title: 'Solo', status: 'draft', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/1' }],
        tiers: [],
      },
      {
        discountId: 'disc_2', name: 'Flavours', title: 'Flavours', status: 'draft', pricingMode: 'percent',
        members: [
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
          { productId: 'gid://shopify/Product/3' },
        ],
        tiers: [],
      },
    ],
  }

  it('is false for a whole product already claimed by another discount', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/1', undefined)).toBe(false)
  })

  it('is false for a product already claimed as a whole-product member', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/3', undefined)).toBe(false)
  })

  it('is false for the exact same variant already claimed', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/20')).toBe(false)
  })

  it('is true for a different variant of a product that only has one specific variant claimed', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/21')).toBe(true)
  })

  it('is true for a product in no discount', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/4', undefined)).toBe(true)
  })

  it('is true for a member already claimed by the discount being excluded', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/1', undefined, 'disc_1')).toBe(true)
  })
})

describe('pricesUniform', () => {
  it('is true for zero or one price', () => {
    expect(pricesUniform([])).toBe(true)
    expect(pricesUniform([1.49])).toBe(true)
  })

  it('is true when all prices match exactly', () => {
    expect(pricesUniform([1.49, 1.49, 1.49])).toBe(true)
  })

  it('is true when prices match within floating-point tolerance', () => {
    expect(pricesUniform([1.1 + 0.39, 1.49])).toBe(true)
  })

  it('is false when any price differs', () => {
    expect(pricesUniform([1.49, 1.59])).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
nvm use 20.20.2 && npx vitest run tests/lib/config.test.ts
```

Expected: FAIL — `pricesUniform` is not exported, and the `discounts`/`members` shape doesn't exist yet.

- [ ] **Step 3: Replace `src/lib/config.ts` with the unified model**

```ts
import { shopifyQuery } from '@/lib/shopify-client'

export interface Tier {
  minQty: number
  percentOff?: number
  /**
   * Optional exact total price to charge for minQty units (e.g. £10.00 for
   * 7 tins instead of the percentage's rounded £10.01). Units beyond minQty
   * still accrue at the normal percentOff per-unit rate — only the price at
   * exactly minQty is anchored. percent mode only, and only valid when
   * every member of the discount shares one base price — see
   * pricesUniform.
   */
  anchorPrice?: number
  /**
   * Absolute price per unit for a fixed-price tier (e.g. £1.50) — every
   * unit in the reached tier is charged this price directly, no percentage
   * involved. fixed mode only. Mutually exclusive with percentOff/
   * anchorPrice, enforced by the admin actions that construct a Tier, not
   * by this type. Only valid when every member shares one base price.
   */
  fixedPrice?: number
}

export interface DiscountMember {
  productId: string
  /**
   * Omitted only when the product has exactly one variant — that variant
   * is implied. A product with more than one variant must always specify
   * which variant this member is; there is no ambiguous "whole
   * multi-variant product" membership.
   */
  variantId?: string
}

export interface Discount {
  discountId: string
  /** Internal admin-facing label. */
  name: string
  /** Customer-facing copy used in storefront promo text. Blank allowed. */
  title: string
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  members: DiscountMember[]
  tiers: Tier[]
}

export interface Config {
  discounts: Discount[]
}

const NAMESPACE = 'sparkly_product_discounts'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(
    `query { shop { id } }`,
  )
  return data.shop.id
}

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
    return { discounts: [] }
  }

  return JSON.parse(data.shop.metafield.value) as Config
}

export async function saveConfig(config: Config): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: NAMESPACE,
          key: 'config',
          type: 'json',
          value: JSON.stringify(config),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}

/**
 * True when (productId, variantId) isn't already claimed by another
 * discount's member. Two members match when their productId is equal AND
 * either shares the same variantId, or at least one of them has no
 * variantId at all (a whole-product claim blocks every variant of that
 * product, and vice versa). Pass the discount's own id as excludeDiscountId
 * when validating an in-progress edit so it doesn't flag its own members.
 */
export function isProductAvailable(
  config: Config,
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): boolean {
  return !config.discounts.some((discount) => {
    if (discount.discountId === excludeDiscountId) return false
    return discount.members.some((member) => {
      if (member.productId !== productId) return false
      if (member.variantId == null || variantId == null) return true
      return member.variantId === variantId
    })
  })
}

/** True when every price in the list is equal, within floating-point rounding. */
export function pricesUniform(prices: number[]): boolean {
  if (prices.length <= 1) return true
  const [first, ...rest] = prices
  return rest.every((p) => Math.abs(p - first) <= 0.001)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
nvm use 20.20.2 && npx vitest run tests/lib/config.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts tests/lib/config.test.ts
git commit -m "Replace product/group discount split with a unified Discount model"
```

---

### Task 2: Product and variant lookups

**Files:**
- Modify: `src/lib/products.ts`
- Test: `tests/lib/products.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (this module is Shopify-API-only)
- Produces:
  ```ts
  interface ProductSearchResult { id: string; title: string; variantCount: number }
  interface MemberInfo { productId: string; variantId?: string; title: string; price: number; handle: string; imageUrl: string | null }
  interface ProductVariantOption { variantId: string; title: string; price: number }
  function searchProducts(query: string): Promise<ProductSearchResult[]>
  function getProductVariantOptions(productId: string): Promise<ProductVariantOption[]>
  function getMemberInfo(members: { productId: string; variantId?: string }[]): Promise<MemberInfo[]>
  ```

- [ ] **Step 1: Write the failing tests**

Replace `tests/lib/products.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProducts, getProductVariantOptions, getMemberInfo } from '@/lib/products'
import * as shopifyClient from '@/lib/shopify-client'

describe('searchProducts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns no results for a blank query without calling Shopify', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await searchProducts('   ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns each product with its variant count', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      products: {
        edges: [
          { node: { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variants: { edges: [{ node: {} }] } } },
          { node: { id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variants: { edges: [{ node: {} }, { node: {} }, { node: {} }] } } },
        ],
      },
    })

    const results = await searchProducts('soup')
    expect(results).toEqual([
      { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 },
      { id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variantCount: 3 },
    ])
  })
})

describe('getProductVariantOptions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('lists every variant with its own title and price', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: {
        variants: {
          edges: [
            { node: { id: 'gid://shopify/ProductVariant/10', title: 'Chicken', price: '1.49' } },
            { node: { id: 'gid://shopify/ProductVariant/11', title: 'Salmon', price: '1.59' } },
          ],
        },
      },
    })

    const options = await getProductVariantOptions('gid://shopify/Product/2')
    expect(options).toEqual([
      { variantId: 'gid://shopify/ProductVariant/10', title: 'Chicken', price: 1.49 },
      { variantId: 'gid://shopify/ProductVariant/11', title: 'Salmon', price: 1.59 },
    ])
  })

  it('returns an empty array when the product no longer resolves', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ product: null })
    expect(await getProductVariantOptions('gid://shopify/Product/999')).toEqual([])
  })
})

describe('getMemberInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns an empty array without a network call for no members', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await getMemberInfo([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('resolves a whole-product member to its own single variant', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', featuredImage: { url: 'https://x/tuna.png' },
          variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/10', title: 'Default Title', price: '1.49' } }] },
        },
      ],
    })

    const info = await getMemberInfo([{ productId: 'gid://shopify/Product/1' }])
    expect(info).toEqual([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: 'https://x/tuna.png' },
    ])
  })

  it('resolves a variant-scoped member to "Product – Variant" title and that variant\'s own price', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/2', title: 'Wet Cat Food', handle: 'wet-cat-food', featuredImage: null,
          variants: {
            edges: [
              { node: { id: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: '1.49' } },
              { node: { id: 'gid://shopify/ProductVariant/21', title: 'Salmon', price: '1.59' } },
            ],
          },
        },
      ],
    })

    const info = await getMemberInfo([{ productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21' }])
    expect(info).toEqual([
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21', title: 'Wet Cat Food – Salmon', price: 1.59, handle: 'wet-cat-food', imageUrl: null },
    ])
  })

  it('silently skips a member whose product no longer resolves', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ nodes: [null] })
    expect(await getMemberInfo([{ productId: 'gid://shopify/Product/999' }])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
nvm use 20.20.2 && npx vitest run tests/lib/products.test.ts
```

Expected: FAIL — `getProductVariantOptions`/`getMemberInfo` don't exist, `searchProducts` doesn't return `variantCount`.

- [ ] **Step 3: Replace `src/lib/products.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'

export interface ProductSearchResult {
  id: string
  title: string
  variantCount: number
}

/**
 * Search-as-you-type lookup for the member picker. Empty/whitespace query
 * short-circuits to no results without a network call, matching the
 * picker's debounce. variantCount tells the picker whether to offer the
 * "select specific variants" expansion.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  if (!query.trim()) return []

  const data = await shopifyQuery<{
    products: { edges: { node: { id: string; title: string; variants: { edges: { node: object }[] } } }[] }
  }>(
    `query searchProducts($q: String!) {
      products(first: 8, query: $q) {
        edges { node { id title variants(first: 250) { edges { node { id } } } } }
      }
    }`,
    { q: query },
  )

  return data.products.edges.map((e) => ({
    id: e.node.id,
    title: e.node.title,
    variantCount: e.node.variants.edges.length,
  }))
}

export interface ProductVariantOption {
  variantId: string
  title: string
  price: number
}

/** Lists every variant of a product, for the picker's variant-expansion UI. */
export async function getProductVariantOptions(productId: string): Promise<ProductVariantOption[]> {
  const data = await shopifyQuery<{
    product: {
      variants: { edges: { node: { id: string; title: string; price: string } }[] }
    } | null
  }>(
    `query getProductVariantOptions($id: ID!) {
      product(id: $id) {
        variants(first: 250) {
          edges { node { id title price } }
        }
      }
    }`,
    { id: productId },
  )

  if (!data.product) return []
  return data.product.variants.edges.map((e) => ({
    variantId: e.node.id,
    title: e.node.title,
    price: parseFloat(e.node.price),
  }))
}

export interface MemberInfo {
  productId: string
  variantId?: string
  title: string
  price: number
  handle: string
  imageUrl: string | null
}

/**
 * Batch title/price/handle/image lookup for a discount's members. Silently
 * skips any member whose product no longer resolves, mirroring the old
 * per-product lookups' null-on-missing behavior — a stale id shouldn't take
 * down the whole discount's admin page.
 */
export async function getMemberInfo(
  members: { productId: string; variantId?: string }[],
): Promise<MemberInfo[]> {
  if (members.length === 0) return []

  const productIds = [...new Set(members.map((m) => m.productId))]

  const data = await shopifyQuery<{
    nodes: ({
      id: string
      title: string
      handle: string
      featuredImage: { url: string } | null
      variants: { edges: { node: { id: string; title: string; price: string } }[] }
    } | null)[]
  }>(
    `query getMemberInfo($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          handle
          featuredImage { url }
          variants(first: 250) {
            edges { node { id title price } }
          }
        }
      }
    }`,
    { ids: productIds },
  )

  const productById = new Map(data.nodes.filter((n) => n != null).map((n) => [n!.id, n!]))

  const results: MemberInfo[] = []
  for (const member of members) {
    const product = productById.get(member.productId)
    if (!product) continue

    if (member.variantId == null) {
      const firstVariant = product.variants.edges[0]?.node
      if (!firstVariant) continue
      results.push({
        productId: product.id,
        variantId: undefined,
        title: product.title,
        price: parseFloat(firstVariant.price),
        handle: product.handle,
        imageUrl: product.featuredImage?.url ?? null,
      })
      continue
    }

    const variant = product.variants.edges.find((e) => e.node.id === member.variantId)?.node
    if (!variant) continue
    results.push({
      productId: product.id,
      variantId: variant.id,
      title: `${product.title} – ${variant.title}`,
      price: parseFloat(variant.price),
      handle: product.handle,
      imageUrl: product.featuredImage?.url ?? null,
    })
  }
  return results
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
nvm use 20.20.2 && npx vitest run tests/lib/products.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/products.ts tests/lib/products.test.ts
git commit -m "Add variant-aware product/member lookups"
```

---

### Task 3: Unified metafield sync

**Files:**
- Modify: `src/lib/product-tiers.ts`
- Test: `tests/lib/product-tiers.test.ts`

**Interfaces:**
- Consumes: `Discount`, `DiscountMember` (Task 1); `getMemberInfo` (Task 2)
- Produces:
  ```ts
  interface DiscountMetafieldValue {
    discountId: string
    title: string
    pricingMode: 'percent' | 'fixed'
    tiers: Tier[]
    ownVariantIds: string[] | null
    siblings: { productId: string; title: string; handle: string; variantId?: string; imageUrl: string | null }[]
  }
  function syncDiscountMetafields(discount: Discount): Promise<void>
  function clearDiscountMetafields(members: { productId: string }[]): Promise<void>
  ```

- [ ] **Step 1: Write the failing tests**

Replace `tests/lib/product-tiers.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncDiscountMetafields, clearDiscountMetafields } from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'
import * as products from '@/lib/products'
import type { Discount } from '@/lib/config'

describe('syncDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes one metafield per unique product, with ownVariantIds and per-member siblings', async () => {
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Wet Cat Food – Chicken', price: 1.49, handle: 'wet-cat-food', imageUrl: 'https://x/c.png' },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21', title: 'Wet Cat Food – Salmon', price: 1.49, handle: 'wet-cat-food', imageUrl: 'https://x/s.png' },
    ])
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })

    const discount: Discount = {
      discountId: 'disc_1', name: 'Mix', title: 'Mix & Match', status: 'live', pricingMode: 'percent',
      members: [
        { productId: 'gid://shopify/Product/1' },
        { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
        { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21' },
      ],
      tiers: [{ minQty: 7, percentOff: 4 }],
    }

    await syncDiscountMetafields(discount)

    expect(querySpy).toHaveBeenCalledTimes(2)

    const call1 = querySpy.mock.calls.find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === 'gid://shopify/Product/1')!
    const parsed1 = JSON.parse((call1[1] as { metafields: { value: string }[] }).metafields[0].value)
    expect(parsed1).toEqual({
      discountId: 'disc_1',
      title: 'Mix & Match',
      pricingMode: 'percent',
      tiers: [{ minQty: 7, percentOff: 4 }],
      ownVariantIds: null,
      siblings: [
        { productId: 'gid://shopify/Product/2', title: 'Wet Cat Food – Chicken', handle: 'wet-cat-food', variantId: 'gid://shopify/ProductVariant/20', imageUrl: 'https://x/c.png' },
        { productId: 'gid://shopify/Product/2', title: 'Wet Cat Food – Salmon', handle: 'wet-cat-food', variantId: 'gid://shopify/ProductVariant/21', imageUrl: 'https://x/s.png' },
      ],
    })

    const call2 = querySpy.mock.calls.find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === 'gid://shopify/Product/2')!
    const parsed2 = JSON.parse((call2[1] as { metafields: { value: string }[] }).metafields[0].value)
    expect(parsed2.ownVariantIds).toEqual(['gid://shopify/ProductVariant/20', 'gid://shopify/ProductVariant/21'])
    expect(parsed2.siblings).toEqual([
      { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', variantId: undefined, imageUrl: null },
    ])
  })
})

describe('clearDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes the discount metafield for every unique product', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })

    await clearDiscountMetafields([
      { productId: 'gid://shopify/Product/1' },
      { productId: 'gid://shopify/Product/2' },
      { productId: 'gid://shopify/Product/2' },
    ])

    expect(querySpy).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
nvm use 20.20.2 && npx vitest run tests/lib/product-tiers.test.ts
```

Expected: FAIL — `syncDiscountMetafields`/`clearDiscountMetafields` don't exist.

- [ ] **Step 3: Replace `src/lib/product-tiers.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'
import type { Discount } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'

const NAMESPACE = 'sparkly_product_discounts'

interface DiscountMetafieldSibling {
  productId: string
  title: string
  handle: string
  variantId?: string
  imageUrl: string | null
}

interface DiscountMetafieldValue {
  discountId: string
  title: string
  pricingMode: 'percent' | 'fixed'
  tiers: Discount['tiers']
  /** null = single-variant whole-product member; array = these specific variants of THIS product are members. */
  ownVariantIds: string[] | null
  siblings: DiscountMetafieldSibling[]
}

/**
 * Writes one `discount` metafield per unique product touched by this
 * discount's members. A product with more than one of its own variants in
 * the discount gets ownVariantIds listing exactly which; a single-variant
 * whole-product member gets ownVariantIds: null. siblings has one entry per
 * OTHER member (not per other product) so a sibling product with two
 * variants in the discount produces two distinct rows.
 */
export async function syncDiscountMetafields(discount: Discount): Promise<void> {
  const memberInfo = await getMemberInfo(discount.members)
  const infoByKey = new Map(memberInfo.map((m) => [`${m.productId}::${m.variantId ?? ''}`, m]))
  const uniqueProductIds = [...new Set(discount.members.map((m) => m.productId))]

  await Promise.allSettled(
    uniqueProductIds.map((productId) => {
      const ownMembers = discount.members.filter((m) => m.productId === productId)
      const ownVariantIds = ownMembers.some((m) => m.variantId == null)
        ? null
        : ownMembers.map((m) => m.variantId!)

      const siblings: DiscountMetafieldSibling[] = discount.members
        .filter((m) => m.productId !== productId)
        .map((m) => {
          const info = infoByKey.get(`${m.productId}::${m.variantId ?? ''}`)
          return {
            productId: m.productId,
            title: info?.title ?? '',
            handle: info?.handle ?? '',
            variantId: m.variantId,
            imageUrl: info?.imageUrl ?? null,
          }
        })

      const value: DiscountMetafieldValue = {
        discountId: discount.discountId,
        title: discount.title,
        pricingMode: discount.pricingMode,
        tiers: discount.tiers,
        ownVariantIds,
        siblings,
      }

      return setDiscountMetafield(productId, value)
    }),
  )
}

async function setDiscountMetafield(productId: string, value: DiscountMetafieldValue): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'discount',
          type: 'json',
          value: JSON.stringify(value),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

/** Deletes the `discount` metafield from every unique product in the list. */
export async function clearDiscountMetafields(members: { productId: string }[]): Promise<void> {
  const uniqueProductIds = [...new Set(members.map((m) => m.productId))]

  await Promise.allSettled(
    uniqueProductIds.map(async (productId) => {
      const data = await shopifyQuery<{
        metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
      }>(
        `mutation deleteDiscountMetafield($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
        {
          metafields: [{ ownerId: productId, namespace: NAMESPACE, key: 'discount' }],
        },
      )

      if (data.metafieldsDelete.userErrors.length > 0) {
        throw new Error(data.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
      }
    }),
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
nvm use 20.20.2 && npx vitest run tests/lib/product-tiers.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-tiers.ts tests/lib/product-tiers.test.ts
git commit -m "Sync one unified 'discount' metafield instead of separate tiers/group keys"
```

---

### Task 4: Unified discount actions

**Files:**
- Modify: `src/actions/discountActions.ts`
- Test: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `Discount`, `DiscountMember`, `Config`, `getConfig`, `saveConfig`, `isProductAvailable`, `pricesUniform` (Task 1); `getMemberInfo` (Task 2); `syncDiscountMetafields`, `clearDiscountMetafields` (Task 3)
- Produces:
  ```ts
  function createDiscount(formData: FormData): Promise<void>
  function updateDiscountMembers(discountId: string, formData: FormData): Promise<void>
  function updateDiscountTiers(discountId: string, formData: FormData): Promise<void>
  function updateDiscountTitle(discountId: string, formData: FormData): Promise<void>
  function setDiscountStatus(discountId: string, status: 'draft' | 'live'): Promise<void>
  function deleteDiscount(discountId: string): Promise<void>
  ```
  Form field convention: `member-{i}-productId`, `member-{i}-variantId` (may be blank), `name`, `title`, `pricingMode`, `tier-{i}-minQty`, `tier-{i}-percentOff`, `tier-{i}-anchorPrice`, `tier-{i}-fixedPrice` (same tier-row convention as today).

- [ ] **Step 1: Write the failing tests**

Replace `tests/actions/discountActions.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createDiscount, updateDiscountMembers, updateDiscountTiers, updateDiscountTitle, setDiscountStatus, deleteDiscount,
} from '@/actions/discountActions'
import * as configLib from '@/lib/config'
import * as authRedirect from '@/lib/auth-redirect'
import * as productTiers from '@/lib/product-tiers'
import * as products from '@/lib/products'
import type { Config, Discount } from '@/lib/config'

vi.mock('@/lib/auth-redirect', () => ({ redirectWithToken: vi.fn() }))

function memberFormData(members: { productId: string; variantId?: string }[], extra: Record<string, string> = {}) {
  const fd = new FormData()
  members.forEach((m, i) => {
    fd.set(`member-${i}-productId`, m.productId)
    if (m.variantId) fd.set(`member-${i}-variantId`, m.variantId)
  })
  Object.entries(extra).forEach(([k, v]) => fd.set(k, v))
  return fd
}

describe('createDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('creates a single-member discount with parsed tiers', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }],
      { name: 'Tuna Soup', title: 'Tuna Soup', 'tier-0-minQty': '5', 'tier-0-percentOff': '10' },
    )

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [{
        discountId: expect.stringMatching(/^disc_/),
        name: 'Tuna Soup', title: 'Tuna Soup', status: 'draft', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/1' }],
        tiers: [{ minQty: 5, percentOff: 10 }],
      }],
    })
    expect(authRedirect.redirectWithToken).toHaveBeenCalledWith(expect.stringMatching(/^\/discounts\/disc_/))
  })

  it('creates a multi-member discount mixing a whole product and a specific variant', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Wet Cat Food – Chicken', price: 1.49, handle: 'wet-cat-food', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }],
      { name: 'Mix', title: 'Mix', 'tier-0-minQty': '7', 'tier-0-percentOff': '4' },
    )

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      discounts: [expect.objectContaining({
        members: [
          { productId: 'gid://shopify/Product/1' },
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
        ],
      })],
    }))
  })

  it('rejects fixedPrice tiers when members have different prices', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      { name: 'Mix', title: 'Mix', pricingMode: 'fixed', 'tier-0-minQty': '3', 'tier-0-fixedPrice': '1.20' },
    )

    await expect(createDiscount(formData)).rejects.toThrow(/different prices/)
  })

  it('rejects an anchorPrice tier when members have different prices', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      { name: 'Mix', title: 'Mix', 'tier-0-minQty': '7', 'tier-0-percentOff': '4', 'tier-0-anchorPrice': '10' },
    )

    await expect(createDiscount(formData)).rejects.toThrow(/different prices/)
  })

  it('allows plain percent tiers (no anchor) when members have different prices', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      { name: 'Mix', title: 'Mix', 'tier-0-minQty': '7', 'tier-0-percentOff': '4' },
    )

    await createDiscount(formData)
    expect(saveSpy).toHaveBeenCalled()
  })

  it('rejects when a member is already claimed by another discount', async () => {
    const existing: Config = {
      discounts: [{
        discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
      }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue(existing)
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }],
      { name: 'Dup', title: 'Dup', 'tier-0-minQty': '5', 'tier-0-percentOff': '10' },
    )

    await expect(createDiscount(formData)).rejects.toThrow(/already/)
  })
})

describe('setDiscountStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('syncs metafields when going live', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncDiscountMetafields').mockResolvedValue()

    await setDiscountStatus('disc_1', 'live')

    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({ discountId: 'disc_1', status: 'live' }))
  })

  it('clears metafields when taken offline', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'live', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const clearSpy = vi.spyOn(productTiers, 'clearDiscountMetafields').mockResolvedValue()

    await setDiscountStatus('disc_1', 'draft')

    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
  })
})

describe('deleteDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes the discount and clears its metafields', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'live', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const clearSpy = vi.spyOn(productTiers, 'clearDiscountMetafields').mockResolvedValue()

    await deleteDiscount('disc_1')

    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
nvm use 20.20.2 && npx vitest run tests/actions/discountActions.test.ts
```

Expected: FAIL — none of the new exports exist yet.

- [ ] **Step 3: Replace `src/actions/discountActions.ts`**

```ts
'use server'

import { getConfig, saveConfig, isProductAvailable, pricesUniform, type Tier, type Discount, type DiscountMember } from '@/lib/config'
import { redirectWithToken } from '@/lib/auth-redirect'
import { syncDiscountMetafields, clearDiscountMetafields } from '@/lib/product-tiers'
import { getMemberInfo } from '@/lib/products'

function parseTiersFromForm(formData: FormData, pricingMode: 'percent' | 'fixed'): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    if (minQty > 0) {
      if (pricingMode === 'fixed') {
        const rawFixedPrice = formData.get(`tier-${i}-fixedPrice`)
        const fixedPrice = Math.round(Number(rawFixedPrice) * 100) / 100
        if (fixedPrice > 0) {
          tiers.push({ minQty, fixedPrice })
        }
      } else {
        const rawPercentOff = Number(formData.get(`tier-${i}-percentOff`))
        const percentOff = Math.round(rawPercentOff * 10) / 10
        if (percentOff >= 0) {
          const tier: Tier = { minQty, percentOff }
          const rawAnchorPrice = formData.get(`tier-${i}-anchorPrice`)
          if (rawAnchorPrice != null && String(rawAnchorPrice).trim() !== '') {
            const anchorPrice = Math.round(Number(rawAnchorPrice) * 100) / 100
            if (anchorPrice > 0) tier.anchorPrice = anchorPrice
          }
          tiers.push(tier)
        }
      }
    }
    i++
  }
  return tiers.sort((a, b) => a.minQty - b.minQty)
}

function parseMembersFromForm(formData: FormData): DiscountMember[] {
  const members: DiscountMember[] = []
  let i = 0
  while (formData.has(`member-${i}-productId`)) {
    const productId = String(formData.get(`member-${i}-productId`) ?? '').trim()
    const rawVariantId = String(formData.get(`member-${i}-variantId`) ?? '').trim()
    if (productId) {
      members.push(rawVariantId ? { productId, variantId: rawVariantId } : { productId })
    }
    i++
  }
  return members
}

/**
 * Throws if the requested pricing mode/tiers require a shared member price
 * that the resolved members don't actually have. Called before saving on
 * both create and every edit path that can change members or tiers.
 */
async function assertPricingAllowed(members: DiscountMember[], pricingMode: 'percent' | 'fixed', tiers: Tier[]): Promise<void> {
  const info = await getMemberInfo(members)
  const uniform = pricesUniform(info.map((m) => m.price))
  if (uniform) return

  if (pricingMode === 'fixed') {
    throw new Error('These products/variants have different prices — fixed-price tiers require a shared price. Use percentage tiers instead, or remove the mismatched member.')
  }
  if (tiers.some((t) => t.anchorPrice != null)) {
    throw new Error('These products/variants have different prices — anchor pricing requires a shared price. Remove the anchor price on your tiers, or remove the mismatched member.')
  }
}

async function assertMembersAvailable(members: DiscountMember[], excludeDiscountId?: string): Promise<void> {
  const config = await getConfig()
  for (const member of members) {
    if (!isProductAvailable(config, member.productId, member.variantId, excludeDiscountId)) {
      throw new Error(`${member.productId}${member.variantId ? ` (variant ${member.variantId})` : ''} already belongs to another discount`)
    }
  }
}

export async function createDiscount(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('A name is required')

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const members = parseMembersFromForm(formData)
  if (members.length === 0) throw new Error('At least one product or variant is required')

  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const tiers = parseTiersFromForm(formData, pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  await assertMembersAvailable(members)
  await assertPricingAllowed(members, pricingMode, tiers)

  const config = await getConfig()
  const discountId = `disc_${crypto.randomUUID()}`
  const newDiscount: Discount = { discountId, name, title, status: 'draft', pricingMode, members, tiers }
  await saveConfig({ discounts: [...config.discounts, newDiscount] })

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

function findDiscountOrThrow(config: { discounts: Discount[] }, discountId: string): Discount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Discount ${discountId} not found`)
  return discount
}

export async function updateDiscountMembers(discountId: string, formData: FormData): Promise<void> {
  const members = parseMembersFromForm(formData)
  if (members.length === 0) throw new Error('At least one product or variant is required')

  await assertMembersAvailable(members, discountId)

  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  await assertPricingAllowed(members, discount.pricingMode, discount.tiers)

  discount.members = members
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncDiscountMetafields(discount)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function updateDiscountTiers(discountId: string, formData: FormData): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const tiers = parseTiersFromForm(formData, discount.pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  await assertPricingAllowed(discount.members, discount.pricingMode, tiers)

  discount.tiers = tiers
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncDiscountMetafields(discount)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function updateDiscountTitle(discountId: string, formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  discount.title = title
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncDiscountMetafields(discount)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function setDiscountStatus(discountId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  discount.status = status
  await saveConfig(config)

  if (status === 'live') {
    await syncDiscountMetafields(discount)
  } else {
    await clearDiscountMetafields(discount.members)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function deleteDiscount(discountId: string): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveConfig({ discounts: remaining })

  await clearDiscountMetafields(discount.members)

  await redirectWithToken('/')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
nvm use 20.20.2 && npx vitest run tests/actions/discountActions.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Delete the old group-specific action file and its test**

```bash
git rm src/actions/groupProductActions.ts tests/actions/groupProductActions.test.ts
```

(Task 5 replaces this file's functionality with `memberPickerActions.ts`.)

- [ ] **Step 6: Commit**

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts
git commit -m "Replace product/group discount actions with unified create/update/delete"
```

---

### Task 5: Member picker server actions

**Files:**
- Create: `src/actions/memberPickerActions.ts`
- Test: `tests/actions/memberPickerActions.test.ts`

**Interfaces:**
- Consumes: `searchProducts`, `getProductVariantOptions` (Task 2); `getConfig`, `isProductAvailable`, `pricesUniform` (Task 1)
- Produces:
  ```ts
  function searchProductsAction(query: string): Promise<ProductSearchResult[]>
  function getProductVariantsAction(productId: string): Promise<ProductVariantOption[]>
  type AddMemberResult = { ok: true } | { ok: false; error: string }
  function validateMemberAction(productId: string, variantId: string | undefined, excludeDiscountId?: string): Promise<AddMemberResult>
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/memberPickerActions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProductsAction, getProductVariantsAction, validateMemberAction } from '@/actions/memberPickerActions'
import * as products from '@/lib/products'
import * as configLib from '@/lib/config'

describe('searchProductsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(products, 'searchProducts').mockRejectedValue(new Error('boom'))
    expect(await searchProductsAction('tuna')).toEqual([])
  })

  it('passes through the search results on success', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    expect(await searchProductsAction('tuna')).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
  })
})

describe('getProductVariantsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(products, 'getProductVariantOptions').mockRejectedValue(new Error('boom'))
    expect(await getProductVariantsAction('gid://shopify/Product/1')).toEqual([])
  })
})

describe('validateMemberAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a product/variant already claimed by another discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })

    const result = await validateMemberAction('gid://shopify/Product/1', undefined)
    expect(result).toEqual({ ok: false, error: 'This product already belongs to another discount' })
  })

  it('allows a product/variant that is free', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })

    expect(await validateMemberAction('gid://shopify/Product/1', undefined)).toEqual({ ok: true })
  })

  it('excludes the discount being edited', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })

    expect(await validateMemberAction('gid://shopify/Product/1', undefined, 'disc_1')).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
nvm use 20.20.2 && npx vitest run tests/actions/memberPickerActions.test.ts
```

Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Create `src/actions/memberPickerActions.ts`**

```ts
'use server'

import { searchProducts, getProductVariantOptions, type ProductSearchResult, type ProductVariantOption } from '@/lib/products'
import { getConfig, isProductAvailable } from '@/lib/config'

/** Backs the picker's search box. Swallows errors — fires on every debounced keystroke. */
export async function searchProductsAction(query: string): Promise<ProductSearchResult[]> {
  try {
    return await searchProducts(query)
  } catch (err) {
    console.error('[searchProductsAction] search failed:', err)
    return []
  }
}

/** Backs the picker's "select specific variants" expansion for a multi-variant product. */
export async function getProductVariantsAction(productId: string): Promise<ProductVariantOption[]> {
  try {
    return await getProductVariantOptions(productId)
  } catch (err) {
    console.error('[getProductVariantsAction] lookup failed:', err)
    return []
  }
}

export type AddMemberResult = { ok: true } | { ok: false; error: string }

/**
 * Validates a candidate (product, variant) before it's added in the UI:
 * must not already belong to a different discount. excludeDiscountId lets
 * an in-progress edit re-validate without flagging its own current
 * members. Price-uniformity is checked separately, after the full member
 * set is known — see updateAvailablePricingModesAction.
 */
export async function validateMemberAction(
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): Promise<AddMemberResult> {
  const config = await getConfig()
  if (!isProductAvailable(config, productId, variantId, excludeDiscountId)) {
    return {
      ok: false,
      error: variantId
        ? 'This variant already belongs to another discount'
        : 'This product already belongs to another discount',
    }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
nvm use 20.20.2 && npx vitest run tests/actions/memberPickerActions.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/actions/memberPickerActions.ts tests/actions/memberPickerActions.test.ts
git commit -m "Add member picker server actions (search, variant listing, availability check)"
```

---

### Task 6: Pricing-mode-aware tier field components

**Files:**
- Modify: `src/components/TierFields.tsx`
- Modify: `src/components/PricingModeTierFields.tsx`

**Interfaces:**
- Produces:
  ```tsx
  <TierFields initial={...} allowAnchorPrice={boolean} />
  <PricingModeTierFields allowPriceBasedModes={boolean} initial={{ mode: 'percent' | 'fixed', tiers: ... }} />
  ```

No new test file — these are presentational client components whose only conditional logic (hide a field/radio when a prop is false) is exercised by the pages that use them in Task 8's manual verification step; this repo has no existing component-level test harness (no `@testing-library/react` in `package.json`), so this task follows that established convention rather than introducing one.

- [ ] **Step 1: Add `allowAnchorPrice` to `TierFields`**

In `src/components/TierFields.tsx`, change the export signature and conditionally render the anchor-price input:

```tsx
export default function TierFields({
  initial,
  allowAnchorPrice = true,
}: {
  initial?: { minQty: number; percentOff: number; anchorPrice?: number }[]
  allowAnchorPrice?: boolean
}) {
```

Wrap the existing anchor-price `<label>`/`<input>` pair (the block for `tier-${i}-anchorPrice`) in `{allowAnchorPrice && (...)}`.

- [ ] **Step 2: Add `allowPriceBasedModes` to `PricingModeTierFields`**

Replace `src/components/PricingModeTierFields.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import TierFields from '@/components/TierFields'
import FixedPriceTierFields from '@/components/FixedPriceTierFields'

export default function PricingModeTierFields({
  allowPriceBasedModes,
  initial,
}: {
  allowPriceBasedModes: boolean
  initial?: {
    percentTiers?: { minQty: number; percentOff: number; anchorPrice?: number }[]
    fixedTiers?: { minQty: number; fixedPrice: number }[]
    startMode?: 'percent' | 'fixed'
  }
}) {
  const [mode, setMode] = useState<'percent' | 'fixed'>(
    allowPriceBasedModes ? (initial?.startMode ?? 'percent') : 'percent',
  )

  // If membership changes after mount (e.g. the picker adds a
  // differently-priced member) and fixed mode is no longer valid, fall
  // back to percent rather than leaving an invalid mode selected.
  useEffect(() => {
    if (!allowPriceBasedModes && mode === 'fixed') setMode('percent')
  }, [allowPriceBasedModes, mode])

  return (
    <div className="space-y-4">
      {!allowPriceBasedModes && (
        <p className="text-xs text-muted">
          These products/variants have different prices, so only a percentage discount is available.
        </p>
      )}

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="pricingMode"
            value="percent"
            checked={mode === 'percent'}
            onChange={() => setMode('percent')}
          />
          Percentage off
        </label>
        {allowPriceBasedModes && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="pricingMode"
              value="fixed"
              checked={mode === 'fixed'}
              onChange={() => setMode('fixed')}
            />
            Fixed price
          </label>
        )}
      </div>

      {mode === 'percent' ? (
        <>
          <TierFields initial={initial?.percentTiers} allowAnchorPrice={allowPriceBasedModes} />
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price before you go live.
          </p>
        </>
      ) : (
        <>
          <FixedPriceTierFields initial={initial?.fixedTiers} />
          <p className="text-xs text-muted mt-2">
            Enter the exact price each customer pays per unit at that
            quantity — no percentage math needed.
          </p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Confirm the two edited files themselves are syntactically and type-correct in isolation**

```bash
nvm use 20.20.2 && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "TierFields\.tsx|PricingModeTierFields\.tsx"
```

Expected: no output (no errors reported against these two files' own code). A full `npm run build` is NOT the right check here and will show errors — every current call site (`src/app/discounts/new/page.tsx`, `src/app/discounts/groups/new/page.tsx`, and the two edit pages) still calls the old prop-less signature, and three of those four files are replaced or deleted by Task 8, not "two ... until Task 8 lands." That is expected and not a regression to fix in this task; Task 8's own build-verification step (Task 8 Step 6) is the real gate once every call site is rewired or removed.

- [ ] **Step 4: Commit**

```bash
git add src/components/TierFields.tsx src/components/PricingModeTierFields.tsx
git commit -m "Gate fixed-price/anchor-price tier options on shared-price members"
```

---

### Task 7: Unified member picker component

**Files:**
- Create: `src/components/MemberPicker.tsx`
- Delete: `src/components/ProductPicker.tsx`, `src/components/GroupProductPicker.tsx`

**Interfaces:**
- Consumes: `searchProductsAction`, `getProductVariantsAction`, `validateMemberAction` (Task 5); `MemberInfo` shape (Task 2, for `initialMembers`)
- Produces:
  ```tsx
  <MemberPicker
    initialMembers={{ productId: string; variantId?: string; title: string; price: number }[]}
    excludeDiscountId={string | undefined}
    onPricesChange={(prices: number[]) => void}
  />
  ```
  Renders one `<input type="hidden" name="member-{i}-productId">` (+ `variantId` when set) per selected member — same form-field convention `discountActions.ts` (Task 4) already parses.

No new test file, for the same reason as Task 6 (client-only presentational logic, no existing component test harness in this repo).

- [ ] **Step 1: Create `src/components/MemberPicker.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { searchProductsAction, getProductVariantsAction, validateMemberAction } from '@/actions/memberPickerActions'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

export type SelectedMember = { productId: string; variantId?: string; title: string; price: number }

export default function MemberPicker({
  initialMembers,
  excludeDiscountId,
  onPricesChange,
}: {
  initialMembers?: SelectedMember[]
  excludeDiscountId?: string
  onPricesChange?: (prices: number[]) => void
}) {
  const [selected, setSelected] = useState<SelectedMember[]>(initialMembers ?? [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanding, setExpanding] = useState<ProductSearchResult | null>(null)
  const [variantOptions, setVariantOptions] = useState<ProductVariantOption[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  function notifyPrices(members: SelectedMember[]) {
    onPricesChange?.(members.map((m) => m.price))
  }

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

  async function addWholeProduct(candidate: ProductSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setError(null)

    if (candidate.variantCount > 1) {
      const options = await getProductVariantsAction(candidate.id)
      setExpanding(candidate)
      setVariantOptions(options)
      return
    }

    const check = await validateMemberAction(candidate.id, undefined, excludeDiscountId)
    if (!check.ok) {
      setError(check.error)
      return
    }

    // Single-variant product: its own one variant IS the price we need,
    // but this component only has the product's title/id from search —
    // the price comes from the variant list too, so fetch it the same way.
    const [onlyVariant] = await getProductVariantsAction(candidate.id)
    const member: SelectedMember = { productId: candidate.id, title: candidate.title, price: onlyVariant?.price ?? 0 }
    const next = [...selected, member]
    setSelected(next)
    notifyPrices(next)
  }

  async function addVariant(option: ProductVariantOption) {
    if (!expanding) return
    const check = await validateMemberAction(expanding.id, option.variantId, excludeDiscountId)
    if (!check.ok) {
      setError(check.error)
      return
    }
    const member: SelectedMember = {
      productId: expanding.id,
      variantId: option.variantId,
      title: `${expanding.title} – ${option.title}`,
      price: option.price,
    }
    const next = [...selected, member]
    setSelected(next)
    notifyPrices(next)
    setExpanding(null)
    setVariantOptions([])
  }

  function removeMember(index: number) {
    const next = selected.filter((_, i) => i !== index)
    setSelected(next)
    notifyPrices(next)
  }

  return (
    <div>
      {selected.map((m, i) => (
        <div key={`${m.productId}-${m.variantId ?? ''}`} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <input type="hidden" name={`member-${i}-productId`} value={m.productId} />
          {m.variantId && <input type="hidden" name={`member-${i}-variantId`} value={m.variantId} />}
          <span className="text-sm truncate">
            {m.title} — £{m.price.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={() => removeMember(i)}
            aria-label={`Remove ${m.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      {expanding && (
        <div className="border border-line rounded p-3 mb-2 space-y-2">
          <p className="text-sm font-medium">{expanding.title} — select variant(s):</p>
          {variantOptions.map((option) => (
            <button
              key={option.variantId}
              type="button"
              onClick={() => addVariant(option)}
              className="w-full text-left px-3 py-2 border border-line rounded hover:bg-line transition-colors duration-200 text-sm"
            >
              {option.title} — £{option.price.toFixed(2)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setExpanding(null); setVariantOptions([]) }}
            className="text-xs text-muted hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="relative">
        <label htmlFor="member-search" className="sr-only">
          Search for a product to add
        </label>
        <input
          id="member-search"
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
                  onMouseDown={() => addWholeProduct(product)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {product.title}
                  {product.variantCount > 1 && <span className="text-muted"> ({product.variantCount} variants)</span>}
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

- [ ] **Step 2: Delete the two components this replaces**

```bash
git rm src/components/ProductPicker.tsx src/components/GroupProductPicker.tsx
```

(Task 8 removes their remaining import sites when it rewrites the pages.)

- [ ] **Step 3: Commit**

```bash
git add src/components/MemberPicker.tsx
git commit -m "Add unified member picker supporting whole products and specific variants"
```

---

### Task 8: Unified admin pages

**Files:**
- Create: `src/app/discounts/[discountId]/page.tsx`
- Modify: `src/app/discounts/new/page.tsx`
- Modify: `src/app/page.tsx`
- Delete: `src/app/discounts/[productId]/page.tsx`, `src/app/discounts/groups/[groupId]/page.tsx`, `src/app/discounts/groups/new/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–7.

- [ ] **Step 1: Replace `src/app/discounts/new/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { createDiscount } from '@/actions/discountActions'
import { pricesUniform } from '@/lib/config'
import MemberPicker from '@/components/MemberPicker'
import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function NewDiscountPage() {
  const [prices, setPrices] = useState<number[]>([])
  const allowPriceBasedModes = pricesUniform(prices)

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add discount</h1>

      <form action={createDiscount} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            Internal name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Canagan Tuna Soup"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Only shown in this admin.</p>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Canagan Tuna Soup"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the storefront widget's promo text.</p>
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Products / variants</p>
          <MemberPicker onPricesChange={setPrices} />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <PricingModeTierFields allowPriceBasedModes={allowPriceBasedModes} />
        </div>

        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Create draft discount
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Create `src/app/discounts/[discountId]/page.tsx`**

```tsx
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig, pricesUniform } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import { resultingPrice, totalAtThreshold, clampedFixedPrice, totalAtThresholdFixed } from '@/lib/tier-math'
import { updateDiscountMembers, updateDiscountTiers, updateDiscountTitle, setDiscountStatus, deleteDiscount } from '@/actions/discountActions'
import MemberPicker from '@/components/MemberPicker'
import PricingModeTierFieldsClient from './PricingModeTierFieldsClient'
import ConfirmForm from '@/components/ConfirmForm'
import AuthLink from '@/components/AuthLink'

export default async function DiscountPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  const { discountId: encodedDiscountId } = await params
  const discountId = decodeURIComponent(encodedDiscountId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getConfig()
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) notFound()

  const memberInfo = await getMemberInfo(discount.members)
  const sharedPrice = memberInfo[0]?.price ?? 0

  const updateMembersWithId = updateDiscountMembers.bind(null, discountId)
  const updateTiersWithId = updateDiscountTiers.bind(null, discountId)
  const updateTitleWithId = updateDiscountTitle.bind(null, discountId)
  const goLive = setDiscountStatus.bind(null, discountId, 'live')
  const goDraft = setDiscountStatus.bind(null, discountId, 'draft')
  const remove = deleteDiscount.bind(null, discountId)

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <AuthLink
        href="/"
        token={token}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
      >
        ← Back to discounts
      </AuthLink>

      <h1 className="text-2xl font-semibold mb-2">{discount.name}</h1>
      <p className="text-sm text-muted mb-6">
        {discount.status} · {discount.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'}
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Title</h2>
        <form action={updateTitleWithId} className="space-y-2">
          <div className="flex gap-2">
            <label htmlFor="title" className="sr-only">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={discount.title}
              className="flex-1 border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
            <button
              type="submit"
              className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Save title
            </button>
          </div>
          <p className="text-xs text-muted mt-2">Shown to customers in the storefront widget's promo text.</p>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Products / variants</h2>
        <form action={updateMembersWithId} className="space-y-3">
          <MemberPicker
            initialMembers={memberInfo.map((m) => ({ productId: m.productId, variantId: m.variantId, title: m.title, price: m.price }))}
            excludeDiscountId={discountId}
          />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save products / variants
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <form action={updateTiersWithId} className="space-y-3">
          <PricingModeTierFieldsClient
            currentPricingMode={discount.pricingMode}
            allowPriceBasedModes={pricesUniform(memberInfo.map((m) => m.price))}
            percentTiers={discount.tiers.map((t) => ({ minQty: t.minQty, percentOff: t.percentOff ?? 0, anchorPrice: t.anchorPrice }))}
            fixedTiers={discount.tiers.map((t) => ({ minQty: t.minQty, fixedPrice: t.fixedPrice ?? 0 }))}
          />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {memberInfo.length > 0 && discount.pricingMode === 'fixed' && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting prices</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-1">Min qty</th>
                <th className="py-1">Price each</th>
                <th className="py-1">Total at min qty</th>
              </tr>
            </thead>
            <tbody>
              {discount.tiers.map((tier) => (
                <tr key={tier.minQty} className="border-b border-line">
                  <td className="py-1">{tier.minQty}+</td>
                  <td className="py-1">£{clampedFixedPrice(sharedPrice, tier.fixedPrice ?? 0).toFixed(2)}</td>
                  <td className="py-1">
                    £{totalAtThresholdFixed(sharedPrice, { minQty: tier.minQty, fixedPrice: tier.fixedPrice ?? 0 }).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {memberInfo.length > 0 && discount.pricingMode === 'percent' && (
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
              {discount.tiers.map((tier) => (
                <tr key={tier.minQty} className="border-b border-line">
                  <td className="py-1">{tier.minQty}+</td>
                  <td className="py-1">{tier.percentOff}%</td>
                  <td className="py-1">£{resultingPrice(sharedPrice, tier.percentOff ?? 0).toFixed(2)}</td>
                  <td className="py-1">
                    £{totalAtThreshold(sharedPrice, { minQty: tier.minQty, percentOff: tier.percentOff ?? 0, anchorPrice: tier.anchorPrice }).toFixed(2)}
                    {tier.anchorPrice != null && <span className="text-muted text-xs"> (anchored)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex gap-3">
        {discount.status === 'draft' ? (
          <ConfirmForm
            action={goLive}
            confirmMessage={`Go live with this discount? This creates a real, active discount immediately.`}
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
            confirmMessage={`Take this discount offline? It stops applying immediately.`}
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
          confirmMessage={`Delete this discount entirely? This cannot be undone.`}
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

- [ ] **Step 3: Create the small client wrapper `src/app/discounts/[discountId]/PricingModeTierFieldsClient.tsx`**

`PricingModeTierFields` needs `'use client'` and controlled `startMode`, but the parent page above is a Server Component reading `discount.pricingMode` — this thin wrapper bridges the two, matching how `TierFields`/`FixedPriceTierFields` were already invoked conditionally in the old edit pages:

```tsx
'use client'

import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function PricingModeTierFieldsClient({
  currentPricingMode,
  allowPriceBasedModes,
  percentTiers,
  fixedTiers,
}: {
  currentPricingMode: 'percent' | 'fixed'
  allowPriceBasedModes: boolean
  percentTiers: { minQty: number; percentOff: number; anchorPrice?: number }[]
  fixedTiers: { minQty: number; fixedPrice: number }[]
}) {
  return (
    <PricingModeTierFields
      allowPriceBasedModes={allowPriceBasedModes}
      initial={{ percentTiers, fixedTiers, startMode: currentPricingMode }}
    />
  )
}
```

- [ ] **Step 4: Update `src/app/page.tsx` to list `discounts` instead of `products`/`groups`**

```tsx
import { headers } from 'next/headers'
import { getConfig } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import AuthLink from '@/components/AuthLink'

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const rows = await Promise.all(
    config.discounts.map(async (d) => {
      const memberInfo = await getMemberInfo(d.members)
      return { ...d, memberTitles: memberInfo.map((m) => m.title) }
    }),
  )

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Discounts</h1>
        <AuthLink
          href="/discounts/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add discount
        </AuthLink>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">No discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.discountId} className="py-4">
              <AuthLink
                href={`/discounts/${encodeURIComponent(row.discountId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.name}
              </AuthLink>
              <p className="text-sm text-muted">
                {row.status} · {row.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {row.memberTitles.join(', ') || 'no members resolved'} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Delete the old separate pages**

```bash
git rm -r src/app/discounts/\[productId\] src/app/discounts/groups
```

- [ ] **Step 6: Verify the build succeeds**

```bash
nvm use 20.20.2 && npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Replace separate product/group admin pages with one unified discount flow"
```

---

### Task 9: Liquid template — one metafield, variant eligibility

**Files:**
- Modify: `extensions/product-tier-pricing/blocks/tier-pricing.liquid`

- [ ] **Step 1: Replace the metafield-reading section**

Replace everything from the top through the opening `<div ... data-sparkly-tier-pricing ...>` attributes with:

```liquid
{% comment %}
  This block replaces the theme's native Buy Buttons price line (its
  "Show price" setting must be turned off in the theme editor). It always
  renders a price — a live-updating tiered price when
  product.metafields.sparkly_product_discounts.discount is present AND the
  currently-selected variant is one of its members, or a plain price
  otherwise.
{% endcomment %}
{%- assign discount_metafield = product.metafields.sparkly_product_discounts.discount -%}
{%- assign selected_variant_id = product.selected_or_first_available_variant.id | prepend: 'gid://shopify/ProductVariant/' -%}
{%- assign own_variant_ids = discount_metafield.value.ownVariantIds -%}
{%- assign variant_is_eligible = true -%}
{%- if discount_metafield != blank and own_variant_ids != blank -%}
  {%- assign variant_is_eligible = false -%}
  {%- for id in own_variant_ids -%}
    {%- if id == selected_variant_id -%}
      {%- assign variant_is_eligible = true -%}
    {%- endif -%}
  {%- endfor -%}
{%- endif -%}
{%- assign discount_json = '{"tiers":[]}' -%}
{%- if discount_metafield != blank and variant_is_eligible -%}
  {%- capture siblings_json -%}
    [
    {%- for sibling in discount_metafield.value.siblings -%}
      {
        "productId": {{ sibling.productId | json }},
        "title": {{ sibling.title | json }},
        "handle": {{ sibling.handle | json }},
        "variantId": {{ sibling.variantId | default: null | json }},
        "imageUrl": {{ sibling.imageUrl | default: null | json }}
      }{%- unless forloop.last -%},{%- endunless -%}
    {%- endfor -%}
    ]
  {%- endcapture -%}
  {%- capture discount_json_raw -%}
    {
      "title": {{ discount_metafield.value.title | json }},
      "tiers": {{ discount_metafield.value.tiers | json }},
      "siblings": {{ siblings_json }},
      "selfVariantId": {{ selected_variant_id | json }}
    }
  {%- endcapture -%}
  {%- assign discount_json = discount_json_raw | strip | escape -%}
{%- endif -%}
<div
  id="sparkly-tier-pricing-{{ block.id }}"
  class="sparkly-tier-pricing"
  data-sparkly-tier-pricing
  data-discount='{{ discount_json }}'
  data-product-handle='{{ product.handle | json | escape }}'
  data-product-id='{{ product.id | prepend: "gid://shopify/Product/" | json }}'
  data-base-price="{{ product.selected_or_first_available_variant.price | divided_by: 100.0 | json }}"
  data-compare-at-price="{{ product.selected_or_first_available_variant.compare_at_price | default: 0 | divided_by: 100.0 | json }}"
  data-money-format='{{ shop.money_format | json | escape }}'
  style="--sparkly-tier-price-font-size: {{ block.settings.price_font_size }}px; --sparkly-tier-moss: {{ block.settings.moss_color }}; --sparkly-tier-cream: {{ block.settings.cream_color }}; --sparkly-tier-sun: {{ block.settings.sun_color }};"
>
```

- [ ] **Step 2: Remove the now-obsolete `discount_tiers`/`discount_title` assigns and the promo `<p>`'s gating**

Replace:

```liquid
  {%- assign discount_tiers = tiers_metafield.value.tiers -%}
  {%- if group_metafield != blank -%}
    {%- assign discount_tiers = group_metafield.value.tiers -%}
  {%- endif -%}

  {%- if discount_tiers.size > 0 -%}
    {%- comment -%} Empty mount point — JS (buildPromoText) owns the wording,
      same as breakdownEl/fillEl/stopsEl below, so there's exactly one place
      that generates this copy instead of two implementations to keep in
      sync. {%- endcomment -%}
    <p class="sparkly-tier-pricing__promo" data-tier-pricing-promo></p>
  {%- endif -%}
```

with:

```liquid
  {%- if discount_metafield != blank and variant_is_eligible -%}
    {%- comment -%} Empty mount point — JS (buildPromoText) owns the wording. {%- endcomment -%}
    <p class="sparkly-tier-pricing__promo" data-tier-pricing-promo></p>
  {%- endif -%}
```

- [ ] **Step 3: Update the "mix & match products" toggle's gating**

Replace `{%- if group_metafield != blank -%}` (guarding the `<button data-tier-pricing-toggle>`/`<div data-tier-pricing-list>` block near the bottom) with `{%- if discount_metafield != blank and variant_is_eligible and discount_metafield.value.siblings.size > 0 -%}`.

- [ ] **Step 4: Commit**

```bash
git add extensions/product-tier-pricing/blocks/tier-pricing.liquid
git commit -m "Read the unified discount metafield and gate on variant eligibility"
```

---

### Task 10: Storefront JS — unified config, variant eligibility, variant-aware cart matching

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`
- Test: `extensions/product-tier-pricing-tests/tier-pricing.test.js`

**Interfaces:**
- Produces (new/changed pure functions, exported the same way every other pure function in this file already is):
  ```js
  function extractNumericId(gid) // 'gid://shopify/ProductVariant/123' -> '123'
  function sumMemberQuantityInCart(cartItems, members) // members: {productId?, variantId?}[] using numeric ids already extracted by the caller
  ```

- [ ] **Step 1: Write the failing tests for the new pure functions**

Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js` (after the existing `sumGroupQuantityInCart` tests — search for that describe block to place these alongside it):

```js
test('extractNumericId: pulls the trailing numeric id off a GID', () => {
  assert.equal(extractNumericId('gid://shopify/ProductVariant/123456'), '123456')
})

test('extractNumericId: passes through a value that is already a plain numeric id', () => {
  assert.equal(extractNumericId('123456'), '123456')
})

test('sumMemberQuantityInCart: whole-product member matches any variant of that product', () => {
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 3 },
    { product_id: 1, variant_id: 11, quantity: 2 },
    { product_id: 2, variant_id: 20, quantity: 1 },
  ]
  const total = sumMemberQuantityInCart(cartItems, [{ productId: '1' }])
  assert.equal(total, 5)
})

test('sumMemberQuantityInCart: variant-scoped member matches only that exact variant', () => {
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 3 },
    { product_id: 1, variant_id: 11, quantity: 2 },
  ]
  const total = sumMemberQuantityInCart(cartItems, [{ productId: '1', variantId: '10' }])
  assert.equal(total, 3)
})

test('sumMemberQuantityInCart: sums across multiple members, mixing whole-product and variant-scoped', () => {
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 3 },
    { product_id: 2, variant_id: 20, quantity: 4 },
    { product_id: 2, variant_id: 21, quantity: 1 },
  ]
  const total = sumMemberQuantityInCart(cartItems, [{ productId: '1' }, { productId: '2', variantId: '20' }])
  assert.equal(total, 7)
})
```

Update the destructuring `require` line at the top of the test file to add `extractNumericId, sumMemberQuantityInCart` alongside the existing `sumGroupQuantityInCart` import (keep `sumGroupQuantityInCart` in the import list only if Step 3 below still exports it — it does not; remove it from the destructured import list since Step 3 deletes the function).

- [ ] **Step 2: Run the tests to verify they fail**

```bash
nvm use 22.23.1 && node --test extensions/product-tier-pricing-tests/tier-pricing.test.js
```

Expected: FAIL — `extractNumericId`/`sumMemberQuantityInCart` aren't exported yet.

- [ ] **Step 3: Replace `sumGroupQuantityInCart` with the variant-aware version**

In `extensions/product-tier-pricing/assets/tier-pricing.js`, find:

```js
function sumGroupQuantityInCart(cartItems, handles) {
  return cartItems
    .filter((item) => handles.includes(item.handle))
    .reduce((sum, item) => sum + item.quantity, 0)
}
```

Replace with:

```js
// Cart items (from /cart.js) and cart lines (from the Rust Function) both
// carry Shopify's plain numeric ids; this app's own config stores GIDs
// (gid://shopify/Product/123) end to end for everything else. This is the
// one seam where the two meet.
function extractNumericId(id) {
  const str = String(id)
  const lastSlash = str.lastIndexOf('/')
  return lastSlash === -1 ? str : str.slice(lastSlash + 1)
}

// A member with no variantId matches any of that product's cart lines
// (today's whole-product behavior); a member with a variantId matches only
// that specific variant's lines. Members are pre-normalized to numeric ids
// by the caller (parseWidgetConfig), matching cartItems' own numeric ids.
function sumMemberQuantityInCart(cartItems, members) {
  return cartItems.reduce((sum, item) => {
    const matches = members.some((m) => {
      if (String(item.product_id) !== m.productId) return false
      return m.variantId == null || String(item.variant_id) === m.variantId
    })
    return matches ? sum + item.quantity : sum
  }, 0)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
nvm use 22.23.1 && node --test extensions/product-tier-pricing-tests/tier-pricing.test.js
```

Expected: PASS for the new tests. Other existing tests referencing the old config shape (`parseWidgetConfig`, `computeWidgetViewModel`'s `isGroup`/`title` wiring, `fetchGroupCartState`, `buildMixMatchRows`) now fail — Step 5 fixes those in the same task since they're all one cohesive rewrite of "how the widget reads its config."

- [ ] **Step 5: Rewrite `parseWidgetConfig`, `fetchGroupCartState`, and `buildMixMatchRows` for the unified shape**

Find `parseWidgetConfig`:

```js
function parseWidgetConfig(container) {
  const standaloneData = JSON.parse(container.dataset.tiers)
  const moneyFormat = JSON.parse(container.dataset.moneyFormat)
  const group = JSON.parse(container.dataset.group)
  const productHandle = JSON.parse(container.dataset.productHandle)
  const tiers = withUnitAnchor(group ? group.tiers : standaloneData.tiers)

  return {
    moneyFormat,
    group,
    productHandle,
    tiers,
    title: group ? group.title : standaloneData.title,
    hasTiers: !!(tiers && tiers.length > 0),
    allDiscountHandles: group ? [productHandle].concat(group.siblings.map((s) => s.handle)) : [productHandle],
    mixMatchListItems: group ? [group.self].concat(group.siblings) : [],
  }
}
```

Replace with:

```js
function parseWidgetConfig(container) {
  const discount = JSON.parse(container.dataset.discount)
  const moneyFormat = JSON.parse(container.dataset.moneyFormat)
  const productHandle = JSON.parse(container.dataset.productHandle)
  const productId = JSON.parse(container.dataset.productId)
  const tiers = withUnitAnchor(discount.tiers)

  const selfMember = { productId: extractNumericId(productId), variantId: discount.selfVariantId ? extractNumericId(discount.selfVariantId) : undefined }
  const siblingMembers = (discount.siblings || []).map((s) => ({
    productId: extractNumericId(s.productId),
    variantId: s.variantId ? extractNumericId(s.variantId) : undefined,
  }))

  return {
    moneyFormat,
    productHandle,
    tiers,
    title: discount.title,
    hasTiers: !!(tiers && tiers.length > 0),
    allMembers: [selfMember].concat(siblingMembers),
    mixMatchListItems: discount.siblings || [],
    isGroup: (discount.siblings || []).length > 0,
  }
}
```

This depends on Task 9's `data-product-id` attribute (the product's own GID) and the sibling `productId` field added to `DiscountMetafieldSibling` (Task 3) and the Liquid `siblings_json` capture (Task 9) — both already specified above, not derived from `handle` (a string slug, not a numeric id).

Find `fetchGroupCartState`:

```js
async function fetchGroupCartState(allDiscountHandles, productHandle) {
  const cart = await fetchCart()
  const trueCartQty = sumGroupQuantityInCart(cart.items, allDiscountHandles)
  return {
    otherQty: cartBaselineOtherQty(trueCartQty),
    selfQty: sumGroupQuantityInCart(cart.items, [productHandle]),
    cartItems: cart.items,
  }
}
```

Replace with:

```js
async function fetchGroupCartState(allMembers, selfMember) {
  const cart = await fetchCart()
  const trueCartQty = sumMemberQuantityInCart(cart.items, allMembers)
  return {
    otherQty: cartBaselineOtherQty(trueCartQty),
    selfQty: sumMemberQuantityInCart(cart.items, [selfMember]),
    cartItems: cart.items,
  }
}
```

Find the `createRenderer`/`render` call site (`fetchGroupCartState(config.allDiscountHandles, config.productHandle)`) and update it to `fetchGroupCartState(config.allMembers, config.allMembers[0])` (the self member is always the first entry per `parseWidgetConfig` above).

Find `buildMixMatchRows`:

```js
function buildMixMatchRows(products, cartItems) {
  return products.map((product) => {
    const qty = sumGroupQuantityInCart(cartItems || [], [product.handle])
    return {
      href: '/products/' + product.handle,
      title: product.title,
      imageUrl: product.imageUrl || null,
      qtyLabel: qty === 1 ? '1 in cart' : qty + ' in cart',
    }
  })
}
```

Replace with:

```js
function buildMixMatchRows(products, cartItems) {
  return products.map((product) => {
    const member = { productId: extractNumericId(product.productId), variantId: product.variantId ? extractNumericId(product.variantId) : undefined }
    const qty = sumMemberQuantityInCart(cartItems || [], [member])
    return {
      href: '/products/' + product.handle,
      title: product.title,
      imageUrl: product.imageUrl || null,
      qtyLabel: qty === 1 ? '1 in cart' : qty + ' in cart',
    }
  })
}
```

- [ ] **Step 6: Update `module.exports` and all remaining call sites**

In `module.exports`, remove `sumGroupQuantityInCart` and add `extractNumericId, sumMemberQuantityInCart`.

Search the file for every remaining reference to `config.group`, `config.allDiscountHandles`, `config.productHandle` used as a matching key (not the raw handle for URLs), and `sumGroupQuantityInCart`, and update each call site to the new `config.allMembers`/`sumMemberQuantityInCart` shape — in particular `renderMixMatchList(elements.listEl, config.mixMatchListItems, lastCartItems)` call sites are unaffected (they already pass through `mixMatchListItems`, whose shape `buildMixMatchRows` now expects to include `productId`/`variantId`).

- [ ] **Step 7: Run the full test file and fix any remaining failures**

```bash
nvm use 22.23.1 && node --test extensions/product-tier-pricing-tests/tier-pricing.test.js
```

Update any remaining test in this file that still constructs the old `{ group: ..., standaloneData: ... }` container dataset shape or calls the deleted `sumGroupQuantityInCart` directly — grep the test file for `data-group`, `data-tiers`, and `sumGroupQuantityInCart` to find them all. Expected end state: every test passes against the new `data-discount` shape and `sumMemberQuantityInCart`.

- [ ] **Step 8: Commit**

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing-tests/tier-pricing.test.js
git commit -m "Parse the unified discount config and match cart quantity by variant"
```

---

### Task 11: Rust Function — unified config and variant-aware matching

**Files:**
- Modify: `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`
- Modify: `extensions/product-discount/src/cart_lines_discounts_generate_run.graphql`

**Interfaces:**
- Produces:
  ```rust
  pub struct Member { product_id: String, variant_id: Option<String> }
  pub struct DiscountConfig { status: String, members: Vec<Member>, tiers: Vec<Tier> }
  pub struct Config { discounts: Vec<DiscountConfig> }
  ```

- [ ] **Step 1: Add `id` on the cart line's variant in the GraphQL query**

In `extensions/product-discount/src/cart_lines_discounts_generate_run.graphql`, change:

```graphql
      merchandise {
        __typename
        ... on ProductVariant {
          product {
            id
          }
        }
      }
```

to:

```graphql
      merchandise {
        __typename
        ... on ProductVariant {
          id
          product {
            id
          }
        }
      }
```

- [ ] **Step 2: Replace the config structs**

In `cart_lines_discounts_generate_run.rs`, replace:

```rust
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct ProductConfig {
    product_id: String,
    status: String,
    tiers: Vec<Tier>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct GroupConfig {
    group_id: String,
    status: String,
    product_ids: Vec<String>,
    tiers: Vec<Tier>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    products: Vec<ProductConfig>,
    #[shopify_function(default)]
    groups: Vec<GroupConfig>,
}
```

with:

```rust
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Member {
    product_id: String,
    #[shopify_function(default)]
    variant_id: Option<String>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct DiscountConfig {
    status: String,
    members: Vec<Member>,
    tiers: Vec<Tier>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    discounts: Vec<DiscountConfig>,
}
```

- [ ] **Step 3: Replace the two matching loops with one unified loop**

Replace everything from `let mut candidates = vec![];` through the end of the `for group in config.groups.iter()...` block (i.e. the entire matching section — both the former per-product loop and the former per-group loop) with one loop over `config.discounts`. This generalizes the old "group" logic (aggregate quantity across every matching line, then split) to every discount regardless of member count — a 1-member discount naturally becomes "aggregate across the (usually one) matching line," which is a strict superset of what the old per-product loop did (it also correctly combines quantity if the same product/variant somehow appears as two separate cart lines, which the old per-product loop did not handle):

```rust
    let mut candidates = vec![];

    for discount in config.discounts.iter().filter(|d| d.status == "live") {
        let mut line_ids = vec![];
        let mut line_quantities: Vec<i32> = vec![];
        let mut line_unit_price: Option<f64> = None;

        for line in input.cart().lines().iter() {
            let variant = match line.merchandise() {
                schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
                _ => continue,
            };
            let product_id = variant.product().id();
            let variant_id = variant.id();

            let matches_member = discount.members.iter().any(|m| {
                if &m.product_id != product_id {
                    return false;
                }
                match &m.variant_id {
                    Some(vid) => vid == variant_id,
                    None => true,
                }
            });
            if !matches_member {
                continue;
            }

            let price = line.cost().amount_per_quantity().amount().as_f64();
            // Take the MINIMUM matching line's unit price, not simply the
            // last one seen in cart order — a fail-safe for the case where
            // the shared-price premise a fixed/anchor discount depends on
            // is somehow violated at checkout time (e.g. a differently
            // priced selling plan), even though the admin app only allows
            // fixed/anchor pricing when every member shares one price at
            // save time. Under-discounts rather than computing an
            // arbitrary or inflated total off whichever line happened to
            // be scanned last.
            line_unit_price = Some(match line_unit_price {
                Some(current) => current.min(price),
                None => price,
            });
            line_ids.push(line.id().clone());
            line_quantities.push(*line.quantity());
        }

        if line_ids.is_empty() {
            continue;
        }

        let line_unit_price = line_unit_price.unwrap_or(0.0);
        let total_quantity: i32 = line_quantities.iter().sum();

        let best_tier = discount
            .tiers
            .iter()
            .filter(|t| t.min_qty <= total_quantity)
            .max_by_key(|t| t.min_qty);

        let tier = match best_tier {
            Some(t) => t,
            None => continue,
        };

        if let Some(fixed_price) = tier.fixed_price {
            let discount_amount_total = ((line_unit_price - fixed_price) * total_quantity as f64 * 100.0).round() / 100.0;
            let discount_amount_total = discount_amount_total.max(0.0);

            let pence_per_line = split_discount_by_largest_remainder(discount_amount_total, &line_quantities);

            for (id, pence) in line_ids.iter().zip(pence_per_line.iter()) {
                if *pence == 0 {
                    continue;
                }
                candidates.push(schema::ProductDiscountCandidate {
                    targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                        schema::CartLineTarget { id: id.clone(), quantity: None },
                    )],
                    message: Some(format!("£{:.2} each", fixed_price)),
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
        } else {
            let percent_off = tier.percent_off.unwrap_or(0.0);
            match tier.anchor_price {
                None => {
                    for id in &line_ids {
                        candidates.push(schema::ProductDiscountCandidate {
                            targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                                schema::CartLineTarget { id: id.clone(), quantity: None },
                            )],
                            message: Some(format!("{}% off", percent_off)),
                            value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                                value: Decimal(percent_off),
                            }),
                            associated_discount_code: None,
                            prerequisites: None,
                        });
                    }
                }
                Some(anchor_price) => {
                    let extra_units = (total_quantity - tier.min_qty) as f64;
                    let discount_amount_total = (line_unit_price * tier.min_qty as f64) - anchor_price
                        + extra_units * line_unit_price * (percent_off / 100.0);
                    let discount_amount_total = (discount_amount_total * 100.0).round() / 100.0;
                    let discount_amount_total = discount_amount_total.max(0.0);

                    let pence_per_line = split_discount_by_largest_remainder(discount_amount_total, &line_quantities);

                    for (id, pence) in line_ids.iter().zip(pence_per_line.iter()) {
                        if *pence == 0 {
                            continue;
                        }
                        candidates.push(schema::ProductDiscountCandidate {
                            targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                                schema::CartLineTarget { id: id.clone(), quantity: None },
                            )],
                            message: Some(format!("{}% off", percent_off)),
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
    }
```

- [ ] **Step 4: Migrate every existing test fixture to the new JSON shape**

Every `#[test]` in `mod tests` (below the line you just finished editing) builds its input JSON with the old `"products": [{"productId": ..., "status": ..., "tiers": [...]}]` and/or `"groups": [{"groupId": ..., "status": ..., "productIds": [...], "tiers": [...]}]` shape, and — for cart lines — `"merchandise": {"__typename": "ProductVariant", "product": {"id": "..."}}` with no variant `id`. All of these need updating:

- `"products": [{"productId": "gid://.../Product/1", "status": "live", "tiers": [...]}]` becomes `"discounts": [{"status": "live", "members": [{"productId": "gid://.../Product/1"}], "tiers": [...]}]`.
- `"groups": [{"groupId": "grp_1", "status": "live", "productIds": ["gid://.../Product/1", "gid://.../Product/2"], "tiers": [...]}]` becomes an entry in that same `"discounts"` array: `{"status": "live", "members": [{"productId": "gid://.../Product/1"}, {"productId": "gid://.../Product/2"}], "tiers": [...]}` (both `products` and `groups` merge into one `discounts` list — a test that previously had both now has two entries in one array).
- Every cart line's `"merchandise": {"__typename": "ProductVariant", "product": {"id": "X"}}` becomes `"merchandise": {"__typename": "ProductVariant", "id": "gid://shopify/ProductVariant/<any-placeholder-not-used-by-that-test>", "product": {"id": "X"}}` — pick any distinct placeholder variant id per line already present in that test (e.g. `gid://shopify/ProductVariant/900`, `901`, ...) unless the test specifically exercises variant-scoped matching (Task 12 adds those).

Run `grep -n '"products":\|"groups":\|"product": { "id"' extensions/product-discount/src/cart_lines_discounts_generate_run.rs` to find every fixture needing this transform, and apply it to each one found.

- [ ] **Step 5: Run the full Rust test suite**

```bash
cd extensions/product-discount && cargo test
```

Expected: PASS — every existing test still passes against the new shape and new matching logic, since none of them exercise variant-scoped members yet (Task 12 adds those).

- [ ] **Step 6: Commit**

```bash
git add extensions/product-discount/src/cart_lines_discounts_generate_run.rs extensions/product-discount/src/cart_lines_discounts_generate_run.graphql
git commit -m "Unify product/group discount matching in the Function; fetch variant id"
```

---

### Task 12: Rust Function — new tests for variant-scoped and mixed-member discounts

**Files:**
- Modify: `extensions/product-discount/src/cart_lines_discounts_generate_run.rs` (test module only)

- [ ] **Step 1: Add tests for variant-scoped matching**

Add to `mod tests` (following the exact `run_function_with_input` pattern already used by every other test in this file):

```rust
#[test]
fn variant_scoped_member_ignores_a_different_variant_of_the_same_product() -> Result<()> {
    let result = run_function_with_input(
        cart_lines_discounts_generate_run,
        r#"{
            "cart": {
                "lines": [
                    {
                        "id": "gid://shopify/CartLine/0",
                        "quantity": 7,
                        "cost": { "amountPerQuantity": { "amount": "1.49" } },
                        "merchandise": {
                            "__typename": "ProductVariant",
                            "id": "gid://shopify/ProductVariant/999",
                            "product": { "id": "gid://shopify/Product/1" }
                        }
                    }
                ]
            },
            "shop": {
                "metafield": {
                    "jsonValue": {
                        "discounts": [
                            {
                                "status": "live",
                                "members": [
                                    { "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/500" }
                                ],
                                "tiers": [{ "minQty": 7, "percentOff": 4.0 }]
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
fn variant_scoped_member_matches_its_exact_variant() -> Result<()> {
    let result = run_function_with_input(
        cart_lines_discounts_generate_run,
        r#"{
            "cart": {
                "lines": [
                    {
                        "id": "gid://shopify/CartLine/0",
                        "quantity": 7,
                        "cost": { "amountPerQuantity": { "amount": "1.49" } },
                        "merchandise": {
                            "__typename": "ProductVariant",
                            "id": "gid://shopify/ProductVariant/500",
                            "product": { "id": "gid://shopify/Product/1" }
                        }
                    }
                ]
            },
            "shop": {
                "metafield": {
                    "jsonValue": {
                        "discounts": [
                            {
                                "status": "live",
                                "members": [
                                    { "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/500" }
                                ],
                                "tiers": [{ "minQty": 7, "percentOff": 4.0 }]
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
            match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 4.0),
                _ => panic!("expected a Percentage value"),
            }
        }
        _ => panic!("expected ProductDiscountsAdd"),
    }
    Ok(())
}

#[test]
fn mixed_members_combine_quantity_across_a_whole_product_and_a_specific_variant_of_another() -> Result<()> {
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
                            "id": "gid://shopify/ProductVariant/900",
                            "product": { "id": "gid://shopify/Product/1" }
                        }
                    },
                    {
                        "id": "gid://shopify/CartLine/1",
                        "quantity": 3,
                        "cost": { "amountPerQuantity": { "amount": "1.49" } },
                        "merchandise": {
                            "__typename": "ProductVariant",
                            "id": "gid://shopify/ProductVariant/500",
                            "product": { "id": "gid://shopify/Product/2" }
                        }
                    },
                    {
                        "id": "gid://shopify/CartLine/2",
                        "quantity": 10,
                        "cost": { "amountPerQuantity": { "amount": "1.49" } },
                        "merchandise": {
                            "__typename": "ProductVariant",
                            "id": "gid://shopify/ProductVariant/501",
                            "product": { "id": "gid://shopify/Product/2" }
                        }
                    }
                ]
            },
            "shop": {
                "metafield": {
                    "jsonValue": {
                        "discounts": [
                            {
                                "status": "live",
                                "members": [
                                    { "productId": "gid://shopify/Product/1" },
                                    { "productId": "gid://shopify/Product/2", "variantId": "gid://shopify/ProductVariant/500" }
                                ],
                                "tiers": [{ "minQty": 7, "percentOff": 4.0 }]
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
            // Line 0 (qty 4) + line 1 (qty 3, the matching variant of
            // Product/2) = 7, reaching the tier. Line 2 (the OTHER variant
            // of Product/2, qty 10) must NOT be discounted.
            assert_eq!(op.candidates.len(), 2);
            let targeted_line_ids: Vec<String> = op.candidates.iter().map(|c| {
                match &c.targets[0] {
                    schema::ProductDiscountCandidateTarget::CartLine(t) => t.id.to_string(),
                }
            }).collect();
            assert!(targeted_line_ids.contains(&"gid://shopify/CartLine/0".to_string()));
            assert!(targeted_line_ids.contains(&"gid://shopify/CartLine/1".to_string()));
            assert!(!targeted_line_ids.contains(&"gid://shopify/CartLine/2".to_string()));
        }
        _ => panic!("expected ProductDiscountsAdd"),
    }
    Ok(())
}
```

- [ ] **Step 2: Run the new tests**

```bash
cd extensions/product-discount && cargo test variant_scoped
cd extensions/product-discount && cargo test mixed_members
```

Expected: PASS for all three.

- [ ] **Step 3: Run the full suite once more**

```bash
cd extensions/product-discount && cargo test
```

Expected: PASS, every test in the file green.

- [ ] **Step 4: Commit**

```bash
git add extensions/product-discount/src/cart_lines_discounts_generate_run.rs
git commit -m "Add Function tests for variant-scoped and mixed-member discount matching"
```

---

### Task 13: Manual live verification

**Files:** none — verification only, no code changes.

- [ ] **Step 1: Deploy**

```bash
nvm use 22.23.1 && npx shopify app deploy --allow-updates
```

- [ ] **Step 2: Recreate one single-product discount** (e.g. the old standalone 3-for-£1.50 discount) through the new `/discounts/new` flow. Verify: title/name save correctly, tiers save, going live shows the tiered price on that product's storefront page.

- [ ] **Step 3: Recreate one whole-product mix-and-match group** (e.g. Canagan Cat Soup's 3 products) through the same flow. Verify the storefront widget shows the promo line, progress bar, and mix & match list exactly as before.

- [ ] **Step 4: Create one NEW discount using a multi-variant product's specific variants** — the actual motivating case for this feature. Pick a real multi-variant product (or create a small test one), select 2 of its variants via the picker's expansion UI, set percent-off tiers, go live. Verify on the storefront: the widget shows tier pricing when the eligible variant is selected, and falls back to plain price when a non-member variant of the same product is selected via the variant picker (`wireVariantChange` reactivity).

- [ ] **Step 5: Live cart test** — add real units across a mixed discount's members (spanning at least 2 different products, one of them a specific variant) via `/cart/add.js`, confirm via `/cart.js` that `line_level_discount_allocations` shows the correct discount on each matching line and NOT on a non-member variant of the same product.

- [ ] **Step 6: Report back** — confirm to the user which of the 4 previously-live discounts have been recreated, and note plainly if any have not yet (per the spec's §13 rollout note, those stay plain-priced until recreated).

---

## Plan self-review notes

- **Spec coverage:** §4 (data model) → Task 1. §5 (pricing rule) → Tasks 1, 4, 6. §6 (guided UI) → Tasks 7, 8. §7 (actions) → Task 4. §8 (metafield sync) → Task 3. §9 (Liquid) → Task 9. §10 (storefront JS) → Task 10. §11 (Rust Function) → Tasks 11, 12. §12 (testing strategy) → woven through every task. §13 (rollout note) → Task 13.
- **Cross-task consistency issue found and fixed during self-review:** the first draft of Task 10's `parseWidgetConfig` tried to derive a sibling's matching product id from its `handle` (a string slug — `extractNumericId` on a handle is a no-op, so cart matching would never succeed) and likewise derived the self member's id from `productHandle` instead of a real product id. Fixed by adding `productId` to `DiscountMetafieldSibling` (Task 3) and the Liquid `siblings_json` capture (Task 9), and adding a new `data-product-id` attribute to the widget container (Task 9) for the self member — both now flow real GIDs into `parseWidgetConfig` instead of handles. Also removed a dead, no-longer-needed `all_products[sibling.handle]` Liquid lookup left over from the old per-request image-fetch pattern (images are now stored directly on the synced metafield).
- **Bug caught in Task 3's own test during self-review:** an early draft left a dead `JSON.parse(...)` call in the `syncDiscountMetafields` test that would have thrown at runtime (parsing a plain object, not a string). Removed.
- **Deviation from the spec, called out in Global Constraints:** the spec's §5 describes comparing "Shopify's own decimal price strings"; this plan uses the codebase's existing `Math.abs(a - b) > 0.001` float-tolerance convention (already proven in `groupProductActions.ts`) instead, for consistency with code already in production.
