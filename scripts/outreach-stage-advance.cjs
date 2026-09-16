#!/usr/bin/env node
// scripts/outreach-stage-advance.cjs
//
// Proof for item 2: an OUTBOUND contact advances a prospect not_contacted → contacted, and NOTHING ELSE
// ever moves the stage. (app/api/admin/outreach/route.ts, action `log_contact`.)
//
// 🔴 WHAT A FAILURE LOOKS LIKE: a prospect whose stage the operator set by hand (replied / signed /
// no sale) is silently reset to "contacted" by logging a chase — destroying a judgement the operator
// made. Or an inbound reply marks the prospect "contacted", which is a LESS advanced stage than the
// truth. Either would be invisible in the UI until someone noticed the queue was wrong.
//
// ⚠️ WHAT THIS HARNESS DOES AND DOES NOT TOUCH. It runs the route's conditional-update SEMANTICS against
// a fake PostgREST that enforces the same rule Postgres does — an UPDATE matching no row is NOT an error,
// it simply affects nothing. It does NOT hit the database. The real query's shape is asserted separately
// from the route's source, below, so the two cannot drift.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

// The vocabulary, read from the one file that owns it rather than retyped.
const OUTREACH_SRC = fs.readFileSync(path.join(REPO, 'lib/outreach.ts'), 'utf8')
const STAGES = (OUTREACH_SRC.match(/export const OUTREACH_STAGES = \[([\s\S]*?)\] as const/)[1]
  .match(/'([a-z_]+)'/g) || []).map(s => s.replace(/'/g, ''))
const DEFAULT_STAGE = OUTREACH_SRC.match(/export const DEFAULT_STAGE: OutreachStage = '([a-z_]+)'/)[1]
const CONTACTED = 'contacted'

/** A fake row store enforcing PostgREST's rule: a filtered UPDATE that matches nothing is a no-op. */
function makeDb(stage) {
  const row = { id: 'p1', stage, updated_at: null }
  return {
    row,
    updateWhere(patch, whereStage) {
      if (row.stage !== whereStage) return { data: [], error: null }   // 🔴 matched nothing — NOT an error
      Object.assign(row, patch)
      return { data: [{ id: row.id, stage: row.stage }], error: null }
    },
  }
}

/** The route's semantics, as implemented. */
function advance(db, direction, opts = {}) {
  if (direction !== 'outbound') return { stage: null, warning: null }
  const res = opts.failWrite ? { data: null, error: { message: 'boom' } }
                             : db.updateWhere({ stage: CONTACTED, updated_at: 'NOW' }, DEFAULT_STAGE)
  if (res.error) return { stage: null, warning: 'Contact logged, but the stage could not be updated. Set it by hand if needed.' }
  return { stage: res.data.length > 0 ? res.data[0].stage : null, warning: null }
}

function runSuite(fn) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)

  // 🔴 THE ONE CASE THAT MOVES.
  {
    const db = makeDb(DEFAULT_STAGE)
    const r = fn(db, 'outbound')
    t('not_contacted + outbound → contacted', db.row.stage === CONTACTED && r.stage === CONTACTED)
    t('updated_at is set on the move', db.row.updated_at === 'NOW')
  }
  // 🔴 EVERY OTHER STAGE IS LEFT ALONE — including one outside the vocabulary.
  for (const s of STAGES.filter(s => s !== DEFAULT_STAGE).concat(['a_stage_nobody_defined'])) {
    const db = makeDb(s)
    const r = fn(db, 'outbound')
    const label = STAGES.includes(s) ? s : `${s} (FIXTURE, unrecognised)`
    t(`🔴 ${label} + outbound → UNCHANGED`, db.row.stage === s)
    t(`   …and reports no move (stage null) for ${label}`, r.stage === null)
  }
  // 🔴 INBOUND NEVER MOVES IT, from any stage.
  for (const s of [DEFAULT_STAGE, CONTACTED, 'replied']) {
    const db = makeDb(s)
    fn(db, 'inbound')
    t(`🔴 ${s} + INBOUND → UNCHANGED`, db.row.stage === s)
  }
  // 🔴 THE STALE TAB. The client believes not_contacted; the row has since become 'replied'.
  {
    const db = makeDb('replied')
    const r = fn(db, 'outbound')
    t('🔴 a stale client cannot overwrite a stage changed elsewhere', db.row.stage === 'replied' && r.stage === null)
  }
  // 🔴 A FAILED STAGE WRITE KEEPS THE CONTACT AND WARNS — it is never reported as a failed log.
  {
    const db = makeDb(DEFAULT_STAGE)
    const r = fn(db, 'outbound', { failWrite: true })
    t('a failed stage update returns a warning', !!r.warning)
    t('🔴 a failed stage update does NOT report the log as failed', r.stage === null && !('ok' in r && r.ok === false))
  }
  return { ok, fails }
}

