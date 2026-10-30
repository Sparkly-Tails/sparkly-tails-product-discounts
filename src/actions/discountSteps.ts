// The steps the discount actions are made of (reading the form, checking, bringing Shopify in step),
// moved out of discountActions.ts unchanged so the form's single save action can use them too.
import { getConfig, isProductAvailable, pricesUniform, type Tier, type Discount, type DiscountMember } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import { shopifyQuery } from '@/lib/shopify-client'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { fetchAvailabilityConfigs, isAvailableEverywhere } from '@/lib/discount-availability'
import { SCHEDULE_CHECKS, describeMissingTime, describeScheduleProblem, formatShopLocalNow } from '@/flash/schedule'
import { DISCOUNT_RECORD_TOOLS, syncDiscountRecord } from '@/flash/discountRecord'

export function parseTiersFromForm(formData: FormData, pricingMode: 'percent' | 'fixed'): Tier[] {
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

export function parseMembersFromForm(formData: FormData): DiscountMember[] {
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
export async function assertPricingAllowed(members: DiscountMember[], pricingMode: 'percent' | 'fixed', tiers: Tier[]): Promise<void> {
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

export async function assertMembersAvailable(members: DiscountMember[], excludeDiscountId?: string): Promise<void> {
  const config = await getConfig()
  for (const member of members) {
    if (!isProductAvailable(config, member.productId, member.variantId, excludeDiscountId)) {
      throw new Error(`${member.productId}${member.variantId ? ` (variant ${member.variantId})` : ''} already belongs to another discount`)
    }
  }
}

/** The shop's current local time (YYYY-MM-DDTHH:mm) in its own timezone. */
export async function readShopNow(): Promise<{ timeZone: string; nowLocal: string }> {
  const timeZone = await getShopTimezone()
  return { timeZone, nowLocal: formatShopLocalNow({ timeZone, now: new Date() }) }
}

/** Throws the message for a flash window that cannot be saved: a time missing, bad order or year, or an end that has passed. */
export function assertFlashWindow(flash: { startsAt: string; endsAt: string }, nowLocal: string): void {
  const problem = describeMissingTime(flash) ?? describeScheduleProblem({ ...flash, nowLocal, checks: SCHEDULE_CHECKS })
  if (problem) throw new Error(problem)
}

/** Like assertMembersAvailable, but across both kinds of discount (a time-based discount may have taken a product since). */
export async function assertMembersAvailableEverywhere(members: DiscountMember[], discountId: string): Promise<void> {
  const { productConfig, timeConfig } = await fetchAvailabilityConfigs()
  for (const member of members) {
    if (!isAvailableEverywhere(productConfig, timeConfig, member.productId, member.variantId, discountId)) {
      throw new Error(`${member.productId}${member.variantId ? ` (variant ${member.variantId})` : ''} already belongs to another discount`)
    }
  }
}

/** A live flash sale, or any discount that still has a Shopify discount to delete, needs its Shopify discount brought in step. */
export function needsRecordSync(discount: Discount, previousRecordId: string | undefined): boolean {
  return (discount.status === 'live' && discount.flash !== undefined) || previousRecordId !== undefined
}

/**
 * Brings the Shopify discount of the flash sale in step with the discount as it
 * is now (in memory, not saved yet) and stores the id it returns on the
 * discount. Shopify is changed BEFORE the config is saved, so a refusal (the
 * limit, a bad window) throws with nothing saved: the stored discount stays as
 * it was.
 */
export async function syncRecordOf(discount: Discount, previousRecordId: string | undefined): Promise<void> {
  const { timeZone, nowLocal } = await readShopNow()
  const recordId = await syncDiscountRecord({
    query: shopifyQuery,
    discountId: discount.discountId,
    title: discount.title,
    status: discount.status,
    flash: discount.flash ? { startsAt: discount.flash.startsAt, endsAt: discount.flash.endsAt } : undefined,
    shopifyDiscountId: previousRecordId,
    nowLocal,
    convertToUtc: (naive) => zonedTimeToUtc(naive, timeZone),
    tools: DISCOUNT_RECORD_TOOLS,
  })
  if (!discount.flash) return
  if (recordId) discount.flash.shopifyDiscountId = recordId
  else delete discount.flash.shopifyDiscountId
}

export function findDiscountOrThrow(config: { discounts: Discount[] }, discountId: string): Discount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Discount ${discountId} not found`)
  return discount
}

/** The id of a new discount. */
export function createDiscountId(): string {
  return `disc_${crypto.randomUUID()}`
}
