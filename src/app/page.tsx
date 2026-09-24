import { headers } from 'next/headers'
import { getConfig } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import AuthLink from '@/components/AuthLink'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const rows = await Promise.all(
    config.discounts.map(async (d) => {
      const memberInfo = await getMemberInfo(d.members)
      return { ...d, memberTitles: memberInfo.map((m) => m.title) }
    }),
  )

  const timeConfig = await getTimeDiscountsConfig()
  const shopTimezone = await getShopTimezone()
  const nowMs = Date.now()
  function scheduleLabel(startsAt: string, endsAt: string): string {
    const startsAtMs = new Date(zonedTimeToUtc(startsAt, shopTimezone)).getTime()
    const endsAtMs = new Date(zonedTimeToUtc(endsAt, shopTimezone)).getTime()
    return nowMs < startsAtMs ? 'Upcoming' : nowMs < endsAtMs ? 'Active' : 'Expired'
  }

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

      <div className="flex items-center justify-between mb-6 mt-10">
        <h2 className="text-xl font-semibold">Time-based discounts</h2>
        <AuthLink
          href="/time-discounts/new"
          token={token}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add time-based discount
        </AuthLink>
      </div>

      {timeConfig.discounts.length === 0 ? (
        <p className="text-muted">No time-based discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {timeConfig.discounts.map((row) => (
            <li key={row.discountId} className="py-4">
              <AuthLink
                href={`/time-discounts/${encodeURIComponent(row.discountId)}`}
                token={token}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.name}
              </AuthLink>
              <p className="text-sm text-muted">
                {scheduleLabel(row.startsAt, row.endsAt)} · {row.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {row.startsAt} → {row.endsAt} · {row.resolvedMembers.length} product{row.resolvedMembers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
