// Reads an order from the webhook payload (REST names) or from the Admin API (GraphQL names) into the same plain facts.
// Both readers return null for anything malformed and never throw. Which discount application is this app's is decided
// in one place, isAppDiscount.
import { roundMoney } from '@/metrics/addedRevenue'
import { readJson } from '@/metrics/collectView'
import { mapEach } from '@/metrics/mapEach'
import type { OrderFacts, OrderLineFacts } from '@/metrics/types'

type Unit = Record<string, unknown>
type Application = { type: string; title: string }

const AUTOMATIC_TYPE = 'automatic'
/** How the Admin API names the application types the webhook names otherwise. */
const GRAPHQL_TYPES: Record<string, string> = { AutomaticDiscountApplication: AUTOMATIC_TYPE }
/** The messages the discount Function gives each application: "15% off", "12.5% off" or "£12.00 each" (a test reads the Function to keep this true). */
const TIER_MESSAGE_PATTERN = /^(\d+(\.\d+)?% off|£\d+\.\d{2} each)$/
const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/
const GID_PARTS_PATTERN = /^(number|string):\d{1,20}$/

/** True for a discount application that is this app's discount: an automatic one titled with a message of the discount Function (an order carries that message, not the discount's own title). */
export function isAppDiscount({ type, title }: Application): boolean {
  return type === AUTOMATIC_TYPE && TIER_MESSAGE_PATTERN.test(title)
}

export function readRecord({ value }: { value: unknown }): Unit | null {
  return Object.prototype.toString.call(value) === '[object Object]' ? (value as Unit) : null
}

export function readList({ value }: { value: unknown }): unknown[] | null {
  return Array.isArray(value) ? value : null
}

export function readText({ value }: { value: unknown }): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function readTextOr({ value, fallback }: { value: unknown; fallback: string }): string {
  return typeof value === 'string' ? value : fallback
}

/** A number from a number or from the text Shopify writes money in; null when it is neither. */
export function readAmount({ value }: { value: unknown }): number | null {
  return AMOUNT_PATTERN.test(String(value)) ? Number(value) : null
}

/** Follows the names in `path` through nested records and lists; undefined at the first step that is not there. */
export function readPath({ value, path }: { value: unknown; path: string[] }): unknown {
  let current: unknown = value
  for (const name of path) current = (current as Unit | null)?.[name]
  return current
}

export function buildGid({ type, id }: { type: string; id: unknown }): string | null {
  return GID_PARTS_PATTERN.test(`${typeof id}:${id}`) ? `gid://shopify/${type}/${id}` : null
}

/** The amount at `path` as money rounded to cents, or null. */
export function readMoney({ order, path, tools }: { order: unknown; path: string[]; tools: ReadOrderTools }): number | null {
  const amount = tools.readAmount({ value: tools.readPath({ value: order, path }) })
  return amount === null ? null : tools.roundMoney({ amount })
}

export function readTextAt({ order, path, tools }: { order: unknown; path: string[]; tools: ReadOrderTools }): string | null {
  return tools.readText({ value: tools.readPath({ value: order, path }) })
}

/** The order as facts, or null when any part of it is missing. */
export function completeFacts({ facts }: { facts: Record<keyof OrderFacts, unknown> }): OrderFacts | null {
  return Object.values(facts).some((part) => part === null) ? null : (facts as unknown as OrderFacts)
}

export interface LineContext {
  applications: unknown[]
  tools: ReadOrderTools
}

/** The lines as facts, or null when there is no list of lines or one line is malformed. */
export function readOrderLines({ rawLines, run, context }: { rawLines: unknown; run: (args: { item: unknown; context: LineContext }) => OrderLineFacts | null; context: LineContext }): OrderLineFacts[] | null {
  const items = context.tools.readList({ value: rawLines })
  const lines = items ? context.tools.mapEach({ items, run, context }) : [null]
  return lines.includes(null) ? null : (lines as OrderLineFacts[])
}

function isNumber(value: number | null): value is number {
  return value !== null
}

