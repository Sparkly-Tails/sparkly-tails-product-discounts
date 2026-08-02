# Fixed-Price Discount Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "fixed price" as a second pricing mode for discount tiers — alongside the existing percentage-off mode — where each tier sets an absolute price per unit (e.g. "1 for £1.70, 3 or more for £1.50") instead of a percentage, available for both standalone per-product and group (mix-and-match) discounts.

**Architecture:** A new `pricingMode: 'percent' | 'fixed'` field on `ProductDiscount`/`GroupDiscount` locks a discount to one mode at creation (no switching later). `Tier` gains an optional `fixedPrice` field alongside the existing optional `percentOff`/`anchorPrice`, with validation in the admin actions (not just the type) ensuring a discount's tiers only ever populate the field family matching its own mode. The Rust Discount Function needs no explicit mode field — it just checks whether the tier it selected has `fixedPrice` set and branches the formula accordingly. The storefront widget gets a parallel fixed-price branch in its price/message computation.

**Tech Stack:** Next.js 16 (Server Actions) admin app, Rust Shopify Discount Function (`shopify_function` crate v2.2.0), vanilla JS theme app extension block, Vitest (admin app), `node --test` (theme extension), `cargo test` (Function).

## Global Constraints

- Node version: run `nvm use 20.20.2` before any node/npm/shopify command in this repo.
- Bump `version` in `package.json` (and `package-lock.json`'s matching two `version` fields) on this change — a new feature, so a **minor** bump (0.15.0 → 0.16.0), done in the same commit as the last code task, per this project's versioning convention (patch for fixes, minor for features, no exceptions).
- Full spec at `docs/superpowers/specs/2026-08-02-fixed-price-discount-tiers-design.md` — every task below implements one section of it; re-read the relevant section if a step's rationale is unclear.
- All money math rounds explicitly to whole pence (`Math.round(x*100)/100` in TS, `(x*100.0).round()/100.0` in Rust) — never rely on Shopify's own downstream rounding. Established project-wide discipline, not new to this feature.
- A fixed-price tier's discount must never exceed the product's actual price — a misconfigured `fixedPrice` above sticker price must clamp to zero discount (never a markup), both in the Rust Function (what actually gets charged) and in every admin preview (what the merchant sees must match what the Function will do).
- Mode (`pricingMode`) is chosen once at creation and never changes on the edit page — there is no task in this plan for a mode-switch UI; don't add one.
- Commit after every task (not every step) unless a step's own instructions say otherwise.

---

## Task 1: Data model — `pricingMode` + `fixedPrice`, backward compatibility

**Files:**
- Modify: `src/lib/config.ts`
- Modify: `src/actions/discountActions.ts` (temporary minimal fix only — see Step 4)
- Test: `tests/lib/config.test.ts`
- Test: (mechanical fixture repair) `tests/actions/discountActions.test.ts`, `tests/actions/groupProductActions.test.ts`

**Interfaces:**
- Produces: `Tier.fixedPrice?: number`, `ProductDiscount.pricingMode: 'percent' | 'fixed'`, `GroupDiscount.pricingMode: 'percent' | 'fixed'`

This task makes `pricingMode` a **required** field on `ProductDiscount`/`GroupDiscount`. That will break compilation of every existing test (and two spots in `discountActions.ts` itself) that construct one of these objects without it — Step 4 fixes those mechanically via the TypeScript compiler's own error output, which is more reliable than hand-transcribing the ~30+ call sites across a 600-line test file. The *real* wiring of `pricingMode` into the create/update actions (reading it from a form, choosing the right parser) is Tasks 3 and 4, not this one — this task only needs the build and every existing test green again.

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/config.test.ts`, inside the existing `describe('getConfig', ...)` block, after the `'parses a stored config that includes groups'` test:

```ts
it('defaults pricingMode to percent for a product discount stored before this field existed', async () => {
  const stored = {
    products: [{ productId: 'gid://shopify/Product/1', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
    groups: [],
  }
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify(stored) } },
  })
  const config = await getConfig()
  expect(config.products[0].pricingMode).toBe('percent')
})

it('defaults pricingMode to percent for a group discount stored before this field existed', async () => {
  const stored = {
    products: [],
    groups: [{ groupId: 'grp_1', name: 'Soups', status: 'live', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 7, percentOff: 10 }] }],
  }
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify(stored) } },
  })
  const config = await getConfig()
  expect(config.groups[0].pricingMode).toBe('percent')
})

it('preserves an explicit pricingMode of fixed', async () => {
  const stored = {
    products: [{ productId: 'gid://shopify/Product/1', status: 'live', pricingMode: 'fixed', tiers: [{ minQty: 1, fixedPrice: 1.70 }, { minQty: 3, fixedPrice: 1.50 }] }],
    groups: [],
  }
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify(stored) } },
  })
  const config = await getConfig()
  expect(config.products[0]).toEqual(stored.products[0])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && npm test -- tests/lib/config.test.ts`
Expected: FAIL — `config.products[0].pricingMode` is `undefined`, not `'percent'` (the field doesn't exist yet).

- [ ] **Step 3: Implement the data model**

In `src/lib/config.ts`, replace the `Tier`, `ProductDiscount`, and `GroupDiscount` interfaces:

```ts
export interface Tier {
  minQty: number
  percentOff?: number
  /**
   * Optional exact total price to charge for minQty units (e.g. £10.00 for
   * 7 tins instead of the percentage's rounded £10.01). Units beyond minQty
   * still accrue at the normal percentOff per-unit rate — only the price at
   * exactly minQty is anchored. percent mode only.
   */
  anchorPrice?: number
  /**
   * Absolute price per unit for a fixed-price tier (e.g. £1.50) — every
   * unit in the reached tier is charged this price directly, no percentage
   * involved. fixed mode only. Mutually exclusive with percentOff/
   * anchorPrice, enforced by the admin actions that construct a Tier, not
   * by this type.
   */
  fixedPrice?: number
}

export interface ProductDiscount {
  productId: string
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  tiers: Tier[]
}

export interface GroupDiscount {
  groupId: string
  name: string
  status: 'draft' | 'live'
  productIds: string[]
  pricingMode: 'percent' | 'fixed'
  tiers: Tier[]
}
```

Update `getConfig()`'s body to backfill `pricingMode` per item for configs stored before this field existed (replace the final two lines):

```ts
  const parsed = JSON.parse(data.shop.metafield.value) as Partial<Config>
  const products = (parsed.products ?? []).map((p) => ({ pricingMode: 'percent' as const, ...p }))
  const groups = (parsed.groups ?? []).map((g) => ({ pricingMode: 'percent' as const, ...g }))
  return { products, groups }
```

(Spreading `p`/`g` *after* the default means an explicit `pricingMode` already in storage overrides the default; a missing one falls back to `'percent'`.)

- [ ] **Step 4: Fix the two now-broken construction sites in `discountActions.ts`**

`pricingMode` is now required, so the two places `discountActions.ts` builds a `ProductDiscount`/`GroupDiscount` from scratch no longer compile. This is a **temporary** fix — Tasks 3 and 4 replace the hardcoded value with the real form-driven one. For now, just keep the build green:

In `createDiscount`, change:
```ts
  const newDiscount: ProductDiscount = { productId, status: 'draft', tiers }
```
to:
```ts
  const newDiscount: ProductDiscount = { productId, status: 'draft', pricingMode: 'percent', tiers }
