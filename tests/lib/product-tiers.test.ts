import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildProductMetafields,
  metafieldWrites,
  syncDiscountMetafields,
  clearDiscountMetafields,
  findExistingIds,
  SIBLING_REFERENCE_LIMIT,
  SIBLING_PRODUCTS_KEY,
  SIBLING_VARIANTS_KEY,
} from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from '@/lib/metafieldNames'
import * as products from '@/lib/products'
import type { Discount } from '@/lib/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const P3 = 'gid://shopify/Product/3'
const V20 = 'gid://shopify/ProductVariant/20'
const V21 = 'gid://shopify/ProductVariant/21'

const mix: Discount = {
  discountId: 'disc_1', name: 'Mix', title: 'Mix & Match', status: 'live', pricingMode: 'percent',
  members: [{ productId: P1 }, { productId: P2, variantId: V20 }, { productId: P2, variantId: V21 }],
  tiers: [{ minQty: 7, percentOff: 4 }],
}

describe('buildProductMetafields', () => {
  it('a whole-product member gets variant siblings as IDs only, and no copied display fields', () => {
    const built = buildProductMetafields(mix, P1, SIBLING_REFERENCE_LIMIT)
    expect(built.value).toEqual({
      discountId: 'disc_1',
      title: 'Mix & Match',
      pricingMode: 'percent',
      tiers: [{ minQty: 7, percentOff: 4 }],
      ownVariantIds: null,
      siblings: [
        { productId: P2, variantId: V20 },
        { productId: P2, variantId: V21 },
      ],
    })
    expect(built.productRefs).toEqual([])
    expect(built.variantRefs).toEqual([V20, V21])
  })

  it('a product with several of its own variants lists them in ownVariantIds and gets the whole-product sibling as a product reference', () => {
    const built = buildProductMetafields(mix, P2, SIBLING_REFERENCE_LIMIT)
    expect(built.value.ownVariantIds).toEqual([V20, V21])
    expect(built.value.siblings).toEqual([{ productId: P1 }])
    expect(built.productRefs).toEqual([P1])
    expect(built.variantRefs).toEqual([])
    expect('ownVariantOptions' in built.value).toBe(false)
  })

  it('keeps member order in the siblings and in each reference list', () => {
    const discount: Discount = {
      ...mix,
      members: [{ productId: P1 }, { productId: P2, variantId: V20 }, { productId: P3 }, { productId: P2, variantId: V21 }],
    }
    const built = buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT)
    expect(built.value.siblings).toEqual([
      { productId: P2, variantId: V20 },
      { productId: P3 },
      { productId: P2, variantId: V21 },
    ])
    expect(built.productRefs).toEqual([P3])
    expect(built.variantRefs).toEqual([V20, V21])
  })

  it('caps each reference list at the limit but still keeps every sibling ID, so extra rows are counted though not listed', () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ productId: `gid://shopify/Product/${100 + i}` }))
    const discount: Discount = { ...mix, members: [{ productId: P1 }, ...many] }
    const built = buildProductMetafields(discount, P1, 2)
    expect(built.productRefs).toEqual(['gid://shopify/Product/100', 'gid://shopify/Product/101'])
    expect(built.value.siblings).toHaveLength(4)
  })

  it('leaves a sibling that no longer exists out of the reference lists but keeps its ID in siblings', () => {
    const gone = 'gid://shopify/Product/99'
    const discount: Discount = { ...mix, members: [{ productId: P1 }, { productId: P3 }, { productId: gone }, { productId: P2, variantId: V20 }] }
    const built = buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT, new Set([P3, V20]))
    expect(built.productRefs).toEqual([P3])
    expect(built.variantRefs).toEqual([V20])
    expect(built.value.siblings).toEqual([{ productId: P3 }, { productId: gone }, { productId: P2, variantId: V20 }])
  })

  it('a sibling that no longer exists does not use up a slot of the reference limit', () => {
    const discount: Discount = { ...mix, members: [{ productId: P1 }, { productId: 'gid://shopify/Product/98' }, { productId: P3 }, { productId: P2 }] }
    const built = buildProductMetafields(discount, P1, 2, new Set([P3, P2]))
    expect(built.productRefs).toEqual([P3, P2])
  })

  it('a product that is the only member has no siblings and no references', () => {
    const discount: Discount = { ...mix, members: [{ productId: P1 }] }
    const built = buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT)
    expect(built.value.siblings).toEqual([])
    expect(built.productRefs).toEqual([])
    expect(built.variantRefs).toEqual([])
  })
})

