import DeleteButton from '@/form/components/DeleteButton'
import StatusButton from '@/form/components/StatusButton'

// The buttons on the right of the form's heading: Delete (only when the discount can be deleted) and Go live or
// Take offline. A new discount has none of them, since it cannot be published or deleted before it is saved. Save
// and Discard are in Shopify's save bar (SaveBar), which also tells that there are unsaved changes.
export default function FormActions({ mode, status, canSave, deleteAction }: {
  mode: 'create' | 'edit'
  status: 'draft' | 'live'
  canSave: boolean
  deleteAction?: () => Promise<void>
}) {
  if (mode === 'create') return null
  return (
    <>
      {deleteAction ? <DeleteButton deleteAction={deleteAction} /> : null}
      <StatusButton status={status} isDisabled={!canSave} />
    </>
  )
}
