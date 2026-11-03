import { buildFailedCards } from '@/home/buildMetricCards'
import type { MetricCard } from '@/home/buildMetricCards'

// Asks the metrics route for the four cards from the browser, with the session token App Bridge gives. Whatever goes
// wrong (no App Bridge, no network, a refusal, an answer that is not the cards) ends as the failed cards, never a throw.
const CARD_COUNT = 4

type Answer = { ok: boolean; json: () => Promise<unknown> }
type SendRequest = (url: string, init: { headers: Record<string, string>; cache: 'no-store' }) => Promise<Answer>

function isText(value: unknown): boolean {
  return typeof value === 'string'
}

/** True for something with a text label, value and hint. */
export function isCardEntry(value: unknown): boolean {
  const record = (value ?? {}) as Record<string, unknown>
  return [record.label, record.value, record.hint].every(isText)
}

export function readCards({ value }: { value: unknown }): unknown[] | null {
  const cards = (value as { cards?: unknown } | null)?.cards
  return Array.isArray(cards) ? cards : null
}

export function pickFullSet({ cards }: { cards: unknown[] | null }): unknown[] | null {
  return cards?.length === CARD_COUNT ? cards : null
}

export function pickValidCards({ cards }: { cards: unknown[] | null }): unknown[] | null {
  return cards && cards.every(isCardEntry) ? cards : null
}

export const PARSE_TOOLS = { readCards, pickFullSet, pickValidCards }

/** The four cards in an answer of the route, or null when the answer is anything else. */
export function parseMetricCards({ value, tools = PARSE_TOOLS }: { value: unknown; tools?: typeof PARSE_TOOLS }): MetricCard[] | null {
  return tools.pickValidCards({ cards: tools.pickFullSet({ cards: tools.readCards({ value }) }) }) as MetricCard[] | null
}

/** A session token from App Bridge; fails when the page is not open inside the Shopify admin. */
export function readSessionToken({ bridge }: { bridge: { idToken?: () => Promise<string> } | undefined }): Promise<string> {
  return bridge?.idToken ? bridge.idToken() : Promise.reject(new Error('App Bridge is not available'))
}

/** The answer's content, or null when the route refused. */
export async function fetchAnswer({ url, readToken, request }: { url: string; readToken: () => Promise<string>; request: SendRequest }): Promise<unknown> {
  const answer = await request(url, { headers: { Authorization: `Bearer ${await readToken()}` }, cache: 'no-store' })
  return answer.ok ? answer.json() : null
}

export function readNothing(): null {
  return null
}

export const FETCH_TOOLS = { fetchAnswer, parseMetricCards, buildFailedCards, readNothing }

export async function fetchMetricCards({ url, readToken, request, tools = FETCH_TOOLS }: { url: string; readToken: () => Promise<string>; request: SendRequest; tools?: typeof FETCH_TOOLS }): Promise<MetricCard[]> {
  const value = await tools.fetchAnswer({ url, readToken, request }).catch(tools.readNothing)
  return tools.parseMetricCards({ value }) ?? tools.buildFailedCards()
}
