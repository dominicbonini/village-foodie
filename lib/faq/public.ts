// lib/faq/public.ts — 🔴 THE PUBLIC FAQ ON THE COUNTRY LANDING PAGES (faq-3, 2 November 2026; faq-2, the same day:
// every language — docs/faq-3-report.md §3, docs/faq-2-seo-geo-2-report.md Part A). SERVER ONLY.
//
// WHICH PAGES: every switched-on country's landing page, in that page's language (settings.locale).
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
import { comparisonFlags } from '@/lib/comparison-flags'
import { resolveItem, shownIn, type FaqWorld, type FaqCountry } from '@/lib/faq/live-values'
import { checkItem } from '@/lib/faq/check'
import { shownRow, type FaqTranslationRow } from '@/lib/faq/translation'
import { itemSourceHash, sectionSourceHash } from '@/lib/faq/source-hash'
import type { FaqPair } from '@/lib/structured-data'

/** One section as the page shows it: its title (a small label) and its visible questions. */
export interface PublicFaqSection { title: string; items: FaqPair[] }
export type PublicFaq = PublicFaqSection[]

type Row = Record<string, unknown>
interface Published { translations: FaqTranslationRow[]; sections: { id: string; position: number; title: string }[]; items: { id: string; sectionId: string; position: number; questionEn: string; answerEn: string; answerSinglePlanEn: string | null; showIn: string }[] }

const TTL_MS = 60_000
let rowsCache: { at: number; value: Published } | null = null
const pageCache = new Map<string, { at: number; value: PublicFaq | null }>()

/** Forget the cached questions and every page's FAQ — Admin › FAQ calls this after every write. */
export function clearPublicFaqCache(): void {
  rowsCache = null
  pageCache.clear()
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

/** The published questions and every section, in Admin's order. Throws on a failed read (the caller logs it). */
async function published(): Promise<Published> {
  if (rowsCache && Date.now() - rowsCache.at < TTL_MS) return rowsCache.value
  const { supabase } = await import('@/lib/supabase')
  const [s, i, tr] = await Promise.all([
    supabase.from('faq_sections').select('id, position, title_en'),
    supabase.from('faq_items').select('id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, status').eq('status', 'published'),
    supabase.from('faq_translations').select('item_id, section_id, locale, question, answer, answer_single_plan, title, source_hash, status'),
  ])
  if (s.error) throw new Error(`sections: ${s.error.message}`)
  if (i.error) throw new Error(`questions: ${i.error.message}`)
  // faq-2: an unreadable translations table leaves every non-English page without the FAQ (English pages are unaffected).
  if (tr.error) console.error('[faq] could not read the translations; non-English pages show no FAQ:', tr.error.message)
  const value: Published = {
    translations: tr.error ? [] : ((tr.data ?? []) as Row[]).map(r => ({
      itemId: typeof r.item_id === 'string' ? r.item_id : null, sectionId: typeof r.section_id === 'string' ? r.section_id : null, locale: String(r.locale),
      question: typeof r.question === 'string' ? r.question : null, answer: typeof r.answer === 'string' ? r.answer : null,
      answerSinglePlan: typeof r.answer_single_plan === 'string' ? r.answer_single_plan : null, title: typeof r.title === 'string' ? r.title : null,
      sourceHash: String(r.source_hash), model: null, translatedAt: '', status: r.status === 'ok' ? 'ok' : 'failed', reason: null,
    })),
    sections: ((s.data ?? []) as Row[]).map(r => ({ id: String(r.id), position: Number(r.position), title: String(r.title_en) })).sort(byPosition),
    items: ((i.data ?? []) as Row[]).filter(r => r.status === 'published').map(r => ({
      id: String(r.id), sectionId: String(r.section_id), position: Number(r.position),
      questionEn: String(r.question_en), answerEn: String(r.answer_en),
      answerSinglePlanEn: typeof r.answer_single_plan_en === 'string' ? r.answer_single_plan_en : null, showIn: String(r.show_in),
    })).sort(byPosition),
  }
  rowsCache = { at: Date.now(), value }
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

/** The FAQ a country's landing page shows, in its language, or null: nothing visible, or the questions couldn't be read. */
export async function landingFaq(settings: CountrySettings): Promise<PublicFaq | null> {
  const code = settings.countryCode
  const locale = settings.locale
  const hit = pageCache.get(code)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  let rows: Published, w: FaqWorld
  try {
    [rows, w] = await Promise.all([published(), world()])
  } catch (e) {
    console.error('[faq] could not read the FAQ; the landing page shows none:', e instanceof Error ? e.message : e)
    return null
  }
  const country: FaqCountry = w.countries.find(c => c.settings.countryCode === code) ?? { settings, apps: false }
  const rowsOf = (key: 'itemId' | 'sectionId', id: string) => rows.translations.filter(t => t[key] === id)
  const out: PublicFaq = []
  const untranslated: string[] = []
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
    }
    if (!items.length) continue
    const titleRow = shownRow(locale, rowsOf('sectionId', section.id), sectionSourceHash({ titleEn: section.title }))
    if (!titleRow) { console.info(`[faq] ${code}: the section "${section.title}" (${section.id}) has no up-to-date ${locale} title — hidden here`); continue }
    out.push({ title: titleRow === 'english' ? section.title : titleRow.title ?? section.title, items })
  }
  // One line per page (not one per question) for what has no up-to-date translation yet — the translator's backlog.
  if (untranslated.length) console.info(`[faq] ${code}: ${untranslated.length} question(s) have no up-to-date ${locale} translation — hidden here: ${untranslated.map(id => `…${id.slice(-4)}`).join(', ')}`)
  const value = out.length ? out : null
  pageCache.set(code, { at: Date.now(), value })
  return value
}
