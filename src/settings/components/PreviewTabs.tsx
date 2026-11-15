import { ShoppingBagIcon, StorefrontIcon } from '@/form/components/icons'

export type PreviewKind = 'widget' | 'popup'

const TABS: { kind: PreviewKind; label: string }[] = [
  { kind: 'widget', label: 'Storefront Widget' },
  { kind: 'popup', label: 'Pre-Checkout Popup' },
]

const ICONS: Record<PreviewKind, typeof StorefrontIcon> = { widget: StorefrontIcon, popup: ShoppingBagIcon }

const TAB_CHOSEN = 'bg-form-primary text-form-on-primary'
const TAB_IDLE = 'text-form-on-surface-variant hover:text-form-on-surface'

// One tab: its icon and name, dark when it is the one shown.
function PreviewTab({ kind, label, isSelected, onSelect }: { kind: PreviewKind; label: string; isSelected: boolean; onSelect: (kind: PreviewKind) => void }) {
  const Icon = ICONS[kind]
  return (
    <button
      type="button"
      role="tab"
      id={`preview-tab-${kind}`}
      aria-selected={isSelected}
      aria-controls={`preview-panel-${kind}`}
      onClick={() => onSelect(kind)}
      className={`flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-form-label-md font-medium transition-colors ${isSelected ? TAB_CHOSEN : TAB_IDLE}`}
    >
      <Icon className="text-[18px]" />
      {label}
    </button>
  )
}

// The switch above the preview: the storefront widget or the pre-checkout pop-up, one at a time.
export default function PreviewTabs({ selected, onSelect }: { selected: PreviewKind; onSelect: (kind: PreviewKind) => void }) {
  return (
    <div role="tablist" aria-label="Preview" className="flex gap-1 p-1 rounded-2xl bg-form-surface-container-lowest border border-form-outline-variant/20 shadow-xs">
      {TABS.map((tab) => (
        <PreviewTab key={tab.kind} kind={tab.kind} label={tab.label} isSelected={selected === tab.kind} onSelect={onSelect} />
      ))}
    </div>
  )
}
