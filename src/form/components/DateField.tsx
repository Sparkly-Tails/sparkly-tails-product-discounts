import type { Ref } from 'react'
import { CalendarTodayIcon } from '@/form/components/icons'

// A date and time input with the calendar icon of the design inside it. The
// label stays inline, as in the design, so the gap under it is a margin on the
// input box (Tailwind 4's space-y puts its margin on the label, where an inline
// element ignores it).
export default function DateField({
  id,
  label,
  value,
  onChange,
  inputRef,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement>
}) {
  return (
    <div>
      <label htmlFor={id} className="text-form-label-sm text-form-on-surface font-medium">{label}</label>
      <div className="relative flex items-center mt-1.5">
        <CalendarTodayIcon className="absolute left-3 text-[18px] text-form-on-surface-variant pointer-events-none" />
        <input
          id={id}
          name={id}
          type="datetime-local"
          required
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/60 text-form-on-surface text-form-body-md focus:outline-none focus:border-form-secondary transition-colors"
        />
      </div>
    </div>
  )
}
