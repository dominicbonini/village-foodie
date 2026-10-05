#!/usr/bin/env node
// scripts/places-tab.cjs
//
//   node scripts/places-tab.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO LIVE TRUCK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   1. THE TAB ORDER AND THE OLD LINKS. Four pills in one order, and `?section=weekly` — which is in
//      operators' bookmarks — must still land on the renamed Social posts tab. §1.
//   2. THE PIN. `usual_event_type_id` NULL is "Automatic", which is the EXISTING rule; a pin
//      overrides it and Automatic clears it. A pin that did not override would be a control that
//      silently does nothing. §2.
//   3. ⛔ AN EXTRA PICTURE NEVER REACHES A POST. `place_pictures` is the truck's own reference
//      photos; `truck_places.event_bg_path` is the poster's. If the poster code ever read the first
//      table, a parking map would print behind Friday's dates. §3.
//   4. HIDE AND RESTORE go through the SAME action Tidy up uses — no second implementation. §4.
//   5. THE §7b GUARD still passes: nothing added here upserts onto a partial index. §5.
//
// ⛔ WHAT THIS CANNOT DO: it cannot press a pill or upload a file. Those are the numbered localhost
// list in docs/places-and-grid-report.md, on Pizza Kitchen only.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(REPO, p))
/** 🔴 COMMENTS STRIPPED BEFORE ANY SOURCE-TEXT COUNT — a rule written in prose about a table must
 *  never be mistaken for a read of it, which is how "nothing reads this" claims become false. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every .ts/.tsx under a directory. */
