// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clearWidgetRegistry, readBuiltWidget, runWidgetScripts, WIDGET_CORE } from '../helpers/builtWidget'

/**
 * Tier prices are stored in the shop's currency. A customer who sees another currency must see the stored fixed and
 * anchor prices converted (rate = Shopify.currency.rate, rounded to two decimals, the way the checkout Function does),
 * written in the format the theme's own `money` filter gives in that currency (the block prints a sample of it).
 * That work is a component the widget loads only for such a customer.
 */
const built = readBuiltWidget()
const widgetBlock = readFileSync(join(process.cwd(), 'extensions/product-tier-pricing/blocks/tier-pricing.liquid'), 'utf8')
const CAD_SAMPLE = 'CA$1,234.56'
const V10 = 'gid://shopify/ProductVariant/10'
const TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
const DISCOUNT = { title: 'Tins', tiers: TIERS, siblings: [], ownVariantIds: null, ownVariantOptions: [], selfVariantId: V10 }

type Shopify = { currency: { active: string; rate: string } } | undefined
const setShopify = (shopify: Shopify) => { (window as unknown as { Shopify?: Shopify }).Shopify = shopify }

function widgetMarkup({ themePrice, basePrice, extra = '' }: { themePrice: string; basePrice: string; extra?: string }): string {
  return `
    <input name="quantity" value="1">
    <div class="price"><span class="price-item">${themePrice}</span></div>
    <div id="smooth-discounts-t1" class="smooth-discounts smooth-discounts--card" data-smooth-discounts
      data-discount='${JSON.stringify(DISCOUNT)}' data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10"
      data-base-price="${basePrice}" data-money-format='"£{{amount}}"' data-shop-currency='"GBP"' data-money-sample='"${CAD_SAMPLE}"' data-high-demand="false"${extra}>
      <div class="smooth-discounts__body">
        <div class="smooth-discounts__summary"><div class="smooth-discounts__price-row"><span data-tier-pricing-tag hidden></span></div><p data-tier-pricing-promo></p></div>
        <div data-tier-pricing-card hidden>
          <div data-tier-pricing-tiers></div>
          <div data-tier-pricing-rail data-offer-state="progress"><div><span data-tier-pricing-status></span><span data-tier-pricing-aside></span></div>
            <div data-tier-pricing-bar role="progressbar"><div><div data-tier-pricing-fill></div></div><div data-tier-pricing-markers></div><span data-tier-pricing-dot></span></div></div>
          <div data-tier-pricing-drawer data-open="false"><button data-tier-pricing-toggle aria-expanded="false"><span>Mix</span></button><div data-tier-pricing-list hidden></div><p data-tier-pricing-chosen hidden></p></div>
        </div>
      </div>
    </div>`
}

describe('the block prints what the script needs to show another currency', () => {
  it('adds the shop currency, a sample of the money filter and the currency component\'s address', () => {
    expect(widgetBlock).toContain("data-shop-currency='{{ shop.currency | json | escape }}'")
    expect(widgetBlock).toContain("data-money-sample='{{ 123456 | money | json | escape }}'")
    expect(widgetBlock).toContain(`"currency": {{ 'tier-pricing-currency.js' | asset_url | json }}`)
  })
})

