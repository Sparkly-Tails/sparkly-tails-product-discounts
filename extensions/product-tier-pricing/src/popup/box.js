// One box of the pop-up, drawn from its data (the view component). The words come from copy.js; nothing here reads the page: the document, the amount
// writer and the functions it calls come in as arguments. A box is drawn again whole after every change (the page is small). `input` is what
// the controller (ui.js) hands over: { doc, element, box, units, lines, failed, facts, isExpanded, moneyFormat, secondsLeft }.
import { POPUP_TEXT } from './copy.js'
import { formatMoney } from '../tierMath.js'
import { formatFlashCountdown } from '../flash.js'
import { setText } from '../dom.js'
import { applyBoxLook } from './look.js'

export function formatAmount({ moneyFormat, tools }, amount) {
  return tools.formatMoney(amount, moneyFormat)
}

export function isLineOfVariant({ variantId }, line) {
  return String(line.variant_id) === variantId
}

export function addQuantity(total, line) {
  return total + line.quantity
}

/** The units of one variant in the cart lines. */
export function countInCart({ lines, variantId, tools }) {
  return lines.filter(isLineOfVariant.bind(null, { variantId })).reduce(tools.addQuantity, 0)
}

export function buildFlashBar({ make, box, secondsLeft, tools }) {
  if (!box.flash) return null
  const countdown = make({ tag: 'span', name: 'countdown', text: tools.formatFlashCountdown({ secondsLeft }), attrs: [['data-countdown', '']] })
  return make({ tag: 'div', name: 'flash', kids: [make({ tag: 'span', text: POPUP_TEXT.flashBar }), countdown] })
}

export function buildTitle({ make, box, tools }) {
  return make({ tag: 'h3', name: 'title', text: tools.buildBoxTitle({ title: box.title }) })
}

export function buildBadge({ make, facts, tools }) {
  return make({ tag: 'p', name: 'badge', text: tools.buildBadgeText({ tier: facts.tier, mode: facts.mode }) })
}

/** Where the customer stands, or "Tier unlocked" once the first tier is reached. */
export function buildStatus({ make, box, units, facts, formatText, tools }) {
  const text = facts.missing === 0 ? POPUP_TEXT.unlocked : tools.buildIncentiveText({ tier: facts.tier, units, missing: facts.missing, basePrice: box.basePrice, formatMoneyText: formatText, tools })
  return make({ tag: 'p', name: 'status', text })
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

/** The list of items and the Quick auto-fill row; nothing once the first tier is reached. */
export function buildAddParts(context) {
  return context.facts.missing === 0 ? [] : [context.tools.buildItemList(context), context.tools.buildQuickRow(context)]
}

export function buildViewButton({ make, facts, tools }) {
  return make({ tag: 'button', name: 'view', text: tools.buildViewText({ count: facts.available.length }), attrs: [['type', 'button'], ['data-action', 'view']] })
}

export function buildQuickAdd(context) {
  const { make, facts, formatText, tools } = context
  const label = tools.buildQuickAddText({ tier: facts.tier, missing: facts.missing, formatMoneyText: formatText }) + ' ' + tools.buildCost(context)
  return make({ tag: 'button', name: 'quick-add', text: label, attrs: [['type', 'button'], ['data-action', 'quick']] })
}

export function buildViewParts(context) {
  return context.facts.missing === 0 ? [] : [context.tools.buildViewButton(context), context.tools.buildQuickAdd(context)]
}

export function buildError({ make, failed }) {
  return failed ? make({ tag: 'p', name: 'error', text: POPUP_TEXT.failed, attrs: [['role', 'alert']] }) : null
}

export function buildFullNodes(context) {
  const tools = context.tools
  const head = [tools.buildFlashBar(context), tools.buildTitle(context), tools.buildBadge(context), tools.buildStatus(context), tools.buildChipList(context)]
  return head.concat(tools.buildAddParts(context), [tools.buildError(context)])
}

export function buildShortNodes(context) {
  const tools = context.tools
  return [tools.buildTitle(context), tools.buildBadge(context), tools.buildStatus(context)].concat(tools.buildViewParts(context), [tools.buildError(context)])
}

export function buildBoxNodes(context) {
  return context.isExpanded ? context.tools.buildFullNodes(context) : context.tools.buildShortNodes(context)
}

/** Draws the box again from `input`: its children are replaced, the element stays. */
export function paintBox(tools, input) {
  const context = { ...input, make: tools.makeNode.bind(null, { doc: input.doc, tools }), formatText: tools.formatAmount.bind(null, { moneyFormat: input.moneyFormat, tools }), tools }
  input.element.dataset.expanded = String(input.isExpanded)
  input.element.replaceChildren(...tools.buildBoxNodes(context).filter(tools.isNode))
}

/** The empty element of a box, with `look` (see look.js) set on it once. */
export function createBox(tools, { doc, index, look, accents }) {
  const element = doc.createElement('section')
  element.className = 'smooth-discounts-popup__box'
  element.tabIndex = -1
  element.dataset.box = ''
  element.dataset.index = String(index)
  tools.applyBoxLook({ box: element, look, accents, tools })
  return element
}

/** Writes the countdown of the box again. */
export function setCountdown(tools, { element, secondsLeft }) {
  tools.setText(element.querySelector('[data-countdown]'), tools.formatFlashCountdown({ secondsLeft }))
}

export const BOX_VIEW_TOOLS = {
  formatMoney, formatFlashCountdown, setText, applyBoxLook, formatAmount, addQuantity, countInCart, buildFlashBar, buildTitle, buildBadge, buildStatus, buildChip, buildChipList, buildPicture,
  buildItemRow, buildItemList, buildCost, buildQuickRow, buildAddParts, buildViewButton, buildQuickAdd, buildViewParts, buildError, buildFullNodes, buildShortNodes, buildBoxNodes,
}
