import { handleWebhook } from '@/lib/webhookHandler'
import { getDb } from '@/lib/db'
import { recordOrder } from '@/metrics/recordOrder'
import { readWebhookOrder, READ_ORDER_TOOLS } from '@/metrics/readOrder'
import { listBundleRows, LIST_ROWS_TOOLS } from '@/metrics/listBundleRows'
import { readLiveProducts, saveBundleRows, STORE_TOOLS } from '@/metrics/store'

/** A paid order is turned into one row per bundle discount. A failure answers 500, so Shopify delivers the order again (saving twice changes nothing). */
export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    topics: ['orders/paid'],
    onVerified: async ({ shop, body }) => {
      const database = getDb()
      const saved = await recordOrder({
        body,
        shop,
        tools: {
          readOrder: ({ body: text }) => readWebhookOrder({ body: text, tools: READ_ORDER_TOOLS }),
          readLiveProducts: ({ shop: shopName }) => readLiveProducts({ db: database, shop: shopName, tools: STORE_TOOLS }),
          listRows: ({ order, productDiscounts }) => listBundleRows({ order, productDiscounts, tools: LIST_ROWS_TOOLS }),
          saveRows: ({ shop: shopName, rows }) => saveBundleRows({ db: database, shop: shopName, rows }),
        },
      })
      console.log(`Received orders/paid for ${shop}: ${saved} bundle row(s) saved`)
    },
  })
}
