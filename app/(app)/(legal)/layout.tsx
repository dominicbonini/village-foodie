// app/(legal)/layout.tsx — THE ONE CHROME FOR EVERY ENGLISH LEGAL PAGE (/privacy, /terms, /country-terms).
// site-chrome-1 (5 November 2026, manual 35.ao-13): ON THE WEB, ON HATCHGRAB, the legal pages wear the ONE shared header and footer of
// every public HatchGrab page (components/landing/MarketingFrame.tsx, its "split" shape: the documents are prose, so they sit OUTSIDE
// `.hg-landing`, whose reset would flatten them). The chrome's words are en-GB, the documents' language; the country (the logo's home,
// the footer's country menu, badges and comparison column) is the visitor's, as the marketing pages decide it.
// 🔴 TWO PLACES KEEP TODAY'S CHROME EXACTLY (components/legal/LegalChrome.tsx — the logo-only header and the four-link footer):
//   • INSIDE THE NATIVE APP (Dominic, 5 November 2026: App Review 2.1 / 3.1.1). The app opens these pages from its account menu, in a
//     web view with no back button; the shared chrome would offer the marketing site, the demo, pricing and the store badges there.
//     The test is the app's own: its web view appends `HatchGrabNativeApp` to the user agent (capacitor.config.ts), which proxy.ts
//     and lib/audit/actor.ts already read. LegalChrome's own logo stays inert in the app (BrandHomeLink).
//   • OFF A HATCHGRAB HOST (Village Foodie serves the same documents): nothing about that host changes.
import { headers } from 'next/headers'
import { LegalChrome } from '@/components/legal/LegalChrome'
import { MarketingFrame } from '@/components/landing/MarketingFrame'
import { routedAddress, resolveVisitorCountry } from '@/lib/visitor-country'
import { isHatchGrabHost } from '@/lib/brand'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const inApp = (h.get('user-agent') || '').includes('HatchGrabNativeApp')
  if (inApp || !isHatchGrabHost(h.get('host') || '')) {
    // The logo's home: the visitor's country page ('/uk', '/us') by the router's own rule; '/landing' off a HatchGrab host.
    return <LegalChrome homeHref={(await routedAddress('landing')) ?? '/landing'}>{children}</LegalChrome>
  }
  return (
    <MarketingFrame visitor={await resolveVisitorCountry()} variant="split" locale={DEFAULT_LOCALE}>
      <main className="bg-slate-50 px-4 py-10">{children}</main>
    </MarketingFrame>
  )
}
