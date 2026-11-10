// What a box shows and does at a given moment (the facts component): its first tier, how many units are missing, the items that can be added,
// the units Quick auto-fill would add and what they cost, the tier chips, and the look of its discount. No DOM: the controller (ui.js) asks, the view (box.js) draws.
import { formatMoney, sortTiersByMinQty } from '../tierMath.js'
import { buildChips, readTierMode, COPY_TOOLS } from './copy.js'
import { FILL_TOOLS } from './items.js'
import { LOOK_TOOLS, readBoxLook } from './look.js'

export function formatAmount({ moneyFormat, tools }, amount) {
  return tools.formatMoney(amount, moneyFormat)
}

/** `{ tier, mode, missing, available, picks, cost, chips }` of a box with `units` of its bundle in the cart whose lines are `lines`. `moneyFormat` writes the chips' amounts. */
export function readFacts(tools, { box, units, lines, moneyFormat }) {
  const missing = Math.max(0, box.firstTierQty - units)
  const picks = tools.chooseQuickFill({ items: box.items, lines, missing, tools })
  const tier = tools.sortTiersByMinQty(box.tiers)[0]
  const formatMoneyText = tools.formatAmount.bind(null, { moneyFormat, tools })
  return {
    tier, mode: tools.readTierMode({ tier }), missing, available: box.items.filter(tools.isItemAvailable), picks, cost: tools.sumQuickFillCost({ picks, items: box.items, tools }),
    chips: tools.buildChips({ tiers: box.tiers, basePrice: box.basePrice, units, formatMoneyText, tools }),
  }
}

/** The look of a box: `{ background, radius }` (see look.js). */
export function readLook(tools, { box, creamFallback }) {
  return tools.readBoxLook({ style: box.style, creamFallback, tools })
}

export const FACTS_TOOLS = { ...COPY_TOOLS, ...FILL_TOOLS, ...LOOK_TOOLS, formatMoney, sortTiersByMinQty, readTierMode, buildChips, readBoxLook, formatAmount }

export const FACTS_API = { readFacts: readFacts.bind(null, FACTS_TOOLS), readLook: readLook.bind(null, FACTS_TOOLS) }
