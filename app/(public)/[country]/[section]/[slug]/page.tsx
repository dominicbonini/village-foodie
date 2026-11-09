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
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isHatchGrabHost } from '@/lib/brand'
import { adminUser } from '@/lib/auth/admin'
import { MarketingFrame } from '@/components/landing/MarketingFrame'   // site-chrome-1: the ONE shared header and footer
import { DemoCta } from '@/components/landing/DemoUpload'
import { FaqDetails } from '@/components/faq/FaqDetails'   // faq-3: the FAQ markup, shared with the English landing pages
import { resolveVisitorCountry } from '@/lib/visitor-country'
import { resolveComparison, comparisonT, comparisonSuitsT, liveComparisonAlternates } from '@/lib/comparison-server'
import { buildComparison, comparisonGraph, type Cell } from '@/lib/comparison'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/comparison'
import { StickyTableHead } from '@/components/StickyTableHead'   // compare-ux-1: the ONE sticky table header (shared with /features)
import '../../../(site)/landing/landing.css'
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
      // compare-languages-1 §4: once live, hreflang names every live country's comparison page (this one included); never before.
      ...(live ? { languages: { ...(await liveComparisonAlternates()), [r.input.settings.locale]: url } } : {}),
      types: { 'text/markdown': r.input.urls.md, 'application/json': r.input.urls.json },
    },
    openGraph: {
      type: 'article', siteName: 'HatchGrab', url, title, description, locale: r.input.settings.locale.replace('-', '_'),
      images: [{ url: 'https://www.hatchgrab.com/logos/hatchgrab-share-card.png', width: 1200, height: 630, alt: 'HatchGrab' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['https://www.hatchgrab.com/logos/hatchgrab-share-card.png'] },
  }
}