```

In `createGroup`, change:
```ts
  const newGroup: GroupDiscount = { groupId, name, status: 'draft', productIds, tiers }
```
to:
```ts
  const newGroup: GroupDiscount = { groupId, name, status: 'draft', pricingMode: 'percent', productIds, tiers }
```

- [ ] **Step 5: Run the TypeScript compiler and mechanically repair every flagged test fixture**

Run: `nvm use 20.20.2 && npx tsc --noEmit`

Expected: a list of errors in `tests/lib/config.test.ts`, `tests/actions/discountActions.test.ts`, and `tests/actions/groupProductActions.test.ts` — every place those files construct a `ProductDiscount`, `GroupDiscount`, or a `Config`'s `products`/`groups` array literal (as a mock return value for `getConfig`, or as an expected argument to `toHaveBeenCalledWith`) now fails because it's missing `pricingMode`.

For **every** flagged object literal, add `pricingMode: 'percent',` as a field (place it next to `status`, matching this task's own style above) — **except** the three new tests you just wrote in Step 1, which deliberately omit it from the *stored* input to test the default-backfill (their assertions already expect `'percent'` to appear, so leave those three exactly as written).

This is mechanical, not conceptual: every `ProductDiscount`/`GroupDiscount` this codebase has ever tested is percentage-mode (fixed mode doesn't exist as a real feature yet), so the correct fix at every flagged site is always the same one-line addition. Re-run `npx tsc --noEmit` after each batch of fixes until it reports zero errors.

- [ ] **Step 6: Run the full test suite to verify everything passes**

Run: `npm test`
Expected: PASS, every test file green, including the three new ones from Step 1.

- [ ] **Step 7: Commit**

```bash
git add src/lib/config.ts src/actions/discountActions.ts tests/lib/config.test.ts tests/actions/discountActions.test.ts tests/actions/groupProductActions.test.ts
git commit -m "Add pricingMode and fixedPrice to the discount data model"
```

---

## Task 2: `tier-math.ts` — fixed-price preview math

**Files:**
- Modify: `src/lib/tier-math.ts`
- Test: `tests/lib/tier-math.test.ts`

**Interfaces:**
- Produces: `export function clampedFixedPrice(basePrice: number, fixedPrice: number): number`, `export function totalAtThresholdFixed(basePrice: number, tier: { minQty: number; fixedPrice: number }): number`

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/tier-math.test.ts`:

```ts
import { resultingPrice, totalAtThreshold, clampedFixedPrice, totalAtThresholdFixed } from '@/lib/tier-math'

describe('clampedFixedPrice', () => {
  it('returns the fixed price as-is when below the base price', () => {
    expect(clampedFixedPrice(1.99, 1.50)).toBe(1.50)
  })

  it('clamps a fixed price above the base price down to the base price', () => {
    // A merchant fat-fingering fixedPrice: 5.00 on a £1.49 product must not
    // preview a markup — the Function refuses to produce a negative
    // discount, so the customer is actually charged the normal £1.49.
    expect(clampedFixedPrice(1.49, 5.00)).toBe(1.49)
  })

  it('clamps a negative fixed price up to 0', () => {
    expect(clampedFixedPrice(1.49, -1)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    expect(clampedFixedPrice(10.0, 1.005)).toBeCloseTo(1.01, 2)
  })
})

describe('totalAtThresholdFixed', () => {
  it('multiplies the clamped per-unit price by minQty', () => {
    expect(totalAtThresholdFixed(1.99, { minQty: 3, fixedPrice: 1.50 })).toBe(4.50)
  })

  it('uses the clamped price, not the raw one, when fixedPrice exceeds the base price', () => {
    expect(totalAtThresholdFixed(1.49, { minQty: 3, fixedPrice: 5.00 })).toBeCloseTo(4.47, 2)
  })
})
```

(Update the file's existing top import line to include `clampedFixedPrice, totalAtThresholdFixed` as shown.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/tier-math.test.ts`
Expected: FAIL — `clampedFixedPrice`/`totalAtThresholdFixed` are not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/tier-math.ts`, after `totalAtThreshold`:

```ts
/**
 * The price per unit for a fixed-price tier, clamped to the product's
 * actual base price. A fixedPrice above sticker price would otherwise
 * preview (and, without this clamp existing symmetrically in the Discount
 * Function, could imply) charging MORE than the product normally costs —
 * the Function refuses to produce a negative discount, so this preview
 * must always show that same clamped reality.
 */
export function clampedFixedPrice(basePrice: number, fixedPrice: number): number {
  const clamped = Math.min(Math.max(fixedPrice, 0), basePrice)
  return Math.round(clamped * 100) / 100
}

/**
 * The total price a customer pays for exactly minQty units of a
 * fixed-price tier — the clamped per-unit price times minQty, rounded to
 * 2 decimal places.
 */
export function totalAtThresholdFixed(basePrice: number, tier: { minQty: number; fixedPrice: number }): number {
  return Math.round(clampedFixedPrice(basePrice, tier.fixedPrice) * tier.minQty * 100) / 100
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/tier-math.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tier-math.ts tests/lib/tier-math.test.ts
git commit -m "Add clampedFixedPrice and totalAtThresholdFixed for fixed-price tier previews"
```

---

## Task 3: `discountActions.ts` — standalone discount actions become mode-aware

**Files:**
- Modify: `src/actions/discountActions.ts`
- Test: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `Tier`, `ProductDiscount` from `@/lib/config`
- Produces: `parseTiersFromForm(formData: FormData, pricingMode: 'percent' | 'fixed'): Tier[]` (signature change — now takes a required second parameter; `createGroup`/`updateGroupProducts`/`updateGroupTiers` in Task 4 also call this function and need updating there)

- [ ] **Step 1: Write the failing tests**

Add to `tests/actions/discountActions.test.ts`, inside `describe('createDiscount', ...)`, after the existing `'includes anchorPrice when provided, omits it when blank'` test:

```ts
it('creates a fixed-price discount when pricingMode is fixed', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

  const formData = new FormData()
  formData.set('productId', 'gid://shopify/Product/111')
  formData.set('pricingMode', 'fixed')
  formData.set('tier-0-minQty', '1')
  formData.set('tier-0-fixedPrice', '1.70')
  formData.set('tier-1-minQty', '3')
  formData.set('tier-1-fixedPrice', '1.50')

  await createDiscount(formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [{
      productId: 'gid://shopify/Product/111',
      status: 'draft',
      pricingMode: 'fixed',
      tiers: [
        { minQty: 1, fixedPrice: 1.70 },
        { minQty: 3, fixedPrice: 1.50 },
      ],
    }],
    groups: [],
  })
})

it('ignores percentOff/anchorPrice fields entirely when pricingMode is fixed', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

  const formData = new FormData()
  formData.set('productId', 'gid://shopify/Product/111')
  formData.set('pricingMode', 'fixed')
  formData.set('tier-0-minQty', '1')
  formData.set('tier-0-fixedPrice', '1.70')
  formData.set('tier-0-percentOff', '50')
  formData.set('tier-0-anchorPrice', '99.00')

  await createDiscount(formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [{
      productId: 'gid://shopify/Product/111',
      status: 'draft',
      pricingMode: 'fixed',
      tiers: [{ minQty: 1, fixedPrice: 1.70 }],
    }],
    groups: [],
  })
})

