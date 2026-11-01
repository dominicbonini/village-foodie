#!/usr/bin/env node
// scripts/legal-languages-1-audit.cjs — legal-languages-1 (1 November 2026, docs/legal-languages-1-report.md §4): THE WHOLE-PRODUCT
// LANGUAGE AUDIT. A visitor, a customer or a truck must only ever see their own language.
//
//   node scripts/legal-languages-1-audit.cjs [--locales fr-FR,ja-JP] [--jobs 3] [--reuse]
//
// For EVERY language base (lib/i18n/locales.ts LANGUAGE_BASES), scripts/languages-1-e2e.cjs renders every surface the language
// phases capture — the customer order page, status page, customer emails, WhatsApp replies (1a); dashboard, KDS, tickets,
// operator emails (1b); setup, sign-in, signup, demo, go-live, the account API answers and emails (1c); Manage's Menu,
// Schedule, Settings (1d) and the rest of Manage — Payments, Billing, Team, Social, the poster, WhatsApp, the domain (1d2);
// the marketing pages, /features, /compare, the plans PDF, Billing (1e) — with the fixture truck in that language, every
// country switched on. This audit then reads every rendered view (visible text, <title> and meta, OG, JSON-LD, alt text, aria
// labels, form errors, API error messages, toasts — whatever the view carries) and FAILS on:
//   • AN ENGLISH SENTENCE in a non-English view — three or more consecutive words that are English (in en-GB's own messages),
//     not words of the language itself (its messages file) and not the fixtures' own data (a dish, a truck, a customer name);
//   • A WRONG-LANGUAGE SENTENCE in an ENGLISH (GB) view — three or more consecutive words of another language that English
//     does not use.
// Single shared words ("Conditions", "maximum", "Halal") are not sentences and do not fail. The legal documents themselves are
// proved by scripts/legal-languages-1.cjs (they quote laws by their English names on purpose).
//
// 🔴 EXCLUDED, EACH WITH ITS REASON (EXCLUDE below): views whose English is the HARNESS's own input rather than the product's
// words (a notice string injected into state, a builder called without the locale its real caller passes), legacy en-GB
// constant exports no screen renders, and emails that go to HatchGrab staff (admin, English by design). An API answer's English
// `error` is its FALLBACK when its `code` has a translation in the language — the client words the code — so it is not counted.
// The admin pages (Dominic only) stay English and are not captured: app/admin, /api/admin/*.
// Dumps (tens of MB a language) stay in the scratch folder; the summary is docs/legal-languages-1/audit-summary.json.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const REPO = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const LOC = fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8')
const BASES = JSON.parse('[' + /export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/.exec(LOC)[1].replace(/'/g, '"') + ']')
const LOCALES = arg('--locales', null)?.split(',') ?? BASES
const JOBS = Number(arg('--jobs', '3'))
const REUSE = argv.includes('--reuse')
const DUMPS = path.join(process.env.LL1_AUDIT_DIR || path.join(os.tmpdir(), 'hg-legal-languages-1-audit'))
const SUMMARY = path.join(REPO, 'docs/legal-languages-1/audit-summary.json')

// The fixture truck's clock and money per language (its country's), as the world-countries / europe runs pass them.
const CURRENCY = { 'fr-FR': 'EUR', 'de-DE': 'EUR', 'es-ES': 'EUR', 'it-IT': 'EUR', 'pt-PT': 'EUR', 'nl-NL': 'EUR', 'sv-SE': 'SEK', 'da-DK': 'DKK', 'nb-NO': 'NOK',
  'pl-PL': 'PLN', 'cs-CZ': 'CZK', 'hu-HU': 'HUF', 'sk-SK': 'EUR', 'ro-RO': 'RON', 'hr-HR': 'EUR', 'sl-SI': 'EUR', 'fi-FI': 'EUR', 'et-EE': 'EUR', 'lv-LV': 'EUR',
  'lt-LT': 'EUR', 'el-GR': 'EUR', 'bg-BG': 'EUR', 'pt-BR': 'BRL', 'ms-MY': 'MYR', 'ja-JP': 'JPY', 'zh-HK': 'HKD', 'th-TH': 'THB', 'ar-AE': 'AED' }

/** Views whose English is the harness's input, not the product's — [view id pattern, reason]. */
const EXCLUDE = [
  [/^1d\/copy\//, 'legacy en-GB constant exports (lib/copy/*, lib/settings-copy.ts, lib/kitchen-capacity.ts) kept for old callers; every screen words these from messages — the 1d/settings, 1d/schedule and 1b/dashboard views of the same settings are checked'],
  [/^1a\/1a\/orderPage\/US\|(notices|paymentFailed)$/, 'the harness injects English notice strings straight into the page state; the real page sets them from the translated error code'],
  [/^1a\/1a\/emails\/rejectSentence\|/, 'the harness calls rejectionPaymentSentence without a locale; its real caller (lib/orders/reject-order.ts) passes the order\'s'],
  [/^1a\/1a\/whatsapp\/US\|menuLlmCaveat$/, 'the model\'s reply is a fixture (English); the caveat the product adds is in the language'],
  [/^1d2\/poster\/US\|caption\|week\.weekCaption$/, 'weekCaption() is legacy and unused (captions come from caption-template.ts, in the language)'],
  [/^1d2\/poster\/US\|qr\|/, 'the harness draws the QR poster with its English default; Manage passes the translated "Powered by" (qrPoweredBy)'],
  [/^1d2\/social\/US\|/, 'the social views\' upload messages are fixture state (msg: { text: … })'],
  [/^1c\/api\/US\|build-request\|/, 'the "build my menu" email goes to HatchGrab staff — admin, English by design'],
  [/^1d2\/api\/US\|manage\|domainCheck\./, 'the custom-domain check email goes to HatchGrab staff — admin, English by design'],
  [/^1c\/setup\/US\|provision\|/, 'provisioning warnings answer the admin create-operator tool — admin, English by design'],
  [/^1c\/demo\/US\|gs\|confirm\|/, 'the demo truck\'s deletion date is formatted by the fixture truck\'s own (US) time settings; a real demo truck has its country\'s'],
  [/^1c\/api\/US\|(change-email|resend-verification|forgot-password)\|/, 'the harness operator has no truck and its request names no country, so en-GB is the right fallback; with a truck (or a visitor country) the email is in that language — lib/i18n/server-locale.ts localeForOperator, proved by scripts/legal-languages-1.cjs §5'],
  [/^1c\/api\/US\|deletion\|post\|/, 'the [ACTION] email goes to HatchGrab staff (admin, English); the operator\'s own email follows their truck\'s language — okNoTrucks has no truck, so en-GB'],
  [/^1d2\/poster\/US\|copy\|socialPosts\|/, 'a dump of lib/copy/socialPosts.ts constant NAMES (EVENT_BOX_POSTER_SHAPE …) beside their translated values'],
  [/^1c\/setup\/US\|press\|identity\|back$/, 'a harness error string ("ERROR no button Back in …") — the capture could not find the button, not product text'],
  [/^1d2\/api\/US\|waPreview\|/, 'the WhatsApp preview\'s replies are fixture model output (with the harness\'s SPECIFIC token); the product\'s caveats are in the language'],
  [/^1c\/setup\/GB\|provision\|refuse\|countryOff$/, 'on an ENGLISH page: the setup wizard words a refusal in the CHOSEN country\'s language (here the switched-off country is the run\'s own) — the wizard speaks the country being signed up from, by design (Language Phase 1c, lib/provision-truck.ts tradeAreaWords)'],
  [/^1d\/schedule\/US\|eventTypes\|/, 'the harness injects its event-type rows straight into the panel\'s state, named "Private event" as stored; the product renames the private type as it loads them (components/manage/EventTypes.tsx withPrivateName, proved by scripts/legal-languages-1.cjs §5)'],
]

function runOne(locale) {
  const out = path.join(DUMPS, locale)
  if (REUSE && fs.existsSync(path.join(out, 'views.json'))) return Promise.resolve(0)
  fs.mkdirSync(out, { recursive: true })
  const args = ['scripts/languages-1-e2e.cjs', '--locale', locale, '--dump', '--dump-gb', '--out', path.relative(REPO, out)]
  if (CURRENCY[locale]) args.push('--currency', CURRENCY[locale])
  args.push('--time', locale === 'ms-MY' || locale === 'ar-AE' ? '12h,dmy,monday' : '24h,dmy,monday')
  return new Promise(res => {
    const p = spawn(process.execPath, args, { cwd: REPO, stdio: ['ignore', fs.openSync(path.join(out, 'run.log'), 'w'), fs.openSync(path.join(out, 'run.log'), 'a')] })
    p.on('exit', code => res(code))
  })
}

// ── the words ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const flatVals = (o, out = []) => { for (const v of Object.values(o ?? {})) typeof v === 'string' ? out.push(v) : flatVals(v, out); return out }
const wordsIn = s => (s.replace(/\{[^}]*\}/g, ' ').replace(/<[^>]+>/g, ' ').match(/\p{L}[\p{L}’'-]*/gu) || []).map(w => w.toLowerCase().replace(/[’']s$/, ''))
const vocabOf = locale => new Set(flatVals(JSON.parse(fs.readFileSync(path.join(REPO, `messages/${locale}.json`), 'utf8'))).flatMap(wordsIn))
const EN = vocabOf('en-GB')
// The FIXTURES' OWN DATA — dish, category, deal, truck, customer, venue and note values the harnesses write into their fake
// database — blanked from a view before it is read, so "Sides · Garlic bread" (an operator's own menu) is never a finding.
// ⛔ A phrase of three or more words that is also in en-GB's own messages is NOT data (a harness quoting a product sentence must not
// hide one). A one- or two-word NAME is data even when en-GB has the same word: the fixture menu's "Drinks", "Coke", "Sides",
// "Olives" are also the sample menu's words, and an operator's stored menu is shown as stored in every language (it is theirs).
// It is blanked as a whole word only, and translation-check proves no product key is missing in any language.
const EN_TEXT = flatVals(JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))).join('\n')
const FIXTURE_FILES = fs.readdirSync(path.join(REPO, 'scripts')).filter(f => /\.cjs$/.test(f) && /fixture|_lp1[a-e]|_lp1d2|_lp1c|_country-settings|_plans-catalog|_fake|^language-phase-1[a-e]/.test(f))
const FIXTURE_PHRASES = (() => {
  const P = new Set()
  for (const f of FIXTURE_FILES) {
    const src = fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')
    for (const m of src.matchAll(/\b(name|title|description|notes?|venue|venue_name|town|location|label|customer_name|category|caption|special_instructions|specialInstructions|reason|rejectionReason|cancellationReason|pause_reason|address|area|short_name|display_name|truck_name|truckName|itemName|text|preorderLabel)\s*:\s*(['"`])([^'"`\n]{2,80})\2/g)) {
      if (/[a-z]/i.test(m[3]) && (m[3].trim().split(/\s+/).length <= 2 || !EN_TEXT.includes(m[3]))) P.add(m[3])
    }
    // stored dietary / allergen tags the fixtures write in lower case ("vegetarian", "gluten") — not a set's labels, so shown as stored
    for (const m of src.matchAll(/\b(dietary_info|dietary|allergens)\s*:\s*\[([^\]\n]*)\]/g)) for (const t of m[2].matchAll(/(['"])([a-z][a-z ]{1,30})\1/g)) P.add(t[2])
  }
  return [...P].sort((a, b) => b.length - a.length)
})()
// The harness modules' own text (their fixture state, injected notices, typed notes, fake server answers), as one string.
const HARNESS_TEXT = fs.readdirSync(path.join(REPO, 'scripts')).filter(f => /\.cjs$/.test(f) && /^_|language-phase|languages-1/.test(f))
  .map(f => fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')).join('\n').replace(/\\n/g, ' ').replace(/\s+/g, ' ').toLowerCase()
const EN_FLAT = EN_TEXT.replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').toLowerCase()
const bigrams = r => { const w = r.toLowerCase().split(' '); return w.slice(1).map((x, i) => `${w[i]} ${x}`) }
/** Where an English run comes from: 'harness' (the harness wrote it — fixture state, a typed note, a fake answer), 'en-GB' (it is
 *  English product text, every word pair of it in en-GB's messages — the capture rendered that state in en-GB), or null (unexplained). */
function sourceOf(run) {
  const r = run.toLowerCase()
  if (HARNESS_TEXT.includes(r) && !EN_FLAT.includes(r)) return 'harness'
  if (EN_FLAT.includes(r) || bigrams(run).every(b => EN_FLAT.includes(b))) return 'en-GB'
  if (bigrams(run).every(b => HARNESS_TEXT.includes(b) || EN_FLAT.includes(b))) return 'harness'
  return null
}
const esc = p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const FIXTURE_RE = FIXTURE_PHRASES.map(p => [p, new RegExp(`(?<![\\p{L}])${esc(p)}(?![\\p{L}])`, 'gu')])
const blankData = s => FIXTURE_RE.reduce((x, [p, re]) => (x.includes(p) ? x.replace(re, ' · ') : x), s)
/** Words a view quotes on purpose, blanked in those views only — [view id pattern, words, reason]. */
const QUOTED = [
  [/^1d2\/(wada|api\/US\|manage\|instructions|domain)/, /\b(Type|Name|Value|Target|Host|Points to|Proxy status|DNS only|TTL|Auto|Save)\b/g, 'a DNS provider\'s own field names, quoted exactly as its screen spells them (lib/custom-domain/dns.ts fieldLabels — verified per provider) so the truck can match them letter for letter'],
]
const BRANDS = new Set(['hatchgrab', 'whatsapp', 'stripe', 'apple', 'google', 'pay', 'play', 'store', 'app', 'iphone', 'ipad', 'android', 'meta', 'instagram', 'facebook', 'tiktok', 'tap', 'to', 'village', 'foodie', 'face', 'id', 'touch', 'bluetooth', 'gmail', 'outlook', 'cloudflare', 'godaddy', 'wix', 'squarespace', 'ionos', 'namecheap', 'manager', 'business', 'cname', 'dns', 'png', 'jpg', 'pdf', 'csv', 'qr', 'pin', 'url', 'ok', 'pro', 'eftpos', 'visa', 'mastercard', 'amex'])

/** A view's visible words, with an API answer's fallback `error` removed when its code has a translation in the language. */
function textOf(v, codes) {
  let s = typeof v === 'string' ? v : JSON.stringify(v)
  // an API body (JSON inside JSON): drop `error` when its `code` is worded by the client in the language
  // any API answer that carries a `code`: the client words the code (lib/i18n/*-errors.ts errorText, across the error
  // namespaces), so its English `error` is only the fallback — translation-check proves every code's words exist
  s = s.replace(/\\"error\\":\\"((?:[^"\\]|\\\\.)*)\\"(?=[^{}]*\\"code\\":\\"([a-z0-9_]+)\\")/g, '')
    .replace(/"error":"((?:[^"\\]|\\.)*)"(?=[^{}]*"code":"([a-z0-9_]+)")/g, '')
  return s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\[nrt]/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ').replace(/\\?"[a-zA-Z_]+\\?":/g, ' ').replace(/(https?:\/\/\S+|www\.\S+|\S+@\S+|\/[\w./?=&%-]+)/g, ' ')
    .replace(/\\?"code\\?":\\?"[a-z0-9_]+\\?"/g, ' ').replace(/\b[a-z]+(_[a-z0-9]+)+\b/g, ' ')
}
/** The harness's own recordings in an API view — the fake storage's and fetch's call logs, a fake failure's "harness: …" text — and
 *  settings DATA (a country row's card-fee region label, which the screens word through lib/card-fees.ts cardRegionLabel). */
const dropHarness = s => s.replace(/\\?"(storage|fetches|calls|writes)\\?":\[(\[[^\]]*\],?|[^\]]*)*\]/g, ' ').replace(/harness: [^"\\]*/g, ' ')
  .replace(/\\?"cardFeeRegionLabel\\?":\\?"[^"\\]*\\?"/g, ' ')
/** Runs of ≥ min consecutive words that `isForeign` says do not belong. */
function runs(s, isForeign, min = 3) {
  const out = []; let cur = []
  const flush = () => { if (cur.length >= min) out.push(cur.join(' ')); cur = [] }
  for (const tok of s.split(/(\p{L}[\p{L}’'-]*)/u)) {
    if (/^\p{L}/u.test(tok)) { if (isForeign(tok)) cur.push(tok); else flush() } else if (/[.!?;:|·•…—\n]|^\s*[,"()[\]{}]/.test(tok) || /\d/.test(tok)) flush()
  }
  flush()
  return out
}

function analyse(locale) {
  const dir = path.join(DUMPS, locale)
  const views = JSON.parse(fs.readFileSync(path.join(dir, 'views.json'), 'utf8'))
  const gb = fs.existsSync(path.join(dir, 'views-gb.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'views-gb.json'), 'utf8')) : {}
  const own = vocabOf(locale)
  const messages = JSON.parse(fs.readFileSync(path.join(REPO, `messages/${locale}.json`), 'utf8'))
  const codes = new Set(Object.entries(messages).filter(([k]) => /^errors/.test(k)).flatMap(([, v]) => Object.keys(v)))
  // ⚠️ NOT the fixtures' word list (it holds ordinary English from the harness modules); fixture names are two-word names that a
  // three-word run does not reach, and a view whose English is fixture input is excluded by name (EXCLUDE).
  const isEnglish = w => { const l = w.toLowerCase().replace(/[’']s$/, ''); return /^[a-z’'-]+$/i.test(w) && EN.has(l) && !own.has(l) && !BRANDS.has(l) }
  const english = [], excluded = [], captureOnly = []
  for (const [id, v] of Object.entries(views)) {
    const quoted = QUOTED.filter(([re]) => re.test(id)).reduce((x, [, w]) => x.replace(w, ' · '), dropHarness(String(typeof v === 'string' ? v : JSON.stringify(v))))
    const found = runs(blankData(textOf(quoted, codes)), isEnglish)
    if (!found.length) continue
    const why = EXCLUDE.find(([re]) => re.test(id))
    if (why) { excluded.push({ id, runs: [...new Set(found)].slice(0, 4), reason: why[1] }); continue }
    const unexplained = [...new Set(found)].filter(r => !sourceOf(r))
    const explained = [...new Set(found)].filter(r => sourceOf(r))
    if (explained.length) captureOnly.push({ id, runs: explained.slice(0, 4).map(r => `${r} [${sourceOf(r)}]`) })
    if (unexplained.length) english.push({ id, runs: unexplained.slice(0, 4) })
  }
  // English pages: a sentence in THIS language that English does not use
  const isThis = w => { const l = w.toLowerCase(); return own.has(l) && !EN.has(l) && !BRANDS.has(l) && l.length > 1 }
  const wrong = []
  for (const [id, v] of Object.entries(gb)) {
    const found = runs(blankData(textOf(dropHarness(typeof v === 'string' ? v : JSON.stringify(v)), new Set())), isThis)
    if (!found.length) continue
    const why = EXCLUDE.find(([re]) => re.test(id.replace(/^(\w+\/[^/]+\/)GB\|/, '$1GB|')))
    if (why) excluded.push({ id: `(English page) ${id}`, runs: [...new Set(found)].slice(0, 4), reason: why[1] }); else wrong.push({ id, runs: [...new Set(found)].slice(0, 4) })
  }
  return { locale, views: Object.keys(views).length, gbViews: Object.keys(gb).length, english, excluded, captureOnly, wrongOnEnglish: wrong }
}

;(async () => {
  fs.mkdirSync(DUMPS, { recursive: true })
  console.log(`legal-languages-1 audit — ${LOCALES.length} language(s), ${JOBS} at a time; dumps in ${DUMPS}`)
  const queue = [...LOCALES], codes = {}
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) { const l = queue.shift(); const t0 = Date.now(); codes[l] = await runOne(l); console.log(`  rendered ${l} (exit ${codes[l]}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`) }
  }))
  const results = []
  let bad = 0
  for (const l of LOCALES) {
    if (!fs.existsSync(path.join(DUMPS, l, 'views.json'))) { console.log(`\n🔴 ${l}: no dump (see ${path.join(DUMPS, l, 'run.log')})`); bad++; continue }
    // A capture that failed leaves a PARTIAL dump — every view it did write could read clean, so the language fails outright.
    const log = fs.existsSync(path.join(DUMPS, l, 'run.log')) ? fs.readFileSync(path.join(DUMPS, l, 'run.log'), 'utf8') : ''
    if ((codes[l] !== undefined && codes[l] !== 0) || /✗ capture /.test(log)) { console.log(`\n🔴 ${l}: a capture failed, so its dump is partial (see ${path.join(DUMPS, l, 'run.log')})`); bad++; continue }
    const r = analyse(l); results.push(r)
    const ok = r.english.length === 0 && r.wrongOnEnglish.length === 0
    if (!ok) bad++
    console.log(`\n${ok ? '✓' : '🔴'} ${l}: ${r.views} views in the language, ${r.gbViews} English views — ${r.english.length} with an unexplained English sentence, ${r.wrongOnEnglish.length} English views with a ${l} sentence; ${r.excluded.length} excluded by rule and ${r.captureOnly.length} whose English is the capture's own (harness input, or en-GB product text the capture rendered in en-GB) — listed in the summary`)
    for (const e of r.english.slice(0, 25)) console.log(`    ✗ ${e.id}: “${e.runs.join('” · “')}”`)
    for (const e of r.wrongOnEnglish.slice(0, 10)) console.log(`    ✗ (English page) ${e.id}: “${e.runs.join('” · “')}”`)
  }
  fs.mkdirSync(path.dirname(SUMMARY), { recursive: true })
  const prev = fs.existsSync(SUMMARY) ? JSON.parse(fs.readFileSync(SUMMARY, 'utf8')) : { languages: {} }
  for (const r of results) prev.languages[r.locale] = r
  prev.generated = new Date().toISOString().slice(0, 10)
  prev.excludedRules = EXCLUDE.map(([re, why]) => ({ views: String(re), reason: why }))
  prev.adminExcluded = ['app/admin (Admin page, all tabs)', '/api/admin/*', 'emails to HatchGrab staff (build-request, domain check)', 'outreach emails (outreach_templates — out of scope, unchanged)']
  fs.writeFileSync(SUMMARY, JSON.stringify(prev, null, 1) + '\n')
  console.log(`\n${bad ? '🔴' : '✅'} legal-languages-1-audit: ${LOCALES.length - bad} of ${LOCALES.length} language(s) clean`)
  process.exit(bad ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
