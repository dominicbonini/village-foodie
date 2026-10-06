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
const COPY = read('lib/copy/socialPosts.ts')
const ROUTE = read('app/api/weekly-post/route.ts')
const MANAGE = read('app/manage/[token]/page.tsx')
const LINKS = read('lib/manage-links.ts')

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
  /* ⚠️ "Give own design" BECAME "Design" (6 October 2026). Three words for the commonest state in the
   * list is what pushed a one-line row onto two in a 200px column. The CLAIM is unchanged: both labels
   * open the same page, and which one is shown follows the SERVER's `hasPicture`, not a client flag. */
  t('⛔ "Design" and "Edit" open the same page, and the tag follows the SERVER',
    /\{pl\.hasPicture \? 'Edit' : 'Design'\}/.test(SOCIAL)
    && /<DesignTag own=\{pl\.hasPicture\} \/>/.test(SOCIAL)
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
// 3b · "IS THIS DESIGN SET UP?", ANSWERED ONCE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3b · one readiness predicate, and every reader calls it')

{
  /* ══ ⛔ FOUR READERS WERE ASKING ONE QUESTION FOUR WAYS, AND THEY DISAGREED BOTH DIRECTIONS ═══════
   *   `load` / `event_load` / `event_post`  → a ROW exists
   *   `social_overview`                     → a row WITH a picture
   * …and the screens they feed applied a FIFTH test: the weekly setup screen on
   * `!layout || !size || !blankUrl`, the event one on `!standard` alone.
   * 🔴 SO A HALF-WRITTEN ROW MADE SOCIAL POSTS SAY "✓ Set up" OVER A SCREEN THAT SAID THE OPPOSITE —
   * and, the other way, made it say "Not set up" over a button that opened a working editor.
   * ⛔ "Not set up" ON A BOX WHOSE BUTTON OPENS AN EDITOR IS A SCREEN CALLING ITSELF A LIAR. */
  /* 🔴 IT IS IN `lib/`, AND THIS HARNESS **CALLS** IT. Node 22 strips types from a `require`d `.ts`,
   * so the real function is exercised over real shapes rather than its source being pattern-matched.
   * ⛔ A PREDICATE NOTHING CAN CALL IS A PREDICATE NOBODY CHECKS — that is why it is not in the route. */
  const { designIsReady } = require(path.join(REPO, 'lib/weekly-post/ready.ts'))
  const whole = { blank_path: 'x.png', width: 1080, height: 1350, layout: { date: {} } }
  t('🔴 a complete design is ready', designIsReady(whole) === true)
  t('⛔ …and all five half-written states are NOT', (() => {
    const no = (patch) => designIsReady({ ...whole, ...patch }) === false
    return designIsReady(null) === false
      && designIsReady(undefined) === false
      /* a row with nothing uploaded — `event_load` used to call this a design and open the editor */
      && no({ blank_path: null })
      /* a picture with no size — every box coordinate is in the canvas's pixels */
      && no({ width: null }) && no({ height: 0 })
      /* a picture with no boxes — `social_overview` used to call this "✓ Set up" */
      && no({ layout: null }) && no({ layout: undefined })
  })())
  /* ⚠️ AND AN EMPTY LAYOUT OBJECT IS **READY**. `{}` is not a sensible layout, but it is a SAVED one,
   * and refusing it would hide a real design from its owner. Null is the state that means "nobody has
   * placed the boxes yet"; `== null` and not a falsy test is what keeps those apart. */
  t('⚠️ …but a SAVED empty layout is ready — `== null`, not falsy',
    designIsReady({ ...whole, layout: {} }) === true)
  /* 🔴 AND EVERY READER CALLS IT. Asserted as a COUNT and by name: five call sites across the four
   * actions, and no `design ? {` or `!!design` left in the route deciding the same thing on its own. */
  t('🔴 all five call sites use it, and none decides for itself', (() => {
    const code = codeOf(ROUTE)
    const calls = (code.match(/designIsReady\(/g) || []).length
    return calls === 5
      && /design: designIsReady\(design\) \? \{/.test(code)
      && /ready: designIsReady\(weekDesign\)/.test(code)
      && /ready: designIsReady\(evDesign\)/.test(code)
      && /hasDesign: designIsReady\(design\)/.test(code)
      /* ⛔ AND THE OLD SHAPES ARE GONE, or a fifth reader could be added beside the four. */
      && !/design: design \? \{/.test(code)
      && !/hasDesign: !!design/.test(code)
      && !/ready: !!\w+Design\?\.blank_path/.test(code)
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3c · ONE EMPTY STATE, THE SAME IN EVERY BOX THAT CANNOT WORK YET
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3c · one empty state, identical in all three boxes')

{
  /* ══ ⛔ THERE WERE THREE ANSWERS TO ONE SITUATION, AND THAT WAS THE FAULT (6 October 2026) ════════
   * With no design the weekly box relabelled its orange button to "Set up weekly design", boxes 2 and
   * 3 showed a grey "Set up your event design first" line and greyed their Make post buttons, and the
   * lists underneath went on listing events nobody could post.
   * ⛔ A DISABLED CONTROL IS A PROMISE that it will work under some condition the screen does not name,
   * and a button that relabels itself from the data is one an operator learns not to trust.
   * 🔴 ONE PANEL NOW, IDENTICAL IN ALL THREE: what is missing, what to do, one button that does it. */
  t('⛔ the three old treatments are gone', (() => {
    const code = codeOf(SOCIAL)
    /* ⚠️ "Set up weekly design" STILL EXISTS — as the DESIGNS box's button label, which is where it
     * belongs. What went is the MAKE A POST box relabelling ITSELF to it, so the absence is asserted
     * over that box alone. A whole-file absence test would have failed on the correct new label. */
    const makeBox = code.slice(code.indexOf('data-make-boxes'), code.indexOf('data-design-boxes'))
    return !/EVENT_DESIGN_FIRST/.test(SOCIAL)
      && !/eventSetupNote/.test(SOCIAL)
      && !/Set up weekly design/.test(makeBox)
      /* ⛔ AND NO `disabled` TIED TO READINESS ANYWHERE. The lists are only drawn when the design is
       * ready, so there is nothing left to disable — which is the point. */
      && !/disabled=\{!data\.standard\.ready\}/.test(code)
  })())
  /* 🔴 ONE COMPONENT, THREE CALL SITES, AND IT IS THE SAME COMPONENT IN ALL THREE. Three copies of a
   * panel is three panels the moment one is edited. */
  t('🔴 `EmptyBox` is one component, used in all three boxes',
    /function EmptyBox\(\{ title, onGo \}/.test(SOCIAL)
    && (codeOf(SOCIAL).match(/<EmptyBox title=/g) || []).length === 3)
  t('🔴 …keyed on `designIsReady`\'s answer, per box',
    /\{gate\(!data\.weekly\.ready \? \(/.test(SOCIAL)
    && (codeOf(SOCIAL).match(/\{gate\(!data\.standard\.ready \? \(/g) || []).length === 2)
  t('⚠️ …with the weekly box naming the weekly design and the other two the event design',
    /<EmptyBox title=\{EMPTY_WEEKLY_TITLE\}/.test(SOCIAL)
    && (codeOf(SOCIAL).match(/<EmptyBox title=\{EMPTY_EVENT_TITLE\}/g) || []).length === 2)
  /* ⚠️ THE HEADING AND THE DESCRIPTION STAY. That is what makes an empty box read as "not yet" rather
   * than "not available": the box still says what it is FOR. */
  t('⚠️ …and it replaces the box BODY, not the box',
    /<Box title="Weekly post" blurb=\{WEEKLY_BOX_BLURB\}>\s*\n\s*\{gate\(!data\.weekly\.ready/.test(SOCIAL))
  t('🔴 …and its button goes to Designs through the one section setter',
    /const goToDesigns = \(\) => onArea\('designs'\)/.test(codeOf(SOCIAL))
    && /onGo=\{goToDesigns\}/.test(SOCIAL)
    && /\{EMPTY_BUTTON\}/.test(SOCIAL))
  /* ⛔ NO ORANGE IN AN EMPTY BOX. Orange means "make something", and making something is the one thing
   * an empty box cannot do. ⚠️ ASSERTED ON THE COMPONENT HERE AND ON THE COMPUTED BACKGROUND by the
   * render harness, which renders a fixture with nothing set up. */
  t('⛔ the empty panel\'s button is OUTLINED, never primary', (() => {
    const fn = SOCIAL.slice(SOCIAL.indexOf('function EmptyBox'), SOCIAL.indexOf('function UsedFor'))
    return /\$\{BTN_OUTLINE\}/.test(fn) && !/BTN_PRIMARY/.test(fn) && !/data-primary/.test(fn)
  })())
  /* ⚠️ A PRIVATE ROW STILL HAS NO BUTTON AT ALL — absent is for "never", and that is unchanged. */
  t('⛔ …while a private row still has NO button at all',
    /\{!ev\.isPrivate && \(/.test(SOCIAL))
}

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
// 4b · THE LOOK — the agreed mockup, in source terms
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4b · headings, buttons and tiles match the agreed design')

{
  /* ⛔ A BOX HEADING IS A HEADING, NOT A LABEL. It was `SUBCARD_HEADING` — uppercase, letter-spaced,
   * 12px — which is the treatment for a label above a group of controls. On a card that is one of
   * three choices it made the boxes read as form sections rather than as three things you can do.
   * ⚠️ THE COMPUTED `text-transform` IS ASSERTED IN THE BROWSER, by the render harness. Here what is
   * pinned is that the uppercase token is GONE and one heading constant is used by all six. */
  /* ⚠️ `codeOf` ON BOTH ABSENCE TESTS. The tombstone above `BOX_HEADING` NAMES the token it replaced
   * and quotes its classes — so a raw-source test for "SUBCARD_HEADING is gone" is failed by the
   * comment that explains why it went. Third time in this build's harnesses that prose has decided a
   * claim about code; `codeOf` first, every time. */
  t('🔴 one heading style, bold and title case, and `SUBCARD_HEADING` is not it',
    /const BOX_HEADING = 'text-\[17px\] font-bold leading-tight text-slate-900'/.test(SOCIAL)
    && !/SUBCARD_HEADING/.test(codeOf(SOCIAL))
    && !/uppercase/.test(codeOf(SOCIAL)))
  t('⚠️ …and every box passes its description as the heading\'s own prop',
    (codeOf(SOCIAL).match(/<Box title="[^"]+" blurb=\{/g) || []).length === 6)

  /* ══ ⛔ ORANGE MEANS "MAKE SOMETHING", AND NOTHING ELSE ═══════════════════════════════════════════
   * 🔴 ASSERTED AS A COUNT OF THE MARKER, not of the colour. Every primary carries `data-primary`, and
   * there are exactly three places it may appear: "Make this week's post", "Set up weekly design"
   * (the same button when there is no design) and "Make post for <date>". Everything else — the
   * per-row Make post, all three Edit buttons, "Give own design" — is `BTN_OUTLINE`.
   * ⚠️ THE RENDER HARNESS CHECKS THE COMPUTED BACKGROUND, which is the half this cannot see. */
  /* ⚠️ FOUR NOW, NOT THREE (6 October 2026, Dominic). Designs' two buttons became ORANGE — on that
   * area, setting a design up IS the thing to do — so the set is: "Make this week's post" (Make a
   * post), the two design-box buttons (Designs), and "Make post for <date>" (the place editor).
   * ⛔ AND THE EMPTY PANEL'S BUTTON IS NOT ONE OF THEM, which §3c asserts on the component itself. */
  t('🔴 exactly four buttons may be primary, and they are named',
    (SOCIAL.match(/data-primary/g) || []).length === 4)
  t('⛔ …and no other button uses the primary class',
    (codeOf(SOCIAL).match(/BTN_PRIMARY/g) || []).length === 5)
  /* 🔴 ONE PER AREA, AND IT IS THE AREA THAT DECIDES. Make a post has exactly one orange button and
   * Designs has exactly two — asserted by slicing each area's own markup, so an orange button added to
   * the wrong area fails here rather than passing a whole-file count. */
  t('🔴 …one orange on Make a post, two on Designs', (() => {
    const code = codeOf(SOCIAL)
    const make = code.slice(code.indexOf('data-make-boxes'), code.indexOf('data-design-boxes'))
    const designs = code.slice(code.indexOf('data-design-boxes'), code.indexOf('<EventPostModal'))
    return (make.match(/data-primary/g) || []).length === 1
      && (designs.match(/data-primary/g) || []).length === 2
  })())
  t('⛔ …and `Btn` is not imported at all, so its orange default cannot leak in',
    !/import \{[^}]*\bBtn\b[^}]*\} from '@\/components\/manage\/primitives'/.test(SOCIAL))

  /* 🔴 THE EMPTY DESIGN TILE IS THE SAME SIZE AS A FILLED ONE. It was `aspect-[4/5] w-full` with no
   * image, which collapses to whatever the content needs — "Not set up" drew a thin bar where a tall
   * tile should be, and the two Designs boxes were then different heights for no reason to do with
   * the designs. ⚠️ A FIXED HEIGHT AND A DERIVED WIDTH, because three boxes in a row are three widths
   * and a width-driven aspect ratio would give three different heights. */
  t('🔴 the design tile is one component, sized the same with or without a picture',
    /style=\{\{ height, width, maxWidth: '100%' \}\}/.test(SOCIAL)
    && /const ratio = w && h \? w \/ h : 4 \/ 5/.test(SOCIAL)
    && /: 'No design yet'/.test(SOCIAL))
  /* ══ ⛔ AND ITS WIDTH IS CAPPED — A LANDSCAPE DESIGN BURST OUT OF ITS BOX (6 October 2026) ════════
   * REPORTED LIVE: the event post design stretched past the edge of its card. With a fixed 220px
   * height and no cap, a 1920×1080 design is 391px wide and the column it sits in is 200–320px.
   * ⛔ EVERY DESIGN THE FIXTURES HAD EVER DRAWN WAS PORTRAIT, so no measurement could produce one —
   * which is why the render harness now renders a landscape tile and checks it against the box.
   * 🔴 THE HEIGHT IS THE TARGET, NOT THE RULE: 220 unless that would exceed `MAX_W`, in which case the
   * width caps and the height follows the ratio down. ⚠️ `maxWidth: '100%'` is the belt to that. */
  t('🔴 …and its width is capped, so a landscape design cannot overflow its box',
    /const MAX_W = 176/.test(SOCIAL)
    && /const width = Math\.min\(Math\.round\(H \* ratio\), MAX_W\)/.test(SOCIAL)
    && /const height = Math\.round\(width \/ ratio\)/.test(SOCIAL)
    && /maxWidth: '100%'/.test(SOCIAL))
  t('⚠️ …and it is drawn in the DESIGN\'s own shape, which the server now sends',
    /width: weekDesign\?\.width \?\? null/.test(codeOf(ROUTE))
    && /<DesignTile url=\{data\.weekly\.previewUrl\} w=\{data\.weekly\.width\} h=\{data\.weekly\.height\} \/>/.test(SOCIAL))

  /* ⛔ A PLACE ON STANDARD GETS A PLAIN TILE WITH NO TEXT IN IT. It said "Standard" in 9px inside a
   * 40px box — unreadable AND redundant, because the tag beside it says the same word at a size
   * somebody can read. */
  t('🔴 the place tile is 28×35 and holds a picture or nothing',
    /className="flex h-\[35px\] w-\[28px\] shrink-0/.test(SOCIAL)
    && /: null\}/.test(SOCIAL.slice(SOCIAL.indexOf('function PlaceTile'), SOCIAL.indexOf('function DesignTag'))))
  t('⛔ …and the tag is its own element, to the right of the name and before the button', (() => {
    /* ⚠️ `codeOf` FIRST, THEN ORDER. A comment now sits between the tag and the button explaining why
     * the label is one word, and an adjacency regex on raw source fails on that comment — which is the
     * prose-breaks-a-code-check class this build has met four times. */
    const row = codeOf(SOCIAL).slice(codeOf(SOCIAL).indexOf('data-place-design-list'))
    const tag = row.indexOf('<DesignTag own={pl.hasPicture} />')
    const btn = row.indexOf('<button type="button"', tag)
    const name = row.indexOf('{pl.name}')
    return /function DesignTag/.test(SOCIAL) && name > 0 && tag > name && btn > tag
  })())

  /* 🔴 THE COLOUR BAR IS FULL ROW HEIGHT AND DARK NAVY FOR STANDARD. It was `h-8 w-1` — a stub beside
   * a taller row, which read as a bullet — and grey-300 at 4px is invisible at arm's length. */
  t('🔴 the design bar is 4px, full row height, and navy for Standard',
    /standard: 'bg-slate-800'/.test(SOCIAL)
    && /own: 'bg-orange-500'/.test(SOCIAL)
    && /className=\{`w-1 shrink-0 self-stretch rounded-full \$\{DESIGN_BAR\[ev\.design\]\}`\}/.test(SOCIAL))

  /* ⛔ AND THE TIME FORMAT IS THE PRODUCT'S ONE FORMATTER. This file had its own — `17:00–20:00` with
   * no spaces — while everything else writes `17:00 – 20:00` through `formatTimeRange`, whose own note
   * says "use this everywhere a start–end pair is shown so no surface re-introduces seconds". */
  t('⛔ times come from the shared formatter, not a second copy',
    /import \{ formatTimeRange \} from '@\/lib\/time-utils'/.test(SOCIAL)
    && !/function timeLabel/.test(codeOf(SOCIAL)))

  /* ══ 🔴 THE BREAKPOINT IS 900px, AND IT IS THE SAME ONE ON BOTH GRIDS ════════════════════════════
   * ⛔ IT WAS `lg:` — 1024px. A 16in MacBook Pro in Safari with a normal window is 1000–1100px wide,
   * so the three boxes STACKED on a laptop, which is the width the design was drawn for. */
  t('🔴 both grids go side-by-side from 900px, not from `lg`',
    (SOCIAL.match(/min-\[900px\]:grid-cols-/g) || []).length === 2
    && !/lg:grid-cols-/.test(SOCIAL))
  t('⚠️ …and the Designs row gives the two design boxes a comfortable, shrinkable width',
    /min-\[900px\]:grid-cols-\[minmax\(200px,320px\)_minmax\(200px,320px\)_minmax\(0,1fr\)\]/.test(SOCIAL))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4c · THE WORDING, AND WHERE EVERY SENTENCE LIVES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4c · the agreed wording, from the one copy module')

{
  /* 🔴 EVERY SENTENCE ON THIS SCREEN IS IN `lib/copy/socialPosts.ts`, AND THE COMPONENT HAS NONE OF
   * ITS OWN. A sentence written out twice is two sentences the moment one is edited — which this
   * product has already shipped once ("the weekly post is on Pro and Max", in a route and a component,
   * both wrong, one corrected). */
  const say = (name, text) => t(`⚠️ ${name}`, COPY.includes(text))

  say('the intro names Designs, then Make a post, and the order they go in',
    "' is where you upload your background pictures, once. '")
  say('…and Make a post is what puts the words on them',
    "' puts your dates, places and times on them for you.'")
  say('Make a post › Weekly post', 'One picture showing everywhere you’ll be this week.')
  say('Make a post › Single event post', 'One picture for one event: its date, place and times.')
  say('Make a post › Post for a place', 'Pick a place and post the next event you have there.')
  say('Designs › Weekly post design', 'Your background picture for the weekly schedule post.')
  say('…and what we write on it', 'Each week we write your days, places and ')
  say('Designs › Event post design', 'Your background picture for a single event post.')
  say('Designs › the two "Used for" lines', "'the weekly post only.'")
  say('…and the event design names its exception',
    'every event post, at every place — unless that place has its own design.')
  say('Designs › Designs for a place', 'Want a different picture at one venue — a pub’s logo, a festival’s poster?')
  say('…and it says what a place design REPLACES', "' your event post design.'")
  say('the empty state names the weekly design', 'You haven’t designed a weekly post yet')
  say('…and the event design', 'You haven’t designed an event post yet')
  say('…and says the job is small', 'Upload your picture in Designs first. It only takes a minute.')
  say('…with one button out', "export const EMPTY_BUTTON = 'Go to Designs'")

  /* ⛔ CURLY APOSTROPHES, AS THE REST OF THE FILE USES. A straight one in a sentence beside twelve
   * curly ones is the kind of thing nobody sees until it is printed on a poster. */
  t('⛔ no straight apostrophe in any exported string', (() => {
    const strings = [...COPY.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1])
    /* ⚠️ THE SOURCE'S OWN QUOTES ARE THE DELIMITERS, so a straight apostrophe INSIDE a string would
     * have had to be escaped — `\'` — and that is what this looks for. */
    return !strings.some(x => /\\'/.test(x))
  })())

  /* 🔴 AND THE COMPONENT QUOTES NONE OF THEM. Asserted as an absence of the sentences themselves. */
  t('🔴 …and not one of those sentences is written out in the component', (() => {
    const code = codeOf(SOCIAL)
    return ['One picture showing everywhere', 'Your background picture for', 'It only takes a minute',
      'Want a different picture at one venue', 'the weekly post only']
      .every(x => !code.includes(x))
  })())

  /* 🔴 THE TWO SENTENCES WITH BOLD IN THEM ARE SPLIT, NOT MARKED UP. A string with `**` in it would
   * need either a parser or a second copy in the JSX; the parts are exported and the component bolds
   * the middle one. ⚠️ AND THE FLATTENED WHOLE IS EXPORTED TOO, so nothing has to re-join them. */
  t('🔴 the two bold sentences are parts plus a flattened whole',
    /export const PAGE_INTRO =\n\s*`\$\{INTRO_DESIGNS_WORD\}\$\{INTRO_AFTER_DESIGNS\}\$\{INTRO_MAKE_WORD\}\$\{INTRO_AFTER_MAKE\}`/.test(COPY)
    && /export const PLACE_DESIGN_BLURB =\n\s*`\$\{PLACE_DESIGN_BLURB_BEFORE\}\$\{PLACE_DESIGN_BLURB_BOLD\}\$\{PLACE_DESIGN_BLURB_AFTER\}`/.test(COPY))
  t('⚠️ …and the component bolds exactly the two words that are the area names',
    /<span className="font-bold text-slate-700">\{INTRO_DESIGNS_WORD\}<\/span>/.test(SOCIAL)
    && /<span className="font-bold text-slate-700">\{INTRO_MAKE_WORD\}<\/span>/.test(SOCIAL)
    && /<span className="font-bold text-slate-700">\{PLACE_DESIGN_BLURB_BOLD\}<\/span>/.test(SOCIAL))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4d · THE DESIGNS BOXES AND THE PLACE ROWS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4d · centred tiles, "Used for", and one-line place rows')

{
  /* 🔴 THE TILE AND ITS BADGE SHARE ONE CENTRING WRAPPER. ⛔ `mx-auto` ON THE TILE ALONE would leave
   * the badge against the left edge the moment the tile is portrait — which it always is. */
  t('🔴 the picture and its badge are centred together, in both design boxes',
    (codeOf(SOCIAL).match(/<div className="flex flex-col items-center">\s*\n\s*<DesignTile/g) || []).length === 2)
  t('⚠️ …at a fixed 220px height, so two differently-shaped designs still line up',
    /const H = 220/.test(SOCIAL))
  /* 🔴 "Used for:" IS ONE COMPONENT, so the two panels cannot drift to "Used on:" and "Used for:". */
  t('🔴 both design boxes carry a "Used for" panel, from one component',
    /function UsedFor\(\{ text \}/.test(SOCIAL)
    && /<UsedFor text=\{WEEKLY_DESIGN_USED_FOR\} \/>/.test(SOCIAL)
    && /<UsedFor text=\{EVENT_DESIGN_USED_FOR\} \/>/.test(SOCIAL)
    && /\{USED_FOR_LABEL\}/.test(SOCIAL))
  /* 🔴 THE BUTTON SAYS WHICH JOB IT IS, from `designIsReady`'s answer — Edit an existing design, or
   * Set up one that does not exist. ⚠️ Both open the SAME screen; only the word changes. */
  t('🔴 the design buttons say Edit or Set up, from the readiness answer',
    /\{data\.weekly\.ready \? 'Edit weekly design' : 'Set up weekly design'\}/.test(SOCIAL)
    && /\{data\.standard\.ready \? 'Edit event design' : 'Set up event design'\}/.test(SOCIAL))

  /* ══ 🔴 A PLACE ROW IS ONE LINE AT EVERY WIDTH ══════════════════════════════════════════════════
   * ⛔ `flex-wrap` IS GONE FROM IT. In a list — where every row is the same shape — one row silently
   * becoming two is what makes the list hard to scan.
   * 🔴 THE NAME IS THE ONLY THING THAT GIVES WAY: `min-w-0` + `truncate` on the text block, `shrink-0`
   * on the tile, the tag and the button. ⚠️ `min-w-0` IS REQUIRED — a flex child's default
   * `min-width: auto` refuses to shrink below its content, which is exactly how a "truncating" name
   * pushes a button out of its box instead. */
  t('🔴 a place row cannot wrap, and the name is what truncates', (() => {
    const list = SOCIAL.slice(SOCIAL.indexOf('data-place-design-list'))
    const row = list.slice(list.indexOf('{designList.map'), list.indexOf('</ul>'))
    return /<li key=\{pl\.id\} className="flex items-center gap-2 py-2">/.test(row)
      && !/flex-wrap/.test(row)
      && /<span className="min-w-0 flex-1">/.test(row)
      && /truncate text-sm font-bold text-slate-900">\{pl\.name\}/.test(row)
  })())
  t('⛔ …and the tile, the tag and the button all `shrink-0`', (() => {
    const tile = SOCIAL.slice(SOCIAL.indexOf('function PlaceTile'), SOCIAL.indexOf('function DesignTag'))
    const tag = SOCIAL.slice(SOCIAL.indexOf('function DesignTag'), SOCIAL.indexOf('function ReadyBadge'))
    /* ⚠️ ONE TAG NOW, NOT TWO — see the "Standard" tag's removal below. */
    return /shrink-0/.test(tile) && (tag.match(/shrink-0/g) || []).length === 1
      && /const BTN_OUTLINE =\n\s*'inline-flex shrink-0/.test(SOCIAL)
  })())
  /* ══ ⛔ THE "Standard" TAG IS GONE (6 October 2026, Dominic) ═══════════════════════════════════════
   * REPORTED AS "remove the event type from Designs for a place", and that is how it read: **Standard
   * is the name of an EVENT TYPE** in this product — the first pill on the Event types grid and on
   * every Add event form — so a grey "Standard" on a place row looked like that type attached to the
   * place. ⛔ AND IT CARRIED NOTHING: every untagged place is on the event design, so a tag on all of
   * them says only "this row is a row". The exception is what is worth marking.
   * ⚠️ THE DEFAULT IS STILL VISIBLE TWICE OVER — a blank tile, and a button reading "Design". */
  t('⛔ only a place with its OWN design is tagged',
    /if \(!own\) return null/.test(SOCIAL)
    && /<span data-design-tag className="shrink-0 rounded-full bg-orange-50[^"]*">Own design<\/span>/.test(SOCIAL)
    && !/>Standard<\/span>/.test(SOCIAL))
  /* ⚠️ "its own" / "their own" — ONE PLACE IS NOT "THEY"; and the second half names the design the way
   * Box 2 names it, so the footer and the box above it agree. */
  t('⚠️ the footer is singular for one place and names the event post design',
    /\{withOwn\} with \{withOwn === 1 \? 'its' : 'their'\} own design · \{places\.length - withOwn\} using your event post design/.test(SOCIAL))
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
