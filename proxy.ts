import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ratelimit, strictRatelimit, eventsRatelimit, embedRatelimit, customHostRatelimit } from '@/lib/ratelimit'
import { isCustomHost, isAllowedOnCustomHost, isAcmeChallenge } from '@/lib/custom-host'
// Language Phase 1e — the country router. Pure decision (lib/marketing-country.ts) + the switched-on list through the
// existing 60-second cached loader. ⚠️ lib/country-settings.ts is `server-only`: allowed here because proxy.ts always
// runs on the Node.js runtime in Next 16 ("Proxy always runs on Node.js runtime") and Next bundles the proxy in a
// server layer, where `server-only` resolves to its empty module.
import { listCountrySettingsCached } from '@/lib/country-settings'
import { MARKETING_COUNTRY, ROUTER_PATHS, countryPageOf, marketingRedirect, routableCountries } from '@/lib/marketing-country'
import { VISITOR_COUNTRY_COOKIE, VISITOR_COUNTRY_MAX_AGE } from '@/lib/visitor-country-types'
import { PAGE_LANG_HEADER } from '@/lib/page-lang'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { PRIVACY_PATH, TERMS_PATH, COUNTRY_TERMS_PATH } from '@/lib/legal'
import { comparisonAddressOf, comparisonFlagsOf } from '@/lib/comparison-flags'

// seo-fixes S4: the legal documents, written in en-GB on every host.
const LEGAL_DOCUMENT_PATHS = new Set([PRIVACY_PATH, TERMS_PATH, COUNTRY_TERMS_PATH])

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
// ⚠️ `/o/` IS HERE TO PRESERVE METERING THAT ALREADY EXISTED, NOT TO ADD ANY (29 August 2026).
// The printed QR used to encode `/trucks/<slug>/order`, which this predicate already covered at 60/min.
// Moving the scan target to `/o/<slug>` without this line would have taken the one address on a printed
// code OUT of the limiter entirely — an unmetered DB read, reachable by anyone, whose redirect
// discloses a truck's custom domain. That regression would have been introduced by the move, so it is
// closed by the move. Same bucket, same tier, same reasoning as the path it replaces.
const isGeneralPublic = (p: string) =>
  p === '/trucks' || p.startsWith('/trucks/') ||
  p === '/o' || p.startsWith('/o/') ||
  // `/order/<slug>` is the renamed scan/decider route (`/o/` is now a permanent shim to it). Same tier,
  // same reasoning as `/o/` above: without this the one address on a printed code would be an unmetered
  // DB read whose redirect discloses a truck's custom domain. Registered per-prefix (V11.51).
  // 🔴 THE DECIDER LEAF ONLY — `/order` and `/order/<slug>`, NOT `/order/<id>/manage`. Unlike `/o/`, the
  // `/order/` prefix has a deeper child (the customer order-manage page), which `/o/` never metered; a
  // `startsWith('/order/')` here would silently pull that page into the limiter. Matching a single
  // segment keeps the scope identical to what `/o/` covered.
  p === '/order' || /^\/order\/[^/]+$/.test(p) ||
  // ── 🔴 THE PRIVATE LINK (20261014), FOR THE SAME REASON `/o/` IS HERE ──────────────────────────
  // `/p/<token>` is a PUBLIC page that reads the database on every request, and its sibling
  // `/api/private-event` publishes a private event's name to anyone holding the token. Without this
  // line both would be UNMETERED public reads keyed on a string anyone can vary — the exact
  // regression the `/o/` note above records, and worse here: a token is unguessable, but the
  // ENDPOINT is not, so `/p/<junk>` can be hammered forever.
  // ⛔ THE SHAPE CHECK IN lib/private-events/token.ts IS NOT A SUBSTITUTE FOR THIS. It refuses junk
  // without a query, which is a cost control inside the handler; this is what bounds how often the
  // handler runs at all.
  // ⚠️ BOTH HALVES, LIKE `/embed`: the page and the endpoint that feeds it are one visitor action, so
  // metering only one would leave the other unbounded.
  // ⚠️ A SINGLE SEGMENT FOR THE PAGE — `/p/<token>` has no deeper child, and matching a prefix would
  // silently pull any future one in. Same discipline as the `/order/` leaf above.
  p === '/p' || /^\/p\/[^/]+$/.test(p) ||
  p === '/api/private-event'
