import { BackgroundSwatch, CurrentColour } from '@/form/components/ColorSwatch'
import ColourPicker from '@/form/components/ColourPicker'
import { CropSquareIcon, SquareIcon } from '@/form/components/icons'
import { BACKGROUND_COLORS, formatHexColor } from '@/form/designOptions'
import { PRICE_SIZE_RANGE } from '@/lib/widgetStyle'

const LABEL = 'text-form-label-sm text-form-on-surface font-medium'

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
      <div className="flex items-center justify-between">
        <span className={`${LABEL} block`}>Background colour</span>
        <span className="text-form-body-sm text-form-on-surface-variant font-mono">{hex}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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
              className="w-28 h-8 pl-8 pr-2 rounded-lg bg-form-surface-container-low border border-form-outline-variant/60 font-mono text-[12px] text-form-on-surface uppercase focus:outline-none focus:border-form-secondary transition-colors"
            />
          </ColourPicker>
        </div>
      </div>
    </div>
  )
}

export function CornerRadius({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className={`${LABEL} block`}>Round corners</span>
        <span className="font-mono font-medium text-[12px] px-2 py-0.5 rounded bg-form-surface-container text-form-on-surface">{value} px</span>
      </div>
      <div className="flex items-center gap-3">
        <SquareIcon className="text-[18px] text-form-on-surface-variant flex-shrink-0" />
        <input
          type="range"
          aria-label="Round corners"
          min={0}
          max={24}
          step={2}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full h-1.5 bg-form-surface-container rounded-lg appearance-none cursor-pointer accent-form-primary"
        />
        <CropSquareIcon className="text-[18px] text-form-on-surface-variant flex-shrink-0" />
      </div>
    </div>
  )
}

export function PriceSize({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className={`${LABEL} block`}>Price size</span>
        <span className="font-mono font-medium text-[12px] px-2 py-0.5 rounded bg-form-surface-container text-form-on-surface">{value} px</span>
      </div>
      {/* As tall as the Round corners row beside it (its icons are 18px), so the two sliders line up. */}
      <div className="flex items-center h-[18px]">
        <input
          type="range"
          aria-label="Price size"
          min={PRICE_SIZE_RANGE.min}
          max={PRICE_SIZE_RANGE.max}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full h-1.5 bg-form-surface-container rounded-lg appearance-none cursor-pointer accent-form-primary"
        />
      </div>
    </div>
  )
}
