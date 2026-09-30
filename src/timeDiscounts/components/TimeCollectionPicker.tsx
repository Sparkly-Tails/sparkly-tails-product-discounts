'use client'

import { useEffect, useRef, useState } from 'react'
import { searchTimeDiscountCollectionsAction } from '@/timeDiscounts/pickerActions'
import type { CollectionSearchResult } from '@/lib/collections'

export type SelectedCollection = { id: string; title: string }

function isCollectionSelected(collections: SelectedCollection[], id: string): boolean {
  return collections.some((c) => c.id === id)
}

export default function TimeCollectionPicker({
  initialCollections,
  onCollectionsChange,
}: {
  initialCollections?: SelectedCollection[]
  onCollectionsChange?: (collections: SelectedCollection[]) => void
}) {
  const [selected, setSelected] = useState<SelectedCollection[]>(initialCollections ?? [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CollectionSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    onCollectionsChange?.(selected)
  }, [selected, onCollectionsChange])

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
        setResults(matches.filter((m) => !isCollectionSelected(selected, m.id)))
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  function addCollection(candidate: CollectionSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setSelected((prev) => (isCollectionSelected(prev, candidate.id) ? prev : [...prev, candidate]))
  }

  function removeCollection(index: number) {
    setSelected((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div>
      {selected.map((c, i) => (
        <div key={c.id} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <input type="hidden" name="collectionId" value={c.id} />
          <span className="text-sm truncate">{c.title}</span>
          <button
            type="button"
            onClick={() => removeCollection(i)}
            aria-label={`Remove ${c.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="relative">
        <label htmlFor="time-discount-collection-search" className="sr-only">
          Search for a collection to add
        </label>
        <input
          id="time-discount-collection-search"
          type="text"
          placeholder="Search for a collection to add…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
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
                  type="button"
                  onMouseDown={() => addCollection(collection)}
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
