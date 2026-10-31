// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearWidgetRegistry, readBuiltWidget, WIDGET_CORE } from '../helpers/builtWidget'

/**
 * The widget script loads its parts as separate scripts, only when a page needs them. These run the built
 * core script alone on markup like tier-pricing.liquid renders (with the block's component addresses) and
 * look at which scripts it adds to the page, and what the page shows while a component is missing.
 */
const built = readBuiltWidget()

const URLS = {
  model: 'https://cdn.example/tier-pricing-model.js',
  paint: 'https://cdn.example/tier-pricing-paint.js',
  flash: 'https://cdn.example/tier-pricing-flash.js',
  timeSale: 'https://cdn.example/tier-pricing-time-sale.js',
  siblings: 'https://cdn.example/tier-pricing-siblings.js',
}
const V10 = 'gid://shopify/ProductVariant/10'
const SIBLING = { productId: 'gid://shopify/Product/20', variantId: null, title: 'Salmon Tin', url: '/products/salmon', imageUrl: null, price: 169, available: true, cartVariantId: 20, listed: true }
const TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]

interface Options { id?: string; flash?: object | null; timeDiscount?: object | null; siblings?: object[] }

function widgetMarkup({ id = 'w1', flash = null, timeDiscount = null, siblings = [] }: Options = {}): string {
  const discount = { title: 'Tins', tiers: TIERS, siblings, ownVariantIds: null, ownVariantOptions: [], selfVariantId: V10 }
  return `
    <div id="${id}" class="sparkly-tier-pricing" data-sparkly-tier-pricing
      data-discount='${JSON.stringify(discount)}' data-time-discount='${JSON.stringify(timeDiscount ?? {})}'
      data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10"
      data-base-price="1.69" data-compare-at-price="0" data-money-format='"£{{amount}}"' data-high-demand="false"
      data-flash='${JSON.stringify(flash)}' data-component-urls='${JSON.stringify(URLS)}'>
      <div data-tier-pricing-flash data-variant="hidden" hidden>
        <span data-flash-label></span><span data-flash-timer></span><span data-flash-aside></span><span data-flash-chip hidden><span data-flash-chip-text></span></span>
      </div>
      <span data-tier-pricing-now-label hidden></span>
      <span data-tier-pricing-price data-original-price="true">£1.69</span>
      <span data-discounted-price hidden>£1.69</span>
      <span data-tier-pricing-each-label>each</span>
      <s data-tier-pricing-struck hidden></s>
      <span data-tier-pricing-tag hidden></span>
      <p data-tier-pricing-promo></p>
      <div data-tier-pricing-card hidden>
        <div data-tier-pricing-tiers></div>
        <div data-tier-pricing-rail data-offer-state="progress">
          <span data-tier-pricing-status></span><span data-tier-pricing-aside></span>
          <div data-tier-pricing-bar role="progressbar"><div data-tier-pricing-fill></div><div data-tier-pricing-markers></div><span data-tier-pricing-dot></span></div>
        </div>
        <div data-tier-pricing-drawer data-open="false"><button type="button" data-tier-pricing-toggle aria-expanded="false">Mix</button><div data-tier-pricing-list hidden></div><p data-tier-pricing-chosen hidden></p></div>
      </div>
    </div>`
}

const scriptAddresses = () => Array.from(document.head.querySelectorAll('script')).map((script) => script.src)
const scriptFor = (name: keyof typeof URLS) => Array.from(document.head.querySelectorAll('script')).find((script) => script.src === URLS[name]) as HTMLScriptElement

/** What running the component's built file does on a real page: the file runs, and registers itself. */
function loadBuiltComponent(name: string) { (0, eval)(built[name]) }

async function startCore(options: Options = {}, cartItems: object[] = []) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: cartItems }) })))
  document.body.innerHTML = '<input name="quantity" value="1">' + widgetMarkup(options)
  ;(0, eval)(built[WIDGET_CORE])
  await vi.advanceTimersByTimeAsync(0)
}

// A render that throws shows up as a rejected promise nobody handles: every test here must end without one.
const rejections: unknown[] = []
const recordRejection = (reason: unknown) => { rejections.push(reason) }

beforeEach(() => {
  rejections.length = 0
  process.on('unhandledRejection', recordRejection)
  vi.useFakeTimers({ now: 1_800_000_000_000 })
  clearWidgetRegistry()
})
afterEach(async () => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; document.head.innerHTML = ''; clearWidgetRegistry()
  await new Promise((resolve) => setTimeout(resolve, 0))
  process.off('unhandledRejection', recordRejection)
  expect(rejections).toEqual([])
})

