// app/not-found.tsx — legal-languages-1 (1 November 2026): THE 404 PAGE, in the page's language. Until now there was none and Next's
// built-in English page ("404 · This page could not be found.") answered in every country. The language is the page's own
// (proxy.ts's page-language header — a country address, a translated legal page, an account page), else the visitor's country's
// (?country, the hg_country cookie, the request's country — lib/visitor-country.ts), else en-GB. Words: `errorPage`.
import Link from 'next/link'
import { headers } from 'next/headers'
import { PAGE_LANG_HEADER } from '@/lib/page-lang'
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE, localeOfCountry, resolveLocale, type AppLocale } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/errorPage'

async function notFoundLocale(): Promise<AppLocale> {
  const tag = (await headers()).get(PAGE_LANG_HEADER)
  if (tag) return resolveLocale(tag)
  try { return localeOfCountry((await resolveVisitorCountry(undefined)).settings) } catch { return DEFAULT_LOCALE }
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
