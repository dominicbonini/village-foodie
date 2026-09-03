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
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { DemoModalProvider, DemoModal } from '@/components/landing/DemoUpload'   // client children — the public demo entry point
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
// 🟢 `follow: false` as well as `index: false`: this page links out to /contact, /login and the landing,
// and there is no reason for it to pass any crawl signal on while it is not meant to be found.
// ⚠️ It no longer links to /signup — all three CTAs are demo-modal BUTTONS now, which a crawler cannot
// follow at all. `follow: false` is therefore doing less work than it was, and still correct.
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

  // ── 🔴 THE PRICING-FLAG GATE WAS REMOVED HERE — 3 SEPTEMBER 2026. THE PAGE IS PUBLIC. ───────
  // It read:
  //     if (!PRICING_PUBLISHED && !(await verifyAdmin())) redirect('/contact')
  // 🟢 WHY IT WENT: the landing page's own admin gate was removed this morning, and the landing now
  // LINKS here from its pricing section. A gated page behind a public link is a broken promise — the
  // switching block tells a visitor it takes about a minute and then bounces them to a contact form.
  // The two had to move together and the landing moved first.
  // 🔴 THE FLAG ITSELF IS UNTOUCHED AND STILL MATTERS ELSEWHERE. NEXT_PUBLIC_PRICING_PUBLISHED still
  // governs price masking in Manage -> Billing, FeatureGate and the van add-on through lib/pricing.ts,
  // which this change does not modify. Removing the check HERE decouples this page from that decision;
  // it does not make the decision. Do not read this as "the flag no longer does anything".
  // ⚠️ SO THIS PAGE NOW SHOWS THE REAL PRICE LIST TO ANYONE ON A HATCHGRAB HOST, unconditionally. That is
  // the intent. The only thing still standing between it and the public is the host gate above.

  // ── 🔴 THE PROVIDER AND THE MODAL CAME BACK — 3 SEPTEMBER 2026. THIS PAGE'S CTAs OPEN THE DEMO. ───
  // They were removed on 23 August, when all three of this page's CTAs pointed at /signup and nothing in
  // the tree called useDemoModal(). All three now open the demo modal instead — the nav below by DROPPING
  // its `cta` prop, and the calculator's two by rendering <DemoCta> — so the provider is required again,
  // and the previous note here ("IF YOU EVER DROP THE `cta` PROP, THE PROVIDER MUST COME BACK") is the
  // instruction that was followed. It is restored exactly as app/landing/page.tsx has it: ONE provider
  // wrapping the whole tree, ONE <DemoModal /> at the end.
  //
  // 🔴 WHY THE CTAs MOVED OFF /signup — AN OPERATOR DECISION, 3 SEPTEMBER 2026, NOT A REFACTOR.
  // /signup → /setup CANNOT COMPLETE and has not since 4 August 2026: app/api/setup/route.ts:70-72
  // requires `contact_phone` and app/setup/page.tsx has no field for it, so every attempt 400s AFTER the
  // account is created — permanently consuming the email address. See docs/signup-journey-review-report.md.
  // The demo path is the one that works, collects more (phone, WhatsApp preference, first/last name,
  // cuisine) and lands a materially more complete truck — docs/onboarding-completeness-report.md §6.
  // ⚠️ SO THIS IS A ROUTE AROUND A BREAK, NOT A FIX OF IT. /signup and /setup are untouched and still
  // exist; app/manage/page.tsx:56 still sends a truckless operator to /setup, and that is deliberate.
  // 🔴 IF /setup IS EVER REPAIRED, THIS PAGE DOES NOT AUTOMATICALLY GO BACK. Reverting is a product
  // decision about which door a cost-comparison visitor should walk through, not a cleanup.
  //
  // ⚠️ EXACTLY ONE PROVIDER AND EXACTLY ONE MODAL. A second provider lower down would give the CTAs
  // under it their own `open` state, and the modal mounted here would never see it — the CTA would look
  // dead. CostComparison.tsx deliberately renders neither.
  return (
    <DemoModalProvider>
      <div className={CHROME}>
        {/* ⚠️ CHROME, NOT A FOURTH CTA. The page already carries three calls to action — the hero pair
            and the one under the small print — so this one deliberately keeps the nav's own appearance
            (`btn btn-primary nav-cta`, supplied by LandingNav) rather than competing with them. It
            performs the same action as the page's primary CTA.
            🔴 NO `cta` PROP, AND THAT IS THE CHANGE. LandingNav's default branch renders
            <DemoCta className="btn btn-primary nav-cta"> with "Upload my menu →" / "Upload menu" — the
            SAME COMPONENT the landing's own nav renders, byte-identical markup and classes, not a copy.
            ⚠️ That default is also what supplies the short label: below 640px the nav swaps `.cta-full`
            for `.cta-short` and `.nav-r .btn` is `white-space: nowrap`, so the mobile label must drop the
            arrow. Passing a `cta` again would put the burden of remembering that back on this file. */}
        {/* ⚠️ `landingHref` IS NOT OPTIONAL IN PRACTICE ON A CHILD ROUTE. Without it the nav's logo and
            its Pricing link are bare fragments that resolve against THIS page and silently do nothing —
            see the table in LandingNav.tsx. '/landing' is used rather than '/' because '/' is only the
            landing on a hatchgrab host. */}
        <LandingNav landingHref="/landing" />
      </div>

      <CostComparison />

      <div className={CHROME}>
        <LandingFooter landingHref="/landing" />
      </div>

      {/* Mounted ONCE — all three CTAs above drive this one instance. Same placement as
          app/landing/page.tsx. It portals to document.body, so it is deliberately OUTSIDE `.hg-landing`
          and brings its own tokens via `hg-demo-modal`. */}
      <DemoModal />
    </DemoModalProvider>
  )
}
