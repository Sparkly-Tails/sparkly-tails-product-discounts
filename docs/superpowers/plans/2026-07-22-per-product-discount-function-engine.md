# Per-Product Discount Function Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Shopify app that lets Sparkly Tails staff configure per-product volume discounts (e.g. "5+ units → 14.7% off"), computed live at checkout by a single Shopify Function reading a shop metafield — replacing the group-based, automatic-discount-per-tier model in `sparkly-tails-tiered-pricing-app` (left untouched as a fallback).

**Architecture:** Next.js 16 App Router admin (stateless `?stt=` token auth, no cookies/App Bridge, no database — all state in one shop metafield) for managing per-product tier configs, plus a Rust Shopify Function (`cart.lines.discounts.generate.run`) that reads that same metafield directly and computes the discount for each cart line independently. One function-backed automatic discount is created once and never touched again — config changes take effect on the next cart evaluation with no reconciliation step.

**Tech Stack:** Next.js 16.2.10, React 19.2.4, TypeScript, Tailwind v4, Vitest, Shopify Admin GraphQL API 2025-10, Shopify CLI 3.94.1+, Rust (`shopify_function` crate 2.x), `wasm32-unknown-unknown` target.

## Global Constraints

- No cookies, no App Bridge — stateless `?stt=` HMAC URL token only (10-minute TTL), per the `shopify-app-auth` skill.
- No database of any kind — all config lives in one `shop.metafields.sparkly_tiers.config` JSON blob.
- Scopes: `read_products`, `write_discounts`, `read_discounts` — no `write_products` (no bundle creation in this phase).
- Every internal link must use `AuthLink`, never bare `next/link` (enforced by an ESLint rule).
- Version bump (`package.json`) in the same commit as every code change — patch for fixes, minor for features.
- TDD: write the failing test first for every unit of pure logic (config read/write, tier-math, Rust function logic).
- Rust function code must never import `serde`/`serde_json` directly or any crate besides `shopify_function` — use `shopify_function::prelude::*` only.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `src/app/globals.css`
- Create: `src/app/page.tsx`

**Interfaces:**
- Produces: a running Next.js dev server and a passing `npm run build`, for every later task to build on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sparkly-tails-product-discounts",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20.9.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20.19.43",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors https://admin.shopify.com https://*.myshopify.com;',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create `eslint.config.mjs`**

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(([".next/**", "out/**", "build/**", "next-env.d.ts"])),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/AuthLink.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Use AuthLink (src/components/AuthLink.tsx) instead — a bare next/link silently drops the auth token.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
```

- [ ] **Step 5: Create `postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 7: Create `.nvmrc`**

```
20.20.2
```

- [ ] **Step 8: Create `.gitignore`**

```
node_modules
.next
.env.local
*.log
.DS_Store
target/
extensions/*/target/
```

- [ ] **Step 9: Create `src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: oklch(99% 0.003 145);
  --surface: oklch(97% 0.006 145);
  --line: oklch(88% 0.01 145);
  --foreground: oklch(20% 0.01 145);
  --muted: oklch(45% 0.01 145);
  --subtle: oklch(55% 0.01 145);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(18% 0.012 145);
    --surface: oklch(23% 0.014 145);
    --line: oklch(34% 0.014 145);
    --foreground: oklch(92% 0.006 145);
    --muted: oklch(72% 0.012 145);
    --subtle: oklch(64% 0.012 145);
  }
}

:root {
  --accent: oklch(42% 0.15 155);
  --accent-hover: oklch(35% 0.15 155);
  --danger: oklch(50% 0.19 25);
  --danger-hover: oklch(43% 0.19 25);
}

@theme {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-line: var(--line);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-subtle: var(--subtle);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-danger: var(--danger);
  --color-danger-hover: var(--danger-hover);
}

body {
  background-color: var(--background);
  color: var(--foreground);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 10: Create a placeholder `src/app/page.tsx` (replaced in Task 11)**

```tsx
export default function Home() {
  return <main className="p-8">Sparkly Tails Product Discounts</main>
}
```

Note: `src/app/layout.tsx` is intentionally not created yet — it depends on `AuthTokenInit` (Task 3). Next.js requires a root layout to build, so create a minimal temporary one now, to be replaced in Task 3:

```tsx
import "./globals.css";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Save this as `src/app/layout.tsx`.

- [ ] **Step 11: Install and verify**

Run: `nvm use 20.20.2 && npm install`
Expected: installs cleanly, no errors.

Run: `npm run build`
Expected: `✓ Compiled successfully`, a static/dynamic route table printed for `/`.

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs vitest.config.ts .nvmrc .gitignore src/app/globals.css src/app/page.tsx src/app/layout.tsx package-lock.json
git commit -m "Project scaffold: Next.js 16, Tailwind v4, Vitest (v0.1.0)"
```

---

### Task 2: Auth core (HMAC, stateless token, proxy, OAuth routes)

**Files:**
- Create: `src/lib/shopify-auth.ts`
- Create: `src/proxy.ts`
- Create: `src/app/api/auth/start/route.ts`
- Create: `src/app/api/auth/callback/route.ts`
- Test: `tests/lib/shopify-auth.test.ts`

**Interfaces:**
- Produces: `verifyShopifyHmac(params: URLSearchParams, secret: string): Promise<boolean>`, `makeSessionToken(shop: string, secret: string): Promise<string>`, `verifyUrlToken(token: string, secret: string): Promise<boolean>` — used by `proxy.ts` (this task) and later by `src/lib/auth-redirect.ts` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/shopify-auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { verifyShopifyHmac, makeSessionToken, verifyUrlToken } from '@/lib/shopify-auth'

describe('verifyShopifyHmac', () => {
  it('accepts a correctly signed set of params', async () => {
    const secret = 'test-secret'
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const message = 'shop=test.myshopify.com&timestamp=1700000000'
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
    const hmac = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')

    const params = new URLSearchParams({ shop: 'test.myshopify.com', timestamp: '1700000000', hmac })
    expect(await verifyShopifyHmac(params, secret)).toBe(true)
  })

  it('rejects a tampered param', async () => {
    const params = new URLSearchParams({ shop: 'evil.myshopify.com', timestamp: '1700000000', hmac: 'deadbeef' })
    expect(await verifyShopifyHmac(params, 'test-secret')).toBe(false)
  })

  it('rejects params with no hmac at all', async () => {
    const params = new URLSearchParams({ shop: 'test.myshopify.com' })
    expect(await verifyShopifyHmac(params, 'test-secret')).toBe(false)
  })
})

describe('makeSessionToken / verifyUrlToken', () => {
  it('round-trips a freshly minted token', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'test-secret')
    expect(await verifyUrlToken(token, 'test-secret')).toBe(true)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'right-secret')
    expect(await verifyUrlToken(token, 'wrong-secret')).toBe(false)
  })

  it('rejects a malformed token', async () => {
    expect(await verifyUrlToken('not-a-real-token', 'test-secret')).toBe(false)
  })

  it('rejects a token older than the 10-minute window', async () => {
    const shop = 'test.myshopify.com'
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const oldTs = (Date.now() - 11 * 60 * 1000).toString()
    const payload = `${shop}|${oldTs}`
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const staleToken = `${payload}|${hex}`
    expect(await verifyUrlToken(staleToken, 'secret')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/shopify-auth.test.ts`
