'use client'

import Link from 'next/link'
import Image from 'next/image'

interface AppHeaderProps {
  truckName: string | null
  truckLogoUrl: string | null
  subtitle?: string
  children?: React.ReactNode
}

export default function AppHeader({ truckName, truckLogoUrl, subtitle, children }: AppHeaderProps) {
  return (
    <header className="bg-slate-900 sticky top-0 z-50 shadow-md">
      <div className="px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between relative">

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

          {/* Centre: truck logo + name + subtitle — absolutely positioned */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2">
              {truckLogoUrl && (
                <img
                  src={truckLogoUrl}
                  alt={truckName || ''}
                  className="w-9 h-9 rounded-full object-cover bg-white shadow-sm shrink-0"
                />
              )}
              <div>
                <p className="font-black text-sm text-white leading-none">{truckName}</p>
                {subtitle && (
                  <p className="text-slate-400 text-[11px] mt-0.5">{subtitle}</p>
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
