// app/[country]/[section]/[slug]/page.tsx — A COUNTRY'S COMPARISON PAGE: /de/vergleich/foodtruck-bestellsystem
// (compare-de-1, 24 October 2026; docs/compare-de-1-report.md). Written for AI assistants and search engines first:
// everything — the table, the prices, the FAQ — is in the server HTML, and the same content is at ….md and ….json.
//
// ── 🔴 WHO SEES IT (lib/comparison-server.ts resolveComparison — the page and both twins share it) ────────────────────
//   off   → 404 for everyone.
//   admin → 404 for everyone but a verified admin (lib/auth/admin.ts, on the server). An admin gets the banner, robots
//           noindex,nofollow (here and as X-Robots-Tag from proxy.ts) and Cache-Control private, no-store (proxy.ts).
//           Not in the sitemap, /llms.txt or any hreflang.
//   live  → public, indexable, self-canonical; in the sitemap, /llms.txt and its own hreflang (itself only).
// Inside the page, a competitor shows publicly only when its entry, plan and features are verified (lib/comparison.ts).
// An admin sees everything, each unverified item badged, and "So sieht es öffentlich aus" (?view=public) shows exactly
// what the public gets. ⛔ There is no live switch on this page: that is Admin › Countries.
//
// ── THE ADDRESS ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The section and slug are the country's own messages (comparison.path); any other pair is a 404. Static siblings —
// app/[country]/features and /compare — always win over this route.
import { cache } from 'react'
import Link from 'next/link'
import { Archivo, Public_Sans, Courier_Prime } from 'next/font/google'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { adminUser } from '@/lib/auth/admin'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { DemoModalProvider, DemoModal, DemoCta } from '@/components/landing/DemoUpload'
import { PageLocale } from '@/lib/i18n/page-locale'
import { pageSeedProps } from '@/lib/i18n/page-words'
import { localeOfCountry } from '@/lib/i18n/locales'
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { resolveComparison, comparisonT, comparisonFooter } from '@/lib/comparison-server'
import { buildComparison, comparisonGraph, type Cell } from '@/lib/comparison'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/comparison'
import '../../../landing/landing.css'
import './comparison.css'

export const dynamic = 'force-dynamic'

type Params = { country: string; section: string; slug: string }
type Search = Record<string, string | string[] | undefined>

