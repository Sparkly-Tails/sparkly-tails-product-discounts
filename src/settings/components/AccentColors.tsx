import { useState } from 'react'
import { BackgroundSwatch, CurrentColour } from '@/form/components/ColorSwatch'
import { formatHexColor } from '@/form/designOptions'
import { ACCENT_COLORS, isSolidHexColor } from '@/settings/accentOptions'

// The accent colour: swatches and a box to type a code. The box is only passed on once it is a whole solid colour.
export default function AccentColors({ hex, onPick }: { hex: string; onPick: (hex: string) => void }) {
  const [text, setText] = useState(hex)

  function updateText(next: string) {
    setText(next)
    if (isSolidHexColor({ text: next })) onPick(next)
  }

  function pickSwatch(next: string) {
    setText(next)
    onPick(next)
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-form-label-md text-form-on-surface font-medium block">Accent colour</span>
        <p className="text-form-body-sm text-form-on-surface-variant">The main colour of buttons, highlights and the progress rail.</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <CurrentColour hex={hex} />
        {ACCENT_COLORS.map((color) => (
          <BackgroundSwatch key={color.hex} label={color.label} hex={color.hex} isSelected={color.hex === hex} onSelect={() => pickSwatch(color.hex)} />
        ))}
        <input
          type="text"
          aria-label="Accent colour code"
          maxLength={7}
          value={text}
          onChange={(event) => updateText(formatHexColor({ text: event.target.value }))}
          className="w-28 h-9 px-3 rounded-full bg-form-surface-container-low border border-form-outline-variant/40 font-mono text-[12px] text-form-on-surface uppercase focus:outline-none focus:border-form-secondary transition-colors"
        />
      </div>
    </div>
  )
}
