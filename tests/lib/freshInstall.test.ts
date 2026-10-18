import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureFreshInstall } from '@/lib/freshInstall'
import { shopifyQuery } from '@/lib/shopify-client'
import { getConfig } from '@/lib/config'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import { clearDiscountMetafields, findExistingIds } from '@/lib/product-tiers'
import { clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from '@/lib/metafieldNames'

vi.mock('@/lib/shopify-client', () => ({ shopifyQuery: vi.fn() }))
vi.mock('@/lib/config', () => ({ getConfig: vi.fn() }))
vi.mock('@/timeDiscounts/config', () => ({ getTimeDiscountsConfig: vi.fn() }))
vi.mock('@/lib/product-tiers', () => ({ clearDiscountMetafields: vi.fn(), findExistingIds: vi.fn() }))
vi.mock('@/timeDiscounts/metafieldSync', () => ({ clearTimeDiscountMetafields: vi.fn() }))

const INSTALLATION = 'gid://shopify/AppInstallation/1'
const SHOP_ID = 'gid://shopify/Shop/1'
const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const P3 = 'gid://shopify/Product/3'

let events: string[]
let marker: string | null
let deleteErrors: { message: string }[]
let setErrors: { message: string }[]

function installFakeShopify(): void {
  vi.mocked(shopifyQuery).mockImplementation((async (query: string, variables?: Record<string, unknown>) => {
    if (query.includes('currentAppInstallation')) {
      events.push('read-marker')
      return { currentAppInstallation: { id: INSTALLATION, metafield: marker ? { value: marker } : null }, shop: { id: SHOP_ID } }
    }
    if (query.includes('metafieldsDelete')) {
      events.push(`delete-shop-settings:${(variables as { metafields: { ownerId: string; key: string }[] }).metafields.map((m) => `${m.ownerId === SHOP_ID ? 'shop' : m.ownerId}/${m.key}`).join(',')}`)
      return { metafieldsDelete: { userErrors: deleteErrors } }
    }
    if (query.includes('metafieldsSet')) {
      const input = (variables as { metafields: { ownerId: string; namespace: string; key: string; value: string }[] }).metafields[0]
      events.push(`write-marker:${input.ownerId === INSTALLATION ? 'installation' : input.ownerId}/${input.namespace}/${input.key}`)
      if (setErrors.length === 0) marker = input.value
      return { metafieldsSet: { userErrors: setErrors } }
    }
    throw new Error(`unexpected query: ${query.slice(0, 50)}`)
  }) as never)
}

describe('ensureFreshInstall', () => {
  beforeEach(() => {
    events = []
    marker = null
    deleteErrors = []
    setErrors = []
    for (const fn of [shopifyQuery, getConfig, getTimeDiscountsConfig, clearDiscountMetafields, findExistingIds, clearTimeDiscountMetafields]) vi.mocked(fn as never as ReturnType<typeof vi.fn>).mockReset()
    installFakeShopify()
    vi.mocked(getConfig).mockResolvedValue({ discounts: [] })
    vi.mocked(getTimeDiscountsConfig).mockResolvedValue({ discounts: [] })
    vi.mocked(findExistingIds).mockImplementation(async (ids: string[]) => new Set(ids))
    vi.mocked(clearDiscountMetafields).mockImplementation(async () => { events.push('clear-tier-products') })
    vi.mocked(clearTimeDiscountMetafields).mockImplementation(async () => { events.push('clear-time-products') })
  })

  it('does nothing when the installation already has its marker', async () => {
    marker = '2026-10-18T21:00:00.000Z'

    expect(await ensureFreshInstall()).toBe('known')

    expect(events).toEqual(['read-marker'])
    expect(getConfig).not.toHaveBeenCalled()
    expect(clearDiscountMetafields).not.toHaveBeenCalled()
  })

  it('on a fresh installation with retained data, removes the product data, then the shop settings, then writes the marker last', async () => {
    vi.mocked(getConfig).mockResolvedValue({
      discounts: [{ discountId: 'd1', name: 'A', title: 'A', status: 'live', pricingMode: 'percent', members: [{ productId: P1 }, { productId: P2, variantId: 'gid://shopify/ProductVariant/20' }], tiers: [] }],
    } as never)
    vi.mocked(getTimeDiscountsConfig).mockResolvedValue({
      discounts: [{ discountId: 't1', items: [{ productId: P2 }, { productId: P3 }] }],
    } as never)

    expect(await ensureFreshInstall()).toBe('fresh')

    expect(events).toEqual([
      'read-marker',
      'clear-tier-products',
      'clear-time-products',
      `delete-shop-settings:shop/${METAFIELD_KEYS.tierConfig},shop/${METAFIELD_KEYS.timeConfig}`,
      `write-marker:installation/${METAFIELD_NAMESPACE}/install_marker`,
    ])
    expect(clearDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }, { productId: P2 }, { productId: P3 }])
    expect(clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }, { productId: P2 }, { productId: P3 }])
  })

  it('skips products that no longer exist in the store', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [{ discountId: 'd1', members: [{ productId: P1 }, { productId: P2 }] }] } as never)
    vi.mocked(findExistingIds).mockResolvedValue(new Set([P1]))

    await ensureFreshInstall()

    expect(clearDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }])
    expect(clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }])
  })

  it('on a brand-new store with nothing retained, only writes the marker (and removes nothing that exists)', async () => {
    expect(await ensureFreshInstall()).toBe('fresh')

    expect(clearDiscountMetafields).toHaveBeenCalledWith([])
    expect(events.at(-1)).toContain('write-marker')
    expect(marker).not.toBeNull()
  })

  it('writes no marker and throws when removing product data fails, so the next load tries again with the settings intact', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [{ discountId: 'd1', members: [{ productId: P1 }] }] } as never)
    vi.mocked(clearDiscountMetafields).mockRejectedValue(new Error('Shopify is down'))

    await expect(ensureFreshInstall()).rejects.toThrow('Shopify is down')

    expect(events.some((e) => e.startsWith('delete-shop-settings'))).toBe(false)
    expect(events.some((e) => e.startsWith('write-marker'))).toBe(false)
    expect(marker).toBeNull()
  })

  it('writes no marker and throws when removing the shop settings fails', async () => {
    deleteErrors = [{ message: 'Access denied' }]

    await expect(ensureFreshInstall()).rejects.toThrow('Access denied')

    expect(events.some((e) => e.startsWith('write-marker'))).toBe(false)
  })

  it('throws when the marker cannot be written, so the purge is simply repeated next time', async () => {
    setErrors = [{ message: 'Could not write' }]

    await expect(ensureFreshInstall()).rejects.toThrow('Could not write')
  })

  it('is a no-op the second time: after the marker is written nothing is purged again', async () => {
    await ensureFreshInstall()
    events.length = 0
    vi.mocked(clearDiscountMetafields).mockClear()

    expect(await ensureFreshInstall()).toBe('known')

    expect(events).toEqual(['read-marker'])
    expect(clearDiscountMetafields).not.toHaveBeenCalled()
  })
})
