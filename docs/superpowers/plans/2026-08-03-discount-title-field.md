# Discount Title Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required, customer-facing `title` field to both standalone and group discounts — distinct from a group's existing internal `name` field — synced to the per-product storefront metafields so the redesigned mix & match widget (see `2026-08-03-mix-match-widget-redesign.md`) can interpolate it into its promo subhead (e.g. "Mix & match any **Canagan treat** — 7+ unlocks...").

**Architecture:** `title: string` becomes a required field on `ProductDiscount`/`GroupDiscount` (`src/lib/config.ts`), following this project's established required-field pattern (see the `pricingMode` precedent): required going forward, with `getConfig()` backfilling a sensible default for configs stored before this field existed. Two new Server Actions (`updateTitle`, `updateGroupTitle`) let a merchant edit the title independently of tiers/products, mirroring the page's existing per-section-form pattern. `src/lib/product-tiers.ts`'s existing metafield sync functions gain a `title` parameter, so the storefront-facing `tiers`/`group` metafields carry it whenever a discount is live.

**Tech Stack:** Next.js 16 Server Actions, Vitest — the same admin app as every other plan in this repo. This plan does **not** touch `extensions/product-tier-pricing/` or `extensions/product-discount/` — it only produces the data those already read/display (`unitPriceAtTier`, `buildPromoText`, etc. from the widget-redesign plan already consume this via `data-tiers`/`data-group`'s `title` key, gracefully falling back to generic copy while this plan hasn't shipped yet).

## Global Constraints

- Node version: run `nvm use 20.20.2` before any node/npm/npx/shopify command in this repo.
- `title` is **required at creation** for both standalone and group discounts (explicit decision) — `createDiscount`/`createGroup` throw if it's blank, matching this project's existing validation style (`if (!productId) throw new Error(...)`, `if (tiers.length === 0) throw new Error(...)`).
- **Backward compatibility for existing stored discounts** (created before this field existed): `getConfig()` backfills a default so nothing crashes or displays blank-and-broken. Standalone discounts default to an empty string (no better source available without adding a per-item Shopify API call inside `getConfig()`, which today is a single fast metafield read with no N+1 product lookups — not worth the architecture change for a cosmetic default). Group discounts default to their **existing `name` field** — a reasonable one-time migration default, since every group has always had a `name`. Either default is silently overridden the moment a merchant explicitly sets a real title (same "spread after default" trick already used for `pricingMode`, see Task 1).
- The group's existing `name` field is **unchanged and untouched** by this plan — it remains the internal/admin-only label used in the discounts list. `title` is a wholly separate, new field.
- The home page's discount list (`src/app/page.tsx`) is **intentionally not updated** to show `title` — it's customer-facing marketing copy, not admin-operational context, and the existing list already shows `name`/product title for admin identification. Out of scope; revisit only if explicitly requested.
- Commit after every task (not every step) unless a step's own instructions say otherwise.
- Bump `version` in `package.json` (and `package-lock.json`'s matching two `version` fields) — a new feature, minor bump, in the same commit as the last code task, per this project's versioning convention.

---

## Task 1: Data model — `title` on both discount types, backward compatibility

**Files:**
- Modify: `src/lib/config.ts`
- Test: `tests/lib/config.test.ts`
- Test: (mechanical fixture repair) `tests/actions/discountActions.test.ts`, `tests/actions/groupProductActions.test.ts`

**Interfaces:**
- Produces: `ProductDiscount.title: string`, `GroupDiscount.title: string` (both required)

This task makes `title` a **required** field on both types, which will break every existing test/call site that constructs one without it — the same shape of change as the `pricingMode` field in the fixed-price-tiers plan, repaired the same mechanical way (via the TypeScript compiler's own error output).

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/config.test.ts`, inside the `describe('getConfig', ...)` block, after its last existing test:

```ts
it('defaults title to an empty string for a product discount stored before this field existed', async () => {
  const stored = {
    products: [{ productId: 'gid://shopify/Product/1', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
    groups: [],
  }
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify(stored) } },
  })
  const config = await getConfig()
  expect(config.products[0].title).toBe('')
})

