import { getDb } from '@/lib/db'

export async function deleteShopSessions(shop: string): Promise<void> {
  await getDb().session.deleteMany({ where: { shop } })
}

export async function updateStoredScope(shop: string, scopes: string[]): Promise<void> {
  await getDb().session.updateMany({ where: { shop }, data: { scope: scopes.join(',') } })
}

/** The scopes stored on the shop's sessions (the union of all of them); empty when the shop has none. */
export async function readStoredScopes(shop: string): Promise<string[]> {
  const sessions = await getDb().session.findMany({ where: { shop }, select: { scope: true } })
  return [...new Set(sessions.flatMap((session) => (session.scope ?? '').split(',')).filter((scope) => scope !== ''))]
}
