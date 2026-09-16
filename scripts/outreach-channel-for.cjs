#!/usr/bin/env node
// scripts/outreach-channel-for.cjs
//
// CHARACTERISATION PROOF for the `hasValue` extraction out of `channelFor` (lib/outreach-step.ts).
//   node scripts/outreach-channel-for.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: `channelFor` returns a DIFFERENT channel after the extraction than the
// pre-extraction body returned, for any input shape. That would mean the outreach queue's contactable
// gate (§57.2) silently changed while a "layout only" column swap was being made — the exact class of
// defect this harness exists to make impossible.
//
// ⚠️ IT COMPARES AGAINST A FROZEN COPY OF THE OLD BODY, kept below verbatim. That copy is the oracle;
// if someone "tidies" it to call hasValue too, the harness proves nothing — hence the loud comment.
//
// ⚠️ It compiles the TypeScript with the repo's own tsc — this repo has no test framework. A temp
// tsconfig supplies baseUrl/paths because lib/outreach-step.ts imports through the `@/lib/...` alias,
// and a runtime hook maps `@/` to the compiled tree because tsc leaves the alias in the emitted
// require() calls. Same mechanism as the five scripts/whatsapp-*.cjs harnesses.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'outreach-cf-'))
const cfg = path.join(out, 'tsconfig.json')
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: out, rootDir: REPO, skipLibCheck: true,
    esModuleInterop: true, moduleResolution: 'node', baseUrl: REPO, paths: { '@/*': ['./*'] },
    types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')],
  },
  files: [path.join(REPO, 'lib/outreach-step.ts')],
}))
try {
  execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' })
} catch (e) {
  console.log('🔴 COMPILE FAILED:\n' + (e.stdout ? e.stdout.toString() : e.message)); process.exit(1)
}
const Module = require('module')
const realResolve = Module._resolveFilename
Module._resolveFilename = function (req, ...rest) {
  if (req.startsWith('@/')) return realResolve.call(this, path.join(out, req.slice(2)), ...rest)
  return realResolve.call(this, req, ...rest)
}
const STEP = require(path.join(out, 'lib/outreach-step.js'))

// 🔴 THE ORACLE — THE PRE-EXTRACTION BODY, FROZEN. DO NOT REWRITE IT TO USE hasValue.
function channelForOLD(p) {
  const wa = p.whatsapp_confirmed === true && !!(p.waPhone ?? '').trim()
  if (wa) return 'whatsapp'
  if ((p.contact_email ?? '').trim()) return 'email'
  return null
}

// ── A BROAD FIXTURE SET. Every combination of the three inputs that the body can branch on. ──────────
// 🧪 FIXTURE, not live data.
const EMAILS  = [undefined, null, '', ' ', '\t\n ', 'a@b.co', '  a@b.co  ']
const PHONES  = [undefined, null, '', ' ', '\t', '447700900000', ' 447700900000 ']
const CONFIRM = [undefined, null, false, true, 'true', 1, 0]

function runSuite(channelFor) {
  const fails = []
  let n = 0
  for (const contact_email of EMAILS) {
    for (const waPhone of PHONES) {
      for (const whatsapp_confirmed of CONFIRM) {
        const p = { contact_email, waPhone, whatsapp_confirmed }
        const got = channelFor(p)
        const want = channelForOLD(p)
        n++
        if (got !== want) {
          fails.push(`email=${JSON.stringify(contact_email)} phone=${JSON.stringify(waPhone)} ` +
                     `confirmed=${JSON.stringify(whatsapp_confirmed)} -> got ${JSON.stringify(got)}, oracle ${JSON.stringify(want)}`)
        }
      }
    }
  }
  return { n, fails }
}

// ── THE BROKEN VARIANTS ─────────────────────────────────────────────────────────────────────────────
const VARIANTS = [
  ['V1', 'presence test drops the .trim() (whitespace counts as present)',
    p => {
      const has = v => !!(v ?? '')
      if (p.whatsapp_confirmed === true && has(p.waPhone)) return 'whatsapp'
      if (has(p.contact_email)) return 'email'
      return null
    }],
  ['V2', 'whatsapp_confirmed compared loosely (truthy instead of === true)',
    p => {
      const has = v => !!(v ?? '').trim()
      if (p.whatsapp_confirmed && has(p.waPhone)) return 'whatsapp'
      if (has(p.contact_email)) return 'email'
      return null
    }],
  ['V3', 'email preferred over a confirmed WhatsApp number (precedence flipped)',
    p => {
      const has = v => !!(v ?? '').trim()
      if (has(p.contact_email)) return 'email'
      if (p.whatsapp_confirmed === true && has(p.waPhone)) return 'whatsapp'
      return null
    }],
]

console.log('── BROKEN VARIANTS: each MUST report FAILURE ────────────────────────────────────────────')
let allFailed = true
for (const [key, label, impl] of VARIANTS) {
  const r = runSuite(impl)
  const detected = r.fails.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${key} ${label}`)
  for (const f of r.fails.slice(0, 2)) console.log(`        caught: ${f}`)
  if (r.fails.length > 2) console.log(`        …and ${r.fails.length - 2} more`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED. The oracle is not discriminating.'); process.exit(1) }

console.log('\n── THE REAL CODE ───────────────────────────────────────────────────────────────────────')
const real = runSuite(STEP.channelFor)
console.log(`  FIXTURE inputs compared: ${real.n}`)
for (const f of real.fails.slice(0, 5)) console.log('  🔴 ' + f)

// hasValue itself, stated rather than implied
const hv = [
  [undefined, false], [null, false], ['', false], [' ', false], ['\t\n', false],
  ['x', true], ['  x  ', true], ['0', true],
]
console.log('\n── hasValue ────────────────────────────────────────────────────────────────────────────')
const hvFails = []
for (const [input, want] of hv) {
  const got = STEP.hasValue(input)
  const ok = got === want
  if (!ok) hvFails.push(`hasValue(${JSON.stringify(input)}) = ${got}, want ${want}`)
  console.log(`  ${ok ? '✓' : '🔴'} hasValue(${JSON.stringify(input)}) === ${want}`)
}

const fails = real.fails.concat(hvFails)
console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ channelFor identical across all ' + real.n + ' FIXTURE inputs; hasValue correct on ' + hv.length + ' cases'}`)
fs.rmSync(out, { recursive: true, force: true })
process.exit(fails.length ? 1 : 0)
