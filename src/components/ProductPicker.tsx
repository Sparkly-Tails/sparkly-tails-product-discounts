'use client'

import { useRef, useState } from 'react'
import { searchProductsAction } from '@/actions/productSearchAction'
import type { ProductSearchResult } from '@/lib/products'

export default function ProductPicker({
  initialProduct,
}: {
  initialProduct: ProductSearchResult | null
}) {
  const [selected, setSelected] = useState<ProductSearchResult | null>(initialProduct)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const matches = await searchProductsAction(value)
      setResults(matches)
      setSearching(false)
      setOpen(true)
    }, 300)
  }

  function selectProduct(product: ProductSearchResult) {
    setSelected(product)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div>
      <input type="hidden" name="productId" value={selected?.id ?? ''} />

      {selected ? (
        <div className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-3">
          <span className="text-sm truncate">{selected.title}</span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Change product"
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <label htmlFor="product-search" className="sr-only">
            Search for a product
          </label>
          <input
            id="product-search"
            type="text"
            placeholder="Search for a product…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
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
      )}
    </div>
  )
}
