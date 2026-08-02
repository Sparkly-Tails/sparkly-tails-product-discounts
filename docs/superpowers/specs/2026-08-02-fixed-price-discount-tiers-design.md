# Fixed-Price Discount Tiers — Design

## Problem

Today, every tier in `sparkly-tails-product-discounts` — whether on a
standalone per-product discount or a mix-and-match group discount —
expresses its price as a **percentage off** the product's normal price,
with an optional `anchorPrice` refinement that fixes the *total* for
exactly `minQty` units while extra units above that still accrue at the
percentage rate.

Some merchandising wants a different shape entirely: a flat **price per
unit** at each quantity break, unrelated to any percentage calculation —
e.g. "1 for £1.70, 3 or more for £1.50." The existing `percentOff`/
`anchorPrice` model can't express this directly (there's no percentage
that reliably lands on a specific price point across different tiers),
and mentally translating a target price into "what percent off is that"
is exactly the kind of computation this app exists to avoid for
merchants.

This feature adds **fixed-price tiers**: an alternative tier type where
each tier sets an absolute price per unit directly.

## Scope

- A new `pricingMode: 'percent' | 'fixed'` on both standalone and group
  discounts. All existing discounts are percentage mode (see Data model
  for the backward-compatibility default).
- Fixed-price tiers are available for **both** standalone per-product
  discounts and group (mix-and-match) discounts.
- Mode is chosen once, at creation, and is **locked** — there is no mode
  switch on the edit page. Changing a discount's mode means deleting it
  and creating a new one with the other mode.
- A single discount's tiers are never mixed — a discount is either all
  percentage tiers (with optional per-tier `anchorPrice`) or all
  fixed-price tiers, never both, enforced in the admin actions the same
  way the group-membership invariant is enforced (in code, not just by
  type shape).
- Below the lowest fixed-price tier's `minQty`, the customer pays the
  product's normal Shopify price — same "no discount below threshold"
  behavior percentage tiers already have. A fixed-price discount is not
  required to cover quantity 1.
- Small unrelated addition: a "← Back to discounts" link on both the
  standalone and group discount edit pages, back to the home page list.

Out of scope: mixing tier types within one discount; switching a
discount's mode after creation; any change to how existing percentage/
anchor-price tiers behave.

## Key design decisions

1. **One `Tier` type, mode lives on the parent discount — not a
   discriminated union per tier.** Since modes never mix within a
   discount, a single `pricingMode` field on `ProductDiscount`/
   `GroupDiscount` is sufficient to guarantee non-mixing, enforced by the
   same validation discipline already used elsewhere in this codebase
   (e.g. `isProductAvailable` for group-membership exclusivity). This
   keeps `Tier` itself unchanged in shape everywhere that only cares
   about `minQty` (tier selection, sorting), rather than forcing every
   consumer — admin, widget JS, the Rust struct — to branch on a
   per-tier discriminant.
2. **The highest reached tier governs the whole quantity, same rule as
   percentage tiers today.** For tiers `[{minQty:1, fixedPrice:1.70},
   {minQty:3, fixedPrice:1.50}]`, quantity 2 is charged at the
   **minQty:1** tier's price (£1.70 × 2), since that's the highest tier
   whose `minQty` is ≤ the quantity — there is no interpolation or
   partial-tier blending.
3. **Fixed-price tiers never produce a markup.** If a merchant sets a
   `fixedPrice` above the product's actual current price, the Function
   clamps the discount to `max(0, basePrice - fixedPrice)` — the
   customer is never charged more than sticker price, and the admin's
   "resulting prices" preview shows that same clamped reality rather
   than the raw (wrong) entered value. This mirrors a real bug that was
   found and fixed for `anchorPrice` earlier in this project's history:
   the preview must always show what the Function will actually charge.
4. **Customer-facing copy states the price directly, not a discount
   rate.** The widget shows `"£1.50 each"` / `"Add 2 more for £1.50
   each"` — no percentage or savings framing, consistent with how the
   merchant is thinking about this pricing (a price point, not a
   discount).

## Data model

