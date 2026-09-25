'use server'

import { searchProducts, getProductVariantOptions, type ProductSearchResult, type ProductVariantOption } from '@/lib/products'
import { searchCollections, type CollectionSearchResult } from '@/lib/collections'
import { isAvailableEverywhere, fetchAvailabilityConfigs } from '@/lib/discount-availability'

/**
 * Backs the picker's search box. Fires on every debounced keystroke — both
 * configs are fetched once per call, not once per candidate, matching the
 * existing product-discount picker's efficiency. Drops anything already
 * claimed by ANY discount, of either kind.
 */
export async function searchTimeDiscountProductsAction(query: string, excludeDiscountId?: string): Promise<ProductSearchResult[]> {
  try {
    const results = await searchProducts(query)
    const { productConfig, timeConfig } = await fetchAvailabilityConfigs()

    const available = await Promise.all(
      results.map(async (product) => {
        if (product.variantCount <= 1) {
          return isAvailableEverywhere(productConfig, timeConfig, product.id, undefined, excludeDiscountId)
        }
        const variants = await getProductVariantOptions(product.id)
        return variants.some((v) => isAvailableEverywhere(productConfig, timeConfig, product.id, v.variantId, excludeDiscountId))
      }),
    )
    return results.filter((_, i) => available[i])
  } catch (err) {
    console.error('[searchTimeDiscountProductsAction] search failed:', err)
    return []
  }
}

/** Backs the picker's "select specific variants" expansion for a multi-variant product. */
export async function getTimeDiscountProductVariantsAction(productId: string, excludeDiscountId?: string): Promise<ProductVariantOption[]> {
  try {
    const variants = await getProductVariantOptions(productId)
    const { productConfig, timeConfig } = await fetchAvailabilityConfigs()
    return variants.filter((v) => isAvailableEverywhere(productConfig, timeConfig, productId, v.variantId, excludeDiscountId))
  } catch (err) {
    console.error('[getTimeDiscountProductVariantsAction] lookup failed:', err)
    return []
  }
}

export type ValidateMemberResult = { ok: true } | { ok: false; error: string }

/** Validates a candidate (product, variant) before it's added in the UI — must not already belong to a different discount, of either kind. */
export async function validateTimeDiscountMemberAction(
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): Promise<ValidateMemberResult> {
  const { productConfig, timeConfig } = await fetchAvailabilityConfigs()
  if (!isAvailableEverywhere(productConfig, timeConfig, productId, variantId, excludeDiscountId)) {
    return {
      ok: false,
      error: variantId ? 'This variant already belongs to another discount' : 'This product already belongs to another discount',
    }
  }
  return { ok: true }
}

/** Backs the Collections-mode picker's search box. */
export async function searchTimeDiscountCollectionsAction(query: string): Promise<CollectionSearchResult[]> {
  try {
    return await searchCollections(query)
  } catch (err) {
    console.error('[searchTimeDiscountCollectionsAction] search failed:', err)
    return []
  }
}
