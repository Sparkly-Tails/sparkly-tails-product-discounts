// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import WidgetView from '@/form/preview/components/WidgetView'
import { buildPreviewModel } from '@/form/preview/buildPreviewModel'
import { PREVIEW_TOOLS } from '@/form/preview/previewTools'
import { WIDGET_FUNCTIONS } from '@/form/preview/widgetFunctions'
import type { PreviewTier } from '@/form/tierRows'
import { readBuiltWidget, runWidgetScripts } from '../../helpers/builtWidget'

/**
 * The preview paints what the widget's functions decide. This runs the real
 * storefront script on markup that mirrors tier-pricing.liquid, paints the same
 * inputs with the preview, and compares what each one prints, element by element.
 */
const built = readBuiltWidget()

const START = 1_800_000_000
const END = START + 3 * 86400
const PERCENT: PreviewTier[] = [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 15 }]
const FIXED: PreviewTier[] = [{ minQty: 2, fixedPrice: 21 }, { minQty: 4, fixedPrice: 18 }]

interface Scenario { nowSeconds: number; quantity: number; tiers: PreviewTier[]; flash: { startsAtUnix: number; endsAtUnix: number; showTeaser: boolean } | null; highDemand: boolean }

function mountScript({ nowSeconds, quantity, tiers, flash, highDemand }: Scenario): HTMLElement {
  vi.useFakeTimers({ now: nowSeconds * 1000 })
  document.body.innerHTML = `
    <input name="quantity" value="${quantity}">
    <div id="script-widget" class="sparkly-tier-pricing${tiers.length ? ' sparkly-tier-pricing--card' : ''}" data-sparkly-tier-pricing
      data-discount='${JSON.stringify({ title: 'T', tiers, siblings: [], ownVariantIds: null, ownVariantOptions: [], selfVariantId: 'gid://shopify/ProductVariant/10' })}' data-time-discount="{}"
      data-product-id='"gid://shopify/Product/9"' data-selected-variant-id="10" data-base-price="28" data-compare-at-price="0" data-money-format='"\${{amount}}"'
      data-high-demand="${highDemand}" data-flash='${JSON.stringify(flash)}'>
      <div data-tier-pricing-flash data-variant="hidden" hidden>
        <div><span data-flash-label></span></div>
        <div><span data-flash-timer></span><span data-flash-aside></span><span data-flash-chip hidden><span data-flash-chip-text></span></span></div>
      </div>
      <div class="sparkly-tier-pricing__body">
        <div class="sparkly-tier-pricing__summary">
          <div class="sparkly-tier-pricing__price-row">
            <div class="sparkly-tier-pricing__price-group">
              <span data-tier-pricing-now-label hidden></span>
              <span data-tier-pricing-price data-original-price="true">$28.00</span>
              <span data-discounted-price hidden>$28.00</span>
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
  runWidgetScripts({ built })
  return document.getElementById('script-widget') as HTMLElement
}

function renderPreview({ nowSeconds, quantity, tiers, flash, highDemand }: Scenario): HTMLElement {
  const { viewModel } = buildPreviewModel({
    products: [{ title: 'Salmon Oil', price: 28, imageUrl: null }], selectedIndex: 0, tiers, highDemand, quantity, timeZone: 'UTC', nowSeconds,
    flash: flash ? { startsAt: 'as given', endsAt: 'as given', showTeaser: flash.showTeaser } : null, formatMoney: (amount) => WIDGET_FUNCTIONS.formatMoney(amount, '${{amount}}'), tools: {
      ...PREVIEW_TOOLS,
      // the scenario's flash window is already in Unix seconds
      buildFlashWindow: () => flash,
    },
  })
  const { container } = render(<WidgetView viewModel={viewModel!} hasTiers={tiers.length > 0} onPickQuantity={() => {}} />)
  return container.querySelector('.sparkly-tier-pricing') as HTMLElement
}

// What the person reads and what changes how it looks, from either markup.
function fingerprint(root: HTMLElement) {
  const find = (selector: string) => root.querySelector(selector) as HTMLElement | null
  const shown = (selector: string) => { const el = find(selector); return !!el && !el.hidden }
  const text = (selector: string) => (find(selector)?.textContent ?? '').trim()
  const cardShown = shown('[data-tier-pricing-card]')
  return {
    chrome: root.classList.contains('sparkly-tier-pricing--card'),
    flash: shown('[data-tier-pricing-flash]')
      ? { variant: find('[data-tier-pricing-flash]')!.dataset.variant, label: text('[data-flash-label]'), digits: [...root.querySelectorAll('.sparkly-tier-pricing__flash-digit')].map((digit) => digit.textContent), aside: text('[data-flash-aside]'), chip: shown('[data-flash-chip]') ? text('[data-flash-chip-text]') : '' }
      : null,
    nowLabel: shown('[data-tier-pricing-now-label]') ? text('[data-tier-pricing-now-label]') : null,
    price: text('[data-tier-pricing-price]'),
    each: shown('[data-tier-pricing-each-label]'),
    struck: shown('[data-tier-pricing-struck]') ? text('[data-tier-pricing-struck]') : null,
    tag: shown('[data-tier-pricing-tag]') ? { kind: find('[data-tier-pricing-tag]')!.dataset.kind, text: text('[data-tier-pricing-tag]') } : null,
    promo: text('[data-tier-pricing-promo]'),
    card: cardShown,
    chips: cardShown && shown('[data-tier-pricing-tiers]') ? [...root.querySelectorAll('[data-tier-pricing-tiers] > *')].map((chip) => [chip.tagName, chip.className, chip.textContent, chip.getAttribute('aria-pressed')]) : null,
    rail: cardShown
      ? { offerState: find('[data-tier-pricing-rail]')!.dataset.offerState, status: text('[data-tier-pricing-status]'), strong: text('[data-tier-pricing-status] strong'), aside: text('[data-tier-pricing-aside]'), tone: find('[data-tier-pricing-aside]')!.dataset.tone, fill: find('[data-tier-pricing-fill]')!.style.width, dot: text('[data-tier-pricing-dot]'), dotPct: find('[data-tier-pricing-dot]')!.style.getPropertyValue('--sparkly-tier-pct'), markers: [...root.querySelectorAll('.sparkly-tier-pricing__marker')].map((marker) => [marker.className, marker.textContent, (marker as HTMLElement).style.getPropertyValue('--sparkly-tier-pct')]), valueNow: find('[data-tier-pricing-bar]')!.getAttribute('aria-valuenow'), valueText: find('[data-tier-pricing-bar]')!.getAttribute('aria-valuetext') }
      : null,
  }
}

// An ended flash sale is left out on purpose: the storefront shows only the plain price, the preview keeps
// the tier card with a "Flash sale ended" bar (see buildPreviewModel.test.ts).
describe('the preview prints what the storefront script prints', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
  })
  afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

  const none = { nowSeconds: START, flash: null, highDemand: false }
  const cases: [string, Scenario][] = [
    ['one unit, below the first tier', { ...none, quantity: 1, tiers: PERCENT }],
    ['the first tier', { ...none, quantity: 3, tiers: PERCENT }],
    ['between two tiers', { ...none, quantity: 4, tiers: PERCENT }],
    ['the top tier', { ...none, quantity: 5, tiers: PERCENT }],
    ['past the top tier', { ...none, quantity: 9, tiers: PERCENT }],
    ['fixed prices', { ...none, quantity: 2, tiers: FIXED }],
    ['the High Demand tag', { ...none, quantity: 1, tiers: PERCENT, highDemand: true }],
    ['no tiers, only the price', { ...none, quantity: 1, tiers: [] }],
    ['a flash sale before its start, teaser on', { nowSeconds: START - (2 * 3600 + 10 * 60), quantity: 3, tiers: PERCENT, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: true }, highDemand: false }],
    ['a flash sale before its start, teaser off', { nowSeconds: START - 60, quantity: 1, tiers: PERCENT, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: false }, highDemand: false }],
    ['a running flash sale below the first tier', { nowSeconds: END - (4 * 3600 + 18 * 60 + 49), quantity: 1, tiers: PERCENT, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: true }, highDemand: false }],
    ['a running flash sale at the first tier', { nowSeconds: END - 3700, quantity: 3, tiers: PERCENT, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: true }, highDemand: false }],
    ['a running flash sale at a higher tier', { nowSeconds: END - 90, quantity: 5, tiers: PERCENT, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: true }, highDemand: true }],
  ]

  it.each(cases)('%s', async (_name, scenario) => {
    const fromScript = mountScript(scenario)
    await vi.advanceTimersByTimeAsync(0)
    const expected = fingerprint(fromScript)
    document.body.innerHTML = ''
    const fromPreview = renderPreview(scenario)
    expect(fingerprint(fromPreview)).toEqual(expected)
  })
})
