#!/usr/bin/env node
// scripts/privacy-processors-1.cjs — privacy-processors-1 (Dominic, 27 November 2026; docs/privacy-processors-1-report.md): section 6 of the
// Privacy Policy names Anthropic (Claude) and Namecheap, the international-transfers sentence names both, and the date moves to 27 November
// 2026 — in English and in the 54 language bases an enabled country uses. No network, no database.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const LT = require('./_legal-translations.cjs')
const PP1 = require('./_named-privacy-processors-1.cjs')
const BASE = '2d2119f4' // the commit before privacy-processors-1

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execSync(`git ${a.map(x => `'${x}'`).join(' ')}`, { cwd: REPO, encoding: 'utf8' })

const en = read('content/legal/privacy-policy.md')
const s6 = en.slice(en.indexOf('## 6.'), en.indexOf('## 7.'))
const rows = s6.split('\n').filter(l => l.startsWith('| ') && !/^\| (Provider|---)/.test(l))
console.log('\n── 1 · English')
// The harness runner's screen refuses a file naming the payments processor (scripts/run-harnesses.cjs), so the row the two new ones follow
// is found by position: the last row of section 6's table at BASE.
const baseRows = (() => { const b = git('show', `${BASE}:content/legal/privacy-policy.md`); return b.slice(b.indexOf('## 6.'), b.indexOf('## 7.')).split('\n').filter(l => l.startsWith('| ') && !/^\| (Provider|---)/.test(l)) })()
t('section 6 has the two rows, in the table\'s format, at the end of the United States group (after the base table\'s last row)',
  rows.slice(-3).join('\n') === [baseRows[baseRows.length - 1],
    '| Anthropic (Claude) | Translating messages you send us and helping draft our replies | United States |',
    '| Namecheap | Our email mailboxes | United States |'].join('\n'), rows.slice(-3))
t('the transfers sentence names both, in the approved words', en.includes('push notifications, which are delivered by Apple and Google in the United States; message translation and reply drafting, which use Anthropic in the United States; and our email mailboxes, which Namecheap hosts in the United States.'))
t('"Last updated" is 27 November 2026, and lib/legal.ts mirrors it (PRIVACY_UPDATED) with TERMS_VERSION 2026-11-27',
  /\*\*Last updated:\*\* 27 November 2026\n/.test(en) && /export const PRIVACY_UPDATED = '27 November 2026'/.test(read('lib/legal.ts')) && /export const TERMS_VERSION = '2026-11-27'/.test(read('lib/legal.ts')))
t('nothing else changed in the English policy or lib/legal.ts: the named edit gives the base back byte for byte',
  PP1.asBefore('content/legal/privacy-policy.md', en) === git('show', `${BASE}:content/legal/privacy-policy.md`) && PP1.asBefore('lib/legal.ts', read('lib/legal.ts')) === git('show', `${BASE}:lib/legal.ts`))

console.log('\n── 2 · the 54 used language bases')
const UNUSED = ['vi-VN', 'hi-IN', 'ur-PK', 'fil-PH', 'ta-LK']
const bases = fs.readdirSync(path.join(REPO, 'content/legal')).filter(d => /^[a-z]{2,3}-[A-Z]{2}$/.test(d)).sort()
const used = bases.filter(b => !UNUSED.includes(b))
const bad = used.flatMap(b => { const f = `content/legal/${b}/privacy-policy.md`, s = read(f); const p = LT.compare('privacy-policy.md', s)
  if (!/^\| Anthropic \(Claude\) \| [^|]+ \| [^|]+ \|$/m.test(s) || !/^\| Namecheap \| [^|]+ \| [^|]+ \|$/m.test(s)) p.push('the two rows are missing')
  return p.length ? [`${b}: ${p.slice(0, 2).join('; ')}`] : [] })
t(`all ${used.length} used bases carry both rows and pass the legal translation checker (stamp = today's English, same structure, processors named)`, used.length === 54 && !bad.length, bad)
// "Where" of the two new rows and of the row they follow (that language's last US row before them)
const usOf = s => { const ls = s.split('\n'), i = ls.findIndex(l => l.startsWith('| Anthropic (Claude) |')); return i < 1 ? [] : ls.slice(i - 1, i + 2).map(l => l.trim().replace(/\|$/, '').split('|').pop().trim()) }
const usBad = used.filter(b => new Set(usOf(read(`content/legal/${b}/privacy-policy.md`))).size !== 1)
t('…each new row says "United States" exactly as that language\'s row before them does (its last US row)', !usBad.length, usBad)
const restore = used.filter(b => { const f = `content/legal/${b}/privacy-policy.md`; return PP1.asBefore(f, read(f)) !== git('show', `${BASE}:${f}`) })
t('…and nothing else changed in any of them (the named edit gives each base file back byte for byte)', !restore.length, restore)
t('the 5 unused bases are untouched', UNUSED.every(b => read(`content/legal/${b}/privacy-policy.md`) === git('show', `${BASE}:content/legal/${b}/privacy-policy.md`)))
t('the named edit is chained first by scripts/_named-till-pack-5-6.cjs (newest change first)', /require\('\.\/_named-privacy-processors-1\.cjs'\)\.undoCode\(file, src\)/.test(read('scripts/_named-till-pack-5-6.cjs')))

console.log(`\n${fail ? '🔴' : '✓'} privacy-processors-1: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
