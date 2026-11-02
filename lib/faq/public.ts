// lib/faq/public.ts — 🔴 THE PUBLIC FAQ ON THE ENGLISH LANDING PAGES (faq-3, 2 November 2026; docs/faq-3-report.md §3). SERVER ONLY.
//
// WHICH PAGES: a country whose page language is English (lib/i18n/locales.ts isEnglish — en-GB and its English variants). No
// country is typed. Every other country gets null BEFORE anything is read, so its page renders exactly as before (35.an-20: the
// FAQ is English only until it is translated).
// WHAT SHOWS: published questions (public.faq_items, status 'published'), grouped by section in Admin's order (position), each
// answer filled for THIS country by the resolver Admin › FAQ previews with (lib/faq/live-values.ts). Left out, and logged:
//   • a question hidden here by show_in;
//   • a question failing the check (lib/faq/check.ts checkItem, over every switched-on country — the rule that refuses a publish),
//     which includes an answer that mentions paying at the truck (BANNED_WORDING).
// An empty section is left out; with nothing to show, null (the page leaves the whole section out, JSON-LD included).
//
// ⚠️ CACHED IN MEMORY FOR AT MOST 60 SECONDS, per server instance, like lib/plans-server.ts and lib/country-settings.ts. Every
// Admin › FAQ write calls clearPublicFaqCache() (app/api/admin/faq/route.ts), so the English landing pages (force-dynamic) show
// it on the next request on that instance, and within a minute on every other — no deploy.
// ⚠️ A FAILED READ NEVER TAKES THE LANDING PAGE DOWN: it is logged, the page renders without the FAQ, and nothing is cached.
import 'server-only'
import type { CountrySettings } from '@/lib/country-settings-types'
import { listCountrySettingsCached } from '@/lib/country-settings'
import { getPlanCatalog } from '@/lib/plans-server'
import { comparisonFlags } from '@/lib/comparison-flags'
import { isEnglish } from '@/lib/i18n/locales'
import { resolveItem, type FaqWorld, type FaqCountry } from '@/lib/faq/live-values'
import { checkItem } from '@/lib/faq/check'
import type { FaqPair } from '@/lib/structured-data'

/** One section as the page shows it: its title (a small label) and its visible questions. */
export interface PublicFaqSection { title: string; items: FaqPair[] }
export type PublicFaq = PublicFaqSection[]

type Row = Record<string, unknown>
interface Published { sections: { id: string; position: number; title: string }[]; items: { id: string; sectionId: string; position: number; questionEn: string; answerEn: string; answerSinglePlanEn: string | null; showIn: string }[] }

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
  const [s, i] = await Promise.all([
    supabase.from('faq_sections').select('id, position, title_en'),
    supabase.from('faq_items').select('id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, status').eq('status', 'published'),
  ])
  if (s.error) throw new Error(`sections: ${s.error.message}`)
  if (i.error) throw new Error(`questions: ${i.error.message}`)
  const value: Published = {
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

/** The FAQ a country's landing page shows, or null: not an English page, nothing visible, or the questions couldn't be read. */
export async function landingFaq(settings: CountrySettings): Promise<PublicFaq | null> {
  if (!isEnglish(settings.locale)) return null
  const code = settings.countryCode
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
  const out: PublicFaq = []
  for (const section of rows.sections) {
    const items: FaqPair[] = []
    for (const item of rows.items.filter(i => i.sectionId === section.id)) {
      const r = resolveItem(item, w, country, settings.locale)
      if (!r.shown) { console.info(`[faq] ${code}: "${item.questionEn}" (${item.id}) is hidden here by show_in '${item.showIn}'`); continue }
      const check = checkItem(item, w)
      if (!check.ok || r.problems.length) { console.warn(`[faq] ${code}: "${item.questionEn}" (${item.id}) is left out — it fails the check: ${check.sentences.join(' ') || 'it does not resolve here'}`); continue }
      items.push({ q: item.questionEn, a: r.text })
    }
    if (items.length) out.push({ title: section.title, items })
  }
  const value = out.length ? out : null
  pageCache.set(code, { at: Date.now(), value })
  return value
}
