// The parts of a box that the frame (box.js) puts in it, and what their controls do (the parts component): the progress rail, the tier chips, the list of items with its
// quantity steppers and "Show more", the Quick auto-fill row, and the preview and buttons of a contracted box. Nothing here reads the page: the node maker, the amount writer
// and the functions it calls come in as arguments. `input` is what the frame hands over: { make, facts, formatText, quantities, showAll }.
import {
  POPUP_TEXT, buildQuickLabelText, buildQuickButtonText, buildQuickAddText, buildViewText, buildCostText, buildShowingText, buildMoreText, buildPreviewText,
} from './copy.js'

const PAGE_SIZE = 4
const MAX_QUANTITY = 99

/** The units chosen for an item, 1 until the customer changes them. */
export function readQuantity({ quantities, variantId }) {
  const stored = quantities[variantId]
  return stored === undefined ? 1 : stored
}

/** One stop under the rail: a small circle with the quantity (hidden from screen readers, the caption already says it) above the caption. */
export function buildMilestone(make, milestone) {
  const marker = make({ tag: 'span', name: 'marker', text: String(milestone.qty), attrs: [['aria-hidden', 'true']] })
  const caption = make({ tag: 'span', name: 'caption', text: milestone.label })
  return make({ tag: 'li', name: 'milestone', attrs: [['data-state', milestone.state]], kids: [marker, caption] })
}

/** The progress rail with the milestones under it. */
export function buildRail({ make, facts, tools }) {
  const fill = make({ tag: 'div', name: 'fill', attrs: [['style', 'width:' + facts.progress + '%'], ['data-progress', String(facts.progress)]] })
  const track = make({ tag: 'div', name: 'track', kids: [fill] })
  return make({ tag: 'div', name: 'rail', kids: [track, make({ tag: 'ol', name: 'milestones', kids: facts.milestones.map(tools.buildMilestone.bind(null, make)) })] })
}

export function buildChip(make, chip) {
  return make({ tag: 'li', name: 'chip', text: chip.label, attrs: [['data-chip', chip.tone]] })
}

/** The tier chips, or nothing when the bundle has no single plain price. */
export function buildChipList({ make, facts, tools }) {
  return facts.chips.length === 0 ? null : make({ tag: 'ul', name: 'chips', kids: facts.chips.map(tools.buildChip.bind(null, make)) })
}

/** The item's picture, or an empty tile when it has none. */
export function buildPicture({ make, row }) {
  return row.imageUrl === null ? make({ tag: 'span', name: 'tile' }) : make({ tag: 'img', name: 'picture', attrs: [['src', row.imageUrl], ['alt', ''], ['loading', 'lazy']] })
}

export function buildCount({ make, row }) {
  return row.inCart > 0 ? make({ tag: 'span', name: 'count', text: row.inCart + ' in cart', attrs: [['data-count', '']] }) : null
}

export function buildStepButton({ make, row, action, symbol, label }) {
  return make({ tag: 'button', name: 'step', text: symbol, attrs: [['type', 'button'], ['aria-label', label + ': ' + row.label], ['data-action', action], ['data-variant', row.variantId]] })
}

/** The − 1 + control that sets how many units of the item Add puts in the cart. */
export function buildStepper(context, row) {
  const { make, quantities, tools } = context
  const quantity = make({ tag: 'span', name: 'quantity', text: String(tools.readQuantity({ quantities, variantId: row.variantId })), attrs: [['data-quantity', '']] })
  const less = tools.buildStepButton({ make, row, action: 'minus', symbol: '−', label: POPUP_TEXT.less })
  const more = tools.buildStepButton({ make, row, action: 'plus', symbol: '+', label: POPUP_TEXT.more })
  return make({ tag: 'div', name: 'stepper', attrs: [['role', 'group']], kids: [less, quantity, more] })
}

export function buildItemRow(context, row) {
  const { make, tools } = context
  const name = make({ tag: 'span', name: 'name', text: row.label, attrs: [['data-name', '']] })
  const rate = make({ tag: 'span', name: 'rate', text: POPUP_TEXT.rate + row.rateText, attrs: [['data-rate', '']] })
  const info = make({ tag: 'div', name: 'info', kids: [make({ tag: 'div', name: 'line', kids: [name, tools.buildCount({ make, row })] }), rate] })
  const add = make({ tag: 'button', name: 'add', text: POPUP_TEXT.add, attrs: [['type', 'button'], ['data-action', 'add'], ['data-variant', row.variantId]] })
  return make({ tag: 'li', name: 'item', attrs: [['data-item', row.variantId]], kids: [tools.buildPicture({ make, row }), info, tools.buildStepper(context, row), add] })
}

/** The first rows, or all of them once the customer has asked for more. */
export function listVisibleRows({ rows, showAll }) {
  return showAll ? rows : rows.slice(0, PAGE_SIZE)
}

export function buildItemList(context) {
  const rows = context.tools.listVisibleRows({ rows: context.facts.rows, showAll: context.showAll })
  return context.make({ tag: 'ul', name: 'items', kids: rows.map(context.tools.buildItemRow.bind(null, context)) })
}

