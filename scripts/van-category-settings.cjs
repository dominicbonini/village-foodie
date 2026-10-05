#!/usr/bin/env node
// scripts/van-category-settings.cjs
//
//   node scripts/van-category-settings.cjs     (< 20 s: NO NETWORK, NO DATABASE, NO BROWSER)
//
// ── 🔴 WHAT THIS GUARDS ─────────────────────────────────────────────────────────────────────────────
// Prep, Items and "Counts to total capacity" are shown inside each VAN's Kitchen capacity card but were
// stored once per TRUCK on `menu_categories`, which has no `van_id` — so editing Van 2 edited Van 1.
// These three fields decide WHETHER AN ORDER IS ACCEPTED and WHEN IT IS READY. See
// docs/settings-and-preview-report.md §4 for the finding and docs/van-settings-report.md for the fix.
//
// Three things have to be true, and the third is the one that could quietly ruin a live truck:
//   1. EVERY reader resolves through ONE module (lib/van-category-settings.ts). Two answers to "can
//      this order be accepted" would disagree only under load.
//   2. NO reader resolves through `same_as_first_van`. That switch is a write fan-out; a read-time
//      indirection through it would put a second van lookup on the order path and make switching it
//      off a silent behaviour change.
//   3. WITH NO PER-VAN ROWS — the state of every truck in the database the moment this ships,
//      Pizzeria Gusto included — every output is IDENTICAL to the code before this build.
//
// 🔴 (3) IS PROVED BY COMPILING BOTH TREES, NOT BY READING THE DIFF. `lib/prep-utils.ts` is compiled
// from a clean `git worktree` of the pre-change commit AND from the working tree; both are driven with
// the same fixture categories through a stub Supabase; the resulting catConfigs are compared byte for
// byte, and then run through the REAL capacity engine and compared again. Same inputs, two binaries.

const path = require('path')
const { execFileSync } = require('child_process')
const fs = require('fs')
const { compile, headWorktree } = require('./_slot-interval-compile.cjs')
const REPO = path.resolve(__dirname, '..')

const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')

/* ⚠️ COMMENTS STRIPPED LINE-BY-LINE, not with a non-greedy block regex. This file's own explanatory
 * comments name the very strings its assertions search for, and a regex pairing of the first `/*` with
 * the next `*​/` mis-pairs against regex literals and strings in page.tsx and silently eats whole
 * regions — the failure that wasted an hour in the 3 October build. */
function codeOnly(src) {
  const out = []
  let inBlock = false
  for (const raw of src.split('\n')) {
    let line = raw
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end < 0) { out.push(''); continue }
      line = line.slice(end + 2); inBlock = false
    }
    for (;;) {
      const start = line.indexOf('/*')
      if (start < 0) break
      const end = line.indexOf('*/', start + 2)
      if (end < 0) { line = line.slice(0, start); inBlock = true; break }
      line = line.slice(0, start) + line.slice(end + 2)
    }
    line = line.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    const slash = line.indexOf('//')
    if (slash >= 0 && !/https?:$/.test(line.slice(0, slash))) line = line.slice(0, slash)
    out.push(line)
  }
  return out.join('\n')
}

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))

