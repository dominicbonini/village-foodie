#!/usr/bin/env node
// scripts/translation-check.cjs — 🔴 THE ONE CHECK EVERY NEW LANGUAGE RUNS (languages-1, 22 October 2026,
// docs/languages-1-report.md §5; the country recipe, docs/i18n/add-a-country.md, runs it).
//
//   node scripts/translation-check.cjs --locale fr-FR [--messages messages/fr-FR.json] [--glossary lib/i18n/glossary/fr.json]
//        [--back docs/i18n/back/fr-FR.json] [--report docs/<name>-translation-flags.md]
//
// It compares a language's messages file with en-GB, key by key, and sorts what it finds into two kinds:
//   STRUCTURAL — the build would be wrong: a missing key (it would fall back to English — every fallback is LISTED here, so
//     none ships unnoticed), a key en-GB lacks, an ICU message that does not parse, a placeholder / select option / plural
//     exact case / rich-text tag that differs from en-GB. ANY STRUCTURAL PROBLEM EXITS 1.
//   FLAGS — for Dominic's eye, never blocking: English left in the translation; a glossary term not used, or a banned one used;
//     a number, price or brand name changed; a string much longer than en-GB where it is likely a button or label; a back-
//     translation whose meaning drifts from en-GB; a plan with no translated name; the allergen guard's word list missing.
// `planNames.<plan key>.{name,description,subtitle}` is the one place a language may have keys en-GB lacks (lib/plan-names.ts):
// they are checked against the plan catalogue instead.
// THE BACK-TRANSLATION: whoever translates (in this project, the agent running the country prompt) also writes, for every key,
// an English back-translation of their own translation (docs/i18n/back/<locale>.json). This compares its meaning with en-GB
// (content-word overlap) and lists every key that drifts, in a short table.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))

const BRANDS = ['HatchGrab', 'Village Foodie', 'WhatsApp', 'Instagram', 'Facebook', 'Messenger', 'Stripe', 'Google Play', 'App Store', 'Apple', 'iPhone', 'iPad', 'Android', 'Tap to Pay', 'TikTok']
/** Words that are the same in English and in most of the languages we plan for, or are names — never "English left". */
const SAME_EVERYWHERE = new Set(['hatchgrab', 'whatsapp', 'instagram', 'facebook', 'messenger', 'stripe', 'google', 'apple', 'iphone', 'ipad', 'meta', 'vercel', 'squarespace', 'android', 'pro', 'online', 'email', 'e-mail', 'pizza', 'pizzas', 'menu', 'burger', 'burgers', 'chips', 'café', 'cafe', 'festival', 'total', 'status', 'logo', 'emoji', 'tiktok', 'gusto', 'pizzeria', 'village', 'foodie', 'hatch', 'grab', 'premium', 'standard', 'minimum', 'maximum', 'okay', 'stop', 'start', 'test', 'demo', 'admin', 'qr', 'pdf', 'csv', 'sms', 'url', 'dns', 'cname', 'api', 'kds'])
const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'are', 'this', 'that', 'with', 'from', 'have', 'has', 'not', 'can', 'will', 'all', 'any', 'one', 'our', 'was', 'its', 'his', 'her', 'they', 'them', 'their', 'what', 'when', 'where', 'which', 'who', 'how', 'into', 'out', 'but', 'than', 'then', 'there', 'here', 'more', 'now', 'just', 'only', 'each', 'every', 'also', 'been', 'being', 'were', 'would', 'could', 'should', 'about', 'after', 'before', 'over', 'under', 'yet', 'still', 'per', 'via', 'off', 'once', 'yes', 'no'])

function args() {
  const a = process.argv.slice(2), o = {}
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true }
  return o
}
const flat = (t, p = '', out = {}) => { for (const [k, v] of Object.entries(t ?? {})) { const key = p ? `${p}.${k}` : k; if (typeof v === 'string') out[key] = v; else flat(v, key, out) } return out }

