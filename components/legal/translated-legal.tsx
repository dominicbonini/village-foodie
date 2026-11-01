// components/legal/translated-legal.tsx — legal-languages-1 (1 November 2026, docs/legal-languages-1-report.md §1): THE LEGAL
// DOCUMENTS AT A COUNTRY'S ADDRESS, IN ITS LANGUAGE — /fr/privacy, /de/terms, /jp/country-terms (app/[country]/(legal)/…).
//
// 🔴 WHO GETS WHAT
//   • Not a HatchGrab host, or a segment that is no country's → 404 (as every country address).
//   • A country switched off, or whose language is English (uk, us, ie, au, nz, ca, mt, gi, sg), or a language with no
//     translation file → a redirect to the English page (/privacy …). English is the governing version and its address is
//     the same from every country; nothing here ever serves English at a country address.
//   • Otherwise the translation (lib/legal-documents.ts), in the legal pages' own chrome in that language, with one line at
//     the top saying it is a translation, that the English version applies if they differ, and linking to it.
// The English pages (app/(legal)/…) are untouched by this module.
import 'server-only'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { countryOfSegment, countryPagePath, HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { listCountrySettingsCached } from '@/lib/country-settings'
import { LEGAL_DOC_PATH, legalBaseOf, legalPath, type LegalDoc } from '@/lib/legal'
import { legalDocumentSource } from '@/lib/legal-documents'
import { renderLegalMarkdownHtml } from '@/lib/legal-markdown-html'
import { LegalPage } from '@/components/legal/LegalPage'
import { localeOfCountry, type AppLocale } from '@/lib/i18n/locales'
import { translatorFor } from '@/lib/i18n/translator'
import { siteOpenGraph, siteMetaFor } from '@/lib/site-metadata'
import '@/lib/i18n/catalog/legalChrome'

export type CountryParams = { params: Promise<{ country: string }> }

/** The country and language of a translated legal address — or a 404 / a redirect to the English page (see above). */
export async function legalPlace(segment: string, doc: LegalDoc | null): Promise<{ country: string; locale: AppLocale }> {
  if (!isHatchGrabHost((await headers()).get('host') || '')) notFound()
  const code = countryOfSegment(segment)
  if (!code) notFound()
  const row = (await listCountrySettingsCached().catch(() => [])).find(c => c.countryCode === code)
  const locale = localeOfCountry(row)
  if (!row || !row.enabled || !legalBaseOf(locale)) redirect(doc ? LEGAL_DOC_PATH[doc] : '/privacy')
  return { country: code, locale }
}

const TITLE = { privacy: 'meta.privacyTitle', terms: 'meta.termsTitle', 'country-terms': 'meta.countryTermsTitle' } as const
const DESCRIPTION = { privacy: 'meta.privacyDescription', terms: 'meta.termsDescription', 'country-terms': 'meta.countryTermsDescription' } as const

/** The page's metadata: its title and description in the language; canonical and og:url its own address; hreflang naming
 *  the English (governing) page as well. */
export function legalMetadata(doc: LegalDoc) {
  return async function generateMetadata({ params }: CountryParams): Promise<Metadata> {
    const { country, locale } = await legalPlace((await params).country, doc)
    const t = translatorFor(locale, 'legalChrome')
    const url = HATCHGRAB_ORIGIN + legalPath(doc, { country, locale })
    const site = siteMetaFor((await headers()).get('host') ?? '')
    return {
      title: { absolute: t(TITLE[doc]) },
      description: t(DESCRIPTION[doc]),
      alternates: { canonical: url, languages: { [locale]: url, 'en-GB': HATCHGRAB_ORIGIN + LEGAL_DOC_PATH[doc], 'x-default': HATCHGRAB_ORIGIN + LEGAL_DOC_PATH[doc] } },
      openGraph: { ...siteOpenGraph(site), url, locale: locale.replace('-', '_') },
    }
  }
}

/** The article: the translation note, then the document. (The chrome around it is app/[country]/(legal)/layout.tsx.) */
export function legalPage(doc: LegalDoc) {
  return async function TranslatedLegalPage({ params }: CountryParams) {
    const { country, locale } = await legalPlace((await params).country, doc)
    const src = legalDocumentSource(doc, { country, locale })
    if (!src.translatedInto) redirect(LEGAL_DOC_PATH[doc])
    const t = translatorFor(locale, 'legalChrome')
    return (
      <LegalPage
        html={renderLegalMarkdownHtml(src.md)}
        locale={locale}
        contactHref={`/contact?country=${country}`}
        note={t.rich('translationNote', { link: c => <a href={LEGAL_DOC_PATH[doc]} lang="en-GB" hrefLang="en-GB">{c}</a> })}
      />
    )
  }
}

/** The chrome's links, in the country's language: the three translations, contact, and the logo to the country's page. */
export function legalChromeLinks(country: string, locale: string) {
  return {
    privacy: legalPath('privacy', { country, locale }),
    terms: legalPath('terms', { country, locale }),
    countryTerms: legalPath('country-terms', { country, locale }),
    contact: `/contact?country=${country}`,
    home: countryPagePath(country, 'landing') ?? '/',
  }
}
