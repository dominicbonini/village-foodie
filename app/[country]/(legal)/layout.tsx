// app/[country]/(legal)/layout.tsx — legal-languages-1 (1 November 2026): THE LEGAL CHROME FOR A COUNTRY'S TRANSLATED DOCUMENTS
// (/fr/privacy, /de/terms, /jp/country-terms) — the same components/legal/LegalChrome.tsx as app/(legal)/layout.tsx, in the
// country's language (<PageLocale>, with its words seeded so the first browser render matches the server's), its footer
// pointing at the same country's translations and contact, its logo at the country's page. A country with no translated
// address never reaches here: components/legal/translated-legal.tsx redirects it to the English page first.
import { LegalChrome } from '@/components/legal/LegalChrome'
import { legalPlace, legalChromeLinks, type CountryParams } from '@/components/legal/translated-legal'
import { PageLocale } from '@/lib/i18n/page-locale'
import { pageSeedProps } from '@/lib/i18n/page-words'

export default async function TranslatedLegalLayout({ children, params }: CountryParams & { children: React.ReactNode }) {
  const { country, locale } = await legalPlace((await params).country, null)
  const { home, ...links } = legalChromeLinks(country, locale)
  return (
    <PageLocale locale={locale} {...pageSeedProps(locale, 'legal')}>
      <LegalChrome homeHref={home} links={links}>{children}</LegalChrome>
    </PageLocale>
  )
}
