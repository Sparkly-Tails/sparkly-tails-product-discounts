# Homepage metrics: design

Status: answers from the owner folded in; the implementation plan is `docs/superpowers/plans/2026-11-02-homepage-metrics.md`. The app has not been sent to Shopify for review yet, so there is no earlier release to stay compatible with.

## Intent

The app homepage shows four cards (Visitors, Bundle orders, AOV, Added revenue) with fixed placeholder values (`src/home/components/StatCards.tsx`). The owner wants them to show real numbers, kept per discount, **saved in the app's own database**, so the owner can see whether the bundle discounts bring in extra money.

## Decisions made by the owner

- Data is saved in the app's database (Postgres through Prisma), per discount. The homepage reads the numbers from there, never straight from Shopify.
- A **visitor** is someone who views a product page where the discount's widget shows.
- **Added revenue** is the extra money the bundle brought in, not the whole revenue of bundle orders (formula below is my proposal, to be confirmed).
- The app asks for the new permissions now: orders, all-order history, reports, pixels and customer events, plus the protected customer data approval where Shopify requires it.
- Added revenue formula confirmed (below).
- The four cards add up all discounts. The date button ("Last 30d") opens a calendar with a list of presets (today, last week, last 30 days, ...) and a custom range. No discount picker. Nothing is specific to one merchant: no shop, address or per-merchant setting in code or environment.
- Sources: Shopify checkout/storefront events (a web pixel) and an orders webhook feed the database; Shopify's reports (ShopifyQL) may be used to bootstrap.

## Goals

1. Four cards show real numbers for a chosen period, from the database.
2. Every number is stored per discount (per day for visitors, per order for orders), so a per-discount view can be added later without losing history.
3. The app stores no customer data: no names, e-mails, addresses, or readable visitor ids.
4. Counting is safe to repeat: a webhook delivered twice, or a backfill run twice, changes nothing.

## Not in this plan

- Refunds, cancellations and order edits do not change the numbers.
- No per-discount columns in the discounts table, and no charts.
- No visitor history before the pixel is installed.
- ShopifyQL is only a cross-check of the stored totals on the demo shop, not a data source (see "Sources").

## Anti-goals

- Numbers that look exact but are not. Visitors will undercount a little (customer privacy settings, ad blockers); the card says "estimate" in its hint.

## Metric definitions

| Card | Definition |
|---|---|
| Visitors | Distinct visitors per day who viewed a product that belongs to a live discount, summed over the period and over discounts. A visitor is counted once per discount per day. |
| Bundle orders | Paid orders with at least one line that received this app's discount, counted once per discount in the order. |
| AOV | Sum of the order subtotals (after discounts, before tax and shipping, whole order) of bundle orders, divided by Bundle orders. 0 when there are none. |
| Added revenue | For each bundle line: amount paid for the line minus one unit at its regular price, never below 0. Summed over bundle lines. (Confirmed by the owner: the first unit is what the shopper would have bought anyway.) |

Money is in the shop currency (`shop_money` amounts) and shown with the existing `formatMoney`. Days are the shop's time zone days (existing `getShopTimezone`).

## Data model (new Prisma tables, one migration)

- `DiscountDailyStat`: `shop`, `discountId`, `day` (date), `visitors` (int). Unique on `shop, discountId, day`.
- `VisitorSeen`: `shop`, `discountId`, `day`, `visitorKey` (hash). Unique on all four. Rows older than 2 days are deleted whenever a view is counted. `visitorKey` = HMAC of the pixel's client id with the shop and the day, keyed with the app's existing API secret, so it cannot be turned back into an id or followed across days.
- `BundleOrder`: `shop`, `orderId`, `discountId`, `orderedAt`, `currency`, `units`, `orderSubtotal`, `discountAmount`, `addedRevenue`. Unique on `shop, orderId, discountId`. Amounts as decimals.
- `MetricsSync`: `shop`, `lastOrderSyncAt`, `backfilledUntil`, `timeZone`, `liveProducts` (json: product id to the id of the live discount it belongs to). One row per shop. `liveProducts` and `timeZone` are a cache kept fresh by `saveConfig` and by every homepage load, so the visit route and the orders webhook read only the database and never call Shopify per request.

