import { describe, it, expect } from 'vitest'
import { appendToken } from '@/lib/auth-token'

describe('appendToken', () => {
  it('appends stt as a query param to a bare path', () => {
    expect(appendToken('/discounts/new', 'abc123')).toBe('/discounts/new?stt=abc123')
  })

  it('preserves an existing query string', () => {
    expect(appendToken('/discounts?status=live', 'abc123')).toBe('/discounts?status=live&stt=abc123')
  })

  it('returns the href unchanged when token is empty', () => {
    expect(appendToken('/discounts/new', '')).toBe('/discounts/new')
  })

  it('overwrites an existing stt param rather than duplicating it', () => {
    expect(appendToken('/discounts?stt=old', 'new')).toBe('/discounts?stt=new')
  })
})
