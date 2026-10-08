'use client'

import { useRef, useState } from 'react'
import { searchTimeDiscountCollectionsAction } from '@/timeDiscounts/pickerActions'
import { collectionsNotPicked, withCollection, withoutCollection } from '@/timeDiscounts/group'
import type { GroupCollection } from '@/timeDiscounts/config'

/**
 * Search box and chips for picking collections. It keeps no list of its own:
 * `selected` comes in, and every change goes out through `onChange`.
 */
export default function CollectionPicker({
  selected, onChange,
}: {
  selected: GroupCollection[]
  onChange: (next: GroupCollection[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GroupCollection[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
      ++generationRef.current
      return
    }

    setSearching(true)
    const generation = ++generationRef.current
    debounceRef.current = setTimeout(async () => {
      const matches = await searchTimeDiscountCollectionsAction(value)
      if (generation === generationRef.current) {
        setResults(collectionsNotPicked(matches, selected))
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  function addCollection(collection: GroupCollection) {
    setQuery('')
    setResults([])
    setOpen(false)
    onChange(withCollection(selected, collection))
  }

  function removeCollection(collection: GroupCollection) {
    if (!window.confirm(`Remove ${collection.title} from this discount?`)) return
    onChange(withoutCollection(selected, collection.id))
  }

  return (
    <div>
      {selected.map((collection) => (
        <div key={collection.id} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <span className="text-sm truncate">{collection.title}</span>
          <button
            type="button" onClick={() => removeCollection(collection)} aria-label={`Remove ${collection.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="relative">
        <label htmlFor="time-discount-collection-search" className="sr-only">Search for a collection to add</label>
        <input
          id="time-discount-collection-search" type="text" placeholder="Search for a collection to add…"
          value={query} onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button" onMouseDown={() => addCollection(collection)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {collection.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
