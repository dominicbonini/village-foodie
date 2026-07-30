// AppHeader — used by ALL operator-facing pages (dashboard, manage, and any future pages).
// Background: bg-slate-900. Any new operator page must use this component.
// Tabs bar (if present) must also use bg-slate-900 to match visually.
// Colour token documented in lib/brand.ts → HEADER_BG.
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { HATCHGRAB_WORDMARK_WHITE_SVG } from '@/lib/brand'

interface AppHeaderProps {
  truckName: string | null
  truckLogoUrl: string | null
  subtitle?: string
  children?: React.ReactNode
}

export default function AppHeader({ truckName, truckLogoUrl, subtitle, children }: AppHeaderProps) {
  return (
    <header
      className="bg-slate-900 sticky top-0 z-50 shadow-md"
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
          <Link href="/" className="shrink-0 z-10">
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
          </Link>

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
