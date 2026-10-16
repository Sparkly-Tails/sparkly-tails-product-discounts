import { handleWebhook, parseScopesPayload } from '@/lib/webhookHandler'
import { updateStoredScope } from '@/lib/sessions'

export async function POST(request: Request) {
  return handleWebhook(request, {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    onVerified: async ({ shop, body }) => {
      console.log(`Received app/scopes_update for ${shop}`)
      const scopes = parseScopesPayload(body)
      if (scopes) await updateStoredScope(shop, scopes)
    },
  })
}
