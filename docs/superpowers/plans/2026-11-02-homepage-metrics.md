# Homepage Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four homepage cards (Visitors, Bundle orders, AOV, Added revenue) show real numbers read from the app's own database, kept per discount.

**Architecture:** A web pixel reports product views and an `orders/paid` webhook reports orders; both write to four new Prisma tables. An Admin API orders query fills in the last 90 days and catches up missed webhooks. The homepage reads sums from the tables for a date range the owner picks with a calendar and presets. All logic is in small pure functions in `src/metrics/`; routes only wire them.

**Tech Stack:** Next.js 16 App Router, Prisma 6 on Postgres (Supabase), Vitest, a Shopify web pixel app extension.

**Spec:** `docs/superpowers/specs/2026-11-02-homepage-metrics-design.md`

## Global Constraints

- Owner's code guidelines (`~/.claude/CLAUDE.md`): variable names are nouns of 3+ letters; function names are verbs; no outside variables (DOM, `fetch`, clock, database, environment, other functions come in as parameters); more than 2 parameters go in one object; parameters are plain values or one flat object of plain values and functions; called functions are injected; at most 2 branches per function.
- Claude only commits and opens PRs into `dev`; the owner merges, applies migrations and deploys. One branch per PR group below, branched from the latest `origin/dev`; if the previous group is not merged yet, branch from it and say so in the PR.
- Every code commit bumps the version in `package.json` and `package-lock.json` (lines 3 and 9). The latest is read from `package.json` at the start (0.23.134 today).
- No AI attribution in commits or PR descriptions.
- Run `npx vitest run`, `npx tsc --noEmit` and `npm run lint` (0 errors) before each commit; `node scripts/build-extension.mjs` must keep every script at or under 10,000 bytes.
- Nothing is specific to one merchant: the shop always comes from the verified request, the webhook headers or the pixel event. No shop domain, shop id, app address or per-merchant setting is written in code or in an environment variable. The only environment value used is `SHOPIFY_API_SECRET_KEY`, which already exists and is the same for every merchant.
- Money: shop-currency (`shop_money`) amounts, two decimals. Days: the shop's time zone.
- Stored data holds no names, e-mails, addresses or readable visitor ids.
- Tests follow the layout under `tests/` (`tests/lib`, `tests/home`, `tests/webhooks/routes.test.ts` for routes).

## Review Focus

Tested in the task shown in brackets.

1. An order with products of two different live discounts: Bundle orders and AOV count the order once in the all-discounts view. [Task 5]
2. The same webhook delivered twice, or a backfill run over orders already stored: no change to the numbers. [Tasks 5, 6, 7]
3. A visitor who views the same discount's products at 23:59 and 00:01 shop time counts on two days; the same visitor viewing two products of one discount in a day counts once. [Task 8]
4. Forged or hostile posts to the public visit route (unknown shop, a product in no live discount, an oversized body): nothing is stored, and the answer never says why. [Task 9]
5. An order paid after its product left the live discount, and a discount deleted after it earned rows: the first is not counted, the second keeps its rows in the totals. [Tasks 4, 5]

---

### Task 1: Scopes and the orders webhook subscription

**Files:**
- Modify: `shopify.app.toml`, `shopify.app.dev.toml`
- Create: `tests/scripts/appConfig.test.ts`

**Interfaces:**
- Produces: both apps request `read_orders`, `read_all_orders`, `read_reports`, `write_pixels`, `read_customer_events` besides the current scopes; both subscribe `orders/paid` to `/webhooks/orders/paid`.

- [ ] **Step 1: Write the failing test** `appConfig.test.ts` (style of `tests/scripts/extensionContract.test.ts`): for each of the two files, read the text and assert the `scopes = "..."` line contains each of the nine scope names, and that a `[[webhooks.subscriptions]]` block has `uri = "/webhooks/orders/paid"` and `topics = [ "orders/paid" ]`.
- [ ] **Step 2: Run** `npx vitest run tests/scripts/appConfig.test.ts`. Expected: FAIL (scopes missing).
- [ ] **Step 3: Edit both toml files.** The production file has no subscriptions block yet; add one for `orders/paid` only.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit** on branch `feat/metrics-foundation` (version bump included).

