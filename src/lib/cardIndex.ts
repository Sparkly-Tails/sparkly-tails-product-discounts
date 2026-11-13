import type { Discount, Tier } from '@/lib/config'
import { computeFlashWindowUnix, type FlashWindowUnix } from '@/flash/window'
import { getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import { shopifyQuery } from '@/lib/shopify-client'

/**
 * The index the storefront's product-card script reads (the app embed prints it into every page): one entry per
 * live discount, with only what a card needs to work out its price. A card knows a product by its link, so each
 * member carries the product's handle: the script fetches live prices only for the products listed here and
 * looks the product up by its handle. A product with no handle (it no longer exists) is left out. Drafts and
 * admin-only fields stay out. Ids are the plain numbers Shopify uses in the storefront (no gid prefix).
 */
export interface CardIndexMember {
  productId: string
  /** The product's handle, the last part of its storefront link. */
  handle: string
  /** null = the whole product (its single variant); a list = only these variants. */
  variantIds: string[] | null
}

export interface CardIndexDiscount {
  /** The discount's own id, as saved: the checkout pop-up remembers per discount that it was shown. */
  discountId: string
  /** The customer-facing title (the discount's name when the title is blank). */
  title: string
  tiers: Tier[]
  members: CardIndexMember[]
  /** The flash sale window in Unix seconds; null for a regular discount. */
  flash: FlashWindowUnix | null
}

export interface CardIndex {
  discounts: CardIndexDiscount[]
}

interface MemberRecord {
  productId: string
  variantId?: string
}

type VariantGroups = Map<string, string[] | null>

/** A product with its variants, before its handle is attached. */
interface GroupedMember {
  productId: string
  variantIds: string[] | null
}

type HandleList = Record<string, string>

/** `gid://shopify/Product/123` becomes `123`. */
export function readNumericId({ gid }: { gid: string }): string {
  return gid.slice(gid.lastIndexOf('/') + 1)
}

/** The variants a product has in the discount after one more member: a whole-product member (no variant) covers all of them. */
export function mergeVariantIds({ current, variantId }: { current: string[] | null; variantId: string | null }): string[] | null {
  if (variantId === null || current === null) return null
  return current.concat(variantId)
}

type ShopQuery = <Result>(query: string, variables: Record<string, unknown>) => Promise<Result>

export interface CardIndexTools {
  readNumericId: typeof readNumericId
  mergeVariantIds: typeof mergeVariantIds
  addMemberToGroups: typeof addMemberToGroups
  groupMembers: typeof groupMembers
  hasHandle: typeof hasHandle
  attachHandle: typeof attachHandle
  attachHandles: typeof attachHandles
  buildCardDiscount: typeof buildCardDiscount
  pickCardTitle: typeof pickCardTitle
  buildCardEntry: typeof buildCardEntry
  listFlashPair: typeof listFlashPair
  listFlashWindows: typeof listFlashWindows
  splitIntoBatches: typeof splitIntoBatches
  isProductNode: typeof isProductNode
  listNodePair: typeof listNodePair
  readHandleBatch: typeof readHandleBatch
  readProductHandles: typeof readProductHandles
  listNumericPair: typeof listNumericPair
  listLiveHandles: typeof listLiveHandles
  queryShop: ShopQuery
  readTimeZone: () => Promise<string>
  computeFlashWindowUnix: typeof computeFlashWindowUnix
  convertToUtc: (naive: string, timeZone: string) => string
}

export function addMemberToGroups({ groups, tools }: { groups: VariantGroups; tools: CardIndexTools }, member: MemberRecord): void {
  const productId = tools.readNumericId({ gid: member.productId })
  const current = groups.has(productId) ? (groups.get(productId) as string[] | null) : []
  const variantId = member.variantId === undefined ? null : tools.readNumericId({ gid: member.variantId })
  groups.set(productId, tools.mergeVariantIds({ current, variantId }))
}

/** One entry per product, in the order the products first appear. */
export function groupMembers({ members, tools }: { members: MemberRecord[]; tools: CardIndexTools }): GroupedMember[] {
  const groups: VariantGroups = new Map()
  members.forEach(tools.addMemberToGroups.bind(null, { groups, tools }))
  return [...groups].map(([productId, variantIds]) => ({ productId, variantIds }))
}

export function hasHandle(handles: HandleList, member: GroupedMember): boolean {
  return Boolean(handles[member.productId])
}

export function attachHandle(handles: HandleList, member: GroupedMember): CardIndexMember {
  return { ...member, handle: handles[member.productId] }
}

/** The grouped products that have a handle, with it; the others are dropped. `handles` is by numeric product id. */
export function attachHandles({ members, handles, tools }: { members: GroupedMember[]; handles: HandleList; tools: CardIndexTools }): CardIndexMember[] {
  return members.filter(tools.hasHandle.bind(null, handles)).map(tools.attachHandle.bind(null, handles))
}

/** The title a customer sees: the discount's own, or its name when the title is blank. */
export function pickCardTitle({ title, name }: { title: string; name: string }): string {
  return title || name
}

export function buildCardDiscount({ discount, window, handles, tools }: { discount: Discount; window: FlashWindowUnix | null; handles: HandleList; tools: CardIndexTools }): CardIndexDiscount {
  const grouped = tools.groupMembers({ members: discount.members, tools })
  return {
    discountId: discount.discountId,
    title: tools.pickCardTitle({ title: discount.title, name: discount.name }),
    tiers: discount.tiers,
    members: tools.attachHandles({ members: grouped, handles, tools }),
    flash: window,
  }
}

/** `items` cut into lists of at most `size`. */
export function splitIntoBatches<Item>({ items, size }: { items: Item[]; size: number }): Item[][] {
  const batches: Item[][] = []
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size))
  return batches
}