```ts
// src/lib/config.ts

export interface Tier {
  minQty: number
  percentOff?: number    // percent mode
  anchorPrice?: number   // percent mode only
  fixedPrice?: number    // fixed mode
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

**Backward compatibility:** `getConfig()` defaults `pricingMode` to
`'percent'` for any stored discount that predates this field, the same
pattern already used for `groups` defaulting to `[]`.

**Validation** (in `createDiscount`, `createGroup`, and their update
actions — not just the type):
- `pricingMode: 'fixed'` requires every tier to have `fixedPrice > 0`
  and forbids `percentOff`/`anchorPrice` being set.
- `pricingMode: 'percent'` requires every tier to have `percentOff` set
  (existing behavior, unchanged) and forbids `fixedPrice`.

## Admin UI

- **`/discounts/new`** and **`/discounts/groups/new`** each gain a mode
  choice (e.g. two radio options, "Percentage off" / "Fixed price")
  shown before the tier fields. Selecting a mode determines which tier
  field component renders below it.
- **New `FixedPriceTierFields` component**, parallel to the existing
  `TierFields`, with per-tier inputs of just `minQty` and `fixedPrice`
  — no anchor-price input, since a fixed-price tier's flat rate already
  covers every unit in that tier.
- **Edit pages** (`/discounts/[productId]`, `/discounts/groups/
  [groupId]`) render whichever tier field component matches the
  discount's stored `pricingMode`. No mode-switch control — mode is
  locked at creation.
- **"Resulting prices" table** simplifies for fixed mode: `Min qty |
  Price each | Total at min qty` — no "% off" column, no anchor
  annotation, since the fixed price *is* the per-unit price.
- **Home page list rows** gain a mode indicator, e.g. `live · 2 tiers ·
  Fixed price` vs `live · 2 tiers · Percentage`, so a merchant can tell
  at a glance without opening the discount.
- **Both edit pages** gain a "← Back to discounts" link back to the home
  page list (unrelated to fixed-price tiers, folded into this work).

## Discount Function (Rust)

`Tier` struct gains one new optional field:

```rust
#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Tier {
    min_qty: i32,
    #[shopify_function(default)]
    percent_off: Option<f64>,
    #[shopify_function(default)]
    anchor_price: Option<f64>,
    #[shopify_function(default)]
    fixed_price: Option<f64>,
}
```

`percent_off` changes from a required `f64` to `Option<f64>` here,
because a fixed-mode tier's stored JSON has no `percentOff` key at all
— deserializing that into a required field would error. `#[shopify_
function(default)]` on `fixed_price` (and now `percent_off`) mirrors
`anchor_price` and `groups`'s existing backward-compatibility handling:
a config saved before this feature has no `fixedPrice` key, and must
deserialize with `fixed_price: None`, not error. Every read site that
currently assumes `tier.percent_off` is always present (the plain-
percentage candidate path, and the message-formatting `format!("{}%
off", tier.percent_off)` calls) needs updating to unwrap an `Option`
now — expected to be `unreachable` in practice for a percent-mode tier
(validation guarantees it's set), but the type system will require
handling it either way.

**No explicit `pricing_mode` needed in Rust.** The Function evaluates
one already-selected tier at a time; it just checks whether *that* tier
has `fixed_price` set:

- `fixed_price` is `Some(price)`: fixed-price formula (below).
- `fixed_price` is `None`: existing percent/anchor formula, unchanged.

**Fixed-price formula**, standalone product:
```
discount_amount_per_unit = max(0.0, unit_price - fixed_price)
discount_amount_total = round(discount_amount_per_unit * quantity, 2dp)
```
Emitted as a `FixedAmount` candidate (same candidate type as
`anchorPrice` tiers today), never negative — a `fixedPrice` above
sticker price simply yields a `discount_amount_total` of 0, i.e. no
discount, never a markup.

**Fixed-price formula, group:** reuses the exact same largest-remainder
split logic already built (and fixed) for anchored group tiers earlier
this project's history —
```
discount_amount_total = (shared_unit_price - fixed_price) * total_quantity   [clamped to >= 0]
```
then split across the group's matching cart lines via the identical
largest-remainder method (floor each line's share, distribute leftover
pence to the largest fractional remainders, ties to the earliest line).
Fixed-price group tiers are simpler than anchored ones: there's no
"extra units beyond minQty" distinction, since every unit in the reached
tier is charged the same flat price.

**Message text:** changes from `"{percent_off}% off"` to `"£{fixed_price}
each"` for fixed-price candidates (both standalone and group).

## Storefront widget (JS)

- `computeTierState` is unchanged — it already just selects the reached
  tier and returns its raw fields, which now might include `fixedPrice`
  instead of `percentOff`/`anchorPrice`.
- `perUnitPrice` gains a fixed-price branch: when the reached tier has
  `fixedPrice` set, the per-unit price *is* `fixedPrice` directly — no
  blended math, since (per Key design decision 2) every unit in the
  reached tier gets the same flat price.
- `renderTierPricing`'s message-building logic gains a fixed-price
  branch matching the chosen copy: `"£1.50 each"` once reached, `"Add 2
  more for £1.50 each"` before reaching it — replacing the percent-off
  phrasing for these tiers only.
- No changes needed to metafield syncing (`syncProductTierMetafield`,
  `syncGroupTierMetafield`) or the group cart-summing/polling logic —
  they already serialize and consume whatever's in the `Tier[]` array
  as-is, so `fixedPrice` flows through without modification.

## Known limitations

- **Price drift is not detected**, same limitation the group feature
  already has for `anchorPrice`: if a merchant changes a product's
  actual Shopify price after setting a `fixedPrice` tier, nothing
  proactively surfaces that the fixed price may now exceed (or be far
  below) the new sticker price. The Function's clamp prevents a markup,
  but a `fixedPrice` that's become a very deep, unintended discount
  relative to a lowered sticker price would not be flagged.
- **No mode migration tooling.** Switching a discount from percentage to
  fixed-price (or back) requires deleting and recreating it; there is no
  "convert tiers" helper.

## Testing plan

- **Rust (`cargo test`):** fixed-price tier selection at/above/below
  threshold; discount clamped to 0 (never negative, never a markup)
  when `fixedPrice` exceeds sticker price; group fixed-price discount
  split across multiple cart lines via the existing largest-remainder
  method, asserting per-line amounts sum exactly to the total; backward
  compatibility — a config with no `fixedPrice` key deserializes with
  `fixed_price: None` and produces the same result as today.
- **Vitest (admin app):** `createDiscount`/`createGroup` and their
  update actions reject a fixed-mode discount containing a tier with
  `percentOff` set (and vice versa); resulting-price preview math for
  fixed tiers, including the sticker-price clamp shown correctly in the
  UI; `pricingMode` defaults to `'percent'` for configs stored before
  this field existed.
- **Node widget tests (`node --test`):** `perUnitPrice`'s fixed-price
  branch; message text for both the "reached" and "not yet reached"
  states in fixed mode.
- **Live verification:** create a real fixed-price test discount (one
  standalone, one group), confirm cart/checkout math matches the
  admin's "resulting prices" preview exactly, and confirm a
  deliberately-too-high `fixedPrice` never produces a markup at
  checkout — then clean up the test discount and cart contents.
