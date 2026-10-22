// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The flash sale bar, teaser, countdown and end of the tier widget, painted
 * into markup that mirrors tier-pricing.liquid, with a fake clock.
 */
const assets = path.resolve(__dirname, '../../extensions/product-tier-pricing/assets')
const tierScript = fs.readFileSync(path.join(assets, 'tier-pricing.js'), 'utf8')

const START = 1_800_000_000
const END = START + 3 * 86400
const V10 = 'gid://shopify/ProductVariant/10'

describe('flash sale in the tier widget', () => {
  let cartItems: { product_id: number; variant_id: number; quantity: number }[] = []

  beforeEach(() => {
    cartItems = []
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: cartItems }) })))
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

  const discount = {
    title: 'Tins',
    tiers: [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }],
    siblings: [],
    ownVariantIds: null,
    ownVariantOptions: [],
    selfVariantId: V10,
  }

  async function mountFlash(options: { nowSeconds: number; quantity?: number; flash?: Record<string, unknown> | null; tiers?: unknown[] }) {
    const { nowSeconds, quantity = 1, flash = { startsAtUnix: START, endsAtUnix: END, showTeaser: true }, tiers } = options
    vi.useFakeTimers({ now: nowSeconds * 1000 })
    document.body.innerHTML = `
      <input name="quantity" value="${quantity}">
      <div id="sparkly-tier-pricing-f1" class="sparkly-tier-pricing sparkly-tier-pricing--card" data-sparkly-tier-pricing
        data-discount='${JSON.stringify({ ...discount, ...(tiers ? { tiers } : {}) })}' data-time-discount="{}"
        data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10"
        data-base-price="1.69" data-compare-at-price="0" data-money-format='"£{{amount}}"' data-high-demand="false"
        data-flash='${JSON.stringify(flash)}'>
        <div data-tier-pricing-flash data-variant="hidden" hidden>
          <div><span data-flash-label></span></div>
          <div><span data-flash-timer></span><span data-flash-aside></span><span data-flash-chip hidden><span data-flash-chip-text></span></span></div>
        </div>
        <div class="sparkly-tier-pricing__body">
          <div class="sparkly-tier-pricing__summary">
            <div class="sparkly-tier-pricing__price-row">
              <div class="sparkly-tier-pricing__price-group">
                <span data-tier-pricing-price data-original-price="true">£1.69</span>
                <span data-discounted-price hidden>£1.69</span>
                <span data-tier-pricing-each-label>each</span>
                <s data-tier-pricing-struck hidden></s>
              </div>
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
          </div>
        </div>
      </div>`
    ;(0, eval)(tierScript)
    await vi.advanceTimersByTimeAsync(0)
  }

  const bar = () => {
    const el = document.querySelector('[data-tier-pricing-flash]') as HTMLElement
    return {
      hidden: el.hidden,
      variant: el.dataset.variant,
      label: (el.querySelector('[data-flash-label]') as HTMLElement).textContent,
      timer: [...el.querySelectorAll('.sparkly-tier-pricing__flash-digit')].map((digit) => digit.textContent),
      aside: (el.querySelector('[data-flash-aside]') as HTMLElement).textContent,
      chip: (el.querySelector('[data-flash-chip]') as HTMLElement).hidden ? '' : (el.querySelector('[data-flash-chip-text]') as HTMLElement).textContent,
    }
  }
  const widget = () => document.querySelector('[data-sparkly-tier-pricing]') as HTMLElement
  const cardHidden = () => (document.querySelector('[data-tier-pricing-card]') as HTMLElement).hidden
  const price = () => (document.querySelector('[data-tier-pricing-price]') as HTMLElement).textContent!.trim()
  const hasChrome = () => widget().classList.contains('sparkly-tier-pricing--card')

  async function setQuantity(value: number) {
    const input = document.querySelector('input[name="quantity"]') as HTMLInputElement
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
  }

  it('before the start with the teaser on: the bar counts down to the start and only the plain price shows', async () => {
    await mountFlash({ nowSeconds: START - (2 * 3600 + 10 * 60) })
    expect(bar()).toEqual({ hidden: false, variant: 'teaser', label: 'Flash sale starts in', timer: ['02', '10', '00'], aside: '', chip: '' })
    expect([cardHidden(), hasChrome(), price()]).toEqual([true, true, '£1.69'])
    expect((document.querySelector('[data-tier-pricing-promo]') as HTMLElement).textContent).toBe('')
    expect((document.querySelector('[data-tier-pricing-tag]') as HTMLElement).hidden).toBe(true)
    expect((document.querySelector('[data-tier-pricing-each-label]') as HTMLElement).hidden).toBe(true)
  })

  it('before the start with the teaser off: no bar and no card, only the plain price', async () => {
    await mountFlash({ nowSeconds: START - 60, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: false } })
    expect(bar().hidden).toBe(true)
    expect([cardHidden(), hasChrome(), price()]).toEqual([true, false, '£1.69'])
  })

  it('running below the first tier: "Flash sale ends in" with the time left, and the whole widget', async () => {
    await mountFlash({ nowSeconds: END - (4 * 3600 + 18 * 60 + 49), quantity: 3 })
    expect(bar()).toEqual({ hidden: false, variant: 'ends', label: 'Flash sale ends in', timer: ['04', '18', '49'], aside: '', chip: '' })
    expect([cardHidden(), hasChrome()]).toEqual([false, true])
    expect((document.querySelector('[data-tier-pricing-status]') as HTMLElement).textContent).toBe('You have 3 units')
  })

  it('the first tier: the green banner with the unit price on the right and the timer chip', async () => {
    await mountFlash({ nowSeconds: END - (14 * 60 + 32), quantity: 8 })
    expect(bar()).toEqual({ hidden: false, variant: 'tier-first', label: 'Tier 1 unlocked! Flash sale active', timer: [], aside: '£1.63/ea', chip: '14:32' })
  })

  it('a higher tier: "Tier 2 active" with the unit price, and the timer chip', async () => {
    await mountFlash({ nowSeconds: END - (14 * 60 + 32), quantity: 16 })
    expect(bar()).toEqual({ hidden: false, variant: 'tier-higher', label: 'Tier 2 active (£1.55/ea · Keep adding)', timer: [], aside: '', chip: '14:32' })
  })

  it('a quantity crossing a tier while the sale runs changes the bar', async () => {
    await mountFlash({ nowSeconds: START + 100, quantity: 7 })
    expect(bar().variant).toBe('ends')
    await setQuantity(8)
    expect(bar().variant).toBe('tier-first')
    await setQuantity(16)
    expect(bar().variant).toBe('tier-higher')
  })

  it('the countdown ticks every second', async () => {
    await mountFlash({ nowSeconds: END - 3605 })
    expect(bar().timer).toEqual(['01', '00', '05'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(bar().timer).toEqual(['01', '00', '04'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(bar().timer).toEqual(['59', '59']) // 3599 seconds left: hours disappear
  })

  it('at the start second the teaser turns into the running sale without a reload', async () => {
    await mountFlash({ nowSeconds: START - 2 })
    expect(bar().variant).toBe('teaser')
    expect(cardHidden()).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(bar().variant).toBe('teaser') // one second left
    await vi.advanceTimersByTimeAsync(1000)
    expect([bar().variant, cardHidden(), hasChrome()]).toEqual(['ends', false, true])
  })

  it('at the start second a sale without a teaser gets its card', async () => {
    await mountFlash({ nowSeconds: START - 1, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: false } })
    expect([bar().hidden, hasChrome(), cardHidden()]).toEqual([true, false, true])
    await vi.advanceTimersByTimeAsync(1000)
    expect([bar().hidden, hasChrome(), cardHidden()]).toEqual([false, true, false])
  })

  it('at the end second the widget goes without a reload: no bar, no card, the plain price', async () => {
    await mountFlash({ nowSeconds: END - 2, quantity: 16 })
    expect(price()).toContain('£1.55')
    await vi.advanceTimersByTimeAsync(1000)
    expect(bar().variant).toBe('tier-higher') // the last running second
    await vi.advanceTimersByTimeAsync(1000)
    expect([bar().hidden, cardHidden(), hasChrome()]).toEqual([true, true, false])
    expect(price()).toBe('£1.69')
    expect((document.querySelector('[data-tier-pricing-struck]') as HTMLElement).hidden).toBe(true)
  })

  it('a page opened after the end shows only the plain price', async () => {
    await mountFlash({ nowSeconds: END + 10, quantity: 16 })
    expect([bar().hidden, cardHidden(), hasChrome(), price()]).toEqual([true, true, false, '£1.69'])
  })

  it('a discount that is not a flash sale has no bar and always shows its widget', async () => {
    await mountFlash({ nowSeconds: START + 100, flash: null, quantity: 8 })
    expect([bar().hidden, cardHidden(), hasChrome()]).toEqual([true, false, true])
  })

  it('a flash sale with a single tier reads Tier 1 only, however many are added', async () => {
    await mountFlash({ nowSeconds: START + 100, quantity: 30, tiers: [{ minQty: 8, fixedPrice: 1.63 }] })
    expect(bar().variant).toBe('tier-first')
  })
})
