import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/** What both Shopify apps (production and dev) must ask for so the homepage metrics can be collected. */
const ROOT = path.resolve(__dirname, '../..')
const CONFIG_FILES = ['shopify.app.toml', 'shopify.app.dev.toml']
const SCOPES = [
  'read_discounts', 'read_products', 'write_discounts', 'write_products',
  'read_orders', 'read_all_orders', 'read_reports', 'write_pixels', 'read_customer_events',
]

const readConfig = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const readScopes = (text: string) => (/^scopes = "([^"]*)"/m.exec(text)?.[1] ?? '').split(',')

describe.each(CONFIG_FILES)('%s', (file) => {
  const text = readConfig(file)

  it('asks for every scope the app and its metrics use', () => {
    expect(readScopes(text).sort()).toEqual([...SCOPES].sort())
  })

  it('subscribes orders/paid to the orders webhook route', () => {
    const block = text.split('[[webhooks.subscriptions]]').find((part) => part.includes('uri = "/webhooks/orders/paid"'))
    expect(block).toBeDefined()
    expect(block).toContain('topics = [ "orders/paid" ]')
  })
})
