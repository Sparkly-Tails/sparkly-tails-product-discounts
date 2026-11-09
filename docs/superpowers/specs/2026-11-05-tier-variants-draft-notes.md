# Tier variants for Google indexing: draft notes (paused)

Date: 2026-11-05 (paused 2026-11-09)
Status: PAUSED. This is NOT an approved design. The brainstorming is not finished, no design document has been written, and the risk tests (see the test plan next to this file) have not been run. Nothing was built.
Branch: `feat/tier-variants-seo`. Keep it away from the `dev` branch and from the dev and demo3 stores until the owner says otherwise.

## How to read this file

Every statement carries one of these labels:

- **Owner**: the owner decided or said it.
- **Verified**: seen with a tool in this work (the check is named).
- **Inference**: my reasoning, not checked. Treat it as a question.
- **Open**: nobody has decided it.

## 1. The idea and the why (Owner)

Tier discounts work only in browsers with JavaScript, and Google does not index them because they are not real variants. The feature: when a tier discount is published, the app creates real variants carrying the tier thresholds (for example "3 × £27.00"). When the discount is taken off, the app removes them. The main goal is indexing. The tiers must still work on POS.

## 2. What the records said before this work

- Verified: `docs/superpowers/specs/2026-08-30-unified-variant-discounts-design.md` section 3 parks two threads: the "static bundle for SEO" idea and the "POS self-bundle investigation".
- Verified: session `e08db7a3` (2026-08-01, "Variant fixed bundle GraphQL") found that a variant bundling another variant of the same product is stored by the Admin API but shows a "Bundle components, 0 of 0" screen in POS Pro and cannot be added.
- Verified (skill note, 2026-08-29): a cross-product bundle also showed "0 of 0" in a later test without SKUs. That contradicts the 2026-08-01 claim that cross-product bundles work. It stays unconfirmed.

## 3. POS test results (live store, 2026-11-04)

Done on the live store sparklytails.com, with the throwaway product "ZZ TEST TIER VARIANTS - delete me" (see section 9). Product published to POS only, SKU and barcode on every variant, 30 units on the base variant.

- Verified (owner in POS Pro): the **bundle** variant (`requiresComponents`, component 3 × the base variant of the same product) shows "0 of 0 items selected" and cannot be selected. The bug stays even with SKUs and barcodes.
- Verified (owner in POS Pro): the **plain** variant "3 plain" (ordinary variant, no bundle relationship, £27.00) adds to the cart and shows £27.00.
- Verified (Admin API read-back): attaching the component changed the bundle variant's price from £27.00 to £30.00 (3 × £10.00). Cause not checked. The bundle variant also read stock 0 while the base had 30.
- Not tested: a cross-product bundle with SKUs, how online checkout shows a plain tier-variant line.

## 4. Decisions

All decisions are the owner's unless marked.