describe('metafieldWrites', () => {
  it('sets the discount and each non-empty list, and deletes each empty list', () => {
    const built = buildProductMetafields(mix, P1, SIBLING_REFERENCE_LIMIT)
    const { toSet, toDelete } = metafieldWrites(P1, built)
    expect(toSet.map((m) => m.key)).toEqual([METAFIELD_KEYS.tierDiscount, METAFIELD_KEYS.tierSiblingVariants])
    expect(toSet[1]).toEqual({
      ownerId: P1, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.tierSiblingVariants,
      type: 'list.variant_reference', value: JSON.stringify([V20, V21]),
    })
    expect(toDelete).toEqual([{ ownerId: P1, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.tierSiblingProducts }])
  })

  it('a product with no siblings sets only the discount and deletes both lists', () => {
    const discount: Discount = { ...mix, members: [{ productId: P1 }] }
    const { toSet, toDelete } = metafieldWrites(P1, buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT))
    expect(toSet.map((m) => m.key)).toEqual([METAFIELD_KEYS.tierDiscount])
    expect(toDelete.map((m) => m.key)).toEqual([SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY])
  })
})

interface ShopifyAnswers {
  /** IDs that no longer exist in the store: `nodes(ids:)` answers null for them. */
  missingIds?: string[]
  setErrors?: { field: string[]; message: string }[]
  deleteErrors?: { field: string[]; message: string }[]
}

function mockShopify({ missingIds = [], setErrors = [], deleteErrors = [] }: ShopifyAnswers = {}) {
  return vi.spyOn(shopifyClient, 'shopifyQuery').mockImplementation((async (query: string, variables?: { ids?: string[] }) => {
    if (query.includes('nodes(ids')) return { nodes: (variables?.ids ?? []).map((id) => (missingIds.includes(id) ? null : { id })) }
    return { metafieldsSet: { userErrors: setErrors }, metafieldsDelete: { userErrors: deleteErrors } }
  }) as never)
}

const callsOf = (spy: ReturnType<typeof mockShopify>, mutation: string) => spy.mock.calls.filter((c) => (c[0] as string).includes(mutation))

