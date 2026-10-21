const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A shop-local datetime such as "2026-11-27T09:00" as "Nov 27, 2026". The
// string is read as written (no timezone conversion); a value that cannot be
// read is returned unchanged.
export function formatNaiveDate({ value }: { value: string }): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const monthName = MONTH_NAMES[Number(match[2]) - 1]
  if (!monthName) return value
  return monthName + ' ' + Number(match[3]) + ', ' + match[1]
}
