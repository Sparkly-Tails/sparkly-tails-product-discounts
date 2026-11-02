import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Shopify shows the app's name from its config at the top of the admin, so the pages do not repeat it in a header of their own. */
describe('the name of the app in its config', () => {
  it.each(['shopify.app.toml', 'shopify.app.dev.toml'])('is "Smooth Discounts" in %s', (file) => {
    const text = readFileSync(join(process.cwd(), file), 'utf8')
    expect(text).toMatch(/^name = "Smooth Discounts"$/m)
  })
})
