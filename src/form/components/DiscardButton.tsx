import Link from 'next/link'

const CLASS = 'px-form-md py-1.5 rounded-lg bg-form-surface-container-low hover:bg-form-surface-container text-form-on-surface text-form-label-md transition-colors border border-form-outline-variant/30'

// Creating: nothing is saved yet, so Discard leaves for the discounts. Editing:
// Discard takes back what was changed since the last save.
export default function DiscardButton({ mode, onDiscard }: { mode: 'create' | 'edit'; onDiscard: () => void }) {
  if (mode === 'create') return <Link href="/" className={CLASS}>Discard</Link>
  return <button type="button" onClick={onDiscard} className={CLASS}>Discard</button>
}
