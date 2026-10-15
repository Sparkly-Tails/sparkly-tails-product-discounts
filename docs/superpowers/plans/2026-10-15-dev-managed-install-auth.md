# Dev Admin Login (Managed Install and Token Exchange) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-copied `SHOPIFY_ACCESS_TOKEN` and the legacy OAuth install in the **dev** admin with Shopify managed installation, App Bridge ID tokens, token exchange for an expiring offline token plus refresh token, and sessions in Supabase Postgres through Prisma.

**Architecture:** `proxy.ts` verifies the App Bridge ID token with a pure Web Crypto function and forwards it in a request header (or serves a small bounce page that fetches a fresh token). A server-side `getAccessToken()` decides, with a pure function, whether to use the stored token, refresh it, or exchange the ID token, using `@shopify/shopify-api` and `PrismaSessionStorage`. Webhooks are Next route handlers that check the base64 HMAC. The old URL-token plumbing is removed after a live checkpoint on the dev store.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), TypeScript, vitest, `@shopify/shopify-api` 15.0.1, `@shopify/shopify-app-session-storage-prisma` 11.0.1, Prisma 6.19.3 (`@prisma/client`), Supabase Postgres, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-15-dev-managed-install-auth-design.md`

## Global Constraints

- Work in the worktree `.claude/worktrees/dev-auth` on branch `feat/dev-managed-install-auth`. Never commit to `main` or `dev` directly.
- Before every push: `gh pr list --head feat/dev-managed-install-auth --state all --json number,state,baseRefName`. If a PR for this branch is already merged, cut a new branch from `origin/dev` and open a new PR.
- **Dev only.** Production (`main`, the production Vercel project, `st-product-discounts`, the real store) is never touched. Never run any command against production data. The dev app is `demo` (client ID `f707124c97ab92f1fc7dd99b1a01c8e1`, organization `SINGLETON_ORG…`), the dev store is `demo-nlmhyat3`, the dev Vercel project is `sparkly-tails-product-discounts-nyqb` (address `https://sparkly-tails-product-discounts-nyq.vercel.app`).
- Every code commit bumps the version in `package.json` and the two top fields of `package-lock.json` with `npm version <v> --no-git-tag-version` (docs-only commits skip it). Versions: Task 1 `0.23.0`, Task 2 `0.23.1`, Task 3 `0.23.2`, Task 4 `0.23.3`, Task 5 `0.23.4`, Task 6 `0.23.5`, Task 7 `0.23.6`. If a merge conflicts on the version line, keep the higher one.
- Pure functions: pass values in as arguments; never close over outer-scope state. No hardcoded colours.
- Each shell: `source ~/.nvm/nvm.sh && nvm use 22.23.3`. Run vitest as the only vitest process. In vitest `beforeEach`, use block bodies: `beforeEach(() => { ... })`. A `vi.mock` automock keeps call counts across tests (`vi.restoreAllMocks` does not reset it): clear it in `beforeEach` with `vi.mocked(fn).mockClear()`.
- This branch adds dependencies: install with a **real** `node_modules` in this worktree (`npm ci`), never a symlink to another checkout's `node_modules`.
- **Never print, log or paste secrets** (`SHOPIFY_API_SECRET_KEY`, `DATABASE_URL`, `DIRECT_URL`, access or refresh tokens). Compare by length and sha256 prefix only. Add `.env` to `.gitignore`; never commit it.
- Merging, `prisma migrate deploy` against the dev database, `shopify app deploy`, and creating the Supabase project are the **user's** actions. The controller may push the branch and open PRs into `dev`; it may create a Vercel deployment of `dev` only after the user says yes for that deployment.
- `shopify app deploy` for the dev app: `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk shopify app deploy --config shopify.app.dev.toml` (the default SDK on this Mac is broken). Always pass `--config`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An ID token for a different shop** is refused with 403 ("not set up for this store"), never used. Pinned in Task 2 (`verifyIdToken` reason `shop`) and Task 4 (proxy decision).
2. **An expired `id_token` in the URL on a page reload** bounces once through App Bridge and never loops: after one bounce a still-invalid token gives 403. Pinned in Task 4.
3. **A client-sent `x-shopify-id-token` or `x-shopify-shop` request header** is stripped before the proxy decides, so only a verified token can reach `getAccessToken`. Pinned in Task 4 (`forwardHeaders`).
4. **Two requests refreshing at once** (the refresh token rotates): the loser reloads the stored session once, then falls back to the exchange; it never throws while a usable session exists. Pinned in Task 3.
5. **A tampered webhook body, a missing signature, or an empty client secret** gives 401 (or 503 for no secret) and no database write; an empty secret must never be accepted as an HMAC key. Pinned in Task 2 and Task 5.

---

### Task 1: Dependencies, Prisma, database client, lazy shopify-api instance

**Files:**
- Modify: `package.json`, `package-lock.json`, `.gitignore`
- Create: `prisma/schema.prisma`, `prisma/migrations/20261015000000_init_postgres/migration.sql`, `prisma/migrations/migration_lock.toml`
- Create: `src/lib/db.ts`, `src/lib/shopifyApp.ts`
- Test: `tests/lib/db.test.ts`, `tests/lib/shopifyApp.test.ts`

**Interfaces:**
- Produces: `withPoolParams(url: string): string`; `getDb(): PrismaClient` (lazy singleton); `getShopify()` (lazy `shopifyApi` instance with `auth.tokenExchange`, `auth.refreshToken`, `session.getOfflineId`); `getSessionStorage(): PrismaSessionStorage<PrismaClient>` (lazy).

- [ ] **Step 0: Real install in this worktree**

```bash
cd /Users/rubencamposdeteba/Documents/sparkly-tails-product-discounts/.claude/worktrees/dev-auth
source ~/.nvm/nvm.sh && nvm use 22.23.3
test -L node_modules && rm node_modules
npm ci
git status --short   # expected: nothing (node_modules is ignored)
```

- [ ] **Step 1: Add the dependencies and the Prisma files**

```bash
npm install --save-exact @shopify/shopify-api@15.0.1 @shopify/shopify-app-session-storage-prisma@11.0.1 @prisma/client@6.19.3
npm install --save-dev --save-exact prisma@6.19.3
mkdir -p prisma/migrations/20261015000000_init_postgres
cp ~/.claude/skills/shopify-app-auth/code/prisma/schema.prisma prisma/schema.prisma
cp ~/.claude/skills/shopify-app-auth/code/prisma/migrations/20261015000000_init_postgres/migration.sql prisma/migrations/20261015000000_init_postgres/migration.sql
cp ~/.claude/skills/shopify-app-auth/code/prisma/migrations/migration_lock.toml prisma/migrations/migration_lock.toml
python3 - <<'EOF'
import json
p = json.load(open('package.json'))
p['scripts']['postinstall'] = 'prisma generate'
json.dump(p, open('package.json', 'w'), indent=2)
open('package.json', 'a').write('\n')
EOF
printf '\n# Local environment (database URLs, secrets)\n.env\n' >> .gitignore
npx prisma validate
```

Expected: `prisma validate` prints "The schema at prisma/schema.prisma is valid" (it needs no database). The migration ends with `ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;` and no policies; leave it exactly as copied.

- [ ] **Step 2: Write the failing tests**

`tests/lib/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { withPoolParams } from '@/lib/db'

describe('withPoolParams', () => {
  it('adds both pool parameters to a URL that has no query string', () => {
    expect(withPoolParams('postgresql://u:p@host:6543/postgres')).toBe(
      'postgresql://u:p@host:6543/postgres?connection_limit=1&pool_timeout=20',
    )
  })

  it('appends with & when the URL already has a query string', () => {
    expect(withPoolParams('postgresql://u:p@host:6543/postgres?pgbouncer=true')).toBe(
      'postgresql://u:p@host:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20',
    )
  })

  it('keeps a parameter that is already present and adds only the missing one', () => {
    expect(withPoolParams('postgresql://h/db?connection_limit=3')).toBe('postgresql://h/db?connection_limit=3&pool_timeout=20')
    expect(withPoolParams('postgresql://h/db?pool_timeout=5')).toBe('postgresql://h/db?pool_timeout=5&connection_limit=1')
  })

  it('returns the URL unchanged when both parameters are present', () => {
    const url = 'postgresql://h/db?connection_limit=2&pool_timeout=9'
    expect(withPoolParams(url)).toBe(url)
  })
})
```

`tests/lib/shopifyApp.test.ts` (proves the library loads under Node and exposes the calls the plan relies on):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getShopify } from '@/lib/shopifyApp'

