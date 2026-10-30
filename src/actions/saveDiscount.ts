'use server'

import { redirect } from 'next/navigation'
import { parseDiscountForm } from '@/form/parseDiscountForm'
import { PARSE_TOOLS } from '@/form/parseTools'
import { readDiscountId, runSave } from '@/form/runSave'
import { saveDiscountFlow } from '@/form/saveFlow'
import { SAVE_TOOLS } from '@/form/saveTools'

/** What a save sends back to the form when it did not go through; one that did leaves for the discount's page. */
export type SaveState = { error: string } | null

/** The one Save of the tier discount form (Create and Edit): the name, products, tiers, flash sale and High Demand in one go. */
export async function saveDiscount(_state: SaveState, formData: FormData): Promise<SaveState> {
  // A server action takes the form it is given and nothing else, so it wires its steps here, and only here.
  // eslint-disable-next-line guidelines/no-outer-scope-calls -- see above
  const outcome = await runSave({ formData, tools: { parseDiscountForm, saveDiscountFlow, readDiscountId, parseTools: PARSE_TOOLS, saveTools: SAVE_TOOLS } })
  if ('error' in outcome) return { error: outcome.error }
  // eslint-disable-next-line guidelines/no-outer-scope-calls -- see above
  redirect(`/discounts/${encodeURIComponent(outcome.discountId)}`)
}
