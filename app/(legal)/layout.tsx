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
// ── 🔴 THIS LAYOUT IS NOW A CLIENT COMPONENT, AND THAT IS A DELIBERATE CHANGE (14 August 2026) ─────
// It was a server component. The logo below must not navigate inside the native shell (see its own note),
// and that decision can only be made in the browser — `Capacitor.isNativePlatform()` has no server answer.
// ⚠️ THE DOCUMENTS THEMSELVES ARE STILL SERVER-RENDERED. /privacy and /terms remain server components
// doing `fs.readFileSync` at build time; they arrive here as `children`, which a client layout renders
// without forcing them client-side. Only this chrome moved. The legal TEXT is unaffected.
// ⚠️ Every import here is client-safe: next/link, a presentational wordmark, and two string constants.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'
import { isNativeApp } from '@/lib/native/device'
import { BrandHomeLink } from '@/components/shared/BrandHomeLink'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  // 🔴 A `mounted` TWO-PASS IS REQUIRED HERE AND WAS NOT REQUIRED IN AppHeader — the difference is real,
  // not caution. AppHeader sits behind a loading early-return on all three of its renderers, so it never
  // appears in server output at all and can evaluate the predicate directly (§40's property). THIS layout
  // has no such gate: it IS the first paint of /privacy and /terms. Evaluating isNativeApp() inline would
  // render <Link> on the server and <span> on the client's first frame inside the app — a hydration
  // mismatch on the one page an App Review is guaranteed to open.
  // ⚠️ §40 rejects a `mounted` flag for the manage page's commerce gates because there it would flash
  // MISSING upgrade buttons on the web. Here the two branches are VISUALLY IDENTICAL — same wordmark,
  // same classes, same size — and differ only in whether a tap navigates. So the two-pass costs nothing
  // a user can see, which is exactly why it is acceptable here and was not there.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const inApp = mounted && isNativeApp()

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {/* sticky top-0 z-50 + a FIXED height — the landing nav's treatment (landing.css: `position: sticky;
          top: 0; z-index: 50; height: var(--nav-h)`, --nav-h = 4.5rem). h-18 is not a Tailwind default, so
          the height is given explicitly rather than approximated with padding. */}
      <header className="bg-slate-900 sticky top-0 z-50 shrink-0 border-b border-white/10 h-[4.5rem]">
        {/* max-w-[1140px] = the landing's `--max`. The logo's horizontal position now agrees with every
            other HatchGrab surface instead of being indented to the article's width. */}
        <div className="h-full max-w-[1140px] mx-auto px-5 sm:px-10 flex items-center">
          {/* ── 🔴 NON-NAVIGATING INSIDE THE NATIVE SHELL (2.1 completeness, 14 August 2026) ───────────
              These are the App-Store-required in-app legal pages, so this is the ONE page a reviewer is
              guaranteed to open — and `/landing` is the MARKETING page, which carries four "Coming soon"
              strings. Inside the shell this link was the shortest route from a compliance surface to the
              product's own roadmap copy, with no back button to return from.
              🔴 DISPLAY-ONLY. Same wordmark, same `variant="dark"`, same classes, same size. Nothing an
              operator or a customer can DO changes on either platform.
              ── 🔴 THE BRANCH NOW LIVES IN components/shared/BrandHomeLink.tsx, NOT HERE ─────────────
              The `mounted` two-pass this file pioneered moved INTO that component, so both branches are
              declared here as intent (`kind="branding"`) rather than re-implemented. `nativeClassName`
              and `nativeAriaLabel` reproduce this call site's existing in-app markup exactly: the app
              renders `<span class="inline-flex" aria-label="HatchGrab">`, dropping the hover/transition
              utilities that only mean anything to a pointer, and dropping the word "home" from a label
              that no longer describes navigation.
              ⚠️ WEB IS BYTE-IDENTICAL: the component renders exactly this
              `<Link href="/landing" class="inline-flex hover:opacity-80 transition-opacity"
              aria-label="HatchGrab home">` in every browser and on the pre-mount pass everywhere. */}
          <BrandHomeLink
            href="/landing"
            kind="branding"
            className="inline-flex hover:opacity-80 transition-opacity"
            nativeClassName="inline-flex"
            ariaLabel="HatchGrab home"
            nativeAriaLabel="HatchGrab"
          >
            {/* Same call as the landing nav, so the two render at identical size at every breakpoint. */}
            <HatchGrabWordmark variant="dark" className="h-8 w-auto sm:w-[168px] sm:h-auto" />
          </BrandHomeLink>
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
