import { parseMembersFromForm, parseTiersFromForm } from '@/actions/discountSteps'
import { parseFlashFromForm, parseHighDemandFromForm } from '@/flash/formFields'
import { findFormProblem, readName, readPricingMode, readTitle, type ParseTools } from '@/form/parseDiscountForm'

export const PARSE_TOOLS: ParseTools = {
  parseMembersFromForm,
  parseTiersFromForm,
  parseFlashFromForm,
  parseHighDemandFromForm,
  readName,
  readTitle,
  readPricingMode,
  findFormProblem,
}
