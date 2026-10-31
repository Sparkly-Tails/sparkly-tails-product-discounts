// Working out the claims from what the shop holds, and the checks that need them. What is read from the shop
// comes in through `tools`.
import type { Config } from '@/lib/config'
import type { MemberInfo } from '@/lib/products'
import type { TimeDiscountsConfig, computeTimeDiscountStatusLabel } from '@/timeDiscounts/config'
import type { assertFreeOfClaims } from '@/form/claimChecks'
import type { buildClaims, Claim, listLiveTierClaims, listOpenTimeClaims } from '@/form/claims'

type MemberList = { productId: string; variantId?: string }[]
type LoadLiveTools = { loadConfig: () => Promise<Config>; listLiveTierClaims: typeof listLiveTierClaims; buildClaims: typeof buildClaims }
type LoadOpenTools = {
  loadTimeConfig: () => Promise<TimeDiscountsConfig>
  readTimeZone: () => Promise<string>
  readStatus: typeof computeTimeDiscountStatusLabel
  listOpenTimeClaims: typeof listOpenTimeClaims
  buildClaims: typeof buildClaims
}

/** The claims of every live tier discount. */
export async function loadLiveTierClaims({ tools }: { tools: LoadLiveTools }): Promise<Claim[]> {
  const config = await tools.loadConfig()
  return tools.listLiveTierClaims({ discounts: config.discounts, tools })
}

/** What a refusal calls a member: the product, with the variant in brackets when it is one variant. */
export async function readMemberTitle({ member, tools }: {
  member: { productId: string; variantId?: string }
  tools: { readMemberInfo: (members: { productId: string; variantId?: string }[]) => Promise<MemberInfo[]> }
}): Promise<string> {
  const [info] = await tools.readMemberInfo([member])
  if (!info) return member.productId
  return info.variantTitle ? `${info.productTitle} (${info.variantTitle})` : info.productTitle
}

/** The claims of every time-based discount that is upcoming or running in the shop's time zone. */
export async function loadOpenTimeClaims({ tools }: { tools: LoadOpenTools }): Promise<Claim[]> {
  const [config, timeZone] = await Promise.all([tools.loadTimeConfig(), tools.readTimeZone()])
  return tools.listOpenTimeClaims({ discounts: config.discounts, timeZone, tools })
}

type AssertTools = Parameters<typeof assertFreeOfClaims>[0]['tools'] & { assertFreeOfClaims: typeof assertFreeOfClaims }

/** Throws when a member is in another live tier discount (the discount being saved does not count). */
export async function assertFreeOfLiveDiscounts({ members, discountId, tools }: {
  members: MemberList
  discountId: string
  tools: AssertTools & LoadLiveTools & { loadLiveTierClaims: typeof loadLiveTierClaims }
}): Promise<void> {
  const claims = await tools.loadLiveTierClaims({ tools })
  await tools.assertFreeOfClaims({ claims, members, discountId, tools })
}

/** Throws when a member is in a time-based discount that is upcoming or running. */
export async function assertFreeOfOpenTimeDiscounts({ members, discountId, tools }: {
  members: MemberList
  discountId: string
  tools: AssertTools & LoadOpenTools & { loadOpenTimeClaims: typeof loadOpenTimeClaims }
}): Promise<void> {
  const claims = await tools.loadOpenTimeClaims({ tools })
  await tools.assertFreeOfClaims({ claims, members, discountId, tools })
}
