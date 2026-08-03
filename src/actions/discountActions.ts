'use server'

import { getConfig, saveConfig, isProductAvailable, type Tier, type ProductDiscount, type GroupDiscount } from '@/lib/config'
import { redirectWithToken } from '@/lib/auth-redirect'
import { syncProductTierMetafield, syncGroupTierMetafield } from '@/lib/product-tiers'
import { getGroupProductInfo } from '@/lib/products'

function parseTiersFromForm(formData: FormData, pricingMode: 'percent' | 'fixed'): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    if (minQty > 0) {
      if (pricingMode === 'fixed') {
        const rawFixedPrice = formData.get(`tier-${i}-fixedPrice`)
        const fixedPrice = Math.round(Number(rawFixedPrice) * 100) / 100
        if (fixedPrice > 0) {
          tiers.push({ minQty, fixedPrice })
        }
      } else {
        const rawPercentOff = Number(formData.get(`tier-${i}-percentOff`))
        const percentOff = Math.round(rawPercentOff * 10) / 10
        if (percentOff >= 0) {
          const tier: Tier = { minQty, percentOff }
          const rawAnchorPrice = formData.get(`tier-${i}-anchorPrice`)
          if (rawAnchorPrice != null && String(rawAnchorPrice).trim() !== '') {
            const anchorPrice = Math.round(Number(rawAnchorPrice) * 100) / 100
            if (anchorPrice > 0) tier.anchorPrice = anchorPrice
          }
          tiers.push(tier)
        }
      }
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
    if (id && !ids.includes(id)) ids.push(id)
    i++
  }
  return ids
}

export async function createDiscount(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '').trim()
  if (!productId) throw new Error('A product is required')

  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const tiers = parseTiersFromForm(formData, pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  if (!isProductAvailable(config, productId)) {
    throw new Error(`Product ${productId} already has a discount or belongs to a group`)
  }

  const newDiscount: ProductDiscount = { productId, status: 'draft', pricingMode, title: '', tiers }
  await saveConfig({ ...config, products: [...config.products, newDiscount] })

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function updateTiers(productId: string, formData: FormData): Promise<void> {
  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  const tiers = parseTiersFromForm(formData, discount.pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

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

  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const tiers = parseTiersFromForm(formData, pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()
  for (const productId of productIds) {
    if (!isProductAvailable(config, productId)) {
      throw new Error(`Product ${productId} already has a discount or belongs to another group`)
    }
  }

  const groupId = `grp_${crypto.randomUUID()}`
  const newGroup: GroupDiscount = { groupId, name, status: 'draft', pricingMode, title: '', productIds, tiers }
  await saveConfig({ ...config, groups: [...config.groups, newGroup] })

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}

async function syncGroupMetafields(group: GroupDiscount): Promise<void> {
  const members = await getGroupProductInfo(group.productIds)
  const resolvedIds = new Set(members.map((m) => m.productId))
  await Promise.allSettled(
    group.productIds
      .filter((productId) => resolvedIds.has(productId))
      .map((productId) => {
        const siblings = members
          .filter((m) => m.productId !== productId)
          .map((m) => ({ title: m.title, handle: m.handle }))
        return syncGroupTierMetafield(productId, { tiers: group.tiers, siblings })
      }),
  )
}

async function clearGroupMetafields(productIds: string[]): Promise<void> {
  await Promise.allSettled(productIds.map((productId) => syncGroupTierMetafield(productId, null)))
}

export async function updateGroupProducts(groupId: string, formData: FormData): Promise<void> {
  const productIds = parseGroupProductIdsFromForm(formData)
  if (productIds.length < 2) throw new Error('A group needs at least 2 products')

  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  for (const productId of productIds) {
    if (!isProductAvailable(config, productId, groupId)) {
      throw new Error(`Product ${productId} already has a discount or belongs to another group`)
    }
  }

  const removedProductIds = group.productIds.filter((id) => !productIds.includes(id))
  group.productIds = productIds
  await saveConfig(config)

  if (group.status === 'live') {
    if (removedProductIds.length > 0) {
      await clearGroupMetafields(removedProductIds)
    }
    await syncGroupMetafields(group)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}

export async function updateGroupTiers(groupId: string, formData: FormData): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const tiers = parseTiersFromForm(formData, group.pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  group.tiers = tiers
  await saveConfig(config)

  if (group.status === 'live') {
    await syncGroupMetafields(group)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}

export async function setGroupStatus(groupId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  group.status = status
  await saveConfig(config)

  if (status === 'live') {
    await syncGroupMetafields(group)
  } else {
    await clearGroupMetafields(group.productIds)
  }

  await redirectWithToken(`/discounts/groups/${encodeURIComponent(groupId)}`)
}

export async function deleteGroup(groupId: string): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.groupId === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const remaining = config.groups.filter((g) => g.groupId !== groupId)
  await saveConfig({ ...config, groups: remaining })

  await clearGroupMetafields(group.productIds)

  await redirectWithToken('/')
}
