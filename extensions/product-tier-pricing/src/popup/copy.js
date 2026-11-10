// The words of the pop-up and its tier chips. No DOM. An amount is written by `formatMoneyText`, a function of the amount
// that gives the text in the theme's money format and the customer's currency.
import { buildTierChips } from '../copy.js'
import { sortTiersByMinQty, withUnitAnchor } from '../tierMath.js'

/** The words that never change; the ones with a number in them are built by the functions below. */
export const POPUP_TEXT = {
  fallbackTitle: 'Your bundle',
  close: 'Close',
  add: 'Add',
  continue: 'Continue to checkout',
  unlocked: 'Tier unlocked',
  failed: 'We couldn\'t add that. Try again.',
  flashBar: '⚡ TIER 1 FLASH SALE ENDS IN',
}

export function buildHeadingText({ boxCount }) {
  return boxCount === 1 ? 'Complete your bundle' : 'Complete your bundles'
}

/** The box heading: the discount's title, or "Your bundle" when the index has none. */
export function buildBoxTitle({ title }) {
  return title ? title : POPUP_TEXT.fallbackTitle
}

/** 'fixed' for a tier with a fixed price, else 'percent'. */
export function readTierMode({ tier }) {
  return tier.fixedPrice != null ? 'fixed' : 'percent'
}

export function buildBadgeText({ tier, mode }) {
  return mode === 'fixed' ? 'Tier 1 at ' + tier.minQty + ' items' : 'Unlock ' + tier.percentOff + '% off at ' + tier.minQty + ' units'
}

/** " (Save £0.48 on these items!)": the plain price against the tier's, over the tier's quantity; nothing when the plain price is unknown or the saving rounds to nothing. */
export function buildSavingText({ tier, basePrice, formatMoneyText }) {
  const saving = basePrice === null ? 0 : (basePrice - tier.fixedPrice) * tier.minQty
  return Math.round(saving * 100) > 0 ? ' (Save ' + formatMoneyText(saving) + ' on these items!)' : ''
}

export function buildFixedIncentive({ tier, units, missing, basePrice, formatMoneyText, tools }) {
  const unlock = 'Currently ' + units + ' units selected • Add ' + missing + ' more to unlock ' + formatMoneyText(tier.fixedPrice) + '/ea'
  return unlock + tools.buildSavingText({ tier, basePrice, formatMoneyText })
}

/** The line of a box: where the customer stands and what unlocks the first tier. */
export function buildIncentiveText({ tier, units, missing, basePrice, formatMoneyText, tools }) {
  if (tools.readTierMode({ tier }) === 'fixed') return tools.buildFixedIncentive({ tier, units, missing, basePrice, formatMoneyText, tools })
  return units + ' of ' + tier.minQty + ' items selected • Add ' + missing + ' more to unlock ' + tier.percentOff + '% off the whole bundle'
}

export function buildQuickLabelText({ missing }) {
  return '⚡ Quick auto-fill: Add ' + missing + ' more items'
}

export function buildQuickButtonText({ missing }) {
  return 'Add ' + missing + ' & unlock tier'
}

/** The contracted box's quick button: what it adds and what it unlocks. */
export function buildQuickAddText({ tier, missing, formatMoneyText }) {
  const reward = tier.fixedPrice != null ? formatMoneyText(tier.fixedPrice) + '/ea' : tier.percentOff + '% OFF'
  return '⚡ Quick-add ' + missing + ' to unlock ' + reward
}

export function buildViewText({ count }) {
  return 'View & mix eligible products (' + count + ' available)'
}

/** "(+£4.95)": what Quick auto-fill adds to the cart. */
export function buildCostText({ cost, formatMoneyText }) {
  return '(+' + formatMoneyText(cost) + ')'
}

/** The quantities the chips are for: one unit, the customer's units, the first tier and the next tier. */
export function listChipQuantities({ tiers, units, tools }) {
  const sorted = tools.sortTiersByMinQty(tiers)
  return [1, units, sorted[0].minQty, Object(sorted[1]).minQty]
}

export function isKeptChip({ quantities }, chip) {
  return quantities.includes(chip.qty)
}

/** The widget's tier chips ("8 × £13.04": the total for that quantity), cut down to the four a box shows. None when the plain price is unknown. */
export function buildChips({ tiers, basePrice, units, formatMoneyText, tools }) {
  if (basePrice === null) return []
  const quantities = tools.listChipQuantities({ tiers, units, tools })
  const chips = tools.buildTierChips({ tiers: tools.withUnitAnchor(tiers), basePrice, combinedQty: units, formatMoney: formatMoneyText })
  return chips.filter(tools.isKeptChip.bind(null, { quantities }))
}

export const COPY_TOOLS = {
  readTierMode, buildSavingText, buildFixedIncentive, listChipQuantities, isKeptChip, sortTiersByMinQty, withUnitAnchor, buildTierChips,
}