Expected: FAIL — `Cannot find module '@/lib/shopify-auth'`

- [ ] **Step 3: Write `src/lib/shopify-auth.ts`**

```ts
// All crypto uses Web Crypto API — safe to import in Edge middleware (proxy.ts).

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verify Shopify's HMAC signature on the initial app-load URL. */
export async function verifyShopifyHmac(
  params: URLSearchParams,
  secret: string,
): Promise<boolean> {
  const hmac = params.get('hmac')
  if (!hmac) return false

  const message = [...params.entries()]
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const digest = await hmacSha256(secret, message)
  return timingSafeEqual(digest, hmac)
}

/** Create a signed session token — carried as the `?stt=` URL param. */
export async function makeSessionToken(
  shop: string,
  secret: string,
): Promise<string> {
  const ts = Date.now().toString()
  const payload = `${shop}|${ts}`
  const sig = await hmacSha256(secret, payload)
  return `${payload}|${sig}`
}

async function verifyTokenWithMaxAge(
  token: string,
  secret: string,
  maxAgeMs: number,
): Promise<boolean> {
  const parts = token.split('|')
  if (parts.length !== 3) return false
  const [shop, ts, sig] = parts
  if (Date.now() - parseInt(ts) > maxAgeMs) return false
  const expected = await hmacSha256(secret, `${shop}|${ts}`)
  return timingSafeEqual(expected, sig)
}

/**
 * Verify a stateless URL/header-carried auth token. 10-minute window since it
 * travels in URLs and request/response headers rather than an httpOnly cookie.
 * No cookie or App Bridge session token is used anywhere in this app.
 */
export async function verifyUrlToken(
  token: string,
  secret: string,
): Promise<boolean> {
  return verifyTokenWithMaxAge(token, secret, 10 * 60 * 1000)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/shopify-auth.test.ts`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Create `src/proxy.ts`**

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  verifyShopifyHmac,
  makeSessionToken,
  verifyUrlToken,
} from '@/lib/shopify-auth'

// No cookie anywhere in this file, deliberately.

async function nextWithFreshToken(req: NextRequest, shop: string, secret: string): Promise<NextResponse> {
  const freshToken = await makeSessionToken(shop, secret)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-auth-token', freshToken)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('x-auth-token', freshToken)
  return res
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
  const shop = process.env.SHOPIFY_SHOP

  if (!secret || !apiKey || !shop) {
    return NextResponse.json(
      { error: 'App misconfigured: missing env vars' },
      { status: 503 },
    )
  }

  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    if (!valid) {
      return new NextResponse('HMAC verification failed', { status: 403 })
    }

    if (searchParams.has('host')) {
      return nextWithFreshToken(req, shop, secret)
    }

    const startUrl = new URL('/api/auth/start', req.url)
    searchParams.forEach((v, k) => startUrl.searchParams.set(k, v))
    return NextResponse.redirect(startUrl)
  }

  const urlToken = searchParams.get('stt')
  if (urlToken && (await verifyUrlToken(urlToken, secret))) {
    return nextWithFreshToken(req, shop, secret)
  }

  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>Open this app from your Shopify admin</h2>
      <p><a href="https://${shop}/admin/apps">Go to Shopify admin &rarr;</a></p>
    </body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html' } },
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
```

- [ ] **Step 6: Create `src/app/api/auth/start/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')

  if (!shop) return new NextResponse('Missing shop', { status: 400 })

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) {
    return new NextResponse('Invalid HMAC', { status: 403 })
  }

  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const scopes = 'read_products,write_discounts,read_discounts'

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', scopes)
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  return NextResponse.redirect(oauthUrl.toString())
}
```

- [ ] **Step 7: Create `src/app/api/auth/callback/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')
  const code = searchParams.get('code')

  if (!shop || !code) {
    return new NextResponse('Missing shop or code', { status: 400 })
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) return new NextResponse('Invalid HMAC', { status: 403 })

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: apiKey, client_secret: secret, code }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('[auth/callback] token exchange failed:', tokenRes.status, body)
    return new NextResponse('Token exchange failed', { status: 502 })
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }

  console.log('[auth/callback] OAuth complete for shop:', shop)
  console.log('[auth/callback] Copy this into SHOPIFY_ACCESS_TOKEN in Vercel env vars:')
  console.log('[auth/callback] ACCESS_TOKEN=' + access_token)

  const adminUrl = `https://${shop}/admin`
  return NextResponse.redirect(adminUrl)
}
```

- [ ] **Step 8: Run full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shopify-auth.ts src/proxy.ts src/app/api/auth tests/lib/shopify-auth.test.ts package.json
git commit -m "Auth core: HMAC verify, stateless token, proxy guard, OAuth routes (v0.2.0)"
```

---

### Task 3: Client-side token plumbing, AuthLink, root layout

**Files:**
- Create: `src/lib/auth-token.ts`
- Create: `src/lib/auth-redirect.ts`
- Create: `src/components/AuthLink.tsx`
- Create: `src/components/AuthTokenInit.tsx`
- Modify: `src/app/layout.tsx`
- Test: `tests/lib/auth-token.test.ts`

**Interfaces:**
- Consumes: `makeSessionToken` from Task 2's `src/lib/shopify-auth.ts`.
- Produces: `appendToken(href, token): string`, `getAuthToken(): string`, `setAuthToken(token)`, `redirectWithToken(path): never` — used by every Server Action from Task 9 onward, and by `AuthLink`/`AuthTokenInit` used on every page from Task 11 onward.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/auth-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { appendToken } from '@/lib/auth-token'

