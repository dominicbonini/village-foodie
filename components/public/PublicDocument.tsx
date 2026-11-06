// components/public/PublicDocument.tsx — cwv-2 (6 November 2026, docs/cwv-2-report.md §3): THE <html> AND <body> OF EVERY PUBLIC HATCHGRAB
// PAGE (the two public root layouts: app/(public)/[country]/layout.tsx and app/(public)/(site)/layout.tsx).
// 🔴 IT CARRIES ONLY WHAT A PUBLIC PAGE NEEDS (manual 35.ap-1). The same <html lang>, dir and data-brand as the app's root layout, and on
// <body> `antialiased` plus the page language's script-font class. NOT: Geist (no public page draws a glyph in it), the Supabase session
// banner, PostHog at load (components/public/PublicAnalytics.tsx starts it after idle), leaflet's CSS, or any other language's font rules.
// The page's own chrome — fonts, landing.css, header and footer — is components/landing/MarketingFrame.tsx, unchanged.
import '@/app/(public)/public.css'
import { scriptKeyOf, scriptClassOf, isRtlLang } from '@/lib/public-script'
import { ScriptFont } from '@/components/public/ScriptFont'
import { PublicAnalytics } from '@/components/public/PublicAnalytics'

export function PublicDocument({ lang, brand, children }: { lang: string; brand: 'hatchgrab' | 'villagefoodie'; children: React.ReactNode }) {
  const script = scriptKeyOf(lang)
  return (
    <html lang={lang} data-brand={brand} {...(isRtlLang(lang) ? { dir: 'rtl' } : {})}>
      <body className={`antialiased${script ? ` ${scriptClassOf(script)}` : ''}`}>
        {script && <ScriptFont script={script} />}
        {children}
        <PublicAnalytics />
      </body>
    </html>
  )
}
