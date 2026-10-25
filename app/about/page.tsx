// app/about/page.tsx — WHO RUNS HATCHGRAB (about-page, 22 October 2026; docs/about-page-report.md; the approved mockup
// "about-mockup-2").
//
// One page in the landing's style: a centred column — eyebrow, h1, the founder's story, his signature, then the company's
// Companies House line and a link to /contact. Every word is the `aboutPage` messages; the company facts are lib/company.ts.
// ⛔ NO PRICES, NO COUNTRY LIST AND NO VILLAGE FOODIE LINK (the story names Village Foodie in plain text).
//
// ── 🔴 ONE ADDRESS, /about, AND NO HREFLANG ──────────────────────────────────────────────────────────────────────────────
// The story is the same for every country, so a page per country segment (/uk/about, /us/about…) would be five copies of
// one text — duplicates to canonicalise for nothing. /about is self-canonical, like /contact. It still FEELS LOCAL: the nav,
// the footer and the country menu follow the visitor's country (lib/visitor-country.ts — ?country, the cookie, the request's
// country, else GB), exactly as on /contact and the bare /features, and the words follow that country's locale.
//
// ── 🔴 HATCHGRAB HOST ONLY ───────────────────────────────────────────────────────────────────────────────────────────────
// The same gate as /features: on Village Foodie this route is a 404 (notFound(), not a redirect), as it was before.
//
// ── 🔴 THE PHOTO ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// public/about/dominic.jpg when the file exists (lib/about-server.ts); otherwise NOTHING is rendered — no box, no alt text —
// and the story takes the full width. A plain <img>: one small local file, and next/image would need its dimensions.
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
// compare-de-1: the footer's "Vergleich" column for the country's own comparison page (live, or admins only).
import { comparisonFooter } from '@/lib/comparison-server'
import { DemoModalProvider, DemoModal } from '@/components/landing/DemoUpload'   // client children — the chrome's CTA
import { PageLocale } from '@/lib/i18n/page-locale'
// languages-1: a non-English page hands its browser the words its client components read (none for English).
import { pageSeedProps } from '@/lib/i18n/page-words'
import { localeOfCountry } from '@/lib/i18n/locales'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/aboutPage'
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { ownUrlMetadata } from '@/lib/site-metadata'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { COMPANY } from '@/lib/company'
import { ABOUT_PATH, ABOUT_PHOTO_PATH } from '@/lib/about'
import { aboutPhotoExists, aboutPhotoUrl } from '@/lib/about-server'
import { aboutGraph } from '@/lib/structured-data'
import { contactHref } from '@/lib/contact-topics'
import '../landing/landing.css'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The one place this route asks which brand it is serving. Same shape as app/features/page.tsx. */
async function onHatchGrab(): Promise<boolean> {
  return isHatchGrabHost((await headers()).get('host') || '')
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  if (!(await onHatchGrab())) {
    notFound()
  }
  const visitor = await resolveVisitorCountry((await searchParams)?.country)
  const t = translatorFor(visitor.settings.locale, 'aboutPage')
  const own = await ownUrlMetadata(ABOUT_PATH)
  // `absolute`: app/layout.tsx's title template would otherwise add the brand a second time.
  return {
    title: { absolute: t('meta.title') },
    description: t('meta.description'),
    robots: { index: true, follow: true },
    alternates: own.alternates,
    openGraph: { ...own.openGraph, title: t('meta.title'), description: t('meta.description') },
  }
}

// Declared here as on /features: landing.css reads the three font variables these classes set.
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap', preload: false })
const CHROME = `hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`

export default async function AboutPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await onHatchGrab())) {
    notFound()
  }
  const visitor = await resolveVisitorCountry((await searchParams)?.country)
  const settings = visitor.settings
  const t = translatorFor(settings.locale, 'aboutPage')
  const name = COMPANY.founder.name
  const photo = aboutPhotoExists()
  const graph = aboutGraph({
    countryCode: settings.countryCode,
    pageUrl: HATCHGRAB_ORIGIN + ABOUT_PATH,
    name: t('meta.title'),
    description: t('meta.description'),
    inLanguage: settings.locale,
    founderImage: aboutPhotoUrl(),
  })

  return (
    <PageLocale locale={localeOfCountry(settings)} {...pageSeedProps(settings.locale, 'marketing')}>
    <DemoModalProvider>
      <div className={CHROME}>
        <LandingNav landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} locale={settings.locale} />

        <section className="about-page">
          <div className="wrap">
            <div className="about-col">
              <p className="eyebrow">{t('eyebrow')}</p>
              <h1>{t('title')}</h1>
              <div className="about-body">
                {/* eslint-disable-next-line @next/next/no-img-element -- one optional local file; next/image would need its dimensions */}
                {photo && <img className="about-photo" src={ABOUT_PHOTO_PATH} alt={t('photoAlt', { name })} />}
                <div className="about-story">
                  <p>{t('story.village')}</p>
                  <p>{t('story.villageFoodie')}</p>
                  <p>{t('story.hatchgrab')}</p>
                  <p>{t('story.small')}</p>
                  <p className="about-sign">{t.rich('signature', { name, b: c => <b>{c}</b> })}</p>
                </div>
              </div>
              <p className="about-legal">
                {t('company', { company: COMPANY.name, number: COMPANY.number, address: COMPANY.address })}
                {' · '}
                <a href={contactHref('general')}>{t('contact')}</a>
              </p>
            </div>
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />
        </section>

        <LandingFooter landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} country={visitor.menu} locale={settings.locale} comparison={await comparisonFooter(settings.countryCode, settings.locale)} />
      </div>

      {/* Mounted once, outside `.hg-landing` — the nav's CTA drives it (as on /features). */}
      <DemoModal />
    </DemoModalProvider>
    </PageLocale>
  )
}
