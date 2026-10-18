/**
 * Where this app stores its data in Shopify. The namespace is app-owned (`$app:`), so each
 * store keeps its own copy and Shopify removes it when the app is uninstalled. Liquid reads it
 * as `product.metafields['$app:smooth_discount'].<key>.value`.
 */
export const METAFIELD_NAMESPACE = '$app:smooth_discount' as const

/** Each key notes the resource that owns it. The old names are in the spec (section 5.4). */
export const METAFIELD_KEYS = {
  /** Shop. */
  tierConfig: 'tier_config',
  /** Product. */
  tierDiscount: 'tier_discount',
  /** Product. */
  tierSiblingProducts: 'tier_sibling_products',
  /** Product. */
  tierSiblingVariants: 'tier_sibling_variants',
  /** Product. */
  timeDiscount: 'time_discount',
  /** Shop. */
  timeConfig: 'time_config',
  /** Discount. */
  timeFunctionConfig: 'time_function_config',
} as const
