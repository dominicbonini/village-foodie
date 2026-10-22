// scripts/_scraper-prompts-capture.mjs — WRITES scripts/fixtures/scraper-prompts-before.json: the scraper's Pass B prompt
// (buildHgPrompt) from scripts/scraper-prompts.js AT 7fcd4fc9, before address-formats-2's follow-up moved its location
// lines onto lib/address-formats.ts. Run by hand, once; scripts/scraper-prompts-format.cjs compares against the fixture.
// 🔴 IT WRITES A COMMITTED BASELINE: never run it in a sweep, never re-run it to make a check pass.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REF = '7fcd4fc9'
const src = execFileSync('git', ['show', `${REF}:scripts/scraper-prompts.js`], { cwd: REPO, encoding: 'utf8' })
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper-prompts-before-'))
fs.writeFileSync(path.join(dir, 'scraper-prompts.mjs'), src)
const { buildHgPrompt } = await import(path.join(dir, 'scraper-prompts.mjs'))
const base = { todayStr: 'Thursday 9 October 2026', currentYear: 2026, pageText: 'Friday 10th October — The Fox, Burwell 5pm-9pm' }
const FORMATS = ['postcode', 'zip_state', 'gb', 'us', 'ie', 'au', 'nz', 'ca', '(none)', 'garbage']
const prompts = {}
for (const f of FORMATS) for (const d of ['dmy', 'mdy']) prompts[`${f}|${d}`] = buildHgPrompt({ ...base, ...(f === '(none)' ? {} : { addressFormat: f }), dateOrder: d })
fs.writeFileSync(path.join(REPO, 'scripts/fixtures/scraper-prompts-before.json'), JSON.stringify({ ref: REF, input: base, prompts }, null, 1) + '\n')
console.log(`wrote ${Object.keys(prompts).length} prompts from ${REF}`)
