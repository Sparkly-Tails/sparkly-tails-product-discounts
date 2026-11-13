import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from '@/lib/metafieldNames'
import { CORNER_RADIUS_RANGE } from '@/lib/widgetStyle'
import { DEFAULT_DESIGN, FLASH_TONE_COLOURS } from '@/settings/design'

const extension = (path: string) => readFileSync(join(process.cwd(), 'extensions/product-tier-pricing', path), 'utf8')
const block = extension('blocks/tier-pricing.liquid')
const css = extension('src/tier-pricing.css')

const schema = JSON.parse(block.slice(block.indexOf('{% schema %}') + '{% schema %}'.length, block.indexOf('{% endschema %}')))
const settingIds: string[] = schema.settings.map((setting: { id: string }) => setting.id)

describe('tier-pricing.liquid: the store-wide design', () => {
  it('reads the design from the shop metafield tier_settings, and never from a discount', () => {
    expect(block).toContain(`shop.metafields['${METAFIELD_NAMESPACE}'].${METAFIELD_KEYS.tierSettings}`)
    for (const key of ['accentColor', 'backgroundColor', 'cornerRadius', 'flashTone']) expect(block).toContain(`design_value.${key}`)
    expect(block).not.toContain('discount_metafield.value.style')
    expect(block).not.toContain('style_value')
  })

  it('has no accent or background setting in the theme editor any more, and keeps the sun colour and the custom CSS', () => {
    expect(settingIds).toEqual(['sun_color', 'custom_css'])
    expect(block).not.toContain('block.settings.moss_color')
    expect(block).not.toContain('block.settings.cream_color')
    expect(block).toContain('block.settings.sun_color')
  })

  it('falls back to the default design where the metafield or a value is missing or unusable', () => {
    for (const fallback of [DEFAULT_DESIGN.accentColor, DEFAULT_DESIGN.backgroundColor.toUpperCase(), String(DEFAULT_DESIGN.cornerRadius), FLASH_TONE_COLOURS[DEFAULT_DESIGN.flashTone]]) {
      expect(block).toContain(fallback)
    }
  })

  it('prints the colour of each flash tone', () => {
    for (const [tone, colour] of Object.entries(FLASH_TONE_COLOURS)) {
      expect(block).toContain(`'${tone}'`)
      expect(block).toContain(colour)
    }
  })

  it('lets a colour through only after the check in the block has passed it', () => {
    expect(block).toContain('design_value.accentColor | strip | upcase')
    expect(block).toContain('design_value.backgroundColor | strip | upcase')
    expect(block).toContain('{%- assign style_accent = accent_candidate -%}')
    expect(block).toContain('{%- assign style_background = candidate -%}')
  })

  // Shopify wraps every app snippet it renders in HTML comments (<!-- BEGIN app snippet: ... -->), so a value
  // printed by a snippet into the style attribute is not a colour any more and the browser drops it. This is
  // what made the saved colour never reach the storefront: the block must not render a snippet for it.
  it('renders no snippet: the colour check is inline, because Shopify puts comments around app snippets', () => {
    expect(block).not.toMatch(/\{%-?\s*render\b/)
    expect(existsSync(join(process.cwd(), 'extensions/product-tier-pricing/snippets/sparkly-safe-hex.liquid'))).toBe(false)
  })

  it('keeps the radius inside the range the Settings page allows', () => {
    expect(block).toContain(`at_least: ${CORNER_RADIUS_RANGE.min} | at_most: ${CORNER_RADIUS_RANGE.max}`)
  })

  it('prints the four variables and escapes the whole style attribute', () => {
    expect(block).toContain('--smooth-discounts-moss: {{ style_accent }};')
    expect(block).toContain('--smooth-discounts-cream: {{ style_background }};')
    expect(block).toContain('--smooth-discounts-radius: {{ style_radius }}px;')
    expect(block).toContain('--smooth-discounts-flash-dark: {{ style_flash }};')
    expect(block).toMatch(/style="\{\{ style_vars \| strip \| escape \}\}"/)
  })
})

describe('tier-pricing.liquid: the colour check', () => {
  it('prints a colour only when it is # and exactly six (accent) or six or eight (background) hexadecimal digits', () => {
    expect(block).toContain("first_character == '#' and candidate.size == 7 or first_character == '#' and candidate.size == 9")
    expect(block).toContain("accent_first == '#' and accent_candidate.size == 7")
    expect(block).toContain("slice: 0, 1")
    expect(block).toContain('slice: 1, 8')
    for (const digit of '0123456789ABCDEF') expect(block).toContain(`remove: '${digit}'`)
    expect(block).toContain('leftover == blank')
    expect(block).toContain('accent_leftover == blank')
  })
})

describe('tier-pricing.css: the radius variable', () => {
  it('has a radius variable that is 16px by default, with a medium and a small one derived from it', () => {
    expect(css).toContain('--smooth-discounts-radius: 16px;')
    expect(css).toContain('--smooth-discounts-radius-md: calc(var(--smooth-discounts-radius) * 0.75);')
    expect(css).toContain('--smooth-discounts-radius-sm: calc(var(--smooth-discounts-radius) * 0.5);')
  })

  it('uses it for the card and the boxes and chips inside it, in place of fixed pixel radii', () => {
    const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
    expect(rule('.smooth-discounts--card')).toContain('border-radius: var(--smooth-discounts-radius);')
    for (const selector of ['.smooth-discounts__rail-card', '.smooth-discounts__drawer', '.smooth-discounts__toggle', '.smooth-discounts__list-item']) {
      expect(rule(selector)).toContain('border-radius: var(--smooth-discounts-radius-md);')
    }
    for (const selector of ['.smooth-discounts__chip', '.smooth-discounts__list-thumb']) {
      expect(rule(selector)).toContain('border-radius: var(--smooth-discounts-radius-sm);')
    }
  })
})
