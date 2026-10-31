'use server'

import { searchProducts, listProducts, getProductVariantOptions, type ProductSearchResult, type ProductVariantOption } from '@/lib/products'
import { checkMemberFree } from '@/form/claimChecks'
import { loadLiveTierClaims } from '@/form/claimSteps'
import { SHOP_CLAIM_TOOLS } from '@/form/claimTools'

// How many products Browse lists.
const BROWSE_LIMIT = 8

/**
 * Backs the picker's search box. Swallows errors — fires on every debounced
 * keystroke. Every product is listed, whatever discount holds it: whether it
 * may be picked is answered when it is picked (see validateMemberAction).
 * Products already selected in the in-progress edit are filtered by the
 * picker component itself.
 */
export async function searchProductsAction(query: string): Promise<ProductSearchResult[]> {
  try {
    return await searchProducts(query)
  } catch (err) {
    console.error('[searchProductsAction] search failed:', err)
    return []
  }
}

/** Backs the picker's Browse button: the shop's first products. */
export async function listProductsAction(): Promise<ProductSearchResult[]> {
  try {
    return await listProducts({ limit: BROWSE_LIMIT })
  } catch (err) {
    console.error('[listProductsAction] lookup failed:', err)
    return []
  }
}

/** Backs the picker's "select specific variants" expansion for a multi-variant product: every variant is listed. */
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
 * Validates a candidate (product, variant) when it is picked: it must not be in
 * another LIVE tier discount. A draft or offline discount does not hold it.
 * excludeDiscountId lets an in-progress edit re-validate without flagging its own
 * current members. Price-uniformity is checked separately, after the full member
 * set is known — see updateAvailablePricingModesAction.
 */
export async function validateMemberAction(
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): Promise<AddMemberResult> {
  // A server action takes its arguments and nothing else, so it wires its steps here, and only here.
  // eslint-disable-next-line guidelines/no-outer-scope-calls -- see above
  const claims = await loadLiveTierClaims({ tools: SHOP_CLAIM_TOOLS })
  // eslint-disable-next-line guidelines/no-outer-scope-calls -- see above
  return checkMemberFree({ claims, productId, variantId, discountId: excludeDiscountId, tools: SHOP_CLAIM_TOOLS })
}
