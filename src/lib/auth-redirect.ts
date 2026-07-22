import { redirect } from 'next/navigation'
import { makeSessionToken } from '@/lib/shopify-auth'
import { appendToken } from '@/lib/auth-token'

export async function redirectWithToken(path: string): Promise<never> {
  const shop = process.env.SHOPIFY_SHOP
  const secret = process.env.SHOPIFY_API_SECRET_KEY
  if (shop && secret) {
    const token = await makeSessionToken(shop, secret)
    redirect(appendToken(path, token))
  }
  redirect(path)
}
