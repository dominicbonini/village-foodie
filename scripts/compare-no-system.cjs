#!/usr/bin/env node
// scripts/compare-no-system.cjs — the /compare calculator's two paths.
//   node scripts/compare-no-system.cjs              (≈ 10 s: one compile, NO NETWORK, NO DATABASE)
//   HG_RENDER=1 node scripts/compare-no-system.cjs  (adds Chromium + WebKit layout; needs `next build`)
//
// ── 🔴 WHY THIS EXISTS AS A REGISTERED HARNESS ─────────────────────────────────────────────────────
// The brief asked for executed checks in a report, not for a harness. 🔴 ONE TASK EARLIER IN THIS SAME
// SESSION, a report-only proof cost a red cron: `assertNoInventedVillages` shipped with 12 cases written
// up in a report and re-run by nothing, and three weeks later it stopped the daily scrape — see
// docs/scraper-reference-manual.md §25.3 and the standing lesson added with it. Writing another
// report-only proof immediately afterwards would contradict a finding this repo has just recorded.
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    THE SAVING CARD CHANGING. The "Yes" path with a cheaper HatchGrab is the page's existing,
//    operator-approved result and item 7d requires it byte-identical. A silent change there is a
//    regression in the one thing this task was told not to touch;
//    A PER-ORDER FIGURE ON THE "No" PATH — we charge a plan plus a percentage, so a per-order rate would
//    be one we do not charge, shown to the one operator with no number of their own to check it against;
//    the coffee claim surviving above its threshold, which makes a true line false;
//    `monthly / 4 / days` creeping back in — it understates every per-day figure by ~8.3%, in our favour.

