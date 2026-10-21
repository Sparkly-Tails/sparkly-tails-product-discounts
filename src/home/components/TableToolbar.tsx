import HiddenField from '@/home/components/HiddenField'
import { SearchIcon } from '@/home/components/icons'
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
          <a
            key={tab.value}
            href={buildTableHref({ query, changes: { tab: tab.value } })}
            aria-current={query.tab === tab.value ? 'page' : undefined}
            className={TAB_BASE + (query.tab === tab.value ? TAB_OPEN : TAB_SHUT)}
          >
            {tab.label} <span className="ml-1 text-[11px] leading-4 opacity-75 font-normal">{counts[tab.value]}</span>
          </a>
        ))}
      </nav>
      <form role="search" method="get" action="/" className="relative w-full sm:w-72">
        <HiddenField name="tab" value={query.tab} skipValue="all" />
        <HiddenField name="type" value={query.type} skipValue="all" />
        <HiddenField name="sort" value={query.sort} skipValue="default" />
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-home-on-surface-variant text-[18px] pointer-events-none" />
        <input
          name="search"
          type="text"
          defaultValue={query.search}
          aria-label="Search discounts"
          placeholder="Search discounts..."
          className="w-full text-xs pl-9 pr-3 py-2 bg-home-surface-container-lowest border border-home-outline-variant rounded-lg text-home-on-surface placeholder:text-home-on-surface-variant focus:outline-none focus:ring-1 focus:ring-home-primary focus:border-home-primary transition-all"
        />
      </form>
    </div>
  )
}
