import { parseMembersFromForm, parseTiersFromForm } from '@/actions/discountSteps'
import { parseFlashFromForm, parseHighDemandFromForm } from '@/flash/formFields'
import { parseStyleFromForm } from '@/form/parseStyle'
import { readHexColor, readWholeNumber, readWidgetStyle } from '@/lib/widgetStyle'
import { findFormProblem, readName, readPricingMode, type ParseTools } from '@/form/parseDiscountForm'

export const PARSE_TOOLS: ParseTools = {
  parseMembersFromForm,
  parseTiersFromForm,
  parseFlashFromForm,
  parseHighDemandFromForm,
  parseStyleFromForm,
  readWidgetStyle,
  readHexColor,
  readWholeNumber,
  readName,
  readPricingMode,
  findFormProblem,
}
