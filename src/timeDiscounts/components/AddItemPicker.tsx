'use client'

import { useRef, useState } from 'react'
import {
  searchTimeDiscountProductsAction, getTimeDiscountProductVariantsAction, validateTimeDiscountMemberAction,
} from '@/timeDiscounts/pickerActions'
import { alreadyAdded, availableVariants, pickedProduct, pickedVariant, visibleResults } from '@/timeDiscounts/picker'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

export type PickedItem = { productId: string; variantId?: string; title: string; price: number }

/** The reason a product/variant cannot be added (it belongs to another discount, or the check failed), or null when it can. */
async function checkAvailable(productId: string, variantId: string | undefined, excludeDiscountId: string | undefined): Promise<string | null> {
  try {
    const check = await validateTimeDiscountMemberAction(productId, variantId, excludeDiscountId)
    return check.ok ? null : check.error
  } catch {
    return "Couldn't check this product — please try again"
  }
}

/**
 * Search box that adds one product or variant at a time. It keeps no list of
 * its own: the chosen item is handed to `onSelect`, and `existingKeys` (the
 * itemKey of every row already in the discount) keeps already-added products
 * out of the results.
 */
export default function AddItemPicker({
  excludeDiscountId,
  existingKeys,
  onSelect,
}: {
  excludeDiscountId?: string
  existingKeys: string[]
  onSelect: (item: PickedItem) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanding, setExpanding] = useState<ProductSearchResult | null>(null)
  const [variantOptions, setVariantOptions] = useState<ProductVariantOption[]>([])
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
      const matches = await searchTimeDiscountProductsAction(value, excludeDiscountId)
      if (generation === generationRef.current) {
        setResults(visibleResults(matches, existingKeys))
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  async function chooseProduct(candidate: ProductSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setError(null)

    if (candidate.variantCount > 1) {
      const options = await getTimeDiscountProductVariantsAction(candidate.id, excludeDiscountId)
      setExpanding(candidate)
      setVariantOptions(availableVariants(options, existingKeys, candidate.id))
      return
    }

    if (alreadyAdded(existingKeys, candidate.id)) {
      setError('This product is already added')
      return
    }

    const availError = await checkAvailable(candidate.id, undefined, excludeDiscountId)
    if (availError) {
      setError(availError)
      return
    }

    const [onlyVariant] = await getTimeDiscountProductVariantsAction(candidate.id)
    if (!onlyVariant) {
      setError("Couldn't load this product's price — please try again")
      return
    }

    onSelect(pickedProduct(candidate, onlyVariant.price))
  }

  async function chooseVariant(option: ProductVariantOption) {
    if (!expanding) return

    if (alreadyAdded(existingKeys, expanding.id, option.variantId)) {
      setError('This variant is already added')
      return
    }

    const availError = await checkAvailable(expanding.id, option.variantId, excludeDiscountId)
    if (availError) {
      setError(availError)
      return
    }

    onSelect(pickedVariant(expanding, option))
    setExpanding(null)
    setVariantOptions([])
  }

  return (
    <div>
      {expanding && (
        <div className="border border-line rounded p-3 mb-2 space-y-2">
          <p className="text-sm font-medium">{expanding.title} — select a variant:</p>
          {variantOptions.map((option) => (
            <button
              key={option.variantId}
              type="button"
              onClick={() => chooseVariant(option)}
              className="w-full text-left px-3 py-2 border border-line rounded hover:bg-line transition-colors duration-200 text-sm"
            >
              {option.title} — £{option.price.toFixed(2)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setExpanding(null); setVariantOptions([]) }}
            className="text-xs text-muted hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="relative">
        <label htmlFor="time-discount-member-search" className="sr-only">
          Search for a product to add
        </label>
        <input
          id="time-discount-member-search"
          type="text"
          placeholder="Search for a product to add…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && <p className="text-xs text-muted mt-1">Searching…</p>}
        {error && <p role="alert" className="text-xs text-danger mt-1">{error}</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseDown={() => chooseProduct(product)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {product.title}
                  {product.variantCount > 1 && <span className="text-muted"> ({product.variantCount} variants)</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