describe('the tier widget in another currency', () => {
  async function mountWidget({ shopify, themePrice, basePrice }: { shopify: Shopify; themePrice: string; basePrice: string }) {
    vi.useFakeTimers({ now: new Date('2026-10-05T12:00:00.000Z') })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
    setShopify(shopify)
    document.body.innerHTML = widgetMarkup({ themePrice, basePrice })
    runWidgetScripts({ built })
    await vi.advanceTimersByTimeAsync(0)
  }
  const promo = () => document.querySelector('[data-tier-pricing-promo]')?.textContent
  const container = () => document.getElementById('smooth-discounts-t1') as HTMLElement

  beforeEach(() => clearWidgetRegistry())
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); setShopify(undefined); document.body.innerHTML = ''; clearWidgetRegistry() })

  it('converts the stored fixed prices and writes them in the displayed currency', async () => {
    await mountWidget({ shopify: { currency: { active: 'CAD', rate: '1.4' } }, themePrice: 'CA$2.37', basePrice: '2.37' })
    expect(promo()).toBe('Buy 8+ for CA$2.28 or 16+ for CA$2.17')
  })

  it('keeps the shop money format and the stored prices when the customer sees the shop currency', async () => {
    await mountWidget({ shopify: { currency: { active: 'GBP', rate: '1.0' } }, themePrice: '£1.69', basePrice: '1.69' })
    expect(promo()).toBe('Buy 8+ for £1.63 or 16+ for £1.55')
  })

  it('keeps the shop money format and the stored prices when the page has no Shopify currency', async () => {
    await mountWidget({ shopify: undefined, themePrice: '£1.69', basePrice: '1.69' })
    expect(promo()).toBe('Buy 8+ for £1.63 or 16+ for £1.55')
  })

  it('converts the anchor price of a tier as well', async () => {
    const anchored = { ...DISCOUNT, tiers: [{ minQty: 5, percentOff: 10, anchorPrice: 8.5 }] }
    vi.useFakeTimers({ now: new Date('2026-10-05T12:00:00.000Z') })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
    setShopify({ currency: { active: 'CAD', rate: '1.4' } })
    document.body.innerHTML = widgetMarkup({ themePrice: 'CA$2.80', basePrice: '2.80' }).replace(JSON.stringify(DISCOUNT), JSON.stringify(anchored))
    runWidgetScripts({ built })
    await vi.advanceTimersByTimeAsync(0)
    // 5 units cost the converted anchor 11.90 (shop 8.50 x 1.4): 2.38 each
    expect(promo()).toBe('Buy 5+ for CA$2.38')
  })

  it('hides the widget when the rate cannot be read, instead of showing prices in the wrong currency', async () => {
    await mountWidget({ shopify: { currency: { active: 'CAD', rate: 'n/a' } }, themePrice: 'CA$2.37', basePrice: '2.37' })
    expect(container().hidden).toBe(true)
    expect(promo()).toBe('')
  })

  it('hides the widget when the sample has no amount in it', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-05T12:00:00.000Z') })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
    setShopify({ currency: { active: 'CAD', rate: '1.4' } })
    document.body.innerHTML = widgetMarkup({ themePrice: 'CA$2.37', basePrice: '2.37' }).replace(CAD_SAMPLE, 'CA$')
    runWidgetScripts({ built })
    await vi.advanceTimersByTimeAsync(0)
    expect(container().hidden).toBe(true)
  })
})

describe('which parts a page loads for another currency', () => {
  const URLS = {
    model: 'https://cdn.example/tier-pricing-model.js',
    paint: 'https://cdn.example/tier-pricing-paint.js',
    flash: 'https://cdn.example/tier-pricing-flash.js',
    siblings: 'https://cdn.example/tier-pricing-siblings.js',
    currency: 'https://cdn.example/tier-pricing-currency.js',
  }
  const scriptAddresses = () => Array.from(document.head.querySelectorAll('script')).map((script) => script.src)

  async function startCore(shopify: Shopify) {
    vi.useFakeTimers({ now: 1_800_000_000_000 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
    setShopify(shopify)
    document.body.innerHTML = widgetMarkup({ themePrice: '£1.69', basePrice: '1.69', extra: ` data-component-urls='${JSON.stringify(URLS)}'` })
    ;(0, eval)(built[WIDGET_CORE])
    await vi.advanceTimersByTimeAsync(0)
  }

  beforeEach(() => clearWidgetRegistry())
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); setShopify(undefined); document.body.innerHTML = ''; document.head.innerHTML = ''; clearWidgetRegistry() })

  it('asks for the currency component when the customer sees another currency', async () => {
    await startCore({ currency: { active: 'CAD', rate: '1.4' } })
    expect(scriptAddresses()).toEqual([URLS.model, URLS.paint, URLS.currency])
  })

  it('does not ask for it when the customer sees the shop currency', async () => {
    await startCore({ currency: { active: 'GBP', rate: '1.0' } })
    expect(scriptAddresses()).toEqual([URLS.model, URLS.paint])
  })

  it('does not ask for it when the page has no Shopify currency', async () => {
    await startCore(undefined)
    expect(scriptAddresses()).toEqual([URLS.model, URLS.paint])
  })
})
