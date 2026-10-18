# Multi-store dev app (any store can install it) — design

**Date:** 2026-10-17
**Status:** awaiting the owner's review of the written spec (the design was played back to and approved in conversation; a fresh reviewer read this document and its questions are answered below)
**App:** the dev app `demo` (`shopify.app.dev.toml`). Production (`st-product-discounts`, `shopify.app.toml`) is out of scope.
**Branch workflow:** a milestone branch, see "Branches and commits".

## Intent and why

The app will eventually be published in the Shopify App Store. It must therefore behave like a regular app: any store can install it, each store is an independent customer, and nothing in the code knows about one particular store. The owner must still be able to install it directly on their own dev stores while it is being built (the normal Dev Dashboard install), and that must not need a special mode.

## Goals

1. **The shop comes from the verified login, never from the environment.** Remove `SHOPIFY_SHOP` from the code. Every Admin API call uses the access token and the shop of the request that triggered it.
2. **A new store works after install with no script and no theme edit by us.** The merchant installs, opens the app, creates discounts, and adds the app's widget block to their theme in the theme editor (their one manual step). Customers then see the widget and the discount applies at checkout.
3. **The app creates the tier checkout discount itself** (today a manual script does it, once per store).
4. **All data the app stores in a store moves into the app-owned namespace `$app:smooth_discount`**, so Shopify removes it when the app is uninstalled. Discounts and settings stay in Shopify (shop, product and discount metafields), not in our database.
5. **On uninstall, all data is deleted**, including discount metadata (see "Uninstall" for what the app can do itself and what Shopify does).
6. **Stores are isolated** (the anti-goal below), proven by tests on two dev stores.

## Non-goals (the user cut these)

- Price display, the widget's price logic, and the theme's own price line.
- App Store listing and review, billing, privacy-policy and listing work.
- The production app and the production store; legacy discounts; any old-data fallback; any migration script.
- Storing discounts in our database.

## Anti-goal

**Two stores must never share information.** Store A's discounts, settings, IDs and sessions must never be readable, changeable or deletable from store B's requests or from a webhook about store B. Each store's data and IDs stay separate; they are independent customers.

## Decided by the user

- Direction: regular multi-store app, direct installs on the owner's own stores keep working through the same path.
- Discounts stay in each store's Shopify metafields; the database holds only per-store login sessions.
- Uninstall must delete all data including discount metadata; the namespace move is in scope for that reason.
- Dev app only; production and legacy data are forgotten.
- Work happens on a milestone branch with atomic commits and PRs into it (see below).

## My calls (marked so you can overrule them)

