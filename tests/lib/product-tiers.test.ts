import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildProductMetafields,
  metafieldWrites,
  syncDiscountMetafields,
  clearDiscountMetafields,
  SIBLING_REFERENCE_LIMIT,
  SIBLING_PRODUCTS_KEY,
  SIBLING_VARIANTS_KEY,
} from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'
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
    expect(toSet.map((m) => m.key)).toEqual(['discount', SIBLING_VARIANTS_KEY])
    expect(toSet[1]).toEqual({
      ownerId: P1, namespace: 'sparkly_product_discounts', key: SIBLING_VARIANTS_KEY,
      type: 'list.variant_reference', value: JSON.stringify([V20, V21]),
    })
    expect(toDelete).toEqual([{ ownerId: P1, namespace: 'sparkly_product_discounts', key: SIBLING_PRODUCTS_KEY }])
  })

  it('a product with no siblings sets only the discount and deletes both lists', () => {
    const discount: Discount = { ...mix, members: [{ productId: P1 }] }
    const { toSet, toDelete } = metafieldWrites(P1, buildProductMetafields(discount, P1, SIBLING_REFERENCE_LIMIT))
    expect(toSet.map((m) => m.key)).toEqual(['discount'])
    expect(toDelete.map((m) => m.key)).toEqual([SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY])
  })
})

describe('syncDiscountMetafields', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('writes IDs and reference lists per unique product without looking up product details', async () => {
    const memberInfo = vi.spyOn(products, 'getMemberInfo')
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
      metafieldsDelete: { userErrors: [] },
    })

    await syncDiscountMetafields(mix)

    expect(memberInfo).not.toHaveBeenCalled()
    // two products, each: one set call and one delete call (one empty list each)
    expect(querySpy).toHaveBeenCalledTimes(4)

    const setFor = (ownerId: string) =>
      querySpy.mock.calls.find((c) => (c[0] as string).includes('metafieldsSet') && (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === ownerId)!
    const metafields = (call: ReturnType<typeof setFor>) => (call[1] as { metafields: { key: string; type: string; value: string }[] }).metafields

    const p1 = metafields(setFor(P1))
    expect(JSON.parse(p1[0].value).siblings).toEqual([{ productId: P2, variantId: V20 }, { productId: P2, variantId: V21 }])
    expect(p1[1]).toMatchObject({ key: SIBLING_VARIANTS_KEY, type: 'list.variant_reference', value: JSON.stringify([V20, V21]) })

    const p2 = metafields(setFor(P2))
    expect(JSON.parse(p2[0].value).ownVariantIds).toEqual([V20, V21])
    expect(p2[1]).toMatchObject({ key: SIBLING_PRODUCTS_KEY, type: 'list.product_reference', value: JSON.stringify([P1]) })
  })

  it('sets before it deletes, so a failed delete never leaves a product without fresh data', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
      metafieldsDelete: { userErrors: [] },
    })
    await syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })
    expect(querySpy.mock.calls.map((c) => ((c[0] as string).includes('metafieldsSet') ? 'set' : 'delete'))).toEqual(['set', 'delete'])
  })

  it('throws when metafieldsSet reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] },
      metafieldsDelete: { userErrors: [] },
    })
    await expect(syncDiscountMetafields({ ...mix, members: [{ productId: P1 }] })).rejects.toThrow('Invalid JSON')
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Cannot delete' }] },
    })
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
    expect(keys).toEqual(['discount', SIBLING_PRODUCTS_KEY, SIBLING_VARIANTS_KEY])
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Not found' }] },
    })
    await expect(clearDiscountMetafields([{ productId: P1 }])).rejects.toThrow('Not found')
  })
})
