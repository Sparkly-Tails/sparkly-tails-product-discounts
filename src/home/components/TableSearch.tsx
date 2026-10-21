'use client'

import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { SearchIcon } from '@/home/components/icons'
import { buildTableHref, type TableQuery } from '@/home/tableQuery'

// The search box. Pressing Enter goes to the new address through the app's own
// router (a full page load would lose the Shopify session); the tab, type and
// sort stay as they are, and the page goes back to the first one.
export default function TableSearch({ query }: { query: TableQuery }) {
  const router = useRouter()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const search = String(new FormData(event.currentTarget).get('search') ?? '').trim()
    router.push(buildTableHref({ query, changes: { search } }))
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="relative w-full sm:w-72">
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
  )
}
