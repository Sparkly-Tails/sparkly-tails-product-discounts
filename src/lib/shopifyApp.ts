import '@shopify/shopify-api/adapters/node'
import { ApiVersion, shopifyApi } from '@shopify/shopify-api'
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma'
import type { PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/db'

function createShopify() {
  return shopifyApi({
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET_KEY ?? '',
    // Used only to build OAuth redirect URLs; token exchange does not need it.
    hostName: process.env.VERCEL_URL ?? 'localhost',
    apiVersion: ApiVersion.October26,
    isEmbeddedApp: true,
  })
}

let shopifyInstance: ReturnType<typeof createShopify> | undefined
let storageInstance: PrismaSessionStorage<PrismaClient> | undefined

/** Lazy: the secret and key are read when first needed, not when the module loads (a build has none). */
export function getShopify() {
  return (shopifyInstance ??= createShopify())
}

export function getSessionStorage(): PrismaSessionStorage<PrismaClient> {
  return (storageInstance ??= new PrismaSessionStorage(getDb()))
}
