// app/(public)/[country]/not-found.tsx — cwv-2 (6 November 2026, docs/cwv-2-report.md §4): THE COUNTRY PAGES' 404 — today's card
// (app/(app)/not-found.tsx: the same markup, classes and words), in the language of the address's country.
// 🔴 WHY NOT A RE-EXPORT OF THE APP'S: Next renders a segment's not-found component on EVERY render of the segment (it travels in the
// page's data, ready for a notFound()), and the app's reads the request's headers for its language — which alone made every country
// page per-request. This one reads only the address's country (`next/root-params`: this group's root layout is [country]) and that
// country's locale from the tagged data cache: exactly the value proxy.ts puts in x-hg-page-lang, which the app's card reads.
// It is reached only for a real country (a FAQ page with nothing to show). An address whose segment is no country (/zz, /wp-admin), and any
// country address off a HatchGrab host, get the app's own 404 from proxy.ts (app/global-not-found.tsx) — worded and branded as before.
import Link from 'next/link'
import { country } from 'next/root-params'
import { marketingCountryList } from '@/lib/marketing-cache'
import { countryOfSegment } from '@/lib/marketing-country'
import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/errorPage'

async function notFoundLocale(): Promise<AppLocale> {
  const code = countryOfSegment(String((await country()) ?? ''))
  if (!code) return DEFAULT_LOCALE   // never reached: proxy.ts answers an address that is no country (lib/top-level-routes.ts)
  const row = (await marketingCountryList().catch(() => [])).find(c => c.countryCode === code)
  return row?.locale ? resolveLocale(row.locale) : DEFAULT_LOCALE
}

export default async function NotFound() {
  const t = translatorFor(await notFoundLocale(), 'errorPage')
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <p className="text-4xl mb-4" aria-hidden="true">🔍</p>
        <h1 className="text-lg font-semibold text-slate-900">{t('notFoundTitle')}</h1>
        <p className="text-sm text-slate-500 mt-2">{t('notFoundBody')}</p>
        <Link href="/" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700">{t('home')}</Link>
      </div>
    </main>
  )
}
