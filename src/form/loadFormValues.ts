// Fills the tier discount form from a saved discount (the Edit page).
import type { FlashValues } from '@/form/components/FlashCard'
import type { TiersInitial } from '@/form/components/TiersCard'
import type { FormValues } from '@/form/formValues'
import type { SelectedMember } from '@/form/memberSelection'
import type { Discount } from '@/lib/config'
import type { MemberInfo } from '@/lib/products'
import { DEFAULT_WIDGET_STYLE } from '@/lib/widgetStyle'

const NO_FLASH: FlashValues = { enabled: false, startsAt: '', endsAt: '', showTeaser: true, highDemand: false }

/** The chosen products and variants, with the titles, price and image the rows and the preview show. */
export function buildSelectedMembers({ memberInfo }: { memberInfo: MemberInfo[] }): SelectedMember[] {
  return memberInfo.map((member) => ({
    productId: member.productId,
    variantId: member.variantId,
    productTitle: member.productTitle,
    variantTitle: member.variantTitle,
    price: member.price,
    imageUrl: member.imageUrl,
  }))
}

/** The flash sale card: the saved window while it is a flash sale (off otherwise), and High Demand either way. */
export function buildFlashValues({ discount }: { discount: Discount }): FlashValues {
  const flash = discount.flash
  const highDemand = discount.highDemand === true
  return flash
    ? { enabled: true, startsAt: flash.startsAt, endsAt: flash.endsAt, showTeaser: flash.showTeaser, highDemand }
    : { ...NO_FLASH, highDemand }
}

/** The tiers card: the saved tiers in the mode they were saved in, the other mode empty. */
export function buildTiersInitial({ discount }: { discount: Discount }): TiersInitial {
  const isFixed = discount.pricingMode === 'fixed'
  return {
    mode: discount.pricingMode,
    percentTiers: isFixed ? [] : discount.tiers.map((tier) => ({ minQty: tier.minQty, percentOff: tier.percentOff ?? 0, anchorPrice: tier.anchorPrice })),
    fixedTiers: isFixed ? discount.tiers.map((tier) => ({ minQty: tier.minQty, fixedPrice: tier.fixedPrice ?? 0 })) : [],
  }
}

export function buildFormValues({ discount, memberInfo, tools }: {
  discount: Discount
  memberInfo: MemberInfo[]
  tools: { buildSelectedMembers: typeof buildSelectedMembers; buildFlashValues: typeof buildFlashValues; buildTiersInitial: typeof buildTiersInitial }
}): { values: FormValues; initialTiers: TiersInitial } {
  return {
    values: {
      name: discount.name,
      members: tools.buildSelectedMembers({ memberInfo }),
      pricingMode: discount.pricingMode,
      tiers: discount.tiers,
      flash: tools.buildFlashValues({ discount }),
      style: discount.style ?? DEFAULT_WIDGET_STYLE,
    },
    initialTiers: tools.buildTiersInitial({ discount }),
  }
}
