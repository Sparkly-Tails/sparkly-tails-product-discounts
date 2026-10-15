import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { bouncePage, decideProxy, forwardHeaders } from '@/lib/proxyDecision'

function accessRestricted(shop: string | undefined, message: string): string {
  const link = shop ? `<p><a href="https://${shop}/admin/apps">Go to Shopify admin &rarr;</a></p>` : ''
  return `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${message}</h2>${link}</body></html>`
}

export async function proxy(req: NextRequest) {
  const env = {
    secret: process.env.SHOPIFY_API_SECRET_KEY,
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
    shop: process.env.SHOPIFY_SHOP,
  }

  const decision = await decideProxy({
    pathname: req.nextUrl.pathname,
    searchParams: req.nextUrl.searchParams,
    headers: {
      authorization: req.headers.get('authorization'),
      secFetchDest: req.headers.get('sec-fetch-dest'),
      accept: req.headers.get('accept'),
      rsc: req.headers.get('rsc'),
    },
    env,
    now: Math.floor(Date.now() / 1000),
    isDevelopment: process.env.NODE_ENV === 'development',
  })

  if (decision.kind === 'bounce') {
    return new NextResponse(bouncePage(env.apiKey ?? ''), { status: 200, headers: { 'Content-Type': 'text/html' } })
  }

  if (decision.kind === 'deny') {
    const isHtml = (req.headers.get('accept') ?? '').includes('text/html')
    if (decision.status === 503) return NextResponse.json({ error: decision.message }, { status: 503 })
    return isHtml
      ? new NextResponse(accessRestricted(env.shop, decision.message), { status: decision.status, headers: { 'Content-Type': 'text/html' } })
      : NextResponse.json({ error: decision.message }, { status: decision.status })
  }

  return NextResponse.next({ request: { headers: forwardHeaders(req.headers, decision) } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
