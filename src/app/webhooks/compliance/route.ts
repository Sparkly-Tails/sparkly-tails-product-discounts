import { complianceAction, handleWebhook } from '@/lib/webhookHandler'
import { deleteShopSessions } from '@/lib/sessions'

// Mandatory compliance topics: customers/data_request, customers/redact, shop/redact.
// This app stores only Shopify sessions, no customer data. Payloads are never logged.
export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    topics: ['customers/data_request', 'customers/redact', 'shop/redact'],
    onVerified: async ({ shop, topic }) => {
      const action = complianceAction(topic)
      console.log(`Received ${topic} for ${shop}: ${action}`)
      if (action === 'delete-sessions') await deleteShopSessions(shop)
    },
  })
}
