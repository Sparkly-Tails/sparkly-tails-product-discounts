// The small steps that turn stored discounts into table rows, gathered in one
// object so the loader can be handed all of them (and tests can hand it others).
import { buildOneTierRow, buildTierRows, buildTimeRows, readFlashOfRow } from '@/home/buildRows'
import {
  buildDiscountRows,
  buildTierRow,
  buildTimeRow,
  describeFlashSchedule,
  describeTierRules,
  describeTimeSchedule,
  joinRuleTexts,
  listTierSteps,
  pickRowSubtitle,
  pickRowTitle,
} from '@/home/discountRows'
import { formatNaiveDate } from '@/home/formatDate'
import { formatMoneyAmount } from '@/home/formatMoney'

export interface RowTools {
  buildDiscountRows: typeof buildDiscountRows
  buildTierRow: typeof buildTierRow
  buildTimeRow: typeof buildTimeRow
  describeFlashSchedule: typeof describeFlashSchedule
  describeTierRules: typeof describeTierRules
  describeTimeSchedule: typeof describeTimeSchedule
  joinRuleTexts: typeof joinRuleTexts
  listTierSteps: typeof listTierSteps
  pickRowSubtitle: typeof pickRowSubtitle
  pickRowTitle: typeof pickRowTitle
  formatNaiveDate: typeof formatNaiveDate
  formatMoneyAmount: typeof formatMoneyAmount
  readFlashOfRow: typeof readFlashOfRow
  buildOneTierRow: typeof buildOneTierRow
  buildTierRows: typeof buildTierRows
  buildTimeRows: typeof buildTimeRows
}

export const ROW_TOOLS: RowTools = {
  buildDiscountRows,
  buildTierRow,
  buildTimeRow,
  describeFlashSchedule,
  describeTierRules,
  describeTimeSchedule,
  joinRuleTexts,
  listTierSteps,
  pickRowSubtitle,
  pickRowTitle,
  formatNaiveDate,
  formatMoneyAmount,
  readFlashOfRow,
  buildOneTierRow,
  buildTierRows,
  buildTimeRows,
}
