# Storefront Tier-Pricing Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-updating per-quantity price preview to the product page, via a Shopify theme app extension block, reading a new per-product metafield the admin app already keeps in sync.

**Architecture:** A new theme app extension (`extensions/product-tier-pricing`) contributes one Liquid app block that server-renders a product's tiers (from a new `product.metafields.sparkly_product_discounts.tiers` JSON metafield) into a data attribute, plus a small vanilla-JS asset that recomputes and re-renders the effective price whenever the quantity input or selected variant changes. A new `src/lib/product-tiers.ts` module writes/deletes that per-product metafield; the existing discount Server Actions (`discountActions.ts`) call it wherever a product's live status or tiers change.

**Tech Stack:** Next.js/TypeScript (admin app, unchanged), Shopify Admin GraphQL (`metafieldsSet`/`metafieldsDelete`), Shopify theme app extension (Liquid + vanilla JS, no framework, no build step), Node's built-in test runner (`node --test`) for the extension's pure JS logic.

## Global Constraints

- No database — this app has none; the new metafield is the only new state, and it is a derived cache, not a source of truth (`shop.metafields.sparkly_product_discounts.config` remains authoritative for the Function).
- TDD: write the failing test before the implementation, for every task that has automated tests (Tasks 1, 2, 4).
- Version-bump-per-commit: bump `package.json`'s patch version in the same commit as each task's changes (this repo is currently at `0.13.7` — confirm the current value before bumping, since other work may have landed since this plan was written).
- The theme app extension has no build step and no framework — plain Liquid and plain JS only, matching the design spec's explicit rejection of adding new infrastructure.
- Root `vitest.config.ts` already excludes `extensions/**` — the new theme extension's JS tests must not depend on that root test runner; they run via `node --test`, a zero-dependency built-in (Node engine floor for this repo is `>=20.9.0`, and `node --test` has been stable since Node 18).
- Money formatting: use the shop's configured `money_format` (Shopify Liquid's `shop.money_format`) with a simple `{{amount}}` placeholder substitution — this covers the shop's actual GBP format. More exotic `money_format` placeholders (`amount_no_decimals`, etc.) are out of scope for this MVP; note this as a known limitation, not a bug, if raised in review.

---

### Task 1: Per-product metafield sync module

**Files:**
- Create: `src/lib/product-tiers.ts`
- Test: `tests/lib/product-tiers.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery<T>(query: string, variables?: object): Promise<T>` from `src/lib/shopify-client.ts` (already exists — same function `src/lib/config.ts` uses). `Tier { minQty: number; percentOff: number }` from `src/lib/config.ts` (already exists).
- Produces: `syncProductTierMetafield(productId: string, tiers: Tier[] | null): Promise<void>` — `tiers === null` deletes the metafield; a non-null array (including an empty one) writes it. Task 2 calls this exact function with these exact semantics.

This module owns one new metafield: `namespace: "sparkly_product_discounts"`, `key: "tiers"`, owner is a **Product** (not the shop). It never reads the shop-level config — it only writes/deletes the derived per-product cache.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/product-tiers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncProductTierMetafield } from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'

describe('syncProductTierMetafield', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the tiers JSON to the product metafield', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 7, percentOff: 5 }])

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      {
        metafields: [
          {
            ownerId: 'gid://shopify/Product/1',
            namespace: 'sparkly_product_discounts',
            key: 'tiers',
            type: 'json',
            value: JSON.stringify({ tiers: [{ minQty: 7, percentOff: 5 }] }),
          },
        ],
      },
    )
  })

  it('deletes the metafield when tiers is null', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [] },
    })

    await syncProductTierMetafield('gid://shopify/Product/1', null)

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsDelete'),
      {
        metafields: [
          {
            ownerId: 'gid://shopify/Product/1',
            namespace: 'sparkly_product_discounts',
            key: 'tiers',
          },
        ],
      },
    )
  })

  it('throws when metafieldsSet reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] },
    })

    await expect(
      syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 5, percentOff: 10 }]),
    ).rejects.toThrow('Invalid JSON')
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Not found' }] },
    })

    await expect(syncProductTierMetafield('gid://shopify/Product/1', null)).rejects.toThrow('Not found')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/lib/product-tiers.test.ts`
Expected: FAIL — `Cannot find module '@/lib/product-tiers'` (the module doesn't exist yet).

- [ ] **Step 3: Implement the module**

```typescript
// src/lib/product-tiers.ts
import { shopifyQuery } from '@/lib/shopify-client'
import type { Tier } from '@/lib/config'

