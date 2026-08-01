'use client'

import { useRef, useState } from 'react'
import { searchProductsAction } from '@/actions/productSearchAction'
import { addGroupProductAction } from '@/actions/groupProductActions'
import type { ProductSearchResult } from '@/lib/products'

export type SelectedGroupProduct = { id: string; title: string; price: number }

export default function GroupProductPicker({
  initialProducts,
  excludeGroupId,
}: {
  initialProducts?: SelectedGroupProduct[]
  excludeGroupId?: string
}) {
  const [selected, setSelected] = useState<SelectedGroupProduct[]>(initialProducts ?? [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  function handleQueryChange(value: string) {
    setQuery(value)
    setError(null)
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
      const matches = await searchProductsAction(value)
      if (generation === generationRef.current) {
        setResults(matches)
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  async function selectProduct(candidate: ProductSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setError(null)

    if (selected.some((p) => p.id === candidate.id)) return

    const currentPrice = selected[0]?.price ?? null
    const result = await addGroupProductAction(candidate.id, currentPrice, excludeGroupId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelected((prev) => [...prev, result.product])
  }

  function removeProduct(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div>
      {selected.map((p, i) => (
        <div key={p.id} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <input type="hidden" name={`product-${i}-id`} value={p.id} />
          <span className="text-sm truncate">
            {p.title} — £{p.price.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={() => removeProduct(p.id)}
            aria-label={`Remove ${p.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="relative">
        <label htmlFor="group-product-search" className="sr-only">
          Search for a product to add to the group
        </label>
        <input
          id="group-product-search"
          type="text"
          placeholder="Search for a product to add…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseDown={() => selectProduct(product)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {product.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
