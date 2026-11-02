// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readBuiltWidget, runWidgetScripts } from '../helpers/builtWidget'
import { isVariantAvailable, parseSoldOutVariantIds } from '../../extensions/product-tier-pricing/src/config.js'
import { readSelectedVariantId } from '../../extensions/product-tier-pricing/src/core/wiring.js'

/**
 * A product, or the selected variant of it, that has no stock: the widget (its price and its tiers) goes away,
 * and comes back when a variant with stock is chosen.
 */
const built = readBuiltWidget()
const block = readFileSync(join(process.cwd(), 'extensions/product-tier-pricing/blocks/tier-pricing.liquid'), 'utf8')

describe('parseSoldOutVariantIds and isVariantAvailable', () => {
  it('reads the ids of the variants without stock as texts, and none when the block gave nothing usable', () => {
    expect(parseSoldOutVariantIds('[10,11]')).toEqual(['10', '11'])
    expect(parseSoldOutVariantIds('[]')).toEqual([])
    expect(parseSoldOutVariantIds(undefined)).toBeNull()
    expect(parseSoldOutVariantIds('not json')).toBeNull()
    expect(parseSoldOutVariantIds('{"a":1}')).toBeNull()
  })

  it('says a variant is not available when it is in the sold-out list, and is when it is missing from it', () => {
    expect(isVariantAvailable({ soldOutVariantIds: ['11'], variantId: '10' })).toBe(true)
    expect(isVariantAvailable({ soldOutVariantIds: [], variantId: '10' })).toBe(true)
    expect(isVariantAvailable({ soldOutVariantIds: ['10', '11'], variantId: '11' })).toBe(false)
  })

  it('says a variant is available when the list or the variant is not known, so a missing value never hides the widget', () => {
    expect(isVariantAvailable({ soldOutVariantIds: null, variantId: '10' })).toBe(true)
    expect(isVariantAvailable({ soldOutVariantIds: ['10'], variantId: null })).toBe(true)
  })

  it('matches a numeric variant id against the text ids', () => {
    expect(isVariantAvailable({ soldOutVariantIds: ['10'], variantId: 10 })).toBe(false)
  })
})

describe('the widget with and without stock', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

  const discount = {
    title: 'Tins',
    tiers: [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }],
    siblings: [],
    ownVariantIds: null,
    ownVariantOptions: [],
    selfVariantId: 'gid://shopify/ProductVariant/10',
  }

  async function mountWidget({ soldOut, selectedVariantId = '10', withThemeElement = true }: { soldOut: string | null; selectedVariantId?: string; withThemeElement?: boolean }) {
    vi.useFakeTimers({ now: 1_800_000_000_000 })
    document.body.innerHTML = `
      ${withThemeElement ? '<product-variants></product-variants>' : ''}
      <form action="/cart/add" method="post"><input type="hidden" name="id" value="${selectedVariantId}"></form>
      <input name="quantity" value="1">
      <div class="price"><span class="price-item">£1.69</span></div>
      <div id="smooth-discounts-s1" class="smooth-discounts smooth-discounts--card" data-smooth-discounts
        data-discount='${JSON.stringify({ ...discount, selfVariantId: 'gid://shopify/ProductVariant/' + selectedVariantId })}'
        ${soldOut === null ? '' : `data-sold-out-variant-ids='${soldOut}'`}
        data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="${selectedVariantId}"
        data-base-price="1.69" data-money-format='"£{{amount}}"' data-high-demand="false" data-flash='null'>
        <div class="smooth-discounts__body">
          <div class="smooth-discounts__summary">
            <div class="smooth-discounts__price-row">
              <span data-tier-pricing-tag hidden></span>
            </div>
            <p data-tier-pricing-promo></p>
          </div>
          <div data-tier-pricing-card hidden>
            <div data-tier-pricing-tiers></div>
            <div data-tier-pricing-rail data-offer-state="progress">
              <div><span data-tier-pricing-status></span><span data-tier-pricing-aside></span></div>
              <div data-tier-pricing-bar role="progressbar"><div><div data-tier-pricing-fill></div></div><div data-tier-pricing-markers></div><span data-tier-pricing-dot></span></div>
            </div>
            <div data-tier-pricing-drawer data-open="false"><button data-tier-pricing-toggle aria-expanded="false">Mix</button><div data-tier-pricing-list hidden></div></div>
          </div>
        </div>
      </div>`
    runWidgetScripts({ built })
    await vi.advanceTimersByTimeAsync(0)
  }

  const widget = () => document.querySelector('[data-smooth-discounts]') as HTMLElement

  async function chooseVariant({ id, price }: { id: number; price: number }) {
    const variants = document.querySelector('product-variants') as HTMLElement & { currentVariant?: { id: number; price: number } }
    variants.currentVariant = { id, price }
    variants.dispatchEvent(new Event('VARIANT_CHANGE'))
    await vi.advanceTimersByTimeAsync(0)
  }

  it('hides the widget when the selected variant has no stock', async () => {
    await mountWidget({ soldOut: '[10]' })
    expect(widget().hidden).toBe(true)
  })

  it('hides the widget when every variant is sold out', async () => {
    await mountWidget({ soldOut: '[10,11]' })
    expect(widget().hidden).toBe(true)
  })

  it('shows the widget with its price when the selected variant has stock', async () => {
    await mountWidget({ soldOut: '[]' })
    expect(widget().hidden).toBe(false)
    expect((document.querySelector('.price-item') as HTMLElement).textContent!.trim()).toBe('£1.69')
  })

  it('shows the widget when the block gave no list, because a missing value must not hide it', async () => {
    await mountWidget({ soldOut: null })
    expect(widget().hidden).toBe(false)
  })

  it('hides the widget when a variant without stock is chosen, and shows it again for one with stock', async () => {
    await mountWidget({ soldOut: '[11]' })
    expect(widget().hidden).toBe(false)
    await chooseVariant({ id: 11, price: 169 })
    expect(widget().hidden).toBe(true)
    await chooseVariant({ id: 10, price: 169 })
    expect(widget().hidden).toBe(false)
  })
})

