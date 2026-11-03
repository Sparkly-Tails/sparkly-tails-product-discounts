// The only data a view sends: the shop, the product and the pixel's own anonymous client id.
export function buildViewPayload({ shop, productId, clientId }) {
  return JSON.stringify({ shop, productId: `gid://shopify/Product/${productId}`, clientId })
}