function addAmount(total: number, amount: number): number {
  return total + amount
}

export function pickLineFacts({ productId, quantity, unitPrice, amounts }: { productId: string; quantity: number | null; unitPrice: number | null; amounts: number[] }): OrderLineFacts | null {
  if (quantity === null || unitPrice === null) return null
  return { productId, quantity, unitPrice: Math.round(unitPrice * 100) / 100, discountAmount: Math.round(amounts.reduce(addAmount, 0) * 100) / 100, appDiscounted: amounts.length > 0 }
}

// --- the webhook (REST names) -------------------------------------------------------------------------------------------

export function readWebhookApplication({ allocation, applications, tools }: { allocation: unknown; applications: unknown[]; tools: ReadOrderTools }): Application {
  const index = tools.readAmount({ value: tools.readPath({ value: allocation, path: ['discount_application_index'] }) })
  const application = tools.readPath({ value: applications, path: [String(index)] })
  return {
    type: tools.readTextOr({ value: tools.readPath({ value: application, path: ['type'] }), fallback: '' }),
    title: tools.readTextOr({ value: tools.readPath({ value: application, path: ['title'] }), fallback: '' }),
  }
}

/** The part of one allocation that came from this app's discount, or null when it came from another discount. */
export function readWebhookAppAmount({ item: allocation, context }: { item: unknown; context: LineContext }): number | null {
  const { tools, applications } = context
  const application = tools.readWebhookApplication({ allocation, applications, tools })
  return tools.isAppDiscount(application) ? tools.readAmount({ value: tools.readPath({ value: allocation, path: ['amount_set', 'shop_money', 'amount'] }) }) : null
}

export function readWebhookLine({ item: line, context }: { item: unknown; context: LineContext }): OrderLineFacts | null {
  const { tools } = context
  const allocations = tools.readList({ value: tools.readPath({ value: line, path: ['discount_allocations'] }) }) ?? []
  return tools.pickLineFacts({
    productId: tools.buildGid({ type: 'Product', id: tools.readPath({ value: line, path: ['product_id'] }) }) ?? '',
    quantity: tools.readAmount({ value: tools.readPath({ value: line, path: ['quantity'] }) }),
    unitPrice: tools.readAmount({ value: tools.readPath({ value: line, path: ['price_set', 'shop_money', 'amount'] }) }),
    amounts: tools.mapEach({ items: allocations, run: tools.readWebhookAppAmount, context }).filter(isNumber),
  })
}

export function readWebhookOrderId({ order, tools }: { order: Unit; tools: ReadOrderTools }): string | null {
  return tools.readText({ value: order.admin_graphql_api_id }) ?? tools.buildGid({ type: 'Order', id: order.id })
}

export function pickWebhookFacts({ order, tools }: { order: Unit; tools: ReadOrderTools }): OrderFacts | null {
  const applications = tools.readList({ value: order.discount_applications }) ?? []
  const subtotalPath = ['current_subtotal_price_set', 'shop_money']
  return tools.completeFacts({
    facts: {
      orderId: tools.readWebhookOrderId({ order, tools }),
      orderedAt: tools.readTextAt({ order, path: ['created_at'], tools }),
      currency: tools.readTextAt({ order, path: [...subtotalPath, 'currency_code'], tools }),
      subtotal: tools.readMoney({ order, path: [...subtotalPath, 'amount'], tools }),
      lines: tools.readOrderLines({ rawLines: order.line_items, run: tools.readWebhookLine, context: { applications, tools } }),
    },
  })
}

export function readWebhookOrder({ body, tools }: { body: string; tools: ReadOrderTools }): OrderFacts | null {
  const order = tools.readRecord({ value: tools.readJson(body) })
  return order ? tools.pickWebhookFacts({ order, tools }) : null
}

// --- the Admin API (GraphQL names) --------------------------------------------------------------------------------------

