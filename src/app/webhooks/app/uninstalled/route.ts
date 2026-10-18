import { handleWebhook } from '@/lib/webhookHandler'
import { deleteShopSessions } from '@/lib/sessions'

export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    topics: ['app/uninstalled'],
    onVerified: async ({ shop }) => {
      console.log(`Received app/uninstalled for ${shop}`)
      await deleteShopSessions(shop)
    },
  })
}
