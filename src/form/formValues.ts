// What the tier discount form holds, as plain values, and whether it differs from what was saved.
import type { PricingMode } from '@/form/components/ModeToggle'
import type { FlashValues } from '@/form/components/FlashCard'
import type { SelectedMember } from '@/form/memberSelection'
import type { PreviewTier } from '@/form/tierRows'
import type { PreviewProduct } from '@/form/preview/buildPreviewModel'
import type { FlashInput } from '@/form/preview/previewModel'

export interface FormValues {
  name: string
  members: SelectedMember[]
  pricingMode: PricingMode
  /** The complete tiers of the chosen mode. */
  tiers: PreviewTier[]
  flash: FlashValues
}

/** The values reduced to what is saved, in a fixed order, as text: two forms are the same when this is the same. */
export function buildComparable({ values }: { values: FormValues }): string {
  return JSON.stringify({
    name: values.name,
    members: values.members.map((member) => ({ productId: member.productId, variantId: member.variantId })),
    pricingMode: values.pricingMode,
    tiers: values.tiers.map((tier) => ({ minQty: tier.minQty, percentOff: tier.percentOff, fixedPrice: tier.fixedPrice, anchorPrice: tier.anchorPrice })),
    flash: values.flash.enabled ? values.flash : { enabled: false, highDemand: values.flash.highDemand },
  })
}

export function isFormDirty({ initial, current, tools }: {
  initial: FormValues
  current: FormValues
  tools: { buildComparable: typeof buildComparable }
}): boolean {
  return tools.buildComparable({ values: initial }) !== tools.buildComparable({ values: current })
}

/** The products of the preview's list: each chosen product (or variant) with its price and image. */
export function buildPreviewProducts({ members }: { members: SelectedMember[] }): PreviewProduct[] {
  return members.map((member) => ({
    title: member.variantTitle ? `${member.productTitle} (${member.variantTitle})` : member.productTitle,
    price: member.price,
    imageUrl: member.imageUrl,
  }))
}

/** A discount can be saved with a product and a complete tier (the server refuses it otherwise). */
export function canSaveValues({ values }: { values: FormValues }): boolean {
  return values.members.length > 0 && values.tiers.length > 0
}

/** The flash sale as the preview reads it: the window while the switch is on, else none. */
export function buildPreviewFlash({ flash }: { flash: FlashValues }): FlashInput | null {
  return flash.enabled ? { startsAt: flash.startsAt, endsAt: flash.endsAt, showTeaser: flash.showTeaser } : null
}

/** The price the tiers are worked out from: the first product's, or none while no product is chosen. */
export function pickBasePrice({ members }: { members: SelectedMember[] }): number | null {
  return members.length > 0 ? members[0].price : null
}
