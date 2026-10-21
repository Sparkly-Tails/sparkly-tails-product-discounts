import Link from 'next/link'
import { SwapVertIcon } from '@/home/components/icons'
import ToolbarMenu from '@/home/components/ToolbarMenu'
import { buildTableHref, type SortKey, type TableQuery } from '@/home/tableQuery'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'default', label: 'Default order' },
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'title-desc', label: 'Title Z-A' },
  { value: 'type', label: 'Type' },
  { value: 'status', label: 'Status' },
]

// The "Sort" button: a menu of links, each one the same table in another order.
export default function SortMenu({ query }: { query: TableQuery }) {
  return (
    <ToolbarMenu label="Sort" icon={<SwapVertIcon className="text-sm h-5" />}>
      <div data-sort-menu className="w-44 bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl py-2 flex flex-col">
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={buildTableHref({ query, changes: { sort: option.value } })}
            aria-current={query.sort === option.value ? 'true' : undefined}
            className={
              'px-4 py-1.5 text-xs hover:bg-home-surface-container transition-colors ' +
              (query.sort === option.value ? 'font-semibold text-home-primary' : 'text-home-on-surface-variant')
            }
          >
            {option.label}
          </Link>
        ))}
      </div>
    </ToolbarMenu>
  )
}
