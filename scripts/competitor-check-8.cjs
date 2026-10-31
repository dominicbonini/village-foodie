#!/usr/bin/env node
// scripts/competitor-check-8.cjs — competitor-check-8 (31 October 2026, docs/competitor-check-8-report.md).
//   node scripts/competitor-check-8.cjs        (NO NETWORK, NO DATABASE, NO CLAUDE API — fixture responses only)
//
// The fixes to the 31 Oct scheduled run, each proven with fixture responses:
//   1 · a failed batch item's error is LOGGED — the first 5 in full, then a count by error type; the run is an error (exit 1);
//       a failed batch collected before that was logged is re-read ONCE (no run row, no finding, $0), then never again;
//   2 · a deep check that runs out of time KEEPS the findings of every group it finished, is INCOMPLETE (not a run error),
//       saves which groups it finished, and the next run asks ONLY for the rest — nothing recorded twice; the limit is the
//       setting (1800 s by default); the job's own time stops new checks (time_up) and caps each check's deadline;
//       a call still running after the deadline is aborted and counts as the time running out;
//   3 · once out of time, verifications are not started — not_run, and ONE line "<name>: N verifications skipped (out of time)";
//   4 · a stray feature_key (or classification) on another kind of finding is dropped and counted, the finding kept; an
//       unusable finding is left out and the rest of the call kept;
//   5 · exit codes: non-zero only when a stage fails as a whole;
//   6 · the store reads the new settings tolerantly; the workflow, main.ts and the migration.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'competitor-check-8' })
const { REPO } = kit
const FX = require('./_competitor-check-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

;(async () => {
  const L = await kit.bundle('cc8-lib', [
    "export { runChecker, checkCompetitor, exitCodeOf, finishedGroups, progressFor, allFailedOutright, OutOfTimeError, DEFAULT_DEEP_TIME_LIMIT_S, MIN_CHECK_MS, JOB_MARGIN_MS } from '@/lib/competitor-check/checker'",
    "export { validateRecordFindings, KIND_FIELDS } from '@/lib/competitor-check/model'",
    "export { findingGroups, groupKeys, extractorMessage } from '@/lib/competitor-check/prompts'",
    "export { settingsOut, deepProgressOut, timeUpRefused, supabaseCheckerStore } from '@/lib/competitor-check/store-supabase'",
    "export { logBatchFailures, itemError, FAILED_ITEMS_SHOWN } from '@/lib/competitor-check/pass'",
  ].join('\n'))
  const START = Date.parse('2026-11-01T02:10:00Z')
  const URL0 = 'https://tt8.example/preise'
  const PAGE_TEXT = 'Testtruck Ordering 008 — Preise\nStarter: 29 € pro Monat zzgl. MwSt.\nKeine Mindestlaufzeit, monatlich kündbar.\n' + Array.from({ length: 15 }, (_, i) => `Funktion f${i}: ja.`).join('\n')
  // 15 features: term (with the prices, group 1), then f0–f13 → features groups of 12 and 2.
  const FEATURES = [{ key: 'term', label: 'Minimum contract', explain: 'Tied in.' }, ...Array.from({ length: 14 }, (_, i) => ({ key: `f${i}`, label: `Feature ${i}`, explain: `Thing ${i}.` }))]
  const priceF = () => FX.F({ field: 'monthly_price', plan_name: 'Starter', country_code: 'DE', outcome: 'unchanged', found_value: '29 € pro Monat zzgl. MwSt.', amount: 29, currency: 'EUR', period: 'month', vat: 'excl', quote: 'Starter: 29 € pro Monat zzgl. MwSt.', quote_en: 'Starter: €29 per month plus VAT.', source_url: URL0 })
  const featF = k => FX.F({ field: 'feature', feature_key: k, outcome: 'unchanged', feature: k === 'term' ? 'no' : 'yes', found_value: k === 'term' ? 'no' : 'yes', quote: k === 'term' ? 'Keine Mindestlaufzeit, monatlich kündbar.' : `Funktion ${k}: ja.`, quote_en: '', source_url: URL0 })
  const rec = (findings, more) => FX.toolUse('record_findings', { findings, pages_read: [URL0], notes: null, more })
  const verdict = () => FX.msg([...FX.fetchPair(URL0, PAGE_TEXT), FX.toolUse('record_verdict', { verdict: 'confirmed', value: '29 € pro Monat zzgl. MwSt.', quote: 'Starter: 29 € pro Monat zzgl. MwSt.', quote_en: '' })], 'tool_use', FX.USAGE.verifier)
  const isVerifier = p => p.tools.some(x => x.name === 'record_verdict')
  const userOf = p => { const c = p.messages[0].content; return typeof c === 'string' ? c : c.map(b => b.text || '').join('\n') }

  /** A checker world: a clock that moves `step` ms per API call, a memory store (with the new columns), a log. */
  function world({ competitors, settings = {}, features = FEATURES, step = 0, extractor, verifier = verdict, batch, jobDeadlineMs, timeLimitMs, reread }) {
    let now = START
    const lines = [], calls = []
    const store = FX.memoryCheckerStore({ settings: () => FX.SETTINGS({ deepRequestedAt: '2026-10-31T00:00:00Z', ...settings, ...(reread !== undefined ? { pass: { ...FX.SETTINGS().pass, ...(settings.pass || {}), reread } } : {}) }), competitors })
    store.features = async () => features.map(f => ({ ...f }))
    store.rereadWrites = []
    store.setPassReread = async ids => { store.rereadWrites.push(ids) }
    const deps = {
      api: async (params, opts) => {
        calls.push({ params: JSON.parse(JSON.stringify(params)), signal: !!(opts && opts.signal) })
        const turn = params.messages.filter(m => m.role === 'assistant').length
        const r = isVerifier(params) ? await verifier(params, turn) : await extractor(params, turn, opts)
        now += step
        return r
      },
      store, now: () => new Date(now), log: l => lines.push(l), dryRun: false,
      ...(batch ? { batch } : {}), ...(jobDeadlineMs !== undefined ? { jobDeadlineMs } : {}), ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
    }
    return { deps, store, lines, calls, setNow: v => { now = v }, getNow: () => now }
  }
  const comp = (i, over = {}) => FX.competitor(i, { website: 'https://tt8.example', checkUrls: [URL0], countries: ['DE'], ...over })

  // ── 1 · batch failures logged, re-read once ──
  head('1 · a failed batch item says why — in the log, first 5 in full, then counted by type; an old failed batch is re-read once')
  {
    const cs = Array.from({ length: 7 }, (_, i) => comp(100 + i))
    const items = cs.map(c => ({ customId: `${c.id}_DE`, competitorId: c.id, country: 'DE', kind: 'check' }))
    const errBody = i => (i < 5 ? { type: 'error', error: { type: 'invalid_request_error', message: `tools.2.input_schema: item ${i} is not valid` } } : { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })
    const results = items.map((it, i) => ({ custom_id: it.customId, result: { type: 'errored', error: errBody(i) } }))
    const batchApi = { create: async () => ({ id: 'msgbatch_next' }), retrieve: async () => ({ processing_status: 'ended' }), results: async () => (async function* () { yield* results })(),
      list: () => (async function* () {})() }
    const w = world({ competitors: cs, extractor: async () => { throw new Error('no sync call expected') }, batch: batchApi, reread: [],
      settings: { pass: { ...FX.SETTINGS().pass, batch: { id: 'msgbatch_old', submittedAt: '2026-10-30T08:33:00Z', items, estimateUsd: 0.3 }, requestedAt: null } } })
    const reps = await L.runChecker(w.deps, { mode: 'pass', trigger: 'schedule' })
    const r = reps[0]
    const at = w.lines.findIndex(l => /^Quick pass: batch msgbatch_old \(collected\) — 7 of 7 items failed:$/.test(l))
    const shown = w.lines.slice(at + 1, at + 6)
    t('the collected batch logs a header line, then the first 5 failed items IN FULL (name, error type, message)',
      at >= 0 && shown.length === 5 && shown.every((l, i) => l === `  Testtruck Ordering ${100 + i} · DE: invalid_request_error — tools.2.input_schema: item ${i} is not valid`), w.lines.slice(at, at + 7))
    t('…then "… and 2 more · by error type: invalid_request_error × 5, overloaded_error × 2"', w.lines[at + 6] === '  … and 2 more · by error type: invalid_request_error × 5, overloaded_error × 2', w.lines[at + 6])
    t('the run is a stage error: stopped_reason error, "Every item of the batch failed (7).", exit 1; $0; nothing marked passed',
      r.stoppedReason === 'error' && /Every item of the batch failed \(7\)/.test(r.error) && L.exitCodeOf(reps) === 1 && r.spend.usd === 0 && !w.store.schedule.length && !w.store.findings.length)
    t('…and the batch is recorded as logged (pass_batches_reread), so it is never re-read', JSON.stringify(w.store.rereadWrites) === JSON.stringify([['msgbatch_old']]), w.store.rereadWrites)

    // The re-read of a batch collected by the OLD code (its errors were never logged).
    const listed = [
      { id: 'msgbatch_31oct', processing_status: 'ended', created_at: '2026-10-30T08:33:00Z', request_counts: { processing: 0, succeeded: 0, errored: 7, canceled: 0, expired: 0 } },
      { id: 'msgbatch_good', processing_status: 'ended', created_at: '2026-10-29T08:00:00Z', request_counts: { processing: 0, succeeded: 3, errored: 0, canceled: 0, expired: 0 } },
      { id: 'msgbatch_ancient', processing_status: 'ended', created_at: '2026-09-01T08:00:00Z', request_counts: { processing: 0, succeeded: 0, errored: 2, canceled: 0, expired: 0 } },
    ]
    let resultsRead = []
    const api2 = { create: async () => ({ id: 'x' }), retrieve: async () => ({ processing_status: 'ended' }), list: () => (async function* () { yield* listed })(),
      results: async id => { resultsRead.push(id); return (async function* () { yield* (id === 'msgbatch_31oct' ? results : []) })() } }
    const w2 = world({ competitors: cs, extractor: async () => { throw new Error('none') }, batch: api2, reread: [], settings: { pass: { ...FX.SETTINGS().pass, requestedAt: null } } })
    const reps2 = await L.runChecker(w2.deps, { mode: 'pass', trigger: 'schedule' })
    const at2 = w2.lines.findIndex(l => /^Quick pass: batch msgbatch_31oct \(re-read — collected earlier, \$0, nothing written\) — 7 of 7 items failed:$/.test(l))
    t('the next run RE-READS the old failed batch (still within 29 days) and logs it the same way',
      at2 >= 0 && w2.lines[at2 + 1] === '  Testtruck Ordering 100 · DE: invalid_request_error — tools.2.input_schema: item 0 is not valid' && /by error type: invalid_request_error × 5, overloaded_error × 2/.test(w2.lines[at2 + 6]), w2.lines)
    t('…and reads ONLY it: not a batch with no failures, not one older than 29 days', JSON.stringify(resultsRead) === JSON.stringify(['msgbatch_31oct']), resultsRead)
    t('…charges and writes nothing: no run row, no finding, no schedule, no report, $0 — and records it as re-read',
      !w2.store.runs.length && !w2.store.findings.length && !w2.store.schedule.length && reps2.length === 0 && JSON.stringify(w2.store.rereadWrites) === JSON.stringify([['msgbatch_31oct']]), { runs: w2.store.runs.length, reps: reps2.length, rr: w2.store.rereadWrites })
    resultsRead = []
    const w3 = world({ competitors: cs, extractor: async () => { throw new Error('none') }, batch: api2, reread: ['msgbatch_31oct'], settings: { pass: { ...FX.SETTINGS().pass, requestedAt: null } } })
    await L.runChecker(w3.deps, { mode: 'pass', trigger: 'schedule' })
    t('…once: the run after does not read it again', resultsRead.length === 0 && !w3.lines.some(l => /msgbatch_31oct/.test(l)), resultsRead)
    const w4 = world({ competitors: cs, extractor: async () => { throw new Error('none') }, batch: api2, settings: { pass: { ...FX.SETTINGS().pass, requestedAt: null } } })
    await L.runChecker(w4.deps, { mode: 'pass', trigger: 'schedule' })
    t('before 20261053 (no pass_batches_reread): one line says so, nothing is read', w4.lines.includes('Quick pass: failed batches are not re-read until 20261053 runs (pass_batches_reread).') && resultsRead.length === 0, w4.lines)
    t('itemError: an expired item names its reason; an errored one its API type and message',
      JSON.stringify(L.itemError({ type: 'expired' })) === JSON.stringify({ type: 'expired', message: 'the batch reached its 24-hour limit before this request ran' })
      && JSON.stringify(L.itemError({ type: 'errored', error: { type: 'error', error: { type: 'api_error', message: 'Internal' } } })) === JSON.stringify({ type: 'api_error', message: 'Internal' }))
  }

  // ── 2 · a timeout mid-groups keeps the finished groups; the next run asks only for the rest ──
  head('2 · out of time mid-groups: the finished groups are kept, INCOMPLETE, and the next run does only the missing groups')
  {
    const c = comp(8)
    // Group 1 (prices + term), group 2 (f0–f11), then ONE finding of group 3 (f12) — each a response; the clock moves 700 s per
    // call, so the 4th call would start past 1800 s.
    const ext = async (p, turn) => {
      if (turn === 0) return FX.msg([...FX.fetchPair(URL0, PAGE_TEXT), rec([priceF(), featF('term')], true)], 'tool_use', FX.USAGE.deep)
      if (turn === 1) return FX.msg([rec(Array.from({ length: 12 }, (_, i) => featF(`f${i}`)), true)], 'tool_use', FX.USAGE.deep)
      if (turn === 2) return FX.msg([rec([featF('f12')], true)], 'tool_use', FX.USAGE.deep)
      throw new Error('a 4th call must never be sent')
    }
    const w = world({ competitors: [c], step: 700_000, extractor: ext })
    const [r] = await L.runChecker(w.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 008' })
    const ext3 = w.calls.filter(x => !isVerifier(x.params))
    t('the limit is the setting\'s default, 1800 s: three calls (0, 700, 1400 s), and no fourth after 2100 s', L.DEFAULT_DEEP_TIME_LIMIT_S === 1800 && ext3.length === 3, ext3.length)
    const keyOf = f => f.field === 'feature' ? `feature:${f.found.feature_key}` : f.field
    const kept = w.store.findings.map(keyOf).sort()
    t('the findings of the FINISHED groups are written (the price, term, f0–f11) — not the unfinished group\'s f12',
      kept.length === 14 && kept.includes('monthly_price') && kept.includes('feature:term') && kept.includes('feature:f11') && !kept.includes('feature:f12'), kept)
    t('the check is INCOMPLETE — "ran out of time after 2 of 3 groups — 14 finding(s) from the finished groups kept, 1 from the unfinished group left; the next run asks only for the rest"',
      r.failed.length === 1 && r.failed[0].kind === 'incomplete' && r.failed[0].error === 'ran out of time after 2 of 3 groups — 14 finding(s) from the finished groups kept, 1 from the unfinished group left; the next run asks only for the rest', r.failed)
    t('…it is not a run error: stopped_reason done, exit 0; and it is NOT marked checked (no deep_checked_at)',
      r.stoppedReason === 'done' && L.exitCodeOf([r]) === 0 && !w.store.schedule.some(([, cols]) => 'deep_checked_at' in cols), { r: r.stoppedReason, sched: w.store.schedule })
    const prog = (w.store.schedule.find(([, cols]) => 'deep_progress' in cols) || [])[1]
    t('the groups it finished are saved for the next run: deep_progress["*"] = prices done, term + f0–f11, for this deep request',
      prog && prog.deep_progress['*'].pricesDone === true && prog.deep_progress['*'].requestedAt === '2026-10-31T00:00:00Z'
      && JSON.stringify(prog.deep_progress['*'].keys.slice().sort()) === JSON.stringify(['term', ...Array.from({ length: 12 }, (_, i) => `f${i}`)].sort()), prog)
    // 3 · the verifications not reached: ONE line, all not_run.
    t('verifications: NONE started once out of time — every written finding not_run, and no "verifier failed" line',
      w.calls.filter(x => isVerifier(x.params)).length === 0 && w.store.findings.every(f => f.second_check === 'not_run') && !w.lines.some(l => /verifier failed/.test(l)), w.lines)
    t('…ONE line: "  Testtruck Ordering 008: 14 verifications skipped (out of time)"', w.lines.filter(l => /verifications? skipped/.test(l)).length === 1 && w.lines.includes('  Testtruck Ordering 008: 14 verifications skipped (out of time)'), w.lines)
    t('…and the check\'s line says INCOMPLETE with the reason', w.lines.some(l => /^ {2}Testtruck Ordering 008: INCOMPLETE — ran out of time after 2 of 3 groups/.test(l)), w.lines)

    // The next run: resumes — only group 3 is asked; the model repeats the price and a done feature; neither is written twice.
    const seenUser = []
    const ext2 = async p => { seenUser.push(userOf(p)); return FX.msg([...FX.fetchPair(URL0, PAGE_TEXT), rec([featF('f12'), featF('f13'), priceF(), featF('f3')], false)], 'tool_use', FX.USAGE.deep) }
    const w2 = world({ competitors: [c], extractor: ext2 })
    const [r2] = await L.runChecker(w2.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 008' })
    const u = seenUser[0] || ''
    t('the next run RESUMES: its message says so and lists ONE group — Features: f12, f13 — with no prices-and-terms group',
      /^RESUMED CHECK: an earlier run of this check ran out of time after recording the prices and terms .* and 12 features\./.test(u) && /Record in 1 group, in this order/.test(u) && /Group 1\. Features: f12, f13\./.test(u) && !/Prices and terms:/.test(u), u.slice(0, 700))
    t('…its feature list is only the missing two (f12, f13)', /- f12 — Feature 12/.test(u) && /- f13 — Feature 13/.test(u) && !/- f3 — Feature 3/.test(u) && !/- term — /.test(u))
    t('…nothing is recorded twice: only f12 and f13 are written (the repeated price and f3 are dropped)', JSON.stringify(w2.store.findings.map(keyOf).sort()) === JSON.stringify(['feature:f12', 'feature:f13']), w2.store.findings.map(keyOf))
    const done2 = w2.store.schedule.find(([, cols]) => 'deep_checked_at' in cols)
    t('…the check is now complete: checked, deep_checked_at set, and the saved progress cleared', r2.checked === 1 && r2.failed.length === 0 && done2 && JSON.stringify(done2[1].deep_progress) === '{}', done2)
    t('a resume for another deep request (or older than 14 days) is ignored', L.progressFor({ deepProgress: { '*': { requestedAt: 'old', at: '2026-10-31T00:00:00Z', pricesDone: true, keys: [] } } }, null, '2026-10-31T00:00:00Z', new Date(START)) === null
      && L.progressFor({ deepProgress: { DE: { requestedAt: null, at: '2026-10-01T00:00:00Z', pricesDone: true, keys: [] } } }, 'DE', null, new Date(START)) === null
      && !!L.progressFor({ deepProgress: { DE: { requestedAt: null, at: '2026-10-31T00:00:00Z', pricesDone: true, keys: [] } } }, 'DE', null, new Date(START)))
    t('finishedGroups: prices are done once the model moved on; a features group only when all its keys are in',
      (g => g.pricesDone && g.groupsDone === 1 && JSON.stringify(g.keys) === JSON.stringify(['term']))(L.finishedGroups(FEATURES, [{ field: 'monthly_price', feature_key: null }, { field: 'feature', feature_key: 'f0' }]))
      && (g => !g.pricesDone && g.keys.length === 0)(L.finishedGroups(FEATURES, [{ field: 'monthly_price', feature_key: null }, { field: 'feature', feature_key: 'term' }])))

    // A timed-out check with NOTHING recorded is still incomplete, not an error; with a job limit, time_up stops the next one.
    const slow = async () => FX.msg([...FX.fetchPair(URL0, PAGE_TEXT)], 'pause_turn', FX.USAGE.deep)
    const w3 = world({ competitors: [comp(9), comp(10)], step: 1000_000, extractor: slow, jobDeadlineMs: START + 30 * 60_000, settings: { deepCountry: null } })
    const [r3] = await L.runChecker(w3.deps, { mode: 'deep', trigger: 'manual' })
    t('the JOB\'s time caps the check: deadline = job end − 5 min (25 min here, under the 30-min limit) — 2 calls, then out of time',
      w3.calls.length === 2 && r3.failed[0] && r3.failed[0].kind === 'incomplete' && /ran out of time after 0 of 3 groups/.test(r3.failed[0].error), { n: w3.calls.length, f: r3.failed })
    t('…and the next competitor is NOT started with under 10 minutes of the job left: stopped_reason time_up, exit 0, one line',
      r3.stoppedReason === 'time_up' && L.exitCodeOf([r3]) === 0 && w3.lines.some(l => /^ {2}stopped before Testtruck Ordering 010: the job has -?\d+ min left — the rest is checked next run$/.test(l)), { r: r3.stoppedReason, lines: w3.lines })

    // A call still running at the deadline is aborted (the timer fires the signal): it counts as the time running out.
    const w4 = world({ competitors: [comp(11)], extractor: async (p, turn, opts) => {
      if (turn === 0) return FX.msg([...FX.fetchPair(URL0, PAGE_TEXT), rec([priceF(), featF('term')], true)], 'tool_use', FX.USAGE.deep)
      if (turn === 1) return FX.msg([rec(Array.from({ length: 12 }, (_, i) => featF(`f${i}`)), true)], 'tool_use', FX.USAGE.deep)
      Object.defineProperty(opts.signal, 'aborted', { value: true })   // as the meter's timer would, ABORT_GRACE_MS after the deadline
      throw Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })
    } })
    const [r4] = await L.runChecker(w4.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 011' })
    t('every API call carries the check\'s abort signal', w4.calls.length === 3 && w4.calls.every(x => x.signal), w4.calls.map(x => x.signal))
    t('an aborted call is the time running out: INCOMPLETE with the finished groups kept (14), not FAILED; no verification started after it',
      r4.failed[0] && r4.failed[0].kind === 'incomplete' && /ran out of time after 2 of 3 groups/.test(r4.failed[0].error) && w4.store.findings.length === 14
      && !w4.calls.some(x => isVerifier(x.params)) && w4.lines.includes('  Testtruck Ordering 011: 14 verifications skipped (out of time)'), { f: r4.failed, n: w4.store.findings.length, lines: w4.lines })
  }

  // ── 3 · verifications skipped part-way: one line ──
  head('3 · verifications stop at the deadline — not_run, one line, never one line each')
  {
    const ext = async () => FX.msg([...FX.fetchPair(URL0, PAGE_TEXT), rec([priceF(), featF('term'), ...Array.from({ length: 14 }, (_, i) => featF(`f${i}`))], false)], 'tool_use', FX.USAGE.deep)
    const w = world({ competitors: [comp(12)], step: 400_000, extractor: ext })
    const [r] = await L.runChecker(w.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 012' })
    const ran = w.calls.filter(x => isVerifier(x.params)).length
    const st = w.store.findings.map(f => f.second_check)
    t('the extraction finished; the verifier ran until the deadline (1800 s at 400 s a call: 4 verifications), then stopped',
      ran === 4 && st.filter(x => x === 'confirmed').length === 4 && st.filter(x => x === 'not_run').length === 12, { ran, st })
    t('…ONE line for the rest: "  Testtruck Ordering 012: 12 verifications skipped (out of time)" — no per-claim lines',
      w.lines.includes('  Testtruck Ordering 012: 12 verifications skipped (out of time)') && !w.lines.some(l => /verifier failed/.test(l)), w.lines)
    t('…the extraction itself finished, so the check counts as checked (its unverified findings show "not checked" in Admin)', r.checked === 1 && r.failed.length === 0, r.failed)
  }

  // ── 4 · stray fields ──
  head('4 · a stray feature_key is dropped and counted; an unusable finding is left out; the rest of the call is kept')
  {
    const v = L.validateRecordFindings({ findings: [
      FX.F({ field: 'plan', plan_name: 'Starter', feature_key: 'kds', outcome: 'not_stated' }),          // stray feature_key
      FX.F({ field: 'monthly_price', feature: 'yes', classification: 'marketplace', outcome: 'not_stated' }), // two stray fields
      FX.F({ field: 'feature', feature_key: 'f1', feature: 'yes', outcome: 'unchanged', quote: 'Funktion f1: ja.', quote_en: '', source_url: URL0, bogus: 1 }),   // an unknown property
      FX.F({ field: 'monthly_price', outcome: 'changed', quote: null }),                                     // unusable: no quote
    ], pages_read: [URL0], notes: null, more: false, junk: true })
    t('the call is KEPT with its 3 usable findings; the stray fields are dropped from them (feature_key, feature, classification → null)',
      v.ok && v.value.findings.length === 3 && v.value.findings[0].feature_key === null && v.value.findings[1].feature === null && v.value.findings[1].classification === null && !('bogus' in v.value.findings[2]) && !('junk' in v.value), v)
    t('…counted: 5 stray fields (feature_key, feature, classification, an unknown property on a finding and one on the call); 1 unusable finding, with its reason',
      v.ok && v.value.ignored.strayFields === 5 && v.value.ignored.unusable.length === 1 && /findings\[3\]: a "changed" finding needs a verbatim quote/.test(v.value.ignored.unusable[0]), v.ok && v.value.ignored)
    t('the feature finding keeps its key; a classification finding keeps its classification (they belong there)',
      v.ok && v.value.findings[2].feature_key === 'f1' && L.validateRecordFindings({ findings: [FX.F({ field: 'classification', outcome: 'classification', classification: 'marketplace', quote: 'q', quote_en: '', source_url: URL0 })], pages_read: [], notes: null }).value.findings[0].classification === 'marketplace')
    t('a call whose EVERY finding is unusable is still rejected (sent back once to fix)', !L.validateRecordFindings({ findings: [FX.F({ outcome: 'changed', quote: null })], pages_read: [], notes: null }).ok)
    // Through a real check: the 31 Oct case — a stray feature_key used to fail Clover · DE; now its findings are written.
    const ext = async () => FX.msg([...FX.fetchPair(URL0, PAGE_TEXT), rec([priceF(), { ...featF('term') }, { ...priceF(), field: 'setup_fee', feature_key: 'term', found_value: '0 €' }, ...Array.from({ length: 14 }, (_, i) => featF(`f${i}`))], false)], 'tool_use', FX.USAGE.deep)
    const w = world({ competitors: [comp(13)], extractor: ext })
    const [r] = await L.runChecker(w.deps, { mode: 'single', trigger: 'manual', competitor: 'Testtruck Ordering 013' })
    t('a check whose call has a stray feature_key COMPLETES (one call, not malformed twice) and writes every finding',
      r.checked === 1 && r.failed.length === 0 && w.store.findings.length === 17 && w.calls.filter(x => !isVerifier(x.params)).length === 1, { f: r.failed, n: w.store.findings.length })
    t('…and its line counts it: "1 stray field ignored"', w.lines.some(l => /^ {2}Testtruck Ordering 013: 17 finding\(s\), 1 stray field ignored · \$/.test(l)), w.lines.filter(l => /013/.test(l)))
    t('KIND_FIELDS names the fields that belong to one kind', JSON.stringify(Object.keys(L.KIND_FIELDS)) === JSON.stringify(['feature_key', 'feature', 'classification']))
  }

  // ── 5 · exit codes ──
  head('5 · exit codes — non-zero only when a stage fails as a whole')
  {
    const boom = async () => { throw Object.assign(new Error('500 internal server error'), { status: 500 }) }
    const w = world({ competitors: [comp(20), comp(21)], extractor: boom })
    const [r] = await L.runChecker(w.deps, { mode: 'deep', trigger: 'manual' })
    t('every competitor failing OUTRIGHT: stopped_reason error, exit 1', r.stoppedReason === 'error' && L.exitCodeOf([r]) === 1 && r.failed.every(f => f.kind === 'error'))
    const slow = async () => FX.msg([...FX.fetchPair(URL0, PAGE_TEXT)], 'pause_turn', FX.USAGE.deep)
    const w2 = world({ competitors: [comp(22), comp(23)], step: 1000_000, extractor: slow })
    const [r2] = await L.runChecker(w2.deps, { mode: 'deep', trigger: 'manual' })
    t('every competitor timing out: each INCOMPLETE, the run done, exit 0', r2.failed.length === 2 && r2.failed.every(f => f.kind === 'incomplete') && r2.stoppedReason === 'done' && L.exitCodeOf([r2]) === 0, r2)
    t('allFailedOutright: one incomplete among outright failures is not "all failed"', !L.allFailedOutright({ checked: 0, failed: [{ kind: 'error' }, { kind: 'incomplete' }] }) && L.allFailedOutright({ checked: 0, failed: [{ kind: 'error' }] }) && !L.allFailedOutright({ checked: 1, failed: [{ kind: 'error' }] }))
    t('a scheduled job where the pass batch failed as a whole and the deep check timed out: exit 1 (the batch), and the deep share still ran',
      L.exitCodeOf([{ stoppedReason: 'error' }, r2]) === 1)
  }

  // ── 6 · the settings, the store, the workflow, main.ts, the migration ──
  head('6 · settings read tolerantly; the store, the workflow, main.ts and the migration')
  {
    const base = { paused: false, daily_cap_usd: 8, monthly_cap_usd: 90, deep_per_day: 15, check_interval_days: 90, extractor_model: 'm', verifier_model: 'm', prices: {} }
    t('deep_time_limit_seconds: 1800 before the column exists; the setting when it does; out of range → 1800',
      L.settingsOut(base).deepTimeLimitSeconds === 1800 && L.settingsOut({ ...base, deep_time_limit_seconds: 2400 }).deepTimeLimitSeconds === 2400 && L.settingsOut({ ...base, deep_time_limit_seconds: 9999 }).deepTimeLimitSeconds === 1800)
    t('pass_batches_reread: null before the column (the re-read waits), the list after', L.settingsOut(base).pass.reread === null && JSON.stringify(L.settingsOut({ ...base, pass_batches_reread: ['a', 3] }).pass.reread) === '["a"]')
    t('deep_progress: only well-formed entries are read', JSON.stringify(Object.keys(L.deepProgressOut({ DE: { requestedAt: null, at: 'x', pricesDone: true, keys: ['a'] }, AT: { at: 'x' }, FR: 'no' }))) === '["DE"]' && JSON.stringify(L.deepProgressOut(null)) === '{}')
    t('time_up refused by the old CHECK is recognised (the run is then recorded done)', L.timeUpRefused({ code: '23514', message: 'new row for relation "competitor_check_runs" violates check constraint "competitor_check_runs_stopped_reason_check"' }) && !L.timeUpRefused({ code: '23514', message: 'second_check' }))
    // The Supabase store against a tiny fake: deep_progress dropped (not the rest) while its column is missing.
    const writes = []
    let first = true
    const fakeDb = { from: () => ({ update: cols => ({ eq: async () => { writes.push(Object.keys(cols)); if (first && 'deep_progress' in cols) { first = false; return { error: { code: '42703', message: 'column "deep_progress" does not exist' } } } return { error: null } } }) }) }
    await L.supabaseCheckerStore(fakeDb).setSchedule('c1', { deep_progress: {}, last_checked_at: 'x' })
    t('setSchedule before 20261053: the rest of the schedule is still written without deep_progress', JSON.stringify(writes) === JSON.stringify([['deep_progress', 'last_checked_at'], ['last_checked_at']]), writes)
    const wf = read('.github/workflows/competitor-check.yml'), main = read('scripts/competitor-check/main.ts'), mig = read('supabase/migrations/20261053_competitor_check_8.sql')
    t('the workflow: timeout-minutes 350 (under GitHub\'s 360) and the checker told --job-minutes 330', /timeout-minutes: 350\n/.test(wf) && /args=\(--mode "\$MODE" --job-minutes 330\)/.test(wf))
    t('…still Workload Identity Federation only: no ANTHROPIC_API_KEY anywhere, and main.ts refuses one', !/ANTHROPIC_API_KEY/.test(wf) && /if \(process\.env\.ANTHROPIC_API_KEY\) throw/.test(main))
    t('main.ts: the abort signal reaches the SDK\'s stream, the batch list is wired, --job-minutes sets the job deadline',
      /messages\.stream\(params as never, opts\?\.signal \? \{ signal: opts\.signal \} : undefined\)/.test(main) && /batches\.list\(\{ limit: 20 \}\)/.test(main) && /jobDeadlineMs: startedMs \+ jobMinutes \* 60_000/.test(main))
    t('the migration (NOT RUN): the time-limit setting (1800, 60–3600), pass_batches_reread, deep_progress, and time_up — one transaction',
      /add column if not exists deep_time_limit_seconds integer not null default 1800/.test(mig) && /between 60 and 3600/.test(mig) && /pass_batches_reread\s+jsonb/.test(mig)
      && /add column if not exists deep_progress jsonb/.test(mig) && /'error', 'time_up'/.test(mig) && (mig.match(/^begin;$/gm) || []).length === 1 && (mig.match(/^commit;$/gm) || []).length === 1 && /NOT RUN/.test(mig))
  }

  console.log(`\n${fail ? '🔴' : '✅'} competitor-check-8: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
