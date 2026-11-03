import { describe, it, expect, vi } from 'vitest'
import { readStoredScopes } from '@/lib/sessions'
import { getDb } from '@/lib/db'

vi.mock('@/lib/db', () => ({ getDb: vi.fn() }))

function stubSessions(scopes: (string | null)[]) {
  const findMany = vi.fn(async () => scopes.map((scope) => ({ scope })))
  vi.mocked(getDb).mockReturnValue({ session: { findMany } } as never)
  return findMany
}

describe('readStoredScopes', () => {
  it('reads the sessions of that shop only and gives each scope once, over all sessions', async () => {
    const findMany = stubSessions(['read_orders,write_pixels', 'read_orders,read_products'])
    expect(await readStoredScopes('a.myshopify.com')).toEqual(['read_orders', 'write_pixels', 'read_products'])
    expect(findMany).toHaveBeenCalledWith({ where: { shop: 'a.myshopify.com' }, select: { scope: true } })
  })

  it('gives no scopes for a session with none stored, and for a shop with no session', async () => {
    stubSessions([null, ''])
    expect(await readStoredScopes('a.myshopify.com')).toEqual([])
    stubSessions([])
    expect(await readStoredScopes('b.myshopify.com')).toEqual([])
  })
})
