import { describe, it, expect } from 'vitest'
import {
  itemKey, productAdminUrl, discountedPrice, validateRule, validateItemsStructure,
  functionConfigBytes, assertItemsFitFunctionConfig, FUNCTION_CONFIG_MAX_BYTES, scheduleProblem, shopLocalNow,
} from '@/timeDiscounts/items'
import type { TimeDiscountItem } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

describe('itemKey', () => {
  it('distinguishes a whole product from its variants', () => {
    expect(itemKey({ productId: P1 })).not.toBe(itemKey({ productId: P1, variantId: V10 }))
    expect(itemKey({ productId: P1, variantId: V10 })).toBe(itemKey({ productId: P1, variantId: V10 }))
  })
})

describe('productAdminUrl', () => {
  it('links to the product\'s admin page by its numeric id', () => {
    expect(productAdminUrl('https://shop.myshopify.com/admin/products/', 'gid://shopify/Product/9876543210')).toBe('https://shop.myshopify.com/admin/products/9876543210')
  })
})

describe('discountedPrice', () => {
  it('takes the percentage off the regular price, rounded to pence', () => {
    expect(discountedPrice({ pricingMode: 'percent', amount: 20 }, 22)).toBe(17.6)
    expect(discountedPrice({ pricingMode: 'percent', amount: 12.5 }, 59.99)).toBe(52.49)
  })

  it('uses a fixed amount as the final price, whatever the regular price is', () => {
    expect(discountedPrice({ pricingMode: 'fixed', amount: 22 }, 49.99)).toBe(22)
  })

  it('never shows a fixed price above the regular price (checkout clamps it)', () => {
    expect(discountedPrice({ pricingMode: 'fixed', amount: 30 }, 25)).toBe(25)
  })

  it('clamps a percentage to 0-100', () => {
    expect(discountedPrice({ pricingMode: 'percent', amount: 150 }, 20)).toBe(0)
    expect(discountedPrice({ pricingMode: 'percent', amount: -5 }, 20)).toBe(20)
  })
})

describe('validateRule', () => {
  it('requires an amount above zero', () => {
    expect(validateRule({ pricingMode: 'percent', amount: 0 }, 20)).toBe('Enter an amount greater than zero')
    expect(validateRule({ pricingMode: 'fixed', amount: Number.NaN }, 20)).toBe('Enter an amount greater than zero')
  })

  it('caps a percentage at 100', () => {
    expect(validateRule({ pricingMode: 'percent', amount: 101 }, 20)).toBe('A percentage discount cannot exceed 100%')
    expect(validateRule({ pricingMode: 'percent', amount: 100 }, 20)).toBeNull()
  })

  it('rejects a fixed price not lower than the regular price, naming both', () => {
    expect(validateRule({ pricingMode: 'fixed', amount: 25 }, 20)).toContain('The fixed price (£25.00) is not lower than the regular price (£20.00)')
    expect(validateRule({ pricingMode: 'fixed', amount: 20 }, 20)).not.toBeNull()
    expect(validateRule({ pricingMode: 'fixed', amount: 19.99 }, 20)).toBeNull()
  })

  it('cannot judge a fixed price when the regular price is unknown', () => {
    expect(validateRule({ pricingMode: 'fixed', amount: 25 }, null)).toBeNull()
  })
})

describe('validateItemsStructure', () => {
  const row = (productId: string, variantId?: string): TimeDiscountItem => ({ productId, ...(variantId ? { variantId } : {}), pricingMode: 'percent', amount: 10 })

  it('accepts distinct products and distinct variants of one product', () => {
    expect(validateItemsStructure([row(P1, V10), row(P1, V11), row('gid://shopify/Product/2')])).toBeNull()
  })

  it('rejects the same product/variant twice', () => {
    expect(validateItemsStructure([row(P1, V10), row(P1, V10)])).toBe('This product or variant is already in the discount')
    expect(validateItemsStructure([row(P1), row(P1)])).toBe('This product or variant is already in the discount')
  })

  it('rejects a whole-product row alongside a variant row of the same product', () => {
    expect(validateItemsStructure([row(P1), row(P1, V10)])).toBe('A product cannot have both a whole-product row and variant rows')
    expect(validateItemsStructure([row(P1, V10), row(P1)])).toBe('A product cannot have both a whole-product row and variant rows')
  })
})

