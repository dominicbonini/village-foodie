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
/* 🔴 `exists` IS BACK (6 October 2026), for one claim worth making directly: `PlacesTab.tsx` is
 * DELETED, not merely unmounted. An unmounted component is a component somebody re-mounts.
 * ⛔ ITS FIRST LIFE WAS DIFFERENT AND IS WORTH RECORDING: it guarded a hand-listed set of poster files
 * against reading `place_pictures`. It guarded a hand-listed set of poster files
 * — `[...walk('lib/weekly-post'), 'app/api/weekly-post/route.ts', …].filter(exists)` — against reading
 * `place_pictures`. The replacement sweeps app/, lib/ AND components/ for the table's name, so there is
 * no list of file paths to check the existence of; every path comes from `walk`. */
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
/* ══ ⛔ `TAB` WAS `components/manage/PlacesTab.tsx` (6 October 2026) ══════════════════════════════
 * That file is deleted. Its four controls are in two places now, and this harness reads both:
 *   the usual type, the type label and hiding  → the Add event form, in `MANAGE`
 *   the post picture                            → `SOCIAL`, the Social posts page
 * ⚠️ NOTHING IS "MISSING" FROM THIS FILE AS A RESULT. Every claim it made is still made; §2 and §4
 * simply name a different subject. */
const SOCIAL = read('components/manage/SocialPosts.tsx')
const SHARED = read('components/manage/SchedulePlaces.tsx')
const SQL = read('supabase/migrations/20261015_places_tab.sql')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE PILLS, AND EVERY OLD ?section= LINK
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · two pills — and all four retired section ids still resolve')

