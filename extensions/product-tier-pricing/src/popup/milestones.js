// The progress rail of a box: how full it is and the milestones under it ("1 item", "5 in cart", "8 items (Tier 1)", "16 items (Tier 2)").
// No DOM, nothing outside the arguments; the functions it calls come in as `tools`.

/** How full the rail is, 0 to 100: the units in the cart as a share of the first tier's quantity. */
export function readProgress({ units, firstQty }) {
  return Math.min(100, Math.round(units * 100 / firstQty))
}

export function isShownSpec(spec) {
  return spec.show
}

/** The milestones a box can show, in order: one item, the units in the cart, the first tier and the next tier. `show` is false for the ones that would repeat another or do not exist. */
export function listMilestoneSpecs({ tiers, units, tools }) {
  const sorted = tools.sortTiersByMinQty(tiers)
  const nextQty = Object(sorted[1]).minQty
  return [
    { qty: 1, label: '1 item', show: units > 1 },
    { qty: units, label: units + ' in cart', show: units > 0 },
    { qty: sorted[0].minQty, label: sorted[0].minQty + ' items (Tier 1)', show: true },
    { qty: nextQty, label: nextQty + ' items (Tier 2)', show: sorted.length > 1 },
  ].filter(tools.isShownSpec)
}

export function readReachedState({ qty, units }) {
  return qty === units ? 'current' : 'done'
}

export function readAheadState({ qty, firstQty }) {
  return qty === firstQty ? 'target' : 'later'
}

/** 'done' and 'current' for the milestones the customer has reached, 'target' for the first tier, 'later' for the rest. */
export function readMilestoneState({ qty, units, firstQty, tools }) {
  return qty <= units ? tools.readReachedState({ qty, units }) : tools.readAheadState({ qty, firstQty })
}

export function buildMilestone({ units, firstQty, tools }, spec) {
  return { qty: spec.qty, label: spec.label, state: tools.readMilestoneState({ qty: spec.qty, units, firstQty, tools }) }
}

/** `[{ qty, label, state }]` under the rail. */
export function buildMilestones({ tiers, units, tools }) {
  const firstQty = tools.sortTiersByMinQty(tiers)[0].minQty
  return tools.listMilestoneSpecs({ tiers, units, tools }).map(tools.buildMilestone.bind(null, { units, firstQty, tools }))
}

export const MILESTONE_TOOLS = { readProgress, isShownSpec, listMilestoneSpecs, readReachedState, readAheadState, readMilestoneState, buildMilestone, buildMilestones }
