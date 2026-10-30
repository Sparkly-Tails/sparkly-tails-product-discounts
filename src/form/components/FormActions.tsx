import DeleteButton from '@/form/components/DeleteButton'
import DiscardButton from '@/form/components/DiscardButton'
import FormFooter from '@/form/components/FormFooter'
import SaveMessage from '@/form/components/SaveMessage'
import StatusButton from '@/form/components/StatusButton'
import SubmitButton from '@/form/components/SubmitButton'
import type { SaveState } from '@/form/components/TierDiscountForm'

// The bottom of the form: why the last save did not go through, what is unsaved, and the buttons
// (Delete, far left, only when the discount can be deleted; Discard; Go live or Take offline; Save).
export default function FormActions({ mode, status, isDirty, canSave, saveState, deleteAction, onDiscard }: {
  mode: 'create' | 'edit'
  status: 'draft' | 'live'
  isDirty: boolean
  canSave: boolean
  saveState: SaveState
  deleteAction?: () => Promise<void>
  onDiscard: () => void
}) {
  return (
    <>
      <SaveMessage state={saveState} />
      <FormFooter statusText={isDirty ? 'Unsaved changes on this discount tier' : ''} leading={deleteAction ? <DeleteButton deleteAction={deleteAction} /> : null}>
        <DiscardButton mode={mode} onDiscard={onDiscard} />
        <StatusButton status={status} isDisabled={!canSave} />
        <SubmitButton label="Save" tone="primary" isDisabled={!canSave} />
      </FormFooter>
    </>
  )
}
