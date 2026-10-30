import type { ReactNode } from 'react'
import { CheckCircleIcon } from '@/form/components/icons'

// The white bar under both columns: on the left a leading button (Delete, when
// there is one) and a status line (empty text hides it with its icon), and the
// form's buttons on the right.
export default function FormFooter({ statusText, leading, children }: { statusText: string; leading?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-form-surface-container-lowest rounded-lg p-form-md shadow-xs border border-form-outline-variant/20 flex items-center justify-between mt-form-md">
      <div className="flex items-center gap-form-md">
        {leading}
        <div className="flex items-center gap-form-xs text-form-on-surface-variant text-form-body-sm">
          {statusText ? <CheckCircleIcon className="text-[16px] text-form-tertiary" /> : null}
          <span>{statusText}</span>
        </div>
      </div>
      <div className="flex items-center gap-form-sm">{children}</div>
    </div>
  )
}
