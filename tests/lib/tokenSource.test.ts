import { describe, it, expect } from 'vitest'
import { pickIdToken } from '@/lib/tokenSource'

describe('pickIdToken', () => {
  it('prefers the Authorization header over the query parameter', () => {
    expect(pickIdToken({ authorization: 'Bearer header-token', idTokenParam: 'query-token' })).toBe('header-token')
  })

  it('falls back to the id_token query parameter', () => {
    expect(pickIdToken({ authorization: null, idTokenParam: 'query-token' })).toBe('query-token')
  })

  it('ignores an Authorization header that is not a Bearer token', () => {
    expect(pickIdToken({ authorization: 'Basic abc', idTokenParam: 'query-token' })).toBe('query-token')
    expect(pickIdToken({ authorization: 'Basic abc', idTokenParam: null })).toBeNull()
  })

  it('returns null when there is neither, or the parameter is empty', () => {
    expect(pickIdToken({ authorization: null, idTokenParam: null })).toBeNull()
    expect(pickIdToken({ authorization: null, idTokenParam: '' })).toBeNull()
  })
})
