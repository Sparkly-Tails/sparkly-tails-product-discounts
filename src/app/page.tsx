import { getConfig } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'
import Link from 'next/link'
import { getTimeDiscountsConfig, computeTimeDiscountStatusLabel } from '@/timeDiscounts/config'
import { getShopTimezone } from '@/lib/shop'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'

export default async function Home() {
  // First, so the store has its tier checkout discount; it never throws, so the page always loads.
  await ensureTierDiscountSafely()
  const config = await getConfig()

  const rows = await Promise.all(
    config.discounts.map(async (d) => {
      const memberInfo = await getMemberInfo(d.members)
      return { ...d, memberTitles: memberInfo.map((m) => m.title) }
    }),
  )

  const timeConfig = await getTimeDiscountsConfig()
  const shopTimezone = await getShopTimezone()
  function scheduleLabel(startsAt: string, endsAt: string): string {
    return computeTimeDiscountStatusLabel(startsAt, endsAt, shopTimezone)
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Discounts</h1>
        <Link
          href="/discounts/new"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add discount
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">No discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.discountId} className="py-4">
              <Link
                href={`/discounts/${encodeURIComponent(row.discountId)}`}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.name}
              </Link>
              <p className="text-sm text-muted">
                {row.status} · {row.pricingMode === 'fixed' ? 'Fixed price' : 'Percentage'} · {row.memberTitles.join(', ') || 'no members resolved'} · {row.tiers.length} tier{row.tiers.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between mb-6 mt-10">
        <h2 className="text-xl font-semibold">Time-based discounts</h2>
        <Link
          href="/time-discounts/new"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Add time-based discount
        </Link>
      </div>

      {timeConfig.discounts.length === 0 ? (
        <p className="text-muted">No time-based discounts yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {timeConfig.discounts.map((row) => (
            <li key={row.discountId} className="py-4">
              <Link
                href={`/time-discounts/${encodeURIComponent(row.discountId)}`}
                className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {row.title}
              </Link>
              <p className="text-sm text-muted">
                {row.kind === 'group' ? 'Group' : 'Per product'} · {scheduleLabel(row.startsAt, row.endsAt)} · {row.startsAt} → {row.endsAt} · {row.items.length} product{row.items.length === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
