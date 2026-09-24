# Time-Based Collection Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, structurally isolated discount kind — a flat percent-or-fixed discount active only within a shop-timezone date/time window, selectable by individual products/variants or by Collections, with its own countdown-timer storefront widget — without touching the existing tiered discount system.

**Architecture:** New Rust Function extension, new admin module (`src/timeDiscounts/`), new shop/product metafield namespaces, new theme-extension block. One shared, narrow seam (`src/lib/discountAvailability.ts`) enforces "a product belongs to at most one discount, of either kind" across both otherwise-independent systems.

**Tech Stack:** Next.js/TypeScript (admin, matching existing conventions), Rust + `shopify_function` (checkout Function, matching `extensions/product-discount`), Liquid + vanilla JS (theme app extension block, matching `extensions/product-tier-pricing`).

**Spec:** `docs/superpowers/specs/2026-09-22-time-based-collection-discount-design.md`

## Global Constraints

- No edits to any existing file under `src/lib/config.ts`, `src/actions/discountActions.ts`, `src/actions/memberPickerActions.ts`, `src/components/MemberPicker.tsx`, `src/lib/product-tiers.ts`, `extensions/product-discount/`, or `extensions/product-tier-pricing/blocks/tier-pricing.liquid` / `assets/tier-pricing.js`. Every task in this plan only adds new files, except the one explicitly-scoped edit to `src/app/page.tsx` (home page listing, Task 10) and the one new file added inside the existing `product-tier-pricing` extension directory (the new block + its JS asset, Tasks 11-12 — new files, not edits to existing ones).
- A product/variant belongs to at most one discount, of either kind, at a time. No stacking, no combining.
- Flat discount only — one percent-off or fixed-price amount for the whole active window, no quantity tiers.
- Selection is exclusive: a discount is either product/variant-based or Collection-based, never both — enforced via a discriminated union (`TimeDiscountSelection`), not just hidden UI.
- Dates/times are entered/displayed in the shop's own timezone (`shop.ianaTimezone`). Activation is evaluated by Shopify's own native discount scheduling (each `TimeDiscount`'s own `DiscountAutomaticApp` record, its `startsAt`/`endsAt` converted to UTC — see spec §5), not by this app polling or comparing times itself, and not the customer's browser timezone.
- Each `TimeDiscount` owns a real Shopify `DiscountAutomaticApp` record (`shopifyDiscountId`) — distinct from the existing product-discount system, which keeps its single shared record/Function/config-blob pattern completely unchanged (spec §2).
- Two narrow, deliberate exceptions to "no shared code with the existing system," both justified in the spec and restated here so no task implementer re-litigates them: (1) the `DiscountMember` shape (`{productId, variantId?}`) is redefined locally, not imported — a structural-type-only echo, zero coupling; (2) `getMemberInfo`/`searchProducts`/`getProductVariantOptions` from `@/lib/products` ARE imported directly — they are neutral Shopify product-lookup plumbing with zero knowledge of "Discount"/"Tier" types, exactly as reusable as any other library call. `pricesUniform` is NOT imported from `@/lib/config` despite being equally tiny — it is redefined locally in `src/timeDiscounts/config.ts` (5 lines) to keep zero import edges into the existing discount module's own file, since that file is conceptually "owned" by the existing system even though the function itself is generic.
- Node 20.20.2 for the admin app (`.nvmrc`), Node 22.23.1 for the theme extension JS, `cargo` for Rust — no `nvm use` needed unless a real mismatch appears (matches this session's established environment).

---

### Task 1: Time discount data model

**Files:**
- Create: `src/timeDiscounts/config.ts`
- Test: `tests/timeDiscounts/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DiscountMember { productId: string; variantId?: string }
  type TimeDiscountSelection =
    | { mode: 'products'; members: DiscountMember[] }
    | { mode: 'collections'; collectionIds: string[] }
  interface TimeDiscount {
    discountId: string
    shopifyDiscountId: string
    name: string
    title: string
    pricingMode: 'percent' | 'fixed'
    amount: number
    startsAt: string
    endsAt: string
    selection: TimeDiscountSelection
    resolvedMembers: DiscountMember[]
  }
  interface TimeDiscountsConfig { discounts: TimeDiscount[] }
  function getTimeDiscountsConfig(): Promise<TimeDiscountsConfig>
  function saveTimeDiscountsConfig(config: TimeDiscountsConfig): Promise<void>
  function isTimeDiscountMemberAvailable(config: TimeDiscountsConfig, productId: string, variantId: string | undefined, excludeDiscountId?: string): boolean
  function pricesUniform(prices: number[]): boolean
  ```
  No `status` field — activation is entirely Shopify-native (spec §3, §5): each `TimeDiscount` owns a real `DiscountAutomaticApp` record (`shopifyDiscountId`) whose own `startsAt`/`endsAt` Shopify enforces before ever invoking the Function. This app never tracks or polls activation state itself.

- [ ] **Step 1: Write the failing tests**

Create `tests/timeDiscounts/config.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTimeDiscountsConfig, saveTimeDiscountsConfig, isTimeDiscountMemberAvailable, pricesUniform, type TimeDiscountsConfig } from '@/timeDiscounts/config'
import * as shopifyClient from '@/lib/shopify-client'

describe('getTimeDiscountsConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses the stored config JSON', async () => {
    const stored: TimeDiscountsConfig = {
      discounts: [
        {
          discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash Sale', title: 'Flash Sale',
          pricingMode: 'percent', amount: 20, startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
          selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
          resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify(stored) } } })

    const config = await getTimeDiscountsConfig()
    expect(config).toEqual(stored)
  })

  it('returns an empty discount list when no metafield exists yet', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })
    expect(await getTimeDiscountsConfig()).toEqual({ discounts: [] })
  })

  it('normalizes a stored value with no discounts array instead of throwing', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: '{}' } } })
    expect(await getTimeDiscountsConfig()).toEqual({ discounts: [] })
  })
})

describe('saveTimeDiscountsConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the config as a JSON shop metafield under the time-discounts namespace', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: TimeDiscountsConfig = { discounts: [] }
    await saveTimeDiscountsConfig(config)

    expect(shopIdSpy).toHaveBeenCalledTimes(2)
    expect(shopIdSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            ownerId: 'gid://shopify/Shop/1',
            namespace: 'sparkly_time_discounts',
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
    await expect(saveTimeDiscountsConfig({ discounts: [] })).rejects.toThrow('Invalid JSON')
  })
})

describe('isTimeDiscountMemberAvailable', () => {
  const baseConfig: TimeDiscountsConfig = {
    discounts: [
      {
        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      },
      {
        discountId: 'time_disc_2', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/2', name: 'Y', title: 'Y', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'collections', collectionIds: ['gid://shopify/Collection/1'] },
        resolvedMembers: [
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
          { productId: 'gid://shopify/Product/3' },
        ],
      },
    ],
  }

  it('is false for a product already claimed as a whole-product member', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/1', undefined)).toBe(false)
  })

  it('is false for the exact same variant already claimed', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/20')).toBe(false)
  })

  it('is true for a different variant of a product that only has one specific variant claimed', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/21')).toBe(true)
  })

  it('is true for a product in no discount', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/4', undefined)).toBe(true)
  })

  it('is true for a member already claimed by the discount being excluded', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/1', undefined, 'time_disc_1')).toBe(true)
  })
})

describe('pricesUniform', () => {
  it('is true for zero or one price', () => {
    expect(pricesUniform([])).toBe(true)
    expect(pricesUniform([1.49])).toBe(true)
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
npx vitest run tests/timeDiscounts/config.test.ts
```

Expected: FAIL — `@/timeDiscounts/config` doesn't exist yet.

- [ ] **Step 3: Create `src/timeDiscounts/config.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'

export interface DiscountMember {
  productId: string
  /** Omitted for a whole-product member (single-variant products, or Collections-mode resolution — see spec §3, §5). */
  variantId?: string
}

export type TimeDiscountSelection =
  | { mode: 'products'; members: DiscountMember[] }
  | { mode: 'collections'; collectionIds: string[] }

export interface TimeDiscount {
  discountId: string
  /** GID of the real Shopify DiscountAutomaticApp record this discount owns — see spec §5. Shopify's own native startsAt/endsAt on that record govern activation; this app has no local status field. */
  shopifyDiscountId: string
  /** Internal admin-facing label. */
  name: string
  /** Customer-facing copy shown in the countdown widget. */
  title: string
  pricingMode: 'percent' | 'fixed'
  /** Single flat value — percent-off, or the fixed price. No tiers (see spec §2). */
  amount: number
  /** Naive (no offset) ISO datetime; entered/displayed in shop timezone by the admin UI. Converted to UTC only at the Admin API boundary, when writing this discount's native startsAt/endsAt (see spec §5). */
  startsAt: string
  endsAt: string
  /** Admin source of truth: how the merchant chose members — shown/edited on the discount page. */
  selection: TimeDiscountSelection
  /** Function-facing snapshot, recomputed at save time from `selection` (see spec §3, §5). The Function only ever reads this. */
  resolvedMembers: DiscountMember[]
}

export interface TimeDiscountsConfig {
  discounts: TimeDiscount[]
}

const NAMESPACE = 'sparkly_time_discounts'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(`query { shop { id } }`)
  return data.shop.id
}

export async function getTimeDiscountsConfig(): Promise<TimeDiscountsConfig> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getTimeDiscountsConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) return { discounts: [] }

  const parsed = JSON.parse(data.shop.metafield.value) as Partial<TimeDiscountsConfig>
  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts : [] }
}

export async function saveTimeDiscountsConfig(config: TimeDiscountsConfig): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setTimeDiscountsConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        { ownerId: shopId, namespace: NAMESPACE, key: 'config', type: 'json', value: JSON.stringify(config) },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

/**
 * True when (productId, variantId) isn't already a resolvedMembers entry of
 * another time discount. Same matching rule as the existing app's
 * isProductAvailable: a whole-product claim blocks every variant and vice
 * versa. Pass the discount's own id as excludeDiscountId when validating an
 * in-progress edit.
 */
export function isTimeDiscountMemberAvailable(
  config: TimeDiscountsConfig,
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): boolean {
  return !config.discounts.some((discount) => {
    if (discount.discountId === excludeDiscountId) return false
    return discount.resolvedMembers.some((member) => {
      if (member.productId !== productId) return false
      if (member.variantId == null || variantId == null) return true
      return member.variantId === variantId
    })
  })
}

/**
 * True when every price in the list is equal, within floating-point
 * rounding. Deliberately redefined here rather than imported from
 * @/lib/config — see this plan's Global Constraints for why.
 */
export function pricesUniform(prices: number[]): boolean {
  if (prices.length <= 1) return true
  const [first, ...rest] = prices
  return rest.every((p) => Math.abs(p - first) <= 0.001)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/timeDiscounts/config.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/config.ts tests/timeDiscounts/config.test.ts
git commit -m "Add time discount data model and config storage"
```

---

### Task 2: Collections lookup utility

**Files:**
- Create: `src/lib/collections.ts`
- Test: `tests/lib/collections.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery` from `@/lib/shopify-client` (exact signature already exists, unchanged).
- Produces:
  ```ts
  interface CollectionSearchResult { id: string; title: string }
  function searchCollections(query: string): Promise<CollectionSearchResult[]>
  function resolveCollectionMembers(collectionIds: string[]): Promise<{ productId: string }[]>
  ```
  `resolveCollectionMembers`'s return type is structurally assignable to `DiscountMember[]` from Task 1 (a `{productId}` object satisfies `{productId: string; variantId?: string}`) without needing to import that type — this file has zero knowledge of discounts, matching `src/lib/products.ts`'s existing neutrality.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/collections.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchCollections, resolveCollectionMembers } from '@/lib/collections'
import * as shopifyClient from '@/lib/shopify-client'

describe('searchCollections', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] for an empty query without a network call', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await searchCollections('  ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('maps collection search results', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      collections: { edges: [{ node: { id: 'gid://shopify/Collection/1', title: 'Summer Sale' } }] },
    })
    expect(await searchCollections('summer')).toEqual([{ id: 'gid://shopify/Collection/1', title: 'Summer Sale' }])
  })
})

