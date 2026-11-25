#!/usr/bin/env node
// scripts/till-verify.cjs — till-pack-1 / till-pack-1b (24–25 November 2026, docs/till-pack-1b-report.md): VERIFY A TILL CHAIN EXPORT OFFLINE.
//
//   node scripts/till-verify.cjs <chain.jsonl> [--json]
//   node scripts/till-verify.cjs --archive <archive.zip> [--pub <public key, SPKI DER base64>] [--json]
//        till-pack-5 (25 November 2026, docs/till-pack-5-6-report.md): a DOWNLOADED ARCHIVE, offline — every file's sha256 against
//        manifest.json (and nothing unlisted), the manifest's Ed25519 signature (manifest.sig.json; with --pub, against THAT key — the
//        one in docs/till-signing-public-key.md — else against the key the archive itself names, reported as self-declared), the chain
//        (every check below), each close (its chain entry, its chain head, its signature), each earlier archive (its chain entry, its
//        signature), the chain head the manifest covers, and each day's chain head (Q14). Reads the zip with Node's zlib only.
//
// Reads a chain.jsonl export (one entry per line, exactly: truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version — the
// till_chain columns, as till-pack-5's archive will hold them and scripts/db-rollback-proofs.cjs exports them) and checks, per truck:
//   • seq runs 1, 2, 3 … with no gap and no repeat (an export must start at the truck's first entry), and seq 1 is the 'till_start' event;
//   • payload_hash = sha256(payload)  (the payload text exactly as stored — nothing is re-canonicalised);
//   • prev_hash = the previous entry's hash (64 zeros for the first);
//   • hash = sha256(prev_hash | seq | kind | ref | payload_hash);
//   • the payload is the canonical jsonb text of an envelope whose truck_id / kind / ref / version / software_version match the entry;
//   • identity entries are numbered 1, 2, 3 …; every order version names the identity entry in force {seq, hash};
//   • each order's versions run 1, 2, 3 …; version 1 has no delta, every later one the plus/minus delta recomputed from the previous;
//   • every order version has a till_id, and its VAT reconciles to the minor unit (scripts/_till-sealed-mirror.cjs vatReconciles).
// Needs only Node (crypto). It reads no database and sends nothing anywhere. Exit 0 = every chain verifies; 1 = a problem (listed);
// 2 = the file cannot be read. With --json it prints one JSON result.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS tool, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const crypto = require('crypto')
const M = require('./_till-sealed-mirror.cjs')

const sha256 = s => crypto.createHash('sha256').update(Buffer.from(String(s), 'utf8')).digest('hex')
const GENESIS = '0'.repeat(64)
const ENVELOPE_KEYS = [...M.ENVELOPE_KEYS].sort()
const ENTRY_KEYS = ['truck_id', 'seq', 'kind', 'ref', 'version', 'payload', 'payload_hash', 'prev_hash', 'hash', 'software_version']
const numOf = v => (v === null || v === undefined ? null : M.isNum(v) ? Number(v[M.NUM]) : v)

/** The checks of ONE entry on its own (its hashes, its payload, its columns against the payload, its kind's own rules). Links and the
 *  per-truck sequence are checked by verifyEntries. */
