import { getDb } from '@/lib/db'

export async function deleteShopSessions(shop: string): Promise<void> {
  await getDb().session.deleteMany({ where: { shop } })
}

export async function updateStoredScope(shop: string, scopes: string[]): Promise<void> {
  await getDb().session.updateMany({ where: { shop }, data: { scope: scopes.join(',') } })
}