describe('resolveCollectionMembers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('enumerates products across one collection', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      collection: {
        products: {
          edges: [{ node: { id: 'gid://shopify/Product/1' } }, { node: { id: 'gid://shopify/Product/2' } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1'])
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
  })

  it('dedupes a product that appears in two chosen collections', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }, { node: { id: 'gid://shopify/Product/2' } }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1', 'gid://shopify/Collection/2'])
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
  })

  it('follows pagination past 250 products in one collection', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }], pageInfo: { hasNextPage: true, endCursor: 'cursor1' } } },
    })
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/2' } }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1'])
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
    expect(spy).toHaveBeenLastCalledWith(expect.any(String), { id: 'gid://shopify/Collection/1', after: 'cursor1' })
  })

  it('skips a collection that no longer resolves instead of throwing', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ collection: null })
    expect(await resolveCollectionMembers(['gid://shopify/Collection/999'])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/lib/collections.test.ts
```

Expected: FAIL — `@/lib/collections` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/collections.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'

export interface CollectionSearchResult {
  id: string
  title: string
}

/** Search-as-you-type lookup for the Collections-mode picker. */
export async function searchCollections(query: string): Promise<CollectionSearchResult[]> {
  if (!query.trim()) return []

  const data = await shopifyQuery<{
    collections: { edges: { node: { id: string; title: string } }[] }
  }>(
    `query searchCollections($q: String!) {
      collections(first: 8, query: $q) {
        edges { node { id title } }
      }
    }`,
    { q: query },
  )

  return data.collections.edges.map((e) => ({ id: e.node.id, title: e.node.title }))
}

/**
 * Enumerates every product currently in the given collections, deduped
 * across collections, paginating past Shopify's 250-per-page limit. Used
 * to resolve a Collections-mode time discount's members at save time (see
 * spec §3, §5) — the Function never queries collections itself. Whole-
 * product members only (no variantId): collection membership is per-
 * product, not per-variant.
 */
export async function resolveCollectionMembers(collectionIds: string[]): Promise<{ productId: string }[]> {
  const seen = new Set<string>()
  const results: { productId: string }[] = []

  for (const collectionId of collectionIds) {
    let cursor: string | null = null
    for (;;) {
      const data = await shopifyQuery<{
        collection: {
          products: { edges: { node: { id: string } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
        } | null
      }>(
        `query getCollectionProducts($id: ID!, $after: String) {
          collection(id: $id) {
            products(first: 250, after: $after) {
              edges { node { id } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { id: collectionId, after: cursor },
      )

      if (!data.collection) break

      for (const edge of data.collection.products.edges) {
        if (!seen.has(edge.node.id)) {
          seen.add(edge.node.id)
          results.push({ productId: edge.node.id })
        }
      }

      if (!data.collection.products.pageInfo.hasNextPage) break
      cursor = data.collection.products.pageInfo.endCursor
    }
  }

  return results
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/lib/collections.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/collections.ts tests/lib/collections.test.ts
git commit -m "Add collection search and product-resolution utilities"
```

---

### Task 3: Shared cross-kind availability check

**Files:**
- Create: `src/lib/discountAvailability.ts`
- Test: `tests/lib/discountAvailability.test.ts`

**Interfaces:**
- Consumes: `isProductAvailable`, `type Config` from `@/lib/config` (existing, unchanged); `isTimeDiscountMemberAvailable`, `type TimeDiscountsConfig` from `@/timeDiscounts/config` (Task 1).
- Produces:
  ```ts
  function isAvailableEverywhere(productConfig: Config, timeConfig: TimeDiscountsConfig, productId: string, variantId: string | undefined, excludeDiscountId?: string): boolean
  ```
  Pure and synchronous — callers fetch both configs once per operation and pass them in (see spec §3's "the one shared seam"; this is the only file importing from both `@/lib/config` and `@/timeDiscounts/config`).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/discountAvailability.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isAvailableEverywhere } from '@/lib/discountAvailability'
import type { Config } from '@/lib/config'
import type { TimeDiscountsConfig } from '@/timeDiscounts/config'

const productConfig: Config = {
  discounts: [
    { discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] },
  ],
}

const timeConfig: TimeDiscountsConfig = {
  discounts: [
    {
      discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Y', title: 'Y', pricingMode: 'percent', amount: 10,
      startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
      selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/2' }] },
      resolvedMembers: [{ productId: 'gid://shopify/Product/2' }],
    },
  ],
}

describe('isAvailableEverywhere', () => {
  it('is false for a product claimed by the existing tiered-discount system', () => {
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/1', undefined)).toBe(false)
  })

  it('is false for a product claimed by another time discount', () => {
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/2', undefined)).toBe(false)
  })

  it('is true for a product claimed nowhere', () => {
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/3', undefined)).toBe(true)
  })

  it('excludes only within the matching kind\'s config, by id', () => {
    // A time-discount id excludes only within timeConfig; it has no effect
    // on productConfig, and vice versa — ids from the two kinds never
    // collide (both are crypto.randomUUID()-based), so this is a no-op
    // cross-kind, not a bug.
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/1', undefined, 'time_disc_1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/lib/discountAvailability.test.ts
```

Expected: FAIL — `@/lib/discountAvailability` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/discountAvailability.ts`**

```ts
import { isProductAvailable, type Config } from '@/lib/config'
import { isTimeDiscountMemberAvailable, type TimeDiscountsConfig } from '@/timeDiscounts/config'

/**
 * True when (productId, variantId) is free to be claimed by a NEW discount
 * of either kind, given both configs already fetched. The one deliberate
 * seam between the two otherwise fully isolated discount modules (see
 * spec §3) — this file is the only place either module's config type is
 * imported alongside the other's. Callers fetch both configs once per
 * operation (not once per candidate) and pass them in, matching each
 * module's own established "fetch config once, check many candidates"
 * pattern.
 */
export function isAvailableEverywhere(
  productConfig: Config,
  timeConfig: TimeDiscountsConfig,
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): boolean {
  return (
    isProductAvailable(productConfig, productId, variantId, excludeDiscountId) &&
    isTimeDiscountMemberAvailable(timeConfig, productId, variantId, excludeDiscountId)
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/lib/discountAvailability.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discountAvailability.ts tests/lib/discountAvailability.test.ts
git commit -m "Add the shared cross-kind discount availability check"
```

---

### Task 4: Time discount metafield sync

**Files:**
- Create: `src/timeDiscounts/metafieldSync.ts`
- Test: `tests/timeDiscounts/metafieldSync.test.ts`

**Interfaces:**
- Consumes: `type TimeDiscount` from `@/timeDiscounts/config` (Task 1); `shopifyQuery` from `@/lib/shopify-client`.
- Produces:
  ```ts
  function syncTimeDiscountMetafields(discount: TimeDiscount): Promise<void>
  function clearTimeDiscountMetafields(members: { productId: string }[]): Promise<void>
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/timeDiscounts/metafieldSync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import * as shopifyClient from '@/lib/shopify-client'
import type { TimeDiscount } from '@/timeDiscounts/config'

const discount: TimeDiscount = {
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale', pricingMode: 'percent', amount: 20,
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }] },
  resolvedMembers: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
}

describe('syncTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes one metafield per unique product in resolvedMembers', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount)

    expect(spy).toHaveBeenCalledTimes(2)
    const call1 = spy.mock.calls.find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === 'gid://shopify/Product/1')!
    const parsed = JSON.parse((call1[1] as { metafields: { value: string }[] }).metafields[0].value)
    expect(parsed).toEqual({
      discountId: 'time_disc_1', title: 'Flash Sale', pricingMode: 'percent', amount: 20,
      startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z',
    })
  })

  it('dedupes when a product appears twice in resolvedMembers (e.g. two variants)', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields({
      ...discount,
      resolvedMembers: [
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10' },
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/11' },
      ],
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('aggregates and throws on any rejected write instead of swallowing it', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })
    spy.mockRejectedValueOnce(new Error('boom'))
    await expect(syncTimeDiscountMetafields(discount)).rejects.toThrow('boom')
  })
})

describe('clearTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes the metafield from every unique product', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })
    await clearTimeDiscountMetafields([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/1' }])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/timeDiscounts/metafieldSync.test.ts
```

Expected: FAIL — `@/timeDiscounts/metafieldSync` doesn't exist yet.

- [ ] **Step 3: Create `src/timeDiscounts/metafieldSync.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'
import type { TimeDiscount } from '@/timeDiscounts/config'

const NAMESPACE = 'sparkly_time_discounts'

interface TimeDiscountMetafieldValue {
  discountId: string
  title: string
  pricingMode: 'percent' | 'fixed'
  amount: number
  startsAt: string
  endsAt: string
}

/** Writes the `discount` metafield to every unique product in resolvedMembers — the storefront widget block reads this, keyed per product. */
export async function syncTimeDiscountMetafields(discount: TimeDiscount): Promise<void> {
  const uniqueProductIds = [...new Set(discount.resolvedMembers.map((m) => m.productId))]
  const value: TimeDiscountMetafieldValue = {
    discountId: discount.discountId,
    title: discount.title,
    pricingMode: discount.pricingMode,
    amount: discount.amount,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
  }

  const results = await Promise.allSettled(uniqueProductIds.map((productId) => setTimeDiscountMetafield(productId, value)))

  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason)).join('; '))
  }
}

async function setTimeDiscountMetafield(productId: string, value: TimeDiscountMetafieldValue): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setTimeDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        { ownerId: productId, namespace: NAMESPACE, key: 'discount', type: 'json', value: JSON.stringify(value) },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

/** Deletes the `discount` metafield from every unique product in the list. */
export async function clearTimeDiscountMetafields(members: { productId: string }[]): Promise<void> {
  const uniqueProductIds = [...new Set(members.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map(async (productId) => {
      const data = await shopifyQuery<{
        metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
      }>(
        `mutation deleteTimeDiscountMetafield($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
        { metafields: [{ ownerId: productId, namespace: NAMESPACE, key: 'discount' }] },
      )

      if (data.metafieldsDelete.userErrors.length > 0) {
        throw new Error(data.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
      }
    }),
  )

  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason)).join('; '))
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/timeDiscounts/metafieldSync.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/metafieldSync.ts tests/timeDiscounts/metafieldSync.test.ts
git commit -m "Add product-level metafield sync for time discounts"
```

---

### Task 5: Shop timezone utility + time discount server actions

**Files:**
- Create: `src/lib/shop.ts`
- Test: `tests/lib/shop.test.ts`
- Create: `src/timeDiscounts/actions.ts`
- Test: `tests/timeDiscounts/actions.test.ts`

**Interfaces:**
- Consumes: `getTimeDiscountsConfig`, `saveTimeDiscountsConfig`, `pricesUniform`, `type TimeDiscount`, `type TimeDiscountSelection`, `type DiscountMember` (Task 1); `isAvailableEverywhere` (Task 3); `resolveCollectionMembers` (Task 2); `syncTimeDiscountMetafields`, `clearTimeDiscountMetafields` (Task 4); `getConfig` from `@/lib/config` (existing); `getMemberInfo` from `@/lib/products` (existing); `redirectWithToken` from `@/lib/auth-redirect` (existing, unchanged signature); `shopifyQuery` from `@/lib/shopify-client` (existing).
- Produces:
  ```ts
  function getShopTimezone(): Promise<string>
  function zonedTimeToUtc(naiveDateTime: string, timeZone: string): string
  function createTimeDiscount(formData: FormData): Promise<void>
  function updateTimeDiscountSelection(discountId: string, formData: FormData): Promise<void>
  function updateTimeDiscountSchedule(discountId: string, formData: FormData): Promise<void>
  function updateTimeDiscountTitle(discountId: string, formData: FormData): Promise<void>
  function deleteTimeDiscount(discountId: string): Promise<void>
  ```
  `getShopTimezone`/`zonedTimeToUtc` live in `src/lib/`, not `src/timeDiscounts/`, since neither is discount-specific — a future feature could reuse them (matching how `src/lib/products.ts` sits neutral). Task 9's new-discount page imports `getShopTimezone` from here for display; this task is the first real consumer (it needs `zonedTimeToUtc` to convert the merchant's shop-local input to the UTC values Shopify's native discount scheduling requires — see spec §4, §5), so both are created here rather than later.

  Form field convention: `name`, `title`, `startsAt`, `endsAt`, `pricingMode` (`'percent'|'fixed'`), `amount`; `selectionMode` (`'products'|'collections'`); for products mode, `member-{i}-productId`/`member-{i}-variantId` (0-based, contiguous — same convention the existing `MemberPicker` already emits, reused by Task 7's picker); for collections mode, repeated `collectionId` fields (`formData.getAll('collectionId')`).

  **No `setTimeDiscountStatus`.** There is no local status to flip — each action that changes dates, pricing, or membership also updates the Shopify-native `DiscountAutomaticApp` record backing the discount (via `discountAutomaticAppUpdate`), and Shopify's own platform decides activation from that record's `startsAt`/`endsAt` (spec §5).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/shop.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'

describe('getShopTimezone', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns the shop\'s IANA timezone', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { ianaTimezone: 'Europe/London' } })
    expect(await getShopTimezone()).toBe('Europe/London')
  })
})

describe('zonedTimeToUtc', () => {
  it('converts a naive shop-local time to UTC when the zone has zero offset (GMT, winter)', () => {
    expect(zonedTimeToUtc('2026-03-01T12:00', 'Europe/London')).toBe('2026-03-01T12:00:00.000Z')
  })

  it('converts a naive shop-local time to UTC across a DST offset (BST, summer, +1)', () => {
    expect(zonedTimeToUtc('2026-07-01T12:00', 'Europe/London')).toBe('2026-07-01T11:00:00.000Z')
  })

  it('converts correctly for a negative-offset zone (America/New_York, EDT, -4 in summer)', () => {
    expect(zonedTimeToUtc('2026-07-01T12:00', 'America/New_York')).toBe('2026-07-01T16:00:00.000Z')
  })
})
```

Create `tests/timeDiscounts/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTimeDiscount, updateTimeDiscountSelection, updateTimeDiscountSchedule,
  updateTimeDiscountTitle, deleteTimeDiscount,
} from '@/timeDiscounts/actions'
import * as timeConfigLib from '@/timeDiscounts/config'
import * as configLib from '@/lib/config'
import * as productsLib from '@/lib/products'
import * as metafieldSync from '@/timeDiscounts/metafieldSync'
import * as authRedirect from '@/lib/auth-redirect'
import * as shopLib from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'
import type { TimeDiscount } from '@/timeDiscounts/config'

function formData(entries: [string, string][]): FormData {
  const fd = new FormData()
  for (const [k, v] of entries) fd.append(k, v)
  return fd
}

const existingDiscount: TimeDiscount = {
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale',
  pricingMode: 'percent', amount: 20, startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
  resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  vi.spyOn(authRedirect, 'redirectWithToken').mockResolvedValue(undefined as never)
  vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([{ productId: 'gid://shopify/Product/1', title: 'X', price: 10, handle: 'x', imageUrl: null }])
  vi.spyOn(shopLib, 'getShopTimezone').mockResolvedValue('Europe/London')
  vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockResolvedValue(undefined)
  vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields').mockResolvedValue(undefined)
})

