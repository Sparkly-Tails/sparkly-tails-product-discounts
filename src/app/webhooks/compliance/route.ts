import { complianceAction, handleWebhook } from '@/lib/webhookHandler'
import { deleteShopSessions } from '@/lib/sessions'
import { getDb } from '@/lib/db'
import { deleteShopMetrics } from '@/metrics/store'

// Mandatory compliance topics: customers/data_request, customers/redact, shop/redact.
// This app stores Shopify sessions and shop-level metrics (counts and order totals), no customer data. Payloads are never logged.
export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    topics: ['customers/data_request', 'customers/redact', 'shop/redact'],
    onVerified: async ({ shop, topic }) => {
      const action = complianceAction(topic)
      console.log(`Received ${topic} for ${shop}: ${action}`)
      if (action === 'delete-sessions') await deleteShopSessions(shop)
      if (action === 'delete-sessions') await deleteShopMetrics({ db: getDb(), shop })
    },
  })
}
