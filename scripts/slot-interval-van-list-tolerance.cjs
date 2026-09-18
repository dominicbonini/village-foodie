#!/usr/bin/env node
// scripts/slot-interval-van-list-tolerance.cjs
//
// Proof that THE VAN LIST NEVER DEPENDS ON THE INTERVAL COLUMNS.
//   node scripts/slot-interval-van-list-tolerance.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE — AND IT WAS OBSERVED, NOT IMAGINED. On localhost, 17 September 2026,
// Manage → Settings showed NO VANS for test-truck. get_vans' NAMED select had gained
// truck_vans.collection_interval_mins and truck_vans.operator_collection_interval_mins, and PostgREST
// fails the WHOLE statement with 42703 when one named column is absent. The van list came back empty,
// and with it every van's Kitchen capacity box, offline protection, buzzers and display settings.
// Deployed ahead of its migration that would have hidden Pizzeria Gusto's only van — and its
// kitchen_capacity ceiling — from its own operator.
//
// So: the list is read with its HEAD column set, the intervals come from a SEPARATE probed read, and a
// failure degrades to 5/null rather than to nothing. This harness holds that open.

const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const src = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

const manage = strip(src('app/api/manage/route.ts'))
const managePage = src('app/manage/[token]/page.tsx')
const { readVanIntervalsForTruck, DEFAULT_INTERVAL } = compile(REPO, ['lib/slot-interval.ts'], 'tolerance').req('lib/slot-interval.js')

