// The two questions the form asks of the active discounts: may this product be picked, and may this discount be
// saved as it is. The claims are worked out first (see claimSteps.ts); how a refusal reads comes in through `tools`.
import type { Claim, describePickRefusal, describeSaveRefusal, findClaim, isClaimOn, isVariantMatch } from '@/form/claims'
import type { readMemberTitle } from '@/form/claimSteps'

type ClaimedProduct = { productId: string; variantId?: string }
type FindTools = { findClaim: typeof findClaim; isClaimOn: typeof isClaimOn; isVariantMatch: typeof isVariantMatch }
type TitleTools = Parameters<typeof readMemberTitle>[0]['tools']

/** Answers the picker: ok, or the reason the product (or variant) is held by another active discount. */
export function checkMemberFree({ claims, productId, variantId, discountId, tools }: {
  claims: Claim[]
  productId: string
  variantId: string | undefined
  /** The discount being edited, which does not count against itself. */
  discountId: string | undefined
  tools: FindTools & { describePickRefusal: typeof describePickRefusal }
}): { ok: true } | { ok: false; error: string } {
  const claim = tools.findClaim({ claims, productId, variantId, discountId, tools })
  if (!claim) return { ok: true }
  return { ok: false, error: tools.describePickRefusal({ claim, isVariant: variantId !== undefined }) }
}

/** Throws the save refusal for the first member held by another active discount. The product's title is looked up only for that one. */
export async function assertFreeOfClaims({ claims, members, discountId, tools }: {
  claims: Claim[]
  members: ClaimedProduct[]
  discountId: string
  tools: FindTools & TitleTools & { describeSaveRefusal: typeof describeSaveRefusal; readMemberTitle: typeof readMemberTitle }
}): Promise<void> {
  for (const member of members) {
    const claim = tools.findClaim({ claims, productId: member.productId, variantId: member.variantId, discountId, tools })
    if (claim) throw new Error(tools.describeSaveRefusal({ claim, memberTitle: await tools.readMemberTitle({ member, tools }) }))
  }
}
