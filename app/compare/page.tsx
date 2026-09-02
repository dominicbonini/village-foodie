// app/compare/page.tsx
// 🔴 A SERVER COMPONENT, AND IT MUST STAY ONE. It gates the calculator and renders the shared landing
// chrome around it; the calculator itself lives in ./CostComparison.tsx as a client component because it
// is nine hooks of interactive state.
//
// ── 🔴 WHY THE GATE IS HERE AND NOT A CONDITIONAL INSIDE THE CALCULATOR ─────────────────────────────
// The obvious "simplification" is to delete this file and write, inside the client component:
//
//     {PRICING_PUBLISHED || isAdmin ? <Calculator/> : null}
//
// 🔴 THAT WOULD NOT PROTECT THE PRICES, AND IT WOULD LOOK LIKE IT DID. `./CostComparison.tsx` imports
// PLAN_MONTHLY_PENCE, PLAN_ONLINE_ALLOWANCE, PLATFORM_FEE_OVER_ALLOWANCE and CARD_FEES. A client-side
// conditional hides the MARKUP; the module is still in the JavaScript bundle sent to the browser, so
// every unpublished price is readable in devtools by anyone who loads the URL. Hiding is not gating.
// ⚠️ It would also need a SECOND admin check, because `verifyAdmin` cannot run in a client module: its
// import chain ends at `cookies()` from `next/headers`, which Next.js rejects there.
// 🔴 SO: IF THIS FILE IS COLLAPSED INTO THE CLIENT COMPONENT, THE GATE IS GONE AND NOTHING WILL SAY SO.
//
// ── ⚠️ WHAT THIS GATE IS AND IS NOT FOR ────────────────────────────────────────────────────────────
// It is NOT the page's only protection today: `app/landing/layout.tsx` wraps this route and already
// admits admins only. This gate exists so the page is safe WITHOUT that one — if the landing ever
// ungates before pricing publishes, unpublished prices would otherwise become public with no error and
// no warning. ⚠️ THE LAYOUT RUNS FIRST AND IS STRICTER, so while the landing stays gated a non-admin is
// stopped there even with the flag set.
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { verifyAdmin } from '@/lib/auth/admin'
import { PRICING_PUBLISHED } from '@/lib/pricing'
import { isHatchGrabHost } from '@/lib/brand'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import CostComparison from './CostComparison'
import '../landing/landing.css'

export const dynamic = 'force-dynamic'

// ── 🔴 noindex, nofollow — DELIBERATE, AND NOT THE SAME DECISION AS THE GATE ────────────────────
// The gate below decides WHO may load this page. This decides whether a crawler may keep it. They are
// different questions and this page needs both answered "no by default":
//   • it carries the REAL, UNMASKED price list (no maskPrice import anywhere in ./CostComparison),
//   • the link is handed out directly, so there is no search traffic to win,
//   • and the landing page it belongs beside is still embargoed and carries robots:{index:false} too —
//     an indexed /compare beside a noindexed landing would be the one page Google keeps.
// 🟢 `follow: false` as well as `index: false`: this page links to /signup and /contact, and there is
// no reason for it to pass any crawl signal on while it is not meant to be found.
// ⚠️ THIS DOES NOT MAKE IT PRIVATE. noindex is a request to well-behaved crawlers, nothing more. The
// gate is what stops people; this only stops the page turning up in a search result.
export const metadata = {
  robots: { index: false, follow: false },
}

/** The one place this route asks which brand it is serving. Same shape as app/contact/page.tsx:36. */
async function onHatchGrab(): Promise<boolean> {
  const headersList = await headers()
  return isHatchGrabHost(headersList.get('host') || '')
}

// ── 🔴 DECLARED HERE, NOT IMPORTED FROM THE LANDING PAGE. ───────────────────────────────────────────
// landing.css reads --font-archivo / --font-public-sans / --font-courier-prime, and those variables are
// set by the class each next/font instance generates. Moving the landing's declarations into a shared
// module would change the class names in ITS rendered markup, which is the one thing this task must not
// do. Two instances of the same config share the same CSS variable NAMES, so the chrome styles
// identically; next/font deduplicates the font files themselves.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap' })

// 🔴 THE `.hg-landing` WRAPPER GOES ROUND THE CHROME ONLY — NEVER ROUND THE CALCULATOR.
// All 195 rules in landing.css are scoped under `.hg-landing`, and one of them is `.hg-landing * {
// margin: 0 }`. That single rule would strip every Tailwind margin in the calculator — `mt-3`, `mt-5`,
// and the `space-y-3` stacks, which are implemented as margins on children. The landing's own footer
// comment records this happening once already: `mx-auto` there was "silently doing NOTHING" for exactly
// this reason. So the chrome is wrapped twice, above and below, and the calculator sits outside both.
const CHROME = `hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`

