import type { ProductSearchResult } from '@/lib/products'

// The products found by a search (or by Browse), under the search field. A
// product is picked on press, before the field's blur can close the list.
export default function ResultsList({ results, onPick }: { results: ProductSearchResult[]; onPick: (result: ProductSearchResult) => void }) {
  if (results.length === 0) {
    return <p className="absolute z-10 mt-1 w-full bg-form-surface-container-lowest border border-form-outline-variant/40 rounded-lg shadow-md px-3 py-2 text-form-body-md text-form-on-surface-variant">No products found</p>
  }
  return (
    <ul className="absolute z-10 mt-1 w-full bg-form-surface-container-lowest border border-form-outline-variant/40 rounded-lg shadow-md overflow-hidden">
      {results.map((result) => (
        <li key={result.id}>
          <button
            type="button"
            onMouseDown={() => onPick(result)}
            className="w-full text-left px-3 py-2 text-form-body-md text-form-on-surface hover:bg-form-surface-container-low transition-colors"
          >
            {result.title}
            {result.variantCount > 1 ? <>{' '}<span className="text-form-on-surface-variant">({result.variantCount} variants)</span></> : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
