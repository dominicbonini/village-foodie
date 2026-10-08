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

/* 🔴 EVERY `.ts`/`.tsx` UNDER A DIRECTORY. Used for the tree-wide COUNT claims — "there is exactly one
 * `EventPostModal` mount in the product" cannot be said by reading one file. ⚠️ `node_modules` and
 * `.next` are skipped, or the count is the npm registry's. */
const walkTree = (dir) => {
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

const SOCIAL = read('components/manage/SocialPosts.tsx')
const COPY = read('lib/copy/socialPosts.ts')
const ROUTE = read('app/api/weekly-post/route.ts')
const MANAGE = read('app/manage/[token]/page.tsx')
const LINKS = read('lib/manage-links.ts')

/* ══ 🔴 `lib/manage-links.ts` IS COMPILED AND **RUN**, NOT ONLY GREPPED (6 October 2026) ═══════════
 * It is a pure string builder — no React, no `window`, no router, which its own header promises and
 * §3 of this harness asserts — so it can simply be executed. ⛔ AND IT SHOULD BE: the bug Dominic
 * reported ("Designs deselects the Social posts tab") was a MAPPING being wrong, and a regex on a map
 * literal proves the map says what it says, not that the function answers correctly. */
const { compile } = require('./_slot-interval-compile.cjs')
const LINKS_MOD = compile(REPO, ['lib/manage-links.ts'], 'sp-links').req('lib/manage-links.js')

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
  /* ⚠️ RE-AIMED 9 October 2026. THE ROWS HAVE NO BUTTONS AT ALL NOW — a row SELECTS the event and one
   * button above the list opens the modal — so "buttonless" is true of every row and says nothing about
   * a private one. ⛔ WHAT MAKES A PRIVATE ROW DIFFERENT IS THAT IT CANNOT BE **CHOSEN**: `disabled` on
   * the row's own button, because choosing it would put an event with no post in the card above. */
  t('⚠️ a private event still takes its place in the list, greyed and unchoosable',
    /data-pick-event=\{ev\.id\} disabled=\{ev\.isPrivate\}/.test(SOCIAL)
    && /PRIVATE_EVENT_ROW/.test(SOCIAL)
    && /Private event · no post/.test(COPY)
    /* 🔴 AND IT IS DRAWN FROM THE **POSTABLE** LIST, so a private event can never be the chosen one —
     * the screen's half of the rule the route enforces. */
    && /const postable = events\.filter\(e => !e\.isPrivate\)/.test(SOCIAL)
    && /const chosen = postable\.find\(e => e\.id === chosenId\) \?\? postable\[0\] \?\? null/.test(SOCIAL))
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
  /* ══ 🔴 HIDDEN PLACES ARE **SENT** NOW, AND FLAGGED — 7 October 2026 ════════════════════════════
   * ⛔ THEY WERE FILTERED OUT HERE, and the Location settings table's "Hidden n" chip cannot count rows
   * the server never sends. ⚠️ THE RULE AN OPERATOR SEES IS UNCHANGED: a hidden location appears only
   * under that chip, so filtering moved from the server to the screen and the DEFAULT view is the same
   * list it has always been.
   * 🔴 A MERGED PLACE IS STILL DROPPED, and that is the half that must not move: it is not a location
   * any more, it is a pointer at one, and listing it would offer two rows writing to the same images. */
  t('🔴 merged places are excluded on the server; hidden ones are sent, flagged',
    /const visible = allPlaces\.filter\(p => !p\.merged_into_id\)/.test(body)
    && /isHidden: pl\.is_hidden === true/.test(body)
    /* ⚠️ AND HIDDEN SINKS TO THE BOTTOM OF THE DEFAULT ORDER, so the list an operator sees first is
     * the order it has always had. */
    && /const ha = a\.is_hidden === true \? 1 : 0/.test(body)
    /* ⛔ AND THE SCREEN IS WHAT HIDES THEM — asserted, because "the server sends them" is only safe
     * while something downstream filters. */
    && /places\.filter\(p => p\.isHidden !== true\)/.test(SOCIAL))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EVERY BOX IS A DOOR
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · every box opens an existing flow — one modal, one drag surface')

{
  /* ⛔ ONE MAKE FLOW FOR AN EVENT, OPENED FROM FOUR PLACES: the Events list, the Single event box, a
   * place's row, and the place design editor. Four buttons, one `EventPostModal`. */
  /* ══ 🔴 ONE MODAL IN THE PRODUCT NOW, NOT ONE PER SCREEN — 7 October 2026 ═══════════════════════
   * ⛔ IT WAS MOUNTED TWICE: here, and on Schedule for the "Make post" button on an event row. Two
   * mounts meant two answers to "what happens when there is no design", and only one of them could
   * cross to the Designs pill. The Schedule button HANDS THE EVENT OVER now, and the modal opens on
   * arrival — §1's one press, not two.
   * 🔴 SO THE COUNT IS THE CLAIM, over the whole tree rather than over this file.
   * ⚠️ **TWO**, NOT ONE, AND THE SECOND ONE IS CORRECT. `WeeklyPost.tsx` mounts it for the per-event
   * "Image" button in "Post for each event" — a genuinely different surface, inside the weekly post
   * screen, whose "no design yet" route out is that screen's own `onEdit()`. ⛔ WHAT WENT IS THE
   * SCHEDULE MOUNT, which was a duplicate of this file's: same list of events, same flow, and the one
   * that could not reach the Designs pill. The count is 2 and each file is NAMED, because "two" with
   * no names would be satisfied by the wrong two. */
  t('🔴 `EventPostModal` is mounted in exactly TWO places, and Schedule is not one of them', (() => {
    const mounts = walkTree('components').concat(walkTree('app'))
      .filter(f => /<EventPostModal /.test(codeOf(read(f))))
    return mounts.length === 2
      && mounts.includes('components/manage/SocialPosts.tsx')
      && mounts.includes('components/manage/WeeklyPost.tsx')
      && !mounts.includes('app/manage/[token]/page.tsx')
      && (codeOf(SOCIAL).match(/<EventPostModal /g) || []).length === 1
      /* ⛔ AND SCHEDULE'S IMPORT WENT WITH ITS MOUNT. An import of a client modal is a bundle entry,
       * and a dead one would ship the component to every operator who opens Schedule. */
      && !/import \{ EventPostModal \}/.test(codeOf(MANAGE))
  })())
  /* ⛔ AND THE TWO BUTTONS THAT OPEN IT BOTH GO THROUGH ONE PIECE OF STATE. ⚠️ `pl.next!.id` IS GONE
   * with "Post for a place"; what replaced it is the headline's own button, which names the date. */
  /* ⚠️ RE-AIMED 9 October 2026: there is **ONE** door from this card now, not two. ⛔ A BUTTON PER ROW
   * WAS A SECOND DOOR TO ONE MODAL, and it skipped the caption box entirely — which is how an edited
   * caption would have been silently discarded for every event but the first. A row CHOOSES; the one
   * button above the list posts. */
  t('⛔ …and every door into it sets the same `posting` state',
    /onClick=\{\(\) => onPost\(chosen\.id\)\}/.test(SOCIAL)
    /* ⚠️ **ONE** `onPost(` CALL IN THE FILE, which is the claim: one door from this card. The prop's
     * declaration and the `onPost={id => setPosting(id)}` binding are matched separately below, so the
     * count is of CALLS and nothing else. */
    && (SOCIAL.match(/onPost\(chosen\.id\)/g) || []).length === 1
    && (SOCIAL.match(/onPost\(ev\.id\)/g) || []).length === 0
    && /onPost=\{id => setPosting\(id\)\}/.test(SOCIAL)
    /* 🔴 INCLUDING THE SCHEDULE HANDOFF, which is the third door and the only one that crosses a tab. */
    && /setPosting\(openEventId\)/.test(SOCIAL)
    && /onOpenSocial\('create', event\.id\)/.test(MANAGE))
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
    /* ⚠️ RE-AIMED 6 October 2026: it lives in `components/manage/DraggableBox.tsx` now. It used to be
     * exported out of `WeeklyPost.tsx` — a file about the weekly post — for the event screen to
     * import; with ONE shared editor there is no owning screen. The COUNT is the claim and is
     * unchanged. */
    return defs.length === 1 && defs[0] === 'components/manage/DraggableBox.tsx'
  })())
  /* ⚠️ RE-AIMED 7 October 2026. The per-LOCATION editor is gone — it was reached from a quiet link on
   * the pictures page, the brief removes that link, and a component with no door is dead code. ⛔ THE
   * DATA AND THE RENDERING ARE UNTOUCHED: `truck_places.event_layout` is still read and still
   * preferred; a location can no longer be GIVEN its own from the UI. 🔴 THE CLAIM IS UNCHANGED for
   * the mode that survives — Designs mounts the shared editor and this file draws no boxes. */
  /* ⚠️ RE-AIMED 9 October 2026: the mount takes `onDirtyChange` now. ⛔ THAT PROP IS WHAT MAKES THE
   * SUB-TAB PILLS SAFE — the editor reports whether it has unsaved work, so clicking a pill can ask
   * before discarding it instead of either blocking the click or losing the design. 🔴 THE CLAIM IS
   * UNCHANGED: Designs mounts the shared screen and this file draws no boxes. */
  t('⛔ …and Designs mounts the existing screen rather than drawing boxes',
    /<EventSetupScreen token=\{token\} onlyStandard onCancel=\{back\}\s*\n\s*onDirtyChange=\{setEditorDirty\} onSaver=/.test(SOCIAL)
    && !/DraggableBox/.test(codeOf(SOCIAL))
    && !/onlyPlaceId=\{/.test(codeOf(SOCIAL)))
  /* ⚠️ AND THE WEEKLY BOX OPENS THE WEEK THE OPERATOR CHOSE, not this week and then a reload. */
  t('⚠️ the weekly box opens the chosen week on the FIRST load',
    /initialMode="post" initialWeek=\{view\.week\}/.test(SOCIAL)
    /* ⚠️ `load` TAKES A SECOND ARGUMENT NOW — §9's "Show private events", passed explicitly as `false`
     * on the first load so the safe direction is the one the screen opens in. The CLAIM is unchanged:
     * the chosen week is passed to the FIRST load rather than set after one. */
    && /useEffect\(\(\) => \{ void load\(initialWeek, false\) \}, \[load, initialWeek\]\)/
      .test(read('components/manage/WeeklyPost.tsx')))
  /* ══ ⛔ "Add" / "Edit" WERE A **ROW BUTTON** ON A LIST THAT IS NOW A TABLE (7 October 2026) ═══════
   * The claim was that both labels opened the same page and the state behind them came from the
   * server rather than being guessed on the client.
   * 🔴 THE TABLE HAS NO ROW BUTTONS AT ALL: a row SELECTS, and the acting is in the pane beside it —
   * which is why there is no "same page" left to open. ⚠️ THE STATE IS STILL THE SERVER'S, and more
   * directly than before: the row draws the two slots' thumbnails, which only the server can sign. */
  t('⛔ a row selects and the pane acts — the server supplies both slots',
    /onClick=\{\(\) => \{ setSelectedId\(pl\.id\); setMsg\(null\) \}\}/.test(SOCIAL)
    /* ══ ⚠️ RE-AIMED AGAIN — THREE SLOTS, AND A ✓ OR A – RATHER THAN A THUMBNAIL ══════════════════
     * ⛔ THE "+1" BADGE LASTED HOURS. It marked a location with a weekly-only override, and the override
     * is gone — there is a picture per surface, so there is a COLUMN per surface instead.
     * ⛔ AND THE THUMBNAILS WENT WITH IT: at 24 × 30 a logo is a coloured smudge, so the cell answered
     * "is there one?" while looking as though it answered "which one?" — and a third of them would have
     * made the row wider than the names in it. */
    && /\{tick\(pl\.weeklyImage \?\? null\)\}/.test(SOCIAL)
    && /\{tick\(pl\.eventPhotoImage \?\? null\)\}/.test(SOCIAL)
    && /\{tick\(pl\.eventImage \?\? null\)\}/.test(SOCIAL)
    && /eventImage: await slotOut\(slots\.event\)/.test(actionBody('social_overview'))
    && /weeklyImage: await slotOut\(slots\.weekly\)/.test(actionBody('social_overview'))
    /* 🔴 AND THE THIRD SLOT IS SIGNED FROM THE SAME ONE LIBRARY READ, so one query still serves the
     * whole screen — which is the principle this section exists to protect. */
    && /eventPhotoImage: await slotOut\(\s*\n\s*resolveLocationImages\(pictures, pl as never\)\.eventPhoto\)/
      .test(actionBody('social_overview'))
    /* ⛔ AND THE OLD ROW BUTTON LEFT NOTHING BEHIND. `codeOf` first — the tombstones name it. */
    && !/\{none \? 'Add' : 'Edit'\}/.test(codeOf(SOCIAL))
    && !/const none = count === 0/.test(codeOf(SOCIAL)))
  /* ══ ⛔ "Name on posts" IS GONE FROM THIS SCREEN — 9 OCTOBER 2026 ═══════════════════════════════
   * It was here, it wrote `short_name` through `sg_upsert_place`, and the check below is the SAME one
   * inverted: the field is absent and the renderer's read of `short_name` is untouched.
   * 🔴 WHY IT WENT: "Tidy up places" edits a location's name AND ITS TOWN, side by side. A location's
   * name and its town are one fact about the schedule, and the second screen that edits half of that
   * pair is how the two halves come to disagree — the operator shortens the name here, the town stays
   * as it was there, and the poster prints a mismatch neither screen can show them.
   * ⚠️ AND WHAT REPLACED IT IS A SENTENCE, NOT A SILENCE. Removing a field and saying nothing leaves
   * an operator hunting; the grey note names the REAL path to the screen that owns it. */
  t('⛔ "Name on posts" left this screen, and a note names where the name is edited',
    /* ⚠️ `codeOf` FIRST — THE TOMBSTONES NAME THE FIELD, and must. A check that forbade the words
     * anywhere in the file would be a check that forbade explaining why they went. */
    !/Name on posts/.test(codeOf(SOCIAL))
    && !/function NameOnPosts\(/.test(codeOf(SOCIAL))
    && !/short_name: value\.trim\(\)/.test(codeOf(SOCIAL))
    && !/key=\{`n-\$\{selected\.id\}`\}/.test(codeOf(SOCIAL))
    /* 🔴 THE NOTE IS IN THE COPY MODULE and names Schedule → Tidy up places, which is the path that
     * is actually on the screen — "edit it elsewhere" would be a note that does not help. */
    /* ⚠️ "area", NOT "town" (9 October 2026) — the same reason the editor's item was renamed: half the
     * venues on this product are in a village, and the screen it points at calls the field "Area". */
    && /'Name and area come from your schedule\. Edit them in Schedule › Events › Add event › Tidy up places\.'/
      .test(read('lib/copy/socialPosts.ts'))
    && /data-name-from-schedule/.test(SOCIAL)
    /* ⛔ THE TAG FIELD STAYS, and it is the only keyed child left in the pane. */
    && /key=\{`t-\$\{selected\.id\}`\}/.test(SOCIAL)
    /* ⚠️ AND NOTHING ABOUT HOW THE NAME IS **PRINTED** CHANGED. `short_name` is still read first. */
    && /const short = String\(place\?\.short_name \?\? ''\)\.trim\(\)\s*\n\s*if \(short\) return short/
      .test(read('lib/weekly-post/week-data.ts')))
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
head('3c · one empty state, identical in both halves')

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
  /* ⚠️ **TWO** CALL SITES NOW, NOT THREE. "Post for a place" was the third box and it is gone — it was
   * a third door into the same modal, and Create a post's right half does that job better by naming
   * the next event outright instead of making the operator pick the venue it happens to be at. The
   * CLAIM is unchanged and is the one that matters: ONE component, so three copies of a panel cannot
   * become three panels the moment one is edited. */
  t('🔴 `EmptyBox` is one component, used in both halves',
    /function EmptyBox\(\{ title, onGo \}/.test(SOCIAL)
    && (codeOf(SOCIAL).match(/<EmptyBox title=/g) || []).length === 2)
  t('🔴 …keyed on `designIsReady`\'s answer, per half',
    /\{gate\(!data\.weekly\.ready \? \(/.test(SOCIAL)
    && (codeOf(SOCIAL).match(/\{gate\(!data\.standard\.ready \? \(/g) || []).length === 1)
  t('⚠️ …with the left half naming the weekly design and the right half the event design',
    /<EmptyBox title=\{EMPTY_WEEKLY_TITLE\}/.test(SOCIAL)
    && (codeOf(SOCIAL).match(/<EmptyBox title=\{EMPTY_EVENT_TITLE\}/g) || []).length === 1)
  /* ⚠️ THE HEADING AND THE DESCRIPTION STAY. That is what makes an empty box read as "not yet" rather
   * than "not available": the box still says what it is FOR. ⚠️ THE TITLES ARE CONSTANTS NOW —
   * `CREATE_WEEKLY_TITLE` / `CREATE_EVENT_TITLE` — so the halves and the Designs boxes cannot drift
   * apart in wording. */
  t('⚠️ …and it replaces the box BODY, not the box',
    /<Box title=\{CREATE_WEEKLY_TITLE\} blurb=\{WEEKLY_BOX_BLURB\}>\s*\n\s*\{gate\(!data\.weekly\.ready/.test(SOCIAL)
    && /CREATE_WEEKLY_TITLE = 'Weekly post'/.test(COPY)
    && /CREATE_EVENT_TITLE = 'Single event post'/.test(COPY))
  /* ⚠️ RE-AIMED 9 October 2026: it goes through `requestArea`, NOT `onArea` directly. ⛔ THAT IS THE
   * SAME DOOR THE SUB-TAB PILLS NOW USE — one function that asks before discarding an unsaved design
   * and navigates straight through when there is nothing to lose. A second, unguarded path to the same
   * tab would be a second way to lose someone's work, and the empty box's button is exactly such a
   * path: it leaves the pane for Designs. 🔴 THE CLAIM IS UNCHANGED and is stronger: ONE setter. */
  t('🔴 …and its button goes to Designs through the one guarded section setter',
    /const goToDesigns = \(\) => requestArea\('designs'\)/.test(codeOf(SOCIAL))
    && /onGo=\{goToDesigns\}/.test(SOCIAL)
    && /\{EMPTY_BUTTON\}/.test(SOCIAL)
    /* ⛔ AND `onArea` IS CALLED IN EXACTLY ONE PLACE — inside `goArea`, which is the only thing
     * `requestArea` may reach. Any other caller would be an unguarded route out of the editor. */
    && (codeOf(SOCIAL).match(/onArea\(/g) || []).length === 1
    && /const goArea = useCallback\(\(area2: SocialArea\) => \{\s*\n\s*setView\(\{ kind: 'boxes' \}\)\s*\n\s*setEditorDirty\(false\)\s*\n\s*onArea\(area2\)/
      .test(codeOf(SOCIAL)))
  /* ⛔ NO ORANGE IN AN EMPTY BOX. Orange means "make something", and making something is the one thing
   * an empty box cannot do. ⚠️ ASSERTED ON THE COMPONENT HERE AND ON THE COMPUTED BACKGROUND by the
   * render harness, which renders a fixture with nothing set up. */
  t('⛔ the empty panel\'s button is OUTLINED, never primary', (() => {
    /* ⚠️ THE END ANCHOR WAS `function UsedFor` AND THAT COMPONENT IS DELETED — the brief removes both
     * "Used for:" lines. ⛔ A SLICE WHOSE END ANCHOR IS GONE RUNS TO THE END OF THE FILE, which would
     * have made this read every button on the screen. The next component is the anchor now. */
    const fn = SOCIAL.slice(SOCIAL.indexOf('function EmptyBox'), SOCIAL.indexOf('function DesignTile'))
    return /\$\{BTN_OUTLINE\}/.test(fn) && !/BTN_PRIMARY/.test(fn) && !/data-primary/.test(fn)
  })())
  /* ⚠️ RE-AIMED: a private row is `disabled`, not buttonless, because no row has a button any more —
   * the row IS the control. ⛔ `disabled` IS THE RIGHT SHAPE FOR THIS ONE: the row still has to appear,
   * in its date position, or an operator with six bookings who sees five goes looking for the sixth. */
  t('⛔ …while a private row cannot be chosen at all',
    /data-pick-event=\{ev\.id\} disabled=\{ev\.isPrivate\}/.test(SOCIAL)
    && /cursor-default' : 'hover:bg-slate-50'/.test(SOCIAL))
}

// 4 · THE GATE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · a truck without the preview key sees no change at all')

{
  /* ══ 🔴 THE GATE MOVED UP A LEVEL — IT IS THE **TAB** NOW (7 October 2026) ═══════════════════════
   * It used to filter one Schedule pill and derive a stale bookmark back to Events. Social media is its
   * own top tab, so the whole tab is filtered out of the bar and no social section can reach the page
   * at all. ⛔ FILTERED, NOT DISABLED — a tab that opens a refusal is worse than no tab. */
  /* ⚠️ `schedule_graphics` SINCE THE 10 OCTOBER LAUNCH. It was `places_posts_preview` — a Feature in no
   * plan, held through `trucks.feature_overrides` for one truck. One key now, following the plan:
   * Pro, Max and trial. `scripts/places-posts-gating.cjs` is where the tiers are proved. */
  t('🔴 the whole Social TAB is filtered out without the plan key', (() => {
    const code = codeOf(MANAGE)
    const filt = code.slice(code.indexOf('const tabs = allTabs.filter'), code.indexOf('const tabs = allTabs.filter') + 700)
    return /t\.id === 'social'/.test(filt) && /schedule_graphics/.test(filt)
      /* ⛔ AND THE RETIRED KEY IS NOWHERE IN THE PAGE'S CODE — not merely absent from this filter,
       * which is also what a second forgotten gate elsewhere would look like. */
      && !code.includes('places_posts_preview')
      /* ⛔ and the Schedule-pill filter it replaced is gone, so there is one gate and not two */
      && !/sec\.id !== 'posts'/.test(code)
  })())
  t('⛔ …and Schedule no longer derives a gated section back to Events, because it has none',
    !/\(!canPlacesPosts && \(section === 'posts'/.test(codeOf(MANAGE)))
  /* ⛔ ONE GATE IN THE ROUTE, ON THE PLAN KEY, AND IT GUARDS BOTH HANDLERS. The "not switched on"
   * sentence is gone with the preview key: a plan sells this now, so the refusal names the plan. */
  t('⛔ …and the route refuses every action without it, with the shared plan sentence',
    /'schedule_graphics' as never/.test(codeOf(ROUTE))
    && /WEEKLY_POST_PLAN_REFUSAL/.test(codeOf(ROUTE))
    && !codeOf(ROUTE).includes('places_posts_preview')
    && !/not switched on/.test(codeOf(ROUTE)))
  /* ⚠️ `schedule_graphics` IS CHECKED PER BOX, which is the brief's shape — and it is ONE helper, so
   * five boxes cannot be given five different features. ⚠️ `>=`, NOT `===`: the number of boxes is a
   * design decision that moves, and what this claim is about is that there is ONE helper and every
   * gated surface goes through it. The exact box count is §4b's job.
   * ⚠️ RE-AIMED 9 October 2026: the call sites are counted as `gate(` rather than `{gate(`. The
   * Location settings pane's gate is the `else` arm of a ternary now (`) : gate(`), because the pane
   * shows "pick a location" when nothing is selected — so a brace-prefixed count was counting the
   * JSX punctuation in front of the helper rather than the helper. ⛔ THE DEFINITION IS EXCLUDED by
   * requiring a character before it that is not part of a name, and the ONE-HELPER claim is what the
   * `feature="…"` count above asserts. */
  t('⚠️ `schedule_graphics` is one gate helper, used by every gated surface',
    (SOCIAL.match(/feature="schedule_graphics"/g) || []).length === 1
    && (codeOf(SOCIAL).match(/(?:\{|: |return )gate\(/g) || []).length >= 8
    /* ⛔ AND THE PANE PASSES THE SAME HELPER DOWN rather than `LocationsArea` building a second one —
     * a child with its own gate is a surface that can be gated on a different feature. */
    && /gate=\{gate\}/.test(SOCIAL)
    && /gate: \(children: React\.ReactNode\) => React\.ReactNode/.test(SOCIAL))
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
  /* ⚠️ THE `uppercase` BAN IS BOUNDED NOW, NOT WHOLE-FILE (part 3). Box 3's list grew two GROUP
   * sub-headings — "No pictures yet (3)" / "With pictures (5)" — and a small letter-spaced capital is
   * exactly the treatment this note calls right for a label above a group. A whole-file absence test
   * would have forced a worse heading to keep a check green, which is the wrong way round. ⛔ SO IT IS
   * STILL AN ABSENCE, AND STILL EXACT: `uppercase` may appear on those two rows and nowhere else, and
   * the positive half names both the constant and the marker each row carries. */
  t('🔴 one heading style, bold and title case, and `SUBCARD_HEADING` is not it', (() => {
    const code = codeOf(SOCIAL)
    const upper = code.split('\n').filter(l => /uppercase/.test(l))
    return /const BOX_HEADING = 'text-\[17px\] font-bold leading-tight text-slate-900'/.test(code)
      && !/SUBCARD_HEADING/.test(code)
      /* ⚠️ THE TWO PERMITTED ROWS CHANGED WITH THE SCREENS (7 October 2026). They were Box 3's group
       * sub-headings; they are now "YOUR NEXT EVENT" above the right half's headline and the Location
       * settings table's column header row. Both are a LABEL ABOVE A GROUP, which is exactly the
       * treatment this note calls right for one — and there are still exactly two. */
      /* ══ ⚠️ FIVE PERMITTED ROWS NOW, AND EVERY ONE IS A LABEL ABOVE A GROUP ════════════════════════
       * It was two. §5 adds "OR PICK ANOTHER EVENT" above the event picker and "CAPTION" above the
       * caption box, and the chosen-event heading is `NEXT_EVENT_HEADING_V4` ("YOUR NEXT EVENT").
       * ⛔ THE RULE IS UNCHANGED AND IS WHAT THIS COUNTS: uppercase is for a label above a group and
       * nothing else — never for a card heading, which is `BOX_HEADING`'s job. ⚠️ THE COUNT IS PINNED
       * so a sixth has to be argued for rather than appearing. */
      && upper.length === 4
      && /\{NEXT_EVENT_HEADING_V4\}/.test(upper.join('\n'))
      && /\{PICK_ANOTHER_HEADING\}/.test(upper.join('\n'))
      && /\{CAPTION_HEADING\}/.test(upper.join('\n'))
      && upper.every(l => /text-\[10px\] font-bold uppercase tracking-wide text-slate-400/.test(l))
      && /\{COL_LOCATION\}/.test(code)
  })())
  /* ══ ⚠️ FIVE BOXES, AND FOUR OF THE FIVE TITLES ARE **CONSTANTS** NOW (7 October 2026) ════════════
   * It was four literals and two constants. Create a post's two halves took `CREATE_WEEKLY_TITLE` /
   * `CREATE_EVENT_TITLE` and Location settings took `LOCATIONS_TITLE` — because each of those names is
   * said somewhere else too (the Designs box beside it, the pill above it) and a literal that happens
   * to match is the thing a later edit gets wrong.
   * 🔴 THE CLAIM IS UNCHANGED: every box passes its description as the heading's OWN PROP, which is
   * what keeps the gap between them the same in all five. ⛔ AND THE COUNT IS BOTH HALVES, so a box
   * that dropped its blurb fails rather than reducing a total nobody checks. */
  t('⚠️ …and every box passes its description as the heading\'s own prop', (() => {
    const code = codeOf(SOCIAL)
    const literal = (code.match(/<Box title="[^"]+" blurb=\{/g) || []).length
    const consts = (code.match(/<Box title=\{([A-Z_]+)\} blurb=\{/g) || [])
    /* ══ ⚠️ FOUR OF FIVE BOXES PASS A BLURB, AND THE FIFTH DELIBERATELY DOES NOT (8 October 2026) ═════
     * The Locations card's description went when each sub-tab gained its own page description — the
     * same sentence twice on one screen is exactly what a per-tab description was added to stop. So
     * `<Box title={LOCATIONS_CARD_TITLE}>` has no `blurb` prop and is counted separately. */
    const noBlurb = (code.match(/<Box title=\{LOCATIONS_CARD_TITLE\}>/g) || []).length
    return literal === 1 && consts.length === 3 && noBlurb === 1
      && (code.match(/<Box title=/g) || []).length === 5
      && consts.some(x => x.includes('CREATE_WEEKLY_TITLE'))
      && consts.some(x => x.includes('CREATE_EVENT_TITLE'))
      && consts.some(x => x.includes('EVENT_DESIGN_TITLE'))
  })())

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
  /* ⛔ `codeOf` FIRST — AND THIS CHECK CAUGHT ITSELF ON 6 October 2026. It counted `data-primary` in
   * RAW source and went to five, because the note explaining that the new orange place-row button is
   * NOT a primary contains the words `data-primary`. A COUNT of a marker in raw source is the same
   * fault this harness's own header warns about twice, in a form that is easy to miss: the count went
   * UP rather than a boolean going wrong. Comments stripped, it is four. */
  t('🔴 exactly four buttons may be primary, and they are named',
    (codeOf(SOCIAL).match(/data-primary/g) || []).length === 4)
  /* ⚠️ SIX NOW, NOT FIVE: §5's template panel has a "Save template" button, which is the press that
   * writes. ⛔ IT IS ORANGE BECAUSE IT IS THE THING THE PANEL WAS OPENED TO DO — and Cancel beside it is
   * outlined, because going back is not an action on the data. */
  t('⛔ …and no other button uses the primary class',
    (codeOf(SOCIAL).match(/BTN_PRIMARY/g) || []).length === 6)
  /* ══ ⛔ THE ORANGE ROW BUTTON IS GONE WITH ITS LIST — 7 October 2026 ═════════════════════════════
   * "Design" / "Add" on a place row bent this screen's rule deliberately: giving a venue its own
   * picture IS making something, and it was the one act that list existed for.
   * 🔴 THE Location settings TABLE HAS NO ROW BUTTONS AT ALL — a row selects, and the acting is in the
   * pane beside it. So the rule is back to its simple form: orange means "make something", and the
   * only things that make something are the two buttons on Create a post and the two on Designs.
   * ⛔ ASSERTED AS A PRESENCE **AND** AN ABSENCE, because "no orange row button" alone is satisfied by
   * deleting the table. */
  t('⛔ the exception is gone — there is no orange row button and no orange outline class', (() => {
    const code = codeOf(SOCIAL)
    return !/const BTN_OUTLINE_ORANGE =/.test(code)
      && !/BTN_OUTLINE_ORANGE/.test(code)
      /* 🔴 AND THE TABLE'S ROWS ARE WHAT REPLACED IT: a selected row is tinted, not buttoned. */
      && /selectedId === pl\.id \? 'bg-orange-50' : 'hover:bg-slate-50'/.test(code)
      /* ⛔ AND NO `<button` INSIDE A ROW DOES ANYTHING BUT SELECT. The name cell holds a real
       * `<button>` so the row is keyboard-reachable, and it carries no handler of its own. */
      && /<button type="button" className="block w-full min-w-0 text-left">/.test(code)
  })())
  /* ══ ⛔ "no pictures first" WAS A SORT AND IS NOW A **CHIP** ══════════════════════════════════════
   * The claim was that the locations an operator can act on come first, because that list's job was to
   * get a picture onto a venue that had not got one.
   * 🔴 A FILTER CHIP ANSWERS IT BETTER: "Missing images n" puts the number on screen BEFORE it is
   * pressed, so an operator knows whether there is anything to do without scrolling a list to find
   * out. ⛔ AND "MISSING" MEANS **EITHER** SLOT IS EMPTY — a location with an event photo and no
   * weekly picture has something still to do, and a chip counting only the locations with nothing at
   * all would report zero for a truck whose weekly poster draws twenty blank boxes. */
  /* ⚠️ "No pictures" (9 October 2026), from "No images" (8 October), from "Missing images" before that.
   * ⛔ EACH RENAME FIXED A DIFFERENT FAULT: "missing" implied something ought to be there and all of
   * them are optional; "images" counted the POSTER too, and with three slots that puts nearly every
   * location on the list — a location poster is a finished design for one venue and most trucks will
   * never make one. 🔴 SO IT COUNTS THE TWO **PICTURES**, which is also why the word matches the three
   * boxes' own. ⚠️ "EITHER, NOT BOTH" IS UNCHANGED and is still the point of the number. */
  t('🔴 "No pictures" is a chip with a real count, over EITHER empty PICTURE', (() => {
    const code = codeOf(SOCIAL)
    return /CHIP_NO_PICTURES = \(n: number\): string => `No pictures \$\{n\}`/.test(COPY)
      && /visible\.filter\(p => !p\.weeklyImage \|\| !p\.eventPhotoImage\)/.test(code)
      && /\{chip\('missing', CHIP_NO_PICTURES\(missing\.length\)\)\}/.test(code)
      /* ⛔ AND THE RULE IS ALSO A PURE FUNCTION IN lib, so the screen's inline filter and
       * `missingImages` must be the same test — or the chip's number and the chip's list disagree.
       * ⚠️ ASSERTED ON THE SOURCE HERE AND **DRIVEN** IN `scripts/place-pictures.cjs` §1, which has the
       * TypeScript compile step this file does not. A bare `require` of that module fails: its
       * extensionless `./backgrounds` import is resolved by tsconfig paths, not by Node. */
      && /return places\.filter\(p => !p\.weekly \|\| !p\.eventPhoto\)\.length/
        .test(codeOf(read('lib/weekly-post/place-pictures.ts')))
      && /PP\.missingImages\(/.test(read('scripts/place-pictures.cjs'))
      /* ⛔ AND THE OLD SORT LEFT NOTHING BEHIND. */
      && !/const an = \(a\.pictureCount \?\? 0\) === 0 \? 0 : 1/.test(code)
      && !/const withoutPictures =/.test(code)
      && !/const withPictures =/.test(code)
  })())
  /* 🔴 ONE PER AREA, AND IT IS THE AREA THAT DECIDES. Create a post has exactly two orange buttons and
   * Designs has exactly two — asserted by slicing each area's own markup, so an orange button added to
   * the wrong area fails here rather than passing a whole-file count.
   * ⚠️ TWO ON Create a post, NOT ONE (7 October 2026): the right half gained "Create post for <date>",
   * which is the headline's own button and is making something. The third area — Location settings —
   * has NONE, and that is asserted too: it is management, and no post is made from it. */
  t('🔴 …two orange on Create a post, two on Designs, NONE on Location settings', (() => {
    const code = codeOf(SOCIAL)
    const make = code.slice(code.indexOf('data-create-halves'), code.indexOf('data-design-boxes'))
    const designs = code.slice(code.indexOf('data-design-boxes'), code.indexOf('<LocationsArea'))
    const locs = code.slice(code.indexOf('function LocationsArea'), code.indexOf('function NameOnPosts') > code.indexOf('function LocationsArea')
      ? code.indexOf('function NameOnPosts')
      : code.length)
    /* ⚠️ `NextEventHalf` IS A SEPARATE COMPONENT, so the right half's primary is not inside the
     * `data-create-halves` slice — it is counted on its own and the two are added. */
    const right = code.slice(code.indexOf('function NextEventHalf'), code.indexOf('function SlotBox'))
    return (make.match(/data-primary/g) || []).length === 1
      && (right.match(/data-primary/g) || []).length === 1
      && (designs.match(/data-primary/g) || []).length === 2
      && (locs.match(/data-primary/g) || []).length === 0
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

  /* ══ 🔴 THE ROW'S THUMBNAIL IS A **PAIR** NOW, ONE PER SLOT (7 October 2026) ═════════════════════
   * ⛔ `PlaceTile` WAS ONE 28×35 TILE showing the location's Main picture, because a location had one
   * picture that reached a poster. A row has TWO images to show, so the table draws two 24×30 cells —
   * and the columns above them say which is which.
   * ⚠️ A GREY DASH FOR AN EMPTY ONE, NOT AN EMPTY BOX. An empty tile reads as "loading"; a dash reads
   * as "none", which is what it is, and it is the glyph the rest of this product uses for nothing.
   * ══ 🔴 AND THE PICTURE CELL CARRIES A "+1" BADGE (9 October 2026) ═══════════════════════════════
   * ⛔ A LOCATION MAY HAVE A **SECOND** PICTURE — one used on weekly posts instead of its location
   * picture — and the table showed no sign of it. Two locations set up differently looked identical,
   * so the one honest column in the table was quietly wrong by omission.
   * ⚠️ THE BADGE IS ON THE PICTURE TILE, NOT A FOURTH COLUMN. A column for an override most trucks
   * never set would be an empty column on most rows; a badge is a mark on the thing it is about.
   * ⚠️ AND THE SLICE ANCHOR TAKES THE COMMA — `thumb` has a second parameter now, so an anchor ending
   * in `| null)` found nothing and the slice silently ran to the end of the file, where `shrink-0`
   * happens to appear. A slice that cannot fail to match is a check that cannot fail. */
  /* ══ 🔴 A ✓ OR A –, NOT A THUMBNAIL AND NOT A "+1" — 9 October 2026 ════════════════════════════════
   * ⛔ THE "+1" BADGE LASTED HOURS: it marked a weekly-only override, and the override is gone — there
   * is a picture per surface, so there is a COLUMN per surface instead.
   * ⛔ AND THE THUMBNAILS WENT WITH IT. At 24 × 30 a logo is a coloured smudge and a photo a grey
   * rectangle, so the cell answered "is there one?" while LOOKING as though it answered "which one?" —
   * and a third of them would have made the row wider than the names in it, which is the one thing a
   * `table-fixed` list must not do. 🔴 THE COLUMN ANSWERS THE QUESTION IT CAN: set, or not.
   * ⚠️ THE DASH IS THE SAME GLYPH the rest of this product uses for nothing. */
  t('🔴 each slot column is a green ✓ or a grey –, and the full picture is one click away', (() => {
    const code = codeOf(SOCIAL)
    const at = code.indexOf('const tick = (image: SlotImage | null)')
    const fn = code.slice(at, code.indexOf('const [openFor', at) > at
      ? code.indexOf('const [openFor', at) : at + 900)
    return at > 0
      && /data-slot-tick=\{image \? 'set' : 'none'\}/.test(fn)
      && /rounded-full bg-green-100 text-\[10px\] font-bold leading-none text-green-700">✓/.test(fn)
      && /text-\[13px\] font-bold leading-none text-slate-300">–/.test(fn)
      /* ⛔ AND THE OVERRIDE'S BADGE LEFT NOTHING BEHIND. `codeOf` first — the tombstones name it. */
      && !/data-weekly-only-badge/.test(code)
      && !/WEEKLY_ONLY_BADGE/.test(code)
      /* ⛔ AND THE SINGLE-TILE COMPONENT IS STILL GONE WITH ITS LIST. */
      && !/PlaceTile/.test(code)
      /* 🔴 THE FULL PICTURE IS IN THE PANE, 132px tall and shown WHOLE rather than cropped — which is
       * what makes a tick in the table enough. */
      && /h-\[132px\] min-w-0 items-center justify-center/.test(code)
  })())
  /* ⛔ AND THE **ORDER** IN THE ROW IS NAME, THEN WEEKLY, THEN EVENT — which is the column order above
   * it, and the whole point of a table rather than a list. A row whose cells ran the other way round
   * would silently swap the two images an operator is reading.
   * ⚠️ `codeOf` FIRST: a comment sits inside the row explaining why the name cell holds a `<button>`,
   * and an adjacency regex on raw source is decided by prose. */
  /* ══ ⛔ EVENT · WEEKLY · POSTER — AND THE ROW MUST MATCH THE HEADER ════════════════════════════════
   * ⚠️ IT WAS POSTER THEN PICTURE (8 October), THEN WEEKLY · EVENT · POSTER (9 October), AND IS EVENT ·
   * WEEKLY · POSTER NOW (10 October, Dominic): the order of the three boxes in the pane, which moved
   * the same day with Designs and Create a post — **the post a truck makes most often reads first**.
   * The poster stays LAST because it is the one most trucks never set.
   * ⛔ A ROW WHOSE CELLS RAN DIFFERENTLY FROM THE HEADER would make the operator re-learn which tick is
   * which every time they looked from one to the other — and with two of them called "picture", that is
   * a mistake nobody would catch by looking. 🔴 BOTH ORDERS ARE READ AND COMPARED. */
  t('⛔ the row is name, then EVENT, then WEEKLY, then POSTER — the header\'s own order', (() => {
    const code = codeOf(SOCIAL)
    const head = code.slice(code.indexOf('<thead>'), code.indexOf('</thead>'))
    const row = code.slice(code.indexOf('{rows.map(pl => ('), code.indexOf('</tbody>'))
    const hw = head.indexOf('{COL_WEEKLY}'), he = head.indexOf('{COL_EVENT}'), hp = head.indexOf('{COL_POSTER}')
    const rn = row.indexOf('{pl.name}')
    /* ⚠️ `eventImage` IS THE **POSTER** and `eventPhotoImage` the event PICTURE — the payload keys kept
     * their names when the meanings narrowed, for the same reason the columns did. */
    const rw = row.indexOf('tick(pl.weeklyImage')
    const re_ = row.indexOf('tick(pl.eventPhotoImage')
    const rp = row.indexOf('tick(pl.eventImage')
    return head.indexOf('{COL_LOCATION}') < he && he < hw && hw < hp
      && rn > 0 && re_ > rn && rw > re_ && rp > rw
      /* ⛔ AND `DesignTag` IS STILL GONE — it marked "own design" on a row, and nothing marks a row. */
      && !/DesignTag/.test(code)
  })())

  /* ══ ⛔ THE COLOUR BAR IS GONE — 7 October 2026 ══════════════════════════════════════════════════
   * `DESIGN_BAR` was a 4px navy-or-orange spine on each row of the old flat six-event list, saying
   * which design that post would use. 🔴 THE RIGHT HALF SAYS IT IN **WORDS** NOW, under the next
   * event, and names the location: "Using The Kings Arms's photo". A colour that needed a legend
   * nobody had was the weaker half of that answer.
   * ⛔ PRESENCE AND ABSENCE TOGETHER, because deleting the line would satisfy the absence alone. */
  t('🔴 the design is named in WORDS, not a colour bar', (() => {
    const code = codeOf(SOCIAL)
    return !/DESIGN_BAR/.test(code)
      && !/data-design-bar/.test(code)
      && /data-image-source/.test(code)
      && /\{imageSourceLine\(/.test(code)
      /* ⚠️ AND THE SOURCE IS THE **SERVER'S** ANSWER, resolved by the same rule the renderer applies —
       * the client's `photoSpace` is only a fallback for a payload from before the field existed. */
      /* ⚠️ `chosen.imageSource` SINCE §5 — the card is about the CHOSEN event, which is the next public
       * one until the operator picks another from the list below it. */
      && /chosen\.imageSource$/m.test(code)
      && /imageSource: 'place-photo' \| 'place-poster' \| 'standard' \| 'none' =$/m.test(codeOf(ROUTE))
  })())
  /* 🔴 AND THE FOUR WORDINGS ARE **DRIVEN** — in `scripts/place-pictures.cjs` §1, which has the
   * TypeScript compile step this file does not. "Which image" is the one thing a 96px thumbnail cannot
   * show, so each answer has to be the right sentence and a regex cannot tell a wrong branch from a
   * right one. ⚠️ WHAT IS PINNED HERE is that the function exists with all four arms and that the
   * other harness drives it — so "it is checked elsewhere" is a fact the reader can follow. */
  t('🔴 …and the four sources each have their own sentence, driven elsewhere',
    /if \(source === 'none'\) return IMAGE_CHOICE_PRIVATE/.test(COPY)
    && /if \(source === 'event'\) return 'Using the image you uploaded for this post'/.test(COPY)
    && /if \(source === 'place-photo'\) return `Using \$\{where\}’s photo`/.test(COPY)
    && /if \(source === 'place-poster'\) return `Using \$\{where\}’s poster`/.test(COPY)
    && /return 'Using your standard single event design'/.test(COPY)
    /* ⚠️ AND A MISSING NAME DEGRADES TO "this location" rather than printing "undefined’s photo". */
    && /const where = String\(place \?\? ''\)\.trim\(\) \|\| 'this location'/.test(COPY)
    && /CP\.imageSourceLine/.test(read('scripts/place-pictures.cjs')))


  /* ⛔ AND THE TIME FORMAT IS THE PRODUCT'S ONE FORMATTER. This file had its own — `17:00–20:00` with
   * no spaces — while everything else writes `17:00 – 20:00` through `formatTimeRange`, whose own note
   * says "use this everywhere a start–end pair is shown so no surface re-introduces seconds". */
  t('⛔ times come from the shared formatter, not a second copy',
    /import \{ formatTimeRange \} from '@\/lib\/time-utils'/.test(SOCIAL)
    && !/function timeLabel/.test(codeOf(SOCIAL)))

  /* ══ 🔴 THE BREAKPOINT IS 900px, AND IT IS THE SAME ONE ON BOTH GRIDS ════════════════════════════
   * ⛔ IT WAS `lg:` — 1024px. A 16in MacBook Pro in Safari with a normal window is 1000–1100px wide,
   * so the three boxes STACKED on a laptop, which is the width the design was drawn for. */
  /* ⚠️ **THREE** GRIDS NOW, NOT TWO: Create a post's two halves, the two Designs boxes, and Location
   * settings' table-and-pane. All three use the SAME 900px breakpoint, which is the claim — a second
   * breakpoint on one of three screens is how one of them stacks on a laptop while the others do not. */
  /* ══ 🔴 ONE CONSTANT FOR CREATE A POST **AND** DESIGNS (8 October 2026) ═══════════════════════════
   * ⛔ THEY WERE TWO DIFFERENT GRIDS AND IT SHOWED: Create a post was two equal halves across the full
   * content width, Designs was two narrow columns plus an empty third track left over from the box
   * that used to sit in it. So the two screens one click apart laid their boxes out at different
   * widths. 🔴 A SHARED BREAKPOINT WRITTEN TWICE IS A SHARED BREAKPOINT UNTIL SOMEONE EDITS ONE. */
  t('🔴 Create a post and Designs share ONE grid constant, and all three go side-by-side at 900px',
    /export const TWO_HALVES_GRID = 'grid grid-cols-1 items-stretch gap-3 min-\[900px\]:grid-cols-2'/.test(SOCIAL)
    && /<div className=\{TWO_HALVES_GRID\} data-create-halves>/.test(SOCIAL)
    && /<div className=\{TWO_HALVES_GRID\} data-design-boxes>/.test(SOCIAL)
    /* ⛔ AND THE OLD THREE-TRACK DESIGNS GRID LEFT NOTHING BEHIND — `codeOf` first, because the
     * tombstone above the grid quotes it. */
    && !/minmax\(200px,320px\)_minmax\(200px,320px\)/.test(codeOf(SOCIAL))
    /* ⚠️ **THREE** `min-[900px]:grid-cols-` RULES NOW: the shared constant, Location settings' own
     * two-pane grid (a different ratio for a different job), and §6's three picture boxes — which stack
     * below 900 because three columns of a preview and a button is narrower than any of them needs.
     * ⛔ THE COUNT IS PINNED so a fourth has to be argued for rather than appearing. */
    && (SOCIAL.match(/min-\[900px\]:grid-cols-/g) || []).length === 3
    && !/lg:grid-cols-/.test(SOCIAL))
  /* ══ 🔴 A NARROWER TABLE — ABOUT A THIRD, NOT TWO THIRDS (8 October 2026) ═══════════════════════
   * ⛔ IT WAS `minmax(0,1fr) minmax(280px,420px)`, so the TABLE took everything the pane did not — at
   * 1440 that is two thirds of the page for three columns, two of which are 24px wide. The pane is
   * where the work happens.
   * ⚠️ `minmax(280px,1fr)` BESIDE `minmax(0,2.6fr)` IS A **RATIO**, not a width, so it holds at 1100
   * and at 1728 alike. The 280px floor stops a long venue name squeezing the column to nothing before
   * it truncates. ⚠️ `items-start`, not `items-stretch`: a short pane must not be stretched to a
   * sixty-row table's height. */
  t('⚠️ …and Location settings gives the table about a third and the pane the rest',
    /grid-cols-1 items-start gap-3 min-\[900px\]:grid-cols-\[minmax\(280px,1fr\)_minmax\(0,2\.6fr\)\]/.test(SOCIAL)
    /* 🔴 TWO EQUAL HALVES on Create a post and on Designs — from the one constant. */
    && /grid grid-cols-1 items-stretch gap-3 min-\[900px\]:grid-cols-2/.test(SOCIAL))
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
  /* ⛔ "Post for a place" IS GONE — 7 October 2026. It was a third door into the same modal, and
   * Create a post's right half does that job better by naming the next event outright instead of
   * making the operator pick the venue it happens to be at. ⚠️ `PLACE_POST_BOX_BLURB` IS STILL
   * EXPORTED and nothing imports it; see the import note in SocialPosts.tsx for why a dead copy
   * constant is cheaper than a harness that cannot find its subject.
   * 🔴 WHAT REPLACED IT IS ASSERTED, so this is a substitution rather than a deletion. */
  say('Create a post › the next event in full', "NEXT_EVENT_HEADING = 'Your next event'")
  say('…and its button names the DATE', 'createPostForLabel = (date: string): string => `Create post for ')
  say('…and the rest are behind a disclosure that counts them',
    'MORE_EVENTS_LABEL = (n: number): string => `More events (${n})`')
  /* ⚠️ "left out", NOT "hidden". A private booking is not posted about at all — there is no post it is
   * being kept out of the picture of — and "hidden" would read as a setting to go and change. */
  say('…and the week line says what is LEFT OUT', "private event${privateEvents === 1 ? '' : 's'} left out`")
  say('Designs › Weekly post design', 'Your background picture for the weekly schedule post.')
  say('…and what we write on it', 'Each week we write your days, places and ')
  /* ⚠️ RE-WORDED 6 October 2026 (§8). Box 2 is "Single event post design" and its description names the
   * fact that makes Box 3 make sense — that this one is the STANDARD, which a place design replaces. */
  say('Designs › Single event post design', "EVENT_DESIGN_TITLE = 'Single event post design'")
  say('…and "standard" is the bold word in its description', "EVENT_DESIGN_BLURB_BOLD = 'standard'")
  say('…and it says what we write on it',
    'design for a post about one event. We write that event’s date, place and times on top of it.')
  say('…and its button names the design',
    "EVENT_DESIGN_BUTTON_NEW = 'Set up single event design'")
  say('Designs › the two "Used for" lines', "'the weekly post only.'")
  /* ⚠️ THE "Used for:" LINE IS FIVE WORDS NOW. It used to repeat the description's own content ("unless
   * that place has its own design"); the description carries the "standard" fact, so this answers only
   * "which posts?" — which is what a Used-for line is for. */
  say('…and the event design\'s Used-for line answers only "which posts?"',
    "EVENT_DESIGN_USED_FOR = 'every post about a single event.'")
  /* ══ ⛔ THE "Location images" BOX LEFT DESIGNS — 7 October 2026 ═══════════════════════════════════
   * Designs is TWO boxes: the weekly post design and the single event post design. A list of locations
   * was never a design; it was there because there was nowhere else to put it.
   * 🔴 IT IS THE **Location settings** PILL NOW, and its wording is the two-slot model rather than the
   * library's: a PHOTO or a POSTER for event posts, and a PICTURE beside a weekly row. */
  say('Location settings › the pill and the card agree', "LOCATIONS_TITLE = 'Location settings'")
  say('…and its description says the images are used automatically',
    'They are used automatically when you make a post.')
  say('…and the event box asks for a PHOTO when the design has a space for one',
    "EVENT_BOX_PHOTO_TITLE = 'Photo for your event posts'")
  say('…or a POSTER when it has not, and says what a poster replaces',
    'It replaces your standard design completely for events at this location.')
  say('…and the weekly box names where its picture goes',
    "WEEKLY_BOX_TITLE = 'Picture beside its row on your weekly post'")
  /* 🔴 AND THE REMOVE CONFIRM SAYS THE IMAGE IS KEPT, because it is: Remove clears the slot and
   * nothing is deleted. A truck told "Remove" without that sentence has every reason to think
   * otherwise, and this screen has no undo. */
  say('…and Remove says the image itself is kept', 'It stops being used. The image itself is kept.')
  say('the empty state names the weekly design', 'You haven’t designed a weekly post yet')
  say('…and the single event design', 'You haven’t designed a single event post yet')
  /* ⛔ "It only takes a minute." WAS REMOVED ON 7 OCTOBER (Dominic). It is a promise about how long
   * something takes, made by a screen that does not know: setting a design up means exporting artwork
   * at the right shape, and for a truck who has not got one it is not a minute. */
  say('…and says what to do, without promising how long it takes',
    "EMPTY_BODY = 'Upload your picture in Designs first.'")
  t('⛔ …and the old promise is gone from the copy module',
    !/It only takes a minute/.test(codeOf(COPY)))
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
    /* ⚠️ EVERY SENTENCE IN THIS LIST MUST EXIST IN `COPY`, or the absence proves nothing. The fourth
     * used to be Box 3's old blurb, which no longer exists anywhere — a string that is nowhere is
     * trivially not in the component. It is Box 3's live description now. */
    const want = ['One picture showing everywhere', 'Your background picture for', 'It only takes a minute',
      'Save images for a location', 'the weekly post only']
    return want.every(x => COPY.includes(x)) && want.every(x => !code.includes(x))
  })())

  /* 🔴 THE TWO SENTENCES WITH BOLD IN THEM ARE SPLIT, NOT MARKED UP. A string with `**` in it would
   * need either a parser or a second copy in the JSX; the parts are exported and the component bolds
   * the middle one. ⚠️ AND THE FLATTENED WHOLE IS EXPORTED TOO, so nothing has to re-join them. */
  /* ⚠️ ONE SUCH SENTENCE NOW, NOT TWO (part 3) — Box 3's four-part blurb went with its model, and so
   * did its four exports. ⛔ THE SECOND HALF IS THE ABSENCE OF THEM, so a half-deleted sentence (parts
   * kept, whole removed, or the reverse) fails here instead of sitting in the module unrendered. */
  t('🔴 the one bold sentence is parts plus a flattened whole, and the retired one left nothing behind',
    /export const PAGE_INTRO =\n\s*`\$\{INTRO_DESIGNS_WORD\}\$\{INTRO_AFTER_DESIGNS\}\$\{INTRO_MAKE_WORD\}\$\{INTRO_AFTER_MAKE\}`/.test(COPY)
    && !/export const PLACE_DESIGN_BLURB/.test(COPY))
  /* ⚠️ TWO SPANS, NOT THREE (part 3). The third bolded the word "instead of" in Box 3's old blurb, and
   * that sentence went with the model it described — a place's pictures do not replace a design. The
   * CLAIM is unchanged and is now EXACT: the component bolds the two area names and nothing else, so a
   * third bolded word anywhere on this screen fails here rather than passing a pair of `.test`s. */
  t('⚠️ …and the component bolds exactly the two words that are the area names', (() => {
    const code = codeOf(SOCIAL)
    const spans = (code.match(/<span className="font-bold text-slate-700">\{([A-Z_]+)\}<\/span>/g) || [])
      .map(x => x.replace(/^.*\{/, '').replace(/\}.*$/, '')).sort()
    /* ⛔ THREE, AND THE THIRD IS A LABEL, NOT A BOLDED WORD IN A SENTENCE. `USED_FOR_LABEL` is the
     * "Used for:" lead-in on both design panels — bold because it introduces a value, which is a
     * different job from bolding a word inside running prose. It is named here so that it stays the
     * ONLY exception: a fourth bolded constant fails this check. */
    /* ══ ⛔ ONE BOLDED CONSTANT LEFT ON 8 OCTOBER — THE SHARED INTRO WENT ═══════════════════════════
     * `INTRO_DESIGNS_WORD` and `INTRO_MAKE_WORD` were the two area names bolded inside the shared
     * intro, and that intro is gone: each sub-tab says what IT is for, and a page that explains its
     * own navigation is a page whose navigation is not explaining itself.
     * 🔴 `USED_FOR_LABEL` IS THE SURVIVOR, AND IT IS A **LABEL**, not a bolded word in running prose —
     * the "Used for:" lead-in on both design panels, bold because it introduces a value. It is named
     * here so it stays the ONLY one: a second bolded constant fails this check.
     * ⚠️ AND THE FOUR INTRO CONSTANTS ARE STILL EXPORTED, which the line below asserts — three
     * harnesses read them by name, and a dead export is cheaper than a harness that cannot find its
     * subject. */
    /* ══ ⛔ **NO** BOLDED CONSTANT LEFT — 9 OCTOBER 2026 ════════════════════════════════════════════
     * `USED_FOR_LABEL` was the last survivor: the "Used for:" lead-in on both design panels. Both
     * panels are gone, because the box TITLES carry the same fact. 🔴 SO THE CLAIM IS NOW AN EMPTY SET,
     * which is the strongest form this check has ever had: nothing on this screen bolds a constant
     * inside running prose, and a first one has to be argued for. */
    return spans.length === 0
      && /INTRO_DESIGNS_WORD = 'Designs'/.test(COPY)
      && !/INTRO_DESIGNS_WORD/.test(code)
      && !/USED_FOR_LABEL/.test(code)
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4d · THE DESIGNS BOXES AND THE PLACE ROWS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4d · centred tiles, "Used for", and one-line place rows')

{
  /* 🔴 THE TILE AND ITS BADGE SHARE ONE CENTRING WRAPPER. ⛔ `mx-auto` ON THE TILE ALONE would leave
   * the badge against the left edge the moment the tile is portrait — which it always is. */
  /* ⚠️ **THREE** CENTRED TILES NOW, NOT TWO. Create a post's left half draws the weekly design's own
   * thumbnail above "Which week", so an operator recognises what they are about to make — the same
   * tile, centred the same way. ⛔ THE RIGHT HALF'S TILE IS **NOT** CENTRED and must not be: it sits
   * beside the event's date and venue in a row, so centring it would break that row's alignment. */
  t('🔴 the picture and its badge are centred together, in every box that has one',
    (codeOf(SOCIAL).match(/<div className="flex flex-col items-center">\s*\n\s*<DesignTile/g) || []).length === 3
    /* ⚠️ AND THE RIGHT HALF'S IS IN A ROW, not a centred column — asserted so "three" cannot be made
     * true by centring the one that should not be. */
    /* ⚠️ `chosen`, NOT `next` — §5's card is about the CHOSEN event, which is the next public one until
     * the operator picks another from the list below it. */
    && /<div className="mt-2 flex items-start gap-3">\s*\n\s*\{\/\*[\s\S]{0,300}?\*\/\}\s*\n\s*<DesignTile url=\{placeImageUrl\(chosen\.placeId\) \?\? standardUrl\}/.test(SOCIAL))
  t('⚠️ …at a fixed 220px height, so two differently-shaped designs still line up',
    /const H = 220/.test(SOCIAL))
  /* ══ ⛔ THE TWO "Used for:" PANELS ARE GONE — 9 OCTOBER 2026, AND THE CLAIM IS INVERTED ════════════
   * They said "Used for: the weekly post only." and "Used for: every post about a single event."
   * 🔴 THEY CAN GO BECAUSE THE BOX **TITLES** CARRY THE SAME FACT: "Weekly post design" and "Single
   * event post design" say what each is for in their own names, so a sentence under each was the same
   * information twice on one card — and it was the taller half of two boxes whose point is the design
   * tile. ⚠️ THE THREE CONSTANTS STAY EXPORTED as the record of the wording. */
  t('⛔ the two "Used for" panels are gone, and the box titles carry the fact instead',
    !/function UsedFor\(/.test(codeOf(SOCIAL))
    && !/<UsedFor /.test(codeOf(SOCIAL))
    && !/USED_FOR_LABEL/.test(codeOf(SOCIAL))
    /* ⚠️ STILL EXPORTED — three harnesses read them by name, and a dead export is cheaper than a
     * harness that cannot find what it is asking about. */
    && /WEEKLY_DESIGN_USED_FOR = 'the weekly post only\.'/.test(COPY)
    && /EVENT_DESIGN_USED_FOR = 'every post about a single event\.'/.test(COPY)
    /* 🔴 AND THE TITLES THAT REPLACED THEM ARE WHAT THE BOXES DRAW. */
    && /CREATE_WEEKLY_TITLE = 'Weekly post'/.test(COPY)
    && /EVENT_DESIGN_BUTTON_EDIT = 'Edit single event design'/.test(COPY))
  /* 🔴 THE BUTTON SAYS WHICH JOB IT IS, from `designIsReady`'s answer — Edit an existing design, or
   * Set up one that does not exist. ⚠️ Both open the SAME screen; only the word changes. */
  t('🔴 the design buttons say Edit or Set up, from the readiness answer',
    /\{data\.weekly\.ready \? 'Edit weekly design' : 'Set up weekly design'\}/.test(SOCIAL)
    /* ⚠️ BOX 2'S TWO LABELS ARE CONSTANTS, because the empty state and the setup card have to agree
     * with them. The CLAIM is unchanged: the word follows `designIsReady`'s answer. */
    && /\{data\.standard\.ready \? EVENT_DESIGN_BUTTON_EDIT : EVENT_DESIGN_BUTTON_NEW\}/.test(SOCIAL)
    && /EVENT_DESIGN_BUTTON_EDIT = 'Edit single event design'/.test(COPY)
    && /EVENT_DESIGN_BUTTON_NEW = 'Set up single event design'/.test(COPY))

  /* ══ 🔴 A TABLE ROW IS ONE LINE AT EVERY WIDTH — THE SAME RULE, A NEW SHAPE ══════════════════════
   * ⛔ THE CLAIM IS UNCHANGED AND IT IS THE ONE THAT MATTERS: in a list where every row is the same
   * shape, one row silently becoming two is what makes the list hard to scan.
   * 🔴 THE NAME IS THE ONLY THING THAT GIVES WAY. `table-fixed` plus fixed widths on the two slot
   * columns is what does it now — `table-fixed` makes a column's declared width binding rather than a
   * suggestion, so a long venue name truncates inside its own cell instead of widening the table.
   * ⚠️ `min-w-0` IS STILL REQUIRED ON THE NAME CELL'S CONTENT. A flex child's default
   * `min-width: auto` refuses to shrink below its content, which is exactly how a "truncating" name
   * pushes the rest of a row out of its box. */
  t('🔴 a table row cannot grow, and the name is what truncates', (() => {
    const code = codeOf(SOCIAL)
    const row = code.slice(code.indexOf('{rows.map(pl => ('), code.indexOf('</tbody>'))
    return row.length > 0
      && /<table className="w-full table-fixed border-collapse text-sm">/.test(code)
      && /<th className="w-\[44px\] py-1 text-center">\{COL_POSTER\}<\/th>/.test(code)
      && !/flex-wrap/.test(row)
      && /<td className="min-w-0 py-1\.5 pr-2 align-top">/.test(row)
      /* ══ 🔴 THE NAME **WRAPS TO TWO LINES** NOW RATHER THAN TRUNCATING — AND THE CLAIM SURVIVES ══════
       * ⛔ `truncate` AND `font-bold` WERE BOTH WRONG HERE. "The Kings Arms at Great Finborough" became
       * "The Kings Arms at Great Fi…" in a 200px column, so the one thing the row exists to identify was
       * the thing it could not show — and two venues on the same street became the same row. Every row
       * being bold also meant nothing was emphasised.
       * 🔴 `line-clamp-2` IS THE SHAPE THAT KEEPS BOTH PROMISES: the name is readable AND the row still
       * cannot grow without limit. ⚠️ "one line" BECOMES "at most two", which the render harness
       * measures — the rule was never about one line, it was about rows being the same shape. */
      /* ⛔ **NO `block` IN THIS CLASS, AND THAT IS LOAD-BEARING.** `line-clamp-2` sets
       * `display: -webkit-box` — that is how the clamp works at all — and `block` sets
       * `display: block`. Two classes, one property: whichever rule comes later in the compiled
       * stylesheet wins, and `block` won. The names wrapped to THREE lines, and the render harness is
       * what said so. ⚠️ THE ABSENCE IS ASSERTED TOO, or the next person puts it back. */
      && /text-sm font-medium leading-snug text-slate-900 line-clamp-2/.test(row)
      && !/block text-sm font-medium leading-snug/.test(row)
      && !/font-bold text-slate-900">\{pl\.name\}/.test(row)
      /* ⚠️ AND THE AREA LINE STILL TRUNCATES — it is one short value, and a second wrapping line under a
       * two-line name would make the rows three different heights. */
      && /block truncate text-xs text-slate-400/.test(row)
  })())
  /* ══ ⛔ THE SLOT THUMBNAILS ARE GONE, SO HALF THIS CLAIM GOES WITH THEM — 9 OCTOBER 2026 ═══════════
   * It asserted that both 24 × 30 slot tiles and the outlined button class were `shrink-0`, so a long
   * file name could not squeeze them. 🔴 THE TILES ARE A ✓ OR A – NOW and the cells are `table-fixed`
   * at 44px, which is a stronger guarantee than `shrink-0` ever was: a declared width on a fixed table
   * is binding, not a suggestion.
   * ⚠️ WHAT SURVIVES IS THE HALF THAT STILL HAS A SUBJECT — the outlined button, and the pane's own
   * preview area, which must not be squeezed by a long file name beside it. */
  t('⛔ …the outlined button and the pane\'s preview cannot be squeezed', (() => {
    const code = codeOf(SOCIAL)
    return /const BTN_OUTLINE =\n\s*'inline-flex shrink-0/.test(SOCIAL)
      && !/BTN_OUTLINE_ORANGE/.test(code)
      /* 🔴 THE TICK CELLS ARE FIXED-WIDTH COLUMNS, which is what replaced `shrink-0` on the tiles. */
      && (code.match(/<th className="w-\[44px\] py-1 text-center">/g) || []).length === 3
      /* ══ ⛔ THE FILE NAME IS GONE — 10 OCTOBER 2026, DOMINIC ════════════════════════════════════
       * *"remove the photo name eg Screenshot 2026-10-05 at 11.11.21.png"*. The brief had asked for it
       * truncated with an ellipsis; the operator asked for it removed, which is the later instruction.
       * 🔴 THE CLAIM IS NOW ITS ABSENCE, and that is the stronger one: the name was the only thing in a
       * picture box that ever reported a max-content width, which is what pushed Remove out of the box
       * in the first place. ⚠️ Remove IS STILL `shrink-0`, because a footer row is still a flex row. */
      && !/data-file-name/.test(code)
      && !/image\.fileName/.test(code)
      && /className="shrink-0 rounded-xl border border-slate-300 bg-white px-2\.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"/.test(code)
  })())

  /* ══ 🔴 THE EXCEPTION IS MARKED BY A **CHIP**, NOT A HEADING AND NOT A TAG ════════════════════════
   * ⛔ THE HISTORY OF THIS ONE CLAIM IS THREE REMOVALS. The "Standard" tag went on 6 October (Dominic:
   * "remove the event type from Designs for a place") because **Standard is the name of an EVENT TYPE**
   * in this product, and because a tag every row carries says only "this row is a row". The "Own
   * design" tag that replaced it went with the library model. The GROUP HEADINGS that replaced THAT
   * have now gone too.
   * 🔴 A FILTER CHIP IS THE BEST OF THE FOUR: the count is on screen BEFORE it is pressed, so an
   * operator knows whether there is anything to do without scrolling a list to find out — and the
   * table stays one flat list in one order rather than two groups an operator has to join up. */
  t('⛔ the exception is a chip with a count — no headings, and neither old tag', (() => {
    const code = codeOf(SOCIAL)
    return /data-loc-chips/.test(code)
      && (code.match(/\{chip\('/g) || []).length === 3
      /* ⚠️ `CHIP_MISSING` IS THE **RETIRED** WORDING and is still exported as the record — "Missing
       * images" became "No images" (8 October) and then "No pictures" (9 October). The live one is
       * asserted in §4c; this line is only here to prove the old constant was not quietly reused. */
      && /CHIP_MISSING = \(n: number\): string => `Missing images \$\{n\}`/.test(COPY)
      && !/CHIP_MISSING/.test(code)
      /* ⛔ AND ALL THREE RETIRED MARKERS ARE GONE. */
      && !/data-group-none/.test(code) && !/data-group-some/.test(code)
      && !/PLACE_PICTURES_NONE_HEADING/.test(code) && !/PLACE_PICTURES_SOME_HEADING/.test(code)
      && !/>Standard<\/span>/.test(code) && !/DesignTag/.test(code)
      /* 🔴 AND THE SELECTED ROW IS MARKED, which is the one thing a flat table must say: a two-pane
       * screen whose left side does not show which row the right side is about is two screens. */
      && /selectedId === pl\.id \? 'bg-orange-50' : 'hover:bg-slate-50'/.test(code)
  })())
  /* ══ ⛔ THE FOOTER COUNT IS GONE, AND THE CHIPS ARE WHY ═══════════════════════════════════════════
   * "5 locations with images · 3 without" sat under the list. Every number in it is now on a chip
   * above the list, where it is also a CONTROL — so the footer was the same facts, said twice, in the
   * place an operator reads last. ⛔ `placePicturesFooter` AND `picturesCount` ARE STILL EXPORTED and
   * nothing imports them; see the import note in SocialPosts.tsx. */
  t('⛔ the counts are on the chips, not repeated in a footer', (() => {
    const code = codeOf(SOCIAL)
    return !/placePicturesFooter/.test(code)
      && !/data-design-footer/.test(code)
      && !/picturesCount/.test(code)
      /* 🔴 AND EVERY CHIP CARRIES ITS OWN NUMBER, which is the half that replaced it. */
      && /\{chip\('all', CHIP_ALL\(visible\.length\)\)\}/.test(code)
      && /\{chip\('missing', CHIP_NO_PICTURES\(missing\.length\)\)\}/.test(code)
      && /\{chip\('hidden', CHIP_HIDDEN\(hidden\.length\)\)\}/.test(code)
  })())
  /* ⚠️ THE SCHEDULE HALF OF THIS IS GONE WITH ITS MODAL (7 October 2026). There was one `onNeedsSetup`
   * per mount and Schedule's crossed tabs to reach Designs; its mount is gone, so the only one left is
   * this file's — which does not cross a tab at all, because it IS the Designs screen's tab.
   * ⛔ `'event-design'`, NOT the Designs PILL: the problem is the STANDARD single event design, and
   * opening its editor is one press closer than landing on the pill that holds its button. */
  t('⛔ "No design yet" opens the single event design\'s own editor',
    /onNeedsSetup=\{\(\) => \{ setPosting\(null\); setView\(\{ kind: 'event-design' \}\) \}\}/.test(SOCIAL)
    /* ⛔ AND SCHEDULE NO LONGER ANSWERS THE QUESTION AT ALL — one mount, one answer. `codeOf` first,
     * because the tombstone there spells the old handler out. */
    && !/onNeedsSetup=/.test(codeOf(MANAGE)))

  /* ══ 🔴 THE "Social posts" PILL STAYS LIT ON DESIGNS (6 October 2026, reported by Dominic) ═══════
   *
   * ⛔ THE BUG: three pills, four sections. The pill row tested `shownSection === sec.id`, so standing
   * on `designs` made `'designs' === 'posts'` false and the Social posts pill rendered DESELECTED —
   * the operator was on a screen no pill claimed.
   *
   * ⛔ AND `SCHEDULE_SECTIONS`' OWN COMMENT ALREADY CLAIMED IT WORKED: *"The pill is also the active
   * one while `designs` is showing — see `shownSection` below"*. `shownSection` did no such mapping.
   * 🔴 **A COMMENT THAT ASSERTS A BEHAVIOUR IS NOT AN IMPLEMENTATION OF IT**, and a "see X below"
   * pointing at code that does not do X is worse than no comment, because it stops the next person
   * looking. Nothing checked it. This does.
   *
   * ⚠️ ASSERTED AS THE MAP **AND** THE CALL SITE **AND** THE ABSENCE OF THE OLD TEST. The map alone
   * would pass with the row still comparing the raw section; the call site alone would pass with the
   * map wrong; and leaving the old expression anywhere in the row would be a second answer. */
  /* ══ ⛔ THE PILL MODEL IS GONE — SOCIAL MEDIA IS ITS OWN TOP TAB (7 October 2026) ══════════════
   * `scheduleSectionPill`, `PILL_FOR_SECTION` and `litPill` existed because ONE Schedule pill had to
   * stay lit across TWO sections. There is no such pill now: Schedule is Events · Event types, and the
   * three social sections are pills of their own under `?tab=social`.
   * 🔴 WHAT REPLACES THE CLAIM IS STRONGER, because the failure it guarded got bigger. A retired id now
   * has to change the TAB as well as the section, and the way that goes wrong is landing on Billing or
   * Events — which is what `?section=places` did the last time a section was retired. So the four ids
   * are driven through the real resolver and their TAB is asserted, not just their section. */
  t('🔴 ALL FOUR RETIRED SCHEDULE IDS LAND ON THE SOCIAL TAB — by CALLING the resolver', (() => {
    const want = { posts: 'create', weekly: 'create', designs: 'designs', places: 'locations' }
    return Object.entries(want).every(([id, section]) => {
      const r = LINKS_MOD.resolveManageLocation('schedule', id)
      return r.tab === 'social' && r.section === section
    })
  })())
  /* ⛔ AND NEVER ON BILLING OR EVENTS, which is the brief's rule in its own words. Asserted over the
   * four ids AND over junk, because the fall-through is what sent a live bookmark to Billing before. */
  t('⛔ …and nothing lands on Billing, for any input', (() => {
    const inputs = [['schedule', 'posts'], ['schedule', 'places'], ['schedule', 'weekly'],
      ['schedule', 'designs'], ['schedule', 'nonsense'], [null, 'places'], ['social', 'nonsense'],
      [undefined, undefined], ['social', ''], ['', '']]
    return inputs.every(([t2, sec]) => LINKS_MOD.resolveManageLocation(t2, sec).tab !== 'billing')
  })())
  /* ⚠️ A LIVE SCHEDULE ID STAYS ON SCHEDULE. Without this, "everything goes to social" would pass. */
  t('⚠️ …while `events` and `event-types` stay on Schedule', (() => {
    const a1 = LINKS_MOD.resolveManageLocation('schedule', 'events')
    const b1 = LINKS_MOD.resolveManageLocation('schedule', 'event-types')
    return a1.tab === 'schedule' && a1.section === 'events'
      && b1.tab === 'schedule' && b1.section === 'event-types'
  })())
  /* ⚠️ AND A BARE `?section=` WITH NO TAB STILL WORKS — some links in the wild carry one. */
  t('⚠️ …and a bare `?section=locations` implies the social tab', (() => {
    const r = LINKS_MOD.resolveManageLocation(null, 'locations')
    return r.tab === 'social' && r.section === 'locations'
  })())
  /* ⚠️ THE PILL ROWS ARE WHAT IS ACTUALLY DRAWN. Schedule is back to two; social has three. */
  t('⚠️ Schedule is TWO pills again, and social has THREE', (() => {
    const sched = MANAGE.slice(MANAGE.indexOf('const SCHEDULE_SECTIONS'), MANAGE.indexOf('const SOCIAL_SECTIONS'))
    const soc = MANAGE.slice(MANAGE.indexOf('const SOCIAL_SECTIONS'), MANAGE.indexOf('const isScheduleSection'))
    const ids = src => [...src.matchAll(/\{ id: '([a-z-]+)', label: '([^']+)' \}/g)].map(m => `${m[1]}=${m[2]}`)
    return ids(sched).join(' | ') === 'events=Events | event-types=Event types'
      /* ⚠️ "Location settings", NOT "Locations" (7 October 2026, Dominic). The pill is MANAGEMENT —
       * give a location its two images and its name on posts — and "Locations" read like a list of
       * places to go and look at, which is what Schedule › Events already is. ⛔ THE **ID** IS STILL
       * `locations`: it is what `?section=` carries and what `?section=places` resolves onto, so
       * renaming it would break a live URL to relabel a pill. */
      && ids(soc).join(' | ') === 'create=Create a post | designs=Designs | locations=Location settings'
  })())
  /* ⛔ AND THE RETIRED MACHINERY LEFT NOTHING BEHIND. A `scheduleSectionPill` still exported, or a
   * `litPill` still computed from it, would be a second answer to a question that no longer exists. */
  t('⛔ …and `scheduleSectionPill` / `PILL_FOR_SECTION` are gone from the builder', (() => {
    const code = codeOf(LINKS)
    return !/scheduleSectionPill/.test(code) && !/PILL_FOR_SECTION/.test(code)
      && typeof LINKS_MOD.resolveManageLocation === 'function'
  })())
  /* 🔴 THE TAB ITSELF IS GATED, and filtered out rather than disabled — a tab that opens a refusal is
   * worse than no tab. Asserted on the filter, which is where the decision is made. */
  t("🔴 the Social tab is behind `schedule_graphics`, and FILTERED OUT without it", (() => {
    const code = codeOf(MANAGE)
    const filt = code.slice(code.indexOf('const tabs = allTabs.filter'), code.indexOf('const tabs = allTabs.filter') + 700)
    /* ⚠️ "Social media", NOT "Social" (7 October 2026). It shipped short as the cautious choice,
     * flagged as an open item because the bar could not be measured from here — `/manage/[token]`
     * needs a real operator session. Dominic looked at it on his laptop and asked for the full label,
     * which is that measurement taken by the person who can. */
    return /id: 'social',\s+label: 'Social media',/.test(code)
      /* ⚠️ 💬 — A SPEECH BUBBLE, NOT A LOUDSPEAKER. 📣 is broadcasting AT people, which is what an ad
       * is; a post about where the van will be is a message. */
      && /icon: '💬'/.test(code)
      && /t\.id === 'social'/.test(filt)
      && /schedule_graphics/.test(filt)
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 10 OCTOBER 2026 — TWO THINGS THE SCREEN GOT WRONG, AND THE CHECKS THAT WOULD HAVE CAUGHT THEM
// ════════════════════════════════════════════════════════════════════════════════════════════════
{
  const SP = read('components/manage/SocialPosts.tsx')

  /* ══ 🔴 THE WEEKLY CAPTION SHOWED THE **TEMPLATE** ════════════════════════════════════════════════
   *
   * ⛔ DOMINIC, 10 OCTOBER: the weekly box read `Pizza Kitchen — where we are this week:\n\n{day-list}
   * \n\nOrder ahead: {order-link}`. The 9 October round added a FILLED `caption` to both weeks in the
   * overview payload — and the card went on reading `captions.week.template`.
   * 🔴 **THE CHECK THAT PASSED WAS ASKING THE ROUTE.** `scripts/social-tab-5-local.cjs` asserted that
   * the payload carried a filled caption with no `{token}` left in it, and it was right: the server was
   * never the problem. ⚠️ A PAYLOAD ASSERTION CANNOT SEE THE SCREEN, and this is the one that can.
   * ⛔ IT IS WRITTEN AS **BOTH** HALVES OF THE CLAIM: the card reads the filled caption, AND the
   * template is no longer what `filled` is handed — so it cannot pass against the version that shipped.
   */
  t('🔴 the weekly card shows the FILLED caption, like the event card does', (() => {
    const card = SP.slice(SP.indexOf('data-create-halves'), SP.indexOf('── RIGHT · SINGLE EVENT POST'))
    return /filled=\{weekChoice\?\.caption \?\? data\.captions\?\.week\.template \?\? ''\}/.test(card)
      /* ⚠️ THE `key` IS THE FILLED TEXT TOO, which is what makes "Which week" re-seed the box — the
       * same rule the event card follows when a different event is picked. */
      && /key=\{`cap-week-\$\{weekChoice\?\.caption \?\? data\.captions\?\.week\.template \?\? ''\}`\}/.test(card)
      /* ⛔ AND THE TEMPLATE IS STILL THE TEMPLATE: "✎ Edit template" must still edit the tokens. */
      && /template=\{data\.captions\?\.week\.template \?\? ''\}/.test(card)
      /* ⛔ THE SHIPPED LINE, ASSERTED ABSENT. */
      && !/filled=\{data\.captions\?\.week\.template/.test(card)
  })())
  /* ⚠️ AND THE SERVER HALF IS STILL THERE — the two weeks each carry a caption, filled with the Make
   * screen's own two functions. ⛔ A CARD READING A FIELD NOBODY SENDS would be the same bug the other
   * way round. */
  t('⚠️ …and the overview still sends one, filled with the Make screen\'s own functions', (() => {
    const route = read('app/api/weekly-post/route.ts')
    return /caption\?: string/.test(SP)
      && /caption: captionForWeek\(thisWeek\)/.test(route)
      && /caption: captionForWeek\(nextWeek\)/.test(route)
      && /fillCaptionTemplate\(weekTplForCaption, weekCaptionValues\(\{/.test(route)
  })())

  /* ══ 🔴 "I SAVED THE TEMPLATE AND IT DIDN'T SAVE" — 10 OCTOBER 2026 ═══════════════════════════════
   *
   * ⛔ IT **DID** SAVE. The row in the database began `{week-dates} Pizza Kitchen — where we are this
   * week:` — the press wrote exactly what was asked. What did not happen is the SCREEN changing:
   * `saveCaption` deliberately did not reload, so the card went on showing a caption the server had
   * filled from the OLD template and reopening "✎ Edit template" showed the old one with the new chip
   * missing. From the operator's chair that is a save that did nothing.
   * ⛔ THE OLD REASONING WAS TRUE OF A SCREEN THAT NO LONGER EXISTS — it was written for a DEBOUNCED
   * AUTOSAVE, where reloading mid-sentence would have thrown the caret away. There is one write now, on
   * a deliberate press, after which the panel closes.
   * 🔴 ASSERTED AS BOTH HALVES: the reload is there, and the stale reasoning is gone — a comment that
   * still forbids it is the thing that would stop the next person putting it back. */
  t('🔴 saving a caption template reloads the screen, so the save is visible', (() => {
    const fn = SP.slice(SP.indexOf('const saveCaption = useCallback'), SP.indexOf('}, [token, load])') + 20)
    return /await load\(\)/.test(fn)
      && /\}, \[token, load\]\)/.test(fn)
      /* ⛔ AND THE COMMENT THAT SAID NOT TO IS GONE FROM THE FILE. */
      && !/IT DOES \*\*NOT\*\* RELOAD THE PAGE AFTERWARDS/.test(SP)
      /* ⚠️ THE CARD'S OWN `key` IS THE FILLED CAPTION, so a reload re-seeds the box rather than leaving
       * the operator's old words in it. */
      && /key=\{`cap-week-\$\{weekChoice\?\.caption/.test(SP)
  })())

  /* ══ 🔴 THE TWO ORANGE BUTTONS SAT AT DIFFERENT HEIGHTS ══════════════════════════════════════════
   * ⛔ THE EVENT HALF'S WAS DIRECTLY UNDER THE CHOSEN EVENT, ABOVE "OR PICK ANOTHER EVENT", while the
   * weekly half's was pinned to the bottom of its card. Two choices of one kind, out of step.
   * ⚠️ THE **MEASUREMENT** IS IN `scripts/social-tab-render.cjs` (with a control that restores the old
   * arrangement); this is the structural half — the button is the last thing in the half, so nothing
   * that grows above it can push the two apart again. */
  t('🔴 both make buttons are the last thing in their half, so they line up', (() => {
    const half = SP.slice(SP.indexOf('data-next-event-half'), SP.indexOf('🔴 THE CAPTION EDITOR'))
    return /<div className="mt-auto pt-3" data-post-action>/.test(half)
      /* ⛔ AFTER THE PICKER, NOT BEFORE IT — asserted by position, because a class alone cannot say
       * where in the column the element is. */
      && half.indexOf('data-pick-block') < half.indexOf('data-post-action')
      /* ⚠️ AND THE WEEKLY ONE IS STILL PINNED THE SAME WAY. */
      && /<div className="mt-auto pt-3">\s*\n\s*<button type="button" data-primary/.test(SP)
      /* ⚠️ ITS WORDS STILL NAME THE EVENT, which is what makes moving it below the picker safe. */
      && /\{chosen\.id === postable\[0\]\?\.id \? CREATE_FOR_NEXT : CREATE_FOR_THIS\}/.test(half)
  })())
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else console.log(`🔴 ${fail} CHECK(S) FAILED  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
