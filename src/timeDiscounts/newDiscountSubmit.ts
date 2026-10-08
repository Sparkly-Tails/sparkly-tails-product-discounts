import { createTimeDiscount, type SaveResult } from '@/timeDiscounts/actions'
import { isRedirectError } from '@/timeDiscounts/rows'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'

/**
 * The form action of both create forms. A failure of the call itself becomes
 * the "reload the page" result; the redirect a successful create ends in
 * arrives as a thrown error and must go on to navigate, not be shown.
 */
export async function submitNewDiscount(previous: SaveResult | null, formData: FormData): Promise<SaveResult> {
  try {
    return await createTimeDiscount(previous, formData)
  } catch (err) {
    if (isRedirectError(err)) throw err
    return UNREACHABLE
  }
}
