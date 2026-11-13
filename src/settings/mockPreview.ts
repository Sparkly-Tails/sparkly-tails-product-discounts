// The sample data of the Settings page's previews: 3 products and 3 tiers, so the colours can be judged together.
import type { PreviewProduct } from '@/form/preview/buildPreviewModel'
import type { FlashInput } from '@/form/preview/previewModel'
import type { PreviewTier } from '@/form/tierRows'

export function buildMockPreview(): { products: PreviewProduct[]; tiers: PreviewTier[] } {
  return {
    products: [
      { title: 'Dog harness', price: 24, imageUrl: null },
      { title: 'Chew toy', price: 18, imageUrl: null },
      { title: 'Travel bowl', price: 12, imageUrl: null },
    ],
    tiers: [
      { minQty: 2, percentOff: 10 },
      { minQty: 3, percentOff: 15 },
      { minQty: 4, percentOff: 20 },
    ],
  }
}

const HOUR_SECONDS = 3600

/** `YYYY-MM-DDTHH:mm` in UTC, the shape of the form's date fields. */
function formatWallClock({ seconds }: { seconds: number }): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16)
}

export const MOCK_FLASH_TOOLS = { formatWallClock }

/** A flash sale that began an hour ago and ends in two, for the "Preview flash sale countdown" checkbox (the preview reads it as UTC). */
export function buildMockFlash({ nowSeconds, tools = MOCK_FLASH_TOOLS }: { nowSeconds: number; tools?: typeof MOCK_FLASH_TOOLS }): FlashInput {
  return {
    startsAt: tools.formatWallClock({ seconds: nowSeconds - HOUR_SECONDS }),
    endsAt: tools.formatWallClock({ seconds: nowSeconds + 2 * HOUR_SECONDS }),
    showTeaser: false,
  }
}
