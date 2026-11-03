import { describe, it, expect } from 'vitest'
import { buildMetricCards } from '@/home/buildMetricCards'

const totals = { visitors: 1234, orders: 7, averageOrderValue: 21.5, addedRevenue: 40.25 }
const formatMoney = ({ amount }: { amount: number; currencyCode: string }) => `£${amount.toFixed(2)}`

describe('buildMetricCards', () => {
  it('gives the four cards in order with whole numbers and formatted money', () => {
    const cards = buildMetricCards({ totals, currencyCode: 'GBP', hasPermission: true, formatMoney })
    expect(cards.map((card) => [card.label, card.value])).toEqual([['Visitors', '1234'], ['Bundle orders', '7'], ['AOV', '£21.50'], ['Added revenue', '£40.25']])
  })

  it('shows the AOV of no orders as zero money', () => {
    const cards = buildMetricCards({ totals: { visitors: 0, orders: 0, averageOrderValue: 0, addedRevenue: 0 }, currencyCode: 'GBP', hasPermission: true, formatMoney })
    expect(cards[2].value).toBe('£0.00')
  })

  it('says Needs permission on all four cards when the shop has not approved the scopes', () => {
    const cards = buildMetricCards({ totals, currencyCode: 'GBP', hasPermission: false, formatMoney })
    expect(cards.map((card) => card.value)).toEqual(Array(4).fill('Needs permission'))
  })

  it('tells that the visitors are an estimate', () => {
    expect(buildMetricCards({ totals, currencyCode: 'GBP', hasPermission: true, formatMoney })[0].hint).toMatch(/estimate/i)
  })
})
