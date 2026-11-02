import { register } from '@shopify/web-pixels-extension'
import { buildViewPayload } from './buildViewPayload.js'

// Counts product page views for the app's homepage. It reports the shop, the product and the anonymous client id,
// and only runs for visitors who allow analytics (see customer_privacy in shopify.extension.toml).
register(({ analytics, settings }) => {
  analytics.subscribe('product_viewed', (event) => {
    const productId = event.data?.productVariant?.product?.id
    if (!productId || !settings.collectUrl || !settings.shop) return
    fetch(settings.collectUrl, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'text/plain' },
      body: buildViewPayload({ shop: settings.shop, productId, clientId: event.clientId }),
    })
  })
})
