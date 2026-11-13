// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clearWidgetRegistry, readBuiltWidget } from '../helpers/builtWidget'

/** What a box shows, worked out by the facts component (bundle-popup-facts.js): the progress rail, its milestones, the rows of the eligible items, the cost and the in-cart summary. */
const built = readBuiltWidget()
const FIXED_TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
const PERCENT_TIERS = [{ minQty: 5, percentOff: 10 }]

type Item = { variantId: string; productId: string; handle: string; label: string; imageUrl: string | null; price: number; available: boolean }
type Line = { product_id: number; variant_id: number; quantity: number }
type Facts = {
  missing: number; progress: number; costText: string
  milestones: { qty: number; label: string; state: string }[]
  rows: { variantId: string; label: string; imageUrl: string | null; rateText: string; inCart: number }[]
  preview: { label: string; quantity: number }[]
}

const itemOf = (variantId: number, label: string, price = 1.69, available = true): Item => ({ variantId: String(variantId), productId: '100', handle: 'tuna', label, imageUrl: variantId === 11 ? 'https://cdn.test/tuna.jpg' : null, price, available })
const lineOf = (variantId: number, quantity: number): Line => ({ product_id: 100, variant_id: variantId, quantity })
const ITEMS = [itemOf(11, 'Tuna – Small'), itemOf(12, 'Tuna – Large'), itemOf(13, 'Salmon'), itemOf(14, 'Sold out one', 1.69, false)]

function readFacts({ tiers = FIXED_TIERS, units, lines, items = ITEMS }: { tiers?: object[]; units: number; lines: Line[]; items?: Item[] }): Facts {
  const box = { tiers, units, firstTierQty: (tiers[0] as { minQty: number }).minQty, items, basePrice: 1.69, flash: null, members: [], lines, title: 'Mix', shownKey: 'k' }
  const api = (window as unknown as { SmoothDiscounts: { components: { popupFacts: { readFacts: (input: object) => Facts } } } }).SmoothDiscounts.components.popupFacts
  return api.readFacts({ box, units, lines, moneyFormat: '£{{amount}}' })
}

beforeEach(() => {
  clearWidgetRegistry()
  ;(0, eval)(built['bundle-popup-facts.js'])
})
afterEach(() => clearWidgetRegistry())

describe('the progress rail', () => {
  it('fills as far as the units are of the first tier', () => {
    expect(readFacts({ units: 5, lines: [lineOf(11, 5)] }).progress).toBe(63)
    expect(readFacts({ units: 2, lines: [lineOf(11, 2)], tiers: PERCENT_TIERS }).progress).toBe(40)
  })

  it('never goes past full', () => {
    expect(readFacts({ units: 9, lines: [lineOf(11, 9)] }).progress).toBe(100)
  })
})

describe('the milestones under the rail', () => {
  it('lists one item, the units in the cart, the first tier and the next tier, in that order', () => {
    expect(readFacts({ units: 5, lines: [lineOf(11, 5)] }).milestones).toEqual([
      { qty: 1, label: '1 item', state: 'done' },
      { qty: 5, label: '5 in cart', state: 'current' },
      { qty: 8, label: '8 items (Tier 1)', state: 'target' },
      { qty: 16, label: '16 items (Tier 2)', state: 'later' },
    ])
  })

  it('does not list one item twice when the cart holds one unit, and leaves out a next tier that does not exist', () => {
    expect(readFacts({ units: 1, lines: [lineOf(11, 1)], tiers: PERCENT_TIERS }).milestones).toEqual([
      { qty: 1, label: '1 in cart', state: 'current' },
      { qty: 5, label: '5 items (Tier 1)', state: 'target' },
    ])
  })
})

describe('the rows of the eligible items', () => {
  it('has a row for each item that can be added, with its tier rate and how many are in the cart', () => {
    const facts = readFacts({ units: 3, lines: [lineOf(11, 2), lineOf(13, 1)] })
    expect(facts.rows).toEqual([
      { variantId: '11', label: 'Tuna – Small', imageUrl: 'https://cdn.test/tuna.jpg', rateText: '£1.63/ea', inCart: 2 },
      { variantId: '12', label: 'Tuna – Large', imageUrl: null, rateText: '£1.63/ea', inCart: 0 },
      { variantId: '13', label: 'Salmon', imageUrl: null, rateText: '£1.63/ea', inCart: 1 },
    ])
  })

  it('works the rate of a percentage tier out from the item\'s own price', () => {
    const facts = readFacts({ units: 2, lines: [], tiers: PERCENT_TIERS, items: [itemOf(11, 'Chew', 2), itemOf(12, 'Bone', 1.5)] })
    expect(facts.rows.map((row) => row.rateText)).toEqual(['£1.80/ea', '£1.35/ea'])
  })
})

describe('the cost and the summary of what is in the cart', () => {
  it('writes the cost of Quick auto-fill in the money format', () => {
    const facts = readFacts({ units: 5, lines: [lineOf(11, 5)] })
    expect(facts.missing).toBe(3)
    expect(facts.costText).toBe('(+£5.07)')
  })

  it('lists the items in the cart with their units, and none when the cart holds none of the offered items', () => {
    expect(readFacts({ units: 3, lines: [lineOf(11, 2), lineOf(13, 1)] }).preview).toEqual([{ label: 'Tuna – Small', quantity: 2 }, { label: 'Salmon', quantity: 1 }])
    expect(readFacts({ units: 0, lines: [] }).preview).toEqual([])
  })
})
