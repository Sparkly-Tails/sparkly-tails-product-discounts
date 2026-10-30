'use client'

import { useState } from 'react'
import { BackgroundColors, CornerRadius, ThemeColors } from '@/form/components/DesignControls'
import { ExpandLessIcon, ExpandMoreIcon, PaletteIcon } from '@/form/components/icons'
import { DEFAULT_BACKGROUND_HEX, DEFAULT_CORNER_RADIUS, DEFAULT_THEME_HEX, isHexColor } from '@/form/designOptions'

// The "Design" card: colour theme, background colour and round corners for the
// storefront widget. Only the controls for now: nothing is saved, sent with
// the form or shown in the preview, so no field has a name.
export default function DesignCard() {
  const [isOpen, setIsOpen] = useState(true)
  const [themeHex, setThemeHex] = useState(DEFAULT_THEME_HEX)
  const [backgroundHex, setBackgroundHex] = useState(DEFAULT_BACKGROUND_HEX)
  const [backgroundText, setBackgroundText] = useState(DEFAULT_BACKGROUND_HEX)
  const [cornerRadius, setCornerRadius] = useState(DEFAULT_CORNER_RADIUS)

  function updateBackgroundText(text: string) {
    setBackgroundText(text)
    if (isHexColor({ text })) setBackgroundHex(text)
  }

  function pickBackground(hex: string) {
    setBackgroundText(hex)
    setBackgroundHex(hex)
  }

  return (
    <div className="bg-form-surface-container-lowest rounded-lg shadow-xs border border-form-outline-variant/20 overflow-hidden">
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
          <ThemeColors hex={themeHex} onChange={setThemeHex} />
          <BackgroundColors hex={backgroundHex} text={backgroundText} onTextChange={updateBackgroundText} onPick={pickBackground} />
          <CornerRadius value={cornerRadius} onChange={setCornerRadius} />
        </div>
      </div>
    </div>
  )
}
