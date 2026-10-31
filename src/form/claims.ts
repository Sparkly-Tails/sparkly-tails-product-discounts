// Which discounts keep a product to themselves. A tier discount does while it is live; a time-based discount does
// from the moment it exists until it ends. A draft, an offline discount and an expired one claim nothing.
import type { Discount } from '@/lib/config'
import type { TimeDiscount } from '@/timeDiscounts/config'

/** One product (or one variant of it) held by one active discount. */
export interface Claim {
  kind: 'tier' | 'time'
  discountId: string
  discountName: string
  productId: string
  variantId?: string
}

type ClaimOwner = Pick<Claim, 'kind' | 'discountId' | 'discountName'>
type ClaimedProduct = { productId: string; variantId?: string }

/** One claim for each product the owner holds. */
export function buildClaims({ owner, members }: { owner: ClaimOwner; members: ClaimedProduct[] }): Claim[] {
  const claims: Claim[] = []
  for (const member of members) claims.push({ ...owner, productId: member.productId, variantId: member.variantId })
  return claims
}

/** A whole product matches any of its variants (and the other way round); two different variants do not match. */
export function isVariantMatch({ claimVariantId, variantId }: { claimVariantId: string | undefined; variantId: string | undefined }): boolean {
  return claimVariantId === undefined || variantId === undefined || claimVariantId === variantId
}

/** True when the claim keeps (productId, variantId) from the discount being edited, which never claims against itself. */
export function isClaimOn({ claim, productId, variantId, discountId, tools }: {
  claim: Claim
  productId: string
  variantId: string | undefined
  discountId: string | undefined
  tools: { isVariantMatch: typeof isVariantMatch }
}): boolean {
  if (claim.discountId === discountId) return false
  return claim.productId === productId && tools.isVariantMatch({ claimVariantId: claim.variantId, variantId })
}

export const CLAIM_TOOLS = { buildClaims, isVariantMatch, isClaimOn }

/** The members of every live tier discount. */
export function listLiveTierClaims({ discounts, tools }: { discounts: Discount[]; tools: { buildClaims: typeof buildClaims } }): Claim[] {
  const claims: Claim[] = []
  for (const discount of discounts) if (discount.status === 'live') claims.push(...tools.buildClaims({ owner: { kind: 'tier', discountId: discount.discountId, discountName: discount.name }, members: discount.members }))
  return claims
}

/** The items of every time-based discount that `isOpen` says is upcoming or running, under the title its customers see. */
export function listOpenTimeClaims({ discounts, isOpen, tools }: {
  discounts: TimeDiscount[]
  isOpen: (window: { startsAt: string; endsAt: string }) => boolean
  tools: { buildClaims: typeof buildClaims }
}): Claim[] {
  const claims: Claim[] = []
  for (const discount of discounts) if (isOpen({ startsAt: discount.startsAt, endsAt: discount.endsAt })) claims.push(...tools.buildClaims({ owner: { kind: 'time', discountId: discount.discountId, discountName: discount.title }, members: discount.items }))
  return claims
}

/**
 * The claim that keeps (productId, variantId) from a discount, if any. `discountId` is the discount being edited:
 * it never claims against itself.
 */
export function findClaim({ claims, productId, variantId, discountId, tools }: {
  claims: Claim[]
  productId: string
  variantId: string | undefined
  discountId: string | undefined
  tools: { isClaimOn: typeof isClaimOn; isVariantMatch: typeof isVariantMatch }
}): Claim | undefined {
  for (const claim of claims) if (tools.isClaimOn({ claim, productId, variantId, discountId, tools })) return claim
  return undefined
}

/** What the picker says when the product, or the variant, is picked while another discount has it. */
export function describePickRefusal({ claim, isVariant }: { claim: Claim; isVariant: boolean }): string {
  return `${isVariant ? 'Variant' : 'Product'} already in discount "${claim.discountName}"`
}

/** What a save says when a member is held by another discount: which one, and what to do about it. */
export function describeSaveRefusal({ claim, memberTitle }: { claim: Claim; memberTitle: string }): string {
  const name = claim.discountName
  return claim.kind === 'tier'
    ? `"${memberTitle}" is already in live discount "${name}". A product can only be in one live discount: take "${name}" offline or remove the product here.`
    : `"${memberTitle}" is already in time-based discount "${name}", which is upcoming or running. A flash sale cannot share a product with it.`
}