// The HEAD column list, read from git rather than retyped, so this cannot drift.
const { execFileSync } = require('child_process')
const headManage = execFileSync('git', ['show', 'HEAD:app/api/manage/route.ts'], { cwd: REPO }).toString()
const headSelect = (headManage.match(/\.select\('id, truck_id, name, kds_token[^']*'\)/) || [''])[0]
const nowSelect  = (manage.match(/\.select\('id, truck_id, name, kds_token[^']*'\)/) || [''])[0]

/** A fake client whose truck_vans reads answer per-select, so the two reads can fail independently. */
const fakeSupabase = ({ intervalError = null } = {}) => ({
  from() {
    const q = {
      select(cols) { q._cols = cols; return q },
      eq() { return q },
      order() { return Promise.resolve(q._answer()) },
      then(res) { return Promise.resolve(q._answer()).then(res) },
      _answer() {
        const wantsIntervals = /collection_interval_mins/.test(String(q._cols))
        if (wantsIntervals && intervalError) return { data: null, error: intervalError }
        const rows = [
          { id: 'van-1', truck_id: 't', name: 'Van1', kitchen_capacity: 2,    capacity_window_mins: 5,  collection_interval_mins: 5,  operator_collection_interval_mins: null },
          { id: 'van-2', truck_id: 't', name: 'Van2', kitchen_capacity: 8,    capacity_window_mins: 10, collection_interval_mins: 15, operator_collection_interval_mins: 15 },
        ].map(r => {
          const out = {}
          for (const c of String(q._cols).split(',').map(x => x.trim())) out[c] = r[c]
          return out
        })
        return { data: rows, error: null }
      },
    }
    return q
  },
})

/** get_vans, modelled exactly as the route now composes it. */
async function getVans(opts) {
  const listCols = 'id, truck_id, name, kds_token, active, auto_pause_on_offline, offline_protection_mode, offline_auto_reject_mins, show_cooking_step, order_ready_enabled, display_layout, split_screen, kitchen_capacity, capacity_window_mins, buzzer_count'
  const sb = fakeSupabase(opts)
  const { data } = await sb.from('truck_vans').select(listCols).eq('truck_id', 't').eq('active', true).order('created_at')
  const intervals = await readVanIntervalsForTruck(sb, 't')
  const vans = (data || []).map(v => {
    const iv = intervals.byVanId.get(v.id)
    return { ...v, collection_interval_mins: iv ? iv.customer : DEFAULT_INTERVAL, operator_collection_interval_mins: iv ? iv.rawOverride : null }
  })
  return { vans, intervalsAvailable: intervals.ok }
}
/** The BROKEN variant: one combined named select, as the defect had it. */
async function getVansCombined(opts) {
  const sb = fakeSupabase(opts)
  const { data, error } = await sb.from('truck_vans')
    .select('id, truck_id, name, kitchen_capacity, capacity_window_mins, collection_interval_mins, operator_collection_interval_mins')
    .eq('truck_id', 't').eq('active', true).order('created_at')
  if (error) return { vans: [], error }
  return { vans: data || [] }
}

const E42703 = { code: '42703', message: 'column truck_vans.collection_interval_mins does not exist' }

;(async () => {

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  const r = await getVansCombined({ intervalError: E42703 })
  const empty = r.vans.length === 0
  console.log(`  ${empty ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 interval columns back in get_vans' main select — 42703 yields ${r.vans.length} vans (the observed defect)`)
  if (!empty) process.exit(1)
  // …and the same variant is fine when the columns DO exist, which is exactly why it shipped.
  const ok = await getVansCombined({})
  console.log(`  ⚠️ …and with the columns present it returns ${ok.vans.length} vans — which is why the defect was invisible until the migration lagged the deploy`)
}

console.log('\n── get_vans\' MAIN SELECT NAMES NEITHER COLUMN ──────────────────────────────────────────')
check(!/collection_interval_mins/.test(nowSelect), `the van-list select does not name collection_interval_mins`)
check(!/operator_collection_interval_mins/.test(nowSelect), '…nor operator_collection_interval_mins')
check(nowSelect === headSelect, '🔴 it is BYTE-IDENTICAL to HEAD\'s column list (compared against `git show`, not retyped)')
check(/const intervals = await readVanIntervalsForTruck\(supabase, truck\.id\)/.test(manage), 'the intervals come from a SEPARATE probed read')
check(/return NextResponse\.json\(\{ vans, intervalsAvailable: intervals\.ok \}\)/.test(manage), '…and the response says whether that read succeeded')

console.log('\n── A 42703 ON THE INTERVAL READ STILL YIELDS EVERY VAN, AT 5/null ──────────────────────')
{
  const r = await getVans({ intervalError: E42703 })
  check(r.vans.length === 2, `${r.vans.length} vans returned (both)`)
  check(r.vans.every(v => v.collection_interval_mins === 5), 'every van reads collection_interval_mins = 5')
  check(r.vans.every(v => v.operator_collection_interval_mins === null), 'every van reads operator_collection_interval_mins = null')
  check(r.intervalsAvailable === false, 'intervalsAvailable is false, so the UI can say so')
  check(r.vans.every(v => 'kitchen_capacity' in v && 'capacity_window_mins' in v), '🔴 kitchen_capacity and capacity_window_mins survive — the Kitchen capacity box still has its data')
  check(r.vans[0].kitchen_capacity === 2 && r.vans[1].kitchen_capacity === 8, '…with their real values (2 and 8), not defaults')
}

console.log('\n── PGRST204 (a stale schema cache) behaves the same way ────────────────────────────────')
{
  const r = await getVans({ intervalError: { code: 'PGRST204', message: 'schema cache' } })
  check(r.vans.length === 2 && r.intervalsAvailable === false, 'both vans, flagged unavailable')
}

console.log('\n── THE HEALTHY PATH IS UNCHANGED ───────────────────────────────────────────────────────')
{
  const r = await getVans({})
  check(r.intervalsAvailable === true, 'intervalsAvailable true')
  check(r.vans[0].collection_interval_mins === 5 && r.vans[0].operator_collection_interval_mins === null, 'van-1 → 5 / null')
  check(r.vans[1].collection_interval_mins === 15 && r.vans[1].operator_collection_interval_mins === 15,
    '🔴 van-2 → 15 / 15: an override deliberately EQUAL to the customer value reads back as set, so the tickbox stays ticked')
}

console.log('\n── THE MANAGE PAGE RENDERS EVERY VAN REGARDLESS ────────────────────────────────────────')
{
  const vanMapStart = managePage.indexOf('{vans.map(van => (')
  const box = managePage.slice(managePage.indexOf('COLLECTION TIMES — PER VAN'), managePage.indexOf('{/* Kitchen capacity — ONE aligned grid'))
  check(vanMapStart > 0, 'the van list is a plain vans.map over the response')
  check(!/intervalsAvailable[\s\S]{0,80}vans\.map/.test(managePage), '🔴 the van map is NOT gated on intervalsAvailable')
  check(/\{!intervalsAvailable \? \(/.test(box), 'only the Collection times box branches on it')
  check(/Collection times are unavailable right now\./.test(box), 'the disabled state shows exactly "Collection times are unavailable right now."')
  // No controls in the unavailable branch.
  const unavail = box.slice(box.indexOf('{!intervalsAvailable ? ('), box.indexOf(') : (() => {'))
  check(!/<select|<input|updateVanSetting/.test(unavail), 'the unavailable branch renders no select, no checkbox and no save')
  check(!/[a-z]/.test(unavail.replace(/Collection times are unavailable right now\./, '').replace(/[\s\S]*?\/\*[\s\S]*?\*\//, '').replace(/className="[^"]*"/g, '').replace(/[^>]*>/g, '')), 'no other text in the unavailable branch')
  check(/setIntervalsAvailable\(r\.intervalsAvailable !== false\)/.test(managePage), 'an absent flag reads as available — a missing field never disables a working setting')
  // The Kitchen capacity box is a sibling of the Collection times box, not a child.
  const kcIdx = managePage.indexOf('{/* Kitchen capacity — ONE aligned grid')
  check(kcIdx > managePage.indexOf('COLLECTION TIMES — PER VAN'), 'Kitchen capacity renders after Collection times, as a sibling')
  check(!/intervalsAvailable/.test(managePage.slice(kcIdx, kcIdx + 4000)), '🔴 the Kitchen capacity box does not mention intervalsAvailable — it cannot be hidden by it')
}

console.log('\n── update_van_settings CANNOT LOSE OTHER SETTINGS TO A MISSING COLUMN ──────────────────')
check(/const intervalUpdates: Record<string, unknown> = \{\}/.test(manage), 'the interval keys collect into their OWN object')
check(/intervalUpdates\.collection_interval_mins = collection_interval_mins/.test(manage) && /intervalUpdates\.operator_collection_interval_mins = operator_collection_interval_mins/.test(manage), '…both of them')
check(/if \(Object\.keys\(updates\)\.length\) \{[\s\S]{0,200}\.update\(updates\)/.test(manage), 'the other settings are written in their own statement')
check(/if \(Object\.keys\(intervalUpdates\)\.length\) \{[\s\S]{0,260}\.update\(intervalUpdates\)/.test(manage), 'the intervals are written in a SEPARATE statement')
check(/const \{ error: ivErr \}[\s\S]{0,400}if \(ivErr\) \{/.test(manage), '🔴 the interval write IS error-checked')
check(/return NextResponse\.json\(\{ error: 'Collection times could not be saved right now\.' \}, \{ status: 500 \}\)/.test(manage), '…and a failure returns a visible error, never { ok: true }')
check(/PGRST204/.test(manage) && /42703/.test(manage), '…logged distinguishably, so the fix is identifiable')

console.log('\n── NO OTHER NAMED VAN SELECT NAMES THE INTERVAL COLUMNS ────────────────────────────────')
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return ['node_modules', '.next', '.git'].includes(e.name) ? [] : walk(p)
    return [p]
  })
  const files = ['app', 'lib', 'components', 'scripts'].flatMap(d => walk(path.join(REPO, d)))
  const offenders = []
  for (const f of files) {
    if (f.includes('slot-interval-van-list-tolerance')) continue        // this file quotes them on purpose
    const t = fs.readFileSync(f, 'utf8')
    for (const m of t.matchAll(/\.select\(\s*'([^']*collection_interval_mins[^']*)'/g)) {
      const cols = m[1]
      // 🔴 truck_vans ONLY. `trucks.collection_interval_mins` is a DIFFERENT, still-live column — the
      // legacy customer interval for an event whose van cannot be resolved — and seed-demo-orders
      // selects it beside slot_duration_mins perfectly legitimately. A first draft of this scan did not
      // check the table and reported that as a defect; the table is what makes the shape dangerous.
      const before = t.slice(Math.max(0, m.index - 400), m.index)
      const table = (before.match(/\.from\('([a-z_]+)'\)[^.]*$/) || before.match(/\.from\('([a-z_]+)'\)/g) || []).slice(-1)[0] || ''
      if (!/truck_vans/.test(String(table))) continue
      // The ONE legitimate shape: a select of the interval columns ALONE (optionally with id), which is
      // the tolerant probe. Anything that mixes them with other van fields is the defect's shape.
      const list = cols.split(',').map(x => x.trim())
      const others = list.filter(c => !/^(id|collection_interval_mins|operator_collection_interval_mins)$/.test(c))
      if (others.length) offenders.push(`${path.relative(REPO, f)} :: ${cols}`)
    }
  }
  check(offenders.length === 0, `${files.length} files scanned; van selects mixing interval columns with other fields: ${offenders.length}${offenders.length ? '\n      ' + offenders.join('\n      ') : ''}`)
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ van-list tolerance proven'}`)
process.exit(fails ? 1 : 0)
})()
