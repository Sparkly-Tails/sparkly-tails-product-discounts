import { headers } from 'next/headers'
import { getConfig } from '@/lib/config'
import { getDb } from '@/lib/db'
import { getRequestHost, REQUEST_HOST_TOOLS } from '@/lib/requestHost'
import { getRequestShop } from '@/lib/requestShop'
import { shopifyQuery } from '@/lib/shopify-client'
import { getShopCurrencyCode, getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { readStoredScopes } from '@/lib/sessions'
import { formatMoneyAmount } from '@/home/formatMoney'
import { loadMetrics } from '@/home/loadMetrics'
import { buildFailedCards, buildMetricCards } from '@/home/buildMetricCards'
import { parseMetricsQuery } from '@/home/metricsQuery'
import { addDays, pickShopDay } from '@/home/rangeDays'
import { sumTotals } from '@/metrics/sumTotals'
import { buildCollectUrl, ensureMetricsPixelSafely, PIXEL_TOOLS, readAppOrigin } from '@/metrics/ensurePixel'
import { syncOrders, SYNC_TOOLS } from '@/metrics/syncOrders'
import { queryOrders } from '@/metrics/queryOrders'
import { readGraphqlOrder, READ_ORDER_TOOLS } from '@/metrics/readOrder'
import { listBundleRows, LIST_ROWS_TOOLS } from '@/metrics/listBundleRows'
import { refreshLiveProductsSafely, REFRESH_TOOLS } from '@/metrics/refreshSettings'
import { readLiveProducts, readOrderRows, readSyncMarker, readVisitorSum, saveBundleRows, saveLiveProducts, saveTimeZone, writeSyncMarker, STORE_TOOLS } from '@/metrics/store'

/**
 * The four homepage cards for the range in the address, as JSON. The homepage asks for them from the browser once it
 * has loaded, so reading orders from Shopify and the database never holds the page up. The proxy has already checked
 * the session token (this path is not exempt), and every answer is 200 with cards, the failed cards when the numbers
 * cannot be read, so the page always has something to show. This is also where the metrics pixel is kept pointing at
 * the address the app is served from, as it was when the page did the work.
 */
export async function GET(request: Request): Promise<Response> {
  const pixelCheck = ensureMetricsPixelSafely({
    collectUrl: buildCollectUrl({ origin: readAppOrigin({ host: await getRequestHost({ readHeaders: headers, tools: REQUEST_HOST_TOOLS }), protocol: 'https' }) }),
    getShop: () => getRequestShop(),
    queryShop: ({ query, variables, shop }) => shopifyQuery(query, variables, shop),
    report: (message) => console.log(message),
    tools: PIXEL_TOOLS,
  })

  let cards = buildFailedCards()
  let days: { fromDay: string; toDay: string } | null = null
  try {
    const timeZone = await getShopTimezone()
    const nowIso = new Date().toISOString()
    const today = pickShopDay({ nowIso, timeZone })
    const range = parseMetricsQuery({ raw: Object.fromEntries(new URL(request.url).searchParams), today })
    days = { fromDay: range.fromDay, toDay: range.toDay }
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
  await pixelCheck
  return Response.json({ cards, range: days }, { headers: { 'Cache-Control': 'no-store' } })
}
