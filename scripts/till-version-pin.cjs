#!/usr/bin/env node
// scripts/till-version-pin.cjs — 🔴 till-pack-6 (25 November 2026, docs/till-pack-5-6-report.md; Q13): THE TILL MODULE'S VERSION PIN.
//
//   node scripts/till-version-pin.cjs            check (a sweep harness): exit 1 on any failure
//   node scripts/till-version-pin.cjs --print    print the current source hash (to record a NEW version's pin — by hand, on purpose)
//
// The fiscal files are lib/till/version.ts FISCAL_FILES (read from the file itself, never restated here). Their SOURCE HASH is
//   sha256( for each file, in that order:  "<path>\0<sha256 of its bytes>\n" )
// and lib/till/version-pins.json records, for every fiscal version ever released, { version, source_sha256, files }. This FAILS when:
//   • the fiscal files' hash differs from the pin recorded for TILL_VERSION — A FISCAL FILE CHANGED WITHOUT A VERSION BUMP;
//   • TILL_VERSION has no pin (a bump not recorded), or a fiscal file is missing;
//   • a version's source differs from the previous pin's but its MAJOR number was not raised (Q13: any fiscal change is a major one —
//     BOI-TVA-DECLA-30-10-30 § 340; a new major needs a new attestation, § 380);
//   • the database migration does not set the same version (till_settings.software_version).
// Reads files only; writes nothing.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const REPO = path.resolve(__dirname, '..')
const sha = b => crypto.createHash('sha256').update(b).digest('hex')

/** lib/till/version.ts's exports, read from its source (it is pure and imports nothing). */
function readVersion(root) {
  const ts = require(path.join(REPO, 'node_modules/typescript'))
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/till/version.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('module', 'exports', js)(mod, mod.exports)
  return mod.exports
}
function sourceHash(root, files) {
  const missing = files.filter(f => !fs.existsSync(path.join(root, f)))
  if (missing.length) return { hash: null, missing }
  return { hash: sha(files.map(f => `${f}\0${sha(fs.readFileSync(path.join(root, f)))}\n`).join('')), missing: [] }
}
const major = v => Number(String(v).split('.')[0])

/** 🔴 The check, against a tree at `root` (the harness runs it on a changed copy). Returns { ok, problems, version, hash }. */
function check(root = REPO) {
  const problems = []
  const V = readVersion(root)
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'lib/till/version-pins.json'), 'utf8'))
  const { hash, missing } = sourceHash(root, V.FISCAL_FILES)
  if (missing.length) problems.push(`fiscal file(s) missing: ${missing.join(', ')}`)
  if (!/^\d+\.\d+\.\d+$/.test(V.TILL_VERSION)) problems.push(`TILL_VERSION ${V.TILL_VERSION} is not MAJOR.MINOR.PATCH`)
  const pin = pins.versions.find(p => p.version === V.TILL_VERSION)
  if (!pin) problems.push(`version ${V.TILL_VERSION} has no pin in lib/till/version-pins.json — record it (node scripts/till-version-pin.cjs --print)`)
  else if (hash && pin.source_sha256 !== hash) problems.push(`🔴 a fiscal file changed without a version bump: the fiscal source hash is ${hash}, version ${V.TILL_VERSION} was pinned at ${pin.source_sha256} — raise the MAJOR version (any fiscal change, Q13) and pin it`)
  if (pin && pin.files !== V.FISCAL_FILES.length) problems.push(`version ${V.TILL_VERSION} was pinned over ${pin.files} files, the list now has ${V.FISCAL_FILES.length}`)
  for (let i = 1; i < pins.versions.length; i++) {
    const a = pins.versions[i - 1], b = pins.versions[i]
    if (a.source_sha256 !== b.source_sha256 && major(b.version) <= major(a.version)) problems.push(`version ${b.version}'s fiscal source differs from ${a.version}'s but its major number was not raised`)
  }
  if (new Set(pins.versions.map(p => p.version)).size !== pins.versions.length) problems.push('a version is pinned twice')
  const migs = V.FISCAL_FILES.filter(f => f.startsWith('supabase/migrations/')).map(f => fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : '').join('\n')
  const setTo = [...migs.matchAll(/set software_version = '(\d+\.\d+\.\d+)'/g)].map(x => x[1]).pop()
  if (setTo !== V.TILL_VERSION) problems.push(`the migrations set till_settings.software_version to ${setTo}, lib/till/version.ts says ${V.TILL_VERSION}`)
  return { ok: problems.length === 0, problems, version: V.TILL_VERSION, hash, files: V.FISCAL_FILES.length }
}

module.exports = { check, sourceHash, readVersion }

if (require.main === module) {
  if (process.argv.includes('--print')) { const V = readVersion(REPO); const r = sourceHash(REPO, V.FISCAL_FILES); console.log(JSON.stringify({ version: V.TILL_VERSION, source_sha256: r.hash, files: V.FISCAL_FILES.length, missing: r.missing })); process.exit(r.hash ? 0 : 1) }
  const r = check()
  console.log(`till module ${r.version}: ${r.files} fiscal files, source hash ${r.hash}`)
  for (const p of r.problems) console.log(`  🔴 ${p}`)
  console.log(r.ok ? '  ✓ the fiscal files match the pin of their version\n\ntill-version-pin: 1 passed, 0 failed' : `\ntill-version-pin: 0 passed, ${r.problems.length} failed`)
  process.exit(r.ok ? 0 : 1)
}