// EMBED (600/min, keyed IP+slug) — the operator-website widget and the endpoint that feeds it.
// 🔴 BOTH HALVES, DELIBERATELY. The page and its data fetch are one visitor action, so limiting only
// one of them would leave the other unbounded. It also means one embed view spends TWO tokens; the
// sizing in lib/ratelimit.ts is done in those units.
// ⚠️ NOT UNDER /trucks/, WHICH IS THE WHOLE POINT OF THE ROUTE'S LOCATION. `isGeneralPublic` above
// would otherwise have swallowed it into the 60/min bucket it shares with the discovery pages.
const isEmbedPublic = (p: string) =>
  p === '/embed' || p.startsWith('/embed/') || p.startsWith('/api/embed/')

// The rate-limit key's truck component. The slug is a PATH segment on /embed/<slug> and a QUERY
// parameter on /api/embed/events, so both shapes are read here rather than at the call site.
// A missing value collapses to '-' — one shared bucket for malformed requests, which is correct:
// those are not a visitor's traffic.
const embedSlug = (p: string, params: URLSearchParams) => {
  if (p.startsWith('/api/embed/')) return params.get('slug') || '-'
  return p.split('/')[2] || '-'
}

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

/** The switched-on countries that have a country address (lib/marketing-country.ts). 🔴 NEVER THROWS: a country list
 *  that cannot be read is the marketing country alone — the router sends everyone to the GB page and a non-GB
 *  country address 302s to it, rather than the root answering 500. Read ONLY on a router path or a non-GB country
 *  page, so no other request pays for it. */
