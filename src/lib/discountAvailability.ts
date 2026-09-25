import { getConfig, isProductAvailable, type Config } from '@/lib/config'
import { getTimeDiscountsConfig, isTimeDiscountMemberAvailable, type TimeDiscountsConfig } from '@/timeDiscounts/config'

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
/**
 * Fetches both configs once, for callers that need to check availability
 * across a batch of candidates. Keeping the fetch itself here (rather than
 * in each caller) is what makes this file actually the ONLY one importing
 * from both `@/lib/config` and `@/timeDiscounts/config` — see the module
 * doc above.
 */
export async function fetchAvailabilityConfigs(): Promise<{ productConfig: Config; timeConfig: TimeDiscountsConfig }> {
  const [productConfig, timeConfig] = await Promise.all([getConfig(), getTimeDiscountsConfig()])
  return { productConfig, timeConfig }
}

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
