// The real steps of asking the active discounts about a product: what the shop holds, and the pure steps.
import { assertFreeOfClaims, checkMemberFree } from '@/form/claimChecks'
import { assertFreeOfLiveDiscounts, loadLiveTierClaims, readMemberTitle } from '@/form/claimSteps'
import { buildClaims, describePickRefusal, describeSaveRefusal, findClaim, isClaimOn, isVariantMatch, listLiveTierClaims } from '@/form/claims'
import { getConfig } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'

export const SHOP_CLAIM_TOOLS = {
  loadConfig: getConfig,
  readMemberInfo: getMemberInfo,
  buildClaims,
  findClaim,
  isClaimOn,
  isVariantMatch,
  listLiveTierClaims,
  describePickRefusal,
  describeSaveRefusal,
  loadLiveTierClaims,
  readMemberTitle,
  checkMemberFree,
  assertFreeOfClaims,
  assertFreeOfLiveDiscounts,
}

export type ShopClaimTools = typeof SHOP_CLAIM_TOOLS