describe('createTimeDiscount', () => {
  it('rejects a submission with no name', async () => {
    await expect(createTimeDiscount(formData([['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'], ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1']])))
      .rejects.toThrow('A name is required')
  })

  it('rejects end before start', async () => {
    await expect(createTimeDiscount(formData([['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-02T00:00'], ['endsAt', '2026-01-01T00:00'], ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1']])))
      .rejects.toThrow('End must be after start')
  })

  it('rejects a fixed-price discount whose members have different prices', async () => {
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'A', price: 10, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', title: 'B', price: 20, handle: 'b', imageUrl: null },
    ])
    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'fixed'], ['amount', '5'], ['selectionMode', 'products'],
      ['member-0-productId', 'gid://shopify/Product/1'], ['member-1-productId', 'gid://shopify/Product/2'],
    ]))).rejects.toThrow('different prices')
  })

  it('creates the Shopify discount record with UTC dates and the function-config metafield, then saves', async () => {
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopifyQuerySpy.mockResolvedValueOnce({
      discountAutomaticAppCreate: {
        automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' },
        userErrors: [],
      },
    })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })

    await createTimeDiscount(formData([
      ['name', 'Flash'], ['title', 'Flash Sale'], ['startsAt', '2026-07-01T12:00'], ['endsAt', '2026-07-02T12:00'],
      ['pricingMode', 'percent'], ['amount', '20'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))

    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppCreate'),
      expect.objectContaining({
        automaticAppDiscount: expect.objectContaining({
          title: 'Flash Sale',
          functionHandle: 'time-based-discount',
          discountClasses: ['PRODUCT'],
          startsAt: '2026-07-01T11:00:00.000Z',
          endsAt: '2026-07-02T11:00:00.000Z',
          metafields: [expect.objectContaining({
            namespace: 'sparkly_time_discounts', key: 'function_config', type: 'json',
            value: JSON.stringify({ resolvedMembers: [{ productId: 'gid://shopify/Product/1' }], pricingMode: 'percent', amount: 20 }),
          })],
        }),
      }),
    )
    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({
        name: 'Flash', title: 'Flash Sale', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/99', pricingMode: 'percent', amount: 20,
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      })],
    })
  })

  it('creates a collections-mode discount, resolving members from the collection', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
    })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    const collectionsLib = await import('@/lib/collections')
    vi.spyOn(collectionsLib, 'resolveCollectionMembers').mockResolvedValue([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'A', price: 10, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', title: 'B', price: 10, handle: 'b', imageUrl: null },
    ])

    await createTimeDiscount(formData([
      ['name', 'Flash'], ['title', 'Flash Sale'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '20'], ['selectionMode', 'collections'], ['collectionId', 'gid://shopify/Collection/1'],
    ]))

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({
        selection: { mode: 'collections', collectionIds: ['gid://shopify/Collection/1'] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      })],
    })
  })

  it('rejects a member already claimed by the existing tiered-discount system', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })

    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).rejects.toThrow('already belongs to another discount')
  })

  it('throws when Shopify reports userErrors creating the discount record', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ field: ['startsAt'], message: 'Invalid date' }] },
    })
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).rejects.toThrow('Invalid date')
  })
})

describe('updateTimeDiscountSelection', () => {
  it('updates the Shopify record\'s function-config metafield and clears/syncs product metafields', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [{ ...existingDiscount }] })
    vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })
    const clearSpy = vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields')
    const syncSpy = vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields')

    await updateTimeDiscountSelection('time_disc_1', formData([['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/2']]))

    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppUpdate'),
      expect.objectContaining({
        id: 'gid://shopify/DiscountAutomaticApp/1',
        automaticAppDiscount: expect.objectContaining({
          metafields: [expect.objectContaining({ value: JSON.stringify({ resolvedMembers: [{ productId: 'gid://shopify/Product/2' }], pricingMode: 'percent', amount: 20 }) })],
        }),
      }),
    )
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
    expect(syncSpy).toHaveBeenCalled()
  })
})

describe('updateTimeDiscountSchedule', () => {
  it('updates dates (converted to UTC), pricing mode, and amount on both the local config and the Shopify record', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [existingDiscount] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })

    await updateTimeDiscountSchedule('time_disc_1', formData([['startsAt', '2026-07-01T12:00'], ['endsAt', '2026-07-02T12:00'], ['pricingMode', 'fixed'], ['amount', '5']]))

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({ startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', pricingMode: 'fixed', amount: 5 })],
    })
    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppUpdate'),
      expect.objectContaining({
        id: 'gid://shopify/DiscountAutomaticApp/1',
        automaticAppDiscount: expect.objectContaining({ startsAt: '2026-07-01T11:00:00.000Z', endsAt: '2026-07-02T11:00:00.000Z' }),
      }),
    )
  })
})

describe('updateTimeDiscountTitle', () => {
  it('updates the title locally and on the Shopify record', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [existingDiscount] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })

    await updateTimeDiscountTitle('time_disc_1', formData([['title', 'New Title']]))

    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ title: 'New Title' })] })
    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppUpdate'),
      expect.objectContaining({ id: 'gid://shopify/DiscountAutomaticApp/1', automaticAppDiscount: { title: 'New Title' } }),
    )
  })
})

describe('deleteTimeDiscount', () => {
  it('removes the discount, deletes the Shopify record, and clears product metafields', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [existingDiscount] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticDelete: { userErrors: [] } })
    const clearSpy = vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields')

    await deleteTimeDiscount('time_disc_1')

    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
    expect(shopifyQuerySpy).toHaveBeenCalledWith(expect.stringContaining('discountAutomaticDelete'), { id: 'gid://shopify/DiscountAutomaticApp/1' })
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/lib/shop.test.ts tests/timeDiscounts/actions.test.ts
```

Expected: FAIL — `@/lib/shop` and `@/timeDiscounts/actions` don't exist yet.

- [ ] **Step 3: Create `src/lib/shop.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'

/** The shop's own configured IANA timezone (e.g. "Europe/London") — time discounts are entered/displayed in this timezone, not UTC or the browser's. */
export async function getShopTimezone(): Promise<string> {
  const data = await shopifyQuery<{ shop: { ianaTimezone: string } }>(`query { shop { ianaTimezone } }`)
  return data.shop.ianaTimezone
}

/**
 * Converts a naive "wall clock" datetime (no timezone offset — exactly what
 * <input type="datetime-local"> produces, e.g. "2026-07-01T12:00") as
 * observed in `timeZone` into a real UTC ISO instant. Needed because
 * Shopify's native DiscountAutomaticApp startsAt/endsAt are UTC DateTime
 * values (see spec §4, §5), while this app's own stored/displayed
 * startsAt/endsAt stay as shop-local naive strings throughout — this
 * conversion happens only at the boundary where a value is sent to the
 * Admin API.
 *
 * Uses the standard Intl-based two-pass correction (no date library
 * dependency): guess the instant by treating the wall-clock value as if it
 * were already UTC, see what wall-clock time that guess actually displays
 * as in `timeZone`, and correct the guess by the difference. A second pass
 * handles the case where the correction itself crosses a DST boundary.
 */
export function zonedTimeToUtc(naiveDateTime: string, timeZone: string): string {
  const [datePart, timePart] = naiveDateTime.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0)

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  })

  function wallClockMsFor(instantMs: number): number {
    const parts = formatter.formatToParts(new Date(instantMs))
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  }

  let guessMs = targetMs
  for (let i = 0; i < 2; i++) {
    guessMs += targetMs - wallClockMsFor(guessMs)
  }
  return new Date(guessMs).toISOString()
}
```

- [ ] **Step 4: Run the shop.ts tests to verify they pass**

```bash
npx vitest run tests/lib/shop.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Create `src/timeDiscounts/actions.ts`**

```ts
'use server'

import {
  getTimeDiscountsConfig, saveTimeDiscountsConfig, pricesUniform,
  type TimeDiscount, type TimeDiscountSelection, type DiscountMember, type TimeDiscountsConfig,
} from '@/timeDiscounts/config'
import { getConfig } from '@/lib/config'
import { isAvailableEverywhere } from '@/lib/discountAvailability'
import { resolveCollectionMembers } from '@/lib/collections'
import { getMemberInfo } from '@/lib/products'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { shopifyQuery } from '@/lib/shopify-client'
import { redirectWithToken } from '@/lib/auth-redirect'

const METAFIELD_NAMESPACE = 'sparkly_time_discounts'
/** Must match the `handle` in extensions/time-based-discount/shopify.extension.toml (Task 13). */
const FUNCTION_HANDLE = 'time-based-discount'

interface FunctionConfigMetafield {
  namespace: string
  key: string
  type: string
  value: string
}

/** The Function's own per-discount config — see spec §5. Written atomically as part of the DiscountAutomaticAppInput on create/update, not via a separate metafieldsSet call. */
function buildFunctionConfigMetafield(resolvedMembers: DiscountMember[], pricingMode: 'percent' | 'fixed', amount: number): FunctionConfigMetafield {
  return {
    namespace: METAFIELD_NAMESPACE,
    key: 'function_config',
    type: 'json',
    value: JSON.stringify({ resolvedMembers, pricingMode, amount }),
  }
}

async function createShopifyDiscountRecord(input: {
  title: string
  startsAtUtc: string
  endsAtUtc: string
  resolvedMembers: DiscountMember[]
  pricingMode: 'percent' | 'fixed'
  amount: number
}): Promise<string> {
  const data = await shopifyQuery<{
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(
    `mutation createTimeDiscountRecord($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      automaticAppDiscount: {
        title: input.title,
        functionHandle: FUNCTION_HANDLE,
        discountClasses: ['PRODUCT'],
        startsAt: input.startsAtUtc,
        endsAt: input.endsAtUtc,
        metafields: [buildFunctionConfigMetafield(input.resolvedMembers, input.pricingMode, input.amount)],
      },
    },
  )

  if (data.discountAutomaticAppCreate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppCreate.userErrors.map((e) => e.message).join('; '))
  }
  if (!data.discountAutomaticAppCreate.automaticAppDiscount) {
    throw new Error('Shopify did not return the created discount')
  }
  return data.discountAutomaticAppCreate.automaticAppDiscount.discountId
}

interface ShopifyDiscountRecordUpdate {
  title?: string
  startsAtUtc?: string
  endsAtUtc?: string
  resolvedMembers?: DiscountMember[]
  pricingMode?: 'percent' | 'fixed'
  amount?: number
}

