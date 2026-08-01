'use server'

import { getConfig, saveConfig, isProductAvailable, type Tier, type ProductDiscount, type GroupDiscount } from '@/lib/config'
import { redirectWithToken } from '@/lib/auth-redirect'
import { syncProductTierMetafield } from '@/lib/product-tiers'

function parseTiersFromForm(formData: FormData): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    const rawPercentOff = Number(formData.get(`tier-${i}-percentOff`))
    const percentOff = Math.round(rawPercentOff * 10) / 10
    if (minQty > 0 && percentOff >= 0) {
      const tier: Tier = { minQty, percentOff }
      const rawAnchorPrice = formData.get(`tier-${i}-anchorPrice`)
      if (rawAnchorPrice != null && String(rawAnchorPrice).trim() !== '') {
        const anchorPrice = Math.round(Number(rawAnchorPrice) * 100) / 100
        if (anchorPrice > 0) tier.anchorPrice = anchorPrice
      }
      tiers.push(tier)
    }
    i++
  }
  return tiers.sort((a, b) => a.minQty - b.minQty)
}

function parseGroupProductIdsFromForm(formData: FormData): string[] {
  const ids: string[] = []
  let i = 0
  while (formData.has(`product-${i}-id`)) {
    const id = String(formData.get(`product-${i}-id`) ?? '').trim()
    if (id) ids.push(id)
    i++
  }
  return ids
}

export async function createDiscount(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '').trim()
  if (!productId) throw new Error('A product is required')

  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  if (config.products.some((p) => p.productId === productId)) {
    throw new Error(`Product ${productId} already has a discount configured`)
  }

  const newDiscount: ProductDiscount = { productId, status: 'draft', tiers }
  await saveConfig({ ...config, products: [...config.products, newDiscount] })

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function updateTiers(productId: string, formData: FormData): Promise<void> {
  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.tiers = tiers
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncProductTierMetafield(productId, tiers)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function setStatus(productId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.status = status
  await saveConfig(config)

  await syncProductTierMetafield(productId, status === 'live' ? discount.tiers : null)

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function deleteDiscount(productId: string): Promise<void> {
  const config = await getConfig()
  const remaining = config.products.filter((p) => p.productId !== productId)
  await saveConfig({ ...config, products: remaining })

  await syncProductTierMetafield(productId, null)

  await redirectWithToken('/')
}

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('A group name is required')

  const productIds = parseGroupProductIdsFromForm(formData)
  if (productIds.length < 2) throw new Error('A group needs at least 2 products')

  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  for (const productId of productIds) {
    if (!isProductAvailable(config, productId)) {
      throw new Error(`Product ${productId} already has a discount or belongs to another group`)
    }
  }

  const groupId = `grp_${crypto.randomUUID()}`
  const newGroup: GroupDiscount = { groupId, name, status: 'draft', productIds, tiers }
  await saveConfig({ ...config, groups: [...config.groups, newGroup] })

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}
