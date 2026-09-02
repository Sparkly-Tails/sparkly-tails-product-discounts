'use server'

import { searchProducts, getProductVariantOptions, type ProductSearchResult, type ProductVariantOption } from '@/lib/products'
import { getConfig, isProductAvailable } from '@/lib/config'

/** Backs the picker's search box. Swallows errors — fires on every debounced keystroke. */
export async function searchProductsAction(query: string): Promise<ProductSearchResult[]> {
  try {
    return await searchProducts(query)
  } catch (err) {
    console.error('[searchProductsAction] search failed:', err)
    return []
  }
}

/** Backs the picker's "select specific variants" expansion for a multi-variant product. */
export async function getProductVariantsAction(productId: string): Promise<ProductVariantOption[]> {
  try {
    return await getProductVariantOptions(productId)
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
