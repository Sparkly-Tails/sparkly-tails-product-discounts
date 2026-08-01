import { headers } from 'next/headers'
import { getConfig } from '@/lib/config'
import { getProductInfo } from '@/lib/products'
import AuthLink from '@/components/AuthLink'

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const rows = await Promise.all(
    config.products.map(async (p) => {
      const info = await getProductInfo(p.productId)
      return { ...p, title: info?.title ?? `${p.productId} — not found` }
    }),
  )

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Product Discounts</h1>
        <AuthLink
          href="/discounts/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add discount
        </AuthLink>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">No product discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.productId} className="py-4">
              <AuthLink
                href={`/discounts/${encodeURIComponent(row.productId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.title}
              </AuthLink>
              <p className="text-sm text-muted">
                {row.status} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between mb-6 mt-12">
        <h2 className="text-2xl font-semibold">Group Discounts</h2>
        <AuthLink
          href="/discounts/groups/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add group
        </AuthLink>
      </div>

      {config.groups.length === 0 ? (
        <p className="text-muted">No group discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {config.groups.map((group) => (
            <li key={group.groupId} className="py-4">
              <AuthLink
                href={`/discounts/groups/${encodeURIComponent(group.groupId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {group.name}
              </AuthLink>
              <p className="text-sm text-muted">
                {group.status} · {group.productIds.length} product{group.productIds.length === 1 ? '' : 's'} ·{' '}
                {group.tiers.length} tier{group.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
