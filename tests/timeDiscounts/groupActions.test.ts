import { describe, it, expect, vi, beforeEach } from 'vitest'
import { previewGroup } from '@/timeDiscounts/groupActions'
import * as groupServer from '@/timeDiscounts/groupServer'

const P1 = 'gid://shopify/Product/1'
const covered = [{ productId: P1, title: 'Cat Toy', adminUrl: 'https://x/admin/products/1', regularPrice: 10, discountedPrice: 8 }]
const selection = { mode: 'products', members: [{ productId: P1, title: 'Cat Toy' }] }

beforeEach(() => vi.restoreAllMocks())

describe('previewGroup', () => {
  it('returns the covered rows for a valid group and writes nothing', async () => {
    const resolve = vi.spyOn(groupServer, 'resolveGroup').mockResolvedValue({ items: [], covered })
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, selection, 'time_disc_1')).toEqual({ ok: true, covered })
    expect(resolve).toHaveBeenCalledWith(
      { pricingMode: 'percent', amount: 20, selection },
      'time_disc_1',
      expect.stringContaining('/admin/products/'),
    )
  })

  it('returns the reason as a result, not a thrown error', async () => {
    vi.spyOn(groupServer, 'resolveGroup').mockRejectedValue(new Error('Cat Toy: This product already belongs to another discount'))
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, selection)).toEqual({ ok: false, error: 'Cat Toy: This product already belongs to another discount' })
  })

  it('rejects input that is not a rule and picks, without looking anything up', async () => {
    const resolve = vi.spyOn(groupServer, 'resolveGroup')
    expect(await previewGroup('nope', selection)).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, { mode: 'x' })).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(resolve).not.toHaveBeenCalled()
  })
})
