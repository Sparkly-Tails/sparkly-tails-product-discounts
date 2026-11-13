import { describe, it, expect, vi } from 'vitest'
import { SETTINGS_STORE_TOOLS, getStoreSettings, saveStoreSettings } from '@/settings/settingsStore'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'
import { METAFIELD_NAMESPACE } from '@/lib/metafieldNames'

describe('getStoreSettings', () => {
  it('returns the defaults when the shop metafield is absent', async () => {
    const queryShop = vi.fn(async () => ({ shop: { metafield: null } }))
    expect(await getStoreSettings({ tools: { ...SETTINGS_STORE_TOOLS, queryShop } })).toEqual(DEFAULT_SETTINGS)
    expect(queryShop).toHaveBeenCalledWith(expect.any(String), { namespace: METAFIELD_NAMESPACE, key: 'tier_settings' })
  })

  it('returns the defaults when the stored value is corrupt', async () => {
    const queryShop = vi.fn(async () => ({ shop: { metafield: { value: '{oops' } } }))
    expect(await getStoreSettings({ tools: { ...SETTINGS_STORE_TOOLS, queryShop } })).toEqual(DEFAULT_SETTINGS)
  })
})

describe('saveStoreSettings', () => {
  it('writes one json metafield with key tier_settings in the app namespace', async () => {
    const queryShop = vi
      .fn()
      .mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
      .mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })
    await saveStoreSettings({ settings: DEFAULT_SETTINGS, tools: { ...SETTINGS_STORE_TOOLS, queryShop } })
    const variables = queryShop.mock.calls[1][1] as { metafields: Record<string, string>[] }
    expect(variables.metafields).toEqual([
      { ownerId: 'gid://shopify/Shop/1', namespace: METAFIELD_NAMESPACE, key: 'tier_settings', type: 'json', value: JSON.stringify(DEFAULT_SETTINGS) },
    ])
  })

  it('throws Shopify\'s message when the write is refused', async () => {
    const queryShop = vi
      .fn()
      .mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
      .mockResolvedValueOnce({ metafieldsSet: { userErrors: [{ field: ['x'], message: 'refused' }] } })
    await expect(saveStoreSettings({ settings: DEFAULT_SETTINGS, tools: { ...SETTINGS_STORE_TOOLS, queryShop } })).rejects.toThrow('refused')
  })
})
