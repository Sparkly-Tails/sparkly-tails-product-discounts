// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Both storefront scripts are plain browser scripts that share ONE global
 * scope on the page, so they are evaluated together here the way the theme
 * loads them. The markup mirrors what tier-pricing.liquid and
 * time-based-discount.liquid render.
 */
const assets = path.resolve(__dirname, '../../extensions/product-tier-pricing/assets')
const tierScript = fs.readFileSync(path.join(assets, 'tier-pricing.js'), 'utf8')
const countdownScript = fs.readFileSync(path.join(assets, 'time-based-discount.js'), 'utf8')

const NOW = new Date('2026-10-05T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()
const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

type Item = { variantId: string | null; pricingMode: 'percent' | 'fixed'; amount: number }

function mount(discount: Record<string, unknown>, opts: { selectedVariantId?: number; basePrice?: number; variantPrices?: Record<string, number> } = {}) {
  const { selectedVariantId = 10, basePrice = 49.99, variantPrices = { '10': 4999, '11': 6000, '12': 3000 } } = opts
  const timeDiscount = JSON.stringify({ startsAt: discount.startsAt, endsAt: discount.endsAt, items: discount.items, pricingMode: discount.pricingMode, amount: discount.amount, variantIds: discount.variantIds })
  const countdownData = JSON.stringify({ ...discount, selectedVariantId, variantPrices })
  document.body.innerHTML = `
    <product-variants></product-variants>
    <input name="quantity" value="1">
    <div id="sparkly-tier-pricing-b1" class="sparkly-tier-pricing" data-sparkly-tier-pricing
      data-discount='{"tiers":[]}' data-time-discount='${timeDiscount}'
      data-product-id='"gid://shopify/Product/9"'
      data-selected-variant-id="${selectedVariantId}"
      data-base-price="${basePrice}" data-compare-at-price="0" data-money-format='"£{{amount}}"'>
      <div class="sparkly-tier-pricing__price-row">
        <span class="sparkly-tier-pricing__price sparkly-tier-pricing__original-price" data-tier-pricing-price data-original-price="true">£${basePrice}</span>
        <span class="sparkly-tier-pricing__price sparkly-tier-pricing__discounted-price" data-discounted-price hidden>£${basePrice}</span>
        <span class="sparkly-tier-pricing__each-label" data-tier-pricing-each-label>each</span>
      </div>
      <div class="sparkly-tier-pricing__card" data-tier-pricing-card hidden>
        <div class="sparkly-tier-pricing__status-row"><span data-tier-pricing-status></span><span data-tier-pricing-aside></span></div>
        <div class="sparkly-tier-pricing__bar-wrap"><div class="sparkly-tier-pricing__track"><div data-tier-pricing-fill></div></div><div data-tier-pricing-markers></div><span data-tier-pricing-dot></span></div>
        <div data-tier-pricing-tiers></div>
      </div>
    </div>
    <div id="sparkly-time-discount-b1" class="sparkly-time-discount" data-sparkly-time-discount data-discount='${countdownData}' hidden>
      <p class="sparkly-time-discount__label" data-time-discount-label></p>
      <div class="sparkly-time-discount__boxes">
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-days>00</span><span class="sparkly-time-discount__unit">DAY</span></div>
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-hours>00</span><span class="sparkly-time-discount__unit">HRS</span></div>
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-minutes>00</span><span class="sparkly-time-discount__unit">MINS</span></div>
        <div class="sparkly-time-discount__box"><span class="sparkly-time-discount__value" data-time-discount-seconds>00</span><span class="sparkly-time-discount__unit">SECS</span></div>
      </div>
    </div>`
  // Same global scope for both, as on the storefront.
  ;(0, eval)(countdownScript)
  ;(0, eval)(tierScript)
}

function view() {
  const q = (selector: string) => document.querySelector(selector) as HTMLElement
  const sale = q('[data-discounted-price]')
  const regular = q('[data-original-price]')
  return {
    sale: sale.hidden ? null : sale.textContent!.trim(),
    regularStruck: regular.getAttribute('data-strike') === 'true',
    countdownVisible: !q('[data-sparkly-time-discount]').hidden,
    countdownLabel: q('[data-time-discount-label]').textContent,
  }
}

function changeVariant(id: number, price: number) {
  const el = document.querySelector('product-variants') as HTMLElement & { currentVariant?: unknown }
  el.currentVariant = { id, price }
  el.dispatchEvent(new Event('VARIANT_CHANGE'))
}

const live = { title: 'Summer Sale', startsAt: iso(-3_600_000), endsAt: iso(86_400_000) }
const fixed = (amount: number, variantId: string | null = null): Item => ({ variantId, pricingMode: 'fixed', amount })
const percent = (amount: number, variantId: string | null = null): Item => ({ variantId, pricingMode: 'percent', amount })

describe('time-based discount storefront scripts', () => {
  beforeEach(() => { vi.useFakeTimers({ now: NOW }) })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = '' })

  it('shows the sale price with the regular price struck, and the countdown, for a whole-product row', () => {
    mount({ ...live, items: [fixed(22)] })
    expect(view()).toEqual({ sale: '£22.00', regularStruck: true, countdownVisible: true, countdownLabel: 'Summer Sale ends in:' })
  })

  it('uses the selected variant from first paint, not only after a variant change', () => {
    mount({ ...live, items: [fixed(22, V10), percent(50, V11)] }, { selectedVariantId: 10 })
    expect(view().sale).toBe('£22.00')
  })

  it('gives each variant its own price as the customer switches variants', () => {
    mount({ ...live, items: [fixed(22, V10), percent(50, V11)] }, { selectedVariantId: 10 })
    changeVariant(11, 6000)
    expect(view().sale).toBe('£30.00')
    changeVariant(12, 3000) // no row for variant 12
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: false })
    changeVariant(10, 4999)
    expect(view().sale).toBe('£22.00')
  })

  it('lets a variant row beat the whole-product row', () => {
    mount({ ...live, items: [percent(10), fixed(5, V10)] }, { selectedVariantId: 10 })
    expect(view().sale).toBe('£5.00')
    changeVariant(11, 6000)
    expect(view().sale).toBe('£54.00')
  })

  it('shows nothing when the fixed price is not lower than the variant price', () => {
    mount({ ...live, items: [fixed(60)] })
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: false })
  })

  it('resets the price and hides the countdown when the discount ends, with no refresh', () => {
    mount({ ...live, endsAt: iso(3_000), items: [fixed(22)] })
    expect(view().sale).toBe('£22.00')
    vi.advanceTimersByTime(4_000)
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: false })
  })

  it('shows the price and countdown when the discount starts after the page was opened', () => {
    mount({ ...live, startsAt: iso(3_000), items: [fixed(22)] })
    expect(view()).toMatchObject({ sale: null, countdownVisible: false })
    vi.advanceTimersByTime(4_000)
    expect(view()).toMatchObject({ sale: '£22.00', regularStruck: true, countdownVisible: true })
  })

  it('still understands a metafield written before per-row pricing', () => {
    mount({ ...live, pricingMode: 'fixed', amount: 22, variantIds: [V10] }, { selectedVariantId: 10 })
    expect(view().sale).toBe('£22.00')
    changeVariant(12, 3000)
    expect(view()).toMatchObject({ sale: null, countdownVisible: false })
  })

  it('shows the countdown alone when a metafield has no pricing data', () => {
    mount({ ...live })
    expect(view()).toMatchObject({ sale: null, regularStruck: false, countdownVisible: true })
  })
})

