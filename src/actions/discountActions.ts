'use server'

import { getConfig, saveConfig, isProductAvailable, pricesUniform, type Tier, type Discount, type DiscountMember } from '@/lib/config'
import { redirectWithToken } from '@/lib/auth-redirect'
import { syncDiscountMetafields, clearDiscountMetafields } from '@/lib/product-tiers'
import { getMemberInfo } from '@/lib/products'

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

function parseMembersFromForm(formData: FormData): DiscountMember[] {
  const members: DiscountMember[] = []
  let i = 0
  while (formData.has(`member-${i}-productId`)) {
    const productId = String(formData.get(`member-${i}-productId`) ?? '').trim()
    const rawVariantId = String(formData.get(`member-${i}-variantId`) ?? '').trim()
    if (productId) {
      members.push(rawVariantId ? { productId, variantId: rawVariantId } : { productId })
    }
    i++
  }
  return members
}

/**
 * Throws if the requested pricing mode/tiers require a shared member price
 * that the resolved members don't actually have. Called before saving on
 * both create and every edit path that can change members or tiers.
 */
async function assertPricingAllowed(members: DiscountMember[], pricingMode: 'percent' | 'fixed', tiers: Tier[]): Promise<void> {
  const info = await getMemberInfo(members)
  const uniform = pricesUniform(info.map((m) => m.price))
  if (uniform) return

  if (pricingMode === 'fixed') {
    throw new Error('These products/variants have different prices — fixed-price tiers require a shared price. Use percentage tiers instead, or remove the mismatched member.')
  }
  if (tiers.some((t) => t.anchorPrice != null)) {
    throw new Error('These products/variants have different prices — anchor pricing requires a shared price. Remove the anchor price on your tiers, or remove the mismatched member.')
  }
}

async function assertMembersAvailable(members: DiscountMember[], excludeDiscountId?: string): Promise<void> {
  const config = await getConfig()
  for (const member of members) {
    if (!isProductAvailable(config, member.productId, member.variantId, excludeDiscountId)) {
      throw new Error(`${member.productId}${member.variantId ? ` (variant ${member.variantId})` : ''} already belongs to another discount`)
    }
  }
}

export async function createDiscount(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('A name is required')

  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const members = parseMembersFromForm(formData)
  if (members.length === 0) throw new Error('At least one product or variant is required')

  const pricingMode: 'percent' | 'fixed' = formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
  const tiers = parseTiersFromForm(formData, pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  await assertMembersAvailable(members)
  await assertPricingAllowed(members, pricingMode, tiers)

  const config = await getConfig()
  const discountId = `disc_${crypto.randomUUID()}`
  const newDiscount: Discount = { discountId, name, title, status: 'draft', pricingMode, members, tiers }
  await saveConfig({ discounts: [...config.discounts, newDiscount] })

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

function findDiscountOrThrow(config: { discounts: Discount[] }, discountId: string): Discount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Discount ${discountId} not found`)
  return discount
}

export async function updateDiscountMembers(discountId: string, formData: FormData): Promise<void> {
  const members = parseMembersFromForm(formData)
  if (members.length === 0) throw new Error('At least one product or variant is required')

  await assertMembersAvailable(members, discountId)

  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  await assertPricingAllowed(members, discount.pricingMode, discount.tiers)

  discount.members = members
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncDiscountMetafields(discount)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function updateDiscountTiers(discountId: string, formData: FormData): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const tiers = parseTiersFromForm(formData, discount.pricingMode)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  await assertPricingAllowed(discount.members, discount.pricingMode, tiers)

  discount.tiers = tiers
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncDiscountMetafields(discount)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function updateDiscountTitle(discountId: string, formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  discount.title = title
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncDiscountMetafields(discount)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function setDiscountStatus(discountId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  discount.status = status
  await saveConfig(config)

  if (status === 'live') {
    await syncDiscountMetafields(discount)
  } else {
    await clearDiscountMetafields(discount.members)
  }

  await redirectWithToken(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function deleteDiscount(discountId: string): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveConfig({ discounts: remaining })

  await clearDiscountMetafields(discount.members)

  await redirectWithToken('/')
}
