import { parseMembersFromForm, parseTiersFromForm } from '@/actions/discountSteps'
import { parseFlashFromForm, parseHighDemandFromForm } from '@/flash/formFields'
import { findFormProblem, readName, readPricingMode, type ParseTools } from '@/form/parseDiscountForm'

export const PARSE_TOOLS: ParseTools = {
  parseMembersFromForm,
  parseTiersFromForm,
  parseFlashFromForm,
  parseHighDemandFromForm,
  readName,
  readPricingMode,
  findFormProblem,
}
