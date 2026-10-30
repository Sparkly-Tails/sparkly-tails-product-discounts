import { shopifyQuery } from '@/lib/shopify-client'

/** The shop's own configured IANA timezone (e.g. "Europe/London") — time discounts are entered/displayed in this timezone, not UTC or the browser's. */
export async function getShopTimezone(): Promise<string> {
  const data = await shopifyQuery<{ shop: { ianaTimezone: string } }>(`query { shop { ianaTimezone } }`)
  return data.shop.ianaTimezone
}

/** The shop's currency code (e.g. "GBP"), used to write prices the way the shop does. */
export async function getShopCurrencyCode(): Promise<string> {
  const data = await shopifyQuery<{ shop: { currencyCode: string } }>(`query { shop { currencyCode } }`)
  return data.shop.currencyCode
}

export { zonedTimeToUtc } from '@/lib/zonedTime'
