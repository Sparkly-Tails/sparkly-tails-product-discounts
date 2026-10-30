import type { ReactNode } from 'react'
import { CategoryIcon, CloseIcon, SearchIcon } from '@/form/components/icons'

// The search field of the products card with its clear button and the Browse
// button. What the person should see under the field (the results) is a child.
export default function SearchBox({ value, onChange, onClear, onBrowse, onFocus, onBlur, children }: {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onBrowse: () => void
  onFocus?: () => void
  onBlur?: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-form-sm">
      <div className="relative flex-1">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-form-on-surface-variant" />
        <input
          type="text"
          aria-label="Search products or variants"
          placeholder="Search products or variants..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full h-10 pl-9 pr-9 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/60 text-form-on-surface text-form-body-md focus:outline-none focus:border-form-secondary transition-colors"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="w-6 h-6 rounded-full hover:bg-form-surface-container text-form-on-surface-variant hover:text-form-on-surface absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center transition-colors"
          >
            <CloseIcon className="text-[16px]" />
          </button>
        ) : null}
        {children}
      </div>
      <button
        type="button"
        onClick={onBrowse}
        className="h-10 px-form-md rounded-lg bg-form-surface-container-low hover:bg-form-surface-container text-form-on-surface text-form-label-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
      >
        <CategoryIcon className="text-[18px]" />
        Browse
      </button>
    </div>
  )
}
