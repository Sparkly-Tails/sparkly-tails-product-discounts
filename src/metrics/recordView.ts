// Counts one product-page view for the live discount the product belongs to. Every outside step is handed in through `tools`,
// so the rules (which views count, when a day changes, who counts once) can be tried without a database or a clock.

const DAY_MS = 24 * 3600 * 1000
/** Visitor keys only matter during their own day; older ones are removed. */
const KEEP_DAYS = 2

export interface ViewSettings {
  timeZone: string
  liveProducts: Record<string, string>
}

export interface ViewTarget {
  discountId: string
  timeZone: string
}

/** The live discount a viewed product belongs to, and the shop's time zone; null when there is none (unknown shop, or a product in no live discount). */
export function pickViewTarget({ settings, productId }: { settings: ViewSettings | null; productId: string }): ViewTarget | null {
  if (!settings) return null
  const discountId = settings.liveProducts[productId]
  return discountId ? { discountId, timeZone: settings.timeZone } : null
}

export interface RecordViewTools {
  readSettings: (args: { shop: string }) => Promise<ViewSettings | null>
  pickViewTarget: typeof pickViewTarget
  addVisit: (args: { shop: string; discountId: string; day: string; visitorKey: string }) => Promise<'counted' | 'duplicate'>
  purgeVisits: (args: { shop: string; beforeDay: string }) => Promise<void>
  buildKey: (args: { clientId: string; shop: string; day: string; secret: string }) => Promise<string>
  pickDay: (args: { nowMs: number; timeZone: string }) => string
}

export async function recordView({ shop, productId, clientId, nowMs, secret, tools }: { shop: string; productId: string; clientId: string; nowMs: number; secret: string; tools: RecordViewTools }): Promise<'counted' | 'duplicate' | 'ignored'> {
  const target = tools.pickViewTarget({ settings: await tools.readSettings({ shop }), productId })
  if (!target) return 'ignored'

  const day = tools.pickDay({ nowMs, timeZone: target.timeZone })
  const visitorKey = await tools.buildKey({ clientId, shop, day, secret })
  const result = await tools.addVisit({ shop, discountId: target.discountId, day, visitorKey })
  if (result === 'counted') await tools.purgeVisits({ shop, beforeDay: tools.pickDay({ nowMs: nowMs - KEEP_DAYS * DAY_MS, timeZone: target.timeZone }) })
  return result
}
