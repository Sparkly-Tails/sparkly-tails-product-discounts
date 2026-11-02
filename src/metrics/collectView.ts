// Reads one view reported by the storefront pixel. The route is public, so the body is checked before anything else
// is done with it: size, shape, a real shop host and a product id.
import { isShopHost } from '@/lib/idToken'
import type { RecordViewTools } from '@/metrics/recordView'

const MAX_BODY_CHARS = 2048
const MAX_CLIENT_ID_CHARS = 128
const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d{1,20}$/

export interface ViewBody {
  shop: string
  productId: string
  clientId: string
}

export function readJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isTextWithin({ value, max }: { value: unknown; max: number }): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProductGid({ value }: { value: unknown }): boolean {
  return typeof value === 'string' && PRODUCT_GID.test(value)
}

function isShopText({ value, tools }: { value: unknown; tools: Pick<ViewParseTools, 'isShopHost'> }): boolean {
  return typeof value === 'string' && tools.isShopHost(value)
}

function isViewShape({ record, tools }: { record: Record<string, unknown>; tools: ViewParseTools }): boolean {
  return tools.isShopText({ value: record.shop, tools }) && tools.isProductGid({ value: record.productId }) && tools.isTextWithin({ value: record.clientId, max: MAX_CLIENT_ID_CHARS })
}

/** The view the value describes, or null when it is not exactly what the pixel sends. */
export function pickViewBody({ value, tools }: { value: unknown; tools: ViewParseTools }): ViewBody | null {
  if (!tools.isRecord(value) || !tools.isViewShape({ record: value, tools })) return null
  return { shop: value.shop as string, productId: value.productId as string, clientId: value.clientId as string }
}

/** The view in the text, or null for anything that is not exactly what the pixel sends. */
export function parseViewBody({ text, tools }: { text: string; tools: ViewParseTools }): ViewBody | null {
  if (text.length > MAX_BODY_CHARS) return null
  return tools.pickViewBody({ value: tools.readJson(text), tools })
}

/** The checks the parse calls, gathered once so each can be swapped in a test. */
export const VIEW_PARSE_TOOLS = { readJson, isRecord, isTextWithin, isProductGid, isShopText, isShopHost, isViewShape, pickViewBody, parseViewBody }

export type ViewParseTools = typeof VIEW_PARSE_TOOLS

export interface AcceptTools extends ViewParseTools {
  recordView: (args: { shop: string; productId: string; clientId: string; nowMs: number; secret: string; tools: RecordViewTools }) => Promise<'counted' | 'duplicate' | 'ignored'>
  viewTools: RecordViewTools
}

/** Records the view in the text. Nothing is stored when the body is refused, or when there is no secret to key the visitor hash with. */
export async function acceptView({ text, nowMs, secret, tools }: { text: string; nowMs: number; secret: string; tools: AcceptTools }): Promise<'counted' | 'duplicate' | 'ignored'> {
  const body = tools.parseViewBody({ text, tools })
  if (!body || !secret) return 'ignored'
  return tools.recordView({ ...body, nowMs, secret, tools: tools.viewTools })
}