it('defaults title to the group\'s existing name for a group discount stored before this field existed', async () => {
  const stored = {
    products: [],
    groups: [{ groupId: 'grp_1', name: 'Soups', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 7, percentOff: 10 }] }],
  }
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify(stored) } },
  })
  const config = await getConfig()
  expect(config.groups[0].title).toBe('Soups')
})

it('preserves an explicit title over the backfilled default', async () => {
  const stored = {
    products: [{ productId: 'gid://shopify/Product/1', status: 'live', pricingMode: 'percent', title: 'Canagan Tuna Soup', tiers: [{ minQty: 5, percentOff: 10 }] }],
    groups: [{ groupId: 'grp_1', name: 'Soups', status: 'live', pricingMode: 'percent', title: 'Canagan treat', productIds: ['gid://shopify/Product/1'], tiers: [{ minQty: 7, percentOff: 10 }] }],
  }
  vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    shop: { metafield: { value: JSON.stringify(stored) } },
  })
  const config = await getConfig()
  expect(config.products[0].title).toBe('Canagan Tuna Soup')
  expect(config.groups[0].title).toBe('Canagan treat')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && npm test -- tests/lib/config.test.ts`
Expected: FAIL — `title` is `undefined`, not `''`/`'Soups'`/the explicit values.

- [ ] **Step 3: Implement the data model**

In `src/lib/config.ts`, add `title: string` to both interfaces:

```ts
export interface ProductDiscount {
  productId: string
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  title: string
  tiers: Tier[]
}

export interface GroupDiscount {
  groupId: string
  name: string
  status: 'draft' | 'live'
  productIds: string[]
  pricingMode: 'percent' | 'fixed'
  title: string
  tiers: Tier[]
}
```

Update `getConfig()`'s backfill (the two lines that already backfill `pricingMode`):

```ts
  const products = (parsed.products ?? []).map((p) => ({ pricingMode: 'percent' as const, title: '', ...p })) as ProductDiscount[]
  const groups = (parsed.groups ?? []).map((g) => ({ pricingMode: 'percent' as const, title: g.name ?? '', ...g })) as GroupDiscount[]
```

(Spreading `p`/`g` after both defaults means an explicitly stored `title` always wins; a missing one falls back to `''` for products or the group's own `name` for groups.)

- [ ] **Step 4: Fix every now-broken construction site via the TypeScript compiler**

Run: `nvm use 20.20.2 && npx tsc --noEmit`

Expected: a list of errors — every place `discountActions.ts`, `groupProductActions.ts` (if it constructs a `ProductDiscount`/`GroupDiscount` literal), and the test files construct one of these objects without `title` now fails.

For every flagged object literal, add `title: 'Some Title',` (a short, clearly-placeholder value like `'Some Title'` or `'Test Group'` — distinct enough that a real title never accidentally collides with it) next to `pricingMode`, matching this task's own style above — **except** the three new tests from Step 1, which deliberately omit or vary it to test the backfill/override behavior; leave those exactly as written. In `src/actions/discountActions.ts` specifically, the two real (non-test) construction sites — inside `createDiscount` and `createGroup` — get the REAL form-driven value instead of a placeholder; this is covered by Task 2, not this task. For now, if `npx tsc --noEmit` flags those two sites before Task 2 runs, use a temporary hardcoded `title: ''` there exactly as the fixed-price-tiers plan's Task 1 temporarily hardcoded `pricingMode: 'percent'` before its own Task 3 wired up the real value — Task 2 replaces both.

Re-run `npx tsc --noEmit` after each batch of fixes until it reports zero errors.

- [ ] **Step 5: Run the full test suite to verify everything passes**

Run: `npm test`
Expected: PASS, every test file green, including the three new ones from Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config.ts src/actions/discountActions.ts tests/lib/config.test.ts tests/actions/discountActions.test.ts tests/actions/groupProductActions.test.ts
git commit -m "Add required title field to standalone and group discounts, with backward-compat backfill"
```

---

## Task 2: `discountActions.ts` — read/write/validate title

