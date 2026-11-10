// One box of the pop-up, drawn from its data (the view component). The words come from copy.js; nothing here reads the page: the document, the amount
// writer and the functions it calls come in as arguments. A box is drawn again whole after every change (the page is small). `input` is what
// the controller (ui.js) hands over: { doc, element, box, units, lines, failed, facts, parts, quantities, showAll, isExpanded, moneyFormat, secondsLeft }, `parts` being the parts component (parts.js).
import { POPUP_TEXT } from './copy.js'
import { formatMoney } from '../tierMath.js'
import { formatFlashCountdown } from '../flash.js'
import { setText } from '../dom.js'
import { applyBoxLook } from './look.js'

export function formatAmount({ moneyFormat, tools }, amount) {
  return tools.formatMoney(amount, moneyFormat)
}

export function buildFlashBar({ make, box, secondsLeft, tools }) {
  if (!box.flash) return null
  const countdown = make({ tag: 'span', name: 'countdown', text: tools.formatFlashCountdown({ secondsLeft }), attrs: [['data-countdown', '']] })
  return make({ tag: 'div', name: 'flash', kids: [make({ tag: 'span', text: POPUP_TEXT.flashBar }), countdown] })
}

export function buildTitle({ make, box, tools }) {
  return make({ tag: 'h3', name: 'title', text: tools.buildBoxTitle({ title: box.title }) })
}

export function buildDot({ make }) {
  return make({ tag: 'span', name: 'dot' })
}

export function buildBadge({ make, facts, tools }) {
  return make({ tag: 'p', name: 'badge', text: tools.buildBadgeText({ tier: facts.tier, mode: facts.mode }) })
}

/** Where the customer stands, or "Tier unlocked" once the first tier is reached. */
export function buildStatus({ make, box, units, facts, formatText, tools }) {
  const text = facts.missing === 0 ? POPUP_TEXT.unlocked : tools.buildIncentiveText({ tier: facts.tier, units, missing: facts.missing, basePrice: box.basePrice, formatMoneyText: formatText, tools })
  return make({ tag: 'p', name: 'status', text })
}

export function buildError({ make, failed }) {
  return failed ? make({ tag: 'p', name: 'error', text: POPUP_TEXT.failed, attrs: [['role', 'alert']] }) : null
}

/** The tier chips, in an expanded box only. */
export function buildExpandedChips(context) {
  return context.isExpanded ? context.parts.buildChips(context) : null
}

/** The cream panel of a box: its title with the badge, where the customer stands, the progress rail, and the tier chips of an expanded box. */
export function buildSummary(context) {
  const { make, parts, tools } = context
  const head = make({ tag: 'div', name: 'head', kids: [tools.buildDot(context), tools.buildTitle(context), tools.buildBadge(context)] })
  return make({ tag: 'div', name: 'summary', kids: [head, tools.buildStatus(context), parts.buildRail(context), tools.buildExpandedChips(context)] })
}

export function buildFullNodes(context) {
  const tools = context.tools
  return [tools.buildFlashBar(context), tools.buildSummary(context)].concat(context.parts.buildAddParts(context), [tools.buildError(context)])
}

export function buildShortNodes(context) {
  const tools = context.tools
  return [tools.buildSummary(context)].concat(context.parts.buildViewParts(context), [tools.buildError(context)])
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
  formatMoney, formatFlashCountdown, setText, applyBoxLook, formatAmount, buildFlashBar, buildTitle, buildDot, buildBadge, buildStatus, buildError, buildExpandedChips, buildSummary, buildFullNodes, buildShortNodes, buildBoxNodes,
}
