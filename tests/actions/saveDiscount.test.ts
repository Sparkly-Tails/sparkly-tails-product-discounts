import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`) }) }))
vi.mock('@/form/runSave', () => ({ runSave: vi.fn(), readDiscountId: vi.fn() }))
vi.mock('@/form/parseTools', () => ({ PARSE_TOOLS: { parse: true } }))
vi.mock('@/form/saveTools', () => ({ SAVE_TOOLS: { save: true } }))

import { saveDiscount } from '@/actions/saveDiscount'
import { runSave } from '@/form/runSave'

describe('saveDiscount (the one save of the redesigned form)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the message when the save did not go through, and stays on the page', async () => {
    vi.mocked(runSave).mockResolvedValue({ error: 'Shopify allows only 25 active discounts.' })
    expect(await saveDiscount(null, new FormData())).toEqual({ error: 'Shopify allows only 25 active discounts.' })
  })

  it('goes to the discount that was saved', async () => {
    vi.mocked(runSave).mockResolvedValue({ discountId: 'disc_9' })
    await expect(saveDiscount(null, new FormData())).rejects.toThrow('NEXT_REDIRECT /discounts/disc_9')
  })

  it('writes an id that needs it safely in the address', async () => {
    vi.mocked(runSave).mockResolvedValue({ discountId: 'disc 9/ü' })
    await expect(saveDiscount(null, new FormData())).rejects.toThrow('NEXT_REDIRECT /discounts/disc%209%2F%C3%BC')
  })
})
