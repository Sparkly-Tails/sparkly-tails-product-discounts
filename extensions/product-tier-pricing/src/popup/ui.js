// The pop-up (the controller): keeps the state of each box, answers the dialog's events, adds to the cart, counts down the flash sales, and answers with
// what the customer decided. The dialog and the boxes are drawn by the view component (`options.components.popupView`, see box.js); what a box shows and does (what is
// missing, Quick auto-fill, the tier chips, its look) is worked out by the facts component (`options.components.popupFacts`, see facts.js). The page's window and the
// functions it calls come in as arguments (the entry hands over the tools).
import { ADD_TOOLS, addItems, readCartUnits } from './add.js'
import { DIALOG_TOOLS, closeToCheckout } from './dialog.js'

export function returnZero() {
  return 0
}

export function isLive(view) {
  return !view.isGone
}

export function describeBox(box, index) {
  return { box, index }
}

/** A box as the pop-up keeps it: its data, its element, the units and cart lines now, and whether an add failed or is on its way. */
export function createView({ doc, options }, { box, index }) {
  const look = options.components.popupFacts.readLook({ box, creamFallback: options.accents.cream })
  return { box, element: options.components.popupView.createBox({ doc, index, look, accents: options.accents }), index, units: box.units, lines: box.lines, quantities: {}, showAll: false, failed: false, isBusy: false, isGone: false }
}

export function createState({ options, resolve, tools }) {
  const doc = options.win.document
  const parts = options.components.popupView.buildDialog({ doc })
  return {
    actions: Object.assign({}, tools.actions, options.components.popupParts.actions),
    win: options.win, doc, view: options.components.popupView, facts: options.components.popupFacts, parts: options.components.popupParts, root: options.root, moneyFormat: options.moneyFormat, opener: options.opener, resolve, dialog: parts.dialog, list: parts.list, closeButton: parts.closeButton,
    views: options.boxes.map(tools.describeBox).map(tools.createView.bind(null, { doc, options })), ratios: options.boxes.map(tools.returnZero), expanded: 0, didAdd: false, pendingAdds: 0, action: 'close', timer: 0, observer: null,
  }
}

/** What a box shows and does now (see facts.js). */
export function readBoxFacts({ state, view }) {
  return state.facts.readFacts({ box: view.box, units: view.units, lines: view.lines, moneyFormat: state.moneyFormat })
}

/** Seconds left of the box's flash sale; 0 for a box without one. */
export function readSecondsLeft({ state, view }) {
  return view.box.flash ? view.box.flash.endsAtUnix - Math.floor(state.win.Date.now() / 1000) : 0
}

/** Draws the box at `index` again from its state. */
export function paintBox({ state, index, tools }) {
  const view = state.views[index]
  const { box, units, lines, failed, quantities, showAll } = view
  state.view.paintBox({
    doc: state.doc, element: view.element, box, units, lines, failed, quantities, showAll, facts: tools.readBoxFacts({ state, view }), parts: state.parts, isExpanded: index === state.expanded, moneyFormat: state.moneyFormat, secondsLeft: tools.readSecondsLeft({ state, view }),
  })
}

export function repaintBox({ state, tools }, view) {
  tools.paintBox({ state, index: view.index, tools })
}

export function repaintBoxes({ state, tools }) {
  state.views.filter(tools.isLive).forEach(tools.repaintBox.bind(null, { state, tools }))
}

/** Where keyboard focus is inside the boxes: `{ index, selector }` of the control (the empty selector for the box itself); null when it is elsewhere. */
export function readFocusSpot({ state, tools }) {
  const box = state.doc.activeElement.closest('[data-box]')
  return box === null || !state.list.contains(box) ? null : { index: Number(box.dataset.index), selector: tools.readActiveSelector({ state, tools }) }
}

export function readActiveSelector({ state, tools }) {
  const control = state.doc.activeElement.closest('[data-action]')
  return control === null ? '' : tools.buildControlSelector({ control })
}

