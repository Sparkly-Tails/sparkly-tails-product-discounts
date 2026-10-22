// A dev-store cart showed that a flash product next to a product of a regular
// tier discount only gets both discounts when BOTH Shopify discounts allow
// product discounts to combine. The shared "Product tier discounts" record is
// created without that and the app never changes an existing record, so this
// is the one exception: when a store runs its first flash sale, the shared
// record is switched to combine. Stores without a flash sale are untouched.
import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from '@/lib/metafieldNames'
import { TIER_FUNCTION_HANDLE, type ShopifyQuery } from '@/flash/shopifyRecord'

interface RawRecordNode {
  id: string
  flash: { id: string } | null
  discount: { combinesWith?: { productDiscounts: boolean }; appDiscountType?: { functionId: string } }
}

interface RecordsData {
  shopifyFunctions: { nodes: { id: string; handle: string }[] }
  discountNodes: { nodes: RawRecordNode[] }
}

export type CombineState = 'true' | 'false' | 'missing'

/** One Shopify discount reduced to plain values; `sharedKey` is the Function id for a record that is not a flash record, else empty. */
export interface RecordNode {
  id: string
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
        ... on DiscountAutomaticApp { combinesWith { productDiscounts } appDiscountType { functionId } }
      }
    }
  }
}`

const COMBINE_MUTATION = `mutation allowSharedCombining($id: ID!) {
  discountAutomaticAppUpdate(id: $id, automaticAppDiscount: { combinesWith: { productDiscounts: true } }) {
    userErrors { field message }
  }
}`

export function readFunctionId({ discount }: { discount: RawRecordNode['discount'] }): string {
  return discount.appDiscountType?.functionId ?? ''
}

export function readCombineState({ discount }: { discount: RawRecordNode['discount'] }): CombineState {
  return discount.combinesWith?.productDiscounts === true ? 'true' : 'false'
}

interface NodeTools {
  readFunctionId: typeof readFunctionId
  readCombineState: typeof readCombineState
}

/** A Shopify node reduced to the plain values the choice needs. */
export function flattenRecordNode({ node, tools }: { node: RawRecordNode; tools: NodeTools }): RecordNode {
  const functionId = tools.readFunctionId({ discount: node.discount })
  return { id: node.id, sharedKey: node.flash === null ? functionId : '', state: tools.readCombineState({ discount: node.discount }) }
}

export function flattenRecordNodes({ nodes, tools }: { nodes: RawRecordNode[]; tools: NodeTools & { flattenNode: typeof flattenRecordNode } }): RecordNode[] {
  const flat: RecordNode[] = []
  for (const node of nodes) flat.push(tools.flattenNode({ node, tools }))
  return flat
}

const NO_RECORD: RecordNode = { id: '', sharedKey: '', state: 'missing' }

/** The shared record is the tier Function's record that is not a flash record; NO_RECORD when there is none. */
export function findSharedRecord({ nodes, functionId }: { nodes: RecordNode[]; functionId: string }): RecordNode {
  for (const node of nodes) if (node.sharedKey === functionId) return node
  return NO_RECORD
}

export function findFunctionId({ functions, handle }: { functions: { id: string; handle: string }[]; handle: string }): string {
  for (const found of functions) if (found.handle === handle) return found.id
  return ''
}

async function updateRecord({ query, recordId }: { query: ShopifyQuery; recordId: string }): Promise<CombiningResult> {
  const data = await query<{ discountAutomaticAppUpdate: { userErrors: { message: string }[] } }>(COMBINE_MUTATION, { id: recordId })
  const errors = data.discountAutomaticAppUpdate.userErrors
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join('; '))
  return 'updated'
}

// What to do for each state of the shared record: none, one that combines, one that does not.
const STEPS = {
  missing: async (): Promise<CombiningResult> => 'missing',
  true: async (): Promise<CombiningResult> => 'already',
  false: updateRecord,
}

export const SHARED_RECORD_TOOLS = {
  flattenNodes: flattenRecordNodes,
  flattenNode: flattenRecordNode,
  readFunctionId,
  readCombineState,
  findRecord: findSharedRecord,
  findFunction: findFunctionId,
  steps: STEPS,
  handle: TIER_FUNCTION_HANDLE,
}

/**
 * Makes the shared tier record allow product discounts to combine, once.
 * 'missing' means the store has no shared record (nothing to change).
 */
export async function allowSharedCombining({ query, tools }: { query: ShopifyQuery; tools: typeof SHARED_RECORD_TOOLS }): Promise<CombiningResult> {
  const data = await query<RecordsData>(RECORDS_QUERY, { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.flashRecord })
  const functionId = tools.findFunction({ functions: data.shopifyFunctions.nodes, handle: tools.handle })
  const nodes = tools.flattenNodes({ nodes: data.discountNodes.nodes, tools })
  const record = tools.findRecord({ nodes, functionId })
  return tools.steps[record.state]({ query, recordId: record.id })
}
