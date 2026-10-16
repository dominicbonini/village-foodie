#!/usr/bin/env node
// Renders the three US landing screenshots (see README.md in this folder). Each step runs in its own Node
// process, as they were first run (the render kit replaces Date and TZ process-wide).
//   node scripts/screenshots/us-screens.cjs [outDir] [--keep]
// outDir defaults to a new temp dir; it may not be inside public/. --keep leaves the work dir (the web renders
// and their HTML) in place instead of deleting it.
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawnSync } = require('child_process')
const { REPO, assertNotPublic } = require('./common.cjs')

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const outArg = args.find(a => !a.startsWith('--'))
if (outArg) assertNotPublic(outArg)
const OUT = outArg ? path.resolve(outArg) : fs.mkdtempSync(path.join(os.tmpdir(), 'us-screens-out-'))
fs.mkdirSync(OUT, { recursive: true })
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'us-screens-work-'))

const STEPS = [['order-us.cjs'], ['frame-order.cjs', true], ['dash-us.cjs'], ['frame-dash.cjs', true], ['kds-us.cjs'], ['frame-kds.cjs', true]]
let failed = null
for (const [file, framed] of STEPS) {
  console.log(`\n── ${file}`)
  const r = spawnSync(process.execPath, [path.join(__dirname, file), WORK, ...(framed ? [OUT] : [])], { cwd: REPO, stdio: 'inherit' })
  if (r.status !== 0) { failed = file; break }
}
if (keep || failed) console.log(`\nwork dir kept: ${WORK}`)
else fs.rmSync(WORK, { recursive: true, force: true })
if (failed) { console.error(`\n${failed} failed`); process.exit(1) }
console.log(`\nwritten to ${OUT}:`)
for (const f of ['customer-order-us.png', 'dashboard-v4-us.png', 'kitchen-us.png']) console.log(`  ${path.join(OUT, f)}`)