describe('appendToken', () => {
  it('appends stt as a query param to a bare path', () => {
    expect(appendToken('/discounts/new', 'abc123')).toBe('/discounts/new?stt=abc123')
  })

  it('preserves an existing query string', () => {
    expect(appendToken('/discounts?status=live', 'abc123')).toBe('/discounts?status=live&stt=abc123')
  })

  it('returns the href unchanged when token is empty', () => {
    expect(appendToken('/discounts/new', '')).toBe('/discounts/new')
  })

  it('overwrites an existing stt param rather than duplicating it', () => {
    expect(appendToken('/discounts?stt=old', 'new')).toBe('/discounts?stt=new')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/auth-token.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth-token'`

- [ ] **Step 3: Write `src/lib/auth-token.ts`**

```ts
// Client-side auth token state. Plain module-level variable, not React
// state — nothing needs to re-render when it changes.
let currentToken = ''

export function setAuthToken(token: string) {
  currentToken = token
}

export function getAuthToken(): string {
  return currentToken
}

/** Appends `token` as the `stt` query param, preserving any existing query string. */
export function appendToken(href: string, token: string): string {
  if (!token) return href
  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  params.set('stt', token)
  return `${path}?${params.toString()}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/auth-token.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Create `src/lib/auth-redirect.ts`**

```ts
import { redirect } from 'next/navigation'
import { makeSessionToken } from '@/lib/shopify-auth'
import { appendToken } from '@/lib/auth-token'

export async function redirectWithToken(path: string): Promise<never> {
  const shop = process.env.SHOPIFY_SHOP
  const secret = process.env.SHOPIFY_API_SECRET_KEY
  if (shop && secret) {
    const token = await makeSessionToken(shop, secret)
    redirect(appendToken(path, token))
  }
  redirect(path)
}
```

- [ ] **Step 6: Create `src/components/AuthLink.tsx`**

```tsx
import Link from 'next/link'
import type { ComponentProps } from 'react'
import { appendToken } from '@/lib/auth-token'

type AuthLinkProps = ComponentProps<typeof Link> & { token: string }

export default function AuthLink({ href, token, ...rest }: AuthLinkProps) {
  if (typeof href !== 'string') {
    throw new Error('AuthLink requires a string href so the auth token can be appended; got an object href instead.')
  }
  const finalHref = appendToken(href, token)
  return <Link href={finalHref} {...rest} />
}
```

- [ ] **Step 7: Create `src/components/AuthTokenInit.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { setAuthToken, getAuthToken, appendToken } from '@/lib/auth-token'

type WindowWithPatchFlag = { __authFetchPatched?: boolean }

export default function AuthTokenInit({ initialToken }: { initialToken: string }) {
  useEffect(() => {
    setAuthToken(initialToken)

    const w = window as unknown as WindowWithPatchFlag
    if (w.__authFetchPatched) return
    w.__authFetchPatched = true

    const originalFetch = window.fetch.bind(window)
    const origin = window.location.origin

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : null

      if (url === null) {
        return originalFetch(input, init)
      }

      const isSameOrigin = new URL(url, origin).origin === origin
      if (!isSameOrigin) {
        return originalFetch(input, init)
      }

      const urlWithToken = appendToken(url, getAuthToken())
      const response = await originalFetch(urlWithToken, init)
      const freshToken = response.headers.get('x-auth-token')
      if (freshToken) setAuthToken(freshToken)
      return response
    }
  }, [initialToken])

  return null
}
```

- [ ] **Step 8: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import AuthTokenInit from "@/components/AuthTokenInit";
import packageJson from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sparkly Tails — Product Discounts",
  description: "Per-product volume pricing admin",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authToken = (await headers()).get("x-auth-token") ?? "";

  return (
    <html lang="en">
      <body>
        <AuthTokenInit initialToken={authToken} />
        <div className="text-xs text-subtle text-right px-4 pt-1">
          v{packageJson.version}
        </div>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Run full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth-token.ts src/lib/auth-redirect.ts src/components/AuthLink.tsx src/components/AuthTokenInit.tsx src/app/layout.tsx tests/lib/auth-token.test.ts package.json
git commit -m "Client-side token plumbing, AuthLink, root layout with version badge (v0.3.0)"
```

---

### Task 4: Shopify GraphQL client

**Files:**
- Create: `src/lib/shopify-client.ts`
- Test: `tests/lib/shopify-client.test.ts`

**Interfaces:**
- Produces: `shopifyQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T>` — used by every task from Task 5 onward that talks to Shopify's Admin API.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/shopify-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyQuery } from '@/lib/shopify-client'

describe('shopifyQuery', () => {
  beforeEach(() => {
    process.env.SHOPIFY_SHOP = 'test.myshopify.com'
    process.env.SHOPIFY_ACCESS_TOKEN = 'test-token'
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/shopify-client.test.ts`
Expected: FAIL — `Cannot find module '@/lib/shopify-client'`

- [ ] **Step 3: Write `src/lib/shopify-client.ts`**

```ts
const SHOPIFY_API_VERSION = '2025-10'

function apiUrl(): string {
  const shop = process.env.SHOPIFY_SHOP
  if (!shop) throw new Error('SHOPIFY_SHOP is not set')
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
}

function accessToken(): string {
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!token) throw new Error('SHOPIFY_ACCESS_TOKEN is not set')
  return token
}

export async function shopifyQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken(),
    },
    body: JSON.stringify({ query, variables }),
  })

  let json: { data?: T; errors?: unknown }
  try {
    json = await res.json()
  } catch (err) {
    throw new Error(
      `Shopify API returned a non-JSON response (HTTP ${res.status} ${res.statusText}): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new Error(`Shopify API error (HTTP ${res.status}): ${JSON.stringify(json)}`)
  }

  if (json.errors) {
    throw new Error(
      Array.isArray(json.errors)
        ? json.errors.map((e: { message: string }) => e.message).join('; ')
        : JSON.stringify(json.errors),
    )
  }
  return json.data as T
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/shopify-client.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shopify-client.ts tests/lib/shopify-client.test.ts package.json
git commit -m "Add Shopify Admin GraphQL client (v0.4.0)"
```

---

### Task 5: Pricing math

**Files:**
- Create: `src/lib/tier-math.ts`
- Test: `tests/lib/tier-math.test.ts`

**Interfaces:**
- Produces: `resultingPrice(basePrice: number, percentOff: number): number` — used by Task 7's product-info lookup for admin preview, and mirrored independently in the Rust function (Task 12) for the live checkout computation.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/tier-math.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resultingPrice } from '@/lib/tier-math'

describe('resultingPrice', () => {
  it('computes a simple percentage off', () => {
    expect(resultingPrice(10.0, 10)).toBe(9.0)
  })

  it('computes a fractional percentage off', () => {
    expect(resultingPrice(1.70, 14.7)).toBeCloseTo(1.45, 2)
  })

  it('rounds to 2 decimal places using standard rounding', () => {
    // 1.4501 rounds up, not down — the classic float-rounding trap
    expect(resultingPrice(1.4501, 0)).toBe(1.45)
  })

  it('returns the base price unchanged at 0% off', () => {
    expect(resultingPrice(20.0, 0)).toBe(20.0)
  })

  it('returns 0 at 100% off', () => {
    expect(resultingPrice(20.0, 100)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/tier-math.test.ts`
Expected: FAIL — `Cannot find module '@/lib/tier-math'`

- [ ] **Step 3: Write `src/lib/tier-math.ts`**

```ts
/**
 * Given a base price and a percentage off (e.g. 14.7 for 14.7%), returns
 * the actual price a customer pays, rounded to 2 decimal places using
 * standard rounding — the same rounding Shopify applies at checkout.
 */
export function resultingPrice(basePrice: number, percentOff: number): number {
  const fraction = percentOff / 100
  const raw = basePrice * (1 - fraction)
  return Math.round(raw * 100) / 100
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/tier-math.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tier-math.ts tests/lib/tier-math.test.ts package.json
git commit -m "Add pure pricing math for the admin preview (v0.5.0)"
```

---

### Task 6: Config data model and metafield read/write layer

**Files:**
- Create: `src/lib/config.ts`
- Test: `tests/lib/config.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery` from Task 4.
- Produces: `Tier { minQty: number; percentOff: number }`, `ProductDiscount { productId: string; status: 'draft' | 'live'; tiers: Tier[] }`, `Config { products: ProductDiscount[] }`, `getConfig(): Promise<Config>`, `saveConfig(config: Config): Promise<void>` — used by every Server Action from Task 9 onward and read by the Rust function (Task 12) via the same metafield.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/config.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, type Config } from '@/lib/config'
import * as shopifyClient from '@/lib/shopify-client'

describe('getConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses the stored config JSON', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify({ products: [{ productId: 'gid://shopify/Product/1', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }] }) } },
    })

    const config = await getConfig()
    expect(config).toEqual({
      products: [{ productId: 'gid://shopify/Product/1', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
  })

  it('returns an empty product list when no metafield exists yet', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })

    const config = await getConfig()
    expect(config).toEqual({ products: [] })
  })
})