const NAMESPACE = 'sparkly_product_discounts'

export async function syncProductTierMetafield(productId: string, tiers: Tier[] | null): Promise<void> {
  if (tiers === null) {
    const data = await shopifyQuery<{
      metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
    }>(
      `mutation deleteProductTiers($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        metafields: [
          { ownerId: productId, namespace: NAMESPACE, key: 'tiers' },
        ],
      },
    )

    if (data.metafieldsDelete.userErrors.length > 0) {
      throw new Error(data.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
    }
    return
  }

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setProductTiers($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'tiers',
          type: 'json',
          value: JSON.stringify({ tiers }),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/lib/product-tiers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

Bump `package.json`'s patch version first (check the current value — this plan assumes `0.13.7`, bump to `0.13.8`; adjust if the repo has moved on since this plan was written), matching the same bump in `package-lock.json`'s two `"version"` fields.

```bash
git add src/lib/product-tiers.ts tests/lib/product-tiers.test.ts package.json package-lock.json
git commit -m "Add per-product tier metafield sync module"
```

---

### Task 2: Wire the sync into discount Server Actions

**Files:**
- Modify: `src/actions/discountActions.ts`
- Modify: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `syncProductTierMetafield(productId: string, tiers: Tier[] | null): Promise<void>` from Task 1.
- Produces: nothing new for later tasks — this task only changes existing action behavior.

**Which actions need a sync call, and why:**

- `createDiscount`: **no change.** It always creates a discount with `status: 'draft'` (see the existing code) — a draft never has a live per-product metafield, so there is nothing to sync yet.
- `updateTiers`: if the discount being edited is currently `live`, its tiers changed, so the live per-product metafield must be re-written with the new tiers. If it's currently `draft`, there is still no live metafield to touch.
- `setStatus('live', ...)`: write the per-product metafield from the discount's current tiers.
- `setStatus('draft', ...)`: delete the per-product metafield — a draft must not be visible to the storefront block.
- `deleteDiscount`: delete the per-product metafield unconditionally (harmless no-op if it was already draft/absent — `metafieldsDelete` succeeds even when the metafield doesn't exist, per Shopify's API).

- [ ] **Step 1: Write the failing tests**

Add these to the existing `describe` blocks in `tests/actions/discountActions.test.ts` (keep the existing tests as-is; these are additions). Add the import and mock at the top of the file first:

```typescript
// Add to the existing imports at the top of tests/actions/discountActions.test.ts
import * as productTiers from '@/lib/product-tiers'
```

```typescript
// Add inside the existing `describe('updateTiers', ...)` block
it('re-syncs the per-product metafield when the discount is already live', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
  })
  vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  const formData = new FormData()
  formData.set('tier-0-minQty', '3')
  formData.set('tier-0-percentOff', '5')

  await updateTiers('gid://shopify/Product/111', formData)

  expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', [{ minQty: 3, percentOff: 5 }])
})

it('does not sync the per-product metafield when the discount is still draft', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [{ minQty: 5, percentOff: 10 }] }],
  })
  vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  const formData = new FormData()
  formData.set('tier-0-minQty', '3')
  formData.set('tier-0-percentOff', '5')

  await updateTiers('gid://shopify/Product/111', formData)

  expect(syncSpy).not.toHaveBeenCalled()
})
```

```typescript
// Add inside the existing `describe('setStatus', ...)` block
it('writes the per-product metafield when flipping to live', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [{ minQty: 5, percentOff: 10 }] }],
  })
  vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  await setStatus('gid://shopify/Product/111', 'live')

  expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', [{ minQty: 5, percentOff: 10 }])
})

