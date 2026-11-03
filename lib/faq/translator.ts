// lib/faq/translator.ts — 🔴 THE FAQ TRANSLATOR'S RUN (faq-2, 2 November 2026; docs/faq-2-seo-geo-2-report.md Part A). Called by
// scripts/faq-translate/main.ts (the hourly GitHub Actions job) and, with fakes, by scripts/faq-2.cjs.
//
// 1. Read the published questions, the sections that hold one, and every stored translation.
// 2. For each, lib/faq/translation.ts jobFor: the locales whose row is missing, out of date (source_hash) or failed. Nothing to do
//    → the run ends there, BEFORE any model call or login.
// 3. One model call per question or section (claude-sonnet-5-5 unless told otherwise), with every needed locale and that locale's
//    own words (its glossary, plan names, key terms and sample sentences — `contextOf`). A variant is asked with its parent and
//    returned only where its wording truly differs.
// 4. Every returned text is checked (lib/faq/translation.ts itemProblem / titleProblem): the tokens, no typed digits, currency
//    symbols or plan names, no paying-at-the-truck wording, a sane length. A refused text is stored 'failed' with its reason —
//    never shown, retried next run. de-CH is derived from de-DE (ß → ss).
// 5. The spend cap: no call starts once the run's spend has reached it. Every call's cost is logged, from the model's own prices
//    in competitor_check_settings.prices (lib/competitor-check/core.ts costOf — data, never typed).
// --dry-run: plans and builds every request, calls nothing and writes nothing.
//
// faq-translate-fix (2 November 2026; docs/faq-translate-fix-report.md): 🔴 THE MODEL CALL IS THE COMPETITOR CHECKER'S. The first live
// run sent `tool_choice: { type: 'tool' }` and every call came back 400 ("tool_choice: type "tool" and "any" are not supported for
// this model"). The answer now arrives the way the checker's does — lib/competitor-check/checker.ts `converse`, reused, not copied:
// no tool_choice; ONE strict client tool (the API holds the model to its schema); the tool's input validated (validateTranslations),
// a malformed call sent back once to fix, a reply without the call nudged once, a reply cut off at max_tokens continued; the server-side
// refusal fallback the checker uses for this model family. Same model, same output shape: a field that does not apply is "" on the
// wire (a strict schema has no optional property) and reads as null in rowsFromReply, as before. Every rejection check is unchanged.
// A 400 invalid_request_error fails the same way every time: the run stops at the first, with one line (isInvalidRequest).
import { jobFor, itemProblem, titleProblem, eszett, parentOf, DERIVED, MODEL_VARIANTS, TRANSLATED_BASES, type FaqTranslationRow, type Job, type Rules } from '@/lib/faq/translation'
import { costOf, type Prices, type Usage } from '@/lib/competitor-check/core'
import { converse, type CheckerDeps } from '@/lib/competitor-check/checker'

export const TRANSLATOR_MODEL = 'claude-sonnet-5-5'

export interface SourceItem { id: string; sectionId: string; questionEn: string; answerEn: string; answerSinglePlanEn: string | null; status: string; hash: string }
export interface SourceSection { id: string; titleEn: string; hash: string }
/** A locale's own words for the prompt, and the rules its text must pass. */
export interface LocaleContext { locale: string; language: string; glossary: string[]; samples: string[]; rules: Rules }
/** A row to write (snake_case, public.faq_translations). */
export interface WriteRow {
  item_id: string | null; section_id: string | null; locale: string
  question: string | null; answer: string | null; answer_single_plan: string | null; title: string | null
  source_hash: string; model: string; translated_at: string; status: 'ok' | 'failed'; reason: string | null
}
export interface ModelRequest { system: [rules: string, localeWords: string]; user: string; locales: string[]; maxTokens: number }
/** `usd`: the reply's cost when the caller priced it already (modelCall — every turn of the conversation); else it is priced from
 *  `usage`. */
export interface ModelReply { translations: Record<string, unknown>[]; usage: Usage | null; stopReason?: string | null; usd?: number }

