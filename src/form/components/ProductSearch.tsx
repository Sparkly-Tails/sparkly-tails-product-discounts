'use client'

import { useRef, useState } from 'react'
import ResultsList from '@/form/components/ResultsList'
import SearchBox from '@/form/components/SearchBox'
import SearchStatus from '@/form/components/SearchStatus'
import VariantSection from '@/form/components/VariantSection'
import {
  countMembersOfProduct, isProductFullySelected, keepUnselectedProducts, type SelectedMember,
} from '@/form/memberSelection'
import type { ProductSearchResult, ProductVariantOption } from '@/lib/products'

/** The server lookups the search needs, handed in so the component can be tried with others. */
export interface ProductSearchTools {
  findProducts: (options: { query: string }) => Promise<ProductSearchResult[]>
  listProducts: () => Promise<ProductSearchResult[]>
  findVariants: (options: { productId: string }) => Promise<ProductVariantOption[]>
  checkMember: (options: { productId: string; variantId?: string; excludeDiscountId?: string }) => Promise<{ ok: true } | { ok: false; error: string }>
}

const SELECTION_TOOLS = { countMembersOfProduct, isProductFullySelected }

// Searching, browsing and choosing variants for the products card. A search
// starts `delayMs` after the last keystroke; only the latest one is shown.
// What is already chosen is left out of the results at the time they are shown.
export default function ProductSearch({ members, currencyCode, excludeDiscountId, delayMs, tools, onAddMember }: {
  members: SelectedMember[]
  currencyCode: string
  excludeDiscountId?: string
  delayMs: number
  tools: ProductSearchTools
  onAddMember: (member: SelectedMember) => void
}) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<ProductSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanding, setExpanding] = useState<ProductSearchResult | null>(null)
  const [variants, setVariants] = useState<ProductVariantOption[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  function stopTimer() {
    if (timerRef.current) clearTimeout(timerRef.current)
    return ++generationRef.current
  }

  function showResults(results: ProductSearchResult[], generation: number) {
    if (generation !== generationRef.current) return
    setFound(results)
    setIsSearching(false)
    setIsOpen(true)
  }

  function updateQuery(value: string) {
    setQuery(value)
    setError(null)
    const generation = stopTimer()
    if (value.trim().length < 2) return clearResults()
    setIsSearching(true)
    timerRef.current = setTimeout(async () => showResults(await tools.findProducts({ query: value }), generation), delayMs)
  }

  function clearResults() {
    setFound([])
    setIsSearching(false)
    setIsOpen(false)
  }

  function clearSearch() {
    stopTimer()
    setQuery('')
    clearResults()
  }

  async function listShopProducts() {
    const generation = stopTimer()
    setQuery('')
    setError(null)
    setIsSearching(true)
    showResults(await tools.listProducts(), generation)
  }

  async function addWholeProduct(result: ProductSearchResult) {
    const check = await tools.checkMember({ productId: result.id, excludeDiscountId })
    if (!check.ok) return setError(check.error)
    const [onlyVariant] = await tools.findVariants({ productId: result.id })
    onAddMember({ productId: result.id, productTitle: result.title, price: onlyVariant ? onlyVariant.price : 0, imageUrl: result.imageUrl })
  }

  async function openVariants(result: ProductSearchResult) {
    setVariants(await tools.findVariants({ productId: result.id }))
    setExpanding(result)
  }

  async function pickResult(result: ProductSearchResult) {
    clearSearch()
    setError(null)
    await (result.variantCount > 1 ? openVariants(result) : addWholeProduct(result))
  }

  async function pickVariant(option: ProductVariantOption) {
    if (!expanding) return
    const check = await tools.checkMember({ productId: expanding.id, variantId: option.variantId, excludeDiscountId })
    if (!check.ok) return setError(check.error)
    onAddMember({ productId: expanding.id, variantId: option.variantId, productTitle: expanding.title, variantTitle: option.title, price: option.price, imageUrl: expanding.imageUrl })
  }

  const visibleResults = keepUnselectedProducts({ results: found, members, tools: SELECTION_TOOLS })

  return (
    <div className="space-y-form-md">
      <SearchBox value={query} onChange={updateQuery} onClear={clearSearch} onBrowse={listShopProducts} onFocus={() => setIsOpen(found.length > 0)} onBlur={() => setIsOpen(false)}>
        {isOpen ? <ResultsList results={visibleResults} onPick={pickResult} /> : null}
      </SearchBox>
      <SearchStatus isSearching={isSearching} error={error} />
      <VariantSection expanding={expanding} variants={variants} members={members} currencyCode={currencyCode} onPick={pickVariant} onDone={() => setExpanding(null)} />
    </div>
  )
}
