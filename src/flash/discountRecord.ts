// Brings the Shopify discount of a flash sale in step with a tier discount, in
// every situation the admin can be in: going live, editing the window or the
// title, going offline, switching flash off, or the sale being over. Every call
// to Shopify comes in through `tools`, so each step is a small decision.
import { hasEndPassed } from '@/flash/schedule'
import { RECORD_TOOLS, syncFlashRecord, type RecordTools } from '@/flash/reconcileRecord'
import { allowSharedCombining, SHARED_RECORD_TOOLS } from '@/flash/sharedRecord'
import type { ShopifyQuery } from '@/flash/shopifyRecord'

export type RecordStep = 'keep' | 'prepare' | 'sync'

// Only a live sale that is still running (or about to run) needs the shared record to combine; a live sale that is over keeps its (expired) record as it is.
const STEP_BY_STATE: Record<string, RecordStep> = { 'live:true:true': 'keep', 'live:true:false': 'prepare' }

export function decideRecordStep({ status, hasFlash, isOver }: { status: 'draft' | 'live'; hasFlash: boolean; isOver: boolean }): RecordStep {
  return STEP_BY_STATE[`${status}:${hasFlash}:${isOver}`] ?? 'sync'
}

export interface DiscountRecordContext {
  query: ShopifyQuery
  discountId: string
  title: string
  status: 'draft' | 'live'
  flash: { startsAt: string; endsAt: string } | undefined
  /** The id stored for the Shopify discount, kept even when flash is being switched off so the record can be deleted. */
  shopifyDiscountId: string | undefined
  /** The shop's current local time (YYYY-MM-DDTHH:mm). */
  nowLocal: string
  convertToUtc: (naive: string) => string
  tools: DiscountRecordTools
}

const STEPS = {
  keep: async (context: DiscountRecordContext): Promise<string | undefined> => context.shopifyDiscountId,
  sync: async (context: DiscountRecordContext): Promise<string | undefined> =>
    context.tools.syncRecord({
      query: context.query,
      title: context.title,
      discountId: context.discountId,
      status: context.status,
      flash: context.flash,
      shopifyDiscountId: context.shopifyDiscountId,
      convertToUtc: context.convertToUtc,
      tools: context.tools.recordTools,
    }),
  prepare: async (context: DiscountRecordContext): Promise<string | undefined> => {
    await context.tools.allowShared({ query: context.query, tools: context.tools.sharedTools })
    return context.tools.steps.sync(context)
  },
}

export interface DiscountRecordTools {
  decideStep: typeof decideRecordStep
  hasEnded: typeof hasEndPassed
  steps: typeof STEPS
  allowShared: typeof allowSharedCombining
  sharedTools: typeof SHARED_RECORD_TOOLS
  syncRecord: typeof syncFlashRecord
  recordTools: RecordTools
}

export const DISCOUNT_RECORD_TOOLS: DiscountRecordTools = {
  decideStep: decideRecordStep,
  hasEnded: hasEndPassed,
  steps: STEPS,
  allowShared: allowSharedCombining,
  sharedTools: SHARED_RECORD_TOOLS,
  syncRecord: syncFlashRecord,
  recordTools: RECORD_TOOLS,
}

/**
 * Returns the id of the Shopify discount to store for the discount (undefined
 * when it has none). A Shopify refusal throws, so the caller can restore the
 * old state and show the message.
 */
export async function syncDiscountRecord(context: DiscountRecordContext): Promise<string | undefined> {
  const { tools, flash, status, nowLocal } = context
  const isOver = flash !== undefined && tools.hasEnded({ endsAt: flash.endsAt, nowLocal })
  const step = tools.decideStep({ status, hasFlash: flash !== undefined, isOver })
  return tools.steps[step](context)
}
