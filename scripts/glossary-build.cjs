#!/usr/bin/env node
// scripts/glossary-build.cjs — 🔴 THE GLOSSARY AS DATA (languages-1, 22 October 2026, docs/languages-1-report.md §4).
//
//   node scripts/glossary-build.cjs           write lib/i18n/glossary/<language>.json from docs/i18n/seo-glossary-eu.md
//   node scripts/glossary-build.cjs --check   change nothing; exit 1 if any glossary file is missing or stale
//
// The MARKDOWN stays the human source (docs/i18n/seo-glossary-eu.md — the locked terms per language). This turns each
// language's table into JSON a check can enforce (scripts/translation-check.cjs):
//   • concepts — { concept, use: [the bold Use terms], alts, scope, conf, notes, en } — `en` is how en-GB words the concept
//     (a pattern below), so the check knows WHICH messages must carry the Use term;
//   • the "Pay at Hatch" / plan-name recommendations row (feature name, short label, Pay as you go, Unlimited, Free trial);
//   • banned — terms the glossary forbids (the traps: DE "Kommission", IT "prenotazione", NL "maaltijddeal", an untranslated
//     "hatch" anywhere), and the invariants every language keeps (HatchGrab, Pro).
// A new language: add its table to the markdown (or a new section) and run this; the country recipe runs it
// (docs/i18n/add-a-country.md). ⚠️ Low-confidence rows ("Conf. Low") are kept and flagged for a native check, never dropped.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const CHECK = process.argv.includes('--check')
const SRC = 'docs/i18n/seo-glossary-eu.md'

/** How en-GB words each concept — a message whose en-GB text matches must carry the language's Use term. Only concepts whose
 *  English is unambiguous are listed (e.g. "menu" is not: it is the dish list and, in some languages, a combo). */
const EN = {
  'Food truck': '\\bfood trucks?\\b',
  'Street food': '\\bstreet food\\b',
  'Pre-order': '\\bpre-?orders?\\b',
  'Collection/pickup time': '\\b(collection|pick-?up) times?\\b',
  'Pickup time': '\\b(collection|pick-?up) times?\\b',
  'Time slot': '\\btime ?slots?\\b',
  'Kitchen capacity': '\\bkitchen capacity\\b',
  'KDS': '\\bkitchen (display|screen)s?\\b',
  'Allergens': '\\ballergens?\\b',
  'Private event': '\\bprivate events?\\b',
  'Private hire': '\\bprivate hire\\b',   // france-1 follow-up (22 October 2026): hiring a truck, split from Private event
  'WhatsApp auto-reply': '\\bauto-?repl(y|ies)\\b',
  'Card reader': '\\bcard readers?\\b',
  'Commission-free': '\\bcommission\\b',
}
/** The terms a language must never use (from the glossary's notes and global rules), as case-insensitive patterns. */
const BANNED = {
  de: [{ pattern: '\\bKommission', why: 'say "Provision" / "provisionsfrei" — never "Kommission"' }],
  it: [{ pattern: '\\bprenotazion', why: '"prenotazione" is a table booking — use "ordina in anticipo" / "preordine"' }],
  nl: [{ pattern: 'maaltijddeal', why: 'the combo is "combideal", not "maaltijddeal"' }],
}
const EVERY_LANGUAGE_BANNED = [{ pattern: '\\bhatch\\b', why: '"Pay at Hatch" is translated and the word "hatch" means nothing outside English (glossary rule 2)' }]
const INVARIANTS = [{ term: 'HatchGrab', why: 'the brand — never translated (rule 1)' }, { term: 'Pro', why: 'the plan name stays "Pro" everywhere (rule 1)', word: true }]