1. Tier variants are **plain priced variants with no bundle relationship** (the bundle type fails on POS).
2. A shopper can land on a page with the tier variant selected, and the widget jumps to that tier.
3. **Online checkout stays as it is today**: the cart holds the base product times the quantity, the app's discount applies, and checkout shows the percent and the old price crossed out.
4. **Stock**: the app takes N units off the single product after each order of a tier variant.
5. **Take-down**: tier variants are kept for a short while, sold out (see the inference in section 5), then removed. The limit is **1 hour at most**. The owner reported that Shopify returns a 404 when a variant is missing (Owner-reported, not verified by me).
6. **Naming**: the variant value is the same as the tier box title in the widget. Verified in `extensions/product-tier-pricing/src/copy.js` (`buildTierChips`, on `origin/dev`): `<minQty> × <money total for that quantity>`, for example "8 × £13.00". The tick and star marks are display only.
7. **Products with options** (for example Flavour): each existing option value gets its own tier variant (Flavour × Quantity). The owner accepts that it may look messy and wants to explore it.
8. **Flash sales**: the variants are created when the sale is published and are sold out until it starts. They are sold out again at its end and removed within 1 hour.
9. **Test scope**: tests run on the dev store `sparkly-dev` only. This work stays away from the `dev` branch and from `demo3` (the owner's words: "keep this code away from dev and demo3"). I do not know what demo3 is.
10. The owner has no preference on how products are grouped, as long as the discount shows at checkout.

## 5. My calls and inferences (not confirmed)

- Every real tier gets a variant. The hidden "1 × full price" start tier does not (Verified: `isUnitAnchorTier` in `copy.js` identifies it).
- The new option is named "Quantity". It must not collide with a merchant's own option of that name.
- Tier-variant stock = the base stock divided by N, rounded down, recalculated after each order and each base-stock change.
- The widget adds the base variant times N to the cart when a tier variant is selected, so online checkout stays as today. Without JavaScript the form adds the single tier-variant line (one line at the tier price, no percent or crossed price; online checkout untested).
- Because of the above, the app's stock adjustment is only needed when a tier-variant line itself sells (POS, no JavaScript).
- During the grace period the variants must be sold out. Otherwise they would still sell at the tier price after the discount ended.
- The variant value contains a price, so a base-price change makes it stale. The app must rename and reprice the tier variants.
- Variant create and delete needs a guard against two runs at once (the shared discount code uses a claim metafield with compare-and-set).

## 6. Findings from the code (Verified, read on `origin/dev`)

- **Discount Function** (`extensions/product-discount/src/cart_lines_discounts_generate_run.rs`, lines 1 to 170 read of 2094): a cart line counts for a discount when the product id matches and the member's `variantId` is either absent or equal. A member with no `variantId` matches every variant of the product, so a tier variant of a single-variant product would be discounted again and counted as 1 unit. The admin leaves the variant off only when the product has exactly one variant. Not read: lines 170 to 2094.
- **Scopes** (`shopify.app.toml`): `read_discounts, read_products, write_discounts, write_products, read_orders, read_all_orders, read_reports, write_pixels, read_customer_events`. `write_products` allows variant create and delete. There is no inventory scope. Inference: stock changes need one, and merchants must approve it.
- **Webhooks**: only `orders/paid` (`src/app/webhooks/orders/paid/route.ts`). It verifies the signature, topic and shop, then runs a handler with injected tools. A failure returns 500 so Shopify delivers again, and saving twice changes nothing. A stock handler can follow this pattern but must be safe to run twice. Inference: use the order id as the idempotency key.
- **Scheduling**: there is no `vercel.json` and no cron route on `origin/dev`, so nothing runs on a schedule. The 1-hour removal and the flash-sale start job need a new mechanism. The Vercel plan limits were not checked.
- **Shared discount creation** (`src/lib/tierDiscount.ts`, first 90 of 177 lines read): one shared automatic app discount per shop, created with a claim metafield (60 second timeout). Flash sales have their own discount records (from the Function's comments).
- Not read: `src/lib/product-tiers.ts` (the saved discount shape), the rest of `tierDiscount.ts`.

## 7. Admin API notes (Verified, 2026-11-04, this store)

- API version 2026-10 rejects deprecated fields: `Publication.name` (use `catalog.title`) and `ProductVariant.barcode` (use `barcodes`).
- `inventorySetQuantities` needs `@idempotent(key: "...")`.
- `productCreate(product: ProductCreateInput!)` accepts `productOptions`. Before publishing, `resourcePublicationsV2` returned no nodes and `onlineStoreUrl` was null, while `resourcePublicationsCount` returned 3 (not explained). `publishablePublish` to the POS publication (id `gid://shopify/Publication/223884083502`, "Point of Sale") made the product visible in POS only.
- Barcodes are `barcodes: [{ value }]`. Leave the `type` out unless the value fits that standard.

## 8. Risks still to test

See `docs/superpowers/plans/2026-11-05-tier-variants-risk-test-plan.md`. In short: the Function double discount, the inventory scope, the scheduler, Shopify option and variant limits, `orders/paid` for POS orders, the 404 for deleted variants, stock redelivery, price-change updates, duplicate creation, sold-out behaviour, Flavour × Quantity on a real product, online checkout display, and what Google can see.

## 9. Loose ends

- **The test product is still on the live store**: "ZZ TEST TIER VARIANTS - delete me", `gid://shopify/Product/15461398511995`, active, published to POS only, SKUs `ZZ-TEST-1`, `ZZ-TEST-3B`, `ZZ-TEST-3P`, 30 units on two variants. POS staff can see it. Deleting it is permanent, so the owner must say yes first.
- Open: is the app installed on the live store? It decides whether a POS order can reach the webhook there.
- Open: what is "demo3"?
- Open: approval of batch 1 of the test plan.
- The `.session-log` and `_context.md` entries of this work are in the main checkout, uncommitted. They hold the same decisions with dates.

## 10. How to resume

1. Read this file and the test plan.
2. Get the owner's answers to the open items in section 9.
3. Run batch 1 of the test plan. It needs no store access.
4. Ask the owner to switch the connector to `sparkly-dev` before batch 2.
5. When the tests are done, finish the brainstorming and write the real design document (`docs/superpowers/specs/YYYY-MM-DD-tier-variants-design.md`), run the builder check, then write the implementation plan.
