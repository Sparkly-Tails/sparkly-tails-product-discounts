# Grouped Product Discounts — Design

## Problem

Today, `sparkly-tails-product-discounts` supports tiered discounts scoped to a
single product: buy N+ units of *that one product*, get a percent-off (with
an optional anchor price for a clean round total). It cannot express a
"mix and match" discount across several different products — e.g. buy 7+
units total across Tuna Soup, Chicken Soup, and Ocean Soup (in any
combination) to unlock a tier, rather than requiring 7 units of one specific
product.

This feature adds **grouped discounts**: a merchant-defined set of products
that share a single price, where a shared quantity threshold (with the same
tier/anchor-price mechanics as standalone discounts) is evaluated against the
combined quantity of *any* group members in the cart.

## Scope

- A new "group" discount type, alongside (not replacing) the existing
  standalone per-product discount type.
- Admin UI to create/edit groups: add/remove member products, then configure
  tiers and optional anchor price (reusing the existing `TierFields` UI).
- Discount Function (Rust) logic to sum quantity across a group's cart lines
  and apply the same anchor/percent formula already used for standalone
  tiers, generalized to a shared quantity total.
- Storefront theme block changes so that a product page for *any* group
  member shows live progress toward the group's tier — accounting for other
  group members already in the cart — and links to the other group products.

Out of scope for this iteration: inline quick-add buttons in the widget
(links to the sibling products' PDPs instead); groups where member products
have different prices; a product belonging to more than one group or to both
a group and a standalone discount.

## Key design decisions

1. **Mix-and-match, not a fixed recipe.** Any combination of the group's
   products counts toward the shared quantity threshold. There is no
   requirement to include a specific product or ratio.
2. **Mutually exclusive membership.** A product can have a standalone
   discount, OR belong to exactly one group, OR neither — never more than
   one of these at once. Enforced by the admin actions (not just UI
   affordance) so a stale API call can't create an ambiguous state.
3. **Group members share one price.** This is what keeps the Function's
   group formula a direct generalization of the existing single-product
   formula (no proportional-by-value or per-unit-price-attribution logic
   needed). Enforced by the admin app: adding a product to a group is
   **hard-blocked** if its current price doesn't match the group's existing
   members' price.
4. **No anchor price still means "works exactly as before."** As with the
   original per-product anchor-price feature, a group tier with no
   `anchorPrice` behaves as a plain percentage off — the anchor-specific
   split/proportional logic below only activates when a tier's
   `anchorPrice` is set.

## Data model

```ts
// src/lib/config.ts

export interface Tier {
  minQty: number
  percentOff: number
  anchorPrice?: number
}

export interface ProductDiscount {
  productId: string
  status: 'draft' | 'live'
  tiers: Tier[]
}

export interface GroupDiscount {
  groupId: string          // generated, e.g. "grp_<uuid>"
  name: string              // admin-facing label, e.g. "Mix & Match Soups"
  status: 'draft' | 'live'
  productIds: string[]      // must all share one price (validated on add)
  tiers: Tier[]              // same Tier shape as standalone discounts
}

export interface Config {
  products: ProductDiscount[]
  groups: GroupDiscount[]
}
```

Stored in the same shop metafield (`sparkly_product_discounts.config`) the
app already uses — `groups` is simply a new top-level array alongside the
existing `products`.

**Membership invariant** (enforced in `discountActions.ts`, not just the UI):
a `productId` may appear in at most one of: some `products[].productId`, or
some one `groups[].productIds`. Never both, never two different groups. This
check is independent of `draft`/`live` status — a product already in a draft
standalone discount or draft group still blocks being added elsewhere.

## Admin UI

New routes, mirroring the existing per-product flow:

- **`/discounts/groups/new`** — create a group: name field, a multi-product
  picker (extends `ProductPicker` to support repeated add/remove, showing
  each selected product with its price; blocks adding a product whose price
  doesn't match the group's existing members, or that already has a
  standalone discount or belongs to another group), then `TierFields`
  (reused unchanged). Saves as `draft`.
- **`/discounts/groups/[groupId]`** — edit a group: same product add/remove
  list, editable tiers, go-live/take-offline/delete actions, and a
  "Resulting prices" table using the group's shared price (reusing
  `totalAtThreshold`/`resultingPrice` as-is). Mirrors
  `[productId]/page.tsx`.
- **Home page (`/`)** — two sections: "Product discounts" (existing) and
  "Group discounts" (new), each with their own "Add" button and list.

**New/changed logic:**

- `getGroupProductInfo(productIds)` in `products.ts` — fetches title + price
  for each candidate product; used both for the picker's price-match
  validation and to populate the sibling-product data written to each
  member's synced metafield.
- `discountActions.ts` gains `createGroup`, `updateGroupProducts`,
  `updateGroupTiers`, `setGroupStatus`, `deleteGroup` — same shape as the
  existing product actions, plus the membership/price cross-checks above.
- Going live syncs a metafield to **every** member product (not just one);
  taking offline or deleting clears it from every member.

## Discount Function (Rust)