{
  /* 🔴 READ OUT OF `SCHEDULE_SECTIONS` ITSELF, in declaration order, because that array IS the bar. */
  /* ⚠️ THE END ANCHOR IS **BOUNDED** AND IT HAD TO BE RE-AIMED (7 October 2026). It ran to
   * `const isScheduleSection`, which used to be the next declaration — and `SOCIAL_SECTIONS` now sits
   * between them, so the slice swallowed its three pills and this check read five. A slice that grows
   * when something is inserted into it is a slice that reads the wrong array and says nothing. */
  const block = MANAGE.slice(
    MANAGE.indexOf('const SCHEDULE_SECTIONS'),
    MANAGE.indexOf('const SOCIAL_SECTIONS'),
  )
  const ids = [...block.matchAll(/\{ id: '([^']+)', label: '([^']+)' \}/g)].map(m => [m[1], m[2]])
  /* ══ ⛔ THE PILL COUNT HAS BEEN 3 → 4 → 3 → **2** (7 October 2026) ════════════════════════════════
   * Places was a pill for one day; Social posts was the third pill for one more. Everything social is
   * its own TOP TAB now, with three pills of its own, so Schedule is back to the two things it has
   * always actually been about. */
  t(`🔴 Schedule's pills are Events · Event types (${ids.map(i => i[1]).join(' · ')})`,
    JSON.stringify(ids.map(i => i[1])) === JSON.stringify(['Events', 'Event types']))
  /* 🔴 AND THE SOCIAL TAB'S OWN THREE, READ OUT OF `SOCIAL_SECTIONS` — the array that IS that bar. */
  t('🔴 …and the social tab\'s pills are Create a post · Designs · Location settings', (() => {
    const b = MANAGE.slice(MANAGE.indexOf('const SOCIAL_SECTIONS'),
      MANAGE.indexOf('const isScheduleSection'))
    const got = [...b.matchAll(/\{ id: '([^']+)', label: '([^']+)' \}/g)].map(m => [m[1], m[2]])
    return JSON.stringify(got) === JSON.stringify([
      ['create', 'Create a post'], ['designs', 'Designs'], ['locations', 'Location settings'],
    ])
  })())

  /* 🔴 SO THE CLAIM WORTH ASSERTING IS NOT "there is no Places pill". It is that the four RETIRED IDS
   * STILL RESOLVE, to the screens that replaced them: `?section=places` → Location settings,
   * `?section=posts`/`weekly` → Create a post, `?section=designs` → Designs. ⛔ A VALIDATOR THAT
   * REJECTED THEM WOULD SEND A LIVE BOOKMARK TO EVENTS, which is the bug the Places pill's FIRST
   * removal shipped on 3 October — and to BILLING, which is what it did before that. */
  const LINKS = read('lib/manage-links.ts')
  t('⛔ none of the retired ids is a pill any more',
    !ids.some(([id]) => ['places', 'weekly', 'posts', 'designs'].includes(id)))
  t('🔴 …and all four are still MAPPED, never dropped', (() => {
    const map = LINKS.slice(LINKS.indexOf('const LEGACY_SCHEDULE_SECTION'),
      LINKS.indexOf('const LIVE_SCHEDULE_SECTIONS'))
    return /posts: 'create',/.test(map) && /weekly: 'create',/.test(map)
      && /designs: 'designs',/.test(map) && /places: 'locations',/.test(map)
  })())
  /* ⛔ AND THEY ARE RESOLVED BY **ONE** FUNCTION, WHICH ANSWERS THE TAB TOO. That is the half that is
   * new: a legacy id now changes the TAB as well as the section, so a chain of `if`s at the call site
   * is exactly how `?section=places` reached Billing. ⚠️ DRIVEN, NOT READ — the four ids are put
   * through the real resolver and the answer is asserted, which a regex on the map cannot do. */
  /* ⛔ AND THEY ARE RESOLVED BY **ONE** FUNCTION, WHICH ANSWERS THE TAB TOO. That is the half that is
   * new: a legacy id now changes the TAB as well as the section, so a chain of `if`s at the call site
   * is exactly how `?section=places` reached Billing.
   * ⚠️ ASSERTED ON THE SOURCE HERE, AND **DRIVEN** IN `scripts/social-posts.cjs` §5 — which compiles
   * the module and puts all four ids through the real function, including the "nothing lands on
   * Billing" claim. This file has no TypeScript compiler, and a regex-stripped copy of a resolver to
   * get at four lines would be a transpiler nobody asked for. */
  t('🔴 …and ONE resolver answers both halves, in one function', (() => {
    const fn = LINKS.slice(LINKS.indexOf('export function resolveManageLocation'),
      LINKS.indexOf('export function canonicalSocialSection'))
    return /if \(t === 'social'\) \{/.test(fn)
      && /const moved = LEGACY_SCHEDULE_SECTION\[sec as LegacyScheduleSection\]/.test(fn)
      && /if \(moved\) return \{ tab: 'social', section: moved \}/.test(fn)
      /* ⛔ AND A BARE `?section=` IS HONOURED TOO, through `TAB_FOR_SECTION` — some links in the wild
       * carry no `?tab=`, and guessing is what sent one to Billing. */
      && /if \(!t && sec\) \{/.test(fn)
      && /return resolveManageLocation\(owner, sec\)/.test(fn)
      /* ⚠️ AND IT IS TOTAL: nothing throws, nothing returns null, every input gets a usable location. */
      && /return \{ tab: \(t as ManageTab\) \|\| 'schedule', section: sec \|\| null \}/.test(fn)
      /* ⛔ THE DRIVEN HALF IS NAMED, so "it is checked elsewhere" is a fact the reader can follow
       * rather than a claim this file is making about itself. */
      && /resolveManageLocation\('schedule', id\)/.test(read('scripts/social-posts.cjs'))
  })())
  t('🔴 …and the page resolves AT THE URL, so nothing below ever sees a legacy id',
    /const moved = resolveManageLocation\(tabParam, sectionParam\)/.test(MANAGE)
    && /setSocialSection\(moved\.section as SocialSection\)/.test(MANAGE))
  /* ⛔ AND THE TYPES ARE DECLARED ONCE. Two copies is how a section comes to exist in a pill bar and
   * not in the link builder — the exact shape of the bug `lib/manage-links.ts` was created for. */
  t('⛔ `ScheduleSection` and `SocialSection` are declared in the link builder and imported',
    /export type ScheduleSection = 'events' \| 'event-types'/.test(LINKS)
    && /export type SocialSection = 'create' \| 'designs' \| 'locations'/.test(LINKS)
    && !/^type ScheduleSection =/m.test(codeOf(MANAGE))
    && !/^type SocialSection =/m.test(codeOf(MANAGE))
    && /type ScheduleSection,/.test(MANAGE) && /type SocialSection,/.test(MANAGE))

  /* ⛔ AND NOTHING STILL CALLS `onSectionChange` WITH A SECTION THAT NO LONGER EXISTS. ⚠️ SCHEDULE'S
   * LIVE SECTIONS ARE NOW EXACTLY ITS TWO PILLS — `posts` and `designs` belong to another tab and are
   * reached through `onOpenSocial`, which is a different prop with a different type. */
  /* ══ ⚠️ THERE ARE NO LITERAL CALLS LEFT TO CHECK, AND THAT IS THE STRONGER STATE (7 October 2026) ══
   * This read every `onSectionChange('x')` in the page and asserted `x` was live. The three literal
   * calls it was written for have all gone: two were `'posts'`/`'designs'`, which belong to another tab
   * and travel through `onOpenSocial` — a different prop with a different type — and the third was the
   * gate's URL tidy-up, which no longer exists.
   * 🔴 SO THE CLAIM BECOMES THE ONE THAT MAKES A WRONG ID **UNTYPEABLE**: the only call passes
   * `sec.id` straight out of `SCHEDULE_SECTIONS`, whose entries are typed `ScheduleSection`. ⛔ AND THE
   * ABSENCE IS ASSERTED BESIDE IT, because a pure absence proves nothing on its own — a deleted pill
   * row would satisfy it. */
  t('⛔ the only onSectionChange call is the pill row, passing a TYPED id', (() => {
    const literals = [...MANAGE.matchAll(/onSectionChange\('([^']+)'\)/g)].map(m => m[1])
    return literals.length === 0
      && /onClick=\{\(\) => onSectionChange\(sec\.id\)\}/.test(MANAGE)
      /* ⚠️ **ONE** CALL IN THE WHOLE PAGE. The prop pass-through (`onSectionChange={setScheduleSection}`)
       * and the type (`onSectionChange: (s: …) => void`) are not calls and do not match this. */
      && (codeOf(MANAGE).match(/onSectionChange\(/g) || []).length === 1
      && /const SCHEDULE_SECTIONS: \{ id: ScheduleSection; label: string \}\[\]/.test(MANAGE)
      && /onSectionChange: \(s: ScheduleSection\) => void/.test(MANAGE)
  })())
  /* 🔴 AND THE PANE IS MOUNTED ON THE **TAB**, ONCE. ⚠️ IT LEFT ScheduleTab ENTIRELY: it used to be
   * behind `shownSection === 'posts' || 'designs'` inside that component, and the gate that derived
   * `shownSection` moved up to the tab filter with it. */
  t('🔴 the social pane is mounted at page level, on the active TAB, exactly once',
    /\{activeTab === 'social' && truck && \(/.test(MANAGE)
    && (MANAGE.match(/<SocialPostsPane /g) || []).length === 1
    /* ⛔ AND NOT INSIDE ScheduleTab ANY MORE — `codeOf` first, because the tombstone there names it. */
    && !/shownSection === 'posts'/.test(codeOf(MANAGE)))
  /* ⛔ AND THE PLACES TAB IS GONE — the file, the mount and the import. */
  t('⛔ `PlacesTab` is deleted: no file, no mount, no import',
    !exists('components/manage/PlacesTab.tsx')
    && !/<PlacesTab /.test(codeOf(MANAGE))
    && !/from '@\/components\/manage\/PlacesTab'/.test(codeOf(MANAGE)))
}

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
    /const TAB_FOR_SECTION: Record<ScheduleSection \| SocialSection \| MenuSection, ManageTab>/.test(LINKS)
    && !/manageSectionHref\(\s*section[^)]*tab:/.test(LINKS))
  /* ══ 🔴 THE MAP'S CONTENTS INVERTED ON 7 OCTOBER, AND THE CLAIM INVERTED WITH THEM ═══════════════
   * ⛔ IT USED TO ASSERT `places: 'schedule'` AND `weekly: 'schedule'` — proof that a link naming a
   * retired id carried its tab. The four retired ids are now deliberately **ABSENT**:
   * `resolveManageLocation` exists to READ them, and a builder that could still emit one would quietly
   * keep them alive.
   * 🔴 SO THE MAP MUST HOLD THE LIVE SECTIONS OF ALL THREE TABS AND NONE OF THE RETIRED SCHEDULE IDS.
   * ⚠️ `designs` IS IN IT AS A **SOCIAL** section, which is its live meaning; the legacy Schedule
   * meaning lives in `LEGACY_SCHEDULE_SECTION` and is read-only. */
  t('🔴 …and every LIVE section maps to a tab — and no retired one does', (() => {
    const map = LINKS.slice(LINKS.indexOf('const TAB_FOR_SECTION'), LINKS.indexOf('/* ⛔ THE FOUR RETIRED'))
    const code = codeOf(map)
    return /events: 'schedule', 'event-types': 'schedule',/.test(code)
      && /create: 'social', designs: 'social', locations: 'social',/.test(code)
      && /items: 'menu', capacity: 'menu', extras: 'menu', deals: 'menu',/.test(code)
      /* ⛔ `codeOf` FIRST — the note directly under the map spells out "`?section=posts`" as prose, and
       * a pure-absence test satisfied by its own explanation is the failure mode this file's `codeOf`
       * was written for. */
      && !/\bposts:/.test(code) && !/\bweekly:/.test(code) && !/\bplaces:/.test(code)
  })())
  t('🔴 …and it emits BOTH params, every time',
    /const qs = `\?tab=\$\{tab\}&section=\$\{section\}`/.test(LINKS))
  /* 🔴 THE TWO LINKS THAT WERE BROKEN, BY NAME. Asserted as "calls the builder", not as "contains the
   * right string" — the string is the builder's business and this is about who assembles it. */
  /* ⚠️ THE "Text positions" LINK IS GONE AS A LINK (6 October 2026). The place design editor opens the
   * existing editor IN PLACE — `EventSetupScreen` focused on one place — so there is nothing to link
   * to. What survives from that bug is the rule, asserted below: no bare `?section=` anywhere. */
  /* ══ ⚠️ SOCIAL POSTS HAS NO SECTION LINK LEFT — 10 OCTOBER 2026 ══════════════════════════════════
   * ⛔ IT WAS "See all upcoming events", under the single event half's picker, and Dominic asked for it
   * to go in the same edit that made the picker a dropdown: the dropdown already names every upcoming
   * event, so a link to the diary beneath it was a second way to the same list.
   * 🔴 THE RULE THIS CHECK EXISTED FOR IS UNTOUCHED AND IS THE ONE BELOW: **no file hand-writes a
   * section link**, proved over the whole tree. ⚠️ ASSERTED AS AN ABSENCE RATHER THAN DELETED, so
   * re-adding a link here without the builder fails rather than passing quietly. */
  t('⚠️ Social posts writes no section link at all, by hand or otherwise',
    !/\?section=/.test(codeOf(SOCIAL))
    && !/manageSectionHref\(/.test(codeOf(SOCIAL)))
  /* ⚠️ THE SINGLE-EVENT POST'S "Places" POINTER IS GONE (6 October 2026) — see §6. What replaced the
   * claim is stronger: NO file hand-writes a section link, which the sweep below proves over the whole
   * tree rather than over the one file that happened to have the bug. */
  t('⛔ …and no component hand-writes a section link at all', (() => {
    const hits = []
    for (const f of walk('app').concat(walk('components'))) {
      if (/href=["'{`]\s*["'`]?\?section=/.test(codeOf(read(f)))) hits.push(f)
    }
    return hits.length === 0
  })())
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
    /* ⚠️ `isSocialSection` JOINED THE EXPRESSION ON 7 OCTOBER, and it had to: `?section=places` now
     * implies the SOCIAL tab, so without it a live bookmark would select that tab and then be
     * overridden by the trial default — the exact bug this ref exists to prevent, moved one tab over. */
    t('⛔ …and a bare `?section=` counts as asking for a tab, on any of the three tabs',
      /urlAskedForTab\.current =\s*\n\s*!!\(tabParam && \(allTabIds\.includes\(tabParam as Tab\) \|\| LEGACY_TAB_TO_MENU_SECTION\[tabParam\]\)\)\s*\n\s*\|\| isScheduleSection\(sectionParam\) \|\| isSocialSection\(sectionParam\) \|\| isMenuSection\(sectionParam\)/
        .test(code)
      /* 🔴 AND `isSocialSection` ACCEPTS THE RETIRED IDS, which is what makes the clause above true for
       * `?section=places`. Its Schedule sibling must NOT — a Schedule guard that said yes to `places`
       * would select a Schedule section no pane renders. */
      && /const isSocialSection = \(v: unknown\): v is SocialSection => canonicalSocialSection\(v\) !== null/.test(code)
      && /const isScheduleSection = \(v: unknown\): v is ScheduleSection =>\s*\n\s*canonicalScheduleSection\(v\) !== null/.test(code))
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
  /* ══ ⛔ RE-AIMED THREE TIMES, AND THE THIRD TIME THE **CONTROL** MOVED (6 October 2026) ═══════════
   * V1 asserted the literal `Automatic (${automaticName} — last used here)` while `automaticName`'s
   * only caller was `() => 'Standard'` — a hardcoded word. It passed while the screen told a wedding
   * venue that Automatic meant Standard. V2 asserted the label came from the server. V3 asserted the
   * option was gone and the control was a pill row on the Places tab.
   * ⛔ THE PLACES TAB WAS DELETED ON 6 OCTOBER. A place's usual type is set from ADD EVENT now, with a
   * tick under the type pills — at the moment an operator is actually choosing a type for that place,
   * which is the only moment the question has ever made sense.
   * 🔴 WHAT SURVIVES UNCHANGED IS THE STORAGE AND THE READ ORDER, and that is most of this section.
   * ⚠️ "Automatic" MUST STILL APPEAR NOWHERE IN THE CODE — the word named a state an operator could be
   * in, and no screen may reintroduce it. `codeOf` strips the prose that explains why. */
  t('⛔ the word "Automatic" appears nowhere in the Add event page\'s code',
    !/Automatic/.test(codeOf(MANAGE)))
  t('🔴 …nor in the shared list or detail', !/Automatic/.test(codeOf(SHARED)))
  t('⛔ …and `PLACE_TYPE_HELPER` went with the pill row it explained',
    !/PLACE_TYPE_HELPER/.test(codeOf(MANAGE)) && !/PLACE_TYPE_HELPER/.test(codeOf(SHARED)))

  /* ══ 🔴 "Always use <Type> at <Place>" — THE ONLY THING THAT WRITES A PLACE FROM ADD EVENT ════════
   * ⛔ UNTICKED BY DEFAULT, AND DERIVED DEAD WHEN IT IS NOT OFFERED. Both halves matter: a pre-ticked
   * box would turn "different this once" into "for ever", and a tick left over from one place would
   * otherwise write the WRONG place's type when the operator picked another. */
  t('🔴 the tick is offered only when the chosen type differs from the pre-selected one',
    /const showAlwaysUse = !!pickedPlace\s*\n\s*&& placeTypeChoices\.length > 0\s*\n\s*&& \(eventTypeId \?\? null\) !== \(usualForPlace\.typeId \?\? null\)/.test(codeOf(MANAGE)))
  t('⛔ …and it is DERIVED dead when not offered, not cleared by an effect',
    /const alwaysUseActive = alwaysUseType && showAlwaysUse/.test(codeOf(MANAGE))
    && /checked=\{alwaysUseActive\}/.test(MANAGE)
    && /if \(alwaysUseActive && pickedPlace\) \{/.test(codeOf(MANAGE)))
  t('⛔ …and it starts UNTICKED',
    /const \[alwaysUseType, setAlwaysUseType\] = useState\(false\)/.test(codeOf(MANAGE)))
  /* ⛔ THE WRITE IS **AFTER** THE EVENT SAVE, AND ITS FAILURE IS NOT THE SAVE'S. The event is what the
   * operator came to do; the place's usual type is a convenience ticked on the way past. */
  t('🔴 the place write happens AFTER the event save, in the success path', (() => {
    const code = codeOf(MANAGE)
    const save = code.indexOf("await api('upsert_event'")
    const write = code.indexOf("await api('sg_place_usual_type'")
    return save > 0 && write > save
  })())
  t('⛔ …and a failed place write never fails the event save',
    /Event saved\. \$\{pickedPlace\.name\}’s usual type was not/.test(MANAGE))
  /* ⚠️ `'standard'` IS THE LITERAL ON THE WIRE for Standard — it has no `event_types` row. */
  t('⛔ …and Standard goes on the wire as the literal, never as a uuid',
    /typeId: chosenPrivate \? privateTypeId : \(eventTypeId \?\? 'standard'\)/.test(codeOf(MANAGE)))
  /* 🔴 AND WITHOUT THE TICK, ADD EVENT STILL WRITES NOTHING TO A PLACE. This is the claim the Places
   * tab's own harness made and it has to survive the move: `sg_place_usual_type` has exactly ONE
   * caller in the page, and it is inside the ticked branch. */
  t('🔴 `sg_place_usual_type` has exactly one caller, inside the ticked branch',
    (codeOf(MANAGE).match(/sg_place_usual_type/g) || []).length === 1)

  t('🔴 …and `sg_places` still resolves the rule\'s answer with the same function Add event uses',
    /readPlaceTypeHistory\(supabase, truck\.id, placeForEvent\)/.test(codeOf(ROUTE))
    && /usual_automatic_type_id: autoOk/.test(codeOf(ROUTE)))

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
    /* ⚠️ THE READER IS THE SUGGESTION ROW'S TYPE LABEL NOW — same expression, same order, different
     * screen. It is the one place in the client that resolves a place's type, so it has to match the
     * server or a row would be labelled one thing and pre-select another. */
    t('🔴 the client reads the boolean FIRST, matching the server',
      /p\.usual_type_is_standard === true \? null\s*\n\s*: p\.usual_event_type_id \?\? p\.usual_automatic_type_id \?\? null/.test(MANAGE))
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

  /* ⚠️ A PRO TRUCK SEES STANDARD AND PRIVATE ONLY — custom types are Max. ⛔ THE FILTER IS THE ADD
   * EVENT PILL ROW'S NOW (`EventTypeSelect`), which is the one control that offers types to this form;
   * it filters on the two feature KEYS, never on a plan name. */
  t('⚠️ the type pills are filtered by feature keys, not by the plan name', (() => {
    /* 🔴 AND THE FILTER IS THE **SERVER'S**, which is stronger than a client one and is why this is
     * aimed at the route: `/api/event-types` `load` decides what a truck may have from
     * `canAccess(…, 'private_events')` and `canAccess(…, 'event_types')`, and the pill row draws what
     * it is sent. A Pro truck is not sent custom types at all. */
    const et = codeOf(read('app/api/event-types/route.ts'))
    return /canAccess\(truck\.plan as never, 'private_events'/.test(et)
      && /canPrivate: privateAllowed\(truck\)/.test(et)
      && !/plan === 'pro'/.test(et) && !/plan === 'max'/.test(et)
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE POST PICTURE — ONE DESIGN EDITOR, AND `place_pictures` STILL READ BY NOTHING
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · the post picture lives in Social posts › Designs, and place_pictures is still unread')

{
  /* ══ ⛔ THIS SECTION HAS BEEN RE-AIMED TWICE IN TWO DAYS, AND BOTH TIMES THE SUBJECT MOVED ════════
   * V1 proved the extra-pictures pane was SAFE — eleven checks, all passing, on a feature nothing
   * read. V2 proved it was DELETED and that "Picture for posts" uploaded in place on the Places tab.
   * ⛔ THE PLACES TAB IS GONE TOO. The post picture is edited in Social posts › Designs, which is where
   * the design it affects lives, and the editor is `EventSetupScreen` focused on one place.
   * 🔴 THE TWO CLAIMS THAT HAVE SURVIVED EVERY MOVE, because they are about the DATA and not a screen:
   *   • `public.place_pictures` is still in the database and is read by NOTHING;
   *   • the post picture goes through the EXISTING upload flow, with the server's own shape check. */
  t('⛔ the table is still in the database — the migration is NOT reverted',
    /create table if not exists public\.place_pictures/.test(SQL))
  /* ══ ⛔ RE-AIMED 18 OCTOBER 2026, AND THIS ONE IS A **REVERSAL**, NOT A MOVE ═══════════════════
   *
   * It asserted that NOTHING in `app/`, `lib/` or `components/` read `place_pictures`, and the table's
   * own comment said the same: *"THEY DO NOT AFFECT POSTS."* Part 3 makes that table the place picture
   * LIBRARY, so it is read by the renderer's caller, by the Designs box and by the pictures page. The
   * old assertion was true of a feature that existed for one day; keeping it would have blocked the
   * work it was written to protect the absence of.
   *
   * 🔴 WHAT REPLACES IT IS THE SAME INSTINCT, AIMED AT WHAT STILL MATTERS: the table is read in exactly
   * ONE server file, and NO component touches it directly. A browser must never be able to enumerate a
   * truck's pictures, and a second reader in `lib/` would be a second opinion on what a place's Main
   * picture is. ⚠️ The migration replaces the table's comment for the same reason.
   */
  t('⛔ …and it is read in exactly ONE server file, and by NO component', (() => {
    const inLib = walk('lib').filter(f => /place_pictures/.test(codeOf(read(f))))
    const inApp = walk('app').filter(f => /place_pictures/.test(codeOf(read(f))))
    const inComponents = walk('components').filter(f => /place_pictures/.test(codeOf(read(f))))
    return inLib.length === 0
      && inApp.length === 1 && inApp[0] === 'app/api/weekly-post/route.ts'
      && inComponents.length === 0
  })())
  /* ⚠️ THE ABSENCE IS CHECKED ON THE `comment on table` STATEMENT ALONE, NOT ON THE WHOLE FILE. The
   * 20261018 migration's header QUOTES the sentence it is replacing, in order to explain why — and a
   * whole-file absence test failed on that quotation. The seventh time this project has met "a comment
   * interfered with a check on code", and the first where the comment was in SQL. */
  t('🔴 …and the table\'s comment no longer claims the pictures do not affect posts', (() => {
    const sql = read('supabase/migrations/20261018_place_picture_library.sql')
    const i = sql.indexOf('comment on table public.place_pictures is')
    /* ⛔ THE END ANCHOR IS THE CLOSING QUOTE **AND** THE SEMICOLON, NOT THE SEMICOLON ALONE. The
     * comment's own prose contains one — "One row per picture; at most one is_main per place" — so a
     * bare `;` cut the statement off after seventy characters and the assertion failed on correct SQL.
     * ⚠️ The project's own lesson about slices needing a bounded, UNAMBIGUOUS end anchor, met again. */
    const end = i < 0 ? -1 : sql.indexOf("';", i)
    const stmt = i < 0 || end < 0 ? '' : sql.slice(i, end)
    return /THEY DO AFFECT POSTS AS OF 20261018/.test(stmt)
      && !/THEY DO NOT AFFECT POSTS/.test(stmt)
  })())
  t('⛔ …and the five routes that did are still gone from the manage route',
    ['sg_place_pictures', 'sg_place_picture_url', 'sg_place_picture_save',
      'sg_place_picture_remove', 'sg_place_events']
      .every(a => !new RegExp(`action === '${a}'`).test(codeOf(ROUTE))))
  t('🔴 …and the route\'s tombstone still warns against dropping it',
    /DO NOT "TIDY UP" THE TABLE WITHOUT ASKING/.test(ROUTE))

  /* ══ 🔴 ONE DRAG SURFACE IN THIS PRODUCT ════════════════════════════════════════════════════════
   * ⛔ THE REASON IS ON RECORD: the editor's pointer handling took three fixes to get right on touch.
   * A second one would be a second set of those bugs, and the place editor is a PAGE AROUND the shared
   * editor rather than a new one.
   * ⚠️ RE-AIMED 6 October 2026. It used to require the one definition to be in `WeeklyPost.tsx` — a
   * file about the weekly post, which exported the drag surface for every design screen in the
   * product. It is `components/manage/DraggableBox.tsx` now, because with ONE shared editor there is
   * no owning screen. The COUNT, which is the thing that matters, is unchanged. */
  t('🔴 there is exactly ONE draggable-box implementation in the product', (() => {
    const defs = walk('components').concat(walk('lib'))
      .filter(f => /export function DraggableBox/.test(codeOf(read(f))))
    return defs.length === 1 && defs[0] === 'components/manage/DraggableBox.tsx'
  })())
  /* ══ ⛔ THE PER-LOCATION EDITOR IS GONE — 7 October 2026 ════════════════════════════════════════
   * `PlaceDesignPage` was `EventSetupScreen` focused on one location, reached from a quiet link at the
   * bottom of the pictures page. The brief removes that link, so the editor has no door and went with
   * it. ⛔ THE DATA AND THE RENDERING ARE UNTOUCHED: `truck_places.event_layout` is still read by
   * `eventPostContext`, still validated against that location's own picture, and still preferred over
   * the standard positions — so every location that HAS its own keeps rendering as it does. What a
   * truck can no longer do is create one.
   * 🔴 THE CLAIM THIS CHECK EXISTED FOR IS UNCHANGED AND STILL ASSERTED: there is ONE drag surface in
   * the product (above), and the social screens do not draw a second one. The focused mode of
   * `EventSetupScreen` survives for the **Standard** design, which Designs opens. */
  t('⛔ …and the social screens mount the shared editor, never a second drag surface',
    /<EventSetupScreen token=\{token\} onlyStandard onCancel=\{back\}\s*\n\s*onDirtyChange=\{setEditorDirty\} onSaver=/.test(SOCIAL)
    && !/DraggableBox/.test(codeOf(SOCIAL))
    /* ⛔ AND THE PER-LOCATION MODE IS NOT MOUNTED ANYWHERE — `onlyPlaceId` still EXISTS on the screen
     * (the setup wizard's own flow uses the prop's siblings) but nothing passes it. ⚠️ Asserted over
     * the whole tree rather than over this one file, because "nothing mounts it" is a tree-wide claim. */
    && (() => {
      const callers = walk('components').concat(walk('app'))
        .filter(f => /onlyPlaceId=\{/.test(codeOf(read(f))))
      return callers.length === 0
    })())

  /* 🔴 THE UPLOAD IS THE EXISTING THREE-CALL FLOW, and it adds NO action to the route. */
  t('🔴 the upload is upload_url → PUT → confirm_upload, with which=place', (() => {
    const ep = codeOf(read('components/manage/EventPost.tsx'))
    return /action: 'upload_url'/.test(ep) && /which/.test(ep)
      && /action: 'confirm_upload'/.test(ep)
  })())
  t('⛔ the shape check is the SERVER\'s, against the standard design',
    /checkAspect\(check\.info\.width, check\.info\.height, row\.event_bg_width, row\.event_bg_height\)/
      .test(codeOf(read('app/api/weekly-post/route.ts'))))
  /* ⛔ AND "Use Standard design here instead" IS THE REMOVE, CONFIRMED. It is the one irreversible act
   * on that page, and it has ONE control — the editor's own "Remove this place's design" panel is
   * suppressed in the focused mode so the two cannot carry different confirms. */
  /* ⚠️ THE SUPPRESSION MOVED WITH THE PANEL. The editor's own "Remove this place's design" is now the
   * `footer` prop that `EventSetupScreen` passes in, and the condition that suppresses it in the
   * focused mode is the same one, in the same file, guarding the same markup. */
  /* ══ ⛔ "Use Standard design here instead" WENT WITH THE PER-LOCATION EDITOR (7 October 2026) ══════
   * It was that page's one irreversible act, and the claim was that it had exactly ONE control.
   * 🔴 THE EQUIVALENT ACT IS NOW "Remove" ON A SLOT, AND IT IS **NOT** IRREVERSIBLE — which is a better
   * answer than a confirm. The slot is nulled; the `place_pictures` row and the stored object both
   * survive, so pointing it back costs one press. ⚠️ IT IS STILL CONFIRMED, and the confirm SAYS the
   * image is kept — a truck told "Remove" without that sentence has every reason to think otherwise. */
  t('⛔ removing a location\'s image is confirmed, says the image is kept, and deletes nothing',
    /window\.confirm\(slotRemoveConfirm\(/.test(SOCIAL)
    && /It stops being used\. The image itself is kept\./.test(read('lib/copy/socialPosts.ts'))
    && /api\('place_slot_clear', \{ placeId: selected\.id, slot: 'event' \}\)/.test(SOCIAL)
    && /api\('place_slot_clear', \{ placeId: selected\.id, slot: 'weekly' \}\)/.test(SOCIAL)
    /* ⛔ AND THE OLD IRREVERSIBLE PATH IS NOT CALLED FROM ANY SCREEN. `event_remove_place_design` still
     * exists on the route — it is what the setup wizard's own flow uses — but the social screens do
     * not reach it. ⚠️ `codeOf` first: the tombstones name it in prose. */
    && !/action: 'event_remove_place_design'/.test(codeOf(SOCIAL)))

  /* ══ ⛔ NO PER-PLACE `event_load` LOOP FOR THUMBNAILS ════════════════════════════════════════════
   * The Designs list draws a thumbnail for every place, and the only action that signed one was
   * `event_load` — which also reads up to 200 events in each direction. One call per place would have
   * been twenty-one copies of that read to draw twenty-one 64px squares.
   * 🔴 ASSERTED AS AN ABSENCE AND A PRESENCE: the page never calls `event_load`, and it does call the
   * one read that returns every signed URL together. */
  t('⛔ the Social posts page never calls `event_load`', !/event_load/.test(codeOf(SOCIAL)))
  t('🔴 …it calls `social_overview`, which signs every place picture in ONE read',
    /action: 'social_overview'/.test(codeOf(SOCIAL))
    && /action === 'social_overview'/.test(codeOf(read('app/api/weekly-post/route.ts'))))
  t('⛔ …and that action is READ-ONLY — no insert, update, upsert or delete', (() => {
    const route = codeOf(read('app/api/weekly-post/route.ts'))
    const i = route.indexOf("action === 'social_overview'")
    const j = route.indexOf("action === 'upload_url'", i)
    const body = route.slice(i, j)
    return i > 0 && j > i
      && !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.remove\(/.test(body)
  })())
}

// 4 · HIDE, RESTORE, AND THE ONE PLACE LIST
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · hiding a place is in Add event now, and there is still only one list')

{
  /* ══ 🔴 ONE LIST, ONE DETAIL, ONE HOOK — AND NOW ONE CALLER ═════════════════════════════════════
   * This asserted that the Places TAB imported the shared pieces rather than copying them. The tab is
   * gone, so the claim is stronger and simpler: `PlaceList`, `PlaceDetail` and `usePlaces` have ONE
   * screen between them — "Tidy up places" inside Add event — and that is where the five fields live.
   * ⛔ THE FIVE FIELDS HAVE NOWHERE ELSE. If a second editor of `truck_places`' five columns ever
   * appears, this is the check that should fail. */
  t('🔴 `TidyUpPlaces` still exists and is still mounted',
    /export function TidyUpPlaces/.test(SHARED) && /<TidyUpPlaces/.test(MANAGE))
  t('🔴 …and it edits all five fields, with the detail KEYED by place id', (() => {
    const detail = SHARED.slice(SHARED.indexOf('export function PlaceDetail'),
      SHARED.indexOf('export function TidyUpPlaces'))
    /* ⚠️ "Full name" REPLACED "Short name" IN THIS LIST (6 October 2026) — the two name labels were
     * swapped, and WHICH LABEL IS BOUND TO WHICH COLUMN is asserted on its own below.
     * ⚠️ AND "Name on posts" IS "Venue name" FROM 9 OCTOBER, A LABEL ONLY. The old wording said where
     * the value GOES rather than what it IS, and with the social screen's own copy of the field removed
     * this card is the one editor again — so it has to name the thing. "Venue" is the poster's own item
     * name and "Area" is the field below it. */
    const five = ['Full name', 'Venue name', 'Address', 'Area', 'Postcode']
      .every(f => detail.includes(`label="${f}"`))
    /* ⛔ THE `key` IS NOT DECORATION. `PlaceDetail` holds the five fields as LOCAL DRAFT STATE and
     * saves them ON BLUR, so without a remount per place the pane shows the previous place's values
     * and blurring writes them onto the current one. That was a real defect on the deleted tab. */
    return five && /<PlaceDetail key=\{selected\.id\}/.test(SHARED)
  })())
  /* ══ ⛔ THE TWO NAME LABELS, AND WHICH COLUMN EACH ONE WRITES (6 October 2026) ═══════════════════
   * `name` was labelled "Name on posts" and it is NOT the field a post prints: `locationName()` reads
   * `short_name` FIRST and falls back to `name`. So filling in "Short name" silently stopped the poster
   * printing the field called "Name on posts" — a label that was a lie about the one thing it names.
   * 🔴 ASSERTED AS A BINDING, NOT AS A PRESENCE. Both labels still exist either way round; what this
   * pins is that each one sits on the input whose `onBlur` writes the matching column, and that the
   * renderer still prefers the one now called "Name on posts". */
  t('🔴 "Name on posts" writes `short_name` — the column the renderer actually prints', (() => {
    const detail = SHARED.slice(SHARED.indexOf('export function PlaceDetail'),
      SHARED.indexOf('export function TidyUpPlaces'))
    const bound = (label, field) => new RegExp(
      `label="${label}"[^>]*?onBlur=\\{\\(\\) => saveField\\('${field}'`, 's').test(detail)
    return bound('Venue name', 'short_name')
      && bound('Full name', 'name')
      /* ⛔ AND THE OLD LABEL IS GONE, so "renamed" cannot pass while both exist. */
      && !detail.includes('label="Name on posts"')
      /* ⛔ AND THE RENDERER STILL PREFERS IT. If that ever changes, these labels become wrong again. */
      && /const short = String\(place\?\.short_name \?\? ''\)\.trim\(\)\s*\n\s*if \(short\) return short/
        .test(read('lib/weekly-post/week-data.ts'))
  })())
  t('⚠️ …and "Venue name" says what blank means',
    /hint="Leave blank to use the full name\."/.test(SHARED))
  /* ══ ⛔ AND THIS SCREEN IS THE **ONLY** WRITER AGAIN — 9 OCTOBER 2026 ════════════════════════════
   * The field was copied to the Location settings pane on 7 October, writing the same column through
   * the same action, and the claim then was that one writer meant the two screens could not disagree.
   * 🔴 THAT WAS TRUE OF `short_name` AND FALSE OF THE PAIR. This card edits the name AND THE TOWN, side
   * by side; the social pane edited only the name. A location's name and its town are one fact about
   * the schedule, so the second screen was a way to change half of it and leave the other half as it
   * was — and the poster then prints a mismatch that neither screen can show the operator.
   * ⚠️ SO THE COPY WENT AND THIS CARD IS THE ONE PLACE AGAIN. Asserted as an absence over the social
   * screen, with the writer above unchanged. */
  t('⛔ …and the social screen no longer writes it — this card is the one place again',
    !/Name on posts/.test(codeOf(SOCIAL))
    && !/short_name: value\.trim\(\)/.test(codeOf(SOCIAL))
    /* ⚠️ `manageApi` WAS DESTRUCTURED FOR THAT ONE FIELD and is not any more, which is the structural
     * half of the same fact: the social screen has no door to this action left to walk through. */
    && !/manageApi\('sg_upsert_place'/.test(codeOf(SOCIAL))
    /* 🔴 AND THE SOCIAL SCREEN SAYS WHERE THE NAME IS EDITED rather than going quiet. The note names
     * the real path to this card, so removing the field does not leave an operator hunting. */
    && /data-name-from-schedule/.test(SOCIAL)
    /* ⚠️ "area", NOT "town" (9 October 2026) — the same rename as the editor's item, for the same
     * reason: half the venues on this product are in a village, and this card calls the field "Area". */
    && /'Name and area come from your schedule\. Edit them in Schedule › Events › Add event › Tidy up places\.'/
      .test(read('lib/copy/socialPosts.ts')))

  t('⛔ …and nothing else defines a place list, detail or loader', (() => {
    const owners = walk('components').concat(walk('app'))
      .filter(f => /export function PlaceList|export function PlaceDetail|export function usePlaces/
        .test(codeOf(read(f))))
    return owners.length === 1 && owners[0] === 'components/manage/SchedulePlaces.tsx'
  })())

  /* 🔴 HIDE AND RESTORE GO THROUGH `sg_upsert_place` — the action Tidy up has always used. ⛔ Restoring
   * a merged place also un-merges it, or it would come back showing none of its own events. */
  t('🔴 hide/restore is `sg_upsert_place` with `is_hidden`',
    /is_hidden: true/.test(SHARED) && /is_hidden: false/.test(SHARED)
    && /sg_upsert_place/.test(SHARED))
  t('⛔ …and restoring a merged place clears `merged_into_id` too', (() => {
    const fn = codeOf(ROUTE).slice(codeOf(ROUTE).indexOf("action === 'sg_upsert_place'"))
    return /merged_into_id = null|merged_into_id: null/.test(fn)
  })())

  /* ══ 🔴 HIDING A PLACE IS ON THE SUGGESTION ROW NOW (6 October 2026) ═════════════════════════════
   * It was a button on a tab, then a section at the bottom of that tab's list, and the tab is gone.
   * ⛔ IT BELONGS WHERE AN OPERATOR MEETS THE PLACE — typing its name into Add event — which is the
   * moment they discover a pitch they do not want offered.
   * 🔴 THE `×` IS INSIDE THE ROW'S OWN CLICK TARGET, so both `preventDefault` and `stopPropagation`
   * are required: without them, hiding a place would also PICK it and close the step. */
  t('🔴 each suggestion row has a `×` with an aria-label',
    /aria-label="Hide this place"/.test(MANAGE))
  t('⛔ …and pressing it cannot also select the place',
    /e\.preventDefault\(\); e\.stopPropagation\(\); void hidePlace\(pl, true\)/.test(MANAGE))
  t('🔴 …and it calls the EXISTING action, optimistically, with a rollback',
    /await api\('sg_upsert_place', \{ id: pl\.id, is_hidden: hide \}\)/.test(codeOf(MANAGE))
    && /placesCtl\.patchLocal\(pl\.id, \{ is_hidden: hide \}\)/.test(codeOf(MANAGE))
    && /placesCtl\.patchLocal\(pl\.id, \{ is_hidden: !hide \}\)/.test(codeOf(MANAGE)))

  /* ⛔ A HIDDEN PLACE IS NEVER AN ORDINARY SUGGESTION. That is what hiding it meant, and the two groups
   * are built from one filter so they cannot overlap. */
  t('⛔ hidden places are a separate group and are never in `live`',
    /live: rows\.filter\(p => !p\.is_hidden\)/.test(MANAGE)
    && /hidden: rows\.filter\(p => p\.is_hidden\)/.test(MANAGE))
  t('🔴 …and the hidden group is offered only when some MATCH what was typed',
    /\{placeSuggestions\.hidden\.length > 0 && !hiddenShown && \(/.test(MANAGE)
    && /hidden place\{placeSuggestions\.hidden\.length === 1 \? '' : 's'\} match · Show hidden/.test(MANAGE))
  t('⚠️ …and "Show again" restores through the same action',
    /Show again/.test(MANAGE) && /void hidePlace\(pl, false\)/.test(MANAGE))
  /* ⚠️ "Show hidden" IS PER-OPEN. Hidden places are somewhere to go and get one back, not a view to
   * work in — the same reasoning the deleted tab's own section carried. */
  t('⚠️ "Show hidden" is per-open state, not remembered',
    /const \[hiddenShown, setHiddenShown\] = useState\(false\)/.test(codeOf(MANAGE)))

  /* 🔴 AND THE ROW SHOWS THE PLACE'S TYPE — a colour dot and a name, or a purple lock and "Private",
   * in the Event types grid's own colours. The one pitch still on Private from a wedding six months
   * ago is visible BEFORE it is chosen. */
  t('🔴 each suggestion row shows the place\'s usual type',
    /\{placeTypeLabel\(pl\)\}/.test(MANAGE)
    && /const placeTypeLabel = useCallback/.test(codeOf(MANAGE))
    && /🔒/.test(MANAGE) && /text-purple-700/.test(MANAGE))
  t('⛔ …in the GRID\'s colours, from the grid\'s own index',
    /colourFor\(i\)/.test(codeOf(MANAGE)) && /STANDARD_COLOUR/.test(codeOf(MANAGE))
    && /from '@\/lib\/event-types\/types'/.test(MANAGE))
  /* ⚠️ AN ID THAT IS NOT IN `placeTypeChoices` RENDERS NO LABEL — never "Standard", which would be a
   * lie: Standard is `null` and this place carries an id. */
  t('⚠️ …and an unknown type id renders NO label rather than a wrong one',
    /const i = placeTypeChoices\.findIndex\(t => t\.id === id\)\s*\n\s*if \(i < 0\) return null/.test(MANAGE))
  /* ⚠️ THE NAME TRUNCATES AND THE TYPE DOES NOT — a half-written type name is worse than a truncated
   * venue, which has its own sub-line underneath. Measured in scripts/schedule-places-render.cjs. */
  t('⚠️ the name truncates and the type label does not',
    /<span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">\{pl\.name\}<\/span>/.test(MANAGE))
}

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
  /* ══ ⛔ RE-AIMED 18 OCTOBER 2026 — IT WAS VACUOUS AND IT IS NOT ANY MORE ═══════════════════════
   * It asserted that nothing touched `place_pictures` at all, which made "nothing upserts it" true for
   * free. Part 3 reads and writes it, so the claim has to be the REAL one the 20261013 trap is about:
   * ⛔ `place_pictures_one_main_per_place_uidx` IS **PARTIAL**, so it can never be an `ON CONFLICT`
   * target — a partial index raises 42P10 if one is attempted. "Make main" is two UPDATE statements,
   * which is exactly why a partial index is the right guard here, and this is what keeps it so. */
  t('⛔ nothing upserts onto the PARTIAL one-main index — it is a guard, never a conflict target', (() => {
    const route = codeOf(read('app/api/weekly-post/route.ts'))
    /* ⚠️ EVERY `upsert` ON THIS TABLE IS LISTED AND EACH ONE'S TARGET IS NAMED. There is one, and it
     * targets `path` — the FULL unique index the 20261015 migration created for exactly this. */
    /* ══ ⚠️ A **WINDOW**, NOT A LAZY `[\s\S]{0,n}?\)` ═══════════════════════════════════════════════
     * The lazy version stopped at the first `)` in the payload — `String(body.fileName ?? '')` — so the
     * second upsert's match ended before its `onConflict` and this check failed on correct code. ⛔ A
     * NON-GREEDY BOUND IS NOT AN END ANCHOR: it finds the nearest match, not the right one.
     * 🔴 SO EACH OCCURRENCE TAKES A FIXED WINDOW, and the window is required to hold exactly ONE
     * `.upsert(` — otherwise a window could read the NEXT upsert's target and call it this one's. */
    const upserts = [...route.matchAll(/from\('place_pictures'\)\s*\.upsert\(/g)]
      .map(m => route.slice(m.index, m.index + 900))
      .filter(w => (w.match(/\.upsert\(/g) || []).length === 1)
    /* ⚠️ **TWO** SINCE 7 OCTOBER: `materialiseLegacy`, and §6's "Also save it for <location>" — which
     * inserts a row for an object that is already stored, so one press cannot be allowed to 23505 on
     * the path index. ⛔ EVERY ONE IS LISTED AND EACH ONE'S TARGET IS NAMED, and both target `path` —
     * the FULL unique index the 20261015 migration created for exactly this. */
    return upserts.length === 2
      && upserts.every(u => /onConflict: 'path'/.test(u))
      && !/onConflict: '[^']*is_main/.test(route)
      && !/onConflict: 'place_id'/.test(route)
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
// 6 · THE SOCIAL POSTS PAGE — the designs, and one false check that had been passing
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('6 · Social posts: the two design editors, and a check that a COMMENT was satisfying')

{
  const WP = read('components/manage/WeeklyPost.tsx')
  const EP = read('components/manage/EventPost.tsx')

  /* ══ ⛔ THE "Single event | Weekly" SWITCH IS HIDDEN NOW, AND THAT IS NOT A DELETION ══════════════
   * Social posts › Designs has a BOX for the weekly design and a BOX for the event design, so each
   * opens this screen already on the one it is about and the switch would be a second way to answer a
   * question already asked. ⚠️ IT IS HIDDEN WITH A CLASS, NOT REMOVED: the switch is the only thing in
   * its row, and dropping the row would change the gap above the card so the two routes into this
   * screen would be different heights. `designKind` is still honoured. */
  t('🔴 the two design boxes open the EXISTING screens, each on the right design',
    /initialMode="setup" initialDesignKind="week" hideKindSwitch onBack=\{back\}/.test(SOCIAL)
    && /<EventSetupScreen token=\{token\} onlyStandard onCancel=\{back\}/.test(SOCIAL))
  t('⚠️ …and the switch is hidden by the caller, not deleted',
    /hideKindSwitch \? ' hidden' : ''/.test(WP)
    && /useState<'week' \| 'event'>\(initialDesignKind \?\? 'event'\)/.test(WP))
  /* ⚠️ COMMENT-STRIPPED. The note recording the rename quotes the old label, and a check that reads
   * raw source cannot tell a label from a note about a label. */
  t('⛔ "Week (7 days)" is gone from the screen', !/Week \(7 days\)/.test(codeOf(WP)))

  /* ══ ⛔ ONE HEADING PER VIEW ════════════════════════════════════════════════════════════════════
   * The weekly view showed "Set up your weekly post" TWICE — a large bold page heading and the card
   * heading below it. The outer one is gone and the card's now matches the event card's style. */
  t('⛔ the outer page heading is gone — no `text-lg font-black` heading in the setup switch',
    !/<h2 className="text-lg font-black text-slate-900">\s*\n?\s*\{designKind === 'week'/.test(WP))
  /* ⚠️ "Set up your SINGLE EVENT post" SINCE 6 October 2026 — the box on Designs that opens this card
   * is "Single event post design", and a card that named the design differently would send the operator
   * looking for a box that is not there. The CLAIM is unchanged: the two cards share one style. */
  t('🔴 …and the weekly card heading matches the event card\'s exactly', (() => {
    const weekly = /<p className="font-bold text-slate-800">Set up your weekly post<\/p>/.test(WP)
    const event = /<p className="font-bold text-slate-800">Set up your single event post<\/p>/.test(EP)
    return weekly && event
  })())
  t('⛔ and "Set up your weekly post" appears exactly ONCE in the rendered code',
    (codeOf(WP).match(/Set up your weekly post/g) || []).length === 1)

  t('⛔ the event copy no longer counts "three"', !/adds those three for each event/.test(EP))
  t('🔴 …and says "HatchGrab adds those for each event."', /HatchGrab adds those for each event\./.test(EP))

  /* ══ ⛔ A CHECK THAT A COMMENT HAD BEEN SATISFYING, FOR A DAY (found 6 October 2026) ══════════════
   * It read `/href="\?section=places"/.test(EP)` — RAW source — and asserted that the "a different
   * picture for one place?" pointer linked to the Places tab. That link was changed to
   * `manageSectionHref('places')` on 5 October and a TOMBSTONE was left saying ⛔ WAS
   * `href="?section=places"`. **The tombstone satisfied the check.** It passed green on a build where
   * the thing it described no longer existed.
   * 🔴 THE LESSON IS THE ONE THIS FILE ALREADY CARRIES IN THREE OTHER PLACES: `codeOf` BEFORE any
   * source-text assertion. It is in the header of this harness, and this check was written without it.
   * ⛔ AND THE POINTER ITSELF IS GONE NOW. "Where do I put a picture for one place?" is answered by the
   * screen the operator is already on — Designs, Box 3 — so a sentence pointing elsewhere would be
   * pointing at the room they are standing in. */
  t('⛔ the old Places pointer is gone from the event setup card — and no `?section=` is hand-written',
    !/A different picture for one place\?/.test(codeOf(EP))
    && !/href="\?section=/.test(codeOf(EP)))

  /* 🔴 THE PLACE DESIGN EDITOR IS A PAGE AROUND THE EXISTING SCREEN. `onlyPlaceId` locks it to one
   * place and hides the list and the picker; the chrome — the back link, the name, "Make post for …",
   * "Use Standard design here instead" — belongs to the caller. */
  /* ⚠️ RE-AIMED 7 October 2026 — see the note in §6 on `onlyPlaceId`. The FOCUSED MODE is what this
   * check is about and it survives for the Standard design, which Social media › Designs opens. */
  t('🔴 Designs opens the existing screen focused on the STANDARD design',
    /<EventSetupScreen token=\{token\} onlyStandard onCancel=\{back\}\s*\n\s*onDirtyChange=\{setEditorDirty\} onSaver=/.test(SOCIAL)
    && /onlyStandard\?: boolean/.test(EP) && /onlyPlaceId\?: string/.test(EP))
  /* ⚠️ THE DESIGNS LIST IS A PILL ROW ABOVE THE EDITOR NOW rather than a left-hand column — the left
   * column is the shared editor's TEXT list. The suppression is the same condition on the same block. */
  t('⛔ …and in that mode the screen hides its own Designs list and picker',
    /\{!onlyStandard && !onlyPlaceId && \(/.test(codeOf(EP))
    && /\{picking && !onlyStandard && !onlyPlaceId && \(/.test(codeOf(EP)))
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
