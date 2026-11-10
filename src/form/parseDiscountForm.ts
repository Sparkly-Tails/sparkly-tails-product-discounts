// Reads the tier discount form (the one footer Save of the redesigned form) into plain values.
import type { Tier, DiscountMember, FlashSale } from '@/lib/config'
import type { StyleTools, parseStyleFromForm } from '@/form/parseStyle'
import type { WidgetStyle } from '@/lib/widgetStyle'

/** What the form says, before anything is checked against the shop. */
export interface ParsedDiscount {
  name: string
  /** The customer-facing title; blank when the person left it empty. */
  title: string
  /** How often the checkout pop-up shows the bundle. */
  popupFrequency: 'session' | 'checkout'
  members: DiscountMember[]
  pricingMode: 'percent' | 'fixed'
  tiers: Tier[]
  /** The flash sale, or null while its switch is off. */
  flash: FlashSale | null
  highDemand: boolean
  /** The Design card's four values (the card's defaults when it was left alone). */
  style: WidgetStyle
  /** The Go live button was used. */
  goLive: boolean
  /** The Take offline button was used. */
  takeOffline: boolean
}

export type ParseResult = { values: ParsedDiscount } | { error: string }

/** The reading steps, handed in (see parseTools.ts). */
export interface ParseTools extends StyleTools {
  parseMembersFromForm: (formData: FormData) => DiscountMember[]
  parseTiersFromForm: (formData: FormData, pricingMode: 'percent' | 'fixed') => Tier[]
  parseFlashFromForm: (options: { formData: FormData }) => FlashSale | null
  parseHighDemandFromForm: (options: { formData: FormData }) => boolean
  parseStyleFromForm: typeof parseStyleFromForm
  readName: typeof readName
  readTitle: typeof readTitle
  readPopupFrequency: typeof readPopupFrequency
  readPricingMode: typeof readPricingMode
  findFormProblem: typeof findFormProblem
}

export function readName({ formData }: { formData: FormData }): string {
  return String(formData.get('name') ?? '').trim()
}

export function readTitle({ formData }: { formData: FormData }): string {
  return String(formData.get('title') ?? '').trim()
}

/** Only an explicit "checkout" shows the pop-up at every Checkout press; anything else is once per session. */
export function readPopupFrequency({ formData }: { formData: FormData }): 'session' | 'checkout' {
  return formData.get('popupFrequency') === 'checkout' ? 'checkout' : 'session'
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
    title: tools.readTitle({ formData }),
    popupFrequency: tools.readPopupFrequency({ formData }),
    members: tools.parseMembersFromForm(formData),
    pricingMode,
    tiers: tools.parseTiersFromForm(formData, pricingMode),
    flash: tools.parseFlashFromForm({ formData }),
    highDemand: tools.parseHighDemandFromForm({ formData }),
    style: tools.parseStyleFromForm({ formData, tools }),
    goLive: formData.get('goLive') === 'on',
    takeOffline: formData.get('takeOffline') === 'on',
  }
  const problem = tools.findFormProblem({ values })
  return problem ? { error: problem } : { values }
}
