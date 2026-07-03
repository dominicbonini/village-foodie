import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ratelimit, strictRatelimit } from '@/lib/ratelimit'

// ── Rate-limit SCOPE = a POSITIVE ALLOWLIST of ONLY the public, scraping-prone endpoints. ───────────────
// INVERTED by design (NOT "limit every /api/* minus an exempt list"). Operator surfaces — the dashboard /
// manage / KDS pages AND every API they poll (/api/dashboard, /api/manage, /api/kds, /api/heartbeat,
// /api/ping, /api/slots, /api/menu, /api/orders, …) — are STRUCTURALLY OUTSIDE this set: they are never even
// considered for limiting, so no future edit to an exempt list can accidentally re-expose them. ONLY paths
// matched by the two predicates below are ever limited.
//
// STRICT (3/min) — public bulk-scrapeable competitor-harvest targets. `/api/events` is matched EXACTLY (the
//   public `?truck=` listing, called only from the customer order page); the operator
//   `/api/events/manage|action|affected-orders` sub-routes have a longer pathname and are NOT matched.
// GENERAL (60/min) — public customer pages that share IPs behind one network (café WiFi, CGNAT) → lenient.
const isStrictPublic = (p: string) =>
  p === '/api/events' || p === '/api/discovery' || p.startsWith('/api/discovery/')
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/')

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
  // Only the public allowlist (isStrictPublic / isGeneralPublic) is ever limited — operator surfaces are
  // structurally excluded, so the default is NOT-limited. On top of that, THREE bypasses ensure an operator
  // can never be caught even by an edge/misconfig:
  //   • dev — never limit on localhost/dev (today's incident + all future dev pain)
  //   • loopback / no client IP — localhost has no x-forwarded-for → ip collapses to 127.0.0.1 (one shared
  //     bucket for the whole machine); never limit that
  //   • authenticated operator — native Bearer or Supabase operator session cookie (customers never carry
  //     either). GENERAL tier ONLY (see operatorBypass) so a forged credential can't slip past the STRICT
  //     public-scraper tier, which operators never hit anyway.
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1'

  const isStrict = isStrictPublic(pathname)
  const inLimitedScope = isStrict || isGeneralPublic(pathname)
  const isDev = process.env.NODE_ENV !== 'production'
  const isLoopback = !forwarded || ip === '127.0.0.1' || ip === '::1'
  // Cheap, no network: presence of an operator credential. A native Bearer, or a Supabase auth cookie
  // (`sb-<ref>-auth-token`) that only an operator who logged in would carry. Customers/scrapers have neither.
  const authHeader = request.headers.get('authorization') || ''
  const hasBearer = authHeader.startsWith('Bearer ')
  const hasOperatorSession = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  const operatorBypass = (hasBearer || hasOperatorSession) && !isStrict

  let rlRemaining: number | null = null

  if (inLimitedScope && !isDev && !isLoopback && !operatorBypass) {
    const limiter = isStrict ? strictRatelimit : ratelimit

    const { success, remaining } = await limiter.limit(ip)

    if (!success) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': isStrict ? '300' : '60',
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

  // NATIVE APP (Capacitor iPad shell): its session lives in Preferences and is sent as a Bearer only on
  // explicit fetch()s — document/RSC NAVIGATION requests carry no cookie AND no Authorization header, so
  // `user` is always null here and this guard would 307-loop the app to /login (it logs in, gets a native
  // session, navigates, hits this cookie-blind guard again → loop). The webview stamps a UA marker
  // (capacitor.config ios.appendUserAgent) that a normal browser never has; when we see it, DEFER auth to
  // the page/client, which DOES check the native session (hasNativeSession) and sends the Bearer to
  // /api/dashboard. Web has no marker → this branch is skipped → web behaviour is byte-identical to before.
  const isNativeApp = (request.headers.get('user-agent') || '').includes('HatchGrabNativeApp')

  if (isProtected && !user && !isNativeApp) {
    // Not logged in (web) — redirect to login with return URL
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
