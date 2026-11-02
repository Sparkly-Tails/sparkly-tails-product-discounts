import { CheckIcon } from '@/form/components/icons'

const BACKGROUND_CHOSEN = 'border-2 border-form-primary ring-2 ring-form-secondary/30 text-form-primary'
const BACKGROUND_IDLE = 'border hover:scale-105 transition-transform'
const DEFAULT_EDGE = 'border-form-outline-variant/40'

// A checkerboard to lay a colour over, so how transparent it is can be seen.
export const CHECKERBOARD = 'linear-gradient(45deg, #d1d5db 25%, transparent 25%, transparent 75%, #d1d5db 75%), linear-gradient(45deg, #d1d5db 25%, #ffffff 25%, #ffffff 75%, #d1d5db 75%)'

interface SwatchProps {
  label: string
  hex: string
  isSelected: boolean
  onSelect: () => void
}

// A round colour button. The chosen one has a ring and a check mark.
function SwatchButton({ label, hex, className, isSelected, onSelect }: SwatchProps & { className: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isSelected}
      onClick={onSelect}
      style={{ backgroundColor: hex }}
      className={`w-8 h-8 rounded-full flex items-center justify-center ${className}`}
    >
      {isSelected ? <CheckIcon className="text-[16px]" /> : null}
    </button>
  )
}

/** `edgeClass` is the outline of the swatch when it is not chosen, for the one swatch whose outline differs. */
export function BackgroundSwatch(props: SwatchProps & { edgeClass?: string }) {
  return <SwatchButton {...props} className={props.isSelected ? BACKGROUND_CHOSEN : `${BACKGROUND_IDLE} ${props.edgeClass ?? DEFAULT_EDGE}`} />
}

/** The colour in use, as the first circle of the row: laid over a checkerboard, so any transparency shows. */
export function CurrentColour({ hex }: { hex: string }) {
  return (
    <span
      role="img"
      aria-label={`Current colour ${hex}`}
      className="relative w-8 h-8 rounded-full flex-shrink-0 overflow-hidden border-2 border-form-primary ring-2 ring-form-secondary/30"
      style={{ backgroundImage: CHECKERBOARD, backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}
    >
      <span data-colour="" className="absolute inset-0" style={{ backgroundColor: hex }} />
    </span>
  )
}