async function liveMarketingCountries(): Promise<string[]> {
  try {
    return routableCountries((await listCountrySettingsCached()).filter(c => c.enabled).map(c => c.countryCode))
  } catch (e) {
    console.warn('[country-router] country list unreadable — routing to the marketing country:', e instanceof Error ? e.message : e)
    return [MARKETING_COUNTRY]
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Domain redirect: operator routes on villagefoodie.co.uk → hatchgrab.com ──
  const host = request.headers.get('host') || ''

  // ── 🔴 AN OPERATOR'S OWN DOMAIN. DEFAULT DENY, AND IT RETURNS BEFORE ANYTHING ELSE RUNS. ──────────
  //
  // Everything below this block — the villagefoodie redirect, the four rate-limit tiers, the Supabase
  // session refresh, both auth guards, the /landing redirect and the host-branded root — assumes the
  // request arrived on one of OUR two domains. On an operator's domain every one of those assumptions
  // is wrong, and the investigation showed what the wrongness costs: an unknown host reached
  // `app/page.tsx`, the Village Foodie consumer discovery map, on their address.
  //
  // 🔴 SO THIS IS AN ALLOW-LIST OF TWO PATHS AND A 404 FOR EVERYTHING ELSE, worked back from the app's
  // surfaces rather than forward from the ones expected to matter. See lib/custom-host.ts for the full
  // list of what that denies. There is no fall-through: a custom host reaches the schedule page or it
  // reaches nothing.
  //
  // ⚠️ RETURNING HERE ALSO MEANS NO SUPABASE SESSION REFRESH RUNS ON AN OPERATOR'S DOMAIN, so no
  // `sb-…-auth-token` cookie is written for their host. The investigation listed that as undetermined;
  // this makes it moot rather than answered — the code path that would set it no longer runs.
  //
  // ⚠️ A BARE 404 FROM THE EDGE, not a rewrite to a not-found page. It is provably outside every route
  // in the app, it leaks nothing about what exists, and it costs no render.
  if (isCustomHost(host)) {
    // 🔴 THE CERTIFICATE CHALLENGE GOES THROUGH UNTOUCHED AND UNCOUNTED. Vercel's SSL docs: "The
    // /.well-known path is reserved and cannot be redirected or rewritten." Deny it and the operator's
    // certificate fails to RENEW — months later, as a browser interstitial on their own domain.
    if (isAcmeChallenge(pathname)) return NextResponse.next()

    if (!isAllowedOnCustomHost(pathname)) {
      return new NextResponse('Not found', { status: 404 })
    }

    // ── The limiter, keyed (address, HOST) ────────────────────────────────────────────────────────
    // 🔴 EVERY OTHER PREDICATE IN THIS FILE TAKES ONLY `pathname`, so a custom domain serving at '/'
    // matched none of them and would have been the one public surface with NO limiter at all. Keyed on
    // the host rather than a slug because the host IS the tenant here, and one operator's traffic must
    // never be able to exhaust another's budget.
    const cfIp = request.headers.get('x-forwarded-for')
    const clientIp = cfIp ? cfIp.split(',')[0].trim() : '127.0.0.1'
    const skipLimit = process.env.NODE_ENV !== 'production' || !cfIp || clientIp === '127.0.0.1'
    if (!skipLimit) {
      const { success } = await customHostRatelimit.limit(`${clientIp}:${host.toLowerCase()}`)
      if (!success) {
        console.warn(`[ratelimit] REFUSED limiter=custom-host key=${clientIp}:${host} path=${pathname} — returning 429`)
        return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        })
      }
    }

    // The schedule page. `/domain` resolves the host to a truck server-side — the lookup deliberately
    // does NOT happen here, because this file runs on the edge on every request and has no database
    // access by design (see the demo-dashboard note above, which makes the same point).
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/domain', request.url))
    }

    // The one endpoint the page fetches. Nothing else reaches this line.
    return NextResponse.next()
  }

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
  const isEmbed = isEmbedPublic(pathname)
  const inLimitedScope = isStrict || isEvents || isEmbed || isGeneralPublic(pathname)
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
    // ⚠️ EMBED IS TESTED FIRST. Its paths cannot collide with isEvents or isStrict today, but the
    // ordering is stated rather than left to luck: an embed request must never fall through to a
    // bucket sized for a different traffic shape.
    const limiter = isEmbed ? embedRatelimit : isEvents ? eventsRatelimit : isStrict ? strictRatelimit : ratelimit
    const limiterName = isEmbed ? 'embed' : isEvents ? 'events' : isStrict ? 'strict' : 'general'
    const truckParam = isEmbed
      ? embedSlug(pathname, request.nextUrl.searchParams)
      : isEvents ? (request.nextUrl.searchParams.get('truck') || '-') : null
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

  // ── 🔴 seo-fixes S4 (20 October 2026): THE PAGE'S LANGUAGE, FOR <html lang> ───────────────────────────────────
  // The root layout cannot see the URL, so the proxy — which already knows a country address — tells it, in a REQUEST
  // header forwarded by `NextResponse.next({ request })` below (the same way the refreshed session cookies travel).
  // A country page (/uk, /us/features, …) on a HatchGrab host → that country's locale (country_settings.locale, the
  // 60-second cached list); the legal documents → en-GB, the language they are written in (DEFAULT_LOCALE). Anything
  // else sets nothing and keeps "en". ⛔ A client-sent copy of the header is ALWAYS removed first, so it can't be forged.
  request.headers.delete(PAGE_LANG_HEADER)
  if (isHatchGrab(host)) {
    // compare-de-1: a comparison page (/de/vergleich/…) is a country page too — <html lang="de-DE">.
    const langPage = countryPageOf(pathname) ?? comparisonAddressOf(pathname)
    if (langPage) {
      const row = (await listCountrySettingsCached().catch(() => [])).find(c => c.countryCode === langPage.code)
      if (row?.locale) request.headers.set(PAGE_LANG_HEADER, row.locale)
    }
  }
  if (LEGAL_DOCUMENT_PATHS.has(pathname)) request.headers.set(PAGE_LANG_HEADER, DEFAULT_LOCALE)

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

  // ── 🔴 EVERY RESPONSE WE RETURN MUST CARRY THE REFRESHED AUTH COOKIES. ──────────────────────────
  // `getUser()` above ROTATES an expired access token and `setAll` writes the new pair onto
  // `supabaseResponse`. A `NextResponse.redirect(...)` is a BRAND-NEW response object that never
  // receives them — so every redirect below used to throw the refreshed session away and hand the
  // browser back its old, now-spent cookies.
  // 🔴 THAT IS WHY AN ADMIN COULD NOT OPEN A TRUCK (24 August 2026). `/manage/<token>` refreshed,
  // lost the cookies, saw `user` as null, and 307'd to `/login`; `/login` — one hop later, on cookies
  // that still just about worked — saw a user and bounced to `/dashboard`; `/dashboard` saw an admin
  // and bounced to `/admin`. Three redirects, ending where it started, with the token discarded.
  // ⚠️ DEFINED HERE, NOT FURTHER DOWN. It used to live beside the host-branded-root block at the
  // bottom, which is the only place that used it. Everything from this line on must use it.
  const carrySessionCookies = (res: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach(cookie => res.cookies.set(cookie))
    return res
  }

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

  // ── 🔴 A STALE TOKEN IS NOT "NO SESSION", AND ONLY ONE OF THEM MAY BOUNCE. ───────────────────────
  // `getUser()` returns `user: null` for BOTH "this browser has never signed in" and "this operator has
  // a session whose refresh just failed" — a transient auth outage, a rotated cookie lost in flight, a
  // tablet whose wifi dropped mid-refresh. Redirecting on both is what put a kitchen tablet on /login
  // mid-service, which is the outcome this distinction exists to prevent.
  //
  // THE DISTINCTION IS THE PRESENCE OF THE CREDENTIAL, NOT ITS VALIDITY. `hasOperatorSession` (line 107,
  // already computed above for the rate-limiter's operator bypass — reused, not reimplemented) tests for
  // an `sb-<ref>-auth-token` cookie. A browser that never signed in has none. A browser whose refresh
  // failed still has one, because auth-js clears it CLIENT-SIDE and the request that raced that clear
  // still carries it.
  // ⚠️ SO THIS IS DELIBERATELY NOT A VALIDITY CHECK, AND MUST NOT BECOME ONE. It answers "did someone
  // sign in on this browser at some point", which is exactly the question that separates a first-time
  // visitor from an operator having a bad minute.
  //
  // 🔴 WHAT THE PAGE DOES INSTEAD: it renders. Every operator surface authenticates its OWN data calls
  // on the path token (a separate workstream), so the board still loads. The client-side observer
  // (lib/auth/session-observer.ts) sees the SIGNED_OUT, tries to recover, and offers "Sign in again" as
  // a CHOICE. Nothing is lost and nobody is moved.
  // ⚠️ THIS IS NOT A WEAKENING OF ACCESS CONTROL. The edge redirect was never the boundary — proxy.ts
  // puts `/api` on the public list (line 220), so the API was always reachable without it. It is a
  // routing convenience, and it is being made to stop firing on the one case where it does harm.
  const hasStaleButRealSession = hasOperatorSession
  if (isProtected && !user && !isNativeApp && !hasStaleButRealSession) {
    // No session at all — a genuine "please sign in", not a mid-service failure.
    // ⚠️ `pathname + search`, not `pathname`: the query string is part of the destination and dropping
    // it silently lands the operator on the same page with different state.
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
    return carrySessionCookies(NextResponse.redirect(loginUrl))
  }

  if (pathname === '/login' && user) {
    // ── 🔴 HONOUR `next`. THIS LINE USED TO IGNORE IT ENTIRELY. ──────────────────────────────────
    // The guard above sets `next` on the way in; this one threw it away on the way out and sent
    // everyone to `/dashboard`. For an ADMIN that is a dead end, because app/dashboard/page.tsx
    // redirects `is_admin` straight to `/admin` — so an admin clicking Dashboard or Manage on a truck
    // row watched the address bar flicker and land back on the page they started from, every time.
    // For an operator it is quieter and worse: they arrive at their FIRST truck instead of the one
    // they asked for, with nothing to say the destination changed.
    //
    // 🔴 THE GUARD IS AN OPEN-REDIRECT GUARD AND IS NOT OPTIONAL. `new URL(next, request.url)`
    // resolves `//evil.com` and `/\evil.com` to a DIFFERENT ORIGIN — a login page that forwards to an
    // attacker's site after authenticating is a credential-phishing primitive. Only a single leading
    // slash is accepted. ⚠️ `/login` is excluded too, or `?next=/login` redirects to itself forever.
    const rawNext = request.nextUrl.searchParams.get('next')
    const nextIsSafe =
      !!rawNext &&
      rawNext.startsWith('/') &&
      !rawNext.startsWith('//') &&
      !rawNext.startsWith('/\\') &&
      !rawNext.startsWith('/login')
    return carrySessionCookies(
      NextResponse.redirect(new URL(nextIsSafe ? rawNext! : '/dashboard', request.url))
    )
  }

  if (rlRemaining !== null) {
    supabaseResponse.headers.set('X-RateLimit-Remaining', String(rlRemaining))
  }

  // ── HOST-BRANDED ROOT — merged in from middleware.ts on 20 August 2026, which is now DELETED. ───────
  // ⚠️ HISTORY (kept because it explains the guards and the placement). Since Language Phase 1e (16 October
  // 2026) the root is no longer a rewrite to /landing on a HatchGrab host — it is the country router below.
  // "The REWRITE" in the two notes that follow is that old line; the guard and placement reasoning carry over.
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
  // (`carrySessionCookies` is defined immediately after `getUser()` above — it is needed by the auth
  //  guards as well as by the two returns below. Moved 24 August 2026; the body is unchanged.)

  // ══ 🔴 THE COUNTRY ROUTER — HatchGrab host only (Language Phase 1e, 16 October 2026) ══════════════════════════
  // The marketing pages have one address per country: /uk, /uk/features, /uk/compare and /us, /us/features,
  // /us/compare (app/[country]/…, lib/marketing-country.ts). The un-prefixed addresses are the ROUTER (x-default):
  //   hatchgrab.com/ · /landing · /features · /compare · /1ng7n4p5omux2gdk9kqvwz (the unlisted landing preview)
  // each 302 to the visitor's country's matching page — ?country → the hg_country cookie → x-vercel-ip-country →
  // GB, switched-on countries with an address only. Query strings other than `country` are kept. A ?country that
  // chose is kept in the hg_country cookie (as the menu kept it before). No special treatment of crawlers.
  // A COUNTRY page for a switched-off country 302s to the GB page of the same kind; a switched-on one is never
  // redirected, and /uk… never is (GB is the floor).
  //
  // ── WHAT THIS REPLACED ──────────────────────────────────────────────────────────────────────────────────────
  // Until today the ROOT here was a REWRITE to /landing ("the URL stays https://www.hatchgrab.com/ — which is
  // what is submitted to Apple as the Marketing URL"), and /landing 308'd to the root on both hosts. Both
  // decisions are REVERSED ON PURPOSE, by Dominic's spec: the root now 302s to /uk (or /us) — so Apple's
  // Marketing URL https://www.hatchgrab.com/ answers 302 → /uk — and /landing 302s to the country page too.
  // 302, not 308: the destination depends on the visitor and can change, so it must never be cached as permanent.
  //
  // ── 🔴 NO LOOP, AND WHY (the old note on the rewrite named the loop risk; this is the proof for the redirect) ──
  //   • Every Location this block writes is a COUNTRY page. A country page is never a router path, so the router
  //     cannot fire on it again.
  //   • A country page redirects only when its country is switched off, and only to /uk… — which never redirects.
  //     So the longest chain is router → /us… → /uk… (two proxy instances whose 60-second caches disagree), and it
  //     ends.
  //   • app/landing/layout.tsx no longer gates anything (its gate came off on 3 September 2026) and does not wrap
  //     the country pages (they live under app/[country], not app/landing).
  //
  // ── 🔴 THE `pathname` GUARDS ARE STILL LOAD-BEARING ──────────────────────────────────────────────────────────
  // Exact paths only (ROUTER_PATHS, countryPageOf). The matcher above is a negative lookahead over nearly every
  // path, so an unguarded redirect here would send /dashboard, /manage, /kds, /login and /api/* to the landing.
  //
  // ── WHY HERE, AT THE BOTTOM — unchanged reasoning ────────────────────────────────────────────────────────────
  // Every block above has already run (rate limiting, the session refresh, both auth guards, the native-app
  // exemption), and `carrySessionCookies` copies the refreshed Set-Cookie headers onto the redirect instead of
  // discarding them. None of these paths matches a rate-limit predicate, so `rlRemaining` is always null on them.
  //
  // 🔴 EVERY OTHER HOST FALLS THROUGH UNTOUCHED: villagefoodie.co.uk's root still renders app/page.tsx, its
  // /landing still 308s to its root (below), /features and /compare still 404 there (the pages' brand gate), and
  // the country addresses 404 there too (lib/visitor-country.ts). Custom domains returned long before this line.
  if (isHatchGrab(host)) {
    const routerPath = Object.prototype.hasOwnProperty.call(ROUTER_PATHS, pathname)
    const countryPage = routerPath ? null : countryPageOf(pathname)
    // The list is read only when it can change the answer: a router path, or a country page that is not GB's.
    if (routerPath || (countryPage && countryPage.code !== MARKETING_COUNTRY)) {
      const to = marketingRedirect(pathname, request.nextUrl.search, await liveMarketingCountries(), {
        cookie: request.cookies.get(VISITOR_COUNTRY_COOKIE)?.value,
        ip: request.headers.get('x-vercel-ip-country'),
      })
      if (to) {
        const res = NextResponse.redirect(new URL(to.location, request.url), 302)
        // The same cookie the menu writes (components/landing/CountryMenu.tsx): name, path, a year, lax.
        if (to.remember) res.cookies.set(VISITOR_COUNTRY_COOKIE, to.remember, { path: '/', maxAge: VISITOR_COUNTRY_MAX_AGE, sameSite: 'lax' })
        return carrySessionCookies(res)
      }
    }
  }

  // ── /landing ON EVERY OTHER HOST: UNCHANGED — 308 to that host's root ────────────────────────────────────────
  // On villagefoodie.co.uk it lands on the discovery map, which is what a non-admin already got there from
  // app/landing/layout.tsx. Phase 2D-1: the QUERY travels with it. (On a HatchGrab host the router above has
  // already answered /landing.)
  if (pathname === '/landing') {
    const to = new URL('/', request.url); to.search = request.nextUrl.search
    return carrySessionCookies(NextResponse.redirect(to, 308))
  }

  // ── compare-de-1 (24 October 2026): A COMPARISON PAGE THAT IS NOT LIVE IS NEVER INDEXED OR CACHED ─────────────────
  // /de/vergleich/foodtruck-bestellsystem and its .md / .json twins. While the country's comparison_status is 'off' or
  // 'admin' the page is a 404 for everyone but a verified admin (the page and the twin route check that themselves);
  // here every such response — the admin's 200 and everyone else's 404 — also says noindex, nofollow and private,
  // no-store, so no crawler, CDN or shared cache keeps a draft. 'live' adds nothing: the page is public. The flags are
  // the 60-second cached read (lib/comparison-flags.ts); only a path shaped like a comparison address pays for it.
  if (isHatchGrab(host)) {
    const cmp = comparisonAddressOf(pathname)
    if (cmp && (await comparisonFlagsOf(cmp.code)).status !== 'live') {
      supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow')
      supabaseResponse.headers.set('Cache-Control', 'private, no-store')
    }
  }

  return supabaseResponse
}

export const config = {
  // 🔴 seo-fixes M4 (20 October 2026, docs/seo-fixes-report.md): the exclusion read `_next_next/image` — a typo since
  // 24 May 2026 (`69faf282 login build`) — so EVERY /_next/static/* and /_next/image request ran this proxy, including
  // its `supabase.auth.getUser()` session call. Static assets and the image optimiser now skip it, as intended; every
  // page and API path still runs it (and the auth guards above), exactly as before.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)',
  ],
}
