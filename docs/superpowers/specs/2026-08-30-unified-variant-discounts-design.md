# Unified variant-aware discounts — design spec

Date: 2026-08-30
Status: draft, pending user review

## 1. Motivation

Today the app has two separate, parallel concepts:

- **Standalone product discount** (`ProductDiscount`): one product, bulk-quantity
  tiers on that product alone.
- **Group discount** (`GroupDiscount`): 2+ separate *products*, mix-and-match
  tiers across all of them.

Both assume every product has exactly one variant — `getProductInfo`'s own
comment says so explicitly, the storefront always reads
`product.selected_or_first_available_variant`, and the Rust discount Function
matches cart lines by `product_id` only (it has the variant in scope via
`line.merchandise()` but discards it).

This breaks down for products whose flavors/sizes are modeled as **variants of
one product** (e.g. "Canagan Wet Cat Food" with a Flavour option: Chicken /
Salmon / Duck) rather than as separate product records — there is currently no
way to mix-and-match across those variants at all.

## 2. Goals

- A merchant can build one discount out of any mix of: whole products, and/or
  specific variants of a multi-variant product — freely combined.
- A single admin flow replaces the two separate entry points. The merchant
  never manually chooses "is this a product discount or a group discount" —
  the UI adapts to what they've selected.
- Tier pricing options (plain percent, percent + anchor, flat fixed price)
  are offered or withheld automatically based on whether the selected
  members share one base price — never a dead-end validation error after
  the fact.
- Code is simplified: one data model, one metafield shape, one sync
  function, one set of admin actions — replacing the parallel
  product/group implementations throughout.

## 3. Non-goals

- **No migration of existing live discounts.** Per explicit instruction, the
  4 live groups and 1 live standalone discount are recreated manually by the
  user after this ships — no migration script, no dual-read compatibility
  layer for the old metafield shape.
- Not addressing the "static bundle for SEO" idea or the POS self-bundle
  investigation — both are separate, parked threads.
- Not addressing the quantity-stepper baseline question from an earlier
  session — unrelated, untouched by this work.

## 4. Data model

Replace `products: ProductDiscount[]` and `groups: GroupDiscount[]` with one
concept. `Tier` is unchanged from today.

```ts
interface DiscountMember {
  productId: string
  /**
   * Omitted only when the product has exactly one variant (the common
   * case) — that variant is implied. A product with MORE THAN ONE variant
   * must always specify which variant this member is — there is no
   * ambiguous "whole multi-variant product" membership. This removes the
   * partial-eligibility ambiguity entirely: a member is always resolvable
   * to one concrete variant.
   */
  variantId?: string
}

interface Discount {
  discountId: string          // `disc_<uuid>` — was groupId/(implicit productId)
  name: string                 // internal admin label, required
  title: string                // customer-facing copy, optional (blank allowed, as today)
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  members: DiscountMember[]    // length >= 1. 1 = today's "standalone", 2+ = today's "group"
  tiers: Tier[]
}

interface Config {
  discounts: Discount[]
}
```

**Resolved unit price** of a member: the `variantId`'s own price if set,
otherwise the product's single (only) variant's price. This is the value
used everywhere pricing math currently uses "basePrice."

## 5. Pricing-mode rule

Synthesized from two explicit statements this session ("the discount must be
percent based instead of price" and "if they have different prices, only a
discount is allowed") — confirmed with the user before writing this spec.

Define `pricesUniform(members)`: true if `members.length <= 1`, or every
member's resolved unit price is equal (compared as Shopify's own decimal
price strings, not parsed floats, to avoid float-precision false negatives).

- `pricesUniform` **true** → all of today's pricing options remain available:
  `pricingMode: 'percent'` (with or without a per-tier `anchorPrice`), or
  `pricingMode: 'fixed'` (flat per-unit `fixedPrice` tiers).
- `pricesUniform` **false** → only `pricingMode: 'percent'` with **no**
  `anchorPrice` on any tier. The admin UI hides the "fixed" mode option and
  the anchor-price field entirely in this state, rather than allowing an
  invalid combination and rejecting it on submit.