/** Partial update — only the fields present in `update` are sent, matching Shopify's own documented partial-update behavior for this mutation. */
async function updateShopifyDiscountRecord(shopifyDiscountId: string, update: ShopifyDiscountRecordUpdate): Promise<void> {
  const automaticAppDiscount: Record<string, unknown> = {}
  if (update.title !== undefined) automaticAppDiscount.title = update.title
  if (update.startsAtUtc !== undefined) automaticAppDiscount.startsAt = update.startsAtUtc
  if (update.endsAtUtc !== undefined) automaticAppDiscount.endsAt = update.endsAtUtc
  if (update.resolvedMembers !== undefined && update.pricingMode !== undefined && update.amount !== undefined) {
    automaticAppDiscount.metafields = [buildFunctionConfigMetafield(update.resolvedMembers, update.pricingMode, update.amount)]
  }

  const data = await shopifyQuery<{
    discountAutomaticAppUpdate: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation updateTimeDiscountRecord($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId, automaticAppDiscount },
  )

  if (data.discountAutomaticAppUpdate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppUpdate.userErrors.map((e) => e.message).join('; '))
  }
}

/** Uses the generic discountAutomaticDelete mutation — there is no discount-type-specific delete mutation. */
async function deleteShopifyDiscountRecord(shopifyDiscountId: string): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteTimeDiscountRecord($id: ID!) {
      discountAutomaticDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId },
  )

  if (data.discountAutomaticDelete.userErrors.length > 0) {
    throw new Error(data.discountAutomaticDelete.userErrors.map((e) => e.message).join('; '))
  }
}

function parseMembersFromForm(formData: FormData): DiscountMember[] {
  const members: DiscountMember[] = []
  let i = 0
  while (formData.has(`member-${i}-productId`)) {
    const productId = String(formData.get(`member-${i}-productId`) ?? '').trim()
    const rawVariantId = String(formData.get(`member-${i}-variantId`) ?? '').trim()
    if (productId) members.push(rawVariantId ? { productId, variantId: rawVariantId } : { productId })
    i++
  }
  return members
}

function parseCollectionIdsFromForm(formData: FormData): string[] {
  return formData.getAll('collectionId').map((v) => String(v).trim()).filter(Boolean)
}

async function resolveSelection(formData: FormData): Promise<{ selection: TimeDiscountSelection; resolvedMembers: DiscountMember[] }> {
  const mode: 'products' | 'collections' = formData.get('selectionMode') === 'collections' ? 'collections' : 'products'

  if (mode === 'products') {
    const members = parseMembersFromForm(formData)
    if (members.length === 0) throw new Error('At least one product or variant is required')
    return { selection: { mode: 'products', members }, resolvedMembers: members }
  }

  const collectionIds = parseCollectionIdsFromForm(formData)
  if (collectionIds.length === 0) throw new Error('At least one collection is required')
  const resolvedMembers = await resolveCollectionMembers(collectionIds)
  return { selection: { mode: 'collections', collectionIds }, resolvedMembers }
}

async function assertMembersAvailable(members: DiscountMember[], excludeDiscountId?: string): Promise<void> {
  const [productConfig, timeConfig] = await Promise.all([getConfig(), getTimeDiscountsConfig()])
  for (const member of members) {
    if (!isAvailableEverywhere(productConfig, timeConfig, member.productId, member.variantId, excludeDiscountId)) {
      throw new Error(`${member.productId}${member.variantId ? ` (variant ${member.variantId})` : ''} already belongs to another discount`)
    }
  }
}

/**
 * Throws if a fixed-price discount's members don't share one base price —
 * mirroring the existing tiered-discount system's own gate (see this
 * plan's Global Constraints for why pricesUniform is redefined locally
 * rather than imported).
 */
async function assertPricingAllowed(resolvedMembers: DiscountMember[], pricingMode: 'percent' | 'fixed'): Promise<void> {
  if (pricingMode !== 'fixed') return
  const info = await getMemberInfo(resolvedMembers)
  if (!pricesUniform(info.map((m) => m.price))) {
    throw new Error('These products/variants have different prices — a fixed price requires a shared price. Use a percentage instead, or narrow the selection.')
  }
}

function findDiscountOrThrow(config: TimeDiscountsConfig, discountId: string): TimeDiscount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Time discount ${discountId} not found`)
  return discount
}

function parseSchedule(formData: FormData): { startsAt: string; endsAt: string } {
  const startsAt = String(formData.get('startsAt') ?? '').trim()
  const endsAt = String(formData.get('endsAt') ?? '').trim()
  if (!startsAt || !endsAt) throw new Error('Start and end date/time are required')
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error('End must be after start')
  return { startsAt, endsAt }
}

function parsePricing(formData: FormData): { pricingMode: 'percent' | 'fixed'; amount: number } {
  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const amount = Number(formData.get('amount'))
  if (!(amount > 0)) throw new Error('A discount amount greater than zero is required')
  return { pricingMode, amount }
}

export async function createTimeDiscount(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('A name is required')

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const { startsAt, endsAt } = parseSchedule(formData)
  const { pricingMode, amount } = parsePricing(formData)

  const { selection, resolvedMembers } = await resolveSelection(formData)
  await assertMembersAvailable(resolvedMembers)
  await assertPricingAllowed(resolvedMembers, pricingMode)

  const timezone = await getShopTimezone()
  const shopifyDiscountId = await createShopifyDiscountRecord({
    title,
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    resolvedMembers,
    pricingMode,
    amount,
  })

  const config = await getTimeDiscountsConfig()
  const discountId = `time_disc_${crypto.randomUUID()}`
  const newDiscount: TimeDiscount = {
    discountId, shopifyDiscountId, name, title, pricingMode, amount, startsAt, endsAt, selection, resolvedMembers,
  }
  await saveTimeDiscountsConfig({ discounts: [...config.discounts, newDiscount] })
  await syncTimeDiscountMetafields(newDiscount)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function updateTimeDiscountSelection(discountId: string, formData: FormData): Promise<void> {
  const { selection, resolvedMembers } = await resolveSelection(formData)
  await assertMembersAvailable(resolvedMembers, discountId)

  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  await assertPricingAllowed(resolvedMembers, discount.pricingMode)

  const previousProductIds = new Set(discount.resolvedMembers.map((m) => m.productId))
  const nextProductIds = new Set(resolvedMembers.map((m) => m.productId))
  const removed = [...previousProductIds].filter((id) => !nextProductIds.has(id))

  discount.selection = selection
  discount.resolvedMembers = resolvedMembers
  await saveTimeDiscountsConfig(config)

  await updateShopifyDiscountRecord(discount.shopifyDiscountId, {
    resolvedMembers, pricingMode: discount.pricingMode, amount: discount.amount,
  })
  if (removed.length > 0) await clearTimeDiscountMetafields(removed.map((productId) => ({ productId })))
  await syncTimeDiscountMetafields(discount)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function updateTimeDiscountSchedule(discountId: string, formData: FormData): Promise<void> {
  const { startsAt, endsAt } = parseSchedule(formData)
  const { pricingMode, amount } = parsePricing(formData)

  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  await assertPricingAllowed(discount.resolvedMembers, pricingMode)

  const timezone = await getShopTimezone()

  discount.startsAt = startsAt
  discount.endsAt = endsAt
  discount.pricingMode = pricingMode
  discount.amount = amount
  await saveTimeDiscountsConfig(config)

  await updateShopifyDiscountRecord(discount.shopifyDiscountId, {
    startsAtUtc: zonedTimeToUtc(startsAt, timezone),
    endsAtUtc: zonedTimeToUtc(endsAt, timezone),
    resolvedMembers: discount.resolvedMembers,
    pricingMode,
    amount,
  })
  await syncTimeDiscountMetafields(discount)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function updateTimeDiscountTitle(discountId: string, formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)
  discount.title = title
  await saveTimeDiscountsConfig(config)

  await updateShopifyDiscountRecord(discount.shopifyDiscountId, { title })
  await syncTimeDiscountMetafields(discount)

  await redirectWithToken(`/time-discounts/${encodeURIComponent(discountId)}`)
}

export async function deleteTimeDiscount(discountId: string): Promise<void> {
  const config = await getTimeDiscountsConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveTimeDiscountsConfig({ discounts: remaining })

  await deleteShopifyDiscountRecord(discount.shopifyDiscountId)
  await clearTimeDiscountMetafields(discount.resolvedMembers)

  await redirectWithToken('/')
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run tests/timeDiscounts/actions.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shop.ts tests/lib/shop.test.ts src/timeDiscounts/actions.ts tests/timeDiscounts/actions.test.ts
git commit -m "Add shop timezone utilities and time discount server actions"
```

---

### Task 6: Picker server actions

**Files:**
- Create: `src/timeDiscounts/pickerActions.ts`
- Test: `tests/timeDiscounts/pickerActions.test.ts`

**Interfaces:**
- Consumes: `searchProducts`, `getProductVariantOptions`, `type ProductSearchResult`, `type ProductVariantOption` from `@/lib/products` (existing, unchanged); `searchCollections`, `type CollectionSearchResult` from `@/lib/collections` (Task 2); `getConfig` from `@/lib/config` (existing); `getTimeDiscountsConfig` from `@/timeDiscounts/config` (Task 1); `isAvailableEverywhere` from `@/lib/discountAvailability` (Task 3).
- Produces:
  ```ts
  function searchTimeDiscountProductsAction(query: string, excludeDiscountId?: string): Promise<ProductSearchResult[]>
  function getTimeDiscountProductVariantsAction(productId: string, excludeDiscountId?: string): Promise<ProductVariantOption[]>
  type ValidateMemberResult = { ok: true } | { ok: false; error: string }
  function validateTimeDiscountMemberAction(productId: string, variantId: string | undefined, excludeDiscountId?: string): Promise<ValidateMemberResult>
  function searchTimeDiscountCollectionsAction(query: string): Promise<CollectionSearchResult[]>
  ```
  These match the existing `memberPickerActions.ts`'s exact contract shape (Task 7's picker component consumes them the same way the existing `MemberPicker` consumes the existing actions), except every check now goes through `isAvailableEverywhere` against both configs, not just one.

- [ ] **Step 1: Write the failing tests**

Create `tests/timeDiscounts/pickerActions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchTimeDiscountProductsAction, getTimeDiscountProductVariantsAction,
  validateTimeDiscountMemberAction, searchTimeDiscountCollectionsAction,
} from '@/timeDiscounts/pickerActions'
import * as productsLib from '@/lib/products'
import * as collectionsLib from '@/lib/collections'
import * as configLib from '@/lib/config'
import * as timeConfigLib from '@/timeDiscounts/config'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
})

describe('searchTimeDiscountProductsAction', () => {
  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockRejectedValue(new Error('boom'))
    expect(await searchTimeDiscountProductsAction('tuna')).toEqual([])
  })

  it('drops a single-variant result already claimed by the existing tiered-discount system', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    expect(await searchTimeDiscountProductsAction('tuna')).toEqual([])
  })

  it('drops a single-variant result already claimed by another time discount', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({
      discounts: [{
        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      }],
    })
    expect(await searchTimeDiscountProductsAction('tuna')).toEqual([])
  })

  it('keeps a result claimed only by the discount being edited', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({
      discounts: [{
        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      }],
    })
    expect(await searchTimeDiscountProductsAction('tuna', 'time_disc_1')).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
  })
})

describe('getTimeDiscountProductVariantsAction', () => {
  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(productsLib, 'getProductVariantOptions').mockRejectedValue(new Error('boom'))
    expect(await getTimeDiscountProductVariantsAction('gid://shopify/Product/1')).toEqual([])
  })
})

describe('validateTimeDiscountMemberAction', () => {
  it('rejects a product already claimed by another discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    expect(await validateTimeDiscountMemberAction('gid://shopify/Product/1', undefined)).toEqual({ ok: false, error: 'This product already belongs to another discount' })
  })

  it('allows a product that is free', async () => {
    expect(await validateTimeDiscountMemberAction('gid://shopify/Product/1', undefined)).toEqual({ ok: true })
  })
})

describe('searchTimeDiscountCollectionsAction', () => {
  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(collectionsLib, 'searchCollections').mockRejectedValue(new Error('boom'))
    expect(await searchTimeDiscountCollectionsAction('summer')).toEqual([])
  })

  it('passes through results on success', async () => {
    vi.spyOn(collectionsLib, 'searchCollections').mockResolvedValue([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
    expect(await searchTimeDiscountCollectionsAction('summer')).toEqual([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/timeDiscounts/pickerActions.test.ts
```

Expected: FAIL — `@/timeDiscounts/pickerActions` doesn't exist yet.

- [ ] **Step 3: Create `src/timeDiscounts/pickerActions.ts`**

