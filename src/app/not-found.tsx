import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Discount not found</h1>
      <p className="text-sm text-muted mb-6">
        It may have been deleted, or the link is out of date.
      </p>
      <Link
        href="/"
        className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Back to discounts
      </Link>
    </main>
  )
}
