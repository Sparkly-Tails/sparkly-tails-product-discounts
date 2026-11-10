import { parseMembersFromForm, parseTiersFromForm } from '@/actions/discountSteps'
import { parseFlashFromForm, parseHighDemandFromForm } from '@/flash/formFields'
import { parseStyleFromForm } from '@/form/parseStyle'
import { readHexColor, readWholeNumber, readWidgetStyle } from '@/lib/widgetStyle'
import { findFormProblem, readName, readPopupFrequency, readPricingMode, readTitle, type ParseTools } from '@/form/parseDiscountForm'

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
  readTitle,
  readPopupFrequency,
  readPricingMode,
  findFormProblem,
}
