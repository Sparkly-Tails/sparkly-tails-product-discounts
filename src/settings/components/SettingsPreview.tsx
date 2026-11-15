'use client'

import { useState } from 'react'
import PopupPlaceholderPreview from '@/settings/components/PopupPlaceholderPreview'
import PreviewTabs, { type PreviewKind } from '@/settings/components/PreviewTabs'
import SettingsWidgetPreview from '@/settings/components/SettingsWidgetPreview'
import type { FlashTone } from '@/settings/design'

// The preview column of Settings: a switch between the storefront widget and the pre-checkout pop-up, so only one
// is on show and the column stays short enough to stay in view next to the design settings. Both stay on the page
// (the one not shown is hidden), so the widget keeps its product and quantity while the pop-up is looked at.
export default function SettingsPreview({ accentColor, backgroundColor, cornerRadius, flashTone, isFlashShown, onFlashShownChange, currencyCode, initialNowSeconds }: {
  accentColor: string
  backgroundColor: string
  cornerRadius: number
  flashTone: FlashTone
  isFlashShown: boolean
  onFlashShownChange: (isShown: boolean) => void
  currencyCode: string
  initialNowSeconds: number
}) {
  const [kind, setKind] = useState<PreviewKind>('widget')
  return (
    <div className="space-y-form-md">
      <PreviewTabs selected={kind} onSelect={setKind} />
      <div role="tabpanel" id="preview-panel-widget" aria-labelledby="preview-tab-widget" hidden={kind !== 'widget'}>
        <SettingsWidgetPreview
          accentColor={accentColor}
          backgroundColor={backgroundColor}
          cornerRadius={cornerRadius}
          flashTone={flashTone}
          isFlashShown={isFlashShown}
          onFlashShownChange={onFlashShownChange}
          currencyCode={currencyCode}
          initialNowSeconds={initialNowSeconds}
        />
      </div>
      <div role="tabpanel" id="preview-panel-popup" aria-labelledby="preview-tab-popup" hidden={kind !== 'popup'}>
        <PopupPlaceholderPreview accentColor={accentColor} backgroundColor={backgroundColor} cornerRadius={cornerRadius} flashTone={flashTone} />
      </div>
    </div>
  )
}