describe('saveConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the config as a JSON shop metafield', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: Config = { products: [{ productId: 'gid://shopify/Product/1', status: 'draft', tiers: [] }] }
    await saveConfig(config)

    expect(shopIdSpy).toHaveBeenCalledTimes(2)
    expect(shopIdSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            ownerId: 'gid://shopify/Shop/1',
            namespace: 'sparkly_tiers',
            key: 'config',
            type: 'json',
            value: JSON.stringify(config),
          }),
        ],
      }),
    )
  })

  it('throws when Shopify reports userErrors', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] } })

    await expect(saveConfig({ products: [] })).rejects.toThrow('Invalid JSON')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/config.test.ts`
Expected: FAIL — `Cannot find module '@/lib/config'`

- [ ] **Step 3: Write `src/lib/config.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'

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

const NAMESPACE = 'sparkly_tiers'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(
    `query { shop { id } }`,
  )
  return data.shop.id
}

export async function getConfig(): Promise<Config> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) {
    return { products: [] }
  }

  return JSON.parse(data.shop.metafield.value) as Config
}

export async function saveConfig(config: Config): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: NAMESPACE,
          key: 'config',
          type: 'json',
          value: JSON.stringify(config),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/config.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts tests/lib/config.test.ts package.json
git commit -m "Add per-product Config data model and metafield read/write (v0.6.0)"
```

---

### Task 7: Product search and price lookup

**Files:**
- Create: `src/lib/products.ts`
- Test: `tests/lib/products.test.ts`

**Interfaces:**
- Consumes: `shopifyQuery` from Task 4.
- Produces: `ProductSearchResult { id: string; title: string }`, `searchProducts(query: string): Promise<ProductSearchResult[]>`, `ProductInfo { title: string; basePrice: number }`, `getProductInfo(productId: string): Promise<ProductInfo | null>` — used by Task 8's `ProductPicker` and Task 10's discount-editor preview.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/products.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProducts, getProductInfo } from '@/lib/products'
import * as shopifyClient from '@/lib/shopify-client'

describe('searchProducts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns matching products with real ids', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      products: {
        edges: [
          { node: { id: 'gid://shopify/Product/111', title: 'Chicken Voucher' } },
        ],
      },
    })

    const result = await searchProducts('chicken')
    expect(result).toEqual([{ id: 'gid://shopify/Product/111', title: 'Chicken Voucher' }])
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('products(first: 8'), { q: 'chicken' })
  })

  it('returns an empty array without calling shopifyQuery for a blank query', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await searchProducts('   ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('getProductInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns title and base price parsed from the first variant', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: {
        title: 'Chicken Voucher',
        variants: { edges: [{ node: { price: '1.70' } }] },
      },
    })

    expect(await getProductInfo('gid://shopify/Product/111')).toEqual({ title: 'Chicken Voucher', basePrice: 1.70 })
  })

  it('returns null when the product does not exist', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ product: null })
    expect(await getProductInfo('gid://shopify/Product/999')).toBeNull()
  })

  it('returns null when the product has no variants', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: { title: 'Empty Product', variants: { edges: [] } },
    })
    expect(await getProductInfo('gid://shopify/Product/222')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/products.test.ts`
Expected: FAIL — `Cannot find module '@/lib/products'`

- [ ] **Step 3: Write `src/lib/products.ts`**

```ts
import { shopifyQuery } from '@/lib/shopify-client'

export interface ProductSearchResult {
  id: string
  title: string
}

/**
 * Search-as-you-type lookup for the product picker. Empty/whitespace query
 * short-circuits to no results without a network call, matching the
 * picker's debounce.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  if (!query.trim()) return []

  const data = await shopifyQuery<{
    products: { edges: { node: { id: string; title: string } }[] }
  }>(
    `query searchProducts($q: String!) {
      products(first: 8, query: $q) {
        edges { node { id title } }
      }
    }`,
    { q: query },
  )

  return data.products.edges.map((e) => e.node)
}

export interface ProductInfo {
  title: string
  basePrice: number
}

/**
 * Fetches a product's title and real base price (the first variant's
 * price). Assumes a single-variant product, consistent with this app's
 * per-product tier scoping. Returns null if the product doesn't exist or
 * has no variants, so callers can skip a stale product id rather than crash.
 */
export async function getProductInfo(productId: string): Promise<ProductInfo | null> {
  const data = await shopifyQuery<{
    product: {
      title: string
      variants: { edges: { node: { price: string } }[] }
    } | null
  }>(
    `query getProductInfo($id: ID!) {
      product(id: $id) {
        title
        variants(first: 1) {
          edges { node { price } }
        }
      }
    }`,
    { id: productId },
  )

  if (!data.product) return null
  const firstVariant = data.product.variants.edges[0]?.node
  if (!firstVariant) return null

  return {
    title: data.product.title,
    basePrice: parseFloat(firstVariant.price),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/products.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/products.ts tests/lib/products.test.ts package.json
git commit -m "Add product search and price lookup (v0.7.0)"
```

---

### Task 8: TierFields and ProductPicker components

