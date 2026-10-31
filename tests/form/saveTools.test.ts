import { describe, it, expect } from 'vitest'
import { SAVE_TOOLS } from '@/form/saveTools'

describe('SAVE_TOOLS', () => {
  it('has every step as a function, so the save has nothing missing at run time', () => {
    for (const [name, step] of Object.entries(SAVE_TOOLS)) expect(typeof step, name).toBe('function')
    expect(Object.keys(SAVE_TOOLS)).toHaveLength(53)
  })

  it('makes a new discount id that starts with disc_ and is different each time', () => {
    const first = SAVE_TOOLS.newDiscountId()
    expect(first).toMatch(/^disc_[0-9a-f-]{36}$/)
    expect(SAVE_TOOLS.newDiscountId()).not.toBe(first)
  })
})
