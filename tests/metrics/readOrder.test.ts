import { describe, it, expect } from 'vitest'
import { readWebhookOrder, readGraphqlOrder, isAppDiscount, READ_ORDER_TOOLS } from '@/metrics/readOrder'
import sample from '../fixtures/metrics/order-webhook-sample.json'

const fromWebhook = (body: string) => readWebhookOrder({ body, tools: READ_ORDER_TOOLS })
const fromGraphql = (node: unknown) => readGraphqlOrder({ node, tools: READ_ORDER_TOOLS })

describe('isAppDiscount', () => {
  it.each([['a percent tier', '15% off'], ['a percent with decimals', '12.5% off'], ['a fixed or anchor price tier', 'Offer price'], ['a fixed price tier of an order placed before the message changed', '£12.00 each']])('is an automatic discount with the message the discount Function gives: %s', (_name, title) => {
    expect(isAppDiscount({ type: 'automatic', title })).toBe(true)
  })

  it.each([
    ['another title', 'automatic', 'Spring offer'],
    ['the title of the discount record, which never reaches an order', 'automatic', 'Product tier discounts'],
    ['a discount code with the message of a tier', 'discount_code', '15% off'],
    ['no title', 'automatic', ''],
    ['a longer sentence that starts like a tier message', 'automatic', '15% off sale'],
    ['a percent sign alone', 'automatic', '% off'],
  ])('is not %s', (_name, type, title) => {
    expect(isAppDiscount({ type, title })).toBe(false)
  })
})

describe('readWebhookOrder', () => {
  it('reads the order, its subtotal and each line, and marks the lines that got this app\'s discount', () => {
    expect(fromWebhook(JSON.stringify(sample))).toEqual({
      orderId: 'gid://shopify/Order/5100200300400',
      orderedAt: '2026-11-02T10:15:00+00:00',
      currency: 'GBP',
      subtotal: 17.25,
      lines: [
        { productId: 'gid://shopify/Product/9001', quantity: 10, unitPrice: 1.69, discountAmount: 1.65, appDiscounted: true },
        { productId: 'gid://shopify/Product/9002', quantity: 1, unitPrice: 2, discountAmount: 0, appDiscounted: false },
        { productId: '', quantity: 1, unitPrice: 1, discountAmount: 0, appDiscounted: false },
      ],
    })
  })

  it('builds the order id from the numeric id when the payload has no graphql id', () => {
    const { admin_graphql_api_id: _removed, ...rest } = sample
    expect(fromWebhook(JSON.stringify(rest))?.orderId).toBe('gid://shopify/Order/5100200300400')
  })

  it.each([
    ['text that is not JSON', '{oops'],
    ['a list', '[]'],
    ['an order without an id', JSON.stringify({ ...sample, id: undefined, admin_graphql_api_id: undefined })],
    ['line items that are not a list', JSON.stringify({ ...sample, line_items: 'x' })],
    ['a line without a quantity', JSON.stringify({ ...sample, line_items: [{ product_id: 1, price_set: sample.line_items[0].price_set }] })],
    ['an order without a subtotal', JSON.stringify({ ...sample, current_subtotal_price_set: undefined })],
  ])('gives null for %s, and never throws', (_name, body) => {
    expect(fromWebhook(body)).toBeNull()
  })

  it('ignores an allocation that points at a discount application which is not there', () => {
    const broken = { ...sample, discount_applications: [] }
    expect(fromWebhook(JSON.stringify(broken))?.lines[0].appDiscounted).toBe(false)
  })
})

/** The shape of an order read with the Admin API; the real order is in tests/metrics/realOrder.test.ts. */
const graphqlNode = {
  id: 'gid://shopify/Order/5100200300400',
  createdAt: '2026-11-02T10:15:00Z',
  currentSubtotalPriceSet: { shopMoney: { amount: '17.25', currencyCode: 'GBP' } },
  lineItems: {
    nodes: [
      {
        product: { id: 'gid://shopify/Product/9001' },
        quantity: 10,
        originalUnitPriceSet: { shopMoney: { amount: '1.69' } },
        discountAllocations: [{ allocatedAmountSet: { shopMoney: { amount: '1.65' } }, discountApplication: { __typename: 'AutomaticDiscountApplication', title: '15% off' } }],
      },
      { product: null, quantity: 1, originalUnitPriceSet: { shopMoney: { amount: '1.00' } }, discountAllocations: [] },
    ],
  },
}

describe('readGraphqlOrder', () => {
  it('reads the same facts from an order read with the Admin API', () => {
    expect(fromGraphql(graphqlNode)).toEqual({
      orderId: 'gid://shopify/Order/5100200300400',
      orderedAt: '2026-11-02T10:15:00Z',
      currency: 'GBP',
      subtotal: 17.25,
      lines: [
        { productId: 'gid://shopify/Product/9001', quantity: 10, unitPrice: 1.69, discountAmount: 1.65, appDiscounted: true },
        { productId: '', quantity: 1, unitPrice: 1, discountAmount: 0, appDiscounted: false },
      ],
    })
  })

  it.each([['null', null], ['a text', 'x'], ['an order without lines', { ...graphqlNode, lineItems: undefined }], ['an order without an id', { ...graphqlNode, id: undefined }]])('gives null for %s', (_name, node) => {
    expect(fromGraphql(node)).toBeNull()
  })
})
