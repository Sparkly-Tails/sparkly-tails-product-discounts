import { describe, it, expect } from 'vitest'
import { buildPreviewModel } from '@/form/preview/buildPreviewModel'
import { PREVIEW_TOOLS } from '@/form/preview/previewTools'
import { WIDGET_FUNCTIONS } from '@/form/preview/widgetFunctions'

const SALMON = { title: 'Salmon Oil', price: 28, imageUrl: null }
const CHEWS = { title: 'Joint Chews', price: 40, imageUrl: null }
const PERCENT_TIERS = [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 15 }]
const NOW = Date.parse('2026-10-30T12:00:00Z') / 1000

function build(overrides: Partial<Parameters<typeof buildPreviewModel>[0]> = {}) {
  return buildPreviewModel({
    products: [SALMON],
    selectedIndex: 0,
    tiers: PERCENT_TIERS,
    flash: null,
    highDemand: false,
    quantity: 1,
    timeZone: 'UTC',
    nowSeconds: NOW,
    formatMoney: (amount: number) => WIDGET_FUNCTIONS.formatMoney(amount, '${{amount}}'),
    tools: PREVIEW_TOOLS,
    ...overrides,
  })
}

describe('buildPreviewModel: nothing to show', () => {
  it('is empty with no product, so the preview can ask for one', () => {
    expect(build({ products: [] })).toEqual({ isEmpty: true, viewModel: null })
  })

  it('shows the plain price, as the real widget does, when there is a product but no complete tier', () => {
    const model = build({ tiers: [] })
    expect(model.isEmpty).toBe(false)
    expect(model.viewModel?.showCard).toBe(false)
    expect(model.viewModel?.plainPrice).toBe('$28.00')
  })
})

describe('buildPreviewModel: tiers', () => {
  it('has a chip for the one-unit price and for each tier', () => {
    const labels = build().viewModel?.chips.map((chip) => chip.label)
    expect(labels).toEqual(['1 × $28.00', '3 × $75.60', '5 × $119.00'])
  })

  it('shows the tier price once its quantity is chosen', () => {
    const viewModel = build({ quantity: 3 }).viewModel
    expect(viewModel?.discountedPrice).toBe('$25.20')
    expect(viewModel?.tag).toEqual({ kind: 'tier', text: 'Tier 1 Active (3+ units)' })
  })

  it('uses an anchor price as the exact total for its quantity', () => {
    const labels = build({ products: [{ title: 'Pack', price: 729.95, imageUrl: null }], tiers: [{ minQty: 2, anchorPrice: 600, percentOff: 5 }, { minQty: 4, anchorPrice: 500, percentOff: 5 }] }).viewModel?.chips.map((chip) => chip.label)
    expect(labels).toEqual(['1 × $729.95', '2 × $600.00', '4 × $500.00'])
  })

  it('works with fixed prices', () => {
    const labels = build({ tiers: [{ minQty: 2, fixedPrice: 21 }] }).viewModel?.chips.map((chip) => chip.label)
    expect(labels).toEqual(['1 × $28.00', '2 × $42.00'])
  })

  it('shows the High Demand tag below the first tier when it is on', () => {
    expect(build({ highDemand: true }).viewModel?.tag).toEqual({ kind: 'high-demand', text: 'High Demand' })
    expect(build({ highDemand: false }).viewModel?.tag).toBeNull()
  })
})

describe('buildPreviewModel: which product', () => {
  it('prices the product that was chosen to preview', () => {
    expect(build({ products: [SALMON, CHEWS], selectedIndex: 1 }).viewModel?.plainPrice).toBe('$40.00')
  })

  it('falls back to a product that exists when the chosen one is gone', () => {
    expect(build({ products: [SALMON], selectedIndex: 3 }).viewModel?.plainPrice).toBe('$28.00')
    expect(build({ products: [SALMON], selectedIndex: -1 }).viewModel?.plainPrice).toBe('$28.00')
  })
})

describe('buildPreviewModel: flash sale', () => {
  const sale = (startsAt: string, endsAt: string, showTeaser = true) => ({ startsAt, endsAt, showTeaser })

  it('shows the teaser, without tier prices, before the sale starts', () => {
    const viewModel = build({ flash: sale('2026-10-30T14:00', '2026-10-31T14:00') }).viewModel
    expect(viewModel?.flashBar?.variant).toBe('teaser')
    expect(viewModel?.flashBar?.label).toBe('Flash sale starts in')
    expect(viewModel?.showChips).toBe(false)
  })

  it('shows no bar before the start when the teaser is off', () => {
    expect(build({ flash: sale('2026-10-30T14:00', '2026-10-31T14:00', false) }).viewModel?.flashBar?.variant).toBe('hidden')
  })

  it('counts down to the end of a running sale, in the shop time zone', () => {
    const viewModel = build({ flash: sale('2026-10-30T09:00', '2026-10-30T20:00'), timeZone: 'UTC' }).viewModel
    expect(viewModel?.flashBar?.variant).toBe('ends')
    expect(viewModel?.flashBar?.timerParts).toEqual(['08', '00', '00'])
    const inNewYork = build({ flash: sale('2026-10-30T05:00', '2026-10-30T20:00'), timeZone: 'America/New_York' }).viewModel
    expect(inNewYork?.flashBar?.timerParts).toEqual(['12', '00', '00'])
  })

  it('shows the tier card with a "Flash sale ended" bar once the sale has ended, so the tiers can still be tried', () => {
    const viewModel = build({ flash: sale('2026-10-29T09:00', '2026-10-30T09:00'), quantity: 3 }).viewModel
    expect(viewModel?.showCard).toBe(true)
    expect(viewModel?.showChrome).toBe(true)
    expect(viewModel?.flashBar).toEqual({ variant: 'ended', text: 'Flash sale ended', label: 'Flash sale ended', timerParts: [], aside: '', chip: '' })
    expect(viewModel?.discountedPrice).toBe('$25.20')
  })

  it('counts the minute the sale ends as ended, and the minute before it as running', () => {
    expect(build({ flash: sale('2026-10-29T09:00', '2026-10-30T12:00') }).viewModel?.flashBar?.variant).toBe('ended')
    expect(build({ flash: sale('2026-10-29T09:00', '2026-10-30T12:01') }).viewModel?.flashBar?.variant).toBe('ends')
  })

  it('shows no ended bar when the ended sale has no complete tier to show', () => {
    expect(build({ flash: sale('2026-10-29T09:00', '2026-10-30T09:00'), tiers: [] }).viewModel?.flashBar).toBeNull()
  })

  it('treats an unfinished or impossible window as no flash sale', () => {
    expect(build({ flash: sale('', '2026-10-31T14:00') }).viewModel?.flashBar).toBeNull()
    expect(build({ flash: sale('2026-10-31T14:00', '2026-10-30T14:00') }).viewModel?.flashBar).toBeNull()
  })
})
