import { NextRequest, NextResponse } from 'next/server'
import { ratelimit, strictRatelimit } from '@/lib/ratelimit'

const STRICT_PREFIXES = ['/api/menu', '/api/discovery', '/api/events', '/trucks']

const EXEMPT_PREFIXES = [
  '/api/dashboard/action',
  '/api/orders/submit',
  '/api/webhooks',
  '/api/admin',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (EXEMPT_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const limiter = STRICT_PREFIXES.some(p => pathname.startsWith(p))
    ? strictRatelimit
    : ratelimit

  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.ip ?? '127.0.0.1')

  const { success, remaining } = await limiter.limit(ip)

  if (!success) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    })
  }

  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  return response
}

export const config = {
  matcher: [
    '/api/:path*',
    '/trucks/:path*',
  ],
}
