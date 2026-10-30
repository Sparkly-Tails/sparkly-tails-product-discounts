import type { ParseResult, ParseTools } from '@/form/parseDiscountForm'
import type { SaveResult, SaveTools } from '@/form/saveFlow'
import type { ParsedDiscount } from '@/form/parseDiscountForm'

/** The id of the discount being edited (a hidden field of the form), or nothing for a new one. */
export function readDiscountId({ formData }: { formData: FormData }): string | undefined {
  return String(formData.get('discountId') ?? '').trim() || undefined
}

export interface RunSaveTools {
  parseDiscountForm: (options: { formData: FormData; tools: ParseTools }) => ParseResult
  saveDiscountFlow: (options: { discountId: string | undefined; values: ParsedDiscount; tools: SaveTools }) => Promise<SaveResult>
  readDiscountId: typeof readDiscountId
  parseTools: ParseTools
  saveTools: SaveTools
}

/** Reads the form and saves it: the id of the discount that was saved, or the message of why it was not. */
export async function runSave({ formData, tools }: { formData: FormData; tools: RunSaveTools }): Promise<{ discountId: string } | { error: string }> {
  const parsed = tools.parseDiscountForm({ formData, tools: tools.parseTools })
  if ('error' in parsed) return { error: parsed.error }
  const result = await tools.saveDiscountFlow({ discountId: tools.readDiscountId({ formData }), values: parsed.values, tools: tools.saveTools })
  return result.ok ? { discountId: result.discountId } : { error: result.error }
}