function entryProblems(e) {
  const problems = []
  if (typeof e.payload !== 'string') return ['payload is not text']
  if (sha256(e.payload) !== e.payload_hash) problems.push('payload_hash ≠ sha256(payload)')
  if (sha256(`${e.prev_hash}|${e.seq}|${e.kind}|${e.ref}|${e.payload_hash}`) !== e.hash) problems.push('hash ≠ sha256(prev_hash|seq|kind|ref|payload_hash)')
  try {
    const p = M.parseRaw(e.payload)
    if (M.jsonbText(p) !== e.payload) problems.push('payload is not canonical jsonb text')
    if (JSON.stringify(Object.keys(p).sort()) !== JSON.stringify(ENVELOPE_KEYS)) problems.push('payload envelope keys differ')
    if (p.truck_id !== e.truck_id || p.kind !== e.kind || p.ref !== e.ref) problems.push('payload truck_id / kind / ref differ from the entry')
    // version and software_version are columns outside the hash, so they must equal the (hashed) payload's own
    if ((e.version ?? null) !== numOf(p.version)) problems.push('version differs from the payload\'s')
    if (e.software_version !== p.software_version) problems.push('software_version differs from the payload\'s')
    if (!M.KINDS.includes(e.kind)) problems.push(`unknown kind ${e.kind}`)
    if (e.kind === 'event' && !M.EVENT_TYPES.includes(e.ref)) problems.push(`unknown event type ${e.ref}`)
    if (e.kind === 'order') {
      const v = numOf(p.version)
      if (v === 1 ? p.delta !== null : !(p.delta && typeof p.delta === 'object' && !M.isNum(p.delta))) problems.push('order delta: version 1 has none, every later version has one')
      if (!p.identity || typeof p.identity !== 'object' || !p.identity.hash) problems.push('order version names no identity entry')
      if (!p.data || typeof p.data.till_id !== 'string' || p.data.till_id === '') problems.push('order version has no till_id')
      else if (!M.vatReconciles(p.data)) problems.push('order VAT does not reconcile')
    } else if (p.identity !== null || p.delta !== null) problems.push('identity / delta set on a non-order entry')
    if (e.kind === 'identity' && (e.ref !== e.truck_id || !p.data || JSON.stringify(Object.keys(p.data).sort()) !== JSON.stringify([...M.IDENTITY_KEYS].sort()))) problems.push('identity entry: ref is the truck, data the five identity keys')
  } catch (err) { problems.push(`payload is not JSON (${err.message})`) }
  return problems
}

/** Verify parsed entries (any order; grouped per truck, sorted by seq). Returns { ok, trucks: {id: {...}}, problems: [...] }.
 *  `own` (optional) caches entryProblems per entry object; `memo` (optional Map) caches recomputed deltas. */
function verifyEntries(entries, own = e => entryProblems(e), memo = new Map()) {
  const problems = []
  const byTruck = new Map()
  entries.forEach((e, i) => {
    if (!e || typeof e !== 'object' || typeof e.truck_id !== 'string' || JSON.stringify(Object.keys(e).sort()) !== JSON.stringify([...ENTRY_KEYS].sort())) { problems.push({ line: i + 1, problem: 'not an entry' }); return }
    if (!byTruck.has(e.truck_id)) byTruck.set(e.truck_id, [])
    byTruck.get(e.truck_id).push({ e, line: i + 1 })
  })
  const trucks = {}
  for (const [truck, list] of byTruck) {
    list.sort((a, b) => Number(a.e.seq) - Number(b.e.seq))
    let prev = GENESIS, expect = 1, idVer = 0, idRef = null
    const lastOrder = new Map()
    for (const { e, line } of list) {
      const at = { truck, seq: e.seq, line }
      if (!Number.isInteger(e.seq) || e.seq !== expect) problems.push({ ...at, problem: Number(e.seq) < expect ? 'repeated seq' : `gap: expected seq ${expect}` })
      if (e.prev_hash !== prev) problems.push({ ...at, problem: 'prev_hash ≠ the previous entry\'s hash' })
      const mine = own(e)
      for (const p of mine) problems.push({ ...at, problem: p })
      if ((e.seq === 1) !== (e.kind === 'event' && e.ref === 'till_start')) problems.push({ ...at, problem: 'seq 1 must be the till_start event, and only seq 1' })
      const pk = '\u0001' + e.payload
      if (!memo.has(pk)) { let v = null; try { v = M.parseRaw(e.payload) } catch { /* reported by entryProblems */ } memo.set(pk, v) }
      const p = memo.get(pk)
      if (p && e.kind === 'identity') {
        idVer++
        if (e.version !== idVer) problems.push({ ...at, problem: `identity version: expected ${idVer}` })
        idRef = { seq: e.seq, hash: e.hash }
      } else if (p && e.kind === 'order') {
        const ref = p.identity && typeof p.identity === 'object' ? { seq: numOf(p.identity.seq), hash: p.identity.hash } : null
        if (!idRef || !ref || ref.seq !== idRef.seq || ref.hash !== idRef.hash) problems.push({ ...at, problem: 'order version does not name the identity entry in force' })
        const before = lastOrder.get(e.ref)
        if (!before) { if (e.version !== 1) problems.push({ ...at, problem: 'an order\'s first version must be 1' }) }
        else {
          if (e.version !== before.version + 1) problems.push({ ...at, problem: `order version: expected ${before.version + 1}` })
          const k = before.payload + '\u0000' + e.payload
          if (!memo.has(k)) {
            let same = false
            try {
              const prevData = (memo.get('\u0001' + before.payload) || M.parseRaw(before.payload)).data
              const isO = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !M.isNum(v)
              same = isO(prevData) && isO(p.data) && M.jsonbText(p.delta) === M.jsonbText(M.orderDelta(prevData, p.data, before.version))
            } catch { same = false }   // a malformed entry is a problem, never a crash
            memo.set(k, same)
          }
          if (!memo.get(k)) problems.push({ ...at, problem: 'order delta ≠ the one recomputed from the previous version' })
        }
        lastOrder.set(e.ref, { version: e.version, payload: e.payload })
      }
      prev = e.hash
      expect = Number(e.seq) + 1
    }
    trucks[truck] = { entries: list.length, last_seq: list.length ? Number(list[list.length - 1].e.seq) : 0, head_hash: prev, identity_versions: idVer, orders: lastOrder.size }
  }
  return { ok: problems.length === 0, trucks, problems }
}

