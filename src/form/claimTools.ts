// The real steps of asking the active discounts about a product: what the shop holds, and the pure steps.
import { assertFreeOfClaims, checkMemberFree } from '@/form/claimChecks'
import { assertFreeOfLiveDiscounts, assertFreeOfOpenTimeDiscounts, loadLiveTierClaims, loadOpenTimeClaims, readMemberTitle } from '@/form/claimSteps'
import { buildClaims, describePickRefusal, describeSaveRefusal, findClaim, isClaimOn, isVariantMatch, listLiveTierClaims, listOpenTimeClaims } from '@/form/claims'
import { getConfig } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import { getShopTimezone } from '@/lib/shop'
import { computeTimeDiscountStatusLabel, getTimeDiscountsConfig } from '@/timeDiscounts/config'

export const SHOP_CLAIM_TOOLS = {
  loadConfig: getConfig,
  loadTimeConfig: getTimeDiscountsConfig,
  readTimeZone: getShopTimezone,
  readStatus: computeTimeDiscountStatusLabel,
  readMemberInfo: getMemberInfo,
  buildClaims,
  findClaim,
  isClaimOn,
  isVariantMatch,
  listLiveTierClaims,
  listOpenTimeClaims,
  describePickRefusal,
  describeSaveRefusal,
  loadLiveTierClaims,
  loadOpenTimeClaims,
  readMemberTitle,
  checkMemberFree,
  assertFreeOfClaims,
  assertFreeOfLiveDiscounts,
  assertFreeOfOpenTimeDiscounts,
}

export type ShopClaimTools = typeof SHOP_CLAIM_TOOLS
