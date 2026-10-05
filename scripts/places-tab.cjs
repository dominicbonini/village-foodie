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
/* ⛔ `exists` WENT WITH §3's REWRITE (5 October 2026). It guarded a hand-listed set of poster files
 * — `[...walk('lib/weekly-post'), 'app/api/weekly-post/route.ts', …].filter(exists)` — against reading
 * `place_pictures`. The replacement sweeps app/, lib/ AND components/ for the table's name, so there is
 * no list of file paths to check the existence of; every path comes from `walk`. */
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
// 1b · A SECTION LINK CARRIES ITS TAB — AND A DEFAULT CANNOT OVERRIDE THE URL
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1b · a section link carries its tab, and a trial default cannot override the URL')

{
  /* ══ ⛔ THE BUG: "Add a picture for this place" LANDED ON BILLING (5 October 2026, Dominic) ════════
   * Two links in the product were written as a bare relative query:
   *     <a href="?section=weekly">   (the Places tab)      <a href="?section=places">   (the post)
   * A bare `?section=…` REPLACES the whole query string, so `?tab=` was dropped. The mount parser does
   * imply the tab from the section — but it is not the only thing that sets the tab, and on a truck
   * whose plan is 'trial' the defaults-to-Billing effect ran AFTERWARDS and won.
   *
   * 🔴 TWO FAULTS, TWO FIXES, AND BOTH ARE ASSERTED HERE, because either one alone leaves the other
   * reachable by a path nobody is looking at:
   *   1. the URL builder, so a section link cannot be written without its tab;
   *   2. `urlAskedForTab`, so a DEFAULT may never override a URL that asked for a tab.
   * ⚠️ FIX 2 ALSO REPAIRS `?tab=schedule` — the link app/api/inbound-schedule/route.ts EMAILS operators
   * to review found events, which opened a price list for every trial truck. That is the version of this
   * bug that was costing something, and no screen could have shown it. */
  const LINKS = read('lib/manage-links.ts')
  t('🔴 there is ONE builder, and it is a pure string function',
    /export function manageSectionHref\(/.test(LINKS)
    && !/useState|window\.|useRouter/.test(codeOf(LINKS)))
  t('⛔ …and a caller names a SECTION and cannot supply the tab',
    /const TAB_FOR_SECTION: Record<ScheduleSection \| MenuSection, ManageTab>/.test(LINKS)
    && !/manageSectionHref\(\s*section[^)]*tab:/.test(LINKS))
  t('🔴 …and every section it knows maps to a tab', (() => {
    const map = LINKS.slice(LINKS.indexOf('const TAB_FOR_SECTION'), LINKS.indexOf('export function manageSectionHref'))
    return ['events', "'event-types'", 'places', 'weekly', 'items', 'capacity', 'extras', 'deals']
      .every(k => map.includes(k.replace(/'/g, '')))
      && /places: 'schedule'/.test(map) && /weekly: 'schedule'/.test(map) && /deals: 'menu'/.test(map)
  })())
  t('🔴 …and it emits BOTH params, every time',
    /const qs = `\?tab=\$\{tab\}&section=\$\{section\}`/.test(LINKS))
  /* 🔴 THE TWO LINKS THAT WERE BROKEN, BY NAME. Asserted as "calls the builder", not as "contains the
   * right string" — the string is the builder's business and this is about who assembles it. */
  t('🔴 the Places tab\'s "Text positions" link calls the builder',
    /manageSectionHref\('weekly'\)/.test(TAB))
  t('🔴 …and the single-event post\'s Places pointer calls it too',
    /manageSectionHref\('places'\)/.test(read('components/manage/EventPost.tsx')))
  /* ⛔ AND NO TAB LINK IS HAND-WRITTEN EITHER. `?tab=billing` was literal in three places; the string is
   * identical, and that is exactly why it had to move — a literal that happens to be right is the thing
   * a later edit gets wrong. */
  t('⛔ no `href="?tab=…"` literal is left in app/ or components/', (() => {
    const hits = []
    for (const f of walk('app').concat(walk('components'))) {
      if (/href="\?tab=/.test(codeOf(read(f)))) hits.push(f)
    }
    return hits.length === 0
  })())
  t('🔴 …and the scraper\'s email builds its link with the builder too',
    /manageTabHref\('schedule', \{ token: truck\.dashboard_token \}\)/
      .test(read('app/api/inbound-schedule/route.ts')))

  /* ══ 🔴 FIX 2: A DEFAULT MAY NOT OVERRIDE A URL THAT ASKED FOR A TAB ═════════════════════════════
   * ⛔ ASSERTED AS THE GUARD, NOT AS THE EFFECT'S EXISTENCE. The effect is allowed to stay — a trial
   * truck with no deep link still opens on Billing, which is deliberate. What is not allowed is for it
   * to run when the URL named a tab.
   * ⚠️ AND THE REF IS SET IN ALL FOUR BRANCHES OF THE MOUNT PARSER — `?tab=`, the two retired keys, and
   * a bare `?section=`. Setting it in three would leave one link still broken. */
  {
    const code = codeOf(MANAGE)
    t('🔴 the mount parser records that the URL asked for a tab',
      /const urlAskedForTab = useRef\(false\)/.test(code))
    t('⛔ …and the trial default returns early when it did',
      /if \(urlAskedForTab\.current\) return/.test(code))
    const eff = code.slice(code.indexOf('if (urlAskedForTab.current) return'))
    t('🔴 …before it reads the plan at all', (() => {
      const guard = eff.indexOf('if (urlAskedForTab.current) return')
      const plan = eff.indexOf("plan === 'trial'")
      return guard === 0 && plan > 0
    })())
  /* ⛔ AND A BARE `?section=` COUNTS AS ASKING FOR A TAB. That is the exact path "Add a picture for
   * this place" took: no `?tab=` at all, the section implying Schedule. A fix that only covered
   * `?tab=` would have left the reported bug exactly as it was.
   * 🔴 ASSERTED ON THE ONE EXPRESSION, NOT ON FOUR ASSIGNMENTS. The ref is written once, after all
   * four branches, from the same predicates the branches used — so it cannot be true for a `?tab=`
   * the page does not recognise, and it cannot be missed on one branch out of four. */
    t('⛔ …and a bare `?section=` counts as asking for a tab',
      /urlAskedForTab\.current =\s*\n\s*!!\(tabParam && \(allTabIds\.includes\(tabParam as Tab\) \|\| LEGACY_TAB_TO_MENU_SECTION\[tabParam\]\)\)\s*\n\s*\|\| isScheduleSection\(sectionParam\) \|\| isMenuSection\(sectionParam\)/
        .test(code))
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE PIN
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · the place\'s event type is a PILL ROW — one selected, and no "Automatic"')

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

  /* ══ ⛔ RE-AIMED TWICE, AND THE SECOND TIME THE OPTION ITSELF WENT (5 October 2026, Dominic) ══════
   * V1 asserted the literal `Automatic (${automaticName} — last used here)` while `automaticName`'s
   * only caller was `() => 'Standard'` — a hardcoded word. It passed while the screen told a wedding
   * venue that Automatic meant Standard.
   * V2 asserted that the label came from the SERVER's resolution, which was true and was still an
   * assertion about a mechanism nobody asked to see.
   * 🔴 V3 — THIS — ASSERTS THAT THE OPTION IS GONE. The control is a pill row; a place is on exactly
   * one type; the type a never-set place shows is the history rule's answer, drawn as an ordinary
   * selected pill with no special label. "Automatic" is not a state the operator can be in, so the word
   * must not appear in the file's CODE at all — `codeOf` strips the prose that explains why.
   * ⚠️ `usual_automatic_type_id` IS NOT A HIT: it is lower-case, and it is the server's answer for the
   * rule, which is exactly what the pill now shows. */
  t('⛔ the word "Automatic" appears nowhere in the tab\'s code', !/Automatic/.test(codeOf(TAB)))
  t('🔴 …nor in the shared list or detail', !/Automatic/.test(codeOf(SHARED)))
  t('🔴 the pills are a radiogroup with `aria-checked`, so exactly ONE is selected',
    /role="radiogroup"/.test(TAB) && /role="radio"/.test(TAB) && /aria-checked=\{on\}/.test(TAB)
    && /data-place-type-pills/.test(TAB))
  t('🔴 …Standard first, then Private, then the custom types — the grid\'s order', (() => {
    const row = TAB.slice(TAB.indexOf('role="radiogroup"'), TAB.indexOf('PLACE_TYPE_HELPER}'))
    const std = row.indexOf("pill('standard'")
    const priv = row.indexOf('privateType.id, privateType.name')
    const cust = row.indexOf('customTypes.map')
    return std > 0 && priv > std && cust > priv
  })())
  /* 🔴 ONE HELPER LINE, AND IT IS ABOUT THE CONSEQUENCE. The old one explained the mechanism. */
  t('🔴 …under one sentence about what the row DOES, from the copy module',
    /PLACE_TYPE_HELPER/.test(TAB)
    && /Add event picks this type whenever you choose this place\./
      .test(read('lib/copy/serviceSettings.ts')))
  /* ⛔ AND THERE IS NO LONGER A WAY TO WRITE "NEITHER". `savePin` takes a STRING; the route still
   * accepts null, because `clearOwn` and older callers send it and the STORAGE is unchanged. */
  t('⛔ `savePin` takes a string — the control cannot send null any more',
    /const savePin = async \(typeId: string\) =>/.test(TAB) && !/onSave\(null\)/.test(codeOf(TAB)))
  t('🔴 …and it still patches BOTH columns together, as the route writes them',
    /usual_event_type_id: isStd \? null : typeId, usual_type_is_standard: isStd/.test(TAB))
  t('🔴 …and `sg_places` still resolves the rule\'s answer with the same function Add event uses',
    /readPlaceTypeHistory\(supabase, truck\.id, placeForEvent\)/.test(codeOf(ROUTE))
    && /usual_automatic_type_id: autoOk/.test(codeOf(ROUTE)))

  /* ══ 🔴 ONE DERIVATION OF "WHICH TYPE IS THIS PLACE ON", READ BY BOTH SURFACES ═══════════════════
   * The selected pill and the type label on the LIST row are the same answer about the same place. Two
   * copies of `is_standard ? null : (id ?? rule)` is how a list comes to disagree with the detail pane
   * it opens — which is the dropdown's original bug in a new place. */
  t('🔴 `placeTypeId` is the one derivation, and both surfaces call it',
    /export function placeTypeId\(place: Place\): string \| null/.test(TAB)
    && (codeOf(TAB).match(/placeTypeId\(/g) || []).length >= 3)

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
      /place\.usual_type_is_standard === true \? null\s*\n\s*: place\.usual_event_type_id \?\? place\.usual_automatic_type_id \?\? null/.test(TAB))
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

  /* ⚠️ A PRO TRUCK SEES STANDARD AND PRIVATE ONLY — custom types are Max. ⛔ FILTERED, NOT DISABLED:
   * a pill that refuses when pressed is worse than no pill, because nothing on screen can say when it
   * will work. The pills are now two guarded expressions rather than one filter callback. */
  t('⚠️ the pills are filtered by the two plan keys, not by the plan name',
    /privateType && canPrivate/.test(TAB) && /canTypes && customTypes\.map/.test(TAB))
  t('🔴 …and both keys come from `canAccess`, not from a plan string',
    /canAccess\(plan, 'event_types'/.test(TAB) && /canAccess\(plan, 'private_events'/.test(TAB))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · "Your own pictures" IS GONE — AND "Picture for posts" UPLOADS IN PLACE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · "Your own pictures" is gone, and the post picture uploads in place')

{
  /* ══ ⛔ THIS SECTION USED TO PROVE THE EXTRA-PICTURES PANE WAS SAFE (5 October 2026) ══════════════
   * Eleven checks: the table's RLS, its cascades, its 10MB CHECK, the server-built upload path, the
   * re-check of that path, the real bytes read from storage, the object deleted before the row.
   * 🔴 THEY ALL PASSED, AND THE FEATURE WAS STILL DELETED. `place_pictures` was a per-place reference
   * library that nothing read — no post, no feed, no export, no other screen — and its own pane had to
   * say so in capitals every time it was drawn. Proving a thing is safe is not the same as proving it is
   * wanted, and this is the clearest example of that distinction in the repository.
   *
   * 🔴 SO WHAT IS ASSERTED NOW IS THE DELETION, IN BOTH DIRECTIONS:
   *   • the UI is gone and the five routes are gone, and
   *   • the TABLE IS STILL THERE, UNREAD. That second half is not pedantry: somebody's photographs are
   *     in it, and the next reader who finds an unreferenced table is the person this check is for. */
  t('⛔ the table is still in the database — the migration is NOT reverted',
    /create table if not exists public\.place_pictures/.test(SQL))
  t('⛔ …and NOTHING in app/ or lib/ reads it any more', (() => {
    const hits = []
    for (const f of walk('lib').concat(walk('app')).concat(walk('components'))) {
      if (/place_pictures/.test(codeOf(read(f)))) hits.push(f)
    }
    return hits.length === 0
  })())
  t('⛔ …and the five routes that did are gone from the manage route',
    ['sg_place_pictures', 'sg_place_picture_url', 'sg_place_picture_save',
      'sg_place_picture_remove', 'sg_place_events']
      .every(a => !new RegExp(`action === '${a}'`).test(codeOf(ROUTE))))
  t('⛔ …and the tab has no pictures pane and no "never used on a post" sentence',
    !/PicturesPane/.test(TAB) && !/never used on a post/.test(codeOf(TAB)))
  /* 🔴 AND THE TOMBSTONE SAYS NOT TO DROP THE TABLE. A deletion with no note is an invitation to
   * finish the job on somebody else's files. */
  t('🔴 …and the route\'s tombstone warns against dropping it',
    /DO NOT "TIDY UP" THE TABLE WITHOUT ASKING/.test(ROUTE))

  /* ══ 🔴 "Picture for posts": THE UPLOAD IS HERE, AND IT IS THE EXISTING FLOW ═════════════════════
   * ⛔ NOT A SECOND UPLOAD PATH. It is `upload_url` → PUT → `confirm_upload` with `which: 'place'` on
   * /api/weekly-post — the same three calls EventPost.tsx makes — so the shape check against the
   * standard design, the 10MB cap, the PNG/JPG rule and the storage path are the server's existing ones.
   * A second implementation would be a second set of rules about what a poster's picture may be. */
  t('🔴 the section is called "Picture for posts"', /Picture for posts/.test(TAB))
  t('🔴 …and the upload is the EXISTING three-call flow on /api/weekly-post',
    /fetch\('\/api\/weekly-post'/.test(TAB)
    && /action: 'upload_url', which: 'place'/.test(TAB)
    && /action: 'confirm_upload', path: slot\.path, which: 'place', placeId: place\.id/.test(TAB))
  t('⛔ …and it adds NO new action to that route — only ones that were already there',
    ['upload_url', 'confirm_upload', 'event_remove_place_design', 'event_load']
      .every(a => new RegExp(`action === '${a}'`).test(codeOf(read('app/api/weekly-post/route.ts')))))
  /* ⛔ THE SHAPE CHECK IS THE SERVER'S AND ONLY THE SERVER'S — the only honest source for an aspect
   * ratio is the real pixels of the stored object. The client's size and type tests are a courtesy. */
  t('⛔ the shape check is the SERVER\'s, against the standard design',
    /checkAspect\(check\.info\.width, check\.info\.height, row\.event_bg_width, row\.event_bg_height\)/
      .test(codeOf(read('app/api/weekly-post/route.ts'))))
  t('⚠️ …and the client\'s 10MB/PNG-JPG tests are named as a courtesy, not the guard',
    /A COURTESY, NOT THE GUARD/.test(TAB) && /MAX_POST_PICTURE_BYTES/.test(TAB))
  /* 🔴 NO PICTURE ⇒ THE PLACEHOLDER SAYS WHAT IS BEING USED, not what is missing. */
  t('🔴 with no picture it says "Standard design" and names what posts use',
    /Standard design/.test(TAB) && /POST_PICTURE_STANDARD_NOTE/.test(TAB)
    && /Event posts here use your standard design\./.test(read('lib/copy/serviceSettings.ts')))
  t('🔴 …and the button is "Upload a picture for this place"',
    /Upload a picture for this place/.test(TAB))
  t('⛔ …and REMOVE is confirmed, because it deletes a file',
    /window\.confirm\(/.test(TAB) && /action: 'event_remove_place_design'/.test(TAB))
  /* 🔴 "Text positions" IS STILL A LINK — the drag surface lives in Social posts with its three
   * pointer fixes, and a second one here would be a second set of those bugs. */
  t('🔴 "Text positions" is still a link, and it goes through the ONE builder',
    /Text positions/.test(TAB) && /manageSectionHref\('weekly'\)/.test(TAB))
  /* ⛔ AND THE OLD BUG IS GONE: no bare relative `?section=` anywhere in the product. §1b proves the
   * builder; this proves nobody is still writing one by hand. */
  t('⛔ no file writes a bare `href="?section=…"` any more', (() => {
    const hits = []
    for (const f of walk('app').concat(walk('components'))) {
      if (/href=["'{`]\s*["'`]?\?section=/.test(codeOf(read(f)))) hits.push(f)
    }
    return hits.length === 0
  })())
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
  /* ══ ⛔ THE "N hidden places · Show" FOOTER IS GONE (5 October 2026, Dominic) ════════════════════
   * It was a count you had to press to reveal a list, and until you pressed it a place an operator had
   * hidden was simply absent from the screen that owns places. The question they arrive with is "where
   * did The Crown go?", and a screen that answers it only after a hunt has hidden the answer too.
   * 🔴 SO HIDDEN PLACES ARE A SECTION AT THE BOTTOM, ALWAYS DRAWN, GREYED, with a two-fact line: they
   * stay out of Add event, and opening one restores it.
   * ⚠️ "Tidy up places" IN ADD EVENT KEEPS `showHidden` — a different job, a short working pass, where
   * a long greyed tail is noise. Asserted here BY NAME so the two cannot be conflated again. */
  t('⛔ the Places tab has no hidden-places footer and no `showHidden` state',
    !/showHidden/.test(codeOf(TAB)) && !/hidden place/.test(codeOf(TAB))
    && !/footer=/.test(codeOf(TAB)))
  t('🔴 …it passes `hiddenSection` instead, so hidden places stay ON the screen',
    /hiddenSection\n/.test(TAB) || /hiddenSection /.test(TAB))
  t('🔴 …and the shared list draws them last, greyed, under a heading',
    /data-hidden-places/.test(SHARED) && /Hidden places<\/p>/.test(SHARED)
    && /hidden\.map\(p => row\(p, true\)\)/.test(SHARED))
  t('🔴 …under the two facts an operator needs: the consequence and the way back',
    /Hidden places stay out of Add event\. Open one to restore it\./.test(SHARED))
  t('⛔ …and SEARCH still covers them — a hidden place is findable by name', (() => {
    /* 🔴 ASSERTED ON THE FILTER ITSELF: the hidden group is `isRetired(p) && matches(p)`, so the search
     * term is applied to it exactly as it is to the live groups. A hidden section that ignored the
     * search box would be a list that stopped matching what the operator typed. */
    const fn = SHARED.slice(SHARED.indexOf('const live = places.filter'), SHARED.indexOf('}, [places, search'))
    return /hidden: hiddenSection \? places\.filter\(p => isRetired\(p\) && matches\(p\)\)/.test(fn)
  })())
  t('⛔ …and Tidy up — a different job — still has `showHidden` and its footer',
    /showHidden=\{showHidden\}/.test(SHARED) && /Show hidden places/.test(SHARED))
  /* 🔴 AND THE TYPE IS ON EACH ROW. The list is where an operator scans for the odd one out — the pitch
   * that is still on Private from a wedding six months ago — and that is only possible if it is shown. */
  t('🔴 each row shows the place\'s type: a colour dot and a name, or a purple lock',
    /typeLabelFor=\{typeLabelFor\}/.test(TAB)
    && /typeLabelFor\?\.\(p\)/.test(SHARED)
    && /🔒/.test(TAB) && /text-purple-700/.test(TAB))
  t('⛔ …and the dot is the GRID\'s colour, from the grid\'s own index',
    /colourFor\(i\)/.test(TAB) && /STANDARD_COLOUR/.test(TAB)
    && /from '@\/lib\/event-types\/types'/.test(TAB))
  /* ⚠️ AN ID THAT IS NOT IN `types` GETS NO LABEL — never "Standard", which would be a lie: Standard is
   * `null` and this place carries an id. */
  t('⚠️ …and an unknown type id renders NO label rather than a wrong one',
    /const i = types\.findIndex\(t => t\.id === id\)\n\s*if \(i < 0\) return null/.test(TAB))
  /* ⚠️ MERGED PLACES ARE NOT LISTED SEPARATELY — the brief says so, and `isRetired` is what lumps
   * them with hidden ones in the shared list. */
  t('⚠️ merged places are not a separate list — they count as retired',
    /merged_into_id/.test(SHARED) && !/MERGED PLACES</.test(TAB))

  /* ══ ⛔ BOTH "Events here" BOXES ARE GONE (5 October 2026, Dominic) ══════════════════════════════
   * One sat under the fields and one at the bottom of the page. Between them they printed the next
   * event, the last few events and a lifetime count on the screen whose job is a place's SETTINGS — and
   * the Events section, one pill away, is the real schedule and the only one that can be filtered,
   * edited and posted from.
   * ⛔ THE OLD CHECKS PASSED. They proved the boxes showed private events honestly and grouped merged
   * places correctly, which they did. A correct rendering of something that should not be on the screen
   * is still something that should not be on the screen.
   * 🔴 WHAT MUST SURVIVE IS NEXT AND LAST ON THE LIST ROWS, which `sg_places` computes with the same
   * grouping the deleted action used — so nothing about merged places was lost with it. */
  t('⛔ neither "Events here" box is left, and nothing imports PRIVATE_CHIP for one',
    !/EventsHere/.test(codeOf(TAB)) && !/PRIVATE_CHIP/.test(codeOf(TAB))
    && !/Events here/.test(codeOf(TAB)) && !/Events here/.test(codeOf(SHARED)))
  t('⛔ …and the route\'s `sg_place_events` is deleted, with a tombstone saying why',
    !/action === 'sg_place_events'/.test(codeOf(ROUTE))
    && /THE SCHEDULE IS THE ANSWER TO "WHAT HAPPENS HERE"/.test(ROUTE))
  t('🔴 …but Next and Last still reach the list rows, through the SAME grouping',
    /groupEventsByPlace\(events, places\)/.test(codeOf(ROUTE).slice(codeOf(ROUTE).indexOf("action === 'sg_places'")))
    && /next_event_date: next\?\.event_date \?\? null/.test(codeOf(ROUTE)))

  /* ══ 🔴 THE DETAIL PANE IS REMOUNTED PER PLACE, AND THAT WAS A REAL BUG (found 5 October 2026) ═════
   * `PlaceDetail` holds the five fields as LOCAL DRAFT STATE and saves them ON BLUR. The Places tab
   * mounted it with no `key`, so selecting a second place reused the component: the pane showed the
   * FIRST place's name, short name, address, area and postcode, and blurring any field would have
   * written them onto the second place. Tidy up always had the key. ⛔ ASSERTED ON BOTH MOUNTS. */
  t('🔴 both mounts of `PlaceDetail` are keyed on the place id',
    /<PlaceDetail key=\{selected\.id\}/.test(TAB) && /<PlaceDetail key=\{selected\.id\}/.test(SHARED))
  /* ⛔ AND THE FAVOURITE BUTTON IS GONE FROM THE DETAIL — the list star is the one control for it. */
  t('⛔ the detail has no Favourite button; the list star still works', (() => {
    /* 🔴 `codeOf` FIRST, AND THE SLICE SECOND. The tombstone where the button was names it four times —
     * which is the point of a tombstone — and reading the raw text would let that prose fail a check
     * about code. This is the third time in this build that a comment nearly satisfied or broke an
     * assertion about the thing it describes. */
    const code = codeOf(SHARED)
    const from = code.indexOf('export function PlaceDetail')
    /* ⛔ AND THE SLICE IS BOUNDED. `TidyUpPlaces` is declared AFTER `PlaceDetail` and mounts the list
     * with `onFavourite` — so a slice that ran to EOF read the star's own wiring as a Favourite button
     * in the detail pane and failed. A slice with no end anchor is not a slice of what you named; this
     * is the second time in this build that exact mistake has been made. */
    const to = code.indexOf('export function TidyUpPlaces')
    const detail = from > 0 && to > from ? code.slice(from, to) : ''
    return !!detail && !/Favourite/.test(detail)
      && /onFavourite/.test(code) && /setFavourite/.test(code)
  })())
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
  /* ⛔ AND NOW IT IS VACUOUSLY TRUE, WHICH IS WORTH SAYING OUT LOUD: nothing touches `place_pictures`
   * at all any more (§3 asserts that directly), so nothing can upsert it. The index checks above stay
   * because the TABLE and its indexes are still in the database — a later feature that reaches for them
   * meets the same 42P10 trap 20261013 taught. */
  t('⛔ …and nothing upserts `place_pictures` — nothing touches it at all', (() => {
    const hits = []
    for (const f of walk('lib').concat(walk('app')).concat(walk('components'))) {
      if (/place_pictures/.test(codeOf(read(f)))) hits.push(f)
    }
    return hits.length === 0
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
