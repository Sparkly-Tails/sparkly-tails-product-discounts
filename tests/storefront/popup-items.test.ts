import { describe, it, expect } from 'vitest'
import { listEligibleItems, isCompletable, chooseQuickFill, sumQuickFillCost, readSharedPrice, LIST_TOOLS, FILL_TOOLS } from '../../extensions/product-tier-pricing/src/popup/items.js'

const ITEM_TOOLS = { ...LIST_TOOLS, ...FILL_TOOLS }

type LiveVariant = { id: number; title: string; price: number; available: boolean; featured_image?: { src: string } | null }
const productOf = (handle: string, title: string, variants: LiveVariant[], featuredImage: string | null = null) => ({ handle, title, featured_image: featuredImage, variants })
const variantOf = (id: number, title: string, price = 169, available = true, image: string | null = null): LiveVariant => ({ id, title, price, available, featured_image: image ? { src: image } : null })

const feedOf = (...products: ReturnType<typeof productOf>[]) => new Map(products.map((product) => [product.handle, product]))

describe('listEligibleItems', () => {
  const tuna = productOf('tuna', 'Tuna', [variantOf(11, 'Small'), variantOf(12, 'Large', 179)], 'https://cdn.test/tuna.jpg')

  it('offers every variant of a member without listed variants, with prices in currency units', () => {
    const items = listEligibleItems({ products: feedOf(tuna), members: [{ productId: '100', handle: 'tuna', variantIds: null }], tools: ITEM_TOOLS })
    expect(items.map((item: { variantId: string; price: number }) => [item.variantId, item.price])).toEqual([['11', 1.69], ['12', 1.79]])
    expect(items[0]).toMatchObject({ productId: '100', handle: 'tuna', available: true, imageUrl: 'https://cdn.test/tuna.jpg' })
  })

  it('offers only the listed variants of a member that lists variants (Review Focus 2)', () => {
    const items = listEligibleItems({ products: feedOf(tuna), members: [{ productId: '100', handle: 'tuna', variantIds: ['11'] }], tools: ITEM_TOOLS })
    expect(items.map((item: { variantId: string }) => item.variantId)).toEqual(['11'])
  })

  it('labels a product with one variant by the product, and one with several "Product – Variant"', () => {
    const single = productOf('salmon', 'Salmon', [variantOf(21, 'Default Title')])
    const members = [{ productId: '100', handle: 'tuna', variantIds: ['12'] }, { productId: '200', handle: 'salmon', variantIds: null }]
    const items = listEligibleItems({ products: feedOf(tuna, single), members, tools: ITEM_TOOLS })
    expect(items.map((item: { label: string }) => item.label)).toEqual(['Tuna – Large', 'Salmon'])
  })

  it('takes the variant\'s own picture first, then the product\'s, then none', () => {
    const product = productOf('duck', 'Duck', [variantOf(31, 'A', 100, true, 'https://cdn.test/a.jpg'), variantOf(32, 'B')], 'https://cdn.test/duck.jpg')
    const bare = productOf('hen', 'Hen', [variantOf(41, 'A')])
    const members = [{ productId: '300', handle: 'duck', variantIds: null }, { productId: '400', handle: 'hen', variantIds: null }]
    const items = listEligibleItems({ products: feedOf(product, bare), members, tools: ITEM_TOOLS })
    expect(items.map((item: { imageUrl: string | null }) => item.imageUrl)).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/duck.jpg', null])
  })

  it('keeps an unavailable variant, marked, and leaves out a product whose data is missing', () => {
    const soldOut = productOf('cod', 'Cod', [variantOf(51, 'A', 100, false)])
    const members = [{ productId: '500', handle: 'cod', variantIds: null }, { productId: '600', handle: 'gone', variantIds: null }]
    const items = listEligibleItems({ products: feedOf(soldOut), members, tools: ITEM_TOOLS })
    expect(items.map((item: { variantId: string; available: boolean }) => [item.variantId, item.available])).toEqual([['51', false]])
  })
})

describe('isCompletable', () => {
  it('needs at least one available item', () => {
    expect(isCompletable({ items: [{ available: false }, { available: false }] })).toBe(false)
    expect(isCompletable({ items: [{ available: false }, { available: true }] })).toBe(true)
    expect(isCompletable({ items: [] })).toBe(false)
  })
})

