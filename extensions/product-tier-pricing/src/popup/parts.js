// The parts of a box that the frame (box.js) puts in it: the tier chips, the list of items with the Quick auto-fill row, and the two buttons of a contracted box
// (the parts component). Nothing here reads the page: the node maker, the amount writer and the functions it calls come in as arguments.
// `input` is what the frame hands over: { make, facts, lines, formatText }.
import { POPUP_TEXT, buildQuickLabelText, buildQuickButtonText, buildQuickAddText, buildViewText, buildCostText } from './copy.js'

export function isLineOfVariant({ variantId }, line) {
  return String(line.variant_id) === variantId
}

export function addQuantity(total, line) {
  return total + line.quantity
}

/** The units of one variant in the cart lines. */
export function countInCart({ lines, variantId, tools }) {
  return lines.filter(tools.isLineOfVariant.bind(null, { variantId })).reduce(tools.addQuantity, 0)
}

export function buildChip(make, chip) {
  return make({ tag: 'li', name: 'chip', text: chip.label, attrs: [['data-chip', chip.tone]] })
}

/** The tier chips, or nothing when the bundle has no single plain price. */
export function buildChipList({ make, facts, tools }) {
  return facts.chips.length === 0 ? null : make({ tag: 'ul', name: 'chips', kids: facts.chips.map(tools.buildChip.bind(null, make)) })
}

export function buildPicture({ make, item }) {
  return item.imageUrl === null ? null : make({ tag: 'img', name: 'picture', attrs: [['src', item.imageUrl], ['alt', ''], ['loading', 'lazy']] })
}

export function buildItemRow(context, item) {
  const { make, lines, formatText, tools } = context
  const count = tools.countInCart({ lines, variantId: item.variantId, tools })
  return make({
    tag: 'li',
    name: 'item',
    attrs: [['data-item', item.variantId]],
    kids: [
      tools.buildPicture({ make, item }),
      make({ tag: 'span', name: 'name', text: item.label, attrs: [['data-name', '']] }),
      make({ tag: 'span', name: 'price', text: formatText(item.price), attrs: [['data-price', '']] }),
      make({ tag: 'span', name: 'count', text: count > 0 ? count + ' in cart' : '', attrs: [['data-count', '']] }),
      make({ tag: 'button', name: 'add', text: POPUP_TEXT.add, attrs: [['type', 'button'], ['data-action', 'add'], ['data-variant', item.variantId]] }),
    ],
  })
}

export function buildItemList(context) {
  return context.make({ tag: 'ul', name: 'items', kids: context.facts.available.map(context.tools.buildItemRow.bind(null, context)) })
}

/** The cost of Quick auto-fill, as the copy writes it. */
export function buildCost({ facts, formatText, tools }) {
  return tools.buildCostText({ cost: facts.cost, formatMoneyText: formatText })
}

export function buildQuickRow(context) {
  const { make, facts, tools } = context
  const label = tools.buildQuickLabelText({ missing: facts.missing }) + ' ' + tools.buildCost(context)
  const button = make({ tag: 'button', name: 'quick-button', text: tools.buildQuickButtonText({ missing: facts.missing }), attrs: [['type', 'button'], ['data-action', 'quick']] })
  return make({ tag: 'div', name: 'quick', kids: [make({ tag: 'span', text: label }), button] })
}

/** The list of items and the Quick auto-fill row of an expanded box; nothing once the first tier is reached. */
export function buildAddParts(tools, input) {
  const context = { ...input, tools }
  return input.facts.missing === 0 ? [] : [tools.buildItemList(context), tools.buildQuickRow(context)]
}

export function buildViewButton({ make, facts, tools }) {
  return make({ tag: 'button', name: 'view', text: tools.buildViewText({ count: facts.available.length }), attrs: [['type', 'button'], ['data-action', 'view']] })
}

export function buildQuickAdd(context) {
  const { make, facts, formatText, tools } = context
  const label = tools.buildQuickAddText({ tier: facts.tier, missing: facts.missing, formatMoneyText: formatText }) + ' ' + tools.buildCost(context)
  return make({ tag: 'button', name: 'quick-add', text: label, attrs: [['type', 'button'], ['data-action', 'quick']] })
}

/** The "View & mix" and quick-add buttons of a contracted box; nothing once the first tier is reached. */
export function buildViewParts(tools, input) {
  const context = { ...input, tools }
  return input.facts.missing === 0 ? [] : [tools.buildViewButton(context), tools.buildQuickAdd(context)]
}

/** The tier chips of a box, as a list (null when there are none). */
export function buildChips(tools, input) {
  return tools.buildChipList({ ...input, tools })
}

export const PARTS_TOOLS = {
  buildQuickLabelText, buildQuickButtonText, buildQuickAddText, buildViewText, buildCostText, isLineOfVariant, addQuantity, countInCart, buildChip, buildChipList, buildPicture, buildItemRow, buildItemList, buildCost, buildQuickRow,
  buildViewButton, buildQuickAdd,
}
