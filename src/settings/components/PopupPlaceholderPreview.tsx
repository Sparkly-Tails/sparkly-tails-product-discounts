import type { CSSProperties } from 'react'
import { CloseIcon } from '@/form/components/icons'
import { buildDesignVars, FLASH_TONE_COLOURS, type FlashTone } from '@/settings/design'
import { parseStyleText } from '@/settings/styleVars'

const BLOCK = 'bg-[color:var(--smooth-discounts-moss)] opacity-20'
const RADIUS = 'var(--smooth-discounts-radius)'

// A grey block of the pop-up. Each is a placeholder: the real pop-up is too big to show here, so only its parts are drawn.
function Block({ className }: { className: string }) {
  return <div data-placeholder="" aria-hidden="true" className={className} />
}

// The pop-up's rail: three round steps joined by a line, in the accent colour.
function RailPlaceholder() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center flex-1 last:flex-none gap-1">
          <div data-placeholder="" aria-hidden="true" className="h-4 w-4 rounded-full" style={{ background: 'var(--smooth-discounts-moss)', opacity: index === 0 ? 1 : 0.3 }} />
          {index < 2 ? <Block className={`${BLOCK} h-0.5 flex-1`} /> : null}
        </div>
      ))}
    </div>
  )
}

// The pre-checkout pop-up as a wireframe (header with its close button, the flash bar, tier pills, the rail, an item
// row and two buttons), painted with the design being edited, so the accent, the background, the flash tone and the
// corners can be judged together. No real pop-up content and no scripts.
export default function PopupPlaceholderPreview({ accentColor, backgroundColor, cornerRadius, flashTone }: {
  accentColor: string
  backgroundColor: string
  cornerRadius: number
  flashTone: FlashTone
}) {
  const vars = parseStyleText({ text: buildDesignVars({ accentColor, backgroundColor, cornerRadius, flashTone }) }) as CSSProperties
  return (
    <div style={vars} className="bg-form-surface-container rounded-2xl p-form-md space-y-form-sm shadow-inner">
      <div className="flex items-center justify-between gap-form-sm">
        <h2 className="text-form-label-md text-form-on-surface font-medium">Pre-checkout pop-up</h2>
        <span className="px-2 py-0.5 rounded-full bg-form-surface-container-lowest text-[11px] text-form-on-surface-variant font-medium">Wireframe preview</span>
      </div>
      <div className="p-4 space-y-3 shadow-lg" style={{ background: 'var(--smooth-discounts-cream)', borderRadius: `calc(${RADIUS} * 1.5)` }}>
        <div className="flex items-center justify-between gap-3">
          <Block className={`${BLOCK} h-4 w-2/3`} />
          <span aria-hidden="true" className="w-6 h-6 rounded-full flex items-center justify-center bg-[color:var(--smooth-discounts-moss)]/10"><CloseIcon className="text-[14px]" /></span>
        </div>
        <div data-placeholder="" aria-hidden="true" className="h-7 w-full" style={{ background: FLASH_TONE_COLOURS[flashTone], borderRadius: `calc(${RADIUS} * 0.75)` }} />
        <div className="flex gap-2">
          {[0, 1, 2].map((index) => <Block key={index} className={`${BLOCK} h-8 flex-1 rounded-full`} />)}
        </div>
        <RailPlaceholder />
        <div className="flex items-center gap-3">
          <Block className={`${BLOCK} h-10 w-10`} />
          <Block className={`${BLOCK} h-3 flex-1`} />
        </div>
        <div className="flex gap-2 pt-1">
          <div data-placeholder="" aria-hidden="true" className="h-9 flex-1" style={{ background: 'var(--smooth-discounts-moss)', borderRadius: RADIUS }} />
          <Block className={`${BLOCK} h-9 w-1/3`} />
        </div>
      </div>
    </div>
  )
}
