// app/(legal)/layout.tsx
// THE ONE CHROME FOR EVERY LEGAL PAGE — header, logo, footer. /privacy and /terms are inside this route
// group, so the URLs are unchanged (`(legal)` is a grouping folder, not a path segment) and NEITHER PAGE
// CAN STYLE ITS OWN HEADER. That is the point of using a layout rather than a shared component: a component
// has to be remembered, a layout cannot be escaped. A third legal page gets identical chrome for free.
//
// ── 🔴 WHY THE LOGO WAS MOVING, AND WHAT FIXED IT ──────────────────────────────────────────────────────
// The old header (components/legal/LegalPage.tsx) had three faults, all of which the operator would read as
// "the logo moves":
//   1. NOT STICKY. It was an ordinary flex child of a `min-h-dvh` page, so the DOCUMENT scrolled and the
//      header — logo included — scrolled off the top. That is the "moves when scrolling" half.
//   2. NO FIXED HEIGHT. `py-4` around a 28px logo gave ~60px, while the landing nav is a fixed
//      `--nav-h: 4.5rem` (72px). Navigating landing → /privacy therefore JUMPED the logo up ~12px.
//   3. 🔴 CENTRED ON A NARROWER COLUMN THAN THE REST OF THE SITE. The logo sat at the left edge of a
//      `max-w-2xl` (672px) container while the landing nav uses `--max: 1140px`. On a wide screen that
//      pushes the logo ~230px further right — which is exactly "the logo sits near the middle of the page".
//      It was positioned relative to the ARTICLE's width, not to the page.
// ✅ Fixed by matching the landing nav's treatment: sticky, top-0, z-50, a fixed 4.5rem height, and the
// SAME 1140px container. The logo is now in one position at one size on every legal page, does not move
// between them, and does not move when scrolling.
//
// ⚠️ DELIBERATELY NOT the landing page's `.hg-landing` CSS. That sheet carries a global
// `.hg-landing * { margin:0; padding:0 }` reset which flattens ordinary prose, and legal copy is nothing
// but prose (§35 records the reset as inert-Tailwind-spacing trap). The TREATMENT is reused; the
// STYLESHEET is not. The two numbers borrowed from it — 4.5rem and 1140px — are noted at their use sites.
import Link from 'next/link'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {/* sticky top-0 z-50 + a FIXED height — the landing nav's treatment (landing.css: `position: sticky;
          top: 0; z-index: 50; height: var(--nav-h)`, --nav-h = 4.5rem). h-18 is not a Tailwind default, so
          the height is given explicitly rather than approximated with padding. */}
      <header className="bg-slate-900 sticky top-0 z-50 shrink-0 border-b border-white/10 h-[4.5rem]">
        {/* max-w-[1140px] = the landing's `--max`. The logo's horizontal position now agrees with every
            other HatchGrab surface instead of being indented to the article's width. */}
        <div className="h-full max-w-[1140px] mx-auto px-5 sm:px-10 flex items-center">
          <Link href="/landing" className="inline-flex hover:opacity-80 transition-opacity" aria-label="HatchGrab home">
            {/* Same call as the landing nav, so the two render at identical size at every breakpoint. */}
            <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-10">{children}</main>

      {/* Each document links the other — item 5 on lib/legal.ts's list. A reader who arrived at one of these
          from a consent line should not have to go back to find the other. */}
      <footer className="shrink-0 border-t border-slate-200 bg-white">
        <div className="max-w-[1140px] mx-auto px-5 sm:px-10 py-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <Link href={PRIVACY_PATH} className="hover:text-slate-800 underline">Privacy</Link>
          <Link href={TERMS_PATH} className="hover:text-slate-800 underline">Terms</Link>
          <Link href="/contact" className="hover:text-slate-800 underline">Contact</Link>
          <span className="text-slate-400">HatchGrab</span>
        </div>
      </footer>
    </div>
  )
}
