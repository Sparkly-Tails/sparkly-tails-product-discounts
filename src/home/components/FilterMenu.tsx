import HiddenField from '@/home/components/HiddenField'
import { FilterListIcon } from '@/home/components/icons'
import type { TableQuery } from '@/home/tableQuery'

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'tier', label: 'Tier-based' },
  { value: 'time', label: 'Time-based' },
]
const BUTTON_CLASS =
  'cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs font-medium text-home-on-surface-variant hover:text-home-on-surface px-2.5 py-1.5 rounded-lg border border-home-outline-variant/70 hover:bg-home-surface-container transition-colors inline-flex items-center gap-1'

// The "Filters" button. It opens a small panel (a plain form that sends the
// chosen type to the address); the tab, search and sort are kept.
export default function FilterMenu({ query }: { query: TableQuery }) {
  return (
    <details className="relative">
      <summary className={BUTTON_CLASS}>
        <FilterListIcon className="text-sm h-5" />
        Filters
      </summary>
      <form
        data-filter-form
        method="get"
        action="/"
        className="absolute right-0 top-full mt-2 z-20 w-48 bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl p-4 flex flex-col gap-3"
      >
        <HiddenField name="tab" value={query.tab} skipValue="all" />
        <HiddenField name="search" value={query.search} skipValue="" />
        <HiddenField name="sort" value={query.sort} skipValue="default" />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold text-home-on-surface mb-2">Type</legend>
          {TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-xs text-home-on-surface-variant">
              <input type="radio" name="type" value={option.value} defaultChecked={query.type === option.value} className="accent-[#2d463e]" />
              {option.label}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          className="bg-home-primary-container hover:bg-home-primary text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
        >
          Apply
        </button>
      </form>
    </details>
  )
}
