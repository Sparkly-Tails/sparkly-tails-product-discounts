import { describe, it, expect, vi } from 'vitest'
import { checkMemberFree, assertFreeOfClaims } from '@/form/claimChecks'
import { CLAIM_TOOLS, describePickRefusal, describeSaveRefusal, findClaim, type Claim } from '@/form/claims'

const SPRING: Claim = { kind: 'tier', discountId: 'disc_a', discountName: 'Spring', productId: 'p1' }

function buildTools(claims: Claim[]) {
  return { ...CLAIM_TOOLS, loadClaims: vi.fn(async () => claims), findClaim, describePickRefusal, describeSaveRefusal, readMemberTitle: vi.fn(async () => 'Tuna Soup') }
}

describe('checkMemberFree', () => {
  it('says ok when no active discount has the product', async () => {
    expect(await checkMemberFree({ productId: 'p9', variantId: undefined, discountId: undefined, tools: buildTools([SPRING]) })).toEqual({ ok: true })
  })

  it('names the discount that has the product', async () => {
    expect(await checkMemberFree({ productId: 'p1', variantId: undefined, discountId: undefined, tools: buildTools([SPRING]) })).toEqual({ ok: false, error: 'Product already in discount "Spring"' })
  })

  it('says variant when a variant was picked', async () => {
    expect(await checkMemberFree({ productId: 'p1', variantId: 'v1', discountId: undefined, tools: buildTools([SPRING]) })).toEqual({ ok: false, error: 'Variant already in discount "Spring"' })
  })

  it('says ok for the discount being edited, which is not in the way of itself', async () => {
    expect(await checkMemberFree({ productId: 'p1', variantId: undefined, discountId: 'disc_a', tools: buildTools([SPRING]) })).toEqual({ ok: true })
  })
})

describe('assertFreeOfClaims', () => {
  it('passes when no member is held by another discount', async () => {
    const tools = buildTools([SPRING])
    await expect(assertFreeOfClaims({ members: [{ productId: 'p9' }], discountId: 'disc_b', tools })).resolves.toBeUndefined()
    expect(tools.readMemberTitle).not.toHaveBeenCalled()
  })

  it('throws the save refusal naming the product and the discount, and looks the title up only then', async () => {
    const tools = buildTools([SPRING])
    await expect(assertFreeOfClaims({ members: [{ productId: 'p9' }, { productId: 'p1' }], discountId: 'disc_b', tools })).rejects.toThrow(
      '"Tuna Soup" is already in live discount "Spring". A product can only be in one live discount: take "Spring" offline or remove the product here.',
    )
    expect(tools.readMemberTitle).toHaveBeenCalledTimes(1)
    expect(tools.readMemberTitle).toHaveBeenCalledWith({ productId: 'p1' })
  })

  it('does not count the discount that is being saved', async () => {
    await expect(assertFreeOfClaims({ members: [{ productId: 'p1' }], discountId: 'disc_a', tools: buildTools([SPRING]) })).resolves.toBeUndefined()
  })
})
