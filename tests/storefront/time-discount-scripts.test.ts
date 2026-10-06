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
      data-product-handle='"bed"' data-product-id='"gid://shopify/Product/9"'
      data-selected-variant-id="${selectedVariantId}"
      data-base-price="${basePrice}" data-compare-at-price="0" data-money-format='"£{{amount}}"'>
      <div class="sparkly-tier-pricing__price-row">
        <span class="sparkly-tier-pricing__price sparkly-tier-pricing__original-price" data-tier-pricing-price data-original-price="true">£${basePrice}</span>
        <span class="sparkly-tier-pricing__price sparkly-tier-pricing__discounted-price" data-discounted-price hidden>£${basePrice}</span>
        <span class="sparkly-tier-pricing__each-label" data-tier-pricing-each-label>each</span>
      </div>
      <div class="sparkly-tier-pricing__card" data-tier-pricing-card hidden>
        <div data-tier-pricing-breakdown></div>
        <div class="sparkly-tier-pricing__bar-wrap"><div class="sparkly-tier-pricing__track"><div data-tier-pricing-fill></div></div><div data-tier-pricing-stops></div></div>
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
