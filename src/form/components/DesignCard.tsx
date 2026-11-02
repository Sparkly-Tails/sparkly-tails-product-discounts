import { useState } from 'react'
import { BackgroundColors, CornerRadius } from '@/form/components/DesignControls'
import { ExpandLessIcon, ExpandMoreIcon, PaletteIcon } from '@/form/components/icons'
import { isHexColor } from '@/form/designOptions'
import type { WidgetStyle } from '@/lib/widgetStyle'

// The "Design" card: background colour and round corners of this discount's
// storefront widget. The form holds the two values (`style`) and hears every change;
// they travel with the form in two hidden fields and paint the preview.
export default function DesignCard({ style, onChange }: { style: WidgetStyle; onChange: (style: WidgetStyle) => void }) {
  const [isOpen, setIsOpen] = useState(true)
  const [backgroundText, setBackgroundText] = useState(style.backgroundColor)

  function updateBackgroundText(text: string) {
    setBackgroundText(text)
    if (isHexColor({ text })) onChange({ ...style, backgroundColor: text })
  }

  function pickBackground(hex: string) {
    setBackgroundText(hex)
    onChange({ ...style, backgroundColor: hex })
  }

  return (
    <div className="bg-form-surface-container-lowest rounded-lg shadow-xs border border-form-outline-variant/20">
      <input type="hidden" name="style-backgroundColor" value={style.backgroundColor} />
      <input type="hidden" name="style-cornerRadius" value={style.cornerRadius} />
      <div className="p-form-lg space-y-form-md">
        {/* The whole row opens and closes the card; the title is the button, so keys and screen readers can too. */}
        <div onClick={() => setIsOpen(!isOpen)} className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2.5">
            <PaletteIcon className="text-[20px] text-form-secondary" />
            <div>
              <h2 className="text-form-headline-sm text-form-on-surface">
                <button type="button" aria-expanded={isOpen} className="text-left cursor-pointer">Design</button>
              </h2>
              <p className="text-form-body-sm text-form-on-surface-variant">Card styling and color palettes for the storefront widget</p>
            </div>
          </div>
          {isOpen ? <ExpandLessIcon className="text-[20px] text-form-on-surface-variant" /> : <ExpandMoreIcon className="text-[20px] text-form-on-surface-variant" />}
        </div>
        <div hidden={!isOpen} className="pt-2 space-y-3">
          <BackgroundColors hex={style.backgroundColor} text={backgroundText} onTextChange={updateBackgroundText} onPick={pickBackground} />
          <div className="pt-3 border-t border-form-outline-variant/20">
            <CornerRadius value={style.cornerRadius} onChange={(cornerRadius) => onChange({ ...style, cornerRadius })} />
          </div>
        </div>
      </div>
    </div>
  )
}
