import type { ReactNode } from 'react'

// The white bar under both columns: a leading button on the left (Delete, when there is one) and the form's
// buttons on the right.
export default function FormFooter({ leading, children }: { leading?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-form-surface-container-lowest rounded-lg p-form-md shadow-xs border border-form-outline-variant/20 flex items-center justify-between mt-form-md">
      <div className="flex items-center gap-form-md">{leading}</div>
      <div className="flex items-center gap-form-sm">{children}</div>
    </div>
  )
}
