// middleware.ts
// 🔴 ONE JOB: hatchgrab.com's ROOT serves the HatchGrab landing page. Nothing else.
//
// ── WHY MIDDLEWARE AND NOT A SERVER COMPONENT ──────────────────────────────────────────────────────
// `app/page.tsx` is `'use client'` (389 lines, the Village Foodie discovery map). Branding by host from
// inside it would mean converting it to a server component that reads `headers()`, which forces DYNAMIC
// rendering for BOTH domains and restructures a live consumer page. The constraint is that
// villagefoodie.co.uk must not change, so the branch is kept OUTSIDE the page entirely.
//
// ── 🔴 THE MATCHER IS THE BLAST RADIUS, AND IT IS TWO PATHS ────────────────────────────────────────
// `config.matcher` below is `['/', '/landing']`. Middleware is NOT invoked for any other path on either
// domain — not /app, not /support, not /dashboard, not /trucks, not /api. Adding this file changes the
// request path of exactly two URLs.
//
// ── ⚠️ THIS REPO HAD A MIDDLEWARE ONCE AND DELETED IT. THIS IS NOT THAT. ───────────────────────────
// `git log --diff-filter=D -- middleware.ts` names commit f4a8ac2, "vercel fix", 5 June 2026. The file
// it removed was an UPSTASH REDIS RATE LIMITER that ran `await limiter.limit(ip)` — a network
// round-trip — on `/api/:path*` and `/trucks/:path*`, i.e. on every API call the product makes.
// ⚠️ WHY IT WAS REMOVED IS NOT RECORDED and I could not establish it; the commit message says only
// "vercel fix". What IS establishable is that this file shares none of its cost profile: no import of
// @upstash, no `await` of any kind, no I/O, no database, no network. It reads one header and returns.
// If the old file was removed for its Redis latency or its failure mode, none of that applies here.
import { NextRequest, NextResponse } from 'next/server'

/** hatchgrab.com and any preview/subdomain of it. Deliberately the SAME test as
 *  `isHatchGrabHost` in lib/brand.ts (`host.includes('hatchgrab')`) so the two cannot disagree.
 *  Not imported from there: middleware runs on the edge runtime and lib/brand.ts is a wider module. */
function isHatchGrab(host: string): boolean {
  return host.includes('hatchgrab')
}

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  const { pathname } = req.nextUrl

  // ── /landing KEEPS WORKING, ON BOTH DOMAINS, BY GOING TO THE ROOT ───────────────────────────────
  // 🔴 AND ON VILLAGE FOODIE THIS IS WHAT ALREADY HAPPENED. The admin gate that used to sit in
  // app/landing/layout.tsx redirected every non-admin to '/' in production. Removing that gate without
  // this line would have turned villagefoodie.co.uk/landing into a PUBLIC HatchGrab page, which is a
  // change to Village Foodie. This keeps a non-admin's outcome there exactly as it was: '/' → the map.
  // ⚠️ THE ONE PERSON AFFECTED ON VILLAGE FOODIE IS AN ADMIN, who could previously preview the landing
  // at villagefoodie.co.uk/landing and now sees the map. The same preview is at hatchgrab.com.
  if (pathname === '/landing') {
    return NextResponse.redirect(new URL('/', req.url), 308)
  }

  // ── THE ROOT ────────────────────────────────────────────────────────────────────────────────────
  // 🔴 A REWRITE, NOT A REDIRECT. The URL stays `https://www.hatchgrab.com/` — which is what is
  // submitted to Apple as the Marketing URL — while the landing renders beneath it. A redirect would
  // put `/landing` in the address bar of the page Apple was given.
  // ⚠️ NO LOOP: Next.js does not re-invoke middleware on the path a rewrite targets, so the rewritten
  // `/landing` render is NOT caught by the redirect above. INFERRED from documented behaviour and
  // UNVERIFIED here — nothing in this repo can exercise it. See the report.
  if (isHatchGrab(host)) {
    return NextResponse.rewrite(new URL('/landing', req.url))
  }

  // 🔴 EVERY OTHER HOST FALLS THROUGH UNTOUCHED. villagefoodie.co.uk's root renders exactly what it
  // rendered before this file existed: app/page.tsx, the discovery map.
  return NextResponse.next()
}

export const config = {
  // 🔴 TWO PATHS. Not a prefix, not a wildcard, not a negative lookahead over everything.
  matcher: ['/', '/landing'],
}
