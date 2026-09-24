'use client'

import { useEffect, useRef, useState } from 'react'
import {
  searchTimeDiscountProductsAction, getTimeDiscountProductVariantsAction, validateTimeDiscountMemberAction,
} from '@/timeDiscounts/pickerActions'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

export type SelectedMember = { productId: string; variantId?: string; title: string; price: number }

function isMemberSelected(members: SelectedMember[], productId: string, variantId?: string): boolean {
  return members.some((m) => m.productId === productId && m.variantId === variantId)
}

export default function TimeProductPicker({
  initialMembers,
  excludeDiscountId,
  onMembersChange,
}: {
  initialMembers?: SelectedMember[]
  excludeDiscountId?: string
  onMembersChange?: (members: SelectedMember[]) => void
}) {
  const [selected, setSelected] = useState<SelectedMember[]>(initialMembers ?? [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanding, setExpanding] = useState<ProductSearchResult | null>(null)
  const [variantOptions, setVariantOptions] = useState<ProductVariantOption[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    onMembersChange?.(selected)
  }, [selected, onMembersChange])

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
        const filtered = matches.filter((m) => {
          if (m.variantCount <= 1) return !isMemberSelected(selected, m.id, undefined)
          const selectedCount = selected.filter((s) => s.productId === m.id).length
          return selectedCount < m.variantCount
        })
        setResults(filtered)
        setSearching(false)
        setOpen(true)
      }
    }, 300)
  }

  async function addWholeProduct(candidate: ProductSearchResult) {
    setQuery('')
    setResults([])
    setOpen(false)
    setError(null)

    if (candidate.variantCount > 1) {
      const options = await getTimeDiscountProductVariantsAction(candidate.id, excludeDiscountId)
      setExpanding(candidate)
      setVariantOptions(options.filter((o) => !isMemberSelected(selected, candidate.id, o.variantId)))
      return
    }

    if (isMemberSelected(selected, candidate.id, undefined)) {
      setError('This product is already added')
      return
    }

    const check = await validateTimeDiscountMemberAction(candidate.id, undefined, excludeDiscountId)
    if (!check.ok) {
      setError(check.error)
      return
    }

    const [onlyVariant] = await getTimeDiscountProductVariantsAction(candidate.id)
    const member: SelectedMember = { productId: candidate.id, title: candidate.title, price: onlyVariant?.price ?? 0 }
    setSelected((prev) => (isMemberSelected(prev, member.productId, member.variantId) ? prev : [...prev, member]))
  }

  async function addVariant(option: ProductVariantOption) {
    if (!expanding) return

    if (isMemberSelected(selected, expanding.id, option.variantId)) {
      setError('This variant is already added')
      return
    }

    const check = await validateTimeDiscountMemberAction(expanding.id, option.variantId, excludeDiscountId)
    if (!check.ok) {
      setError(check.error)
      return
    }
    const member: SelectedMember = {
      productId: expanding.id,
      variantId: option.variantId,
      title: `${expanding.title} – ${option.title}`,
      price: option.price,
    }
    setSelected((prev) => (isMemberSelected(prev, member.productId, member.variantId) ? prev : [...prev, member]))
    setExpanding(null)
    setVariantOptions([])
  }

  function removeMember(index: number) {
    setSelected((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div>
      {selected.map((m, i) => (
        <div key={`${m.productId}-${m.variantId ?? ''}`} className="flex items-center justify-between gap-2 border border-line rounded px-3 py-2 mb-2">
          <input type="hidden" name={`member-${i}-productId`} value={m.productId} />
          {m.variantId && <input type="hidden" name={`member-${i}-variantId`} value={m.variantId} />}
          <span className="text-sm truncate">
            {m.title} — £{m.price.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={() => removeMember(i)}
            aria-label={`Remove ${m.title}`}
            className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}

      {expanding && (
        <div className="border border-line rounded p-3 mb-2 space-y-2">
          <p className="text-sm font-medium">{expanding.title} — select variant(s):</p>
          {variantOptions.map((option) => (
            <button
              key={option.variantId}
              type="button"
              onClick={() => addVariant(option)}
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
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseDown={() => addWholeProduct(product)}
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