function walk(dir) {
  const out = []
  const go = (d) => {
    let entries
    try { entries = fs.readdirSync(path.join(REPO, d), { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const rel = `${d}/${e.name}`
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') go(rel) }
      else if (/\.tsx?$/.test(e.name)) out.push(rel)
    }
  }
  go(dir)
  return out
}

const MANAGE = read('app/manage/[token]/page.tsx')
const ROUTE = read('app/api/manage/route.ts')
const TAB = read('components/manage/PlacesTab.tsx')
const SHARED = read('components/manage/SchedulePlaces.tsx')
const SQL = read('supabase/migrations/20261015_places_tab.sql')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE TABS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · four pills, in order — and every old ?section= link still works')

{
  /* 🔴 READ OUT OF `SCHEDULE_SECTIONS` ITSELF, in declaration order, because that array IS the bar. */
  const block = MANAGE.slice(
    MANAGE.indexOf('const SCHEDULE_SECTIONS'),
    MANAGE.indexOf('const isScheduleSection'),
  )
  const ids = [...block.matchAll(/\{ id: '([^']+)', label: '([^']+)' \}/g)].map(m => [m[1], m[2]])
  t(`🔴 the pills are Events · Event types · Places · Social posts (${ids.map(i => i[1]).join(' · ')})`,
    JSON.stringify(ids.map(i => i[1])) === JSON.stringify(['Events', 'Event types', 'Places', 'Social posts']))

  /* ══ ⛔ THE ID STAYED `weekly` WHILE THE LABEL BECAME "Social posts" ════════════════════════════
   * The id is what appears in `?section=`, and `?section=weekly` is in operators' bookmarks, in the
   * setup wizard's links and in `onSectionChange('weekly')` calls elsewhere in this file. Renaming it
   * to match the label would have broken every one of them to change a word.
   * 🔴 THIS IS THE ASSERTION THAT WOULD CATCH A LATER "TIDY UP" renaming the id. */
  t('⛔ "Social posts" keeps the id `weekly`, because the id is the URL contract',
    ids.some(([id, label]) => id === 'weekly' && label === 'Social posts'))
  t('🔴 …and `places` is a section again, so an old ?section=places link lands on Places',
    /v === 'places'/.test(MANAGE) && ids.some(([id]) => id === 'places'))
  t('🔴 …and every id the validator accepts is a pill, and every pill is accepted', (() => {
    const accepted = [...MANAGE.slice(
      MANAGE.indexOf('const isScheduleSection'),
      MANAGE.indexOf('const isScheduleSection') + 400,
    ).matchAll(/v === '([^']+)'/g)].map(m => m[1])
    const pillIds = ids.map(i => i[1 - 1])
    return accepted.length === pillIds.length && pillIds.every(id => accepted.includes(id))
  })())
  /* ⛔ AND NOTHING STILL CALLS `onSectionChange` WITH A SECTION THAT NO LONGER EXISTS. */
  t('⛔ every onSectionChange(…) names a real section', (() => {
    const calls = [...MANAGE.matchAll(/onSectionChange\('([^']+)'\)/g)].map(m => m[1])
    const pillIds = ids.map(i => i[0])
    return calls.every(c => pillIds.includes(c))
  })())
  /* 🔴 AND THE TAB IS MOUNTED. A pill whose pane is never rendered is a pill that does nothing. */
  /* ⚠️ `shownSection`, NOT `section` (5 October 2026). Places and Social posts are behind
   * `places_posts_preview`, so the Schedule tab DERIVES which pill is shown and an old
   * `?section=places` bookmark lands on Events. The mount switches on the derived value. */
  t('🔴 the Places pane is mounted, and it is the shared composition',
    /shownSection === 'places' && \(/.test(MANAGE) && /<PlacesTab /.test(MANAGE))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE PIN
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · the pin overrides the automatic rule, and Automatic clears it')

{
  t('🔴 the column is added, nullable, with ON DELETE SET NULL',
    /add column if not exists usual_event_type_id uuid\s*\n\s*references public\.event_types\(id\) on delete set null/.test(SQL))
  /* ⛔ `on delete set null`, NEVER cascade: deleting a TYPE must not delete a PLACE. */
  t('⛔ …and NOT cascade — deleting a type must not delete a place',
    !/usual_event_type_id[\s\S]{0,120}on delete cascade/.test(SQL))

  t('🔴 the route writes it, validated against the token\'s truck',
    /action === 'sg_place_usual_type'/.test(ROUTE)
    && /\.from\('event_types'\)\.select\('id'\)\.eq\('id', wanted\)\.eq\('truck_id', truck\.id\)/.test(codeOf(ROUTE)))
  /* ⛔ A FOREIGN ID BECOMES NULL rather than being written. The database cannot enforce this (a
   * composite FK would need `event_types (id, truck_id)` unique, which it is not), so the route is
   * the only guard and this is the assertion that keeps it. */
  t('⛔ …and an id this truck does not own resolves to NULL, never written',
    /let typeId: string \| null = null/.test(ROUTE)
    && /typeId = \(t as \{ id: string \} \| null\)\?\.id \?\? null/.test(ROUTE))
  t('🔴 …and the write is scoped to this truck',
    /\.from\('truck_places'\)[\s\S]{0,300}\.eq\('id', placeId\)\.eq\('truck_id', truck\.id\)/.test(codeOf(ROUTE)))

  /* ══ 🔴 RE-AIMED: THE LABEL IS NOW THE SERVER'S ANSWER, NOT A LITERAL (5 October 2026) ══════════
   * This asserted `Automatic (${automaticName} — last used here)`, and `automaticName`'s only caller
   * was `const automaticNameFor = () => 'Standard'` — a hardcoded word. The assertion passed while
   * the screen told a wedding venue that Automatic meant Standard. ⛔ SO THE CLAIM IS NOW THE ONE
   * WORTH MAKING: the name comes from the ROW, the route puts it there with the SAME function the
   * pre-selection uses, and a missing name degrades to a label that promises nothing. */
  t('🔴 "Automatic" is the first option and names what the SERVER says it resolves to',
    /const autoName = place\.usual_automatic_type_name/.test(TAB)
    && /Automatic \(\$\{autoName\} — last used here\)/.test(TAB)
    && /'Automatic \(what you used last time\)'/.test(TAB))
  t('🔴 …and `sg_places` resolves that name with the same rule Add event uses',
    /readPlaceTypeHistory\(supabase, truck\.id, placeForEvent\)/.test(codeOf(ROUTE))
    && /usual_automatic_type_name:/.test(codeOf(ROUTE)))
  t('⛔ …and choosing Automatic sends null, which is what clears BOTH columns',
    /onSave\(v === '' \? null : v\)/.test(TAB)
    && /usual_event_type_id: isStd \? null : typeId, usual_type_is_standard: isStd/.test(TAB))

  /* ══ 🔴 "PINNED TO STANDARD" IS A REAL STATE (20261016) ══════════════════════════════════════════
   * ⛔ IT WAS NOT, AND THE OLD COMMENT IN PlacesTab SAID SO OUT LOUD: "Standard is not storable as a
   * pin and is not offered as one… choosing it clears the pin — which is Automatic". The operator
   * picked Standard and the control came back saying Automatic. 20261016 adds the boolean.
   * 🔴 ASSERTED AS THE WHOLE LOOP: the column exists, the write sets BOTH columns in one statement,
   * the resolution order puts the boolean FIRST, and the control shows it back. */
  {
    const SQL16 = read('supabase/migrations/20261016_place_usual_standard.sql')
    t('🔴 20261016 adds `usual_type_is_standard` NOT NULL DEFAULT false',
      /add column if not exists usual_type_is_standard boolean not null default false/.test(SQL16))
    t('⛔ …and it backfills nothing — the default IS the state every place is already in',
      !/\bupdate public\.truck_places\b/.test(SQL16) && !/\binsert into public\.truck_places\b/.test(SQL16))
    t('🔴 the write sets BOTH columns in ONE statement, so (true, <uuid>) cannot be created',
      /usual_event_type_id: typeId,[\s\S]{0,300}usual_type_is_standard: wantStandard && !typeId/.test(codeOf(ROUTE)))
    t("⛔ …and 'standard' is a literal on the wire, never a reserved uuid",
      /const wantStandard = raw === 'standard'/.test(codeOf(ROUTE))
      && !/00000000-0000-0000-0000-000000000000/.test(codeOf(ROUTE)))
    /* 🔴 THE ORDER, ASSERTED AS AN ORDER. `is_standard ? Standard : (id ?? the rule)` — the other way
     * round would make Standard unreachable for any place that also carries an id. */
    const ET2 = read('app/api/event-types/route.ts')
    const fn2 = codeOf(ET2).slice(codeOf(ET2).indexOf("action === 'usual_for_venue'"))
    const stdAt = fn2.indexOf('usual_type_is_standard === true')
    const idAt = fn2.indexOf('row?.usual_event_type_id')
    const ruleAt2 = fn2.indexOf('usualTypeForPlace(')
    t('🔴 `usual_for_venue` reads is_standard, THEN the id, THEN the rule',
      stdAt > 0 && idAt > stdAt && ruleAt2 > idAt)
    t('🔴 …and Standard resolves to typeId null with `by: pin`, so the form shows it as CHOSEN',
      /return NextResponse\.json\(\{ ok: true, typeId: null, by: 'pin' \}\)/.test(fn2))
    t('🔴 the control reads the boolean FIRST, matching the server',
      /place\.usual_type_is_standard === true\s*\n\s*\? 'standard'\s*\n\s*: \(place\.usual_event_type_id \?\? ''\)/.test(TAB))
  }

  /* ══ 🔴 THE PIN OVERRIDES THE AUTOMATIC RULE **SERVER-SIDE** ════════════════════════════════════
   * This is the claim that matters: a pin that the pre-selection ignored would be a control that
   * silently does nothing. `usual_for_venue` is what Add event asks, so the pin has to be read there.
   * ⚠️ ASSERTED AS `pin ?? the existing rule`, IN THAT ORDER — the other order would make the pin
   * unreachable for any place that has ever had an event. */
  /* ══ 🔴 ASSERTED AS AN **ORDER**, NOT AS A PRESENCE ═══════════════════════════════════════════
   * The first version of this check was `/usual_event_type_id/.test(ROUTE)` — the column name appears
   * somewhere — and it FAILED usefully: the column, the migration and the select were all built
   * before this read was wired, so a pin saved and then changed nothing. Presence is not the claim;
   * reading it BEFORE the history rule is. */
  {
    const ET = read('app/api/event-types/route.ts')
    const fn = codeOf(ET).slice(codeOf(ET).indexOf("action === 'usual_for_venue'"))
    const pinAt = fn.indexOf('usual_event_type_id')
    const ruleAt = fn.indexOf('usualTypeForPlace(')
    t('🔴 `usual_for_venue` reads the PIN **before** the history rule',
      pinAt > 0 && ruleAt > 0 && pinAt < ruleAt)
    t('⛔ …and a pin returns immediately, so the rule cannot overwrite it',
      /return NextResponse\.json\(\{ ok: true, typeId: owned, by: 'pin' \}\)/.test(fn))
    t('⛔ …and the pinned type is re-validated against this truck',
      /\.from\('event_types'\)\.select\('id'\)\.eq\('id', pin\)\.eq\('truck_id', truck\.id\)/.test(fn))
  }

  /* ⚠️ A PRO TRUCK SEES STANDARD AND PRIVATE ONLY — custom types are Max. */
  t('⚠️ the options are filtered by the two plan keys, not by the plan name',
    /t\.kind === 'private' \? !canPrivate : !canTypes/.test(TAB))
  t('🔴 …and both keys come from `canAccess`, not from a plan string',
    /canAccess\(plan, 'event_types'/.test(TAB) && /canAccess\(plan, 'private_events'/.test(TAB))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · AN EXTRA PICTURE NEVER REACHES A POST
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · extra pictures are the truck\'s own — they never reach a poster')

{
  t('🔴 the table exists, service-role only',
    /create table if not exists public\.place_pictures/.test(SQL)
    && /alter table public\.place_pictures enable row level security/.test(SQL)
    && /revoke all on public\.place_pictures from anon, authenticated/.test(SQL))
  t('⛔ …with both parents ON DELETE CASCADE — the pictures belong to the place',
    /place_id uuid not null references public\.truck_places\(id\) on delete cascade/.test(SQL)
    && /truck_id text not null references public\.trucks\(id\) on delete cascade/.test(SQL))
  t('🔴 …and `truck_id` is TEXT, because trucks.id is a slug',
    /truck_id text not null references public\.trucks\(id\)/.test(SQL))
  t('⛔ …and the 10MB cap is in the TABLE as well as the handler',
    /bytes > 0 and bytes <= 10485760/.test(SQL) && /10 \* 1024 \* 1024/.test(ROUTE))

  /* ══ ⛔ THE ONE THAT MATTERS: NO POSTER CODE READS `place_pictures` ══════════════════════════════
   * The poster's picture is `truck_places.event_bg_path` with its own width, height and
   * `event_layout`. If the rendering path ever read the extra-pictures table, a reference photo of a
   * pitch would print behind the dates — and nothing would fail, because it is a valid image.
   * 🔴 SEARCHED ACROSS THE WHOLE POSTER SURFACE, comment-stripped so this file's own prose about the
   * table cannot satisfy it. */
  {
    const posterFiles = [
      ...walk('lib/weekly-post'),
      'app/api/weekly-post/route.ts',
      'components/manage/WeeklyPost.tsx',
      'components/manage/EventPost.tsx',
    ].filter(f => exists(f))
    const offenders = posterFiles.filter(f => /place_pictures/.test(codeOf(read(f))))
    t(`⛔ NOTHING in lib/weekly-post, the weekly-post route or either post component reads place_pictures (${offenders.join(', ') || 'none'})`,
      offenders.length === 0)
    t('🔴 …and the poster still reads its OWN column, so the two are genuinely separate',
      posterFiles.some(f => /event_bg_path/.test(codeOf(read(f)))))
  }

  /* ⛔ AND THE PANE SAYS SO IN WORDS. This is the sentence that stops the mistake being made in the
   * first place; the proof above only catches it after somebody has made it in code. */
  t('⛔ the pictures pane tells the operator these are never used on a post',
    /never used on a post/.test(TAB))

  /* 🔴 THE UPLOAD PATH IS BUILT SERVER-SIDE AND STARTS WITH THE TRUCK ID. A signed upload URL is
   * authority over exactly the path it names, so a client-supplied path would let one truck write
   * into another's folder. */
  t('🔴 the upload path is built server-side, truck first, then the place',
    /const path = `\$\{truck\.id\}\/places\/\$\{placeId\}\/pic-\$\{Date\.now\(\)\}\.\$\{ext\}`/.test(ROUTE))
  t('⛔ …and the save RE-CHECKS the path belongs to this truck and this place',
    /!path\.startsWith\(`\$\{truck\.id\}\/places\/\$\{placeId\}\/`\)/.test(ROUTE))
  /* 🔴 THE REAL BYTES ARE READ FROM STORAGE, never trusted from the client. */
  t('🔴 …and the size is read from the real object, not from the browser',
    /\.download\(path\)/.test(ROUTE) && /const bytes = blob\.size/.test(ROUTE))
  /* ⚠️ THE OBJECT GOES BEFORE THE ROW on remove: the other order leaves a row pointing at nothing,
   * which shows a broken thumbnail the operator cannot remove. */
  t('⚠️ remove deletes the storage object BEFORE the row', (() => {
    const fn = codeOf(ROUTE).slice(codeOf(ROUTE).indexOf("action === 'sg_place_picture_remove'"))
    const obj = fn.indexOf('.remove([String(row.path)])')
    const row = fn.indexOf(".from('place_pictures').delete()")
    return obj > 0 && row > 0 && obj < row
  })())
  t('🔴 …and both are scoped to this truck',
    /\.from\('place_pictures'\)\.select\('id, path'\)\.eq\('id', id\)\.eq\('truck_id', truck\.id\)/.test(codeOf(ROUTE)))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · HIDE, RESTORE, AND NO SECOND IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · hide/restore, and the tab shares Tidy up\'s pieces rather than copying them')

{
  /* ══ 🔴 ONE LIST, ONE DETAIL, ONE HOOK — THE BRIEF IS EXPLICIT ABOUT THIS ═══════════════════════
   * "Tidy up places in Add event stays, but its actions are the same ones this tab uses (no second
   * implementation)." So the tab IMPORTS the shared pieces, and `TidyUpPlaces` still exists. */
  t('🔴 the tab imports the SHARED hook, list and detail',
    /import \{[\s\S]{0,200}usePlaces, PlaceList, PlaceDetail[\s\S]{0,120}\} from '\.\/SchedulePlaces'/.test(TAB))
  t('⛔ …and defines no list, no detail and no loader of its own',
    !/export function PlaceList/.test(TAB) && !/export function PlaceDetail/.test(TAB)
    && !/function usePlaces/.test(TAB))
  t('🔴 …and Tidy up in Add event is untouched and still mounted',
    /export function TidyUpPlaces/.test(SHARED) && /<TidyUpPlaces/.test(MANAGE))

  /* 🔴 HIDE AND RESTORE GO THROUGH `sg_upsert_place`, which is the action Tidy up uses. ⛔ Restoring
   * a merged place also un-merges it, or it would come back showing none of its own events. */
  t('🔴 hide/restore is `sg_upsert_place` with `is_hidden`, in the SHARED detail',
    /is_hidden: true/.test(SHARED) && /is_hidden: false/.test(SHARED)
    && /sg_upsert_place/.test(SHARED))
  t('⛔ …and restoring a merged place clears `merged_into_id` too', (() => {
    const fn = codeOf(ROUTE).slice(codeOf(ROUTE).indexOf("action === 'sg_upsert_place'"))
    return /merged_into_id = null|merged_into_id: null/.test(fn)
  })())
  /* 🔴 THE HIDDEN ROW IS A COUNT AND A TOGGLE, not a filter control — hidden places are somewhere to
   * go and get one back, not a view to work in. */
  t('🔴 the list has an "N hidden places · Show" row, driving the shared `showHidden`',
    /hidden place/.test(TAB) && /showHidden=\{showHidden\}/.test(TAB)
    && /setShowHidden\(v => !v\)/.test(TAB))
  /* ⚠️ MERGED PLACES ARE NOT LISTED SEPARATELY — the brief says so, and `isRetired` is what lumps
   * them with hidden ones in the shared list. */
  t('⚠️ merged places are not a separate list — they count as retired',
    /merged_into_id/.test(SHARED) && !/MERGED PLACES</.test(TAB))

  /* 🔴 "Events here" SHOWS PRIVATE EVENTS, because this is the truck's own screen (§73). */
  t('🔴 "Events here" shows private events, with a chip — this is the operator\'s own screen',
    /action === 'sg_place_events'/.test(ROUTE) && /isPrivate/.test(TAB) && /PRIVATE_CHIP/.test(TAB))
  t('⛔ …and it groups through `placeForEvent`, so a MERGED place\'s events land on its target',
    /groupEventsByPlace\(events, places\)/.test(codeOf(ROUTE).slice(codeOf(ROUTE).indexOf("action === 'sg_place_events'"))))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE 42P10 GUARD STILL HOLDS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · nothing added here upserts onto a partial index')

{
  /* ⛔ THE LESSON OF 20261013: PostgREST's `on_conflict=` becomes `ON CONFLICT (cols)` and conflict
   * inference CANNOT target a partial index (42P10). 20261015 adds one unique index and one partial
   * one, so this is where that could come back. */
  t('🔴 place_pictures_path_uidx is NOT partial',
    /create unique index if not exists place_pictures_path_uidx\s*\n\s*on public\.place_pictures \(path\);/.test(SQL))
  t('⛔ …and the pin\'s index IS partial, which is safe because nothing upserts onto an index',
    /create index if not exists truck_places_usual_event_type_idx[\s\S]{0,120}where usual_event_type_id is not null/.test(SQL))
  t('⛔ …and nothing upserts `place_pictures` at all — it inserts and handles 23505', (() => {
    const hits = []
    for (const f of walk('lib').concat(walk('app'))) {
      const c = codeOf(read(f))
      const re = /\.from\('place_pictures'\)([\s\S]{0,600}?)(?=\.from\('|$)/g
      let m
      while ((m = re.exec(c))) if (/\.upsert\(/.test(m[1])) hits.push(f)
    }
    return hits.length === 0 && /error\.code === '23505'/.test(ROUTE)
  })())
  t('🔴 …and the repository-wide §7b guard still exists',
    /ON CONFLICT targets are real, non-partial uniques/.test(read('scripts/event-pricing.cjs')))

  /* ⚠️ AND THE MIGRATION WRITES NO ROWS. One column, one table, no backfill. */
  t('⛔ 20261015 contains no update and no insert — nothing is backfilled', (() => {
    const body = SQL.replace(/^--.*$/gm, '')
    return !/\bupdate\s+public\./i.test(body) && !/\binsert\s+into\b/i.test(body)
  })())
  /* 🔴 AND BOTH ID TYPES WERE CHECKED, which the brief made a STOP condition. */
  t('🔴 §0 proves both id types before anything is altered',
    /truck_places\.id is uuid/.test(SQL) && /event_types\.id is uuid/.test(SQL))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · THE SOCIAL POSTS PAGE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('6 · Social posts: one heading, Single event first, and the Places pointer')

{
  const WP = read('components/manage/WeeklyPost.tsx')
  const EP = read('components/manage/EventPost.tsx')

  t('🔴 "Single event" is first in the toggle and is the default',
    /\[\['event', 'Single event'\], \['week', 'Weekly'\]\]/.test(WP)
    && /useState<'week' \| 'event'>\('event'\)/.test(WP))
  /* ⚠️ COMMENT-STRIPPED. The note recording the rename quotes the old label, and a check that reads
   * raw source cannot tell a label from a note about a label. */
  t('⛔ "Week (7 days)" is gone from the screen', !/Week \(7 days\)/.test(codeOf(WP)))

  /* ══ ⛔ ONE HEADING PER VIEW ════════════════════════════════════════════════════════════════════
   * The weekly view showed "Set up your weekly post" TWICE — a large bold page heading and the card
   * heading below it. The outer one is gone and the card's now matches the event card's style. */
  t('⛔ the outer page heading is gone — no `text-lg font-black` heading in the setup switch',
    !/<h2 className="text-lg font-black text-slate-900">\s*\n?\s*\{designKind === 'week'/.test(WP))
  t('🔴 …and the weekly card heading matches the event card\'s exactly', (() => {
    const weekly = /<p className="font-bold text-slate-800">Set up your weekly post<\/p>/.test(WP)
    const event = /<p className="font-bold text-slate-800">Set up your event post<\/p>/.test(EP)
    return weekly && event
  })())
  /* ⚠️ COMMENT-STRIPPED, for the same reason: the note explaining that it used to appear twice says
   * the words. ONE occurrence in the CODE is the claim. */
  t('⛔ and "Set up your weekly post" appears exactly ONCE in the rendered code',
    (codeOf(WP).match(/Set up your weekly post/g) || []).length === 1)

  t('⛔ the event copy no longer counts "three"', !/adds those three for each event/.test(EP))
  t('🔴 …and says "HatchGrab adds those for each event."', /HatchGrab adds those for each event\./.test(EP))
  t('🔴 and the Places pointer is there, linking to the tab',
    /A different picture for one place\? Add it in/.test(EP) && /href="\?section=places"/.test(EP))
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
