// app/[country]/(legal)/layout.tsx — legal-languages-1 (1 November 2026): THE CHROME FOR A COUNTRY'S TRANSLATED LEGAL DOCUMENTS
// (/fr/privacy, /de/terms, /jp/country-terms), in the country's language. A country with no translated address never reaches here:
// components/legal/translated-legal.tsx redirects it to the English page first (legalPlace, which also 404s off a HatchGrab host).
// site-chrome-1 (5 November 2026, manual 35.ao-13): ON THE WEB they wear the ONE shared header and footer of every public HatchGrab
// page (components/landing/MarketingFrame.tsx, "split": the documents sit outside `.hg-landing`), for that country, in its language.
// 🔴 INSIDE THE NATIVE APP they keep today's chrome exactly — components/legal/LegalChrome.tsx, the logo-only header and the footer
// pointing at the same country's translations (Dominic, 5 November 2026: App Review 2.1 / 3.1.1). The test is the app's own user-agent
// marker, `HatchGrabNativeApp` (capacitor.config.ts), as proxy.ts and app/(legal)/layout.tsx read it.
import { headers } from 'next/headers'
import { LegalChrome } from '@/components/legal/LegalChrome'
import { MarketingFrame } from '@/components/landing/MarketingFrame'
import { legalPlace, legalChromeLinks, type CountryParams } from '@/components/legal/translated-legal'
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { PageLocale } from '@/lib/i18n/page-locale'
import { pageSeedProps } from '@/lib/i18n/page-words'

export default async function TranslatedLegalLayout({ children, params }: CountryParams & { children: React.ReactNode }) {
  const segment = (await params).country
  const { country, locale } = await legalPlace(segment, null)
  if (((await headers()).get('user-agent') || '').includes('HatchGrabNativeApp')) {
    const { home, ...links } = legalChromeLinks(country, locale)
    return (
      <PageLocale locale={locale} {...pageSeedProps(locale, 'legal')}>
        <LegalChrome homeHref={home} links={links}>{children}</LegalChrome>
      </PageLocale>
    )
  }
  // The country's own page, menu and paths ('/fr', '/fr/features') — the address's country, as on its marketing pages. legalPlace has
  // already refused a country that is switched off or has no translation.
  const visitor = await resolveVisitorCountry(undefined, { segment, page: 'landing' })
  return (
    <MarketingFrame visitor={visitor} variant="split" locale={locale}>
      <main className="bg-slate-50 px-4 py-10">{children}</main>
    </MarketingFrame>
  )
}
