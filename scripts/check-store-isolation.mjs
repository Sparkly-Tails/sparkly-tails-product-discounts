// Usage: npm run check:isolation -- <store A>.myshopify.com <store B>.myshopify.com
//
// Runs tests/live/storeIsolation.live.ts against two real dev stores of the dev app: it writes a
// marker on store A, runs the app's own ensureTierDiscount on both stores at once, then checks that
// B cannot see A's marker, that the stores share no discount id and that each has exactly one tier
// discount. The marker is removed afterwards. It prints counts and pass/fail only.
//
// Both stores must be in the dev app's organization with the app installed. The dev app's client
// secret is read here from `shopify app env show --config shopify.app.dev.toml`, used for one
// token request per store and handed to the test through the environment: never printed or stored.
import { execFileSync, spawnSync } from 'node:child_process'

const [shopA, shopB] = process.argv.slice(2)
const SHOP = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/
if (!SHOP.test(shopA ?? '') || !SHOP.test(shopB ?? '') || shopA === shopB) {
  console.error('Usage: npm run check:isolation -- <store A>.myshopify.com <store B>.myshopify.com (two different stores)')
  process.exit(2)
}

const env = execFileSync('shopify', ['app', 'env', 'show', '--config', 'shopify.app.dev.toml'], { encoding: 'utf8' })
const clientId = env.match(/SHOPIFY_API_KEY=(\S+)/)?.[1]
const clientSecret = env.match(/SHOPIFY_API_SECRET=(\S+)/)?.[1]
if (!clientId || !clientSecret) {
  console.error('Could not read the dev app credentials from `shopify app env show --config shopify.app.dev.toml`.')
  process.exit(2)
}

const stores = []
for (const shop of [shopA, shopB]) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  })
  if (!response.ok) {
    console.error(`No token for ${shop} (HTTP ${response.status}): is the dev app installed there, in the same organization?`)
    process.exit(2)
  }
  stores.push({ shop, token: (await response.json()).access_token })
}

const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.live.config.ts'], {
  stdio: 'inherit',
  env: { ...process.env, ISOLATION_STORES: JSON.stringify(stores) },
})
process.exit(result.status ?? 1)
