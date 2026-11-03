import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readGraphqlOrder, isAppDiscount, READ_ORDER_TOOLS } from '@/metrics/readOrder'
import { listBundleRows, LIST_ROWS_TOOLS } from '@/metrics/listBundleRows'
import realOrder from '../fixtures/metrics/order-graphql-bundle.json'

/**
 * A real order from the demo shop (#1001, read with the Admin API): 3 units of a product got the tier discount
 * ("15% off", 353.67 off), 4 and 6 units of two other products got none.
 */
const BUNDLE_PRODUCT = 'gid://shopify/Product/15411507167486'

describe('the real demo-shop order', () => {
  it('is read with the bundle line marked as this app\'s and the others not', () => {
    const order = readGraphqlOrder({ node: realOrder, tools: READ_ORDER_TOOLS })

    expect(order).toMatchObject({ orderId: 'gid://shopify/Order/18975080907006', currency: 'USD', subtotal: 8903.88 })
    expect(order?.lines.map((line) => [line.productId, line.quantity, line.appDiscounted])).toEqual([
      [BUNDLE_PRODUCT, 3, true],
      ['gid://shopify/Product/15411507331326', 4, false],
      ['gid://shopify/Product/15411507659006', 6, false],
    ])
    expect(order?.lines[0].discountAmount).toBe(353.67)
  })

  it('gives one row for the live discount of the bundle product, with the units, the discount and the added revenue of that line only', () => {
    const order = readGraphqlOrder({ node: realOrder, tools: READ_ORDER_TOOLS })

    const rows = listBundleRows({ order: order!, productDiscounts: { [BUNDLE_PRODUCT]: 'discount-1' }, tools: LIST_ROWS_TOOLS })

    expect(rows).toEqual([
      { discountId: 'discount-1', orderId: 'gid://shopify/Order/18975080907006', orderedAt: '2026-11-03T11:12:56Z', currency: 'USD', units: 3, orderSubtotal: 8903.88, discountAmount: 353.67, addedRevenue: 1218.23 },
    ])
  })

  it('is not a bundle order when its product is in no live discount', () => {
    const order = readGraphqlOrder({ node: realOrder, tools: READ_ORDER_TOOLS })

    expect(listBundleRows({ order: order!, productDiscounts: {}, tools: LIST_ROWS_TOOLS })).toEqual([])
  })
})

describe('the messages of the discount Function', () => {
  const source = readFileSync(path.resolve(__dirname, '../../extensions/product-discount/src/cart_lines_discounts_generate_run.rs'), 'utf8')

  it('are still the ones isAppDiscount recognises: if this fails, the Function changed its messages and the orders would stop counting', () => {
    expect(source).toContain('format!("{}% off", percent_off)')
    expect(source).toContain('format!("£{:.2} each", fixed_price)')
    expect(isAppDiscount({ type: 'automatic', title: `${15}% off` })).toBe(true)
    expect(isAppDiscount({ type: 'automatic', title: `£${(12).toFixed(2)} each` })).toBe(true)
  })
})
