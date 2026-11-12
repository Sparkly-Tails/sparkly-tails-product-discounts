import CheckboxField from '@/form/components/CheckboxField'
import WidgetPreview from '@/form/preview/components/WidgetPreview'
import { buildMockFlash, buildMockPreview } from '@/settings/mockPreview'
import { FLASH_TONE_COLOURS, type FlashTone } from '@/settings/design'

// The widget with sample data (3 products, 3 tiers), painted with the design being edited, and the design's
// "Preview flash sale countdown" checkbox. Nothing here is saved: it is only for judging the colours.
export default function SettingsWidgetPreview({ accentColor, backgroundColor, cornerRadius, flashTone, isFlashShown, onFlashShownChange, currencyCode, initialNowSeconds }: {
  accentColor: string
  backgroundColor: string
  cornerRadius: number
  flashTone: FlashTone
  isFlashShown: boolean
  onFlashShownChange: (isShown: boolean) => void
  currencyCode: string
  initialNowSeconds: number
}) {
  const { products, tiers } = buildMockPreview()
  return (
    <div className="space-y-form-sm">
      <WidgetPreview
        products={products}
        tiers={tiers}
        flash={isFlashShown ? buildMockFlash({ nowSeconds: initialNowSeconds }) : null}
        highDemand={false}
        style={{ backgroundColor, cornerRadius, accentColor, flashColor: FLASH_TONE_COLOURS[flashTone] }}
        timeZone="UTC"
        currencyCode={currencyCode}
        initialNowSeconds={initialNowSeconds}
      />
      <CheckboxField name="previewFlash" label="Preview flash sale countdown" checked={isFlashShown} onChange={onFlashShownChange} />
    </div>
  )
}