export default async function ComparisonPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const p = await params
  const r = await resolve(p.country, p.section, p.slug)
  if (!r) notFound()
  const { input, flags, admin } = r
  const settings = input.settings
  const t = comparisonT(settings.locale)
  const rich = translatorFor(settings.locale, 'comparison')
  const publicView = !admin || (await searchParams).view === 'public'
  const v = buildComparison(input, t, { admin, publicView }, comparisonSuitsT(settings.locale))
  const visitor = await resolveVisitorCountry(undefined, { segment: p.country, page: 'landing' })
  const graph = comparisonGraph(v, input, t)
  const live = flags.status === 'live'
  const badge = <span className="cmp-badge">{t('admin.unverified')}</span>
  // ── compare-ux-1 (8 November 2026): each cell is ONE short verdict from one word set — "✓ Yes", "◐ Partly", "✗ No", "Not listed",
  // "—" (doesn't say), "Doesn't apply" (that kind of service, e.g. a market, has no such feature; 9 November 2026); a plan price or fee
  // shows its amount ("✓ None" when there is none). The detail — the note, the quote, the source
  // and the date — opens from the cell's ⓘ, a native details element: the text is in the HTML for search and AI tools, never visually hidden.
  // The Markdown and JSON twins keep every cell's full words and detail, unchanged.
  const doesntSay = t('cell.doesntSay')
  const verdict = (c: Cell) => {
    if (c.price && c.value === 'no') return <span className="cmp-v cmp-v-yes"><span aria-hidden="true">✓ </span>{t('cell.none')}</span>
    if (c.price && c.note && c.note.length <= 40) return <span className="cmp-v cmp-v-amt">{c.note}</span>
    // a feature that does not apply to the tool's kind (a market): "Doesn't apply" — not "—", which means their website doesn't say.
    // Which kind ("does not apply to a market") is the cell's note, behind its ⓘ.
    if (c.na) return <span className="cmp-v cmp-v-na">{t('cell.doesntApply')}</span>
    switch (c.value) {
      case 'yes': return <span className="cmp-v cmp-v-yes"><span aria-hidden="true">✓ </span>{t('cell.yes')}</span>
      case 'partial': return <span className="cmp-v cmp-v-partial"><span aria-hidden="true">◐ </span>{t('cell.partial')}</span>
      case 'no': return <span className="cmp-v cmp-v-no"><span aria-hidden="true">✗ </span>{t('cell.no')}</span>
      case 'not_listed': return <span className="cmp-v cmp-v-not_listed">{t('cell.not_listed')}</span>
      default: return <span className="cmp-v cmp-v-none" role="img" aria-label={doesntSay}>—</span>
    }
  }
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const cellBody = (c: Cell, us: boolean) => {
    const quote = c.quote?.trim() || null
    // HatchGrab's cells link to our own pages; their ⓘ shows only when there is a note to read.
    const note = c.note
    const hasDetail = !!(note || quote || (!us && c.source))
    return (
      <>
        {verdict(c)}
        {hasDetail && (
          <details className="cmp-i">
            <summary aria-label={t('cell.details')} title={t('cell.details')}><span aria-hidden="true">ⓘ</span></summary>
            <div className="cmp-i-body">
              {note && <p>{note}</p>}
              {quote && <p className="cmp-i-quote">“{quote}”</p>}
              {c.source && <p className="cmp-i-src"><a href={c.source} rel={us ? undefined : 'nofollow noopener'} target={us ? undefined : '_blank'}>{us ? t('costs.source') : host(c.source)}</a>{c.checkedOn && <> · {t('costs.checked', { date: c.checkedOn })}</>}</p>}
            </div>
          </details>
        )}
        {c.unverified && !v.publicView && badge}
      </>
    )
  }
  // ── compare-ux-1: the admin banner is ONE line under the auto-publish rules; the rest behind "Details". Admins only. ──
  const rivals = v.columns.filter(c => !c.us)
  const publicCount = rivals.filter(c => c.verified).length
  const statusLine = live
    ? (flags.autoLive ? t('admin.liveAuto') : t('admin.statusLive'))
    : t('admin.adminsOnly', { reason: flags.autoPublish ? t('admin.whyFewer', { n: publicCount, total: rivals.length }) : t('admin.whyAutoOff') })

  return (
    // site-chrome-1 (5 November 2026): the ONE shared frame (components/landing/MarketingFrame.tsx); the JSON-LD stays after it.
    <MarketingFrame visitor={visitor} after={
      // JSON-LD: WebPage, BreadcrumbList, FAQPage, ItemList (lib/comparison.ts). ⛔ No Product, Review or Rating.
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
    }>

        {admin && (
          <aside className="cmp-admin" data-admin-banner aria-label={t('admin.label')}>
            <div className="wrap">
              <p className="cmp-admin-line">
                <b data-admin-status>{statusLine}</b>
                <span data-admin-shown>{t('admin.shown', { n: publicCount })}</span>
                {v.publicView
                  ? <a href="?" data-view="admin">{t('admin.viewAdmin')}</a>
                  : <a href="?view=public" data-view="public">{t('admin.viewPublic')}</a>}
                <Link href="/admin?tab=pricing">{t('admin.pricingCheck')}</Link>
              </p>
              <details className="cmp-admin-more">
                <summary>{t('admin.details')}</summary>
                <ul className="cmp-admin-list">
                  {v.checklist.map(c => <li key={c.key} data-check={c.key} data-ok={c.ok ? 'yes' : 'no'}>{c.ok ? '✓' : '✗'} {c.label}</li>)}
                </ul>
                {/* compare-suits-1: the entries the four-cap leaves out (lib/comparison-selection.ts) — named for an admin only. */}
                {v.notShown.length > 0 && (
                  <p className="cmp-admin-note" data-not-shown>{t('admin.notShown', { names: new Intl.ListFormat(settings.locale, { style: 'long', type: 'conjunction' })
                    .format(v.notShown.map(n => t(n.reason === 'hidden' ? 'admin.reasonHidden' : n.reason === 'no_website' ? 'admin.reasonNoWebsite' : 'admin.reasonBeyond', { name: n.name }))) })}</p>
                )}
                <p className="cmp-admin-note">{live ? t('admin.statusLive') : t('admin.status')}</p>
                <p className="cmp-admin-note">{t('admin.goLive')}</p>
              </details>
            </div>
          </aside>
        )}

        <main className="band cmp" data-comparison={settings.countryCode}>
          <div className="wrap cmp-wrap">
            {/* 1 · breadcrumb (compare-ux-1: it scrolls with the page — landing.css makes every <nav> sticky, comparison.css undoes it here) */}
            <nav className="cmp-crumbs" aria-label={t('breadcrumb.label')}>
              <ol><li><a href={visitor.paths.landing}>{t('breadcrumb.home')}</a></li><li aria-current="page">{t('breadcrumb.here')}</li></ol>
            </nav>

            {/* 2 · h1 and byline */}
            <h1>{t('h1')}</h1>
            <p className="cmp-byline">{rich.rich('byline', { date: v.checkedLabel, link: (c: React.ReactNode) => <a href="#methodik">{c}</a> })}</p>

            {/* 3 · compare-ux-1: "Which suits your food truck?" is the page's short direct answer, directly under the title (the "In short"
                section is gone). Questions and answers generated from checked data only (lib/comparison-suits.ts): question, short
                answer, "Checked <date> · Evidence". Plain headings and paragraphs — ⛔ no QAPage or FAQPage markup for this section. */}
            {v.suits.length > 0 && v.suitsWords && (
              <section aria-labelledby="suits" className="cmp-suits" data-suits>
                <h2 id="suits">{v.suitsWords.title}</h2>
                {!v.publicView && v.columns.some(c => !c.us && !c.verified) && <p className="cmp-note" data-admin-preview>{v.suitsWords.adminPreview}</p>}
                {v.suits.map(a => (
                  <div key={a.key} className="cmp-suit" data-suit={a.key}>
                    <h3>{a.question}</h3>
                    <p>{a.answer}{a.unverified && !v.publicView && <> {badge}</>}</p>
                    <details className="cmp-suit-ev">
                      <summary>{a.checkedLabel} · {v.suitsWords!.evidence}</summary>
                      <ul>
                        {a.evidenceLines.map((l, i) => (
                          <li key={i}>{l.text}{l.url && <> <a href={l.url} rel="nofollow noopener" target="_blank">{l.url.replace(/^https?:\/\//, '')}</a></>}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </section>
            )}

            {/* 4 · the table — compare-ux-1: short verdicts, the detail behind ⓘ; the header row stays under the nav and the feature
                column on the left while the table scrolls sideways (components/StickyTableHead.tsx, shared with /features). */}
            <section aria-labelledby="tabelle" className="cmp-tablewrap">
              <h2 id="tabelle">{t('table.title')}</h2>
              <p className="cmp-swipe" data-swipe aria-hidden="true">{t('table.swipe')}</p>
              <div className="cmp-scroll" role="region" aria-labelledby="tabelle" tabIndex={0}>
                <StickyTableHead head="thead" heightVar="--cmp-head-h" pin />
                <table className="cmp-table" data-table style={{ '--cmp-n': v.columns.length } as React.CSSProperties}>
                  <caption>{t('table.caption', { country: input.countryName, date: v.checkedLabel })}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('table.feature')}</th>
                      {v.columns.map(c => (
                        <th scope="col" key={c.key} className={c.us ? 'cmp-us' : undefined} data-tool={c.name}>
                          {c.url && !c.us ? <a href={c.url} rel="nofollow noopener" target="_blank">{c.name}</a> : c.name}
                          {/* Admins only: the unverified badge, the automatic-verification badge and the group line. */}
                          {!c.verified && !v.publicView && <> {badge}</>}
                          {c.autoVerified && !v.publicView && <> <span className="cmp-badge" data-auto-verified>{t('admin.autoVerified')}</span></>}
                          {c.group && !v.publicView && <span className="cmp-group" data-group>{c.group}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {/* comparison-features-1: one <tbody> per group, headed by a real row-group heading. */}
                  {v.groups.map(g => (
                    <tbody key={g.key} data-group-rows={g.key}>
                      <tr className="cmp-group-row"><th scope="rowgroup" colSpan={v.columns.length + 1}><span>{g.label}</span></th></tr>
                      {g.rows.map(row => (
                        <tr key={row.key} data-row={row.key}>
                          <th scope="row">{row.label}{row.unchecked && <> <span className="cmp-badge" data-unchecked>{t('admin.unchecked')}</span></>}</th>
                          {row.cells.map((c, i) => <td key={v.columns[i].key} className={v.columns[i].us ? 'cmp-us' : undefined} data-value={c.value}>{cellBody(c, v.columns[i].us)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
              {/* compare-ux-1: the five values in one line (every language). */}
              <p className="cmp-legend" data-legend>{t('table.legend')}</p>
              <p className="cmp-note">{t('table.note')}</p>
              {v.morePending && <p className="cmp-note" data-more-pending>{t('table.morePending')}</p>}
            </section>

            {/* comparison-features-1: "Begriffe erklärt" — each shown feature in one sentence. */}
            {v.explained.length > 0 && (
              <section aria-labelledby="begriffe" data-explained>
                <h2 id="begriffe">{t('explained.title')}</h2>
                <dl className="cmp-terms">
                  {v.explained.map(e => <div key={e.key}><dt>{e.label}</dt><dd>{e.explain}</dd></div>)}
                </dl>
              </section>
            )}

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
              <FaqDetails items={v.faq} className="cmp-faq" />
            </section>

            {/* 8 · method */}
            <section id="methodik" aria-labelledby="methodik-h">
              <h2 id="methodik-h">{t('method.title')}</h2>
              {/* compare-autopublish-1 §5: "Report an error" — the contact form with the comparison-correction topic chosen. */}
              <p data-report-error>{rich.rich('method.reportError', { link: (c: React.ReactNode) => <a href={input.urls.contact.replace(/^https:\/\/[^/]+/, '')}>{c}</a> })}</p>
              <p>{t('method.checked', { date: v.checkedLabel })}</p>
              <p>{t('method.prices')}</p>
              <p>{t('method.meaning')}</p>
              <p>{t('method.vendor')}</p>
              <p>{t('method.review')}</p>
              {/* compare-suits-1: up to four alternatives, and what "Not listed" and "Doesn't say" mean (comparisonSuits.method). */}
              {v.suitsWords?.method.map(m => <p key={m}>{m}</p>)}
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

    </MarketingFrame>
  )
}