describe('storefront scripts share one global scope', () => {
  // Names declared at column 0 of a line. Indented declarations (inside the
  // `if (typeof document ...) { ... }` blocks) are not top-level and are skipped.
  const topLevelNames = (source: string): string[] =>
    [...source.matchAll(/^(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])

  it('declares no top-level name in both scripts', () => {
    const tierNames = topLevelNames(tierScript)
    const countdownNames = topLevelNames(countdownScript)
    // The extraction itself must keep working, or the intersection check below proves nothing.
    expect(tierNames.length).toBeGreaterThan(0)
    expect(countdownNames.length).toBeGreaterThan(0)
    expect(tierNames.filter((name) => countdownNames.includes(name))).toEqual([])
  })
})

/**
 * The redesigned tier widget: status row, bar with a dot on the current
 * quantity, and the copy per state. Markup mirrors tier-pricing.liquid; the
 * cart comes from a stubbed /cart.js.
 */
describe('tier widget painting (redesign)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ items: [] }) })))
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

  const discount = {
    title: 'Tins',
    tiers: [{ minQty: 8, percentOff: 3.5503 }, { minQty: 16, percentOff: 8.284 }],
    siblings: [],
    ownVariantIds: null,
    ownVariantOptions: [],
    selfVariantId: V10,
  }

  async function mountTiers(quantity: number) {
    document.body.innerHTML = `
      <input name="quantity" value="${quantity}">
      <div id="sparkly-tier-pricing-t1" class="sparkly-tier-pricing sparkly-tier-pricing--card" data-sparkly-tier-pricing
        data-discount='${JSON.stringify(discount)}' data-time-discount="{}"
        data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10"
        data-base-price="1.69" data-compare-at-price="0" data-money-format='"£{{amount}}"'>
        <div class="sparkly-tier-pricing__price-row">
          <span data-tier-pricing-price data-original-price="true">£1.69</span>
          <span data-discounted-price hidden>£1.69</span>
          <span data-tier-pricing-each-label>each</span>
        </div>
        <p data-tier-pricing-promo></p>
        <div data-tier-pricing-card hidden>
          <div><span data-tier-pricing-status></span><span data-tier-pricing-aside></span></div>
          <div><div><div data-tier-pricing-fill></div></div><div data-tier-pricing-markers></div><span data-tier-pricing-dot></span></div>
          <div data-tier-pricing-tiers></div>
        </div>
      </div>`
    ;(0, eval)(tierScript)
    await vi.advanceTimersByTimeAsync(0)
  }

  async function setQuantity(value: number) {
    const input = document.querySelector('input[name="quantity"]') as HTMLInputElement
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
  }

  function painted() {
    const text = (selector: string) => (document.querySelector(selector) as HTMLElement).textContent
    const dot = document.querySelector('[data-tier-pricing-dot]') as HTMLElement
    const aside = document.querySelector('[data-tier-pricing-aside]') as HTMLElement
    return {
      promo: text('[data-tier-pricing-promo]'),
      status: text('[data-tier-pricing-status]'),
      aside: aside.textContent,
      asideIsBadge: aside.classList.contains('sparkly-tier-pricing__aside--badge'),
      dot: dot.textContent,
      dotLeft: dot.style.left,
      fill: (document.querySelector('[data-tier-pricing-fill]') as HTMLElement).style.width,
      markers: [...document.querySelectorAll('.sparkly-tier-pricing__marker')].map((m) => ({ text: m.textContent, reached: m.classList.contains('sparkly-tier-pricing__marker--reached'), covered: m.classList.contains('sparkly-tier-pricing__marker--covered') })),
    }
  }

  it('below the first offer: units owned, a hint to the next price, the dot on the quantity', async () => {
    await mountTiers(5)
    expect(painted()).toEqual({
      promo: 'Buy 8+ for £1.63 or 16+ for £1.55',
      status: 'You have 5 units',
      aside: 'Add 3 for £1.63/ea',
      asideIsBadge: false,
      dot: '5',
      dotLeft: '29%',
      fill: '29%',
      markers: [
        { text: '1', reached: true, covered: false },
        { text: '8', reached: false, covered: false },
        { text: '16', reached: false, covered: false },
      ],
    })
  })

  it('middle tier: "Offer unlocked", a Save badge, the reached marker filled, the dot between tiers', async () => {
    await mountTiers(5)
    await setQuantity(10)
    expect(painted()).toMatchObject({
      promo: 'Offer unlocked! Add 6 more to unlock the highest discount for £1.55',
      status: '10 units × £1.63 (Offer unlocked)',
      aside: 'Save £0.60',
      asideIsBadge: true,
      dot: '10',
      dotLeft: '63%',
    })
    expect(painted().markers.map((m) => m.reached)).toEqual([true, true, false])
  })

  function pills() {
    return [...document.querySelectorAll('[data-tier-pricing-tiers] > *')].map((el) => ({
      text: el.textContent,
      kind: el.classList.contains('sparkly-tier-pricing__temp-btn') ? 'temp' : 'pill',
      active: el.classList.contains('sparkly-tier-pricing__tier-btn--active'),
      dimmed: el.classList.contains('sparkly-tier-pricing__tier-btn--dimmed'),
    }))
  }

  it('pills show the unit price per tier; between tiers the lower ones are dimmed and a dashed box shows the quantity', async () => {
    await mountTiers(5)
    expect(pills()).toEqual([
      { text: '1 × £1.69', kind: 'pill', active: false, dimmed: false },
      { text: '5 × £1.69', kind: 'temp', active: false, dimmed: false },
      { text: '8 × £1.63', kind: 'pill', active: false, dimmed: false },
      { text: '16 × £1.55', kind: 'pill', active: false, dimmed: false },
    ])
    await setQuantity(10)
    expect(pills()).toEqual([
      { text: '1 × £1.69', kind: 'pill', active: false, dimmed: true },
      { text: '8 × £1.63', kind: 'pill', active: false, dimmed: false },
      { text: '10 × £1.63', kind: 'temp', active: false, dimmed: false },
      { text: '16 × £1.55', kind: 'pill', active: false, dimmed: false },
    ])
  })

  it('a quantity exactly on a tier ticks that pill and shows no dashed box', async () => {
    await mountTiers(8)
    expect(pills()).toEqual([
      { text: '1 × £1.69', kind: 'pill', active: false, dimmed: true },
      { text: '8 × £1.63✓', kind: 'pill', active: true, dimmed: false },
      { text: '16 × £1.55', kind: 'pill', active: false, dimmed: false },
    ])
  })

  it('highest tier: "Highest discount unlocked" and the dot on the last marker', async () => {
    await mountTiers(5)
    await setQuantity(16)
    expect(painted()).toMatchObject({
      promo: 'Highest discount unlocked: £1.55/each applied! (Save £2.24)',
      status: 'You have 16 units',
      aside: '✓ Highest discount (£1.55/ea)',
      asideIsBadge: false,
      dot: '16',
      dotLeft: '100%',
    })
    expect(painted().markers.map((m) => [m.reached, m.covered])).toEqual([[true, false], [true, false], [true, true]])
  })
})