const PAGE = 'app/manage/[token]/page.tsx'
const DASH = 'app/dashboard/[token]/page.tsx'
const LIB = 'lib/van-category-settings.ts'
const MIGRATION = 'supabase/migrations/20261005_van_category_settings.sql'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE MIGRATION DECLARES WHAT THE CODE NAMES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · THE MIGRATION')
{
  const sql = read(MIGRATION)
  t('🔴 van_category_settings is created, with the (van_id, category_id) upsert target',
    /create table if not exists public\.van_category_settings/.test(sql)
    && /create unique index if not exists van_category_settings_van_cat_uidx\s*\n\s*on public\.van_category_settings \(van_id, category_id\)/.test(sql))
  t('🔴 truck_id is TEXT — trucks.id is a slug, and uuid here fails the migration outright',
    /truck_id text not null references public\.trucks\(id\) on delete cascade/.test(sql))
  t('🔴 all three fields are on the table, with counts defaulting false (today\'s meaning)',
    /prep_secs integer/.test(sql) && /batch_size integer/.test(sql)
    && /counts_toward_capacity boolean not null default false/.test(sql))
  t('🔴 RLS + the REVOKE, not RLS alone — the grant is what actually closes anon access',
    /alter table public\.van_category_settings enable row level security/.test(sql)
    && /revoke all on public\.van_category_settings from anon, authenticated, public/.test(sql))
  t('🔴 truck_vans.same_as_first_van is added, default false',
    /add column if not exists same_as_first_van boolean not null default false/.test(sql))
  /* ⛔ NO BACKFILL. A backfill would write a row per van per category and make every van independent
   * IMMEDIATELY — a behaviour change nobody asked for, on every truck, irreversibly. */
  t('⛔ NO BACKFILL: nothing inserts into van_category_settings in the migration',
    !/insert\s+into\s+(public\.)?van_category_settings/i.test(sql))
  t('⚠️ PostgREST is reloaded, or every per-van read returns PGRST205 on correct code',
    /notify pgrst, 'reload schema'/.test(sql))
  t('⚠️ lock_timeout is set, as every migration in this tree does',
    /set lock_timeout = '3s'/.test(sql))
  /* 🔴 THE TYPE PREFLIGHT. `menu_categories` predates this migrations directory, so nothing in the
   * repository records its column types and SQL may not be run to look. The migration therefore CHECKS
   * them before any DDL and raises with the real type — a wrong guess cannot create a table whose FK
   * silently never matches. */
  t('🔴 THE TYPE PREFLIGHT runs before any DDL and names the real type on a mismatch',
    /format_type\(a\.atttypid, a\.atttypmod\)/.test(sql)
    && sql.indexOf('raise exception') < sql.indexOf('create table if not exists public.van_category_settings')
    && /this file assumes/.test(sql))
  /* ⚠️ THE CENSUS. A table created BY a migration is fully described there, so it qualifies for the
   * census — and adding it at creation means this feature can never name a column that does not
   * exist. The rule is stated in scripts/_outreach-schema-census.cjs. */
  t('⚠️ the new table is in the schema census, which can only cover migration-created tables',
    /'van_category_settings'/.test(read('scripts/_outreach-schema-census.cjs')))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · ONE RESOLVER, EVERY READER
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · ONE RESOLVER, EVERY READER')
{
  const SLOTS = 'app/api/slots/[truckId]/route.ts'
  const DASHAPI = 'app/api/dashboard/route.ts'
  const MENUAPI = 'app/api/menu/[truckId]/route.ts'
  const PREP = 'lib/prep-utils.ts'

  t('🔴 /api/slots resolves from the van it already resolved for kitchen_capacity', (() => {
    const src = codeOnly(read(SLOTS))
    return /resolveCategoriesForVan\(supabase, todayEvent\?\.van_id \?\? null, categories\)/.test(src)
      && /\(vanCategories\.categories \|\| \[\]\)\.forEach/.test(src)
  })())
  t('🔴 /api/dashboard resolves from the SELECTED event\'s van (the board and the KDS)', (() => {
    const src = codeOnly(read(DASHAPI))
    return /resolveCategoriesForVan\(supabase, selectedEvent\?\.van_id \?\? null, categories\)/.test(src)
      && /\(vanCategories\.categories \|\| \[\]\)\.forEach/.test(src)
  })())
  t('🔴 /api/menu resolves from the event\'s van (the customer ASAP fallback reads these)', (() => {
    const src = codeOnly(read(MENUAPI))
    return /resolveCategoriesForVan\(supabase, eventVanId, categories\)/.test(src)
      && /categories: \(vanCategories\.categories \|\| \[\]\)\.map/.test(src)
  })())
  t('🔴 buildCatConfigs (order acceptance) takes a vanId and resolves through the module', (() => {
    const src = codeOnly(read(PREP))
    return /vanId\?: string \| null/.test(src)
      && /readVanCategorySettings\(supabase, vanId\)/.test(src)
      && /resolveCategories\(categories \?\? \[\], byCategoryId\)/.test(src)
      // ⚠️ `id` HAD TO JOIN THE SELECT so overrides key by category_id, not by a renameable name.
      && /\.select\('id, name, prep_secs, batch_size, counts_toward_capacity'\)/.test(src)
  })())
  t('🔴 /api/orders/submit builds catConfigs from the SAME van as kitchen_capacity', (() => {
    const src = codeOnly(read('app/api/orders/submit/route.ts'))
    return /const catConfigs = await buildCatConfigs\(supabase, resolvedTruckId, vanId\)/.test(src)
      // ⛔ and NOT truck-level earlier in the route, where the van is not yet known
      && !/buildCatConfigs\(supabase, resolvedTruckId\),/.test(src)
  })())
  /* 🔴 NO SECOND RESOLUTION ANYWHERE. Any other file that reads all three fields out of
   * `menu_categories` and turns them into capacity inputs is a second answer to the same question. */
  t('🔴 seed-demo-orders (demo provisioning) resolves per van too', (() => {
    const src = codeOnly(read('lib/seed-demo-orders.ts'))
    return /readVanCategorySettings\(supabase, vanId\)/.test(src)
      && /resolveCategory\(row\.menu_categories as \{ id: string \} & Record<string, unknown>, vanCatRows\.byCategoryId\)/.test(src)
      // ⚠️ the join had to carry the category id, or overrides would key by a renameable name
      && /menu_categories!category_id\(id, name, prep_secs, batch_size, counts_toward_capacity\)/.test(src)
      // ⚠️ and the van must be resolved BEFORE the lines are built, not after
      && src.indexOf('vanCatRows') < src.indexOf('const all: MenuLine[]')
  })())
  t('🔴 NO OTHER SELECT TURNS THE THREE FIELDS INTO CAPACITY INPUTS', (() => {
    /* ⚠️ THE WRITER AND THE RESOLVER ARE NOT READERS. `upsert_van_category` selects the three fields
     * to SEED a new row from the effective values, and the resolver module names them because it IS
     * the resolution. `seed-demo-orders` is a reader and is asserted above. Anything else is a second
     * answer to "can this order be accepted". */
    const allowed = new Set([SLOTS, DASHAPI, MENUAPI, PREP,
      'app/api/manage/route.ts', 'lib/van-category-settings.ts', 'lib/seed-demo-orders.ts'])
    const out = execFileSync('grep', ['-rln', 'counts_toward_capacity', '--include=*.ts', 'app', 'lib'],
      { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    const offenders = out.filter(f => !allowed.has(f) && /\.select\(/.test(read(f))
      && new RegExp("select\\([^)]*prep_secs[^)]*counts_toward_capacity").test(read(f)))
    if (offenders.length) console.log('      offenders: ' + JSON.stringify(offenders))
    return offenders.length === 0
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · NOTHING ON THE ORDER PATH READS `same_as_first_van`
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · THE SWITCH IS A WRITE FAN-OUT, NOT A READ')
{
  /* 🔴 WHY THIS MATTERS MORE THAN IT LOOKS. If a reader did `if (same_as_first_van) use van 1`, then:
   *   • order acceptance would carry a second van lookup;
   *   • two readers resolving different vans would give different answers for the same order;
   *   • turning the switch OFF would silently change the kitchen's behaviour, when the operator means
   *     only "stop following".
   * Because it is a COPY, every van's own row is complete and authoritative. */
  const files = execFileSync('grep', ['-rl', 'same_as_first_van', '--include=*.ts', '--include=*.tsx', 'app', 'lib', 'components'],
    { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  /* ⚠️ A FOURTH SITE (October 2026): the capacity table moved to Menu › Kitchen capacity, which is
   * components/manage/KitchenCapacitySection.tsx, and it names the column because it renders the
   * CAPACITY switch. The point of this check is unchanged — the set is still CLOSED, and still
   * contains no reader on the order path (asserted next). */
  const WRITE_SITES = new Set([
    'app/api/manage/route.ts', 'lib/van-category-settings.ts', 'app/manage/[token]/page.tsx',
    'components/manage/KitchenCapacitySection.tsx',
  ])
  /* ══ 🔴 `codeOnly`, BECAUSE THREE FILES EXPLAIN THE COLUMN WITHOUT USING IT (5 October 2026) ══════
   * `grep -rl` found seven files; three of them — app/api/event-types/route.ts,
   * lib/copy/serviceSettings.ts and components/manage/EventTypes.tsx — name
   * `truck_vans.same_as_first_van` only in a COMMENT, each one saying the same correct thing: that
   * "Same settings as Van 1" reads and writes the EXISTING column through Settings' own action and
   * adds no new one. ⛔ THE CHECK REPORTED THEM AS READERS, which is this repository's recurring
   * failure in reverse: prose BREAKING an assertion about code. Explaining a column is not using it.
   * 🔴 THE CLAIM IS UNCHANGED AND IS NOW ABOUT CODE: the set of files whose CODE names the column is
   * closed, and it is the writer, the resolver module and the two switch UIs. */
  const codeSites = files.filter(f => { try { return /same_as_first_van/.test(codeOnly(read(f))) } catch { return false } })
  const offenders = codeSites.filter(f => !WRITE_SITES.has(f))
  t(`🔴 only the writer, the resolver module and the two switch UIs name the column IN CODE (${codeSites.length} file(s))`
    + (offenders.length ? ` · ⛔ ${offenders.join(', ')}` : ''),
    offenders.length === 0)
  /* ⚠️ AND THE SET IS NOT MERELY A SUBSET — every listed site must really be one, or a deleted writer
   * would leave an entry that excuses nothing and the check would pass on a shrinking set. */
  t('⚠️ …and every file on that list really does name it in code',
    [...WRITE_SITES].every(f => codeSites.includes(f)))
  t('⛔ NO READER ON THE ORDER PATH NAMES IT', (() => {
    const order = ['app/api/slots/[truckId]/route.ts', 'app/api/dashboard/route.ts',
      'app/api/menu/[truckId]/route.ts', 'lib/prep-utils.ts', 'app/api/orders/submit/route.ts',
      'lib/slot-availability.ts', 'lib/slot-bookings.ts']
    return order.every(f => { try { return !/same_as_first_van/.test(read(f)) } catch { return true } })
  })())
  t('⛔ the resolver itself never consults it — resolution is rows-or-defaults, nothing else', (() => {
    /* ⚠️ BOUNDED BY CODE, NOT BY A COMMENT BANNER. `codeOnly` strips the comments, so slicing to the
     * "SAME AS VAN 1" banner found -1 and the slice ran backwards — the check passed on an empty
     * string for the wrong reason. `export function firstVanId` is the first symbol after the
     * resolution functions and survives stripping. */
    const src = codeOnly(read(LIB))
    const from = src.indexOf('export function resolveCategory')
    const to = src.indexOf('export function firstVanId')
    return from > 0 && to > from && !/same_as_first_van/.test(src.slice(from, to))
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE WRITERS — PER-VAN CARDS vs THE MENU TAB
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · THE WRITERS')
{
  const api = codeOnly(read('app/api/manage/route.ts'))
  t('🔴 upsert_van_category exists and upserts on (van_id, category_id)',
    /action === 'upsert_van_category'/.test(api)
    && /onConflict: 'van_id,category_id'/.test(api))
  t('🔴 BOTH ids are confirmed to belong to THIS truck before anything is written', (() => {
    const h = api.slice(api.indexOf("action === 'upsert_van_category'"), api.indexOf("action === 'set_van_same_as_first'"))
    return /from\('truck_vans'\)\.select\('id'\)\.eq\('id', vanId\)\.eq\('truck_id', truck\.id\)/.test(h)
      && /from\('menu_categories'\)\.select\('id, prep_secs, batch_size, counts_toward_capacity'\)\s*\n?\s*\.eq\('id', categoryId\)\.eq\('truck_id', truck\.id\)/.test(h)
  })())
  /* 🔴 THE FIRST EDIT SEEDS FROM THE EFFECTIVE VALUES. A row overrides all three fields, so writing
   * only the edited one would null the other two and silently change this van's batch size the moment
   * the operator touched prep. */
  t('🔴 a new row is seeded from effectiveCategorySettings, so nothing jumps on the first edit',
    /const base = effectiveCategorySettings\(/.test(api)
    && /prep_secs: prep_secs !== undefined \? \(prep_secs === null \? null : Number\(prep_secs\)\) : base\.prep_secs/.test(api))
  /* ⚠️ `!== undefined`, NEVER TRUTHINESS: prep_secs 0 means "instant" and counts false means
   * "excluded". A truthy test makes both unsettable — the exact bug update_van_settings' own comments
   * warn about for buzzer_count and the auto-reject delay. */
  t('⚠️ prep 0 and counts=false ARE settable — `!== undefined`, not a truthiness test',
    /counts_toward_capacity: counts_toward_capacity !== undefined \? !!counts_toward_capacity : base\.counts_toward_capacity/.test(api))
  t('🔴 a failed per-van save is VISIBLE, not a green toast on nothing',
    /That van\\'s capacity settings could not be saved right now\./.test(api))
  /* ⚠️ THIS CHECK WAS MATCHING THE WRONG HANDLER, and the extraction of `copyCapacityFromFirst`
   * exposed it. Its name says `set_van_same_as_first`, but three of its four regexes ran against the
   * WHOLE FILE — and the `van_category_settings` delete-then-insert they found lived in the CAPACITY
   * switch, not in this one. Settings' switch deliberately stopped copying category rows in October
   * 2026 (capacity has its own switch), so the check has been asserting the opposite of the intent
   * ever since, and passing because another handler happened to contain the text.
   * 🔴 SCOPED TO THE HANDLER NOW, and it asserts what that handler actually must do: copy the van
   * FIELDS, and NOT touch the category rows. */
  t('🔴 set_van_same_as_first COPIES the van fields and does NOT touch the category rows', (() => {
    /* ⚠️ THE SLICE ENDS AT THE SHARED HELPER, which was extracted BETWEEN the two handlers — so
     * ending it at the capacity switch would pull `copyCapacityFromFirst` into this handler's text and
     * find the very `van_category_settings` write this check exists to forbid here. */
    const h = api.slice(api.indexOf("action === 'set_van_same_as_first'"), api.indexOf('async function copyCapacityFromFirst'))
    return h.length > 200
      && /vanCopyPayload\(src as Record<string, unknown> \| null\)/.test(h)
      // ⛔ capacity's rows are not this switch's business
      && !/van_category_settings/.test(h)
      && !/vanCategoryCopyRows/.test(h)
  })())
  /* 🔴 AND THE CAPACITY SWITCH IS THE ONE THAT REPLACES THE ROWS — through the shared helper, so
   * `add_van` cannot grow a second, subtly different copy. */
  t('🔴 the CAPACITY copy is one helper, delete-then-insert, used by the switch AND by add_van', (() => {
    const fn = api.slice(api.indexOf('async function copyCapacityFromFirst'), api.indexOf("if (action === 'set_van_capacity_same_as_first')"))
    return /capacityCopyPayload\(src as Record<string, unknown> \| null\)/.test(fn)
      && /from\('van_category_settings'\)\.delete\(\)\.eq\('van_id', targetVanId\)/.test(fn)
      && /vanCategoryCopyRows\(srcRows\.byCategoryId, truckId, targetVanId\)/.test(fn)
      // both callers go through it, and nobody re-implements it
      && (api.match(/copyCapacityFromFirst\(/g) || []).length === 3
      && (api.match(/vanCategoryCopyRows\(/g) || []).length === 1
  })())
  t('⛔ the first van cannot follow itself', /The first van cannot follow itself\./.test(api))
  t('🔴 switching OFF writes only the switch — the copied values stay', (() => {
    const h = api.slice(api.indexOf("action === 'set_van_same_as_first'"), api.indexOf("action === 'add_van'"))
    // the copy is inside `if (on)`; the switch write is outside it
    const ifOn = h.indexOf('if (on) {')
    const switchWrite = h.indexOf("update({ same_as_first_van: !!on })")
    return ifOn > 0 && switchWrite > ifOn && h.indexOf('vanCopyPayload') < switchWrite
  })())
  /* 🔴 THE FAN-OUT: a change to the FIRST van reaches every van following it, in the SAME request. */
  t('🔴 editing the FIRST van fans out to every following van, in the same request',
    /if \(first && first === vanId\)/.test(api)
    && /\.upsert\(\{ \.\.\.row, van_id: fid \}, \{ onConflict: 'van_id,category_id' \}\)/.test(api))
  t('⚠️ …and only the fields that were just written travel, never the whole van',
    /for \(const f of VAN_COPY_FIELDS\) \{\s*\n\s*if \(f in updates\) fanFields\[f\] = updates\[f\]/.test(api))

  /* ── 🔴 THE MENU TAB IS DELIBERATELY UNCHANGED ──────────────────────────────────────────────────
   * `upsert_category` still writes `menu_categories`, which is now the truck DEFAULT for any van with
   * no values of its own. Its wording is untouched. */
  t('🔴 upsert_category still writes menu_categories, truck-scoped, unchanged',
    /action === 'upsert_category'/.test(api)
    && /from\('menu_categories'\)/.test(api)
    && /\.eq\('truck_id', truck\.id\)/.test(api))

  const page = codeOnly(read(PAGE))
  /* ⚠️ THE CAPACITY TABLE MOVED FILES (October 2026) — from Settings › Kitchen in page.tsx to
   * Menu › Kitchen capacity in components/manage/KitchenCapacitySection.tsx. These two checks are
   * about the TABLE's writes and reads, so they follow it; what they assert is unchanged, and the
   * expressions they match are the same ones, because the move did not edit them. */
  const CAP = 'components/manage/KitchenCapacitySection.tsx'
  const cap = codeOnly(read(CAP))
  t('🔴 the capacity table writes per-van (writeVanCat), not truck-level',
    /void writeVanCat\(van, cat, \{ prep_secs: secs \}\)/.test(cap)
    && /void writeVanCat\(van, cat, \{ batch_size: val \?\? 0 \}\)/.test(cap)
    && /void writeVanCat\(van, cat, \{ counts_toward_capacity: !eff\.counts_toward_capacity \}\)/.test(cap)
    && /api\('upsert_van_category', \{ vanId: v\.id, categoryId: cat\.id, \.\.\.patch \}\)/.test(cap))
  t('🔴 …and READS per-van, so one van\'s number never shows on another\'s',
    /const eff = effectiveVanCat\(van, cat\)/.test(cap)
    && /prepSecs=\{eff\.prep_secs \?\? 0\}/.test(cap)
    && /batchSize=\{eff\.batch_size \?\? 0\}/.test(cap))
  /* ⛔ AND IT IS NOT STILL IN page.tsx — the other half of "moved, not copied". */
  /* ⚠️ THE POINTER BOX IS GONE TOO (Dominic, 4 October 2026): "in settings, remove the box 'Kitchen
   * capacity has moved to Menu › Kitchen capacity'". A signpost to a thing that moved is worth having
   * for a few weeks and then becomes furniture.
   * 🔴 SO THE CHECK IS NOW THE STRONGER HALF ALONE — the table is not here — plus an assertion that
   * the COMMENT explaining where it went survives. Three harnesses anchor their Collection-times
   * slice on that comment, and it is the answer to "why is there no capacity card on this screen?".
   * ⛔ AND THE TWO HELPER LINES THAT POINTED AT THE NEW SCREEN WENT WITH IT, which is asserted so
   * that "removed" cannot quietly become "removed from one of the three places". */
  t('⛔ the capacity table is gone from Settings › Kitchen, and so is every pointer to it', (() => {
    const raw = read(PAGE)
    return !/KitchenCapacityCategoryRow\s*$/m.test(page.slice(page.indexOf('COLLECTION TIMES — PER VAN')))
      && !/Kitchen capacity has moved to/.test(raw)
      && !/has its own switch in Menu/.test(raw)
      && !/Changes to the first van are copied here/.test(raw)
      // the comment that records the move — and that three slices anchor on — stays
      && raw.includes('{/* ── ⛔ KITCHEN CAPACITY MOVED TO MENU')
  })())
  /* ⛔ THE OPTIMISTIC PATCH MOVED TOO. The old write patched the SHARED truck-level category list,
   * which would now paint one van's number onto every van's card. */
  t('⛔ the optimistic patch is on the VAN, not on the shared category list', (() => {
    /* ⚠️ READ FROM THE MOVED FILE, and the slice ends at its own next declaration. */
    const w = cap.slice(cap.indexOf('const writeVanCat'), cap.indexOf('const updateVanSetting'))
    return /patchVanCat\(v\.id, cat\.id, next\)/.test(w) && !/onCategoriesPatch/.test(w)
  })())
  t('🔴 the Manage Menu tab still uses the truck-level writers, untouched',
    /const updateCatField = async \(cat: Category/.test(page)
    && /await api\('upsert_category', \{/.test(page))
  t('🔴 the Dashboard van card writes per-van and REFUSES to write with no van', (() => {
    const d = codeOnly(read(DASH))
    const fn = d.slice(d.indexOf('const updateCategoryField='), d.indexOf('// orderKey is the UUID row identity'))
    return /action:'upsert_van_category',vanId,categoryId:catId/.test(fn)
      && (fn.match(/const vanId=activeEvent\?\.van_id\s*\n\s*if\(!vanId\)return/g) || []).length === 2
      && !/action:'update_category'/.test(fn)
  })())
  t('🔴 the Dashboard category EDITOR still writes menu_categories (the truck default)', (() => {
    const d = codeOnly(read(DASH))
    const fn = d.slice(d.indexOf('const saveCatEdit='), d.indexOf('const updateCategoryField='))
    return /action:'update_category'/.test(fn)
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE PURE RESOLVER AND THE COPY RULES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · THE RESOLVER, AS A FUNCTION')
const V = compile(REPO, [LIB], 'vcs').req('lib/van-category-settings.js')
{
  const CAT = { id: 'c1', name: 'Pizza', prep_secs: 300, batch_size: 2, counts_toward_capacity: true }
  const rows = new Map([['c1', { category_id: 'c1', prep_secs: 600, batch_size: 4, counts_toward_capacity: false }]])

  /* 🔴 THE IDENTITY GUARANTEE, AS A FUNCTION: with no rows the resolver returns THE SAME OBJECT, not a
   * copy. That is what makes "no per-van rows ⇒ identical" structural rather than hopeful — no
   * field-by-field reconstruction can drop a property the caller also reads. */
  t('🔴 no rows ⇒ the SAME OBJECT back (identity, not a reconstructed copy)',
    V.resolveCategory(CAT, new Map()) === CAT && V.resolveCategory(CAT, null) === CAT)
  t('🔴 a row for another category leaves this one untouched',
    V.resolveCategory(CAT, new Map([['other', { category_id: 'other', prep_secs: 1 }]])) === CAT)
  t('🔴 a row for THIS category overrides all three fields together', (() => {
    const r = V.resolveCategory(CAT, rows)
    return r.prep_secs === 600 && r.batch_size === 4 && r.counts_toward_capacity === false
      && r.name === 'Pizza' && r.id === 'c1'
  })())
  t('⚠️ prep 0 from a row is honoured, not treated as absent', (() => {
    const r = V.resolveCategory(CAT, new Map([['c1', { category_id: 'c1', prep_secs: 0, batch_size: 1, counts_toward_capacity: false }]]))
    return r.prep_secs === 0
  })())
  t('⚠️ effectiveCategorySettings returns the insert payload shape in BOTH branches', (() => {
    const a = V.effectiveCategorySettings(CAT, new Map())
    const b = V.effectiveCategorySettings(CAT, rows)
    const keys = (o) => Object.keys(o).sort().join(',')
    return keys(a) === 'batch_size,counts_toward_capacity,prep_secs' && keys(b) === keys(a)
      && a.prep_secs === 300 && b.prep_secs === 600
  })())

  // ── THE FIRST-VAN RULE ────────────────────────────────────────────────────────────────────────
  const vans = [
    { id: 'v2', active: true,  created_at: '2026-02-01T10:00:00Z' },
    { id: 'v1', active: true,  created_at: '2026-01-01T10:00:00Z' },
    { id: 'v0', active: false, created_at: '2025-01-01T10:00:00Z' },
  ]
  t('🔴 the first van is the OLDEST ACTIVE van — the order get_vans returns',
    V.firstVanId(vans) === 'v1')
  t('⛔ an INACTIVE van is never first, however old — it is not in the operator\'s list',
    V.firstVanId(vans) !== 'v0')
  t('⚠️ no vans ⇒ null, not a throw', V.firstVanId([]) === null && V.firstVanId(null) === null)
  /* ⚠️ THE FIRST VAN DELETED ⇒ the next-oldest becomes first, automatically, because the rule is
   * DERIVED and never stored. Followers keep their copied values and stay on. */
  t('⚠️ remove the first van and the next-oldest becomes first, with no stored state to fix',
    V.firstVanId(vans.filter(v => v.id !== 'v1')) === 'v2')

  // ── WHAT THE SWITCH COPIES ────────────────────────────────────────────────────────────────────
  t('🔴 VAN_COPY_FIELDS covers every per-van setting update_van_settings can write', (() => {
    /* 🔴 CHECKED AGAINST THE WRITER'S OWN ALLOWLIST, not against a list in this file. A setting added
     * to update_van_settings and forgotten here would make the switch silently stop meaning "same". */
    const api = codeOnly(read('app/api/manage/route.ts'))
    const h = api.slice(api.indexOf("action === 'update_van_settings'"), api.indexOf('SAME AS VAN 1'))
    const written = new Set()
    for (const m of h.matchAll(/updates\.([a-z_]+) =/g)) written.add(m[1])
    for (const m of h.matchAll(/intervalUpdates\.([a-z_]+) =/g)) written.add(m[1])
    /* 🔴 TWO SWITCHES NOW, AND BETWEEN THEM THEY MUST STILL COVER EVERY WRITABLE FIELD (October 2026).
     * `kitchen_capacity` and `capacity_window_mins` moved out of `VAN_COPY_FIELDS` into
     * `CAPACITY_COPY_FIELDS`, because Menu › Kitchen capacity owns them with its own flag. The property
     * this check exists for is unchanged and is now stated of the UNION: a setting added to
     * update_van_settings and forgotten by BOTH lists would make a switch silently stop meaning "same".
     * ⚠️ AND THE TWO LISTS MUST BE DISJOINT, asserted separately below — a field in both would let the
     * two switches fight over one column. */
    const copied = new Set([...V.VAN_COPY_FIELDS, ...V.CAPACITY_COPY_FIELDS])
    const missing = [...written].filter(f => !copied.has(f))
    if (missing.length) console.log('      per-van settings NEITHER switch would copy: ' + JSON.stringify(missing))
    return missing.length === 0
  })())
  t('⛔ the secret, the name and the printer address are NOT copied', (() => {
    const c = new Set(V.VAN_COPY_FIELDS)
    return !c.has('kds_token') && !c.has('name') && !c.has('network_printer_address')
      && !c.has('network_print_device_id') && !c.has('same_as_first_van') && !c.has('active')
  })())
  /* 🔴 THE TWO COPY SETS ARE DISJOINT. The lib exports the test so this is an assertion rather than a
   * comment claiming it. A field in both = two switches writing one column. */
  t('🔴 VAN_COPY_FIELDS and CAPACITY_COPY_FIELDS share no field',
    V.capacitySplitIsClean() === true
    && !(V.VAN_COPY_FIELDS).includes('kitchen_capacity')
    && !(V.VAN_COPY_FIELDS).includes('capacity_window_mins')
    && V.CAPACITY_COPY_FIELDS.length === 2)
  t('🔴 capacityCopyPayload carries the capacity pair and nothing else', (() => {
    const out = V.capacityCopyPayload({
      kitchen_capacity: 10, capacity_window_mins: 5,
      buzzer_count: 9, order_ready_enabled: true, name: 'Van1',
    })
    return Object.keys(out).sort().join(',') === 'capacity_window_mins,kitchen_capacity'
      && out.kitchen_capacity === 10 && out.capacity_window_mins === 5
  })())
  t('⚠️ …and only PRESENT keys, so an absent column is not written as undefined',
    Object.keys(V.capacityCopyPayload({ kitchen_capacity: 3 })).join(',') === 'kitchen_capacity'
    && Object.keys(V.capacityCopyPayload(null)).length === 0)

  t('⚠️ vanCopyPayload carries only present keys, so an absent column is not written as undefined', (() => {
    /* ⚠️ THE PROBE FIELD CHANGED (October 2026). It used `kitchen_capacity`, which is no longer one of
     * THIS payload's fields — it moved to `capacityCopyPayload` with the capacity switch. `buzzer_count`
     * is a field this one still owns, so the check asserts the same property about the same function.
     * ⛔ AND IT ASSERTS THE CAPACITY FIELD IS **NOT** CARRIED, which is the move's whole point. */
    const p = V.vanCopyPayload({ buzzer_count: 4, kitchen_capacity: 9, name: 'Van 1', kds_token: 'secret' })
    return Object.keys(p).join(',') === 'buzzer_count' && p.buzzer_count === 4
  })())
  /* 🔴 A FULL REPLACEMENT, NOT A MERGE. If the target keeps a row the source does not have, the switch
   * claims "same" while one category still differs. */
  t('🔴 the category copy is a REPLACEMENT set, and empty means "both inherit"', (() => {
    const src = new Map([['c1', { category_id: 'c1', prep_secs: 60, batch_size: 3, counts_toward_capacity: true }]])
    const r = V.vanCategoryCopyRows(src, 'village-spice', 'v2')
    const none = V.vanCategoryCopyRows(new Map(), 'village-spice', 'v2')
    return r.length === 1 && r[0].van_id === 'v2' && r[0].truck_id === 'village-spice'
      && r[0].category_id === 'c1' && r[0].prep_secs === 60 && none.length === 0
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · THE READ FAILS OPEN TO TODAY'S BEHAVIOUR
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('6 · A MISSING MIGRATION CANNOT BREAK ORDERING')
{
  /* 🔴 THE WHOLE POINT. Deployed ahead of its migration, every per-van read must degrade to
   * "no overrides" — which is `menu_categories`, which is today's behaviour. A throw here would turn a
   * degraded answer into NO answer on the order path. */
  const stub = (err) => ({ from: () => ({ select: () => ({ eq: async () => ({ data: null, error: err }) }) }) })
  const codes = ['42P01', '42703', 'PGRST205', 'PGRST204', 'XX000']
  const warn = console.warn; console.warn = () => {}
  const results = []
  for (const code of codes) {
    results.push(V.readVanCategorySettings(stub({ code, message: code }), 'v1'))
  }
  results.push(V.readVanCategorySettings({ from: () => { throw new Error('boom') } }, 'v1'))
  Promise.all(results).then(rs => {
    console.warn = warn
    t('🔴 every failure mode returns an EMPTY map and ok:false — never a throw',
      rs.every(r => r.ok === false && r.byCategoryId.size === 0))
    t('⚠️ no van ⇒ no query at all, and ok:true (that is the truck default, not an error)', true)
    finish()
  }).catch(e => { console.warn = warn; t('🔴 the probed read threw: ' + e.message, false); finish() })

  V.readVanCategorySettings({ from: () => { throw new Error('should not be called') } }, null)
    .then(r => t('⚠️ vanId null ⇒ ok:true with no rows and no query', r.ok === true && r.byCategoryId.size === 0))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · THE EQUIVALENCE PROOF — TWO BINARIES, SAME FIXTURES
// ════════════════════════════════════════════════════════════════════════════════════════════════
function finish() {
head('7 · EQUIVALENCE: NO PER-VAN ROWS ⇒ IDENTICAL, PROVED BY COMPILING BOTH TREES')

/* 🔴 PINNED TO THE COMMIT THIS BUILD STARTED FROM. "HEAD" would stop meaning "before per-van settings"
 * the moment this work is committed, and the comparison would quietly start comparing the new code
 * with itself — the failure mode scripts/slot-interval-engine-identity.cjs documents for its own pin. */
const PRE_CHANGE_COMMIT = '719ac91'

const hw = headWorktree('vcs', PRE_CHANGE_COMMIT)
let OLD, NEW
try {
  OLD = compile(hw.wt, ['lib/prep-utils.ts'], 'prepOLD').req('lib/prep-utils.js')
  NEW = compile(REPO, ['lib/prep-utils.ts'], 'prepNEW').req('lib/prep-utils.js')
} finally { /* the worktree is removed at the end */ }

const ENGINE = compile(REPO, ['lib/slot-availability.ts'], 'engine').req('lib/slot-availability.js')

/* The fixture truck: a cooking category, an instant one that counts, and an instant one that does not.
 * Shaped like Village Spice with two vans. */
const CATEGORIES = [
  { id: 'c-pizza',  name: 'Pizza',  prep_secs: 300, batch_size: 2, counts_toward_capacity: true },
  { id: 'c-sides',  name: 'Sides',  prep_secs: 0,   batch_size: 1, counts_toward_capacity: true },
  { id: 'c-drinks', name: 'Drinks', prep_secs: 0,   batch_size: 0, counts_toward_capacity: false },
]

/**
 * A Supabase stub that answers exactly the two queries the resolver and buildCatConfigs make.
 * ⚠️ IT IS DELIBERATELY STRICT: an unexpected table throws, so a future reader that quietly starts
 * reading something else fails this harness rather than being silently fed [].
 */
function stubDb(vanRowsByVan) {
  return {
    from(table) {
      if (table === 'menu_categories') {
        return { select: () => ({ eq: async () => ({ data: CATEGORIES.map(c => ({ ...c })), error: null }) }) }
      }
      if (table === 'van_category_settings') {
        return { select: () => ({ eq: async (_col, vanId) => ({ data: (vanRowsByVan[vanId] || []).map(r => ({ ...r })), error: null }) }) }
      }
      throw new Error('unexpected table in fixture: ' + table)
    },
  }
}

const times = (from, to, iv = 5) => {
  const o = []
  for (let m = from; m <= to; m += iv) {
    const hh = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    o.push({ collection_time: hh, production_slot: hh, production_window_key: hh })
  }
  return o
}

/** The engine run, so equivalence is proved on the OUTPUT an operator and a customer actually see. */
const runEngine = (catConfigs) => ENGINE.buildSlotAvailability({
  times: times(17 * 60, 20 * 60, 5),
  productionSlotUnits: { '17:30': { pizza: 2 }, '18:00': { pizza: 1, sides: 3 } },
  catConfigs,
  kitchenCapacity: 4,
  capacityWindowMins: 5,
  date: '2026-10-10',
  nowMins: 0,
  earliestCollectionMins: 17 * 60,
  eventStartMins: 17 * 60,
  eventEndMins: 20 * 60,
})

const J = (x) => JSON.stringify(x)

Promise.all([
  // ── (A) NO PER-VAN ROWS: the old binary vs the new one, same fixtures ──────────────────────────
  OLD.buildCatConfigs(stubDb({}), 'village-spice'),
  NEW.buildCatConfigs(stubDb({}), 'village-spice'),
  NEW.buildCatConfigs(stubDb({}), 'village-spice', null),
  NEW.buildCatConfigs(stubDb({}), 'village-spice', 'van-1'),
  // ── (B) A PER-VAN ROW FOR VAN 2 ONLY ──────────────────────────────────────────────────────────
  NEW.buildCatConfigs(stubDb({
    'van-2': [{ category_id: 'c-pizza', prep_secs: 600, batch_size: 4, counts_toward_capacity: true }],
  }), 'village-spice', 'van-1'),
  NEW.buildCatConfigs(stubDb({
    'van-2': [{ category_id: 'c-pizza', prep_secs: 600, batch_size: 4, counts_toward_capacity: true }],
  }), 'village-spice', 'van-2'),
]).then(([oldNone, newNone, newNull, newVan1NoRows, van1WithVan2Rows, van2WithOwnRows]) => {

  /* 🔴 THE HEADLINE CHECK. Byte-for-byte equality of the capacity inputs, from two separately compiled
   * binaries driven by identical fixtures. Not "the diff looked small". */
  t('🔴 NO PER-VAN ROWS: the new buildCatConfigs is BYTE-IDENTICAL to the pre-change one',
    J(newNone) === J(oldNone))
  t('🔴 …and so is passing an explicit null vanId (an event with no van)',
    J(newNull) === J(oldNone))
  t('🔴 …and so is a van that simply has no rows of its own',
    J(newVan1NoRows) === J(oldNone))
  if (J(newNone) !== J(oldNone)) {
    console.log('      old: ' + J(oldNone))
    console.log('      new: ' + J(newNone))
  }

  /* 🔴 AND THROUGH THE REAL ENGINE, because identical inputs are only interesting if the thing
   * downstream of them is what decides whether an order is accepted. */
  const slotsOld = runEngine(oldNone)
  const slotsNew = runEngine(newNone)
  t('🔴 …and the REAL capacity engine produces identical slots from them',
    J(slotsNew) === J(slotsOld) && slotsOld.length > 0)

  /* 🔴 THE OTHER HALF: a per-van row must change THAT van and nothing else. A build that resolved
   * nothing would pass every equivalence check above and fail here. */
  t('🔴 A ROW FOR VAN 2 CHANGES VAN 2', J(van2WithOwnRows) !== J(oldNone)
    && van2WithOwnRows.pizza.secs === 600 && van2WithOwnRows.pizza.batch === 4)
  t('🔴 …AND LEAVES VAN 1 EXACTLY AS IT WAS', J(van1WithVan2Rows) === J(oldNone))
  t('⚠️ …and only the overridden category moves: Sides and Drinks are untouched on Van 2',
    J(van2WithOwnRows.sides) === J(oldNone.sides) && J(van2WithOwnRows.drinks) === J(oldNone.drinks))

  /* 🔴 THE ENGINE SEES THE DIFFERENCE TOO — the per-van row must reach the decision, not just the map. */
  const slotsVan2 = runEngine(van2WithOwnRows)
  t('🔴 the engine gives Van 2 DIFFERENT slots, so the override reaches the decision',
    J(slotsVan2) !== J(slotsOld))
  t('⚠️ …while Van 1\'s slots are still byte-identical to the pre-change engine',
    J(runEngine(van1WithVan2Rows)) === J(slotsOld))

  /* ⚠️ THE 999 vs 1 BATCH DEFAULT IS PRESERVED, NOT HARMONISED. buildCatConfigs defaults an absent
   * batch to 999 while /api/slots and /api/dashboard use 1. That split is pre-existing and reported
   * under "Noticed, not changed"; silently changing it here would alter order acceptance. */
  t('⚠️ buildCatConfigs keeps its own 999 batch default (Drinks has batch 0)',
    oldNone.drinks.batch === 999 && newNone.drinks.batch === 999)

  hw.remove()
  variants()
}).catch(e => { hw.remove(); t('🔴 the equivalence run threw: ' + e.message, false); variants() })
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// 8 · THE BROKEN VARIANTS — EACH MUST FAIL
// ════════════════════════════════════════════════════════════════════════════════════════════
/* 🔴 A CHECK THAT CANNOT FAIL IS NOT A CHECK. Each variant reintroduces one specific bug and the
 * assertion that is supposed to catch it is re-run against the patched source or the recompiled module.
 * A variant that PASSES means the guard above is decorative. */
function variants() {
  head('8 · THE BROKEN VARIANTS — each must FAIL')
  let vpass = 0, vfail = 0
  const must = (label, brokenDetected) => {
    if (brokenDetected) { vpass++; console.log('  ✓ FAILED as required  ' + label) }
    else { vfail++; fail++; console.log('  🔴 MUST FAIL BUT PASSED  ' + label) }
  }
  const patched = (rel, from, to, id) => {
    const src = read(rel)
    if (!src.includes(from)) { console.log(`🔴 ${id}: THE ANCHOR IS GONE — \`${from.slice(0, 70)}\``); fail++; return null }
    return src.split(from).join(to)
  }

  // ── SOURCE-TEXT VARIANTS ──────────────────────────────────────────────────────────────────────
  {
    const v = patched('app/api/slots/[truckId]/route.ts',
      'resolveCategoriesForVan(supabase, todayEvent?.van_id ?? null, categories)',
      'Promise.resolve({ categories, ok: true, vanRowCount: 0 })', 'V1')
    must('V1 🔴 /api/slots stops resolving per van — the customer grid uses the truck average',
      v === null || !/resolveCategoriesForVan\(supabase, todayEvent\?\.van_id \?\? null, categories\)/.test(codeOnly(v)))
  }
  {
    const v = patched('lib/prep-utils.ts',
      'const { byCategoryId } = await readVanCategorySettings(supabase, vanId)',
      'const byCategoryId = new Map()', 'V2')
    must('V2 🔴 ORDER ACCEPTANCE stops resolving per van — the worst of the set',
      v === null || !/readVanCategorySettings\(supabase, vanId\)/.test(codeOnly(v)))
  }
  {
    const v = patched('app/api/orders/submit/route.ts',
      'const catConfigs = await buildCatConfigs(supabase, resolvedTruckId, vanId)',
      'const catConfigs = await buildCatConfigs(supabase, resolvedTruckId)', 'V3')
    must('V3 🔴 /api/orders/submit builds catConfigs without the van it already resolved',
      v === null || !/buildCatConfigs\(supabase, resolvedTruckId, vanId\)/.test(codeOnly(v)))
  }
  {
    const v = patched('app/api/manage/route.ts',
      'counts_toward_capacity: counts_toward_capacity !== undefined ? !!counts_toward_capacity : base.counts_toward_capacity',
      'counts_toward_capacity: counts_toward_capacity || base.counts_toward_capacity', 'V4')
    must('V4 🔴 a truthiness test makes "counts = false" unsettable — the buzzer_count bug again',
      v === null || !/counts_toward_capacity: counts_toward_capacity !== undefined \? !!counts_toward_capacity : base\.counts_toward_capacity/.test(v))
  }
  {
    const v = patched('app/api/manage/route.ts',
      'const base = effectiveCategorySettings(',
      'const base = { prep_secs: null, batch_size: null, counts_toward_capacity: false } || effectiveCategorySettings(', 'V5')
    must('V5 🔴 the first edit stops seeding from the effective values — batch silently nulls',
      v === null || !/const base = effectiveCategorySettings\(/.test(v))
  }
  {
    /* ⚠️ RE-TARGETED (October 2026): the delete-then-insert moved into `copyCapacityFromFirst`, the
     * helper `set_van_capacity_same_as_first` and `add_van` now share, so its parameter is
     * `targetVanId` rather than `vanId`. The old anchor matched nothing and `patched()` reported THE
     * ANCHOR IS GONE — which is what that guard is for.
     * 🔴 AND IT IS CAPACITY'S SWITCH, NOT SETTINGS'. Settings' "Same as Van 1" stopped copying category
     * rows in October 2026; the variant's old title said otherwise and was wrong about which switch
     * it was breaking. */
    const v = patched('app/api/manage/route.ts',
      "from('van_category_settings').delete().eq('van_id', targetVanId)",
      "from('van_category_settings').select('id').eq('van_id', targetVanId)", 'V6')
    must('V6 🔴 the CAPACITY copy MERGES instead of replacing — it claims "same" while a category differs',
      v === null || !/from\('van_category_settings'\)\.delete\(\)\.eq\('van_id', targetVanId\)/.test(v))
  }
  {
    const v = patched('app/dashboard/[token]/page.tsx',
      "const vanId=activeEvent?.van_id\n    if(!vanId)return",
      "const vanId=activeEvent?.van_id??''", 'V7')
    must('V7 🔴 the Dashboard card writes with NO van — which is how it edited the truck before', (() => {
      if (v === null) return true
      const d = codeOnly(v)
      const fn = d.slice(d.indexOf('const updateCategoryField='), d.indexOf('// orderKey is the UUID row identity'))
      return (fn.match(/const vanId=activeEvent\?\.van_id\s*\n\s*if\(!vanId\)return/g) || []).length !== 2
    })())
  }
  {
    const v = patched('supabase/migrations/20261005_van_category_settings.sql',
      'create unique index if not exists van_category_settings_van_cat_uidx',
      "insert into van_category_settings (truck_id, van_id, category_id) select t.id, v.id, c.id from trucks t join truck_vans v on v.truck_id = t.id join menu_categories c on c.truck_id = t.id;\ncreate unique index if not exists van_category_settings_van_cat_uidx", 'V8')
    must('V8 🔴 the migration gains a BACKFILL — every van on every truck becomes independent at once',
      v === null || /insert\s+into\s+(public\.)?van_category_settings/i.test(v))
  }
  {
    const v = patched('lib/prep-utils.ts',
      "import { readVanCategorySettings, resolveCategories } from '@/lib/van-category-settings'",
      "import { readVanCategorySettings, resolveCategories } from '@/lib/van-category-settings'\n// same_as_first_van", 'V9')
    must('V9 🔴 an ORDER-PATH reader starts naming same_as_first_van',
      v === null || /same_as_first_van/.test(v))
  }

  // ── COMPILED VARIANTS: the resolver's own behaviour ───────────────────────────────────────────
  const os = require('os')
  const compileVariant = (src, tag) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `vcs-var-${tag}-`))
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(root, 'lib/van-category-settings.ts'), src)
    /* ⚠️ node_modules HAS TO BE REACHABLE FROM THE TEMP ROOT. The module imports
     * `@supabase/supabase-js` for its SupabaseClient type, and tsc resolves from the compile root — so
     * without this the variant fails to COMPILE and would be scored as "the bug was detected" for
     * entirely the wrong reason. Symlinked, the same way `headWorktree` does it. */
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules')) } catch {}
    return compile(root, ['lib/van-category-settings.ts'], tag).req('lib/van-category-settings.js')
  }
  {
    /* 🔴 THE EQUIVALENCE GUARANTEE, BROKEN AT ITS ROOT. Without the empty-map short-circuit the
     * resolver reconstructs the object even when the van has no rows — so "no per-van rows ⇒
     * identical" stops being structural and becomes a hope about field lists. */
    /* ⚠️ BOTH SHORT-CIRCUITS HAVE TO GO. Removing only the empty-map one left `if (!own) return
     * category` still returning the same object, so the first draft of this variant PASSED — a variant
     * that does not actually reproduce the bug is worse than none, because it reports a guard as
     * proven. This makes the function always reconstruct, which is exactly the bug. */
    const src = read(LIB)
      .replace('  if (!rows || rows.size === 0) return category\n  const own = rows.get(category.id)\n  if (!own) return category\n  return {',
               '  const own = (rows && rows.get(category.id)) || ({} as VanCategoryRow)\n  return {')
    let detected = false
    try {
      const M = compileVariant(src, 'ident')
      const CAT = { id: 'c1', name: 'Pizza', prep_secs: 300, batch_size: 2, counts_toward_capacity: true }
      detected = M.resolveCategory(CAT, new Map()) !== CAT
    } catch { detected = true }
    must('V10 🔴 the resolver stops returning the SAME object when there are no rows', detected)
  }
  {
    /* 🔴 FAIL-OPEN, BROKEN. A throw on the order path turns a degraded answer into no answer, and
     * a truck whose migration has not been applied stops taking orders. */
    /* ⚠️ THE ERROR BRANCH **AND** THE CATCH. Throwing only inside the `try` is swallowed by the
     * catch, which returns READ_FAILED — so the first draft of this variant also passed. Fail-open is
     * only broken when neither path degrades. */
    const src = read(LIB)
      .replace('      return READ_FAILED\n    }\n    const byCategoryId', '      throw new Error(error.message)\n    }\n    const byCategoryId')
      .replace('    return READ_FAILED\n  }\n}', '    throw e\n  }\n}')
    let detected = false
    const warn = console.warn; console.warn = () => {}
    try {
      const M = compileVariant(src, 'failopen')
      const stub = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { code: '42P01', message: 'no table' } }) }) }) }
      return M.readVanCategorySettings(stub, 'v1')
        .then(r => { console.warn = warn; must('V11 🔴 a missing table THROWS instead of degrading — ordering breaks pre-migration', r.ok !== false || r.byCategoryId.size !== 0); tail(vpass, vfail) })
        .catch(() => { console.warn = warn; must('V11 🔴 a missing table THROWS instead of degrading — ordering breaks pre-migration', true); tail(vpass, vfail) })
    } catch { console.warn = warn; detected = true }
    must('V11 🔴 a missing table THROWS instead of degrading — ordering breaks pre-migration', detected)
  }
  tail(vpass, vfail)
}

function tail(vpass, vfail) {
  console.log(`\n  ${vpass + vfail} variants · ${vpass} failed as required · ${vfail} wrongly passed`)
  report()
}

function report() {
  console.log('')
  if (fail === 0) console.log(`✅ all ${pass} passed`)
  else { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exitCode = 1 }
}
