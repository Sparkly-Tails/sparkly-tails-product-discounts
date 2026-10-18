import { handleWebhook } from '@/lib/webhookHandler'
import { deleteShopSessions } from '@/lib/sessions'
import { probeStoredToken } from '@/lib/uninstallTokenProbe'

export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    topics: ['app/uninstalled'],
    onVerified: async ({ shop }) => {
      console.log(`Received app/uninstalled for ${shop}`)
      // Temporary experiment: does the stored token still work in this webhook? Never blocks the deletion.
      await probeStoredToken(shop).catch(() => {})
      await deleteShopSessions(shop)
    },
  })
}
