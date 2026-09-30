import { shopifyQuery } from '@/lib/shopify-client'

/** The shop's own configured IANA timezone (e.g. "Europe/London") — time discounts are entered/displayed in this timezone, not UTC or the browser's. */
export async function getShopTimezone(): Promise<string> {
  const data = await shopifyQuery<{ shop: { ianaTimezone: string } }>(`query { shop { ianaTimezone } }`)
  return data.shop.ianaTimezone
}

/**
 * Converts a naive "wall clock" datetime (no timezone offset — exactly what
 * <input type="datetime-local"> produces, e.g. "2026-07-01T12:00") as
 * observed in `timeZone` into a real UTC ISO instant. Needed because
 * Shopify's native DiscountAutomaticApp startsAt/endsAt are UTC DateTime
 * values (see spec §4, §5), while this app's own stored/displayed
 * startsAt/endsAt stay as shop-local naive strings throughout — this
 * conversion happens only at the boundary where a value is sent to the
 * Admin API.
 *
 * Uses the standard Intl-based two-pass correction (no date library
 * dependency): guess the instant by treating the wall-clock value as if it
 * were already UTC, see what wall-clock time that guess actually displays
 * as in `timeZone`, and correct the guess by the difference. A second pass
 * handles the case where the correction itself crosses a DST boundary.
 */
export function zonedTimeToUtc(naiveDateTime: string, timeZone: string): string {
  const [datePart, timePart] = naiveDateTime.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0)

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  })

  function wallClockMsFor(instantMs: number): number {
    const parts = formatter.formatToParts(new Date(instantMs))
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  }

  let guessMs = targetMs
  for (let i = 0; i < 2; i++) {
    guessMs += targetMs - wallClockMsFor(guessMs)
  }
  return new Date(guessMs).toISOString()
}
