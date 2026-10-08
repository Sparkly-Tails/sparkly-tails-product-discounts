'use client'

import { itemKey } from '@/timeDiscounts/items'
import { addMember, isSelectionEmpty, memberKeys, removeMember, switchMode } from '@/timeDiscounts/group'
import type { GroupMember, GroupSelection } from '@/timeDiscounts/config'
import AddItemPicker from '@/timeDiscounts/components/AddItemPicker'
import CollectionPicker from '@/timeDiscounts/components/CollectionPicker'

/** What a group is picked by: products and variants, or collections. The page owns the selection. */
export default function GroupPicks({
  selection, onChange, excludeDiscountId, disabled,
}: {
  selection: GroupSelection
  onChange: (selection: GroupSelection) => void
  /** The group's own id on its page, so its own products are not hidden from the search. */
  excludeDiscountId?: string
  disabled?: boolean
}) {
  function chooseMode(mode: 'products' | 'collections') {
    if (mode === selection.mode) return
    if (!isSelectionEmpty(selection) && !window.confirm('Switching replaces your current picks. Continue?')) return
    onChange(switchMode(selection, mode))
  }

  function removePick(member: GroupMember) {
    if (!window.confirm(`Remove ${member.title} from this discount?`)) return
    onChange(removeMember(selection, itemKey(member)))
  }

  return (
    <fieldset className="mb-8" disabled={disabled}>
      <legend className="font-medium mb-2">Pick by</legend>
      <div className="flex flex-wrap gap-4 mb-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="pick-mode" checked={selection.mode === 'products'} onChange={() => chooseMode('products')} />
          Products and variants
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pick-mode" checked={selection.mode === 'collections'} onChange={() => chooseMode('collections')} />
          Collections
        </label>
      </div>

      {selection.mode === 'products' ? (
        <div>
          {selection.members.map((member) => (
            <div key={itemKey(member)} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
              <span className="text-sm truncate">{member.title}</span>
              <button
                type="button" onClick={() => removePick(member)} aria-label={`Remove ${member.title}`}
                className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                Remove
              </button>
            </div>
          ))}
          <AddItemPicker excludeDiscountId={excludeDiscountId} existingKeys={memberKeys(selection)} onSelect={(item) => onChange(addMember(selection, item))} />
        </div>
      ) : (
        <CollectionPicker selected={selection.collections} onChange={(collections) => onChange({ mode: 'collections', collections })} />
      )}
    </fieldset>
  )
}
