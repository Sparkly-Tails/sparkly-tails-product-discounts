// Adding to the cart and reading it back. `win` is the page's window; `root` is the shop's root link ("/" or "/fr/").
import { UNIT_TOOLS } from './units.js'
import { buildRootPath } from './path.js'
import { fetchJson, returnNothing } from './fetch.js'

export function readPickEntry(pick) {
  return { id: Number(pick.variantId), quantity: pick.quantity }
}

/** The shop's answer to adding `picks` (`[{ variantId, quantity }]`) in one request: `{ ok }`, false when it is refused (for example 422) or cannot be reached. */
export async function addItems(tools, { win, root, picks }) {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items: picks.map(tools.readPickEntry) }) }
  try {
    const answer = await win.fetch(tools.buildRootPath({ rootUrl: root, path: 'cart/add.js' }), init)
    return { ok: answer.ok }
  } catch {
    return { ok: false }
  }
}

export function readCartLines(cart) {
  return cart.items
}

/** The lines of the cart now and the units of the bundle in them: `{ lines, units }`, or null when the cart cannot be read. */
export function readCartUnits(tools, { win, root, members }) {
  return tools.fetchJson({ win, path: tools.buildRootPath({ rootUrl: root, path: 'cart.js' }) }).then(tools.readCartLines).then(tools.describeCart.bind(null, { members, tools })).catch(tools.returnNothing)
}

export function describeCart({ members, tools }, lines) {
  return { lines, units: tools.countBundleUnits({ lines, members, tools }) }
}

export const ADD_TOOLS = { ...UNIT_TOOLS, readPickEntry, buildRootPath, fetchJson, returnNothing, readCartLines, describeCart }
