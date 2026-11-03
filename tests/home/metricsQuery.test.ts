import { describe, it, expect } from 'vitest'
import { parseMetricsQuery, buildMetricsParams } from '@/home/metricsQuery'

const TODAY = '2026-11-02'
const LAST_30 = { fromDay: '2026-10-04', toDay: '2026-11-02', label: 'Last 30 days' }
const parse = (raw: Record<string, string | string[] | undefined>) => parseMetricsQuery({ raw, today: TODAY })

describe('parseMetricsQuery', () => {
  it('gives the last 30 days when the address says nothing', () => {
    expect(parse({})).toEqual(LAST_30)
  })

  it('takes a preset by its key', () => {
    expect(parse({ range: 'today' })).toEqual({ fromDay: TODAY, toDay: TODAY, label: 'Today' })
    expect(parse({ range: 'lastWeek' })).toEqual({ fromDay: '2026-10-26', toDay: '2026-11-01', label: 'Last week' })
  })

  it('takes a custom range and labels it with its days', () => {
    expect(parse({ from: '2026-10-12', to: '2026-11-02' })).toEqual({ fromDay: '2026-10-12', toDay: '2026-11-02', label: '12 Oct – 2 Nov' })
  })

  it('swaps a range that is the wrong way round', () => {
    expect(parse({ from: '2026-11-02', to: '2026-10-12' })).toMatchObject({ fromDay: '2026-10-12', toDay: '2026-11-02' })
  })

  it('goes back to the last 30 days for a bad day, a day in the future, a range over 366 days or an unknown preset', () => {
    expect(parse({ from: '2026-13-40', to: '2026-11-02' })).toEqual(LAST_30)
    expect(parse({ from: '2026-10-12', to: '2026-11-03' })).toEqual(LAST_30)
    expect(parse({ from: '2025-09-28', to: '2026-11-02' })).toEqual(LAST_30)
    expect(parse({ range: 'forever' })).toEqual(LAST_30)
    expect(parse({ from: '2026-10-12' })).toEqual(LAST_30)
  })

  it('uses the last value of a repeated parameter', () => {
    expect(parse({ range: ['today', 'last7'] })).toMatchObject({ label: 'Last 7 days' })
  })
})

describe('buildMetricsParams', () => {
  it('is empty for the default, and keeps a preset or a custom range otherwise, so other links can carry it', () => {
    expect(buildMetricsParams({ raw: {}, today: TODAY })).toBe('')
    expect(buildMetricsParams({ raw: { range: 'last30' }, today: TODAY })).toBe('')
    expect(buildMetricsParams({ raw: { range: 'last7' }, today: TODAY })).toBe('range=last7')
    expect(buildMetricsParams({ raw: { from: '2026-10-12', to: '2026-11-02' }, today: TODAY })).toBe('from=2026-10-12&to=2026-11-02')
    expect(buildMetricsParams({ raw: { from: 'nonsense', to: '2026-11-02' }, today: TODAY })).toBe('')
  })
})