**Files:**
- Modify: `src/actions/discountActions.ts`
- Test: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `ProductDiscount`, `GroupDiscount` from `@/lib/config` (Task 1)
- Produces: `updateTitle(productId: string, formData: FormData): Promise<void>`, `updateGroupTitle(groupId: string, formData: FormData): Promise<void>` — both new exported Server Actions

- [ ] **Step 1: Write the failing tests**

Add to `tests/actions/discountActions.test.ts`, inside `describe('createDiscount', ...)`:

```ts
it('requires a non-blank title', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })

  const formData = new FormData()
  formData.set('productId', 'gid://shopify/Product/111')
  formData.set('title', '   ')
  formData.set('tier-0-minQty', '5')
  formData.set('tier-0-percentOff', '10')

  await expect(createDiscount(formData)).rejects.toThrow('A title is required')
})

it('saves the trimmed title alongside a new discount', async () => {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

  const formData = new FormData()
  formData.set('productId', 'gid://shopify/Product/111')
  formData.set('title', '  Canagan Tuna Soup  ')
  formData.set('pricingMode', 'percent')
  formData.set('tier-0-minQty', '5')
  formData.set('tier-0-percentOff', '10')

  await createDiscount(formData)

  expect(saveSpy).toHaveBeenCalledWith({
    products: [{
      productId: 'gid://shopify/Product/111',
      status: 'draft',
      pricingMode: 'percent',
      title: 'Canagan Tuna Soup',
      tiers: [{ minQty: 5, percentOff: 10 }],
    }],
    groups: [],
  })
})
```

Add a new `describe('updateTitle', ...)` block:

```ts
describe('updateTitle', () => {
  it('updates the title of an existing standalone discount and re-syncs the metafield when live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', title: 'Old Title', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('title', 'New Title')

    await updateTitle('gid://shopify/Product/111', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', title: 'New Title', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', [{ minQty: 5, percentOff: 10 }], 'New Title')
  })

  it('does not sync the metafield when the discount is draft', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', title: 'Old Title', tiers: [] }],
      groups: [],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('title', 'New Title')

    await updateTitle('gid://shopify/Product/111', formData)

    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('throws when the title is blank', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', title: 'Old Title', tiers: [] }],
      groups: [],
    })

    const formData = new FormData()
    formData.set('title', '  ')

    await expect(updateTitle('gid://shopify/Product/111', formData)).rejects.toThrow('A title is required')
  })

  it('throws when the discount does not exist', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })

    const formData = new FormData()
    formData.set('title', 'New Title')

    await expect(updateTitle('gid://shopify/Product/999', formData)).rejects.toThrow('not found')
  })
})
```

