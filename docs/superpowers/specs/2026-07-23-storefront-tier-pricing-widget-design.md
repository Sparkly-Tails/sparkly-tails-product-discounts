# Storefront Tier-Pricing Widget — Design

**Date:** 2026-07-23
**Status:** Approved, ready for implementation planning
**Store:** Sparkly Tails (`sparklytails.com`) — Shopify **Basic** plan
**Relationship to prior work:** Piece B of
`sparkly-tails-product-discounts` — the storefront widget explicitly
deferred as out of scope in
`docs/superpowers/specs/2026-07-22-per-product-discount-function-engine-design.md`
§8, now that Piece A (the discount engine itself) is live on the real
store.

---

## 1. Purpose

The discount Function computes a customer's price correctly at cart and
checkout time, but the product page itself always shows the plain,
undiscounted price — by design, since Piece A's whole point was to keep
Google Shopping and the product page showing real, undiscounted prices.
Customers currently have no way to know a quantity discount exists until
they've already added enough units to their cart.

This phase adds a **live-updating price widget** to the product page: as
the customer changes the quantity selector, the displayed price updates
in place to show what they'd actually pay per unit at that quantity, plus
a nudge toward the next available discount tier. No cross-sell/bundle
content — bundles don't exist in this app yet, so there is nothing to
cross-sell to.

---

## 2. Decisions and why

### 2.1 A Shopify theme app extension block, not a hardcoded theme edit

The store's other installed apps (Judge.me, Loop Subscriptions, Selleasy)
already integrate into the `main-product` section as theme app extension
blocks the merchant adds via the theme editor — not by editing
`main-product.liquid` directly. This widget follows the same pattern:
a new theme app extension, added to the `sparkly-tails-product-discounts`
app alongside its existing discount Function extension, contributing one
Liquid block the merchant places wherever they want on the product page
(typically near the price or buy button).

### 2.2 A denormalized per-product metafield, not a live API call

Piece A stores all discount config in a single shop-level metafield
(`shop.metafields.sparkly_product_discounts.config`), keyed by product ID
inside one JSON blob — correct for the Function, which reads the whole
config every cart evaluation regardless of size, but wrong for a theme
block, which needs only *one* product's tiers and must render
server-side with zero added latency.

Adding a second, per-product metafield
(`product.metafields.sparkly_product_discounts.tiers`) — written
alongside the shop-level config by the same Server Actions, whenever a
product's discount changes — lets the theme block read exactly what it
needs directly via Liquid at render time, with no extra network round
trip and no new infrastructure (no Shopify App Proxy, no public
endpoint, no CORS surface). The shop-level config remains the only
source of truth the Function itself reads; the per-product metafield is
a derived, read-only cache that exists solely for this widget.

**Consistency:** written in the same Server Action call as the
shop-level config, so there's no separate reconciliation step and no
window where they can drift out of sync from a partial failure — if the
per-product write fails, the whole Server Action throws and neither
value updates (see §4).

### 2.3 Live-updating price via vanilla JS, not a static tier list

