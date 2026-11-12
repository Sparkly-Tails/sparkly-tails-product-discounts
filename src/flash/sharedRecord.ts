// A dev-store cart showed that a flash product next to a product of a regular
// tier discount only gets both discounts when BOTH Shopify discounts allow
// product discounts to combine. The shared "Product tier discounts" record is
// created without that and the app never changes an existing record, so this
// is the one exception: when a store runs its first flash sale, the shared
// record is switched to combine. Stores without a flash sale are untouched.
import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from '@/lib/metafieldNames'
import { TIER_FUNCTION_HANDLE, type ShopifyQuery } from '@/flash/shopifyRecord'

interface RawCombinesWith {
  orderDiscounts?: boolean
  shippingDiscounts?: boolean
  productDiscounts?: boolean
}

interface RawRecordNode {
  id: string
  flash: { id: string } | null
  discount: { combinesWith?: RawCombinesWith; appDiscountType?: { functionId: string } }
}

interface RecordsData {
  shopifyFunctions: { nodes: { id: string; handle: string }[] }
  discountNodes: { nodes: RawRecordNode[] }
}

export type CombineState = 'true' | 'false' | 'missing'

/** What a discount lets other discounts do next to it, as plain values. */
export interface CombineFlags {
  orderDiscounts: boolean
  shippingDiscounts: boolean
  productDiscounts: boolean
}

/** One Shopify discount reduced to plain values; `sharedKey` is the Function id for a record that is not a flash record, else empty. */
export interface RecordNode extends CombineFlags {
  id: string
  functionId: string
  sharedKey: string
  state: CombineState
}

export type CombiningResult = 'updated' | 'already' | 'missing'

const RECORDS_QUERY = `query sharedTierRecords($namespace: String!, $key: String!) {
  shopifyFunctions(first: 25) { nodes { id handle } }
  discountNodes(first: 100, query: "type:app") {
    nodes {
      id
      flash: metafield(namespace: $namespace, key: $key) { id }
      discount {
        ... on DiscountAutomaticApp { combinesWith { orderDiscounts shippingDiscounts productDiscounts } appDiscountType { functionId } }
      }
    }
  }
}`

const COMBINE_MUTATION = `mutation updateCombining($id: ID!, $combinesWith: DiscountCombinesWithInput!) {
  discountAutomaticAppUpdate(id: $id, automaticAppDiscount: { combinesWith: $combinesWith }) {
    userErrors { field message }
  }
}`

export function readFunctionId({ discount }: { discount: RawRecordNode['discount'] }): string {
  return discount.appDiscountType?.functionId ?? ''
}

export function readCombineState({ discount }: { discount: RawRecordNode['discount'] }): CombineState {
  return discount.combinesWith?.productDiscounts === true ? 'true' : 'false'
}

/** The three combining choices of a discount; a missing one is Shopify's default, which is off. */
export function readCombineFlags({ discount }: { discount: RawRecordNode['discount'] }): CombineFlags {
  const combines = discount.combinesWith ?? {}
  return { orderDiscounts: Boolean(combines.orderDiscounts), shippingDiscounts: Boolean(combines.shippingDiscounts), productDiscounts: Boolean(combines.productDiscounts) }
}

interface NodeTools {
  readFunctionId: typeof readFunctionId
  readCombineState: typeof readCombineState
  readCombineFlags: typeof readCombineFlags
}

/** A Shopify node reduced to the plain values the choice needs. */
export function flattenRecordNode({ node, tools }: { node: RawRecordNode; tools: NodeTools }): RecordNode {
  const functionId = tools.readFunctionId({ discount: node.discount })
  return {
    id: node.id,
    functionId,
    sharedKey: node.flash === null ? functionId : '',
    state: tools.readCombineState({ discount: node.discount }),
    ...tools.readCombineFlags({ discount: node.discount }),
  }
}

