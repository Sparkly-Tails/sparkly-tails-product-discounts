# Tier variants: risk test plan (paused, not yet run)

Date: 2026-11-05 (paused 2026-11-09)
Status: PRESENTED to the owner, NOT approved, NOTHING RUN. Read `docs/superpowers/specs/2026-11-05-tier-variants-draft-notes.md` first for the decisions and the labels.
Rule from the owner: run store tests on the dev store `sparkly-dev` only. Keep this work away from the `dev` branch and from `demo3`. Repo experiments go in a throwaway worktree and are not merged into `dev` unless the owner says so. Do not write to the live store again except to delete the POS test product when the owner says yes.

For each test: what to do, what counts as a pass, and what changes in the design if it fails. The design document waits for these results.

## Batch 1: no store access (reading, docs, code)

| # | Risk | Test | Pass if | If it fails |
|---|---|---|---|---|
| 1 | The Function discounts a tier-variant line a second time and counts it as 1 unit | Read lines 170 to 2094 of `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`. Add a Rust unit test with a tier-variant line next to normal lines. Run the existing Function tests. | The test shows the line is skipped or not counted | The design adds a rule: write explicit base `variantId`s into the members, or make the Function skip tier-variant ids |
| 2 | The app has no inventory scope | Search the Shopify docs for the scope that `inventorySetQuantities` and the adjust mutations need. Compare with `shopify.app.toml`. | The docs name the scope, so we know whether it is new | The design adds a scope change and a re-approval step for merchants |
| 3 | No timed jobs exist, but removal in 1 hour and a flash-sale start job need them | Read the Vercel project with the Vercel connector (plan, cron support, shortest interval). Search the Vercel docs for cron limits. | A job can run every hour or more often on the owner's plan | The design needs another timer: an external scheduler, or Shopify-side timing |
| 4 | Shopify limits on options and variants | Search the Shopify docs for the maximum options and variants per product. Count the real products: how many have 2 or 3 options, and how many variants. | Every product with tiers stays under the limits | The design excludes those products or caps the tiers per product, and says so in the admin |
| 5 | `orders/paid` may not cover POS orders | Search the Shopify docs for when `orders/paid` fires, including POS. | The docs say POS orders fire it | The design adds another trigger, such as `orders/create` |

## Batch 2: on `sparkly-dev`, with throwaway products

The connector is on the live store. The owner must switch it to `sparkly-dev` first (the `switch-shop` step needs the owner to authorise). Delete every throwaway product at the end.

| # | Risk | Test | Pass if | If it fails |
|---|---|---|---|---|
| 6 | 404 for missing variants (owner report) | Create a variant and note its id. Delete it. Request the product page with that `?variant=` and try the cart add with that id. Record both status codes and results. | We know exactly what happens | The design keeps variants longer, redirects, or hides the add button |
| 7 | Stock adjustment repeats on redelivery | Call the inventory mutation twice with the same `@idempotent` key, then with a different key. | The same key gives no second change | The design stores processed order ids |
| 8 | A price change makes variants stale | Change the base price. Update the tier variant name and price through the API. | Both update in one call and Shopify accepts it | The design deletes and recreates the variants |
| 9 | Two runs at once make duplicate variants | Send two create calls at once for the same tier. | No duplicates, or Shopify rejects the second | The design adds a lock like the claim metafield of the shared discount |
| 10 | Sold-out tier variants (stock 0, no overselling) | Set a tier variant to 0 stock. Check the product page and checkout. | The variant shows as sold out and cannot be bought | The design needs another way to block sales |
| 11 | Flavour × Quantity on a real multi-option product | Make a copy of a real two-option product. Add the Quantity option and the tier variants. Check the admin, the theme picker and the variant count. | It works and the picker is usable, even if untidy | The design limits the feature to single-option products first |

## Batch 3: needs the owner

| # | Risk | Test | Needs |
|---|---|---|---|
| 12 | Online checkout shows no percent or crossed price for a tier-variant line, and the widget adds base × N | On `sparkly-dev`, add a tier variant to the cart with JavaScript off. Add it again with the widget on. Compare both checkouts. | The dev store's storefront password, or the owner puts the items in a cart and sends screenshots |
| 13 | What Google can see | Read the theme's structured data for a multi-variant product. Check whether the Google product feed includes variants. Indexing itself shows in Search Console only after weeks, so it cannot be tested on the day. | Search Console access later, to measure the effect |

## Order

1. Batch 1 first. A failure in 1, 2 or 3 changes the whole design.
2. Report the results to the owner before batch 2.
3. Batch 2 and 3 after the owner switches the connector.

## Open questions for the owner

1. Approve batch 1.
2. Is the app installed on the live store? It decides whether a POS order can reach the webhook there.
3. What is `demo3`?