export interface TranslatorDeps {
  read(): Promise<{ items: SourceItem[]; sections: SourceSection[]; translations: FaqTranslationRow[] }>
  contextOf(locale: string): LocaleContext
  /** Absent in a dry run. */
  call?(req: ModelRequest): Promise<ModelReply>
  write?(rows: WriteRow[]): Promise<void>
  /** Delete these locales' rows of one question or section (a variant whose wording no longer differs). */
  remove?(kind: 'item' | 'section', id: string, locales: string[]): Promise<void>
  prices?: Prices
  now(): string
  log(line: string): void
}
/** `limit`: at most this many translations (one question or section into one language) in this run — faq-translate-fix: limit 1
 *  translates one question into one language, a cheap test of the whole path. */
export interface TranslatorOptions { dryRun: boolean; maxUsd: number; model?: string; limit?: number }
export interface TranslatorReport {
  jobs: number; done: number; skippedForCap: number; ok: number; failed: number; removed: number; usd: number
  /** Locales whose pages changed (a row written ok, or removed). */
  changedLocales: string[]
  /** faq-4: locales with a row written ok — their FAQ pages have content, so the IndexNow submission names them. */
  okLocales: string[]
  /** faq-translate-fix: why the run stopped early — 'invalid_request' (a 400 that every call would repeat). */
  stopped?: 'invalid_request'
  lines: string[]
}

const SYSTEM = `You translate the FAQ of HatchGrab, ordering and kitchen-screen software for food trucks, from British English.
Return the translations by calling save_translations once. Every property of an entry is required: write "" for a field that does not apply (a question has no title; a section title has no question or answer; answer_single_plan is "" unless the English has one).
Rules — a translation that breaks one is thrown away:
1. Keep every {token} exactly as written (same spelling, same braces), each as many times as in the English. Never add one. Tokens are filled with live values later (prices, plan names, lists).
2. Never type a number, price, currency symbol or plan name yourself. The only figures allowed are ones the English itself types outside a token, written with the same ASCII digits.
3. Never mention paying at the truck, at the window on collection, "Pay at Hatch" or paying when collecting.
4. Write natural, plain, concise text a food-truck owner in that country would use, in the register (formal or informal address) of the sample sentences. Use the glossary terms.
5. Keep the meaning exactly: add nothing, leave nothing out. Keep email addresses, brand names (HatchGrab, Stripe, WhatsApp, Meta, Square) and menu paths as they are, translating only the words around them.
6. For a locale marked "variant", compare with its parent text: return it ONLY if the wording truly differs for that country (spelling, vocabulary). If it would read the same, leave that locale out.`

/** faq-translate-fix: STRICT, as the checker's tools are — every property required, nothing else allowed; "" where a field does not
 *  apply (rowsFromReply reads "" as null, so the rows are as before). */
const TOOL = {
  name: 'save_translations',
  description: 'Save the translations, one entry per locale. Every property is required: "" for a field that does not apply.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['translations'],
    properties: {
      translations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['locale', 'question', 'answer', 'answer_single_plan', 'title'],
          properties: {
            locale: { type: 'string' }, question: { type: 'string' }, answer: { type: 'string' },
            answer_single_plan: { type: 'string' }, title: { type: 'string' },
          },
        },
      },
    },
  },
} as const
export const TRANSLATOR_TOOL = TOOL
const ENTRY_KEYS = Object.keys(TOOL.input_schema.properties.translations.items.properties)

/** save_translations' input, checked again here (the API's strict mode first): an object with a translations array of entries,
 *  each with a locale and text fields — stray keys dropped. The text itself is judged per locale by rowsFromReply. */
export function validateTranslations(input: unknown): { ok: true; value: Record<string, unknown>[] } | { ok: false; errors: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['The input must be an object with "translations".'] }
  const list = (input as Record<string, unknown>).translations
  if (!Array.isArray(list)) return { ok: false, errors: ['"translations" must be an array.'] }
  if (list.length > 100) return { ok: false, errors: ['Too many entries (at most 100).'] }
  const errors: string[] = [], value: Record<string, unknown>[] = []
  list.forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(`translations[${i}] must be an object.`); return }
    const r = e as Record<string, unknown>
    if (typeof r.locale !== 'string' || !/^[a-z]{2}-[A-Z]{2}$/.test(r.locale)) { errors.push(`translations[${i}].locale must be a locale such as "de-DE".`); return }
    const bad = ENTRY_KEYS.filter(k => k !== 'locale' && r[k] !== undefined && typeof r[k] !== 'string')
    if (bad.length) { errors.push(`translations[${i}]: ${bad.join(', ')} must be text ("" when it does not apply).`); return }
    value.push(Object.fromEntries(ENTRY_KEYS.filter(k => r[k] !== undefined).map(k => [k, r[k]])))
  })
  return errors.length ? { ok: false, errors } : { ok: true, value }
}

