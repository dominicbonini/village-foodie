#!/usr/bin/env node
// scripts/till-source-archive.cjs — 🔴 till-pack-6 (25 November 2026, docs/till-pack-5-6-report.md): THE SOURCE ARCHIVE OF A FISCAL VERSION
// (LPF L102 D — the editor keeps « codes, données, traitements et documentation » until the end of the third year after the version
// stops being distributed; L96 J — and presents them on request).
//
//   node scripts/till-source-archive.cjs [<git ref>] [--out <file.tar>]
//
// A DETERMINISTIC tar (POSIX ustar; files sorted by path; mode 0644; owner 0; mtime 0) of the version's fiscal files (lib/till/version.ts
// FISCAL_FILES, read AT THAT REF) and its documents (docs/till/*, at that ref). Same contents → same bytes → same sha256, whatever the
// commit, the clock or the machine — so the sha256 recorded in lib/till/version-pins.json (source_archive_sha256) can be checked at
// any time against the tag (till-module-<version>). Without a ref it reads the working tree. Prints the sha256 and the file list;
// with --out it also writes the tar (OUTSIDE the repository — keep it with the version's records). Reads git only; sends nothing.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS tool, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const git = (...a) => execFileSync('git', a, { cwd: REPO, maxBuffer: 256e6 })

function versionAt(src) {
  const ts = require(path.join(REPO, 'node_modules/typescript'))
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('module', 'exports', js)(mod, mod.exports)
  return mod.exports
}
/** The archive's entries { path: Buffer } at a ref (or the working tree). */
function entriesAt(ref) {
  const read = f => (ref ? git('show', `${ref}:${f}`) : fs.readFileSync(path.join(REPO, f)))
  const V = versionAt(read('lib/till/version.ts').toString('utf8'))
  const docs = ref ? git('ls-tree', '-r', '--name-only', ref, '--', 'docs/till').toString('utf8').split('\n').filter(Boolean)
    : fs.readdirSync(path.join(REPO, 'docs/till')).filter(f => fs.statSync(path.join(REPO, 'docs/till', f)).isFile()).map(f => `docs/till/${f}`)
  const files = [...new Set([...V.FISCAL_FILES, ...docs])].sort()
  return { version: V.TILL_VERSION, entries: files.map(f => [f, Buffer.from(read(f))]) }
}
function ustar(entries) {
  const blocks = []
  for (const [name, data] of entries) {
    if (Buffer.byteLength(name) > 100) throw new Error(`path too long for ustar: ${name}`)
    const h = Buffer.alloc(512, 0)
    h.write(name, 0, 'utf8')
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116)
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124)
    h.write('00000000000\0', 136)
    h.write('        ', 148)
    h.write('0', 156)
    h.write('ustar\0', 257); h.write('00', 263)
    let sum = 0
    for (const b of h) sum += b
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512, 0))
  }
  blocks.push(Buffer.alloc(1024, 0))
  return Buffer.concat(blocks)
}
function sourceArchive(ref = null) {
  const { version, entries } = entriesAt(ref)
  const tar = ustar(entries)
  return { version, files: entries.map(e => e[0]), tar, sha256: crypto.createHash('sha256').update(tar).digest('hex') }
}

module.exports = { sourceArchive }

if (require.main === module) {
  const args = process.argv.slice(2)
  const ref = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out') || null
  const r = sourceArchive(ref)
  if (args.includes('--out')) {
    const out = path.resolve(args[args.indexOf('--out') + 1])
    if (out.startsWith(REPO + path.sep)) { console.error('till-source-archive: write it OUTSIDE the repository'); process.exit(2) }
    fs.writeFileSync(out, r.tar)
  }
  console.log(JSON.stringify({ ref: ref || '(working tree)', version: r.version, files: r.files.length, bytes: r.tar.length, sha256: r.sha256 }))
  for (const f of r.files) console.log(`  ${f}`)
}
