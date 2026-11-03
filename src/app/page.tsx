import HomeView from '@/home/components/HomeView'
import { loadDiscountRows } from '@/home/loadDiscountRows'
import { ROW_TOOLS } from '@/home/rowTools'
import { TABLE_TOOLS, applyTableQuery, buildTableHref, parseTableQuery } from '@/home/tableQuery'
import { getConfig } from '@/lib/config'
import { getShopCurrencyCode, getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { computeLocalFlashStatus, DISCOUNT_STATE_TOOLS } from '@/flash/discountState'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'
import { buildMetricsParams, buildMetricsUrl, parseMetricsQuery } from '@/home/metricsQuery'
import { listRangePresets, pickShopDay } from '@/home/rangeDays'
import packageJson from '../../package.json'

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // First, so the store has its tier checkout discount; it never throws, so the page always loads.
  await ensureTierDiscountSafely()

  const timeZone = await getShopTimezone()
  const nowIso = new Date().toISOString()
  const today = pickShopDay({ nowIso, timeZone })
  const rawQuery = await searchParams
  const range = parseMetricsQuery({ raw: rawQuery, today })

  const rows = await loadDiscountRows({
    loadTierDiscounts: async () => (await getConfig()).discounts,
    loadTimezone: async () => timeZone,
    loadCurrencyCode: getShopCurrencyCode,
    getFlashStatus: ({ startsAt, endsAt, timezone }) =>
      computeLocalFlashStatus({ startsAt, endsAt, timeZone: timezone, nowMs: new Date().getTime(), convertToUtc: zonedTimeToUtc, tools: DISCOUNT_STATE_TOOLS }),
    tools: ROW_TOOLS,
  })
  const query = { ...parseTableQuery({ raw: rawQuery, tools: TABLE_TOOLS }), keep: buildMetricsParams({ raw: rawQuery, today }) }
  const view = applyTableQuery({ rows, query, tools: TABLE_TOOLS })

  // The date button keeps the table settings, and the table links keep the range (the query's `keep`).
  const tableParams = buildTableHref({ query: { ...query, keep: '' }, changes: { page: query.page } }).replace(/^\/\??/, '')
  return <HomeView view={view} query={query} version={packageJson.version} metricsUrl={buildMetricsUrl({ params: query.keep })} range={{ label: range.label, today, presets: listRangePresets({ today }), keep: tableParams }} />
}
