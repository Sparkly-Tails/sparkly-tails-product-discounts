import { PrismaClient } from '@prisma/client'

/**
 * Each serverless instance should hold one connection to the Supabase
 * transaction pooler: Prisma's default pool of 5 timed out at cold start and
 * pushed webhook answers past Shopify's 5 second limit. Parameters already in
 * the URL win.
 */
export function withPoolParams(url: string): string {
  const params: string[] = []
  if (!/[?&]connection_limit=/.test(url)) params.push('connection_limit=1')
  if (!/[?&]pool_timeout=/.test(url)) params.push('pool_timeout=20')
  if (params.length === 0) return url
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`
}

declare global {
  var prismaGlobal: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  return url ? new PrismaClient({ datasourceUrl: withPoolParams(url) }) : new PrismaClient()
}

/** Lazy, so importing this module (a build, a test) never opens a connection. Cached on globalThis so hot reloads and warm serverless instances reuse one client. */
export function getDb(): PrismaClient {
  return (globalThis.prismaGlobal ??= createClient())
}
