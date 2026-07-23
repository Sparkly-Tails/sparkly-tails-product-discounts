// Run once, manually, after the function is deployed and its ID is known.
// Usage: node scripts/activate-discount.mjs <functionId>
const functionId = process.argv[2]
if (!functionId) {
  console.error('Usage: node scripts/activate-discount.mjs <functionId>')
  process.exit(1)
}

const shop = process.env.SHOPIFY_SHOP
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN

if (!shop || !accessToken) {
  console.error('Set SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN before running this script.')
  process.exit(1)
}

const res = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': accessToken,
  },
  body: JSON.stringify({
    query: `mutation activateDiscount($functionId: String!) {
      discountAutomaticAppCreate(automaticAppDiscount: {
        title: "Product tier discounts"
        functionId: $functionId
        startsAt: "${new Date().toISOString()}"
        discountClasses: [PRODUCT]
      }) {
        automaticAppDiscount { discountId title status }
        userErrors { field message code }
      }
    }`,
    variables: { functionId },
  }),
})

const json = await res.json()
console.log(JSON.stringify(json, null, 2))

if (json.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
  console.error('Activation failed — see userErrors above.')
  process.exit(1)
}

console.log('Discount activated:', json.data.discountAutomaticAppCreate.automaticAppDiscount)
