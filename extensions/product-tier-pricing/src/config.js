// Reads the widget's settings from the markup the Shopify block renders.
import { extractNumericId, withUnitAnchor } from './tierMath.js'

// Siblings that still resolve in the store. A sibling whose product was deleted
// or unpublished stays in `siblings` (its units still count toward the combined
// quantity) but is not shown in the list.
export function listedMixMatchItems(siblings) {
  return (siblings || []).filter((sibling) => sibling.listed)
}

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
    hasTiers: !!(tiers && tiers.length > 0),
    ownVariantIds,
    ownVariantOptions,
    // A product with only a time-based discount has no tier discount blob
    // (so no selfVariantId); the block still renders the selected variant's
    // id on the container, and the sale price depends on it from first paint.
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
    flashEl: container.querySelector('[data-tier-pricing-flash]'),
    flashLabelEl: container.querySelector('[data-flash-label]'),
    flashTimerEl: container.querySelector('[data-flash-timer]'),
    flashAsideEl: container.querySelector('[data-flash-aside]'),
    flashChipEl: container.querySelector('[data-flash-chip]'),
    flashChipTextEl: container.querySelector('[data-flash-chip-text]'),
    priceEl: container.querySelector('[data-tier-pricing-price]'),
    eachLabelEl: container.querySelector('[data-tier-pricing-each-label]'),
    struckEl: container.querySelector('[data-tier-pricing-struck]'),
    nowLabelEl: container.querySelector('[data-tier-pricing-now-label]'),
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
