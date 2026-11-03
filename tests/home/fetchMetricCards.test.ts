import { describe, it, expect, vi } from 'vitest'
import { fetchMetricCards, parseMetricCards } from '@/home/fetchMetricCards'
import { buildFailedCards, buildLoadingCards } from '@/home/buildMetricCards'

const CARDS = [
  { label: 'Visitors', value: '40', hint: 'a' },
  { label: 'Bundle orders', value: '3', hint: 'b' },
  { label: 'AOV', value: '£21.50', hint: 'c' },
  { label: 'Added revenue', value: '£4.00', hint: 'd' },
]
const answer = (body: unknown, ok = true) => ({ ok, json: async () => body })

describe('parseMetricCards', () => {
  it('gives the four cards of a good answer', () => {
    expect(parseMetricCards({ value: { cards: CARDS } })).toEqual(CARDS)
  })

  it.each([
    ['nothing', null],
    ['a text', 'cards'],
    ['no cards key', {}],
    ['cards that are not a list', { cards: 'x' }],
    ['too few cards', { cards: CARDS.slice(0, 3) }],
    ['a card without a hint', { cards: [...CARDS.slice(0, 3), { label: 'Added revenue', value: '1' }] }],
    ['a card with a number for a value', { cards: [...CARDS.slice(0, 3), { label: 'Added revenue', value: 1, hint: 'd' }] }],
  ])('gives null for %s', (_name, value) => {
    expect(parseMetricCards({ value })).toBeNull()
  })
})

describe('fetchMetricCards', () => {
  it('asks the url with the session token as a bearer and gives the cards that come back', async () => {
    const request = vi.fn(async () => answer({ cards: CARDS }))

    const cards = await fetchMetricCards({ url: '/api/metrics?range=last7', readToken: async () => 'tok-1', request })

    expect(cards).toEqual(CARDS)
    expect(request).toHaveBeenCalledWith('/api/metrics?range=last7', { headers: { Authorization: 'Bearer tok-1' }, cache: 'no-store' })
  })

  it('gives the failed cards when the answer is not ok', async () => {
    const cards = await fetchMetricCards({ url: '/x', readToken: async () => 't', request: async () => answer({ cards: CARDS }, false) })

    expect(cards).toEqual(buildFailedCards())
  })

  it('gives the failed cards when the request fails', async () => {
    const cards = await fetchMetricCards({ url: '/x', readToken: async () => 't', request: async () => { throw new Error('offline') } })

    expect(cards).toEqual(buildFailedCards())
  })

  it('gives the failed cards when the session token cannot be read', async () => {
    const request = vi.fn()

    const cards = await fetchMetricCards({ url: '/x', readToken: async () => { throw new Error('no App Bridge') }, request })

    expect(cards).toEqual(buildFailedCards())
    expect(request).not.toHaveBeenCalled()
  })

  it('gives the failed cards when the answer is not the cards', async () => {
    const cards = await fetchMetricCards({ url: '/x', readToken: async () => 't', request: async () => answer({ error: 'Unauthorized' }) })

    expect(cards).toEqual(buildFailedCards())
  })
})

describe('buildLoadingCards', () => {
  it('has the four labels in order with a waiting value and hint', () => {
    expect(buildLoadingCards().map((card) => card.label)).toEqual(['Visitors', 'Bundle orders', 'AOV', 'Added revenue'])
    expect(buildLoadingCards().every((card) => card.value === '…' && card.hint === 'Loading the numbers')).toBe(true)
  })
})
