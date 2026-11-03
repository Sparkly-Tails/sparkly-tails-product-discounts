/** The calendar day (`YYYY-MM-DD`) of an instant in a time zone: the shop's day, which is not always UTC's. */
export function pickShopDay({ nowMs, timeZone }: { nowMs: number; timeZone: string }): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs))
}
