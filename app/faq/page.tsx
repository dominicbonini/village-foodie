// app/faq/page.tsx — 🔴 THE FAQ PAGE: /<country>/faq (faq-4, 2 November 2026; docs/faq-4-report.md). Served at its country address
// through app/[country]/faq/page.tsx (the same module, not a copy — as /features); /faq itself is the router (proxy.ts → the visitor's
// country's /faq, exactly as /features).
//
// WHAT IT SHOWS: the published questions, in the page's language, by lib/faq/public.ts faqPage — the rules faq-3 and faq-2 set: a
// non-English page shows only up-to-date translations; show_in and the check leave questions out; an empty section is left out.
// 🔴 NOTHING TO SHOW → 404, and the country is left out of the sitemap, the FAQ pages' hreflang and the footer's FAQ link (they all
// read faqCountries / faqHrefFor from the same module, so they can never disagree with this page).
// SEARCH AND AI: self-canonical; hreflang only between /faq pages that have content (+ x-default → /faq); the FAQPage JSON-LD on
// this page only, "<canonical>#faq", every question and answer the visible text exactly (lib/structured-data.ts faqPageLd, the
// builder the comparison pages use). The frame is /features' own (components/landing/MarketingFrame.tsx); the question list is the
// shared <FaqDetails> (components/faq/FaqDetails.tsx) in the faq-3 look (./faq.css).
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { MarketingFrame } from '@/components/landing/MarketingFrame'
import { FaqDetails } from '@/components/faq/FaqDetails'
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { marketingCountry, countryPageAlternates } from '@/lib/marketing-meta'
import { HATCHGRAB_ORIGIN, ROUTER_PATH } from '@/lib/marketing-country'
import { organizationLd, websiteLd, faqPageLd } from '@/lib/structured-data'
import { faqPage, faqCountries } from '@/lib/faq/public'
import { aboutPhotoUrl } from '@/lib/about-server'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/landing'
import '../landing/landing.css'
import './faq.css'

export const dynamic = 'force-dynamic'

async function onHatchGrab(): Promise<boolean> {
  return isHatchGrabHost((await headers()).get('host') || '')
}

type Props = { params?: Promise<{ country?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** The page's country, its FAQ (null → 404) and its canonical / hreflang among the FAQ pages that have content. */
async function load({ params, searchParams }: Props) {
  if (!(await onHatchGrab())) notFound()
  const visitor = await resolveVisitorCountry((await searchParams)?.country, { segment: (await params)?.country, page: 'faq' })
  const data = await faqPage(visitor.settings)
  if (!data) notFound()
  const withContent = (await faqCountries()).map(c => ({ code: c.code, locale: c.locale }))
  const at = visitor.countryPage ? countryPageAlternates('faq', visitor.settings.countryCode, withContent) : null
  return { visitor, data, at, canonical: at ? at.canonical : HATCHGRAB_ORIGIN + ROUTER_PATH.faq }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { visitor, at, canonical } = await load(props)
  const t = translatorFor(visitor.settings.locale, 'landing')
  const title = t('faq.metaTitle'), description = t('faq.metaDescription')
  return {
    title: { absolute: title },
    description,
    robots: { index: true, follow: true },
    alternates: at ? { canonical: at.canonical, languages: at.languages } : { canonical },
    openGraph: {
      type: 'website', siteName: 'HatchGrab', url: canonical, title, description,
      images: [{ url: 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png', width: 1200, height: 630, alt: 'HatchGrab' }],
      locale: marketingCountry(visitor.settings).ogLocale,
    },
    twitter: { card: 'summary_large_image', title, description, images: ['https://www.hatchgrab.com/logos/hatchgrab-share-card.png'] },
  }
}

export default async function FaqPage(props: Props) {
  const { visitor, data, canonical } = await load(props)
  const settings = visitor.settings
  const t = translatorFor(settings.locale, 'landing')
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [organizationLd(settings.countryCode, aboutPhotoUrl()), websiteLd(), faqPageLd(`${canonical}#faq`, data.sections.flatMap(s => s.items))],
  }
  return (
    <MarketingFrame visitor={visitor}>
      <section className="band features-page">
        <div className="wrap">
          <h1>{t('faq.title')}</h1>
          <div className="faq">
            {data.sections.map(sec => (
              <div key={sec.title} className="faq-group">
                <p className="faq-label">{sec.title}</p>
                <FaqDetails items={sec.items} className="faq-q" />
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* The FAQPage, the visible questions and answers exactly (no rating, no review: 35.ak-7). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
    </MarketingFrame>
  )
}