### Task 2: Tables, migration and cleanup on shop/redact

**Files:**
- Modify: `prisma/schema.prisma`, `src/app/webhooks/compliance/route.ts`
- Create: `prisma/migrations/20261102000000_homepage_metrics/migration.sql`, `src/metrics/store.ts` (first function), `tests/metrics/store.test.ts`, `tests/metrics/schema.test.ts`

**Interfaces:**
- Produces models `DiscountDailyStat`, `VisitorSeen`, `BundleOrder`, `MetricsSync` exactly as in the spec's data model. Keys: `DiscountDailyStat` unique (`shop`,`discountId`,`day`); `VisitorSeen` unique (`shop`,`discountId`,`day`,`visitorKey`); `BundleOrder` unique (`shop`,`orderId`,`discountId`) with indexes on (`shop`,`orderedAt`); `MetricsSync` id = `shop`, fields `lastOrderSyncAt`, `backfilledUntil` (nullable DateTime), `timeZone` (String, default `UTC`), `liveProducts` (Json, default `{}`). Amounts `Decimal(12,2)`; `day` as `String` `YYYY-MM-DD`.
- Produces `deleteShopMetrics({ db, shop }): Promise<void>` in `src/metrics/store.ts`; `db` is a flat object `{ dailyStat, visitorSeen, bundleOrder, metricsSync }` each with `deleteMany` (the Prisma client satisfies it).

- [ ] **Step 1: Write failing tests.** `schema.test.ts`: reads `schema.prisma` text and expects the four `model` names and the three unique constraints. `store.test.ts`: `deleteShopMetrics` calls `deleteMany({ where: { shop } })` once on each of the four tables. Compliance route test (extend `tests/webhooks/routes.test.ts`): a `shop/redact` delivery also deletes the shop's metrics rows.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the schema, the migration SQL (hand-written to match Prisma's output; check with `npx prisma validate` and `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --shadow-database-url` only if a shadow database is available, otherwise review by eye), `deleteShopMetrics`, and the call in the compliance route's `delete-sessions` action.
- [ ] **Step 4: Run the tests and** `npx prisma validate`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: Capture a real order (needs the owner)

**Files:**
- Create: `tests/fixtures/metrics/order-graphql-bundle.json`
- Modify: the spec's "Tying an order to a discount" section if reality differs

**Interfaces:**
- Produces the order node used by Tasks 4 and 7, and a recorded answer to: what is the discount application's type and title on an order from this app's discount, does each discounted line carry a discount allocation, and which field marks it as this app's discount.

- [ ] **Step 1: After Group A is merged and deployed to the demo app (owner), the owner approves the new scopes and places a test order** on `demo-nlmhyat3.myshopify.com` with 3 or more units of a discounted product plus one non-discounted product.
- [ ] **Step 2: Read the order** with the Shopify GraphQL tool (`order(id)`: `currentSubtotalPriceSet`, `lineItems { product { id } quantity originalUnitPriceSet discountAllocations { allocatedAmountSet discountApplication { __typename allocationMethod ... on AutomaticDiscountApplication { title } } } }`, `discountApplications`). Remove customer fields. Save as the fixture.
- [ ] **Step 3: Write down** the answer to the question above at the end of the spec. If lines do not carry an allocation from this discount, stop and report to the owner: Tasks 4 and 7 change.
- [ ] **Step 4: Commit** the fixture and the spec note.

### Task 4: Reading an order into bundle rows (pure)

**Files:**
- Create: `src/metrics/types.ts`, `src/metrics/addedRevenue.ts`, `src/metrics/readOrder.ts`, `src/metrics/listBundleRows.ts`, `tests/metrics/addedRevenue.test.ts`, `tests/metrics/readOrder.test.ts`, `tests/metrics/listBundleRows.test.ts`, `tests/fixtures/metrics/order-webhook-sample.json`

