// Reads the widget's settings from the markup the Shopify block renders.
import { extractNumericId, withUnitAnchor } from './tierMath.js'

// Siblings that still resolve in the store. A sibling whose product was deleted
// or unpublished stays in `siblings` (its units still count toward the combined
// quantity) but is not shown in the list.
export function listedMixMatchItems(siblings) {
  return (siblings || []).filter((sibling) => sibling.listed)
}

// The numeric ids (as texts) of the variants that have no stock, from the block's data; null when the block gave
// none, which leaves the widget showing.
export function parseSoldOutVariantIds(raw) {
  try {
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? ids.map(String) : null
  } catch {
    return null
  }
}

// False only for a variant the block listed as sold out; an unknown list or variant never hides the widget.
export function isVariantAvailable({ soldOutVariantIds, variantId }) {
  if (!soldOutVariantIds || variantId == null) return true
  return !soldOutVariantIds.includes(String(variantId))
}

/** The currency Shopify says the customer sees and its rate, as texts ('' when the page has none). Takes `window.Shopify`. */
export function readShopifyCurrency(shopify) {
  const currency = Object(Object(shopify).currency)
  return { activeCurrency: String(currency.active || ''), rateText: String(currency.rate || '') }
}

/** True only when both currencies are known and differ; an unknown one keeps the shop's own way (nothing converted). */
export function isForeignCurrency({ activeCurrency, shopCurrency }) {
  return activeCurrency !== '' && shopCurrency !== '' && activeCurrency !== shopCurrency
}

/** A JSON text holding one string, as Liquid's json filter prints it; '' when it is not. */
export function parseText(text) {
  try {
    const value = JSON.parse(text)
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

/** What the block and the page say about currency: the sample of the money filter, the rate, and whether the customer sees another currency than the shop's. */
export function readContainerCurrency({ container, shopify, tools }) {
  const { activeCurrency, rateText } = tools.readShopifyCurrency(shopify)
  const shopCurrency = tools.parseText(container.dataset.shopCurrency)
  return { rateText, moneySample: tools.parseText(container.dataset.moneySample), isForeignCurrency: tools.isForeignCurrency({ activeCurrency, shopCurrency }) }
}

export const CURRENCY_READERS = { readShopifyCurrency, isForeignCurrency, parseText }

export function parseWidgetConfig(container) {
  const discount = JSON.parse(container.dataset.discount)
  const moneyFormat = JSON.parse(container.dataset.moneyFormat)
  const productId = JSON.parse(container.dataset.productId)
  const tiers = withUnitAnchor(discount.tiers)

  const selfProductId = extractNumericId(productId)
  const ownVariantIds = discount.ownVariantIds ? discount.ownVariantIds.map(extractNumericId) : null
  const ownMembers = ownVariantIds
    ? ownVariantIds.map((v) => ({ productId: selfProductId, variantId: v }))
    : [{ productId: selfProductId }]
  const ownVariantOptions = (discount.ownVariantOptions || []).map((o) => ({
    variantId: extractNumericId(o.variantId),
    title: o.title,
    url: o.url,
    imageUrl: o.imageUrl || null,
    price: o.price,
    available: o.available,
    cartVariantId: o.cartVariantId != null ? String(o.cartVariantId) : null,
  }))
  const siblingMembers = (discount.siblings || []).map((s) => ({
    productId: extractNumericId(s.productId),
    variantId: s.variantId ? extractNumericId(s.variantId) : undefined,
  }))
  const allMembers = ownMembers.concat(siblingMembers)

  return {
    moneyFormat,
    productId: selfProductId,
    tiers,
    title: discount.title,
    highDemand: container.dataset.highDemand === 'true',
    flash: parseFlashConfig(container.dataset.flash),
    soldOutVariantIds: parseSoldOutVariantIds(container.dataset.soldOutVariantIds),
    hasTiers: !!(tiers && tiers.length > 0),
    ownVariantIds,
    ownVariantOptions,
    // A product without a tier discount has no discount blob (so no
    // selfVariantId); the block still renders the selected variant's id on the container.
    initialVariantId: discount.selfVariantId
      ? extractNumericId(discount.selfVariantId)
      : container.dataset.selectedVariantId || null,
    allMembers,
    mixMatchListItems: listedMixMatchItems(discount.siblings),
    isGroup: allMembers.length > 1,
  }
}

// { startsAtUnix, endsAtUnix, showTeaser } of a flash sale, or null for a discount that is not one.
export function parseFlashConfig(raw) {
  try {
    const flash = JSON.parse(raw || 'null')
    return flash && typeof flash.startsAtUnix === 'number' && typeof flash.endsAtUnix === 'number' ? flash : null
  } catch {
    return null
  }
}

export function queryWidgetElements(container) {
  return {
    rootEl: container,
    flashEl: container.querySelector('[data-tier-pricing-flash]'),
    flashLabelEl: container.querySelector('[data-flash-label]'),
    flashTimerEl: container.querySelector('[data-flash-timer]'),
    flashAsideEl: container.querySelector('[data-flash-aside]'),
    flashChipEl: container.querySelector('[data-flash-chip]'),
    flashChipTextEl: container.querySelector('[data-flash-chip-text]'),
    tagEl: container.querySelector('[data-tier-pricing-tag]'),
    promoEl: container.querySelector('[data-tier-pricing-promo]'),
    cardEl: container.querySelector('[data-tier-pricing-card]'),
    statusEl: container.querySelector('[data-tier-pricing-status]'),
    asideEl: container.querySelector('[data-tier-pricing-aside]'),
    fillEl: container.querySelector('[data-tier-pricing-fill]'),
    barEl: container.querySelector('[data-tier-pricing-bar]'),
    railEl: container.querySelector('[data-tier-pricing-rail]'),
    markersEl: container.querySelector('[data-tier-pricing-markers]'),
    dotEl: container.querySelector('[data-tier-pricing-dot]'),
    tiersEl: container.querySelector('[data-tier-pricing-tiers]'),
    drawerEl: container.querySelector('[data-tier-pricing-drawer]'),
    toggleEl: container.querySelector('[data-tier-pricing-toggle]'),
    listEl: container.querySelector('[data-tier-pricing-list]'),
    chosenEl: container.querySelector('[data-tier-pricing-chosen]'),
  }
}
