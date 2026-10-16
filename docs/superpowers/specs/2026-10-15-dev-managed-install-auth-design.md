# Dev admin login: managed install and token exchange — design

**Date:** 2026-10-15
**Status:** awaiting review
**Branch:** `feat/dev-managed-install-auth` (from `origin/dev`, with `origin/main` merged in)
**Scope:** the **dev** admin only: the dev branch, the dev Vercel project
(`sparkly-tails-product-discounts-nyqb`) and the dev app (`demo`, client ID
`f707124c97ab92f1fc7dd99b1a01c8e1`). Production (`main`, the production Vercel
project, `st-product-discounts`, the real store) is not touched.

## Goal

Replace the hand-copied `SHOPIFY_ACCESS_TOKEN` environment variable and the
legacy OAuth install with the flow in the `shopify-app-auth` skill: Shopify
managed installation, App Bridge ID tokens, token exchange for an expiring
offline access token plus a refresh token, and sessions stored in Postgres.

## What the user asked for / decided

- Remove "all this auth token approach" using the `shopify-app-auth` skill; **only
  for the dev code**.
- Keep Next.js (not a port to React Router): use the skill's flow and database
  design, implemented with `@shopify/shopify-api` inside Next.js.
- Sessions in **Supabase Postgres through Prisma**, as the skill does.
- Do not shortcut: build this properly before doing the live-sibling-data gate.
- Merging and deploying are the user's actions.

## Current state

