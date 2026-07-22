'use server'

import { getConfig, saveConfig, type Tier, type ProductDiscount } from '@/lib/config'
import { redirectWithToken } from '@/lib/auth-redirect'

function parseTiersFromForm(formData: FormData): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    const rawPercentOff = Number(formData.get(`tier-${i}-percentOff`))
    const percentOff = Math.round(rawPercentOff * 10) / 10
    if (minQty > 0 && percentOff >= 0) {
      tiers.push({ minQty, percentOff })
    }
    i++
  }
  return tiers.sort((a, b) => a.minQty - b.minQty)
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
  await saveConfig({ products: [...config.products, newDiscount] })

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

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function setStatus(productId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const discount = config.products.find((p) => p.productId === productId)
  if (!discount) throw new Error(`Discount for product ${productId} not found`)

  discount.status = status
  await saveConfig(config)

  await redirectWithToken(`/discounts/${encodeURIComponent(productId)}`)
}

export async function deleteDiscount(productId: string): Promise<void> {
  const config = await getConfig()
  const remaining = config.products.filter((p) => p.productId !== productId)
  await saveConfig({ products: remaining })

  await redirectWithToken('/')
}
