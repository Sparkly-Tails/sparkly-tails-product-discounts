import { describe, it, expect } from 'vitest'
import { countBundleUnits, UNIT_TOOLS } from '../../extensions/product-tier-pricing/src/popup/units.js'
import { readFirstTierQty, isBundleIncomplete, listDueBundles, DUE_TOOLS } from '../../extensions/product-tier-pricing/src/popup/due.js'
import { buildShownKey, isShown, recordShown } from '../../extensions/product-tier-pricing/src/popup/session.js'

type Line = { product_id: number; variant_id: number; quantity: number }
const line = (productId: number, variantId: number, quantity: number): Line => ({ product_id: productId, variant_id: variantId, quantity })

/** A sessionStorage stand-in. */
function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => void data.set(key, value),
    keys: () => Array.from(data.keys()),
  }
}

const NOW_SECONDS = 1_800_000_000
const TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
type Discount = { discountId?: string; tiers: object[]; members: { productId: string; handle: string; variantIds: string[] | null }[]; flash: { startsAtUnix: number; endsAtUnix: number } | null }
const discountOf = (overrides: Partial<Discount> = {}): Discount => ({ discountId: 'gid://shopify/DiscountAutomaticNode/1', tiers: TIERS, members: [{ productId: '100', handle: 'tuna', variantIds: null }], flash: null, ...overrides })

describe('countBundleUnits', () => {
  it('counts every variant of a whole-product member', () => {
    const members = [{ productId: '100', variantIds: null }]
    expect(countBundleUnits({ lines: [line(100, 1, 2), line(100, 2, 3)], members, tools: UNIT_TOOLS })).toBe(5)
  })

  it('counts only the listed variants of a member that lists variants (Review Focus 2)', () => {
    const members = [{ productId: '100', variantIds: ['2'] }]
    expect(countBundleUnits({ lines: [line(100, 2, 4), line(100, 3, 9)], members, tools: UNIT_TOOLS })).toBe(4)
  })

  it('adds the lines of two members, and ignores a line of another product', () => {
    const members = [{ productId: '100', variantIds: null }, { productId: '200', variantIds: null }]
    expect(countBundleUnits({ lines: [line(100, 1, 1), line(200, 5, 2), line(300, 9, 7)], members, tools: UNIT_TOOLS })).toBe(3)
  })
})

describe('readFirstTierQty and isBundleIncomplete', () => {
  it('reads the smallest minQty, and 0 when there are no tiers so such a discount is never incomplete', () => {
    expect(readFirstTierQty({ tiers: [{ minQty: 16 }, { minQty: 8 }] })).toBe(8)
    expect(readFirstTierQty({ tiers: [] })).toBe(0)
    expect(isBundleIncomplete({ units: 2, firstTierQty: readFirstTierQty({ tiers: [] }) })).toBe(false)
  })

  it('is incomplete from one unit up to one below the first tier', () => {
    expect(isBundleIncomplete({ units: 0, firstTierQty: 8 })).toBe(false)
    expect(isBundleIncomplete({ units: 3, firstTierQty: 8 })).toBe(true)
    expect(isBundleIncomplete({ units: 7, firstTierQty: 8 })).toBe(true)
    expect(isBundleIncomplete({ units: 8, firstTierQty: 8 })).toBe(false)
    expect(isBundleIncomplete({ units: 9, firstTierQty: 8 })).toBe(false)
  })
})

describe('the shown key and the session memory', () => {
  it('keys a discount by its id, or by its first member\'s product id when the index has no id (Review Focus 1)', () => {
    expect(buildShownKey({ discount: discountOf() })).toBe('smoothDiscountsPopup:gid://shopify/DiscountAutomaticNode/1')
    expect(buildShownKey({ discount: discountOf({ discountId: undefined }) })).toBe('smoothDiscountsPopup:p100')
  })

  it('remembers a key and finds it again', () => {
    const storage = makeStorage()
    expect(isShown({ storage, key: 'k' })).toBe(false)
    recordShown({ storage, key: 'k' })
    expect(isShown({ storage, key: 'k' })).toBe(true)
  })

  it('treats storage that throws as not shown, and does not throw when it cannot write', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(isShown({ storage: broken, key: 'k' })).toBe(false)
    expect(() => recordShown({ storage: broken, key: 'k' })).not.toThrow()
  })
})

describe('listDueBundles', () => {
  const lines = [line(100, 1, 3)]
  const due = (overrides: { discounts: Discount[]; lines?: Line[]; nowSeconds?: number; storage?: ReturnType<typeof makeStorage> }) =>
    listDueBundles({ lines, nowSeconds: NOW_SECONDS, storage: makeStorage(), tools: DUE_TOOLS, ...overrides })

  it('returns an incomplete bundle with its units and first tier', () => {
    const result = due({ discounts: [discountOf()] })
    expect(result.map((entry: { units: number; firstTierQty: number }) => [entry.units, entry.firstTierQty])).toEqual([[3, 8]])
  })

  it('skips a bundle at or above its first tier, and one with nothing in the cart', () => {
    expect(due({ discounts: [discountOf()], lines: [line(100, 1, 8)] })).toEqual([])
    expect(due({ discounts: [discountOf()], lines: [line(999, 1, 2)] })).toEqual([])
  })

  it('does not count a flash sale that ended or has not started (Review Focus 4), and counts one that runs', () => {
    const flash = (startsAtUnix: number, endsAtUnix: number) => discountOf({ flash: { startsAtUnix, endsAtUnix } })
    expect(due({ discounts: [flash(NOW_SECONDS - 100, NOW_SECONDS - 1)] })).toEqual([])
    expect(due({ discounts: [flash(NOW_SECONDS + 10, NOW_SECONDS + 100)] })).toEqual([])
    expect(due({ discounts: [flash(NOW_SECONDS - 10, NOW_SECONDS + 100)] })).toHaveLength(1)
  })

  it('does not list a bundle this session has already shown, and lists it again when the storage forgets', () => {
    const storage = makeStorage()
    storage.setItem(buildShownKey({ discount: discountOf() }), '1')
    expect(due({ discounts: [discountOf()], storage })).toEqual([])
    expect(due({ discounts: [discountOf()], storage: null as never })).toHaveLength(1)
  })

  it('keys a stale-index discount by its first product when deciding it was shown (Review Focus 1)', () => {
    const storage = makeStorage({ 'smoothDiscountsPopup:p100': '1' })
    expect(due({ discounts: [discountOf({ discountId: undefined })], storage })).toEqual([])
  })

  it('keeps the index order', () => {
    const first = discountOf({ discountId: 'a', members: [{ productId: '100', handle: 'tuna', variantIds: null }] })
    const second = discountOf({ discountId: 'b', members: [{ productId: '200', handle: 'salmon', variantIds: null }] })
    const result = due({ discounts: [first, second], lines: [line(200, 2, 1), line(100, 1, 1)] })
    expect(result.map((entry: { discount: Discount }) => entry.discount.discountId)).toEqual(['a', 'b'])
  })
})
