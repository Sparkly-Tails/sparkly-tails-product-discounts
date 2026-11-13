// Which bundles are due for the pop-up when Checkout is pressed. Pure: what it needs comes in as arguments, the functions it calls as `tools`.
import { flashPhase } from '../flash.js'
import { UNIT_TOOLS } from './units.js'
import { buildShownKey, isShown } from './session.js'

/** The smallest quantity at which any tier applies; 0 for a discount without tiers, which is then never incomplete. */
export function readFirstTierQty({ tiers }) {
  return tiers.length === 0 ? 0 : Math.min(...tiers.map((tier) => tier.minQty))
}

/** True when the cart holds at least one unit of the bundle and fewer than its first tier asks for. */
export function isBundleIncomplete({ units, firstTierQty }) {
  return units >= 1 && units < firstTierQty
}

/** A regular discount always counts; a flash sale only while it runs (the cards' rule). */
export function isDiscountRunning({ discount, nowSeconds, tools }) {
  return !discount.flash || tools.flashPhase({ nowSeconds, startsAtUnix: discount.flash.startsAtUnix, endsAtUnix: discount.flash.endsAtUnix }) === 'running'
}

/** True when the bundle is one step from its tier, running, and this session has not seen it yet (a storage that remembers nothing, see readStorage in core.js, makes every press the first). */
export function isDiscountDue({ discount, units, firstTierQty, shownKey, nowSeconds, storage, tools }) {
  return tools.isBundleIncomplete({ units, firstTierQty }) && tools.isDiscountRunning({ discount, nowSeconds, tools }) && !tools.isShown({ storage, key: shownKey })
}

/** The discount as a one-item list with its units, first tier and "shown" key when it is due, else an empty list. */
export function describeDueBundle({ lines, nowSeconds, storage, tools }, discount) {
  const units = tools.countBundleUnits({ lines, members: discount.members, tools })
  const firstTierQty = tools.readFirstTierQty({ tiers: discount.tiers })
  const shownKey = tools.buildShownKey({ discount })
  return tools.isDiscountDue({ discount, units, firstTierQty, shownKey, nowSeconds, storage, tools }) ? [{ discount, units, firstTierQty, shownKey }] : []
}

/** The bundles to show, in the index's order: `[{ discount, units, firstTierQty, shownKey }]`. */
export function listDueBundles({ discounts, lines, nowSeconds, storage, tools }) {
  return discounts.flatMap(tools.describeDueBundle.bind(null, { lines, nowSeconds, storage, tools }))
}

export const DUE_TOOLS = {
  ...UNIT_TOOLS, readFirstTierQty, isBundleIncomplete, isDiscountRunning, isDiscountDue, describeDueBundle, listDueBundles, buildShownKey, isShown, flashPhase,
}
