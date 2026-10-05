# Per-row pricing for time-based discounts — design

**Date:** 2026-10-05
**Status:** Draft for review
**Supersedes (in part):** `2026-09-22-time-based-collection-discount-design.md` — its discount-level pricing and its collections mode.

## 1. Problem

A time-based discount today has **one** price rule (`pricingMode` + `amount`) for everything it covers, and a fixed price is only allowed when all covered products share one regular price. But the products in a promotion have nothing in common except the time window; each needs its own fixed price or percentage. The admin page is also four separate forms with four Save buttons, and the discount's price is shown once ("£49.99 → £22.00") rather than per product.

## 2. Goal

A time-based discount is a **title + a schedule + a table of rows**. Each row is one product or variant with its **own** discount type (percent or fixed price) and amount. Checkout, the storefront price, and the countdown all follow each row's own price.

## 3. Decisions (agreed in brainstorming)

1. **Collections are removed.** Only individually added products/variants. Existing collection-based discounts are converted to one row per product they currently cover.
2. **Each part of the page saves itself** — no page-wide Save button. A **"Saved"** pill confirms each save.
3. **Creating** a discount asks only for title + schedule, creates it, and opens the same page, where rows are added.
4. **Deleting a row or the whole discount asks for confirmation.**
5. **One "Title" field.** The separate internal name is merged into it (see §4.1).
6. **Edit is inline:** the row's cells become inputs in place.

