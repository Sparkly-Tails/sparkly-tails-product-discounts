import { describe, it, expect } from 'vitest'
import { DEFAULT_WIDGET_STYLE } from '@/lib/widgetStyle'
import { isFormDirty, buildComparable, buildPreviewProducts, canSaveValues, buildPreviewFlash, pickBasePrice, type FormValues } from '@/form/formValues'

const SAVED: FormValues = {
  name: 'Salmon Oil Volume Discount',
  members: [{ productId: 'p1', variantId: 'v1', productTitle: 'Salmon Oil', variantTitle: '16 fl oz', price: 28, imageUrl: null }],
  pricingMode: 'percent',
  tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 15, anchorPrice: 100 }],
  flash: { enabled: true, startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true, highDemand: false },
  style: DEFAULT_WIDGET_STYLE,
}

const dirty = (changes: Partial<FormValues>) => isFormDirty({ initial: SAVED, current: { ...SAVED, ...changes }, tools: { buildComparable } })

describe('isFormDirty', () => {
  it('is not dirty when nothing changed', () => {
    expect(dirty({})).toBe(false)
  })

  it('is dirty when the name changes', () => {
    expect(dirty({ name: 'Other' })).toBe(true)
  })

  it('is dirty when a product is added or removed', () => {
    expect(dirty({ members: [] })).toBe(true)
    expect(dirty({ members: [...SAVED.members, { productId: 'p2', productTitle: 'Chews', price: 32, imageUrl: null }] })).toBe(true)
  })

  it('is dirty when another variant of the product is chosen', () => {
    expect(dirty({ members: [{ ...SAVED.members[0], variantId: 'v2' }] })).toBe(true)
  })

  it('is dirty when a tier, the mode or an anchor price changes', () => {
    expect(dirty({ tiers: [{ minQty: 3, percentOff: 12 }, SAVED.tiers[1]] })).toBe(true)
    expect(dirty({ tiers: [SAVED.tiers[0], { minQty: 5, percentOff: 15 }] })).toBe(true)
    expect(dirty({ pricingMode: 'fixed' })).toBe(true)
  })

  it('is dirty when the flash window, the teaser or High Demand changes', () => {
    expect(dirty({ flash: { ...SAVED.flash, endsAt: '2026-12-01T23:59' } })).toBe(true)
    expect(dirty({ flash: { ...SAVED.flash, showTeaser: false } })).toBe(true)
    expect(dirty({ flash: { ...SAVED.flash, highDemand: true } })).toBe(true)
    expect(dirty({ flash: { ...SAVED.flash, enabled: false } })).toBe(true)
  })

  it('is dirty when any of the four style values changes', () => {
    expect(dirty({ style: { ...SAVED.style, themeColor: '#E63946' } })).toBe(true)
    expect(dirty({ style: { ...SAVED.style, backgroundColor: '#FFFFFF' } })).toBe(true)
    expect(dirty({ style: { ...SAVED.style, cornerRadius: 0 } })).toBe(true)
    expect(dirty({ style: { ...SAVED.style, priceSize: 30 } })).toBe(true)
    expect(dirty({ style: { ...SAVED.style } })).toBe(false)
  })

  it('does not mind the product details the form does not send (titles, prices, images)', () => {
    expect(dirty({ members: [{ ...SAVED.members[0], productTitle: 'Renamed', price: 99, imageUrl: 'https://cdn.example/x.png' }] })).toBe(false)
  })

  it('does not mind the order of the keys of a tier or an undefined field', () => {
    expect(dirty({ tiers: [{ percentOff: 10, minQty: 3, anchorPrice: undefined }, { anchorPrice: 100, percentOff: 15, minQty: 5 }] })).toBe(false)
  })

  it('does not mind a window left in the fields while the flash sale is off', () => {
    const off = { ...SAVED.flash, enabled: false }
    expect(isFormDirty({ initial: { ...SAVED, flash: off }, current: { ...SAVED, flash: { ...off, startsAt: '2030-01-01T00:00', showTeaser: false } }, tools: { buildComparable } })).toBe(false)
  })
})

describe('buildPreviewProducts', () => {
  it('names each product to preview, with its variant when it has one, and its price and image', () => {
    const whole = { productId: 'p3', productTitle: 'Tuna Soup', price: 1.5, imageUrl: 'https://cdn.example/t.png' }
    expect(buildPreviewProducts({ members: [SAVED.members[0], whole] })).toEqual([
      { title: 'Salmon Oil (16 fl oz)', price: 28, imageUrl: null },
      { title: 'Tuna Soup', price: 1.5, imageUrl: 'https://cdn.example/t.png' },
    ])
  })

  it('has no products for no members', () => {
    expect(buildPreviewProducts({ members: [] })).toEqual([])
  })
})

describe('canSaveValues', () => {
  it('needs a product and a complete tier', () => {
    expect(canSaveValues({ values: SAVED })).toBe(true)
    expect(canSaveValues({ values: { ...SAVED, members: [] } })).toBe(false)
    expect(canSaveValues({ values: { ...SAVED, tiers: [] } })).toBe(false)
  })
})

describe('buildPreviewFlash', () => {
  it('gives the window while the flash sale is on and nothing while it is off', () => {
    expect(buildPreviewFlash({ flash: SAVED.flash })).toEqual({ startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true })
    expect(buildPreviewFlash({ flash: { ...SAVED.flash, enabled: false } })).toBeNull()
  })
})

describe('pickBasePrice', () => {
  it('is the price of the first product, or nothing without a product', () => {
    expect(pickBasePrice({ members: SAVED.members })).toBe(28)
    expect(pickBasePrice({ members: [] })).toBeNull()
  })
})
