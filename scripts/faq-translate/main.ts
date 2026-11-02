// scripts/faq-translate/main.ts — the FAQ translator's entry point (faq-2, 2 November 2026; docs/faq-2-seo-geo-2-report.md Part A).
// Run hourly by .github/workflows/faq-translate.yml through scripts/competitor-check/run.mjs (which bundles a .ts entry with esbuild
// so the "@/" imports resolve):
//
//   node scripts/competitor-check/run.mjs scripts/faq-translate/main.ts [--dry-run] [--max-usd 2] [--limit N] [--fixtures file.json]
//
// --dry-run       plans and builds every request; calls no model and writes nothing.
// --fixtures F    (with --dry-run) reads the questions, sections, translations, plan catalogue and prices from F instead of the
//                 database — what scripts/faq-2.cjs runs, with no network at all.
// --max-usd N     the spend cap for this run (default 2): no model call starts once the run has spent it.
// Environment (NAMES only): the Claude API login is Workload Identity Federation, exactly as the competitor checker's
// (ANTHROPIC_FEDERATION_RULE_ID, ANTHROPIC_ORGANIZATION_ID, ANTHROPIC_SERVICE_ACCOUNT_ID, ANTHROPIC_WORKSPACE_ID and the GitHub OIDC
// token in ANTHROPIC_IDENTITY_TOKEN_FILE); NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No value is ever printed. The
// login is checked only when there is something to translate, so a run with nothing stale ends in seconds.
import fs from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { runTranslator, TRANSLATOR_MODEL, TRANSLATOR_TOOL, type TranslatorDeps, type LocaleContext, type WriteRow } from '@/lib/faq/translator'
import { itemSourceHash, sectionSourceHash } from '@/lib/faq/source-hash'
import { minRatioOf, type FaqTranslationRow } from '@/lib/faq/translation'
import { overrideChain, isEnglish, type AppLocale } from '@/lib/i18n/locales'
import { localizePlans } from '@/lib/plan-names'
import { priceText } from '@/lib/price-text'
import { PRICE_WORD } from '@/lib/price-words'
import type { PlanCatalog } from '@/lib/plans'
import type { Prices } from '@/lib/competitor-check/core'

type Row = Record<string, unknown>
const REPO = process.cwd()
function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null
}
const has = (name: string) => process.argv.includes(`--${name}`)
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8'))

// ── a locale's own words: its glossary (lib/i18n/glossary), plan names and key terms from its message file ──
const messageFiles = new Map<string, Row>()
const messages = (l: string): Row => { if (!messageFiles.has(l)) messageFiles.set(l, fs.existsSync(path.join(REPO, `messages/${l}.json`)) ? readJson(`messages/${l}.json`) : {}); return messageFiles.get(l) as Row }
const dig = (o: Row, key: string): string | null => { let v: unknown = o; for (const k of key.split('.')) v = v && typeof v === 'object' ? (v as Row)[k] : undefined; return typeof v === 'string' ? v : null }
/** A message in `locale`, most specific file first (a variant's own, then its parents', then en-GB for English). */
function message(locale: string, key: string): string | null {
  const chain = [...overrideChain(locale as AppLocale)].reverse()
  for (const l of chain) { const v = dig(messages(l), key); if (v) return v }
  return isEnglish(locale) ? dig(messages('en-GB'), key) : null
}
function glossaryOf(locale: string): string[] {
  const lang = locale.slice(0, 2)
  const file = [`lib/i18n/glossary/${locale.slice(0, 5)}.json`, `lib/i18n/glossary/${lang}.json`].find(f => fs.existsSync(path.join(REPO, f)))
  if (!file) return []
  const g = readJson(file) as { concepts?: { concept: string; use?: string[]; notes?: string }[] }
  return (g.concepts ?? []).filter(c => c.use?.length).map(c => `${c.concept} → ${c.use!.join(' / ')}${c.notes ? ` (${c.notes})` : ''}`)
}
const SAMPLE_KEYS = ['landing.meta.title', 'landing.meta.description', 'landing.jsonLd.audience', 'landing.does.capacityBody', 'landing.steps.menuBody', 'landing.faq.title']

function contextFactory(catalog: PlanCatalog): (l: string) => LocaleContext {
  const english = catalog.plans.filter(p => p.isPublic !== false).map(p => p.name)
  const cache = new Map<string, LocaleContext>()
  return (locale: string) => {
    if (cache.has(locale)) return cache.get(locale) as LocaleContext
    const own = localizePlans(catalog, locale).plans.filter(p => p.isPublic !== false).map(p => p.name)
    const planNames = [...new Set([...english, ...own])]
    const language = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
    const c: LocaleContext = {
      locale, language,
      glossary: [...glossaryOf(locale), `Plan names (never type them — they are tokens): ${own.join(', ')}`],
      samples: SAMPLE_KEYS.map(k => message(locale, k)).filter((s): s is string => !!s),
      rules: { planNames, bannedLocal: [priceText(PRICE_WORD.payAtHatch, locale)].filter(w => w && w !== PRICE_WORD.payAtHatch), minRatio: minRatioOf(locale) },
    }
    cache.set(locale, c)
    return c
  }
}

