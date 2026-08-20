import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ratelimit, strictRatelimit, eventsRatelimit } from '@/lib/ratelimit'

// ── Rate-limit SCOPE = a POSITIVE ALLOWLIST of ONLY the public, scraping-prone endpoints. ───────────────
// INVERTED by design (NOT "limit every /api/* minus an exempt list"). Operator surfaces — the dashboard /
// manage / KDS pages AND every API they poll (/api/dashboard, /api/manage, /api/kds, /api/heartbeat,
// /api/ping, /api/slots, /api/menu, /api/orders, …) — are STRUCTURALLY OUTSIDE this set: they are never even
// considered for limiting, so no future edit to an exempt list can accidentally re-expose them. ONLY paths
// matched by the two predicates below are ever limited.
//
// STRICT (3/min) — public bulk-scrapeable competitor-harvest targets. ONE call returns EVERY truck, so
//   this is the tier that actually stops a harvest. Unchanged.
// CUSTOMER-EVENTS (600/min) — `/api/events` ONLY, matched EXACTLY: the public `?truck=` listing, called
//   from the customer order page and nowhere else. The operator `/api/events/manage|action|
//   affected-orders` sub-routes have longer pathnames and are NOT matched by any predicate here.
// GENERAL (60/min) — public customer pages that share IPs behind one network (café WiFi, CGNAT) → lenient.
//
// ── ⚠️ `/api/events` WAS ON THE STRICT TIER UNTIL 11 AUGUST 2026 AND IT REFUSED REAL CUSTOMERS ──────
// It shared STRICT's 3/min bucket with /api/discovery/*, keyed on IP alone. A normal journey — order
// page, "change event", back — costs exactly 3, so the fourth request in a minute was a 429. Vercel
// logs at 14:53 on 11 August: eight 429s in fifty seconds, all on /api/events, while /api/menu returned
// 200 throughout. The customer saw a failure card and could not order.
// ⚠️ THE TWO ROUTES ARE NOT THE SAME KIND OF THING and must never share a bucket again: /api/discovery
// returns EVERY truck in one call (a harvest target); /api/events returns ONE truck's schedule to the
// customer who is trying to order from it (an ordering dependency). Sizing rationale: lib/ratelimit.ts.
const isCustomerEvents = (p: string) => p === '/api/events'
const isStrictPublic = (p: string) =>
  p === '/api/discovery' || p.startsWith('/api/discovery/')
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/')

// ── DEMO DASHBOARD — the ONLY exception to the /dashboard session gate. ─────────────────────────────────
// A demo visitor is anonymous by design: no account, no signup, therefore no Supabase session. The session
// guard below would 307 them to /login before the page ever rendered, so the demo could not exist. The
// APIs are already fine — /api/dashboard and /api/dashboard/action authenticate on `dashboard_token` alone
// — so this is purely about the PAGE route. Same reasoning as /kds, which has never been session-gated
// because it authenticates by `kds_token`.
//
// ⚠️ THIS EXCEPTION'S SAFETY RESTS ON AN INVARIANT HELD IN ANOTHER FILE. `lib/provision-truck.ts`
// guarantees both halves:
//   1. every demo truck's dashboard_token is `demo-` + 130 bits of random (demoIdentity), and
//   2. NO operator truck can ever carry a `demo-` prefixed id/slug/token — assertReservedPrefix() throws
//      before the insert, which is why it is an assertion and not a naming convention.
// Half 2 is the load-bearing one. It is reachable by accident without it: a truck named "Demo Kitchen"
// slugs to `demo-kitchen`, and the operator token convention is `<slug-base>-<hex>` — so that real
// operator would have silently lost its session gate. If either half is ever weakened, this exception
// becomes a hole. Do not change one without the other.
//
// ⚠️ FOR A DEMO TRUCK THE TOKEN IS THE ENTIRE SECURITY BOUNDARY. Real operators keep two layers (session
// + token); a demo has only the token, because there is no account to sign in to. That is precisely why
// demo tokens are 130-bit random rather than readable — and why this must match `/dashboard/demo-*` only,
// never `/dashboard` as a whole.
//
// Path pattern only — NO database lookup. This runs in edge middleware on every request; the `demo-`
// prefix is self-identifying by design so no round-trip is needed to classify a token.
// Matches /dashboard/demo-<token> and its sub-routes (e.g. /dashboard/demo-<token>/kds); the trailing
// (/|$) stops a partial segment match, and the required [a-z0-9]+ stops a bare `/dashboard/demo-`.
const isDemoDashboard = (p: string) => /^\/dashboard\/demo-[a-z0-9]+(\/|$)/.test(p)

