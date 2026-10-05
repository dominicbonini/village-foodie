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
    /\{pl\.hasPicture \? 'Edit' : 'Give own design'\}/.test(SOCIAL)
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
// 3c · WHEN A DESIGN IS NOT SET UP
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3c · a button that cannot work says so instead')

{
  /* ⛔ THE WEEKLY BUTTON USED TO PROMISE A POST AND OPEN THE SETUP SCREEN. The existing flow DOES
   * handle a missing design — `WeeklyPostApp` falls back to setup — but it handles it by doing
   * something other than what the button said, which is the worst kind of handled. */
  t('🔴 with no weekly design the button reads "Set up weekly design" and goes to Designs',
    /\{data\.weekly\.ready \? \(/.test(SOCIAL)
    && /Set up weekly design/.test(SOCIAL)
    && /onArea\('designs'\); setView\(\{ kind: 'weekly-design' \}\)/.test(SOCIAL))
  /* ⛔ AND THE EVENT CASE EXPLAINS NOTHING ON ITS OWN. `EventPostModal` asks the server, gets
   * `hasDesign: false` and calls `onNeedsSetup()` — the modal flashes and the operator lands somewhere
   * else with no sentence anywhere. One grey line above boxes 2 AND 3, and the buttons go disabled. */
  t('🔴 with no event design, boxes 2 and 3 carry one grey line with a link',
    /const eventSetupNote = data && !data\.standard\.ready \? \(/.test(codeOf(SOCIAL))
    && (codeOf(SOCIAL).match(/\{eventSetupNote\}/g) || []).length === 2
    && /EVENT_DESIGN_FIRST/.test(SOCIAL) && /EVENT_DESIGN_FIRST_LINK/.test(SOCIAL))
  t('⚠️ …and every Make post button is DISABLED, not hidden',
    (codeOf(SOCIAL).match(/disabled=\{!data\.standard\.ready\}/g) || []).length === 2)
  /* ⚠️ A PRIVATE ROW STILL HAS NO BUTTON AT ALL — disabled is for "not yet", absent is for "never". */
  t('⛔ …while a private row still has NO button at all',
    /\{!ev\.isPrivate && \(/.test(SOCIAL))
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
  t('🔴 exactly three buttons may be primary, and they are the make/set-up ones',
    (SOCIAL.match(/data-primary/g) || []).length === 3)
  t('⛔ …and no other button uses the primary class',
    (codeOf(SOCIAL).match(/BTN_PRIMARY/g) || []).length === 4)
  t('⛔ …and `Btn` is not imported at all, so its orange default cannot leak in',
    !/import \{[^}]*\bBtn\b[^}]*\} from '@\/components\/manage\/primitives'/.test(SOCIAL))

  /* 🔴 THE EMPTY DESIGN TILE IS THE SAME SIZE AS A FILLED ONE. It was `aspect-[4/5] w-full` with no
   * image, which collapses to whatever the content needs — "Not set up" drew a thin bar where a tall
   * tile should be, and the two Designs boxes were then different heights for no reason to do with
   * the designs. ⚠️ A FIXED HEIGHT AND A DERIVED WIDTH, because three boxes in a row are three widths
   * and a width-driven aspect ratio would give three different heights. */
  t('🔴 the design tile is one component, sized the same with or without a picture',
    /style=\{\{ height: H, width: Math\.round\(H \* ratio\) \}\}/.test(SOCIAL)
    && /const ratio = w && h \? w \/ h : 4 \/ 5/.test(SOCIAL)
    && /: 'No design yet'/.test(SOCIAL))
  t('⚠️ …and it is drawn in the DESIGN\'s own shape, which the server now sends',
    /width: weekDesign\?\.width \?\? null/.test(codeOf(ROUTE))
    && /<DesignTile url=\{data\.weekly\.previewUrl\} w=\{data\.weekly\.width\} h=\{data\.weekly\.height\} \/>/.test(SOCIAL))

  /* ⛔ A PLACE ON STANDARD GETS A PLAIN TILE WITH NO TEXT IN IT. It said "Standard" in 9px inside a
   * 40px box — unreadable AND redundant, because the tag beside it says the same word at a size
   * somebody can read. */
  t('🔴 the place tile is 28×35 and holds a picture or nothing',
    /className="flex h-\[35px\] w-\[28px\] shrink-0/.test(SOCIAL)
    && /: null\}/.test(SOCIAL.slice(SOCIAL.indexOf('function PlaceTile'), SOCIAL.indexOf('function DesignTag'))))
  t('⛔ …and the tag is its own element, to the right of the name and before the button',
    /function DesignTag/.test(SOCIAL)
    && /<DesignTag own=\{pl\.hasPicture\} \/>\s*\n\s*<button/.test(SOCIAL))

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