- `shopify.app.dev.toml` (on `main` via #39) uses the legacy install flow
  (`use_legacy_install_flow = true`); install redirects to the Vercel app, which
  checks a query HMAC and then runs OAuth (`src/app/api/auth/{start,callback}`).
  The callback prints the token to the server log and the user copies it into
  `SHOPIFY_ACCESS_TOKEN` by hand.
- `src/proxy.ts` skips OAuth whenever `SHOPIFY_ACCESS_TOKEN` is set, and carries an
  `stt` URL token (`src/lib/{shopify-auth,auth-token,auth-redirect}.ts`,
  `AuthTokenInit`, `AuthLink` on four pages, `redirectWithToken` in two action
  files).
- `src/lib/shopify-client.ts` reads `SHOPIFY_SHOP` and `SHOPIFY_ACCESS_TOKEN` from the
  environment; `SHOPIFY_SHOP` is also read for the admin product links (two pages and
  `timeDiscounts/shopifyRecord.ts`), in the proxy and in `redirectWithToken`.
- `src/app/layout.tsx` already loads App Bridge as the first script tag and sets
  the `shopify-api-key` meta tag.

## Design

### 1. Install and app configuration (`shopify.app.dev.toml`)

Managed installation: scopes in `[access_scopes]` (the existing four), **no**
`use_legacy_install_flow`; `[webhooks] api_version = "2026-10"` with subscriptions
`app/uninstalled` (`/webhooks/app/uninstalled`), `app/scopes_update`
(`/webhooks/app/scopes_update`) and the compliance topics `customers/data_request`,
`customers/redact`, `shop/redact` (`/webhooks/compliance`); `[auth] redirect_urls`
kept as required config (`https://sparkly-tails-product-discounts-nyq.vercel.app/api/auth`);
`automatically_update_urls_on_dev = false`. Installing sends the merchant to
`application_url` with `shop`, `host`, `hmac` and `id_token`; no redirect through
the app's callback.

### 2. ID-token verification in `src/proxy.ts`

A pure function `verifyIdToken(token, { secret, apiKey, shop, now })` (Web Crypto,
HS256) checks the signature, `exp` and `nbf` (with a small clock skew), `aud` equal
to the client ID, and that `dest` is the configured `SHOPIFY_SHOP` (single shop for
now: a token for any other shop is refused with a clear message).

- Token source: the `Authorization: Bearer` header (App Bridge adds it to every
  fetch, which covers Next's client navigation and server actions), otherwise the
  `id_token` query parameter (document loads from the admin).
- On success the proxy forwards the raw token in a request header
  (`x-shopify-id-token`) and the verified shop in `x-shopify-shop`.
- A **document request** without a valid token but with `shop` and `host` gets a
  small bounce page that loads App Bridge, obtains a fresh ID token and reloads the
  same URL with `id_token` (this is what the React Router package does; it covers
  an expired `id_token` in the URL after a reload). A request with neither gets the
  existing "Open this app from your Shopify admin" page (403).
- Exempt from the check: `/_next/*`, static files, `/webhooks/*` (they verify a
  webhook HMAC instead).

### 3. Access token: `getAccessToken()` (server only, Node)

Loads the offline session for `SHOPIFY_SHOP` from Postgres and decides, through a
pure function `decideSessionAction({ session, idToken, now })`:

| State | Action |
|---|---|
| session exists and its token has not expired (a small margin before `expires`) | use it |
| expired, refresh token present and not expired | refresh with the refresh token, store the rotated pair |
| no usable session and an ID token is on the request | exchange the ID token for an expiring offline token plus a refresh token, store both |
| none of the above | throw "open the app from Shopify admin" |

A refresh that fails (another request may have rotated the refresh token first)
reloads the stored session once before falling back to the exchange. `shopifyQuery`
calls `getAccessToken()` and `SHOPIFY_ACCESS_TOKEN` is deleted. `SHOPIFY_SHOP` stays
as the allowed shop; its other reads (admin product links, the proxy) stay for now.

### 4. Session storage

Prisma with the skill's `Session` model (including `refreshToken` and
`refreshTokenExpires`) and migration, `@shopify/shopify-app-session-storage-prisma`
as the storage, `prisma/schema.prisma` provider `postgresql` with `DATABASE_URL`
(pooler, port 6543, `?pgbouncer=true`) and `DIRECT_URL` (port 5432, migrations
only). The migration ends with `ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;`
and **no policies** (Supabase exposes `public` tables over its REST API and this
table holds tokens). The Prisma client appends `connection_limit=1&pool_timeout=20`
(skill's `db.server.ts`); `postinstall` runs `prisma generate`; `prisma` is a dev
dependency.

### 5. Webhooks (`src/app/webhooks/...`, route handlers)

A pure function verifies `X-Shopify-Hmac-Sha256` (base64 HMAC-SHA256 of the raw
body with the client secret, constant-time compare). Bad or missing signature: 401.

- `app/uninstalled`: delete the shop's sessions.
- `app/scopes_update`: update the stored scope.
- `compliance` (all three topics, by `X-Shopify-Topic`): `customers/data_request` and
  `customers/redact` only acknowledge (no customer data is stored); `shop/redact`
  deletes the shop's sessions. Payloads are never logged (they hold customer
  contact data). Respond within Shopify's 5 second limit.

### 6. Removals

`src/app/api/auth/start/route.ts`, `src/app/api/auth/callback/route.ts`,
`src/components/AuthLink.tsx`, `src/components/AuthTokenInit.tsx`,
`src/lib/auth-token.ts` (+ its test), `src/lib/auth-redirect.ts`, the `stt` logic in
`proxy.ts`, `makeSessionToken` / `verifyUrlToken` in `shopify-auth.ts`, the
`x-auth-token` handling in `layout.tsx`, the `next/link` restriction in
`eslint.config.mjs`, and every use of them: `AuthLink` → plain `next/link` on four
pages, `redirectWithToken` → `redirect` in `discountActions.ts` and
`timeDiscounts/actions.ts` (tests updated). Existing tests for these files are
removed or rewritten, not skipped.

### 7. Environment

Dev Vercel project keeps `SHOPIFY_API_SECRET_KEY`, `NEXT_PUBLIC_SHOPIFY_API_KEY`,
`SHOPIFY_SHOP`; adds `DATABASE_URL` and `DIRECT_URL` (secrets, set by the user);
never has `SHOPIFY_ACCESS_TOKEN`. `@shopify/shopify-api` is added (Node adapter).

## Rollout (all steps are the user's actions)

1. Create a dev Supabase project; put `DATABASE_URL` and `DIRECT_URL` in a
   git-ignored `.env` and in the dev Vercel project (never in chat).
2. `npx prisma migrate deploy` (applies the table with row-level security).
3. Merge the PR into `dev` (the dev Vercel project builds it).
4. `shopify app deploy --config shopify.app.dev.toml` with
   `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`; check
   `shopify app versions list --config shopify.app.dev.toml` shows the new version
   active.
5. Install `demo` on `demo-nlmhyat3` (Dev Dashboard, organization
   `SINGLETON_ORG…`), open it from Apps.
6. Verify (below).

## Verification (dev)

Skill scripts: `session-row.cjs` (token fingerprints, expiry, scope),
`rls-leak-test.cjs` (expect "row not readable"), `send-compliance-webhook.sh`
(200 for a valid signature, 401 for a bad one). The Auth check from the skill, on
the pages here: first load stores a session; a second load reuses it; forcing the
stored expiry into the past makes the next load run the exchange, and a signed
webhook run the refresh path; the uninstall webhook empties the table. The existing
tier and time-discount screens load and save after the change. No secret is ever
printed: compare by length and sha256 prefix.

## Assumptions to prove first (on the dev store, before building on them)

1. The installed `@shopify/shopify-api` version has the token exchange and refresh
   calls for expiring offline tokens and works under Next.js 16 (Node runtime).
2. App Bridge adds the ID token to Next's client-navigation and server-action
   requests, so the `Authorization` header is present.
3. The bounce page yields a fresh token after an expired `id_token` in the URL.
4. `@shopify/shopify-app-session-storage-prisma` works with `@shopify/shopify-api`
   `Session` outside the React Router package.
5. Prisma generates and the app builds on the dev Vercel project; a cold webhook
   answers in under about 5 seconds.

If assumption 2 fails, server actions need the token passed explicitly (a header
set by a small client wrapper) and the design changes there only.

## Testing

Vitest, TDD: pure functions (`verifyIdToken`, `decideSessionAction`, webhook HMAC
check, token-source choice); `getAccessToken` with storage and `shopify-api`
mocked (each branch of the table, refresh race); `shopifyQuery` uses the token; the
webhook routes with Prisma mocked (uninstall, scopes update, each compliance topic,
bad signature); the proxy (valid token, expired token on a document load → bounce,
wrong shop, no token, exempt paths). `tsc`, eslint on touched code,
`next build --webpack`, the whole suite.

## Out of scope

Production migration; multi-shop (the shop taken from each ID token, tokens per
shop for every request) — the public-launch step; online tokens; billing; the App
Store review; the on-hold `$app:smooth_discount` metafield move (its "which app
owns the token" assumption is answered by the exchange: the dev app owns it).

## Relation to other work

The live-sibling-data gate and Tasks 2–4 follow this: they use the dev admin and
the dev token. Delivery: version bump to 0.23.0 in each code commit; PRs into
`dev`; a non-author reviews; nothing is merged or deployed by me.

## Risks

| Risk | Cost | Mitigation |
|---|---|---|
| App Bridge does not add the token to Next requests | server actions fail with 403 | assumption 2 proved first; explicit-header fallback |
| Refresh-token rotation race | one request falls back to the exchange | reload-then-exchange rule; tested |
| Tokens readable through Supabase's REST API | token leak | row-level security with no policies; leak test in verification |
| Cold-start webhook over 5 s | Shopify retries then disables the subscription | `connection_limit=1`; timing check |
| Secret printed in logs or chat | credential leak | compare by length and sha256 prefix only |