export default async function CostPage() {
  // 🔴 `PRICING_PUBLISHED` is lib/pricing.ts's own accessor — the same one Billing, FeatureGate and the
  // van add-on read. 🔴 `verifyAdmin` is the canonical check, shared with app/landing/layout.tsx.
  // 🔴 REDIRECT TO /contact, NEVER TO '/': proxy.ts rewrites '/' to the landing on hatchgrab.com, so
  // refusing someone to '/' loops forever on the domain given to Apple as the Marketing URL.
  // ── 🔴 GATE 1 OF 2: THE BRAND. THIS PAGE DOES NOT EXIST ON VILLAGE FOODIE. ────────────────────
  // Village Foodie is the CONSUMER discovery brand. Someone there is looking for a food truck, not for
  // operator plan pricing, and showing them £29/£49 tiers is the branding leak app/contact/page.tsx's
  // host split exists to prevent. Being a top-level route, this page is served on BOTH domains unless
  // something says otherwise — nothing in proxy.ts scopes it — so this is that something.
  // 🟢 notFound(), NOT a redirect: on that host the page genuinely does not exist, and a 404 says so
  // without leaking that it exists elsewhere. Next renders the 404 in Village Foodie's own chrome.
  // ⚠️ FIRST, BEFORE ANY AUTH WORK. It needs only a header, so an anonymous visitor on the wrong brand
  // never costs a Supabase round-trip.
  if (!(await onHatchGrab())) {
    notFound()
  }

  // ── GATE 2 OF 2: PRICING PUBLICATION ────────────────────────────────────────────────────────────
  // 🔴 THE HAND-CARRIED ADMIN GATE WAS REMOVED HERE ON 2 SEPTEMBER 2026, ON REQUEST, AND THAT IS A
  // DELIBERATE OPENING. From this point the page is public to anyone on hatchgrab.com the moment
  // NEXT_PUBLIC_PRICING_PUBLISHED is 'true' in Vercel — it no longer waits for the landing's embargo to
  // lift, and it no longer requires an admin session. Dominic: "The second gate stays, so the page opens
  // when NEXT_PUBLIC_PRICING_PUBLISHED is 'true' in Vercel and not before."
  // ⚠️ SO THE FLAG IS NOW THE WHOLE ANSWER on this route. Flipping it publishes the real price list here
  // at the same moment it un-masks prices in Billing. That is one switch doing two jobs; know it before
  // flipping. See docs/compare-page-publish-report.md.
  // ⚠️ /contact, NEVER '/': proxy.ts rewrites '/' to the landing on hatchgrab.com, so redirecting there
  // loops forever on the domain given to Apple as the Marketing URL. Unchanged from the original.
  if (!PRICING_PUBLISHED && !(await verifyAdmin())) {
    redirect('/contact')
  }

  // ── 🔴 NO DemoModalProvider AND NO DemoModal ON THIS PAGE, AND THAT IS NOW CORRECT. ───────────────
  // They were here only because the shared nav rendered the landing's <DemoCta>, whose useDemoModal()
  // throws without a provider. Passing `cta` takes the nav's other branch — a plain <a> — so nothing in
  // this tree calls useDemoModal and the provider had nothing left to provide.
  // ⚠️ IF YOU EVER DROP THE `cta` PROP BELOW, THE PROVIDER MUST COME BACK. The nav would fall to its
  // default branch and throw at render. That is a loud failure rather than a silent one, which is the
  // right way round, but it is a coupling worth knowing about before editing this line.
  return (
    <>
      <div className={CHROME}>
        {/* ⚠️ CHROME, NOT A FOURTH CTA. The page already carries three calls to action — the hero pair
            and the one under the small print — so this one deliberately keeps the nav's own appearance
            (`btn btn-primary nav-cta`, supplied by LandingNav) rather than competing with them. It
            points at the same place as the page's primary action.
            ⚠️ THE SHORT LABEL IS NOT OPTIONAL IN PRACTICE. Below 640px the nav swaps `.cta-full` for
            `.cta-short`, and the nav must never wrap — so the mobile label drops the arrow, exactly as
            the landing's own "Upload my menu →" / "Upload menu" pair does. */}
        {/* ⚠️ `landingHref` IS NOT OPTIONAL IN PRACTICE ON A CHILD ROUTE. Without it the nav's logo and
            its Pricing link are bare fragments that resolve against THIS page and silently do nothing —
            see the table in LandingNav.tsx. '/landing' is used rather than '/' because '/' is only the
            landing on a hatchgrab host. */}
        <LandingNav
          cta={{ href: '/signup', label: 'Start free →', shortLabel: 'Start free' }}
          landingHref="/landing"
        />
      </div>

      <CostComparison />

      <div className={CHROME}>
        <LandingFooter landingHref="/landing" />
      </div>
    </>
  )
}
