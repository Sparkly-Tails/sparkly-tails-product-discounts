import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORNER_RADIUS_RANGE, PRICE_SIZE_RANGE } from '@/lib/widgetStyle'

const extension = (path: string) => readFileSync(join(process.cwd(), 'extensions/product-tier-pricing', path), 'utf8')
const block = extension('blocks/tier-pricing.liquid')
const css = extension('src/tier-pricing.css')

describe('tier-pricing.liquid: the style of a discount', () => {
  it('reads the three values from the discount in the product metafield, and no theme colour', () => {
    for (const key of ['backgroundColor', 'cornerRadius', 'priceSize']) expect(block).toContain(`style_value.${key}`)
    expect(block).toContain('discount_metafield.value.style')
    expect(block).not.toContain('themeColor')
  })

  it('falls back to the block settings of the theme editor when the discount has no usable value', () => {
    for (const setting of ['moss_color', 'cream_color', 'price_font_size', 'sun_color']) expect(block).toContain(`block.settings.${setting}`)
  })

  it('lets a colour through only after the check in the block has passed it', () => {
    expect(block).toContain('style_value.backgroundColor | strip | upcase')
    expect(block).toContain('{%- assign style_background = candidate -%}')
  })

  // Shopify wraps every app snippet it renders in HTML comments (<!-- BEGIN app snippet: ... -->), so a value
  // printed by a snippet into the style attribute is not a colour any more and the browser drops it. This is
  // what made the saved colour never reach the storefront: the block must not render a snippet for it.
  it('renders no snippet: the colour check is inline, because Shopify puts comments around app snippets', () => {
    expect(block).not.toMatch(/\{%-?\s*render\b/)
    expect(existsSync(join(process.cwd(), 'extensions/product-tier-pricing/snippets/sparkly-safe-hex.liquid'))).toBe(false)
  })

  it('keeps the numbers inside the ranges the form allows', () => {
    expect(block).toContain(`at_least: ${PRICE_SIZE_RANGE.min} | at_most: ${PRICE_SIZE_RANGE.max}`)
    expect(block).toContain(`at_least: ${CORNER_RADIUS_RANGE.min} | at_most: ${CORNER_RADIUS_RANGE.max}`)
  })

  it('takes the accent colour from the block setting alone', () => {
    expect(block).toContain('--sparkly-tier-moss: {{ block.settings.moss_color }};')
  })

  it('sets the radius variable only when the discount has a radius, and escapes the whole style attribute', () => {
    expect(block).toContain('--sparkly-tier-radius')
    expect(block).toMatch(/style="\{\{ style_vars \| strip \| escape \}\}"/)
  })
})

describe('tier-pricing.liquid: the colour check', () => {
  it('prints a colour only when it is # and exactly six or eight hexadecimal digits', () => {
    expect(block).toContain("first_character == '#' and candidate.size == 7 or first_character == '#' and candidate.size == 9")
    expect(block).toContain("slice: 0, 1")
    expect(block).toContain('slice: 1, 8')
    for (const digit of '0123456789ABCDEF') expect(block).toContain(`remove: '${digit}'`)
    expect(block).toContain('leftover == blank')
  })
})

describe('tier-pricing.css: the radius variable', () => {
  it('has a radius variable that is 16px by default, with a medium and a small one derived from it', () => {
    expect(css).toContain('--sparkly-tier-radius: 16px;')
    expect(css).toContain('--sparkly-tier-radius-md: calc(var(--sparkly-tier-radius) * 0.75);')
    expect(css).toContain('--sparkly-tier-radius-sm: calc(var(--sparkly-tier-radius) * 0.5);')
  })

  it('uses it for the card and the boxes and chips inside it, in place of fixed pixel radii', () => {
    const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
    expect(rule('.sparkly-tier-pricing--card')).toContain('border-radius: var(--sparkly-tier-radius);')
    for (const selector of ['.sparkly-tier-pricing__rail-card', '.sparkly-tier-pricing__drawer', '.sparkly-tier-pricing__toggle', '.sparkly-tier-pricing__list-item']) {
      expect(rule(selector)).toContain('border-radius: var(--sparkly-tier-radius-md);')
    }
    for (const selector of ['.sparkly-tier-pricing__chip', '.sparkly-tier-pricing__list-thumb']) {
      expect(rule(selector)).toContain('border-radius: var(--sparkly-tier-radius-sm);')
    }
  })
})
