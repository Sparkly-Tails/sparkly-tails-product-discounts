// Switches the metrics web pixel on for a shop. The pixel needs two settings, the address of this app and the shop's
// own myshopify.com address, and Shopify keeps them, so a shop is set up once and again only when the app moves.

export type PixelOutcome = 'created' | 'updated' | 'exists'

interface UserError {
  code?: string
  message: string
}

interface PixelRecord {
  id: string
  settings: unknown
}

interface PixelSettings {
  collectUrl: string
  shop: string
}

type QueryShop = (args: { query: string; variables?: Record<string, unknown>; shop: string }) => Promise<unknown>

const COLLECT_PATH = '/collect/view'
/** A host and an optional port; nothing else, so a path, credentials or a list of hosts are refused. */
const HOST_PATTERN = /^[a-z0-9][a-z0-9.-]*(:\d{1,5})?$/i
/** The code of the refusal that means "this app already has its pixel here". */
const TAKEN_CODE = 'TAKEN'

const FIND_QUERY = 'query { webPixel { id settings } }'
const CREATE_MUTATION = `mutation createMetricsPixel($webPixel: WebPixelInput!) {
  webPixelCreate(webPixel: $webPixel) { userErrors { field message code } webPixel { id } }
}`
const UPDATE_MUTATION = `mutation updateMetricsPixel($id: ID!, $webPixel: WebPixelInput!) {
  webPixelUpdate(id: $id, webPixel: $webPixel) { userErrors { field message code } webPixel { id } }
}`

/** The address of this deployment from the host of a request, or null when the host is not a plain host. */
export function readAppOrigin({ host, protocol }: { host: string; protocol: string }): string | null {
  return HOST_PATTERN.test(host) ? `${protocol}://${host}` : null
}

export function buildCollectUrl({ origin }: { origin: string | null }): string | null {
  return origin ? `${origin}${COLLECT_PATH}` : null
}

/** Shopify answers the settings as text or as an object; anything else is taken as no settings. */
export function parseSettings({ settings }: { settings: unknown }): Record<string, unknown> {
  try {
    const value = typeof settings === 'string' ? JSON.parse(settings) : settings
    return { ...(value as Record<string, unknown>) }
  } catch {
    return {}
  }
}

export function hasSettings({ settings, wanted, tools }: { settings: unknown; wanted: PixelSettings; tools: PixelTools }): boolean {
  const found = tools.parseSettings({ settings })
  return found.collectUrl === wanted.collectUrl && found.shop === wanted.shop
}

export function isCurrentPixel({ pixel, wanted, tools }: { pixel: PixelRecord | null; wanted: PixelSettings; tools: PixelTools }): boolean {
  return pixel !== null && tools.hasSettings({ settings: pixel.settings, wanted, tools })
}

/** The app's pixel in the shop, or null. Shopify may answer a shop with none by an error, so any failure here means "none": the create that follows reports a real problem. */
export async function findPixel({ shop, queryShop }: { shop: string; queryShop: QueryShop }): Promise<PixelRecord | null> {
  try {
    const data = (await queryShop({ query: FIND_QUERY, shop })) as { webPixel?: PixelRecord | null }
    return data.webPixel ?? null
  } catch {
    return null
  }
}

export async function runPixelMutation({ shop, queryShop, query, variables, key }: { shop: string; queryShop: QueryShop; query: string; variables: Record<string, unknown>; key: string }): Promise<UserError[]> {
  const data = (await queryShop({ query, variables, shop })) as Record<string, { userErrors?: UserError[] } | undefined>
  return data[key]?.userErrors ?? []
}

export function createPixel({ shop, queryShop, wanted, tools }: { shop: string; queryShop: QueryShop; wanted: PixelSettings; tools: PixelTools }): Promise<UserError[]> {
  return tools.runPixelMutation({ shop, queryShop, query: CREATE_MUTATION, variables: { webPixel: { settings: wanted } }, key: 'webPixelCreate' })
}

export function updatePixel({ shop, queryShop, id, wanted, tools }: { shop: string; queryShop: QueryShop; id: string; wanted: PixelSettings; tools: PixelTools }): Promise<UserError[]> {
  return tools.runPixelMutation({ shop, queryShop, query: UPDATE_MUTATION, variables: { id, webPixel: { settings: wanted } }, key: 'webPixelUpdate' })
}

export function writePixel({ pixel, shop, queryShop, wanted, tools }: { pixel: PixelRecord | null; shop: string; queryShop: QueryShop; wanted: PixelSettings; tools: PixelTools }): Promise<UserError[]> {
  return pixel ? tools.updatePixel({ shop, queryShop, id: pixel.id, wanted, tools }) : tools.createPixel({ shop, queryShop, wanted, tools })
}

function isRefusal(error: UserError): boolean {
  return error.code !== TAKEN_CODE
}

function readMessage(error: UserError): string {
  return error.message
}

/** What happened once the write came back without a real refusal: a TAKEN answer means the pixel was there already. */
export function pickOutcome({ errors, existed }: { errors: UserError[]; existed: boolean }): PixelOutcome {
  return errors.length > 0 ? 'exists' : existed ? 'updated' : 'created'
}

export interface PixelTools {
  parseSettings: typeof parseSettings
  hasSettings: typeof hasSettings
  isCurrentPixel: typeof isCurrentPixel
  findPixel: typeof findPixel
  runPixelMutation: typeof runPixelMutation
  createPixel: typeof createPixel
  updatePixel: typeof updatePixel
  writePixel: typeof writePixel
  pickOutcome: typeof pickOutcome
  ensureMetricsPixel: typeof ensureMetricsPixel
}

/** Makes sure the shop's pixel exists and points at this app. Throws the message of a refusal other than "already there". */
export async function ensureMetricsPixel({ shop, collectUrl, queryShop, tools }: { shop: string; collectUrl: string; queryShop: QueryShop; tools: PixelTools }): Promise<PixelOutcome> {
  const wanted = { collectUrl, shop }
  const pixel = await tools.findPixel({ shop, queryShop })
  if (tools.isCurrentPixel({ pixel, wanted, tools })) return 'exists'

  const errors = await tools.writePixel({ pixel, shop, queryShop, wanted, tools })
  const refused = errors.filter(isRefusal)
  if (refused.length > 0) throw new Error(refused.map(readMessage).join('; '))
  return tools.pickOutcome({ errors, existed: pixel !== null })
}

export const PIXEL_TOOLS: PixelTools = { parseSettings, hasSettings, isCurrentPixel, findPixel, runPixelMutation, createPixel, updatePixel, writePixel, pickOutcome, ensureMetricsPixel }

/** For the home page, which must never be blocked: reports the reason and answers 'failed'. */
export async function ensureMetricsPixelSafely({ collectUrl, getShop, queryShop, report, tools }: { collectUrl: string | null; getShop: () => Promise<string>; queryShop: QueryShop; report: (message: string) => void; tools: PixelTools }): Promise<PixelOutcome | 'failed'> {
  if (!collectUrl) {
    report('Could not make sure the metrics pixel exists: the address of the app is not known')
    return 'failed'
  }
  try {
    return await tools.ensureMetricsPixel({ shop: await getShop(), collectUrl, queryShop, tools })
  } catch (error) {
    report(`Could not make sure the metrics pixel exists: ${(error as Error).message}`)
    return 'failed'
  }
}
