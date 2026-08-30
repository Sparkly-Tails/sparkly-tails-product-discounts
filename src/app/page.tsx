import { headers } from 'next/headers'
import { getConfig } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import AuthLink from '@/components/AuthLink'

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const rows = await Promise.all(
    config.discounts.map(async (d) => {
      const memberInfo = await getMemberInfo(d.members)
      return { ...d, memberTitles: memberInfo.map((m) => m.title) }
    }),
  )

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Discounts</h1>
        <AuthLink
          href="/discounts/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add discount
        </AuthLink>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">No discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.discountId} className="py-4">
              <AuthLink
                href={`/discounts/${encodeURIComponent(row.discountId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.name}
              </AuthLink>
              <p className="text-sm text-muted">
                {row.status} · {row.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {row.memberTitles.join(', ') || 'no members resolved'} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