describe('getShopify', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = 'test-key'
    process.env.SHOPIFY_API_SECRET_KEY = 'test-secret'
  })

  it('exposes token exchange, refresh and offline ids', () => {
    const shopify = getShopify()
    expect(typeof shopify.auth.tokenExchange).toBe('function')
    expect(typeof shopify.auth.refreshToken).toBe('function')
    expect(shopify.session.getOfflineId('demo.myshopify.com')).toBe('offline_demo.myshopify.com')
  })

  it('returns the same instance every time', () => {
    expect(getShopify()).toBe(getShopify())
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

```bash
npx vitest run tests/lib/db.test.ts tests/lib/shopifyApp.test.ts
```

Expected: FAIL (modules do not exist).

- [ ] **Step 4: Write the implementation**

`src/lib/db.ts`:

```ts
import { PrismaClient } from '@prisma/client'

/**
 * Each serverless instance should hold one connection to the Supabase
 * transaction pooler: Prisma's default pool of 5 timed out at cold start and
 * pushed webhook answers past Shopify's 5 second limit. Parameters already in
 * the URL win.
 */
export function withPoolParams(url: string): string {
  const params: string[] = []
  if (!/[?&]connection_limit=/.test(url)) params.push('connection_limit=1')
  if (!/[?&]pool_timeout=/.test(url)) params.push('pool_timeout=20')
  if (params.length === 0) return url
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  return url ? new PrismaClient({ datasourceUrl: withPoolParams(url) }) : new PrismaClient()
}

/** Lazy, so importing this module (a build, a test) never opens a connection. Cached on globalThis so hot reloads and warm serverless instances reuse one client. */
export function getDb(): PrismaClient {
  return (globalThis.prismaGlobal ??= createClient())
}
```

`src/lib/shopifyApp.ts`:

```ts
import '@shopify/shopify-api/adapters/node'
import { ApiVersion, shopifyApi } from '@shopify/shopify-api'
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma'
import type { PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/db'

function createShopify() {
  return shopifyApi({
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET_KEY ?? '',
    // Used only to build OAuth redirect URLs; token exchange does not need it.
    hostName: process.env.VERCEL_URL ?? 'localhost',
    apiVersion: ApiVersion.October26,
    isEmbeddedApp: true,
  })
}

let shopifyInstance: ReturnType<typeof createShopify> | undefined
let storageInstance: PrismaSessionStorage<PrismaClient> | undefined

/** Lazy: the secret and key are read when first needed, not when the module loads (a build has none). */
export function getShopify() {
  return (shopifyInstance ??= createShopify())
}

export function getSessionStorage(): PrismaSessionStorage<PrismaClient> {
  return (storageInstance ??= new PrismaSessionStorage(getDb()))
}
```

- [ ] **Step 5: Run the tests, type-check and lint**

```bash
npx vitest run tests/lib/db.test.ts tests/lib/shopifyApp.test.ts
npx tsc --noEmit
npx eslint src/lib/db.ts src/lib/shopifyApp.ts tests/lib/db.test.ts tests/lib/shopifyApp.test.ts
```

Expected: PASS; tsc and eslint print nothing. (`tsc` compiling `shopifyApp.ts` is the proof that the installed library's signatures match: assumptions 1 and 4 at the type level.)

- [ ] **Step 6: Run the whole suite, bump the version, commit**

```bash
npx vitest run
npm version 0.23.0 --no-git-tag-version
git add package.json package-lock.json .gitignore prisma src/lib/db.ts src/lib/shopifyApp.ts tests/lib/db.test.ts tests/lib/shopifyApp.test.ts
git commit -m "feat: add Prisma sessions and the shopify-api instance for the dev login

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure auth functions (ID token, token source, session decision, webhook HMAC)

**Files:**
- Create: `src/lib/idToken.ts`, `src/lib/tokenSource.ts`, `src/lib/sessionDecision.ts`, `src/lib/webhookHmac.ts`
- Test: `tests/lib/idToken.test.ts`, `tests/lib/tokenSource.test.ts`, `tests/lib/sessionDecision.test.ts`, `tests/lib/webhookHmac.test.ts`
- Modify: `package.json`, `package-lock.json` (version `0.23.1`)

**Interfaces:**
- Produces:
  - `verifyIdToken(token: string, options: { secret: string; apiKey: string; shop: string; now: number }): Promise<IdTokenResult>` where `now` is Unix seconds and `IdTokenResult = { ok: true; claims: IdTokenClaims; shop: string } | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'not-yet-valid' | 'audience' | 'shop' }`.
  - `pickIdToken(input: { authorization: string | null; idTokenParam: string | null }): string | null`.
  - `decideSessionAction(input: { session: StoredSession | undefined; idToken: string | null; now: number }): SessionAction` with `now` in milliseconds, `StoredSession = { accessToken: string; expires?: Date | null; refreshToken?: string | null; refreshTokenExpires?: Date | null }`, `SessionAction = { kind: 'use' | 'refresh' | 'exchange' | 'none' }`, and `EXPIRY_MARGIN_MS = 60_000`.
  - `verifyWebhookHmac(rawBody: string, header: string | null, secret: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/idToken.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyIdToken } from '@/lib/idToken'

const SECRET = 'client-secret'
const API_KEY = 'client-id'
const SHOP = 'demo.myshopify.com'
const NOW = 1_800_000_000

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function signToken(payload: Record<string, unknown>, secret = SECRET, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): string {
  const head = b64url(JSON.stringify(header))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

const claims = (over: Record<string, unknown> = {}) => ({
  iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY, sub: '1', exp: NOW + 60, nbf: NOW - 5, iat: NOW - 5, jti: 'j', sid: 's', ...over,
})
const opts = { secret: SECRET, apiKey: API_KEY, shop: SHOP, now: NOW }

describe('verifyIdToken', () => {
  it('accepts a correctly signed token for this app and shop', async () => {
    const result = await verifyIdToken(signToken(claims()), opts)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.shop).toBe(SHOP)
  })

  it('rejects a token signed with a different secret', async () => {
    expect(await verifyIdToken(signToken(claims(), 'other-secret'), opts)).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects a tampered payload', async () => {
    const [h, , s] = signToken(claims()).split('.')
    const forged = `${h}.${b64url(JSON.stringify(claims({ dest: 'https://evil.myshopify.com' })))}.${s}`
    expect(await verifyIdToken(forged, opts)).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects anything that is not a three-part JWT, or not HS256', async () => {
    expect(await verifyIdToken('not-a-token', opts)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyIdToken('a.b', opts)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyIdToken(signToken(claims(), SECRET, { alg: 'none' }), opts)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyIdToken(`${b64url('{"alg":"HS256"}')}.${b64url('{}')}.@@@`, opts)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects an expired token, allowing a few seconds of clock skew', async () => {
    expect(await verifyIdToken(signToken(claims({ exp: NOW - 11 })), opts)).toEqual({ ok: false, reason: 'expired' })
    expect((await verifyIdToken(signToken(claims({ exp: NOW - 5 })), opts)).ok).toBe(true)
  })

  it('rejects a token that is not valid yet', async () => {
    expect(await verifyIdToken(signToken(claims({ nbf: NOW + 11 })), opts)).toEqual({ ok: false, reason: 'not-yet-valid' })
  })

  it('rejects a token meant for another app', async () => {
    expect(await verifyIdToken(signToken(claims({ aud: 'someone-else' })), opts)).toEqual({ ok: false, reason: 'audience' })
  })

  it('rejects a token for another shop, even when it is correctly signed', async () => {
    expect(await verifyIdToken(signToken(claims({ dest: 'https://other.myshopify.com' })), opts)).toEqual({ ok: false, reason: 'shop' })
  })

  it('never accepts a token when the secret is empty', async () => {
    expect(await verifyIdToken(signToken(claims(), ''), { ...opts, secret: '' })).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects claims whose exp or nbf are not numbers', async () => {
    expect(await verifyIdToken(signToken(claims({ exp: 'soon' })), opts)).toEqual({ ok: false, reason: 'malformed' })
  })
})
```

`tests/lib/tokenSource.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickIdToken } from '@/lib/tokenSource'

describe('pickIdToken', () => {
  it('prefers the Authorization header over the query parameter', () => {
    expect(pickIdToken({ authorization: 'Bearer header-token', idTokenParam: 'query-token' })).toBe('header-token')
  })

  it('falls back to the id_token query parameter', () => {
    expect(pickIdToken({ authorization: null, idTokenParam: 'query-token' })).toBe('query-token')
  })

  it('ignores an Authorization header that is not a Bearer token', () => {
    expect(pickIdToken({ authorization: 'Basic abc', idTokenParam: 'query-token' })).toBe('query-token')
    expect(pickIdToken({ authorization: 'Basic abc', idTokenParam: null })).toBeNull()
  })

  it('returns null when there is neither, or the parameter is empty', () => {
    expect(pickIdToken({ authorization: null, idTokenParam: null })).toBeNull()
    expect(pickIdToken({ authorization: null, idTokenParam: '' })).toBeNull()
  })
})
```

`tests/lib/sessionDecision.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideSessionAction, EXPIRY_MARGIN_MS } from '@/lib/sessionDecision'

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0)
const later = (ms: number) => new Date(NOW + ms)
const session = (over: Partial<{ accessToken: string; expires: Date | null; refreshToken: string | null; refreshTokenExpires: Date | null }> = {}) => ({
  accessToken: 'shpat_x', expires: later(3_600_000), refreshToken: 'rt', refreshTokenExpires: later(86_400_000), ...over,
})

describe('decideSessionAction', () => {
  it('uses a stored token that has not expired', () => {
    expect(decideSessionAction({ session: session(), idToken: null, now: NOW })).toEqual({ kind: 'use' })
  })

  it('uses a token that never expires (no expiry stored)', () => {
    expect(decideSessionAction({ session: session({ expires: null }), idToken: null, now: NOW })).toEqual({ kind: 'use' })
  })

  it('treats a token inside the safety margin as expired', () => {
    const nearlyExpired = session({ expires: later(EXPIRY_MARGIN_MS - 1) })
    expect(decideSessionAction({ session: nearlyExpired, idToken: null, now: NOW })).toEqual({ kind: 'refresh' })
  })

  it('refreshes an expired token when the refresh token is still valid', () => {
    expect(decideSessionAction({ session: session({ expires: later(-1000) }), idToken: 'jwt', now: NOW })).toEqual({ kind: 'refresh' })
  })

  it('refreshes when the refresh token has no stored expiry', () => {
    expect(decideSessionAction({ session: session({ expires: later(-1000), refreshTokenExpires: null }), idToken: null, now: NOW })).toEqual({ kind: 'refresh' })
  })

  it('exchanges the ID token when the token and the refresh token are both expired', () => {
    const dead = session({ expires: later(-1000), refreshTokenExpires: later(-1000) })
    expect(decideSessionAction({ session: dead, idToken: 'jwt', now: NOW })).toEqual({ kind: 'exchange' })
  })

  it('exchanges the ID token when there is no refresh token', () => {
    expect(decideSessionAction({ session: session({ expires: later(-1000), refreshToken: null }), idToken: 'jwt', now: NOW })).toEqual({ kind: 'exchange' })
  })

  it('exchanges the ID token when there is no session at all', () => {
    expect(decideSessionAction({ session: undefined, idToken: 'jwt', now: NOW })).toEqual({ kind: 'exchange' })
  })

  it('gives up when there is no usable session and no ID token', () => {
    expect(decideSessionAction({ session: undefined, idToken: null, now: NOW })).toEqual({ kind: 'none' })
    expect(decideSessionAction({ session: session({ expires: later(-1000), refreshTokenExpires: later(-1000) }), idToken: null, now: NOW })).toEqual({ kind: 'none' })
  })
})
```

`tests/lib/webhookHmac.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyWebhookHmac } from '@/lib/webhookHmac'

