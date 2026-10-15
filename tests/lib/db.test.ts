import { describe, it, expect } from 'vitest'
import { withPoolParams } from '@/lib/db'

describe('withPoolParams', () => {
  it('adds both pool parameters to a URL that has no query string', () => {
    expect(withPoolParams('postgresql://u:p@host:6543/postgres')).toBe(
      'postgresql://u:p@host:6543/postgres?connection_limit=1&pool_timeout=20',
    )
  })

  it('appends with & when the URL already has a query string', () => {
    expect(withPoolParams('postgresql://u:p@host:6543/postgres?pgbouncer=true')).toBe(
      'postgresql://u:p@host:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20',
    )
  })

  it('keeps a parameter that is already present and adds only the missing one', () => {
    expect(withPoolParams('postgresql://h/db?connection_limit=3')).toBe('postgresql://h/db?connection_limit=3&pool_timeout=20')
    expect(withPoolParams('postgresql://h/db?pool_timeout=5')).toBe('postgresql://h/db?pool_timeout=5&connection_limit=1')
  })

  it('returns the URL unchanged when both parameters are present', () => {
    const url = 'postgresql://h/db?connection_limit=2&pool_timeout=9'
    expect(withPoolParams(url)).toBe(url)
  })
})
