// AppHeader — used by ALL operator-facing pages (dashboard, manage, and any future pages).
// Background: bg-slate-900. Any new operator page must use this component.
// Tabs bar (if present) must also use bg-slate-900 to match visually.
// Colour token documented in lib/brand.ts → HEADER_BG.
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { isNativeApp } from '@/lib/native/device'   // native app = full-bleed; web keeps centered max-w

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
        <div className={`${isNativeApp()?'w-full':'max-w-5xl mx-auto'} flex items-center justify-between relative`}>

          {/* Left: Village Foodie logo */}
          <Link href="/" className="shrink-0 z-10">
            <Image
              src="/logos/village-foodie-logo-v2.png"
              alt="Village Foodie"
              width={90}
              height={27}
              className="object-contain opacity-70"
            />
          </Link>

          {/* Centre: truck logo + name + subtitle — absolutely positioned. The inner row reserves
              horizontal space (px-[90px] mobile, cleared at sm:) for the left VF logo + right slot
              so the centre can't expand over them, and the name is width-bounded + truncated (below)
              — mirrors the customer order-page header so a scaling/long name can never overlap. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center justify-center gap-2 px-[90px] sm:px-0 w-full">
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