**Files:**
- Create: `src/components/TierFields.tsx`
- Create: `src/actions/productSearchAction.ts`
- Create: `src/components/ProductPicker.tsx`

**Interfaces:**
- Consumes: `searchProducts` from Task 7 (wrapped as a Server Action).
- Produces: `<TierFields initial={Tier[]} />` — renders hidden inputs named `tier-${i}-minQty`/`tier-${i}-percentOff`, add/remove rows, minimum 1. `<ProductPicker initialProduct={ProductSearchResult | null} />` — a single-product search-and-select field rendering a hidden `productId` input, used by Task 10's "new discount" form.

- [ ] **Step 1: Create `src/components/TierFields.tsx`**

```tsx
'use client'

import { useState } from 'react'

type TierRow = { key: string; minQty: string; percentOff: string }

function makeRow(minQty = '', percentOff = ''): TierRow {
  return { key: crypto.randomUUID(), minQty, percentOff }
}

export default function TierFields({
  initial,
}: {
  initial?: { minQty: number; percentOff: number }[]
}) {
  const [rows, setRows] = useState<TierRow[]>(() =>
    initial && initial.length > 0
      ? initial.map((t) => makeRow(String(t.minQty), String(t.percentOff)))
      : [makeRow()],
  )

  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  function updateRow(key: string, field: 'minQty' | 'percentOff', value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.key} className="flex flex-wrap gap-2 items-center">
          <label htmlFor={`tier-${i}-minQty`} className="sr-only">
            Tier {i + 1} minimum quantity
          </label>
          <input
            id={`tier-${i}-minQty`}
            name={`tier-${i}-minQty`}
            type="number"
            min="1"
            placeholder="Min qty (e.g. 5)"
            value={row.minQty}
            onChange={(e) => updateRow(row.key, 'minQty', e.target.value)}
            className="border border-line rounded px-3 py-2 w-40 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <span className="text-sm text-muted">+ units →</span>
          <label htmlFor={`tier-${i}-percentOff`} className="sr-only">
            Tier {i + 1} percent off
          </label>
          <input
            id={`tier-${i}-percentOff`}
            name={`tier-${i}-percentOff`}
            type="number"
            min="0"
            max="100"
            step="0.1"
            placeholder="% off (e.g. 14.7)"
            value={row.percentOff}
            onChange={(e) => updateRow(row.key, 'percentOff', e.target.value)}
            className="border border-line rounded px-3 py-2 w-40 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            disabled={rows.length <= 1}
            aria-label={`Remove tier ${i + 1}`}
            className="text-danger hover:text-danger-hover disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
      >
        + Add tier
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/actions/productSearchAction.ts`**

```ts
'use server'

import { searchProducts, type ProductSearchResult } from '@/lib/products'

/**
 * Backs the product picker's search box. Swallows errors and returns no
 * results rather than throwing — this fires on every debounced keystroke.
 */
export async function searchProductsAction(query: string): Promise<ProductSearchResult[]> {
  try {
    return await searchProducts(query)
  } catch (err) {
    console.error('[searchProductsAction] search failed:', err)
    return []
  }
}
```

- [ ] **Step 3: Create `src/components/ProductPicker.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { searchProductsAction } from '@/actions/productSearchAction'
import type { ProductSearchResult } from '@/lib/products'

export default function ProductPicker({
  initialProduct,
}: {
  initialProduct: ProductSearchResult | null
}) {
  const [selected, setSelected] = useState<ProductSearchResult | null>(initialProduct)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const matches = await searchProductsAction(value)
      setResults(matches)
      setSearching(false)
      setOpen(true)
    }, 300)
  }

  function selectProduct(product: ProductSearchResult) {
    setSelected(product)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div>
      <input type="hidden" name="productId" value={selected?.id ?? ''} />

      {selected ? (
        <div className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-3">
          <span className="text-sm truncate">{selected.title}</span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Change product"
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <label htmlFor="product-search" className="sr-only">
            Search for a product
          </label>
          <input
            id="product-search"
            type="text"
            placeholder="Search for a product…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
          {open && results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onMouseDown={() => selectProduct(product)}
                    className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                  >
                    {product.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run build to verify it compiles**

Run: `npm run build`
Expected: `✓ Compiled successfully`, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/TierFields.tsx src/components/ProductPicker.tsx src/actions/productSearchAction.ts package.json
git commit -m "Add TierFields and single-product ProductPicker components (v0.8.0)"
```

---

### Task 9: Discount Server Actions

**Files:**
- Create: `src/actions/discountActions.ts`
- Test: `tests/actions/discountActions.test.ts`

**Interfaces:**
- Consumes: `getConfig`, `saveConfig`, `ProductDiscount`, `Tier` from Task 6; `redirectWithToken` from Task 3.
- Produces: `createDiscount(formData: FormData): Promise<void>`, `updateTiers(productId: string, formData: FormData): Promise<void>`, `setStatus(productId: string, status: 'draft' | 'live'): Promise<void>`, `deleteDiscount(productId: string): Promise<void>` — used by Task 10's pages/forms.

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/discountActions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDiscount, updateTiers, setStatus, deleteDiscount } from '@/actions/discountActions'
import * as configLib from '@/lib/config'
import * as authRedirect from '@/lib/auth-redirect'

vi.mock('@/lib/auth-redirect', () => ({ redirectWithToken: vi.fn() }))

describe('createDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('adds a new product discount with parsed tiers', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    expect(authRedirect.redirectWithToken).toHaveBeenCalledWith('/discounts/gid%3A%2F%2Fshopify%2FProduct%2F111')
  })

  it('throws when no product is selected', async () => {
    const formData = new FormData()
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(createDiscount(formData)).rejects.toThrow('A product is required')
  })

  it('throws when no valid tier is provided', async () => {
    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    await expect(createDiscount(formData)).rejects.toThrow('At least one tier is required')
  })

  it('throws when the product already has a discount configured', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [] }],
    })
    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(createDiscount(formData)).rejects.toThrow('already has a discount configured')
  })
})

describe('updateTiers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('replaces the tiers for an existing product', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')
    formData.set('tier-1-minQty', '8')
    formData.set('tier-1-percentOff', '12')

    await updateTiers('gid://shopify/Product/111', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{
        productId: 'gid://shopify/Product/111',
        status: 'live',
        tiers: [{ minQty: 3, percentOff: 5 }, { minQty: 8, percentOff: 12 }],
      }],
    })
  })

  it('throws when the product has no existing discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [] })
    const formData = new FormData()
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(updateTiers('gid://shopify/Product/999', formData)).rejects.toThrow('not found')
  })
})

describe('setStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('flips a product discount to live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await setStatus('gid://shopify/Product/111', 'live')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
  })
})

