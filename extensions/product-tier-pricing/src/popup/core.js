// The bundle pop-up's core script: stops a Checkout press, works out which bundles in the cart are one step from their first
// tier, has the UI component show them, and carries the press on afterwards. Whatever goes wrong, checkout goes ahead: the wait
// of one press has a budget, and nothing is fetched before the press. It never throws into the page.
import { loadComponentSet } from '../loader/components.js'
import { loadComponent } from '../loader/registry.js'
import { BUDGET_TOOLS } from './budget.js'
import { CONFIG_TOOLS } from './config.js'
import { loadPopupComponent, loadPopupComponents } from './components.js'
import { DUE_TOOLS } from './due.js'
import { fetchJson, returnNothing } from './fetch.js'
import { buildRootPath } from './path.js'
import { RESUME_TOOLS } from './resume.js'
import { recordShown } from './session.js'

/** The most one Checkout press waits for the cart, the products and the components together. */
const PRESS_BUDGET_MS = 2000
/** The answer that lets the press go ahead as if the pop-up was not there. */
const PASS_ANSWER = { action: 'continue', didAdd: false }
const CHECKOUT_SELECTOR = '[name="checkout"]'

/** The page's sessionStorage, or null when the page does not allow it. Also null when the store shows the pop-up at every press: with no storage nothing is remembered, so a bundle is due again each time. */
export function readStorage({ win, frequency }) {
  try {
    return frequency === 'checkout' ? null : win.sessionStorage
  } catch {
    return null
  }
}

/** The Checkout control the click was on (or inside), or null. */
export function findCheckoutTarget({ event }) {
  return typeof event.target.closest === 'function' ? event.target.closest(CHECKOUT_SELECTOR) : null
}

/** True for a press of a Checkout control that is not the one this script lets through itself. */
export function isCheckoutPress({ target, state }) {
  return target !== null && !state.isBypassing
}

/** The bundles due now, from a fresh read of the cart: `{ due, lines }`. */
export async function readDueBundles({ win, config, tools }) {
  const cart = await tools.fetchJson({ win, path: tools.buildRootPath({ rootUrl: config.rootUrl, path: 'cart.js' }) })
  const nowSeconds = Math.floor(win.Date.now() / 1000)
  const due = tools.listDueBundles({ discounts: config.index.discounts, lines: cart.items, nowSeconds, storage: tools.readStorage({ win, frequency: config.frequency }), tools })
  return { due, lines: cart.items }
}

/** The boxes to show: `{ ui, components, moneyFormat, boxes }`, or null when no bundle is due. Fetches the cart now; the components, and through them the products, only when a bundle is due. */
export async function prepareBoxes({ win, config, tools }) {
  const { due, lines } = await tools.readDueBundles({ win, config, tools })
  if (due.length === 0) return null
  const components = await tools.loadPopupComponents({ win, config, tools })
  const prepared = await components.popupBoxes.prepareBoxes({ win, config, due, lines, currency: components.currency || null })
  return { ...prepared, ui: components.popupUi, components }
}

/** A bundle is remembered as shown (not at all when the store shows the pop-up at every press: the storage is then null). */
export function recordBox({ storage, tools }, box) {
  tools.recordShown({ storage, key: box.shownKey })
}

/** Opens the pop-up; each box is remembered as shown now, when it appears. Resolves with `{ action, didAdd }`. */
export function showBoxes({ win, config, target, prepared, tools }) {
  prepared.boxes.forEach(tools.recordBox.bind(null, { storage: tools.readStorage({ win, frequency: config.frequency }), tools }))
  return prepared.ui.openPopup({ win, boxes: prepared.boxes, root: config.rootUrl, accents: prepared.accents, moneyFormat: prepared.moneyFormat, opener: target, components: prepared.components })
}

/** What the customer decided; the pass-through answer when there is nothing to show. */
export async function readAnswer({ win, config, target, prepared, tools }) {
  if (prepared === null || prepared.boxes.length === 0) return PASS_ANSWER
  return tools.showBoxes({ win, config, target, prepared, tools })
}

export function returnPass() {
  return PASS_ANSWER
}

/** Continue carries the stopped press on, and the "let this one through" flag stays up from then on: the page is still on screen while it leaves, and a second press
 * must go through as the theme made it, never open a second pop-up. Closing leaves the next press to start afresh. */
export function applyAnswer({ win, target, answer, rootUrl, state, tools }) {
  if (answer.action !== 'continue') return tools.closePopup({ win, didAdd: answer.didAdd })
  state.isBypassing = true
  tools.sendToCheckout({ win, target, didAdd: answer.didAdd, rootUrl, tools })
}

export function finishPress({ win, target, answer, rootUrl, state, tools }) {
  try {
    tools.applyAnswer({ win, target, answer, rootUrl, state, tools })
  } finally {
    state.isBusy = false
  }
}

/** The page is shown again from the history (the customer came back from checkout): its next Checkout press may open the pop-up. */
export function resetBypass({ state }, event) {
  if (event.persisted) state.isBypassing = false
}

/** One stopped press, from the wait for the cart to its end. */
export async function runPress({ win, config, state, target, tools }) {
  const promise = tools.prepareBoxes({ win, config, tools })
  const prepared = await tools.withBudget({ win, promise, milliseconds: PRESS_BUDGET_MS, tools })
  const answer = await tools.readAnswer({ win, config, target, prepared, tools }).catch(tools.returnPass)
  tools.finishPress({ win, target, answer, rootUrl: config.rootUrl, state, tools })
}

export function beginPress({ win, config, state, target, tools }) {
  state.isBusy = true
  tools.runPress({ win, config, state, target, tools }).catch(tools.returnNothing)
}

/** Stops every press of a Checkout control; works on it unless one is being worked on already. */
export function handlePress({ win, config, state, tools }, event) {
  const target = tools.findCheckoutTarget({ event })
  if (!tools.isCheckoutPress({ target, state })) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (!state.isBusy) tools.beginPress({ win, config, state, target, tools })
}

export function attachPress({ win, tools }) {
  const config = tools.readPopupConfig({ doc: win.document, shopify: win.Shopify, tools })
  if (config === null || config.index.discounts.length === 0) return
  const state = { isBusy: false, isBypassing: false }
  win.document.addEventListener('click', tools.handlePress.bind(null, { win, config, state, tools }), true)
  win.addEventListener('pageshow', tools.resetBypass.bind(null, { state }))
}

/** Starts the pop-up on a page: nothing happens when the embed is off or no discount is live. */
export function startPopup({ win, tools }) {
  try {
    tools.attachPress({ win, tools })
  } catch {
    // The page keeps working without the pop-up.
  }
}

export const POPUP_TOOLS = {
  ...BUDGET_TOOLS, ...CONFIG_TOOLS, ...DUE_TOOLS, ...RESUME_TOOLS,
  fetchJson, returnNothing, loadPopupComponent, loadPopupComponents, loadComponent, loadComponentSet, buildRootPath, recordShown,
  readStorage, readDueBundles, findCheckoutTarget, isCheckoutPress, prepareBoxes, recordBox, showBoxes, readAnswer, returnPass, applyAnswer, finishPress, resetBypass, runPress, beginPress, handlePress, attachPress, startPopup,
}
