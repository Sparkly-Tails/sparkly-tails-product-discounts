import DeleteButton from '@/form/components/DeleteButton'
import FormFooter from '@/form/components/FormFooter'
import SaveMessage from '@/form/components/SaveMessage'
import StatusButton from '@/form/components/StatusButton'
import type { SaveState } from '@/form/components/TierDiscountForm'

// The bottom of the form: why the last save did not go through, and the buttons (Delete, far left, only when the
// discount can be deleted; Go live or Take offline). Save and Discard are in Shopify's save bar (SaveBar), which
// also tells that there are unsaved changes.
export default function FormActions({ status, canSave, saveState, deleteAction }: {
  status: 'draft' | 'live'
  canSave: boolean
  saveState: SaveState
  deleteAction?: () => Promise<void>
}) {
  return (
    <>
      <SaveMessage state={saveState} />
      <FormFooter leading={deleteAction ? <DeleteButton deleteAction={deleteAction} /> : null}>
        <StatusButton status={status} isDisabled={!canSave} />
      </FormFooter>
    </>
  )
}
