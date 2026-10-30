// The line under the search field: that a search is running, or why an add was refused.
export default function SearchStatus({ isSearching, error }: { isSearching: boolean; error: string | null }) {
  return (
    <>
      {isSearching ? <p className="text-form-body-sm text-form-on-surface-variant">Searching…</p> : null}
      {error ? <p role="alert" className="text-form-body-sm text-form-error">{error}</p> : null}
    </>
  )
}