/** Verify a chain.jsonl text. A line that is not JSON is a problem, not a crash. */
function verifyText(text, memo) {
  const entries = []
  const problems = []
  String(text).split('\n').forEach((line, i) => {
    if (!line.trim()) return
    try { entries.push(JSON.parse(line)) } catch { problems.push({ line: i + 1, problem: 'not JSON' }); entries.push(null) }
  })
  const r = verifyEntries(entries, undefined, memo)
  r.problems = problems.concat(r.problems.filter(p => p.problem !== 'not an entry' || !problems.some(q => q.line === p.line)))
  r.ok = r.problems.length === 0
  return r
}


// ══ till-pack-5: AN ARCHIVE, OFFLINE ════════════════════════════════════════════════════════════════════════════════════════════════
const zlib = require('zlib')
/** The entries of a ZIP (stored or deflated), by name — Node's zlib only. Throws on anything it cannot read. */
function readZip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('not a zip (no end of central directory)')
  const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16)
  const out = {}
  let p = cdOff
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory')
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24)
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8')
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28)
    const raw = buf.slice(start, start + csize)
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null
    if (!data) throw new Error(`${name}: compression method ${method} not supported`)
    if (data.length !== usize) throw new Error(`${name}: size differs from the directory`)
    if (name in out) throw new Error(`${name}: twice in the zip`)
    out[name] = data
    p += 46 + nlen + xlen + clen
  }
  return out
}
/** RFC 4180 CSV (the archive's: UTF-8 with a BOM, CRLF) → array of objects. */
function parseCsv(text) {
  const t = text.replace(/^﻿/, ''), rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\r') { /* CRLF */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const [head, ...body] = rows
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}
function verifySig(pubB64, hashHex, sigB64) {
  try { return crypto.verify(null, Buffer.from(hashHex, 'utf8'), crypto.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }), Buffer.from(sigB64, 'base64')) } catch { return false }
}
/** 🔴 Verify a downloaded archive. Returns { ok, problems: [...], summary }. `opts.publicKey` = the trusted key (else the archive's own). */
function verifyArchive(zipBuf, opts = {}) {
  const problems = []
  const bad = (what, detail) => problems.push(detail === undefined ? what : `${what}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  let files
  try { files = readZip(zipBuf) } catch (e) { return { ok: false, problems: [`zip: ${e.message}`], summary: null } }
  if (!files['manifest.json']) return { ok: false, problems: ['no manifest.json'], summary: null }
  const manifestText = files['manifest.json'].toString('utf8')
  const manifestSha = sha256(manifestText)
  let m
  try { m = JSON.parse(manifestText) } catch (e) { return { ok: false, problems: [`manifest.json is not JSON (${e.message})`], summary: null } }
  // 1 · every file's sha256 and size; nothing unlisted
  const listed = new Set(m.files.map(f => f.name))
  for (const f of m.files) {
    const b = files[f.name]
    if (!b) { bad('missing file', f.name); continue }
    if (crypto.createHash('sha256').update(b).digest('hex') !== f.sha256) bad('file hash differs from the manifest', f.name)
    if (b.length !== f.bytes) bad('file size differs from the manifest', f.name)
  }
  for (const n of Object.keys(files)) if (!listed.has(n) && n !== 'manifest.json' && n !== 'manifest.sig.json') bad('file not in the manifest', n)
  // 2 · the manifest's signature
  const trustedKey = opts.publicKey || null
  const archiveKey = m.signing ? m.signing.public_key_spki_der_base64 : null
  const key = trustedKey || archiveKey
  let signature = 'unsigned'
  if (files['manifest.sig.json']) {
    let sig
    try { sig = JSON.parse(files['manifest.sig.json'].toString('utf8')) } catch { bad('manifest.sig.json is not JSON') }
    if (sig) {
      if (sig.manifest_sha256 !== manifestSha) bad('manifest.sig.json names another manifest hash')
      if (!key) bad('a signature but no public key to check it')
      else if (!verifySig(key, manifestSha, sig.signature)) bad('the manifest signature does not verify', trustedKey ? 'with the given public key' : 'with the archive\'s own public key')
      else signature = trustedKey ? 'verified with the given key' : 'verified with the archive\'s own key (self-declared — check it against HatchGrab\'s published key)'
      if (trustedKey && archiveKey && archiveKey !== trustedKey) bad('the archive names a different public key from the one given')
    }
  } else if (opts.signature) {
    signature = key && verifySig(key, manifestSha, opts.signature) ? 'verified (signature given separately)' : (bad('the given signature does not verify'), 'bad')
  }
  // 3 · the chain
  const chainText = files['chain.jsonl'] ? files['chain.jsonl'].toString('utf8') : ''
  let cv
  try { cv = verifyText(chainText) } catch (e) { cv = { problems: [`the chain cannot be read (${e.message})`] } }
  for (const p of cv.problems.slice(0, 50)) bad('chain', p)
  // a damaged file is a PROBLEM to report, never a crash
  const parseLines = (name, text) => text.split('\n').filter(Boolean).flatMap((l, i) => { try { return [JSON.parse(l)] } catch { bad(`${name} line ${i + 1} is not JSON`); return [] } })
  const chain = parseLines('chain.jsonl', chainText)
  const bySeq = new Map(chain.map(e => [Number(e.seq), e]))
  const last = chain[chain.length - 1]
  if (!last || Number(last.seq) !== m.chain.last_seq || last.hash !== m.chain.head_hash) bad('the manifest\'s chain head is not the last entry of chain.jsonl')
  const isEntry = (seq, hash, kind) => { const e = bySeq.get(Number(seq)); return !!e && e.hash === hash && (!kind || e.kind === kind) }
  // 4 · each day's chain head
  for (const d of m.day_heads || []) if (!isEntry(d.seq, d.hash)) bad('day head is not a chain entry', d)
  // 5 · closes and their signatures
  const closes = files['closes.jsonl'] ? parseLines('closes.jsonl', files['closes.jsonl'].toString('utf8')) : []
  const closeSigs = new Map((files['close_signatures.csv'] ? parseCsv(files['close_signatures.csv'].toString('utf8')) : []).map(r => [Number(r.seq), r]))
  let closesSigned = 0
  for (const c of closes) {
    if (!isEntry(c.seq, c.hash, 'close')) bad('close is not its chain entry', `${c.period_type} ${c.period_start}`)
    if (!isEntry(c.chain_head_seq, c.chain_head_hash)) bad('close names a chain head that is not in the chain', `${c.period_type} ${c.period_start}`)
    const s = closeSigs.get(Number(c.seq))
    if (s) { if (key && verifySig(key, c.hash, s.signature)) closesSigned++; else bad('close signature does not verify', `${c.period_type} ${c.period_start}`) }
  }
  // 6 · earlier archives
  const archives = files['archives.csv'] ? parseCsv(files['archives.csv'].toString('utf8')) : []
  let archivesSigned = 0
  for (const a of archives) {
    if (!isEntry(a.seq, a.hash, 'archive')) bad('earlier archive is not its chain entry', a.archive_id)
    else {
      let pl = null
      try { pl = JSON.parse(bySeq.get(Number(a.seq)).payload).data } catch { /* reported by the chain check */ }
      if (!pl || pl.manifest_sha256 !== a.manifest_sha256) bad('earlier archive\'s manifest hash is not the one chained', a.archive_id)
    }
    if (a.signature) { if (key && verifySig(key, a.manifest_sha256, a.signature)) archivesSigned++; else bad('earlier archive signature does not verify', a.archive_id) }
  }
  const summary = { truck_id: m.truck_id, reason: m.reason, period: m.period, accounting_year: m.accounting_year, software: m.software, manifest_sha256: manifestSha,
    files: m.files.length, chain_entries: chain.length, head: m.chain, day_heads: (m.day_heads || []).length, closes: closes.length, closes_signed: closesSigned,
    earlier_archives: archives.length, earlier_archives_signed: archivesSigned, signature }
  return { ok: problems.length === 0, problems, summary }
}

module.exports = { verifyEntries, verifyText, entryProblems, sha256, GENESIS, readZip, parseCsv, verifyArchive }

if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.includes('--archive')) {
    const at = args.indexOf('--archive'), zipFile = args[at + 1]
    const pub = args.includes('--pub') ? args[args.indexOf('--pub') + 1] : null
    if (!zipFile) { console.error('usage: node scripts/till-verify.cjs --archive <archive.zip> [--pub <base64>] [--json]'); process.exit(2) }
    let buf
    try { buf = fs.readFileSync(zipFile) } catch (e) { console.error(`till-verify: cannot read ${zipFile}: ${e.message}`); process.exit(2) }
    const r = verifyArchive(buf, { publicKey: pub })
    if (args.includes('--json')) console.log(JSON.stringify(r))
    else {
      if (r.summary) console.log(JSON.stringify(r.summary, null, 2))
      for (const p of r.problems.slice(0, 50)) console.log(`  ✗ ${p}`)
      console.log(r.ok ? '✅ the archive verifies' : `🔴 ${r.problems.length} problem(s)`)
    }
    process.exit(r.ok ? 0 : 1)
  }
  const file = args.find(a => !a.startsWith('--'))
  if (!file) { console.error('usage: node scripts/till-verify.cjs <chain.jsonl> [--json]'); process.exit(2) }
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch (e) { console.error(`till-verify: cannot read ${file}: ${e.message}`); process.exit(2) }
  const r = verifyText(text)
  if (args.includes('--json')) console.log(JSON.stringify(r))
  else {
    for (const [t, s] of Object.entries(r.trucks)) console.log(`${t}: ${s.entries} entries, last seq ${s.last_seq}, ${s.orders} orders, ${s.identity_versions} identity version(s), head ${s.head_hash}`)
    for (const p of r.problems.slice(0, 50)) console.log(`  ✗ ${JSON.stringify(p)}`)
    console.log(r.ok ? '✅ the chain verifies' : `🔴 ${r.problems.length} problem(s)`)
  }
  process.exit(r.ok ? 0 : 1)
}