const SECRET = 'client-secret'
const body = JSON.stringify({ shop_domain: 'demo.myshopify.com' })
const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw, 'utf8').digest('base64')

describe('verifyWebhookHmac', () => {
  it('accepts the correct signature', async () => {
    expect(await verifyWebhookHmac(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects a tampered body', async () => {
    expect(await verifyWebhookHmac(body + ' ', sign(body), SECRET)).toBe(false)
  })

  it('rejects a signature made with another secret', async () => {
    expect(await verifyWebhookHmac(body, sign(body, 'other'), SECRET)).toBe(false)
  })

  it('rejects a missing, empty or non-base64 signature', async () => {
    expect(await verifyWebhookHmac(body, null, SECRET)).toBe(false)
    expect(await verifyWebhookHmac(body, '', SECRET)).toBe(false)
    expect(await verifyWebhookHmac(body, '***', SECRET)).toBe(false)
  })

  it('never accepts anything when the secret is empty', async () => {
    expect(await verifyWebhookHmac(body, sign(body, ''), '')).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run tests/lib/idToken.test.ts tests/lib/tokenSource.test.ts tests/lib/sessionDecision.test.ts tests/lib/webhookHmac.test.ts
```

Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write the implementations**

`src/lib/idToken.ts`:

```ts
// Web Crypto only: safe to import from the proxy.

export interface IdTokenClaims {
  iss: string
  dest: string
  aud: string
  sub: string
  exp: number
  nbf: number
  iat: number
  jti: string
  sid: string
}

export type IdTokenResult =
  | { ok: true; claims: IdTokenClaims; shop: string }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'not-yet-valid' | 'audience' | 'shop' }

export interface IdTokenOptions {
  secret: string
  apiKey: string
  shop: string
  /** Unix time in seconds. */
  now: number
}

const CLOCK_SKEW_SECONDS = 10
const MALFORMED = { ok: false, reason: 'malformed' } as const

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function decodeJson(part: string): Record<string, unknown> | null {
  const bytes = base64UrlToBytes(part)
  if (!bytes) return null
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function verifyIdToken(token: string, options: IdTokenOptions): Promise<IdTokenResult> {
  const parts = token.split('.')
  if (parts.length !== 3) return MALFORMED
  const [headerPart, payloadPart, signaturePart] = parts

  const header = decodeJson(headerPart)
  const payload = decodeJson(payloadPart)
  const signature = base64UrlToBytes(signaturePart)
  if (!header || !payload || !signature || header.alg !== 'HS256') return MALFORMED

  // An empty key must never validate anything.
  if (!options.secret) return { ok: false, reason: 'signature' }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(options.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${headerPart}.${payloadPart}`))
  if (!valid) return { ok: false, reason: 'signature' }

  if (typeof payload.exp !== 'number' || typeof payload.nbf !== 'number') return MALFORMED
  if (payload.exp + CLOCK_SKEW_SECONDS < options.now) return { ok: false, reason: 'expired' }
  if (payload.nbf - CLOCK_SKEW_SECONDS > options.now) return { ok: false, reason: 'not-yet-valid' }
  if (payload.aud !== options.apiKey) return { ok: false, reason: 'audience' }

  let destHost: string
  try {
    destHost = new URL(String(payload.dest)).host
  } catch {
    return MALFORMED
  }
  if (destHost !== options.shop) return { ok: false, reason: 'shop' }

  return { ok: true, claims: payload as unknown as IdTokenClaims, shop: destHost }
}
```

`src/lib/tokenSource.ts`:

```ts
/** The App Bridge ID token: the Authorization header (fetches) first, else the `id_token` query parameter (page loads). */
export function pickIdToken(input: { authorization: string | null; idTokenParam: string | null }): string | null {
  const bearer = input.authorization?.match(/^Bearer\s+(\S+)$/i)
  if (bearer) return bearer[1]
  return input.idTokenParam || null
}
```

`src/lib/sessionDecision.ts`:

```ts
export interface StoredSession {
  accessToken: string
  expires?: Date | null
  refreshToken?: string | null
  refreshTokenExpires?: Date | null
}

export type SessionAction = { kind: 'use' } | { kind: 'refresh' } | { kind: 'exchange' } | { kind: 'none' }

/** A token this close to its expiry is treated as already expired. */
export const EXPIRY_MARGIN_MS = 60_000

/** What to do for a request: use the stored token, refresh it, exchange the ID token, or give up. `now` is in milliseconds. */
export function decideSessionAction(input: { session: StoredSession | undefined; idToken: string | null; now: number }): SessionAction {
  const { session, idToken, now } = input

  if (session && (!session.expires || session.expires.getTime() - EXPIRY_MARGIN_MS > now)) return { kind: 'use' }

  const refreshable = !!session?.refreshToken && (!session.refreshTokenExpires || session.refreshTokenExpires.getTime() > now)
  if (refreshable) return { kind: 'refresh' }

  if (idToken) return { kind: 'exchange' }
  return { kind: 'none' }
}
```

`src/lib/webhookHmac.ts`:

```ts
// Web Crypto only.

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/** Checks `X-Shopify-Hmac-Sha256`: base64 HMAC-SHA256 of the raw body with the client secret. An empty secret never validates. */
export async function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!secret || !header) return false
  const signature = base64ToBytes(header)
  if (!signature) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(rawBody))
}
```

- [ ] **Step 4: Run the tests, type-check and lint**

```bash
npx vitest run tests/lib/idToken.test.ts tests/lib/tokenSource.test.ts tests/lib/sessionDecision.test.ts tests/lib/webhookHmac.test.ts
npx tsc --noEmit
npx eslint src/lib/idToken.ts src/lib/tokenSource.ts src/lib/sessionDecision.ts src/lib/webhookHmac.ts tests/lib/idToken.test.ts tests/lib/tokenSource.test.ts tests/lib/sessionDecision.test.ts tests/lib/webhookHmac.test.ts
```

Expected: PASS; tsc and eslint print nothing. If `tsc` rejects `Uint8Array<ArrayBuffer>` as `BufferSource`, change the helper's return type to `Uint8Array` and cast at the call (`signature as BufferSource`); record it in the ledger.

- [ ] **Step 5: Whole suite, version, commit**

```bash
npx vitest run
npm version 0.23.1 --no-git-tag-version
git add src/lib/idToken.ts src/lib/tokenSource.ts src/lib/sessionDecision.ts src/lib/webhookHmac.ts tests/lib/idToken.test.ts tests/lib/tokenSource.test.ts tests/lib/sessionDecision.test.ts tests/lib/webhookHmac.test.ts package.json package-lock.json
git commit -m "feat: pure ID-token, session-decision and webhook signature checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `getAccessToken()` and `shopifyQuery`

**Files:**
- Create: `src/lib/accessToken.ts` (pure resolver), `src/lib/getAccessToken.ts` (server binding)
- Modify: `src/lib/shopify-client.ts`
- Test: `tests/lib/accessToken.test.ts`; modify `tests/lib/shopify-client.test.ts`
- Modify: `package.json`, `package-lock.json` (version `0.23.2`)

**Interfaces:**
- Consumes: `decideSessionAction`, `StoredSession` (Task 2); `getShopify`, `getSessionStorage` (Task 1).
- Produces: `resolveAccessToken<S extends StoredSession>(deps: AccessTokenDeps<S>): Promise<string>` and `NOT_AUTHENTICATED_MESSAGE`; `getAccessToken(): Promise<string>` (reads `x-shopify-id-token` from the request headers and `SHOPIFY_SHOP` from the environment).

- [ ] **Step 1: Write the failing tests**

`tests/lib/accessToken.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveAccessToken, NOT_AUTHENTICATED_MESSAGE } from '@/lib/accessToken'

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0)
const at = (ms: number) => new Date(NOW + ms)
type S = { accessToken: string; expires: Date | null; refreshToken: string | null; refreshTokenExpires: Date | null }
const fresh = (token = 'fresh'): S => ({ accessToken: token, expires: at(3_600_000), refreshToken: `${token}-rt`, refreshTokenExpires: at(86_400_000) })
const expiredWithRefresh = (): S => ({ accessToken: 'old', expires: at(-1000), refreshToken: 'old-rt', refreshTokenExpires: at(86_400_000) })

function deps(over: Partial<Parameters<typeof resolveAccessToken<S>>[0]> = {}) {
  return {
    shop: 'demo.myshopify.com',
    idToken: null as string | null,
    now: () => NOW,
    loadSession: vi.fn(async (): Promise<S | undefined> => undefined),
    exchange: vi.fn(async (): Promise<S> => fresh('exchanged')),
    refresh: vi.fn(async (): Promise<S> => fresh('refreshed')),
    store: vi.fn(async () => {}),
    ...over,
  }
}

describe('resolveAccessToken', () => {
  it('uses a valid stored token without calling Shopify or writing', async () => {
    const d = deps({ loadSession: vi.fn(async () => fresh('stored')) })
    expect(await resolveAccessToken(d)).toBe('stored')
    expect(d.exchange).not.toHaveBeenCalled()
    expect(d.refresh).not.toHaveBeenCalled()
    expect(d.store).not.toHaveBeenCalled()
  })

  it('refreshes an expired token and stores the rotated pair', async () => {
    const d = deps({ loadSession: vi.fn(async () => expiredWithRefresh()) })
    expect(await resolveAccessToken(d)).toBe('refreshed')
    expect(d.refresh).toHaveBeenCalledWith('old-rt')
    expect(d.store).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'refreshed' }))
  })

  it('exchanges the ID token when there is no session, and stores the result', async () => {
    const d = deps({ idToken: 'jwt' })
    expect(await resolveAccessToken(d)).toBe('exchanged')
    expect(d.exchange).toHaveBeenCalledWith('jwt')
    expect(d.store).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'exchanged' }))
  })

  it('throws a clear error when there is no usable session and no ID token', async () => {
    await expect(resolveAccessToken(deps())).rejects.toThrow(NOT_AUTHENTICATED_MESSAGE)
  })

  it('when a refresh fails because another request rotated the pair first, uses the pair that request stored', async () => {
    const load = vi.fn<() => Promise<S | undefined>>()
    load.mockResolvedValueOnce(expiredWithRefresh()).mockResolvedValueOnce(fresh('stored-by-other'))
    const d = deps({ loadSession: load, refresh: vi.fn(async () => { throw new Error('invalid_grant') }) })
    expect(await resolveAccessToken(d)).toBe('stored-by-other')
    expect(d.exchange).not.toHaveBeenCalled()
  })

  it('when a refresh fails and nothing usable was stored, falls back to the ID token exchange', async () => {
    const d = deps({
      idToken: 'jwt',
      loadSession: vi.fn(async () => expiredWithRefresh()),
      refresh: vi.fn(async () => { throw new Error('invalid_grant') }),
    })
    expect(await resolveAccessToken(d)).toBe('exchanged')
    expect(d.exchange).toHaveBeenCalledWith('jwt')
  })

  it('when a refresh fails, nothing usable was stored and there is no ID token, rethrows the refresh error', async () => {
    const d = deps({
      loadSession: vi.fn(async () => expiredWithRefresh()),
      refresh: vi.fn(async () => { throw new Error('invalid_grant') }),
    })
    await expect(resolveAccessToken(d)).rejects.toThrow('invalid_grant')
  })
})
```

Replace `tests/lib/shopify-client.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyQuery } from '@/lib/shopify-client'
import { getAccessToken } from '@/lib/getAccessToken'

