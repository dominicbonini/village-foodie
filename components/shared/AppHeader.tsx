// AppHeader — used by ALL operator-facing pages (dashboard, manage, and any future pages).
// Background: bg-slate-900. Any new operator page must use this component.
// Tabs bar (if present) must also use bg-slate-900 to match visually.
// Colour token documented in lib/brand.ts → HEADER_BG.
'use client'

import Image from 'next/image'
import { HATCHGRAB_WORDMARK_WHITE_SVG } from '@/lib/brand'
import { BrandHomeLink } from '@/components/shared/BrandHomeLink'

interface AppHeaderProps {
  truckName: string | null
  truckLogoUrl: string | null
  subtitle?: string
  children?: React.ReactNode
  /** ── STICKY: NEEDED ON NATURAL-FLOW PAGES, INERT INSIDE AN APP-SHELL (V11.3) ───────────────────────
   *  🔴 DEFAULTS TO TRUE so nothing changes by omission — /admin needs it and passes nothing, and any
   *  future page gets the historical behaviour unless it opts out.
   *
   *  Pass `sticky={false}` from an h-dvh app-shell, where the header is a `shrink-0` flex child of an
   *  `overflow-hidden` root. There, `position: sticky` can NEVER apply an offset: its scrollport is that
   *  root, and the root never scrolls — only <main> does, and <main> is a SIBLING, not an ancestor. So
   *  sticky is doing no positioning work on those pages.
   *  ⚠️ IT IS NOT THEREFORE FREE. `position: sticky` is a compositing hint: WebKit promotes a sticky
   *  element to its own layer so it can be repositioned on the scrolling thread, and it does so whether
   *  or not the element ever actually moves. `position: relative` carries no such hint. Public WKWebView
   *  reports implicate sticky/fixed in disappearing-header and blank-region defects that do not occur in
   *  iOS Safari on the same page — which matches our symptom. Removing a hint we get no benefit from is
   *  the cheapest thing to try. See docs/native-shell-report.md.
   *
   *  🔴 `relative`, NOT nothing. `z-index` is IGNORED on a static element, so dropping position entirely
   *  would silently disable `z-50` and change the paint order against the tab bar and the shadow.
   *  `relative` keeps the element positioned, keeps z-50 effective, and keeps the stacking context —
   *  identical rendering, minus the compositing hint. */
  sticky?: boolean
}

