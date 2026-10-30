'use client'

import { useFormStatus } from 'react-dom'
import { CheckIcon } from '@/form/components/icons'

const TONES = {
  primary: 'px-form-lg bg-form-primary-container hover:bg-form-primary text-form-on-primary shadow-xs',
  secondary: 'px-form-md bg-form-surface-container-lowest hover:bg-form-surface-container-low text-form-on-surface border border-form-outline-variant/60',
}

// A footer button that submits the form. While the form is being sent it is off,
// so a second click cannot send it twice. A name and value tell the action which button was used.
export default function SubmitButton({ label, name, value, tone, isDisabled }: {
  label: string
  name?: string
  value?: string
  tone: keyof typeof TONES
  isDisabled: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={isDisabled || pending}
      className={`py-1.5 rounded-lg text-form-label-md transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${TONES[tone]}`}
    >
      {tone === 'primary' ? <CheckIcon className="text-[16px]" /> : null}
      {label}
    </button>
  )
}