vi.mock('@/lib/getAccessToken', () => ({ getAccessToken: vi.fn() }))

describe('shopifyQuery', () => {
  beforeEach(() => {
    process.env.SHOPIFY_SHOP = 'test.myshopify.com'
    vi.mocked(getAccessToken).mockReset()
    vi.mocked(getAccessToken).mockResolvedValue('test-token')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns data on a successful query', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/1' } } }),
    } as Response)

    const result = await shopifyQuery<{ shop: { id: string } }>('query { shop { id } }')
    expect(result).toEqual({ shop: { id: 'gid://shopify/Shop/1' } })
  })

  it('sends the token from getAccessToken to the configured shop', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ data: {} }) } as Response)

    await shopifyQuery('query { shop { id } }')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/^https:\/\/test\.myshopify\.com\/admin\/api\/.+\/graphql\.json$/)
    expect((init as RequestInit).headers).toMatchObject({ 'X-Shopify-Access-Token': 'test-token' })
  })

  it('throws with GraphQL error messages when errors are present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Field does not exist' }] }),
    } as Response)

    await expect(shopifyQuery('query { bogus }')).rejects.toThrow('Field does not exist')
  })

  it('throws a clear error on a non-JSON response body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => { throw new SyntaxError('Unexpected token') },
    } as unknown as Response)

    await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow(/HTTP 502/)
  })

  it('throws when SHOPIFY_SHOP is not set', async () => {
    delete process.env.SHOPIFY_SHOP
    await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow('SHOPIFY_SHOP is not set')
  })

  it('passes along the error when no access token can be obtained', async () => {
    vi.mocked(getAccessToken).mockRejectedValue(new Error('open the app from Shopify admin'))
    await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow('open the app from Shopify admin')
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run tests/lib/accessToken.test.ts tests/lib/shopify-client.test.ts
```

Expected: FAIL (`accessToken.ts` and `getAccessToken.ts` do not exist; the client still reads the env token).

- [ ] **Step 3: Write the implementations**

`src/lib/accessToken.ts`:

```ts
import { decideSessionAction, type StoredSession } from '@/lib/sessionDecision'

export const NOT_AUTHENTICATED_MESSAGE = 'No Shopify session. Open this app from your Shopify admin.'

export interface AccessTokenDeps<S extends StoredSession> {
  shop: string
  /** The verified App Bridge ID token of this request, if there is one. */
  idToken: string | null
  now: () => number
  loadSession: (shop: string) => Promise<S | undefined>
  exchange: (idToken: string) => Promise<S>
  refresh: (refreshToken: string) => Promise<S>
  store: (session: S) => Promise<void>
}

/**
 * The access token for the shop: the stored one, a refreshed one, or one
 * exchanged from the request's ID token. A failed refresh may only mean another
 * request rotated the refresh token first, so the stored session is read once
 * more before falling back to the exchange.
 */
export async function resolveAccessToken<S extends StoredSession>(deps: AccessTokenDeps<S>): Promise<string> {
  const session = await deps.loadSession(deps.shop)
  const action = decideSessionAction({ session, idToken: deps.idToken, now: deps.now() })

  if (action.kind === 'use') return session!.accessToken

  if (action.kind === 'refresh') {
    try {
      const refreshed = await deps.refresh(session!.refreshToken!)
      await deps.store(refreshed)
      return refreshed.accessToken
    } catch (error) {
      const reloaded = await deps.loadSession(deps.shop)
      if (decideSessionAction({ session: reloaded, idToken: null, now: deps.now() }).kind === 'use') return reloaded!.accessToken
      if (!deps.idToken) throw error
      return exchangeAndStore(deps, deps.idToken)
    }
  }

  if (action.kind === 'exchange') return exchangeAndStore(deps, deps.idToken!)

  throw new Error(NOT_AUTHENTICATED_MESSAGE)
}

async function exchangeAndStore<S extends StoredSession>(deps: AccessTokenDeps<S>, idToken: string): Promise<string> {
  const exchanged = await deps.exchange(idToken)
  await deps.store(exchanged)
  return exchanged.accessToken
}
```

`src/lib/getAccessToken.ts`:

```ts
import { headers } from 'next/headers'
import { RequestedTokenType } from '@shopify/shopify-api'
import { resolveAccessToken } from '@/lib/accessToken'
import { getSessionStorage, getShopify } from '@/lib/shopifyApp'

/** The ID token the proxy verified and forwarded; null outside a request (a script, a test). */
async function currentIdToken(): Promise<string | null> {
  try {
    return (await headers()).get('x-shopify-id-token')
  } catch {
    return null
  }
}

/** Server only. The access token for `SHOPIFY_SHOP`, from the stored session, a refresh or a token exchange. */
export async function getAccessToken(): Promise<string> {
  const shop = process.env.SHOPIFY_SHOP
  if (!shop) throw new Error('SHOPIFY_SHOP is not set')

  const shopify = getShopify()
  const storage = getSessionStorage()

  return resolveAccessToken({
    shop,
    idToken: await currentIdToken(),
    now: () => Date.now(),
    loadSession: (forShop) => storage.loadSession(shopify.session.getOfflineId(forShop)),
    exchange: async (idToken) =>
      (await shopify.auth.tokenExchange({ shop, sessionToken: idToken, requestedTokenType: RequestedTokenType.OfflineAccessToken, expiring: true })).session,
    refresh: async (refreshToken) => (await shopify.auth.refreshToken({ shop, refreshToken })).session,
    store: async (session) => {
      await storage.storeSession(session)
    },
  })
}
```

In `src/lib/shopify-client.ts`, replace the `accessToken()` function and its use: delete

```ts
function accessToken(): string {
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!token) throw new Error('SHOPIFY_ACCESS_TOKEN is not set')
  return token
}
```

add `import { getAccessToken } from '@/lib/getAccessToken'` at the top, and change the fetch header line to use the awaited token:

```ts
export async function shopifyQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = apiUrl()
  const token = await getAccessToken()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
```

(`apiUrl()` first so a missing `SHOPIFY_SHOP` still throws `SHOPIFY_SHOP is not set` before any token work; the rest of the function is unchanged.)

- [ ] **Step 4: Run the tests, type-check, lint, whole suite**

```bash
npx vitest run tests/lib/accessToken.test.ts tests/lib/shopify-client.test.ts
npx tsc --noEmit
npx eslint src/lib/accessToken.ts src/lib/getAccessToken.ts src/lib/shopify-client.ts tests/lib/accessToken.test.ts tests/lib/shopify-client.test.ts
npx vitest run
```

Expected: PASS; tsc and eslint print nothing. If other test files fail because importing `shopify-client` now pulls in `getAccessToken`, the cause is an import side effect: report it by name; do not add the old env token back.

- [ ] **Step 5: Version and commit**

```bash
npm version 0.23.2 --no-git-tag-version
git add src/lib/accessToken.ts src/lib/getAccessToken.ts src/lib/shopify-client.ts tests/lib/accessToken.test.ts tests/lib/shopify-client.test.ts package.json package-lock.json
git commit -m "feat: get the Shopify access token from the stored session, a refresh or a token exchange

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The proxy decides with the ID token

**Files:**
- Create: `src/lib/proxyDecision.ts`
- Modify: `src/proxy.ts` (whole file replaced)
- Test: `tests/lib/proxyDecision.test.ts`
- Modify: `package.json`, `package-lock.json` (version `0.23.3`)

**Interfaces:**
- Consumes: `verifyIdToken`, `pickIdToken` (Task 2).
- Produces: `decideProxy(input: ProxyInput): Promise<ProxyDecision>`, `forwardHeaders(inbound: Headers, decision: ProxyDecision): Headers`, `bouncePage(apiKey: string): string`, `isDocumentRequest(headers: { secFetchDest: string | null; accept: string | null; rsc: string | null }): boolean`.

```ts
export interface ProxyInput {
  pathname: string
  searchParams: URLSearchParams
  headers: { authorization: string | null; secFetchDest: string | null; accept: string | null; rsc: string | null }
  env: { secret: string | undefined; apiKey: string | undefined; shop: string | undefined }
  now: number          // Unix seconds
  isDevelopment: boolean
}
export type ProxyDecision =
  | { kind: 'next' }
  | { kind: 'next-with-token'; idToken: string; shop: string }
  | { kind: 'bounce' }
  | { kind: 'deny'; status: 401 | 403 | 503; message: string }
```

- [ ] **Step 1: Write the failing tests**

`tests/lib/proxyDecision.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { decideProxy, forwardHeaders, bouncePage, isDocumentRequest, type ProxyInput } from '@/lib/proxyDecision'

const SECRET = 'client-secret'
const API_KEY = 'client-id'
const SHOP = 'demo.myshopify.com'
const NOW = 1_800_000_000

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
function token(over: Record<string, unknown> = {}, secret = SECRET): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY, sub: '1', exp: NOW + 60, nbf: NOW - 5, iat: NOW - 5, jti: 'j', sid: 's', ...over }))
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}

const documentHeaders = { authorization: null, secFetchDest: 'document', accept: 'text/html', rsc: null }
const fetchHeaders = { authorization: null, secFetchDest: 'empty', accept: '*/*', rsc: null }

function input(over: Partial<ProxyInput> = {}): ProxyInput {
  return {
    pathname: '/', searchParams: new URLSearchParams(), headers: documentHeaders,
    env: { secret: SECRET, apiKey: API_KEY, shop: SHOP }, now: NOW, isDevelopment: false, ...over,
  }
}

describe('decideProxy', () => {
  it('lets static assets and webhooks through without a token', async () => {
    for (const pathname of ['/_next/static/x.js', '/favicon.ico', '/webhooks/app/uninstalled', '/webhooks/compliance']) {
      expect(await decideProxy(input({ pathname }))).toEqual({ kind: 'next' })
    }
  })

  it('lets everything through in development', async () => {
    expect(await decideProxy(input({ isDevelopment: true }))).toEqual({ kind: 'next' })
  })

  it('answers 503 when the app is not configured', async () => {
    expect(await decideProxy(input({ env: { secret: undefined, apiKey: API_KEY, shop: SHOP } }))).toMatchObject({ kind: 'deny', status: 503 })
    expect(await decideProxy(input({ env: { secret: SECRET, apiKey: API_KEY, shop: '' } }))).toMatchObject({ kind: 'deny', status: 503 })
  })

  it('accepts a valid ID token in the id_token query parameter on a page load', async () => {
    const t = token()
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ id_token: t, shop: SHOP, host: 'h' }) }))).toEqual({ kind: 'next-with-token', idToken: t, shop: SHOP })
  })

  it('accepts a valid ID token in the Authorization header on a fetch', async () => {
    const t = token()
    expect(await decideProxy(input({ headers: { ...fetchHeaders, authorization: `Bearer ${t}` } }))).toEqual({ kind: 'next-with-token', idToken: t, shop: SHOP })
  })

  it('refuses a correctly signed token for another shop with 403', async () => {
    const t = token({ dest: 'https://other.myshopify.com' })
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ id_token: t, shop: SHOP, host: 'h' }) }))).toMatchObject({ kind: 'deny', status: 403 })
  })

  it('bounces a page load whose token has expired, when shop and host are present', async () => {
    const t = token({ exp: NOW - 60 })
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ id_token: t, shop: SHOP, host: 'h' }) }))).toEqual({ kind: 'bounce' })
  })

  it('bounces a page load with no token when shop and host are present', async () => {
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ shop: SHOP, host: 'h' }) }))).toEqual({ kind: 'bounce' })
  })

  it('never bounces twice: a still-invalid token after a bounce is a 403', async () => {
    const t = token({ exp: NOW - 60 })
    const params = new URLSearchParams({ id_token: t, shop: SHOP, host: 'h', 'shopify-bounced': '1' })
    expect(await decideProxy(input({ searchParams: params }))).toMatchObject({ kind: 'deny', status: 403 })
  })

  it('answers 403 to a page load with no token and no shop and host', async () => {
    expect(await decideProxy(input())).toMatchObject({ kind: 'deny', status: 403 })
  })

  it('answers 401 to a fetch with a missing or bad token, never a bounce', async () => {
    expect(await decideProxy(input({ headers: fetchHeaders }))).toMatchObject({ kind: 'deny', status: 401 })
    expect(await decideProxy(input({ headers: { ...fetchHeaders, authorization: 'Bearer garbage' } }))).toMatchObject({ kind: 'deny', status: 401 })
  })

  it('refuses a token signed with the wrong secret', async () => {
    const t = token({}, 'other-secret')
    expect(await decideProxy(input({ headers: { ...fetchHeaders, authorization: `Bearer ${t}` } }))).toMatchObject({ kind: 'deny', status: 401 })
  })
})

describe('isDocumentRequest', () => {
  it('is true for a navigation and false for fetches and RSC requests', () => {
    expect(isDocumentRequest({ secFetchDest: 'document', accept: 'text/html', rsc: null })).toBe(true)
    expect(isDocumentRequest({ secFetchDest: null, accept: 'text/html,application/xhtml+xml', rsc: null })).toBe(true)
    expect(isDocumentRequest({ secFetchDest: 'empty', accept: '*/*', rsc: null })).toBe(false)
    expect(isDocumentRequest({ secFetchDest: null, accept: 'text/x-component', rsc: '1' })).toBe(false)
  })
})

describe('forwardHeaders', () => {
  it('removes any client-sent token headers and sets the verified ones', () => {
    const inbound = new Headers({ 'x-shopify-id-token': 'forged', 'x-shopify-shop': 'evil.myshopify.com', accept: 'text/html' })
    const out = forwardHeaders(inbound, { kind: 'next-with-token', idToken: 'real', shop: SHOP })
    expect(out.get('x-shopify-id-token')).toBe('real')
    expect(out.get('x-shopify-shop')).toBe(SHOP)
    expect(out.get('accept')).toBe('text/html')
  })

  it('removes client-sent token headers when the request passes without a token', () => {
    const inbound = new Headers({ 'x-shopify-id-token': 'forged', 'x-shopify-shop': 'evil.myshopify.com' })
    const out = forwardHeaders(inbound, { kind: 'next' })
    expect(out.get('x-shopify-id-token')).toBeNull()
    expect(out.get('x-shopify-shop')).toBeNull()
  })
})

describe('bouncePage', () => {
  it('loads App Bridge with the api key and reloads the page with a fresh id_token', () => {
    const html = bouncePage('client-id')
    expect(html).toContain('name="shopify-api-key" content="client-id"')
    expect(html).toContain('https://cdn.shopify.com/shopifycloud/app-bridge.js')
    expect(html).toContain('shopify.idToken()')
    expect(html).toContain("'id_token'")
    expect(html).toContain("'shopify-bounced', '1'")
  })

  it('escapes the api key so it cannot break out of the attribute', () => {
    expect(bouncePage('a"b<c')).toContain('content="a&quot;b&lt;c"')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run tests/lib/proxyDecision.test.ts
```

Expected: FAIL (module does not exist).

- [ ] **Step 3: Write `src/lib/proxyDecision.ts`**

```ts
import { verifyIdToken } from '@/lib/idToken'
import { pickIdToken } from '@/lib/tokenSource'

export interface ProxyInput {
  pathname: string
  searchParams: URLSearchParams
  headers: { authorization: string | null; secFetchDest: string | null; accept: string | null; rsc: string | null }
  env: { secret: string | undefined; apiKey: string | undefined; shop: string | undefined }
  /** Unix time in seconds. */
  now: number
  isDevelopment: boolean
}

export type ProxyDecision =
  | { kind: 'next' }
  | { kind: 'next-with-token'; idToken: string; shop: string }
  | { kind: 'bounce' }
  | { kind: 'deny'; status: 401 | 403 | 503; message: string }

const EXEMPT_PREFIXES = ['/_next/', '/webhooks/']

export function isDocumentRequest(headers: { secFetchDest: string | null; accept: string | null; rsc: string | null }): boolean {
  if (headers.rsc === '1') return false
  if (headers.secFetchDest) return headers.secFetchDest === 'document'
  return !!headers.accept?.includes('text/html')
}

export async function decideProxy(input: ProxyInput): Promise<ProxyDecision> {
  const { pathname, searchParams, headers, env, now } = input

  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname === '/favicon.ico') return { kind: 'next' }
  if (input.isDevelopment) return { kind: 'next' }

  if (!env.secret || !env.apiKey || !env.shop) {
    return { kind: 'deny', status: 503, message: 'App misconfigured: missing env vars' }
  }

  const isDocument = isDocumentRequest(headers)
  const canBounce = isDocument && searchParams.has('shop') && searchParams.has('host') && searchParams.get('shopify-bounced') !== '1'
  const idToken = pickIdToken({ authorization: headers.authorization, idTokenParam: searchParams.get('id_token') })

  if (idToken) {
    const result = await verifyIdToken(idToken, { secret: env.secret, apiKey: env.apiKey, shop: env.shop, now })
    if (result.ok) return { kind: 'next-with-token', idToken, shop: result.shop }
    if (result.reason === 'shop') return { kind: 'deny', status: 403, message: 'This app is not set up for this store.' }
  }

  if (canBounce) return { kind: 'bounce' }
  if (isDocument) return { kind: 'deny', status: 403, message: 'Open this app from your Shopify admin.' }
  return { kind: 'deny', status: 401, message: 'Unauthorized' }
}

/** The request headers to pass on: any client-sent token headers are dropped, then the verified ones are set. */
export function forwardHeaders(inbound: Headers, decision: ProxyDecision): Headers {
  const out = new Headers(inbound)
  out.delete('x-shopify-id-token')
  out.delete('x-shopify-shop')
  if (decision.kind === 'next-with-token') {
    out.set('x-shopify-id-token', decision.idToken)
    out.set('x-shopify-shop', decision.shop)
  }
  return out
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A page that gets a fresh ID token from App Bridge and reloads the same URL with it (once). */
export function bouncePage(apiKey: string): string {
  return `<!DOCTYPE html><html><head><meta name="shopify-api-key" content="${escapeAttribute(apiKey)}"><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script></head><body><script>
shopify.idToken().then(function (token) {
  var url = new URL(window.location.href);
  url.searchParams.set('id_token', token);
  url.searchParams.set('shopify-bounced', '1');
  window.location.replace(url.toString());
});
</script></body></html>`
}
```

- [ ] **Step 4: Replace `src/proxy.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { bouncePage, decideProxy, forwardHeaders } from '@/lib/proxyDecision'

function accessRestricted(shop: string | undefined, message: string): string {
  const link = shop ? `<p><a href="https://${shop}/admin/apps">Go to Shopify admin &rarr;</a></p>` : ''
  return `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${message}</h2>${link}</body></html>`
}

export async function proxy(req: NextRequest) {
  const env = {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
    shop: process.env.SHOPIFY_SHOP,
  }

  const decision = await decideProxy({
    pathname: req.nextUrl.pathname,
    searchParams: req.nextUrl.searchParams,
    headers: {
      authorization: req.headers.get('authorization'),
      secFetchDest: req.headers.get('sec-fetch-dest'),
      accept: req.headers.get('accept'),
      rsc: req.headers.get('rsc'),
    },
    env,
    now: Math.floor(Date.now() / 1000),
    isDevelopment: process.env.NODE_ENV === 'development',
  })

  if (decision.kind === 'bounce') {
    return new NextResponse(bouncePage(env.apiKey ?? ''), { status: 200, headers: { 'Content-Type': 'text/html' } })
  }

  if (decision.kind === 'deny') {
    const isHtml = (req.headers.get('accept') ?? '').includes('text/html')
    if (decision.status === 503) return NextResponse.json({ error: decision.message }, { status: 503 })
    return isHtml
      ? new NextResponse(accessRestricted(env.shop, decision.message), { status: decision.status, headers: { 'Content-Type': 'text/html' } })
      : NextResponse.json({ error: decision.message }, { status: decision.status })
  }

  return NextResponse.next({ request: { headers: forwardHeaders(req.headers, decision) } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
```

- [ ] **Step 5: Run the tests, type-check, lint, build, whole suite**

```bash
npx vitest run tests/lib/proxyDecision.test.ts
npx tsc --noEmit
npx eslint src/proxy.ts src/lib/proxyDecision.ts tests/lib/proxyDecision.test.ts
npx vitest run
npx next build --webpack 2>&1 | tail -15
```

Expected: PASS; tsc and eslint print nothing; the build succeeds (it needs no environment variables because the Prisma and shopify-api instances are lazy). If the build fails on a missing Prisma client, run `npx prisma generate` and retry; if it still fails, report it by name.

- [ ] **Step 6: Version and commit**

```bash
npm version 0.23.3 --no-git-tag-version
git add src/proxy.ts src/lib/proxyDecision.ts tests/lib/proxyDecision.test.ts package.json package-lock.json
git commit -m "feat: the proxy checks the App Bridge ID token and bounces expired page loads

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Webhook handler and routes

**Files:**
- Create: `src/lib/webhookHandler.ts`, `src/lib/sessions.ts`, `src/app/webhooks/app/uninstalled/route.ts`, `src/app/webhooks/app/scopes_update/route.ts`, `src/app/webhooks/compliance/route.ts`
- Test: `tests/lib/webhookHandler.test.ts`, `tests/webhooks/routes.test.ts`
- Modify: `package.json`, `package-lock.json` (version `0.23.4`)

**Interfaces:**
- Consumes: `verifyWebhookHmac` (Task 2); `getDb` (Task 1).
- Produces:
  - `handleWebhook(request: Request, options: { secret: string | undefined; onVerified: (context: { shop: string; topic: string; body: string }) => Promise<void> }): Promise<Response>`
  - `parseScopesPayload(body: string): string[] | null`
  - `complianceAction(topic: string): 'acknowledge' | 'delete-sessions' | 'ignore'`
  - `deleteShopSessions(shop: string): Promise<void>`, `updateStoredScope(shop: string, scopes: string[]): Promise<void>` in `src/lib/sessions.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/webhookHandler.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { handleWebhook, parseScopesPayload, complianceAction } from '@/lib/webhookHandler'

const SECRET = 'client-secret'
const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw, 'utf8').digest('base64')