/** "Showing 4 of 12 eligible items" with the button that lists more or fewer. */
export function buildMoreRow({ make, facts, showAll, tools }) {
  const total = facts.rows.length
  const button = make({
    tag: 'button', name: 'more', text: tools.buildMoreText({ count: total - PAGE_SIZE, isOpen: showAll }), attrs: [['type', 'button'], ['aria-expanded', String(showAll)], ['data-action', 'reveal']],
  })
  return make({ tag: 'div', name: 'paging', kids: [make({ tag: 'span', text: tools.buildShowingText({ shown: showAll ? total : PAGE_SIZE, total }) }), button] })
}

/** The paging row, only for a box with more items than one page holds. */
export function buildPagingParts(context) {
  return context.facts.rows.length > PAGE_SIZE ? [context.tools.buildMoreRow(context)] : []
}

export function buildQuickRow(context) {
  const { make, facts, tools } = context
  const label = tools.buildQuickLabelText({ missing: facts.missing }) + ' ' + facts.costText
  const button = make({ tag: 'button', name: 'quick-button', text: tools.buildQuickButtonText({ missing: facts.missing }), attrs: [['type', 'button'], ['data-action', 'quick']] })
  return make({ tag: 'div', name: 'quick', kids: [make({ tag: 'span', text: label }), button] })
}

/** The list of items, its paging and the Quick auto-fill row of an expanded box; nothing once the first tier is reached. */
export function buildAddParts(tools, input) {
  const context = { ...input, tools }
  const head = [context.make({ tag: 'p', name: 'label', text: POPUP_TEXT.listLabel }), tools.buildItemList(context)]
  return input.facts.missing === 0 ? [] : head.concat(tools.buildPagingParts(context), [tools.buildQuickRow(context)])
}

export function buildPreview({ make, facts, tools }) {
  return facts.preview.length === 0 ? null : make({ tag: 'p', name: 'preview', text: tools.buildPreviewText({ entries: facts.preview, missing: facts.missing }) })
}

export function buildViewButton({ make, facts, tools }) {
  return make({ tag: 'button', name: 'view', text: tools.buildViewText({ count: facts.available.length }), attrs: [['type', 'button'], ['data-action', 'view']] })
}

export function buildQuickAdd(context) {
  const { make, facts, formatText, tools } = context
  const label = tools.buildQuickAddText({ tier: facts.tier, missing: facts.missing, formatMoneyText: formatText }) + ' ' + facts.costText
  return make({ tag: 'button', name: 'quick-add', text: label, attrs: [['type', 'button'], ['data-action', 'quick']] })
}

/** The preview of what the customer has and the "View & mix" and quick-add buttons of a contracted box; nothing once the first tier is reached. */
export function buildViewParts(tools, input) {
  const context = { ...input, tools }
  return input.facts.missing === 0 ? [] : [tools.buildPreview(context), tools.buildViewButton(context), tools.buildQuickAdd(context)]
}

/** The tier chips of a box, as a list (null when there are none). */
export function buildChips(tools, input) {
  return tools.buildChipList({ ...input, tools })
}

export function buildRailOf(tools, input) {
  return tools.buildRail({ ...input, tools })
}

// What the controls do. `own` is this file's tools, `input` what the pop-up's click handler gives: { state, control, tools } with the pop-up's own tools.

/** The control's box: the unit count of the item is set to `step` more (or fewer), never below 1 or above 99, and the box is drawn again with focus where it was. */
export function updateQuantity(own, { state, control, step, tools }) {
  const view = tools.readControlView({ state, control })
  const variantId = control.dataset.variant
  view.quantities[variantId] = Math.min(MAX_QUANTITY, Math.max(1, own.readQuantity({ quantities: view.quantities, variantId }) + step))
  tools.paintBox({ state, index: view.index, tools })
  tools.focusBox({ view, selector: tools.buildControlSelector({ control }) })
}

export function incrementQuantity(own, input) {
  return own.updateQuantity(own, { ...input, step: 1 })
}

export function decrementQuantity(own, input) {
  return own.updateQuantity(own, { ...input, step: -1 })
}

/** "Show more" / "Show fewer". */
export function toggleRows(own, { state, control, tools }) {
  const view = tools.readControlView({ state, control })
  view.showAll = !view.showAll
  tools.paintBox({ state, index: view.index, tools })
  tools.focusBox({ view, selector: tools.buildControlSelector({ control }) })
}

/** Add: the item with the units chosen for it. */
export function addRow(own, { state, control, tools }) {
  const view = tools.readControlView({ state, control })
  const variantId = control.dataset.variant
  return tools.runAdd({ state, control, picks: [{ variantId, quantity: own.readQuantity({ quantities: view.quantities, variantId }) }], tools })
}

export const PARTS_TOOLS = {
  buildQuickLabelText, buildQuickButtonText, buildQuickAddText, buildViewText, buildPreviewText, buildShowingText, buildMoreText, readQuantity, buildMilestone, buildRail, buildChip, buildChipList, buildPicture, buildCount,
  buildStepButton, buildStepper, buildItemRow, listVisibleRows, buildItemList, buildMoreRow, buildPagingParts, buildQuickRow, buildPreview, buildViewButton, buildQuickAdd, updateQuantity,
}