describe('chooseQuickFill', () => {
  const item = (variantId: string, price: number, available = true) => ({ variantId, productId: '1', handle: 'h', label: variantId, imageUrl: null, price, available })
  const ITEMS = [item('A', 1.63), item('B', 1.63), item('C', 1.69), item('D', 1.69)]
  const inCart = (...ids: string[]) => ids.map((id) => ({ product_id: 1, variant_id: id, quantity: 1 }))
  const choose = (overrides: { items?: ReturnType<typeof item>[]; lines?: object[]; missing: number }) => chooseQuickFill({ items: ITEMS, lines: [], tools: ITEM_TOOLS, ...overrides })

  it('takes the variants already in the cart first, in cart order, then the others in list order, one unit each', () => {
    expect(choose({ missing: 3, lines: inCart('A', 'B') })).toEqual([{ variantId: 'A', quantity: 1 }, { variantId: 'B', quantity: 1 }, { variantId: 'C', quantity: 1 }])
  })

  it('follows the cart order, not the list order', () => {
    expect(choose({ missing: 2, lines: inCart('B', 'A') })).toEqual([{ variantId: 'B', quantity: 1 }, { variantId: 'A', quantity: 1 }])
  })

  it('fills the rest with the others when only one variant is in the cart', () => {
    expect(choose({ missing: 3, lines: inCart('A') })).toEqual([{ variantId: 'A', quantity: 1 }, { variantId: 'B', quantity: 1 }, { variantId: 'C', quantity: 1 }])
  })

  it('makes a second pass when the units are more than the variants, adding up per variant', () => {
    const two = [item('A', 1), item('B', 1)]
    expect(choose({ items: two, missing: 4, lines: inCart('A', 'B') })).toEqual([{ variantId: 'A', quantity: 2 }, { variantId: 'B', quantity: 2 }])
    expect(choose({ items: two, missing: 3, lines: [] })).toEqual([{ variantId: 'A', quantity: 2 }, { variantId: 'B', quantity: 1 }])
  })

  it('skips a sold-out variant, even one in the cart', () => {
    const items = [item('A', 1, false), item('B', 1), item('C', 1)]
    expect(choose({ items, missing: 2, lines: inCart('A') })).toEqual([{ variantId: 'B', quantity: 1 }, { variantId: 'C', quantity: 1 }])
  })

  it('counts a variant once however many cart lines it has', () => {
    const lines = [...inCart('A'), ...inCart('A')]
    expect(choose({ missing: 2, lines })).toEqual([{ variantId: 'A', quantity: 1 }, { variantId: 'B', quantity: 1 }])
  })

  it('picks nothing when nothing is available or nothing is missing', () => {
    expect(choose({ items: [item('A', 1, false)], missing: 2 })).toEqual([])
    expect(choose({ items: [], missing: 2 })).toEqual([])
    expect(choose({ missing: 0 })).toEqual([])
  })
})

describe('sumQuickFillCost', () => {
  it('adds units times price, rounded to cents', () => {
    const items = [{ variantId: 'A', price: 1.63 }, { variantId: 'C', price: 1.69 }]
    expect(sumQuickFillCost({ picks: [{ variantId: 'A', quantity: 2 }, { variantId: 'C', quantity: 1 }], items, tools: ITEM_TOOLS })).toBe(4.95)
    expect(sumQuickFillCost({ picks: [], items, tools: ITEM_TOOLS })).toBe(0)
  })
})

describe('readSharedPrice', () => {
  it('is the price the items share, in any availability', () => {
    expect(readSharedPrice({ items: [{ price: 1.69 }, { price: 1.69 }], tools: ITEM_TOOLS })).toBe(1.69)
    expect(readSharedPrice({ items: [{ price: 1.69 }], tools: ITEM_TOOLS })).toBe(1.69)
  })

  it('is null when the prices differ, or there are no items, so no chips are shown', () => {
    expect(readSharedPrice({ items: [{ price: 1.69 }, { price: 1.79 }], tools: ITEM_TOOLS })).toBeNull()
    expect(readSharedPrice({ items: [], tools: ITEM_TOOLS })).toBeNull()
  })
})