/** faq-translate-fix: the model call — the competitor checker's `converse` with this tool. `api` is one Messages API call (the SDK's
 *  client.beta.messages, or a harness's recorded responses); every turn's cost is priced from `prices` and returned as `usd`. */
export function modelCall(api: CheckerDeps['api'], prices: Prices, model: string = TRANSLATOR_MODEL): (req: ModelRequest) => Promise<ModelReply> {
  return async req => {
    const r = await converse({ api, now: () => new Date() }, {
      model, maxTokens: req.maxTokens, effort: 'high', maxTurns: 3, prices,
      // Every locale's words are the same on every call: cached after the first (prompt caching).
      system: [{ type: 'text', text: req.system[0] }, { type: 'text', text: req.system[1], cache_control: { type: 'ephemeral' } }],
      user: req.user, tools: [TOOL as unknown as Record<string, unknown>], toolName: TOOL.name, validate: validateTranslations,
    })
    return { translations: r.value, usage: null, usd: r.spend.usd }
  }
}

/** A 400 the API returns as invalid_request_error: the request itself is refused, so every call of the run would fail the same way. */
export function isInvalidRequest(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const x = e as { status?: unknown; error?: { type?: unknown; error?: { type?: unknown } } }
  return x.status === 400 && (x.error?.error?.type === 'invalid_request_error' || x.error?.type === 'invalid_request_error' || /invalid_request_error/.test(e instanceof Error ? e.message : ''))
}

/** The words of every locale, once, in a fixed order: the cached part of the system prompt (the same for every call of a run). */
export function localeWords(contextOf: (l: string) => LocaleContext): string {
  const all = [...TRANSLATED_BASES, ...MODEL_VARIANTS].map(l => { const c = contextOf(l); return { locale: l, language: c.language, glossary: c.glossary, samples: c.samples } })
  return `Each locale's own words — use its glossary terms, and match the register of its sample sentences:\n${JSON.stringify(all)}`
}

/** The request for one job. Pure. `parents` holds the existing fresh text of a variant's parent when the parent is not asked too.
 *  `system` is [the rules, every locale's words] — the second is the same on every call, so it is cached after the first. */
export function buildRequest(job: Job, english: SourceItem | SourceSection, contextOf: (l: string) => LocaleContext, parents: Record<string, Record<string, string | null> | null>): ModelRequest {
  const src = job.kind === 'item'
    ? { question: (english as SourceItem).questionEn, answer: (english as SourceItem).answerEn, ...((english as SourceItem).answerSinglePlanEn?.trim() ? { answer_single_plan: (english as SourceItem).answerSinglePlanEn } : {}) }
    : { title: (english as SourceSection).titleEn }
  const locales = job.locales.map(l => {
    const variant = MODEL_VARIANTS.includes(l)
    const parent = variant ? parentOf(l) : null
    return {
      locale: l, kind: variant ? 'variant' : 'translation',
      ...(parent ? { parent, parentText: parent === 'en-GB' ? 'the English above' : job.locales.includes(parent) ? `your ${parent} translation` : parents[parent] ?? null } : {}),
    }
  })
  const fields = job.kind === 'item' ? 'question, answer' + ('answer_single_plan' in src ? ' and answer_single_plan' : '') : 'title'
  const user = JSON.stringify({ english: src, return: `For each locale: ${fields}.`, locales })
  // The output budget: up to about one token per English character per locale (Thai, Japanese and Chinese can take that many),
  // plus the JSON around them. faq-4: was one per 2.5 characters, which a long answer in 41 locales could run past; a reply cut off
  // at the limit loses every locale of that call (logged as such by the caller).
  const maxTokens = Math.min(100000, 4000 + job.locales.length * Math.ceil(JSON.stringify(src).length * 1.1))
  return { system: [SYSTEM, localeWords(contextOf)], user, locales: job.locales, maxTokens }
}