**Interfaces:**
- Produces in `types.ts`: `OrderLineFacts { productId: string; quantity: number; unitPrice: number; discountAmount: number; appDiscounted: boolean }`, `OrderFacts { orderId: string; orderedAt: string; currency: string; subtotal: number; lines: OrderLineFacts[] }`, `BundleOrderRow { discountId: string; orderId: string; orderedAt: string; currency: string; units: number; orderSubtotal: number; discountAmount: number; addedRevenue: number }`. Product ids are `gid://shopify/Product/<n>`; money is a number rounded to cents.
- Produces `measureAddedRevenue({ unitPrice, quantity, discountAmount }): number` = `max(0, unitPrice*quantity - discountAmount - unitPrice)` rounded to cents.
- Produces `readWebhookOrder(body: string): OrderFacts | null` (REST payload: `id`, `created_at`, `current_subtotal_price_set.shop_money`, `line_items[].product_id`, `.quantity`, `.price_set.shop_money`, `.discount_allocations[].amount_set.shop_money` and its application index into `discount_applications`) and `readGraphqlOrder(node: object): OrderFacts | null`. Both return `null` for malformed input, never throw. The rule that sets `appDiscounted` is one exported function `isAppDiscount({ type, title }): boolean` whose body is settled by Task 3's finding (expected: the application title equals `TIER_DISCOUNT_TITLE` from `src/lib/tierDiscount.ts`).
- Produces `listBundleRows({ order, productDiscounts }): BundleOrderRow[]`, `productDiscounts: Record<string, string>` (product id to live discount id): one row per discount that has at least one line with `appDiscounted` and a product in the map; `units`, `discountAmount`, `addedRevenue` sum those lines only; `orderSubtotal` is the whole order's.

- [ ] **Step 1: Write failing tests.**
  - `measureAddedRevenue`: (1.69, 10, 0.60) gives 14.61; quantity 1 gives 0; a discount larger than the line gives 0; rounds to cents.
  - `listBundleRows`: two lines of one discount's product give one row with summed units; lines of two discounts give two rows with the same `orderSubtotal`; a line not `appDiscounted` is ignored; a product missing from the map is ignored (Review Focus 5); an order with no bundle line gives `[]`.
  - `readWebhookOrder` on the sample fixture gives the expected `OrderFacts` (gid product ids, numeric amounts); invalid JSON, a missing id and a non-array `line_items` give `null`. `readGraphqlOrder` on Task 3's fixture gives the same shape.
- [ ] **Step 2: Run them.** Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** each function in its own file; `isAppDiscount` goes in `readOrder.ts`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** on branch `feat/metrics-orders` (version bump).

### Task 5: Saving rows and reading totals

**Files:**
- Modify: `src/metrics/store.ts`
- Create: `src/metrics/sumTotals.ts`, `tests/metrics/sumTotals.test.ts`; extend `tests/metrics/store.test.ts`

**Interfaces:**
- Consumes: `BundleOrderRow` (Task 4).
- Produces in `store.ts` (each takes `db` as part of one object; `db` is the Prisma client or a fake with the same methods): `saveBundleRows({ db, shop, rows }): Promise<void>` (one `upsert` per row on the unique key), `readOrderRows({ db, shop, fromIso, toIso }): Promise<BundleOrderRow[]>` (orders whose `orderedAt` is from `fromIso` up to but not including `toIso`), `readVisitorSum({ db, shop, fromDay, toDay }): Promise<number>` (days from `fromDay` to `toDay`, both included, over all discounts).
- Produces `sumTotals({ rows, visitors }): { visitors: number; orders: number; averageOrderValue: number; addedRevenue: number }`: `orders` counts distinct `orderId`; `averageOrderValue` = sum of the distinct orders' `orderSubtotal` divided by `orders` (0 when none), rounded to cents; `addedRevenue` sums every row.

- [ ] **Step 1: Write failing tests.** `sumTotals`: one order in two discounts' rows counts as 1 order, its subtotal once in AOV, and both rows' added revenue (Review Focus 1); no rows gives zeros; rows of a discount that no longer exists still count (Review Focus 5). `saveBundleRows`: saving the same rows twice calls `upsert` with the same `where` key each time and creates no second record in a fake keyed store (Review Focus 2). `readVisitorSum` adds up only the days from `fromDay` to `toDay`, both included, over every discount.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Convert Prisma `Decimal` to number in `readOrderRows`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: The orders/paid webhook

