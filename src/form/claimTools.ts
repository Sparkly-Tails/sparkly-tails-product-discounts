// The real steps of asking the active discounts about a product: what the shop holds, and the pure steps.
import { checkMemberFree } from '@/form/claimChecks'
import { loadLiveTierClaims } from '@/form/claimSteps'
import { buildClaims, describePickRefusal, findClaim, isClaimOn, isVariantMatch, listLiveTierClaims } from '@/form/claims'
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
  loadLiveTierClaims,
  checkMemberFree,
}
