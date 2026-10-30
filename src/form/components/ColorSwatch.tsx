import { CheckIcon } from '@/form/components/icons'

const THEME_CHOSEN = 'border-2 border-form-surface-container-lowest ring-2 ring-form-secondary text-white'
const THEME_IDLE = 'border-2 border-transparent hover:scale-105 transition-transform'
const BACKGROUND_CHOSEN = 'border-2 border-form-primary ring-2 ring-form-secondary/30 text-form-primary'
const BACKGROUND_IDLE = 'border hover:scale-105 transition-transform'
const DEFAULT_EDGE = 'border-form-outline-variant/40'

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

export function ThemeSwatch(props: SwatchProps) {
  return <SwatchButton {...props} className={props.isSelected ? THEME_CHOSEN : THEME_IDLE} />
}

/** `edgeClass` is the outline of the swatch when it is not chosen, for the one swatch whose outline differs. */
export function BackgroundSwatch(props: SwatchProps & { edgeClass?: string }) {
  return <SwatchButton {...props} className={props.isSelected ? BACKGROUND_CHOSEN : `${BACKGROUND_IDLE} ${props.edgeClass ?? DEFAULT_EDGE}`} />
}
