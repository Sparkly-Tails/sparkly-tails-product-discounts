import { useState } from 'react'
import Card from '@/form/components/Card'
import { BackgroundColors, CornerRadius } from '@/form/components/DesignControls'
import { PaletteIcon } from '@/form/components/icons'
import { isHexColor } from '@/form/designOptions'
import AccentColors from '@/settings/components/AccentColors'
import FlashToneField from '@/settings/components/FlashToneField'
import type { FlashTone } from '@/settings/design'

// The "Storefront Appearance & Theme" panel: the accent colour, the widget's background, the flash bar tone and the
// corner roundness, for the whole store. The page holds the values and hears every change (field name and new value).
export default function AppearancePanel({ accentColor, backgroundColor, cornerRadius, flashTone, onChange }: {
  accentColor: string
  backgroundColor: string
  cornerRadius: number
  flashTone: FlashTone
  onChange: (field: string, value: string | number) => void
}) {
  const [backgroundText, setBackgroundText] = useState(backgroundColor)

  function updateBackgroundText(text: string) {
    setBackgroundText(text)
    if (isHexColor({ text })) onChange('backgroundColor', text)
  }

  function pickBackground(hex: string) {
    setBackgroundText(hex)
    onChange('backgroundColor', hex)
  }

  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <PaletteIcon className="text-[20px] text-form-secondary" />
        <div>
          <h2 className="text-form-headline-sm text-form-on-surface">Storefront Appearance &amp; Theme</h2>
          <p className="text-form-body-sm text-form-on-surface-variant">One look for the product-page widget and the pre-checkout pop-up</p>
        </div>
      </div>
      <div className="space-y-6">
        <AccentColors hex={accentColor} onPick={(hex) => onChange('accentColor', hex)} />
        <BackgroundColors hex={backgroundColor} text={backgroundText} onTextChange={updateBackgroundText} onPick={pickBackground} />
        <FlashToneField value={flashTone} onChange={(tone) => onChange('flashTone', tone)} />
        <CornerRadius value={cornerRadius} onChange={(radius) => onChange('cornerRadius', radius)} />
      </div>
    </Card>
  )
}