describe('findExistingIds', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('returns only the IDs that still exist (a deleted product or variant comes back as null)', async () => {
    mockShopify({ missingIds: [P2] })
    expect([...(await findExistingIds([P1, P2, V20]))].sort()).toEqual([P1, V20].sort())
  })

  it('looks the IDs up in batches of 250 and makes no call for an empty list', async () => {
    const spy = mockShopify()
    const ids = Array.from({ length: 300 }, (_, i) => `gid://shopify/Product/${i}`)
    expect((await findExistingIds(ids)).size).toBe(300)
    expect(spy.mock.calls.map((c) => (c[1] as { ids: string[] }).ids.length)).toEqual([250, 50])

    spy.mockClear()
    expect((await findExistingIds([])).size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('syncDiscountMetafields', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('writes IDs and reference lists per unique product without looking up product details', async () => {
    const memberInfo = vi.spyOn(products, 'getMemberInfo')
    const querySpy = mockShopify()

    await syncDiscountMetafields(mix)

    expect(memberInfo).not.toHaveBeenCalled()
    // two products, each: one set call and one delete call (one empty list each)
    expect(callsOf(querySpy, 'metafieldsSet')).toHaveLength(2)
    expect(callsOf(querySpy, 'metafieldsDelete')).toHaveLength(2)

    const setFor = (ownerId: string) =>
      callsOf(querySpy, 'metafieldsSet').find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === ownerId)!
    const metafields = (call: ReturnType<typeof setFor>) => (call[1] as { metafields: { key: string; type: string; value: string }[] }).metafields

    const p1 = metafields(setFor(P1))
    expect(JSON.parse(p1[0].value).siblings).toEqual([{ productId: P2, variantId: V20 }, { productId: P2, variantId: V21 }])
    expect(p1[1]).toMatchObject({ key: SIBLING_VARIANTS_KEY, type: 'list.variant_reference', value: JSON.stringify([V20, V21]) })

    const p2 = metafields(setFor(P2))
    expect(JSON.parse(p2[0].value).ownVariantIds).toEqual([V20, V21])
    expect(p2[1]).toMatchObject({ key: SIBLING_PRODUCTS_KEY, type: 'list.product_reference', value: JSON.stringify([P1]) })
  })

  it('never writes a reference to a deleted product, so one deleted member cannot block the whole save, and still keeps it counted in siblings', async () => {
    const gone = 'gid://shopify/Product/99'
    const discount: Discount = { ...mix, members: [{ productId: P1 }, { productId: P3 }, { productId: gone }] }
    const querySpy = mockShopify({ missingIds: [gone] })

    await syncDiscountMetafields(discount)

    const setP1 = callsOf(querySpy, 'metafieldsSet').find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === P1)!
    const written = (setP1[1] as { metafields: { key: string; value: string }[] }).metafields
    expect(JSON.parse(written[0].value).siblings).toEqual([{ productId: P3 }, { productId: gone }])
    expect(written[1]).toMatchObject({ key: SIBLING_PRODUCTS_KEY, value: JSON.stringify([P3]) })
    for (const call of callsOf(querySpy, 'metafieldsSet')) {
      const lists = (call[1] as { metafields: { key: string; value: string }[] }).metafields.filter((m) => m.key !== METAFIELD_KEYS.tierDiscount)
      expect(lists.some((m) => m.value.includes(gone))).toBe(false)
    }
  })

  it('looks every referenced product and variant up once, before writing anything', async () => {
    const querySpy = mockShopify()
    await syncDiscountMetafields(mix)
    const first = querySpy.mock.calls[0]
    expect(first[0]).toContain('nodes(ids')
    expect((first[1] as { ids: string[] }).ids.sort()).toEqual([P1, V20, V21].sort())
    expect(querySpy.mock.calls.filter((c) => (c[0] as string).includes('nodes(ids'))).toHaveLength(1)
  })

  it('sets before it deletes, so a failed delete never leaves a product without fresh data', async () => {
    const querySpy = mockShopify()
    await syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })
    const writes = querySpy.mock.calls.map((c) => c[0] as string).filter((q) => !q.includes('nodes(ids'))
    expect(writes.map((q) => (q.includes('metafieldsSet') ? 'set' : 'delete'))).toEqual(['set', 'delete'])
  })

  it('throws when metafieldsSet reports userErrors', async () => {
    mockShopify({ setErrors: [{ field: ['value'], message: 'Invalid JSON' }] })
    await expect(syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })).rejects.toThrow('Invalid JSON')
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    mockShopify({ deleteErrors: [{ field: ['metafields'], message: 'Cannot delete' }] })
    await expect(syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })).rejects.toThrow('Cannot delete')
  })
})

describe('clearDiscountMetafields', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('deletes the discount and both sibling lists, one call per unique product', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })

    await clearDiscountMetafields([{ productId: P1 }, { productId: P2 }, { productId: P2 }])

    expect(querySpy).toHaveBeenCalledTimes(2)
    const keys = (querySpy.mock.calls[0][1] as { metafields: { key: string }[] }).metafields.map((m) => m.key)
    expect(keys).toEqual([METAFIELD_KEYS.tierDiscount, METAFIELD_KEYS.tierSiblingProducts, METAFIELD_KEYS.tierSiblingVariants])
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Not found' }] },
    })
    await expect(clearDiscountMetafields([{ productId: P1 }])).rejects.toThrow('Not found')
  })
})
