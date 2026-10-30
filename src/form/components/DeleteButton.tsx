'use client'

import { useFormStatus } from 'react-dom'
import { DeleteIcon } from '@/form/components/icons'

// Deletes the discount. It asks first (nothing is deleted on the answer "no"), and it
// skips the form's own checks, so a discount that cannot be saved can still be deleted.
export default function DeleteButton({ deleteAction }: { deleteAction: () => Promise<void> }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      formAction={deleteAction}
      formNoValidate
      disabled={pending}
      onClick={(event) => { if (!confirm('Delete this discount? This cannot be undone.')) event.preventDefault() }}
      className="px-form-md py-1.5 rounded-lg text-form-label-md text-form-error hover:bg-form-error-container transition-colors flex items-center gap-1.5 disabled:opacity-50"
    >
      <DeleteIcon className="text-[16px]" />
      Delete
    </button>
  )
}
