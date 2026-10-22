import { describe, it, expect } from 'vitest'
import { parseFlashFromForm, parseHighDemandFromForm } from '@/flash/formFields'

function buildForm(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.append(name, value)
  return formData
}

describe('parseFlashFromForm', () => {
  it('returns null when the Flash sale switch is off or absent', () => {
    expect(parseFlashFromForm({ formData: buildForm({}) })).toBeNull()
    expect(parseFlashFromForm({ formData: buildForm({ flashStartsAt: '2026-11-27T09:00', flashEndsAt: '2026-11-30T23:59' }) })).toBeNull()
  })

  it('reads both times and the teaser flag when the switch is on', () => {
    const formData = buildForm({ flashEnabled: 'on', flashStartsAt: '2026-11-27T09:00', flashEndsAt: '2026-11-30T23:59', flashShowTeaser: 'on' })
    expect(parseFlashFromForm({ formData })).toEqual({ startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true })
  })

  it('treats an unchecked teaser box (a missing field) as teaser off', () => {
    const formData = buildForm({ flashEnabled: 'on', flashStartsAt: '2026-11-27T09:00', flashEndsAt: '2026-11-30T23:59' })
    expect(parseFlashFromForm({ formData })?.showTeaser).toBe(false)
  })

  it('keeps an empty time as empty text so the caller can ask for it, and never stores a shopifyDiscountId', () => {
    const flash = parseFlashFromForm({ formData: buildForm({ flashEnabled: 'on', flashStartsAt: '  ' }) })
    expect(flash).toEqual({ startsAt: '', endsAt: '', showTeaser: false })
    expect(flash).not.toHaveProperty('shopifyDiscountId')
  })
})

describe('parseHighDemandFromForm', () => {
  it('is true only when the box is checked', () => {
    expect(parseHighDemandFromForm({ formData: buildForm({ highDemand: 'on' }) })).toBe(true)
    expect(parseHighDemandFromForm({ formData: buildForm({}) })).toBe(false)
    expect(parseHighDemandFromForm({ formData: buildForm({ highDemand: 'off' }) })).toBe(false)
  })
})
