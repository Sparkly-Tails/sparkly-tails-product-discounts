import { AddIcon } from '@/form/components/icons'

export default function AddTierButton({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onAdd}
        className="h-9 px-form-md rounded-lg bg-form-surface-container-low hover:bg-form-surface-container text-form-on-surface text-form-label-md transition-colors flex items-center gap-1.5 border border-form-outline-variant/40"
      >
        <AddIcon className="text-[18px]" />
        Add tier
      </button>
    </div>
  )
}
