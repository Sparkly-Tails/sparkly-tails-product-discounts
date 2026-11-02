import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Time-based discounts (the admin pages, the Shopify Function, the countdown block and the sale price in the tier
 * widget) were removed. Nothing about them may come back in the code, the tests, the config or the build lists.
 * Not checked: the plans and specs of earlier work and the session ledger (history), the generated Shopify schema.graphql, and worktree entries (folders).
 */
const root = process.cwd()
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter((file) => file && existsSync(join(root, file)))
  .filter((file) => !file.startsWith('docs/superpowers/') && !file.startsWith('.claude/') && file !== '.session-log' && file !== '_context.md')
  .filter((file) => !file.endsWith('package-lock.json') && !/\.(png|jpe?g|webp|ico|woff2?)$/i.test(file) && !file.endsWith('schema.graphql') && file !== 'tests/timeBasedRemoved.test.ts')

const OLD_NAMES = /time[-_ ]?based|timeDiscount|time[-_]discounts?\b|time_discount|timeSale|time[-_]sale|TimeDiscount/i

describe('time-based discounts are gone', () => {
  it('has none of their folders, the Function extension or the countdown block', () => {
    for (const path of ['src/timeDiscounts', 'src/app/time-discounts', 'tests/timeDiscounts', 'extensions/time-based-discount', 'extensions/product-tier-pricing/blocks/time-based-discount.liquid', 'extensions/product-tier-pricing/src/timeSale.js']) {
      expect(existsSync(join(root, path)), path).toBe(false)
    }
  })

  it('has no mention of them in the code, the stylesheets, the tests, the config or the build lists', () => {
    const offenders: string[] = []
    for (const file of tracked) {
      if (OLD_NAMES.test(readFileSync(join(root, file), 'utf8'))) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
