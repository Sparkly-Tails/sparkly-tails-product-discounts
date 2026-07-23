import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')

  if (!shop) return new NextResponse('Missing shop', { status: 400 })

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) {
    return new NextResponse('Invalid HMAC', { status: 403 })
  }

  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const scopes = 'read_products,write_discounts,read_discounts'

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', scopes)
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  // Embedded loads run inside an iframe. A normal 3xx redirect just
  // navigates the iframe itself, and Shopify's OAuth grant screen refuses
  // to be framed — so break out to the top-level window first.
  if (searchParams.get('embedded') === '1') {
    return new NextResponse(
      `<!DOCTYPE html><html><body><script>window.top.location.href = ${JSON.stringify(oauthUrl.toString())}</script></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )
  }

  return NextResponse.redirect(oauthUrl.toString())
}
