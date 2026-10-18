import { handleWebhook } from '@/lib/webhookHandler'
import { refreshStoredScopes } from '@/lib/storedScopes'

export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    onVerified: async ({ shop }) => {
      console.log(`Received app/scopes_update for ${shop}`)
      await refreshStoredScopes(shop)
    },
  })
}