describe('deleteDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes the product entirely from config', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [
        { productId: 'gid://shopify/Product/111', status: 'live', tiers: [] },
        { productId: 'gid://shopify/Product/222', status: 'draft', tiers: [] },
      ],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await deleteDiscount('gid://shopify/Product/111')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/222', status: 'draft', tiers: [] }],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: FAIL — `Cannot find module '@/actions/discountActions'`

- [ ] **Step 3: Write `src/actions/discountActions.ts`**

```ts
'use server'

import { getConfig, saveConfig, type Tier, type ProductDiscount } from '@/lib/config'
import { redirectWithToken } from '@/lib/auth-redirect'

function parseTiersFromForm(formData: FormData): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    const rawPercentOff = Number(formData.get(`tier-${i}-percentOff`))
    const percentOff = Math.round(rawPercentOff * 10) / 10
    if (minQty > 0 && percentOff >= 0) {
      tiers.push({ minQty, percentOff })
    }
    i++
  }
  return tiers.sort((a, b) => a.minQty - b.minQty)
}

export async function createDiscount(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '').trim()
  if (!productId) throw new Error('A product is required')

  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  if (config.products.some((p) => p.productId === productId)) {
    throw new Error(`Product ${productId} already has a discount configured`)
  }

  const newDiscount: ProductDiscount = { productId, status: 'draft', tiers }
  await saveConfig({ products: [...config.products, newDiscount] })

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function updateTiers(productId: string, formData: FormData): Promise<void> {
  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.tiers = tiers
  await saveConfig(config)

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function setStatus(productId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.status = status
  await saveConfig(config)

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function deleteDiscount(productId: string): Promise<void> {
  const config = await getConfig()
  const remaining = config.products.filter((p) => p.productId !== productId)
  await saveConfig({ products: remaining })

  await redirectWithToken('/')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/actions/discountActions.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests across all files pass.

- [ ] **Step 6: Commit**

```bash
git add src/actions/discountActions.ts tests/actions/discountActions.test.ts package.json
git commit -m "Add discount Server Actions: create, update tiers, set status, delete (v0.9.0)"
```

---

### Task 10: Pages — discounts list, add, edit

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/app/discounts/new/page.tsx`
- Create: `src/app/discounts/[productId]/page.tsx`
- Create: `src/components/ConfirmForm.tsx`

**Interfaces:**
- Consumes: `getConfig` (Task 6), `getProductInfo` (Task 7), `resultingPrice` (Task 5), `TierFields`/`ProductPicker` (Task 8), `createDiscount`/`updateTiers`/`setStatus`/`deleteDiscount` (Task 9), `AuthLink` (Task 3).

- [ ] **Step 1: Create `src/components/ConfirmForm.tsx`**

```tsx
'use client'

import type { ReactNode } from 'react'

/**
 * Wraps a Server Action form with a native confirm() before submit — for
 * actions with real, immediate consequences that shouldn't fire on a single
 * accidental click.
 */
export default function ConfirmForm({
  action,
  confirmMessage,
  children,
}: {
  action: () => Promise<void>
  confirmMessage: string
  children: ReactNode
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault()
        }
      }}
    >
      {children}
    </form>
  )
}
```

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import { headers } from 'next/headers'
import { getConfig } from '@/lib/config'
import { getProductInfo } from '@/lib/products'
import AuthLink from '@/components/AuthLink'

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const rows = await Promise.all(
    config.products.map(async (p) => {
      const info = await getProductInfo(p.productId)
      return { ...p, title: info?.title ?? `${p.productId} — not found` }
    }),
  )

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Product Discounts</h1>
        <AuthLink
          href="/discounts/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add discount
        </AuthLink>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">No product discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.productId} className="py-4">
              <AuthLink
                href={`/discounts/${encodeURIComponent(row.productId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.title}
              </AuthLink>
              <p className="text-sm text-muted">
                {row.status} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Create `src/app/discounts/new/page.tsx`**

```tsx
import { createDiscount } from '@/actions/discountActions'
import ProductPicker from '@/components/ProductPicker'
import TierFields from '@/components/TierFields'

export default function NewDiscountPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add discount</h1>

      <form action={createDiscount} className="space-y-6">
        <div>
          <p className="block text-sm font-medium mb-2">Product</p>
          <ProductPicker initialProduct={null} />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <TierFields />
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price before you go live.
          </p>
        </div>

        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Create draft discount
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Create `src/app/discounts/[productId]/page.tsx`**

```tsx
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/config'
import { getProductInfo } from '@/lib/products'
import { resultingPrice } from '@/lib/tier-math'
import { updateTiers, setStatus, deleteDiscount } from '@/actions/discountActions'
import TierFields from '@/components/TierFields'
import ConfirmForm from '@/components/ConfirmForm'

export default async function DiscountPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId: encodedProductId } = await params
  const productId = decodeURIComponent(encodedProductId)
  await headers()

  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) notFound()

  const info = await getProductInfo(productId)

  const updateTiersWithId = updateTiers.bind(null, productId)
  const goLive = setStatus.bind(null, productId, 'live')
  const goDraft = setStatus.bind(null, productId, 'draft')
  const remove = deleteDiscount.bind(null, productId)

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">
        {info ? info.title : `${productId} — not found`}
      </h1>
      <p className="text-sm text-muted mb-6">{discount.status}</p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <form action={updateTiersWithId} className="space-y-3">
          <TierFields initial={discount.tiers} />
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Save tiers
          </button>
        </form>
      </section>

      {info && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Resulting prices</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-line">
                <th className="py-1">Min qty</th>
                <th className="py-1">% off</th>
                <th className="py-1">Price</th>
              </tr>
            </thead>
            <tbody>
              {discount.tiers.map((tier) => (
                <tr key={tier.minQty} className="border-b border-line">
                  <td className="py-1">{tier.minQty}+</td>
                  <td className="py-1">{tier.percentOff}%</td>
                  <td className="py-1">£{resultingPrice(info.basePrice, tier.percentOff).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex gap-3">
        {discount.status === 'draft' ? (
          <ConfirmForm
            action={goLive}
            confirmMessage={`Go live with this discount? This creates a real, active discount for this product immediately.`}
          >
            <button
              type="submit"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Go live
            </button>
          </ConfirmForm>
        ) : (
          <ConfirmForm
            action={goDraft}
            confirmMessage={`Take this discount offline? It stops applying immediately.`}
          >
            <button
              type="submit"
              className="bg-danger hover:bg-danger-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              Take offline
            </button>
          </ConfirmForm>
        )}
        <ConfirmForm
          action={remove}
          confirmMessage={`Delete this discount entirely? This cannot be undone.`}
        >
          <button
            type="submit"
            className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Delete
          </button>
        </ConfirmForm>
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Run full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds, routes listed: `/`, `/discounts/new`, `/discounts/[productId]`.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/discounts src/components/ConfirmForm.tsx package.json
git commit -m "Add discounts list, add, and edit pages (v0.10.0)"
```

---

### Task 11: Error and not-found boundaries

**Files:**
- Create: `src/app/error.tsx`
- Create: `src/app/not-found.tsx`

**Interfaces:**
- Consumes: `getAuthToken`, `appendToken` from Task 3.

- [ ] **Step 1: Create `src/app/error.tsx`**

```tsx
'use client'

import { getAuthToken, appendToken } from '@/lib/auth-token'

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
        <a
          href={appendToken('/', getAuthToken())}
          className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Back to discounts
        </a>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Create `src/app/not-found.tsx`**

```tsx
import { headers } from 'next/headers'
import AuthLink from '@/components/AuthLink'

export default async function NotFound() {
  const token = (await headers()).get('x-auth-token') ?? ''

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Discount not found</h1>
      <p className="text-sm text-muted mb-6">
        It may have been deleted, or the link is out of date.
      </p>
      <AuthLink
        href="/"
        token={token}
        className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Back to discounts
      </AuthLink>
    </main>
  )
}
```

- [ ] **Step 3: Run full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/error.tsx src/app/not-found.tsx package.json
git commit -m "Add error and not-found boundaries (v0.11.0)"
```

---

### Task 12: Shopify Function — scaffold, logic, tests

**Files:**
- Create: `shopify.app.toml`
- Create: `extensions/product-discount/shopify.extension.toml`
- Create: `extensions/product-discount/Cargo.toml`
- Create: `extensions/product-discount/src/main.rs`
- Create: `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`
- Create: `extensions/product-discount/src/cart_lines_discounts_generate_run.graphql`

**Interfaces:**
- Consumes: the `Config` JSON shape from Task 6 (`{ products: [{ productId, status, tiers: [{ minQty, percentOff }] }] }`), read from `shop.metafields.sparkly_tiers.config` — the exact same metafield the admin app (Tasks 6–10) writes.
- Produces: a deployable discount function, `cart_lines_discounts_generate_run`, referenced by Task 13's one-time discount activation.

- [ ] **Step 1: Scaffold the app and generate the extension**

Run: `nvm use 20.20.2 && shopify app init --template none -n "sparkly-tails-product-discounts" -p . -d npm`
(Follow the interactive prompts: select the Sparkly Tails organization, create as a new app.)

Run: `shopify app generate extension --template discount --flavor rust --name=product-discount`

This generates a default template at `extensions/product-discount/` — replace its generated files with the ones below (the default template implements an unrelated "10% off order + 20% off product" demo; this task replaces that logic entirely).

- [ ] **Step 2: Write `extensions/product-discount/Cargo.toml`**

```toml
[package]
name = "product-discount"
version = "1.0.0"
edition = "2021"

[dependencies]
shopify_function = "2.1.0"

[profile.release]
lto = true
opt-level = "z"
strip = true
```

- [ ] **Step 3: Write `extensions/product-discount/shopify.extension.toml`**

```toml
api_version = "2026-04"

[[extensions]]
name = "Product tier discounts"
handle = "product-discount"
type = "function"
description = "Applies per-product volume discounts configured in the Product Discounts admin."

  [[extensions.targeting]]
  target = "cart.lines.discounts.generate.run"
  input_query = "src/cart_lines_discounts_generate_run.graphql"
  export = "cart_lines_discounts_generate_run"

  [extensions.build]
  command = "cargo build --target=wasm32-unknown-unknown --release"
  path = "target/wasm32-unknown-unknown/release/product_discount.wasm"
  watch = [ "src/**/*.rs" ]
```

- [ ] **Step 4: Write `extensions/product-discount/src/cart_lines_discounts_generate_run.graphql`**

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      merchandise {
        __typename
        ... on ProductVariant {
          product {
            id
          }
        }
      }
    }
  }
  shop {
    metafield(namespace: "sparkly_tiers", key: "config") {
      jsonValue
    }
  }
  discount {
    discountClasses
  }
}
```

- [ ] **Step 5: Write `extensions/product-discount/src/main.rs`**

```rust
use shopify_function::prelude::*;
use std::process;

