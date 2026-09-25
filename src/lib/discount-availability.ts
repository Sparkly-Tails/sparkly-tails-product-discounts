import { getConfig, isProductAvailable, type Config } from '@/lib/config'
import { getTimeDiscountsConfig, isTimeDiscountMemberAvailable, type TimeDiscountsConfig } from '@/timeDiscounts/config'

/**
 * Fetches both configs once, for callers that need to check availability
 * across a batch of candidates — the one deliberate seam between the two
 * otherwise fully isolated discount modules (see spec §3). Keeping the
 * fetch itself here (rather than in each caller) is what makes this file
 * the only place importing both `@/lib/config` and `@/timeDiscounts/config`
 * for CROSS-KIND AVAILABILITY-CHECKING purposes specifically. `src/app/page.tsx`
 * also imports both, but only to list each kind's discounts side by side on
 * the home page — a separate, read-only display concern, not part of this
 * seam, and not a violation of it.
 */
export async function fetchAvailabilityConfigs(): Promise<{ productConfig: Config; timeConfig: TimeDiscountsConfig }> {
  const [productConfig, timeConfig] = await Promise.all([getConfig(), getTimeDiscountsConfig()])
  return { productConfig, timeConfig }
}

/**
 * True when (productId, variantId) is free to be claimed by a NEW discount
 * of either kind, given both configs already fetched via
 * `fetchAvailabilityConfigs`. Callers fetch both configs once per operation
 * (not once per candidate) and pass them in, matching each module's own
 * established "fetch config once, check many candidates" pattern.
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