- The request's shop is read once per request from the proxy-verified header `x-shopify-shop` in one helper, with an explicit argument for callers outside a request (scripts, tests). Not passed as a parameter through every function: 9 files call `shopifyQuery`.
- The milestone PR into `dev` is squash-merged (the repo's pattern so far), so reverting the milestone is one `git revert`.
- Webhooks take the shop from the signed body when Shopify provides it (see 5.2).
- `scripts/activate-discount.mjs` is deleted (its job moves into the app).
- Webhook rules in 5.2, the existing-discount policy and mechanism in 5.3, and leaving the product-card snippet out of new-store behaviour are my calls from the builder check.
- I never deploy anything (no Vercel deployments, no `shopify app deploy`): I only commit and open PRs. The owner deploys, either by merging to the branch the dev Vercel project builds or by pointing that project at the milestone branch for a live test; I may only read deployments and logs.

## Current state (verified on `origin/dev` at 0.23.12)

- `process.env.SHOPIFY_SHOP` is read in code at: `src/proxy.ts:14` (compared with the token's shop), `src/lib/getAccessToken.ts:30`, `src/lib/shopify-client.ts:7`, `src/app/time-discounts/[discountId]/page.tsx:26`, `src/app/time-discounts/new/page.tsx:6`, `src/timeDiscounts/shopifyRecord.ts:156` (admin product links), plus `scripts/activate-discount.mjs` and 9 occurrences in 3 test files. The dev Vercel project has the variable set.
- `src/lib/idToken.ts` verifies the signed ID token and compares the `dest` host with `options.shop`; it does not check `iss`. `src/proxy.ts` strips client-sent `x-shopify-id-token` / `x-shopify-shop` headers and sets verified ones (`forwardHeaders`).
- Sessions live in the `Session` table (RLS on), id `offline_<shop>`, `shop` column; the webhooks `app/uninstalled`, `app/scopes_update`, `compliance` exist. `src/lib/webhookHandler.ts:20` takes the shop from the header `x-shopify-shop-domain`; the HMAC covers the body only.
- Settings and discounts live in metafields in the merchant-owned namespaces `sparkly_product_discounts` and `sparkly_time_discounts`: writers `src/lib/config.ts`, `src/lib/product-tiers.ts` (keys `config`, `discount`, `sibling_products`, `sibling_variants`), `src/timeDiscounts/config.ts`, `src/timeDiscounts/metafieldSync.ts`, `src/timeDiscounts/shopifyRecord.ts`; readers: `extensions/product-discount/src/cart_lines_discounts_generate_run.graphql`, `extensions/time-based-discount/src/cart_lines_discounts_generate_run.graphql`, and the Liquid files `blocks/tier-pricing.liquid`, `blocks/time-based-discount.liquid`, `snippets/product-card-with-discount.liquid`.
- The time-based Function's discount is created by the app (`src/timeDiscounts/shopifyRecord.ts`, `discountAutomaticAppCreate` with `functionHandle`). The tier Function (`handle = "product-discount"`) has no in-app creation: only `scripts/activate-discount.mjs <functionId>`.
- The dev store `demo-nlmhyat3` had no automatic app discount before this work, so tier discounts have never applied at checkout there.

## Verified facts this design relies on (2026-10-17, dev store, read from Shopify docs or executed)

- `discountAutomaticAppCreate` with `functionHandle: 'product-discount'` succeeds at Admin API 2025-10 and 2026-10 on the dev app (test discounts were deleted afterwards).
- A shop metafield in `$app:smooth_discount` can be written and read through the Admin API with no definition; it resolves to namespace `app--<appId>--smooth_discount` (the dev app id is 431782264833).
- Shopify docs: on uninstall, Shopify deletes an app's app-owned metafield definitions and temporarily retains the values; cleanup runs asynchronously with no guaranteed timing; the docs say nothing about merchant-owned namespaces. The docs I read do not say what happens to the app's automatic discounts on uninstall, nor whether the access token still works inside the `app/uninstalled` webhook (I believe it is revoked).

## Design

### 5.1 The shop comes from the token

- `verifyIdToken` no longer takes a `shop` to match. It validates `dest` as a Shopify shop host (`^[a-z0-9][a-z0-9-]*\.myshopify\.com$`, https only), requires the host of `iss` (normally `https://<shop>/admin`) to equal the host of `dest` (compare hosts only), keeps the audience, signature and time checks, and returns the shop.
- `decideProxy` / `src/proxy.ts` no longer need `SHOPIFY_SHOP`; the 503 "misconfigured" case covers only the secret and the API key. The forwarded `x-shopify-shop` is the verified `dest` host.
- One server helper returns the request's shop from `x-shopify-shop` (never from the environment) and throws outside a request unless a shop is passed. `getAccessToken(shop?)` and `shopifyQuery` use it; sessions are looked up by `offline_<shop>`; the 401 recovery deletes only that shop's session.
- The three admin product-link builders use the request's shop.
- A test fails the build if `process.env.SHOPIFY_SHOP` appears anywhere in `src/` or `scripts/`.
- The `SHOPIFY_SHOP` variable is deleted from the dev Vercel project and from docs and examples (the owner's action for Vercel).

### 5.2 Webhooks: the shop comes from the signed body

Today the shop is taken from the header `x-shopify-shop-domain`, which the signature does not cover; a captured valid body replayed with another store's header could delete another store's sessions. Rules (my calls):

- `shop/redact` and `app/uninstalled` are destructive, so the shop must come from the signed body (the compliance payloads carry `shop_domain`; the docs show the uninstall payload as a shop resource with `myshopify_domain`), and a delivery whose header and body disagree is rejected. The exact field per topic is verified from a real delivery in the proof step. If the real uninstall body carries no shop domain, the plan must propose how to bind the body to a store (for example keeping the shop's numeric ID with the session) and bring it back to the user before building it.
- `app/scopes_update`: the docs show the body identifies the shop by `shop_id`, not by domain, so the shop can only come from the header. It must not apply unsigned-header-selected data from the body: the handler ignores the body's scope list and re-reads that shop's granted scopes from Shopify with that shop's own token (a replay then only triggers a harmless refresh for that shop).

### 5.3 Ensure the tier checkout discount exists

- A function `ensureTierDiscount(shop)` creates the automatic app discount if the store does not have one. Its input is exactly what `scripts/activate-discount.mjs` sends, with the Function referenced by handle: `title: "Product tier discounts"`, `functionHandle: 'product-discount'`, `startsAt` now, `discountClasses: [PRODUCT]`, and no `combinesWith` (the script and the time-based creation in `src/timeDiscounts/shopifyRecord.ts` set none, so Shopify's default stays). It uses the Admin API version the client already uses. It is safe to repeat and must never create a second discount for a store, even with two tabs opening the app at once.
- Existing-discount policy (my call): the lookup is by this Function, not by title. If a discount for the Function already exists in any state (active, scheduled, expired, paused) it is left alone and never modified; one is created only when none exists. If the merchant deletes it, the next app open recreates it. If creation fails (the Function is not deployed, a scope is missing) the app keeps working: the error is logged and shown when the merchant saves a discount; the home page is never blocked.
- It runs when the app's home page loads and before the first discount is saved.
- Mechanism (my call, to be proven): the guarantee should come from Shopify alone. `MetafieldsSetInput` has a `compareDigest` field (confirmed in the schema; its create-only-if-absent behaviour is proven in the proof step), so the first caller claims an app-data metafield on the app installation (hidden from merchants; goes away with the installation) and only the winner creates the discount, then records its ID there; a stale claim expires after a short time. Fallback if that does not work: a Postgres advisory lock keyed by the shop, which stores no table or data, so the rule "the database holds only sessions" still holds. Either way the concurrency test must pass.
- The time-based Function needs nothing new.

### 5.4 The namespace move

All keys live in `$app:smooth_discount`:

| Owner | Old `namespace.key` | New key |
|---|---|---|
| Shop | `sparkly_product_discounts.config` | `tier_config` |
| Product | `sparkly_product_discounts.discount` | `tier_discount` |
| Product | `sparkly_product_discounts.sibling_products` | `tier_sibling_products` |
| Product | `sparkly_product_discounts.sibling_variants` | `tier_sibling_variants` |
| Product | `sparkly_product_discounts.time_based_discount` | `time_discount` |
| Shop | `sparkly_time_discounts.config` | `time_config` |
| Discount | `sparkly_time_discounts.function_config` | `time_function_config` |

- One pure module (`src/lib/metafieldNames.ts`) holds the namespace and the seven keys; every writer imports it. A drift test reads the two Function queries and the three Liquid files and asserts each uses the module's names and none still contains an old namespace.
- The Liquid, the two Functions' input queries and, if needed, `shopify.app.dev.toml` definitions are updated together. Whether a sub-namespace can be declared and read in Liquid is proven first; the fallback is the bare `$app` namespace with keys `smooth_discount_<key>` (the names live in the one module, so nothing else changes).
- The sibling reference lists are `list.product_reference` / `list.variant_reference` metafields; whether app-owned reference lists resolve in Liquid (they resolved in a merchant namespace with no definition) is part of the proof step.
- No migration script, no old-name fallback, no copying: the dev store's discounts are re-saved after the move. The `sparkly_tiers.tiers` leftover is not touched.
- `snippets/product-card-with-discount.liquid` is referenced nowhere in the repo (an app-extension snippet cannot be rendered from a merchant's theme unless it is copied by hand, which I have not verified against the docs), so only its namespace read is renamed, to keep the drift test true. Making it usable is out of scope.
- Also removed: the `TEMPORARY FALLBACK` block in `tier-pricing.liquid`, the unused `productHandle` field in `tier-pricing.js` and `data-product-handle`, and `scripts/activate-discount.mjs`.

### 5.5 Uninstall

*Updated 2026-10-18 with what was measured and built; the original text assumed the app could not delete anything after uninstall and accepted Shopify's asynchronous cleanup.*

- Our database: the `app/uninstalled` webhook deletes that shop's sessions; `shop/redact` does the same and nothing else is stored. Both act only on the shop proven by 5.2.
- The app's automatic discounts: Shopify deletes them at uninstall (observed on both stores; the app recreates the tier discount on the next open, 5.3).
- The store's data (app-owned metafields): Shopify retains them for an unguaranteed time and **re-attaches them on a reinstall** (documented, and observed: the saved settings came back after two quick reinstalls). The app cannot delete them itself at uninstall: inside the `app/uninstalled` webhook the stored token is already rejected (measured on a dev store: HTTP 401).
- What the app does instead (built, PR #67): a marker on the **app installation** (installation data is removed by Shopify with the installation, observed in the proof step). The first time the app runs in an installation without the marker, before any page renders, it removes the leftovers: the per-product data on the products the retained settings list (skipping deleted products), then the shop settings, then writes the marker. A failure throws before the marker, so the next load repeats; the page does not render over leftovers. Shopify's own asynchronous cleanup still covers a store that never reinstalls (the owner's decision: "Shopify's asynchronous cleanup is enough" for that case).
- Consequence: an installation that has no marker when this ships is treated as new once and its saved settings are removed.

### 5.6 Isolation tests (two dev stores)

Needs a second dev store in the same organization as the dev app, created by the owner, with the dev app installed on it (a dependency of the isolation PR; the unit tests below do not wait for it). The scripted check reads each store's token through the app's client credentials: the builder runs it locally, taking the client secret from `shopify app env show --config shopify.app.dev.toml` inside the script, never printing it. Automated where possible:

- Unit tests: `verifyIdToken` accepts a valid token for any well-formed `*.myshopify.com` shop and rejects a bad host, a non-https `dest`, and `iss` not matching `dest`; a forged `x-shopify-shop` is dropped; `getAccessToken` and `shopifyQuery` use the header shop and never the environment; two interleaved requests for shops A and B each read and refresh their own session; the 401 recovery deletes only the requesting shop's session; a webhook for shop A (valid body) never deletes B's sessions, and a header/body mismatch is rejected.
- A scripted two-store check (client-credentials tokens for both stores, run by the builder): a discount configuration written on A is not visible on B; `ensureTierDiscount` called twice (and concurrently) on A leaves exactly one discount on A and none on B.

## Proof-first step (before any code is built on these assumptions)

Throwaway tests on the dev app and two dev stores; the results are written into this spec's "Proof results" section by a docs-only PR to the milestone branch. Anything that fails changes the design before more is built.

1. A Liquid block in the app's theme extension reads an app-owned product metafield and an app-owned reference list (syntax and whether a TOML definition with storefront access is required).
2. The tier Function's input query reads a shop metafield in `$app:smooth_discount`; same for the time-based Function (a discount metafield).
3. The mechanism chosen for 5.3 (including the app-data metafield, and two concurrent calls).
4. The payload field for the shop in each webhook topic, from a real delivery.
5. Uninstall behaviour (5.5): sessions, metafields, discounts, and whether the stored token still works inside the webhook.

## Branches and commits

- **Milestone branch:** `milestone/multi-store-install`, cut from `origin/dev` (already created and pushed, identical to `dev` at creation). All work for this project lands there; nothing in this project goes straight to `dev` until the end.
- **Work branches:** one per PR, cut from the milestone branch, named `feat/multi-store-<topic>` or `docs/multi-store-<topic>`; each PR targets `milestone/multi-store-install` and needs a non-author review; the owner merges.
- **Atomic commits and PRs:** each commit is one logical change that leaves `tsc`, eslint on touched files, the whole vitest suite and the extension tests green, with its own tests and a version bump (docs-only commits skip it). A PR is one plan task or a few tightly related commits, small enough to revert alone.
- **Keeping up with `dev`:** if `dev` moves, merge `origin/dev` into the milestone branch (no rebase, no force push on shared branches).
- **The end:** one PR `milestone/multi-store-install` → `dev`, squash-merged, so the whole project is a single commit on `dev` and `git revert <that commit>` undoes the code in one step. Reverting code does not revert store data (the namespace move wrote to the new namespace) or a deployed extension; the revert note in the PR lists: redeploy the old extension, re-save discounts.
- **Suggested slicing (the plan decides):** proof step and results; names module and drift test; namespace move for the writers; namespace move for the Functions, Liquid and definitions; removals (fallback, `productHandle`, script); shop from the token (`idToken`, proxy); `getAccessToken` and `shopifyQuery` and the three links; webhooks shop from the body; `ensureTierDiscount`; isolation tests; the final milestone PR.

## Rollout (all steps are the user's actions)

1. Deploy the extension from the milestone branch first (`shopify app deploy --config shopify.app.dev.toml`; the Mac SDK note in that file's header applies). The new Liquid and Functions read the new names; the new admin writes them.
   Between steps 1 and 3 the widget and checkout discounts on the dev stores read nothing, because the new names are empty until the admin writes them; this is accepted dev behaviour (no fallbacks, per the user).
2. The owner deploys the admin from the milestone branch to the dev Vercel project (for example by pointing that project at the milestone branch for the test; I do not deploy) to live-test before merging.
3. Re-save every dev discount; check the widget, a checkout, and the time-based discounts on the first dev store; repeat the install and the isolation checks on the second dev store.
4. Merge the milestone PR into `dev` (squash). Remove `SHOPIFY_SHOP` from the dev Vercel project.
5. Do not merge `dev` into `main` before the production login migration (unchanged rule).

## Constraints

Never commit to `main`; check a PR's state before pushing to its branch; pure functions with values passed in as arguments; no hardcoded colours; `source ~/.nvm/nvm.sh && nvm use 22.23.3` in each shell; vitest one process at a time and `beforeEach` with block bodies; commit messages carry no AI attribution (no Co-Authored-By trailer, no "generated by" line; the owner's global rule); merging and deploying are the owner's actions; never touch production data; secrets are never printed.

## Left to the builder

The mechanism for 5.3 within the stated requirement; file and function names; how the two-store script is organised; the order of PRs inside the slicing; whether a sub-namespace works or the bare-`$app` fallback is used (decided by the proof step).

## Risks

| Risk | Cost | Mitigation |
|---|---|---|
| Liquid or a Function cannot read the app-owned data | the widget or checkout discount blanks | the proof step runs first; the fallback keys are one module change |
| Reading the shop from a header in one helper is bypassed by a new call path | a request uses the wrong shop or none | the helper throws without a shop; the drift test forbids `SHOPIFY_SHOP`; isolation tests |
| `ensureTierDiscount` creates two discounts | a customer's discount stacks or double-applies | requirement of 5.3 and its concurrency test |
| Shopify does not remove the app's discounts on uninstall | leftover discounts in a store | measured in the proof step; owner decides |
| The milestone grows large and diverges from `dev` | a hard final merge | small PRs, regular merges of `dev` into the milestone |

## Proof results (2026-10-17)

Run on the dev app `demo` (extension version `demo-8` built from a throwaway spike branch, never merged) and on two dev stores in its organization: `demo-nlmhyat3` and `demo2-vohii5ln`. The owner deployed; everything below was read from storefront output, a cart, Shopify API answers or Vercel runtime logs. All throwaway data was deleted afterwards.

**E1, Liquid reads app-owned data: passes.** `product.metafields['$app:smooth_discount'].<key>.value` returns a json value and resolves a `list.product_reference` list (title and url) with **no metafield definition**. The resolved name `product.metafields['app--431782264833--smooth_discount']` gives the same data. The bare `$app` namespace with a TOML definition (`access.storefront = "public_read"`) also works, including a referenced product's image. `product.metafields.app.<key>` returns nothing (that syntax is not usable). So Task 4 uses the first form, adds no definitions, and does not need the bare-`$app` fallback. Not printed for the first form: a referenced product's image (it is the same resolved object as in the bare-`$app` test; the live check covers it).

**E2, the Functions read app-owned data: passes.** With both Function queries reading `$app:smooth_discount`: the time-based Function applied "50% off" from a discount metafield written in that namespace (The Collection Snowboard: Liquid, $749.95 to $374.98); the tier Function applied 30% off on three member lines from `tier_config` in that namespace (Complete Snowboard 2.0 Powder $699.95 to $489.97, Multi-location Snowboard $729.95 to $510.97, Oxygen $1,025.00 to $717.50; the spike's Function reads no other namespace). Shopify's discount-creation API also accepts `$app:smooth_discount` for a discount's metafield input. Observation (inference, not a change): in the last cart the time-based 50% line lost its discount once the tier discount applied; both discounts are created without `combinesWith`, so by default they do not combine and Shopify applied the larger one. That matches the existing behaviour of the old script and is out of scope here.

**E3, the one-discount guard and lookup: passes.** Five concurrent `metafieldsSet` calls with `compareDigest: null` on an app-installation metafield produced exactly one winner (the other four got `STALE_OBJECT`); the app can write installation metafields with its own token and no extra scope. `shopifyFunctions` returns each Function's handle and id (`product-discount` 01a10d1e-07d7-711d-b340-fbbc5a945e18, `time-based-discount` 01a10d1e-07d7-7255-b363-08eef4b74208 on the dev app); `discountNodes(query: "type:app")` exposes `appDiscountType.functionId` for app discounts, in any state (a scheduled one was found). **Correction (Task 9, 2026-10-18):** this originally said `automaticDiscountNodes`; probing the dev store showed that query lists only Shopify's own automatic discounts (Basic, Bxgy) and never app discounts, so the lookup uses `discountNodes`. Discount creation by `functionHandle` works at Admin API 2025-10 and 2026-10.

**E4, webhook payloads: partly proven.** A real `app/uninstalled` delivery (demo2, logged by key names only) is the shop resource: its top-level keys include `id`, `name`, `domain`, `myshopify_domain`, `email`, `timezone`, `plan_name` and others. So the shop's domain comes from the body field `myshopify_domain`. The field's value was deliberately not logged, so it is not yet proven non-null; Task 8 treats a missing or null `myshopify_domain` as `no-shop` (answer 400, logged), and the live test in Task 11 repeats the uninstall to confirm. `app/scopes_update` and `shop/redact` were not delivered; per Shopify's docs the scopes payload identifies the shop by `shop_id` (a GID, not a domain), so the shop for that topic can only come from the header (the spec's rule: ignore the body's scope list and re-read the scopes from Shopify), and the compliance payloads carry `shop_domain` (to be checked against a sample in Task 8).

**E5, uninstall: observed.** On demo2 the owner uninstalled and then reinstalled the app. Shopify's own uninstall dialog says "any data managed by the app, such as discounts, will be deleted." Observed after the reinstall: (1) the tier discount the app had created was gone; (2) an app-owned shop metafield (`$app:smooth_discount.proof_retain`) was still readable, which matches the docs (values are retained temporarily, cleanup is asynchronous, no guaranteed timing); (3) the installation-scoped metafield was gone (a new installation id); (4) a token obtained before the uninstall returned HTTP 401 (checked after the reinstall, so it cannot be told whether it died at the uninstall or at the reinstall). Because the webhook handler had no stored session for that store, whether a token still works inside the `app/uninstalled` webhook was not measured; the app should assume it does not. Consequence for the rule "delete all data on uninstall": our database rows are deleted by the app (existing), Shopify deletes the app's discounts, and Shopify removes app-owned metafields asynchronously; the app cannot speed that up. **Open decision for the owner:** accept Shopify's asynchronous cleanup as meeting "delete all data" (the only mechanism available), or require something more.

## Build results (2026-10-18)

Everything below was done on `milestone/multi-store-install` through PRs into it (names module #55, writers #56, readers #57, removals #58, login any store #59, shop from the request #60, webhooks bind to the signed shop #61, tier discount per store #62, isolation check #63, final-review fix #64, uninstall experiment #65 and its revert #66, fresh-install cleanup #67). The versions run 0.23.15 to 0.23.27 (`dev` stands at 0.23.14; the squash merge keeps the higher).

**Verified live on the two dev stores (read from the Admin API, the storefront, or Vercel runtime logs):**
- Writers and readers: settings, per-product data and sibling lists are written to `$app:smooth_discount` and nothing to the old namespaces; the tier widget renders from them (promo text, tier options, mix-and-match sibling with image, title, link and cart count).
- Login for any store and the shop from the request: both stores open the app; the isolation check (`npm run check:isolation`, PR #63) ran `ensureTierDiscount` four times at once on two stores with 0 violations, each store ended with exactly one tier discount, and one store saw one creation and one "exists" from two simultaneous calls.
- Webhooks: a real `app/uninstalled` delivery carries a usable `myshopify_domain` (accepted after the signed-body check) on each of four deliveries on `demo-nlmhyat3` (18 Oct, 20:43, 20:45, 20:59 and 21:11 UTC; the log line is written after the signed-body check passed).
- Uninstall: see 5.5. The fresh-install cleanup was tested by the owner on `demo-nlmhyat3` and confirmed through the Admin API: marker written on the new installation, `tier_config` and `time_config` gone, a fresh tier discount present.

**Corrections to what this spec first said:**
- `automaticDiscountNodes` lists only Shopify's own automatic discounts; app discounts are found with `discountNodes(query: "type:app")` (corrected in 5.3's proof text, PR #62). Measured: a just-created app discount appears there at once (8 of 8), deactivated and already-ended ones are listed as EXPIRED, and Shopify refuses a second automatic discount with the same title.
- The webhook topic header is as unsigned as the shop header. Each endpoint now states its own topics and answers 400 for others (found by the final review, PR #64). The compliance endpoint therefore answers 400 to a topic other than `customers/data_request`, `customers/redact` and `shop/redact`.

**Final review** (a fresh reviewer, 0 Critical, 2 Important, 6 Minor): the webhook topic hole was fixed; the "duplicate tier discount if the lookup lags" finding was re-graded to Minor after the measurements above. Deferred Minors: `getAccessToken` would reuse the request's ID token for a different explicit shop (no caller does); the live isolation check proves Shopify's separation rather than the app's own routing and its shared-discount-id check is vacuous; no unit test interleaves two token refreshes for different shops; local `next dev` cannot reach any store; `app/scopes_update` needs a working token and answers 500 for retry otherwise; the home page makes two or more sequential reads before rendering.

**Not verified:**
- A tier discount applying in a cart with the milestone's own code and a freshly created checkout discount (the spike proved the Function reads the new namespace; the owner's checkout check after the final deploy is part of the rollout).
- The time-based discount in a cart and its storefront widget on the milestone code (the test discount was deleted before it started).
- `shop/redact` carrying `shop_domain` (taken from Shopify's docs; if the real field differs the delivery is answered 400 and nothing is deleted); Shopify's treatment of repeated 400 or 500 answers from the webhook endpoints.
- The production app shares these extensions: nothing guards the production app against switching to the new namespace except the rule "do not merge `dev` into `main` before the production login migration".

**Other notes:** four lint errors exist in files this project did not touch (two unescaped quotes in the discount pages, the setState in an effect in `PricingModeTierFields.tsx`; the App Bridge script rule in `layout.tsx` is now marked intentional). `docs/cart-tier-nudge-snippet.md` still reads the old `sparkly_product_discounts` namespace and would not work after this ships.
