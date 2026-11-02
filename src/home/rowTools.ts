// The small steps that turn stored discounts into table rows, gathered in one
// object so the loader can be handed all of them (and tests can hand it others).
import { buildOneTierRow, buildTierRows, readFlashOfRow } from '@/home/buildRows'
import {
  buildTierRow,
  describeFlashSchedule,
  describeTierRules,
  joinRuleTexts,
  listTierSteps,
  pickRowSubtitle,
  pickRowTitle,
} from '@/home/discountRows'
import { formatNaiveDate } from '@/home/formatDate'
import { formatMoneyAmount } from '@/home/formatMoney'

export interface RowTools {
  buildTierRow: typeof buildTierRow
  describeFlashSchedule: typeof describeFlashSchedule
  describeTierRules: typeof describeTierRules
  joinRuleTexts: typeof joinRuleTexts
  listTierSteps: typeof listTierSteps
  pickRowSubtitle: typeof pickRowSubtitle
  pickRowTitle: typeof pickRowTitle
  formatNaiveDate: typeof formatNaiveDate
  formatMoneyAmount: typeof formatMoneyAmount
  readFlashOfRow: typeof readFlashOfRow
  buildOneTierRow: typeof buildOneTierRow
  buildTierRows: typeof buildTierRows
}

export const ROW_TOOLS: RowTools = {
  buildTierRow,
  describeFlashSchedule,
  describeTierRules,
  joinRuleTexts,
  listTierSteps,
  pickRowSubtitle,
  pickRowTitle,
  formatNaiveDate,
  formatMoneyAmount,
  readFlashOfRow,
  buildOneTierRow,
  buildTierRows,
}
