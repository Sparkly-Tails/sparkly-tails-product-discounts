'use server'

import { searchProducts, getProductVariantOptions, type ProductSearchResult, type ProductVariantOption } from '@/lib/products'
import { getConfig, isProductAvailable } from '@/lib/config'

/**
 * Backs the picker's search box. Swallows errors — fires on every debounced
 * keystroke. Drops any product already fully claimed by another discount
 * (excludeDiscountId lets an in-progress edit not flag its own members) —
 * a single-variant product is dropped outright, a multi-variant product
 * only if every one of its variants is already claimed somewhere.
 * Membership already selected in the CURRENT in-progress edit (not yet
 * saved) isn't known here — the picker component filters that itself.
 */
export async function searchProductsAction(query: string, excludeDiscountId?: string): Promise<ProductSearchResult[]> {
  try {
    const results = await searchProducts(query)
    const config = await getConfig()

    const available = await Promise.all(
      results.map(async (product) => {
        if (product.variantCount <= 1) {
          return isProductAvailable(config, product.id, undefined, excludeDiscountId)
        }
        const variants = await getProductVariantOptions(product.id)
        return variants.some((v) => isProductAvailable(config, product.id, v.variantId, excludeDiscountId))
      }),
    )
    return results.filter((_, i) => available[i])
  } catch (err) {
    console.error('[searchProductsAction] search failed:', err)
    return []
  }
}

/**
 * Backs the picker's "select specific variants" expansion for a
 * multi-variant product. Drops any variant already claimed by another
 * discount, same exclusion rule as searchProductsAction.
 */
export async function getProductVariantsAction(productId: string, excludeDiscountId?: string): Promise<ProductVariantOption[]> {
  try {
    const variants = await getProductVariantOptions(productId)
    const config = await getConfig()
    return variants.filter((v) => isProductAvailable(config, productId, v.variantId, excludeDiscountId))
  } catch (err) {
    console.error('[getProductVariantsAction] lookup failed:', err)
    return []
  }
}

export type AddMemberResult = { ok: true } | { ok: false; error: string }

/**
 * Validates a candidate (product, variant) before it's added in the UI:
 * must not already belong to a different discount. excludeDiscountId lets
 * an in-progress edit re-validate without flagging its own current
 * members. Price-uniformity is checked separately, after the full member
 * set is known — see updateAvailablePricingModesAction.
 */
export async function validateMemberAction(
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): Promise<AddMemberResult> {
  const config = await getConfig()
  if (!isProductAvailable(config, productId, variantId, excludeDiscountId)) {
    return {
      ok: false,
      error: variantId
        ? 'This variant already belongs to another discount'
        : 'This product already belongs to another discount',
    }
  }
  return { ok: true }
}