function webhookRequest(body: string, headers: Record<string, string> = {}, signature = sign(body)) {
  return new Request('https://app.test/webhooks/x', {
    method: 'POST',
    body,
    headers: { 'x-shopify-hmac-sha256': signature, 'x-shopify-shop-domain': 'demo.myshopify.com', 'x-shopify-topic': 'app/uninstalled', ...headers },
  })
}

describe('handleWebhook', () => {
  it('runs the handler for a correctly signed webhook and answers 200', async () => {
    const onVerified = vi.fn(async () => {})
    const res = await handleWebhook(webhookRequest('{"a":1}'), { secret: SECRET, onVerified })
    expect(res.status).toBe(200)
    expect(onVerified).toHaveBeenCalledWith({ shop: 'demo.myshopify.com', topic: 'app/uninstalled', body: '{"a":1}' })
  })

  it('answers 401 and does nothing for a tampered body', async () => {
    const onVerified = vi.fn(async () => {})
    const res = await handleWebhook(webhookRequest('{"a":2}', {}, sign('{"a":1}')), { secret: SECRET, onVerified })
    expect(res.status).toBe(401)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 401 when the signature header is missing', async () => {
    const onVerified = vi.fn(async () => {})
    const req = new Request('https://app.test/webhooks/x', { method: 'POST', body: '{}', headers: { 'x-shopify-shop-domain': 'd.myshopify.com', 'x-shopify-topic': 't' } })
    expect((await handleWebhook(req, { secret: SECRET, onVerified })).status).toBe(401)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 503 and does nothing when the client secret is not set', async () => {
    const onVerified = vi.fn(async () => {})
    expect((await handleWebhook(webhookRequest('{}'), { secret: undefined, onVerified })).status).toBe(503)
    expect((await handleWebhook(webhookRequest('{}'), { secret: '', onVerified })).status).toBe(503)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 400 when the shop or topic header is missing on a correctly signed request', async () => {
    const onVerified = vi.fn(async () => {})
    const req = new Request('https://app.test/webhooks/x', { method: 'POST', body: '{}', headers: { 'x-shopify-hmac-sha256': sign('{}') } })
    expect((await handleWebhook(req, { secret: SECRET, onVerified })).status).toBe(400)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 500 when the handler fails, so Shopify retries', async () => {
    const res = await handleWebhook(webhookRequest('{}'), { secret: SECRET, onVerified: async () => { throw new Error('db down') } })
    expect(res.status).toBe(500)
  })
})

