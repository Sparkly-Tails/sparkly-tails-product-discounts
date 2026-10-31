// The small, pure steps of saving the tier discount form (see saveFlow.ts, which puts them in order).
import type { Discount, DiscountMember, FlashSale } from '@/lib/config'
import type { ParsedDiscount } from '@/form/parseDiscountForm'

/** Go live makes the discount live, Take offline makes it a draft; any other save leaves its status as it is. */
export function pickStatus({ goLive, takeOffline, current }: { goLive: boolean; takeOffline: boolean; current: 'draft' | 'live' }): 'draft' | 'live' {
  if (goLive) return 'live'
  return takeOffline ? 'draft' : current
}

/** What a discount has on the storefront: its members while it is live, nothing otherwise. */
export function readLiveMembers({ discount }: { discount: Discount | undefined }): DiscountMember[] {
  return discount && discount.status === 'live' ? discount.members : []
}

/** The parts of a discount the form decides (a flash sale or High Demand that is off is left out). */
export function buildDiscountFields({ values }: { values: ParsedDiscount }): Pick<Discount, 'pricingMode' | 'members' | 'tiers' | 'flash' | 'highDemand' | 'style'> {
  return { pricingMode: values.pricingMode, members: values.members, tiers: values.tiers, flash: values.flash ?? undefined, highDemand: values.highDemand || undefined, style: values.style }
}

/** The id of the Shopify discount that stands for the flash sale, if the discount has one. */
export function readRecordId({ discount }: { discount: Discount | undefined }): string | undefined {
  return discount ? discount.flash?.shopifyDiscountId : undefined
}

/** The flash sale of the form with the Shopify discount id it already had, so the same Shopify discount is updated. */
export function keepRecordId({ flash, previousRecordId }: { flash: FlashSale | undefined; previousRecordId: string | undefined }): FlashSale | undefined {
  return flash && previousRecordId ? { ...flash, shopifyDiscountId: previousRecordId } : flash
}

/** A new discount: a draft (live with Go live) whose customer-facing title is its own name. */
export function buildNewDiscount({ values, discountId, tools }: {
  values: ParsedDiscount
  discountId: string
  tools: { pickStatus: typeof pickStatus; buildDiscountFields: typeof buildDiscountFields }
}): Discount {
  return {
    discountId,
    name: values.name,
    title: values.name,
    status: tools.pickStatus({ goLive: values.goLive, takeOffline: values.takeOffline, current: 'draft' }),
    ...tools.buildDiscountFields({ values }),
  }
}

/** An existing discount with what the form decides replaced; its id, its title and its Shopify discount stay. */
export function mergeDiscount({ existing, values, tools }: {
  existing: Discount
  values: ParsedDiscount
  tools: { pickStatus: typeof pickStatus; buildDiscountFields: typeof buildDiscountFields; readRecordId: typeof readRecordId; keepRecordId: typeof keepRecordId }
}): Discount {
  return {
    ...existing,
    name: values.name,
    status: tools.pickStatus({ goLive: values.goLive, takeOffline: values.takeOffline, current: existing.status }),
    ...tools.buildDiscountFields({ values }),
    flash: tools.keepRecordId({ flash: values.flash ?? undefined, previousRecordId: tools.readRecordId({ discount: existing }) }),
  }
}

/** The discounts with `next` in the place of the one that has its id. */
export function replaceDiscount({ discounts, next }: { discounts: Discount[]; next: Discount }): Discount[] {
  const replaced: Discount[] = []
  for (const discount of discounts) replaced.push(discount.discountId === next.discountId ? next : discount)
  return replaced
}

/** The products that were in the discount and are not any more (a product whose variants changed is not removed). */
export function listRemovedProducts({ previousMembers, nextMembers }: { previousMembers: DiscountMember[]; nextMembers: DiscountMember[] }): { productId: string }[] {
  const kept = new Set(nextMembers.map((member) => member.productId))
  const removed: { productId: string }[] = []
  for (const productId of new Set(previousMembers.map((member) => member.productId))) if (!kept.has(productId)) removed.push({ productId })
  return removed
}

export function isWindowChanged({ previous, flash }: { previous: FlashSale | undefined; flash: FlashSale }): boolean {
  return !previous || previous.startsAt !== flash.startsAt || previous.endsAt !== flash.endsAt
}

/**
 * A flash window is checked (not missing, in order, ending in the future) when it is new or moved, or when the
 * discount goes live with it. One that was saved and is left alone is not, so a discount whose sale has ended can
 * still have its other details edited.
 */
export function isWindowCheckNeeded({ previousFlash, values, tools }: {
  previousFlash: FlashSale | undefined
  values: ParsedDiscount
  tools: { isWindowChanged: typeof isWindowChanged }
}): boolean {
  if (!values.flash) return false
  return values.goLive || tools.isWindowChanged({ previous: previousFlash, flash: values.flash })
}

export function describeSaveError({ error }: { error: unknown }): string {
  return error instanceof Error ? error.message : 'The discount could not be saved. Try again.'
}