/** Check one model reply against the job; the rows to write and the variant rows to remove. Pure. */
export function rowsFromReply(job: Job, english: SourceItem | SourceSection, reply: Record<string, unknown>[], contextOf: (l: string) => LocaleContext, existing: FaqTranslationRow[], model: string, at: string):
  { rows: WriteRow[]; remove: string[] } {
  const got = new Map<string, Record<string, unknown>>()
  for (const t of reply) if (t && typeof t.locale === 'string' && job.locales.includes(t.locale) && !got.has(t.locale)) got.set(t.locale, t)
  const base = { item_id: job.kind === 'item' ? job.id : null, section_id: job.kind === 'section' ? job.id : null, source_hash: job.hash, model, translated_at: at }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const rows: WriteRow[] = [], remove: string[] = []
  const mine = new Set(existing.filter(r => (job.kind === 'item' ? r.itemId : r.sectionId) === job.id).map(r => r.locale))
  for (const l of job.locales) {
    const t = got.get(l)
    const variant = MODEL_VARIANTS.includes(l)
    if (!t) {
      // A variant left out reads the same as its parent: no row (an old one goes). A base left out is a failure.
      if (variant) { if (mine.has(l)) remove.push(l); continue }
      rows.push({ ...base, locale: l, question: null, answer: null, answer_single_plan: null, title: null, status: 'failed', reason: 'not returned by the model' })
      continue
    }
    const fields = job.kind === 'item'
      ? { question: str(t.question), answer: str(t.answer), answer_single_plan: str(t.answer_single_plan), title: null }
      : { question: null, answer: null, answer_single_plan: null, title: str(t.title) }
    const problem = job.kind === 'item'
      ? itemProblem(english as SourceItem, fields, contextOf(l).rules)
      : titleProblem((english as SourceSection).titleEn, fields.title, contextOf(l).rules)
    rows.push({ ...base, locale: l, ...fields, status: problem ? 'failed' : 'ok', reason: problem })
  }
  // de-CH from de-DE (ß → ss): a row only where de-DE has a ß; otherwise de-CH reads de-DE.
  for (const [variant, d] of Object.entries(DERIVED)) {
    const parentRow = rows.find(r => r.locale === d.from)
    if (!parentRow) continue
    const text = [parentRow.question, parentRow.answer, parentRow.answer_single_plan, parentRow.title].join(' ')
    if (parentRow.status === 'ok' && text.includes('ß')) {
      rows.push({ ...parentRow, locale: variant, question: eszett(parentRow.question), answer: eszett(parentRow.answer), answer_single_plan: eszett(parentRow.answer_single_plan), title: eszett(parentRow.title) })
    } else if (parentRow.status === 'ok' && mine.has(variant)) remove.push(variant)
    else if (parentRow.status === 'failed' && mine.has(variant)) rows.push({ ...parentRow, locale: variant, reason: `its parent ${d.from} failed: ${parentRow.reason}` })
  }
  return { rows, remove }
}

