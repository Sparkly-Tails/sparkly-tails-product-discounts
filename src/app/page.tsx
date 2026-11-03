import HomeView from '@/home/components/HomeView'
import { loadDiscountRows } from '@/home/loadDiscountRows'
import { ROW_TOOLS } from '@/home/rowTools'
import { TABLE_TOOLS, applyTableQuery, parseTableQuery } from '@/home/tableQuery'
import { getConfig } from '@/lib/config'
import { getShopCurrencyCode, getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { computeLocalFlashStatus, DISCOUNT_STATE_TOOLS } from '@/flash/discountState'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'
import { shopifyQuery } from '@/lib/shopify-client'
import { getRequestShop } from '@/lib/requestShop'
import { headers } from 'next/headers'
import { getRequestHost, REQUEST_HOST_TOOLS } from '@/lib/requestHost'
import { ensureMetricsPixelSafely, buildCollectUrl, readAppOrigin, PIXEL_TOOLS } from '@/metrics/ensurePixel'
import packageJson from '../../package.json'

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // First, so the store has its tier checkout discount; it never throws, so the page always loads.
  await ensureTierDiscountSafely()
  // Then the pixel that counts product views; it never throws either, and takes the app's address from this very request.
  await ensureMetricsPixelSafely({
    collectUrl: buildCollectUrl({ origin: readAppOrigin({ host: await getRequestHost({ readHeaders: headers, tools: REQUEST_HOST_TOOLS }), protocol: 'https' }) }),
    getShop: () => getRequestShop(),
    queryShop: ({ query, variables, shop }) => shopifyQuery(query, variables, shop),
    report: (message) => console.log(message),
    tools: PIXEL_TOOLS,
  })

  const rows = await loadDiscountRows({
    loadTierDiscounts: async () => (await getConfig()).discounts,
    loadTimezone: getShopTimezone,
    loadCurrencyCode: getShopCurrencyCode,
    getFlashStatus: ({ startsAt, endsAt, timezone }) =>
      computeLocalFlashStatus({ startsAt, endsAt, timeZone: timezone, nowMs: new Date().getTime(), convertToUtc: zonedTimeToUtc, tools: DISCOUNT_STATE_TOOLS }),
    tools: ROW_TOOLS,
  })
  const query = parseTableQuery({ raw: await searchParams, tools: TABLE_TOOLS })
  const view = applyTableQuery({ rows, query, tools: TABLE_TOOLS })

  return <HomeView view={view} query={query} version={packageJson.version} />
}
