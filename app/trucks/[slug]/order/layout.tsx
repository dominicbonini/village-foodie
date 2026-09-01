// app/trucks/[slug]/order/layout.tsx
//
// ── 🔴 THIS LAYOUT NO LONGER REDIRECTS ANYWHERE. THAT IS THE POINT OF IT. ──────────────────────────
//
// It used to resolve the truck's custom domain and 307 to it, which made the printed QR code dynamic.
// The cost was a cycle with no error state: the schedule page served at the operator's domain has an
// Order button targeting THIS path, so a customer who scanned, landed on their domain and tapped Order
// was redirected straight back to the page they were already on. Each hop was a valid 307 followed by
// a 200, and the return leg was a user CLICK rather than a redirect — so no browser raised
// ERR_TOO_MANY_REDIRECTS, no error was logged, and nothing reached monitoring.
//
// 🔴 IT ARMED ONLY WHEN SETUP SUCCEEDED. All five conditions had to hold — including
// `custom_domain_confirmed_at`, an operator saying "I looked at my page and it is right" — so ordering
// broke at the precise moment a domain was finished correctly.
//
// ⚠️ THE DEFECT WAS NEVER THE REDIRECT ITSELF. It was that ONE address both decided a destination and
// served the ordering page, so it could not tell an inbound scan from a customer coming back to buy.
// The decision moved to its own address, `/o/<slug>` (app/o/[slug]/page.tsx), which only ever decides.
// The five conditions moved with it VERBATIM into lib/custom-domain/redirect-target.ts.
//
// ✅ SO EVERY ARRIVAL HERE NOW REACHES THE ORDERING PAGE — the QR, the Order button on a custom domain,
// the discovery feed, five messaging links, the five back-links inside the page, the admin convenience
// links, and the post-payment `?confirm=` return that would otherwise never show a customer the receipt
// for a payment they had already made. See docs/qr-redirect-split-report.md.
//
// 🔴 DO NOT PUT A REDIRECT BACK IN THIS FILE. A layout cannot read `searchParams` — Next 16's generated
// `LayoutProps` declares only `params` and `children`, enforced by .next/types/validator.ts — so it
// cannot distinguish arrivals by query string, and layouts do not re-render on client navigation
// within their segment, so anything it did read would be stale. Both facts are why the decision is on
// a separate route rather than conditional here. docs/qr-redirect-fix-report.md.
//
// ⚠️ `force-dynamic` IS KEPT DELIBERATELY THOUGH NO SERVER WORK REMAINS. Removing it would let this
// segment be statically prerendered, which is a rendering-mode change this workstream has no way to
// verify under a deploy freeze. It costs a prerender, not a request.
export const dynamic = 'force-dynamic'

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
