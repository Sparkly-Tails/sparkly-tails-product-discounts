import { BoltIcon } from '@/form/components/icons'
import { FLASH_TONE_COLOURS, type FlashTone } from '@/settings/design'

const TONES: { value: FlashTone; label: string }[] = [
  { value: 'olive-night', label: 'Olive Night' },
  { value: 'pure-onyx', label: 'Pure Onyx' },
  { value: 'deep-pine', label: 'Deep Pine' },
]

// One tone: a dark pill in the tone's own colour with the bolt of the flash sale, and its radio on the right.
function ToneOption({ value, label, isChosen, onChoose }: { value: FlashTone; label: string; isChosen: boolean; onChoose: () => void }) {
  return (
    <label
      className={`flex items-center justify-between gap-2 px-3 h-11 rounded-xl cursor-pointer text-white text-form-label-md ${isChosen ? 'ring-2 ring-form-primary ring-offset-2 ring-offset-form-surface-container-lowest' : ''}`}
      style={{ backgroundColor: FLASH_TONE_COLOURS[value] }}
    >
      <span className="flex items-center gap-2">
        <BoltIcon className="text-[16px]" />
        {label}
      </span>
      <input type="radio" name="flashToneOption" value={value} checked={isChosen} onChange={onChoose} className="accent-white" />
    </label>
  )
}

// The flash sale bar's tone: one of three fixed colours, each drawn as a dark pill with its name.
export default function FlashToneField({ value, onChange }: { value: FlashTone; onChange: (value: FlashTone) => void }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-form-label-md text-form-on-surface font-medium">Flash sale urgency bar tone</legend>
      <p className="text-form-body-sm text-form-on-surface-variant">The colour of the countdown bar shown while a flash sale runs.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TONES.map((tone) => (
          <ToneOption key={tone.value} value={tone.value} label={tone.label} isChosen={value === tone.value} onChoose={() => onChange(tone.value)} />
        ))}
      </div>
    </fieldset>
  )
}