```rust
struct GroupConfig {
    group_id: String,
    status: String,
    product_ids: Vec<String>,
    tiers: Vec<Tier>,   // same Tier struct as standalone discounts
}

struct Config {
    products: Vec<ProductConfig>,   // existing
    groups: Vec<GroupConfig>,       // new
}
```

After the existing per-product loop, evaluate each `live` group:

1. Find all cart lines whose product ID is in `group.product_ids`. Skip the
   group if none are present.
2. `total_quantity` = sum of those lines' quantities. `unit_price` = any one
   line's `cost.amountPerQuantity` (guaranteed equal across the group by the
   admin-side price-match validation).
3. `best_tier` = the highest `min_qty` tier ≤ `total_quantity` (same rule as
   standalone discounts).
4. No anchor price: apply `tier.percent_off` as a plain `Percentage`
   candidate to **each** matching line individually — no distribution math
   needed, since percentage-off is line-local by construction.
5. Anchor price set: compute
   `discount_amount_total = (unit_price * min_qty) − anchor_price + extra_units * unit_price * (percent_off / 100)`
   — identical formula to the standalone anchor case, using
   `total_quantity`/`extra_units` in place of a single line's own quantity —
   rounded to whole pence, clamped to ≥ 0. Split `discount_amount_total`
   across the group's matching lines proportional to each line's share of
   `total_quantity`, rounding each line's share to the nearest penny and
   assigning any leftover penny (from rounding) to the largest line — ties
   broken by cart line order — so the per-line amounts always sum exactly to
   `discount_amount_total`.

All candidates (from both the standalone and group loops) go into the same
`candidates` vec inside one `ProductDiscountsAdd` operation with
`selection_strategy: All`, unchanged from today.

## Storefront widget (theme block)

**New per-product metafield**, additive alongside the existing `tiers`
metafield: `product.metafields.sparkly_product_discounts.group` =
`{ tiers: Tier[], siblings: [{ title, handle }] }` (siblings excludes the
product itself). The block's Liquid checks this metafield first; if
present, renders in "group mode"; otherwise it falls back to the existing
standalone `tiers` metafield / plain price exactly as today. Fully
additive — no behavior change for non-grouped products.

**Cart-awareness** is the one genuinely new capability. On load and on a
~1s poll of `/cart.js` (matching the existing polling pattern already used
for the quantity stepper and the Loop Subscriptions price), the widget:

1. Matches cart line items to group members **by handle** — `cart.js`
   returns numeric/REST-style product IDs while the admin app's GraphQL IDs
   are GIDs; handles are plain strings available on both sides, avoiding any
   ID-format conversion.
2. Sums the quantity of *all* group members currently in the cart, including
   this product's own existing cart quantity (not just what's set on other
   pages).
3. Adds the current page's quantity-selector value (not yet added to cart)
   to get `effectiveQuantity`.
4. Feeds `effectiveQuantity` into the **existing, unchanged**
   `computeTierState()` / `perUnitPrice()` — since group members share one
   price, "quantity across the group" plugs directly into the same tier math
   a single product's own quantity uses today. No changes needed to that
   module.

**Messaging**: alongside the existing "Add N more for X% off" line, group
mode lists the sibling products by name as links to their product pages
(from the `siblings` metafield data), e.g. *"Add 2 more to unlock 20% off —
mix in: Ocean Soup, Chicken Soup"*.

## Known limitations

- **Price drift after creation is not detected.** The price-match check only
  runs when a product is *added* to a group. If a merchant later changes one
  member's price directly in Shopify admin, nothing in this feature notices
  — the Function will still use "any one line's" price as the group's shared
  `unit_price`, which becomes wrong for the drifted product's line. Detecting
  and surfacing this drift (e.g. a warning on the group's edit page) is not
  in scope for this iteration.

## Testing plan

- **Rust (`cargo test`)**: quantity summed correctly across 2+ lines;
  correct tier selection at/above/below threshold; anchor-price discount
  split proportionally by quantity with penny-remainder assigned to the
  largest line (assert per-line amounts sum exactly to the total, following
  the same hand-derivation discipline used for the standalone anchor tests);
  plain-percentage group tier applies independently per line with no split
  math; a group and a standalone discount coexisting in one cart don't
  interfere; draft groups produce no discount.
- **JS (`node --test`)**: `computeTierState`/`perUnitPrice` need no new
  tests (unchanged). New tests cover the cart-summing-by-handle logic
  (mocked `/cart.js` responses): other-product-only cart quantity, this
  product's own existing cart quantity, zero cart quantity, sibling-list
  rendering.
- **Vitest (admin app)**: group tier form parsing, price-match validation
  (blocks mismatched price), membership validation (blocks a product already
  in another group or with a standalone discount), `totalAtThreshold` reused
  as-is for the group's shared price.
- **Live verification**: create a real 2–3 product test group, add a mix of
  its products to a real cart, confirm checkout math matches the admin
  preview, and confirm the storefront widget on each member's page shows
  correct combined progress and updates when items are added from a
  different group member's page.