describe('parseScopesPayload', () => {
  it('reads the current scopes', () => {
    expect(parseScopesPayload('{"current":["read_products","write_products"]}')).toEqual(['read_products', 'write_products'])
  })

  it('returns null for anything else', () => {
    expect(parseScopesPayload('not json')).toBeNull()
    expect(parseScopesPayload('{}')).toBeNull()
    expect(parseScopesPayload('{"current":"read_products"}')).toBeNull()
    expect(parseScopesPayload('{"current":[1]}')).toBeNull()
  })
})

describe('complianceAction', () => {
  it('acknowledges the customer topics, deletes sessions for shop/redact, ignores the rest', () => {
    expect(complianceAction('customers/data_request')).toBe('acknowledge')
    expect(complianceAction('customers/redact')).toBe('acknowledge')
    expect(complianceAction('shop/redact')).toBe('delete-sessions')
    expect(complianceAction('SHOP_REDACT')).toBe('delete-sessions')
    expect(complianceAction('CUSTOMERS_DATA_REQUEST')).toBe('acknowledge')
    expect(complianceAction('orders/create')).toBe('ignore')
  })
})
```

`tests/webhooks/routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { POST as uninstalled } from '@/app/webhooks/app/uninstalled/route'
import { POST as scopesUpdate } from '@/app/webhooks/app/scopes_update/route'
import { POST as compliance } from '@/app/webhooks/compliance/route'
import { deleteShopSessions, updateStoredScope } from '@/lib/sessions'

vi.mock('@/lib/sessions', () => ({ deleteShopSessions: vi.fn(async () => {}), updateStoredScope: vi.fn(async () => {}) }))

const SECRET = 'client-secret'
const sign = (raw: string) => createHmac('sha256', SECRET).update(raw, 'utf8').digest('base64')
const post = (body: string, topic: string, signature = sign(body)) =>
  new Request('https://app.test/webhooks', {
    method: 'POST', body,
    headers: { 'x-shopify-hmac-sha256': signature, 'x-shopify-shop-domain': 'demo.myshopify.com', 'x-shopify-topic': topic },
  })

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET_KEY = SECRET
  vi.mocked(deleteShopSessions).mockClear()
  vi.mocked(updateStoredScope).mockClear()
})

describe('app/uninstalled', () => {
  it('deletes the shop sessions', async () => {
    expect((await uninstalled(post('{}', 'app/uninstalled'))).status).toBe(200)
    expect(deleteShopSessions).toHaveBeenCalledWith('demo.myshopify.com')
  })

  it('does nothing for a bad signature', async () => {
    expect((await uninstalled(post('{}', 'app/uninstalled', 'AAAA'))).status).toBe(401)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })
})

describe('app/scopes_update', () => {
  it('stores the current scopes', async () => {
    const body = '{"current":["read_products","write_products"]}'
    expect((await scopesUpdate(post(body, 'app/scopes_update'))).status).toBe(200)
    expect(updateStoredScope).toHaveBeenCalledWith('demo.myshopify.com', ['read_products', 'write_products'])
  })

  it('answers 200 without writing when the payload has no scopes', async () => {
    expect((await scopesUpdate(post('{}', 'app/scopes_update'))).status).toBe(200)
    expect(updateStoredScope).not.toHaveBeenCalled()
  })
})

