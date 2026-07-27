// components/legal/LegalPage.tsx
// Shared shell for /terms and /privacy.
//
// EXTRACTED IMMEDIATELY rather than after the second copy diverges — these two pages are structurally
// identical (header, one prose column, last-updated, back link) and will be edited by whoever writes the
// real content, who should not have to make the same edit twice. Same reasoning as DemoModeBanner, which
// was three drifted copies before it was one component.
//
// Deliberately NOT the landing page's `.hg-landing` CSS system: that sheet includes a global
// `* { margin:0; padding:0 }` reset which flattens ordinary prose, and legal copy is nothing but prose.
// Plain Tailwind, app palette.

import Link from 'next/link'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'

export function LegalPage({ title, updated, children }: {
  title: string
  /** Human-readable date, e.g. "23 July 2026". Shown so a reader can tell how current this is. */
  updated: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-dvh bg-slate-50 flex flex-col">
      <header className="bg-slate-900 px-4 py-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <Link href="/landing" className="inline-block hover:opacity-80 transition-opacity">
            <HatchGrabWordmark variant="dark" />
          </Link>
        </div>
      </header>

      <div className="flex-1 px-4 py-10">
        <article className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 px-6 py-8 sm:px-10 sm:py-10">
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-xs text-slate-400 mt-1 mb-6">Last updated {updated}</p>
          {/* `space-y` rather than a prose plugin — the project has no typography plugin and this needs to
              stay readable when someone pastes real legal copy in without reading this file. */}
          <div className="space-y-4 text-sm text-slate-600 leading-relaxed [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:pt-4 [&_strong]:text-slate-900 [&_a]:text-orange-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2">
            {children}
          </div>
        </article>

        <p className="max-w-2xl mx-auto text-center text-xs text-slate-400 mt-6">
          Questions? <Link href="/contact" className="text-orange-600 underline">Get in touch</Link> — we&apos;re real people.
        </p>
      </div>
    </main>
  )
}
