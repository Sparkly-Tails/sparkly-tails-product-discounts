import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitNewDiscount } from '@/timeDiscounts/newDiscountSubmit'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'
import * as actions from '@/timeDiscounts/actions'

vi.mock('@/timeDiscounts/actions', () => ({ createTimeDiscount: vi.fn() }))
const create = vi.mocked(actions.createTimeDiscount)
beforeEach(() => {
  create.mockReset()
})

describe('submitNewDiscount', () => {
  it('passes the previous result and the form to createTimeDiscount and returns its result', async () => {
    create.mockResolvedValue({ ok: false, error: 'No' })
    const formData = new FormData()
    expect(await submitNewDiscount(null, formData)).toEqual({ ok: false, error: 'No' })
    expect(create).toHaveBeenCalledWith(null, formData)
  })

  it('turns a rejected call into the reload message', async () => {
    create.mockRejectedValue(new Error('network'))
    expect(await submitNewDiscount(null, new FormData())).toEqual(UNREACHABLE)
  })

  it('lets a redirect through so the page navigates', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/time-discounts/x;307;' })
    create.mockRejectedValue(redirect)
    await expect(submitNewDiscount(null, new FormData())).rejects.toBe(redirect)
  })
})
