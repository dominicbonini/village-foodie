// scripts/_legal-translations.cjs — legal-languages-1 (1 November 2026, docs/legal-languages-1-report.md): THE STRUCTURE OF A
// LEGAL DOCUMENT, AND WHETHER A TRANSLATION STILL MATCHES ITS ENGLISH SOURCE. A MODULE, read by scripts/legal-languages-1.cjs
// (the drift harness) and by the translators' checker.
//
// English (content/legal/*.md, en-GB) is the governing version. A translation lives at content/legal/<locale>/<file>, one per
// language base (lib/i18n/locales.ts LANGUAGE_BASES), and must keep the English document's STRUCTURE exactly:
//   • its first line is a SOURCE STAMP — `<!-- translation-of: <file> sha256:<hash of the English file> -->` — so ANY later
//     English edit fails the check until the translation is redone and re-stamped (stamp());
//   • the date line is `**<"Last updated" in the language>:** {{LAST_UPDATED}}` — the page writes the English document's own
//     date there, in the language's format, so a translation never carries a date of its own;
//   • the same headings, level by level and in order, with the same section numbers ("## 4.", "### …");
//   • the same bullet items per section, the same tables (rows × columns), the same links (targets, in order);
//   • every number the English has, and no other (dates aside — see numbersOf), every email address and web address, and
//     every processor named in the Privacy Policy's table.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const REPO = path.resolve(__dirname, '..')
const DOCS = ['privacy-policy.md', 'terms-and-conditions.md', 'country-specific-terms.md']
const DATE_TOKEN = '{{LAST_UPDATED}}'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const english = file => fs.readFileSync(path.join(REPO, 'content/legal', file), 'utf8')
const translationPath = (locale, file) => path.join(REPO, 'content/legal', locale, file)
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const stampOf = file => `<!-- translation-of: ${file} sha256:${sha(english(file))} -->`
const STAMP_RE = /^<!-- translation-of: ([\w.-]+) sha256:([0-9a-f]{64}) -->\n/

/** The translation's text without its stamp line (what the page renders). */
const body = text => text.replace(STAMP_RE, '')

/** The English date line's date ("31 October 2026"). */
function englishDate(file) {
  const m = /^\*\*Last updated:\*\* (.+)$/m.exec(english(file))
  if (!m) throw new Error(`${file}: no "**Last updated:**" line`)
  return m[1].trim()
}

/** Sections: [{ level, heading, bullets, tables: [[rows, cols]], links: [] }] — the document split at each heading. */
function sectionsOf(md) {
  const out = [{ level: 0, heading: '', bullets: 0, tables: [], links: [] }]
  let table = null
  for (const line of md.split('\n')) {
    const h = /^(#{1,6}) (.*)$/.exec(line)
    if (h) { out.push({ level: h[1].length, heading: h[2], bullets: 0, tables: [], links: [] }); table = null; continue }
    const s = out[out.length - 1]
    if (/^\s*[-*] /.test(line)) s.bullets++
    if (/^\|/.test(line)) {
      const cols = line.replace(/^\||\|\s*$/g, '').split('|').length
      if (!table) { table = [0, cols]; s.tables.push(table) }
      table[0]++
    } else table = null
    for (const m of line.matchAll(/\]\(([^)]+)\)/g)) s.links.push(m[1])
  }
  return out
}
/** "## 4. Plans, fees and trials" → "4." — the heading's own number, if it has one. */
const sectionNumber = heading => (/^(\d+(?:\.\d+)*\.?)\s/.exec(heading) || [])[1] ?? null

/** Every run of digits, as a multiset — with each DATE taken out (a date may be written with its month as a word or as a
 *  number, depending on the language). English dates are "D Month YYYY" or "Month YYYY". */
