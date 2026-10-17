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
- The milestone is live-tested on the dev app by deploying the milestone branch to the dev Vercel project through the Vercel connector, with the owner's yes for each deploy.

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

- Our database: the `app/uninstalled` webhook deletes that shop's sessions (exists); `shop/redact` does the same and nothing else is stored (exists). Both must act only on the shop proven by 5.2.
- The store's data: after the move, Shopify removes the app-owned metafields itself, asynchronously and with no guaranteed timing. The app does not try to delete them after uninstall (its token is believed revoked).
- The app's automatic discounts: what Shopify does with them on uninstall is unknown. The proof step uninstalls the dev app from a dev store and records the result; if they are left behind, the user decides what to do (the design does not assume an answer).
- Acceptance: after uninstalling from a dev store, the proof run lists what remains (sessions, `app--431782264833--smooth_discount` metafields, app discounts) and the spec's rollout notes record the result as the documented behaviour.

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
2. Deploy the admin from the milestone branch to the dev Vercel project (through the Vercel connector, with the owner's yes) to live-test before merging.
3. Re-save every dev discount; check the widget, a checkout, and the time-based discounts on the first dev store; repeat the install and the isolation checks on the second dev store.
4. Merge the milestone PR into `dev` (squash). Remove `SHOPIFY_SHOP` from the dev Vercel project.
5. Do not merge `dev` into `main` before the production login migration (unchanged rule).

## Constraints

Never commit to `main`; check a PR's state before pushing to its branch; pure functions with values passed in as arguments; no hardcoded colours; `source ~/.nvm/nvm.sh && nvm use 22.23.3` in each shell; vitest one process at a time and `beforeEach` with block bodies; commit messages end with the Co-Authored-By line; merging and deploying are the owner's actions; never touch production data; secrets are never printed.

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
