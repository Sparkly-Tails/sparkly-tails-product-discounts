import { getDb } from '@/lib/db'
import { acceptView, VIEW_PARSE_TOOLS } from '@/metrics/collectView'
import { recordView, pickViewTarget } from '@/metrics/recordView'
import { addVisit, purgeOldVisits, readSettings, STORE_TOOLS } from '@/metrics/store'
import { buildVisitorKey, VISITOR_KEY_TOOLS } from '@/metrics/visitorKey'
import { pickShopDay } from '@/metrics/pickShopDay'

/**
 * Public: the storefront pixel posts here, from Shopify's sandbox, with no token. Every answer is an empty 204 whatever
 * happened, so the route says nothing about which shops or products exist. This is also where the steps `recordView`
 * calls are tied to the database, as the route handler is the one place that may hold it.
 */
const MAX_BODY_BYTES = 4096
const CORS_ORIGIN = { 'access-control-allow-origin': '*' }

/** An empty text for a body that says it is too big, so a hostile post is never read. */
async function readBodyText({ request }: { request: Request }): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  return declared > MAX_BODY_BYTES ? '' : request.text()
}

export async function POST(request: Request): Promise<Response> {
  const database = getDb()
  try {
    await acceptView({
      text: await readBodyText({ request }),
      nowMs: Date.now(),
      secret: process.env.SHOPIFY_API_SECRET_KEY ?? '',
      tools: {
        ...VIEW_PARSE_TOOLS,
        recordView,
        viewTools: {
          readSettings: ({ shop }) => readSettings({ db: database, shop, tools: STORE_TOOLS }),
          pickViewTarget,
          addVisit: (args) => addVisit({ db: database, ...args, tools: STORE_TOOLS }),
          purgeVisits: (args) => purgeOldVisits({ db: database, ...args }),
          buildKey: (args) => buildVisitorKey({ ...args, tools: VISITOR_KEY_TOOLS }),
          pickDay: pickShopDay,
        },
      },
    })
  } catch (error) {
    console.error('collect/view failed', (error as Error).message)
  }
  return new Response(null, { status: 204, headers: CORS_ORIGIN })
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_ORIGIN, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' },
  })
}
