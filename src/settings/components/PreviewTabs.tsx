export type PreviewKind = 'widget' | 'popup'

const TABS: { kind: PreviewKind; label: string }[] = [
  { kind: 'widget', label: 'Storefront Widget' },
  { kind: 'popup', label: 'Pre-Checkout Popup' },
]

// The same pills as the status tabs (All / Active / Inactive) on the homepage.
const TAB_BASE = 'px-3 py-1 rounded-md transition-all '
const TAB_CHOSEN = 'font-semibold bg-home-surface-container-lowest text-home-primary'
const TAB_IDLE = 'font-medium text-home-on-surface-variant hover:text-home-on-surface'

// One tab: its name, on a white pill when it is the one shown.
function PreviewTab({ kind, label, isSelected, onSelect }: { kind: PreviewKind; label: string; isSelected: boolean; onSelect: (kind: PreviewKind) => void }) {
  return (
    <button
      type="button"
      role="tab"
      id={`preview-tab-${kind}`}
      aria-selected={isSelected}
      aria-controls={`preview-panel-${kind}`}
      onClick={() => onSelect(kind)}
      className={TAB_BASE + (isSelected ? TAB_CHOSEN : TAB_IDLE)}
    >
      {label}
    </button>
  )
}

// The switch above the preview: the storefront widget or the pre-checkout pop-up, one at a time.
export default function PreviewTabs({ selected, onSelect }: { selected: PreviewKind; onSelect: (kind: PreviewKind) => void }) {
  return (
    <div role="tablist" aria-label="Preview" className="inline-flex p-1 bg-home-surface-container rounded-lg border border-home-outline-variant/40 text-xs self-start">
      {TABS.map((tab) => (
        <PreviewTab key={tab.kind} kind={tab.kind} label={tab.label} isSelected={selected === tab.kind} onSelect={onSelect} />
      ))}
    </div>
  )
}