it('deletes the per-product metafield when flipping to draft', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
  })
  vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  await setStatus('gid://shopify/Product/111', 'draft')

  expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', null)
})
```

```typescript
// Add inside the existing `describe('deleteDiscount', ...)` block
it('deletes the per-product metafield', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [] }],
  })
  vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  await deleteDiscount('gid://shopify/Product/111')

  expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: FAIL — the new assertions fail because `syncProductTierMetafield` is never called yet (the spy's mock function has zero calls).

- [ ] **Step 3: Implement the wiring**

```typescript
// src/actions/discountActions.ts — add this import at the top
import { syncProductTierMetafield } from '@/lib/product-tiers'
```

```typescript
// Replace the body of updateTiers with:
export async function updateTiers(productId: string, formData: FormData): Promise<void> {
  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.tiers = tiers
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncProductTierMetafield(productId, tiers)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}
```

```typescript
// Replace the body of setStatus with:
export async function setStatus(productId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.status = status
  await saveConfig(config)

  await syncProductTierMetafield(productId, status === 'live' ? discount.tiers : null)

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}
```

```typescript
// Replace the body of deleteDiscount with:
export async function deleteDiscount(productId: string): Promise<void> {
  const config = await getConfig()
  const remaining = config.products.filter((p) => p.productId !== productId)
  await saveConfig({ products: remaining })

  await syncProductTierMetafield(productId, null)

  await redirectWithToken('/')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: PASS (all existing tests plus the 5 new ones).

Then run the full suite to confirm nothing else broke:

Run: `npm test`
Expected: PASS, all test files green.

- [ ] **Step 5: Commit**

Bump the patch version again (`0.13.8` → `0.13.9`, or whatever follows Task 1's bump).

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts package.json package-lock.json
git commit -m "Sync the per-product tier metafield on every live/draft/delete transition"
```

---

### Task 3: Theme app extension scaffold and Liquid block

**Files:**
- Create: `extensions/product-tier-pricing/shopify.extension.toml`
- Create: `extensions/product-tier-pricing/package.json`
- Create: `extensions/product-tier-pricing/blocks/tier-pricing.liquid`
- Create: `extensions/product-tier-pricing/locales/en.default.json`
- Create: `extensions/product-tier-pricing/assets/tier-pricing.css`

**Interfaces:**
- Consumes: `product.metafields.sparkly_product_discounts.tiers` (the metafield Task 1/2 write) and the theme's own product-price/variant Liquid objects — no admin-app code dependency at all, this task is pure theme-extension scaffolding.
- Produces: the block's rendered DOM structure (`data-sparkly-tier-pricing` container, `data-tiers` and `data-base-price` and `data-money-format` attributes, `[data-tier-pricing-price]` and `[data-tier-pricing-message]` placeholders) — Task 4/5's JS reads exactly these attribute names and selectors, so keep them exact.

This task has no automated tests — it's Liquid/config scaffolding with no logic to unit test. Verification is: the extension builds/deploys without error and the block appears in the theme editor's block picker (folded into Task 5's manual checklist, since the block needs its JS to be meaningfully previewed — building it now, verifying at the end, avoids a throwaway intermediate manual check).

- [ ] **Step 1: Create the extension config**

```toml
# extensions/product-tier-pricing/shopify.extension.toml
name = "product-tier-pricing"
type = "theme"
```

- [ ] **Step 2: Create the extension's package.json**

No dependencies — this extension has no build step and its tests (Task 4) use Node's built-in test runner, not a devDependency.

```json
{
  "name": "product-tier-pricing",
  "version": "1.0.0",
  "private": true
}
```

- [ ] **Step 3: Create the locale file**

```json
{
  "name": "Tier pricing"
}
```

Save as `extensions/product-tier-pricing/locales/en.default.json`.

- [ ] **Step 4: Create the Liquid block**

```liquid
{% comment %}
  Live per-quantity tier pricing preview. Renders nothing if this
  product has no live discount configured — product.metafields.sparkly_product_discounts.tiers
  is only ever present while a discount for this product is live (see
  src/lib/product-tiers.ts in the admin app, which deletes this
  metafield the moment a discount goes back to draft or is removed).
{% endcomment %}
{%- assign tiers_metafield = product.metafields.sparkly_product_discounts.tiers -%}
{%- if tiers_metafield != blank -%}
  <div
    class="sparkly-tier-pricing"
    data-sparkly-tier-pricing
    data-tiers='{{ tiers_metafield.value | json }}'
    data-base-price="{{ product.selected_or_first_available_variant.price | json }}"
    data-money-format='{{ shop.money_format | json }}'
  >
    <p class="sparkly-tier-pricing__price" data-tier-pricing-price>
      {{ product.selected_or_first_available_variant.price | money }}
    </p>
    <p class="sparkly-tier-pricing__message" data-tier-pricing-message></p>
  </div>
{%- endif -%}

{% schema %}
{
  "name": "t:name",
  "target": "section",
  "stylesheet": "tier-pricing.css",
  "javascript": "tier-pricing.js"
}
{% endschema %}
```

- [ ] **Step 5: Create a minimal stylesheet**

```css
/* extensions/product-tier-pricing/assets/tier-pricing.css */
.sparkly-tier-pricing__price {
  font-weight: 600;
}

.sparkly-tier-pricing__price s {
  font-weight: 400;
  opacity: 0.6;
  margin-right: 0.5em;
}

.sparkly-tier-pricing__message {
  font-size: 0.9em;
  opacity: 0.8;
}
```

- [ ] **Step 6: Commit**

`tier-pricing.js` doesn't exist yet (Tasks 4-5 create it) — that's fine, the `"javascript": "tier-pricing.js"` schema reference just won't resolve to anything until then. Commit the scaffold as its own step so Task 4/5's diff stays focused on the JS logic.

Bump the patch version.

```bash
git add extensions/product-tier-pricing package.json package-lock.json
git commit -m "Scaffold the product-tier-pricing theme app extension"
```

---

### Task 4: Pure tier-state computation and its unit tests

**Files:**
- Create: `extensions/product-tier-pricing/assets/tier-pricing.js` (this task writes only the pure function and the module-export guard; Task 5 adds the DOM-wiring code to the same file, appended below what this task writes)
- Create: `extensions/product-tier-pricing/tests/tier-pricing.test.js`

**Interfaces:**
- Consumes: `tiers: Array<{ minQty: number, percentOff: number }>` (the parsed contents of the block's `data-tiers` attribute) and `quantity: number` (the current quantity input value).
- Produces: `computeTierState(tiers, quantity)` → `{ percentOff: number, nextTier: { minQty: number, percentOff: number, delta: number } | null, remainingTiers: Array<{ minQty: number, percentOff: number, delta: number }> | null }`. Task 5's DOM-wiring code calls this exact function with this exact return shape — `remainingTiers` is only ever non-null when `percentOff === 0` (state 1, below every tier); `nextTier` is only ever non-null when `percentOff > 0` and a higher tier still exists (state 2). Both are `null` in state 3 (at or above the highest tier).

This file is loaded two ways: as a plain `<script>` in the browser (via the block's `"javascript": "tier-pricing.js"` schema reference — no `type="module"`, so it cannot use `import`/`export`), and via Node's `require()` in the test file. The guard at the bottom makes both work from the same source with no duplication and no build step.

- [ ] **Step 1: Write the failing tests**

```javascript
// extensions/product-tier-pricing/tests/tier-pricing.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { computeTierState } = require('../assets/tier-pricing.js')

test('below every tier: no discount, lists every tier as a delta from current quantity', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 3)

  assert.equal(result.percentOff, 0)
  assert.equal(result.nextTier, null)
  assert.deepEqual(result.remainingTiers, [
    { minQty: 7, percentOff: 5, delta: 4 },
    { minQty: 14, percentOff: 10, delta: 11 },
  ])
})

test('between tiers: applies the lower tier, nudges toward the single next tier only', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 9)

  assert.equal(result.percentOff, 5)
  assert.deepEqual(result.nextTier, { minQty: 14, percentOff: 10, delta: 5 })
  assert.equal(result.remainingTiers, null)
})

test('at the highest tier: applies it, no nudge left', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 20)

  assert.equal(result.percentOff, 10)
  assert.equal(result.nextTier, null)
  assert.equal(result.remainingTiers, null)
})

test('exactly at a threshold counts as reached', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 14)

  assert.equal(result.percentOff, 10)
  assert.equal(result.nextTier, null)
})

test('single-tier product: below the tier', () => {
  const result = computeTierState([{ minQty: 7, percentOff: 5 }], 2)

  assert.equal(result.percentOff, 0)
  assert.equal(result.nextTier, null)
  assert.deepEqual(result.remainingTiers, [{ minQty: 7, percentOff: 5, delta: 5 }])
})

test('single-tier product: at the tier, never produces a next-tier state', () => {
  const result = computeTierState([{ minQty: 7, percentOff: 5 }], 7)

  assert.equal(result.percentOff, 5)
  assert.equal(result.nextTier, null)
  assert.equal(result.remainingTiers, null)
})

test('empty tiers array is a safe no-op', () => {
  const result = computeTierState([], 5)

  assert.equal(result.percentOff, 0)
  assert.equal(result.nextTier, null)
  assert.deepEqual(result.remainingTiers, [])
})

test('handles tiers passed out of order', () => {
  const tiers = [{ minQty: 14, percentOff: 10 }, { minQty: 7, percentOff: 5 }]
  const result = computeTierState(tiers, 9)

  assert.equal(result.percentOff, 5)
  assert.deepEqual(result.nextTier, { minQty: 14, percentOff: 10, delta: 5 })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test extensions/product-tier-pricing/tests/tier-pricing.test.js`
Expected: FAIL — `Cannot find module '../assets/tier-pricing.js'`.

- [ ] **Step 3: Implement `computeTierState`**

```javascript
// extensions/product-tier-pricing/assets/tier-pricing.js
function computeTierState(tiers, quantity) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const reached = sorted.filter((t) => t.minQty <= quantity)
  const notReached = sorted.filter((t) => t.minQty > quantity)

  if (reached.length === 0) {
    return {
      percentOff: 0,
      nextTier: null,
      remainingTiers: notReached.map((t) => ({
        minQty: t.minQty,
        percentOff: t.percentOff,
        delta: t.minQty - quantity,
      })),
    }
  }

  const percentOff = reached[reached.length - 1].percentOff

  if (notReached.length === 0) {
    return { percentOff, nextTier: null, remainingTiers: null }
  }

  const next = notReached[0]
  return {
    percentOff,
    nextTier: { minQty: next.minQty, percentOff: next.percentOff, delta: next.minQty - quantity },
    remainingTiers: null,
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeTierState }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test extensions/product-tier-pricing/tests/tier-pricing.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

Bump the patch version.

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing/tests/tier-pricing.test.js package.json package-lock.json
git commit -m "Add computeTierState pure function with unit tests covering all three widget states"
```

---

### Task 5: DOM wiring — live updates on quantity/variant change

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js` (append below the Task 4 code and its module-export guard)

**Interfaces:**
- Consumes: `computeTierState` (defined earlier in the same file, Task 4), the DOM structure Task 3's Liquid produces (`[data-sparkly-tier-pricing]`, `data-tiers`, `data-base-price`, `data-money-format` attributes, `[data-tier-pricing-price]`, `[data-tier-pricing-message]`), the theme's existing `input[name="quantity"]` element (already present in the theme, per `snippets/product-quantity.liquid` — do not add a duplicate quantity input), and Shopify's `variant:change` custom event (dispatched by Online Store 2.0 themes on the product form when the customer picks a different variant).
- Produces: nothing further downstream — this is the last task in the plan.

This task has no automated tests (DOM/event wiring, no jsdom dependency added — matches the spec's own testing section, which puts this under manual verification). The manual checklist below is the actual verification step.

- [ ] **Step 1: Append the rendering and event-wiring code**

```javascript
// Append to extensions/product-tier-pricing/assets/tier-pricing.js,
// AFTER the `if (typeof module !== 'undefined' ...)` guard from Task 4.
// This part only runs in the browser (module.exports is undefined there),
// so it's safe to reference `document`/`window` unconditionally below.

function formatMoney(amount, format) {
  const withDecimals = amount.toFixed(2)
  return format.replace(/\{\{\s*amount\s*\}\}/, withDecimals)
}

function renderTierPricing(container, tiers, moneyFormat) {
  const priceEl = container.querySelector('[data-tier-pricing-price]')
  const messageEl = container.querySelector('[data-tier-pricing-message]')
  const basePrice = Number(container.dataset.basePrice)
  const quantityInput = document.querySelector('input[name="quantity"]')
  const quantity = quantityInput ? Number(quantityInput.value) || 1 : 1

  const state = computeTierState(tiers, quantity)

  if (state.percentOff > 0) {
    const discounted = basePrice * (1 - state.percentOff / 100)
    priceEl.innerHTML =
      '<s>' + formatMoney(basePrice, moneyFormat) + '</s> ' + formatMoney(discounted, moneyFormat)
  } else {
    priceEl.textContent = formatMoney(basePrice, moneyFormat)
  }

  if (state.remainingTiers && state.remainingTiers.length > 0) {
    messageEl.textContent = state.remainingTiers
      .map((t) => 'Add ' + t.delta + ' for ' + t.percentOff + '% Off')
      .join(' or ')
  } else if (state.nextTier) {
    messageEl.textContent = 'Add ' + state.nextTier.delta + ' more for ' + state.nextTier.percentOff + '% Off'
  } else {
    messageEl.textContent = ''
  }
}

function initTierPricing() {
  const containers = document.querySelectorAll('[data-sparkly-tier-pricing]')
  containers.forEach((container) => {
    const tiers = JSON.parse(container.dataset.tiers).tiers
    const moneyFormat = JSON.parse(container.dataset.moneyFormat)

    renderTierPricing(container, tiers, moneyFormat)

    const quantityInput = document.querySelector('input[name="quantity"]')
    if (quantityInput) {
      quantityInput.addEventListener('input', () => renderTierPricing(container, tiers, moneyFormat))
      quantityInput.addEventListener('change', () => renderTierPricing(container, tiers, moneyFormat))
    }

    document.addEventListener('variant:change', (event) => {
      if (event.detail && event.detail.variant && typeof event.detail.variant.price === 'number') {
        container.dataset.basePrice = String(event.detail.variant.price / 100)
      }
      renderTierPricing(container, tiers, moneyFormat)
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTierPricing)
} else {
  initTierPricing()
}
```

Note on `variant:change`: Online Store 2.0 themes (including this store's) dispatch this event with `event.detail.variant.price` in the smallest currency unit (cents/pence) — dividing by 100 converts back to the decimal form `data-base-price` uses, matching what `product.selected_or_first_available_variant.price` gives in Liquid.

- [ ] **Step 2: Re-run the Task 4 unit tests to confirm nothing broke**

Run: `node --test extensions/product-tier-pricing/tests/tier-pricing.test.js`
Expected: PASS (still 8 tests — this step only appended browser-only code after the `module.exports` guard, so `require()` in the test file never sees it).

- [ ] **Step 3: Commit**

Bump the patch version.

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js package.json package-lock.json
git commit -m "Wire live quantity/variant updates into the tier-pricing widget"
```

- [ ] **Step 4: Manual verification on the real theme**

This is the actual end-to-end proof the automated tests above can't cover — do this against the real store, not a local preview (the widget depends on real product data, a real quantity input, and the real theme editor).

1. `shopify app deploy` from the repo root — pushes the new theme app extension alongside the existing discount Function.
2. In the Shopify admin, go to **Online Store → Themes → Customize**, open a product page template.
3. In the theme editor's block picker (on the main product section), add the **Tier pricing** app block near the price or buy button.
4. Save.
5. On a product that currently has a **live** discount configured (e.g. Canagan Tuna Soup for Cats, 5% at 7+) view its storefront page:
   - At quantity 1-6: plain price, no strikethrough, message reads `Add {N} for 5% Off` (state 1).
   - Set quantity to 7 or above (if this product has only one tier, this is also its final state — no further nudge): strikethrough original + discounted price, `Discount 5% off (-£X.XX)`, no nudge message (state 3 for a single-tier product).
6. If a second tier is configured on a test product (e.g. temporarily add a 14+ → 10% tier via the admin app), confirm the **between-tiers** state (7-13): discounted price at 5% off, plus `Add {N} more for 10% Off`.
7. Confirm a product with **no** discount configured at all shows nothing — no empty box, no placeholder text.
8. If the product has multiple variants, change the selected variant and confirm the price updates without a page reload (this exercises the `variant:change` listener — Task 5, Step 1's note on cents-to-decimal conversion).
9. Confirm no console errors during any of the above (re-check the App Bridge script-tag ordering isn't disturbed by the new extension — it shouldn't be, since this is a separate extension, but verify anyway since both extensions deploy together).