pub mod cart_lines_discounts_generate_run;

#[typegen("schema.graphql")]
pub mod schema {
    #[query(
        "src/cart_lines_discounts_generate_run.graphql",
        custom_scalar_overrides = {
            "Input.shop.metafield.jsonValue" => super::cart_lines_discounts_generate_run::Config
        }
    )]
    pub mod cart_lines_discounts_generate_run {}
}

fn main() {
    log!("Please invoke a named export.");
    process::abort();
}
```

- [ ] **Step 6: Write `extensions/product-discount/src/cart_lines_discounts_generate_run.rs`**

```rust
use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Tier {
    min_qty: i32,
    percent_off: f64,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct ProductConfig {
    product_id: String,
    status: String,
    tiers: Vec<Tier>,
}

#[derive(Deserialize, Default, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
pub struct Config {
    products: Vec<ProductConfig>,
}

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let has_product_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Product);

    if !has_product_discount_class {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let config: &Config = match input.shop().metafield() {
        Some(metafield) => metafield.json_value(),
        None => return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] }),
    };

    let mut candidates = vec![];

    for line in input.cart().lines().iter() {
        let variant = match line.merchandise() {
            schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(v) => v,
            _ => continue,
        };
        let product_id = variant.product().id();

        let product_config = config
            .products
            .iter()
            .find(|p| &p.product_id == product_id && p.status == "live");

        let product_config = match product_config {
            Some(pc) => pc,
            None => continue,
        };

        let quantity = *line.quantity();

        let best_tier = product_config
            .tiers
            .iter()
            .filter(|t| t.min_qty <= quantity)
            .max_by_key(|t| t.min_qty);

        if let Some(tier) = best_tier {
            candidates.push(schema::ProductDiscountCandidate {
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget {
                        id: line.id().clone(),
                        quantity: None,
                    },
                )],
                message: Some(format!("{}% off", tier.percent_off)),
                value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                    value: Decimal(tier.percent_off),
                }),
                associated_discount_code: None,
                prerequisites: None,
            });
        }
    }

    if candidates.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    Ok(schema::CartLinesDiscountsGenerateRunResult {
        operations: vec![schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                selection_strategy: schema::ProductDiscountSelectionStrategy::First,
                candidates,
            },
        )],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use shopify_function::{run_function_with_input, Result};

    #[test]
    fn applies_the_matching_tier_for_a_live_product() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [
                                        { "minQty": 5, "percentOff": 10.0 },
                                        { "minQty": 10, "percentOff": 20.0 }
                                    ]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        Ok(())
    }

    #[test]
    fn applies_no_discount_below_the_lowest_threshold() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 2,
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn ignores_a_product_with_no_discount_configured() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 10,
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/999" }
                            }
                        }
                    ]
                },
                "shop": { "metafield": { "jsonValue": { "products": [] } } },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn ignores_a_draft_product_discount() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 10,
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "draft",
                                    "tiers": [{ "minQty": 5, "percentOff": 10.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 0);
        Ok(())
    }

    #[test]
    fn applies_independent_tiers_to_two_different_products_in_one_cart() -> Result<()> {
        let result = run_function_with_input(
            cart_lines_discounts_generate_run,
            r#"{
                "cart": {
                    "lines": [
                        {
                            "id": "gid://shopify/CartLine/0",
                            "quantity": 5,
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/1" }
                            }
                        },
                        {
                            "id": "gid://shopify/CartLine/1",
                            "quantity": 20,
                            "merchandise": {
                                "__typename": "ProductVariant",
                                "product": { "id": "gid://shopify/Product/2" }
                            }
                        }
                    ]
                },
                "shop": {
                    "metafield": {
                        "jsonValue": {
                            "products": [
                                {
                                    "productId": "gid://shopify/Product/1",
                                    "status": "live",
                                    "tiers": [{ "minQty": 5, "percentOff": 8.0 }]
                                },
                                {
                                    "productId": "gid://shopify/Product/2",
                                    "status": "live",
                                    "tiers": [{ "minQty": 10, "percentOff": 25.0 }]
                                }
                            ]
                        }
                    }
                },
                "discount": { "discountClasses": ["PRODUCT"] }
            }"#,
        )?;
        assert_eq!(result.operations.len(), 1);
        match &result.operations[0] {
            schema::CartOperation::ProductDiscountsAdd(op) => assert_eq!(op.candidates.len(), 2),
            _ => panic!("expected ProductDiscountsAdd"),
        }
        Ok(())
    }
}
```

- [ ] **Step 7: Build the function**

Run: `cd extensions/product-discount && shopify app function build`
Expected: `✓ Function built successfully.`

- [ ] **Step 8: Run the Rust unit tests**

Run: `cargo test --manifest-path extensions/product-discount/Cargo.toml`
Expected: `test result: ok. 5 passed; 0 failed`

- [ ] **Step 9: Commit**

```bash
git add shopify.app.toml extensions/product-discount package.json
git commit -m "Add per-product discount Shopify Function with unit tests (v0.12.0)"
```

---

### Task 13: One-time discount activation and migration/cutover

**Files:**
- Create: `scripts/activate-discount.mjs`

**Interfaces:**
- Consumes: the function ID produced by deploying Task 12's extension.
- Produces: the one live `discountAutomaticApp` discount this whole engine depends on — created once, never touched again by application code (per spec §2.4/§6).

- [ ] **Step 1: Deploy the app and extension**

Run: `shopify app deploy`
(Confirm release when prompted. Note the function ID shown for `product-discount`, or retrieve it afterward via the `appDiscountTypesNodes` query as in the earlier eligibility spike.)

- [ ] **Step 2: Install the app on the real store, alongside the existing app**

Install `sparkly-tails-product-discounts` on `sparklytails.myshopify.com` via its Partners install link. Set `SHOPIFY_SHOP`, `SHOPIFY_API_SECRET_KEY`, `NEXT_PUBLIC_SHOPIFY_API_KEY`, `SHOPIFY_ACCESS_TOKEN` (captured from the OAuth callback console log, Task 2) in the Vercel deployment's environment variables.

- [ ] **Step 3: Write `scripts/activate-discount.mjs`**

```js
// Run once, manually, after the function is deployed and its ID is known.
// Usage: node scripts/activate-discount.mjs <functionId>
const functionId = process.argv[2]
if (!functionId) {
  console.error('Usage: node scripts/activate-discount.mjs <functionId>')
  process.exit(1)
}

