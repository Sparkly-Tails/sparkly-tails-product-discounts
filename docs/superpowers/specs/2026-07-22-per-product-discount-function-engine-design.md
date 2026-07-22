# Per-Product Discount Function Engine — Design

**Date:** 2026-07-22
**Status:** Approved, ready for implementation planning
**Store:** Sparkly Tails (`sparklytails.com`) — Shopify **Basic** plan
**Relationship to prior work:** a new, fully separate app from
`sparkly-tails-tiered-pricing-app` — not a rewrite of it, not a branch of it.
The existing app's repo, Partners entry, and live automatic discounts are
left completely untouched and remain a working fallback for as long as
needed.

---

## 1. Purpose

Replace the group-based, automatic-discount-per-(product,tier) pricing engine
with a per-product volume discount computed live by a Shopify Function, for
each product independently: "buy N+ units of this product, get X% off,"
configured product-by-product with no shared grouping concept, and no ceiling
on how many products can have their own discount configuration.

Bundle creation (letting a product also be sold in fixed-price multi-packs,
built on Shopify's native Bundles feature) is an explicitly separate,
follow-on piece of work — not in this spec. This spec is the discount engine
only.

---

## 2. Decisions and why

### 2.1 A fully separate app, not a migration of the existing one

The existing `sparkly-tails-tiered-pricing-app` is live, tested, and working.
Rewriting it in place risks leaving the store with a broken or half-migrated
pricing engine if something goes wrong partway through. Building this as its
own Shopify Partners app, its own repo, its own Vercel deployment means: it
can be developed and tested on the real store *alongside* the existing app
(Shopify stores support many installed apps simultaneously) with zero risk to
what's already working. Cutover is a deliberate, later action (delete the old
app's automatic discounts once the new engine is proven); reverting is simply
not doing that, or recreating them — the old app's code and data are never
touched by any of this work.

### 2.2 Shopify Functions are confirmed usable on this store, today

Verified conclusively (not inferred) in a separate spike
(`~/Documents/sparkly-tails-function-prototype`): a discount function from an
unpublished custom app, installed on `sparklytails.myshopify.com` (Basic
plan), successfully activated via `discountAutomaticAppCreate` —
`status: "ACTIVE"`, zero `userErrors`. No Shopify Plus upgrade, no App Store
publication required. Full detail in that spike's directory and in
`sparkly-tails-tiered-pricing-app`'s project memory.

### 2.3 Dropping the group concept entirely

The original engine grouped products under a shared tier schedule primarily
so that one Shopify automatic discount could be reused across several
products, reducing how many of the 25 available slots a configuration
consumed. A Shopify Function has no such slot cost at all — one function
computes discounts for every product, however many are configured. With that
constraint gone, grouping serves no remaining purpose: each product simply
gets its own independent tier schedule. This also eliminates the "pooled vs
per-product" scope choice from the earlier (now superseded) design — pooling
only ever meant something when *multiple different products* shared one
threshold; with no groups, there's nothing left to pool across.

A direct, welcome consequence: there's no operational pressure to consolidate
products into fewer configurations for resource reasons. Create as many
independent per-product discounts as the catalog needs, each with its own
percentage schedule — that's simply the default now, not a deliberate choice
to call out separately.

### 2.4 The function reads the config directly from a shop metafield

Confirmed via the actual generated function schema (`schema.graphql` from the
spike): both `Product` and `Shop` implement `HasMetafields`, and `Shop` is
directly queryable from the function's input (`Input.shop: Shop!`). The
function reads `shop.metafield(namespace: "sparkly_tiers", key: "config")` —
the same JSON blob the admin app writes — directly, with zero denormalization
onto individual products needed for the discount engine itself. Because the
function re-reads this metafield on every cart evaluation, a config change
(add a product, adjust a percentage) takes effect on the very next cart
evaluation automatically. There is nothing to "reconcile" after initial
setup — no discount record ever needs updating to reflect a config change.

---

## 3. Data model

```ts
export interface Tier {
  minQty: number
  percentOff: number
}

export interface ProductDiscount {
  productId: string
  status: 'draft' | 'live'
  tiers: Tier[]
}

export interface Config {
  products: ProductDiscount[]
}
```

Stored identically to today's pattern: one JSON blob in a shop metafield
(`sparkly_tiers` namespace, `config` key), read/written by the admin app.
`productId` is the natural unique key — a product can only ever have one
discount config, so there is no possible collision to validate against
(unlike the old group model, where a product's tiers could ambiguously come
from more than one live group).

---

## 4. Admin UI

- **Discounts list** (home page): one row per configured product — product
  title, tier count, status (draft/live). "Add discount" button.
- **Add/edit discount**: search-as-you-type product picker (same debounced
  search pattern already proven in the existing app — type a name, pick from
  a dropdown of real Shopify product matches), then add/remove/edit tier rows
  for that one product (same pattern as the existing app's tier-editing UI:
  "+ Add tier" / per-row "Remove," minimum of one tier). Save as draft or go
  live.
- **No slot meter, no budget-refusal UI** — neither concept exists in this
  model. Removed entirely, not hidden or repurposed.
- Real-price preview (showing the actual resulting price per tier, computed
  from the product's real Shopify price) is preserved — same `tier-math`
  logic as the existing app, just applied per-product instead of per-group.

---

## 5. Function logic

Discount function (`cart.lines.discounts.generate.run` target), input query
selects: for each cart line, its quantity and merchandise product ID; plus
`shop.metafield(namespace: "sparkly_tiers", key: "config")`.

Algorithm:
1. Parse `Config.products` into a map keyed by `productId`.
2. For each cart line, look up its product ID in that map. If found and
   `status === 'live'`, find the highest tier where `tier.minQty <=
   line.quantity`.
3. If a qualifying tier exists, emit a `productDiscountsAdd` candidate
   targeting that cart line at `tier.percentOff`.
4. Return all such operations in one `FunctionRunResult`.

No cross-line summing, no group resolution — every cart line is evaluated
independently against its own product's own tier list.

---

## 6. Migration / cutover

1. Build and deploy the function-backed discount on the new app; verify
   locally (`shopify app function run` against fixtures) before touching the
   real store.
2. Install the new app on `sparklytails.myshopify.com` alongside the existing
   app. Configure a handful of real products' discounts as a pilot.
3. Create the one function-backed automatic discount
   (`discountAutomaticAppCreate`, with `discountClasses` set — confirmed
   required from the spike's testing) and verify it computes the correct
   price for real products in a real cart.
4. Once confident: for each product migrated to the new engine, delete its
   corresponding old-app automatic discount(s). Shopify's discount
   combination rules mean a product briefly covered by both the old and new
   discount simultaneously gets one or the other applied (not double-
   discounted, not left with nothing), so there's no unsafe window during a
   gradual, per-product cutover.
5. **Revert path**: stop before step 4 (or re-create the old app's automatic
   discounts) at any point — the old app's code, config, and Partners
   registration are never modified by any of this, so reverting is not a
   recovery operation, just a decision not to proceed further.

---

## 7. Testing

- Function logic: Rust unit tests (`shopify_function::run_function_with_input`),
  fixtures covering: quantity below the lowest tier (no discount), quantity
  exactly at a threshold, quantity between two thresholds (lower tier
  applies), quantity above the highest threshold, and a cart with multiple
  distinct products each with their own independent tier schedules.
- Admin app: config read/write and `tier-math` tests carried over
  conceptually from the existing app (same pricing math, same metafield
  read/write pattern, new per-product shape).
- Integration: verify on the real store, with real products, before any
  cutover step that touches the existing app's live discounts.

---

## 8. Out of scope (deferred, not forgotten)

- **Bundle creation** (Piece B) — letting a product also be sold as one or
  more fixed-price multi-packs, created and maintained by this app via
  Shopify's native Bundle API (`productBundleCreate`/`productBundleUpdate`,
  async operation polling, per-variant price setting via
  `productVariantsBulkUpdate`, and publishing the resulting product to a
  sales channel). Genuinely separate scope from the discount engine — gets
  its own design once this phase lands.
- **Storefront widget** — cross-sell banner and live per-quantity price
  display, previously designed in outline for the old app's data model.
  Revisit once this new engine (and Piece B) exist, since the shape of what
  it links to (bundles) and reads from (per-product config) will have
  changed.
