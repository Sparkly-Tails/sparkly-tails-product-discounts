'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BackgroundSwatch, CHECKERBOARD } from '@/form/components/ColorSwatch'
import { ColorizeIcon } from '@/form/components/icons'
import { joinColour, splitColour } from '@/form/colour'
import { BACKGROUND_COLORS, PALETTE_COLORS } from '@/form/designOptions'

const PRESETS = [...BACKGROUND_COLORS, ...PALETTE_COLORS]
const LABEL = 'text-form-label-sm text-form-on-surface font-medium'
const NUMBER_BOX = 'w-14 h-8 px-2 rounded-lg bg-form-surface-container-low border border-form-outline-variant/60 font-mono text-[12px] text-form-on-surface text-right focus:outline-none focus:border-form-secondary'

// One part of the colour: a slider and a box that hold the same number.
function ChannelField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`${LABEL} w-24 flex-shrink-0`}>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 min-w-0 h-1.5 bg-form-surface-container rounded-lg appearance-none cursor-pointer accent-form-primary"
      />
      <input type="number" aria-label={`${label} value`} min={0} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className={NUMBER_BOX} />
    </div>
  )
}

// The colour picker icon, and the panel it opens: a selection of colours, the red, green and blue of the
// colour, and how transparent it is. `children` is the code box the icon sits in, so pressing it keeps the panel open.
// It needs a positioned section around it (the Background colour group): the panel opens below that section,
// 60% of its width.
// The colour is a code: #RRGGBB while solid, #RRGGBBAA once it is partly transparent.
export default function ColourPicker({ hex, onChange, children }: { hex: string; onChange: (hex: string) => void; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const parts = splitColour({ hex })

  useEffect(() => {
    if (!isOpen) return
    function closeOnOutsidePress(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsidePress)
    return () => document.removeEventListener('mousedown', closeOnOutsidePress)
  }, [isOpen])

  function updatePart(change: Partial<typeof parts>) {
    onChange(joinColour({ ...parts, ...change }))
  }

  // A colour from the selection keeps the transparency the colour had.
  function choosePreset(presetHex: string) {
    updatePart({ ...splitColour({ hex: presetHex }), alpha: parts.alpha })
  }

  return (
    // `contents`: the wrapper takes no space, so the panel is placed against the section around the picker (full width, just below it).
    <div ref={rootRef} className="contents" onKeyDown={(event) => { if (event.key === 'Escape') setIsOpen(false) }}>
      <div className="relative">
        {children}
        <button
          type="button"
          aria-label="Open colour picker"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute left-1 top-1 w-6 h-6 flex items-center justify-center rounded text-form-on-surface-variant hover:text-form-on-surface cursor-pointer"
        >
          <ColorizeIcon className="text-[16px]" />
        </button>
      </div>
      {isOpen ? (
        <div role="dialog" aria-label="Colour picker" className="absolute left-0 top-full mt-2 z-20 w-3/5 min-w-[16rem] p-3 space-y-3 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/40 shadow-lg">
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((color) => (
              <BackgroundSwatch key={color.hex} label={color.label} hex={color.hex} edgeClass={color.edgeClass} isSelected={color.hex === hex} onSelect={() => choosePreset(color.hex)} />
            ))}
          </div>
          <div aria-hidden="true" className="h-8 rounded-md border border-form-outline-variant/40" style={{ backgroundImage: CHECKERBOARD, backgroundSize: '12px 12px', backgroundPosition: '0 0, 6px 6px' }}>
            <div className="h-full rounded-md" style={{ backgroundColor: hex }} />
          </div>
          <div className="space-y-2">
            <ChannelField label="Red" value={parts.red} max={255} onChange={(red) => updatePart({ red })} />
            <ChannelField label="Green" value={parts.green} max={255} onChange={(green) => updatePart({ green })} />
            <ChannelField label="Blue" value={parts.blue} max={255} onChange={(blue) => updatePart({ blue })} />
            <ChannelField label="Transparency" value={parts.alpha} max={100} onChange={(alpha) => updatePart({ alpha })} />
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setIsOpen(false)} className="h-8 px-3 rounded-lg bg-form-primary text-form-on-primary text-form-label-sm font-medium cursor-pointer">Done</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
