// SERVER-SIDE gate for the landing. In PRODUCTION this route is ADMIN-ONLY.
//
// ── 🔴 WHY IT IS GATED. READ THIS BEFORE REMOVING IT. ───────────────────────────────────────────────
// Two things must be true before this gate comes off, and neither is about code:
//   1. 🔴 THE PIZZERIA GUSTO TESTIMONIAL IS NOT CLEARED FOR PUBLICATION. The landing quotes a named
//      real trading customer, with their logo. Permission has not been given. Publishing it would be
//      using a customer's words and brand without consent — the one failure here that is not fixable
//      by a redeploy.
//   2. The screenshot frames are still PLACEHOLDERS — three dashed `.shot` divs reading "Screenshot",
//      with a comment in page.tsx addressed to Dominic asking for real images.
// ⚠️ SO THE TEST IS NOT "is the page finished". It is "do we have written permission for the
// testimonial, and are the screenshots real". Remove the gate when BOTH are yes, and restore
// `robots: { index: true, follow: true }` in page.tsx in the same commit.
//
// ── 🔴 THE DESTINATION IS /contact, AND IT MUST NOT BECOME '/' ─────────────────────────────────────
// An older version redirected to '/', and its own comment justified that: "`/` — which is NOT
// gated ... so there is no redirect loop." THAT PREMISE IS FALSE ON hatchgrab.com. proxy.ts rewrites
// '/' to this route on that host, so redirecting a non-admin to '/' sends them straight back here,
// which redirects to '/' again: an infinite loop, on the domain submitted to Apple as the Marketing
// URL. Simulated and confirmed — see docs/landing-root-gated.md.
// ⚠️ THE DESTINATION WAS /support UNTIL 20 AUGUST 2026, when that route was deleted. /support was a
// HatchGrab-branded DUPLICATE of /contact — same Tally form, same id — built days earlier because
// /contact rendered Village Foodie chrome on every host. It no longer does: /contact now branches on
// the Host header (app/contact/page.tsx) and serves the HatchGrab chrome here, so the duplicate had
// nothing left to justify it. 🔴 THE REDIRECT AND THE DELETION SHIPPED IN THE SAME CHANGE — pointing
// this at a route that no longer exists would 404 every non-admin on hatchgrab.com's root.
// ⚠️ /contact IS SAFE FOR THE SAME REASON /support WAS: it is PUBLIC, UNGATED, INDEXABLE, and it is
// NOT matched by the root rewrite in proxy.ts (guarded on `pathname === '/'`), so it cannot loop. It
// is also the Support URL given to App Store review, so a reviewer who loads hatchgrab.com while the
// landing is embargoed lands exactly where the store listing already points them.
// ⚠️ IT IS ONE LINE TO CHANGE. /login is the obvious alternative if you would rather the root read as
// an operator product; the discovery map is NOT available without either a new route for it or an
// admin check inside the proxy, which would put a database read on every request to the root.
//
// Uses the app's canonical admin check (operators.is_admin) via lib/auth/admin — the same gate the
// admin panel/API use — not a new one. force-dynamic + reading cookies means this evaluates
// per-request. Dev is intentionally left open so local iteration isn't blocked.

export const dynamic = 'force-dynamic'

// 🔴 THE GATE WAS REMOVED ON 3 SEPTEMBER 2026 — THE PAGE IS PUBLIC.
// It read:
//     if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) redirect('/contact')
// 🟢 BOTH CONDITIONS THE GATE NAMED ARE MET, which is why it went and not before: the Pizzeria Gusto
// testimonial has WRITTEN PERMISSION, and the hero screenshots are REAL captures, not placeholders.
// ⚠️ WHAT THIS ALSO PUBLISHED, because it is not obvious from this file: proxy.ts rewrites '/' to this
// route on a hatchgrab host, so removing this makes hatchgrab.com's ROOT public in the same change —
// not just /landing. And the page renders REAL PRICES: it does not use the price mask, so £29/£49 are
// visible to anyone regardless of NEXT_PUBLIC_PRICING_PUBLISHED.
// 🔴 IF THIS EVER NEEDS TO GO BACK, RESTORE THE TWO LINES ABOVE — do not add a client-side check.
// verifyAdmin reads cookies() and cannot run in a client module, and a client gate would ship the whole
// page to the browser before hiding it.
export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
