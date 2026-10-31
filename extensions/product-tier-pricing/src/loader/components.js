// Which components one widget needs. The block hands over the address of every component in
// data-component-urls (blocks/tier-pricing.liquid); the list of names is decided here from what the widget shows.

/** The components every widget needs, plus the flash sale and the time-based sale only when the widget has one. */
export function listNeededComponents({ hasFlash, hasTimeSale }) {
  const names = ['model', 'paint']
  if (hasFlash) names.push('flash')
  if (hasTimeSale) names.push('timeSale')
  return names
}

/** The addresses the block wrote, or none when they are missing or not JSON. */
export function parseComponentUrls(json) {
  try {
    return JSON.parse(json || '{}')
  } catch {
    return {}
  }
}

/** True when the block rendered a time-based discount (the block writes `{}` when the product has none). */
export function isTimeSaleData(json) {
  return Boolean(json) && json !== '{}'
}

/** Starts every load at once; resolves with { name: functions } when all are in, rejects when one fails. */
export async function loadComponentSet({ names, loadOne }) {
  const pending = []
  for (const name of names) pending.push(loadOne(name))
  const apis = await Promise.all(pending)
  const set = {}
  for (let index = 0; index < names.length; index += 1) set[names[index]] = apis[index]
  return set
}
