#!/usr/bin/env node
// scripts/places-posts-gating.cjs — Social media follows the PLAN. (Was: a preview, for one truck.)
//   node scripts/places-posts-gating.cjs     (≈1 s · NO NETWORK, NO DATABASE, NO BROWSER)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 REAIMED AT LAUNCH — 10 OCTOBER 2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ **THIS FILE USED TO PROVE THE OPPOSITE OF WHAT IT NOW PROVES**, and that is why the old claims are
// quoted rather than deleted. Until today Social media was gated on `places_posts_preview` — a
// `Feature` in NO plan set, which `canAccess` could only ever grant from `trucks.feature_overrides`,
// and which was granted to exactly one truck (test-kitchen, "Pizza Kitchen"). Eleven checks here
// asserted that arrangement: that the key was in no plan, that the route checked it FIRST, and that
// the refusal said "not switched on" rather than "upgrade", because no plan sold it.
//
// 🔴 **IT IS LAUNCHED. ONE KEY, AND IT FOLLOWS THE PLAN.** `schedule_graphics` moved from
// `MAX_FEATURES` to `PRO_FEATURES` — Pro, Max and trial — and `places_posts_preview` is gone from the
// union. So the checks below are the same questions with the answers inverted, plus two that could not
// be asked before:
//    THE PROMISE IS ENFORCED — the comparison table's 'Social media posts' row is mapped in
//      `ROW_FEATURE_MAP`, so `findPlanParityViolations()` compares `pro: true, max: true` against
//      `canAccess` on every module load. It was a hard `true` with no map entry for four days, which
//      the file itself called an unchecked promise on a public, indexed pricing page;
//    THE OLD OVERRIDE IS INERT — `{"places_posts_preview": true}` is left in the database on purpose,
//      and is PROVED to grant nothing, because `canAccess` only ever looks up a key it is given;
//
// ── 🔴 AND WHAT IT HAS ALWAYS GUARDED, IN THE ORDER IT WOULD HURT ─────────────────────────────────
//    A PRIVATE EVENT GETTING A SOCIAL POST — the venue, the town and the postcode of a wedding on a
//      picture, posted publicly. `/api/weekly-post` refuses one; the BUTTON was still on the row, so
//      the operator was offered it on Community Centre, Wed 14 Oct and got a refusal for something the
//      screen had promised;
//    A GATE THAT IS ONLY IN THE UI — the tab can be hidden and the route still answer, so an old
//      `?section=places` link or a hand-made POST would reach it anyway;
//    AND THE OPPOSITE MISTAKE, WHICH IS THE EASY ONE TO MAKE: gating something every truck ALREADY
//      HAS. Add event's place picker, Tidy up places, the usual-type pre-selection, event types,
//      private events and pricing are not part of this feature. Switching one off to tidy a gate is a
//      regression wearing a feature flag.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
// ⚠️ RE-PINNED (Language Phase 1d): the private preview's words moved into messages/*.json (`privateEvents`),
// read via useT('privateEvents'). `msgAt` reads the words at a key so a moved literal is still asserted EXACTLY.
const MSG = { 'en-GB': JSON.parse(read('messages/en-GB.json')), 'en-US': JSON.parse(read('messages/en-US.json')) }
const msgAt = (loc, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), MSG[loc])
/** 🔴 CODE, NOT PROSE. Every count in this repo taken over a whole file has eventually been satisfied
 *  by a comment quoting the string it was looking for. */
const codeOf = src => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')

const FEATURES = read('lib/features.ts')
const MANAGE_PAGE = read('app/manage/[token]/page.tsx')
const MANAGE_ROUTE = read('app/api/manage/route.ts')
const POST_ROUTE = read('app/api/weekly-post/route.ts')
/** 🔴 THE ONE KEY FOR SOCIAL MEDIA. ⚠️ Its NAME is historical — see `lib/features.ts`. */
const KEY = 'schedule_graphics'
/** ⛔ THE RETIRED PREVIEW KEY. Asserted ABSENT from the code, and asserted inert as an override. */
const OLD_KEY = 'places_posts_preview'
/** The plan sentence, read from the one module that holds it. */
/* ⚠️ RE-PINNED (Language Phase 1d Part 2): lib/copy/weeklyPost.ts no longer holds the words as a literal — the export is
 * `translatorFor(DEFAULT_LOCALE, 'weeklyPost')('planRefusal')`. So the module is COMPILED AND RUN and the export's VALUE
 * is the sentence (the same thing the old regex lifted), and it must equal the en-GB message it reads. */
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/copy/weeklyPost.ts is DELETED and there is no plan
// sentence any more (every plan has Social media). The ONE refusal is the neutral `errorsManage.feature_switched_off`,
// read here from the GB messages, and the deleted module and both retired keys are asserted ABSENT.
const SWITCHED_OFF_COPY = msgAt('en-GB', 'errorsManage.feature_switched_off')
const PLAN_SENTENCE_GONE = !fs.existsSync(path.join(REPO, 'lib/copy/weeklyPost.ts'))
  && ['en-GB', 'en-US'].every(l => msgAt(l, 'weeklyPost.planRefusal') === undefined
    && msgAt(l, 'errorsManage.social_media_plan') === undefined)

// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the plan is DATA again — public.plan_features, NO ROW = ON,
// seeded with Pay as you go switching `schedule_graphics` OFF. `canAccess` takes the truck's EFFECTIVE plan switch as a
// REQUIRED third argument, so the gate is CALLED on the seeded catalogue (the migrations themselves, through
// scripts/_plans-catalog-fixture.cjs) with lib/plans.ts's own switch — not on a hand-written stand-in.
const { compile: compileTs } = require('./_slot-interval-compile.cjs')
const PL_TREE = compileTs(REPO, ['lib/features.ts', 'lib/plans.ts'], 'gating-plans')
const PL = PL_TREE.req('lib/plans.js')
const SEED = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
const sw = (planKey) => PL.planFeatureSwitch(SEED, planKey)
const ALL_ON = () => true
const truckOn = (plan, feature_overrides = {}) => ({ plan, plan_ends_at: null, trial_expires_at: null, feature_overrides })
const NOT_ON_PLAN_COPY = msgAt('en-GB', 'errorsManage.feature_not_on_plan')

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)
const head = s => { console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 86 - s.length))}`) }
const show = r => {
  for (const n of r.ok) console.log('  ✓ ' + n)
  for (const n of r.bad) console.log('  🔴 ' + n)
  fails += r.bad.length
  const out = { ok: [...r.ok], bad: [...r.bad] }
  ok.length = 0; bad.length = 0
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE KEY IS IN NO PLAN, SO ONLY AN OVERRIDE CAN GRANT IT
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · the key is a PLAN key — Pro, Max and trial — and the preview key is gone')
{
  const code = codeOf(FEATURES)
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the Feature type is DERIVED from the runtime array
  // `FEATURES` (`type Feature = (typeof FEATURES)[number]`), so the member is the array entry `'schedule_graphics',`.
  t('🔴 it is a `Feature`, so it goes through the ONE function that answers "may this truck do this"',
    new RegExp(`^\\s*'${KEY}',$`, 'm').test(code.slice(code.indexOf('export const FEATURES = ['), code.indexOf('] as const')))
    && /export type Feature = \(typeof FEATURES\)\[number\]/.test(code))
  /* ══ 🔴 THE INVERTED CLAIM. This check used to read "it appears exactly ONCE — the union member, no
   * plan set", and that single occurrence WAS the gate: a Feature in no set reaches `canAccess`'s last
   * line and returns false for every tier. ⛔ IT MUST NOW APPEAR **TWICE**: the union member and the
   * `PRO_FEATURES` entry. ⚠️ TWICE AND NOT MORE — a third occurrence would mean it had also been added
   * to `MAX_FEATURES` or a `PLAN_FEATURES` set, which is a duplicate in a Set rather than a second
   * grant, and is the kind of redundancy that makes the next reader wonder which one is load-bearing. */
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): there are no plan sets any more (every active plan has
  // every feature), so the key appears exactly ONCE — the union member — and `canAccess` grants it with no override.
  const uses = (code.match(new RegExp(`'${KEY}'`, 'g')) || []).length
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): still ONCE — which plan has it is a public.plan_features row, not code.
  t(`🔴 …and it appears exactly ONCE in lib/features.ts — the union member; there are no plan sets (${uses})`,
    uses === 1)
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the PRO/MAX/TRIAL spread is gone with the tiers — the
  // check is now that NO plan set and no plan-reading helper survives in the code.
  t('🔴 …and no plan set exists to hold it — PLAN_FEATURES / PRO / MAX / TRIAL and hasFeature are gone',
    !/\b(PLAN_FEATURES|PRO_FEATURES|MAX_FEATURES|TRIAL_FEATURES|hasFeature|getPlanFeatures|requiredPlan)\b/.test(code))
  /* ══ ⛔ AND THE PREVIEW KEY IS GONE FROM THE **CODE** ════════════════════════════════════════════
   * ⚠️ FROM THE CODE, NOT FROM THE FILE: `codeOf` strips comments, and the tombstone that explains the
   * removal quotes the name several times. A check that matched the prose would fail on the tombstone
   * — which is a mistake this workstream made twice in one day and recorded both times. */
  t('⛔ `places_posts_preview` is gone from lib/features.ts — union, every plan set, everywhere',
    !code.includes(OLD_KEY))
  t('⛔ …and from every product file that used to check it', (() => {
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/plan-features.ts is deleted; its frozen content
    // lives in lib/legacy-pricing-display.ts, which is read in its place.
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): lib/legacy-pricing-display.ts is deleted; the plan table's
    // rows are lib/feature-table.ts, read in its place.
    const files = ['app/manage/[token]/page.tsx', 'app/api/manage/route.ts',
      'app/api/weekly-post/route.ts', 'lib/feature-table.ts']
    return files.every(f => !codeOf(read(f)).includes(OLD_KEY))
  })())
  /* ⚠️ AND `canAccess` STILL READS THE OVERRIDES FIRST. Unchanged mechanism — asserted because the
   * next check depends on it, and because reversing that order would silently change every
   * per-truck grant in the product. */
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): `canAccess(feature, featureOverrides)` reads NO plan
  // at all — the override is consulted first and the fall-through is `return true`. The ordering claim becomes
  // "override first, then allow", and the signature is asserted to carry no plan / expiry parameter.
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the order is override → the effective plan's switch → allowed,
  // decided in `featureBlock` (which canAccess returns `=== null` of). The plan switch is a REQUIRED third parameter.
  const fb = code.slice(code.indexOf('export function featureBlock'), code.indexOf('export function canAccess'))
  const overrideAt = fb.indexOf('hasOwnProperty.call(o, feature)')
  const planAt = fb.indexOf("return planAllows(feature) ? null : 'plan'")
  t('⚠️ `canAccess` consults feature_overrides FIRST, then the effective plan\'s switch, else allows',
    overrideAt > 0 && planAt > overrideAt
    && /export function canAccess\(feature: Feature, featureOverrides: Record<string, boolean> \| null \| undefined, planAllows: PlanFeatureSwitch\): boolean \{\s*\n\s*return featureBlock\(feature, featureOverrides, planAllows\) === null/.test(code))

  /* ══ 🔴 THE TIERS, BY CALLING `canAccess` — NOT BY READING A COMMENT ═════════════════════════════
   * ⛔ THE ONE CHECK IN THIS FILE'S HISTORY THAT CAUGHT A REAL SHIPPED BUG was this one: the refusal
   * said "Pro and Max" about a key in `MAX_FEATURES` alone, and it was found by calling `canAccess`
   * for every plan rather than believing the sentence. So the tiers are called, every time. */
  const { compile } = require('./_slot-interval-compile.cjs')
  const F = compile(REPO, ['lib/features.ts'], 'gating-features').req('lib/features.js')
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): there are no tiers to call. The gate is OVERRIDE-ONLY,
  // so the three states of the override are called instead: none → allowed, `true` → allowed, `false` → denied.
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the tiers are back as DATA. Called on the seeded
  // catalogue: Pay as you go has it OFF (its plan_features row), Pro, Unlimited, the trial, demo and tester ON (no row);
  // an override `true` grants it on Pay as you go, `false` denies it on Pro.
  t('🔴 the plan decides — off on Pay as you go, on for every other seeded plan; an override wins both ways',
    F.canAccess.length === 3 && !!SEED && SEED.features.length > 0
    && F.canAccess(KEY, {}, sw('payg')) === false && F.canAccess(KEY, null, sw('payg')) === false
    && ['pro', 'unlimited', 'trial', 'demo', 'tester'].every(k => F.canAccess(KEY, {}, sw(k)) === true)
    && F.canAccess(KEY, { [KEY]: true }, sw('payg')) === true
    && F.canAccess(KEY, { [KEY]: false }, sw('pro')) === false
    && F.featureBlock(KEY, {}, sw('payg')) === 'plan' && F.featureBlock(KEY, { [KEY]: false }, sw('pro')) === 'override'
    && PL.truckCan(truckOn('payg'), SEED, KEY) === false && PL.truckCan(truckOn('pro'), SEED, KEY) === true)
  /* ══ 🔴 "THE DATABASE ROW BECOMES HARMLESS" — PROVED, NOT ASSERTED ═══════════════════════════════
   * ⛔ THE LAUNCH DELIBERATELY LEAVES `{"places_posts_preview": true}` IN `trucks.feature_overrides`
   * rather than running an UPDATE, and the whole safety of that rests on one property of `canAccess`:
   * it only ever looks up the key it is GIVEN. A stale override naming a key that is no longer a
   * `Feature` can therefore neither grant nor deny anything.
   * 🔴 AND THIS IS ALSO WHY THE KEY WAS REMOVED RATHER THAN PROMOTED. Had `places_posts_preview` stayed
   * and joined `PRO_FEATURES`, Pizza Kitchen would still be granted by its OVERRIDE — overrides win
   * first — so the one truck used to check the launch would be the one truck not testing the new gate. */
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): with no plan to deny it, "grants nothing" is proved as
  // "decides nothing": a stale `false` does not deny, and a stale `true` cannot outvote a real `false` on the key.
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): with a plan that DENIES it again, the original claim
  // returns: a stale `true` grants nothing on Pay as you go, a stale `false` denies nothing on Pro, and it cannot outvote
  // a real `false` on the key.
  t('🔴 a stale `places_posts_preview` override decides NOTHING — the database row is inert',
    F.canAccess(KEY, { [OLD_KEY]: false }, sw('pro')) === true
    && F.canAccess(KEY, { [OLD_KEY]: true }, sw('payg')) === false
    && F.canAccess(KEY, { [OLD_KEY]: true, [KEY]: false }, sw('pro')) === false)

  /* ══ 🔴 THE PROMISE IS ENFORCED NOW, WHICH IT WAS NOT ════════════════════════════════════════════
   * ⛔ 'Social media posts' WAS A HARD `true` ON A PUBLIC PRICING PAGE WITH NO `ROW_FEATURE_MAP` ENTRY,
   * so `findPlanParityViolations()` `continue`d past it and the table promised what no plan granted.
   * ⚠️ THE GUARD IS **RUN**, not read: it is the function the landing, /features, Billing and Admin all
   * depend on at module load, and a violation would take all four out in dev. */
  /* ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/plan-features.ts is deleted; the row is FROZEN
   * display in lib/legacy-pricing-display.ts ("Display only. Nothing may gate on this."), and ROW_FEATURE_MAP /
   * findPlanParityViolations are deleted with the tiers they compared against. So the row is asserted still there,
   * unchanged, with its GB name — and the drift guard is asserted GONE from the code, since nothing gates on it. */
  /* ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the frozen display copy is DELETED. The row is now
   * `{ id: 'social_media_posts', group: 'marketing', feature: 'schedule_graphics' }` in lib/feature-table.ts — GATED BY
   * THE KEY, so the promise is enforced by data again: a plan whose switch is off shows "—" (lib/plan-offer.ts tableCell
   * → planAllowsFeature). The old drift guard stays gone; the row's `feature` IS the parity now. Asserted by calling
   * tableCell on the seeded catalogue rather than reading the line. */
  const FT = codeOf(read('lib/feature-table.ts'))
  const PO = compile(REPO, ['lib/plan-offer.ts', 'lib/feature-table.ts'], 'gating-offer')
  const OFFER = PO.req('lib/plan-offer.js'), TABLE = PO.req('lib/feature-table.js').FEATURE_TABLE
  const smRow = TABLE.find(r => r.id === 'social_media_posts')
  const smCells = smRow ? OFFER.offerPlans(SEED, 'GB').map(p => [p.plan.key, OFFER.tableCell(SEED, smRow, p)]) : []
  t('🔴 the comparison table row is still there, in lib/feature-table.ts, gated by the key', (() => {
    const gbMsg = JSON.parse(read('messages/en-GB.json'))
    return /\{ id: 'social_media_posts', group: 'marketing', feature: 'schedule_graphics' \}/.test(FT)
      && !!smRow && smRow.feature === KEY
      && gbMsg.planFeatures?.row?.social_media_posts?.name === 'Social media posts'
      && !fs.existsSync(path.join(REPO, 'lib/plan-features.ts')) && !fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts'))
  })())
  t(`🔴 …and its cells follow the plan switch — ${smCells.map(([k, c]) => k + ' ' + c).join(', ')} (— where the plan has it off)`,
    smCells.length >= 2 && smCells.every(([k, c]) => c === (PL.planAllowsFeature(SEED, k, KEY) ? 'on' : 'off'))
    && smCells.find(([k]) => k === 'payg')?.[1] === 'off' && smCells.find(([k]) => k === 'pro')?.[1] === 'on')
  t('🔴 …and the old drift guard stays GONE — no ROW_FEATURE_MAP, no findPlanParityViolations, no canAccess in the table',
    !/\bROW_FEATURE_MAP\b/.test(FT) && !/\bfindPlanParityViolations\b/.test(FT)
    && !/\bcanAccess\(/.test(FT))
  /* ⛔ AND THE CELLS NO LONGER SAY "coming soon" — in either tier. The cells are what carried that
   * label (Dominic's own correction on 6 October: cells, not a badge), so this is where launching it
   * is visible, and all four renderers follow from here. */
  t('⛔ …and neither cell says `coming_soon` any more', (() => {
    // ⚠️ RE-PINNED (Language Phase 1e): the row line is `{ id: 'social_media_posts', starter: …, pro: …, max: … }` (no name).
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): read from lib/legacy-pricing-display.ts (plan-features deleted).
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): coming soon is now the row's `comingSoon` flag — absent here,
    // so no plan's cell is 'soon'.
    return !!smRow && !smRow.comingSoon && smCells.every(([, c]) => c !== 'soon')
  })())
}
const s1 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE SCREEN: THE TWO PILLS, THE TWO PANES, AND A STALE BOOKMARK
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · the pills and panes are gated, and an old ?section= link lands on Events')
{
  const code = codeOf(MANAGE_PAGE)
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the call is `canAccess(key, truck.feature_overrides)` —
  // no plan argument exists any more; same one resolution, from the same truck row.
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the call is `features.can(key)` on the tab's
  // `const features = useFeatures(truck)` (override → the effective plan's switch, from the plan catalogue).
  t('🔴 the Schedule tab resolves the key once, from the truck row it already has',
    new RegExp(`const canPlacesPosts = features\\.can\\('${KEY}'\\)`).test(code)
    && /const features = useFeatures\(truck\)/.test(code))
  /* ══ 🔴 THE GATE MOVED UP A LEVEL — 7 October 2026 ══════════════════════════════════════════════
   * ⛔ IT USED TO DECIDE WHETHER SCHEDULE SHOWED A THIRD PILL, and these six checks were about that
   * pill: the filtered row, the derived `shownSection` that sent a gated id to Events in the same
   * render, the canonicalisation ordering, the URL tidy-up, and the two panes.
   * 🔴 SOCIAL MEDIA IS ITS OWN **TOP TAB** NOW AND THE GATE IS ON THE TAB. Which is a simpler and
   * stronger arrangement, and the checks below say why rather than merely following it: a truck
   * without the key has no tab, so there is no section of Schedule to fall through from, nothing to
   * tidy out of the URL, and no frame in which a gated pane could render.
   * ⚠️ FILTERED, NOT DISABLED — unchanged, and still the point, though the REASON changed at launch.
   * It used to be "nothing on the screen can say when it will work, and no plan sells it". Now a plan
   * does sell it, and the answer is the same for a different reason: **every other plan-gated TAB on
   * this bar is filtered the same way**, and Billing is where a plan is changed. ⛔ A GREYED TAB WOULD
   * BE A NEW PATTERN on the one bar an operator uses every day. */
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): `t` is the page's translator now (useT('manageShell')), so the filter's
  // and the bar's parameter is `tab`. Same filter, same key, same list rendered.
  t('🔴 the TOP TAB is filtered by an OVERRIDE — a plan without it keeps the tab, which opens on the upgrade prompt',
    /if \(tab\.id === 'social'\) \{/.test(code)
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): `canAccess(truck?.plan ?? 'starter', key, …)` →
    // `canAccess(key, truck?.feature_overrides)` — override-only; the tab is still filtered by the same key.
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): INTENDED: a truck whose PLAN switches the key off
    // (Pay as you go) now SEES the tab and gets <FeatureGate>'s upgrade prompt inside; only an OVERRIDE hides it. So the
    // filter is `featureAccessView(…).block(key) !== 'override'`, and the prompt is asserted in §4.
    && new RegExp(`return tab\\.roles\\.includes\\(userRole\\)\\s*\\n\\s*&& featureAccessView\\(truck, planCatalog, truck\\?\\.country \\?\\? null\\)\\.block\\('${KEY}'\\) !== 'override'`).test(code)
    /* ⛔ AND IT IS THE `tabs` LIST THE BAR RENDERS, not a second filtered copy. */
    && /const tabs = allTabs\.filter\(tab => \{/.test(code)
    && /\{tabs\.map\(tab => \(/.test(code))
  /* ⛔ AND THE PANE IS MOUNTED BEHIND THE SAME ANSWER. A tab an operator cannot see is not a
   * sufficient guard on its own: `activeTab` is state, and a legacy URL sets it. The mount tests
   * `activeTab === 'social'`, and `activeTab` can only become `'social'` through a tab the filter
   * produced or a `?tab=` the parser honours — so the second half is the ROUTE, asserted in §4. */
  t('🔴 the pane is mounted only while the social tab is active, and only one of them',
    /\{activeTab === 'social' && truck && \(/.test(code)
    && /<SocialPostsPane truck=\{truck\} token=\{token\}/.test(code)
    && (code.match(/<SocialPostsPane /g) || []).length === 1)
  /* 🔴 SCHEDULE'S PILLS ARE NOW THE SAME FOR EVERY TRUCK, which is what "nothing about the top bar
   * changes for them" means one level down. ⛔ SO `visibleSections` IS THE WHOLE LIST AND
   * `shownSection` IS THE SECTION — asserted, because an unused filter left behind would be a gate
   * the next person assumes is live. */
  t('⛔ Schedule has nothing left to filter — two pills, ungated, for every truck',
    /const visibleSections = SCHEDULE_SECTIONS$/m.test(code)
    && /const shownSection: ScheduleSection = section$/m.test(code)
    && !/SCHEDULE_SECTIONS\.filter\(/.test(code)
    && /const SCHEDULE_SECTIONS: \{ id: ScheduleSection; label: string \}\[\] = \[/.test(code))
  /* ⚠️ `canPlacesPosts` IS STILL READ, AND BY EXACTLY ONE THING: the "Make post" shortcut on an event
   * row, because the screen it opens is gated. ⛔ A COUNT, BECAUSE "still read" AND "read once" ARE
   * DIFFERENT CLAIMS and only the second one says the gate did not leak. */
  t('⚠️ `canPlacesPosts` survives for ONE reader — the "Make post" shortcut', (() => {
    const uses = (code.match(/\bcanPlacesPosts\b/g) || []).length
    return uses === 2  // the declaration, and the one guard
      // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): override-only call, as in the check above.
      // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): `features.can(key)`, as in the check above.
      && new RegExp(`const canPlacesPosts = features\\.can\\('${KEY}'\\)`).test(code)
      && /\{!event\.is_private && canPlacesPosts && \(/.test(code)
  })())
  /* ══ ⛔ AND A STALE BOOKMARK STILL CANNOT REACH A GATED SCREEN ══════════════════════════════════
   * This is the claim the old `shownSection` derivation existed for, and it is now answered by the
   * resolver plus the tab filter rather than by a fall-through inside Schedule.
   * 🔴 `?section=places` RESOLVES TO THE **SOCIAL** TAB — so on a truck without the key the parser
   * selects a tab that is not in `tabs`, the bar lights nothing, and the pane's `activeTab === 'social'`
   * mount is the only thing that could draw it. ⚠️ WHICH IS WHY §4's ROUTE GATE IS THE ONE THAT
   * MATTERS: every action behind that pane refuses without the key, so the worst case is an empty
   * pane rather than a working one. Said here rather than left implied. */
  t('⛔ a legacy `?section=` lands on the SOCIAL tab, whose tab and routes are both gated',
    /places: 'locations',/.test(read('lib/manage-links.ts'))
    && /const moved = resolveManageLocation\(tabParam, sectionParam\)/.test(code)
    && code.indexOf('const moved = resolveManageLocation(tabParam, sectionParam)')
       < code.indexOf("if (moved.tab === 'social'"))
}
const s2 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · "Make post" — ABSENT ON A PRIVATE EVENT, AND WITHOUT THE KEY
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · "Make post" is absent on a private event, and absent without the key')
{
  const code = codeOf(MANAGE_PAGE)
  /* ⛔ ABSENT, NOT DISABLED. A private event has no post — `/api/weekly-post` refuses one — so a
   * disabled button would be promising something that will never exist. The Private chip on the row
   * already says why. */
  /* ⚠️ IT HANDS THE EVENT TO THE SOCIAL TAB NOW (7 October 2026) rather than opening a modal here —
   * so the assertion names `onOpenSocial('create', event.id)`. The GATE is unchanged and is still
   * both halves: not private, and the truck holds the key. */
  t('🔴 the button is gated on BOTH: not private, AND the truck holds the key',
    /\{!event\.is_private && canPlacesPosts && \(/.test(code)
    && /onOpenSocial\('create', event\.id\)/.test(code)
    /* ⛔ AND THE GUARD IS THE ONE DIRECTLY ABOVE THAT BUTTON, not a coincidental pair elsewhere in a
     * 16,000-line file — asserted on the gap between them. */
    && code.indexOf("onOpenSocial('create', event.id)")
       - code.indexOf('{!event.is_private && canPlacesPosts && (') < 200)
  /* 🔴 AND THE ROUTE REFUSES IT TOO. The screen decides what is DRAWN; the route decides what is
   * DONE, and a hand-made POST never passes through the screen. */
  t('⛔ …and `event_post` / `event_render` are behind the same route gate',
    /if \(action === 'event_post'\)/.test(POST_ROUTE)
    && /if \(action === 'event_render'\)/.test(POST_ROUTE))
}
const s3 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE ROUTES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · the routes refuse without the key — and refuse with the right sentence')
{
  const code = codeOf(POST_ROUTE)
  /* 🔴 ONE `gated(truck)` AT THE TOP OF POST GUARDS EVERY ACTION IN THE FILE, which is why the
   * weekly post's render and save AND the single-event post's two actions are all behind it. */
  /* ══ 🔴 ONE CHECK, NOT TWO — AND THE ORDERING CLAIM IS GONE WITH THE SECOND KEY ══════════════════
   * ⛔ THIS USED TO BE THREE CHECKS: that the route tested the preview key, that it tested it BEFORE
   * `schedule_graphics`, and that the refusal said "not switched on" rather than naming a plan. All
   * three existed because there were TWO gates in front of this feature and the order decided which
   * sentence a Max truck was told. 🔴 THERE IS ONE GATE NOW, so the ordering has nothing to order and
   * the sentence has nothing to choose between. ⚠️ A COUNT IS WHAT SAYS SO: exactly one `canAccess`
   * call in `gated()`, and the retired key nowhere in the file's code. */
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): `gated` takes the truck's locale too (its refusal is worded in it), so the
  // anchor is `gated(truck: TruckRow, locale: string)`; the slice is otherwise the same.
  const g = code.slice(code.indexOf('function gated(truck: TruckRow, locale: string)'), code.indexOf('async function loadDesign'))
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the call is `canAccess('schedule_graphics',
  // truck.feature_overrides ?? null)` — no `as never` cast and no plan argument; still exactly one call.
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): `gated` is async and asks lib/plan-refusal.ts
  // `featureRefusal(truck, key, locale)` (override → effective plan's switch → allowed, and WHICH refusal); still one call.
  t('🔴 /api/weekly-post has ONE gate, on the feature key',
    new RegExp(`const off = await featureRefusal\\(truck, '${KEY}', locale\\)`).test(g)
    && (g.match(/featureRefusal\(|canAccess\(|truckCan\(/g) || []).length === 1
    && /^async function gated\(truck: TruckRow, locale: string\): Promise<NextResponse \| null>/m.test(code)
    && !g.includes(OLD_KEY))
  /* ⛔ AND IT GUARDS THE **GET** AS WELL AS THE POST. The font file §2 of round 7 added is a GET on
   * this route, and a plan gate that only covered POST would serve a truck's fonts to a plan that
   * cannot have the feature. ⚠️ ASSERTED ON BOTH HANDLERS, because there are two entry points now and
   * there was one when this file was written. */
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): `gated(truck)` → `gated(truck, locale)` — the locale is read on the line
  // above (`localeForTruck`), so it is still the first thing each handler does after finding the truck.
  t('🔴 …and it is called at the top of BOTH handlers — the POST and the font GET',
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): `gated` is async now, so both handlers `await` it.
    /export async function GET\(req: NextRequest\)[\s\S]{0,900}const locale = await localeForTruck\(truck\)\s*\n\s*const blocked = await gated\(truck, locale\)\s*\n\s*if \(blocked\) return blocked/.test(code)
    && /export async function POST\(req: NextRequest\)[\s\S]{0,700}const locale = await localeForTruck\(truck\)\s*\n\s*const blocked = await gated\(truck, locale\)\s*\n\s*if \(blocked\) return blocked/.test(code))
  /* ⚠️ RE-PINNED (Language Phase 1d Part 2): the route no longer imports WEEKLY_POST_PLAN_REFUSAL; `gated` refuses with
   * the `errorsManage.social_media_plan` code (through `refuse`, worded in the truck's language). ⚠️ WEAKER, SAID SO:
   * "ONE shared sentence" was one imported symbol; it is now a second message key, held to the constant by asserting
   * its GB words ARE the constant's value and that en-US overrides neither key with different words. Still no
   * literal in the route. */
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): `social_media_plan` → `feature_switched_off` (no plan
  // sentence — every plan has it); its GB words are pinned and en-US may not override them with different words.
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): TWO refusals, chosen by lib/plan-refusal.ts and passed
  // through by code: off by the PLAN → `feature_not_on_plan` (naming the plan), off by an OVERRIDE → `feature_switched_off`.
  // The route names neither code; it forwards `off.code` / `off.params`. Both message keys' GB words are pinned.
  t('⚠️ …and the refusal is the ONE shared pair of messages, never a literal in the route',
    /return off \? refuse\(locale, off\.code, 403, off\.params as Record<string, string>\) : null/.test(g)
    && NOT_ON_PLAN_COPY === '{many, select, yes {{feature} are included on {plan}.} other {{feature} is included on {plan}.}}'
    && [undefined, NOT_ON_PLAN_COPY].includes(msgAt('en-US', 'errorsManage.feature_not_on_plan'))
    && !/'Social media posts are included/.test(codeOf(POST_ROUTE))
    && SWITCHED_OFF_COPY === 'This feature is switched off for your truck.'
    && [undefined, SWITCHED_OFF_COPY].includes(msgAt('en-US', 'errorsManage.feature_switched_off'))
    && !/'This feature is switched off/.test(codeOf(POST_ROUTE))
    && !/'Social media posts are on/.test(codeOf(POST_ROUTE))
    && !/not switched on/.test(codeOf(POST_ROUTE)))

  /* ══ 🔴 THE PLAN SENTENCE SAYS "Pro and Max", BECAUSE THE KEY IS IN `PRO_FEATURES` ═══════════════
   * ⛔ THE ONE CHECK IN THIS FILE'S HISTORY THAT CAUGHT A SHIPPED BUG, AND IT IS KEPT POINTING THE
   * OTHER WAY. On 5 October the sentence said "Pro and Max" about a key in `MAX_FEATURES` alone — so a
   * Pro truck was told the weekly post came with their plan and then refused it. It was found by
   * calling `canAccess` for every plan rather than reading the comments, and the fix pinned the
   * wording to "Max". 🔴 THE KEY HAS NOW MOVED TO `PRO_FEATURES`, SO "Max" BECAME THE MIRROR IMAGE OF
   * THE SAME BUG: it would send a Starter truck to buy the wrong plan and tell a Pro truck the feature
   * is not on their plan when it is.
   * ⚠️ THE GATE AND THE SENTENCE ARE ASSERTED TOGETHER, which is the whole point: pinning the wording
   * alone would pass again the moment the key moved, and pinning the key alone would pass with the
   * wrong sentence. */
  {
    const { compile } = require('./_slot-interval-compile.cjs')
    const F = compile(REPO, ['lib/features.ts'], 'gating-features').req('lib/features.js')
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the tiers are gone, so "Pro AND Max" becomes the
    // override-only answer — still CALLED, not read: allowed with no override, denied only by its own `false`.
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the tiers are data. Called on the seeded catalogue:
    // off for a Pay as you go truck BECAUSE OF ITS PLAN, on for Pro / Unlimited / the trial, and an ended plan resolves to
    // the expiry fallback (Pay as you go) WITH its switches — so an expired trial loses it too.
    t('🔴 `schedule_graphics` follows the plan — off on Pay as you go (and on an ended plan), on for Pro, Unlimited and the trial',
      PL.featureAccess(truckOn('payg'), SEED, KEY).block === 'plan'
      && ['pro', 'unlimited', 'trial'].every(k => PL.truckCan(truckOn(k), SEED, KEY) === true)
      && PL.truckCan({ plan: 'trial', plan_ends_at: null, trial_expires_at: '2020-01-01T00:00:00Z', feature_overrides: {} }, SEED, KEY) === false
      && F.canAccess(KEY, { [KEY]: false }, sw('pro')) === false
      && F.canAccess(KEY, { event_types: false, private_events: false }, sw('pro')) === true)
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): with no plan to name, the 5 October bug's mirror is a
    // refusal that names ANY plan. The sentence is the neutral one, it names no plan, and the plan sentence's module
    // and both its message keys are gone.
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the 5 October bug's mirror is back in its original form:
    // the plan the refusal names must be a plan that HAS the feature. It is computed (upgradePlanFor — the first active
    // public plan, in sort order, with it on), never written: Pro on the seed, which is checked to have it ON. The
    // override refusal still names NO plan, and the old plan sentence's module and keys stay gone.
    t('⛔ …so the plan refusal names a plan that HAS it (Pro, computed), and the override refusal names none',
      PL.featureAccess(truckOn('payg'), SEED, KEY).upgradeTo?.key === 'pro'
      && PL.upgradePlanFor(SEED, KEY)?.name === 'Pro' && PL.planAllowsFeature(SEED, 'pro', KEY) === true
      && !/\b(Pro|Max|Starter|Unlimited)\b/.test(NOT_ON_PLAN_COPY) && /\{plan\}/.test(NOT_ON_PLAN_COPY)
      && SWITCHED_OFF_COPY === 'This feature is switched off for your truck.'
      && !/\b(Pro|Max|Starter|plan)\b/.test(SWITCHED_OFF_COPY)
      && PLAN_SENTENCE_GONE)
    /* ⚠️ AND IT IS THE SAME STRING ON ALL THREE SURFACES. Two copies is what made the 5 October error
     * possible; there are three readers now, so the argument is stronger rather than weaker. */
    /* ⚠️ RE-PINNED (Language Phase 1d Part 2): the SCREEN still imports the constant; BOTH ROUTES now refuse with the
     * `social_media_plan` code (/api/weekly-post's `gated`, and /api/manage's PLACES_TAB_ONLY gate). ⚠️ WEAKER, SAID
     * SO: "one constant" becomes "one constant + one message key whose words are asserted identical" (GB exactly, and
     * en-US overriding neither). Still no literal on any of the three surfaces. */
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the screen no longer imports a sentence — its
    // FeatureGate takes only the feature and the truck's overrides (no plan, no upgradeMessage), and shows nothing
    // when off; BOTH routes refuse with the one `feature_switched_off` code. Still no literal on any surface.
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): <FeatureGate> takes the TRUCK (it resolves override →
    // plan itself and shows <PlanPrompt> when the plan is why); both routes go through lib/plan-refusal.ts featureRefusal
    // (/api/manage via its `gateFeature`), so they send the SAME code for the same truck.
    t('⚠️ …and the screen gates on the same key with no plan sentence, and BOTH routes send the ONE code',
      /<FeatureGate\s+feature="schedule_graphics"\s+truck=\{truck\}\s*>/.test(codeOf(read('components/manage/SocialPosts.tsx')))
      && /if \(block === 'plan'\) return <PlanPrompt feature=\{feature\} upgradeTo=\{access\.upgradeTo\(feature\)\} \/>/.test(codeOf(read('components/FeatureGate.tsx')))
      && !/WEEKLY_POST_PLAN_REFUSAL|upgradeMessage|lib\/copy\/weeklyPost/.test(codeOf(read('components/manage/SocialPosts.tsx')))
      && /refuse\(locale, off\.code, 403, off\.params/.test(codeOf(POST_ROUTE))
      && /PLACES_TAB_ONLY\.includes\(action\)[\s\S]{0,200}const refused = await gateFeature\('schedule_graphics'\)\s*\n\s*if \(refused\) return refused/.test(codeOf(MANAGE_ROUTE))
      && /const gateFeature = async \(feature: Feature\) => \{\s*\n\s*const r = await featureRefusal\(truck, feature, await truckLocale\(\)\)/.test(codeOf(MANAGE_ROUTE))
      && PLAN_SENTENCE_GONE && !!SWITCHED_OFF_COPY
      && !/'Social media posts are on/.test(codeOf(read('components/manage/SocialPosts.tsx')))
      && !/'Social media posts are on/.test(codeOf(POST_ROUTE))
      && !/'Social media posts are on/.test(codeOf(MANAGE_ROUTE)))
    /* 🔴 AND THE OTHER TWO KEYS, FOR THE SAME REASON — the Gusto list in docs/release-prep-report.md
     * states each one's plan, and this is what makes that statement a check rather than a claim.
     * ⛔ `places_posts_preview` HAS LEFT THIS LIST because it has left the product; §1 proves it is
     * gone and that a stale override grants nothing. */
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): no tiers — both keys are on for every truck and
    // each is denied only by its OWN override (and not by the other's).
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): called with each seeded plan's switch: no plan
    // switches either off (Pay as you go's rows are WhatsApp, Social media and Instagram only), so each is still off
    // only by its own override.
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): 20261026_pricing_pages.sql switches `event_types` OFF for
    // Pay as you go (a plan_features row). So event_types is off on payg by its PLAN, on every other seeded plan; an
    // override `true` grants it past the plan; private_events is still on for every plan, off only by its own override.
    t('🔴 `private_events` is on for every truck, `event_types` for every plan but Pay as you go — each else off only by its own override',
      SEED.plans.every(p => F.canAccess('private_events', {}, sw(p.key)) === true)
      && SEED.plans.filter(p => p.key !== 'payg').every(p => F.canAccess('event_types', {}, sw(p.key)) === true)
      && F.canAccess('event_types', {}, sw('payg')) === false && F.featureBlock('event_types', {}, sw('payg')) === 'plan'
      && F.canAccess('event_types', { event_types: true }, sw('payg')) === true
      && F.canAccess('event_types', { event_types: false }, sw('pro')) === false
      && F.canAccess('private_events', { private_events: false }, sw('pro')) === false
      && F.canAccess('private_events', { event_types: false }, sw('payg')) === true)
  }
  t('🔴 …and the gate runs before any action is dispatched',
    // ⚠️ RE-PINNED (Language Phase 1d Part 2): `gated(truck)` → `gated(truck, locale)`; still directly before dispatch.
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): `await gated(truck, locale)` — async now.
    /const blocked = await gated\(truck, locale\)\s*\n\s*if \(blocked\) return blocked\s*\n\s*\n?\s*const action = String\(body\.action \?\? ''\)/.test(code))

  const m = codeOf(MANAGE_ROUTE)
  /* ══ 🔴 THE SPLIT IS THE POINT, AND BOTH HALVES ARE ASSERTED ═══════════════════════════════════
   *   GATED — what exists only inside the Places TAB.
   *   UNGATED — `sg_places` and `sg_upsert_place`, which the Add event picker and Tidy up places both
   *     call. Every truck on this branch has those; gating either would switch off a shipped control. */
  /* ⛔ RE-AIMED (5 October 2026): FIVE OF THE SIX GATED ACTIONS NO LONGER EXIST. The pictures pane and
   * "Events here" were deleted, and `sg_place_pictures`, `sg_place_picture_url`,
   * `sg_place_picture_save`, `sg_place_picture_remove` and `sg_place_events` went with them.
   * 🔴 SO THE CLAIM IS NOW TWO CLAIMS, and the second is the one that keeps this honest: what remains
   * is gated, AND the five are gone from the ROUTE ENTIRELY — not merely absent from the list, which is
   * what an action that had been quietly un-gated would also look like. */
  const GATED = ['sg_place_usual_type']
  const list = m.slice(m.indexOf('const PLACES_TAB_ONLY = ['), m.indexOf('if (action === \'sg_places\')'))
  for (const a of GATED) t(`🔴 \`${a}\` is behind the key`, list.includes(`'${a}'`))
  for (const a of ['sg_place_pictures', 'sg_place_picture_url', 'sg_place_picture_save',
    'sg_place_picture_remove', 'sg_place_events']) {
    t(`⛔ \`${a}\` is GONE from the route — not un-gated, deleted`, !new RegExp(`action === '${a}'`).test(m))
  }
  t('🔴 …and the gate is one check, before the actions, with the key named',
    new RegExp(`PLACES_TAB_ONLY\\.includes\\(action\\)[\\s\\S]{0,160}'${KEY}'`).test(m))
  /* ⛔ THE UNGATED HALF. Asserted as "NOT in the list", by name, so adding one later is a visible
   * change to this file rather than a quiet regression in a screen nobody is testing. */
  for (const a of ['sg_places', 'sg_upsert_place', 'sg_merge_place']) {
    t(`⛔ \`${a}\` is NOT gated — the Add event picker and Tidy up places call it`,
      !new RegExp(`'${a}'`).test(list))
  }
  /* ⚠️ AND THE PRE-SELECTION READ IS NOT GATED EITHER. It arrives with the `sg_places` rows, and it
   * is what fills the type pill when a place is picked — which every truck keeps. */
  const et = codeOf(read('app/api/event-types/route.ts'))
  t('⛔ `usual_for_venue` — the Add event pre-selection — has NO preview gate',
    /action === 'usual_for_venue'/.test(et) && !et.includes(KEY))
  t('⛔ …and neither do event types, private events or pricing',
    !codeOf(read('lib/private-events/write.ts')).includes(KEY))
}
const s4 = show({ ok, bad })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE PRIVATE PREVIEW CARD (A.3)
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · the Add/Edit preview shows a private event as a private event')
{
  const code = codeOf(MANAGE_PAGE)
  /* 🔴 IT READS THE PILL, NOT THE DATABASE. `is_private` is not written until Save, so the preview
   * must reflect the TYPE CURRENTLY SELECTED — the same expression the save sends as `is_private`. */
  t('🔴 the preview reads the SELECTED type, falling back to the saved flag while types load',
    /const previewIsPrivate = privateTypeId\s*\n\s*\? eventTypeId === privateTypeId\s*\n\s*: \(editingEvent\?\.is_private === true\)/.test(code))
  t('🔴 …which is the same expression the SAVE sends as `is_private`',
    /const chosenPrivate = !!privateTypeId && eventTypeId === privateTypeId/.test(code))
  /* ⛔ THE VENUE, TOWN AND POSTCODE ARE NOT RENDERED AT ALL in the private branch — not greyed, not
   * struck through, not in a title attribute. A private address that is on the screen "but hidden" is
   * an address that leaks the first time someone copies the DOM. */
  const branch = (() => {
    const a = code.indexOf('{previewIsPrivate ? (')
    const b = code.indexOf(') : (', a)
    return a > 0 && b > a ? code.slice(a, b) : ''
  })()
  t('🔴 the private card is a LOCK and "Private event" in purple, as the title',
    branch.length > 200
    && /text-purple-700/.test(branch)
    && /🔒/.test(branch)
    // ⚠️ RE-PINNED (Language Phase 1d): the title is tP('publicName') (useT('privateEvents')), not the imported
    // constant; asserted as that call in the branch AND the GB words at privateEvents.publicName.
    && /const tP = useT\('privateEvents'\)/.test(code)
    && /<span aria-hidden="true">🔒<\/span>\{tP\('publicName'\)\}/.test(branch)
    && msgAt('en-GB', 'privateEvents.publicName') === 'Private event')
  t('⛔ …and it renders NO venue, town, postcode or address — not even greyed out',
    branch.length > 200
    && !/venue_name/.test(branch) && !/\btown\b/.test(branch)
    && !/postcode/.test(branch) && !/\baddress\b/.test(branch))
  t('🔴 …but it DOES show the date, the times and the van chip',
    /placeShortDayLocal\(editingEvent\.event_date \|\| null\)/.test(branch)
    // Phase 2B (10 October 2026): the times are in the truck's style, so the call carries its settings.
    && /timeRangeLabel\(editingEvent\.start_time, editingEvent\.end_time, ts\)/.test(branch)
    && /previewVanName/.test(branch))
  /* ⚠️ THE WORDS ARE THE PUBLIC SURFACES' OWN CONSTANT, so the operator's preview and a customer's
   * card cannot be two different pairs of words. */
  // ⚠️ RE-PINNED (Language Phase 1d): the preview no longer imports PRIVATE_PUBLIC_LABEL; it reads
  // privateEvents.publicName. The claim (preview title and the public card's title are ONE string) is now
  // asserted as: that message equals the constant's value lifted from resolve.ts, in GB, and en-US does not
  // override it with different words (it falls back to GB). A value-equality, not a shared symbol.
  t('⚠️ "Private event" is the shared constant, not two more words', (() => {
    const lifted = (read('lib/private-events/resolve.ts')
      .match(/export const PRIVATE_PUBLIC_LABEL = '([^']+)'/) || [])[1]
    const us = msgAt('en-US', 'privateEvents.publicName')
    return !!lifted
      && /\{tP\('publicName'\)\}/.test(code)
      && msgAt('en-GB', 'privateEvents.publicName') === lifted
      && (us === undefined || us === lifted)
  })())
  /* 🔴 AND THE LINE UNDER IT. "Filled from …" answers "will editing this change the place?"; on a
   * private event the question is "where did my venue go?", and that is what this answers. */
  // ⚠️ RE-PINNED (Language Phase 1d): PRIVATE_PREVIEW_NOTE was deleted from lib/private-events/copy.ts; the
  // sentence is privateEvents.form.previewNote, asserted exactly in en-GB (en-US says "ZIP code").
  t('🔴 the line under the card names the three fields that are not published',
    msgAt('en-GB', 'privateEvents.form.previewNote') === 'How it shows on your schedule — no venue, town or postcode.')
  // ⚠️ RE-PINNED (Language Phase 1d): {PRIVATE_PREVIEW_NOTE} → {tP('form.previewNote')} at the same site.
  t('⛔ …and it REPLACES "Filled from", rather than sitting beside it',
    /\{previewIsPrivate \? \(\s*\n\s*<p className="text-\[11px\] text-slate-400 -mt-1">\{tP\('form\.previewNote'\)\}<\/p>\s*\n\s*\) : !editingEvent\.id && editingEvent\.truck_place_id \? \(/.test(code))
  /* ⚠️ NOT CONDITIONAL ON A PICKED PLACE. It is true of every private event, typed address or not —
   * which "Filled from" is not, and that difference is why the two lines are not one. */
  t('⚠️ …and the private line is NOT conditional on `truck_place_id`',
    !/previewIsPrivate && editingEvent\.truck_place_id/.test(code))
}
const s5 = show({ ok, bad })

// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────────
const total = [s1, s2, s3, s4, s5].reduce((n, r) => n + r.ok.length, 0)
console.log(`\n${fails === 0 ? `✅ all ${total} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
process.exit(fails === 0 ? 0 : 1)
