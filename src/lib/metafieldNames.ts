/**
 * Where this app stores its data in Shopify. The namespace is app-owned (`$app:`), so each
 * store keeps its own copy and Shopify removes it when the app is uninstalled. Liquid reads it
 * as `product.metafields['$app:smooth_discount'].<key>.value`.
 */
export const METAFIELD_NAMESPACE = '$app:smooth_discount' as const

/** Each key notes its owner and the `namespace.key` it replaces. */
export const METAFIELD_KEYS = {
  /** Shop; was `sparkly_product_discounts.config`. */
  tierConfig: 'tier_config',
  /** Product; was `sparkly_product_discounts.discount`. */
  tierDiscount: 'tier_discount',
  /** Product; was `sparkly_product_discounts.sibling_products`. */
  tierSiblingProducts: 'tier_sibling_products',
  /** Product; was `sparkly_product_discounts.sibling_variants`. */
  tierSiblingVariants: 'tier_sibling_variants',
  /** Product; was `sparkly_product_discounts.time_based_discount`. */
  timeDiscount: 'time_discount',
  /** Shop; was `sparkly_time_discounts.config`. */
  timeConfig: 'time_config',
  /** Discount; was `sparkly_time_discounts.function_config`. */
  timeFunctionConfig: 'time_function_config',
} as const
