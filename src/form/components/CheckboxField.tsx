// A checkbox with its text, as the design draws them. The text is bold for a
// switch that opens more fields and plain for an option.
export default function CheckboxField({
  name,
  label,
  checked,
  onChange,
  isStrong,
  className,
}: {
  name: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  isStrong?: boolean
  className?: string
}) {
  const textClass = isStrong ? 'text-form-label-md text-form-on-surface font-medium' : 'text-form-body-md text-form-on-surface'
  return (
    <label className={['flex items-center gap-2.5 cursor-pointer', className].join(' ')}>
      <input
        name={name}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="w-4 h-4 rounded text-form-secondary bg-form-surface-container-lowest border border-form-outline accent-form-secondary cursor-pointer"
      />
      <span className={textClass}>{label}</span>
    </label>
  )
}
