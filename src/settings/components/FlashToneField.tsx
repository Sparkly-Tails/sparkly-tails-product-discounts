import { FLASH_TONE_COLOURS, type FlashTone } from '@/settings/design'

const TONES: { value: FlashTone; label: string }[] = [
  { value: 'olive-night', label: 'Olive Night' },
  { value: 'pure-onyx', label: 'Pure Onyx' },
  { value: 'deep-pine', label: 'Deep Pine' },
]

// The flash sale bar's tone: one of three fixed colours, drawn as a dot next to its name.
export default function FlashToneField({ value, onChange }: { value: FlashTone; onChange: (value: FlashTone) => void }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-form-label-sm text-form-on-surface font-medium">Flash sale bar tone</legend>
      <div className="flex items-center gap-4 flex-wrap">
        {TONES.map((tone) => (
          <label key={tone.value} className="flex items-center gap-2 cursor-pointer text-form-body-md text-form-on-surface">
            <input type="radio" name="flashToneOption" value={tone.value} checked={value === tone.value} onChange={() => onChange(tone.value)} className="accent-form-secondary" />
            <span aria-hidden="true" className="w-4 h-4 rounded-full border border-form-outline-variant/40" style={{ backgroundColor: FLASH_TONE_COLOURS[tone.value] }} />
            {tone.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