/** One resolution per request — the metadata and the page ask the same question. Null = 404. */
const resolve = cache(async (country: string, section: string, slug: string) => {
  if (!isHatchGrabHost((await headers()).get('host') || '')) return null
  return resolveComparison(country, section, slug, async () => (await adminUser()) !== null)
})

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params
  const r = await resolve(p.country, p.section, p.slug)
  if (!r) notFound()
  const t = comparisonT(r.input.settings.locale)
  const live = r.flags.status === 'live'
  const url = r.input.urls.page
  const title = t('meta.title'), description = t('meta.description')
  return {
    // `absolute`: app/layout.tsx's template would add the brand a second time.
    title: { absolute: title },
    description,
    robots: live ? { index: true, follow: true } : { index: false, follow: false },
    alternates: {
      canonical: url,
      // hreflang names the page itself only, and only once it is live.
      ...(live ? { languages: { [r.input.settings.locale]: url } } : {}),
      types: { 'text/markdown': r.input.urls.md, 'application/json': r.input.urls.json },
    },
    openGraph: {
      type: 'article', siteName: 'HatchGrab', url, title, description, locale: r.input.settings.locale.replace('-', '_'),
      images: [{ url: 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png', width: 1200, height: 630, alt: 'HatchGrab' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['https://www.hatchgrab.com/logos/hatchgrab-share-card.png'] },
  }
}

// The chrome's fonts — declared here as on every marketing page (see app/features/page.tsx for why).
const archivo = Archivo({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-archivo', display: 'swap' })
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })
const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap', preload: false })
const CHROME = `hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`

export default async function ComparisonPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const p = await params
  const r = await resolve(p.country, p.section, p.slug)
  if (!r) notFound()
  const { input, flags, admin } = r
  const settings = input.settings
  const t = comparisonT(settings.locale)
  const rich = translatorFor(settings.locale, 'comparison')
  const publicView = !admin || (await searchParams).view === 'public'
  const v = buildComparison(input, t, { admin, publicView })
  const visitor = await resolveVisitorCountry(undefined, { segment: p.country, page: 'landing' })
  const graph = comparisonGraph(v, input, t)
  const live = flags.status === 'live'
  const badge = <span className="cmp-badge">{t('admin.unverified')}</span>
  const cellText = (c: Cell) => (
    <>
      <span className={c.tri ? `cmp-tri cmp-tri-${c.tri}` : undefined}>{c.text}</span>
      {c.unverified && !v.publicView && badge}
    </>
  )

  return (
    <PageLocale locale={localeOfCountry(settings)} {...pageSeedProps(settings.locale, 'marketing')}>
    <DemoModalProvider>
      <div className={CHROME}>
        <LandingNav landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} locale={settings.locale} />

        {admin && (
          <aside className="cmp-admin" data-admin-banner aria-label={t('admin.label')}>
            <div className="wrap">
              <p className="cmp-admin-status"><b>{live ? t('admin.statusLive') : t('admin.status')}</b></p>
              <p className="cmp-admin-links">
                <a href="?" aria-current={!v.publicView ? 'page' : undefined} data-view="admin">{t('admin.viewAdmin')}</a>
                <a href="?view=public" aria-current={v.publicView ? 'page' : undefined} data-view="public">{t('admin.viewPublic')}</a>
                <Link href="/admin?tab=pricing">{t('admin.pricingCheck')}</Link>
              </p>
              <p className="cmp-admin-h">{t('admin.checklist')}</p>
              <ul className="cmp-admin-list">
                {v.checklist.map(c => <li key={c.key} data-check={c.key} data-ok={c.ok ? 'yes' : 'no'}>{c.ok ? '✓' : '✗'} {c.label}</li>)}
              </ul>
              <p className="cmp-admin-note">{t('admin.goLive')}</p>
            </div>
          </aside>
        )}

        <main className="band cmp" data-comparison={settings.countryCode}>
          <div className="wrap cmp-wrap">
            {/* 1 · breadcrumb */}
            <nav className="cmp-crumbs" aria-label={t('breadcrumb.label')}>
              <ol><li><a href={visitor.paths.landing}>{t('breadcrumb.home')}</a></li><li aria-current="page">{t('breadcrumb.here')}</li></ol>
            </nav>

            {/* 2 · h1 and byline */}
            <h1>{t('h1')}</h1>
            <p className="cmp-byline">{rich.rich('byline', { date: v.checkedLabel, link: (c: React.ReactNode) => <a href="#methodik">{c}</a> })}</p>

            {/* 3 · Kurz gesagt */}
            <section className="cmp-tldr" aria-labelledby="kurz">
              <h2 id="kurz">{t('tldr.title')}</h2>
              <p>{t('tldr.body')}</p>
            </section>

            {/* 4 · the table */}
            <section aria-labelledby="tabelle">
              <h2 id="tabelle">{t('table.title')}</h2>
              <div className="cmp-scroll" role="region" aria-labelledby="tabelle" tabIndex={0}>
                <table className="cmp-table" data-table>
                  <caption>{t('table.caption', { country: input.countryName, date: v.checkedLabel })}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('table.feature')}</th>
                      {v.columns.map(c => (
                        <th scope="col" key={c.key} className={c.us ? 'cmp-us' : undefined} data-tool={c.name}>
                          {c.url && !c.us ? <a href={c.url} rel="nofollow noopener" target="_blank">{c.name}</a> : c.name}
                          {!c.verified && !v.publicView && <> {badge}</>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {v.rows.map(row => (
                      <tr key={row.key} data-row={row.key}>
                        <th scope="row">{row.label}</th>
                        {row.cells.map((c, i) => <td key={v.columns[i].key} className={v.columns[i].us ? 'cmp-us' : undefined}>{cellText(c)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cmp-note">{t('table.note')}</p>
              {v.morePending && <p className="cmp-note" data-more-pending>{t('table.morePending')}</p>}
            </section>

            {/* 5 · costs */}
            <section aria-labelledby="kosten" data-costs>
              <h2 id="kosten">{t('costs.title')}</h2>
              {v.costs.map(c => (
                <div key={c.tool} className="cmp-cost">
                  <h3>{c.tool}{c.unverified && !v.publicView && <> {badge}</>}</h3>
                  <ul>{c.lines.map(l => <li key={l}>{l}</li>)}</ul>
                  {c.source && (
                    <p className="cmp-src">
                      <a href={c.source} rel={c.us ? undefined : 'nofollow noopener'} target={c.us ? undefined : '_blank'}>{t('costs.source')}</a>
                      {c.checkedOn && <> · {t('costs.checked', { date: c.checkedOn })}</>}
                    </p>
                  )}
                </div>
              ))}
              <p>{v.cardFee}</p>
              <p data-vat>{v.vat}</p>
            </section>

            {/* 6 · fit */}
            <section aria-labelledby="passt">
              <h2 id="passt">{t('fit.title')}</h2>
              <div className="cmp-fit">
                <div><h3>{v.fit.ours}</h3><p>{v.fit.oursBody}</p></div>
                <div><h3>{v.fit.oursNot}</h3><p>{v.fit.oursNotBody}</p></div>
                {v.fit.rivals.map(f => <div key={f.name}><h3>{f.name}{f.unverified && !v.publicView && <> {badge}</>}</h3><p>{f.text}</p></div>)}
                {v.fit.cards.map(f => <div key={f.title} className="cmp-card"><h3>{f.title}</h3><p>{f.body}</p></div>)}
              </div>
            </section>

            {/* 7 · FAQ */}
            <section aria-labelledby="faq" data-faq>
              <h2 id="faq">{t('faq.title')}</h2>
              {v.faq.map(f => (
                <details key={f.q} className="cmp-faq">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </section>

            {/* 8 · method */}
            <section id="methodik" aria-labelledby="methodik-h">
              <h2 id="methodik-h">{t('method.title')}</h2>
              <p>{t('method.checked', { date: v.checkedLabel })}</p>
              <p>{t('method.prices')}</p>
              <p>{t('method.meaning')}</p>
              <p>{t('method.vendor')}</p>
              <p>{t('method.review')}</p>
              <p>{rich.rich('method.corrections', { link: (c: React.ReactNode) => <a href={input.urls.contact.replace(/^https:\/\/[^/]+/, '')}>{c}</a> })}</p>
              <p>{rich.rich('method.machine', {
                md: (c: React.ReactNode) => <a href={new URL(input.urls.md).pathname + (v.publicView ? '' : '?view=admin')} type="text/markdown">{c}</a>,
                json: (c: React.ReactNode) => <a href={new URL(input.urls.json).pathname + (v.publicView ? '' : '?view=admin')} type="application/json">{c}</a>,
              })}</p>
            </section>

            {/* 9 · CTA — the trial from the plans; "no card" and "cancel monthly" as the terms and signup say (STEP 0d). */}
            <section className="cmp-cta" aria-labelledby="cta">
              {v.trialMonths ? <h2 id="cta">{t('cta.title', { months: v.trialMonths })}</h2> : <h2 id="cta">{t('cta.button')}</h2>}
              <p>{t('cta.noCard')} · {t('cta.cancel')}</p>
              <DemoCta className="btn btn-primary">{t('cta.button')}</DemoCta>
            </section>
          </div>
        </main>

        <LandingFooter landingHref={visitor.paths.landing} featuresHref={visitor.paths.features} country={visitor.menu} locale={settings.locale}
          comparison={await comparisonFooter(settings.countryCode, settings.locale)} />
      </div>
      <DemoModal />
    </DemoModalProvider>
    {/* JSON-LD: WebPage, BreadcrumbList, FAQPage, ItemList (lib/comparison.ts). ⛔ No Product, Review or Rating. */}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
    </PageLocale>
  )
}

