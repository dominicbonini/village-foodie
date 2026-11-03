// scripts/faq-translate-fix.cjs — faq-translate-fix's proof (2 November 2026; docs/faq-translate-fix-report.md): THE FAQ TRANSLATOR'S
// MODEL CALL, THE COMPETITOR CHECKER'S WAY. No live call: the API is a recorded response in the checker's fixture format
// (scripts/fixtures/faq-translate-fix-reply.json), run through the real runTranslator → modelCall → lib/competitor-check/checker.ts
// converse, end to end.
//
//   1 · the request: no tool_choice anywhere (this model refuses a forced one with a 400); ONE strict tool, every property required;
//       the same model; the cached locale words; the checker's effort / fallback parameters — sent through converse itself
//   2 · the recorded reply → rows: the four good translations ok ("" fields read as null, the same shape as before); each of the four
//       broken ones failed with its existing check's reason (a token dropped, banned wording, a typed figure, far too short); the
//       bases not returned failed "not returned by the model"; the cost from the settings' prices
//   3 · the checker's conversation: a reply without the tool call is nudged once; a malformed call is sent back once to fix
//   4 · limit: 1 → one question into one language (one call, one locale asked, one row); 5 → five translations
//   5 · a 400 invalid_request_error stops the run after the first call, with one line; a 529 overloaded does not
//   6 · the workflow's `limit` input, the script's --limit, and no tool_choice left in the code
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'faq-translate-fix' })
const WF = require('./_world-countries-1-fixtures.cjs')
const CC = require('./_competitor-check-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')
const REPLY = require('./fixtures/faq-translate-fix-reply.json')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}`) } }
const head = s => console.log(`\n── ${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const clone = o => JSON.parse(JSON.stringify(o))
/** The SDK's 400 as it arrives (BadRequestError: status 400, the API's error body). */
const badRequest = message => Object.assign(new Error(`400 {"type":"error","error":{"type":"invalid_request_error","message":"${message}"}}`), { status: 400, error: { type: 'error', error: { type: 'invalid_request_error', message } } })
const overloaded = () => Object.assign(new Error('529 Overloaded'), { status: 529, error: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } })

;(async () => {
  const M = await kit.bundle('ftf', [
    "export { runTranslator, modelCall, validateTranslations, isInvalidRequest, TRANSLATOR_MODEL, TRANSLATOR_TOOL } from '@/lib/faq/translator'",
    "export { itemSourceHash } from '@/lib/faq/source-hash'",
    "export { minRatioOf, TRANSLATED_BASES, MODEL_VARIANTS } from '@/lib/faq/translation'",
    "export { localizePlans } from '@/lib/plan-names'",
    "export { priceText } from '@/lib/price-text'",
    "export { PRICE_WORD } from '@/lib/price-words'",
    "export { costOf } from '@/lib/competitor-check/core'",
  ].join('\n'))
  const catalog = WF.renderer(kit, 'ftf-wf').catalog
  const rules = l => ({ planNames: [...new Set([...catalog.plans.map(p => p.name), ...M.localizePlans(catalog, l).plans.map(p => p.name)])], bannedLocal: [M.priceText(M.PRICE_WORD.payAtHatch, l)].filter(w => w !== 'Pay at Hatch'), minRatio: M.minRatioOf(l) })
  const ctxOf = l => ({ locale: l, language: l, glossary: [], samples: [], rules: rules(l) })
  // Three published questions, no translations yet, no sections (so the jobs are questions).
  const ids = ['0001', '0004', '0008'].map(n => `fa000002-0000-4000-8000-00000000${n}`)
  const items = FIX.faq_items.filter(i => ids.includes(i.id)).map(i => {
    const s = { id: i.id, sectionId: 'no-section', questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en, status: 'published' }
    return { ...s, hash: M.itemSourceHash(s) }
  }).sort((a, b) => a.id.localeCompare(b.id))
  const PRICES = CC.PRICES
  /** A recorded API: answers each call with the next queued response (a message, or an error to throw); records every request. */
  function api(queue) {
    const calls = []
    const fn = async params => { calls.push(clone(params)); const next = queue.length ? queue.shift() : clone(REPLY.message); if (next instanceof Error) throw next; return clone(next) }
    return { fn, calls }
  }
  async function run({ queue = [], limit, maxUsd = 2 } = {}) {
    const A = api(queue), writes = [], lines = []
    const deps = { read: async () => ({ items, sections: [], translations: [] }), contextOf: ctxOf, call: req => M.modelCall(A.fn, PRICES)(req), write: async rows => { writes.push(...rows) }, remove: async () => {}, prices: PRICES, now: () => '2026-11-02T21:00:00Z', log: s => lines.push(s) }
    const report = await kit.quietAsync(() => M.runTranslator(deps, { dryRun: false, maxUsd, limit }))
    return { report, calls: A.calls, writes, lines }
  }

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the request — the checker\'s way: no tool_choice, one strict tool, the same model')
  const one = await run({ queue: [clone(REPLY.message)], limit: 41 })
  const p = one.calls[0]
  t('no tool_choice in the request (this model refuses "tool" and "any" with a 400)', !!p && !('tool_choice' in p) && !JSON.stringify(p).includes('tool_choice'), p && Object.keys(p))
  t('the same model, claude-sonnet-5-5', p.model === 'claude-sonnet-5-5' && M.TRANSLATOR_MODEL === 'claude-sonnet-5-5')
  const tool = p.tools?.[0]
  t('ONE client tool, save_translations, strict: every property required, nothing else allowed', p.tools.length === 1 && tool.name === 'save_translations' && tool.strict === true && tool.input_schema.additionalProperties === false
    && JSON.stringify(tool.input_schema.properties.translations.items.required) === '["locale","question","answer","answer_single_plan","title"]' && tool.input_schema.properties.translations.items.additionalProperties === false)
  t('the same output shape (locale, question, answer, answer_single_plan, title)', JSON.stringify(Object.keys(tool.input_schema.properties.translations.items.properties)) === '["locale","question","answer","answer_single_plan","title"]')
  t('every locale\'s words are the cached second system block; the English and the locales are the message', p.system.length === 2 && p.system[1].cache_control?.type === 'ephemeral' && p.messages[0].role === 'user' && JSON.parse(p.messages[0].content).english.question === items[0].questionEn)
  t('the checker\'s parameters, from converse itself: output_config.effort, and the server-side refusal fallback it sends for this family', p.output_config?.effort === 'high' && JSON.stringify(p.betas) === '["server-side-fallback-2026-07-01"]' && p.fallbacks === 'default')
  t('the system prompt asks for "" where a field does not apply', /write "" for a field that does not apply/.test(p.system[0].text))
  t('the reply fixture is in the checker\'s format (a message with a client tool_use) — and was never a live call', REPLY.message.type === 'message' && REPLY.message.content.some(b => b.type === 'tool_use' && b.name === 'save_translations') && /no live call was ever made/i.test(REPLY.$why))

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the recorded reply → rows: good ones ok, every existing check still applied')
  const W = Object.fromEntries(one.writes.map(r => [r.locale, r]))
  for (const l of ['de-DE', 'fr-FR', 'ja-JP', 'ar-AE']) t(`${l}: ok, its text as the model sent it`, W[l]?.status === 'ok' && W[l].question && W[l].answer && W[l].title === null && W[l].model === 'claude-sonnet-5-5', W[l])
  t('"" fields read as null — the rows have the shape they always had (title null on a question)', ['de-DE', 'fr-FR', 'ja-JP', 'ar-AE'].every(l => W[l].title === null))
  const fr = REPLY.message.content.find(b => b.type === 'tool_use').input.translations.find(e => e.locale === 'fr-FR').answer
  t('the fixture\'s broken entries really differ from the good French (a token removed, a figure added)', fr.includes('{pro.fee}') && fr.includes('{payg.price}'))
  t('es-ES (a token dropped): failed — the token check', W['es-ES']?.status === 'failed' && /\{pro\.fee\}/.test(W['es-ES'].reason), W['es-ES']?.reason)
  t('it-IT (paying at the truck): failed — the banned-wording check', W['it-IT']?.status === 'failed' && /pay at|Pay at Hatch|truck/i.test(W['it-IT'].reason), W['it-IT']?.reason)
  t('nl-NL (a typed figure): failed — the digits check', W['nl-NL']?.status === 'failed' && /digit|number|figure|30/i.test(W['nl-NL'].reason), W['nl-NL']?.reason)
  t('pl-PL (far too short): failed — the length check', W['pl-PL']?.status === 'failed' && /short|length/i.test(W['pl-PL'].reason), W['pl-PL']?.reason)
  const notReturned = one.writes.filter(r => r.reason === 'not returned by the model').map(r => r.locale)
  t(`the bases the reply left out: failed "not returned by the model" (${notReturned.length}), retried next run — as before`, notReturned.length === M.TRANSLATED_BASES.length - 8 && !notReturned.includes('de-DE'))
  const usd = M.costOf(REPLY.message.usage, 'claude-sonnet-5-5', PRICES).usd
  t(`the cost: the settings' Sonnet prices × the reply's usage ($${usd.toFixed(4)}), in the report and the log line`, Math.abs(one.report.usd - usd) < 1e-9 && one.lines.some(l => l.includes(`$${usd.toFixed(4)}`)))
  t('one call for one question (limit 41 = its 41 locales)', one.calls.length === 1 && one.report.done === 1)

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the checker\'s conversation: nudged once without the call, sent back once to fix')
  {
    const noCall = { ...clone(REPLY.message), id: 'msg_nocall', content: [{ type: 'text', text: 'Here are the translations…' }], stop_reason: 'end_turn' }
    const r = await run({ queue: [noCall, clone(REPLY.message)], limit: 41 })
    const second = r.calls[1]
    t('a reply without save_translations is nudged once ("Call save_translations now…"), then the call is accepted', r.calls.length === 2 && /Call save_translations now/.test(JSON.stringify(second.messages.at(-1))) && r.writes.filter(w => w.status === 'ok').length === 4)
    t('…and both turns are paid for', Math.abs(r.report.usd - 2 * usd) < 1e-9)
  }
  {
    const bad = clone(REPLY.message); bad.id = 'msg_bad'; bad.content[1].input = { translations: 'not a list' }
    const r = await run({ queue: [bad, clone(REPLY.message)], limit: 41 })
    t('a malformed call is answered "Rejected — fix these…" with the reason, then the fixed call is accepted', r.calls.length === 2 && (r.calls[1].messages.at(-1).content || []).some(b => b.type === 'tool_result' && b.is_error && /^Rejected — fix these and call save_translations again: "translations" must be an array/.test(b.content)) && r.writes.filter(w => w.status === 'ok').length === 4)
  }
  t('validateTranslations: entries keep only the schema\'s keys; a bad locale or a non-text field is refused', JSON.stringify(M.validateTranslations({ translations: [{ locale: 'de-DE', question: 'Q', answer: 'A', answer_single_plan: '', title: '', extra: 1 }] }).value) === '[{"locale":"de-DE","question":"Q","answer":"A","answer_single_plan":"","title":""}]'
    && !M.validateTranslations({ translations: [{ locale: 'German', question: 'Q' }] }).ok && !M.validateTranslations({ translations: [{ locale: 'de-DE', question: 3 }] }).ok)

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · limit — 1 is one question into one language')
  {
    const r = await run({ queue: [clone(REPLY.message)], limit: 1 })
    const asked = JSON.parse(r.calls[0].messages[0].content).locales.map(l => l.locale)
    t(`limit 1: one call, ONE locale asked (${asked.join()}), one row written`, r.calls.length === 1 && asked.length === 1 && r.writes.length === 1 && r.writes[0].locale === asked[0], { asked, writes: r.writes.map(w => w.locale) })
    t('…and the rest is left for the next run, said in one line', r.lines.some(l => /--limit 1: \d+ translation\(s\) left for the next run/.test(l)))
  }
  {
    // With the section the questions sit in: the question still comes first (the titles follow the questions).
    const A = api([clone(REPLY.message)]), writes = []
    const sec = { id: 'sec-1', titleEn: 'Pricing', hash: 'b'.repeat(64) }
    const its = items.map(i => ({ ...i, sectionId: 'sec-1' }))
    await kit.quietAsync(() => M.runTranslator({ read: async () => ({ items: its, sections: [sec], translations: [] }), contextOf: ctxOf, call: req => M.modelCall(A.fn, PRICES)(req), write: async rows => { writes.push(...rows) }, remove: async () => {}, prices: PRICES, now: () => 'x', log: () => {} }, { dryRun: false, maxUsd: 2, limit: 1 }))
    t('limit 1 with sections to translate too: still ONE QUESTION into one language (questions are queued before section titles)', A.calls.length === 1 && 'question' in JSON.parse(A.calls[0].messages[0].content).english && writes.length === 1 && writes[0].item_id === its[0].id)
  }
  {
    const r = await run({ queue: [clone(REPLY.message)], limit: 5 })
    t('limit 5: five translations — the first question\'s first five locales, one call', r.calls.length === 1 && JSON.parse(r.calls[0].messages[0].content).locales.length === 5)
  }
  {
    const r = await run({ queue: [clone(REPLY.message), clone(REPLY.message), clone(REPLY.message)] })
    t('no limit: every question (3 calls)', r.calls.length === 3 && r.report.done === 3)
  }

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · a 400 invalid_request_error stops the run at the first call')
  {
    const msg = 'tool_choice: type "tool" and "any" are not supported for this model'
    const r = await run({ queue: [badRequest(msg), badRequest(msg), badRequest(msg)] })
    const stopLines = r.lines.filter(l => /^STOPPED:/.test(l))
    t('one call only — not one per question', r.calls.length === 1 && r.report.done === 0 && r.report.stopped === 'invalid_request')
    t('ONE clear line: "STOPPED: the API refused the request (400 invalid_request_error)…", with the API\'s message', stopLines.length === 1 && stopLines[0].includes('400 invalid_request_error') && stopLines[0].includes(msg) && !r.lines.some(l => /model call FAILED/.test(l)), r.lines)
    t('nothing written', r.writes.length === 0)
    t('the script exits non-zero on it (main.ts)', read('scripts/faq-translate/main.ts').includes("if (!dryRun && report.stopped === 'invalid_request') { console.error('Stopped: the API refused the request (see the STOPPED line above).'); process.exit(1) }"))
  }
  {
    const r = await run({ queue: [overloaded(), clone(REPLY.message), clone(REPLY.message)] })
    t('a 529 overloaded is not that: that question is retried next run and the others go ahead', r.calls.length === 3 && r.report.done === 2 && !r.report.stopped && r.lines.some(l => /model call FAILED — 529/.test(l)))
  }
  t('isInvalidRequest: only a 400 invalid_request_error', M.isInvalidRequest(badRequest('x')) && !M.isInvalidRequest(overloaded()) && !M.isInvalidRequest(Object.assign(new Error('401'), { status: 401 })) && !M.isInvalidRequest(null))

  // ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · the workflow, the script, and no tool_choice left')
  const wf = read('.github/workflows/faq-translate.yml'), main = read('scripts/faq-translate/main.ts'), tr = read('lib/faq/translator.ts')
  t('workflow_dispatch has a `limit` input, default blank (everything)', /limit:\n\s+description: 'At most this many translations \(1 = one question into one language\)\. Blank = everything'\n\s+required: false\n\s+default: ''/.test(wf))
  t('…passed as an environment variable, and to the script as --limit only when set', /LIMIT: \$\{\{ github\.event\.inputs\.limit \}\}/.test(wf) && /if \[ -n "\$\{LIMIT:-\}" \]; then args\+=\(--limit "\$LIMIT"\); fi/.test(wf))
  t('the script validates --limit (a whole number above 0)', /--limit must be a whole number above 0/.test(main))
  const code = s => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  t('no tool_choice in the translator or its script (comments aside)', !/tool_choice/.test(code(main)) && !/tool_choice/.test(code(tr)))
  t('the call is the checker\'s converse (imported, not copied) over the SDK\'s beta Messages API, as the checker\'s main.ts calls it', /import \{ converse, type CheckerDeps \} from '@\/lib\/competitor-check\/checker'/.test(tr) && /anthropic\.beta\.messages\.stream\(params as never, opts\?\.signal \? \{ signal: opts\.signal \} : undefined\)\.finalMessage\(\)/.test(main) && /modelCall\(/.test(main))
  t('the login is still keyless (Workload Identity Federation), checked only when there is something to translate', /if \(process\.env\.ANTHROPIC_API_KEY\) throw new Error/.test(main) && /ANTHROPIC_FEDERATION_RULE_ID/.test(main))

  console.log(`\nfaq-translate-fix: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
