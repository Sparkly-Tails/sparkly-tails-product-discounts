// What a box shows and does at a given moment (the facts component): its first tier, how many units are missing, the items that can be added (as rows),
// the units Quick auto-fill would add and what they cost, the tier chips, the progress rail with its milestones, and the look of its discount. No DOM: the controller (ui.js) asks, the view (box.js) draws.
import { formatMoney, sortTiersByMinQty } from '../tierMath.js'
import { buildChips, buildCostText, readTierMode, COPY_TOOLS } from './copy.js'
import { FILL_TOOLS } from './items.js'
import { LOOK_TOOLS, readBoxLook } from './look.js'
import { MILESTONE_TOOLS } from './milestones.js'
import { ROW_TOOLS } from './rows.js'

export function formatAmount({ moneyFormat, tools }, amount) {
  return tools.formatMoney(amount, moneyFormat)
}

/** `{ tier, mode, missing, available, picks, cost, costText, chips, progress, milestones, rows, preview }` of a box with `units` of its bundle in the cart whose lines are `lines`. `moneyFormat` writes the amounts. */
export function readFacts(tools, { box, units, lines, moneyFormat }) {
  const missing = Math.max(0, box.firstTierQty - units)
  const picks = tools.chooseQuickFill({ items: box.items, lines, missing, tools })
  const tier = tools.sortTiersByMinQty(box.tiers)[0]
  const formatMoneyText = tools.formatAmount.bind(null, { moneyFormat, tools })
  const available = box.items.filter(tools.isItemAvailable)
  const cost = tools.sumQuickFillCost({ picks, items: box.items, tools })
  return {
    tier, mode: tools.readTierMode({ tier }), missing, available, picks, cost, costText: tools.buildCostText({ cost, formatMoneyText }),
    chips: tools.buildChips({ tiers: box.tiers, basePrice: tools.readLowestPrice({ items: box.items, tools }), units, formatMoneyText, tools }),
    progress: tools.readProgress({ units, firstQty: box.firstTierQty }), milestones: tools.buildMilestones({ tiers: box.tiers, units, tools }),
    rows: available.map(tools.buildRow.bind(null, { lines, tier, formatMoneyText, tools })), preview: tools.listCartEntries({ items: box.items, lines, tools }),
  }
}

/** The look of a box: `{ background, radius }` (see look.js). */
export function readLook(tools, { box, creamFallback }) {
  return tools.readBoxLook({ style: box.style, creamFallback, tools })
}

export const FACTS_TOOLS = { ...COPY_TOOLS, ...FILL_TOOLS, ...LOOK_TOOLS, ...MILESTONE_TOOLS, ...ROW_TOOLS, formatMoney, sortTiersByMinQty, readTierMode, buildChips, buildCostText, readBoxLook, formatAmount }

export const FACTS_API = { readFacts: readFacts.bind(null, FACTS_TOOLS), readLook: readLook.bind(null, FACTS_TOOLS) }
