import DiscardButton from '@/form/components/DiscardButton'
import FormFooter from '@/form/components/FormFooter'
import SubmitButton from '@/form/components/SubmitButton'
import type { SaveState } from '@/form/components/TierDiscountForm'

// The bottom of the form: why the last save did not go through, what is unsaved, and the buttons.
export default function FormActions({ mode, isDirty, canSave, saveState, onDiscard }: {
  mode: 'create' | 'edit'
  isDirty: boolean
  canSave: boolean
  saveState: SaveState
  onDiscard: () => void
}) {
  return (
    <>
      {saveState ? <p role="alert" className="text-form-body-md text-form-error">{saveState.error}</p> : null}
      <FormFooter statusText={isDirty ? 'Unsaved changes on this discount tier' : ''}>
        <DiscardButton mode={mode} onDiscard={onDiscard} />
        <SubmitButton label="Go live" name="goLive" value="on" tone="secondary" isDisabled={!canSave} />
        <SubmitButton label="Save" tone="primary" isDisabled={!canSave} />
      </FormFooter>
    </>
  )
}
