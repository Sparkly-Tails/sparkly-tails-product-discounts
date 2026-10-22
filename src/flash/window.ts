// The window of a flash sale as Unix seconds, for the product metafield that
// the storefront widget compares with the clock. The shop-local text is
// converted with the converter that is passed in (zonedTimeToUtc in the app).
export interface FlashWindowUnix {
  startsAtUnix: number
  endsAtUnix: number
}

export function computeFlashWindowUnix(options: {
  startsAt: string
  endsAt: string
  timeZone: string
  convertToUtc: (naive: string, timeZone: string) => string
}): FlashWindowUnix {
  const { startsAt, endsAt, timeZone, convertToUtc } = options
  return {
    startsAtUnix: Math.floor(new Date(convertToUtc(startsAt, timeZone)).getTime() / 1000),
    endsAtUnix: Math.floor(new Date(convertToUtc(endsAt, timeZone)).getTime() / 1000),
  }
}
