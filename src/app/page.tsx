import HomeView from '@/home/components/HomeView'
import { loadDiscountRows } from '@/home/loadDiscountRows'
import { ROW_TOOLS } from '@/home/rowTools'
import { TABLE_TOOLS, applyTableQuery, parseTableQuery } from '@/home/tableQuery'
import { getConfig } from '@/lib/config'
import { getShopCurrencyCode, getShopTimezone } from '@/lib/shop'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'
import { computeTimeDiscountStatusLabel, getTimeDiscountsConfig } from '@/timeDiscounts/config'
import packageJson from '../../package.json'

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // First, so the store has its tier checkout discount; it never throws, so the page always loads.
  await ensureTierDiscountSafely()

  const rows = await loadDiscountRows({
    loadTierDiscounts: async () => (await getConfig()).discounts,
    loadTimeDiscounts: async () => (await getTimeDiscountsConfig()).discounts,
    loadTimezone: getShopTimezone,
    loadCurrencyCode: getShopCurrencyCode,
    getStatusLabel: ({ startsAt, endsAt, timezone }) => computeTimeDiscountStatusLabel(startsAt, endsAt, timezone),
    tools: ROW_TOOLS,
  })
  const query = parseTableQuery({ raw: await searchParams, tools: TABLE_TOOLS })
  const view = applyTableQuery({ rows, query, tools: TABLE_TOOLS })

  return <HomeView view={view} query={query} version={packageJson.version} />
}
