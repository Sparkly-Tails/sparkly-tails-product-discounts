import type { SaveState } from '@/form/components/TierDiscountForm'

// Why the last save did not go through, above the footer; nothing after a save that went through.
export default function SaveMessage({ state }: { state: SaveState }) {
  if (!state) return null
  return <p role="alert" className="text-form-body-md text-form-error">{state.error}</p>
}
