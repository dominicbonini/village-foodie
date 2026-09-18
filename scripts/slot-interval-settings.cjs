#!/usr/bin/env node
// scripts/slot-interval-settings.cjs
//
// Proof of the SETTINGS plumbing at VAN level, and of V4's copy exactly as specified.
//   node scripts/slot-interval-settings.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: the Manage select saves but update_van_settings' destructure silently
// drops the key (its own comment: a key not named "never reaches `updates`… the toast says saved, and
// nothing was written"); a key missing from get_vans' NAMED select so the value writes and never reads
// back; a value like 7 or "15" reaching the DB; null refused for the override so the box can be ticked
// and never unticked; the tickbox backed by a second stored flag that can drift from the column; the
// example lines hard-coded instead of generated; or the box rendering below Kitchen capacity.

const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const src = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

const manage      = strip(src('app/api/manage/route.ts'))
const managePage  = strip(src('app/manage/[token]/page.tsx'))
const supa        = strip(src('lib/supabase.ts'))
const ivLib       = strip(src('lib/slot-interval.ts'))
const mig         = src('supabase/migrations/20260917_van_collection_intervals.sql')
const { INTERVAL_CHOICES, isIntervalChoice, normaliseInterval } = compile(REPO, ['lib/slot-interval.ts'], 'settings').req('lib/slot-interval.js')
const { intervalExample } = compile(REPO, ['lib/slot-generation.ts'], 'settings2').req('lib/slot-generation.js')