```ts
'use server'

import { searchProducts, getProductVariantOptions, type ProductSearchResult, type ProductVariantOption } from '@/lib/products'
import { searchCollections, type CollectionSearchResult } from '@/lib/collections'
import { getConfig } from '@/lib/config'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import { isAvailableEverywhere } from '@/lib/discountAvailability'

/**
 * Backs the picker's search box. Fires on every debounced keystroke — both
 * configs are fetched once per call, not once per candidate, matching the
 * existing product-discount picker's efficiency. Drops anything already
 * claimed by ANY discount, of either kind.
 */
export async function searchTimeDiscountProductsAction(query: string, excludeDiscountId?: string): Promise<ProductSearchResult[]> {
  try {
    const results = await searchProducts(query)
    const [productConfig, timeConfig] = await Promise.all([getConfig(), getTimeDiscountsConfig()])

    const available = await Promise.all(
      results.map(async (product) => {
        if (product.variantCount <= 1) {
          return isAvailableEverywhere(productConfig, timeConfig, product.id, undefined, excludeDiscountId)
        }
        const variants = await getProductVariantOptions(product.id)
        return variants.some((v) => isAvailableEverywhere(productConfig, timeConfig, product.id, v.variantId, excludeDiscountId))
      }),
    )
    return results.filter((_, i) => available[i])
  } catch (err) {
    console.error('[searchTimeDiscountProductsAction] search failed:', err)
    return []
  }
}

/** Backs the picker's "select specific variants" expansion for a multi-variant product. */
export async function getTimeDiscountProductVariantsAction(productId: string, excludeDiscountId?: string): Promise<ProductVariantOption[]> {
  try {
    const variants = await getProductVariantOptions(productId)
    const [productConfig, timeConfig] = await Promise.all([getConfig(), getTimeDiscountsConfig()])
    return variants.filter((v) => isAvailableEverywhere(productConfig, timeConfig, productId, v.variantId, excludeDiscountId))
  } catch (err) {
    console.error('[getTimeDiscountProductVariantsAction] lookup failed:', err)
    return []
  }
}

export type ValidateMemberResult = { ok: true } | { ok: false; error: string }

/** Validates a candidate (product, variant) before it's added in the UI — must not already belong to a different discount, of either kind. */
export async function validateTimeDiscountMemberAction(
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): Promise<ValidateMemberResult> {
  const [productConfig, timeConfig] = await Promise.all([getConfig(), getTimeDiscountsConfig()])
  if (!isAvailableEverywhere(productConfig, timeConfig, productId, variantId, excludeDiscountId)) {
    return {
      ok: false,
      error: variantId ? 'This variant already belongs to another discount' : 'This product already belongs to another discount',
    }
  }
  return { ok: true }
}

/** Backs the Collections-mode picker's search box. */
export async function searchTimeDiscountCollectionsAction(query: string): Promise<CollectionSearchResult[]> {
  try {
    return await searchCollections(query)
  } catch (err) {
    console.error('[searchTimeDiscountCollectionsAction] search failed:', err)
    return []
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/timeDiscounts/pickerActions.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/timeDiscounts/pickerActions.ts tests/timeDiscounts/pickerActions.test.ts
git commit -m "Add time discount picker server actions"
```

---

### Task 7: Products-mode picker component

**Files:**
- Create: `src/timeDiscounts/components/TimeProductPicker.tsx`

**Interfaces:**
- Consumes: `searchTimeDiscountProductsAction`, `getTimeDiscountProductVariantsAction`, `validateTimeDiscountMemberAction` (Task 6).
- Produces:
  ```ts
  export type SelectedMember = { productId: string; variantId?: string; title: string; price: number }
  export default function TimeProductPicker(props: { initialMembers?: SelectedMember[]; excludeDiscountId?: string; onMembersChange?: (members: SelectedMember[]) => void }): JSX.Element
  ```
  Emits hidden `member-{i}-productId`/`member-{i}-variantId` inputs, matching the form-field convention Task 5's actions parse.

