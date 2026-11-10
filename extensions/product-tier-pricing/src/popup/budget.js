// The time one Checkout press may wait. Nothing here fetches anything.

export function startBudgetTimer({ win, milliseconds, holder }, resolve) {
  holder.id = win.setTimeout(resolve.bind(null, null), milliseconds)
}

/** The promise's value, or null when it fails or is not done within `milliseconds`. The clock is cleared when it is. */
export async function withBudget({ win, promise, milliseconds, tools }) {
  const holder = { id: null }
  const timeout = new Promise(tools.startBudgetTimer.bind(null, { win, milliseconds, holder }))
  const result = await Promise.race([promise.catch(tools.returnNothing), timeout])
  win.clearTimeout(holder.id)
  return result
}

export const BUDGET_TOOLS = { startBudgetTimer, withBudget }