The merchant confirmed the widget should update the *displayed price*
live as the quantity selector changes (not just show a static "buy X get
Y% off" list that never changes). This requires client-side JS wired to
the theme's existing quantity input and variant-change event — Shopify
theme app extensions have no framework of their own, so this is plain
JS reading data the Liquid block already embedded on page load. No
network calls happen after the initial page render.

### 2.4 Copy logic, confirmed against real mockups

Three states, generalizing to any number of tiers:

1. **Below every tier:** plain price, no strikethrough. One line listing
   every not-yet-reached tier as a delta from the *current* quantity,
   joined with "or": `Add {delta} for {percentOff}% or {delta} for
   {percentOff}% Off`, chained for as many tiers as exist.
2. **At or above at least one tier, but not the highest:** strikethrough
   original price + discounted price, `Discount {percentOff}% off
   (-£{savings})`, plus exactly one nudge line for the single next
   un-reached tier: `Add {delta} more for {nextPercentOff}% Off`.
3. **At or above the highest tier:** strikethrough + discounted price +
   discount line, no nudge line — nothing higher to reach.

A single-tier product only ever has states 1 and 3 (no "next tier" to
nudge toward once the one tier is reached). `delta` is always computed
from the customer's *current* selected quantity, not restated from the
tier's raw threshold — confirmed explicitly, since the numbers in early
mockups were illustrative rather than exact.

If a product has no live discount configured at all (metafield absent),
the block renders nothing — no empty box, no fallback text.

---

## 3. Data model

**New metafield**, written by the admin app, read by the theme block:

```
namespace: sparkly_product_discounts
key: tiers
type: json
owner: Product

{
  "tiers": [
    { "minQty": 7, "percentOff": 5 },
    { "minQty": 14, "percentOff": 10 }
  ]
}
```

Same `Tier` shape already defined in `src/lib/config.ts` — no new types,
just a second write target for the same data.

---

## 4. Admin app changes

`src/actions/discountActions.ts`'s existing functions each already call
`saveConfig()` (shop-level). Each one that changes a product's status or
tiers now also syncs the per-product metafield in the same action, after
`saveConfig()` succeeds:

- `createDiscount` / `updateTiers`, when the resulting status is `live`:
  write `product.metafields.sparkly_product_discounts.tiers` with the
  current tier list.
- `setStatus('draft')`: delete the per-product metafield (via
  `metafieldsDelete`) — a draft discount must not be visible to the
  storefront block.
- `setStatus('live')`: write the per-product metafield from the
  product's existing tiers.
- `deleteDiscount`: delete the per-product metafield.

A new `src/lib/product-tiers.ts` module owns this: `syncProductTierMetafield(productId, tiers | null)` —
`null` means delete. `discountActions.ts` calls it; it does not
duplicate `shopifyQuery` plumbing.

If the per-product sync call fails, the Server Action throws (same
failure behavior as today when `saveConfig()` itself fails) — the
merchant sees the existing error handling, and no partial state is left
where the shop-level config disagrees with what the storefront shows,
beyond the same all-or-nothing failure mode Piece A already has.

---

## 5. Theme app extension

New extension in the same Shopify app, alongside the existing discount
Function:

```
extensions/product-tier-pricing/
  shopify.extension.toml
  blocks/
    tier-pricing.liquid
  assets/
    tier-pricing.js
  locales/
    en.default.json
```

**`tier-pricing.liquid`** (app block, added via the theme editor into
the product template):

- Reads `product.metafields.sparkly_product_discounts.tiers`. If absent
  or empty, renders nothing.
- Otherwise renders a container with:
  - The current variant's price, server-rendered as the initial state
    (matches state 1 or whatever the default/first-available variant's
    default quantity computes to — in practice quantity inputs default
    to 1, so almost always state 1 on first paint).
  - An embedded `<script type="application/json">` with the tiers array
    and the variant's price (in the shop's currency subunit, matching
    Shopify's existing money-formatting conventions), keyed to the
    block's `{{ block.id }}` so multiple instances never collide.
  - Empty text-content placeholders (`data-tier-pricing-price`,
    `data-tier-pricing-message`) that the JS fills in and updates.

**`tier-pricing.js`**:

- On load, parses the embedded JSON, finds the theme's quantity input
  (`input[name="quantity"]`, matching the existing
  `snippets/product-quantity.liquid` pattern already in the theme — no
  duplicate input added) and the product form's variant-change event.
- Pure function `computeTierState(tiers, quantity)` → `{ percentOff,
  nextTier | null }`, covering all three states from §2.4. Exported for
  the test file to import directly (no DOM needed to test the logic).
- On quantity or variant change, recomputes and updates the DOM
  placeholders in place. No network requests.

---

## 6. Testing

- `computeTierState`: unit tests (Vitest, colocated with the theme
  extension's own small test setup — mirrors `tier-math.ts`'s existing
  test style) covering: below all tiers (multi-tier listing), between
  tiers (single next-tier nudge), at the highest tier (no nudge),
  single-tier product (no next-tier state ever reachable), zero tiers
  (should not be called — block guards this in Liquid, but the function
  itself returns "no discount" safely if given an empty array).
- `syncProductTierMetafield`: unit tests (Vitest + mocked
  `shopifyQuery`, same pattern as `config.test.ts`) covering: writes
  tiers JSON for a live product, deletes the metafield when passed
  `null`, propagates `userErrors` as a thrown error.
- `discountActions.ts`'s existing tests extended to assert
  `syncProductTierMetafield` is called with the right arguments for
  each status transition (live→draft deletes, draft→live writes,
  tier edits on an already-live product re-write).
- Manual, on the real theme: add the block to a live product's page,
  confirm all three states render correctly as the quantity input
  changes, confirm a product with no discount configured shows nothing,
  confirm a multi-variant product recomputes on variant change.

---

## 7. Out of scope (deferred, not forgotten)

- **Bundle cross-sell** — still blocked on bundle creation itself (Piece
  C), which doesn't exist in this app yet. Once bundles exist, a
  cross-sell mention can be added to this same block or a new one.
- **Collection-page or cart-page price previews** — this phase is the
  product page only, matching what was actually designed and approved.