function numbersOf(md, englishDates = null) {
  // the date line is the page's to write (English: its date; a translation: the token) — not a number of the text
  let s = md.replace(/^\*\*Last updated:\*\* .*$/m, ' ').replace(/https?:\/\/\S+|www\.\S+/g, ' ').replace(DATE_TOKEN, ' ')
  const dates = []
  if (!englishDates) {
    s = s.replace(new RegExp(`(?:(\\d{1,2}) )?(${MONTHS.join('|')}) (\\d{4})`, 'g'), (_, d, m, y) => { dates.push({ d: d ?? null, m: MONTHS.indexOf(m) + 1, y }); return ' ' })
  }
  const bag = new Map()
  for (const n of s.match(/\d+/g) || []) bag.set(String(Number(n)), (bag.get(String(Number(n))) || 0) + 1)
  if (englishDates) {
    // A translation: take out each English date's year and day, and its month number only where the translation has more of
    // that number than the English text around the dates does (i.e. the month was written as a number).
    for (const dt of englishDates.dates) {
      for (const k of [dt.y, dt.d].filter(Boolean)) { const c = bag.get(String(Number(k))) || 0; if (c) bag.set(String(Number(k)), c - 1) }
      const mk = String(dt.m), have = bag.get(mk) || 0, want = englishDates.bag.get(mk) || 0
      if (have > want) bag.set(mk, have - 1)
    }
  }
  for (const [k, v] of [...bag]) if (!v) bag.delete(k)
  return { bag, dates }
}
const bagText = bag => [...bag].sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => (v > 1 ? `${k}×${v}` : k)).join(' ')

/** The Privacy Policy table's provider names ("Supabase", "Google (Gemini)" → "Google", "Gemini"), each must appear verbatim. */
function processorsOf(md) {
  const i = md.indexOf('| Provider |')
  if (i < 0) return []
  return md.slice(i).split('\n').slice(2).filter(l => l.startsWith('|')).flatMap(l => l.split('|')[1].trim().split(/[()]| and /).map(x => x.trim()).filter(Boolean))
}

