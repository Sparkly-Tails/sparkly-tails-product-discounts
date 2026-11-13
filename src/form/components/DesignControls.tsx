import { BackgroundSwatch, CurrentColour } from '@/form/components/ColorSwatch'
import ColourPicker from '@/form/components/ColourPicker'
import { BACKGROUND_COLORS, formatHexColor } from '@/form/designOptions'

const LABEL = 'text-form-label-md text-form-on-surface font-medium'
const HELP = 'text-form-body-sm text-form-on-surface-variant'
const CODE_BOX = 'h-9 pr-3 rounded-full bg-form-surface-container-low border border-form-outline-variant/40 font-mono text-[12px] text-form-on-surface uppercase focus:outline-none focus:border-form-secondary transition-colors'

// The background colour: swatches, a box to type a code and the colour picker the icon in it opens.
// `text` is what the box holds, `hex` the last whole colour (the label and the chosen swatch).
export function BackgroundColors({ hex, text, onTextChange, onPick }: {
  hex: string
  text: string
  onTextChange: (text: string) => void
  onPick: (hex: string) => void
}) {
  return (
    <div className="relative space-y-3">
      <div>
        <span className={`${LABEL} block`}>Background colour</span>
        <p className={HELP}>The surface tone behind the widget and the pop-up.</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <CurrentColour hex={hex} />
        {BACKGROUND_COLORS.map((color) => (
          <BackgroundSwatch key={color.hex} label={color.label} hex={color.hex} edgeClass={color.edgeClass} isSelected={color.hex === hex} onSelect={() => onPick(color.hex)} />
        ))}
        <div className="pl-1">
          <ColourPicker hex={hex} onChange={onPick}>
            <input
              type="text"
              aria-label="Background colour code"
              maxLength={9}
              value={text}
              onChange={(event) => onTextChange(formatHexColor({ text: event.target.value }))}
              className={`w-32 pl-9 ${CODE_BOX}`}
            />
          </ColourPicker>
        </div>
      </div>
    </div>
  )
}

export function CornerRadius({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`${LABEL} block`}>Corner roundness</span>
          <p className={HELP}>How round the corners of cards, buttons and the pop-up are.</p>
        </div>
        <span className="font-mono font-medium text-[12px] px-2.5 py-1 rounded-full bg-form-surface-container text-form-on-surface whitespace-nowrap">{value} px</span>
      </div>
      <div className="bg-form-surface-container-low rounded-2xl p-4 space-y-2">
        <input
          type="range"
          aria-label="Corner roundness"
          min={0}
          max={24}
          step={2}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full h-1.5 bg-form-surface-container rounded-lg appearance-none cursor-pointer accent-form-primary"
        />
        <div className={`flex justify-between gap-2 font-mono text-[11px] ${HELP}`}>
          <span>0px (Sharp modern)</span>
          <span>12px (Smooth default)</span>
          <span>24px (Soft pill)</span>
        </div>
      </div>
    </div>
  )
}
