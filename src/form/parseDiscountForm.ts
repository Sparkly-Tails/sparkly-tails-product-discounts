// Reads the tier discount form (the one footer Save of the redesigned form) into plain values.
import type { Tier, DiscountMember, FlashSale } from '@/lib/config'

/** What the form says, before anything is checked against the shop. */
export interface ParsedDiscount {
  name: string
  members: DiscountMember[]
  pricingMode: 'percent' | 'fixed'
  tiers: Tier[]
  /** The flash sale, or null while its switch is off. */
  flash: FlashSale | null
  highDemand: boolean
  /** The Go live button was used. */
  goLive: boolean
}

export type ParseResult = { values: ParsedDiscount } | { error: string }

/** The reading steps, handed in (see parseTools.ts). */
export interface ParseTools {
  parseMembersFromForm: (formData: FormData) => DiscountMember[]
  parseTiersFromForm: (formData: FormData, pricingMode: 'percent' | 'fixed') => Tier[]
  parseFlashFromForm: (options: { formData: FormData }) => FlashSale | null
  parseHighDemandFromForm: (options: { formData: FormData }) => boolean
  readName: typeof readName
  readPricingMode: typeof readPricingMode
  findFormProblem: typeof findFormProblem
}

export function readName({ formData }: { formData: FormData }): string {
  return String(formData.get('name') ?? '').trim()
}

export function readPricingMode({ formData }: { formData: FormData }): 'percent' | 'fixed' {
  return formData.get('pricingMode') === 'fixed' ? 'fixed' : 'percent'
}

/** The first thing that makes the values unsaveable, in the words the person sees, or null. */
export function findFormProblem({ values }: { values: ParsedDiscount }): string | null {
  const problems: [boolean, string][] = [
    [!values.name, 'A name is required'],
    [values.members.length === 0, 'At least one product or variant is required'],
    [values.tiers.length === 0, 'At least one tier is required'],
  ]
  const found = problems.find(([failed]) => failed)
  return found ? found[1] : null
}

export function parseDiscountForm({ formData, tools }: { formData: FormData; tools: ParseTools }): ParseResult {
  const pricingMode = tools.readPricingMode({ formData })
  const values: ParsedDiscount = {
    name: tools.readName({ formData }),
    members: tools.parseMembersFromForm(formData),
    pricingMode,
    tiers: tools.parseTiersFromForm(formData, pricingMode),
    flash: tools.parseFlashFromForm({ formData }),
    highDemand: tools.parseHighDemandFromForm({ formData }),
    goLive: formData.get('goLive') === 'on',
  }
  const problem = tools.findFormProblem({ values })
  return problem ? { error: problem } : { values }
}