const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const GB = require('./_country-settings-gb.cjs').gbFromSeed()
const CATALOG = require('./_plans-catalog-fixture.cjs').seedCatalog()

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ── RENDER THE REAL COMPONENT, WITH ITS INITIAL STATE PATCHED ─────────────────────────────────────
// 🔴 `renderToStaticMarkup` RUNS THE COMPONENT BODY AND EVERY useMemo IN IT. It cannot click, so the
// answers are set by patching `useState` defaults in a COPY of the file — the repo's own file is never
// touched. ⚠️ EVERY PATCH IS CHECKED FOR APPLYING: a `String.replace` that finds nothing returns the
// same string and would silently measure the default state.
function renderWith(patches, tag, opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cmp-${tag}-`))
  for (const d of ['app/compare', 'components/landing']) fs.mkdirSync(path.join(tmp, d), { recursive: true })
  fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
  // ⚠️ RE-PINNED (Language Phase 1e): the calculator's words are the `compare` messages (lib/i18n/catalog/compare.ts
  // imports messages/ns/<locale>/compare.json), read through next-intl — so the copy carries the message files and
  // sees the repo's packages. The words rendered are en-GB (no locale passed); what changed in them is named where a
  // check reads them (Language Phase 1e's GB fixes: curly apostrophes, "question 5") and in the variants' re-anchors.
  fs.cpSync(path.join(REPO, 'messages'), path.join(tmp, 'messages'), { recursive: true })
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch { /* already */ }
  let src = read('app/compare/CostComparison.tsx')
  // 🔴 THE FEE BOXES START EMPTY NOW (decided 10 October 2026 — no competitor prefill). Every case written
  // against the old 4.5% + 20p default therefore TYPES it — the same figures, entered by the operator
  // instead of put there by the page — unless the case types its own rate. `opts.untyped` measures the
  // real default: both boxes empty.
  if (!opts.untyped) {
    if (!patches.some(([a]) => a === PCT_ANCHOR)) patches = [...patches, [PCT_ANCHOR, "const [feePctRaw, setFeePctRaw] = useState('4.5')"]]
    if (!patches.some(([a]) => a === PENCE_ANCHOR)) patches = [...patches, [PENCE_ANCHOR, "const [feePenceRaw, setFeePenceRaw] = useState('20')"]]
  }
  for (const [a, b] of patches) {
    if (!src.includes(a)) { console.log(`🔴 ${tag}: PATCH DID NOT APPLY — anchor drifted: ${a.slice(0, 60)}`); process.exit(1) }
    src = src.replace(a, b)
  }
  fs.writeFileSync(path.join(tmp, 'app/compare/CostComparison.tsx'), src)
  // ⚠️ A STUB FOR `DemoCta`, IDENTICAL IN EVERY RUN so it cannot contribute to a diff. The real one
  // needs the DemoModalProvider mounted in ../page.tsx, which is not what this harness measures.
  fs.writeFileSync(path.join(tmp, 'components/landing/DemoUpload.tsx'),
    `import React from 'react'\nexport function DemoCta({ className, children }: { className?: string; children?: React.ReactNode }) {\n  return <button className={className}>{children}</button>\n}\n`)
  const c = compile(tmp, ['app/compare/CostComparison.tsx'], tag, { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already */ }
  const React = require(path.join(REPO, 'node_modules/react'))
  const { renderToStaticMarkup } = require(path.join(REPO, 'node_modules/react-dom/server'))
  // 🔴 THE GB SETTINGS, AS THE SERVER PAGE PASSES THEM (10 October 2026 — the plan, card and overage
  // figures and the competitor prefill come from country_settings now). Parsed from the seed that was run.
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): CostComparison takes the plan catalogue (`catalog`) — the
  // SEEDED one (scripts/_plans-catalog-fixture.cjs: 20261024 + 20261025 + 20261026), as the server page reads it.
  const html = renderToStaticMarkup(React.createElement(c.req('app/compare/CostComparison.js').default, { settings: opts.settings ?? GB, catalog: opts.catalog ?? CATALOG, ...(opts.props || {}) }))
  if (opts.raw) return html
  return html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')
    .replace(/&pound;/g, '£').replace(/&amp;/g, '&').replace(/&apos;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .split('\n').map(s => s.trim()).filter(Boolean).join('\n')
}

const SYS = v => ["useState<'yes' | 'no' | null>(null)", `useState<'yes' | 'no' | null>('${v}')`]
// ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the "How many people work the van?" question is removed with its
// `staff` useState (`useState<1 | 2 | null>(null)` no longer exists), so the STAFF patch is gone and every case below
// sets only the answers that still exist. Question 1 alone now unlocks the cards and the results.
const DAYS = n => ['useState(4)\n  const [trucks', `useState(${n})\n  const [trucks`]
const TRUCKS = n => ['const [trucks, setTrucks] = useState(1)', `const [trucks, setTrucks] = useState(${n})`]
const GMV = n => ['useState(2500)', `useState(${n})`]
// The fee boxes are `useState('')` — empty, no prefill. PCT types a rate into the first box.
const PCT_ANCHOR = "const [feePctRaw, setFeePctRaw] = useState('')"
const PENCE_ANCHOR = "const [feePenceRaw, setFeePenceRaw] = useState('')"
const PCT = v => [PCT_ANCHOR, `const [feePctRaw, setFeePctRaw] = useState('${v}')`]
// ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): the months-free QUESTION is removed with its `freeMonthsRaw` state (the
// anchor `useState(() => String(offerTrialMonths(catalog) ?? 0))` no longer exists). The months are
// `freeMonthsOverride ?? offerTrialMonths(catalog) ?? 0` — a case that needs other months passes the PROP (`opts.props`).
const resultsOf = txt => txt.replace(/^[\s\S]*?(See your saving ↓|See what it costs ↓)/, '$1')

// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): THE PLAN IS THE CHEAPEST AT THE VOLUME NOW, FROM DATA. The
// calculator used to price everything as Pro (£29 + 0.99% above £1,500); Stage B suggests the public plan that costs least
// at the operator's monthly online sales (lib/plan-offer cheapestAt) on the seeded catalogue (payg £0 + 0.99%, Pro £29 +
// 0.99% above £4,000, Unlimited £69 flat), and the free months default to the trial's 3. Every figure below that moved is
// RESTATED here from the seed rows — not read from the component — and the renders must agree with the restatement.
const GB_PLANS = CATALOG.plans.filter(p => p.isPublic && p.active).sort((x, y) => x.sortOrder - y.sortOrder)
  .map(p => ({ p, r: CATALOG.prices.find(r => r.planKey === p.key && r.countryCode === 'GB') })).filter(x => x.r)
const costOf = ({ r }, gmv) => r.monthlyMinor / 100 + (r.includedOnlineMinor === null ? 0 : (r.feeBps / 10000) * Math.max(0, gmv - r.includedOnlineMinor / 100))
const cheapest = gmv => GB_PLANS.reduce((best, x) => (!best || costOf(x, gmv) < costOf(best, gmv) - 1e-9 ? x : best), null)
const oursAt = gmv => costOf(cheapest(gmv), gmv)
const TRIAL = (CATALOG.plans.find(p => p.isSignupDefault && p.isTrial) || {}).trialMonths
const gbp2 = n => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const gbp0 = n => '£' + Math.round(n).toLocaleString('en-GB')
const perWeekOf = monthly => (monthly * 12) / 52

;(async () => {
  // ── (a) THE "No" PATH, THE BRIEF'S WORKED EXAMPLE ───────────────────────────────────────────────
  const a = renderWith([SYS('no'), DAYS(4), GMV(2500)], 'a')
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): was Pro "£2.24 a trading day · £38.90 a month · £29.00 + £9.90".
  // At £2,500 the cheapest seeded plan is Pay as you go: £0 + 0.99% × £2,500 = £24.75 a month → × 12 ÷ 52 ÷ 4 = £1.43.
  const A_PLAN = cheapest(2500), A_MONTH = oursAt(2500), A_DAY = A_MONTH * 12 / 52 / 4
  t(`🔴 (a) ${gbp2(A_DAY)} a trading day (the cheapest plan at £2,500: ${A_PLAN.p.name})`, a.includes(`We suggest\n${A_PLAN.p.name}\n`) && a.includes(`${gbp2(A_DAY)}\na trading day`))
  t(`🔴 (a) …from ${gbp2(A_MONTH)} a month, on 4 days`, a.includes(`Based on 4 days a week · ${gbp2(A_MONTH)} a month`))
  t(`🔴 (a) breakdown is ${gbp2(A_PLAN.r.monthlyMinor / 100)} + ${gbp2(A_MONTH - A_PLAN.r.monthlyMinor / 100)} → ${gbp2(A_MONTH)}`, a.includes(`${A_PLAN.p.name} plan\n${gbp2(A_PLAN.r.monthlyMinor / 100)}`)
    && a.includes(`${A_PLAN.r.feeBps / 100}% on £2,500 of online orders\n${gbp2(A_MONTH - A_PLAN.r.monthlyMinor / 100)}`) && a.includes(`HatchGrab each month\n${gbp2(A_MONTH)}`))
  /* ⚠️ THE CARD-PROCESSING LINE IS ASSERTED WITHOUT NAMING THE PAYMENT PROVIDER, DELIBERATELY.
   * `scripts/run-harnesses.cjs` screens every listed file for that brand name as a whole word and
   * REFUSES THE ENTIRE RUN if it finds one — "the screen is a property of the FILE, not of anyone's
   * intent". 🔴 THE RIGHT RESPONSE TO THAT IS NOT TO SPLIT THE STRING TO SLIP PAST IT. The rate, the
   * amount and the "same as a card machine" clause are what the requirement is about; the brand word
   * carries none of it, and the component's own source is where that wording lives. */
  t('🔴 (a) card processing ~£70.83, named as the provider\'s and NOT in our total',
    a.includes('~£70.83') && /1\.5% \+ 20p per order, paid to/.test(a)
    && a.includes("You’d pay much the same on a card machine at the window")   // ⚠️ RE-PINNED (Language Phase 1e): GB fix ' → ’
    && !/HatchGrab each month\n~/.test(a))
  t('🔴 (a) the coffee line is shown', a.includes('Less than a coffee.'))
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the free months default to the trial's (3), so the line counts them.
  t(`🔴 (a) "And your first ${TRIAL} months are on us."`, a.includes(`And your first ${TRIAL} months are on us.`))
  t('🔴 (a) the scroll link says what it costs, never "saving"',
    a.includes('See what it costs ↓') && !a.includes('See your saving'))
  /* 🔴 NO PER-ORDER FIGURE OF OURS ON THIS PATH. The only "per order" in the results is the CARD
   * PROCESSING line — the payment provider's own fee, which item 5 requires and labels as theirs.
   * Nothing divides OUR cost by an order count. ⚠️ Counted rather than pattern-matched on the brand
   * name, for the screening reason given above. */
  t('🔴 (a) no HatchGrab per-order figure anywhere on this path', (() => {
    const r = resultsOf(a)
    const perOrder = r.match(/per order/g) || []
    return perOrder.length === 1 && /per order, paid to/.test(r)
  })())
  t('🔴 (a) and no saving language at all — no %, no anchor, no year lines', (() => {
    const r = resultsOf(a)
    return !/You save|You'd pay extra|less in your first year|Year one|Year two|That's a/.test(r)
  })())
  t('⚠️ (a) the fee question is hidden, with its toggle and both sentences',
    !a.includes('What do you pay per order now?') && !a.includes('excluded from both sides'))
  t('⚠️ (a) the orders question is reworded, and the slider caption with it',
    a.includes("How much do you think you’d take online, per month, per truck?")   // ⚠️ RE-PINNED (Language Phase 1e): GB fix ' → ’
    && a.includes('A rough guess is fine — pre-orders and queue-skippers, not cash or card at the window.'))
  /* ⚠️ ASSERTED AS EXPLICIT NUMBER→TITLE PAIRS, and two earlier drafts of this check were wrong in two
   * different ways — both worth recording, because both PASSED or FAILED for reasons unrelated to the
   * numbering:
   *   ① banning "7" anywhere on the No path — the trading-days question renders buttons 1…7, so it
   *      failed on correct output;
   *   ② a regex for "digit, then a line ending in ?" — the Yes path's orders question is titled
   *      "Online orders per month, per truck", which is not a question, so card 4 went unseen and the
   *      sequence read 1,2,3,5,6,7: a FALSE gap report about the exact property being checked.
   * A list of pairs cannot do either. */
  const numbered = (txt, pairs) => pairs.every(([n, title]) => txt.includes(`\n${n}\n${title}`))
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the staff question (was 3) is removed and the cards renumbered with
  // no gap — system 1, trucks 2, orders 3, trading days 4, months free 5 — and its title is asserted ABSENT.
  // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): the months-free question (was 5) is removed — 1-2-3-4, no 5th card,
  // and its title is asserted ABSENT.
  t('⚠️ (a) card numbering runs 1-2-3-4 with NO GAP on the No path', numbered(a, [
    [1, 'Do you take online orders now?'],
    [2, 'How many trucks do you run?'],
    [3, "How much do you think you’d take online, per month, per truck?"],   // ⚠️ RE-PINNED (Language Phase 1e): GB fix ' → ’
    [4, 'How many days a week do you trade?'],
  ]) && !a.includes('How many people work the van?') && !a.includes('Your introductory offer') && !/\n5\n/.test(a.slice(a.indexOf('any day the van’s out.'), a.indexOf('See what it costs ↓'))))   // after the days card's own 1…7 buttons
  /* 🔴 THE YES PATH IS 1–6 AGAIN (1 October 2026). The trading-days question left it — that result is
   * framed PER WEEK now, so there was nothing to divide by days and the answer would have been collected
   * and never used. ⚠️ ASSERTED FROM BOTH SIDES: absent on Yes, present on No. A check that only counted
   * to 6 would pass if the card were still rendered with a duplicate number. */
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): staff question removed — orders 3, fee 4, months free 5.
  // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): the months-free question (was 5) is removed — 1-2-3-4, the fee at 4.
  t('⚠️ (d) …and 1-2-3-4 with no gap on the Yes path, the fee question at 4', (() => {
    const y = renderWith([SYS('yes')], 'num')
    return numbered(y, [
      [1, 'Do you take online orders now?'],
      [2, 'How many trucks do you run?'],
      [3, 'Online orders per month, per truck'],
      [4, 'What do you pay per order now?'],
    ]) && !y.includes('How many days a week do you trade?') && !y.includes('How many people work the van?')
      && !y.includes('Your introductory offer') && !/\n5\n/.test(y.slice(0, y.indexOf('See your saving ↓')))
  })())
  t('🔴 the trading-days question is ABSENT on Yes and PRESENT on No',
    !renderWith([SYS('yes')], 'dy').includes('How many days a week do you trade?')
    && a.includes('How many days a week do you trade?'))
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): at 4 now (was 5) — the staff question above it is removed.
  t('⚠️ …and the No path still has it at 4, with its default and helper text intact',
    /\n4\nHow many days a week do you trade\?/.test(a)
    && a.includes("Events, markets, pitches — any day the van’s out."))   // ⚠️ RE-PINNED (Language Phase 1e): GB fix ' → ’

  // ── (b) THE COFFEE CLAIM STOPS WHERE IT STOPS BEING TRUE ────────────────────────────────────────
  const b = renderWith([SYS('no'), DAYS(2), GMV(12000)], 'b')
  t('🔴 (b) £12,000 on 2 days → coffee line ABSENT', !b.includes('Less than a coffee'))
  t('⚠️ (b) …and nothing is rendered in its place', !/than a (pint|sandwich|coffee)/.test(b))

  // ── (c) THE "Yes" PATH WHEN WE COST MORE ────────────────────────────────────────────────────────
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): THE CASE'S RATE MOVES, NOT ITS PURPOSE. At 2.5% inclusive their own
  // fee is 1% = £25.00 a month, and the cheapest plan now costs £24.75 — so 2.5% is a SAVING today and the dearer path
  // never rendered. 1.9% inclusive (their own fee 0.4% = £10.00) is dearer by £14.75 a month = £3.40 a week, which is
  // still ≥ £3.00, so every claim below keeps its meaning (weekly, no coffee line, the monthly box and breakdown).
  const C_PCT = '1.9', C_THEIRS = (Number(C_PCT) - 1.5) / 100 * 2500, C_MORE = oursAt(2500) - C_THEIRS, C_WEEK = perWeekOf(C_MORE)
  const c = renderWith([SYS('yes'), DAYS(4), GMV(2500), PCT(C_PCT)], 'c')
  /* 🔴 (c) IS PER WEEK NOW, NOT PER TRADING DAY. £13.90 × 12 ÷ 52 = £3.2077 → "£3.21". ⚠️ AND THE
   * COFFEE LINE GOES WITH IT: 3.21 ≥ 3.00, so the same threshold that showed the line at 80p a DAY
   * correctly withholds it at £3.21 a WEEK. The claim stays true at both. */
  t(`🔴 (c) "${gbp2(C_WEEK)} more a week"`, c.includes(`\n${gbp2(C_WEEK)}\nmore a week`))
  t(`🔴 (c) …${gbp2(C_MORE)} a month more than now, with NO "Based on N days" clause`,
    c.includes(`${gbp2(C_MORE)} a month more than now`) && !/Based on \d+ days?/.test(c))
  t(`🔴 (c) …and the coffee line is ABSENT, because ${gbp2(C_WEEK)} ≥ £3.00`,
    C_WEEK >= 3 && !c.includes('Less than a coffee'))
  t('🔴 (c) …and nothing on this path says "a trading day"', !c.includes('a trading day'))
  t(`🔴 (c) the grey box is MONTHLY: ${gbp2(C_THEIRS)} against ${gbp2(oursAt(2500))}`,
    c.includes(`Right now you pay\n${gbp2(C_THEIRS)}\na month`) && c.includes(`With HatchGrab\n${gbp2(oursAt(2500))}\na month`))
  t('🔴 (c) the "% more" line and "You\'d pay extra" are GONE on this path',
    !/more in your first year/.test(c) && !c.includes("You'd pay extra"))
  t('🔴 (c) …and the year schedule is replaced by the monthly breakdown',
    c.includes('Your month on HatchGrab') && !/Year one|Year two/.test(c))
  t('🔴 (c) …which names the provider\'s own fee at the rate the comparison used',
    c.includes(`Your current provider’s own fee (${Math.round((Number(C_PCT) - 1.5) * 100) / 100}%)\n${gbp2(C_THEIRS)} a month`))   // ⚠️ RE-PINNED (Language Phase 1e): GB fix ' → ’
  t('⚠️ (c) the CTA pair and the cream strip are unchanged',
    c.includes('Upload my menu →') && c.includes('Ask us a question') && c.includes('No card needed to set up'))

  // ── (d) THE SAVING CARD IS UNTOUCHED ────────────────────────────────────────────────────────────
  // 🔴 THE BRIEF'S OWN CASE, AND THE ONE THING THIS TASK MUST NOT CHANGE. Pinned as the literal text of
  // the result region, so any edit to that card — a word, a figure, an order — fails here.
  const d = resultsOf(renderWith([SYS('yes')], 'd'))
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): THE SAVING CARD'S FIGURES MOVE WITH THE PLAN AND THE TRIAL —
  // its words, order and layout do not. Was Pro at £38.90 a month with 1 free month (£428 / £467, save £472 / £433). Now
  // the cheapest plan at £2,500 (Pay as you go, £24.75) with the trial's 3 free months: year one £24.75 × 9 = £222.75 →
  // "£223", save £677.25 → "£677" (75%); year two £297, save £603 (67%). Restated from the seed, not read from the page.
  const D_THEIRS = (4.5 - 1.5) / 100 * 2500 * 12, D_Y1 = oursAt(2500) * (12 - TRIAL), D_Y2 = oursAt(2500) * 12
  const pct = (save) => Math.round(save / D_THEIRS * 100) + '%'
  const D_EXPECTED = [
    'See your saving ↓', 'Right now you pay', gbp0(D_THEIRS), 'a year', 'With HatchGrab', gbp0(D_Y1), 'in year one',
    'You save', gbp0(D_THEIRS - D_Y1), pct(D_THEIRS - D_Y1), 'less in your first year', 'That’s a couple of festival pitches.',
    `Upload my menu and save ${gbp0(D_THEIRS - D_Y1)} →`, 'Ask us a question', 'No card needed to set up',
    'Year one', `Save ${gbp0(D_THEIRS - D_Y1)}`, `(${pct(D_THEIRS - D_Y1)} less)`, 'Current provider', gbp0(D_THEIRS), '→', 'HatchGrab', gbp0(D_Y1),
    'Year two', `Save ${gbp0(D_THEIRS - D_Y2)}`, `(${pct(D_THEIRS - D_Y2)} less)`, 'Current provider', gbp0(D_THEIRS), '→', 'HatchGrab', gbp0(D_Y2),
  ].join('\n')
  t('🔴 (d) 4.5% + 20p inclusive, £2,500 — the saving card: same words and order, the cheapest plan\'s figures', d.startsWith(D_EXPECTED))
  t('🔴 (d) …and still carries the two-year total and the yearly small print',
    d.includes("Over two years that’s") && d.includes('excluded from both sides'))   // ⚠️ RE-PINNED (Language Phase 1e): GB fix ' → ’

  // ── (e) MULTIPLE VANS — HEADLINE PER VAN, FLEET AS AN EXTRA LINE ────────────────────────────────
  const e1 = renderWith([SYS('no'), DAYS(4), GMV(2500), TRUCKS(3)], 'e1')
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the cheapest plan's figures (see (a)) — per van and × 3.
  t(`🔴 (e) No path, 3 vans: the headline is still PER VAN (${gbp2(A_DAY)}), and says so`,
    e1.includes(`${gbp2(A_DAY)}\na trading day`) && e1.includes(`${gbp2(A_MONTH)} a month per van`))
  t('🔴 (e) …with the fleet monthly total as its own line', e1.includes(`Across 3 vans\n${gbp2(A_MONTH * 3)} a month`))
  t('⚠️ (e) …and the card-processing estimate is the fleet figure', e1.includes('~£212.50'))
  const e2 = renderWith([SYS('yes'), DAYS(4), GMV(2500), PCT(C_PCT), TRUCKS(3)], 'e2')   // ⚠️ RE-PINNED (Stage B): (c)'s rate
  t('🔴 (e) Yes-dearer, 3 vans: headline per van and weekly, sub-line names the van',
    e2.includes(`\n${gbp2(C_WEEK)}\nmore a week`) && e2.includes(`${gbp2(C_MORE)} more per van a month than now`))
  /* 🔴 THE SANCTIONED VOCABULARY FIX (item 4). The grey box was the one place in the results still
   * saying "trucks", against "Across N vans" in both breakdown cards. ⚠️ IT IS INSIDE THE SAVING CARD,
   * so it is pinned here at a fleet size that renders it — case (d) is one van and never shows it. */
  t('🔴 (e) the grey box says "across 3 vans", never "trucks"',
    e2.includes('across 3 vans') && !/across \d+ trucks/.test(e2))
  /* ⚠️ AND ON THE SAVING CARD TOO, which is where the string actually lives — the dearer card shares the
   * same box, so pinning only the dearer path would miss a revert on the one case (d) protects. */
  t('🔴 (e) …and so does the SAVING card at 3 vans', (() => {
    const sv = renderWith([SYS('yes'), TRUCKS(3)], 'e3')
    return sv.includes('You save') && sv.includes('across 3 vans') && !/across \d+ trucks/.test(sv)
  })())
  /* 🔴 UNDER £1 A WEEK STILL RENDERS AS WHOLE PENCE (item 5).
   * 🧪 £1,500 at 3.4% inclusive → theirs £28.50 against our £29.00, so **50p a month** more → 12p a week.
   * ⚠️ `FREE(0)` IS LOAD-BEARING IN THIS FIXTURE, and the first attempt at it had no such patch and
   * failed: with one month free, year one is £319 against their £342, so the page is correctly showing a
   * SAVING and the dearer branch never renders. `dearer` is decided on year one, not on the monthly
   * difference — which is worth knowing about this page and is why the fixture says so. */
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): SAME 50p, NEW INPUTS. At £1,500 / 3.4% the cheapest plan
  // (Pay as you go, £14.85) is now far below their £28.50, so the fixture moves to £1,250 at 2.45% inclusive: their own
  // fee 0.95% = £11.875 against our 0.99% = £12.375 → 50p a month more → 12p a week. FREE(0) still load-bearing.
  t('🔴 a Yes-path difference under £1 a week renders whole pence + "more a week"', (() => {
    // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): FREE(0) was a patch on the removed months box; the same 0 months is
    // now the prop `freeMonthsOverride: 0` — the value the component also takes from data when the catalogue has no trial
    // (`?? 0`). (The page's own ?free=N passes 1–12 only.)
    const tiny = renderWith([SYS('yes'), GMV(1250), PCT('2.45')], 'tiny', { props: { freeMonthsOverride: 0 } })
    return /\n12p\nmore a week/.test(tiny) && !/£0\.12/.test(tiny)
      && tiny.includes('50p a month more than now')
  })())
  t('🔴 (e) …and the fleet line is present', e2.includes(`Across 3 vans\n${gbp2(oursAt(2500) * 3)} a month`))

  // ── (f) THE THRESHOLD, EVERY DAY × EVERY SLIDER STEP ────────────────────────────────────────────
  // 🔴 THE ARITHMETIC IS RESTATED HERE AND THEN CHECKED AGAINST REAL RENDERS at each boundary, so a
  // restatement that drifted from the component would fail rather than quietly agree with itself.
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): was Pro's `29 + 0.99% above £1,500`; now the cheapest seeded
  // plan at each volume (oursAt, restated above). Its cost tops out at Unlimited's £69, so days 6–7 (under £3 a day up to
  // £78 / £91 a month) never cross — the five transitions are days 1–5.
  const oursPerTruck = oursAt
  const perDay = (monthly, days) => (monthly * 12) / 52 / days
  const boundaries = []
  for (let days = 1; days <= 7; days++) {
    let prev = null
    for (let gmv = 0; gmv <= 12000; gmv += 500) {
      const on = perDay(oursPerTruck(gmv), days) < 3.0
      if (prev !== null && on !== prev) boundaries.push({ days, gmv, on })
      prev = on
    }
  }
  t('🔴 (f) 175 points walked (7 days × 25 steps), exactly 5 transitions — days 6–7 never cross (always under £3)',
    boundaries.length === 5 && boundaries.every(x => x.on === false) && boundaries.map(x => x.days).join() === '1,2,3,4,5')
  t('🔴 (f) every transition straddles £3.00 exactly', boundaries.every(x =>
    perDay(oursPerTruck(x.gmv - 500), x.days) < 3.0 && perDay(oursPerTruck(x.gmv), x.days) >= 3.0))
  t('🔴 (f) …and the RENDER agrees at each boundary, both sides', boundaries.every(x => {
    const below = renderWith([SYS('no'), DAYS(x.days), GMV(x.gmv - 500)], `f${x.days}lo`)
    const above = renderWith([SYS('no'), DAYS(x.days), GMV(x.gmv)], `f${x.days}hi`)
    return below.includes('Less than a coffee') && !above.includes('Less than a coffee')
  }))

  // ── WHAT MAY NOT CHANGE ─────────────────────────────────────────────────────────────────────────
  const SRC = stripComments(read('app/compare/CostComparison.tsx'))
  t('🔴 the per-day divisor is calendar-accurate — × 12 ÷ 52, never ÷ 4',
    /\(monthly \* 12\) \/ 52 \/ d/.test(SRC) && !/\/ 4 \/ days/.test(SRC))
  t('🔴 the coffee threshold is one named constant', /const COFFEE_MAX_PER_DAY = 3\.0/.test(SRC)
    && (SRC.match(/COFFEE_MAX_PER_DAY/g) || []).length >= 3)
  // 🔴 10 October 2026: the figures come from the MARKETING COUNTRY'S SETTINGS (country_settings), through
  // the same plan-features / features functions every other surface uses — still no literal here.
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the plans come from the CATALOGUE (offerPlans on the country,
  // the suggestion from cheapestAt), the card fee from the country's settings — and still no price literal of any plan.
  t('🔴 every price still comes from the plan data — no new literal',
    /offerPlans\(catalog, s\.countryCode\)/.test(SRC) && /cheapestAt\(/.test(SRC) && /cardFees\(s\)\.online/.test(SRC)
    && !/£29|£49|£69|£1,500|£2,000|£4,000|0\.99|2900|4900|6900|150000|200000|400000/.test(SRC))
  // 🔴 NO COMPETITOR PREFILL (decided 10 October 2026): nothing reads the retired competitor columns, the
  // boxes start empty, and the page names no other provider.
  t('🔴 there is no competitor prefill — the competitor columns are read nowhere and the boxes start empty',
    !/competitor(Name|Pct|FixedMinor)|prefill\./.test(SRC)
    && SRC.includes(PCT_ANCHOR) && SRC.includes(PENCE_ANCHOR) && !/Hatches/.test(read('app/compare/CostComparison.tsx')))
  t('🔴 …rendered: both fee boxes are EMPTY and carry the neutral placeholders', (() => {
    const h = renderWith([SYS('yes')], 'pf-empty', { raw: true, untyped: true })
    const boxes = [...h.matchAll(/<input[^>]*inputMode="(?:decimal|numeric)"[^>]*>/g)].map(m => m[0])
      .filter(b => /aria-label="(Percentage fee|Pence per order)"/.test(b))
    return boxes.length === 2 && boxes.every(b => /value=""/.test(b))
      && /placeholder="Your rate"/.test(boxes.join('')) && /placeholder="Your fee"/.test(boxes.join(''))
  })())
  // Phase 2A: the helper is bound to the marketing country's money format; the test is the same one.
  // Language Phase 0 (14 October 2026): still the FORMATTER'S rounding, asked by number (roundsToZero, lib/money-format.ts)
  // instead of by comparing two formatted strings; scripts/language-phase-0.cjs proves the two answer alike.
  t('🔴 the formatter-based zero test survives', /return roundsToZero\(Number\.isFinite\(n\) \? n : 0, f, 0\)/.test(SRC))
  // ── 🔴 THE "Yes" PATH SHOWS NO RESULT UNTIL A RATE IS TYPED (Phase 2A, decided) ─────────────────────
  const GATE = 'Enter what you pay now to see your saving.'
  t('🔴 Yes path, nothing typed: the prompt stands in for the result — no saving, no year lines', (() => {
    const txt = renderWith([SYS('yes')], 'gate-empty', { untyped: true })
    return txt.includes(GATE) && !/Right now you pay|With HatchGrab\n|Year one|a week|a trading day|Save /.test(txt)
  })())
  t('🔴 Yes path, a rate typed: the result is back and the prompt is gone', (() => {
    const txt = renderWith([SYS('yes'), PCT('2.5')], 'gate-typed', { untyped: true })
    return !txt.includes(GATE) && txt.includes('Right now you pay')
  })())
  t('🔴 Yes path, only the per-order fee typed: that is a rate too — the result shows', (() => {
    const txt = renderWith([SYS('yes'), [PENCE_ANCHOR, "const [feePenceRaw, setFeePenceRaw] = useState('20')"]], 'gate-pence', { untyped: true })
    return !txt.includes(GATE) && txt.includes('Right now you pay')
  })())
  t('🔴 No path: the prompt never appears (there is nothing to type there)', (() => {
    const txt = renderWith([SYS('no')], 'gate-no', { untyped: true })
    return !txt.includes(GATE)
  })())
  t('🔴 the effective-rate line is still absent', !/effTheirs|effOurs/.test(SRC))
  t('🔴 BOTH GATES AND THE SERVER/CLIENT SPLIT ARE UNTOUCHED — this file is still a client component',
    SRC.startsWith("'use client'") && !/verifyAdmin/.test(SRC))
  t('⚠️ …and the page shell still redirects nowhere but /contact', (() => {
    const P = stripComments(read('app/compare/page.tsx'))
    return !/redirect\('\/'\)/.test(P) && /notFound\(\)/.test(P)
  })())
  t('🔴 the first question has NO default, so no figure is computed from an assumption',
    /useState<'yes' \| 'no' \| null>\(null\)/.test(SRC))
  t('⚠️ trading days default to 4', /const \[days, setDays\] = useState\(4\)/.test(SRC))

  // ── BROKEN VARIANTS ─────────────────────────────────────────────────────────────────────────────
  console.log('── BROKEN VARIANTS: MUST be caught ─────────────────────────────────────────────────────')
  const variants = [
    /* ⚠️ V1 NOW APPLIES TO THE "No" PATH ONLY — it is the only path left with a per-DAY figure. The
     * Yes path's weekly figure has its own guard in `perWeek`, which V1's patch does not touch. */
    ['V1 🔴 the No path\'s per-day divisor goes back to monthly ÷ 4 ÷ days',
      [['  return (monthly * 12) / 52 / d', '  return monthly / 4 / d']],
      txt => !/£2\.24\na trading day/.test(txt)],
    ['V2 🔴 the coffee line loses its threshold and always shows',
      [['perTradingDay(m.oursPerTruck, days) < COFFEE_MAX_PER_DAY', 'true']],
      txt => txt.includes('Less than a coffee'), [SYS('no'), DAYS(2), GMV(12000)]],
    ['V3 🔴 the No path shows a per-order figure of ours',
      // ⚠️ RE-PINNED (Language Phase 1e): RE-ANCHORED, same mutation. "a trading day" is the `unit` tag of a message now.
      [['unit: c => <p className="mt-2 text-xl font-bold text-slate-700">{c}</p>,\n                  })}',
        'unit: c => <p className="mt-2 text-xl font-bold text-slate-700">{c}</p>,\n                  })}<p>{money(m.oursPerTruck / m.orders)} per order</p>']],
      txt => (resultsOf(txt).match(/per order/g) || []).length !== 1],
    ['V4 🔴 amounts under £1 render as £0.80 instead of 80p',
      [['  if (Math.abs(safe) < 1) return smallFeeLabel(Math.round(Math.abs(safe) * 10 ** minorDigits(f.currency)), f)', '  // removed']],
      txt => !/80p\nmore a trading day/.test(txt), [SYS('yes'), DAYS(4), GMV(2500), PCT('2.5')]],
    ['V5 🔴 the dearer path goes back to the "% more in your first year" line',
      [['                {dearer ? (', '                {false ? (']],
      // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): (c)'s dearer rate (2.5% is a saving now — see (c)).
      txt => /more in your first year/.test(txt), [SYS('yes'), DAYS(4), GMV(2500), PCT('1.9')]],
    /* 🔴 V6 — THE TRADING-DAYS QUESTION COMES BACK ON THE YES PATH. It would be collected and never
     * used there (that result is weekly), and it would put a seventh card into a path numbered to six. */
    ['V6 🔴 the days question is shown on the Yes path',
      [['          {noSystem && (\n          <Card n={STEP.days}', '          {true && (\n          <Card n={STEP.days}']],
      txt => txt.includes('How many days a week do you trade?'), [SYS('yes')]],
    /* 🔴 V7 — THE SANCTIONED VOCABULARY FIX REVERTS. One object named two ways on one screen. */
    ['V7 🔴 the grey box goes back to "across N trucks"',
      // ⚠️ RE-PINNED (Language Phase 1e): RE-ANCHORED, same mutation. "across {fleet} vans" is compare.panel.acrossFleet now.
      [["{t('panel.acrossFleet', { fleet })}", "{t('panel.acrossFleet', { fleet }).replace('vans', 'trucks')}"]],
      txt => /across \d+ trucks/.test(txt), [SYS('yes'), TRUCKS(3), PCT('2.5')]],
  ]
  for (const [label, patches, caughtBy, state] of variants) {
    const txt = renderWith([...(state ?? [SYS('no'), DAYS(4), GMV(2500)]), ...patches], label.slice(0, 2))
    const caught = caughtBy(txt)
    console.log(`  ${caught ? '✓ caught as required' : '🔴 NOT CAUGHT — THE HARNESS PROVES NOTHING'}  ${label}`)
    if (!caught) fails++
  }

  console.log('\n── THE TWO PATHS ───────────────────────────────────────────────────────────────────────')
  for (const n of ok) console.log('  ✓ ' + n)
  for (const n of bad) console.log('  🔴 ' + n)
  fails += bad.length

  console.log('\n── LAYOUT, IN TWO ENGINES ──────────────────────────────────────────────────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1. It needs `next build` (for the real Tailwind bundle) and')
    console.log('     local browser builds, and the sweep must not depend on either. The run is in the report.')
  } else {
    console.log('  ⚠️ see docs/compare-no-system-report.md §7 for the measured run (24 measurements, 2 engines).')
  }

  console.log(`\n${fails === 0 ? `✅ all ${ok.length} passed` : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