it('defaults to percent mode when pricingMode is not provided', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

  const formData = new FormData()
  formData.set('productId', 'gid://shopify/Product/111')
  formData.set('tier-0-minQty', '5')
  formData.set('tier-0-percentOff', '10')

  await createDiscount(formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
    groups: [],
  })
})
```

Add to `describe('updateTiers', ...)` (find its existing block further down the file), a new test:

```ts
it('parses fixed-price tiers when the stored discount is fixed mode', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'fixed', tiers: [{ minQty: 1, fixedPrice: 2.00 }] }],
    groups: [],
  })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  const formData = new FormData()
  formData.set('tier-0-minQty', '1')
  formData.set('tier-0-fixedPrice', '1.70')
  formData.set('tier-1-minQty', '3')
  formData.set('tier-1-fixedPrice', '1.50')

  await updateTiers('gid://shopify/Product/111', formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [{
      productId: 'gid://shopify/Product/111',
      status: 'live',
      pricingMode: 'fixed',
      tiers: [
        { minQty: 1, fixedPrice: 1.70 },
        { minQty: 3, fixedPrice: 1.50 },
      ],
    }],
    groups: [],
  })
})

it('ignores a pricingMode field in the form when updating tiers — mode is locked to the stored value', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
    groups: [],
  })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

  const formData = new FormData()
  formData.set('pricingMode', 'fixed')
  formData.set('tier-0-minQty', '7')
  formData.set('tier-0-percentOff', '20')

  await updateTiers('gid://shopify/Product/111', formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 7, percentOff: 20 }] }],
    groups: [],
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: FAIL — the new tests don't get fixed-price tiers or a `pricingMode` in the saved output, since `parseTiersFromForm` doesn't know about fixed mode yet and `createDiscount`/`updateTiers` still hardcode/ignore mode.

- [ ] **Step 3: Implement**

In `src/actions/discountActions.ts`, replace `parseTiersFromForm` entirely:

```ts
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
```

(Fixed mode never reads `tier-N-percentOff`/`tier-N-anchorPrice` at all, and percent mode never reads `tier-N-fixedPrice` — the two field families can't end up mixed on one `Tier`, by construction, matching the design spec's "enforced in code" approach.)

Replace `createDiscount`'s body (the `pricingMode: 'percent'` hardcoded in Task 1 gets replaced with the real form value):

```ts
export async function createDiscount(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '').trim()
  if (!productId) throw new Error('A product is required')

  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const tiers = parseTiersFromForm(formData, pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  if (!isProductAvailable(config, productId)) {
    throw new Error(`Product ${productId} already has a discount or belongs to a group`)
  }

  const newDiscount: ProductDiscount = { productId, status: 'draft', pricingMode, tiers }
  await saveConfig({ ...config, products: [...config.products, newDiscount] })

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}
```

Replace `updateTiers`'s body — it now fetches the discount *before* parsing, so it can parse using the discount's own locked-in mode rather than anything the form claims:

```ts
export async function updateTiers(productId: string, formData: FormData): Promise<void> {
  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  const tiers = parseTiersFromForm(formData, discount.pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  discount.tiers = tiers
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncProductTierMetafield(productId, tiers)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: PASS, all tests including pre-existing ones. (`createGroup`/`updateGroupProducts`/`updateGroupTiers` still call `parseTiersFromForm` with only one argument at this point — Task 4 fixes those call sites. Run `npx tsc --noEmit` now; expect exactly those call sites flagged, nothing else.)

- [ ] **Step 5: Commit**

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts
git commit -m "Make standalone discount actions pricingMode-aware"
```

---

## Task 4: `discountActions.ts` — group discount actions become mode-aware

**Files:**
- Modify: `src/actions/discountActions.ts`
- Test: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `parseTiersFromForm(formData, pricingMode)` from Task 3 (same file)
- Produces: no new exports — updates `createGroup`, `updateGroupTiers` to call `parseTiersFromForm` correctly

- [ ] **Step 1: Write the failing tests**

Add to `tests/actions/discountActions.test.ts`, inside `describe('createGroup', ...)`:

```ts
it('creates a fixed-price group when pricingMode is fixed', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-2222-2222-222222222222')

  const formData = new FormData()
  formData.set('product-0-id', 'gid://shopify/Product/1')
  formData.set('product-1-id', 'gid://shopify/Product/2')
  formData.set('name', 'Mix & Match Soups')
  formData.set('pricingMode', 'fixed')
  formData.set('tier-0-minQty', '1')
  formData.set('tier-0-fixedPrice', '1.70')
  formData.set('tier-1-minQty', '3')
  formData.set('tier-1-fixedPrice', '1.50')

  await createGroup(formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [],
    groups: [{
      groupId: 'grp_22222222-2222-2222-2222-222222222222',
      name: 'Mix & Match Soups',
      status: 'draft',
      pricingMode: 'fixed',
      productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
      tiers: [
        { minQty: 1, fixedPrice: 1.70 },
        { minQty: 3, fixedPrice: 1.50 },
      ],
    }],
  })
})
```

Add to `describe('updateGroupTiers', ...)`:

