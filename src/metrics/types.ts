// The plain facts of an order that the metrics need, whichever way the order reached the app (webhook or Admin API).
// Product ids are `gid://shopify/Product/<n>`, or an empty text for a line with no product; money is a number rounded to cents.

export interface OrderLineFacts {
  productId: string
  quantity: number
  /** The price of one unit before any discount. */
  unitPrice: number
  /** The part of the line's discount that came from this app's discount. */
  discountAmount: number
  /** True when the line got a discount from this app's discount. */
  appDiscounted: boolean
}

export interface OrderFacts {
  orderId: string
  orderedAt: string
  currency: string
  /** The whole order after discounts, before tax and shipping. */
  subtotal: number
  lines: OrderLineFacts[]
}

/** One order's share of one discount: what is stored per order and discount. */
export interface BundleOrderRow {
  discountId: string
  orderId: string
  orderedAt: string
  currency: string
  units: number
  orderSubtotal: number
  discountAmount: number
  addedRevenue: number
}