/** Problems of one translation against its English source: [] when it matches. */
function compare(file, translated, { checkStamp = true } = {}) {
  const en = english(file), problems = []
  const sm = STAMP_RE.exec(translated)
  if (checkStamp) {
    if (!sm) problems.push('no source stamp on line 1 (`<!-- translation-of: … sha256:… -->`)')
    else if (sm[1] !== file || sm[2] !== sha(en)) problems.push(`STALE: the English ${file} changed since this translation (stamp ${sm[2].slice(0, 12)}…, English now ${sha(en).slice(0, 12)}…) — update the translation, then re-stamp it`)
  }
  const tr = body(translated)
  if ((tr.match(/\{\{LAST_UPDATED\}\}/g) || []).length !== 1 || !/^\*\*[^*\n]+:\*\* \{\{LAST_UPDATED\}\}$/m.test(tr)) problems.push('the date line must be `**<Last updated>:** {{LAST_UPDATED}}`, exactly once')
  const A = sectionsOf(en), B = sectionsOf(tr)
  if (A.length !== B.length) problems.push(`headings: English has ${A.length - 1}, the translation ${B.length - 1} (English: ${A.slice(1).map(s => '#'.repeat(s.level) + ' ' + s.heading).join(' | ').slice(0, 400)})`)
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const a = A[i], b = B[i], where = i === 0 ? 'before the first heading' : `under "${a.heading}" (heading ${i})`
    if (a.level !== b.level) problems.push(`${where}: heading level ${a.level}, translation ${b.level} ("${b.heading}")`)
    if (sectionNumber(a.heading) !== sectionNumber(b.heading)) problems.push(`${where}: section number "${sectionNumber(a.heading)}", translation "${sectionNumber(b.heading)}"`)
    if (a.bullets !== b.bullets) problems.push(`${where}: ${a.bullets} bullet items, translation ${b.bullets}`)
    if (JSON.stringify(a.tables) !== JSON.stringify(b.tables)) problems.push(`${where}: tables (rows×cols) ${JSON.stringify(a.tables)}, translation ${JSON.stringify(b.tables)}`)
    if (JSON.stringify(a.links) !== JSON.stringify(b.links)) problems.push(`${where}: links ${JSON.stringify(a.links)}, translation ${JSON.stringify(b.links)}`)
  }
  const ne = numbersOf(en), nt = numbersOf(tr, ne)
  if (bagText(ne.bag) !== bagText(nt.bag)) {
    const miss = [...ne.bag].filter(([k, v]) => (nt.bag.get(k) || 0) < v).map(([k, v]) => `${k} (${v - (nt.bag.get(k) || 0)})`)
    const extra = [...nt.bag].filter(([k, v]) => (ne.bag.get(k) || 0) < v).map(([k, v]) => `${k} (${v - (ne.bag.get(k) || 0)})`)
    problems.push(`numbers differ — missing from the translation: ${miss.join(', ') || 'none'}; extra in the translation: ${extra.join(', ') || 'none'}`)
  }
  for (const y of ne.dates.map(d => d.y)) if (!tr.includes(y)) problems.push(`a date's year ${y} is missing`)
  // an address at the end of an English sentence carries its full stop ("privacy@hatchgrab.com.") — not part of the address
  const emails = s => (s.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).map(x => x.replace(/\.+$/, '')).sort().join(' ')
  if (emails(en) !== emails(tr)) problems.push(`email addresses: English ${emails(en)}, translation ${emails(tr)}`)
  const webs = s => (s.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co\.uk|gov\.uk|ie|gov|gc\.ca|gov\.au|govt\.nz|fr|gi|be|bg|hr|cy|cz|dk|ee|fi|de|gr|hu|it|lv|li|lt|lu|mt|nl|no|pl|pt|ro|sk|si|es|se|ch|at|is|eu|jp|sg|hk|my|th|br|mx|ae|org|net|io|so|gov\.br|gob\.mx|go\.jp|gov\.sg|org\.hk|gov\.my|or\.th)\b/gi) || []).map(x => x.toLowerCase()).sort().join(' ')
  if (webs(en) !== webs(tr)) problems.push(`web addresses: English [${webs(en)}], translation [${webs(tr)}]`)
  for (const p of processorsOf(en)) if (!tr.includes(p)) problems.push(`processor "${p}" is not named verbatim`)
  if (/[０-９]/.test(tr)) problems.push('full-width digits — use ASCII digits 0-9')
  return problems
}

/** The translation of `file` with today's stamp on line 1 (replacing any old one). */
const stamp = (file, text) => stampOf(file) + '\n' + body(text)

module.exports = { REPO, DOCS, DATE_TOKEN, english, englishDate, translationPath, sha, stampOf, STAMP_RE, body, sectionsOf, numbersOf, processorsOf, compare, stamp }

// CLI (the translators' checker): node scripts/_legal-translations.cjs <locale> [file]
if (require.main === module) {
  const [locale, only] = process.argv.slice(2)
  if (!locale) { console.error('usage: node scripts/_legal-translations.cjs <locale> [privacy-policy.md|terms-and-conditions.md|country-specific-terms.md]'); process.exit(2) }
  let bad = 0
  for (const file of only ? [only] : DOCS) {
    const p = translationPath(locale, file)
    if (!fs.existsSync(p)) { console.log(`✗ ${locale}/${file}: missing`); bad++; continue }
    const probs = compare(file, fs.readFileSync(p, 'utf8'), { checkStamp: false })
    if (probs.length) { bad++; console.log(`✗ ${locale}/${file}: ${probs.length} problem(s)`); for (const x of probs.slice(0, 40)) console.log('   - ' + x) } else console.log(`✓ ${locale}/${file}: structure, numbers, links, addresses and processors match the English`)
  }
  process.exit(bad ? 1 : 0)
}