Add analogous tests inside `describe('createGroup', ...)` and a new `describe('updateGroupTitle', ...)` block, mirroring the four tests above exactly but for `createGroup`/`updateGroupTitle`, a `GroupDiscount`, and `productTiers.syncGroupTierMetafield` (its call assertion checks the full `GroupTierSyncData` object now includes `title`, e.g. `{ title: 'New Title', tiers: [...], siblings: [...] }` — construct the mocked `getGroupProductInfo`/siblings data the same way this file's existing `updateGroupTiers` tests already do, since `updateGroupTitle` needs sibling data to rebuild the synced payload exactly as `updateGroupTiers` does today).

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && npm test -- tests/actions/discountActions.test.ts`
Expected: FAIL — `updateTitle`/`updateGroupTitle` aren't exported yet, `createDiscount`/`createGroup` don't validate or save `title` yet.

- [ ] **Step 3: Implement**

In `src/actions/discountActions.ts`, update `createDiscount` — add title extraction/validation right after the existing `productId` check, and include it in the constructed `newDiscount`:

```ts
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')
```

(Place this after the `if (!productId) throw new Error('A product is required')` line and before `parseTiersFromForm` is called — exact insertion point depends on Task 1/Task-3-of-the-fixed-price-tiers-plan's current body shape; find the existing `pricingMode` line and add this immediately before or after it, then add `title,` to the `newDiscount` object literal next to `pricingMode`.)

Add a new exported action, placed near `updateTiers`:

```ts
export async function updateTitle(productId: string, formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.title = title
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncProductTierMetafield(productId, discount.tiers, title)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}
```

Update `createGroup` the same way — add title extraction/validation after the existing `name` check, add `title,` to the constructed `newGroup` object literal.

Add `updateGroupTitle`, placed near `updateGroupTiers`:

```ts
export async function updateGroupTitle(groupId: string, formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  group.title = title
  await saveConfig(config)

  if (group.status === 'live') {
    await syncGroupMetafields(group)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}
```

(`syncGroupMetafields` is this file's existing private helper that `updateGroupTiers`/`setGroupStatus` already call — it fetches sibling info via `getGroupProductInfo` and calls `syncGroupTierMetafield` for every member with the full `GroupTierSyncData` shape. Once Task 3 adds `title` to that shape, `syncGroupMetafields` picks it up automatically from `group.title` — no separate change needed here beyond calling the existing helper.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: PASS, all tests including pre-existing ones. Run `npx tsc --noEmit` — expect it to flag `syncProductTierMetafield`'s call sites needing a third argument (Task 3 adds that parameter) and `syncGroupMetafields`'s internal construction of `GroupTierSyncData` needing `title` — both addressed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts
git commit -m "Add title validation to discount/group creation, and updateTitle/updateGroupTitle actions"
```

---

## Task 3: `product-tiers.ts` — sync title to the storefront metafields

**Files:**
- Modify: `src/lib/product-tiers.ts`
- Modify: `src/actions/discountActions.ts` (update every remaining call site the compiler flags)
- Test: `tests/lib/product-tiers.test.ts`

**Interfaces:**
- Produces: `syncProductTierMetafield(productId: string, tiers: Tier[] | null, title: string): Promise<void>` (signature change — new required third parameter), `GroupTierSyncData.title: string` (new required field)

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/product-tiers.test.ts`, inside the existing `describe` block covering `syncProductTierMetafield`:

```ts
it('includes the title in the synced tiers metafield JSON', async () => {
  const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    metafieldsSet: { userErrors: [] },
  })

  await syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 5, percentOff: 10 }], 'Canagan Tuna Soup')

  expect(spy).toHaveBeenCalledWith(
    expect.stringContaining('metafieldsSet'),
    expect.objectContaining({
      metafields: [
        expect.objectContaining({
          value: JSON.stringify({ title: 'Canagan Tuna Soup', tiers: [{ minQty: 5, percentOff: 10 }] }),
        }),
      ],
    }),
  )
})
```

And inside the `describe` block covering `syncGroupTierMetafield`:

```ts
it('includes the title in the synced group metafield JSON', async () => {
  const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
    metafieldsSet: { userErrors: [] },
  })

  await syncGroupTierMetafield('gid://shopify/Product/1', {
    title: 'Canagan treat',
    tiers: [{ minQty: 7, percentOff: 10 }],
    siblings: [{ title: 'Canagan Duck Pouch', handle: 'canagan-duck-pouch' }],
  })

  expect(spy).toHaveBeenCalledWith(
    expect.stringContaining('metafieldsSet'),
    expect.objectContaining({
      metafields: [
        expect.objectContaining({
          value: JSON.stringify({
            title: 'Canagan treat',
            tiers: [{ minQty: 7, percentOff: 10 }],
            siblings: [{ title: 'Canagan Duck Pouch', handle: 'canagan-duck-pouch' }],
          }),
        }),
      ],
    }),
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `nvm use 20.20.2 && npm test -- tests/lib/product-tiers.test.ts`
Expected: FAIL — `syncProductTierMetafield` doesn't accept a third argument yet (or ignores it), and `GroupTierSyncData`/`syncGroupTierMetafield` don't include `title` in the written JSON.

- [ ] **Step 3: Implement**

In `src/lib/product-tiers.ts`, update the signature and JSON body of `syncProductTierMetafield`:

```ts
export async function syncProductTierMetafield(productId: string, tiers: Tier[] | null, title: string): Promise<void> {
```

(The `tiers === null` delete branch is unchanged — it doesn't need `title`.) In the non-null branch, change the `value` from `JSON.stringify({ tiers })` to:

```ts
          value: JSON.stringify({ title, tiers }),
```

Update `GroupTierSyncData`:

```ts
export interface GroupTierSyncData {
  title: string
  tiers: Tier[]
  siblings: { title: string; handle: string }[]
}
```

`syncGroupTierMetafield`'s body already does `JSON.stringify(data)` for the whole `GroupTierSyncData` object — since `title` is now part of that type, no change is needed inside this function beyond the interface itself; TypeScript enforces every caller supplies it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/product-tiers.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Fix every now-broken call site via the TypeScript compiler**

Run: `npx tsc --noEmit`

Expected: errors in `src/actions/discountActions.ts` at every call to `syncProductTierMetafield` (missing third argument) and every place a `GroupTierSyncData` object is constructed (missing `title`). For each:

- A `syncProductTierMetafield(productId, tiers)` call (e.g. inside `updateTiers`, `setStatus`, `deleteDiscount`'s cleanup) needs the discount's `title` added as a third argument — the enclosing function already has the `discount`/`config` in scope to read `.title` from (for `deleteDiscount`'s cleanup call passing `tiers: null`, `title` doesn't matter functionally since the delete branch ignores it, but TypeScript still requires an argument — pass `discount.title` there too, for consistency, rather than an empty-string placeholder).
- The private `syncGroupMetafields` helper's construction of the `GroupTierSyncData` object passed to `syncGroupTierMetafield` needs `title: group.title` added.

Re-run `npx tsc --noEmit` after each fix until it reports zero errors, then `npm test` for the full suite.

- [ ] **Step 6: Commit**

```bash
git add src/lib/product-tiers.ts tests/lib/product-tiers.test.ts src/actions/discountActions.ts
git commit -m "Sync discount title into the storefront-facing tiers/group metafields"
```

---

## Task 4: Admin UI — standalone discount title input

**Files:**
- Modify: `src/app/discounts/new/page.tsx`
- Modify: `src/app/discounts/[productId]/page.tsx`

No automated test — matches this codebase's existing convention of untested page components. Verified via a successful `npm run build` and a live check in Task 6.

- [ ] **Step 1: Add the title input to the new-discount page**

In `src/app/discounts/new/page.tsx`, add a title field to the form, placed above the existing "Product" section:

```tsx
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
          <p className="block text-sm font-medium mb-2">Product</p>
          <ProductPicker initialProduct={null} />
        </div>
```

(This replaces the existing standalone `<div>` that starts with `<p className="block text-sm font-medium mb-2">Product</p>` — insert the new title `<div>` immediately before it, inside the same `<form action={createDiscount} className="space-y-6">`.)

- [ ] **Step 2: Add a title section to the discount edit page**

In `src/app/discounts/[productId]/page.tsx`, add a new section (its own form, its own action) — insert it as the first `<section>` inside `<main>`, before the existing "Tiers" section:

```tsx
      <section className="mb-8">
        <h2 className="font-medium mb-2">Title</h2>
        <form action={updateTitleWithId} className="flex gap-2">
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
        </form>
      </section>
```

Add the import and the bound action alongside the page's existing ones:

```tsx
import { updateTiers, updateTitle, setStatus, deleteDiscount } from '@/actions/discountActions'
```

```tsx
  const updateTitleWithId = updateTitle.bind(null, productId)
```

- [ ] **Step 3: Verify the app builds**

Run: `nvm use 20.20.2 && npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/discounts/new/page.tsx src/app/discounts/\[productId\]/page.tsx
git commit -m "Add title input to the standalone discount create and edit pages"
```

---

## Task 5: Admin UI — group discount title input

**Files:**
- Modify: `src/app/discounts/groups/new/page.tsx`
- Modify: `src/app/discounts/groups/[groupId]/page.tsx`

No automated test — same convention as Task 4. Verified via a successful `npm run build` and a live check in Task 6.

- [ ] **Step 1: Add the title input to the new-group page**

In `src/app/discounts/groups/new/page.tsx`, add a title field, placed after the existing "Group name" field and before "Products":

```tsx
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Canagan treat"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <p className="text-xs text-muted mt-2">
            Shown to customers in the storefront widget's promo text (e.g. "Mix &amp; match any {'{title}'}"). Distinct from the group name above, which is only ever shown in this admin.
          </p>
        </div>
```

(Insert this new `<div>` between the existing "Group name" `<div>` and the "Products" `<div>`, inside the same `<form action={createGroup} className="space-y-6">`.)

- [ ] **Step 2: Add a title section to the group edit page**

In `src/app/discounts/groups/[groupId]/page.tsx`, add a new section as the first `<section>` inside `<main>`, before the existing "Products" section — same shape as Task 4 Step 2:

```tsx
      <section className="mb-8">
        <h2 className="font-medium mb-2">Title</h2>
        <form action={updateTitleWithId} className="flex gap-2">
          <label htmlFor="title" className="sr-only">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={group.title}
            className="flex-1 border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save title
          </button>
        </form>
      </section>
```

Add the import and bound action:

```tsx
import { updateGroupProducts, updateGroupTiers, updateGroupTitle, setGroupStatus, deleteGroup } from '@/actions/discountActions'
```

```tsx
  const updateTitleWithId = updateGroupTitle.bind(null, groupId)
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/discounts/groups/new/page.tsx src/app/discounts/groups/\[groupId\]/page.tsx
git commit -m "Add title input to the group discount create and edit pages"
```

---

## Task 6: Version bump

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the version**

Read the current version (`grep '"version"' package.json`), bump the minor segment in `package.json`, and both matching occurrences in `package-lock.json`. (If the mix-and-match widget-redesign plan's Task 6 already bumped the version, bump one further minor step from whatever's current — check `git log --oneline -- package.json | head -3` if unsure which version is actually latest on `main`.)

- [ ] **Step 2: Verify**

Run: `grep -n '"version"' package.json package-lock.json | head -5`
Expected: the first three occurrences all show the new version.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Bump version for the discount title field"
```

---

## Task 7: Deploy and live verification

Not a code task — this plan touches the admin app (`src/`), so unlike the widget-redesign plan, **this one needs a real push to `main` and a Vercel production deploy**, not `shopify app deploy` (see this repo's own `README.md` §8 if present, or this plan's own reasoning: `shopify app deploy` only ships `extensions/**`, never `src/`).

- [ ] **Step 1: Push and confirm the Vercel deploy**

```bash
git push
```

Confirm a new Vercel production deployment starts and completes for the pushed commit (via the Vercel dashboard or MCP tooling, matching this project's established "confirm the deployed commit SHA, don't assume" practice) before considering this live.

- [ ] **Step 2: Create a real title end-to-end**

In the admin app, create a new standalone discount with a title (e.g. "Canagan Tuna Soup"), go live, and confirm `product.metafields.sparkly_product_discounts.tiers` on that product now includes `"title":"Canagan Tuna Soup"` (check via the Shopify admin's metafield inspector or a GraphQL query).

- [ ] **Step 3: Create a real group title end-to-end**

Create a group discount with its own title (distinct from the group name, e.g. name "Q4 Canagan Promo" but title "Canagan treat"), go live, and confirm every member product's `sparkly_product_discounts.group` metafield includes the title.

- [ ] **Step 4: Verify the widget picks it up (only if the widget-redesign plan has also shipped)**

If `2026-08-03-mix-match-widget-redesign.md` has already been deployed, load the product page and confirm the promo subhead now reads "Mix & match any Canagan treat — ..." instead of the generic fallback. If that plan hasn't shipped yet, this step doesn't apply yet — the widget's fallback copy is expected until it does.

- [ ] **Step 5: Verify editing an existing pre-title discount**

Open a discount created before this feature shipped (title backfilled to `''` for standalone or the group's `name` for groups per this plan's backward-compat default), confirm the title section shows the backfilled value (blank input for an old standalone discount — check this doesn't violate the `required` HTML attribute in a confusing way; a blank `required` field is valid HTML, just needs a real value before the merchant can save), fill it in, save, and confirm it persists.
