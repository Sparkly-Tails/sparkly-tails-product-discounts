'use server'

import { getProductInfo } from '@/lib/products'
import { getConfig, isProductAvailable } from '@/lib/config'

export interface GroupProductCandidate {
  id: string
  title: string
  price: number
}

export type AddGroupProductResult =
  | { ok: true; product: GroupProductCandidate }
  | { ok: false; error: string }

/**
 * Validates a candidate product before it's added to a group in the UI:
 * must exist, must match the group's current shared price (if any products
 * are already selected), and must not already belong to a standalone
 * discount or a different group. excludeGroupId lets an in-progress edit of
 * an existing group re-validate without flagging its own current members.
 */
export async function addGroupProductAction(
  candidateId: string,
  currentPrice: number | null,
  excludeGroupId?: string,
): Promise<AddGroupProductResult> {
  const info = await getProductInfo(candidateId)
  if (!info) return { ok: false, error: 'Product not found' }

  if (currentPrice != null && Math.abs(info.basePrice - currentPrice) > 0.001) {
    return {
      ok: false,
      error: `Price mismatch: this product is £${info.basePrice.toFixed(2)}, the group is £${currentPrice.toFixed(2)}`,
    }
  }

  const config = await getConfig()
  if (!isProductAvailable(config, candidateId, excludeGroupId)) {
    return { ok: false, error: 'This product already has a discount or belongs to another group' }
  }

  return { ok: true, product: { id: candidateId, title: info.title, price: info.basePrice } }
}