A discount that is later deleted keeps its rows. They count in the totals; the homepage labels them by id only if a per-discount view is added.

## Sources and flow

1. **Visitors: web pixel extension** (`extensions/metrics-pixel`), switched on for each shop with the `webPixelCreate` mutation (needs `write_pixels` and `read_customer_events`), the way `ensureTierDiscountSafely` makes sure the checkout discount exists. It subscribes to `product_viewed` and posts `{ shop, productId, clientId }` to a public app route (`/collect/view`). The route checks that the shop has the app installed, loads that shop's live discounts, finds the live discount whose members include the product, applies the dedupe table, and adds one to the day's counter. A view of a product in no live discount is dropped. The route needs CORS and must be exempt from the admin token check (the `EXEMPT_PREFIXES` list in `src/lib/proxyDecision.ts`; `/webhooks/` is already there).
2. **Orders going forward: `orders/paid` webhook** at `/webhooks/orders/paid`, using the existing `handleWebhook` (HMAC check, topic check). A pure function takes the order payload (plain values) and the live discounts and returns the `BundleOrder` rows; the route writes them with an upsert on the unique key.
3. **Orders before today (bootstrap): Admin API orders query**, last 90 days, run once per shop on the first homepage load after the permission is granted, through the same pure function as the webhook. Reasoning: the reports API returns totals, while this app needs one row per order tied to a discount.
4. **Catch-up:** on a homepage load, if `lastOrderSyncAt` is older than one hour, fetch orders since then and run them through the same function. This covers webhooks that never arrive.
5. **Reading:** the homepage loads sums for the selected date range from the tables. The "Last 30d" button opens a calendar and a preset list (Today, Yesterday, Last 7 days, Last week, Last 30 days, Last 90 days, This month, Last month) and accepts a custom range; the default is the last 30 days.

## Tying an order to a discount (to verify before building)

An order line counts when the line received a discount allocation from this app's automatic discount (`Product tier discounts`, `src/lib/tierDiscount.ts`) and the line's product is a member of a live discount in the current config. A product can be in only one live discount at a time. The discount id comes from the config at the time the order is counted, so a backfilled order is attributed with today's membership. **I have not seen a real order from this discount.** The first task is to place a test order on the demo shop and read the real webhook payload, to confirm that the application title, allocations and product ids are what this design assumes.

## Permissions

- Add `read_orders`, `read_all_orders`, `read_reports`, `write_pixels` and `read_customer_events` to `shopify.app.toml` and `shopify.app.dev.toml` (the `read_all_orders` scope needs no Shopify approval for a Dev Dashboard app under the owner's own organization; a Partner-organization app must request it first).
- Whether the orders webhook or the orders query also needs protected customer data access is **not verified**; check on the demo shop first.
- Installs made before the change (only the dev store today) must approve the new scopes. Until they have, the cards show "Needs permission" with a link, not zeros. The existing scope-update webhook and stored scopes (`src/lib/storedScopes.ts`) show which state a shop is in.

## Privacy and cleanup

- Stored: shop, discount id, day, counters, order id, amounts, hashed visitor key. Nothing identifies a person.
- The pixel declares that it needs analytics permission only, so Shopify loads it only for visitors who allow analytics; visitors who refuse are not counted.
- `shop/redact` (already handled) also deletes this shop's rows in the four new tables.

## Constraints

- Follow the owner's code guidelines (verb function names, no outside variables, injected calls, at most 2 branches, plain-value parameters).
- A new Prisma migration for the dev and the production database; the owner applies and deploys. Claude only commits and opens PRs into `dev`, with a version bump in each code commit.
- Web pixel scripts run in a restricted sandbox and have their own size and API limits (to check when building).

## Left to the builder

Table indexes, the exact CORS headers, the hashing function, the period selector's look, empty and error states, and the wording of the "estimate" hint.

## Answered by the owner

1. Added revenue = amount paid for a bundle line minus one unit at its regular price, never below 0: confirmed.
2. Request `read_reports` and the protected customer data approval now: yes.
3. Cards add up all discounts. The owner corrected my reading: the date button opens a calendar and a preset list; there is no discount picker.
