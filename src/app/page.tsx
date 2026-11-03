import HomeView from '@/home/components/HomeView'
import { loadDiscountRows } from '@/home/loadDiscountRows'
import { ROW_TOOLS } from '@/home/rowTools'
import { TABLE_TOOLS, applyTableQuery, buildTableHref, parseTableQuery } from '@/home/tableQuery'
import { getConfig } from '@/lib/config'
import { getShopCurrencyCode, getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { computeLocalFlashStatus, DISCOUNT_STATE_TOOLS } from '@/flash/discountState'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'
import { shopifyQuery } from '@/lib/shopify-client'
import { getRequestShop } from '@/lib/requestShop'
import { headers } from 'next/headers'
import { getRequestHost, REQUEST_HOST_TOOLS } from '@/lib/requestHost'
import { ensureMetricsPixelSafely, buildCollectUrl, readAppOrigin, PIXEL_TOOLS } from '@/metrics/ensurePixel'
import { getDb } from '@/lib/db'
import { readStoredScopes } from '@/lib/sessions'
import { formatMoneyAmount } from '@/home/formatMoney'
import { loadMetrics } from '@/home/loadMetrics'
import { buildMetricCards, buildFailedCards } from '@/home/buildMetricCards'
import { addDays, listRangePresets, pickShopDay } from '@/home/rangeDays'
import { buildMetricsParams, parseMetricsQuery } from '@/home/metricsQuery'
import { sumTotals } from '@/metrics/sumTotals'
import { syncOrders, SYNC_TOOLS } from '@/metrics/syncOrders'
import { queryOrders } from '@/metrics/queryOrders'
import { readGraphqlOrder, READ_ORDER_TOOLS } from '@/metrics/readOrder'
import { listBundleRows, LIST_ROWS_TOOLS } from '@/metrics/listBundleRows'
import { refreshLiveProductsSafely, REFRESH_TOOLS } from '@/metrics/refreshSettings'
import { readLiveProducts, readOrderRows, readSyncMarker, readVisitorSum, saveBundleRows, saveLiveProducts, saveTimeZone, writeSyncMarker, STORE_TOOLS } from '@/metrics/store'
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
  // The four metric cards for the chosen days; the page loads even when the numbers cannot be read.
  let cards = buildFailedCards()
  try {
      const database = getDb()
      const shop = await getRequestShop()
      const currencyCode = await getShopCurrencyCode()
      const { totals, hasPermission } = await loadMetrics({
        shop,
        nowIso,
        fromDay: range.fromDay,
        toDay: range.toDay,
        timeZone,
        readScopes: ({ shop: shopName }) => readStoredScopes(shopName),
        syncOrders: ({ shop: shopName, nowIso: now }) =>
          syncOrders({
            shop: shopName,
            nowIso: now,
            tools: {
              readMarker: ({ shop: name }) => readSyncMarker({ db: database, shop: name }),
              writeMarker: ({ shop: name, lastOrderSyncAt, backfilledUntil }) => writeSyncMarker({ db: database, shop: name, lastOrderSyncAt, backfilledUntil }),
              queryOrders: ({ shop: name, sinceIso, afterCursor }) => queryOrders({ shop: name, sinceIso, afterCursor, queryShop: ({ query, variables, shop: target }) => shopifyQuery(query, variables, target) }),
              readLiveProducts: ({ shop: name }) => readLiveProducts({ db: database, shop: name, tools: STORE_TOOLS }),
              saveRows: ({ shop: name, rows }) => saveBundleRows({ db: database, shop: name, rows }),
              readOrder: ({ node }) => readGraphqlOrder({ node, tools: READ_ORDER_TOOLS }),
              listRows: ({ order, productDiscounts }) => listBundleRows({ order, productDiscounts, tools: LIST_ROWS_TOOLS }),
              ...SYNC_TOOLS,
            },
          }),
        refresh: async ({ shop: shopName, timeZone: zone }) => {
          await saveTimeZone({ db: database, shop: shopName, timeZone: zone })
          await refreshLiveProductsSafely({
            discounts: (await getConfig()).discounts,
            getShop: async () => shopName,
            saveLiveProducts: ({ shop: name, liveProducts }) => saveLiveProducts({ db: database, shop: name, liveProducts }),
            report: (message) => console.log(message),
            tools: REFRESH_TOOLS,
          })
        },
        readRows: ({ shop: shopName, fromIso, toIso }) => readOrderRows({ db: database, shop: shopName, fromIso, toIso }),
        readVisitors: ({ shop: shopName, fromDay, toDay }) => readVisitorSum({ db: database, shop: shopName, fromDay, toDay }),
        sumTotals,
        convertToUtc: zonedTimeToUtc,
        addDays,
      })
      cards = buildMetricCards({ totals, currencyCode, hasPermission, formatMoney: formatMoneyAmount })
  } catch (error) {
    console.log(`Could not load the homepage metrics: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  const query = { ...parseTableQuery({ raw: rawQuery, tools: TABLE_TOOLS }), keep: buildMetricsParams({ raw: rawQuery, today }) }
  const view = applyTableQuery({ rows, query, tools: TABLE_TOOLS })

  // The date button keeps the table settings, and the table links keep the range (the query's `keep`).
  const tableParams = buildTableHref({ query: { ...query, keep: '' }, changes: { page: query.page } }).replace(/^\/\??/, '')
  return <HomeView view={view} query={query} version={packageJson.version} cards={cards} range={{ label: range.label, today, presets: listRangePresets({ today }), keep: tableParams }} />
}