describe('compliance', () => {
  it('acknowledges customers/data_request and customers/redact without touching the database', async () => {
    expect((await compliance(post('{"customer":{"email":"a@b.c"}}', 'customers/data_request'))).status).toBe(200)
    expect((await compliance(post('{}', 'customers/redact'))).status).toBe(200)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })

  it('deletes the shop sessions for shop/redact', async () => {
    expect((await compliance(post('{}', 'shop/redact'))).status).toBe(200)
    expect(deleteShopSessions).toHaveBeenCalledWith('demo.myshopify.com')
  })

  it('rejects a bad signature without touching the database', async () => {
    expect((await compliance(post('{}', 'shop/redact', 'AAAA'))).status).toBe(401)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run tests/lib/webhookHandler.test.ts tests/webhooks/routes.test.ts
```

Expected: FAIL (modules do not exist).

- [ ] **Step 3: Write the implementations**

`src/lib/webhookHandler.ts`:

```ts
import { verifyWebhookHmac } from '@/lib/webhookHmac'

export interface VerifiedWebhook {
  shop: string
  topic: string
  /** The raw body. Never log it: compliance payloads hold customer contact data. */
  body: string
}

export async function handleWebhook(
  request: Request,
  options: { secret: string | undefined; onVerified: (webhook: VerifiedWebhook) => Promise<void> },
): Promise<Response> {
  if (!options.secret) return new Response('App misconfigured', { status: 503 })

  const body = await request.text()
  const valid = await verifyWebhookHmac(body, request.headers.get('x-shopify-hmac-sha256'), options.secret)
  if (!valid) return new Response('Unauthorized', { status: 401 })

  const shop = request.headers.get('x-shopify-shop-domain')
  const topic = request.headers.get('x-shopify-topic')
  if (!shop || !topic) return new Response('Missing headers', { status: 400 })

  try {
    await options.onVerified({ shop, topic, body })
  } catch (error) {
    console.log(`Webhook ${topic} for ${shop} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return new Response('Webhook failed', { status: 500 })
  }
  return new Response(null, { status: 200 })
}

/** The `current` scopes of an app/scopes_update payload, or null when the payload does not have them. */
export function parseScopesPayload(body: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(body)
    const current = (parsed as { current?: unknown } | null)?.current
    return Array.isArray(current) && current.every((scope) => typeof scope === 'string') ? (current as string[]) : null
  } catch {
    return null
  }
}

/** This app stores no customer data, so only shop/redact has work to do. Topic casing differs between API styles. */
export function complianceAction(topic: string): 'acknowledge' | 'delete-sessions' | 'ignore' {
  switch (topic.toUpperCase().replace(/\//g, '_')) {
    case 'CUSTOMERS_DATA_REQUEST':
    case 'CUSTOMERS_REDACT':
      return 'acknowledge'
    case 'SHOP_REDACT':
      return 'delete-sessions'
    default:
      return 'ignore'
  }
}
```

`src/lib/sessions.ts`:

```ts
import { getDb } from '@/lib/db'

export async function deleteShopSessions(shop: string): Promise<void> {
  await getDb().session.deleteMany({ where: { shop } })
}

export async function updateStoredScope(shop: string, scopes: string[]): Promise<void> {
  await getDb().session.updateMany({ where: { shop }, data: { scope: scopes.join(',') } })
}
```

`src/app/webhooks/app/uninstalled/route.ts`:

```ts
import { handleWebhook } from '@/lib/webhookHandler'
import { deleteShopSessions } from '@/lib/sessions'

export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    onVerified: async ({ shop }) => {
      console.log(`Received app/uninstalled for ${shop}`)
      await deleteShopSessions(shop)
    },
  })
}
```

`src/app/webhooks/app/scopes_update/route.ts`:

```ts
import { handleWebhook, parseScopesPayload } from '@/lib/webhookHandler'
import { updateStoredScope } from '@/lib/sessions'

export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    onVerified: async ({ shop, body }) => {
      console.log(`Received app/scopes_update for ${shop}`)
      const scopes = parseScopesPayload(body)
      if (scopes) await updateStoredScope(shop, scopes)
    },
  })
}
```

`src/app/webhooks/compliance/route.ts`:

```ts
import { complianceAction, handleWebhook } from '@/lib/webhookHandler'
import { deleteShopSessions } from '@/lib/sessions'

// Mandatory compliance topics: customers/data_request, customers/redact, shop/redact.
// This app stores only Shopify sessions, no customer data. Payloads are never logged.
export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    onVerified: async ({ shop, topic }) => {
      const action = complianceAction(topic)
      console.log(`Received ${topic} for ${shop}: ${action}`)
      if (action === 'delete-sessions') await deleteShopSessions(shop)
    },
  })
}
```

- [ ] **Step 4: Run the tests, type-check, lint, build, whole suite**

```bash
npx vitest run tests/lib/webhookHandler.test.ts tests/webhooks/routes.test.ts
npx tsc --noEmit
npx eslint src/lib/webhookHandler.ts src/lib/sessions.ts src/app/webhooks tests/lib/webhookHandler.test.ts tests/webhooks
npx vitest run
npx next build --webpack 2>&1 | tail -15
```

Expected: PASS; tsc and eslint print nothing; the build lists `/webhooks/app/uninstalled`, `/webhooks/app/scopes_update` and `/webhooks/compliance` as dynamic routes.

- [ ] **Step 5: Version and commit**

```bash
npm version 0.23.4 --no-git-tag-version
git add src/lib/webhookHandler.ts src/lib/sessions.ts src/app/webhooks tests/lib/webhookHandler.test.ts tests/webhooks package.json package-lock.json
git commit -m "feat: webhook routes for uninstall, scope changes and the compliance topics

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Managed-install app config, and the live checkpoint on the dev store

**Files:**
- Modify: `shopify.app.dev.toml` (whole file replaced)
- Modify: `package.json`, `package-lock.json` (version `0.23.5`)

**Interfaces:**
- Consumes: the three webhook URIs from Task 5.
- Produces: a releasable dev app version with managed installation.

- [ ] **Step 1: Replace `shopify.app.dev.toml`**

```toml
# Dev copy of the app: the "demo" app in the Dev Dashboard, paired with the dev
# Vercel project (https://sparkly-tails-product-discounts-nyq.vercel.app, which
# deploys the `dev` branch). This is NOT the production app; production is
# shopify.app.toml.
#
# Shopify managed installation: scopes live here and Shopify installs the app
# itself, with no redirect through this app. The admin logs in with an App Bridge
# ID token exchanged for an access token (see docs/superpowers/specs/2026-10-15-dev-managed-install-auth-design.md).
#
# Always pass --config explicitly so the right app is targeted:
#   SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk \
#     shopify app deploy --config shopify.app.dev.toml    # dev app only
#   shopify app deploy --config shopify.app.toml          # production app
#
# Only public values live here. The dev app's client secret, the database URLs and
# every token are environment variables on the dev Vercel project, never in git.

client_id = "f707124c97ab92f1fc7dd99b1a01c8e1"
name = "demo"
application_url = "https://sparkly-tails-product-discounts-nyq.vercel.app"
embedded = true

[access_scopes]
scopes = "read_discounts,read_products,write_discounts,write_products"

[auth]
redirect_urls = [ "https://sparkly-tails-product-discounts-nyq.vercel.app/api/auth" ]

[webhooks]
api_version = "2026-10"

  [[webhooks.subscriptions]]
  uri = "/webhooks/app/uninstalled"
  topics = [ "app/uninstalled" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/app/scopes_update"
  topics = [ "app/scopes_update" ]

  # Mandatory compliance topics. Handled by src/app/webhooks/compliance/route.ts.
  [[webhooks.subscriptions]]
  uri = "/webhooks/compliance"
  compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]

[build]
automatically_update_urls_on_dev = false
```

Check: `grep -c use_legacy_install_flow shopify.app.dev.toml` prints `0`.

- [ ] **Step 2: Whole suite, version, commit, push, open the PR into `dev`**

```bash
npx vitest run
npm version 0.23.5 --no-git-tag-version
git add shopify.app.dev.toml package.json package-lock.json
git commit -m "feat: dev app config uses managed installation and registers the webhooks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
gh pr list --head feat/dev-managed-install-auth --state all --json number,state,baseRefName
git push -u origin feat/dev-managed-install-auth
```

Then open a PR with base `dev` titled "Dev: login with managed install and token exchange (checkpoint)", body: the purpose (dev only, not for `main`), what is in it so far (Tasks 1–6), that the old token plumbing is still present and is removed in Task 7 after the live checkpoint, and the user steps below. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. After `gh pr create`, call the PR status tool, and bind the PR if it is not already bound.

- [ ] **Step 3: Live checkpoint (the user's actions; the controller reports and waits)**

Tell the user, in this order:

1. Create a **dev Supabase project**. From Supabase "Connect" take two strings with the same user `postgres.<project-ref>`: `DATABASE_URL` (transaction pooler, port **6543**, add `?pgbouncer=true`) and `DIRECT_URL` (session pooler, port **5432**). URL-encode special characters in the password. Put both in a git-ignored `.env` in the `dev-auth` worktree and in the dev Vercel project's environment variables (Sensitive). Never paste them in chat.
2. Apply the migration (creates the `Session` table with row-level security): `cd` into the worktree, then `npx prisma migrate deploy`. Expected: "1 migration found … applied".
3. Make the dev project serve this branch: merge the PR into `dev`; if the dev Vercel project's Production Branch is not `dev`, the controller can, with the user's yes, create a production deployment of the branch `feat/dev-managed-install-auth` with `create_deployment` (the dev project only).
4. Release the dev app config (a new version, managed installation): `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk shopify app deploy --config shopify.app.dev.toml`; the prompt must name the `demo` app. Check `shopify app versions list --config shopify.app.dev.toml` shows the new version `active`.
5. Install `demo` on `demo-nlmhyat3` from the Dev Dashboard (organization `SINGLETON_ORG…`) and open it from **Apps** in the store admin.

Checks to run and report (these prove spec assumptions 2, 3 and 5):

- [ ] The app opens and lists discounts (an empty list is fine): the first load did the token exchange. `node --env-file=.env ~/.claude/skills/shopify-app-auth/scripts/session-row.cjs` shows one session row with an access-token fingerprint, a refresh-token fingerprint and an expiry about one hour ahead (fingerprints only, never values).
- [ ] **Assumption 2:** create a tier discount, edit it, open another page and come back. Every step works with no "Unauthorized" or "Open this app from your Shopify admin" page. If any server action or navigation answers 401, stop and report: the design changes (explicit header from a small client wrapper) before Task 7.
- [ ] **Assumption 3:** reload the browser tab while inside the app (so the URL has an old `id_token`). The page comes back after a brief blank moment, not the 403 page.
- [ ] Force expiry: `node --env-file=.env ~/.claude/skills/shopify-app-auth/scripts/session-row.cjs force`, then open the app again: the session row gets new fingerprints (the exchange path).
- [ ] **Assumption 5:** a webhook answers fast: `~/.claude/skills/shopify-app-auth/scripts/send-compliance-webhook.sh https://sparkly-tails-product-discounts-nyq.vercel.app customers/data_request fake-shop.myshopify.com` prints 200, and with the extra argument `bad` prints 401. (Use a fake shop; `shop/redact` deletes that shop's sessions.)
- [ ] `SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... node --env-file=.env ~/.claude/skills/shopify-app-auth/scripts/rls-leak-test.cjs` prints "OK: row not readable" (it inserts and deletes one fake row in the dev database).

Record the results in the ledger. Do not start Task 7 until every box above is checked or a ruling explains why not.

---

### Task 7: Remove the old URL-token plumbing

**Files:**
- Delete: `src/app/api/auth/start/route.ts`, `src/app/api/auth/callback/route.ts`, `src/components/AuthLink.tsx`, `src/components/AuthTokenInit.tsx`, `src/lib/auth-token.ts`, `src/lib/auth-redirect.ts`, `src/lib/shopify-auth.ts`, `tests/lib/auth-token.test.ts`, `tests/lib/shopify-auth.test.ts`
- Modify: `src/app/layout.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/page.tsx`, `src/app/discounts/[discountId]/page.tsx`, `src/app/time-discounts/[discountId]/page.tsx`, `src/actions/discountActions.ts`, `src/timeDiscounts/actions.ts`, `eslint.config.mjs`, `tests/actions/discountActions.test.ts`, `tests/timeDiscounts/actions.test.ts`
- Modify: `package.json`, `package-lock.json` (version `0.23.6`)

**Interfaces:**
- Consumes: Task 6's checkpoint results (all boxes checked).

- [ ] **Step 1: Update the tests first**

In `tests/actions/discountActions.test.ts`:

- Replace `import * as authRedirect from '@/lib/auth-redirect'` with `import { redirect } from 'next/navigation'`.
- Replace `vi.mock('@/lib/auth-redirect', () => ({ redirectWithToken: vi.fn() }))` with `vi.mock('next/navigation', () => ({ redirect: vi.fn() }))`.
- Replace `expect(authRedirect.redirectWithToken).toHaveBeenCalledWith(` with `expect(redirect).toHaveBeenCalledWith(`.
- In every `beforeEach` of that file add `vi.mocked(redirect).mockClear()` as the first line of a block body.

In `tests/timeDiscounts/actions.test.ts`:

- Replace `import * as authRedirect from '@/lib/auth-redirect'` with `import { redirect } from 'next/navigation'`, add `vi.mock('next/navigation', () => ({ redirect: vi.fn() }))` after the imports, change `let redirectSpy: MockInstance<typeof authRedirect.redirectWithToken>` to `let redirectSpy: MockInstance<typeof redirect>`, and in the top `beforeEach` replace `redirectSpy = vi.spyOn(authRedirect, 'redirectWithToken').mockResolvedValue(undefined as never)` with:

```ts
  redirectSpy = vi.mocked(redirect)
  redirectSpy.mockClear()
```

Delete `tests/lib/auth-token.test.ts` and `tests/lib/shopify-auth.test.ts`.

Run `npx vitest run tests/actions/discountActions.test.ts tests/timeDiscounts/actions.test.ts`. Expected: FAIL (the actions still call `redirectWithToken`).

- [ ] **Step 2: Change the source**

Actions: in `src/actions/discountActions.ts` and `src/timeDiscounts/actions.ts` replace the line `import { redirectWithToken } from '@/lib/auth-redirect'` with `import { redirect } from 'next/navigation'` (add the import only if the file does not already import `redirect`), and replace every `await redirectWithToken(` with `redirect(`:

```bash
python3 - <<'EOF'
import re, pathlib
for f in ['src/actions/discountActions.ts', 'src/timeDiscounts/actions.ts']:
    p = pathlib.Path(f); s = p.read_text()
    s = s.replace("import { redirectWithToken } from '@/lib/auth-redirect'", "import { redirect } from 'next/navigation'")
    s = s.replace('await redirectWithToken(', 'redirect(')
    p.write_text(s)
EOF
git grep -n "redirectWithToken" -- src tests   # expected: no output
grep -n "next/navigation" src/actions/discountActions.ts src/timeDiscounts/actions.ts
```

The last command must show `redirect` imported from `next/navigation` exactly once in each file. If a file now has two `next/navigation` import lines, merge them into one (keep any other names the file already imported).

Pages and links: replace `AuthLink` with `next/link` and drop the token plumbing in the four files:

```bash
python3 - <<'EOF'
import re, pathlib
files = ['src/app/page.tsx', 'src/app/not-found.tsx', 'src/app/discounts/[discountId]/page.tsx', 'src/app/time-discounts/[discountId]/page.tsx']
for f in files:
    p = pathlib.Path(f); s = p.read_text()
    s = s.replace("import AuthLink from '@/components/AuthLink'", "import Link from 'next/link'")
    s = re.sub(r"<AuthLink\b", "<Link", s)
    s = s.replace("</AuthLink>", "</Link>")
    s = re.sub(r"\n[ \t]*token=\{token\}", "", s)
    s = re.sub(r"\n[ \t]*const token = \(await headers\(\)\)\.get\('x-auth-token'\) \?\? ''", "", s)
    if 'headers(' not in s:
        s = re.sub(r"import \{ headers \} from 'next/headers'\n", "", s)
    p.write_text(s)
EOF
git grep -n "AuthLink\|x-auth-token\|token=" -- src/app   # expected: only layout.tsx lines remain
```

`src/app/error.tsx` (replace the whole file):

```tsx
'use client'

import Link from 'next/link'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-sm text-muted mb-6">{error.message || 'An unexpected error occurred.'}</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Try again
        </button>
        <Link
          href="/"
          className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Back to discounts
        </Link>
      </div>
    </main>
  )
}
```

`src/app/layout.tsx`: delete `import { headers } from "next/headers";`, `import AuthTokenInit from "@/components/AuthTokenInit";`, the line `const authToken = (await headers()).get("x-auth-token") ?? "";` (with its blank line) and `<AuthTokenInit initialToken={authToken} />`, and change `export default async function RootLayout` to `export default function RootLayout`. Keep the App Bridge `<script>` and the `shopify-api-key` meta tag exactly as they are.

`eslint.config.mjs`: delete the `no-restricted-imports` rule block that forbids `next/link` (the object whose message starts "Use AuthLink"), leaving the rest of the config intact.

Delete the files:

```bash
git rm src/app/api/auth/start/route.ts src/app/api/auth/callback/route.ts src/components/AuthLink.tsx src/components/AuthTokenInit.tsx src/lib/auth-token.ts src/lib/auth-redirect.ts src/lib/shopify-auth.ts
git grep -n "auth-token\|auth-redirect\|shopify-auth\|AuthLink\|AuthTokenInit\|SHOPIFY_ACCESS_TOKEN\|stt\b" -- src tests   # expected: no output
```

If the last grep prints anything, fix those lines (they are leftovers of the removed approach), do not restore the removed files.

- [ ] **Step 3: Run everything**

```bash
npx vitest run tests/actions/discountActions.test.ts tests/timeDiscounts/actions.test.ts
npx tsc --noEmit
npx eslint src tests --quiet 2>&1 | tail -20
npx vitest run
npx next build --webpack 2>&1 | tail -15
```

Expected: PASS everywhere. `eslint src tests` may report errors in files this task did not touch: scope lint to the files it changed and report any others as pre-existing, by name.

- [ ] **Step 4: Version and commit**

```bash
npm version 0.23.6 --no-git-tag-version
git add -A src tests eslint.config.mjs package.json package-lock.json
git commit -m "refactor: remove the URL-token login now that App Bridge ID tokens carry the session

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push and re-check on the dev store (the user's actions after the PR updates)**

Run `gh pr list --head feat/dev-managed-install-auth --state all --json number,state,baseRefName` and push only if the PR into `dev` is still open (otherwise cut a new branch from `origin/dev` and open a new PR). Then the user, after the dev deployment updates: opens the app from Apps, creates and saves a tier discount, opens a time discount, deletes the throwaway discounts they created, and runs the uninstall check last (uninstall `demo` from `demo-nlmhyat3`, then `session-row.cjs` must show no row; reinstall and open the app: a new session row appears).

---

## After the tasks (controller, not a task)

Run the full verification once more: `npx tsc --noEmit`, `npx vitest run`, `npx next build --webpack`, `node --test extensions/product-tier-pricing-tests/*.test.js` (unchanged, must still pass). Collect every `Ruling:` line from the ledger for the final message. The user merges the PR into `dev`; production is not touched. Afterwards the live-sibling-data gate and its Tasks 2–4 resume on the dev admin.
