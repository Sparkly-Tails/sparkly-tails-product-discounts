'use client'

import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { FilterListIcon } from '@/home/components/icons'
import ToolbarMenu from '@/home/components/ToolbarMenu'
import { buildTableHref, type TableQuery, type TypeFilter } from '@/home/tableQuery'

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'tier', label: 'Tier-based' },
  { value: 'time', label: 'Time-based' },
]

// The "Filters" button and its panel. Applying goes to the new address through
// the app's own router (a full page load would lose the Shopify session); the
// tab, search and sort stay as they are.
export default function FilterMenu({ query }: { query: TableQuery }) {
  const router = useRouter()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const type = String(new FormData(event.currentTarget).get('type')) as TypeFilter
    router.push(buildTableHref({ query, changes: { type } }))
  }

  return (
    <ToolbarMenu label="Filters" icon={<FilterListIcon className="text-sm h-5" />}>
      <form
        data-filter-form
        onSubmit={handleSubmit}
        className="w-48 bg-home-surface-container-lowest border border-home-outline-variant/70 rounded-xl p-4 flex flex-col gap-3"
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold text-home-on-surface mb-2">Type</legend>
          {TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-xs text-home-on-surface-variant">
              <input type="radio" name="type" value={option.value} defaultChecked={query.type === option.value} className="accent-[#2d463e]" />
              {option.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="bg-home-primary-container hover:bg-home-primary text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors">
          Apply
        </button>
      </form>
    </ToolbarMenu>
  )
}