const shop = process.env.SHOPIFY_SHOP
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN

if (!shop || !accessToken) {
  console.error('Set SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN before running this script.')
  process.exit(1)
}

const res = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': accessToken,
  },
  body: JSON.stringify({
    query: `mutation activateDiscount($functionId: String!) {
      discountAutomaticAppCreate(automaticAppDiscount: {
        title: "Product tier discounts"
        functionId: $functionId
        startsAt: "${new Date().toISOString()}"
        discountClasses: [PRODUCT]
      }) {
        automaticAppDiscount { discountId title status }
        userErrors { field message code }
      }
    }`,
    variables: { functionId },
  }),
})

const json = await res.json()
console.log(JSON.stringify(json, null, 2))

if (json.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
  console.error('Activation failed — see userErrors above.')
  process.exit(1)
}

console.log('Discount activated:', json.data.discountAutomaticAppCreate.automaticAppDiscount)
```

- [ ] **Step 2: Run it**

Run: `node scripts/activate-discount.mjs <functionId>`
Expected: `status: "ACTIVE"`, empty `userErrors`.

- [ ] **Step 3: Pilot on a handful of real products**

Configure 2-3 real products' discounts through the new admin app (draft, then go live). Verify with a real test cart on `sparklytails.myshopify.com` that the correct discounted price applies at the configured quantity thresholds, before migrating any more products.

- [ ] **Step 4: Gradual cutover, per product**

For each product migrated to the new app's config (and confirmed working in a real cart): delete that product's corresponding automatic discount(s) in the existing `sparkly-tails-tiered-pricing-app`'s Shopify admin (Discounts section), or via its own `discountAutomaticDelete` mutation. Do this only after the new engine is confirmed working for that specific product — Shopify's discount combination rules mean a product briefly covered by both isn't double-discounted or left with nothing, so there's no unsafe window during a gradual, per-product migration.

- [ ] **Step 5: Commit**

```bash
git add scripts/activate-discount.mjs package.json
git commit -m "Add one-time discount-activation script and migration runbook (v0.13.0)"
```

---

## Self-Review

**Spec coverage:** §2.3 (drop groups) → Task 6's `Config` shape. §2.4 (shop-metafield-driven function) → Task 12. §3 (data model) → Task 6. §4 (admin UI) → Tasks 8, 10. §5 (function logic) → Task 12. §6 (migration/cutover) → Task 13. §7 (testing) → every task's TDD steps plus Task 12's Rust unit tests. §8 (bundle creation, storefront widget) → explicitly out of scope, no task references them.

**Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code; no "similar to Task N" references — the TierFields/ProductPicker/AuthLink/ConfirmForm patterns are each written out in full where they're introduced.

**Type consistency:** `Tier { minQty, percentOff }` and `ProductDiscount { productId, status, tiers }` (Task 6) match exactly what Task 9's actions construct and Task 10's pages render, and match the camelCase JSON keys the Rust function (Task 12) deserializes via `#[shopify_function(rename_all = "camelCase")]`.