```ts
it('parses fixed-price tiers when the stored group is fixed mode', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({
    products: [],
    groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'fixed', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 1, fixedPrice: 2.00 }] }],
  })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

  const formData = new FormData()
  formData.set('tier-0-minQty', '1')
  formData.set('tier-0-fixedPrice', '1.70')

  await updateGroupTiers('grp_a', formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [],
    groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'fixed', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 1, fixedPrice: 1.70 }] }],
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: FAIL to compile — `createGroup`/`updateGroupTiers` still call `parseTiersFromForm(formData)` with one argument, but it now requires two.

- [ ] **Step 3: Implement**

In `createGroup`, replace the tier-parsing and group-construction lines:

```ts
  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const tiers = parseTiersFromForm(formData, pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  for (const productId of productIds) {
    if (!isProductAvailable(config, productId)) {
      throw new Error(`Product ${productId} already has a discount or belongs to another group`)
    }
  }

  const groupId = `grp_${crypto.randomUUID()}`
  const newGroup: GroupDiscount = { groupId, name, status: 'draft', pricingMode, productIds, tiers }
  await saveConfig({ ...config, groups: [...config.groups, newGroup] })
```

(This replaces the block from the existing `const tiers = parseTiersFromForm(formData)` line through the existing `const newGroup: GroupDiscount = ...` line — the `productIds`/name validation above it and the redirect below it are unchanged.)

In `updateGroupTiers`, replace the body so it fetches the group first and parses using its locked-in mode:

```ts
export async function updateGroupTiers(groupId: string, formData: FormData): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const tiers = parseTiersFromForm(formData, group.pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  group.tiers = tiers
  await saveConfig(config)

  if (group.status === 'live') {
    await syncGroupMetafields(group)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: PASS, all tests including pre-existing ones. Run `npx tsc --noEmit`: expect zero errors anywhere in the project now.

- [ ] **Step 5: Commit**

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts
git commit -m "Make group discount actions pricingMode-aware"
```

---

## Task 5: `FixedPriceTierFields` component

**Files:**
- Create: `src/components/FixedPriceTierFields.tsx`

**Interfaces:**
- Produces: default export `FixedPriceTierFields({ initial?: { minQty: number; fixedPrice: number }[] })` — renders inputs named `tier-{i}-minQty`/`tier-{i}-fixedPrice`, parsed server-side by `parseTiersFromForm` (Task 3) when `pricingMode` is `'fixed'`.

No automated test for this file — matches this codebase's existing convention (`TierFields.tsx` has no test file either). Verified manually in Task 6's build check and Task 13's live check.

- [ ] **Step 1: Write the component**

Create `src/components/FixedPriceTierFields.tsx`:

```tsx
'use client'

import { useState } from 'react'

type FixedTierRow = { key: string; minQty: string; fixedPrice: string }

function makeRow(minQty = '', fixedPrice = ''): FixedTierRow {
  return { key: crypto.randomUUID(), minQty, fixedPrice }
}

export default function FixedPriceTierFields({
  initial,
}: {
  initial?: { minQty: number; fixedPrice: number }[]
}) {
  const [rows, setRows] = useState<FixedTierRow[]>(() =>
    initial && initial.length > 0
      ? initial.map((t) => makeRow(String(t.minQty), String(t.fixedPrice)))
      : [makeRow()],
  )

  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  function updateRow(key: string, field: 'minQty' | 'fixedPrice', value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.key} className="flex flex-wrap gap-2 items-center">
          <label htmlFor={`tier-${i}-minQty`} className="sr-only">
            Tier {i + 1} minimum quantity
          </label>
          <input
            id={`tier-${i}-minQty`}
            name={`tier-${i}-minQty`}
            type="number"
            min="1"
            placeholder="Min qty (e.g. 3)"
            value={row.minQty}
            onChange={(e) => updateRow(row.key, 'minQty', e.target.value)}
            className="border border-line rounded px-3 py-2 w-40 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <span className="text-sm text-muted">+ units →</span>
          <label htmlFor={`tier-${i}-fixedPrice`} className="sr-only">
            Tier {i + 1} price each
          </label>
          <input
            id={`tier-${i}-fixedPrice`}
            name={`tier-${i}-fixedPrice`}
            type="number"
            min="0"
            step="0.01"
            placeholder="Price each (e.g. 1.50)"
            value={row.fixedPrice}
            onChange={(e) => updateRow(row.key, 'fixedPrice', e.target.value)}
            className="border border-line rounded px-3 py-2 w-52 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            disabled={rows.length <= 1}
            aria-label={`Remove tier ${i + 1}`}
            className="text-danger hover:text-danger-hover disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
      >
        + Add tier
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FixedPriceTierFields.tsx
git commit -m "Add FixedPriceTierFields component"
```

---

## Task 6: `PricingModeTierFields` — mode selector, wired into both "new" pages

**Files:**
- Create: `src/components/PricingModeTierFields.tsx`
- Modify: `src/app/discounts/new/page.tsx`
- Modify: `src/app/discounts/groups/new/page.tsx`

**Interfaces:**
- Consumes: `TierFields` from `@/components/TierFields`, `FixedPriceTierFields` from `@/components/FixedPriceTierFields`
- Produces: default export `PricingModeTierFields()` — a client component owning the mode choice (radio inputs named `pricingMode`, values `'percent'`/`'fixed'`) and conditionally rendering the matching tier-fields component. Used identically on both "new" pages.

No automated test — a `'use client'` component matching this codebase's convention for the other tier-field components. Verified via a successful `npm run build` and later, live, in Task 13.

- [ ] **Step 1: Create the component**

Create `src/components/PricingModeTierFields.tsx`:

```tsx
'use client'

import { useState } from 'react'
import TierFields from '@/components/TierFields'
import FixedPriceTierFields from '@/components/FixedPriceTierFields'

export default function PricingModeTierFields() {
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent')

  return (
    <div className="space-y-4">
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
      </div>

      {mode === 'percent' ? (
        <>
          <TierFields />
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price before you go live.
          </p>
        </>
      ) : (
        <>
          <FixedPriceTierFields />
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

- [ ] **Step 2: Wire it into the standalone "new discount" page**

In `src/app/discounts/new/page.tsx`, replace the import of `TierFields` with `PricingModeTierFields`:

```tsx
import { createDiscount } from '@/actions/discountActions'
import ProductPicker from '@/components/ProductPicker'
import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function NewDiscountPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add discount</h1>

      <form action={createDiscount} className="space-y-6">
        <div>
          <p className="block text-sm font-medium mb-2">Product</p>
          <ProductPicker initialProduct={null} />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <PricingModeTierFields />
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

- [ ] **Step 3: Wire it into the group "new group" page**

In `src/app/discounts/groups/new/page.tsx`, replace the import of `TierFields` with `PricingModeTierFields`:

```tsx
import { createGroup } from '@/actions/discountActions'
import GroupProductPicker from '@/components/GroupProductPicker'
import PricingModeTierFields from '@/components/PricingModeTierFields'

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
          <PricingModeTierFields />
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

- [ ] **Step 4: Verify the app builds**

Run: `nvm use 20.20.2 && npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PricingModeTierFields.tsx src/app/discounts/new/page.tsx src/app/discounts/groups/new/page.tsx
git commit -m "Add pricing-mode selector to the new-discount and new-group pages"
```

---

## Task 7: Standalone discount edit page — fixed-mode rendering + back link

**Files:**
- Modify: `src/app/discounts/[productId]/page.tsx`

**Interfaces:**
- Consumes: `clampedFixedPrice`, `totalAtThresholdFixed` from `@/lib/tier-math` (Task 2); `FixedPriceTierFields` from `@/components/FixedPriceTierFields` (Task 5); `AuthLink` from `@/components/AuthLink`

No automated test — matches this codebase's existing convention of untested page components. Verified via a successful `npm run build` and later, live, in Task 13.

- [ ] **Step 1: Replace the full contents of the page**

Replace `src/app/discounts/[productId]/page.tsx` in full:

```tsx
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/config'
import { getProductInfo } from '@/lib/products'
import { resultingPrice, totalAtThreshold, clampedFixedPrice, totalAtThresholdFixed } from '@/lib/tier-math'
import { updateTiers, setStatus, deleteDiscount } from '@/actions/discountActions'
import TierFields from '@/components/TierFields'
import FixedPriceTierFields from '@/components/FixedPriceTierFields'
import ConfirmForm from '@/components/ConfirmForm'
import AuthLink from '@/components/AuthLink'

export default async function DiscountPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId: encodedProductId } = await params
  const productId = decodeURIComponent(encodedProductId)
  const token = (await headers()).get('x-auth-token') ?? ''

  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) notFound()

  const info = await getProductInfo(productId)

  const updateTiersWithId = updateTiers.bind(null, productId)
  const goLive = setStatus.bind(null, productId, 'live')
  const goDraft = setStatus.bind(null, productId, 'draft')
  const remove = deleteDiscount.bind(null, productId)

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <AuthLink
        href="/"
        token={token}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
      >
        ← Back to discounts
      </AuthLink>

      <h1 className="text-2xl font-semibold mb-2">
        {info ? info.title : `${productId} — not found`}
      </h1>
      <p className="text-sm text-muted mb-6">
        {discount.status} · {discount.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'}
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <form action={updateTiersWithId} className="space-y-3">
          {discount.pricingMode === 'fixed' ? (
            <FixedPriceTierFields
              initial={discount.tiers.map((t) => ({ minQty: t.minQty, fixedPrice: t.fixedPrice ?? 0 }))}
            />
          ) : (
            <TierFields initial={discount.tiers.map((t) => ({ minQty: t.minQty, percentOff: t.percentOff ?? 0, anchorPrice: t.anchorPrice }))} />
          )}
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {info && discount.pricingMode === 'fixed' && (
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
                  <td className="py-1">£{clampedFixedPrice(info.basePrice, tier.fixedPrice ?? 0).toFixed(2)}</td>
                  <td className="py-1">
                    £{totalAtThresholdFixed(info.basePrice, { minQty: tier.minQty, fixedPrice: tier.fixedPrice ?? 0 }).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {info && discount.pricingMode === 'percent' && (
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
                  <td className="py-1">£{resultingPrice(info.basePrice, tier.percentOff ?? 0).toFixed(2)}</td>
                  <td className="py-1">
                    £{totalAtThreshold(info.basePrice, { minQty: tier.minQty, percentOff: tier.percentOff ?? 0, anchorPrice: tier.anchorPrice }).toFixed(2)}
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
            confirmMessage={`Go live with this discount? This creates a real, active discount for this product immediately.`}
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

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/discounts/\[productId\]/page.tsx
git commit -m "Render fixed-price tiers on the standalone discount edit page, add back link"
```

---

## Task 8: Group discount edit page + home page — fixed-mode rendering, back link, mode indicator

**Files:**
- Modify: `src/app/discounts/groups/[groupId]/page.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `clampedFixedPrice`, `totalAtThresholdFixed` from `@/lib/tier-math` (Task 2); `FixedPriceTierFields` from `@/components/FixedPriceTierFields` (Task 5)

No automated test — matches this codebase's existing convention. Verified via a successful `npm run build` and later, live, in Task 13.

- [ ] **Step 1: Replace the full contents of the group edit page**

Replace `src/app/discounts/groups/[groupId]/page.tsx` in full:

```tsx
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/config'
import { getGroupProductInfo } from '@/lib/products'
import { resultingPrice, totalAtThreshold, clampedFixedPrice, totalAtThresholdFixed } from '@/lib/tier-math'
import { updateGroupProducts, updateGroupTiers, setGroupStatus, deleteGroup } from '@/actions/discountActions'
import GroupProductPicker from '@/components/GroupProductPicker'
import TierFields from '@/components/TierFields'
import FixedPriceTierFields from '@/components/FixedPriceTierFields'
import ConfirmForm from '@/components/ConfirmForm'
import AuthLink from '@/components/AuthLink'

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId: encodedGroupId } = await params
  const groupId = decodeURIComponent(encodedGroupId)
  const token = (await headers()).get('x-auth-token') ?? ''

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
      <AuthLink
        href="/"
        token={token}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded inline-block mb-4"
      >
        ← Back to discounts
      </AuthLink>

      <h1 className="text-2xl font-semibold mb-2">{group.name}</h1>
      <p className="text-sm text-muted mb-6">
        {group.status} · {group.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'}
      </p>

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
          {group.pricingMode === 'fixed' ? (
            <FixedPriceTierFields
              initial={group.tiers.map((t) => ({ minQty: t.minQty, fixedPrice: t.fixedPrice ?? 0 }))}
            />
          ) : (
            <TierFields initial={group.tiers.map((t) => ({ minQty: t.minQty, percentOff: t.percentOff ?? 0, anchorPrice: t.anchorPrice }))} />
          )}
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {members.length > 0 && group.pricingMode === 'fixed' && (
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
              {group.tiers.map((tier) => (
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

      {members.length > 0 && group.pricingMode === 'percent' && (
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

- [ ] **Step 2: Add the mode indicator to the home page list rows**

In `src/app/page.tsx`, update the standalone-discount row's status paragraph:

```tsx
              <p className="text-sm text-muted">
                {row.status} · {row.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}
              </p>
```

(replaces the existing `<p className="text-sm text-muted">{row.status} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}</p>` line inside the products list)

And the group row's status paragraph:

```tsx
              <p className="text-sm text-muted">
                {group.status} · {group.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {group.productIds.length} product{group.productIds.length === 1 ? '' : 's'} ·{' '}
                {group.tiers.length} tier{group.tiers.length === 1 ? '' : 's'}
              </p>
```

(replaces the existing equivalent paragraph inside the groups list)

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/discounts/groups/\[groupId\]/page.tsx src/app/page.tsx
git commit -m "Render fixed-price tiers on the group edit page, add back link and home page mode indicators"
```

---

## Task 9: Discount Function — fixed-price evaluation, standalone (Rust)

**Files:**
- Modify: `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`

**Interfaces:**
- Produces: `Tier.fixed_price: Option<f64>`, `Tier.percent_off: Option<f64>` (type change — was a required `f64`)

**Important:** `percent_off` changes from a required `f64` to `Option<f64>` in this task, because a fixed-mode tier's stored JSON has no `percentOff` key at all. Every existing read of `tier.percent_off` in this file (the plain-percentage candidate's `Decimal(tier.percent_off)`, the anchor-price formula's `tier.percent_off / 100.0`, and both `format!("{}% off", tier.percent_off)` message calls, in both the standalone loop and the group loop) needs to unwrap the `Option` now. In every one of those call sites the tier is already known to be percent-mode (it's inside the `None => ...` / anchor-price branch, which by construction only runs for tiers that have `percentOff` set), so `.unwrap_or(0.0)` is safe and will never actually hit the fallback in practice — but the type system requires handling it either way.

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` block in `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`, after the existing tests:

```rust
    #[test]
    fn applies_a_fixed_price_tier_as_a_fixed_amount_discount() -> Result<()> {
        // basePrice 1.99, fixedPrice 1.50 at qty 3 → discount 0.49/unit * 3 = 1.47
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 3,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
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
                                    "tiers": [
                                        { "minQty": 1, "fixedPrice": 1.70 },
                                        { "minQty": 3, "fixedPrice": 1.50 }
                                    ]
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
                assert_eq!(op.candidates.len(), 1);
                match &op.candidates[0].value {
                    schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                        assert!((f.amount.0 - 1.47).abs() < 1e-9, "expected 1.47, got {}", f.amount.0);
                    }
                    _ => panic!("expected a FixedAmount value for a fixed-price tier"),
                }
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn uses_the_lower_reached_fixed_price_tier_between_thresholds() -> Result<()> {
        // qty 2 hasn't reached the minQty:3 tier, so the minQty:1 tier (1.70)
        // still governs the WHOLE quantity — same "highest reached tier"
        // rule as percentage tiers. Discount = (1.99-1.70)*2 = 0.58.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
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
                                    "tiers": [
                                        { "minQty": 1, "fixedPrice": 1.70 },
                                        { "minQty": 3, "fixedPrice": 1.50 }
                                    ]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::FixedAmount(f) => {
                    assert!((f.amount.0 - 0.58).abs() < 1e-9, "expected 0.58, got {}", f.amount.0);
                }
                _ => panic!("expected a FixedAmount value"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_fixed_price_above_sticker_price_never_produces_a_markup() -> Result<()> {
        // fixedPrice 5.00 on a 1.49 product must clamp to 0 discount, not a
        // negative amount that would inflate the price the customer pays.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
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
                                    "tiers": [{ "minQty": 1, "fixedPrice": 5.00 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0, "a clamped-to-zero discount must emit no candidates and no operations, same as any other zero-discount cart");
        Ok(())
    }

    #[test]
    fn defaults_fixed_price_to_none_when_the_stored_config_predates_the_field() -> Result<()> {
        // No "fixedPrice" key at all in the tier — must not error, for
        // backward compatibility with configs saved before this feature.
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
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => match &op.candidates[0].value {
                schema::ProductDiscountCandidateValue::Percentage(p) => assert_eq!(p.value.0, 10.0),
                _ => panic!("expected Percentage — a tier with no fixedPrice key must behave exactly as before"),
            },
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extensions/product-discount && cargo test`
Expected: FAIL to compile — `fixedPrice`/`fixed_price` doesn't exist on `Tier` yet, and the JSON fixtures for the last two tests (which omit `percentOff` entirely) would fail against the current required `percent_off: f64` field even once `fixed_price` is added.

- [ ] **Step 3: Implement**

Replace the `Tier` struct:

```rust
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Tier {
    min_qty: i32,
    #[shopify_function(default)]
    percent_off: Option<f64>,
    /// Optional exact total price for min_qty units (e.g. 10.00 for 7 units
    /// instead of a percentage's rounded 10.01). Absent entirely for a plain
    /// percentage-off tier, which keeps behaving exactly as before. percent
    /// mode only.
    #[shopify_function(default)]
    anchor_price: Option<f64>,
    /// Absolute price per unit for a fixed-price tier — every unit in the
    /// reached tier is charged this price directly. fixed mode only,
    /// mutually exclusive with percent_off/anchor_price (enforced by the
    /// admin app that writes this config, not by this struct).
    #[shopify_function(default)]
    fixed_price: Option<f64>,
}
```

Replace the standalone per-product evaluation block — the `if let Some(tier) = best_tier { ... }` body (from `let value = match tier.anchor_price {` through the closing of the `candidates.push(...)` call) — with a fixed-price branch checked first:

```rust
        if let Some(tier) = best_tier {
            if let Some(fixed_price) = tier.fixed_price {
                // Fixed-price tier: every unit in the reached tier is
                // charged exactly fixed_price, clamped so a misconfigured
                // price above sticker price can never produce a markup.
                let unit_price = line.cost().amount_per_quantity().amount().as_f64();
                let discount_amount_per_unit = (unit_price - fixed_price).max(0.0);
                let discount_amount = (discount_amount_per_unit * quantity as f64 * 100.0).round() / 100.0;

                if discount_amount > 0.0 {
                    candidates.push(schema::ProductDiscountCandidate {
                        targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                            schema::CartLineTarget {
                                id: line.id().clone(),
                                quantity: None,
                            },
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
                }
            } else {
                let percent_off = tier.percent_off.unwrap_or(0.0);
                let value = match tier.anchor_price {
                    Some(anchor_price) => {
                        // Anchor the total for min_qty units to an exact price
                        // (e.g. £10.00 instead of a percentage's rounded
                        // £10.01); units beyond min_qty still accrue at the
                        // tier's normal per-unit percentage rate. Expressed as a
                        // single FixedAmount off the whole line, computed here,
                        // so Shopify's own percentage rounding never has a
                        // chance to drift the anchored total off by a penny.
                        let unit_price = line.cost().amount_per_quantity().amount().as_f64();
                        let extra_units = (quantity - tier.min_qty) as f64;
                        // Derivation: total_paid should be anchor_price +
                        // extra_units * unit_price * (1 - percent_off/100).
                        // discount_amount = full_price - total_paid, which
                        // simplifies to the line below (the qty*unit_price and
                        // -extra_units*unit_price terms cancel down to
                        // min_qty*unit_price).
                        let discount_amount = (unit_price * tier.min_qty as f64) - anchor_price
                            + extra_units * unit_price * (percent_off / 100.0);
                        // Round to whole pence before clamping — this is real
                        // money, and TS/JS both round explicitly elsewhere in
                        // this codebase, so this f64 arithmetic shouldn't be the
                        // one place relying on Shopify's own downstream rounding
                        // to paper over floating-point remainders.
                        let discount_amount = (discount_amount * 100.0).round() / 100.0;
                        let discount_amount = discount_amount.max(0.0);
                        schema::ProductDiscountCandidateValue::FixedAmount(
                            schema::ProductDiscountCandidateFixedAmount {
                                amount: Decimal(discount_amount),
                                applies_to_each_item: Some(false),
                            },
                        )
                    }
                    None => schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                        value: Decimal(percent_off),
                    }),
                };

                candidates.push(schema::ProductDiscountCandidate {
                    targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                        schema::CartLineTarget {
                            id: line.id().clone(),
                            quantity: None,
                        },
                    )],
                    message: Some(format!("{}% off", percent_off)),
                    value,
                    associated_discount_code: None,
                    prerequisites: None,
                });
            }
        }
```

(The zero-discount guard around the fixed-price push mirrors the existing zero-pence skip in the group anchor-split loop below — a clamped-to-zero fixed-price discount is a pure no-op and should emit nothing, exactly like the pre-existing `never_produces_a_negative_discount_amount` test already expects for the percentage/anchor path when the computed discount would be non-positive. Confirm this by re-reading that existing test before writing Step 1's tests, if its exact zero-discount assertion shape isn't already clear from context.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test`
Expected: PASS — all tests, pre-existing ones (with `percent_off` now unwrapped via `.unwrap_or(0.0)` where needed) plus the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add extensions/product-discount/src/cart_lines_discounts_generate_run.rs
git commit -m "Add fixed-price tier evaluation to the standalone Discount Function path"
```

---

## Task 10: Discount Function — fixed-price evaluation, group (Rust)

**Files:**
- Modify: `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`

**Interfaces:**
- Consumes: `Tier.fixed_price` from Task 9, the existing largest-remainder split loop (same file)

- [ ] **Step 1: Write the failing tests**

Add to the same `#[cfg(test)] mod tests` block, after Task 9's tests:

```rust
    #[test]
    fn applies_a_fixed_price_group_tier_split_across_matching_lines() -> Result<()> {
        // 2 lines, qty 1 + qty 2 = 3 total, reaching minQty:3 (fixedPrice
        // 1.50). unit_price 1.99: discount_amount_total = (1.99-1.50)*3 =
        // 1.47. Split by quantity share: line0 (qty1) gets 1/3 = 49p, line1
        // (qty2) gets 2/3 = 98p — no remainder to distribute (49+98=147).
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 1,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
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
                                    "tiers": [
                                        { "minQty": 1, "fixedPrice": 1.70 },
                                        { "minQty": 3, "fixedPrice": 1.50 }
                                    ]
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
                let amounts: Vec<f64> = op
                    .candidates
                    .iter()
                    .map(|c| match &c.value {
                        schema::ProductDiscountCandidateValue::FixedAmount(f) => f.amount.0,
                        _ => panic!("expected a FixedAmount value for a fixed-price group tier"),
                    })
                    .collect();
                assert_eq!(amounts, vec![0.49, 0.98]);
                let total: f64 = amounts.iter().sum();
                assert!((total - 1.47).abs() < 1e-9, "amounts must sum exactly to the total discount, got {}", total);
            }
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }

    #[test]
    fn a_fixed_price_group_discount_never_produces_a_markup() -> Result<()> {
        // fixedPrice 5.00 on 1.99 products must clamp to 0, not a negative
        // total that would try to split a markup across the lines.
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "cost": { "amountPerQuantity": { "amount": "1.99" } },
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
                                    "status": "live",
                                    "productIds": ["gid://shopify/Product/1"],
                                    "tiers": [{ "minQty": 1, "fixedPrice": 5.00 }]
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test`
Expected: FAIL — the group loop's `tier.anchor_price` match has no fixed-price branch yet, so a fixed-price group tier currently falls through to the plain-`Percentage` path using `percent_off.unwrap_or(0.0)` (i.e. 0%), producing no real discount and the wrong candidate value type.

- [ ] **Step 3: Implement**

In the group evaluation loop, replace the `match tier.anchor_price { None => { ... } Some(anchor_price) => { ... } }` block with a fixed-price check wrapping the existing match:

```rust
        if let Some(fixed_price) = tier.fixed_price {
            // Fixed-price group tier: same largest-remainder split as the
            // anchored case below, but with a simpler total — every unit in
            // the reached tier is charged the same flat price, so there's
            // no "extra units beyond min_qty" distinction to compute.
            let discount_amount_total = ((line_unit_price - fixed_price) * total_quantity as f64 * 100.0).round() / 100.0;
            let discount_amount_total = discount_amount_total.max(0.0);

            let total_pence = (discount_amount_total * 100.0).round() as i64;
            let shares: Vec<f64> = line_quantities
                .iter()
                .map(|qty| discount_amount_total * (*qty as f64 / total_quantity as f64) * 100.0)
                .collect();
            let mut pence_per_line: Vec<i64> = shares.iter().map(|s| s.floor() as i64).collect();

            let floor_sum: i64 = pence_per_line.iter().sum();
            let remainder = total_pence - floor_sum;
            if remainder > 0 {
                let mut order: Vec<usize> = (0..shares.len()).collect();
                order.sort_by(|&a, &b| {
                    let frac_a = shares[a] - pence_per_line[a] as f64;
                    let frac_b = shares[b] - pence_per_line[b] as f64;
                    frac_b
                        .partial_cmp(&frac_a)
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then(a.cmp(&b))
                });
                for &idx in order.iter().take(remainder as usize) {
                    pence_per_line[idx] += 1;
                }
            }

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
                    // Plain percentage off — no split math needed, it's
                    // line-local by construction, so every matching line gets
                    // its own independent Percentage candidate.
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
                    // Same anchor formula as the standalone case, generalized to
                    // the group's combined quantity and shared unit price (the
                    // admin app guarantees every member shares one price).
                    let extra_units = (total_quantity - tier.min_qty) as f64;
                    let discount_amount_total = (line_unit_price * tier.min_qty as f64) - anchor_price
                        + extra_units * line_unit_price * (percent_off / 100.0);
                    let discount_amount_total = (discount_amount_total * 100.0).round() / 100.0;
                    let discount_amount_total = discount_amount_total.max(0.0);

                    // Split proportionally by quantity share, in whole pence,
                    // using the largest-remainder method: floor every line's
                    // exact share first, then hand out the leftover pence one at
                    // a time to the lines with the largest fractional
                    // remainder, ties broken toward the earliest line by cart
                    // order. Deliberately NOT "round each share independently,
                    // then dump the whole leftover onto one line" — that
                    // approach can go negative.
                    let total_pence = (discount_amount_total * 100.0).round() as i64;
                    let shares: Vec<f64> = line_quantities
                        .iter()
                        .map(|qty| discount_amount_total * (*qty as f64 / total_quantity as f64) * 100.0)
                        .collect();
                    let mut pence_per_line: Vec<i64> = shares.iter().map(|s| s.floor() as i64).collect();

                    let floor_sum: i64 = pence_per_line.iter().sum();
                    let remainder = total_pence - floor_sum;
                    if remainder > 0 {
                        let mut order: Vec<usize> = (0..shares.len()).collect();
                        order.sort_by(|&a, &b| {
                            let frac_a = shares[a] - pence_per_line[a] as f64;
                            let frac_b = shares[b] - pence_per_line[b] as f64;
                            frac_b
                                .partial_cmp(&frac_a)
                                .unwrap_or(std::cmp::Ordering::Equal)
                                .then(a.cmp(&b))
                        });
                        for &idx in order.iter().take(remainder as usize) {
                            pence_per_line[idx] += 1;
                        }
                    }

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
```

(This whole block replaces the existing `match tier.anchor_price { None => {...} Some(anchor_price) => {...} }` — the surrounding `let tier = match best_tier {...}` above it and the loop's closing brace below it are unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test`
Expected: PASS — all tests, including the 6 new ones from Tasks 9 and 10 plus every pre-existing test in this file.

- [ ] **Step 5: Commit**

```bash
git add extensions/product-discount/src/cart_lines_discounts_generate_run.rs
git commit -m "Add fixed-price tier evaluation to the group Discount Function path"
```

---

## Task 11: Storefront widget — fixed-price branch (JS)

**Files:**
- Modify: `extensions/product-tier-pricing/assets/tier-pricing.js`
- Test: `extensions/product-tier-pricing-tests/tier-pricing.test.js`

**Interfaces:**
- Produces: `computeTierState` now also returns `fixedPrice: number | null` on its result and on `nextTier`/`remainingTiers` entries; `perUnitPrice` handles a state with `fixedPrice` set

- [ ] **Step 1: Write the failing tests**

Add to `extensions/product-tier-pricing-tests/tier-pricing.test.js`, after the existing `computeTierState`/`perUnitPrice` tests (before the `sumGroupQuantityInCart` tests):

```js
test('computeTierState: a reached fixed-price tier reports fixedPrice, percentOff stays 0', () => {
  const tiers = [{ minQty: 1, fixedPrice: 1.70 }, { minQty: 3, fixedPrice: 1.50 }]
  const result = computeTierState(tiers, 3)

  assert.equal(result.percentOff, 0)
  assert.equal(result.fixedPrice, 1.50)
  assert.equal(result.minQty, 3)
})

test('computeTierState: below the lowest fixed-price tier reports no discount and lists fixedPrice on remaining tiers', () => {
  const tiers = [{ minQty: 3, fixedPrice: 1.50 }]
  const result = computeTierState(tiers, 1)

  assert.equal(result.fixedPrice, null)
  assert.deepEqual(result.remainingTiers, [{ minQty: 3, fixedPrice: 1.50, delta: 2 }])
})

test('computeTierState: between fixed-price tiers, nextTier carries the next fixedPrice', () => {
  const tiers = [{ minQty: 1, fixedPrice: 1.70 }, { minQty: 3, fixedPrice: 1.50 }]
  const result = computeTierState(tiers, 2)

  assert.equal(result.fixedPrice, 1.70)
  assert.deepEqual(result.nextTier, { minQty: 3, fixedPrice: 1.50, delta: 1 })
})

test('perUnitPrice: a fixed-price state returns the fixed price directly, ignoring quantity', () => {
  const state = { percentOff: 0, anchorPrice: null, fixedPrice: 1.50, minQty: 3 }
  assert.equal(perUnitPrice(1.99, 5, state), 1.50)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: FAIL — `computeTierState` doesn't return a `fixedPrice` field at all yet, and `perUnitPrice` doesn't check for one.

- [ ] **Step 3: Implement**

Replace `computeTierState` in `extensions/product-tier-pricing/assets/tier-pricing.js`:

```js
function computeTierState(tiers, quantity) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const reached = sorted.filter((t) => t.minQty <= quantity)
  const notReached = sorted.filter((t) => t.minQty > quantity)

  if (reached.length === 0) {
    return {
      percentOff: 0,
      anchorPrice: null,
      fixedPrice: null,
      minQty: null,
      nextTier: null,
      remainingTiers: notReached.map((t) => ({
        minQty: t.minQty,
        percentOff: t.percentOff,
        fixedPrice: t.fixedPrice != null ? t.fixedPrice : null,
        delta: t.minQty - quantity,
      })),
    }
  }

  const reachedTier = reached[reached.length - 1]
  const percentOff = reachedTier.percentOff
  const anchorPrice = reachedTier.anchorPrice != null ? reachedTier.anchorPrice : null
  const fixedPrice = reachedTier.fixedPrice != null ? reachedTier.fixedPrice : null

  if (notReached.length === 0) {
    return { percentOff, anchorPrice, fixedPrice, minQty: reachedTier.minQty, nextTier: null, remainingTiers: null }
  }

  const next = notReached[0]
  return {
    percentOff,
    anchorPrice,
    fixedPrice,
    minQty: reachedTier.minQty,
    nextTier: {
      minQty: next.minQty,
      percentOff: next.percentOff,
      fixedPrice: next.fixedPrice != null ? next.fixedPrice : null,
      delta: next.minQty - quantity,
    },
    remainingTiers: null,
  }
}
```

Replace `perUnitPrice`:

```js
function perUnitPrice(basePrice, quantity, state) {
  if (state.fixedPrice != null) {
    return state.fixedPrice
  }
  if (state.anchorPrice == null) {
    return basePrice * (1 - state.percentOff / 100)
  }
  const extraUnits = quantity - state.minQty
  const totalPaid = state.anchorPrice + extraUnits * basePrice * (1 - state.percentOff / 100)
  const fullPrice = basePrice * quantity
  const clampedTotalPaid = Math.min(Math.max(totalPaid, 0), fullPrice)
  return clampedTotalPaid / quantity
}
```

Now update the browser-only rendering in `renderTierPricing` (inside the `if (typeof document !== 'undefined')` block) to branch on `state.fixedPrice` for both the price display and the message text. Replace the body from `let discounted` through the closing of the message-building `if`/`else` chain:

```js
    let discounted
    const isDiscounted = state.fixedPrice != null || state.percentOff > 0
    if (isDiscounted) {
      discounted = perUnitPrice(basePrice, quantity, state)
      priceEl.innerHTML =
        '<s>' + formatMoney(basePrice, moneyFormat) + '</s> ' + formatMoney(discounted, moneyFormat)
    } else {
      priceEl.textContent = formatMoney(basePrice, moneyFormat)
    }

    if (state.fixedPrice != null) {
      const priceLine = formatMoney(state.fixedPrice, moneyFormat) + ' each'
      if (state.nextTier) {
        const nextLabel =
          state.nextTier.fixedPrice != null
            ? formatMoney(state.nextTier.fixedPrice, moneyFormat) + ' each'
            : state.nextTier.percentOff + '% Off'
        messageEl.innerHTML = priceLine + '<br>Add ' + state.nextTier.delta + ' more for ' + nextLabel
      } else {
        messageEl.textContent = priceLine
      }
    } else if (state.percentOff > 0) {
      const savings = basePrice - discounted
      const discountLine = 'Discount ' + state.percentOff + '% off (-' + formatMoney(savings, moneyFormat) + ')'

      if (state.nextTier) {
        const nextLabel =
          state.nextTier.fixedPrice != null
            ? formatMoney(state.nextTier.fixedPrice, moneyFormat) + ' each'
            : state.nextTier.percentOff + '% Off'
        messageEl.innerHTML = discountLine + '<br>Add ' + state.nextTier.delta + ' more for ' + nextLabel
      } else {
        messageEl.textContent = discountLine
      }
    } else if (state.remainingTiers && state.remainingTiers.length > 0) {
      messageEl.textContent = state.remainingTiers
        .map((t) => {
          const label = t.fixedPrice != null ? formatMoney(t.fixedPrice, moneyFormat) + ' each' : t.percentOff + '% Off'
          return 'Add ' + t.delta + ' for ' + label
        })
        .join(' or ')
    } else {
      messageEl.textContent = ''
    }
```

(The `nextTier`/`remainingTiers` label logic handles a `nextTier` whose OWN shape could in principle be either family — in practice a single discount is always one mode end-to-end per this feature's design, so `state.nextTier.fixedPrice`/`percentOff` are never both meaningfully set on the same real discount, but the check is cheap and keeps this function correct even if that ever changed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test extensions/product-tier-pricing-tests/tier-pricing.test.js`
Expected: PASS — all tests, pre-existing ones plus the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add extensions/product-tier-pricing/assets/tier-pricing.js extensions/product-tier-pricing-tests/tier-pricing.test.js
git commit -m "Add fixed-price tier support to the storefront widget"
```

---

## Task 12: Version bump

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.15.0"` to `"version": "0.16.0"`.

In `package-lock.json`, change both occurrences of `"version": "0.15.0"` (the top-level package entry and the `packages[""]` entry) to `"version": "0.16.0"`.

- [ ] **Step 2: Verify**

Run: `grep -n '"version"' package.json package-lock.json | head -5`
Expected: the first three occurrences now read `0.16.0`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Bump version to 0.16.0 for fixed-price discount tiers"
```

---

## Task 13: Deploy and live verification

Not a code task — closes the loop per the spec's "Live verification" testing-plan bullet. No automated test; these are manual steps against the real store.

- [ ] **Step 1: Push and deploy**

```bash
git push
```

Then deploy the updated Discount Function and theme extension:

```bash
nvm use 20.20.2 && shopify app deploy --allow-updates
```

- [ ] **Step 2: Create a real standalone fixed-price test discount**

In the admin app, create a standalone discount on a real test product: choose "Fixed price" mode, add tiers `1 for £1.70` and `3 or more for £1.50` (adjust to real prices for whatever product is used), confirm the "Resulting prices" table shows `Price each`/`Total at min qty` with no `%` column, and go live.

- [ ] **Step 3: Verify standalone cart math end-to-end**

Add 1 unit to a real cart via the storefront, confirm the line price matches the tier-1 fixed price. Increase to 3+, confirm it drops to the tier-2 fixed price for the whole line, matching the admin's "Resulting prices" table exactly.

- [ ] **Step 4: Create a real group fixed-price test discount**

Create a group discount (2-3 same-priced test products) in fixed-price mode, add tiers, go live.

- [ ] **Step 5: Verify group cart math end-to-end**

Add a mix of the group's products to a real cart reaching a fixed-price tier's threshold, confirm the combined checkout total matches `tier.fixedPrice × total quantity`, and confirm the storefront widget on each member's page shows the "£X each" messaging correctly.

- [ ] **Step 6: Verify the markup-safety clamp live**

Temporarily edit one tier's `fixedPrice` to a value above the test product's real price (e.g. £999), confirm the admin's "Resulting prices" table shows the clamped (unchanged, normal) price rather than £999, and confirm checkout charges the normal price with no discount — then set the tier back to a real value.

- [ ] **Step 7: Clean up test data**

Remove the test cart contents and either delete the test discounts/group or take them back to draft, so nothing remains live against real customer traffic.
