import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The widget's names (CSS classes, the data attribute, the CSS variables, the ids, the animations and the
 * script registry) all start with `smooth-discounts`. The old `sparkly-tier…` names must not come back, in
 * the block, the extension source, the admin preview or the tests (the plans and specs of earlier work are history).
 */
const root = process.cwd()
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  // Not checked: the plans and specs of earlier work and the session ledger (history), worktree entries (folders), lock files, images.
  .filter((file) => file && !file.startsWith('docs/superpowers/') && !file.startsWith('.claude/') && file !== '.session-log' && file !== '_context.md')
  .filter((file) => !file.endsWith('package-lock.json') && !/\.(png|jpe?g|webp|ico|woff2?)$/i.test(file) && file !== 'tests/storefront/widgetNames.test.ts')

describe('the widget names', () => {
  it('has no sparkly-tier name left anywhere in the code, the stylesheet, the block or the tests', () => {
    const offenders: string[] = []
    for (const file of tracked) {
      const text = readFileSync(join(root, file), 'utf8')
      if (/sparkly-tier|sparklyTier|SparklyTierPricing/.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('names the block, its elements, its modifier, its data attribute and its variables after Smooth Discounts', () => {
    const block = readFileSync(join(root, 'extensions/product-tier-pricing/blocks/tier-pricing.liquid'), 'utf8')
    expect(block).toContain('class="smooth-discounts{% if discount_metafield != blank %} smooth-discounts--card{% endif %}"')
    expect(block).toContain('id="smooth-discounts-{{ block.id }}"')
    expect(block).toContain('data-smooth-discounts')
    expect(block).toContain('--smooth-discounts-moss')
    expect(block).toContain('smooth-discounts__body')
    const css = readFileSync(join(root, 'extensions/product-tier-pricing/src/tier-pricing.css'), 'utf8')
    expect(css).toContain('.smooth-discounts__body')
    expect(css).toContain('--smooth-discounts-radius: 16px;')
  })
})
