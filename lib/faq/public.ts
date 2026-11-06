// lib/faq/public.ts — 🔴 THE PUBLIC FAQ (faq-3, 2 November 2026; faq-2, the same day: every language; faq-4, the same day: its own
// page — docs/faq-3-report.md §3, docs/faq-2-seo-geo-2-report.md Part A, docs/faq-4-report.md). SERVER ONLY.
//
// faq-4: THE FAQ IS ITS OWN PAGE, /<country>/faq (app/faq/page.tsx) — no longer a section of the landing page. A country whose FAQ
// shows nothing has no /faq (404), no sitemap entry, no hreflang and no footer link (faqPage / faqHrefFor / faqCountries below).
// WHICH PAGES: every switched-on country's FAQ page, in that page's language (settings.locale).
//   • an ENGLISH page shows the English (faq_items), or an English variant's own row where one is fresh (en-US …);
//   • any other page shows a question ONLY where its translation (public.faq_translations, lib/faq/translation.ts shownRow) is
//     'ok' AND made from the current English (source_hash) — never English, never out of date (35.an-20). A section shows only
//     with a fresh title.
// WHAT SHOWS: published questions (public.faq_items, status 'published'), grouped by section in Admin's order (position), each
// answer filled for THIS country in THIS language by the resolver Admin › FAQ previews with (lib/faq/live-values.ts). Left out,
// and logged:
//   • a question hidden here by show_in;
//   • a question failing the check (lib/faq/check.ts checkItem, over every switched-on country — the rule that refuses a publish),
//     which includes an answer that mentions paying at the truck (BANNED_WORDING);
//   • (faq-2) a question with no fresh translation into the page's language, or whose translation does not resolve here.
// An empty section is left out; with nothing to show, null (the page leaves the whole section out, JSON-LD included).
//
// ⚠️ CACHED IN MEMORY FOR AT MOST 60 SECONDS, per server instance, like lib/plans-server.ts and lib/country-settings.ts. Every
// Admin › FAQ write calls clearPublicFaqCache() (app/api/admin/faq/route.ts), so the landing pages (force-dynamic) show it on the
// next request on that instance, and within a minute on every other — no deploy. A translation run (GitHub Actions) writes the
// database only: every instance shows its rows within the same minute.
// ⚠️ A FAILED READ NEVER TAKES THE LANDING PAGE DOWN: it is logged, the page renders without the FAQ, and nothing is cached.
import 'server-only'
import type { CountrySettings } from '@/lib/country-settings-types'
import { listCountrySettingsCached } from '@/lib/country-settings'
import { getPlanCatalog } from '@/lib/plans-server'
import { countryPagePath } from '@/lib/marketing-country'
import { comparisonFlags } from '@/lib/comparison-flags'
import { resolveItem, shownIn, type FaqWorld, type FaqCountry } from '@/lib/faq/live-values'
import { checkItem } from '@/lib/faq/check'
import { shownRow, type FaqTranslationRow } from '@/lib/faq/translation'
import { itemSourceHash, sectionSourceHash } from '@/lib/faq/source-hash'
import type { FaqPair } from '@/lib/structured-data'
import { isMarketingRender, isBuiltAheadRender } from '@/lib/marketing-render'   // perf-1: a marketing page's render reads the tagged shared cache

/** One section as the page shows it: its title (a small label) and its visible questions. */
export interface PublicFaqSection { title: string; items: FaqPair[] }
export type PublicFaq = PublicFaqSection[]
/** faq-4: a country's FAQ page — its sections and the newest publish or translation time of what it shows (the sitemap's lastmod). */
export interface FaqPageData { sections: PublicFaq; updatedAt: string | null }

type Row = Record<string, unknown>
export interface Published { translations: FaqTranslationRow[]; sections: { id: string; position: number; title: string }[]; items: { id: string; sectionId: string; position: number; questionEn: string; answerEn: string; answerSinglePlanEn: string | null; showIn: string; publishedAt: string | null }[] }