export default function AppHeader({ truckName, truckLogoUrl, subtitle, children, sticky = true }: AppHeaderProps) {
  return (
    <header
      className={`bg-slate-900 ${sticky ? 'sticky top-0' : 'relative'} z-50 shadow-md`}
      /* Native app: extend the dark header UP into the status-bar/safe-area inset so no page content shows
         above it. env(safe-area-inset-top) is 0 in a normal browser → web is byte-for-byte unchanged. Pairs
         with capacitor contentInset:'never' + viewport-fit=cover, which let CSS own the safe area. */
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >{/* HEADER_BG — change here changes all operator headers */}
      <div className="px-4 py-3">
        <div className={"w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex items-center justify-between relative"}>

          {/* ── Left: HatchGrab wordmark (V9.7) ──────────────────────────────────────────────────────
              🔴 UNCONDITIONAL — NO HOST DETECTION HERE, DELIBERATELY. All three renderers of AppHeader
              (admin, dashboard, manage) are OPERATOR surfaces, i.e. HatchGrab. There is no Village Foodie
              consumer, so a host check would branch on something that never varies. It was considered and
              declined: AppHeader is a client component and none of its renderers is a server component,
              so `host` could only have arrived via a page restructure, a context provider or middleware —
              all of them cost more than the branch is worth. Do not add one.
              ⚠️ WHITE variant because the bar is bg-slate-900 (#0f172a). The plain wordmark carries NAVY
              "HATCH" (#16314F) and would be near-invisible on it.
              ⚠️ Plain <img>, NOT next/image: the source is an SVG and next/image would require
              `dangerouslyAllowSVG` in next.config — deliberately not enabled.
              ⚠️ WIDTH IS THE DRIVEN DIMENSION (see the classes below); height follows from the 4.548:1
              artwork. The centre block's reservation must track it — that pairing is the fragile part.
              ⚠️ opacity-70 REMOVED: it dulled a SECONDARY brand mark. This is now the primary one. */}
          {/* ── 🔴 NON-NAVIGATING INSIDE THE NATIVE SHELL (2.1 completeness, 14 August 2026) ─────────
              `href="/"` is the Village Foodie DISCOVERY MAP (app/page.tsx), not a HatchGrab home page.
              In a browser that is a reasonable brand link. In the app it threw an operator out of their
              dashboard onto a consumer marketing surface **with no back button and no way home** — the
              shell has no browser chrome. This header renders on all three operator surfaces, so the
              trap was one tap away at all times.
              🔴 DISPLAY-ONLY. The wrapper changes; the <img>, its classes, its size and its position do
              not. Nothing an operator can DO changes on either platform.
              ⚠️ NOT repointed at /app. That is the cold-launch route and it is unverified; a link that
              lands somewhere unproven is not an improvement on a link that lands somewhere wrong.
              ── 🔴 THE BRANCH NOW LIVES IN components/shared/BrandHomeLink.tsx, NOT HERE ─────────────
              This file used to evaluate isNativeApp() inline, which was safe because all three
              renderers gate AppHeader behind a loading early-return starting `true` (dashboard :265,
              manage :200, admin :203) — so it appeared in no server output and on no first client
              frame. That reasoning was correct and is now UNNECESSARY: BrandHomeLink carries a
              `mounted` two-pass, which is safe with or without an early-return in front of it.
              ⚠️ WEB IS BYTE-IDENTICAL either way — the component renders exactly this <Link href="/"
              className="shrink-0 z-10"> in every browser, and on the pre-mount pass everywhere.
              `kind="branding"` means the app renders the same <img> in a non-navigating span with the
              same classes: identity, not a control. See manual section 27's 2.1 decision rule.
              ⚠️ isNativeApp, NOT purchaseCtaAllowed. That is the 3.1.1 COMMERCE predicate; this is a
              2.1 completeness question. Manual section 40 keeps them separate deliberately — do not merge them. */}
          <BrandHomeLink href="/" kind="branding" className="shrink-0 z-10">
            {/* ⚠️ SIZE IS DRIVEN BY THE CLASSES, NOT THE ATTRIBUTES. width/height below are the 4.548:1
                aspect reservation only (they stop the box collapsing before the SVG loads); w-[112px]
                md:w-[140px] + h-auto set the actual rendered size → ~25px tall mobile, ~31px from md up
                (post-crop 4.548:1; the attributes are 140 × 31 to match the md width exactly).
                ⚠️ 140 (not 168) from md up is deliberate: at 168 the logo was ~42px and OVERTOOK the 36px
                truck avatar, making the whole header bar 6px taller. At 140 it is ~31px — comfortably under
                the avatar — so the avatar governs the bar height again.
                🔴 PAIRED WITH the centre block's px-[112px] md:px-[140px] reservation below — SAME
                breakpoints. Change one and the centred truck name goes off-centre. */}
            <img
              src={HATCHGRAB_WORDMARK_WHITE_SVG}
              alt="HatchGrab"
              width={140}
              height={31}
              className="object-contain w-[112px] md:w-[140px] h-auto"
            />
          </BrandHomeLink>

          {/* Centre: truck logo + name + subtitle — absolutely positioned. The inner row reserves
              horizontal space (matching the wordmark's width) for the left logo + right slot
              so the centre can't expand over them, and the name is width-bounded + truncated (below)
              — mirrors the customer order-page header so a scaling/long name can never overlap. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* 🔴 RESERVATION MUST TRACK THE LOGO WIDTH ABOVE, AT THE SAME BREAKPOINTS (112 / md:140).
                It reserves horizontal space so the absolutely-centred truck name cannot expand over the
                left logo or the right slot. If the logo grows and this does not, the name is pushed
                off-centre. sm:px-0 is unchanged — from sm up the name is width-bounded by max-w-xs
                instead, so the reservation is not needed there. */}
            <div className="flex items-center justify-center gap-2 px-[112px] md:px-[140px] sm:px-0 w-full">
              {truckLogoUrl && (
                <img
                  src={truckLogoUrl}
                  alt={truckName || ''}
                  className="w-9 h-9 rounded-full object-cover bg-white shadow-sm shrink-0"
                />
              )}
              <div className="min-w-0 max-w-[110px] sm:max-w-xs">
                {/* text-sm (rem) still scales for accessibility; max-w + truncate bound the WIDTH so a
                    larger font grows the text size but truncates with ellipsis — never overlaps. */}
                <p className="font-black text-sm text-white leading-none truncate">{truckName}</p>
                {subtitle && (
                  <p className="text-slate-400 text-[11px] mt-0.5 truncate">{subtitle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: passed as children */}
          <div className="flex items-center gap-2 z-10">
            {children}
          </div>

        </div>
      </div>
    </header>
  )
}