/** hatchgrab.com and any preview/subdomain of it. Deliberately the SAME test as `isHatchGrabHost` in
 *  lib/brand.ts (`host.includes('hatchgrab')`) so the two cannot disagree. Not imported from there:
 *  this file runs on the edge runtime and lib/brand.ts is a wider module. */
const isHatchGrab = (host: string) => host.includes('hatchgrab')

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
  const isEvents = isCustomerEvents(pathname)
  const inLimitedScope = isStrict || isEvents || isGeneralPublic(pathname)
  const isDev = process.env.NODE_ENV !== 'production'
  const isLoopback = !forwarded || ip === '127.0.0.1' || ip === '::1'
  // Cheap, no network: presence of an operator credential. A native Bearer, or a Supabase auth cookie
  // (`sb-<ref>-auth-token`) that only an operator who logged in would carry. Customers/scrapers have neither.
  const authHeader = request.headers.get('authorization') || ''
  const hasBearer = authHeader.startsWith('Bearer ')
  const hasOperatorSession = request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  // ── ⚠️ THE OPERATOR BYPASS NOW COVERS /api/events, AND STILL DOES NOT COVER STRICT ─────────────────
  // DECIDED 11 August 2026. `!isStrict` used to exclude /api/events too, because /api/events WAS strict.
  // Splitting the tiers changes what that expression means, so the decision is restated rather than
  // inherited: an authenticated operator IS exempt from the customer-ordering limiter, and is NOT exempt
  // from the bulk-harvest one. The operator who tripped this at 14:53 was loading their own customer
  // order page to check a deploy — carrying a Supabase session cookie the whole time — and was limited
  // exactly like a scraper. An operator inspecting their own storefront is the most legitimate traffic
  // this route receives.
  // ⚠️ STRICT STAYS EXCLUDED, unchanged: a forged or stolen credential must not unlock the bulk feed,
  // and an operator has no reason to call /api/discovery/* at all.
  const operatorBypass = (hasBearer || hasOperatorSession) && !isStrict

  let rlRemaining: number | null = null

  if (inLimitedScope && !isDev && !isLoopback && !operatorBypass) {
    // ── ⚠️ THE KEY IS (IP, TRUCK) FOR /api/events AND IP ALONE FOR THE OTHERS ────────────────────────
    // IP alone was half the defect: a venue's wifi puts every customer in one bucket, and UK carriers use
    // CGNAT, so hundreds of phones can share one address. Adding the truck slug means one truck's
    // customers can never exhaust another truck's budget, and the limit reads as "requests for this truck
    // from this address". `?truck=` is the route's own required parameter (it 400s without one), so it is
    // already present on every legitimate call; a missing value collapses to a single shared '-' bucket,
    // which is correct — those requests are malformed, not customer traffic.
    // ⚠️ NO BETTER KEY EXISTS TODAY. There is no customer identity on this path — no account, no session,
    // no device id — and inventing one to rate-limit by would be a tracking identifier introduced for the
    // convenience of a limiter. The real defence against a shared address is a threshold a shared address
    // cannot reach, which is what 600/min is for.
    const limiter = isEvents ? eventsRatelimit : isStrict ? strictRatelimit : ratelimit
    const limiterName = isEvents ? 'events' : isStrict ? 'strict' : 'general'
    const truckParam = isEvents ? (request.nextUrl.searchParams.get('truck') || '-') : null
    const key = truckParam ? `${ip}:${truckParam}` : ip

    const { success, remaining } = await limiter.limit(key)

    if (!success) {
      // ── ⚠️ THE REFUSAL NOW LOGS. IT USED TO BE COMPLETELY SILENT. ────────────────────────────────
      // Before this line the 429 was visible ONLY as a status code in the request log, with no text to
      // grep and no indication of which limiter fired or on what key — which is why the 14:53 incident
      // took a full audit to attribute. Names the limiter, the key and the path.
      // ⚠️ THIS RUNS IN EDGE MIDDLEWARE, so it lands in the MIDDLEWARE log stream, not a serverless
      // function log — the function never runs when the refusal happens. Search the edge/middleware logs.
      // ⚠️ The key contains an IP, which is personal data. It is logged because attributing a refusal is
      // impossible without it, and Vercel already records the client IP on every request line.
      console.warn(`[ratelimit] REFUSED limiter=${limiterName} key=${key} path=${pathname} — returning 429`)
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          // Matched to each window rather than to the tier: strict is 1 minute, so the old '300' was
          // advertising five minutes for a one-minute window. Nothing reads it today; it should still
          // be true.
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
  // Note: /dashboard/demo-* is likewise token-authed (anonymous demo, no account to sign in to) — see
  //       isDemoDashboard above for why that is safe and what invariant it depends on.
  const isProtected =
    (pathname.startsWith('/dashboard') && !isDemoDashboard(pathname)) ||
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

  // ── HOST-BRANDED ROOT — merged in from middleware.ts on 20 August 2026, which is now DELETED. ───────
  // Next 16.1 refuses to build with both a middleware file and a proxy file present ("Please use
  // ./proxy.ts only"), so the two behaviours below now live here. They are the ONLY thing that moved.
  //
  // ── CORRECTION OF A FALSE HISTORY THAT WAS WRITTEN IN THE DELETED FILE ─────────────────────────────
  // middleware.ts's header claimed this repo "had a middleware once and deleted it" at f4a8ac2 ("vercel
  // fix", 5 June 2026), and that the Upstash rate limiter it contained is gone. THAT IS WRONG, and
  // `git show f4a8ac2` disproves it in one command: the SAME COMMIT that deleted middleware.ts created
  // this file and added that rate limiter to it (`+import { ratelimit, strictRatelimit }`, +40 lines).
  // It was a RENAME to the Next 16 convention, not a removal. Nothing was deleted; the limiter has run
  // continuously ever since and is the block above (since rewritten into the public-allowlist form).
  //
  // ── 🔴 THE `pathname === '/'` GUARD ON THE REWRITE IS LOAD-BEARING — DO NOT DROP IT ────────────────
  // In middleware.ts the rewrite was unguarded, because `config.matcher` there was `['/', '/landing']`
  // and the path could not be anything else. THIS file's matcher is a negative lookahead over nearly
  // every path, so the same unguarded line would rewrite EVERY page on hatchgrab.com to the landing —
  // /dashboard, /manage, /kds, /login, /api/*. The operator redirect above sends Village Foodie
  // operators to `https://www.hatchgrab.com/dashboard`, so that is not hypothetical: it would bounce
  // every operator into the landing page. The guard restores the old matcher's blast radius exactly.
  //
  // ── 🔴 WHY THIS SITS AT THE BOTTOM AND NOT THE TOP ─────────────────────────────────────────────────
  // Returning early at the top would have skipped `supabase.auth.getUser()` for '/' and '/landing' —
  // i.e. dropped the session refresh on the two paths. Placed here, every block above has already run
  // unchanged (rate limiting, session refresh, both auth guards, the native-app exemption), and the
  // refreshed Set-Cookie headers `setAll` wrote onto `supabaseResponse` are copied onto the response we
  // return instead of being discarded with it. Nothing above this line was touched.
  // Losing no rate-limit header here is provable rather than assumed: '/' and '/landing' match none of
  // isCustomerEvents/isStrictPublic/isGeneralPublic, so `rlRemaining` is always null on both.
  const carrySessionCookies = (res: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach(cookie => res.cookies.set(cookie))
    return res
  }

  // ── /landing KEEPS WORKING, ON BOTH DOMAINS, BY GOING TO THE ROOT ──────────────────────────────────
  // Exact equality, as before — '/landing/anything' is not matched, on either matcher. On hatchgrab.com
  // the 308 lands on '/', which the branch below rewrites straight back to the landing, so the page is
  // reachable and the address bar reads `https://www.hatchgrab.com/`. On villagefoodie.co.uk it lands
  // on the discovery map, which is what a non-admin already got there from app/landing/layout.tsx.
  if (pathname === '/landing') {
    return carrySessionCookies(NextResponse.redirect(new URL('/', request.url), 308))
  }

  // ── THE ROOT ───────────────────────────────────────────────────────────────────────────────────────
  // 🔴 A REWRITE, NOT A REDIRECT. The URL stays `https://www.hatchgrab.com/` — which is what is submitted
  // to Apple as the Marketing URL — while the landing renders beneath it. A redirect would put '/landing'
  // in the address bar of the page Apple was given.
  // ⚠️ NO LOOP: Next.js does not re-invoke the proxy on the path a rewrite targets, so the rewritten
  // '/landing' render is NOT caught by the redirect above. INFERRED from documented behaviour and
  // UNVERIFIED here, exactly as it was in middleware.ts — moving the code neither creates nor removes
  // this risk. Note that app/landing/layout.tsx already relies on the same premise, and redirects a
  // non-admin to /support rather than to '/' precisely to avoid the loop that would otherwise exist.
  // 🔴 EVERY OTHER HOST FALLS THROUGH UNTOUCHED. villagefoodie.co.uk's root still renders app/page.tsx.
  if (pathname === '/' && isHatchGrab(host)) {
    return carrySessionCookies(NextResponse.rewrite(new URL('/landing', request.url)))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)',
  ],
}
