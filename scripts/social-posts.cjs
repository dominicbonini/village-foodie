#!/usr/bin/env node
// scripts/social-posts.cjs
//
//   node scripts/social-posts.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO LIVE TRUCK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   1. ⛔ A PRIVATE EVENT IS NEVER OFFERED A POST. There is no post for one — the route refuses
//      `event_post` — and its venue, town and place never leave the server. Three surfaces could get
//      this wrong (the next-six list, a place's "next", the place editor's preview select) and all
//      three are checked, on the SERVER side, where the decision is made. §1.
//   2. 🔴 ONE READ FOR THE PAGE, AND NO PER-PLACE LOOP. `social_overview` signs every place's picture
//      in one call; the alternative was `event_load` per place, which also reads 400 events. §2.
//   3. ⛔ NOTHING IS REBUILT. Every box opens an EXISTING flow — the weekly make screen, the one
//      `EventPostModal`, the two setup screens — and the place design editor is `EventSetupScreen`
//      focused, so this product has exactly one drag surface. §3.
//   4. 🔴 THE GATE. `places_posts_preview` decides whether the pill exists at all; `schedule_graphics`
//      decides whether the boxes work, and it is checked PER BOX because the brief asks for the locked
//      state inside the box. §4.
//   5. ⚠️ THE TWO AREAS ARE IN THE URL, through the one link builder, and both retired section ids
//      still resolve. §5.
//
// ⛔ WHAT THIS CANNOT DO: it cannot press "Make post" or upload a picture. Those are the numbered
// localhost list in docs/social-posts-report.md, on Pizza Kitchen only.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')
/** 🔴 COMMENTS STRIPPED BEFORE ANY SOURCE-TEXT ASSERTION — a rule written in prose must never be
 *  mistaken for the code that implements it. This harness exists partly BECAUSE a check in
 *  `places-tab.cjs` §6 was satisfied by a tombstone quoting the string it was looking for. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SOCIAL = read('components/manage/SocialPosts.tsx')
const ROUTE = read('app/api/weekly-post/route.ts')
const MANAGE = read('app/manage/[token]/page.tsx')
const LINKS = read('lib/manage-links.ts')
const COPY = read('lib/copy/socialPosts.ts')

/** The body of one action in the weekly-post route, bounded by the next `if (action === …)`. */
function actionBody(name) {
  const code = codeOf(ROUTE)
  const i = code.indexOf(`action === '${name}'`)
  if (i < 0) return ''
  const j = code.indexOf('if (action ===', i + 10)
  return j > i ? code.slice(i, j) : code.slice(i)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · A PRIVATE EVENT IS NEVER OFFERED A POST
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · a private event is never offered a post, and carries no location')

{
  const body = actionBody('social_overview')
  t('🔴 `social_overview` exists and resolves privacy through the ONE reader',
    body.length > 0 && /readPrivateEventIds\(\s*\n?\s*supabase, upcomingRaw\.map\(e => e\.id\)/.test(body))
  /* ⛔ THE LOCATION IS DROPPED ON THE SERVER, NOT HIDDEN ON THE CLIENT. §73's rule: a private event's
   * venue, town and place are never published, and "the client does not draw it" is not the same
   * claim — it leaves the data in a payload anyone can read. */
  t('⛔ …and a private event is sent with NO venue, NO town and NO place',
    /venue: priv \? null : /.test(body)
    && /town: priv \? null : /.test(body)
    && /placeId: priv \? null : /.test(body))
  /* 🔴 AND A PLACE'S "next" IS ITS NEXT **PUBLIC** EVENT. That event is what the place's Make post
   * button posts, so a private one there would be a button that cannot work. */
  t('🔴 a place\'s `next` is its next PUBLIC event',
    /const next = mine\.find\(e => e\.is_private !== true\) \?\? null/.test(body))
  t('⛔ …and the place editor\'s "Preview with" list is public-only too',
    /upcoming: mine\.filter\(e => e\.is_private !== true\)/.test(body))
  /* ⚠️ IT IS STILL A ROW IN THE NEXT-SIX LIST, greyed. An operator who sees five events when they have
   * six bookings will go looking for the sixth. */
  t('⚠️ a private event still takes its place in the next-six list, greyed and buttonless',
    /\{!ev\.isPrivate && \(/.test(SOCIAL)
    && /PRIVATE_EVENT_ROW/.test(SOCIAL)
    && /Private event · no post/.test(COPY))
  /* ⛔ AND THE ROUTE REFUSES THE POST ITSELF, which is the guard the screen is only the first half of. */
  t('⛔ …and `event_post` refuses a private event server-side',
    /PRIVATE_NO_SINGLE_POST/.test(codeOf(ROUTE)))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · ONE READ, NO PER-PLACE LOOP
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · one read for the whole page, and no `event_load` per place')

{
  const body = actionBody('social_overview')
  t('⛔ the page never calls `event_load`', !/event_load/.test(codeOf(SOCIAL)))
  t('🔴 …it calls `social_overview` exactly once, on mount',
    (codeOf(SOCIAL).match(/action: 'social_overview'/g) || []).length === 1)
  t('🔴 …and the action signs every place\'s picture in that one call',
    /imageUrl: await signed\(path\)/.test(body))
  /* ⛔ READ-ONLY. It is the only new action this build adds and it must not be able to write. */
  t('⛔ …and it writes NOTHING — no insert, update, upsert, delete or storage remove',
    !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.remove\(/.test(body))
  /* ⚠️ FORWARD-ONLY AND BOUNDED. Both lists are about what is coming, so nothing before today is read
   * — which is also what keeps this cheap enough to replace the loop it exists to prevent. */
  t('⚠️ …and the event read is forward-only and bounded',
    /\.gte\('event_date', today\)/.test(body) && /\.limit\(400\)/.test(body))
  /* 🔴 THE SHARED GROUPING, so a MERGED place's events land on its target exactly as everywhere else.
   * A second, weaker match here would give one place two different "next"s on two screens. */
  t('🔴 places are grouped with the SHARED rule, so a merged place behaves as it does elsewhere',
    /const \{ byPlace \} = groupEventsByPlace\(/.test(body)
    && /import \{ groupEventsByPlace, placeForEvent, countsAsUpcoming \} from '@\/lib\/schedule-graphics\/places'/.test(ROUTE))
  /* ⚠️ HIDDEN AND MERGED PLACES ARE NOT LISTED. The brief's rule, applied on the server. */
  t('⚠️ hidden and merged places are excluded, on the server',
    /allPlaces\.filter\(p => p\.is_hidden !== true && !p\.merged_into_id\)/.test(body))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EVERY BOX IS A DOOR
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · every box opens an existing flow — one modal, one drag surface')

{
  /* ⛔ ONE MAKE FLOW FOR AN EVENT, OPENED FROM FOUR PLACES: the Events list, the Single event box, a
   * place's row, and the place design editor. Four buttons, one `EventPostModal`. */
  t('🔴 all three event buttons open the SAME modal',
    (codeOf(SOCIAL).match(/<EventPostModal /g) || []).length === 1
    && /setPosting\(ev\.id\)/.test(SOCIAL)
    && /setPosting\(pl\.next!\.id\)/.test(SOCIAL)
    && /onMakePost=\{id => setPosting\(id\)\}/.test(SOCIAL))
  t('⛔ …and the Events list still opens that same modal',
    /<EventPostModal token=\{token\} eventId=\{postEventId\}/.test(MANAGE))
  /* 🔴 ONE DRAG SURFACE IN THE PRODUCT. The single-event editor's pointer handling took three fixes;
   * a second would be a second set of those bugs. */
  t('🔴 there is exactly ONE `DraggableBox` definition in the product', (() => {
    const walk = (dir) => {
      const out = []
      const go = (d) => {
        let es
        try { es = fs.readdirSync(path.join(REPO, d), { withFileTypes: true }) } catch { return }
        for (const e of es) {
          const rel = `${d}/${e.name}`
          if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') go(rel) }
          else if (/\.tsx?$/.test(e.name)) out.push(rel)
        }
      }
      go(dir)
      return out
    }
    const defs = walk('components').concat(walk('lib'))
      .filter(f => /export function DraggableBox/.test(codeOf(read(f))))
    return defs.length === 1 && defs[0] === 'components/manage/WeeklyPost.tsx'
  })())
  t('⛔ …and the place design editor mounts the existing screen rather than drawing boxes',
    /<EventSetupScreen token=\{token\} onlyPlaceId=\{placeId\}/.test(SOCIAL)
    && !/DraggableBox/.test(codeOf(SOCIAL)))
  /* ⚠️ AND THE WEEKLY BOX OPENS THE WEEK THE OPERATOR CHOSE, not this week and then a reload. */
  t('⚠️ the weekly box opens the chosen week on the FIRST load',
    /initialMode="post" initialWeek=\{view\.week\}/.test(SOCIAL)
    && /useEffect\(\(\) => \{ void load\(initialWeek\) \}, \[load, initialWeek\]\)/
      .test(read('components/manage/WeeklyPost.tsx')))
  /* ⛔ "Give own design" AND "Edit" OPEN THE SAME PAGE. A place only counts as "Own design" once a
   * picture is saved, which is the server's `hasPicture`, not a client flag. */
  t('⛔ "Give own design" and "Edit" open the same page, and the tag follows the SERVER',
    /label=\{pl\.hasPicture \? 'Edit' : 'Give own design'\}/.test(SOCIAL)
    && /hasPicture: !!path/.test(actionBody('social_overview')))
  /* 🔴 "Name on posts" IS BOUND TO `short_name`, WHICH IS WHAT THE RENDERER PRINTS. */
  t('🔴 "Name on posts" writes `short_name`, which is the field the renderer prints',
    /manageApi\('sg_upsert_place', \{ id: placeId, short_name: next \}\)/.test(SOCIAL)
    && /const short = String\(place\?\.short_name \?\? ''\)\.trim\(\)\s*\n\s*if \(short\) return short/
      .test(read('lib/weekly-post/week-data.ts')))
  t('⛔ …and it adds no column — `sg_upsert_place` is the action Tidy up already uses',
    /action === 'sg_upsert_place'/.test(codeOf(read('app/api/manage/route.ts'))))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE GATE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · a truck without the preview key sees no change at all')

{
  /* 🔴 THE PILL IS FILTERED, so a truck without `places_posts_preview` has no way in; the derived
   * section sends a stale bookmark to Events in the SAME render; and the route refuses besides. */
  t('🔴 the pill is filtered out without the preview key',
    /SCHEDULE_SECTIONS\.filter\(sec => sec\.id !== 'posts'\)/.test(codeOf(MANAGE)))
  t('⛔ …and both areas are derived to Events without it, in the same render',
    /\(!canPlacesPosts && \(section === 'posts' \|\| section === 'designs'\)\) \? 'events' : section/
      .test(codeOf(MANAGE)))
  t('⛔ …and the route refuses every action without it',
    /'places_posts_preview' as never/.test(codeOf(ROUTE))
    && /Social posts are not switched on for this truck\./.test(ROUTE))
  /* ⚠️ `schedule_graphics` IS CHECKED PER BOX, which is the brief's shape — and it is ONE helper, so
   * six boxes cannot be given six different features. */
  t('⚠️ `schedule_graphics` is one gate helper, used by every box',
    (SOCIAL.match(/feature="schedule_graphics"/g) || []).length === 1
    && (codeOf(SOCIAL).match(/\{gate\(/g) || []).length >= 6)
  t('⛔ …and it is the route\'s own refusal sentence, not a second literal',
    /WEEKLY_POST_PLAN_REFUSAL/.test(SOCIAL)
    && !/'The weekly post is on/.test(codeOf(SOCIAL)))
  /* ⛔ AND NOTHING ELSE ON MANAGE CHANGED FOR A TRUCK WITHOUT THE KEY. The Add event additions are
   * inside the modal every truck has — so this is asserted where it can be: the suggestion rows and
   * the tick are not behind the key, because they are not new SURFACES, they are the places list this
   * form has always had. ⚠️ SAID OUT LOUD IN THE REPORT rather than asserted falsely here. */
  t('⚠️ the Add event additions are in the modal every truck already has',
    /const wantPicker = \(!!editingEvent && !editingEvent\.id\) \|\| modalView === 'tidy'/.test(codeOf(MANAGE)))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE TWO AREAS ARE IN THE URL
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · the segmented control is a URL, and both retired ids resolve')

{
  t('🔴 the control writes the area through the page\'s section setter',
    /onClick=\{\(\) => onArea\(k\)\}/.test(SOCIAL)
    && /area=\{shownSection\} onArea=\{onSectionChange\}/.test(MANAGE))
  t('🔴 …and both areas are live sections in the ONE builder',
    /export type ScheduleSection = 'events' \| 'event-types' \| 'posts' \| 'designs'/.test(LINKS))
  t('⛔ …and `places` → Designs, `weekly` → Make a post', (() => {
    const map = LINKS.slice(LINKS.indexOf('const LEGACY_SCHEDULE_SECTION'),
      LINKS.indexOf('const LIVE_SCHEDULE_SECTIONS'))
    return /places: 'designs',/.test(map) && /weekly: 'posts',/.test(map)
  })())
  t('⛔ …with both legacy ids still carrying their tab',
    /places: 'schedule', weekly: 'schedule',/.test(LINKS))
  /* ⛔ AND "No design yet" GOES TO DESIGNS, NOT TO MAKE A POST. Sending an operator back to the button
   * that just refused them is the kind of loop a screen can be in for ever. */
  t('⛔ "No design yet" sends the operator to Designs',
    /onNeedsSetup=\{\(\) => \{ setPostEventId\(null\); onSectionChange\('designs'\) \}\}/.test(MANAGE)
    && /onNeedsSetup=\{\(\) => \{ setPosting\(null\); setView\(\{ kind: 'event-design' \}\) \}\}/.test(SOCIAL))
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
