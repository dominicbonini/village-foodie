'use client'
// app/error.tsx — legal-languages-1 (1 November 2026): THE ERROR PAGE (a render that threw), in the page's language — the
// document's <html lang>, which the root layout and the language provider keep to the page's (useDocumentLocale). Until now
// Next's built-in English "Application error" answered everywhere. Words: `errorPage`; nothing shows until a non-English
// language's words have arrived (ensureLanguage), so the page never flashes English first.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isNativeApp } from '@/lib/native/device'
import { ensureLanguage } from '@/lib/i18n/registry'
import { useDocumentLocale, useTIn } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/errorPage'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useDocumentLocale()
  const [ready, setReady] = useState<string | null>(null)
  useEffect(() => { let on = true; void ensureLanguage(locale).then(() => { if (on) setReady(locale) }); return () => { on = false } }, [locale])
  const t = useTIn(locale, 'errorPage')
  // app-fixes-1 (docs/app-fixes-1-report.md §3): inside the dashboard (incl. its kitchen screen) and Manage, the second button
  // goes back to THAT truck's dashboard — /dashboard/<token>, the same token both routes carry — never to the home page. In
  // the app it is never the home page either: /app routes to the device's dashboard (or login). Everywhere else on the web:
  // unchanged. A plain <a>: a full load, so nothing of the broken render survives.
  const pathname = usePathname() || ''
  // Read once on the client. Safe for hydration: nothing renders until the words are ready (`ready`, set in an effect).
  const [native] = useState(() => typeof window !== 'undefined' && isNativeApp())
  const m = pathname.match(/^\/(?:dashboard|manage)\/([^/?#]+)/)
  const dashboardHref = m ? `/dashboard/${m[1]}` : native ? '/app' : null
  if (!t || ready !== locale) return null
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <p className="text-4xl mb-4" aria-hidden="true">😕</p>
        <h1 className="text-lg font-semibold text-slate-900">{t('errorTitle')}</h1>
        <p className="text-sm text-slate-500 mt-2">{dashboardHref ? t('errorBodyDashboard') : t('errorBody')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={reset} className="px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700">{t('retry')}</button>
          {dashboardHref
            ? <a href={dashboardHref} data-error-next="dashboard" className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">{t('backToDashboard')}</a>
            : <Link href="/" className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">{t('home')}</Link>}
        </div>
      </div>
    </main>
  )
}