describe('readSelectedVariantId', () => {
  const tools = { extractNumericId: (id: string) => id.slice(id.lastIndexOf('/') + 1) }
  afterEach(() => { document.body.innerHTML = '' })

  it('reads the variant from the id field of the product form, which every theme keeps current', () => {
    document.body.innerHTML = '<form action="/cart/add"><input name="id" value="12"></form>'
    expect(readSelectedVariantId({ root: document, tools })).toBe('12')
  })

  it('also finds a form whose action carries the store path or a locale, and a select named id', () => {
    document.body.innerHTML = '<form action="/en-gb/cart/add"><select name="id"><option value="7" selected>x</option></select></form>'
    expect(readSelectedVariantId({ root: document, tools })).toBe('7')
  })

  it('gives nothing without a product form or with an empty field, and ignores other forms', () => {
    document.body.innerHTML = '<form action="/search"><input name="id" value="9"></form>'
    expect(readSelectedVariantId({ root: document, tools })).toBeNull()
    document.body.innerHTML = '<form action="/cart/add"><input name="id" value=""></form>'
    expect(readSelectedVariantId({ root: document, tools })).toBeNull()
  })
})

describe('the widget on a theme without the theme\'s own variant event', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

  async function mountPlain() {
    vi.useFakeTimers({ now: 1_800_000_000_000 })
    document.body.innerHTML = `
      <form action="/cart/add" method="post"><input type="hidden" name="id" value="10"></form>
      <input name="quantity" value="1">
      <div id="smooth-discounts-p1" class="smooth-discounts" data-smooth-discounts
        data-discount='${JSON.stringify({ title: 'T', tiers: [], siblings: [], ownVariantIds: null, ownVariantOptions: [], selfVariantId: 'gid://shopify/ProductVariant/10' })}'
        data-sold-out-variant-ids='[11]'
        data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10"
        data-base-price="1.69" data-money-format='"£{{amount}}"' data-high-demand="false" data-flash='null'>
      </div>`
    runWidgetScripts({ built })
    await vi.advanceTimersByTimeAsync(0)
  }

  const field = () => document.querySelector('form[action="/cart/add"] [name="id"]') as HTMLInputElement
  const hidden = () => (document.querySelector('[data-smooth-discounts]') as HTMLElement).hidden

  it('follows the id field when the theme sets it with a change event', async () => {
    await mountPlain()
    expect(hidden()).toBe(false)
    field().value = '11'
    field().dispatchEvent(new Event('change', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(hidden()).toBe(true)
    field().value = '10'
    field().dispatchEvent(new Event('change', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(hidden()).toBe(false)
  })

  it('follows the id field when the theme sets it without any event', async () => {
    await mountPlain()
    field().value = '11'
    await vi.advanceTimersByTimeAsync(1500)
    expect(hidden()).toBe(true)
    field().value = '10'
    await vi.advanceTimersByTimeAsync(1500)
    expect(hidden()).toBe(false)
  })
})

describe('tier-pricing.liquid and stock', () => {
  it('hands the widget the ids of the variants without stock, and lists no other', () => {
    expect(block).toContain('data-sold-out-variant-ids=')
    expect(block).toMatch(/for\s+variant\s+in\s+product\.variants[\s\S]*?unless\s+variant\.available/)
  })

  it('renders the widget hidden when the selected variant has no stock, so it never shows before the script runs', () => {
    expect(block).toMatch(/<div\s+id="smooth-discounts-\{\{ block\.id \}\}"[\s\S]*?\{%-?\s*unless\s+product\.selected_or_first_available_variant\.available\s*-?%\}\s*hidden\s*\{%-?\s*endunless\s*-?%\}/)
  })
})
