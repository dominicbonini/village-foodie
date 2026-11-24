#!/usr/bin/env node
// scripts/till-verify.cjs — till-pack-1 (24 November 2026, docs/till-pack-1-report.md): VERIFY A TILL CHAIN EXPORT OFFLINE.
//
//   node scripts/till-verify.cjs <chain.jsonl> [--json]
//
// Reads a chain.jsonl export (one entry per line, exactly: truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version — the
// till_chain columns, as till-pack-5's archive will hold them and scripts/db-rollback-proofs.cjs exports them) and checks, per truck:
//   • seq runs 1, 2, 3 … with no gap and no repeat (an export must start at the truck's first entry);
//   • payload_hash = sha256(payload)  (the payload text exactly as stored — nothing is re-canonicalised);
//   • prev_hash = the previous entry's hash (64 zeros for the first);
//   • hash = sha256(prev_hash | seq | kind | ref | payload_hash);
//   • the payload is the canonical jsonb text of an envelope whose truck_id / kind / ref match the entry.
// Needs only Node (crypto). It reads no database and sends nothing anywhere. Exit 0 = every chain verifies; 1 = a problem (listed);
// 2 = the file cannot be read. With --json it prints one JSON result.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS tool, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const crypto = require('crypto')
const M = require('./_till-sealed-mirror.cjs')

const sha256 = s => crypto.createHash('sha256').update(Buffer.from(String(s), 'utf8')).digest('hex')
const GENESIS = '0'.repeat(64)
const ENVELOPE_KEYS = ['v', 'kind', 'truck_id', 'ref', 'version', 'reason', 'trading_day', 'software_version', 'recorded_at', 'data'].sort()

/** The checks of ONE entry on its own (its hashes, its payload, its columns against the payload). Links are checked by verifyEntries. */
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
    const pv = p.version === null ? null : M.isNum(p.version) ? Number(p.version[M.NUM]) : p.version
    if ((e.version ?? null) !== pv) problems.push('version differs from the payload\'s')
    if (e.software_version !== p.software_version) problems.push('software_version differs from the payload\'s')
  } catch (err) { problems.push(`payload is not JSON (${err.message})`) }
  return problems
}
const ENTRY_KEYS = ['truck_id', 'seq', 'kind', 'ref', 'version', 'payload', 'payload_hash', 'prev_hash', 'hash', 'software_version']

/** Verify parsed entries (any order; grouped per truck, sorted by seq). Returns { ok, trucks: {id: {...}}, problems: [...] }.
 *  `own` (optional) caches entryProblems per entry object. */
function verifyEntries(entries, own = e => entryProblems(e)) {
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
    let prev = GENESIS, expect = 1
    for (const { e, line } of list) {
      const at = { truck, seq: e.seq, line }
      if (!Number.isInteger(e.seq) || e.seq !== expect) problems.push({ ...at, problem: Number(e.seq) < expect ? 'repeated seq' : `gap: expected seq ${expect}` })
      if (e.prev_hash !== prev) problems.push({ ...at, problem: 'prev_hash ≠ the previous entry\'s hash' })
      for (const p of own(e)) problems.push({ ...at, problem: p })
      prev = e.hash
      expect = Number(e.seq) + 1
    }
    trucks[truck] = { entries: list.length, last_seq: list.length ? Number(list[list.length - 1].e.seq) : 0, head_hash: prev }
  }
  return { ok: problems.length === 0, trucks, problems }
}

/** Verify a chain.jsonl text. A line that is not JSON is a problem, not a crash. */
function verifyText(text) {
  const entries = []
  const problems = []
  String(text).split('\n').forEach((line, i) => {
    if (!line.trim()) return
    try { entries.push(JSON.parse(line)) } catch { problems.push({ line: i + 1, problem: 'not JSON' }); entries.push(null) }
  })
  const r = verifyEntries(entries)
  r.problems = problems.concat(r.problems.filter(p => p.problem !== 'not an entry' || !problems.some(q => q.line === p.line)))
  r.ok = r.problems.length === 0
  return r
}

module.exports = { verifyEntries, verifyText, entryProblems, sha256, GENESIS }

if (require.main === module) {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  if (!file) { console.error('usage: node scripts/till-verify.cjs <chain.jsonl> [--json]'); process.exit(2) }
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch (e) { console.error(`till-verify: cannot read ${file}: ${e.message}`); process.exit(2) }
  const r = verifyText(text)
  if (args.includes('--json')) console.log(JSON.stringify(r))
  else {
    for (const [t, s] of Object.entries(r.trucks)) console.log(`${t}: ${s.entries} entries, last seq ${s.last_seq}, head ${s.head_hash}`)
    for (const p of r.problems.slice(0, 50)) console.log(`  ✗ ${JSON.stringify(p)}`)
    console.log(r.ok ? '✅ the chain verifies' : `🔴 ${r.problems.length} problem(s)`)
  }
  process.exit(r.ok ? 0 : 1)
}