describe('function config size', () => {
  const rows = (n: number): TimeDiscountItem[] =>
    Array.from({ length: n }, (_, i) => ({
      productId: `gid://shopify/Product/${10_000_000_000_000 + i}`,
      variantId: `gid://shopify/ProductVariant/${50_000_000_000_000 + i}`,
      pricingMode: 'percent' as const,
      amount: 20.5,
    }))

  it('fits about 60 realistic variant rows under the guard', () => {
    expect(functionConfigBytes(rows(60))).toBeLessThan(FUNCTION_CONFIG_MAX_BYTES)
    expect(() => assertItemsFitFunctionConfig(rows(60))).not.toThrow()
  })

  it('rejects a discount that would exceed the guard, with a clear message', () => {
    expect(() => assertItemsFitFunctionConfig(rows(70))).toThrow('too many products/variants')
  })
})

describe('scheduleProblem', () => {
  it('is fine for an ordinary schedule and while a date is still empty', () => {
    expect(scheduleProblem('2026-07-01T12:00', '2026-07-02T12:00')).toBeNull()
    expect(scheduleProblem('', '')).toBeNull()
    expect(scheduleProblem('2026-07-01T12:00', '')).toBeNull()
  })

  it('says when the end is not after the start', () => {
    expect(scheduleProblem('2026-07-02T12:00', '2026-07-01T12:00')).toBe('End must be after start.')
    expect(scheduleProblem('2026-07-01T12:00', '2026-07-01T12:00')).toBe('End must be after start.')
  })

  it.each([['1999-12-31T00:00', '2026-01-02T00:00'], ['2026-01-01T00:00', '2101-01-01T00:00'], ['0202-01-01T00:00', '2026-01-02T00:00']])(
    'rejects %s / %s as an implausible year', (startsAt, endsAt) => {
      expect(scheduleProblem(startsAt, endsAt)).toBe('Enter a year between 2000 and 2100.')
    },
  )

  it('accepts the boundary years 2000 and 2100', () => {
    expect(scheduleProblem('2000-01-01T00:00', '2100-12-31T00:00')).toBeNull()
  })
})

describe('shopLocalNow', () => {
  it('is the clock on the shop wall, in the datetime-local format', () => {
    const instant = new Date('2026-07-01T11:30:00Z')
    expect(shopLocalNow('Europe/London', instant)).toBe('2026-07-01T12:30') // BST is UTC+1
    expect(shopLocalNow('America/New_York', instant)).toBe('2026-07-01T07:30') // EDT is UTC-4
    expect(shopLocalNow('Australia/Sydney', instant)).toBe('2026-07-01T21:30') // AEST is UTC+10
  })

  it('uses winter time in winter, and reads midnight as 00 rather than 24', () => {
    expect(shopLocalNow('Europe/London', new Date('2026-01-01T00:05:00Z'))).toBe('2026-01-01T00:05')
    expect(shopLocalNow('America/New_York', new Date('2026-01-01T05:05:00Z'))).toBe('2026-01-01T00:05')
  })
})

describe('scheduleProblem with the current time', () => {
  const now = '2026-07-01T12:00'

  it('rejects an end time that has already passed, including one exactly now', () => {
    expect(scheduleProblem('2026-06-01T00:00', '2026-06-30T00:00', now)).toBe('The end time has already passed. Choose a later end time.')
    expect(scheduleProblem('2026-06-01T00:00', '2026-07-01T12:00', now)).toBe('The end time has already passed. Choose a later end time.')
  })

  it('accepts an end time still ahead, even when the start is already past', () => {
    expect(scheduleProblem('2026-06-01T00:00', '2026-07-01T12:01', now)).toBeNull()
  })

  it('does not complain about the past while the end is still empty', () => {
    expect(scheduleProblem('2026-06-01T00:00', '', now)).toBeNull()
  })

  it('keeps its other messages first', () => {
    expect(scheduleProblem('2026-07-02T00:00', '2026-06-01T00:00', now)).toBe('End must be after start.')
    expect(scheduleProblem('0202-01-01T00:00', '2026-06-01T00:00', now)).toBe('Enter a year between 2000 and 2100.')
  })

  it('is unchanged without a current time (the discount page, which edits existing schedules)', () => {
    expect(scheduleProblem('2026-06-01T00:00', '2026-06-30T00:00')).toBeNull()
  })
})
