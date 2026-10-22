// Keeps the Shopify discount of a flash sale in step with the tier discount.
// The record exists only while the discount is live and a flash sale; every
// call to Shopify is passed in, so each step here is a small pure decision.
import {
  buildFlashRecordInput,
  createFlashRecord,
  deleteFlashRecord,
  updateFlashRecord,
  type ShopifyQuery,
} from '@/flash/shopifyRecord'

export type RecordAction = 'create' | 'update' | 'delete' | 'none'

const ACTIONS = { 'true:true': 'update', 'true:false': 'create', 'false:true': 'delete', 'false:false': 'none' } as const

/** Live and a flash sale: create the record, or update it when it exists. Anything else: delete a record that exists, else nothing. */
export function decideRecordAction({ status, hasFlash, shopifyDiscountId }: {
  status: 'draft' | 'live'
  hasFlash: boolean
  shopifyDiscountId: string | undefined
}): RecordAction {
  const isRunning = status === 'live' && hasFlash
  return ACTIONS[`${isRunning}:${shopifyDiscountId !== undefined}` as keyof typeof ACTIONS]
}

export interface RecordContext {
  query: ShopifyQuery
  title: string
  discountId: string
  flash: { startsAt: string; endsAt: string } | undefined
  shopifyDiscountId: string | undefined
  convertToUtc: (naive: string) => string
  tools: RecordTools
}

export function buildWindowInput(context: RecordContext) {
  return context.tools.buildInput({
    title: context.title,
    discountId: context.discountId,
    startsAtUtc: context.convertToUtc(context.flash!.startsAt),
    endsAtUtc: context.convertToUtc(context.flash!.endsAt),
  })
}

// One handler per action; each returns the id of the Shopify discount to store (or undefined when there is none).
export const RECORD_HANDLERS = {
  create: async (context: RecordContext): Promise<string | undefined> =>
    context.tools.createRecord({ query: context.query, input: context.tools.buildWindowInput(context) }),
  update: async (context: RecordContext): Promise<string | undefined> => {
    await context.tools.updateRecord({ query: context.query, shopifyDiscountId: context.shopifyDiscountId!, input: context.tools.buildWindowInput(context) })
    return context.shopifyDiscountId
  },
  delete: async (context: RecordContext): Promise<string | undefined> => {
    await context.tools.deleteRecord({ query: context.query, shopifyDiscountId: context.shopifyDiscountId! })
    return undefined
  },
  none: async (): Promise<string | undefined> => undefined,
}

export interface RecordTools {
  decideAction: typeof decideRecordAction
  handlers: typeof RECORD_HANDLERS
  buildInput: typeof buildFlashRecordInput
  buildWindowInput: typeof buildWindowInput
  createRecord: typeof createFlashRecord
  updateRecord: typeof updateFlashRecord
  deleteRecord: typeof deleteFlashRecord
}

export const RECORD_TOOLS: RecordTools = {
  decideAction: decideRecordAction,
  handlers: RECORD_HANDLERS,
  buildInput: buildFlashRecordInput,
  buildWindowInput,
  createRecord: createFlashRecord,
  updateRecord: updateFlashRecord,
  deleteRecord: deleteFlashRecord,
}

/**
 * Brings Shopify in step with the discount and returns the id of its Shopify
 * discount to store (undefined when it has none). A Shopify refusal throws, so
 * the caller can keep the old state and show the message.
 */
export async function syncFlashRecord(options: Omit<RecordContext, 'tools'> & { status: 'draft' | 'live'; tools: RecordTools }): Promise<string | undefined> {
  const { status, tools, ...context } = options
  const action = tools.decideAction({ status, hasFlash: context.flash !== undefined, shopifyDiscountId: context.shopifyDiscountId })
  return tools.handlers[action]({ ...context, tools })
}
