// The two questions the form asks of the active discounts: may this product be picked, and may this discount be
// saved as it is. What the shop holds and how a refusal reads come in through `tools`.
import type { Claim, describePickRefusal, describeSaveRefusal, findClaim, isClaimOn, isVariantMatch } from '@/form/claims'

type ClaimedProduct = { productId: string; variantId?: string }

/** Answers the picker: ok, or the reason the product (or variant) is held by another active discount. */
export async function checkMemberFree({ productId, variantId, discountId, tools }: {
  productId: string
  variantId: string | undefined
  /** The discount being edited, which does not count against itself. */
  discountId: string | undefined
  tools: { loadClaims: () => Promise<Claim[]>; findClaim: typeof findClaim; isClaimOn: typeof isClaimOn; isVariantMatch: typeof isVariantMatch; describePickRefusal: typeof describePickRefusal }
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const claim = tools.findClaim({ claims: await tools.loadClaims(), productId, variantId, discountId, tools })
  if (!claim) return { ok: true }
  return { ok: false, error: tools.describePickRefusal({ claim, isVariant: variantId !== undefined }) }
}

/** Throws the save refusal for the first member held by another active discount. The product's title is looked up only for that one. */
export async function assertFreeOfClaims({ members, discountId, tools }: {
  members: ClaimedProduct[]
  discountId: string
  tools: {
    loadClaims: () => Promise<Claim[]>
    findClaim: typeof findClaim
    isClaimOn: typeof isClaimOn
    isVariantMatch: typeof isVariantMatch
    describeSaveRefusal: typeof describeSaveRefusal
    readMemberTitle: (member: ClaimedProduct) => Promise<string>
  }
}): Promise<void> {
  const claims = await tools.loadClaims()
  for (const member of members) {
    const claim = tools.findClaim({ claims, productId: member.productId, variantId: member.variantId, discountId, tools })
    if (claim) throw new Error(tools.describeSaveRefusal({ claim, memberTitle: await tools.readMemberTitle(member) }))
  }
}
