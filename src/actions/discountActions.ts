'use server'

import { getConfig, saveConfig, type Discount } from '@/lib/config'
import { redirect } from 'next/navigation'
import { syncDiscountMetafields, clearDiscountMetafields } from '@/lib/product-tiers'
import { ensureTierDiscount } from '@/lib/tierDiscount'
import { parseFlashFromForm, parseHighDemandFromForm } from '@/flash/formFields'
import {
  assertFlashWindow, assertMembersAvailable, assertMembersAvailableEverywhere, assertPricingAllowed, findDiscountOrThrow, needsRecordSync,
  parseMembersFromForm, parseTiersFromForm, readShopNow, syncRecordOf,
} from '@/actions/discountSteps'

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

  const flash = parseFlashFromForm({ formData })
  if (flash) assertFlashWindow(flash, (await readShopNow()).nowLocal)
  const highDemand = parseHighDemandFromForm({ formData })

  await assertMembersAvailable(members)
  await assertPricingAllowed(members, pricingMode, tiers)

  // The checkout discount must exist for this discount to apply; if it cannot be created, say so now.
  await ensureTierDiscount()

  const config = await getConfig()
  const discountId = `disc_${crypto.randomUUID()}`
  const newDiscount: Discount = { discountId, name, title, status: 'draft', pricingMode, members, tiers, ...(flash ? { flash } : {}), ...(highDemand ? { highDemand } : {}) }
  await saveConfig({ discounts: [...config.discounts, newDiscount] })

  redirect(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function updateDiscountMembers(discountId: string, formData: FormData): Promise<void> {
  const members = parseMembersFromForm(formData)
  if (members.length === 0) throw new Error('At least one product or variant is required')

  await assertMembersAvailable(members, discountId)

  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  await assertPricingAllowed(members, discount.pricingMode, discount.tiers)

  const previousProductIds = new Set(discount.members.map((m) => m.productId))
  const nextProductIds = new Set(members.map((m) => m.productId))
  const removed = [...previousProductIds].filter((id) => !nextProductIds.has(id))

  discount.members = members
  await saveConfig(config)

  if (discount.status === 'live') {
    if (removed.length > 0) {
      await clearDiscountMetafields(removed.map((productId) => ({ productId })))
    }
    await syncDiscountMetafields(discount)
  }

  redirect(`/discounts/${encodeURIComponent(discountId)}`)
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

  redirect(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function updateDiscountTitle(discountId: string, formData: FormData): Promise<void> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('A title is required')

  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  discount.title = title
  if (needsRecordSync(discount, discount.flash?.shopifyDiscountId)) await syncRecordOf(discount, discount.flash?.shopifyDiscountId)
  await saveConfig(config)

  if (discount.status === 'live') {
    await syncDiscountMetafields(discount)
  }

  redirect(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function setDiscountStatus(discountId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)
  const previousRecordId = discount.flash?.shopifyDiscountId

  if (status === 'live' && discount.flash) {
    assertFlashWindow(discount.flash, (await readShopNow()).nowLocal)
    await assertMembersAvailableEverywhere(discount.members, discountId)
  }

  discount.status = status
  if (needsRecordSync(discount, previousRecordId)) await syncRecordOf(discount, previousRecordId)
  await saveConfig(config)

  if (status === 'live') {
    await syncDiscountMetafields(discount)
  } else {
    await clearDiscountMetafields(discount.members)
  }

  redirect(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function deleteDiscount(discountId: string): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  const previousRecordId = discount.flash?.shopifyDiscountId
  if (previousRecordId) await syncRecordOf({ ...discount, status: 'draft', flash: undefined }, previousRecordId)

  const remaining = config.discounts.filter((d) => d.discountId !== discountId)
  await saveConfig({ discounts: remaining })

  await clearDiscountMetafields(discount.members)

  redirect('/')
}

export async function updateDiscountFlash(discountId: string, formData: FormData): Promise<void> {
  const flash = parseFlashFromForm({ formData })
  if (flash) assertFlashWindow(flash, (await readShopNow()).nowLocal)

  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)
  const previousRecordId = discount.flash?.shopifyDiscountId

  if (flash) discount.flash = { ...flash, ...(previousRecordId ? { shopifyDiscountId: previousRecordId } : {}) }
  else delete discount.flash

  if (needsRecordSync(discount, previousRecordId)) await syncRecordOf(discount, previousRecordId)
  await saveConfig(config)

  if (discount.status === 'live') await syncDiscountMetafields(discount)

  redirect(`/discounts/${encodeURIComponent(discountId)}`)
}

export async function updateDiscountHighDemand(discountId: string, formData: FormData): Promise<void> {
  const config = await getConfig()
  const discount = findDiscountOrThrow(config, discountId)

  if (parseHighDemandFromForm({ formData })) discount.highDemand = true
  else delete discount.highDemand
  await saveConfig(config)

  if (discount.status === 'live') await syncDiscountMetafields(discount)

  redirect(`/discounts/${encodeURIComponent(discountId)}`)
}
