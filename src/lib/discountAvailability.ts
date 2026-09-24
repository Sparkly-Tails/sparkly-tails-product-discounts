import { isProductAvailable, type Config } from '@/lib/config'
import { isTimeDiscountMemberAvailable, type TimeDiscountsConfig } from '@/timeDiscounts/config'

/**
 * True when (productId, variantId) is free to be claimed by a NEW discount
 * of either kind, given both configs already fetched. The one deliberate
 * seam between the two otherwise fully isolated discount modules (see
 * spec §3) — this file is the only place either module's config type is
 * imported alongside the other's. Callers fetch both configs once per
 * operation (not once per candidate) and pass them in, matching each
 * module's own established "fetch config once, check many candidates"
 * pattern.
 */
export function isAvailableEverywhere(
  productConfig: Config,
  timeConfig: TimeDiscountsConfig,
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): boolean {
  return (
    isProductAvailable(productConfig, productId, variantId, excludeDiscountId) &&
    isTimeDiscountMemberAvailable(timeConfig, productId, variantId, excludeDiscountId)
  )
}
