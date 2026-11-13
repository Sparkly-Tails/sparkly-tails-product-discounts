import type { CSSProperties } from 'react'
import { buildDesignVars, FLASH_TONE_COLOURS, type FlashTone } from '@/settings/design'
import { parseStyleText } from '@/settings/styleVars'

const BLOCK = 'bg-[color:var(--smooth-discounts-moss)] opacity-20'

// A grey block of the pop-up. Each is a placeholder: the real pop-up is too big to show here, so only its parts are drawn.
function Block({ className }: { className: string }) {
  return <div data-placeholder="" aria-hidden="true" className={className} />
}

// The pre-checkout pop-up as placeholder blocks only (title, tier chips, rail, an item row, two buttons), painted with
// the design being edited, so the accent, the background, the flash tone and the corners can be judged together.
// No real pop-up content and no scripts.
export default function PopupPlaceholderPreview({ accentColor, backgroundColor, cornerRadius, flashTone }: {
  accentColor: string
  backgroundColor: string
  cornerRadius: number
  flashTone: FlashTone
}) {
  const vars = parseStyleText({ text: buildDesignVars({ accentColor, backgroundColor, cornerRadius, flashTone }) }) as CSSProperties
  const radius = 'var(--smooth-discounts-radius)'
  return (
    <div style={vars} className="bg-form-surface-container-lowest rounded-xl shadow-lg border border-form-outline-variant/30 p-form-lg space-y-form-md">
      <h2 className="text-form-headline-sm text-form-on-surface">Pre-checkout pop-up</h2>
      <div className="p-4 space-y-3" style={{ background: 'var(--smooth-discounts-cream)', borderRadius: `calc(${radius} * 1.5)` }}>
        <Block className={`${BLOCK} h-4 w-2/3`} />
        <div className="flex gap-2">
          {[0, 1, 2].map((index) => <Block key={index} className={`${BLOCK} h-8 flex-1`} />)}
        </div>
        <Block className={`${BLOCK} h-2 w-full rounded-full`} />
        <div data-placeholder="" aria-hidden="true" className="h-7 w-full" style={{ background: FLASH_TONE_COLOURS[flashTone], borderRadius: `calc(${radius} * 0.75)` }} />
        <div className="flex items-center gap-3">
          <Block className={`${BLOCK} h-10 w-10`} />
          <Block className={`${BLOCK} h-3 flex-1`} />
        </div>
        <div className="flex gap-2 pt-1">
          <div data-placeholder="" aria-hidden="true" className="h-9 flex-1" style={{ background: 'var(--smooth-discounts-moss)', borderRadius: radius }} />
          <Block className={`${BLOCK} h-9 w-1/3`} />
        </div>
      </div>
    </div>
  )
}