/** Gives focus back to the spot the boxes were drawn over (a control that is gone leaves it on its box), without scrolling the list. */
export function restoreFocusSpot({ state, spot }) {
  const view = state.views[spot.index]
  const target = (spot.selector && view.element.querySelector(spot.selector)) || view.element
  target.focus({ preventScroll: true })
}

/** Makes the box at `index` the expanded one and draws the boxes again, so that focus stays where it was (the boxes are drawn again as the list scrolls). */
export function expandBox({ state, index, tools }) {
  const spot = tools.readFocusSpot({ state, tools })
  state.expanded = index
  tools.repaintBoxes({ state, tools })
  if (spot !== null && !state.views[spot.index].isGone) tools.restoreFocusSpot({ state, spot })
}

/** Moves focus to the control with `selector` in the box, or to the box itself when the control is gone, so a keyboard user does not lose their place when the box is drawn again. */
export function focusBox({ view, selector }) {
  const target = view.element.querySelector(selector) || view.element
  target.focus()
}

export function scrollBoxIntoView(view) {
  if (typeof view.element.scrollIntoView === 'function') view.element.scrollIntoView({ block: 'nearest' })
}

export function buildControlSelector({ control }) {
  const variant = control.dataset.variant
  return '[data-action="' + control.dataset.action + '"]' + (variant ? '[data-variant="' + variant + '"]' : '')
}

export function showBox({ state, control, tools }) {
  const view = tools.readControlView({ state, control })
  tools.expandBox({ state, index: view.index, tools })
  tools.scrollBoxIntoView(view)
  tools.focusBox({ view, selector: tools.buildControlSelector({ control }) })
}

export function applyAddResult({ state, view, added, cart }) {
  state.pendingAdds -= 1
  state.didAdd = state.didAdd || added.ok
  view.failed = !added.ok
  if (cart !== null) {
    view.units = cart.units
    view.lines = cart.lines
  }
}

/** Adds the picks in one request, reads the cart back, and draws the box again; a press is ignored while the box is waiting for the shop. */
export async function runAdd({ state, control, picks, tools }) {
  const view = tools.readControlView({ state, control })
  if (view.isBusy || picks.length === 0) return
  view.isBusy = true
  state.pendingAdds += 1
  const added = await tools.addItems({ win: state.win, root: state.root, picks })
  const cart = await tools.readCartUnits({ win: state.win, root: state.root, members: view.box.members })
  tools.applyAddResult({ state, view, added, cart })
  tools.clearPicked({ view, picks, added, tools })
  view.isBusy = false
  tools.paintBox({ state, index: view.index, tools })
  tools.focusBox({ view, selector: tools.buildControlSelector({ control }) })
}

export function clearQuantity(quantities, pick) {
  delete quantities[pick.variantId]
}

/** The units chosen for the items that were added go back to 1; after a failed add they stay. */
export function clearPicked({ view, picks, added, tools }) {
  if (added.ok) picks.forEach(tools.clearQuantity.bind(null, view.quantities))
}

/** Quick auto-fill: the units that complete the box, in one request. */
export function addMissing({ state, control, tools }) {
  const view = tools.readControlView({ state, control })
  return tools.runAdd({ state, control, picks: tools.readBoxFacts({ state, view }).picks, tools })
}

export function isCounting(view) {
  return !view.isGone && Boolean(view.box.flash)
}

/** The flash sale of a box has run out: the box leaves the list, and another is expanded when it was the expanded one. */
export function removeBox({ state, view, tools }) {
  view.isGone = true
  view.element.remove()
  if (state.views[state.expanded].isGone && state.views.some(tools.isLive)) tools.expandBox({ state, index: state.views.findIndex(tools.isLive), tools })
}

export function tickBox({ state, nowSeconds, tools }, view) {
  const secondsLeft = view.box.flash.endsAtUnix - nowSeconds
  if (secondsLeft <= 0) tools.removeBox({ state, view, tools })
  else state.view.setCountdown({ element: view.element, secondsLeft })
}

