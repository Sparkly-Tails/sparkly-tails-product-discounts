// Working out the claims from what the shop holds, and the checks that need them. What is read from the shop
// comes in through `tools`.
import type { Config } from '@/lib/config'
import type { MemberInfo } from '@/lib/products'
import type { buildClaims, Claim, listLiveTierClaims } from '@/form/claims'

/** The claims of every live tier discount. */
export async function loadLiveTierClaims({ tools }: {
  tools: { loadConfig: () => Promise<Config>; listLiveTierClaims: typeof listLiveTierClaims; buildClaims: typeof buildClaims }
}): Promise<Claim[]> {
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