// The van destructure IS the allowlist: a key not named is dropped silently.
const vanKeys = (manage.match(/const \{ vanId,([^}]+)\} = body/) || [])[1].split(',').map(s => s.trim()).filter(Boolean)
const truckAllowed = ((manage.match(/const allowed = \[([^\]]+)\]/) || [])[1] || '').split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
const getVansSelect = (manage.match(/\.select\('id, truck_id, name, kds_token[^']*'\)/) || [''])[0]

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  const v1 = vanKeys.filter(k => k !== 'operator_collection_interval_mins')
  const dropped = !v1.includes('operator_collection_interval_mins')
  console.log(`  ${dropped ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 override missing from update_van_settings' destructure → the save is silently dropped`)
  if (!dropped) process.exit(1)
  // 🔴 RE-TARGETED 17 September 2026. This used to strip the column from get_vans' select — which, now
  // that the select deliberately names neither column, is a variant that cannot fail and therefore
  // proves nothing. The real read-back risk moved with the hardening: get_vans MERGES the separately
  // read intervals onto each van, and a merge that dropped them would leave the UI reading `undefined`
  // and rendering "Every 5 minutes" over a stored 15.
  const merged = { id: 'v1', kitchen_capacity: 2, collection_interval_mins: 15, operator_collection_interval_mins: 15 }
  const brokenMerge = (v) => ({ id: v.id, kitchen_capacity: v.kitchen_capacity })   // forgot the merge
  const lost = brokenMerge(merged).collection_interval_mins === undefined
  console.log(`  ${lost ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 get_vans not merging the separate interval read → a stored 15 reads back as ${brokenMerge(merged).collection_interval_mins}`)
  if (!lost) process.exit(1)
  // V3: the override normalised instead of null-checked — the arithmetic mistake the library forbids.
  const brokenTruck = (customer, override) => normaliseInterval(override)
  console.log(`  ${brokenTruck(15, null) === 5 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 override read through normaliseInterval → a NULL override on a customer-15 van gives ${brokenTruck(15, null)}, not 15`)
  if (brokenTruck(15, null) !== 5) process.exit(1)
}

console.log('\n── update_van_settings: both keys allowlisted and validated ─────────────────────────────')
check(vanKeys.includes('collection_interval_mins') && vanKeys.includes('operator_collection_interval_mins'), `the destructure names both keys (${vanKeys.length} fields)`)
check(/if \(collection_interval_mins !== undefined\) \{\s*if \(!isIntervalChoice\(collection_interval_mins\)\)/.test(manage), 'customer value validated with isIntervalChoice')
check(/if \(operator_collection_interval_mins !== undefined\) \{\s*if \(operator_collection_interval_mins !== null && !isIntervalChoice\(operator_collection_interval_mins\)\)/.test(manage), '🔴 override: NULL accepted explicitly, anything else validated — so the box can be unticked')
check(/intervalUpdates\.operator_collection_interval_mins = operator_collection_interval_mins/.test(manage), '…and the value (including null) is written, not skipped (into intervalUpdates — see the tolerance harness)')
check((manage.match(/Collection times must be every \$\{INTERVAL_CHOICES\.join\(', '\)\} minutes\./g) || []).length === 2, 'both return a visible 400, not a silent drop')
check(/status: 400/.test(manage.slice(manage.indexOf('collection_interval_mins !== undefined'))), 'the refusal is an HTTP 400')

console.log('\n── get_vans: the intervals come from a SEPARATE read, NOT the van-list select ──────────')
// 🔴 INVERTED 17 September 2026. This used to require both columns ON get_vans' named select. That was
// the defect: PostgREST fails the whole statement on one absent column, so Manage → Settings rendered
// NO VANS before the migration. The rule is now the opposite, and scripts/slot-interval-van-list-tolerance.cjs
// is its full proof; the two assertions here stop this file from drifting back.
check(!/collection_interval_mins/.test(getVansSelect), `get_vans' van-list select names NEITHER interval column (${getVansSelect.length} chars)`)
check(/const intervals = await readVanIntervalsForTruck\(supabase, truck\.id\)/.test(manage), '…they are read separately, through the capability-probed batch reader')
check(/collection_interval_mins: iv \? iv\.customer : DEFAULT_INTERVAL/.test(manage), '…and MERGED onto each van, so the value reads back')
check(/operator_collection_interval_mins: iv \? iv\.rawOverride : null/.test(manage), '🔴 the override merges as the RAW stored value, so an override equal to the customer value stays ticked')

console.log('\n── update_truck: neither key remains ────────────────────────────────────────────────────')
check(!truckAllowed.includes('collection_interval_mins') && !truckAllowed.includes('operator_collection_interval_mins'), `update_truck's allowlist (${truckAllowed.length} keys) contains neither`)
check(!/for \(const key of \['collection_interval_mins'/.test(manage), 'the per-truck validation loop is gone')

console.log('\n── nothing reads the dropped trucks column ──────────────────────────────────────────────')
{
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.next' ? [] : walk(p)
    return [p]
  })
  const files = ['app', 'lib', 'components'].flatMap(d => walk(path.join(REPO, d)))
  const offenders = files.filter(f => {
    const t = strip(fs.readFileSync(f, 'utf8'))
    if (!/operator_collection_interval_mins/.test(t)) return false
    // Legitimate: truck_vans reads/writes and the Van-typed client field. Offending: a trucks read.
    return /from\('trucks'\)[\s\S]{0,200}operator_collection_interval_mins/.test(t)
  })
  check(offenders.length === 0, `${files.length} source files scanned; trucks.operator_collection_interval_mins read in ${offenders.length}${offenders.length ? ': ' + offenders.map(f => path.relative(REPO, f)).join(', ') : ''}`)
  check(!/readOperatorInterval/.test(files.map(f => fs.readFileSync(f, 'utf8')).join('\n')), 'readOperatorInterval no longer exists anywhere in app/, lib/ or components/')
}

console.log('\n── the library: NULL is not 5 ──────────────────────────────────────────────────────────')
check(JSON.stringify(INTERVAL_CHOICES) === '[5,10,15,20,30]', 'INTERVAL_CHOICES = 5, 10, 15, 20, 30')
check([5,10,15,20,30].every(isIntervalChoice) && ![0,7,25,60,'15',null,undefined,NaN,5.5].some(isIntervalChoice), 'isIntervalChoice accepts exactly the five')
check(/const truck = override === null \|\| override === undefined \? customer : normaliseInterval\(override\)/.test(ivLib), '🔴 readVanIntervals resolves a null override to the CUSTOMER value, never to 5')
check(/if \(!vanId\) return NO_VAN_INTERVALS/.test(ivLib), 'no van id ⇒ 5/5 with no query')
check(/PGRST204/.test(ivLib) && /42703/.test(ivLib) && /return NO_VAN_INTERVALS/.test(ivLib), 'probe distinguishes PGRST204 from 42703 and falls back to 5/5, never throws')
check(/\.select\('collection_interval_mins, operator_collection_interval_mins'\)/.test(ivLib) && /\.from\('truck_vans'\)/.test(ivLib), 'it is a SEPARATE tolerant select on truck_vans')
check(/vanId: string \| null \| undefined/.test(ivLib), 'it takes a van id — never an event, never a truck')

console.log('\n── the migration matches the library and V1\'s nullability ───────────────────────────────')
check(/add column if not exists collection_interval_mins integer not null default 5/.test(mig), 'customer column: integer NOT NULL DEFAULT 5')
check(/add column if not exists operator_collection_interval_mins integer;/.test(mig), '🔴 override column: NULLABLE, NO DEFAULT')
check(/check \(collection_interval_mins in \(5, 10, 15, 20, 30\)\)/.test(mig), 'customer CHECK = INTERVAL_CHOICES')
check(/check \(operator_collection_interval_mins is null\s*\n?\s*or operator_collection_interval_mins in \(5, 10, 15, 20, 30\)\)/.test(mig), 'override CHECK = null or INTERVAL_CHOICES')
check(/drop column if exists operator_collection_interval_mins/.test(mig) && /alter table public\.trucks/.test(mig), 'trucks.operator_collection_interval_mins is dropped')
check(/drop constraint if exists trucks_operator_collection_interval_mins_check/.test(mig), '…and its CHECK with it')
check(!/alter table public\.trucks[\s\S]*?collection_interval_mins integer/.test(mig.replace(/drop column if exists operator_collection_interval_mins/g, '')), 'trucks.collection_interval_mins is not altered')
check(/notify pgrst, 'reload schema'/.test(mig), "ends with notify pgrst, 'reload schema'")

console.log('\n── V4 COPY, EXACTLY ────────────────────────────────────────────────────────────────────')
const rawPage = src('app/manage/[token]/page.tsx')
const boxStart = rawPage.indexOf('COLLECTION TIMES — PER VAN')
const kcStart  = rawPage.indexOf('{/* Kitchen capacity — ONE aligned grid')
const box = rawPage.slice(boxStart, kcStart)
check(boxStart > 0 && kcStart > boxStart, `🔴 the Collection times box renders BEFORE the Kitchen capacity box (${boxStart} < ${kcStart})`)
check(/<p className=\{`\$\{SUBCARD_HEADING\} mb-1`\}>Collection times<\/p>/.test(box), 'title is exactly "Collection times"')
check(/How far apart collection times are\. This doesn&apos;t change kitchen capacity or prep times\./.test(box), 'intro is exactly the one specified line')
check(/<span className="text-sm font-semibold text-slate-800">Customer Collection Times<\/span>/.test(box), 'first select label is "Customer Collection Times"')
check(/<span className="text-sm font-semibold text-slate-800">Your Collection Times<\/span>/.test(box), 'second select label is "Your Collection Times"')
check(/<span className="text-sm text-slate-800">Use different times for orders I add<\/span>/.test(box), 'checkbox label is "Use different times for orders I add"')
check(/\{overrideOn \? 'Customers can pick ' : 'You and your customers can pick '\}/.test(box), '🔴 the line under the first select switches wording with the box')
check(/You can pick \{intervalExample\(operator\)\}/.test(box), 'the line under the second select reads "You can pick …"')
check(/Every \{n\} minutes/.test(box) && (box.match(/INTERVAL_CHOICES\.map/g) || []).length === 2, 'both selects use "Every N minutes" from INTERVAL_CHOICES')
// No stray copy: every quoted sentence in the box must be one V4 named.
{
  const ALLOWED = ['Collection times', 'How far apart collection times are. This doesn&apos;t change kitchen capacity or prep times.',
                   'Customer Collection Times', 'Your Collection Times', 'Use different times for orders I add',
                   'Customers can pick ', 'You and your customers can pick ', 'You can pick ',
                   // The degraded state's ONE line, required when the interval columns cannot be read.
                   'Collection times are unavailable right now.']
  // 18 September 2026: ONE conditional line under the selects — the misaligned-prep hint. Its sentence
  // comes from collectionTimesHint (lib/slot-interval), so it is not literal prose here; it is allowed by
  // asserting the single call, and nothing else.
  check((box.match(/collectionTimesHint\(mc\)/g) || []).length === 1 && /misalignedCookingCategory\(overrideOn \? operator : customer, categories\)/.test(box), 'the ONE conditional hint line (misalignedCookingCategory → collectionTimesHint), and no other addition')
  const noComments = strip(box)
  const prose = [...noComments.matchAll(/>([^<>{}]*[a-z]{3}[^<>{}]*)</g)].map(m => m[1].trim()).filter(Boolean)
  const stray = prose.filter(t => !ALLOWED.some(a => a.trim() === t || t === a))
  check(stray.length === 0, `no extra text in the box${stray.length ? ' — found: ' + JSON.stringify(stray) : ''}`)
}

console.log('\n── V4 BEHAVIOUR ────────────────────────────────────────────────────────────────────────')
check(/const overrideOn = van\.operator_collection_interval_mins != null/.test(box), '🔴 the tickbox is DERIVED from the override being non-null — no second stored flag')
check(!/use_different|override_enabled|separate_flag/i.test(managePage), '…and no such flag exists anywhere on the page')
check(/checked=\{overrideOn\}/.test(box), 'the checkbox renders that derived value')
check(/onChange=\{e => updateVanSetting\(van\.id, 'operator_collection_interval_mins', e\.target\.checked \? customer : null\)\}/.test(box), '🔴 TICKING saves the current customer value; UNTICKING saves null')
check(/\{overrideOn && \(/.test(box), 'the second select renders ONLY when ticked')
check(/const operator = overrideOn \? normaliseInterval\(van\.operator_collection_interval_mins\) : customer/.test(box), 'the second select is pre-set to the override, which on ticking is the customer value')
check(/setVans\(prev => prev\.map\(v => v\.id === vanId \? \{ \.\.\.v, \[field\]: value \} : v\)\)/.test(managePage), 'updateVanSetting is optimistic (the existing van-settings shape)')

console.log('\n── THE EXAMPLE LINES COME FROM THE SHARED GENERATOR ────────────────────────────────────')
check(/export function intervalExample/.test(src('lib/slot-generation.ts')), 'intervalExample lives in lib/slot-generation.ts, beside generateCollectionTimes')
check(/generateCollectionTimes\('18:00', '23:00', iv, iv, 0\)\.slice\(0, 3\)/.test(src('lib/slot-generation.ts')), '🔴 it CALLS generateCollectionTimes — not a second hard-coded list')
check(intervalExample(15) === '18:00, 18:15, 18:30…', `at 15 it reads "18:00, 18:15, 18:30…" (got "${intervalExample(15)}")`)
check(intervalExample(5) === '18:00, 18:05, 18:10…', `at 5 it reads "18:00, 18:05, 18:10…" (got "${intervalExample(5)}")`)
for (const n of INTERVAL_CHOICES) {
  const ex = intervalExample(n)
  check(ex.startsWith('18:00, ') && ex.endsWith('…') && ex.split(', ').length === 3, `at ${n}: starts 18:00, three times, trailing ellipsis — "${ex}"`)
}
check(!/'18:00, 18:15/.test(managePage) && !/18:05, 18:10/.test(managePage), 'the page hard-codes no example string of its own')

console.log('\n── types ───────────────────────────────────────────────────────────────────────────────')
check(/collection_interval_mins\?: number \| null; operator_collection_interval_mins\?: number \| null \}/.test(managePage), 'the Van interface carries both')
check(!/operator_collection_interval_mins: number/.test(supa), 'lib/supabase Truck no longer declares the dropped column')

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ settings proven at van level'}`)
process.exit(fails ? 1 : 0)
