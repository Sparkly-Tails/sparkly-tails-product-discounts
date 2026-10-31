import { BackgroundSwatch, ThemeSwatch } from '@/form/components/ColorSwatch'
import { ColorizeIcon, CropSquareIcon, SquareIcon } from '@/form/components/icons'
import { BACKGROUND_COLORS, THEME_COLORS, formatHexColor } from '@/form/designOptions'
import { PRICE_SIZE_RANGE } from '@/lib/widgetStyle'

const LABEL = 'text-form-label-sm text-form-on-surface font-medium'

export function ThemeColors({ hex, onChange }: { hex: string; onChange: (hex: string) => void }) {
  return (
    <div className="space-y-3">
      <span className={`${LABEL} block`}>Color theme</span>
      <div className="flex items-center gap-2 flex-wrap">
        {THEME_COLORS.map((color) => (
          <ThemeSwatch key={color.hex} label={color.label} hex={color.hex} isSelected={color.hex === hex} onSelect={() => onChange(color.hex)} />
        ))}
      </div>
    </div>
  )
}

// The background colour: swatches and a box to type a code. `text` is what the
// box holds, `hex` the last whole colour (the label and the chosen swatch).
export function BackgroundColors({ hex, text, onTextChange, onPick }: {
  hex: string
  text: string
  onTextChange: (text: string) => void
  onPick: (hex: string) => void
}) {
  return (
    <div className="pt-2 space-y-3 border-t border-form-outline-variant/20">
      <div className="flex items-center justify-between">
        <span className={`${LABEL} block`}>Secondary background color</span>
        <span className="text-form-body-sm text-form-on-surface-variant font-mono">{hex}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {BACKGROUND_COLORS.map((color) => (
          <BackgroundSwatch key={color.hex} label={color.label} hex={color.hex} edgeClass={color.edgeClass} isSelected={color.hex === hex} onSelect={() => onPick(color.hex)} />
        ))}
        <div className="flex items-center gap-1.5 pl-1">
          <div className="relative flex items-center">
            <ColorizeIcon className="absolute left-2 text-[16px] text-form-on-surface-variant" />
            <input
              type="text"
              aria-label="Background color code"
              maxLength={7}
              value={text}
              onChange={(event) => onTextChange(formatHexColor({ text: event.target.value }))}
              className="w-24 h-8 pl-7 pr-2 rounded-lg bg-form-surface-container-low border border-form-outline-variant/60 font-mono text-[12px] text-form-on-surface uppercase focus:outline-none focus:border-form-secondary transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function CornerRadius({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="pt-2 space-y-2.5 border-t border-form-outline-variant/20">
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
    <div className="pt-2 space-y-2.5 border-t border-form-outline-variant/20">
      <div className="flex items-center justify-between">
        <span className={`${LABEL} block`}>Price size</span>
        <span className="font-mono font-medium text-[12px] px-2 py-0.5 rounded bg-form-surface-container text-form-on-surface">{value} px</span>
      </div>
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
  )
}