/** One run. */
export async function runTranslator(deps: TranslatorDeps, opts: TranslatorOptions): Promise<TranslatorReport> {
  const model = opts.model ?? TRANSLATOR_MODEL
  const report: TranslatorReport = { jobs: 0, done: 0, skippedForCap: 0, ok: 0, failed: 0, removed: 0, usd: 0, changedLocales: [], okLocales: [], lines: [] }
  const log = (s: string) => { report.lines.push(s); deps.log(s) }
  const { items, sections, translations } = await deps.read()
  const published = items.filter(i => i.status === 'published')
  const usedSections = sections.filter(s => published.some(i => i.sectionId === s.id))
  const work: { job: Job; english: SourceItem | SourceSection }[] = []
  // faq-translate-fix: questions first, then the section titles — so `limit` 1 is one question into one language (a full run does both).
  for (const i of published) { const j = jobFor({ kind: 'item', id: i.id, hash: i.hash }, translations); if (j) work.push({ job: j, english: i }) }
  for (const s of usedSections) { const j = jobFor({ kind: 'section', id: s.id, hash: s.hash }, translations); if (j) work.push({ job: j, english: s }) }
  report.jobs = work.length
  if (!work.length) { log(`Nothing to translate: ${published.length} published questions and ${usedSections.length} sections, every translation up to date. No model call.`); return report }
  log(`${work.length} to translate (${work.filter(w => w.job.kind === 'section').length} section titles, ${work.filter(w => w.job.kind === 'item').length} questions) into up to ${TRANSLATED_BASES.length} languages and ${MODEL_VARIANTS.length} variants · cap $${opts.maxUsd.toFixed(2)}${opts.dryRun ? ' · DRY RUN: no model call, nothing written' : ''}`)
  const changed = new Set<string>(), okSet = new Set<string>()
  // faq-translate-fix: `limit` counts translations (one question or section into one language), in order — limit 1 is one question
  // into its first language; the rest wait for the next run.
  let budget = opts.limit ?? Infinity, held = 0
  const queue: typeof work = []
  for (const w of work) {
    if (budget <= 0) { held += w.job.locales.length; continue }
    const take = w.job.locales.slice(0, budget)
    held += w.job.locales.length - take.length; budget -= take.length
    queue.push(take.length === w.job.locales.length ? w : { ...w, job: { ...w.job, locales: take } })
  }
  for (const { job, english } of queue) {
    const label = job.kind === 'item' ? `…${job.id.slice(-4)} "${(english as SourceItem).questionEn}"` : `section "${(english as SourceSection).titleEn}"`
    // The parents a variant is compared with, where the parent itself is not asked again.
    const parents: Record<string, Record<string, string | null> | null> = {}
    for (const l of job.locales) {
      const p = MODEL_VARIANTS.includes(l) ? parentOf(l) : null
      if (!p || p === 'en-GB' || job.locales.includes(p)) continue
      const r = translations.find(t => t.locale === p && (job.kind === 'item' ? t.itemId : t.sectionId) === job.id && t.status === 'ok' && t.sourceHash === job.hash)
      parents[p] = r ? { question: r.question, answer: r.answer, answer_single_plan: r.answerSinglePlan, title: r.title } : null
    }
    const req = buildRequest(job, english, deps.contextOf, parents)
    if (opts.dryRun || !deps.call) {
      log(`  ${label}: would ask ${job.locales.length} locales (${job.full ? 'English changed or new' : 'retrying failed or missing'}) · prompt ${req.user.length} characters (+ ${req.system[1].length} cached) · up to ${req.maxTokens} output tokens`)
      continue
    }
    if (report.usd >= opts.maxUsd) { report.skippedForCap++; continue }
    let reply: ModelReply
    try { reply = await deps.call(req) } catch (e) {
      // faq-translate-fix: a refused request would be refused 29 times — stop at the first, with one line.
      if (isInvalidRequest(e)) {
        report.stopped = 'invalid_request'
        log(`STOPPED: the API refused the request (400 invalid_request_error), so every call would fail the same way — nothing more is sent this run: ${e instanceof Error ? e.message : String(e)}`)
        break
      }
      log(`  ${label}: the model call FAILED — ${e instanceof Error ? e.message : String(e)} (retried next run)`); continue
    }
    const usd = reply.usd ?? (deps.prices ? costOf(reply.usage, model, deps.prices).usd : 0)
    report.usd += usd
    if (reply.stopReason === 'max_tokens') log(`  ${label}: the reply hit its ${req.maxTokens}-token limit — every locale it did not finish is stored failed and retried next run`)
    const { rows, remove } = rowsFromReply(job, english, reply.translations, deps.contextOf, translations, model, deps.now())
    if (rows.length) await deps.write?.(rows)
    if (remove.length) await deps.remove?.(job.kind, job.id, remove)
    const ok = rows.filter(r => r.status === 'ok'), bad = rows.filter(r => r.status === 'failed')
    report.ok += ok.length; report.failed += bad.length; report.removed += remove.length; report.done++
    for (const r of ok) { changed.add(r.locale); okSet.add(r.locale) }
    for (const l of remove) changed.add(l)
    log(`  ${label}: ${ok.length} ok${bad.length ? ` · ${bad.length} failed (${bad.slice(0, 3).map(r => `${r.locale}: ${r.reason}`).join('; ')}${bad.length > 3 ? '; …' : ''})` : ''}${remove.length ? ` · ${remove.length} variant row(s) removed (now read their parent)` : ''} · $${usd.toFixed(4)}`)
  }
  if (report.skippedForCap) log(`Spend cap $${opts.maxUsd.toFixed(2)} reached: ${report.skippedForCap} left for the next run.`)
  if (opts.limit && held) log(`--limit ${opts.limit}: ${held} translation(s) left for the next run.`)
  report.changedLocales = [...changed].sort()
  report.okLocales = [...okSet].sort()
  log(`Done: ${report.done} translated · ${report.ok} rows ok · ${report.failed} failed · ${report.removed} removed · $${report.usd.toFixed(4)}`)
  return report
}