// ── BROKEN VARIANTS ─────────────────────────────────────────────────────────────────────────────────
const V = {
  V1: (db, dir, o = {}) => {   // unconditional update — the destroy-the-operator's-judgement bug
    if (dir !== 'outbound') return { stage: null, warning: null }
    if (o.failWrite) return { stage: null, warning: 'w' }
    db.row.stage = CONTACTED; db.row.updated_at = 'NOW'
    return { stage: CONTACTED, warning: null }
  },
  V2: (db, dir, o = {}) => {   // fires on inbound too
    const res = o.failWrite ? { data: null, error: { message: 'x' } }
                            : db.updateWhere({ stage: CONTACTED, updated_at: 'NOW' }, DEFAULT_STAGE)
    if (res.error) return { stage: null, warning: 'w' }
    return { stage: res.data.length > 0 ? res.data[0].stage : null, warning: null }
  },
  V3: (db, dir, o = {}) => {   // no .select() — cannot tell "moved" from "matched nothing"
    if (dir !== 'outbound') return { stage: null, warning: null }
    if (o.failWrite) return { stage: null, warning: 'w' }
    db.updateWhere({ stage: CONTACTED, updated_at: 'NOW' }, DEFAULT_STAGE)
    return { stage: CONTACTED, warning: null }   // reports a move that may not have happened
  },
  V4: (db, dir, o = {}) => {   // a failed stage write is reported as a failed log
    if (dir !== 'outbound') return { stage: null, warning: null }
    if (o.failWrite) return { stage: null, warning: null, ok: false }
    const res = db.updateWhere({ stage: CONTACTED, updated_at: 'NOW' }, DEFAULT_STAGE)
    return { stage: res.data.length > 0 ? res.data[0].stage : null, warning: null }
  },
}
const NAMES = {
  V1: 'the update is unconditional (overwrites a hand-set stage)',
  V2: 'an INBOUND contact also advances the stage',
  V3: 'no .select() — a no-op update is reported as a move',
  V4: 'a failed stage write reports the whole log as failed',
}

console.log('── BROKEN VARIANTS: each MUST report FAILURE ────────────────────────────────────────────')
let allFailed = true
for (const k of Object.keys(NAMES)) {
  const r = runSuite(V[k])
  const detected = r.fails.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${k} ${NAMES[k]}`)
  for (const f of r.fails.slice(0, 2)) console.log(`        caught: ${f}`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED.'); process.exit(1) }

console.log('\n── THE REAL SEMANTICS ──────────────────────────────────────────────────────────────────')
const r = runSuite(advance)
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)

// ── THE SOURCE MUST ACTUALLY CONTAIN THAT QUERY ─────────────────────────────────────────────────────
// 🔴 WITHOUT THIS, THE MODEL ABOVE PROVES ONLY THAT THE MODEL IS CONSISTENT WITH ITSELF.
console.log('\n── THE ROUTE SOURCE ────────────────────────────────────────────────────────────────────')
const ROUTE = fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/route.ts'), 'utf8')
const srcChecks = [
  ["guarded on direction === 'outbound'", /if \(direction === 'outbound'\)/.test(ROUTE)],
  ['updates outreach_prospects', /\.from\('outreach_prospects'\)\s*\n\s*\.update\(\{ stage: CONTACTED_STAGE/.test(ROUTE)],
  ['🔴 filtered on the CURRENT stage being DEFAULT_STAGE', /\.eq\('stage', DEFAULT_STAGE\)/.test(ROUTE)],
  ['🔴 calls .select() so the row count is observable', /\.eq\('stage', DEFAULT_STAGE\)\s*\n\s*\.select\(/.test(ROUTE)],
  ['sets updated_at like update_prospect does', /updated_at: new Date\(\)\.toISOString\(\)/.test(ROUTE)],
  ['🔴 uses the CONSTANTS, not literals', /DEFAULT_STAGE/.test(ROUTE) && !/\.eq\('stage', 'not_contacted'\)/.test(ROUTE)],
  ['returns stage and warning', /stage: resultStage, warning: stageWarning/.test(ROUTE)],
]
const srcFails = []
for (const [n, okk] of srcChecks) { if (!okk) srcFails.push(n); console.log(`  ${okk ? '✓' : '🔴'} ${n}`) }

const fails = r.fails.concat(srcFails)
console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + (r.ok.length + srcChecks.length) + ' passed'}`)
process.exit(fails.length ? 1 : 0)