const translationOf = (r: Row): FaqTranslationRow => ({
  itemId: typeof r.item_id === 'string' ? r.item_id : null, sectionId: typeof r.section_id === 'string' ? r.section_id : null, locale: String(r.locale),
  question: (r.question as string) ?? null, answer: (r.answer as string) ?? null, answerSinglePlan: (r.answer_single_plan as string) ?? null, title: (r.title as string) ?? null,
  sourceHash: String(r.source_hash), model: (r.model as string) ?? null, translatedAt: String(r.translated_at ?? ''), status: r.status === 'ok' ? 'ok' : 'failed', reason: (r.reason as string) ?? null,
})
const sourcesOf = (items: Row[], sections: Row[]) => ({
  items: items.map(r => {
    const i = { id: String(r.id), sectionId: String(r.section_id), questionEn: String(r.question_en), answerEn: String(r.answer_en), answerSinglePlanEn: typeof r.answer_single_plan_en === 'string' ? r.answer_single_plan_en : null, status: String(r.status) }
    return { ...i, hash: itemSourceHash(i) }
  }),
  sections: sections.map(r => ({ id: String(r.id), titleEn: String(r.title_en), hash: sectionSourceHash({ titleEn: String(r.title_en) }) })),
})

async function main() {
  const dryRun = has('dry-run')
  const fixtures = arg('fixtures')
  if (fixtures && !dryRun) throw new Error('--fixtures is for --dry-run only.')
  const maxUsd = arg('max-usd') ? Number(arg('max-usd')) : 2
  if (!(maxUsd > 0 && maxUsd <= 50)) throw new Error('--max-usd must be a number above 0 and at most 50')
  const limit = arg('limit') ? Number(arg('limit')) : undefined
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error('--limit must be a whole number above 0')
  const log = (s: string) => console.log(s)

  let deps: TranslatorDeps
  if (fixtures) {
    const f = readJson(fixtures) as { faq_items: Row[]; faq_sections: Row[]; faq_translations: Row[]; catalog: PlanCatalog }
    deps = {
      read: async () => ({ ...sourcesOf(f.faq_items, f.faq_sections), translations: f.faq_translations.map(translationOf) }),
      contextOf: contextFactory(f.catalog), now: () => new Date().toISOString(), log,
    }
  } else {
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[name]) throw new Error(`${name} is not set (a repository secret).`)
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { readPlanCatalog } = await import('@/lib/plans-server')
    const catalog = await readPlanCatalog(db as never)
    const q = async (table: string, cols: string) => { const { data, error } = await db.from(table).select(cols); if (error) throw new Error(`read ${table}: ${error.message}`); return (data ?? []) as unknown as Row[] }
    let anthropic: Anthropic | null = null
    deps = {
      read: async () => {
        const [items, sections, translations] = await Promise.all([
          q('faq_items', 'id, section_id, question_en, answer_en, answer_single_plan_en, status'),
          q('faq_sections', 'id, title_en'),
          q('faq_translations', 'item_id, section_id, locale, question, answer, answer_single_plan, title, source_hash, model, translated_at, status, reason'),
        ])
        return { ...sourcesOf(items, sections), translations: translations.map(translationOf) }
      },
      contextOf: contextFactory(catalog),
      call: async req => {
        if (!anthropic) {
          // The login is checked only now — when there is something to translate.
          for (const name of ['ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID', 'ANTHROPIC_WORKSPACE_ID'])
            if (!process.env[name]) throw new Error(`${name} is not set (a repository variable, for the Claude API's Workload Identity Federation login).`)
          if (process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is set. Remove it: the translator logs in with Workload Identity Federation.')
          anthropic = new Anthropic({ maxRetries: 5, timeout: 600_000 })
        }
        const msg = await anthropic.messages.stream({
          model: TRANSLATOR_MODEL, max_tokens: req.maxTokens,
          // Every locale's words are the same on every call: cached after the first (prompt caching).
          system: [{ type: 'text', text: req.system[0] }, { type: 'text', text: req.system[1], cache_control: { type: 'ephemeral' } }],
          tools: [TRANSLATOR_TOOL as never], tool_choice: { type: 'tool', name: TRANSLATOR_TOOL.name },
          messages: [{ role: 'user', content: req.user }],
        } as never).finalMessage()
        const use = (msg.content as { type: string; input?: { translations?: Row[] } }[]).find(b => b.type === 'tool_use')
        return { translations: use?.input?.translations ?? [], usage: msg.usage as never }
      },
      write: dryRun ? undefined : async (rows: WriteRow[]) => {
        // Replace this question's (or section's) rows for these locales: delete, then insert (the key is generated).
        const first = rows[0]
        const key = first.item_id ? 'item_id' : 'section_id'
        const del = await db.from('faq_translations').delete().eq(key, (first.item_id ?? first.section_id) as string).in('locale', rows.map(r => r.locale))
        if (del.error) throw new Error(`replace translations: ${del.error.message}`)
        const ins = await db.from('faq_translations').insert(rows)
        if (ins.error) throw new Error(`write translations: ${ins.error.message}`)
      },
      remove: dryRun ? undefined : async (kind, id, locales) => {
        const r = await db.from('faq_translations').delete().eq(kind === 'item' ? 'item_id' : 'section_id', id).in('locale', locales)
        if (r.error) throw new Error(`remove translations: ${r.error.message}`)
      },
      now: () => new Date().toISOString(), log,
    }
    // The model's prices are data (competitor_check_settings.prices); none → stop rather than spend at an unknown rate.
    const settings = await db.from('competitor_check_settings').select('prices').limit(1).maybeSingle()
    const prices = (settings.data as { prices?: Prices } | null)?.prices
    if (!dryRun && !prices?.models?.[TRANSLATOR_MODEL]) throw new Error(`No price for ${TRANSLATOR_MODEL} in competitor_check_settings.prices — add it before running.`)
    deps.prices = prices
  }
  const report = await runTranslator(deps, { dryRun, maxUsd, limit })
  if (!dryRun && report.done === 0 && report.jobs > 0 && report.skippedForCap === 0) { console.error('Every model call failed.'); process.exit(1) }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
