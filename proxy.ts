import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ratelimit, strictRatelimit } from '@/lib/ratelimit'

const STRICT_PREFIXES = ['/api/menu', '/api/discovery', '/api/events', '/trucks']
const EXEMPT_PREFIXES = [
  '/api/dashboard/action',
  '/api/orders/submit',
  '/api/webhooks',
  '/api/admin',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Domain redirect: operator routes on villagefoodie.co.uk → hatchgrab.com ──
  const host = request.headers.get('host') || ''
  const isVillageFoodie =
    host === 'villagefoodie.co.uk' ||
    host === 'www.villagefoodie.co.uk'

  const operatorPaths = ['/dashboard', '/manage', '/kds', '/login',
                         '/forgot-password', '/reset-password', '/admin']
  const isOperatorRoute = operatorPaths.some(p => pathname.startsWith(p))

  if (isVillageFoodie && isOperatorRoute) {
    return NextResponse.redirect(
      `https://www.hatchgrab.com${pathname}${request.nextUrl.search}`
    )
  }

  // ── Rate limiting ─────────────────────────────────────────────────
  const isRateLimitedPath =
    pathname.startsWith('/api/') || pathname.startsWith('/trucks/')
  let rlRemaining: number | null = null

  if (isRateLimitedPath && !EXEMPT_PREFIXES.some(p => pathname.startsWith(p))) {
    const limiter = STRICT_PREFIXES.some(p => pathname.startsWith(p))
      ? strictRatelimit
      : ratelimit

    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : (request.ip ?? '127.0.0.1')

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
    rlRemaining = remaining
  }

  // ── Supabase auth session ──────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes — require authentication
  // Note: /kds uses kds_token auth, not session auth — excluded here
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/manage')

  // Public routes — always accessible
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/' ||
    pathname.startsWith('/trucks') ||
    pathname.startsWith('/venues') ||
    pathname.startsWith('/help')

  if (isProtected && !user) {
    // Not logged in — redirect to login with return URL
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/login' && user) {
    // Already logged in — redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (rlRemaining !== null) {
    supabaseResponse.headers.set('X-RateLimit-Remaining', String(rlRemaining))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)',
  ],
}
