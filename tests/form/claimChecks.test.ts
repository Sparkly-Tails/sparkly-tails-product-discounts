import { describe, it, expect, vi } from 'vitest'
import { checkMemberFree, assertFreeOfClaims } from '@/form/claimChecks'
import { CLAIM_TOOLS, describePickRefusal, describeSaveRefusal, findClaim, type Claim } from '@/form/claims'

const SPRING: Claim = { kind: 'tier', discountId: 'disc_a', discountName: 'Spring', productId: 'p1' }

function buildTools(_claims: Claim[]) {
  return { ...CLAIM_TOOLS, findClaim, describePickRefusal, describeSaveRefusal, readMemberInfo: vi.fn(), readMemberTitle: vi.fn(async () => 'Tuna Soup') }
}

describe('checkMemberFree', () => {
  const claims = [SPRING]

  it('says ok when no active discount has the product', () => {
    expect(checkMemberFree({ claims, productId: 'p9', variantId: undefined, discountId: undefined, tools: buildTools(claims) })).toEqual({ ok: true })
  })

  it('names the discount that has the product', () => {
    expect(checkMemberFree({ claims, productId: 'p1', variantId: undefined, discountId: undefined, tools: buildTools(claims) })).toEqual({ ok: false, error: 'Product already in discount "Spring"' })
  })

  it('says variant when a variant was picked', () => {
    expect(checkMemberFree({ claims, productId: 'p1', variantId: 'v1', discountId: undefined, tools: buildTools(claims) })).toEqual({ ok: false, error: 'Variant already in discount "Spring"' })
  })

  it('says ok for the discount being edited, which is not in the way of itself', () => {
    expect(checkMemberFree({ claims, productId: 'p1', variantId: undefined, discountId: 'disc_a', tools: buildTools(claims) })).toEqual({ ok: true })
  })
})

describe('assertFreeOfClaims', () => {
  const claims = [SPRING]

  it('passes when no member is held by another discount', async () => {
    const tools = buildTools(claims)
    await expect(assertFreeOfClaims({ claims, members: [{ productId: 'p9' }], discountId: 'disc_b', tools })).resolves.toBeUndefined()
    expect(tools.readMemberTitle).not.toHaveBeenCalled()
  })

  it('throws the save refusal naming the product and the discount, and looks the title up only then', async () => {
    const tools = buildTools(claims)
    await expect(assertFreeOfClaims({ claims, members: [{ productId: 'p9' }, { productId: 'p1' }], discountId: 'disc_b', tools })).rejects.toThrow(
      '"Tuna Soup" is already in live discount "Spring". A product can only be in one live discount: take "Spring" offline or remove the product here.',
    )
    expect(tools.readMemberTitle).toHaveBeenCalledTimes(1)
    expect(tools.readMemberTitle).toHaveBeenCalledWith(expect.objectContaining({ member: { productId: 'p1' } }))
  })

  it('does not count the discount that is being saved', async () => {
    await expect(assertFreeOfClaims({ claims, members: [{ productId: 'p1' }], discountId: 'disc_a', tools: buildTools(claims) })).resolves.toBeUndefined()
  })
})
