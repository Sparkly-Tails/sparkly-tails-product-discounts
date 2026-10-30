import { describe, it, expect } from 'vitest'
import { parseDiscountForm, findFormProblem, readName, readPricingMode } from '@/form/parseDiscountForm'
import { PARSE_TOOLS } from '@/form/parseTools'

function formWith(fields: Record<string, string | string[]>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) for (const item of [value].flat()) formData.append(key, item)
  return formData
}

const VALID = {
  name: '  Salmon Oil Volume Discount ',
  'member-0-productId': 'gid://shopify/Product/1',
  'member-0-variantId': 'gid://shopify/ProductVariant/10',
  'member-1-productId': 'gid://shopify/Product/2',
  pricingMode: 'percent',
  'tier-0-minQty': '5',
  'tier-0-percentOff': '15',
  'tier-1-minQty': '3',
  'tier-1-percentOff': '10',
  'tier-1-anchorPrice': '75.5',
}

const parse = (fields: Record<string, string | string[]>) => parseDiscountForm({ formData: formWith(fields), tools: PARSE_TOOLS })

describe('parseDiscountForm: a good form', () => {
  it('reads the name (trimmed), the products, the mode and the tiers sorted by quantity', () => {
    expect(parse(VALID)).toEqual({
      values: {
        name: 'Salmon Oil Volume Discount',
        members: [{ productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10' }, { productId: 'gid://shopify/Product/2' }],
        pricingMode: 'percent',
        tiers: [{ minQty: 3, percentOff: 10, anchorPrice: 75.5 }, { minQty: 5, percentOff: 15 }],
        flash: null,
        highDemand: false,
        goLive: false,
        takeOffline: false,
      },
    })
  })

  it('reads fixed prices when the mode is fixed', () => {
    const result = parse({ ...VALID, pricingMode: 'fixed', 'tier-0-fixedPrice': '1.5', 'tier-1-fixedPrice': '1.7' })
    expect('values' in result && result.values.tiers).toEqual([{ minQty: 3, fixedPrice: 1.7 }, { minQty: 5, fixedPrice: 1.5 }])
  })

  it('reads the flash sale only while its switch is on', () => {
    const flash = { flashStartsAt: '2026-11-27T09:00', flashEndsAt: '2026-11-30T23:59', flashShowTeaser: 'on' }
    expect('values' in parse({ ...VALID, ...flash }) && (parse({ ...VALID, ...flash }) as { values: { flash: unknown } }).values.flash).toBeNull()
    const on = parse({ ...VALID, ...flash, flashEnabled: 'on' })
    expect('values' in on && on.values.flash).toEqual({ startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true })
  })

  it('reads High Demand, Go live and Take offline from their boxes and buttons', () => {
    const result = parse({ ...VALID, highDemand: 'on', goLive: 'on' })
    expect('values' in result && [result.values.highDemand, result.values.goLive, result.values.takeOffline]).toEqual([true, true, false])
    const offline = parse({ ...VALID, takeOffline: 'on' })
    expect('values' in offline && [offline.values.goLive, offline.values.takeOffline]).toEqual([false, true])
  })

  it('leaves a tier out of the product fields that is not complete', () => {
    const result = parse({ ...VALID, 'tier-2-minQty': '', 'tier-2-percentOff': '' })
    expect('values' in result && result.values.tiers).toHaveLength(2)
  })
})

describe('parseDiscountForm: a form that cannot be saved', () => {
  it('asks for a name', () => {
    expect(parse({ ...VALID, name: '   ' })).toEqual({ error: 'A name is required' })
  })

  it('asks for a product', () => {
    const { 'member-0-productId': _a, 'member-0-variantId': _b, 'member-1-productId': _c, ...withoutProducts } = VALID
    expect(parse(withoutProducts)).toEqual({ error: 'At least one product or variant is required' })
  })

  it('asks for a tier', () => {
    expect(parse({ ...VALID, 'tier-0-minQty': '', 'tier-1-minQty': '' })).toEqual({ error: 'At least one tier is required' })
  })

  it('reports the first problem when there are several', () => {
    expect(parse({ pricingMode: 'percent' })).toEqual({ error: 'A name is required' })
  })
})

describe('the small steps', () => {
  it('readName trims and tolerates a missing name', () => {
    expect(readName({ formData: formWith({ name: ' x ' }) })).toBe('x')
    expect(readName({ formData: formWith({}) })).toBe('')
  })

  it('readPricingMode is fixed only when asked for', () => {
    expect(readPricingMode({ formData: formWith({ pricingMode: 'fixed' }) })).toBe('fixed')
    expect(readPricingMode({ formData: formWith({ pricingMode: 'anything' }) })).toBe('percent')
    expect(readPricingMode({ formData: formWith({}) })).toBe('percent')
  })

  it('findFormProblem finds nothing wrong with good values', () => {
    expect(findFormProblem({ values: { name: 'x', members: [{ productId: 'p' }], pricingMode: 'percent', tiers: [{ minQty: 1, percentOff: 5 }], flash: null, highDemand: false, goLive: false, takeOffline: false } })).toBeNull()
  })
})
