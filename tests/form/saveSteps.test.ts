import { describe, it, expect } from 'vitest'
import {
  pickStatus, buildDiscountFields, readRecordId, keepRecordId, buildNewDiscount, mergeDiscount, replaceDiscount, listRemovedProducts,
  isWindowChanged, isWindowCheckNeeded, describeSaveError,
} from '@/form/saveSteps'
import type { ParsedDiscount } from '@/form/parseDiscountForm'
import type { Discount } from '@/lib/config'

const VALUES: ParsedDiscount = {
  name: 'Black Friday',
  members: [{ productId: 'p1' }],
  pricingMode: 'percent',
  tiers: [{ minQty: 3, percentOff: 10 }],
  flash: null,
  highDemand: false,
  goLive: false,
}
const EXISTING: Discount = {
  discountId: 'disc_1', name: 'Old name', title: 'Old customer title', status: 'live', pricingMode: 'percent',
  members: [{ productId: 'p1' }, { productId: 'p2' }], tiers: [{ minQty: 2, percentOff: 5 }],
  flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/9' },
}

describe('pickStatus', () => {
  it('goes live when Go live was used, else keeps the status', () => {
    expect(pickStatus({ goLive: true, current: 'draft' })).toBe('live')
    expect(pickStatus({ goLive: false, current: 'draft' })).toBe('draft')
    expect(pickStatus({ goLive: false, current: 'live' })).toBe('live')
  })
})

describe('buildDiscountFields', () => {
  it('takes the products, mode, tiers, flash sale and High Demand from the form', () => {
    expect(buildDiscountFields({ values: VALUES })).toEqual({ pricingMode: 'percent', members: VALUES.members, tiers: VALUES.tiers, flash: undefined, highDemand: undefined })
    const withBoth = buildDiscountFields({ values: { ...VALUES, flash: { startsAt: 'a', endsAt: 'b', showTeaser: true }, highDemand: true } })
    expect(withBoth.flash).toEqual({ startsAt: 'a', endsAt: 'b', showTeaser: true })
    expect(withBoth.highDemand).toBe(true)
  })
})

describe('readRecordId and keepRecordId', () => {
  it('reads the id of the Shopify discount of the flash sale, if there is one', () => {
    expect(readRecordId({ discount: EXISTING })).toBe('gid://shopify/DiscountAutomaticNode/9')
    expect(readRecordId({ discount: { ...EXISTING, flash: undefined } })).toBeUndefined()
    expect(readRecordId({ discount: undefined })).toBeUndefined()
  })

  it('keeps that id on the flash sale from the form', () => {
    const flash = { startsAt: 'a', endsAt: 'b', showTeaser: true }
    expect(keepRecordId({ flash, previousRecordId: 'rec_1' })).toEqual({ ...flash, shopifyDiscountId: 'rec_1' })
    expect(keepRecordId({ flash, previousRecordId: undefined })).toEqual(flash)
    expect(keepRecordId({ flash: undefined, previousRecordId: 'rec_1' })).toBeUndefined()
  })
})

describe('buildNewDiscount', () => {
  const tools = { pickStatus, buildDiscountFields }

  it('is a draft titled with its own name', () => {
    const discount = buildNewDiscount({ values: VALUES, discountId: 'disc_new', tools })
    expect(discount).toMatchObject({ discountId: 'disc_new', name: 'Black Friday', title: 'Black Friday', status: 'draft', pricingMode: 'percent', members: VALUES.members, tiers: VALUES.tiers })
  })

  it('is live when Go live was used', () => {
    expect(buildNewDiscount({ values: { ...VALUES, goLive: true }, discountId: 'd', tools }).status).toBe('live')
  })
})

describe('mergeDiscount', () => {
  const tools = { pickStatus, buildDiscountFields, readRecordId, keepRecordId }

  it('changes what the form holds and keeps the id, the title and the status', () => {
    const merged = mergeDiscount({ existing: EXISTING, values: VALUES, tools })
    expect(merged).toMatchObject({ discountId: 'disc_1', name: 'Black Friday', title: 'Old customer title', status: 'live', members: VALUES.members, tiers: VALUES.tiers })
  })

  it('keeps the Shopify discount of the flash sale when the sale stays', () => {
    const merged = mergeDiscount({ existing: EXISTING, values: { ...VALUES, flash: { startsAt: '2026-12-01T09:00', endsAt: '2026-12-02T09:00', showTeaser: false } }, tools })
    expect(merged.flash).toEqual({ startsAt: '2026-12-01T09:00', endsAt: '2026-12-02T09:00', showTeaser: false, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/9' })
  })

  it('drops the flash sale when the switch is off, and goes live from a draft with Go live', () => {
    expect(mergeDiscount({ existing: EXISTING, values: VALUES, tools }).flash).toBeUndefined()
    expect(mergeDiscount({ existing: { ...EXISTING, status: 'draft' }, values: { ...VALUES, goLive: true }, tools }).status).toBe('live')
  })
})

describe('replaceDiscount', () => {
  it('puts the discount in the place of the one with its id', () => {
    const other = { ...EXISTING, discountId: 'disc_2' }
    const next = { ...EXISTING, name: 'New' }
    expect(replaceDiscount({ discounts: [other, EXISTING], next })).toEqual([other, next])
  })
})

describe('listRemovedProducts', () => {
  it('lists the products that were dropped, not the ones whose variants changed', () => {
    expect(listRemovedProducts({ previousMembers: [{ productId: 'p1', variantId: 'v1' }, { productId: 'p2' }], nextMembers: [{ productId: 'p1', variantId: 'v2' }] })).toEqual([{ productId: 'p2' }])
  })

  it('lists nothing for a new discount', () => {
    expect(listRemovedProducts({ previousMembers: [], nextMembers: [{ productId: 'p1' }] })).toEqual([])
  })
})

describe('isWindowChanged and isWindowCheckNeeded', () => {
  const flash = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true }

  it('sees a window that is new or moved', () => {
    expect(isWindowChanged({ previous: undefined, flash })).toBe(true)
    expect(isWindowChanged({ previous: EXISTING.flash, flash: { ...flash, endsAt: '2026-12-01T23:59' } })).toBe(true)
    expect(isWindowChanged({ previous: EXISTING.flash, flash })).toBe(false)
  })

  it('checks a window that changed or that goes live, not one that is left alone', () => {
    const tools = { isWindowChanged }
    const previousFlash = EXISTING.flash
    expect(isWindowCheckNeeded({ previousFlash, values: { ...VALUES, flash }, tools })).toBe(false)
    expect(isWindowCheckNeeded({ previousFlash, values: { ...VALUES, flash, goLive: true }, tools })).toBe(true)
    expect(isWindowCheckNeeded({ previousFlash, values: { ...VALUES, flash: { ...flash, endsAt: '2027-01-01T00:00' } }, tools })).toBe(true)
    expect(isWindowCheckNeeded({ previousFlash: undefined, values: { ...VALUES, flash }, tools })).toBe(true)
    expect(isWindowCheckNeeded({ previousFlash, values: VALUES, tools })).toBe(false)
  })
})

describe('describeSaveError', () => {
  it('uses the message of an error, and a plain sentence for anything else', () => {
    expect(describeSaveError({ error: new Error('Shopify refused') })).toBe('Shopify refused')
    expect(describeSaveError({ error: 'weird' })).toBe('The discount could not be saved. Try again.')
  })
})
