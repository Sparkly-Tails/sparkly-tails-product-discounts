import { SwapVertIcon } from '@/home/components/icons'
import { buildTableHref, type SortKey, type TableQuery } from '@/home/tableQuery'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: 'Default order' },
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'title-desc', label: 'Title Z-A' },
  { value: 'type', label: 'Type' },
  { value: 'status', label: 'Status' },
]
const BUTTON_CLASS =
  'cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs font-medium text-home-on-surface-variant hover:text-home-on-surface px-2.5 py-1.5 rounded-lg border border-home-outline-variant/70 hover:bg-home-surface-container transition-colors inline-flex items-center gap-1'

// The "Sort" button: a menu of links, each one the same table in another order.
export default function SortMenu({ query }: { query: TableQuery }) {
  return (
    <details className="relative">
      <summary className={BUTTON_CLASS}>
        <SwapVertIcon className="text-sm h-5" />
        Sort
      </summary>
      <div data-sort-menu className="absolute right-0 top-full mt-2 z-20 w-44 bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl py-2 flex flex-col">
        {SORT_OPTIONS.map((option) => (
          <a
            key={option.value}
            href={buildTableHref({ query, changes: { sort: option.value } })}
            aria-current={query.sort === option.value ? 'true' : undefined}
            className={
              'px-4 py-1.5 text-xs hover:bg-home-surface-container transition-colors ' +
              (query.sort === option.value ? 'font-semibold text-home-primary' : 'text-home-on-surface-variant')
            }
          >
            {option.label}
          </a>
        ))}
      </div>
    </details>
  )
}
