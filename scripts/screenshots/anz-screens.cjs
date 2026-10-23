#!/usr/bin/env node
// Renders the three AUSTRALIA (au), NEW ZEALAND (nz), CANADA (ca) or FRANCE (fr, france-1) landing screenshots (see README-anz.md in this folder) — the
// AU/NZ twin of us-screens.cjs and ie-screens.cjs. Each step runs in its own Node process (the render kit replaces Date
// and TZ process-wide).
//   node scripts/screenshots/anz-screens.cjs <au|nz|ca|fr> [outDir] [--keep]
// outDir defaults to a new temp dir; it may not be inside public/. --keep leaves the work dir (the web renders
// and their HTML) in place instead of deleting it.
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawnSync } = require('child_process')
const { REPO, assertNotPublic } = require('./common.cjs')

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const [cc, outArg] = args.filter(a => !a.startsWith('--'))
if (!['au', 'nz', 'ca', 'fr', 'de', 'at', 'ch'].includes(String(cc).toLowerCase())) { console.error('usage: node scripts/screenshots/anz-screens.cjs <au|nz|ca|fr|de|at|ch> [outDir] [--keep]'); process.exit(2) }   // german-1: + de, at, ch
const key = cc.toLowerCase()
if (outArg) assertNotPublic(outArg)
const OUT = outArg ? path.resolve(outArg) : fs.mkdtempSync(path.join(os.tmpdir(), `${key}-screens-out-`))
fs.mkdirSync(OUT, { recursive: true })
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), `${key}-screens-work-`))

const STEPS = [['order-anz.cjs'], ['frame-order-anz.cjs', true], ['dash-anz.cjs'], ['frame-dash-anz.cjs', true], ['kds-anz.cjs'], ['frame-kds-anz.cjs', true]]
let failed = null
for (const [file, framed] of STEPS) {
  console.log(`\n── ${file} ${key}`)
  const r = spawnSync(process.execPath, [path.join(__dirname, file), key, WORK, ...(framed ? [OUT] : [])], { cwd: REPO, stdio: 'inherit' })
  if (r.status !== 0) { failed = file; break }
}
if (keep || failed) console.log(`\nwork dir kept: ${WORK}`)
else fs.rmSync(WORK, { recursive: true, force: true })
if (failed) { console.error(`\n${failed} failed`); process.exit(1) }
console.log(`\nwritten to ${OUT}:`)
for (const f of [`customer-order-${key}.png`, `dashboard-v4-${key}.png`, `kitchen-${key}.png`]) console.log(`  ${path.join(OUT, f)}`)