/** An ICU message's skeleton: its arguments (name:type), select options, plural exact cases, tags — and its literal text. */
function skeleton(msg) {
  const ast = parse(msg, { ignoreTag: false, requiresOtherClause: false })
  const args = new Set(), selects = {}, plurals = {}, tags = new Set(); let text = ''
  const walk = nodes => { for (const n of nodes) {
    if (n.type === TYPE.literal) text += n.value
    else if (n.type === TYPE.argument) { args.add(`${n.value}:arg`); text += ` {${n.value}} ` }
    else if (n.type === TYPE.number || n.type === TYPE.date || n.type === TYPE.time) { args.add(`${n.value}:${['', '', 'number', 'date', 'time'][n.type] || n.type}`); text += ` {${n.value}} ` }
    else if (n.type === TYPE.select) { args.add(`${n.value}:select`); selects[n.value] = [...new Set([...(selects[n.value] ?? []), ...Object.keys(n.options)])].sort(); for (const o of Object.values(n.options)) { text += ' '; walk(o.value); text += ' ' } }
    else if (n.type === TYPE.plural) { args.add(`${n.value}:plural`); plurals[n.value] = { exact: [...new Set([...(plurals[n.value]?.exact ?? []), ...Object.keys(n.options).filter(k => k.startsWith('='))])].sort(), other: 'other' in n.options || !!plurals[n.value]?.other }; for (const o of Object.values(n.options)) { text += ' '; walk(o.value); text += ' ' } }
    else if (n.type === TYPE.tag) { tags.add(n.value); walk(n.children) }
    else if (n.type === TYPE.pound) text += ' # '
  } }
  walk(ast)
  return { args: [...args].sort(), selects, plurals, tags: [...tags].sort(), text }
}
/** The words of a text, placeholders ({name}), web addresses and e-mail addresses left out. */
// Product names of more than one word, kept verbatim in every language (a store's name is not English left).
const BRAND_PHRASES = /\b(App Store|Google Play|Tap to Pay|Apple Pay|Google Pay|WhatsApp Business)\b/g
const words = s => (s.replace(BRAND_PHRASES, ' ').replace(/\{[^}]*\}/g, ' ').replace(/(https?:\/\/\S+|www\.\S+|\S+@\S+)/g, ' ').toLowerCase().normalize('NFKC').match(/\p{L}[\p{L}'’-]*/gu) || [])
const content = s => words(s.replace(/\{[^}]*\}/g, ' ')).filter(w => w.length >= 3 && !STOP.has(w))
/** The numbers in a text, as numbers: thousands marks dropped (a space or no-break space anywhere; a comma too, where the
 *  language writes a decimal POINT), the decimal mark read as a point — so "4,000" (en) and "4 000" (fr) are both 4000, and
 *  "8.875" (en) and "8,875" (fr) both 8.875 (france-1). */
const numbersIn = (s, decimalComma = false) => {
  let x = s.replace(/\{[^}]*\}/g, ' ').replace(/(\d)[ \u00a0\u202f](?=\d{3}(?!\d))/g, '$1')
  if (!decimalComma) x = x.replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  return (x.match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(',', '.'))
}
/** A Use term → an inflection-tolerant pattern: each word must appear, its ending free (Foodtruck → Foodtrucks). */
const termRe = term => new RegExp(term.toLowerCase().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).map(w => (w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) + '[\\p{L}-]*' : w)).join('[\\s\\-]+')
  // france-1: an apostrophe matches either form — the glossary writes ' and a translation must write ’ (ICU).
  .replace(/['’]/g, "['’]"), 'iu')

/** The plural categories a message is missing for the locale: [{ arg, cat, example }]. Cardinal and ordinal plurals; whole numbers
 *  0–1000 (every category a count reaches does so well before that). */
const pluralRulesCache = new Map()
function missingPluralCategories(msg, locale) {
  const out = []
  let ast; try { ast = parse(msg, { ignoreTag: false, requiresOtherClause: false }) } catch { return out }
  const walk = nodes => { for (const n of nodes) {
    if (n.type === TYPE.plural) {
      const type = n.pluralType === 'ordinal' ? 'ordinal' : 'cardinal'
      const key = `${locale}|${type}`
      let pr = pluralRulesCache.get(key); if (!pr) { pr = new Intl.PluralRules(locale, { type }); pluralRulesCache.set(key, pr) }
      const seen = new Set()
      for (let i = 0; i <= 1000; i++) {
        if (`=${i}` in n.options) continue
        const cat = pr.select(i - (n.offset || 0))
        if (!(cat in n.options) && cat !== 'other' && !seen.has(cat)) { seen.add(cat); out.push({ arg: n.value, cat, example: i }) }
      }
      for (const o of Object.values(n.options)) walk(o.value)
    } else if (n.type === TYPE.select) { for (const o of Object.values(n.options)) walk(o.value) }
    else if (n.type === TYPE.tag) walk(n.children)
  } }
  walk(ast)
  return out
}

function check({ locale, messages, en, glossary, back, planKeys, knownPlanKeys, guardLanguages, sameWords, drops }) {
  const lang = locale.split('-')[0].toLowerCase()
  const E = flat(en), T = flat(messages)
  const S = { missing: [], extra: [], icu: [] }
  const F = { english: [], glossary: [], banned: [], invariants: [], numbers: [], length: [], drift: [], plans: [], other: [] }
  const vocab = new Set(Object.values(E).flatMap(v => content(v)))
  // france-1: words spelled the same in the language as in English ("page", "options", "service"), reviewed and listed in
  // docs/i18n/same-words/<lang>.json, are not English left. Decimal comma: from Intl, never a country check.
  const same = new Set([...SAME_EVERYWHERE, ...(sameWords ?? []).map(w => String(w).toLowerCase())])
  let decimalComma = false
  try { decimalComma = new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal')?.value === ',' } catch { /* an unknown tag */ }
  const isPlanKey = k => /^planNames\.[A-Za-z0-9_]+\.(name|description|subtitle)$/.test(k)
  for (const k of Object.keys(E)) if (!(k in T)) S.missing.push(k)
  for (const k of Object.keys(T)) if (!(k in E)) {
    // france-1: any ACTIVE plan may carry words (Pro's description, the trial's name); `planKeys` are those that need a NAME.
    if (isPlanKey(k)) { const pk = k.split('.')[1]; const known = knownPlanKeys ?? planKeys; if (known && !known.includes(pk)) S.extra.push(`${k} (no such plan)`) }
    else S.extra.push(k)
  }
  const concepts = (glossary?.concepts ?? []).filter(c => c.en && c.use?.length)
  for (const [k, t] of Object.entries(T)) {
    if (!(k in E) && !isPlanKey(k)) continue
    let st, se
    try { st = skeleton(t) } catch (e) { S.icu.push(`${k}: does not parse — ${e.message}`); continue }
    if (k in E) {
      se = skeleton(E[k])
      // europe-languages-2: a placeholder a law requires a language to leave out (docs/i18n/placeholder-drops.json) may be
      // missing — only those named there, only for that key; every other placeholder must still match.
      const mayDrop = new Set((drops?.[k]?.drop ?? []).map(n => `${n}:arg`))
      const stArgs = st.args.join(), seArgs = se.args.filter(a => !(mayDrop.has(a) && !st.args.includes(a))).join()
      if (stArgs !== seArgs) S.icu.push(`${k}: placeholders ${JSON.stringify(st.args)} ≠ en-GB ${JSON.stringify(se.args)}`)
      for (const [n, o] of Object.entries(se.selects)) if ((st.selects[n] ?? []).join() !== o.join()) S.icu.push(`${k}: select {${n}} options ${JSON.stringify(st.selects[n])} ≠ en-GB ${JSON.stringify(o)}`)
      for (const [n, p] of Object.entries(se.plurals)) { const q = st.plurals[n]; if (!q || q.exact.join() !== p.exact.join() || !q.other) S.icu.push(`${k}: plural {${n}} ${JSON.stringify(q)} — needs en-GB's exact cases ${JSON.stringify(p.exact)} and an "other"`) }
      if (st.tags.join() !== se.tags.join()) S.icu.push(`${k}: tags ${JSON.stringify(st.tags)} ≠ en-GB ${JSON.stringify(se.tags)}`)
      // europe-languages-2: THE LANGUAGE'S OWN PLURAL CATEGORIES (CLDR, via Intl.PluralRules). For every whole number a count can
      // take, the category the language's rules pick must be in the message — unless an exact case (=0, =1 …) catches that
      // number first. Polish "5 zamówień" needs `many`, Czech "3 objednávky" `few`, Slovenian "2 naročili" `two`, Latvian "0"
      // and "10–20" `zero`; a message that leaves one out shows `other`'s form, which is wrong for those numbers.
      for (const miss of missingPluralCategories(t, locale)) S.icu.push(`${k}: plural {${miss.arg}} lacks "${miss.cat}" (${locale} uses it for ${miss.example})`)
    } else se = null
    // ── flags ──
    if (se) {
      const left = words(st.text).filter(w => w.length >= 4 && vocab.has(w) && !same.has(w))
      if (t === E[k] && /\p{L}{3,}/u.test(se.text.replace(/\{[^}]*\}/g, '')) && left.length) F.english.push([k, 'identical to en-GB', E[k]])
      else if (left.length) F.english.push([k, `English word(s): ${[...new Set(left)].slice(0, 6).join(', ')}`, t])
      for (const c of concepts) if (new RegExp(c.en, 'i').test(se.text) && !c.use.some(u => termRe(u).test(st.text))) F.glossary.push([k, `"${c.concept}" → expected ${c.use.map(u => `"${u}"`).join(' / ')}`, t])
      if (/Pay at Hatch/.test(se.text) && glossary?.recommendations) { const r = glossary.recommendations; if (![r.payAtHatchFeature, r.payAtHatchShort].some(u => u && termRe(u).test(st.text))) F.glossary.push([k, `"Pay at Hatch" → expected "${r.payAtHatchFeature}" / "${r.payAtHatchShort}"`, t]) }
      for (const b of glossary?.banned ?? []) if (new RegExp(b.pattern, 'iu').test(st.text)) F.banned.push([k, b.why, t])
      for (const inv of glossary?.invariants ?? [{ term: 'HatchGrab' }, { term: 'Pro', word: true }]) {
        const re = inv.word ? new RegExp(`\\b${inv.term}\\b`) : new RegExp(inv.term)
        if (re.test(se.text) && !re.test(st.text)) F.invariants.push([k, `"${inv.term}" must stay as it is`, t])
      }
      // A source number is kept when the translation holds it under its own reading (decimal comma) or as written ("4,000").
      const en_n = numbersIn(se.text), t_n = numbersIn(st.text, decimalComma), t_raw = numbersIn(st.text, false)
      const missingN = en_n.filter(x => { const i = t_n.indexOf(x); if (i >= 0) { t_n.splice(i, 1); return false } const j = t_raw.indexOf(x); if (j >= 0) { t_raw.splice(j, 1); return false } return true })
      const missingCur = ['£', '$', '€', '%'].filter(c => se.text.split(c).length > st.text.split(c).length)
      const missingBrand = BRANDS.filter(b => se.text.includes(b) && !st.text.includes(b))
      if (missingN.length || missingCur.length || missingBrand.length) F.numbers.push([k, [missingN.length ? `number(s) ${missingN.join(', ')}` : '', missingCur.length ? `sign(s) ${missingCur.join(' ')}` : '', missingBrand.length ? `brand(s) ${missingBrand.join(', ')}` : ''].filter(Boolean).join('; ') + ' not kept', t])
      const el = se.text.trim().length, tl = st.text.trim().length
      const shortish = el <= 24 || /(button|cta|label|tab|title|action|save|cancel|confirm|submit|short|badge|chip|heading|toggle)$/i.test(k.split('.').pop())
      if (shortish && el > 0 && tl > el * 1.5 + 3) F.length.push([k, `${tl} chars vs en-GB ${el} (×${(tl / el).toFixed(2)})`, t])
      if (back) {
        const b = back[k]
        if (typeof b !== 'string') F.drift.push([k, 'no back-translation', t])
        else {
          let bt = b; try { bt = skeleton(b).text } catch { /* a plain-text back-translation */ }
          const a = new Set(content(se.text)), c = new Set(content(bt))
          const inter = [...a].filter(w => c.has(w)).length, uni = new Set([...a, ...c]).size
          const sim = uni ? inter / uni : 1
          if (sim < 0.5) F.drift.push([k, `meaning overlap ${(sim * 100).toFixed(0)}% — en-GB: "${se.text.trim().slice(0, 90)}" · back: "${bt.trim().slice(0, 90)}"`, t])
        }
      }
    }
  }
  for (const pk of planKeys ?? []) if (!(`planNames.${pk}.name` in T)) F.plans.push([`planNames.${pk}.name`, 'no translated name — the plan shows its English name from public.plans', ''])
  if (!glossary) F.other.push(['glossary', `no glossary for "${lang}" (lib/i18n/glossary/${lang}.json) — run scripts/glossary-build.cjs after adding its table`, ''])
  if (guardLanguages && !guardLanguages.includes(lang)) F.other.push(['allergen guard', `no lib/allergen-guard/${lang}.json — the WhatsApp guard FAILS SAFE for this language (every menu question gets the allergen reply)`, ''])
  if (!back) F.other.push(['back-translation', 'no back-translation file — the meaning check did not run', ''])
  return { S, F, counts: { en: Object.keys(E).length, translated: Object.keys(T).length } }
}

function report({ locale, S, F, counts }, max = 12) {
  const L = []
  const structural = S.missing.length + S.extra.length + S.icu.length
  L.push(`# Translation check — ${locale}`, '')
  L.push(`${counts.translated} keys checked against en-GB's ${counts.en}. **Structural: ${structural}** (missing ${S.missing.length} — each would show its English fallback · extra ${S.extra.length} · ICU ${S.icu.length}). Flags: ${Object.entries(F).map(([k, v]) => `${k} ${v.length}`).join(' · ')}.`, '')
  if (S.missing.length) L.push('## Missing keys (would fall back to en-GB)', '', ...S.missing.slice(0, 200).map(k => `- \`${k}\``), S.missing.length > 200 ? `- … and ${S.missing.length - 200} more` : '', '')
  if (S.extra.length) L.push('## Keys en-GB does not have', '', ...S.extra.map(k => `- \`${k}\``), '')
  if (S.icu.length) L.push('## ICU structure', '', ...S.icu.map(x => `- ${x}`), '')
  const titles = { english: 'English left', glossary: 'Glossary term not used', banned: 'Banned term used', invariants: 'Brand / plan name changed', numbers: 'Numbers, prices or brands changed', length: 'Likely to overflow (much longer than en-GB)', drift: 'Back-translation drifts from en-GB', plans: 'Plan names', other: 'Other' }
  for (const [k, rows] of Object.entries(F)) {
    if (!rows.length) continue
    L.push(`## ${titles[k]} (${rows.length})`, '', '| Key | Flag | Text |', '|---|---|---|')
    for (const [key, why, text] of rows.slice(0, max)) L.push(`| \`${key}\` | ${why.replace(/\|/g, '\\|')} | ${String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120)} |`)
    if (rows.length > max) L.push(`| … | ${rows.length - max} more | |`)
    L.push('')
  }
  return L.join('\n')
}

module.exports = { check, report, skeleton, termRe, flat, missingPluralCategories }

if (require.main === module) {
  const a = args()
  if (!a.locale) { console.error('usage: node scripts/translation-check.cjs --locale <xx-YY> [--messages f] [--glossary f] [--back f] [--report f]'); process.exit(2) }
  const read = f => JSON.parse(fs.readFileSync(path.resolve(REPO, f), 'utf8'))
  const lang = a.locale.split('-')[0].toLowerCase()
  const gFile = a.glossary || `lib/i18n/glossary/${lang}.json`
  const bFile = a.back || `docs/i18n/back/${a.locale}.json`
  const catalogPlans = (() => { try { return require('./_plans-catalog-fixture.cjs').seedCatalog(REPO).plans } catch { return null } })()
  const planKeys = catalogPlans && catalogPlans.filter(p => p.isPublic && p.active && p.name !== 'Pro').map(p => p.key)
  const knownPlanKeys = catalogPlans && catalogPlans.filter(p => p.active).map(p => p.key)
  const guardLanguages = fs.readdirSync(path.join(REPO, 'lib/allergen-guard')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
  const swFile = a['same-words'] || `docs/i18n/same-words/${lang}.json`
  // german-1 (22 October 2026): a REGIONAL VARIANT of a language (de-AT, de-CH over de-DE; de-LI over de-CH — LOCALE_PARENT in
  // lib/i18n/locales.ts) is a sparse file, so it is checked as the app reads it: its chain merged, outermost last, and its
  // back-translations likewise. A locale with no parent reads its one file, exactly as before.
  const parents = Object.fromEntries([...(/export const LOCALE_PARENT[^=]*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8'))?.[1] ?? '')
    .matchAll(/'([a-z]{2}-[A-Z]{2})':\s*'([a-z]{2}-[A-Z]{2})'/g)].map(m => [m[1], m[2]]))
  const chain = []; for (let l = a.locale; l && l !== 'en-GB'; l = parents[l]) chain.unshift(l)
  const deep = (x, y) => { const o = { ...x }; for (const [k, v] of Object.entries(y ?? {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? deep(o[k], v) : v; return o }
  const merged = (files, own) => (chain.length > 1 && !own ? files.filter(f => fs.existsSync(path.resolve(REPO, f))).reduce((acc, f) => deep(acc, read(f)), {}) : null)
  const messages = merged(chain.map(l => `messages/${l}.json`), a.messages) ?? read(a.messages || `messages/${a.locale}.json`)
  const backAll = merged(chain.map(l => `docs/i18n/back/${l}.json`), a.back) ?? (fs.existsSync(path.resolve(REPO, bFile)) ? read(bFile) : null)
  const dropsFile = path.join(REPO, 'docs/i18n/placeholder-drops.json')
  const drops = fs.existsSync(dropsFile) ? JSON.parse(fs.readFileSync(dropsFile, 'utf8'))[lang] ?? null : null
  const r = check({ locale: a.locale, messages, en: read('messages/en-GB.json'), drops,
    glossary: fs.existsSync(path.resolve(REPO, gFile)) ? read(gFile) : null, back: backAll, planKeys, knownPlanKeys, guardLanguages,
    sameWords: fs.existsSync(path.resolve(REPO, swFile)) ? read(swFile) : null })
  const md = report({ locale: a.locale, ...r }, Number(a.max) || 12)
  if (a.report) fs.writeFileSync(path.resolve(REPO, a.report), md + '\n')
  console.log(md.split('\n').slice(0, 3).join('\n'))
  process.exit(r.S.missing.length + r.S.extra.length + r.S.icu.length ? 1 : 0)
}