const TTL_MS = 60_000
let rowsCache: { at: number; value: Published } | null = null
const pageCache = new Map<string, { at: number; value: FaqPageData | null }>()

/** Forget the cached questions and every page's FAQ — Admin › FAQ calls this after every write. */
export function clearPublicFaqCache(): void {
  rowsCache = null
  pageCache.clear()
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

/** The published questions and every section, in Admin's order. Throws on a failed read (the caller logs it). */
async function published(): Promise<Published> {
  // perf-1 (5 November 2026): a marketing page's render reads the tagged shared cache (lib/marketing-cache.ts). A failed read there is
  // never kept; it falls through to the read below, which answers as it always has.
  if (isMarketingRender()) {
    try { return await (await import('@/lib/faq/public-cache')).marketingFaqRows() } catch (e) { if (isBuiltAheadRender()) throw e /* cwv-2: never stored with a built-ahead page */ }
  }
  if (rowsCache && Date.now() - rowsCache.at < TTL_MS) return rowsCache.value
  const value = await readPublished(false)
  rowsCache = { at: Date.now(), value }
  return value
}

/** perf-1: the read itself, uncached. `strict` (the shared cache's read): an unreadable translations table THROWS rather than
 *  reading empty, so a failure is never kept; otherwise it is logged and the translations read empty, exactly as before. */
export async function readPublished(strict: boolean): Promise<Published> {
  const { supabase } = await import('@/lib/supabase')
  const [s, i, tr] = await Promise.all([
    supabase.from('faq_sections').select('id, position, title_en'),
    supabase.from('faq_items').select('id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, status, published_at').eq('status', 'published'),
    supabase.from('faq_translations').select('item_id, section_id, locale, question, answer, answer_single_plan, title, source_hash, status, translated_at'),
  ])
  if (s.error) throw new Error(`sections: ${s.error.message}`)
  if (i.error) throw new Error(`questions: ${i.error.message}`)
  // faq-2: an unreadable translations table leaves every non-English page without the FAQ (English pages are unaffected).
  if (tr.error && strict) throw new Error(`translations: ${tr.error.message}`)
  if (tr.error) console.error('[faq] could not read the translations; non-English pages show no FAQ:', tr.error.message)
  const value: Published = {
    translations: tr.error ? [] : ((tr.data ?? []) as Row[]).map(r => ({
      itemId: typeof r.item_id === 'string' ? r.item_id : null, sectionId: typeof r.section_id === 'string' ? r.section_id : null, locale: String(r.locale),
      question: typeof r.question === 'string' ? r.question : null, answer: typeof r.answer === 'string' ? r.answer : null,
      answerSinglePlan: typeof r.answer_single_plan === 'string' ? r.answer_single_plan : null, title: typeof r.title === 'string' ? r.title : null,
      sourceHash: String(r.source_hash), model: null, translatedAt: typeof r.translated_at === 'string' ? r.translated_at : '', status: r.status === 'ok' ? 'ok' : 'failed', reason: null,
    })),
    sections: ((s.data ?? []) as Row[]).map(r => ({ id: String(r.id), position: Number(r.position), title: String(r.title_en) })).sort(byPosition),
    items: ((i.data ?? []) as Row[]).filter(r => r.status === 'published').map(r => ({
      id: String(r.id), sectionId: String(r.section_id), position: Number(r.position),
      questionEn: String(r.question_en), answerEn: String(r.answer_en),
      answerSinglePlanEn: typeof r.answer_single_plan_en === 'string' ? r.answer_single_plan_en : null, showIn: String(r.show_in),
      publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
    })).sort(byPosition),
  }
  return value
}

/** The switched-on countries and the plan catalogue — what the resolver and the check read (as Admin › FAQ's world). */
async function world(): Promise<FaqWorld> {
  const [catalog, countries, flags] = await Promise.all([getPlanCatalog(), listCountrySettingsCached(), comparisonFlags()])
  return {
    catalog,
    countries: countries.filter(c => c.enabled).map(settings => {
      const f = flags.get(settings.countryCode)
      return { settings, apps: !!f?.iosApp && !!f?.androidApp }
    }),
  }
}

/** A country's FAQ page, in its language — its sections and when what it shows last changed — or null: nothing visible, or the
 *  questions couldn't be read. */
export async function faqPage(settings: CountrySettings): Promise<FaqPageData | null> {
  const code = settings.countryCode
  const locale = settings.locale
  // perf-1 (5 November 2026): a marketing page's render reads the tagged shared cache, by country and locale only. A failed read there
  // is never kept; it falls through to the read below, which answers as it always has.
  if (isMarketingRender()) {
    try { return await (await import('@/lib/faq/public-cache')).marketingFaqPage(code, locale) } catch (e) { if (isBuiltAheadRender()) throw e /* cwv-2: never stored with a built-ahead page */ }
  }
  const hit = pageCache.get(code)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  let rows: Published, w: FaqWorld
  try {
    [rows, w] = await Promise.all([published(), world()])
  } catch (e) {
    console.error('[faq] could not read the FAQ; the FAQ page shows none:', e instanceof Error ? e.message : e)
    return null
  }
  const value = resolveFaqPage(settings, rows, w)
  pageCache.set(code, { at: Date.now(), value })
  return value
}

/** perf-1: a country's FAQ page for the shared cache — by its code and locale only (its settings are read from the country list).
 *  Strict: a failed read THROWS (never kept), as does a country the list doesn't hold. */
export async function computeFaqPage(code: string, locale: string): Promise<FaqPageData | null> {
  // 🔴 EVERY input read STRICTLY (each throws on a failed read): through published()/world() a failure would come back as a degraded
  // answer (no translations, every comparison switch off) and the resolved page would be cached with it (proved by scripts/perf-1-local.cjs §5).
  const [mc, fc] = await Promise.all([import('@/lib/marketing-cache'), import('@/lib/faq/public-cache')])
  const [countries, rows, catalog, flags] = await Promise.all([mc.marketingCountryList(), fc.marketingFaqRows(), mc.marketingPlanCatalog(), mc.marketingComparisonEntries()])
  const settings = countries.find(c => c.countryCode === code && c.locale === locale)
  if (!settings) throw new Error(`[faq] ${code} (${locale}) is not in the country list`)
  const byCode = new Map(flags)
  const w: FaqWorld = {
    catalog,
    countries: countries.filter(c => c.enabled).map(c => { const f = byCode.get(c.countryCode); return { settings: c, apps: !!f?.iosApp && !!f?.androidApp } }),
  }
  return resolveFaqPage(settings, rows, w)
}

/** The page itself from the rows and the world — the same lines as before perf-1, moved, so both reads share them. */
function resolveFaqPage(settings: CountrySettings, rows: Published, w: FaqWorld): FaqPageData | null {
  const code = settings.countryCode
  const locale = settings.locale
  const country: FaqCountry = w.countries.find(c => c.settings.countryCode === code) ?? { settings, apps: false }
  const rowsOf = (key: 'itemId' | 'sectionId', id: string) => rows.translations.filter(t => t[key] === id)
  const out: PublicFaq = []
  const untranslated: string[] = []
  let updatedAt: string | null = null
  const newer = (t: string | null | undefined) => { if (t && (!updatedAt || Date.parse(t) > Date.parse(updatedAt))) updatedAt = t }
  for (const section of rows.sections) {
    const items: FaqPair[] = []
    for (const item of rows.items.filter(i => i.sectionId === section.id)) {
      if (!shownIn(item.showIn, country, w)) { console.info(`[faq] ${code}: "${item.questionEn}" (${item.id}) is hidden here by show_in '${item.showIn}'`); continue }
      const check = checkItem(item, w)
      if (!check.ok) { console.warn(`[faq] ${code}: "${item.questionEn}" (${item.id}) is left out — it fails the check: ${check.sentences.join(' ')}`); continue }
      // faq-2: the text in the page's language — the English, or a fresh translation; none fresh → hidden here.
      const pick = shownRow(locale, rowsOf('itemId', item.id), itemSourceHash(item))
      if (!pick) { untranslated.push(item.id); continue }
      const text = pick === 'english' ? item : { ...item, questionEn: pick.question ?? '', answerEn: pick.answer ?? '', answerSinglePlanEn: pick.answerSinglePlan }
      const r = resolveItem(text, w, country, locale)
      if (!r.shown || r.problems.length) { console.warn(`[faq] ${code}: "${item.questionEn}" (${item.id}) is left out — its ${locale} text does not resolve here`); continue }
      items.push({ q: text.questionEn, a: r.text })
      newer(item.publishedAt); if (pick !== 'english') newer(pick.translatedAt)
    }
    if (!items.length) continue
    const titleRow = shownRow(locale, rowsOf('sectionId', section.id), sectionSourceHash({ titleEn: section.title }))
    if (!titleRow) { console.info(`[faq] ${code}: the section "${section.title}" (${section.id}) has no up-to-date ${locale} title — hidden here`); continue }
    out.push({ title: titleRow === 'english' ? section.title : titleRow.title ?? section.title, items })
    if (titleRow !== 'english') newer(titleRow.translatedAt)
  }
  // One line per page (not one per question) for what has no up-to-date translation yet — the translator's backlog.
  if (untranslated.length) console.info(`[faq] ${code}: ${untranslated.length} question(s) have no up-to-date ${locale} translation — hidden here: ${untranslated.map(id => `…${id.slice(-4)}`).join(', ')}`)
  return out.length ? { sections: out, updatedAt } : null
}

/** The FAQ's sections alone (/llms.txt's English FAQ reads the UK page's). */
export async function landingFaq(settings: CountrySettings): Promise<PublicFaq | null> {
  return (await faqPage(settings))?.sections ?? null
}

/** faq-4: the footer's FAQ link for a country's pages — its /faq address, only when that page has a question to show. */
export async function faqHrefFor(settings: CountrySettings): Promise<string | undefined> {
  const path = countryPagePath(settings.countryCode, 'faq')
  return path && (await faqPage(settings)) ? path : undefined
}

/** faq-4: every switched-on country (with an address) whose FAQ page has content, with its locale and lastmod — the sitemap and the
 *  FAQ pages' hreflang name only these. */
export async function faqCountries(): Promise<{ code: string; locale: string; updatedAt: string | null }[]> {
  // perf-1 (5 November 2026): a marketing page's render reads the tagged shared cache (the FAQ pages' hreflang set). A failed read
  // there is never kept; it falls through to the read below, which answers as it always has.
  if (isMarketingRender()) {
    try { return await (await import('@/lib/faq/public-cache')).marketingFaqCountries() } catch (e) { if (isBuiltAheadRender()) throw e /* cwv-2: never stored with a built-ahead page */ }
  }
  const all = await listCountrySettingsCached().catch(() => [])
  const out: { code: string; locale: string; updatedAt: string | null }[] = []
  for (const c of all.filter(x => x.enabled && countryPagePath(x.countryCode, 'faq'))) {
    const page = await faqPage(c)
    if (page) out.push({ code: c.countryCode, locale: c.locale, updatedAt: page.updatedAt })
  }
  return out
}

/** perf-1: the same list for the shared cache. Strict: a failed read of the countries or of any country's FAQ THROWS (never kept). */
export async function computeFaqCountries(): Promise<{ code: string; locale: string; updatedAt: string | null }[]> {
  const [{ marketingCountryList }, { marketingFaqPage }] = await Promise.all([import('@/lib/marketing-cache'), import('@/lib/faq/public-cache')])
  const all = await marketingCountryList()
  const out: { code: string; locale: string; updatedAt: string | null }[] = []
  for (const c of all.filter(x => x.enabled && countryPagePath(x.countryCode, 'faq'))) {
    const page = await marketingFaqPage(c.countryCode, c.locale)
    if (page) out.push({ code: c.countryCode, locale: c.locale, updatedAt: page.updatedAt })
  }
  return out
}
