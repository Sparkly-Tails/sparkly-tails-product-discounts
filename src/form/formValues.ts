// What the tier discount form holds, as plain values, and whether it differs from what was saved.
import type { PricingMode } from '@/form/components/ModeToggle'
import type { FlashValues } from '@/form/components/FlashCard'
import type { SelectedMember } from '@/form/memberSelection'
import type { PreviewTier } from '@/form/tierRows'
import type { PreviewProduct } from '@/form/preview/buildPreviewModel'

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