**Files:**
- Create: `src/metrics/recordOrder.ts`, `src/app/webhooks/orders/paid/route.ts`, `tests/metrics/recordOrder.test.ts`; extend `tests/webhooks/routes.test.ts`

**Interfaces:**
- Consumes: `readWebhookOrder`, `listBundleRows`, `saveBundleRows`; `MetricsSync.liveProducts` through a new `readLiveProducts({ db, shop }): Promise<Record<string,string>>` in `store.ts`.
- Produces `recordOrder({ body, shop, readLiveProducts, saveRows, readOrder, listRows }): Promise<number>` returning the number of rows saved (0 for an order with no bundle line or an unreadable body).

- [ ] **Step 1: Write failing tests.** `recordOrder`: a body with one bundle line saves one row and returns 1; a body with no bundle line saves nothing and returns 0; an unreadable body returns 0 and does not throw; delivering the same body twice calls `saveRows` twice with identical rows (the upsert makes this safe). Route test: a correctly signed `orders/paid` delivery returns 200 and calls the recorder with the shop from the verified headers; a delivery with another topic returns 400 (follow the existing uninstalled-route tests).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `recordOrder` and the route with `handleWebhook({ topics: ['orders/paid'] })`, passing `getDb()`-backed functions.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 7: Backfill and catch-up of orders

**Files:**
- Create: `src/metrics/syncOrders.ts`, `tests/metrics/syncOrders.test.ts`
- Modify: `src/metrics/store.ts` (sync marker read/write)

**Interfaces:**
- Consumes: `readGraphqlOrder`, `listBundleRows`, `saveBundleRows`, `readLiveProducts`.
- Produces `readSyncMarker({ db, shop }): Promise<{ lastOrderSyncAt: string | null; backfilledUntil: string | null }>` and `writeSyncMarker({ db, shop, lastOrderSyncAt, backfilledUntil }): Promise<void>`.
- Produces `syncOrders({ shop, nowIso, readMarker, writeMarker, queryOrders, readLiveProducts, saveRows }): Promise<'synced' | 'up-to-date' | 'needs-permission'>`. `queryOrders({ sinceIso, afterCursor })` returns `{ nodes: object[]; endCursor: string | null; hasNextPage: boolean }` (a thin wrapper over `shopifyQuery`, written in this task with the query `orders(first: 50, sortKey: PROCESSED_AT, query: "financial_status:paid processed_at:>=<since>")`). Rules: with no marker, `since` is 90 days before `nowIso`; with a marker, `since` is the marker minus 1 hour; if the marker is younger than 1 hour return `'up-to-date'` without querying; at most 10 pages per call, after which the marker records the last processed order's time so the next call continues; an access-denied error returns `'needs-permission'` and writes nothing.

- [ ] **Step 1: Write failing tests** with a fake `queryOrders`: first run reads 90 days back; a second run inside the hour returns `'up-to-date'` and queries nothing; two pages are both saved; 11 pages stop at 10 and the marker points at the last order's time; running over orders already saved changes nothing (Review Focus 2); an access-denied error gives `'needs-permission'`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit and open the PR** for the Orders group (version bump).

### Task 8: Counting a product view (pure rules)

**Files:**
- Create: `src/metrics/recordView.ts`, `src/metrics/visitorKey.ts`, `src/metrics/pickShopDay.ts`, `tests/metrics/recordView.test.ts`, `tests/metrics/visitorKey.test.ts`, `tests/metrics/pickShopDay.test.ts`
- Modify: `src/metrics/store.ts`