No dedicated test file for this task — this repo has no component-test harness for React components (matching the existing `MemberPicker.tsx`'s own precedent). Verified via the `tsc --noEmit` check in Step 2 below, and end-to-end in Task 10's page once it's wired up.

- [ ] **Step 1: Create `src/timeDiscounts/components/TimeProductPicker.tsx`**

This is a from-scratch reimplementation of the existing `MemberPicker.tsx`'s behavior against the new module's actions — deliberate duplication per this plan's Global Constraints, not a copy-paste-and-edit of the existing file (do not import from `@/components/MemberPicker`).

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import {
  searchTimeDiscountProductsAction, getTimeDiscountProductVariantsAction, validateTimeDiscountMemberAction,
} from '@/timeDiscounts/pickerActions'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

export type SelectedMember = { productId: string; variantId?: string; title: string; price: number }

function isMemberSelected(members: SelectedMember[], productId: string, variantId?: string): boolean {
  return members.some((m) => m.productId === productId && m.variantId === variantId)
}

export default function TimeProductPicker({
  initialMembers,
  excludeDiscountId,
  onMembersChange,
}: {
  initialMembers?: SelectedMember[]
  excludeDiscountId?: string
  onMembersChange?: (members: SelectedMember[]) => void
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

  useEffect(() => {
    onMembersChange?.(selected)
  }, [selected, onMembersChange])

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
      const matches = await searchTimeDiscountProductsAction(value, excludeDiscountId)
      if (generation === generationRef.current) {
        const filtered = matches.filter((m) => {
          if (m.variantCount <= 1) return !isMemberSelected(selected, m.id, undefined)
          const selectedCount = selected.filter((s) => s.productId === m.id).length
          return selectedCount < m.variantCount
        })
        setResults(filtered)
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
      const options = await getTimeDiscountProductVariantsAction(candidate.id, excludeDiscountId)
      setExpanding(candidate)
      setVariantOptions(options.filter((o) => !isMemberSelected(selected, candidate.id, o.variantId)))
      return
    }

    if (isMemberSelected(selected, candidate.id, undefined)) {
      setError('This product is already added')
      return
    }

    const check = await validateTimeDiscountMemberAction(candidate.id, undefined, excludeDiscountId)
    if (!check.ok) {
      setError(check.error)
      return
    }

    const [onlyVariant] = await getTimeDiscountProductVariantsAction(candidate.id)
    const member: SelectedMember = { productId: candidate.id, title: candidate.title, price: onlyVariant?.price ?? 0 }
    setSelected((prev) => (isMemberSelected(prev, member.productId, member.variantId) ? prev : [...prev, member]))
  }

  async function addVariant(option: ProductVariantOption) {
    if (!expanding) return

    if (isMemberSelected(selected, expanding.id, option.variantId)) {
      setError('This variant is already added')
      return
    }

    const check = await validateTimeDiscountMemberAction(expanding.id, option.variantId, excludeDiscountId)
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
    setSelected((prev) => (isMemberSelected(prev, member.productId, member.variantId) ? prev : [...prev, member]))
    setExpanding(null)
    setVariantOptions([])
  }

  function removeMember(index: number) {
    setSelected((prev) => prev.filter((_, i) => i !== index))
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
        <label htmlFor="time-discount-member-search" className="sr-only">
          Search for a product to add
        </label>
        <input
          id="time-discount-member-search"
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

- [ ] **Step 2: Verify the file is internally type-correct**

```bash
npx tsc --noEmit 2>&1 | grep TimeProductPicker
```

Expected: no output (no errors referencing this file). Errors in other files that don't yet import this component are expected until later tasks wire it up.

- [ ] **Step 3: Commit**

```bash
git add src/timeDiscounts/components/TimeProductPicker.tsx
git commit -m "Add the products-mode picker for time discounts"
```

---

### Task 8: Collections-mode picker component

**Files:**
- Create: `src/timeDiscounts/components/TimeCollectionPicker.tsx`

**Interfaces:**
- Consumes: `searchTimeDiscountCollectionsAction` (Task 6).
- Produces:
  ```ts
  export type SelectedCollection = { id: string; title: string }
  export default function TimeCollectionPicker(props: { initialCollections?: SelectedCollection[]; onCollectionsChange?: (collections: SelectedCollection[]) => void }): JSX.Element
  ```
  Emits repeated hidden `collectionId` inputs, matching `parseCollectionIdsFromForm`'s `formData.getAll('collectionId')` convention from Task 5.

No dedicated test file — same rationale as Task 7 (no component-test harness in this repo).

- [ ] **Step 1: Create `src/timeDiscounts/components/TimeCollectionPicker.tsx`**

Deliberately simpler than `TimeProductPicker` — no variant expansion, no cross-kind availability check (collection membership is resolved and checked server-side at save time, per spec §4/§6, not per-keystroke in the picker).

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { searchTimeDiscountCollectionsAction } from '@/timeDiscounts/pickerActions'
import type { CollectionSearchResult } from '@/lib/collections'

export type SelectedCollection = { id: string; title: string }

function isCollectionSelected(collections: SelectedCollection[], id: string): boolean {
  return collections.some((c) => c.id === id)
}

export default function TimeCollectionPicker({
  initialCollections,
  onCollectionsChange,
}: {
  initialCollections?: SelectedCollection[]
  onCollectionsChange?: (collections: SelectedCollection[]) => void
}) {
  const [selected, setSelected] = useState<SelectedCollection[]>(initialCollections ?? [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CollectionSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    onCollectionsChange?.(selected)
  }, [selected, onCollectionsChange])

  function handleQueryChange(value: string) {
    setQuery(value)
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
      const matches = await searchTimeDiscountCollectionsAction(value)
      if (generation === generationRef.current) {
        setResults(matches.filter((m) => !isCollectionSelected(selected, m.id)))
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  function addCollection(candidate: CollectionSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setSelected((prev) => (isCollectionSelected(prev, candidate.id) ? prev : [...prev, candidate]))
  }

  function removeCollection(index: number) {
    setSelected((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div>
      {selected.map((c, i) => (
        <div key={c.id} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <input type="hidden" name="collectionId" value={c.id} />
          <span className="text-sm truncate">{c.title}</span>
          <button
            type="button"
            onClick={() => removeCollection(i)}
            aria-label={`Remove ${c.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="relative">
        <label htmlFor="time-discount-collection-search" className="sr-only">
          Search for a collection to add
        </label>
        <input
          id="time-discount-collection-search"
          type="text"
          placeholder="Search for a collection to add…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button"
                  onMouseDown={() => addCollection(collection)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {collection.title}
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

- [ ] **Step 2: Verify the file is internally type-correct**

```bash
npx tsc --noEmit 2>&1 | grep TimeCollectionPicker
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/timeDiscounts/components/TimeCollectionPicker.tsx
git commit -m "Add the collections-mode picker for time discounts"
```

---

### Task 9: New discount page

**Files:**
- Create: `src/timeDiscounts/components/NewTimeDiscountForm.tsx`
- Create: `src/app/time-discounts/new/page.tsx`

**Interfaces:**
- Consumes: `createTimeDiscount` (Task 5); `TimeProductPicker`, `type SelectedMember` (Task 7); `TimeCollectionPicker`, `type SelectedCollection` (Task 8); `getShopTimezone` from `@/lib/shop` (Task 5 — already created there, since that task needed it first for the UTC conversion; this page just imports it for display).

- [ ] **Step 1: Create `src/timeDiscounts/components/NewTimeDiscountForm.tsx`**

The interactive client form. `<input type="datetime-local">` naturally produces a naive (no-offset) datetime string, matching how `TimeDiscount.startsAt`/`endsAt` are stored and displayed throughout the admin (spec §3) — conversion to the UTC values Shopify's native discount scheduling requires happens only at the Admin API boundary, inside the server actions (Task 5's `zonedTimeToUtc`), not here. `shopTimezone` is shown only as a label, so the merchant knows which timezone they're entering, in case their own device is set to a different one.

```tsx
'use client'

import { useState } from 'react'
import { createTimeDiscount } from '@/timeDiscounts/actions'
import { pricesUniform } from '@/timeDiscounts/config'
import TimeProductPicker, { type SelectedMember } from '@/timeDiscounts/components/TimeProductPicker'
import TimeCollectionPicker, { type SelectedCollection } from '@/timeDiscounts/components/TimeCollectionPicker'

export default function NewTimeDiscountForm({ shopTimezone }: { shopTimezone: string }) {
  const [selectionMode, setSelectionMode] = useState<'products' | 'collections'>('products')
  const [members, setMembers] = useState<SelectedMember[]>([])
  const [collections, setCollections] = useState<SelectedCollection[]>([])
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>('percent')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [amount, setAmount] = useState('')

  const allowFixed = selectionMode === 'products' ? pricesUniform(members.map((m) => m.price)) : true
  const hasSelection = selectionMode === 'products' ? members.length > 0 : collections.length > 0
  const hasValidSchedule = startsAt !== '' && endsAt !== '' && endsAt > startsAt
  const hasValidAmount = Number(amount) > 0
  const canSubmit = hasSelection && hasValidSchedule && hasValidAmount

  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add time-based discount</h1>

      <form action={createTimeDiscount} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">Internal name</label>
          <input
            id="name" name="name" type="text" required placeholder="e.g. Spring Flash Sale"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Only shown in this admin.</p>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
          <input
            id="title" name="title" type="text" required placeholder="e.g. Spring Flash Sale"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input
              id="startsAt" name="startsAt" type="datetime-local" required value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input
              id="endsAt" name="endsAt" type="datetime-local" required value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>
        </div>
        {startsAt !== '' && endsAt !== '' && endsAt <= startsAt && (
          <p className="text-xs text-danger -mt-4">End must be after start.</p>
        )}

        <div>
          <p className="block text-sm font-medium mb-2">Applies to</p>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={selectionMode === 'products'} onChange={() => setSelectionMode('products')} />
              Specific products / variants
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={selectionMode === 'collections'} onChange={() => setSelectionMode('collections')} />
              Collections
            </label>
          </div>
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === 'products' ? (
            <TimeProductPicker onMembersChange={setMembers} />
          ) : (
            <TimeCollectionPicker onCollectionsChange={setCollections} />
          )}
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Discount</p>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="pricingMode" value="percent" checked={pricingMode === 'percent'} onChange={() => setPricingMode('percent')} />
              Percentage off
            </label>
            {allowFixed && (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="pricingMode" value="fixed" checked={pricingMode === 'fixed'} onChange={() => setPricingMode('fixed')} />
                Fixed price
              </label>
            )}
          </div>
          {!allowFixed && pricingMode === 'fixed' && setPricingMode('percent') as unknown as null}
          <label htmlFor="amount" className="sr-only">Amount</label>
          <input
            id="amount" name="amount" type="number" min="0.01" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={pricingMode === 'percent' ? '% off (e.g. 20)' : 'Price each (e.g. 1.50)'}
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          {!allowFixed && <p className="text-xs text-muted mt-2">These products/variants have different prices, so only a percentage discount is available.</p>}
        </div>

        <div>
          <button
            type="submit" disabled={!canSubmit}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            Create discount
          </button>
          {!canSubmit && (
            <p className="text-xs text-muted mt-2">Add a name/title, a valid start and end time, at least one product/variant or collection, and a discount amount to continue.</p>
          )}
        </div>
      </form>
    </main>
  )
}
```

The `{!allowFixed && pricingMode === 'fixed' && setPricingMode('percent') as unknown as null}` line calling a state setter during render is a code smell flagged deliberately: **do not implement it this way**. Replace it with a `useEffect`:

```tsx
useEffect(() => {
  if (!allowFixed && pricingMode === 'fixed') setPricingMode('percent')
}, [allowFixed, pricingMode])
```

placed above the `return` (add `useEffect` to the `react` import). This mirrors the existing `PricingModeTierFields`'s own fallback-on-invalid-mode pattern exactly (same effect, same reasoning: membership changing after mount can invalidate an already-selected fixed mode).

- [ ] **Step 2: Create `src/app/time-discounts/new/page.tsx`**

```tsx
import { getShopTimezone } from '@/lib/shop'
import NewTimeDiscountForm from '@/timeDiscounts/components/NewTimeDiscountForm'

export default async function NewTimeDiscountPage() {
  const shopTimezone = await getShopTimezone()
  return <NewTimeDiscountForm shopTimezone={shopTimezone} />
}
```

- [ ] **Step 3: Verify the new files are internally type-correct**

```bash
npx tsc --noEmit 2>&1 | grep -E "NewTimeDiscountForm|time-discounts/new"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/timeDiscounts/components/NewTimeDiscountForm.tsx src/app/time-discounts/new/page.tsx
git commit -m "Add the new time discount page"
```

---

### Task 10: Edit discount page + home page integration

**Files:**
- Create: `src/app/time-discounts/[discountId]/page.tsx`
- Modify: `src/app/page.tsx` (add the time-discounts list alongside the existing one)

**Interfaces:**
- Consumes: `getTimeDiscountsConfig`, `type TimeDiscount` (Task 1); `updateTimeDiscountSelection`, `updateTimeDiscountSchedule`, `updateTimeDiscountTitle`, `deleteTimeDiscount` (Task 5); `getShopTimezone`, `zonedTimeToUtc` from `@/lib/shop` (Task 5); `TimeProductPicker` (Task 7); `TimeCollectionPicker` (Task 8); `getMemberInfo` from `@/lib/products` (existing); `ConfirmForm`, `AuthLink` from `@/components/` (existing, neutral UI — reused directly, not duplicated, per this plan's Global Constraints).

**Design note on selection editing:** the edit page shows which mode the discount uses (Products or Collections) as a static label, with only that mode's picker rendered for editing membership — **no interactive mode-switch toggle on this page**. This deliberately avoids the exact class of bug this app already hit once and fixed (an interactive toggle on an edit page whose action didn't actually honor the submitted value) — even though `updateTimeDiscountSchedule`'s `pricingMode` toggle IS safe (Task 5 built it to genuinely respect whatever is submitted), switching *selection mode* after creation is a bigger structural change the spec never asked for (§4: the choice is forced once, upfront). Not offering it on edit is the conservative, spec-consistent choice.

**Design note on activation controls:** there is no "Go live"/"Take offline" toggle on this page, and no local status to flip — Shopify's own native scheduling on the discount's `DiscountAutomaticApp` record decides activation from `startsAt`/`endsAt` (spec §5). The page shows a computed, display-only Upcoming/Active/Expired label (same `zonedTimeToUtc` conversion Task 5's actions use, applied here just for comparison against the current instant) and offers only Delete as a direct action.

- [ ] **Step 1: Create `src/app/time-discounts/[discountId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import {
  updateTimeDiscountSelection, updateTimeDiscountSchedule, updateTimeDiscountTitle, deleteTimeDiscount,
} from '@/timeDiscounts/actions'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { getMemberInfo } from '@/lib/products'
import TimeProductPicker from '@/timeDiscounts/components/TimeProductPicker'
import TimeCollectionPicker, { type SelectedCollection } from '@/timeDiscounts/components/TimeCollectionPicker'
import ConfirmForm from '@/components/ConfirmForm'
import AuthLink from '@/components/AuthLink'

export default async function TimeDiscountPage({
  params,
}: {
  params: Promise<{ discountId: string }>
}) {
  const { discountId: encodedDiscountId } = await params
  const discountId = decodeURIComponent(encodedDiscountId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getTimeDiscountsConfig()
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) notFound()

  const memberInfo = await getMemberInfo(discount.resolvedMembers)
  const basePrice = memberInfo[0]?.price ?? 0
  const resultingPrice = discount.pricingMode === 'fixed'
    ? Math.min(discount.amount, basePrice)
    : Math.round(basePrice * (1 - discount.amount / 100) * 100) / 100

  const timezone = await getShopTimezone()
  const startsAtMs = new Date(zonedTimeToUtc(discount.startsAt, timezone)).getTime()
  const endsAtMs = new Date(zonedTimeToUtc(discount.endsAt, timezone)).getTime()
  const nowMs = Date.now()
  const scheduleLabel = nowMs < startsAtMs ? 'Upcoming' : nowMs < endsAtMs ? 'Active' : 'Expired'

  const updateSelectionWithId = updateTimeDiscountSelection.bind(null, discountId)
  const updateScheduleWithId = updateTimeDiscountSchedule.bind(null, discountId)
  const updateTitleWithId = updateTimeDiscountTitle.bind(null, discountId)
  const remove = deleteTimeDiscount.bind(null, discountId)

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
        {scheduleLabel} · {discount.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · time-based
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Title</h2>
        <form action={updateTitleWithId} className="space-y-2">
          <div className="flex gap-2">
            <label htmlFor="title" className="sr-only">Title</label>
            <input
              id="title" name="title" type="text" required defaultValue={discount.title}
              className="flex-1 border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            />
            <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Save title
            </button>
          </div>
          <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Applies to — {discount.selection.mode === 'products' ? 'specific products/variants' : 'collections'}</h2>
        <form action={updateSelectionWithId} className="space-y-3">
          <input type="hidden" name="selectionMode" value={discount.selection.mode} />
          {discount.selection.mode === 'products' ? (
            <TimeProductPicker
              initialMembers={memberInfo.map((m) => ({ productId: m.productId, variantId: m.variantId, title: m.title, price: m.price }))}
              excludeDiscountId={discountId}
            />
          ) : (
            <TimeCollectionPicker
              initialCollections={discount.selection.collectionIds.map((id): SelectedCollection => ({ id, title: id }))}
            />
          )}
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Save selection
          </button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule &amp; discount</h2>
        <form action={updateScheduleWithId} className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts</label>
              <input
                id="startsAt" name="startsAt" type="datetime-local" required defaultValue={discount.startsAt}
                className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
              />
            </div>
            <div>
              <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends</label>
              <input
                id="endsAt" name="endsAt" type="datetime-local" required defaultValue={discount.endsAt}
                className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="pricingMode" value="percent" defaultChecked={discount.pricingMode === 'percent'} />
              Percentage off
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="pricingMode" value="fixed" defaultChecked={discount.pricingMode === 'fixed'} />
              Fixed price
            </label>
          </div>
          <label htmlFor="amount" className="sr-only">Amount</label>
          <input
            id="amount" name="amount" type="number" min="0.01" step="0.01" required defaultValue={discount.amount}
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Save schedule &amp; discount
          </button>
        </form>
      </section>

      {memberInfo.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting price</h2>
          <p className="text-sm">
            £{basePrice.toFixed(2)} → £{resultingPrice.toFixed(2)}
            {discount.selection.mode === 'collections' && (
              <span className="text-muted text-xs"> (based on the first resolved member — see the design note on collections and shared pricing)</span>
            )}
          </p>
        </section>
      )}

      <section className="flex gap-3">
        <ConfirmForm action={remove} confirmMessage="Delete this discount entirely? This cannot be undone.">
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            Delete
          </button>
        </ConfirmForm>
      </section>
    </main>
  )
}
```

`TimeCollectionPicker`'s `initialCollections` is seeded with `{id, title: id}` (the title isn't stored, only `collectionIds` — see Task 1's data model) — the picker will show the raw GID as a placeholder label until the merchant interacts with it. Flagged here rather than silently shipped: if this reads as confusing in practice, a follow-up could resolve collection titles server-side for display (a small addition to `resolveCollectionMembers` or a new lookup), but it's out of scope for this plan per the spec's "out of scope" list discipline — not build now.

- [ ] **Step 2: Modify `src/app/page.tsx` to list both discount kinds**

Read the current file first, then add the time-discounts section. The new content to add (as a second section below the existing one, not replacing it):

```tsx
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
```

Add these imports alongside the existing ones, then inside the component body, after `const rows = await Promise.all(...)` for the existing discounts, add:

```tsx
  const timeConfig = await getTimeDiscountsConfig()
  const shopTimezone = await getShopTimezone()
  const nowMs = Date.now()
  function scheduleLabel(startsAt: string, endsAt: string): string {
    const startsAtMs = new Date(zonedTimeToUtc(startsAt, shopTimezone)).getTime()
    const endsAtMs = new Date(zonedTimeToUtc(endsAt, shopTimezone)).getTime()
    return nowMs < startsAtMs ? 'Upcoming' : nowMs < endsAtMs ? 'Active' : 'Expired'
  }
```

Then, inside the returned JSX, after the existing discounts `<ul>`/empty-state block and its closing `)}`, add a second section:

```tsx
      <div className="flex items-center justify-between mb-6 mt-10">
        <h2 className="text-xl font-semibold">Time-based discounts</h2>
        <AuthLink
          href="/time-discounts/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add time-based discount
        </AuthLink>
      </div>

      {timeConfig.discounts.length === 0 ? (
        <p className="text-muted">No time-based discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {timeConfig.discounts.map((row) => (
            <li key={row.discountId} className="py-4">
              <AuthLink
                href={`/time-discounts/${encodeURIComponent(row.discountId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.name}
              </AuthLink>
              <p className="text-sm text-muted">
                {scheduleLabel(row.startsAt, row.endsAt)} · {row.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {row.startsAt} → {row.endsAt} · {row.resolvedMembers.length} product{row.resolvedMembers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
```

This keeps the two discount kinds on one page (per spec §4's "unified admin list" decision) as two clearly-separated sections, each rendered from its own module's data — not a shared row-renderer, matching the isolation boundary.

- [ ] **Step 3: Verify the new/modified files are internally type-correct**

```bash
npx tsc --noEmit 2>&1 | grep -E "time-discounts|app/page.tsx"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/time-discounts/[discountId]/page.tsx src/app/page.tsx
git commit -m "Add the time discount edit page and list it on the home page"
```

---

### Task 11: Countdown widget Liquid block

**Files:**
- Create: `extensions/product-tier-pricing/blocks/time-based-discount.liquid`
- Create: `extensions/product-tier-pricing/assets/time-based-discount.css`

**Interfaces:**
- Produces: a `<div data-sparkly-time-discount data-discount='...'>` container Task 12's JS mounts against, with `data-discount` JSON containing `{title, startsAt, endsAt}` (matches Task 4's `TimeDiscountMetafieldValue`'s customer-facing subset — `discountId`/`pricingMode`/`amount` aren't needed storefront-side, per spec §7's countdown-only scope).

New block inside the *existing* `product-tier-pricing` extension (own schema entry, independently placeable in the theme editor) — not a second extension, per spec §7.

- [ ] **Step 1: Create `extensions/product-tier-pricing/blocks/time-based-discount.liquid`**

```liquid
{% comment %}
  Countdown-only widget for time-based discounts — shows "Sale ends in:
  DAY HRS MINS SECS" while product.metafields.sparkly_time_discounts.discount
  is present and the current moment is within the discount's window.
  Renders nothing (an empty, hidden container) otherwise; JS decides
  visibility live, since a page can be open while the window opens or
  closes (see extensions/product-tier-pricing/assets/time-based-discount.js).
  Does not show pricing — the actual discount applies at cart/checkout via
  the time-based-discount Shopify Function, independently of this widget.
{% endcomment %}
{%- assign discount_metafield = product.metafields.sparkly_time_discounts.discount -%}
{%- assign discount_json = 'null' -%}
{%- if discount_metafield != blank -%}
  {%- capture discount_json_raw -%}
    {
      "title": {{ discount_metafield.value.title | json }},
      "startsAt": {{ discount_metafield.value.startsAt | json }},
      "endsAt": {{ discount_metafield.value.endsAt | json }}
    }
  {%- endcapture -%}
  {%- assign discount_json = discount_json_raw | strip | escape -%}
{%- endif -%}
<div
  id="sparkly-time-discount-{{ block.id }}"
  class="sparkly-time-discount"
  data-sparkly-time-discount
  data-discount='{{ discount_json }}'
  style="--sparkly-time-discount-color: {{ block.settings.countdown_color }};"
  hidden
>
  <p class="sparkly-time-discount__label" data-time-discount-label></p>
  <div class="sparkly-time-discount__boxes">
    <div class="sparkly-time-discount__box">
      <span class="sparkly-time-discount__value" data-time-discount-days>00</span>
      <span class="sparkly-time-discount__unit">DAY</span>
    </div>
    <div class="sparkly-time-discount__box">
      <span class="sparkly-time-discount__value" data-time-discount-hours>00</span>
      <span class="sparkly-time-discount__unit">HRS</span>
    </div>
    <div class="sparkly-time-discount__box">
      <span class="sparkly-time-discount__value" data-time-discount-minutes>00</span>
      <span class="sparkly-time-discount__unit">MINS</span>
    </div>
    <div class="sparkly-time-discount__box">
      <span class="sparkly-time-discount__value" data-time-discount-seconds>00</span>
      <span class="sparkly-time-discount__unit">SECS</span>
    </div>
  </div>
</div>

{% schema %}
{
  "name": "t:name",
  "target": "section",
  "stylesheet": "time-based-discount.css",
  "javascript": "time-based-discount.js",
  "settings": [
    {
      "type": "color",
      "id": "countdown_color",
      "label": "t:countdown_color_label",
      "default": "#e35d4f"
    }
  ]
}
{% endschema %}
```

The block starts `hidden` in markup (server-rendered state is always "unknown/closed" since evaluating the window requires the customer's live clock, not just server-render time) — Task 12's JS removes `hidden` only once it confirms the window is actually active, matching spec §7's "only renders once the window is active" rule.

- [ ] **Step 2: Add the locale key**

Modify `extensions/product-tier-pricing/locales/en.default.json` — read it first, then add (alongside whatever keys already exist for the other block, without removing them):

```json
"countdown_color_label": "Countdown box color"
```

- [ ] **Step 3: Create `extensions/product-tier-pricing/assets/time-based-discount.css`**

```css
/* extensions/product-tier-pricing/assets/time-based-discount.css */

.sparkly-time-discount {
  --sparkly-time-discount-ink: var(--color-text-main, #2a2a22);
  --sparkly-time-discount-radius: var(--border-radius-cards, 8px);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-family: var(--font-stack-body);
}

.sparkly-time-discount__label {
  font-family: var(--font-stack-headings);
  font-weight: 600;
  color: var(--sparkly-time-discount-ink);
  margin: 0;
}

.sparkly-time-discount__boxes {
  display: flex;
  gap: 8px;
}

.sparkly-time-discount__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.sparkly-time-discount__value {
  background: var(--sparkly-time-discount-color, #e35d4f);
  color: #fff;
  font-family: var(--font-stack-headings);
  font-weight: 700;
  font-size: 1.25rem;
  line-height: 1;
  min-width: 2.5rem;
  text-align: center;
  padding: 8px 6px;
  border-radius: var(--sparkly-time-discount-radius);
}

.sparkly-time-discount__unit {
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  color: var(--sparkly-time-discount-ink);
  opacity: 0.7;
}
```

- [ ] **Step 4: Commit**

```bash
git add extensions/product-tier-pricing/blocks/time-based-discount.liquid extensions/product-tier-pricing/assets/time-based-discount.css extensions/product-tier-pricing/locales/en.default.json
git commit -m "Add the countdown widget Liquid block"
```

---

### Task 12: Countdown widget JS

**Files:**
- Create: `extensions/product-tier-pricing/assets/time-based-discount.js`
- Create: `extensions/product-tier-pricing-tests/time-based-discount.test.js`

**Interfaces:**
- Produces (pure, exported for testing):
  ```js
  function computeCountdown(startsAt, endsAt, now) // -> { active: boolean, days, hours, minutes, seconds }
  function formatCountdownUnit(n) // -> two-digit zero-padded string
  ```
  No imports from or edits to `tier-pricing.js` — a fully independent bootstrap, mirroring its structure (pure math above `module.exports`, DOM painting below) without sharing code.

- [ ] **Step 1: Write the failing tests**

Create `extensions/product-tier-pricing-tests/time-based-discount.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { computeCountdown, formatCountdownUnit } = require('../product-tier-pricing/assets/time-based-discount.js')

test('computeCountdown: inactive before the window starts', () => {
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-05-31T23:59:59'))
  assert.equal(result.active, false)
})

test('computeCountdown: inactive at or after the window ends', () => {
  const atEnd = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-06-02T00:00:00'))
  assert.equal(atEnd.active, false)
  const pastEnd = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-06-02T00:00:01'))
  assert.equal(pastEnd.active, false)
})

test('computeCountdown: active exactly at the start, full window remaining', () => {
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-06-01T00:00:00'))
  assert.equal(result.active, true)
  assert.equal(result.days, 1)
  assert.equal(result.hours, 0)
  assert.equal(result.minutes, 0)
  assert.equal(result.seconds, 0)
})

test('computeCountdown: splits remaining time into days/hours/minutes/seconds', () => {
  // 1 day, 12 hours, 23 minutes, 57 seconds remaining
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-03T12:23:57', new Date('2026-06-02T00:00:00'))
  assert.equal(result.active, true)
  assert.equal(result.days, 1)
  assert.equal(result.hours, 12)
  assert.equal(result.minutes, 23)
  assert.equal(result.seconds, 57)
})

test('computeCountdown: just under one minute remaining rounds down to 0 minutes, correct seconds', () => {
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-01T00:00:59', new Date('2026-06-01T00:00:00'))
  assert.equal(result.active, true)
  assert.equal(result.days, 0)
  assert.equal(result.hours, 0)
  assert.equal(result.minutes, 0)
  assert.equal(result.seconds, 59)
})

test('formatCountdownUnit: zero-pads single digits', () => {
  assert.equal(formatCountdownUnit(0), '00')
  assert.equal(formatCountdownUnit(5), '05')
  assert.equal(formatCountdownUnit(23), '23')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd extensions/product-tier-pricing-tests && node --test time-based-discount.test.js
```

Expected: FAIL — `../product-tier-pricing/assets/time-based-discount.js` doesn't exist yet.

- [ ] **Step 3: Create `extensions/product-tier-pricing/assets/time-based-discount.js`**

```js
// extensions/product-tier-pricing/assets/time-based-discount.js
// Independent widget, no imports from or edits to tier-pricing.js. Pure
// math first, DOM last — mirrors that file's own structure without
// sharing code with it.

// Pure countdown math

/**
 * Both startsAt/endsAt and `now` are treated as naive shop-local
 * timestamps (no timezone offset) — the admin's <input type="datetime-local">
 * already produces exactly this shape, and the storefront widget reads the
 * customer's own device clock, which is what the countdown should visually
 * match. This is independent of checkout: the Function never evaluates a
 * time window itself (spec §5 — Shopify's native discount scheduling does,
 * server-side, using the UTC dates on the discount record), so this
 * client-side countdown and the actual activation moment can drift by
 * whatever gap exists between the customer's clock and Shopify's — the
 * same class of imprecision any client-side countdown has, and no worse
 * than before.
 */
function computeCountdown(startsAt, endsAt, now) {
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  const nowMs = now.getTime()

  if (nowMs < start || nowMs >= end) {
    return { active: false, days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  const remainingMs = end - nowMs
  const DAY_MS = 24 * 60 * 60 * 1000
  const HOUR_MS = 60 * 60 * 1000
  const MINUTE_MS = 60 * 1000

  const days = Math.floor(remainingMs / DAY_MS)
  const hours = Math.floor((remainingMs % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS)
  const seconds = Math.floor((remainingMs % MINUTE_MS) / 1000)

  return { active: true, days, hours, minutes, seconds }
}

function formatCountdownUnit(n) {
  return String(n).padStart(2, '0')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeCountdown, formatCountdownUnit }
}

// DOM: element painting and per-widget setup

if (typeof document !== 'undefined') {
  function paintCountdown(elements, countdown, title) {
    if (!countdown.active) {
      elements.container.hidden = true
      return
    }
    elements.container.hidden = false
    elements.label.textContent = title ? `${title} ends in:` : 'Sale ends in:'
    elements.days.textContent = formatCountdownUnit(countdown.days)
    elements.hours.textContent = formatCountdownUnit(countdown.hours)
    elements.minutes.textContent = formatCountdownUnit(countdown.minutes)
    elements.seconds.textContent = formatCountdownUnit(countdown.seconds)
  }

  function queryWidgetElements(container) {
    return {
      container,
      label: container.querySelector('[data-time-discount-label]'),
      days: container.querySelector('[data-time-discount-days]'),
      hours: container.querySelector('[data-time-discount-hours]'),
      minutes: container.querySelector('[data-time-discount-minutes]'),
      seconds: container.querySelector('[data-time-discount-seconds]'),
    }
  }

  function initTimeDiscountWidget() {
    document.querySelectorAll('[data-sparkly-time-discount]').forEach((container) => {
      const discount = JSON.parse(container.dataset.discount)
      if (!discount) return // no time discount configured on this product — leave hidden, no timer needed

      const elements = queryWidgetElements(container)

      function tick() {
        const countdown = computeCountdown(discount.startsAt, discount.endsAt, new Date())
        paintCountdown(elements, countdown, discount.title)
      }

      tick()
      setInterval(tick, 1000)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimeDiscountWidget)
  } else {
    initTimeDiscountWidget()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd extensions/product-tier-pricing-tests && node --test time-based-discount.test.js
```

Expected: PASS, all tests green.

- [ ] **Step 5: Run the full JS test suite to confirm no regressions**

```bash
cd extensions/product-tier-pricing-tests && node --test
```

Expected: PASS — the existing 99 tests plus this file's new ones, all green (this task adds a wholly new file/test file, touching nothing the existing suite covers).

- [ ] **Step 6: Commit**

```bash
git add extensions/product-tier-pricing/assets/time-based-discount.js extensions/product-tier-pricing-tests/time-based-discount.test.js
git commit -m "Add the countdown widget JS"
```

---

### Task 13: Time-based discount Rust Function

**Files:**
- Create: `extensions/time-based-discount/shopify.extension.toml`
- Create: `extensions/time-based-discount/Cargo.toml`
- Create: `extensions/time-based-discount/src/main.rs`
- Create: `extensions/time-based-discount/src/cart_lines_discounts_generate_run.graphql`
- Create: `extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs` (includes `#[cfg(test)] mod tests`)

**Not hand-authored — CLI-scaffolded/fetched, not part of this task's steps:** `extensions/time-based-discount/schema.graphql` (the pinned Admin/Functions schema for this extension — generated by the Shopify CLI, e.g. `shopify app generate extension --template rust --name time-based-discount`, then refreshed via `shopify app function schema` if the API version changes; never hand-written, same as the existing `extensions/product-discount/schema.graphql`), `package.json`, `locales/en.default.json`, `.gitignore`, and the `uid` value inside `shopify.extension.toml` (a real UUID Shopify CLI assigns on first `shopify app generate extension`/`shopify app deploy` — cannot be fabricated; leave a placeholder comment and let the CLI fill it in when this extension is actually scaffolded).

**Interfaces:**
- Consumes: nothing from earlier tasks directly (the Function is a separate Rust binary) — but its `functionHandle` value (`"time-based-discount"`) must exactly match the `FUNCTION_HANDLE` constant Task 5's `actions.ts` uses in `discountAutomaticAppCreate`, and its metafield namespace/key (`sparkly_time_discounts` / `function_config`) must exactly match `buildFunctionConfigMetafield` in that same file — both restated here since a Rust-side implementer won't read the TypeScript file.
- Produces: the compiled `time-based-discount.wasm` Function, registered against `cart.lines.discounts.generate.run`.

**Design note — why this Function is simpler than the existing `product-discount` one:** it reads its own single discount's config from **`discount.metafield(...)`** (the "function owner" pattern — this Function is invoked once per `TimeDiscount`'s own native Shopify record, spec §5), not `shop.metafield(...)` holding an array of many discounts. There is no `status` field to check (Shopify only invokes this Function when the owning discount's native `startsAt`/`endsAt` window is open — see spec §5), no loop over `config.discounts`, and no quantity tiers (spec §2: flat discount only) — so there's also no need for the existing Function's `split_discount_by_largest_remainder` proportional-split logic, since a flat percent/fixed discount is computed independently per cart line from that line's own price and quantity, never combined across lines.

- [ ] **Step 1: Create `extensions/time-based-discount/shopify.extension.toml`**

```toml
api_version = "2026-04"

[[extensions]]
name = "Time-based discount"
handle = "time-based-discount"
type = "function"
uid = "REPLACE-WITH-CLI-GENERATED-UID"
description = "Applies a flat percent-or-fixed discount, within a merchant-scheduled time window, to the specific products/variants this discount owns."

  [[extensions.targeting]]
  target = "cart.lines.discounts.generate.run"
  input_query = "src/cart_lines_discounts_generate_run.graphql"
  export = "cart_lines_discounts_generate_run"

  [extensions.build]
  command = "cargo build --target=wasm32-unknown-unknown --release"
  path = "target/wasm32-unknown-unknown/release/time-based-discount.wasm"
  watch = [ "src/**/*.rs" ]
```

- [ ] **Step 2: Create `extensions/time-based-discount/Cargo.toml`**

```toml
[package]
name = "time-based-discount"
version = "1.0.0"
edition = "2021"

[dependencies]
shopify_function = "2.1.0"

[profile.release]
lto = true
opt-level = "z"
strip = true
```

- [ ] **Step 3: Create `extensions/time-based-discount/src/cart_lines_discounts_generate_run.graphql`**

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      cost {
        amountPerQuantity {
          amount
        }
      }
      merchandise {
        __typename
        ... on ProductVariant {
          id
          product {
            id
          }
        }
      }
    }
  }
  discount {
    discountClasses
    metafield(namespace: "sparkly_time_discounts", key: "function_config") {
      jsonValue
    }
  }
}
```

- [ ] **Step 4: Create `extensions/time-based-discount/src/main.rs`**

```rust
use shopify_function::prelude::*;
use std::process;

pub mod cart_lines_discounts_generate_run;

#[typegen("schema.graphql")]
pub mod schema {
    #[query(
        "src/cart_lines_discounts_generate_run.graphql",
        custom_scalar_overrides = {
            "Input.discount.metafield.jsonValue" => super::cart_lines_discounts_generate_run::Config
        }
    )]
    pub mod cart_lines_discounts_generate_run {}
}

fn main() {
    log!("Please invoke a named export.");
    process::abort();
}
```

- [ ] **Step 5: Create `extensions/time-based-discount/src/cart_lines_discounts_generate_run.rs`**

```rust
use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Member {
    product_id: String,
    #[shopify_function(default)]
    variant_id: Option<String>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    #[shopify_function(default)]
    resolved_members: Vec<Member>,
    /// "percent" | "fixed" — mirrors TimeDiscount.pricingMode (admin, Task 1).
    #[shopify_function(default)]
    pricing_mode: String,
    /// Percent-off, or the fixed per-unit price — meaning depends on pricing_mode.
    #[shopify_function(default)]
    amount: f64,
}

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let has_product_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Product);

    if !has_product_discount_class {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    // No status check here: Shopify only invokes this Function at all once
    // this specific discount's native startsAt/endsAt window is open (see
    // spec §5) — there is nothing left for the Function itself to verify
    // about timing.
    let config: &Config = match input.discount().metafield() {
        Some(metafield) => metafield.json_value(),
        None => return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] }),
    };

    if config.resolved_members.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let mut candidates = vec![];

    for line in input.cart().lines().iter() {
        let variant = match line.merchandise() {
            schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
            _ => continue,
        };
        let product_id = variant.product().id();
        let variant_id = variant.id();

        let matches_member = config.resolved_members.iter().any(|m| {
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

        if config.pricing_mode == "fixed" {
            // Clamp to the line's own price, same fail-safe as the existing
            // Function: never produce a negative discount (a markup).
            let fixed_price = config.amount.min(price);
            let discount_amount = ((price - fixed_price) * (*line.quantity() as f64) * 100.0).round() / 100.0;
            if discount_amount <= 0.0 {
                continue;
            }
            candidates.push(schema::ProductDiscountCandidate {
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget { id: line.id().clone(), quantity: None },
                )],
                message: Some(format!("£{:.2} each", fixed_price)),
                value: schema::ProductDiscountCandidateValue::FixedAmount(
                    schema::ProductDiscountCandidateFixedAmount {
                        amount: Decimal(discount_amount),
                        applies_to_each_item: Some(false),
                    },
                ),
                associated_discount_code: None,
                prerequisites: None,
            });
        } else {
            candidates.push(schema::ProductDiscountCandidate {
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget { id: line.id().clone(), quantity: None },
                )],
                message: Some(format!("{}% off", config.amount)),
                value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                    value: Decimal(config.amount),
                }),
                associated_discount_code: None,
                prerequisites: None,
            });
        }
    }

    if candidates.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    Ok(schema::CartLinesDiscountsGenerateRunResult {
        operations: vec![schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                selection_strategy: schema::ProductDiscountSelectionStrategy::All,
                candidates,
            },
        )],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use shopify_function::{run_function_with_input, Result};

    #[test]
    fn applies_a_percent_discount_to_a_matching_line() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "percent",
                            "amount": 25.0
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 25.0),
                _ => panic!("expected Percentage"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn applies_a_fixed_price_discount_to_a_matching_line() -> Result<()> {
        // basePrice 10.00, fixedPrice 7.50, qty 2 -> discount (10.00-7.50)*2 = 5.00
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "fixed",
                            "amount": 7.50
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                    assert!((f.amount.0 - 5.00).abs() < 1e-9, "expected 5.00, got {}", f.amount.0);
                }
                _ => panic!("expected FixedAmount"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_fixed_price_above_sticker_price_never_produces_a_markup() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "5.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "fixed",
                            "amount": 20.00
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn ignores_a_line_whose_product_is_not_in_resolved_members() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/999" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1" }],
                            "pricingMode": "percent",
                            "amount": 25.0
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn matches_a_specific_variant_only_when_variant_id_is_present() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": {
                    "discountClasses": ["PRODUCT"],
                    "metafield": {
                        "jsonValue": {
                            "resolvedMembers": [{ "productId": "gid://shopify/Product/1", "variantId": "gid://shopify/ProductVariant/901" }],
                            "pricingMode": "percent",
                            "amount": 25.0
                        }
                    }
                }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0, "variant 900 must not match a resolvedMembers entry pinned to variant 901");
        Ok(())
    }

    #[test]
    fn returns_no_operations_when_no_metafield_is_present() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "10.00" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "id": "gid://shopify/ProductVariant/900",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "discount": { "discountClasses": ["PRODUCT"], "metafield": null }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }
}
```

- [ ] **Step 6: Run the Rust test suite**

```bash
cd extensions/time-based-discount && cargo test
```

Expected: PASS, all 6 tests green. If `cargo test` fails to compile because `schema.graphql`/the Cargo workspace scaffold don't exist yet, run `shopify app generate extension --template rust --name time-based-discount` first (from the repo root) to let the Shopify CLI create the scaffold (`schema.graphql`, `package.json`, `locales/`, `.gitignore`, a real `uid`), then overwrite `shopify.extension.toml`, `Cargo.toml`, `src/main.rs`, and `src/cart_lines_discounts_generate_run.{graphql,rs}` with this task's content (keeping the CLI-assigned `uid`), and re-run `cargo test`.

- [ ] **Step 7: Commit**

```bash
git add extensions/time-based-discount/
git commit -m "Add the time-based discount Rust Function"
```

---

### Task 14: Manual verification (live store)

Everything through Task 13 is unit/type-tested but never exercised against a real Shopify store. This task is deliberately **not** automatable — flag each step to the user and get explicit go-ahead before any live/production action, per this session's standing norm (nothing in this plan merges or deploys without explicit instruction).

- [ ] **Step 1: Deploy**

```bash
shopify app deploy --allow-updates
```

Confirm the new `time-based-discount` Function extension and the new `time-based-discount.liquid` block (inside `product-tier-pricing`) both appear in the release. Note the real `functionHandle`/`uid` the CLI assigns, and confirm it matches `FUNCTION_HANDLE` in `src/timeDiscounts/actions.ts` (Task 5) — if the CLI generated a different handle than `time-based-discount`, update that constant before proceeding (this is exactly the kind of drift Step 6 of Task 13 anticipates).

- [ ] **Step 2: Create a real time discount through the live admin**

Create one products-mode and one collections-mode `TimeDiscount` with a short (~5 minute) window starting shortly in the future. Confirm in the Shopify Admin's own Discounts list that a real, native automatic discount now exists for each, with the correct `startsAt`/`endsAt` shown in the merchant's own timezone.

- [ ] **Step 3: Confirm native scheduling actually gates the Function — online checkout**

Before the window opens, add a member product to cart and confirm no discount applies at checkout. Once the window opens (wait for it, or create a discount already inside its window), confirm the discount applies at checkout with the correct amount. After the window closes, confirm the discount stops applying again — all three states driven by Shopify itself, not this app.

- [ ] **Step 4: Confirm the same on POS**

Repeat step 3's "during the window" check on a POS device/simulator — this is the specific gap that motivated the native-record redesign in the first place (see `docs/superpowers/specs/2026-09-22-time-based-collection-discount-design.md` §5): confirm the discount applies correctly at POS checkout during the window, with no extra delay or stale state beyond ordinary network latency.

- [ ] **Step 5: Confirm the storefront countdown widget**

Add the `time-based-discount.liquid` block to a product template for a member product (theme editor → the block requires `product-tier-pricing`'s "Show price" override to already be configured, same prerequisite as the existing tier-pricing block). Confirm the countdown renders only while the window is open, ticks down correctly, and self-hides at expiry without a page reload.

- [ ] **Step 6: Confirm collection drift's accepted fallback (spec §6)**

Add a new product to a collection powering a live collections-mode discount, without re-saving the discount. Confirm (as documented, not as a bug) that the new product does *not* get discounted until the discount is edited and re-saved — this is the explicitly accepted limitation, not a regression.

- [ ] **Step 7: Confirm cross-kind exclusivity end-to-end**

Attempt to add a product already claimed by an existing tiered discount to a new time discount (and vice versa, from the existing discount form) — confirm both pickers correctly exclude it and both server actions reject a forced attempt with the "already belongs to another discount" error.

- [ ] **Step 8: Clean up test data**

Delete the test discounts created in Step 2 (confirms `deleteTimeDiscount` actually removes the native Shopify record, not just this app's own config — check the Admin Discounts list to verify the record is gone, not just draft/hidden).