/** `nodes(ids:)` accepts at most 250 IDs per call. */
const HANDLE_BATCH_SIZE = 250

interface ProductNode {
  id?: string
  handle?: string
}

/** `nodes` answers null for an id that no longer exists. */
export function isProductNode(node: ProductNode | null): node is { id: string; handle: string } {
  return node !== null && node.handle !== undefined
}

export function listNodePair(node: { id: string; handle: string }): [string, string] {
  return [node.id, node.handle]
}

export async function readHandleBatch(tools: CardIndexTools, ids: string[]): Promise<[string, string][]> {
  const data = await tools.queryShop<{ nodes: (ProductNode | null)[] }>(
    `query productHandles($ids: [ID!]!) {
      nodes(ids: $ids) { ... on Product { id handle } }
    }`,
    { ids },
  )
  return data.nodes.filter(tools.isProductNode).map(tools.listNodePair)
}

/** The handle of each product (by gid), asked of Shopify in batches; a product that no longer exists is missing from the answer. */
export async function readProductHandles({ productIds, tools }: { productIds: string[]; tools: CardIndexTools }): Promise<HandleList> {
  const batches = tools.splitIntoBatches({ items: productIds, size: HANDLE_BATCH_SIZE })
  const answers = await Promise.all(batches.map(tools.readHandleBatch.bind(null, tools)))
  return Object.fromEntries(answers.flat())
}

export function listNumericPair(tools: CardIndexTools, [gid, handle]: [string, string]): [string, string] {
  return [tools.readNumericId({ gid }), handle]
}

/** The handles by numeric product id, for the products of the live discounts; nothing is asked when none is live. */
export async function listLiveHandles({ discounts, tools }: { discounts: Discount[]; tools: CardIndexTools }): Promise<HandleList> {
  const live = discounts.filter((discount) => discount.status === 'live')
  const productIds = [...new Set(live.flatMap((discount) => discount.members.map((member) => member.productId)))]
  if (productIds.length === 0) return {}
  const byGid = await tools.readProductHandles({ productIds, tools })
  return Object.fromEntries(Object.entries(byGid).map(tools.listNumericPair.bind(null, tools)))
}

export function listFlashPair({ timeZone, tools }: { timeZone: string; tools: CardIndexTools }, discount: Discount): [string, FlashWindowUnix] {
  const flash = discount.flash as NonNullable<Discount['flash']>
  return [discount.discountId, tools.computeFlashWindowUnix({ startsAt: flash.startsAt, endsAt: flash.endsAt, timeZone, convertToUtc: tools.convertToUtc })]
}

/** The flash window of each live flash sale, by discount id. The shop's timezone is only asked for when there is one. */
export async function listFlashWindows({ discounts, tools }: { discounts: Discount[]; tools: CardIndexTools }): Promise<Record<string, FlashWindowUnix>> {
  const flashing = discounts.filter((discount) => discount.status === 'live' && discount.flash)
  if (flashing.length === 0) return {}
  const timeZone = await tools.readTimeZone()
  return Object.fromEntries(flashing.map(tools.listFlashPair.bind(null, { timeZone, tools })))
}

export function buildCardEntry({ windows, handles, tools }: { windows: Record<string, FlashWindowUnix>; handles: HandleList; tools: CardIndexTools }, discount: Discount): CardIndexDiscount {
  return tools.buildCardDiscount({ discount, window: windows[discount.discountId] ?? null, handles, tools })
}

/** The index of the live discounts, as the JSON text stored in the shop metafield. */
export async function buildCardIndexValue({ discounts, tools }: { discounts: Discount[]; tools: CardIndexTools }): Promise<string> {
  const windows = await tools.listFlashWindows({ discounts, tools })
  const handles = await tools.listLiveHandles({ discounts, tools })
  const live = discounts.filter((discount) => discount.status === 'live')
  const index: CardIndex = { discounts: live.map(tools.buildCardEntry.bind(null, { windows, handles, tools })) }
  return JSON.stringify(index)
}

export const CARD_INDEX_TOOLS: CardIndexTools = {
  readNumericId,
  mergeVariantIds,
  addMemberToGroups,
  groupMembers,
  hasHandle,
  attachHandle,
  attachHandles,
  buildCardDiscount,
  pickCardTitle,
  buildCardEntry,
  listFlashPair,
  listFlashWindows,
  splitIntoBatches,
  isProductNode,
  listNodePair,
  readHandleBatch,
  readProductHandles,
  listNumericPair,
  listLiveHandles,
  queryShop: shopifyQuery,
  readTimeZone: getShopTimezone,
  computeFlashWindowUnix,
  convertToUtc: zonedTimeToUtc,
}
