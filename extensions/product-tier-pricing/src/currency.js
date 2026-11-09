// tier-pricing-currency.js: shows the tier prices in the currency the customer sees. Loaded only for a customer whose
// currency is not the shop's. A discount stores its fixed and anchor prices in the shop's currency; the page and the
// checkout Function work in the customer's currency, so those prices are multiplied by the rate (Shopify.currency.rate, the
// same number the Function gets as presentmentCurrencyRate) and rounded to two decimals the way the Function rounds them.
// Percent tiers need no conversion. Amounts are written in the format the theme's own `money` filter gives in that currency:
// the block prints a sample of it, and the amount in the sample becomes a {{amount}} template. Every step comes in through
// `tools`, so each one can be tried alone.

const PRICE_KEYS = ['fixedPrice', 'anchorPrice']
const AMOUNT_IN_SAMPLE = /\d[\d.,\s'’  ]*\d/

/** The rate as a number above zero, or 0 when the text is not one. */
export function parseCurrencyRate(rateText) {
  const rate = Number(rateText)
  return rate > 0 && Number.isFinite(rate) ? rate : 0
}

/** A price in the shop's currency in the customer's, to two decimals. Multiplied before rounding, like the Function. */
export function convertPrice({ price, currencyRate }) {
  return Math.round(price * currencyRate * 100) / 100
}

/** The money format of a sample amount such as "CA$1,234.56": the amount becomes {{amount}}. '' when there is no amount in it. */
export function buildMoneyFormat(sample) {
  return AMOUNT_IN_SAMPLE.test(sample) ? sample.replace(AMOUNT_IN_SAMPLE, '{{amount}}') : ''
}

export function convertPriceOfKey({ tier, converted, currencyRate, tools }, key) {
  if (tier[key] != null) converted[key] = tools.convertPrice({ price: tier[key], currencyRate })
}

/** The tier with its fixed and anchor prices in the customer's currency; every other field as it was. */
export function convertTier({ currencyRate, tools }, tier) {
  const converted = { ...tier }
  PRICE_KEYS.forEach(tools.convertPriceOfKey.bind(null, { tier, converted, currencyRate, tools }))
  return converted
}

export function convertTierPrices({ tiers, currencyRate, tools }) {
  return tiers.map(tools.convertTier.bind(null, { currencyRate, tools }))
}

/**
 * What the widget shows for a customer in another currency: `{ isUsable, tiers, moneyFormat }`. Not usable when the rate or the
 * sample cannot be read: the widget then shows nothing, rather than prices in the wrong currency.
 */
export function showInCurrency(tools, { tiers, rateText, moneySample }) {
  const currencyRate = tools.parseCurrencyRate(rateText)
  const moneyFormat = tools.buildMoneyFormat(moneySample)
  const isUsable = currencyRate > 0 && moneyFormat !== ''
  return { isUsable, moneyFormat, tiers: isUsable ? tools.convertTierPrices({ tiers, currencyRate, tools }) : tiers }
}

export const CURRENCY_TOOLS = { parseCurrencyRate, convertPrice, buildMoneyFormat, convertPriceOfKey, convertTier, convertTierPrices }
