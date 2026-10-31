import { describe, it, expect } from 'vitest'
import { buildFormValues, buildSelectedMembers, buildFlashValues, buildTiersInitial } from '@/form/loadFormValues'
import type { Discount } from '@/lib/config'
import { DEFAULT_WIDGET_STYLE } from '@/lib/widgetStyle'
import type { MemberInfo } from '@/lib/products'

const SALMON: MemberInfo = { productId: 'p1', variantId: 'v1', title: 'Salmon Oil – 16 fl oz', productTitle: 'Salmon Oil', variantTitle: '16 fl oz', price: 28, handle: 'salmon', imageUrl: 'https://cdn.example/s.png' }
const TUNA: MemberInfo = { productId: 'p2', title: 'Tuna Soup', productTitle: 'Tuna Soup', price: 1.5, handle: 'tuna', imageUrl: null }

const PERCENT: Discount = {
  discountId: 'disc_1', name: 'Salmon Oil Volume Discount', title: 'Old title', status: 'draft', pricingMode: 'percent',
  members: [{ productId: 'p1', variantId: 'v1' }], tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 15, anchorPrice: 100 }],
}
const FIXED: Discount = { ...PERCENT, pricingMode: 'fixed', tiers: [{ minQty: 2, fixedPrice: 21 }] }

describe('buildSelectedMembers', () => {
  it('gives each product or variant its titles, price and image for the rows and the preview', () => {
    expect(buildSelectedMembers({ memberInfo: [SALMON, TUNA] })).toEqual([
      { productId: 'p1', variantId: 'v1', productTitle: 'Salmon Oil', variantTitle: '16 fl oz', price: 28, imageUrl: 'https://cdn.example/s.png' },
      { productId: 'p2', variantId: undefined, productTitle: 'Tuna Soup', variantTitle: undefined, price: 1.5, imageUrl: null },
    ])
  })

  it('is empty for no members', () => {
    expect(buildSelectedMembers({ memberInfo: [] })).toEqual([])
  })
})

describe('buildFlashValues', () => {
  it('is off, with the teaser ticked for later, for a discount without a flash sale', () => {
    expect(buildFlashValues({ discount: PERCENT })).toEqual({ enabled: false, startsAt: '', endsAt: '', showTeaser: true, highDemand: false })
  })

  it('shows the saved window and teaser, and High Demand', () => {
    const discount = { ...PERCENT, flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: false, shopifyDiscountId: 'rec_1' }, highDemand: true }
    expect(buildFlashValues({ discount })).toEqual({ enabled: true, startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: false, highDemand: true })
  })

  it('shows High Demand without a flash sale', () => {
    expect(buildFlashValues({ discount: { ...PERCENT, highDemand: true } }).highDemand).toBe(true)
  })
})

describe('buildTiersInitial', () => {
  it('opens a percentage discount in percent mode with its tiers and its anchor prices', () => {
    expect(buildTiersInitial({ discount: PERCENT })).toEqual({ mode: 'percent', percentTiers: [{ minQty: 3, percentOff: 10, anchorPrice: undefined }, { minQty: 5, percentOff: 15, anchorPrice: 100 }], fixedTiers: [] })
  })

  it('opens a fixed-price discount in fixed mode', () => {
    expect(buildTiersInitial({ discount: FIXED })).toEqual({ mode: 'fixed', percentTiers: [], fixedTiers: [{ minQty: 2, fixedPrice: 21 }] })
  })
})

describe('buildFormValues', () => {
  const tools = { buildSelectedMembers, buildFlashValues, buildTiersInitial }

  it('fills the form from the saved discount', () => {
    const { values, initialTiers } = buildFormValues({ discount: PERCENT, memberInfo: [SALMON], tools })
    expect(values.name).toBe('Salmon Oil Volume Discount')
    expect(values.pricingMode).toBe('percent')
    expect(values.tiers).toEqual(PERCENT.tiers)
    expect(values.members).toHaveLength(1)
    expect(values.flash.enabled).toBe(false)
    expect(initialTiers.mode).toBe('percent')
  })

  it('fills the Design card from the saved style, or with its defaults for a discount saved before styles existed', () => {
    const style = { themeColor: '#E63946', backgroundColor: '#FFFFFF', cornerRadius: 4, priceSize: 30 }
    expect(buildFormValues({ discount: { ...PERCENT, style }, memberInfo: [SALMON], tools }).values.style).toEqual(style)
    expect(buildFormValues({ discount: PERCENT, memberInfo: [SALMON], tools }).values.style).toEqual(DEFAULT_WIDGET_STYLE)
  })

  it('skips a product that no longer exists in the shop, as the old page did', () => {
    const { values } = buildFormValues({ discount: { ...PERCENT, members: [{ productId: 'p1', variantId: 'v1' }, { productId: 'gone' }] }, memberInfo: [SALMON], tools })
    expect(values.members.map((member) => member.productId)).toEqual(['p1'])
  })
})
