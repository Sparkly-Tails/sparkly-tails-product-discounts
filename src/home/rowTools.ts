// The small steps that turn stored discounts into table rows, gathered in one
// object so the loader can be handed all of them (and tests can hand it others).
import {
  buildDiscountRows,
  buildTierRow,
  buildTimeRow,
  describeTierRules,
  describeTimeSchedule,
  listTierSteps,
  pickRowSubtitle,
  pickRowTitle,
} from '@/home/discountRows'
import { formatNaiveDate } from '@/home/formatDate'
import { formatMoneyAmount } from '@/home/formatMoney'

export const ROW_TOOLS = {
  buildDiscountRows,
  buildTierRow,
  buildTimeRow,
  describeTierRules,
  describeTimeSchedule,
  listTierSteps,
  pickRowSubtitle,
  pickRowTitle,
  formatNaiveDate,
  formatMoneyAmount,
}