/** One second of the clock: every flash sale's countdown is written again, and a box whose sale has ended is taken off. */
export function tickBoxes({ state, tools }) {
  const nowSeconds = Math.floor(state.win.Date.now() / 1000)
  state.views.filter(tools.isCounting).forEach(tools.tickBox.bind(null, { state, nowSeconds, tools }))
}

export function readMostVisible({ ratios }) {
  const top = Math.max(...ratios)
  return top > 0 ? ratios.indexOf(top) : -1
}

export function recordSighting({ state }, entry) {
  state.ratios[Number(entry.target.dataset.index)] = entry.intersectionRatio
}

/** The boxes' visibility changed: the box that is most in view is the expanded one. */
export function handleSightings({ state, tools }, entries) {
  entries.forEach(tools.recordSighting.bind(null, { state }))
  const index = tools.readMostVisible({ ratios: state.ratios })
  if (index >= 0 && index !== state.expanded) tools.expandBox({ state, index, tools })
}

export function watchView(observer, view) {
  observer.observe(view.element)
}

/** Watches the boxes in the scrolling list; null when the page has no IntersectionObserver (the first box then stays the expanded one). */
export function watchBoxes({ state, tools }) {
  const Observer = state.win.IntersectionObserver
  if (typeof Observer !== 'function') return null
  const observer = new Observer(tools.handleSightings.bind(null, { state, tools }), { root: state.list, threshold: [0, 0.25, 0.5, 0.75, 1] })
  state.views.forEach(tools.watchView.bind(null, observer))
  return observer
}

export function appendBox({ state }, view) {
  state.list.appendChild(view.element)
}

/** Puts the boxes in the list and the dialog on the page, opens it as a modal, and starts the clock and the watching. */
export function showDialog({ state, tools }) {
  state.views.forEach(tools.appendBox.bind(null, { state }))
  tools.repaintBoxes({ state, tools })
  state.doc.body.appendChild(state.dialog)
  state.dialog.addEventListener('click', tools.handleClick.bind(null, { state, tools }))
  state.dialog.addEventListener('cancel', tools.handleCancel.bind(null, { state }))
  state.dialog.addEventListener('close', tools.finishPopup.bind(null, { state }), { once: true })
  state.dialog.showModal()
  state.closeButton.focus()
  state.timer = state.win.setInterval(tools.tickBoxes.bind(null, { state, tools }), 1000)
  state.observer = tools.watchBoxes({ state, tools })
}

export function startPopup({ options, tools }, resolve) {
  tools.showDialog({ state: tools.createState({ options, resolve, tools }), tools })
}

/** Opens the pop-up for `boxes`; resolves `{ action: 'continue' | 'close', didAdd }` when the customer is done. `root` is the shop's root link, `opener` the Checkout control to give focus back to, `components` the loaded components (popupView, popupFacts and popupParts are used). */
export function openPopup(tools, options) {
  return new Promise(tools.startPopup.bind(null, { options, tools }))
}

export const UI_TOOLS = {
  ...DIALOG_TOOLS,
  addItems: addItems.bind(null, ADD_TOOLS), readCartUnits: readCartUnits.bind(null, ADD_TOOLS), returnZero, isLive, describeBox, createView, createState, readBoxFacts, readSecondsLeft, paintBox, repaintBox, repaintBoxes, readFocusSpot, readActiveSelector, restoreFocusSpot, expandBox, focusBox, scrollBoxIntoView,
  buildControlSelector, showBox, applyAddResult, runAdd, clearQuantity, clearPicked, addMissing, isCounting, removeBox, tickBox, tickBoxes, readMostVisible, recordSighting, handleSightings, watchView, watchBoxes, appendBox, showDialog,
  startPopup, actions: { quick: addMissing, view: showBox, continue: closeToCheckout },
}