export function readGraphqlApplication({ allocation, tools }: { allocation: unknown; tools: ReadOrderTools }): Application {
  const kind = tools.readTextOr({ value: tools.readPath({ value: allocation, path: ['discountApplication', '__typename'] }), fallback: '' })
  return {
    type: GRAPHQL_TYPES[kind] ?? kind,
    title: tools.readTextOr({ value: tools.readPath({ value: allocation, path: ['discountApplication', 'title'] }), fallback: '' }),
  }
}

export function readGraphqlAppAmount({ item: allocation, context }: { item: unknown; context: LineContext }): number | null {
  const { tools } = context
  return tools.isAppDiscount(tools.readGraphqlApplication({ allocation, tools })) ? tools.readAmount({ value: tools.readPath({ value: allocation, path: ['allocatedAmountSet', 'shopMoney', 'amount'] }) }) : null
}

export function readGraphqlLine({ item: line, context }: { item: unknown; context: LineContext }): OrderLineFacts | null {
  const { tools } = context
  const allocations = tools.readList({ value: tools.readPath({ value: line, path: ['discountAllocations'] }) }) ?? []
  return tools.pickLineFacts({
    productId: tools.readTextOr({ value: tools.readPath({ value: line, path: ['product', 'id'] }), fallback: '' }),
    quantity: tools.readAmount({ value: tools.readPath({ value: line, path: ['quantity'] }) }),
    unitPrice: tools.readAmount({ value: tools.readPath({ value: line, path: ['originalUnitPriceSet', 'shopMoney', 'amount'] }) }),
    amounts: tools.mapEach({ items: allocations, run: tools.readGraphqlAppAmount, context }).filter(isNumber),
  })
}

export function readGraphqlOrder({ node, tools }: { node: unknown; tools: ReadOrderTools }): OrderFacts | null {
  const subtotalPath = ['currentSubtotalPriceSet', 'shopMoney']
  return tools.completeFacts({
    facts: {
      orderId: tools.readTextAt({ order: node, path: ['id'], tools }),
      orderedAt: tools.readTextAt({ order: node, path: ['createdAt'], tools }),
      currency: tools.readTextAt({ order: node, path: [...subtotalPath, 'currencyCode'], tools }),
      subtotal: tools.readMoney({ order: node, path: [...subtotalPath, 'amount'], tools }),
      lines: tools.readOrderLines({ rawLines: tools.readPath({ value: node, path: ['lineItems', 'nodes'] }), run: tools.readGraphqlLine, context: { applications: [], tools } }),
    },
  })
}

export interface ReadOrderTools {
  readJson: typeof readJson
  roundMoney: typeof roundMoney
  isAppDiscount: typeof isAppDiscount
  readRecord: typeof readRecord
  readList: typeof readList
  readText: typeof readText
  readTextOr: typeof readTextOr
  readAmount: typeof readAmount
  readPath: typeof readPath
  buildGid: typeof buildGid
  readMoney: typeof readMoney
  readTextAt: typeof readTextAt
  completeFacts: typeof completeFacts
  mapEach: typeof mapEach
  readOrderLines: typeof readOrderLines
  pickLineFacts: typeof pickLineFacts
  readWebhookApplication: typeof readWebhookApplication
  readWebhookAppAmount: typeof readWebhookAppAmount
  readWebhookLine: typeof readWebhookLine
  readWebhookOrderId: typeof readWebhookOrderId
  pickWebhookFacts: typeof pickWebhookFacts
  readGraphqlApplication: typeof readGraphqlApplication
  readGraphqlAppAmount: typeof readGraphqlAppAmount
  readGraphqlLine: typeof readGraphqlLine
}

export const READ_ORDER_TOOLS: ReadOrderTools = {
  readJson, roundMoney, isAppDiscount, readRecord, readList, readText, readTextOr, readAmount, readPath, buildGid, readMoney, readTextAt, completeFacts,
  mapEach, readOrderLines, pickLineFacts, readWebhookApplication, readWebhookAppAmount, readWebhookLine, readWebhookOrderId, pickWebhookFacts,
  readGraphqlApplication, readGraphqlAppAmount, readGraphqlLine,
}
