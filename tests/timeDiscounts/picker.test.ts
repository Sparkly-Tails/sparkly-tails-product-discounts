import { describe, it, expect } from 'vitest'
import { alreadyAdded, rowsForProduct, visibleResults, availableVariants, pickedProduct, pickedVariant } from '@/timeDiscounts/picker'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

const product = (id: string, variantCount: number): ProductSearchResult => ({ id, title: `Title ${id.split('/').pop()}`, variantCount } as ProductSearchResult)
const option = (variantId: string, title: string, price: number): ProductVariantOption => ({ variantId, title, price } as ProductVariantOption)

describe('alreadyAdded', () => {
  it('finds a whole product and a variant by their row keys', () => {
    expect(alreadyAdded([`${P1}|`], P1)).toBe(true)
    expect(alreadyAdded([`${P1}|${V10}`], P1, V10)).toBe(true)
    expect(alreadyAdded([`${P1}|${V10}`], P1, V11)).toBe(false)
    expect(alreadyAdded([`${P1}|`], P2)).toBe(false)
  })
})

describe('rowsForProduct', () => {
  it('counts the rows a product already has', () => {
    expect(rowsForProduct([`${P1}|${V10}`, `${P1}|${V11}`, `${P2}|`], P1)).toBe(2)
    expect(rowsForProduct([], P1)).toBe(0)
  })
})

describe('visibleResults', () => {
  it('hides a single-variant product that is already added', () => {
    expect(visibleResults([product(P1, 1), product(P2, 1)], [`${P1}|`]).map((p) => p.id)).toEqual([P2])
  })

  it('shows a multi-variant product until every one of its variants is added', () => {
    const matches = [product(P1, 2)]
    expect(visibleResults(matches, [`${P1}|${V10}`])).toHaveLength(1)
    expect(visibleResults(matches, [`${P1}|${V10}`, `${P1}|${V11}`])).toHaveLength(0)
  })
})

describe('availableVariants', () => {
  it('leaves out variants already added', () => {
    expect(availableVariants([option(V10, 'Large', 5), option(V11, 'Small', 4)], [`${P1}|${V10}`], P1).map((o) => o.variantId)).toEqual([V11])
  })
})

describe('pickedProduct and pickedVariant', () => {
  it('describes a whole-product pick', () => {
    expect(pickedProduct(product(P1, 1), 12.5)).toEqual({ productId: P1, title: 'Title 1', price: 12.5 })
  })

  it('describes a variant pick, naming product and variant', () => {
    expect(pickedVariant(product(P1, 2), option(V10, 'Large', 5))).toEqual({ productId: P1, variantId: V10, title: 'Title 1 – Large', price: 5 })
  })
})