**Interfaces:**
- Produces `pickShopDay({ nowMs, timeZone }): string` (`YYYY-MM-DD` in that zone; check `src/lib/zonedTime.ts` first and reuse what it offers).
- Produces `buildVisitorKey({ clientId, shop, day, secret }): Promise<string>`: HMAC-SHA-256 hex (Web Crypto) with `secret` as the key over the text `visitor-key|shop|day|clientId` (the fixed first word keeps this use of the secret apart from any other).
- Produces in `store.ts`: `addVisit({ db, shop, discountId, day, visitorKey }): Promise<'counted' | 'duplicate'>` (create the `VisitorSeen` row; a unique-key error means `'duplicate'` and no increment; otherwise increment `DiscountDailyStat.visitors` by an `upsert` with `increment`) and `purgeOldVisits({ db, shop, beforeDay }): Promise<void>`.
- Produces `recordView({ shop, productId, clientId, nowMs, secret, readSettings, addVisit, purgeVisits, buildKey, pickDay }): Promise<'counted' | 'duplicate' | 'ignored'>`; `readSettings` returns `{ timeZone, liveProducts }` from `MetricsSync`. A product not in `liveProducts` gives `'ignored'`; the purge removes visits older than 2 days before today.

- [ ] **Step 1: Write failing tests.** `pickShopDay`: 23:59 and 00:01 in `Pacific/Auckland` fall on different days (Review Focus 3). `buildVisitorKey`: same inputs give the same key; changing day, shop or client changes it; the output contains no part of the client id. `recordView`: product in no live discount gives `'ignored'` and nothing stored; first view `'counted'`; same client again `'duplicate'`; same client, other product of the same discount, same day `'duplicate'`; same client next local day `'counted'`; the purge is called with the day two days back.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** on branch `feat/metrics-visitors` (version bump).

### Task 9: The public visit route and the cache that feeds it

**Files:**
- Create: `src/app/collect/view/route.ts`, `src/metrics/refreshSettings.ts`, `tests/metrics/refreshSettings.test.ts`; extend `tests/webhooks/routes.test.ts` (or a new `tests/app/collectView.test.ts`) and `tests/lib/proxyDecision.test.ts`
- Modify: `src/lib/proxyDecision.ts` (`EXEMPT_PREFIXES` gets `/collect/`), `src/lib/config.ts` (`saveConfig` refreshes the cache), `src/metrics/store.ts`