const LANG_OF_HEADING = { DE: 'de', NL: 'nl', FR: 'fr', ES: 'es', IT: 'it', PT: 'pt', SV: 'sv', DA: 'da', NB: 'nb', PL: 'pl', CS: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', HR: 'hr', SL: 'sl', FI: 'fi', ET: 'et', LV: 'lv', LT: 'lt', EL: 'el', BG: 'bg' }   // europe-languages-1: + PT, SV, DA, NB; europe-languages-2: + 13
const md = fs.readFileSync(path.join(REPO, SRC), 'utf8')
const cells = line => line.split('|').slice(1, -1).map(c => c.trim())
const bold = c => [...c.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1].trim())
const plain = c => c.replace(/\*\*/g, '').replace(/\*([^*]+)\*/g, '$1').trim()

// The recommendations table (Pay at Hatch and plan names), one row per language code.
const recs = {}
{
  const at = md.indexOf('## "Pay at Hatch" and plan names')
  const block = md.slice(at, md.indexOf('\n---', at))
  for (const line of block.split('\n').filter(l => /^\| \*\*[A-Z]{2}(-[A-Z]{2})?\*\*/.test(l))) {
    const c = cells(line)
    const code = plain(c[0]).split(' ')[0]
    const [lang, region] = code.toLowerCase().split('-')
    const strip = s => plain(s).replace(/\s*\(sub:.*\)$/, '').replace(/\s*\(AT\/CH:.*\)$/, '').trim()
    const row = { payAtHatchFeature: strip(c[1]), payAtHatchShort: strip(c[2]), payAsYouGo: strip(c[3]), unlimited: strip(c[4]), freeTrial: strip(c[5]) }
    if (region) (recs[lang] ??= {}).regions = { ...(recs[lang]?.regions ?? {}), [code]: row }
    else recs[lang] = { ...(recs[lang] ?? {}), ...row }
  }
}

const want = new Map()
for (const [heading, lang] of Object.entries(LANG_OF_HEADING)) {
  const at = md.search(new RegExp(`\\n## ${heading} — `))
  if (at < 0) throw new Error(`${SRC}: no "## ${heading} — " section`)
  const end = md.indexOf('\n## ', at + 4)
  const block = md.slice(at, end < 0 ? undefined : end)
  const title = block.split('\n')[1].replace(/^## /, '')
  const rows = block.split('\n').filter(l => l.startsWith('| ') && !/^\| (Concept|---)/.test(l))
  const concepts = rows.map(line => {
    const [concept, use, alts, scope, conf, notes] = cells(line)
    const c = plain(concept)
    return { concept: c, use: bold(use), alts: plain(alts), scope: plain(scope), conf: plain(conf), notes: plain(notes ?? ''), ...(EN[c] ? { en: EN[c] } : {}) }
  })
  const regional = (block.match(/\n\*\*(CH|AT|Payments|Notes|Spain only):\*\*[^\n]*/g) || []).map(s => s.trim())
  const out = {
    $comment: `GENERATED by scripts/glossary-build.cjs from ${SRC} (${title}) — DO NOT EDIT; change the markdown and re-run.`,
    language: lang,
    concepts,
    recommendations: recs[lang] ?? null,
    regionalNotes: regional,
    banned: [...(BANNED[lang] ?? []), ...EVERY_LANGUAGE_BANNED],
    invariants: INVARIANTS,
  }
  want.set(`lib/i18n/glossary/${lang}.json`, JSON.stringify(out, null, 2) + '\n')
}

if (require.main === module) {
const problems = []
for (const [f, content] of want) {
  const abs = path.join(REPO, f)
  const now = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
  if (now === content) continue
  problems.push(`${now === null ? 'missing' : 'stale'}: ${f}`)
  if (!CHECK) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content) }
}
if (CHECK) {
  if (problems.length) { console.log(`✗ the glossary JSON is out of step with ${SRC} — run node scripts/glossary-build.cjs\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`✓ lib/i18n/glossary/*.json match ${SRC} (${want.size} languages)`)
} else console.log(problems.length ? `glossary-build: ${problems.length} file(s) written` : 'glossary-build: up to date')
}

module.exports = { EN, BANNED, EVERY_LANGUAGE_BANNED, INVARIANTS, built: want }
