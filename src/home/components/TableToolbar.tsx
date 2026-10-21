import Link from 'next/link'
import TableSearch from '@/home/components/TableSearch'
import { buildTableHref, type StatusTab, type TableQuery, type TableView } from '@/home/tableQuery'

const TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]
const TAB_BASE = 'px-3 py-1 rounded-md transition-all '
const TAB_OPEN = 'font-semibold bg-home-surface-container-lowest text-home-primary'
const TAB_SHUT = 'font-medium text-home-on-surface-variant hover:text-home-on-surface'

// The tab pills (with the count of all discounts) and the search box.
export default function TableToolbar({ query, counts }: { query: TableQuery; counts: TableView['counts'] }) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
      <nav aria-label="Discount status" className="inline-flex p-1 bg-home-surface-container rounded-lg border border-home-outline-variant/40 text-xs self-start">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={buildTableHref({ query, changes: { tab: tab.value } })}
            aria-current={query.tab === tab.value ? 'page' : undefined}
            className={TAB_BASE + (query.tab === tab.value ? TAB_OPEN : TAB_SHUT)}
          >
            {tab.label} <span className="ml-1 text-[11px] leading-4 opacity-75 font-normal">{counts[tab.value]}</span>
          </Link>
        ))}
      </nav>
      <TableSearch query={query} />
    </div>
  )
}
