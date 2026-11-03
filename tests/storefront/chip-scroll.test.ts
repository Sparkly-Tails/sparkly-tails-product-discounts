// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { CHIP_SCROLL_TOOLS, computeScrollLeft, scrollActiveChipIntoView } from '../../extensions/product-tier-pricing/src/chipScroll.js'
import { stubChipLayout } from '../helpers/chipLayout'


describe('computeScrollLeft', () => {
  const view = { viewLeft: 100, viewWidth: 250 }

  it('stays where it is when the box is fully in view', () => {
    expect(computeScrollLeft({ ...view, chipLeft: 150, chipWidth: 90 })).toBe(100)
  })

  it('moves right just far enough to show a box past the right edge', () => {
    expect(computeScrollLeft({ ...view, chipLeft: 300, chipWidth: 90 })).toBe(140)
  })

  it('moves left to the start of a box that is cut at the left edge', () => {
    expect(computeScrollLeft({ ...view, chipLeft: 60, chipWidth: 90 })).toBe(60)
  })

  it('shows the start of a box wider than the row', () => {
    expect(computeScrollLeft({ viewLeft: 0, viewWidth: 80, chipLeft: 200, chipWidth: 120 })).toBe(200)
  })
})

describe('scrollActiveChipIntoView', () => {
  afterEach(() => vi.restoreAllMocks())

  function buildRow(markup: string) {
    document.body.innerHTML = `<div data-tier-pricing-tiers>${markup}</div>`
    return document.querySelector('[data-tier-pricing-tiers]') as HTMLElement
  }
  const TIER = (pressed: boolean) => `<button class="smooth-discounts__chip" aria-pressed="${pressed}">tier</button>`
  const CURRENT = '<span class="smooth-discounts__chip smooth-discounts__chip--current-highest">now</span>'

  it('scrolls to the dashed box of the current quantity when it is past the visible boxes', () => {
    stubChipLayout({ chipWidth: 90, viewWidth: 250 })
    const row = buildRow(TIER(false).repeat(4) + CURRENT)
    scrollActiveChipIntoView({ tiersEl: row, tools: CHIP_SCROLL_TOOLS })
    expect(row.scrollLeft).toBe(5 * 90 - 250)
  })

  it('scrolls to the pressed tier box when there is no dashed box', () => {
    stubChipLayout({ chipWidth: 90, viewWidth: 250 })
    const row = buildRow(TIER(false).repeat(4) + TIER(true))
    scrollActiveChipIntoView({ tiersEl: row, tools: CHIP_SCROLL_TOOLS })
    expect(row.scrollLeft).toBe(5 * 90 - 250)
  })

  it('moves back to the left when the active box is the first one', () => {
    stubChipLayout({ chipWidth: 90, viewWidth: 250 })
    const row = buildRow(TIER(true) + TIER(false).repeat(4))
    row.scrollLeft = 200
    scrollActiveChipIntoView({ tiersEl: row, tools: CHIP_SCROLL_TOOLS })
    expect(row.scrollLeft).toBe(0)
  })

  it('does nothing when no box is active', () => {
    stubChipLayout({ chipWidth: 90, viewWidth: 250 })
    const row = buildRow(TIER(false).repeat(3))
    row.scrollLeft = 30
    scrollActiveChipIntoView({ tiersEl: row, tools: CHIP_SCROLL_TOOLS })
    expect(row.scrollLeft).toBe(30)
  })
})