Rejected alternatives: (a) keep a discount-level price with per-row overrides — keeps the wrong model alive; (b) one Shopify discount record per row — Shopify allows at most **25 active automatic app discounts per store** ([changelog](https://shopify.dev/changelog/posts/increased-limits-for-automatic-function-based-discounts)), so a table of products would exhaust it.

## 4. Data model

### 4.1 `TimeDiscount` (stored in the shop config metafield, `sparkly_time_discounts`)

```ts
interface TimeDiscountItem {
  productId: string          // GID
  variantId?: string         // GID; omitted = the whole (single-variant) product
  pricingMode: 'percent' | 'fixed'
  amount: number             // percent off (0 < n <= 100), or the final price in major currency units
}

interface TimeDiscount {
  discountId: string
  shopifyDiscountId: string  // the DiscountAutomaticApp record (unchanged)
  title: string              // shown to customers in the countdown AND used as the admin label
  name: string               // legacy; kept equal to `title` on every title save, never shown
  startsAt: string           // naive shop-local, as today
  endsAt: string
  items: TimeDiscountItem[]
}
```

Removed: `pricingMode`, `amount`, `selection`, `resolvedMembers`.

**Invariants** (enforced on the server, and mirrored inline in the UI):
- `amount > 0`; for `percent`, `amount <= 100`.
- **Fixed price must be lower than the row's regular price** (the check added with PR #24, now applied per row). Equal or higher is rejected with the existing message.
- A product/variant appears at most once in a discount. A whole-product row and a variant row of the same product cannot coexist. A multi-variant product is added per variant (as the picker already does); a whole-product row is only for single-variant products.
- A product/variant cannot belong to another time-based discount or to a tier discount (the existing `isAvailableEverywhere` seam, unchanged).
- Size cap — see §6.2.

### 4.2 Compatibility with stored data

`normalizeTimeDiscount(raw)` runs on every read of the config. A stored discount without `items` is converted in memory: each entry of its `resolvedMembers` becomes an item carrying the discount's old `pricingMode`/`amount`; `name` is kept. Collection discounts need no network calls — `resolvedMembers` is already the snapshot of the products they covered. Nothing is rewritten until a discount is next saved, so reading is side-effect free. Saving any discount writes the new shape for that discount only.

## 5. Admin UI

### 5.1 Discount page (`/time-discounts/[discountId]`), top to bottom

1. **Title** — text input; saves when it loses focus (if changed and non-empty). Also sets `name`.
2. **Schedule** — start and end `datetime-local` (shop timezone); saves when both are filled and end is after start, on change (debounced ~600 ms). An invalid pair shows the inline "End must be after start" and does not save.
3. **Products table** — columns, in order:
   1. **Product** — product (and variant) name, a link to `https://{SHOPIFY_SHOP}/admin/products/{numericId}` (opens in a new tab; built on the server and passed down).
   2. **Discount type** — "Fixed price" or "{n}% off".
   3. **Discounted price** — computed from the row's rule and the regular price.
   4. **Regular price**.
   5. **Edit** — light-grey pencil icon button.
   6. **Delete** — light-grey bin icon button.
   Below the table: **+ Add product or variant**, which reuses the existing search/variant picker. Choosing one appends a row **already in edit mode** with type defaulting to percent and an empty amount; it is saved when its Save is pressed (so a half-added row never reaches checkout).
4. **Delete discount** — as today (`ConfirmForm`, native confirm: "Delete this discount entirely? This cannot be undone.").

### 5.2 Row behaviour

- **Edit** replaces the row's type/discounted-price cells with inputs: a type select, an amount input, a live "discounted price" preview, and Save / Cancel. Cancel restores the row. Only one row is edited at a time.
- **Save** validates (§4.1), calls the server, and on success returns the row to display mode and shows the pill. Server-side errors (e.g. "already belongs to another discount", size cap) appear inline in that row; the row stays in edit mode.
- **Delete** shows a native confirm — "Remove {product name} from this discount?" — then removes the row immediately and shows the pill.
- A discount with no rows is valid and applies to nothing.
- Icon buttons are `aria-label`led ("Edit {name}", "Delete {name}"), keyboard focusable, light grey (muted text colour, darker on hover/focus).

### 5.3 New discount page (`/time-discounts/new`)

Title and schedule only, with a **Create discount** button (disabled until both are valid). On success it redirects to the discount page. The discount exists with no rows (applies to nothing) until rows are added.

### 5.4 Discount list page

The per-discount "Fixed price / Percentage" label is removed. Each entry shows the title, the schedule label, and "{n} products" (rows). The label comes from `title`.

### 5.5 "Saved" pill

- A small, rounded-corner rectangle with the text **Saved**, rendered once by a client provider in the app layout; any client component calls `showSaved()`.
- **Motion:** it enters from above the top edge and slides down to about **50 px** from the top of the app, stays, then after **4 seconds** slides back up above the top of the window and is **removed from the DOM**. Slide duration ~300 ms (ease-out in, ease-in out). A new save while it is showing restarts the 4 seconds (no stacking).
- `role="status"` / `aria-live="polite"`; under `prefers-reduced-motion` it fades instead of sliding.
- Errors never use the pill; they are inline.

### 5.6 Saving mechanics

The new actions return `{ ok: true } | { ok: false, error: string }` instead of throwing/redirecting (only create and delete discount redirect), so errors render inline instead of triggering the error page. The page is a thin server component that loads the discount and passes plain data to a client `TimeDiscountEditor`, which owns the field/row state.

All discounts live in **one shop-config metafield**, so two overlapping saves could overwrite each other. The editor therefore **queues saves: one request in flight at a time**. Saves from two browser tabs at once are not coordinated (same exposure as today).

## 6. Checkout Function

### 6.1 Config and matching

The per-discount `sparkly_time_discounts.function_config` metafield (on the Shopify discount record) becomes:

```json
{ "items": [ { "productId": "gid://…", "variantId": "gid://…", "pricingMode": "fixed", "amount": 22 } ] }
```

For each cart line the Function picks the matching item: the **variant row first**, else the **whole-product row** (`variantId` absent). Price rules are unchanged: percent → that percentage off the line; fixed → the amount is the final per-unit price, clamped to the line's own price (no discount if not lower). A line with no matching item is untouched. **Legacy shape** — a config with `resolvedMembers` + one `pricingMode`/`amount` and no `items` — is still accepted and treated as one item per member with that rule, so live discounts keep working until re-saved.

The GraphQL input query is unchanged.

### 6.2 Size cap

Shopify drops a metafield value over 10,000 bytes (the Function then silently applies nothing), so the existing 9,500-byte guard stays, measured on the serialized config. Measured sizes: a variant row ≈ **149 bytes** → about **63 rows**; a whole-product row ≈ 89 bytes → about 106 (today's per-member limit is ≈ 85). Saving a row that would exceed the guard fails with: "This discount has too many rows to fit (about 60). Split it into two discounts."

## 7. Storefront

### 7.1 Metafield

`product.metafields.sparkly_product_discounts.time_based_discount` (written by `syncTimeDiscountMetafields`), one per product:

```json
{ "discountId": "…", "title": "…", "startsAt": "…Z", "endsAt": "…Z",
  "items": [ { "variantId": "gid://…" | null, "pricingMode": "fixed", "amount": 22 } ] }
```

Only that product's items. The sync groups items by product; when rows or the discount are removed, the metafields of products that no longer have rows are deleted (existing removed-products pattern). The old shape (top-level `pricingMode`/`amount`/`variantIds`) stays readable by the scripts.

### 7.2 Scripts (kept independent of each other)

`tier-pricing.js` (sale price in the main price row) and `time-based-discount.js` (countdown gating) each get a small pure function that picks the item for the selected variant — exact variant match, else the whole-product item — with names distinct across the two files (they share one global scope). The existing rules stay: no sale shown for a variant without an item, or when the price wouldn't be lower; the window-boundary re-render stays. `tier-pricing.liquid` and `time-based-discount.liquid` pass `items` (explicit `null`s when absent) instead of the three top-level fields.

## 8. Rollout and compatibility

Two PRs, in this order:

1. **Engine (backwards compatible):** the new `TimeDiscount` type + `normalizeTimeDiscount`; Function (items + legacy fallback); metafield sync and clear; both scripts and Liquid blocks (new + old shapes). Nothing visible changes; the existing admin still works through normalization. Safe to deploy alone.
2. **Admin:** the new discount page, new/list page changes, row actions, the "Saved" pill, delete confirmations. This is the first thing that writes the new shape.

After deploying PR 2, existing discounts stay valid; each gets the new shape (and a refreshed metafield per product) the next time it is saved. Deploy with `shopify app deploy --config shopify.app.toml` (production app).

## 9. Testing

- **Unit (vitest):** `normalizeTimeDiscount` (old products, old collections, new); row validation (percent range, fixed ≥ price, duplicates, product-vs-variant conflict, cap); the sync grouping and removal; the new actions' success/error results.
- **Component (RTL):** row edit/save/cancel, add row opens in edit mode, per-row inline errors, delete confirm (accept and decline), icon buttons' labels; the pill with fake timers — appears, still present at 3.9 s, slides out and is removed after 4 s + exit animation, a second save restarts it.
- **Rust:** variant row beats product row; fixed clamp; percent; unmatched line untouched; legacy `resolvedMembers` config; empty `items`.
- **JS (node:test + jsdom):** item selection per variant in both scripts; old and new metafield shapes; boundary re-render still works.
- **Manual on the live store after deploy:** create a discount with a fixed row and a percent row; re-open; check checkout price per row; the storefront price and countdown per variant; delete with confirmation.

## 10. Out of scope

Collections; per-row schedules; bulk import; reordering rows; tier-discount changes; coordinating saves across browser tabs.

## 11. Assumptions to confirm in review

- The pill text is **"Saved"** (your message said "save").
- One **Title** field replaces name + title; existing names stay in the data but are no longer shown.
- Row/discount delete use the browser's native confirm dialog (same as today's discount delete).
- A discount may have zero rows.
- Product links open the Shopify admin product page in a new tab.
