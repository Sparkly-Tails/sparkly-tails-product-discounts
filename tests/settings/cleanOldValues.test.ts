import { describe, it, expect, vi } from 'vitest'
import { cleanOldValues } from '@/settings/cleanOldValues'
import { dropRetiredFields, type Config, type Discount } from '@/lib/config'

const discountOf = (discountId: string, status: 'draft' | 'live'): Discount => ({
  discountId, name: discountId, title: discountId, status, pricingMode: 'percent', members: [{ productId: `gid://shopify/Product/${discountId}` }], tiers: [{ minQty: 3, percentOff: 10 }],
})
const OLD = { style: { backgroundColor: '#FFFFFF', cornerRadius: 4 }, popupFrequency: 'checkout' }

/** The config as the store holds it: two live discounts and a draft, each still carrying the old fields. */
function storedConfig(): Config {
  return { discounts: [{ ...discountOf('a', 'live'), ...OLD }, { ...discountOf('b', 'draft'), ...OLD }, { ...discountOf('c', 'live'), ...OLD }] as unknown as Discount[] }
}

/** Tools that behave like the real ones: reading drops the old fields (see getConfig), writing keeps what it is given. */
function makeTools(stored: { config: Config }) {
  return {
    readConfig: vi.fn(async () => ({ discounts: stored.config.discounts.map((discount) => dropRetiredFields({ discount })) })),
    writeConfig: vi.fn(async (config: Config) => { stored.config = config }),
    syncProducts: vi.fn<(discount: Discount) => Promise<void>>(async () => {}),
  }
}

describe('cleanOldValues', () => {
  it('re-syncs the products of the live discounts only, writes the config once, and says how many it rewrote', async () => {
    const tools = makeTools({ config: storedConfig() })
    const count = await cleanOldValues({ tools })
    expect(count).toBe(2)
    expect(tools.syncProducts.mock.calls.map(([discount]) => (discount as Discount).discountId)).toEqual(['a', 'c'])
    expect(tools.writeConfig).toHaveBeenCalledTimes(1)
  })

  it('writes a config with no style and no pop-up frequency on any discount, the rest untouched', async () => {
    const stored = { config: storedConfig() }
    await cleanOldValues({ tools: makeTools(stored) })
    expect(JSON.stringify(stored.config)).not.toMatch(/style|popupFrequency/)
    expect(stored.config.discounts.map((discount) => discount.discountId)).toEqual(['a', 'b', 'c'])
    expect(stored.config.discounts[0].tiers).toEqual([{ minQty: 3, percentOff: 10 }])
  })

  it('does nothing harmful when it runs twice: the second run writes the same config and does not fail', async () => {
    const stored = { config: storedConfig() }
    const tools = makeTools(stored)
    await cleanOldValues({ tools })
    const afterFirst = JSON.stringify(stored.config)
    await expect(cleanOldValues({ tools })).resolves.toBe(2)
    expect(JSON.stringify(stored.config)).toBe(afterFirst)
  })

  it('writes the config before it touches the products, and stops with the error when a sync fails', async () => {
    const stored = { config: storedConfig() }
    const tools = makeTools(stored)
    tools.syncProducts.mockResolvedValueOnce().mockRejectedValueOnce(new Error('Shopify is busy'))
    await expect(cleanOldValues({ tools })).rejects.toThrow('Shopify is busy')
    expect(tools.writeConfig).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(stored.config)).not.toMatch(/style|popupFrequency/)
  })

  it('has nothing to rewrite for a store without live discounts', async () => {
    const tools = makeTools({ config: { discounts: [discountOf('x', 'draft')] } })
    await expect(cleanOldValues({ tools })).resolves.toBe(0)
    expect(tools.syncProducts).not.toHaveBeenCalled()
  })
})