**Editing an existing discount**: if the merchant adds/changes a member such
that `pricesUniform` flips from true to false while the discount already has
`anchorPrice`/`fixed` tiers configured, the save is rejected with a clear
message ("these products have different prices — remove the fixed/anchor
pricing on your tiers first, or don't mix these particular items"). No silent
auto-downgrade of merchant-configured pricing.

## 6. Admin UI — single guided flow

One "New discount" entry point (and the same page reused for editing)
replaces the separate product-discount and group-discount screens.

1. **Pick members.** The existing search-as-you-type product picker adds
   whole products to a working list. Any added product with more than one
   variant shows an inline expandable row listing its variants as checkboxes
   — the merchant must tick at least one to keep that product in the list
   (no implicit "all variants" or "first variant" default for multi-variant
   products). A single-variant product needs no expansion; it's simply added.
2. **Pricing options adapt live.** As soon as ≥1 member is selected, the UI
   resolves each member's price and computes `pricesUniform`. The tier editor
   that follows only exposes the modes valid for the current selection (see
   §5) — changing membership afterward re-evaluates this immediately.
3. **Tiers, name, title.** Same tier-row editor as today (minQty +
   percentOff/anchorPrice or fixedPrice depending on mode), plus the
   `name` (required) and `title` (optional) fields.
4. **Save as draft**, same status lifecycle as today (`draft`/`live` toggle
   elsewhere, unchanged).

## 7. Actions layer (`src/actions/discountActions.ts`)

Replace the parallel `createDiscount`/`createGroup`,
`updateTiers`/`updateGroupTiers`, `updateTitle`/`updateGroupTitle`,
`setStatus`/`setGroupStatus`, `deleteDiscount`/`deleteGroup`,
`updateGroupProducts` with one set operating on `Discount`:

- `createDiscount(formData)` — parses members (product ids + optional
  variant ids) and tiers from the form, validates `isProductAvailable`-style
  exclusivity (a variant or whole product can't belong to two discounts at
  once — extend today's availability check to variant granularity), enforces
  §5's pricing rule, writes to config.
- `updateDiscountMembers(discountId, formData)` — re-validates §5's rule per
  the edit note above.
- `updateDiscountTiers(discountId, formData)`
- `updateDiscountTitle(discountId, formData)`
- `setDiscountStatus(discountId, status)`
- `deleteDiscount(discountId)`

`isProductAvailable` (in `config.ts`) generalizes to check at
`(productId, variantId)` granularity, not just `productId` — so one variant
of a product can belong to a discount while a *different* variant of the same
product is free to join another one.

## 8. Metafield sync (`src/lib/product-tiers.ts`)

One function, `syncDiscountMetafields(discount)`, replaces
`syncProductTierMetafield` and `syncGroupTierMetafield`. One metafield key,
`sparkly_product_discounts/discount`, replaces the `tiers`/`group` split.

For each **unique `productId`** among the discount's members, write:

```json
{
  "discountId": "disc_...",
  "title": "Canagan Cat Soup",
  "pricingMode": "percent",
  "tiers": [ { "minQty": 7, "percentOff": 4, "anchorPrice": 10 } ],
  "ownVariantIds": ["gid://shopify/ProductVariant/123"],
  "siblings": [
    {
      "title": "Canagan Wet Cat Food – Salmon",
      "handle": "canagan-wet-cat-food",
      "variantId": "gid://shopify/ProductVariant/456",
      "imageUrl": "https://..."
    }
  ]
}
```

- `ownVariantIds`: `null` when this product is a single-variant whole-product
  member (today's behavior, unambiguous). An array of the specific variant
  IDs of *this* product that are members, when it's a multi-variant product.
  The storefront checks the currently-viewed
  `product.selected_or_first_available_variant.id` against this list to
  decide whether the widget should even show for the variant currently on
  screen.
- `siblings`: one entry **per member**, not per product — a sibling product
  with two variants in the discount produces two sibling rows (distinct
  title, e.g. "Product – Flavour", and potentially distinct image), matching
  how the "mix & match products" list already renders one row per item.
  `variantId` is present/absent using the same convention as `ownVariantIds`.

`clearDiscountMetafields(members)` replaces
`clearGroupMetafields`/the standalone deletion path, deleting the one
`discount` key from every unique product touched.

## 9. Liquid template (`tier-pricing.liquid`)

- Read one metafield: `product.metafields.sparkly_product_discounts.discount`.
  Drop the `tiers_metafield`/`group_metafield` branching entirely.
- Compute whether the *currently selected* variant is eligible:
  `ownVariantIds` blank/null → eligible (single-variant product); otherwise
  eligible only if `product.selected_or_first_available_variant.id` is in
  that list. When not eligible, render the plain-price fallback exactly like
  "no discount configured" today (§ from the compare-at-price PR) — the
  widget doesn't show tier pricing for a variant that isn't a member, even
  though a *different* variant of the same product is.
- Data attributes passed to JS: same idea as today (`data-tiers`,
  `data-group` → renamed `data-discount`), plus a new
  `data-selected-variant-id` so the JS layer doesn't need to re-derive it.

## 10. Storefront JS (`tier-pricing.js`)

- `parseWidgetConfig` reads the single unified shape — no more
  `group ? ... : standaloneData...` fork.
- `wireVariantChange` (already listens for variant switches to update price)
  additionally re-derives eligibility for the newly-selected variant and
  re-renders the whole widget (show/hide card, update title/tiers/siblings)
  — new logic, same existing hook.
- Cart matching: `sumGroupQuantityInCart(cartItems, handles)` is replaced by
  a variant-aware version matching `(productId, variantId?)` tuples. `/cart.js`
  items expose `product_id` and `variant_id` as plain numeric IDs; config
  stores GIDs — add a small pure helper, `extractNumericId(gid)`, to
  normalize before comparing. A member with no `variantId` matches any of
  that product's cart lines (today's behavior); a member with a `variantId`
  matches only that specific variant's cart lines.
- `buildMixMatchRows` extends to accept the per-sibling `variantId` and
  compute quantity via the new variant-aware cart matching instead of
  handle-only.

## 11. Rust Function (`extensions/product-discount`)

- Confirm (and extend if needed) the input GraphQL query
  (`cart_lines_discounts_generate_run.graphql`) fetches `id` on
  `merchandise` (the variant), not just on `merchandise.product`.
- Config's Rust-side struct gains an optional `variant_id: Option<String>`
  per member entry (mirroring `DiscountMember`).
- Matching logic (currently `product_id == line's product_id`) becomes:
  `product_id matches AND (variant_id is None OR variant_id == line's variant_id)`.
- Single unified `discounts: Vec<Discount>` config shape replaces the
  current separate `products`/`groups` Rust structs, mirroring §4.

## 12. Testing strategy

- **Pure logic** (`tier-pricing.test.js` equivalents): `pricesUniform`,
  `extractNumericId`, variant-aware `sumGroupQuantityInCart`, eligibility
  resolution (own-variant-id check) — all unit-testable exactly like the
  existing pure functions in this file.
- **Admin actions**: unit/integration tests (or manual verification, matching
  today's testing depth for this layer) for the new availability check at
  variant granularity, and the pricing-mode-downgrade rejection on edit.
- **Rust Function**: extend existing test fixtures (if any exist — verify
  during planning) to cover a variant-scoped member alongside a whole-product
  member in the same discount.
- **Manual live verification**: recreate one variant-based discount and one
  mixed product+variant discount on the real store post-deploy, verify
  storefront widget shows/hides correctly across variant switches, and a
  live cart test confirms the correct checkout discount applies.

## 13. Rollout note

Because old metafields (`tiers`/`group` keys) are simply no longer read by
the new Liquid/JS, **all 4 currently-live discounts will stop displaying
tier pricing on the storefront the moment this deploys**, until manually
recreated under the new system. This is expected and accepted per §3, but
timing the deploy and the manual recreation close together avoids a gap
where live discounts silently look plain-priced to customers.

## 14. Open items for the implementation plan (not blocking spec approval)

- Exact wording/UX of the "these products have different prices" guidance
  shown when `pricesUniform` is false.
- Whether the admin's discount list view needs any visual distinction
  between "1 member" and "N member" discounts, given they're now the same
  underlying type (likely just showing the member count/names is enough).
- Confirm whether the Rust Function currently has any test fixtures to
  extend, or whether test coverage there needs to be established fresh.