**Interfaces:**
- Produces `mapLiveProducts({ discounts: { discountId: string; status: string; members: { productId: string }[] }[] }): Record<string,string>` (live discounts only) in `src/metrics/refreshSettings.ts`, and `refreshSettings({ shop, timeZone, discounts, writeSettings })` which writes `timeZone` and `liveProducts` to `MetricsSync` (`writeSettings` is `store.ts`'s `saveSettings({ db, shop, timeZone, liveProducts })`).
- Produces the route `POST /collect/view` with body `{ shop, productId, clientId }`, and `OPTIONS` for CORS (`Access-Control-Allow-Origin: *`, allowed method POST, allowed header `content-type`). Always answers `204` with no body, whatever happened.

- [ ] **Step 1: Write failing tests.** `mapLiveProducts`: draft discounts are left out; a product in a live discount maps to its id. Route: a body over 2,048 bytes, a non-JSON body, a `shop` that is not a shop host, a shop with no `MetricsSync` row, and a product in no live discount each answer 204 and store nothing (Review Focus 4); a valid view answers 204 and calls the recorder once; `OPTIONS` answers with the CORS headers. `proxyDecision`: a `/collect/view` request passes with no token (`{ kind: 'next' }`) while `/` still needs one. `saveConfig`: after a save, the settings writer is called with the live product map.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `saveConfig`, read the shop time zone with the existing `getShopTimezone`. The route builds its dependencies from `getDb()` and passes `process.env.SHOPIFY_API_SECRET_KEY` (already set on every deployment) as the hashing secret; it answers 204 and stores nothing when that is missing.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 10: The web pixel and switching it on per shop

**Files:**
- Create: `extensions/metrics-pixel/shopify.extension.toml`, `extensions/metrics-pixel/package.json`, `extensions/metrics-pixel/src/index.js`, `extensions/metrics-pixel/src/buildViewPayload.js`, `src/metrics/ensurePixel.ts`, `tests/metrics/buildViewPayload.test.ts`, `tests/metrics/ensurePixel.test.ts`
- Modify: `src/app/page.tsx` (call `ensureMetricsPixelSafely` next to `ensureTierDiscountSafely`)

**Interfaces:**
- Produces the extension: `type = "web_pixel_extension"`, `runtime_context = "strict"`, `[customer_privacy] analytics = true, marketing = false, preferences = false, sale_of_data = "disabled"`, one setting `collectUrl` (single line text). `index.js` registers a `product_viewed` subscriber that posts the payload with `keepalive` to the setting's URL.
- Produces `buildViewPayload({ shop, productId, clientId }): string` (JSON `{ shop, productId: "gid://shopify/Product/<n>", clientId }`), taking the plain id from the event.
- Produces `ensureMetricsPixel({ shop, collectUrl, queryShop }): Promise<'created' | 'updated' | 'exists'>` (query `webPixel`; if none, run `webPixelCreate` with settings `{"collectUrl": ...}`), and `ensureMetricsPixelSafely({ collectUrl })`, which never throws, like `ensureTierDiscountSafely`. `collectUrl` is built by `readAppOrigin({ host, protocol }): string | null` from the host of the verified homepage request (`x-forwarded-host` or `host`, protocol `https`), so every deployment uses its own address and no variable is needed; it returns `null` for a host that is empty or has a path or credentials in it, and then the pixel is not created. If a pixel exists with another `collectUrl`, `ensureMetricsPixel` updates it (`webPixelUpdate`).

- [ ] **Step 1: Write failing tests.** `buildViewPayload` makes the gid from a numeric id and keeps the other values. `readAppOrigin`: `my-app.vercel.app` gives `https://my-app.vercel.app`; an empty host, `a.com/x` and `user@a.com` give `null`. `ensureMetricsPixel`: existing pixel with the same address gives `'exists'` and no mutation; one with another address gives `'updated'`; none gives `'created'` with the right settings; a user error from the mutation is thrown, and the Safely wrapper turns it into `'failed'`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Scaffold the extension files by the shape in Shopify's "Build web pixels" page; add its `package.json` dependency `@shopify/web-pixels-extension`. Confirm the exact `webPixel` query and `webPixelCreate` input shape against the 2025-10 schema (the version `shopify-client.ts` uses) with the Shopify GraphQL tool before writing the strings.
- [ ] **Step 4: Run the tests,** `npx tsc --noEmit` and lint. Expected: PASS.
- [ ] **Step 5: Commit and open the PR** for the Visitors group (version bump).

### Task 11: Real numbers on the cards

**Files:**
- Create: `src/home/loadMetrics.ts`, `src/home/buildMetricCards.ts`, `tests/home/loadMetrics.test.ts`, `tests/home/buildMetricCards.test.ts`
- Modify: `src/home/components/StatCards.tsx`, `src/home/components/HomeView.tsx`, `src/app/page.tsx`, `src/lib/sessions.ts` (add `readStoredScopes(shop)`), `tests/home/components/staticSections.test.tsx`, `tests/home/components/homeView.test.tsx`

**Interfaces:**
- Produces `buildMetricCards({ totals, currencyCode, hasPermission, formatMoney }): { label: string; value: string; hint: string }[]` in the existing order. Values: visitors and orders as integers, AOV and Added revenue through `formatMoney`; with `hasPermission` false every value is `Needs permission`. The Visitors hint says it is an estimate.
- Produces `loadMetrics({ shop, nowIso, fromDay, toDay, timeZone, readScopes, syncOrders, refresh, readRows, readVisitors, sumTotals }): Promise<{ totals; hasPermission }>`: reads the stored scopes (permission is `read_orders` present), runs `syncOrders` (ignoring its result except to set permission false on `'needs-permission'`), refreshes the settings cache from the current config, then reads the order rows between the instants where `fromDay` starts and the day after `toDay` starts in the shop's time zone (`zonedTimeToUtc` from `src/lib/zonedTime.ts`) and the visitor sum for the same days.
- `StatCards` becomes a presentation component taking `cards` as a prop.

- [ ] **Step 1: Write failing tests.** `buildMetricCards`: sample totals give the four formatted values in order; zero orders gives AOV `formatMoney(0)`; no permission gives four `Needs permission`; the Visitors hint contains "estimate". `loadMetrics`: missing scope gives `hasPermission: false` without reading rows; `'needs-permission'` from the sync does the same; the sync runs before the rows are read. Update the two existing component tests that expect the placeholder values (`16`, `0`, `0.00`).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `page.tsx` build the dependencies from `getDb()` and the existing helpers; keep the page loading if metrics fail: catch the error and show the value `-` with the hint "Could not load" on each card.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** on branch `feat/metrics-homepage` (version bump).

### Task 12: Date range picker

**Files:**
- Create: `src/home/rangeDays.ts`, `src/home/metricsQuery.ts`, `src/home/components/DateRangePicker.tsx`, `tests/home/rangeDays.test.ts`, `tests/home/metricsQuery.test.ts`, `tests/home/components/dateRangePicker.test.tsx`
- Modify: `src/home/components/StatCards.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces in `rangeDays.ts` (days are `YYYY-MM-DD` strings, no time zone inside): `addDays({ day, count }): string`, `listRangePresets({ today }): { key: string; label: string; fromDay: string; toDay: string }[]` with these presets in this order (my call, the owner can change them): `today` "Today", `yesterday` "Yesterday", `last7` "Last 7 days", `lastWeek` "Last week" (the previous Monday to Sunday), `last30` "Last 30 days", `last90` "Last 90 days", `thisMonth` "This month", `lastMonth` "Last month".
- Produces `parseMetricsQuery({ raw, today }): { fromDay: string; toDay: string; label: string }`: `?range=<preset key>` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`; the default is `last30`; a malformed day, a day after `today`, or a range longer than 366 days falls back to the default; `from` after `to` are swapped; a custom range's label reads `12 Oct – 2 Nov`.
- Produces `DateRangePicker({ label, fromDay, toDay, today, presets })`, a client component: the button shows `label` and opens a panel with a month calendar (previous and next month arrows, days after `today` disabled) and the preset list below it. A preset is a link to `?range=<key>`. Picking two days on the calendar and pressing Apply goes to `?from=...&to=...`. Escape and a click outside close it. No new dependency: the calendar is built by hand.

- [ ] **Step 1: Write failing tests.** `rangeDays`: `addDays` across a month and a year end; with `today` = `2026-11-02` (a Monday) `lastWeek` is `2026-10-26` to `2026-11-01`, `last7` is `2026-10-27` to `2026-11-02`, `lastMonth` is `2026-10-01` to `2026-10-31`. `parseMetricsQuery`: no query gives the last 30 days; `range=today` gives today to today; `from` after `to` are swapped; `from=2026-13-40`, a future `to` and a 400-day range fall back to the default. `DateRangePicker`: the button shows the label; clicking it shows the calendar and the eight presets; each preset is a link with the right `href`; choosing two days and pressing Apply produces the custom link; a day after `today` is disabled; Escape closes it.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement,** reading `ToolbarMenu.tsx` and `home.css` first and reusing their menu and popover styling. `page.tsx` takes `today` from `pickShopDay` with the shop time zone and passes `fromDay`/`toDay` to `loadMetrics`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit and open the PR** for the Homepage group (version bump).

### Task 13: Check it on the demo shop (needs the owner)

**Files:** none; the result goes in `.session-log`.

- [ ] **Step 1: Owner:** merge the four PRs, apply the migration to the dev database, run `npm run deploy:dev`, approve the new scopes. No new environment variable is needed.
- [ ] **Step 2: Open the homepage.** Expected: the cards load, the sync runs once, no error in the Vercel runtime logs.
- [ ] **Step 3: Visit a discounted product page from a private window with analytics allowed, twice.** Expected: Visitors goes up by 1, not 2.
- [ ] **Step 4: Place a test order with 3 or more discounted units.** Expected: a `BundleOrder` row appears from the webhook within a minute; Bundle orders, AOV and Added revenue match a hand calculation from the order.
- [ ] **Step 5: Cross-check with ShopifyQL** (`FROM sales SHOW orders, total_sales SINCE -30d`, through the Shopify GraphQL tool) against the stored totals, and record whether ShopifyQL can split by discount.
- [ ] **Step 6: Report** results and any difference to the owner; production steps (migration, `deploy:prod`) are the owner's.