export function flattenRecordNodes({ nodes, tools }: { nodes: RawRecordNode[]; tools: NodeTools & { flattenNode: typeof flattenRecordNode } }): RecordNode[] {
  const flat: RecordNode[] = []
  for (const node of nodes) flat.push(tools.flattenNode({ node, tools }))
  return flat
}

const NO_RECORD: RecordNode = { id: '', functionId: '', sharedKey: '', state: 'missing', orderDiscounts: false, shippingDiscounts: false, productDiscounts: false }

/** The shared record is the tier Function's record that is not a flash record; NO_RECORD when there is none. */
export function findSharedRecord({ nodes, functionId }: { nodes: RecordNode[]; functionId: string }): RecordNode {
  for (const node of nodes) if (node.sharedKey === functionId) return node
  return NO_RECORD
}

export function findFunctionId({ functions, handle }: { functions: { id: string; handle: string }[]; handle: string }): string {
  for (const found of functions) if (found.handle === handle) return found.id
  return ''
}

/** Sets the three combining choices of one Shopify discount; throws Shopify's own message when it refuses. */
export async function updateCombining({ query, recordId, combinesWith }: { query: ShopifyQuery; recordId: string; combinesWith: CombineFlags }): Promise<void> {
  const data = await query<{ discountAutomaticAppUpdate: { userErrors: { message: string }[] } }>(COMBINE_MUTATION, { id: recordId, combinesWith })
  const errors = data.discountAutomaticAppUpdate.userErrors
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join('; '))
}

const COMBINE_TOOLS = { updateCombining }

/** Turns product-discount combining on and keeps the order and shipping choices the record already has. */
async function allowProductCombining({ query, record, tools = COMBINE_TOOLS }: { query: ShopifyQuery; record: RecordNode; tools?: typeof COMBINE_TOOLS }): Promise<CombiningResult> {
  await tools.updateCombining({ query, recordId: record.id, combinesWith: { orderDiscounts: record.orderDiscounts, shippingDiscounts: record.shippingDiscounts, productDiscounts: true } })
  return 'updated'
}

// What to do for each state of the shared record: none, one that combines, one that does not.
const STEPS = {
  missing: async (): Promise<CombiningResult> => 'missing',
  true: async (): Promise<CombiningResult> => 'already',
  false: allowProductCombining,
}

/** What reading the store's app discounts needs. */
export interface ListTools extends NodeTools {
  flattenNodes: typeof flattenRecordNodes
  flattenNode: typeof flattenRecordNode
  findFunction: typeof findFunctionId
  handle: string
}

export const SHARED_RECORD_TOOLS = {
  listRecords: listTierRecords,
  flattenNodes: flattenRecordNodes,
  flattenNode: flattenRecordNode,
  readFunctionId,
  readCombineState,
  readCombineFlags,
  findRecord: findSharedRecord,
  findFunction: findFunctionId,
  steps: STEPS,
  handle: TIER_FUNCTION_HANDLE,
}

/** Every app discount of the store as plain values, with the id of the tier Function. */
export async function listTierRecords({ query, tools }: { query: ShopifyQuery; tools: ListTools }): Promise<{ nodes: RecordNode[]; functionId: string }> {
  const data = await query<RecordsData>(RECORDS_QUERY, { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.flashRecord })
  const functionId = tools.findFunction({ functions: data.shopifyFunctions.nodes, handle: tools.handle })
  return { nodes: tools.flattenNodes({ nodes: data.discountNodes.nodes, tools }), functionId }
}

/**
 * Makes the shared tier record allow product discounts to combine, once.
 * 'missing' means the store has no shared record (nothing to change).
 */
export async function allowSharedCombining({ query, tools }: { query: ShopifyQuery; tools: typeof SHARED_RECORD_TOOLS }): Promise<CombiningResult> {
  const { nodes, functionId } = await tools.listRecords({ query, tools })
  const record = tools.findRecord({ nodes, functionId })
  return tools.steps[record.state]({ query, record })
}
