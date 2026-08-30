'use client'

import PricingModeTierFields from '@/components/PricingModeTierFields'

export default function PricingModeTierFieldsClient({
  currentPricingMode,
  allowPriceBasedModes,
  percentTiers,
  fixedTiers,
}: {
  currentPricingMode: 'percent' | 'fixed'
  allowPriceBasedModes: boolean
  percentTiers: { minQty: number; percentOff: number; anchorPrice?: number }[]
  fixedTiers: { minQty: number; fixedPrice: number }[]
}) {
  return (
    <PricingModeTierFields
      allowPriceBasedModes={allowPriceBasedModes}
      initial={{ percentTiers, fixedTiers, startMode: currentPricingMode }}
    />
  )
}