describe('which parts a page loads', () => {
  it('a plain discount asks for the model and the paint, and for nothing else', async () => {
    await startCore()

    expect(scriptAddresses()).toEqual([URLS.model, URLS.paint])
  })

  it('a flash sale also asks for the flash component', async () => {
    await startCore({ flash: { startsAtUnix: 1_800_000_000, endsAtUnix: 1_800_086_400, showTeaser: true } })

    expect(scriptAddresses()).toEqual([URLS.model, URLS.paint, URLS.flash])
  })

  it('a product with a time-based discount also asks for the time-based sale', async () => {
    await startCore({ timeDiscount: { startsAt: '2026-10-05T12:00:00.000Z', endsAt: '2026-10-06T12:00:00.000Z', items: [] } })

    expect(scriptAddresses()).toEqual([URLS.model, URLS.paint, URLS.timeSale])
  })

  it('a group does not ask for the siblings list until the list is opened, then asks once', async () => {
    await startCore({ siblings: [SIBLING] })
    expect(scriptAddresses()).not.toContain(URLS.siblings)

    const toggle = document.querySelector('[data-tier-pricing-toggle]') as HTMLElement
    toggle.click()
    toggle.click()
    toggle.click()

    expect(scriptAddresses().filter((address) => address === URLS.siblings)).toHaveLength(1)
  })

  it('two widgets on one page add each part once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
    document.body.innerHTML = '<input name="quantity" value="1">' + widgetMarkup({ id: 'w1' }) + widgetMarkup({ id: 'w2' })

    ;(0, eval)(built[WIDGET_CORE])
    await vi.advanceTimersByTimeAsync(0)

    expect(scriptAddresses()).toEqual([URLS.model, URLS.paint])
  })
})

describe('painting waits for the parts', () => {
  it('paints the card when the parts have loaded, and not before', async () => {
    await startCore()
    const card = document.querySelector('[data-tier-pricing-card]') as HTMLElement
    expect(card.hidden).toBe(true)

    loadBuiltComponent('tier-pricing-model.js')
    await vi.advanceTimersByTimeAsync(0)
    expect(card.hidden).toBe(true)

    loadBuiltComponent('tier-pricing-paint.js')
    await vi.advanceTimersByTimeAsync(0)
    expect(card.hidden).toBe(false)
    expect((document.querySelector('[data-tier-pricing-status]') as HTMLElement).textContent).toBe('You have 1 unit')
  })

  it('keeps the plain price the block rendered, and does not throw, when a part cannot be loaded', async () => {
    await startCore()

    scriptFor('model').dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(3000)

    expect((document.querySelector('[data-tier-pricing-price]') as HTMLElement).textContent!.trim()).toBe('£1.69')
    expect((document.querySelector('[data-tier-pricing-card]') as HTMLElement).hidden).toBe(true)
  })

  it('keeps the plain price, not tier prices, when the flash part of a flash sale cannot be loaded', async () => {
    await startCore({ flash: { startsAtUnix: 1_800_000_000, endsAtUnix: 1_800_086_400, showTeaser: false } })
    loadBuiltComponent('tier-pricing-model.js')
    loadBuiltComponent('tier-pricing-paint.js')
    scriptFor('flash').dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(0)

    expect((document.querySelector('[data-tier-pricing-card]') as HTMLElement).hidden).toBe(true)
    expect((document.querySelector('[data-tier-pricing-price]') as HTMLElement).textContent!.trim()).toBe('£1.69')
  })
})

describe('the siblings list', () => {
  const rows = () => Array.from(document.querySelectorAll('.sparkly-tier-pricing__list-item')).map((row) => row.textContent)

  it('shows nothing until its part arrives, then the rows with what the cart holds now', async () => {
    loadBuiltComponent('tier-pricing-model.js')
    loadBuiltComponent('tier-pricing-paint.js')
    // two Salmon Tins are in the cart while the list stays closed
    await startCore({ siblings: [SIBLING] }, [{ product_id: 20, variant_id: 20, quantity: 2 }])

    ;(document.querySelector('[data-tier-pricing-toggle]') as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(0)
    expect(rows()).toEqual([])

    loadBuiltComponent('tier-pricing-siblings.js')
    await vi.advanceTimersByTimeAsync(0)

    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toContain('Salmon Tin')
    expect((document.querySelector('.sparkly-tier-pricing__list-qty') as HTMLElement).textContent).toBe('2')
  })
})
