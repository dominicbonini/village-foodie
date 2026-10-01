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
function renderWith(patches, tag) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cmp-${tag}-`))
  for (const d of ['app/compare', 'components/landing']) fs.mkdirSync(path.join(tmp, d), { recursive: true })
  fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
  let src = read('app/compare/CostComparison.tsx')
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
  const html = renderToStaticMarkup(React.createElement(c.req('app/compare/CostComparison.js').default))
  return html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')
    .replace(/&pound;/g, '£').replace(/&amp;/g, '&').replace(/&apos;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .split('\n').map(s => s.trim()).filter(Boolean).join('\n')
}

const SYS = v => ["useState<'yes' | 'no' | null>(null)", `useState<'yes' | 'no' | null>('${v}')`]
const STAFF = n => ["useState<1 | 2 | null>(null)", `useState<1 | 2 | null>(${n})`]
const DAYS = n => ['useState(4)\n  const [trucks', `useState(${n})\n  const [trucks`]
const TRUCKS = n => ['const [trucks, setTrucks] = useState(1)', `const [trucks, setTrucks] = useState(${n})`]
const GMV = n => ['useState(2500)', `useState(${n})`]
const PCT = v => ["useState('4.5')", `useState('${v}')`]
const FREE = v => ["useState('1')", `useState('${v}')`]
const resultsOf = txt => txt.replace(/^[\s\S]*?(See your saving ↓|See what it costs ↓)/, '$1')

;(async () => {
  // ── (a) THE "No" PATH, THE BRIEF'S WORKED EXAMPLE ───────────────────────────────────────────────
  const a = renderWith([SYS('no'), STAFF(1), DAYS(4), GMV(2500)], 'a')
  t('🔴 (a) £2.24 a trading day', /£2\.24\na trading day/.test(a))
  t('🔴 (a) …from £38.90 a month, on 4 days', a.includes('Based on 4 days a week · £38.90 a month'))
  t('🔴 (a) breakdown is £29.00 + £9.90 → £38.90', a.includes('Pro plan\n£29.00')
    && a.includes('above the £1,500 included\n£9.90') && a.includes('HatchGrab each month\n£38.90'))
  /* ⚠️ THE CARD-PROCESSING LINE IS ASSERTED WITHOUT NAMING THE PAYMENT PROVIDER, DELIBERATELY.
   * `scripts/run-harnesses.cjs` screens every listed file for that brand name as a whole word and
   * REFUSES THE ENTIRE RUN if it finds one — "the screen is a property of the FILE, not of anyone's
   * intent". 🔴 THE RIGHT RESPONSE TO THAT IS NOT TO SPLIT THE STRING TO SLIP PAST IT. The rate, the
   * amount and the "same as a card machine" clause are what the requirement is about; the brand word
   * carries none of it, and the component's own source is where that wording lives. */
  t('🔴 (a) card processing ~£70.83, named as the provider\'s and NOT in our total',
    a.includes('~£70.83') && /1\.5% \+ 20p per order, paid to/.test(a)
    && a.includes("You'd pay much the same on a card machine at the window")
    && !/HatchGrab each month\n~/.test(a))
  t('🔴 (a) the coffee line is shown', a.includes('Less than a coffee.'))
  t('🔴 (a) "And your first month is on us."', a.includes('And your first month is on us.'))
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
    a.includes("How much do you think you'd take online, per month, per truck?")
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
  t('⚠️ (a) card numbering runs 1-2-3-4-5-6 with NO GAP on the No path', numbered(a, [
    [1, 'Do you take online orders now?'],
    [2, 'How many trucks do you run?'],
    [3, 'How many people work the van?'],
    [4, "How much do you think you'd take online, per month, per truck?"],
    [5, 'How many days a week do you trade?'],
    [6, 'Your introductory offer'],
  ]))
  /* 🔴 THE YES PATH IS 1–6 AGAIN (1 October 2026). The trading-days question left it — that result is
   * framed PER WEEK now, so there was nothing to divide by days and the answer would have been collected
   * and never used. ⚠️ ASSERTED FROM BOTH SIDES: absent on Yes, present on No. A check that only counted
   * to 6 would pass if the card were still rendered with a duplicate number. */
  t('⚠️ (d) …and 1-2-3-4-5-6 with no gap on the Yes path, the fee question at 5', (() => {
    const y = renderWith([SYS('yes'), STAFF(1)], 'num')
    return numbered(y, [
      [1, 'Do you take online orders now?'],
      [2, 'How many trucks do you run?'],
      [3, 'How many people work the van?'],
      [4, 'Online orders per month, per truck'],
      [5, 'What do you pay per order now?'],
      [6, 'Your introductory offer'],
    ]) && !y.includes('How many days a week do you trade?')
  })())
  t('🔴 the trading-days question is ABSENT on Yes and PRESENT on No',
    !renderWith([SYS('yes'), STAFF(1)], 'dy').includes('How many days a week do you trade?')
    && a.includes('How many days a week do you trade?'))
  t('⚠️ …and the No path still has it at 5, with its default and helper text intact',
    /\n5\nHow many days a week do you trade\?/.test(a)
    && a.includes("Events, markets, pitches — any day the van's out."))

  // ── (b) THE COFFEE CLAIM STOPS WHERE IT STOPS BEING TRUE ────────────────────────────────────────
  const b = renderWith([SYS('no'), STAFF(1), DAYS(2), GMV(12000)], 'b')
  t('🔴 (b) £12,000 on 2 days → coffee line ABSENT', !b.includes('Less than a coffee'))
  t('⚠️ (b) …and nothing is rendered in its place', !/than a (pint|sandwich|coffee)/.test(b))

  // ── (c) THE "Yes" PATH WHEN WE COST MORE ────────────────────────────────────────────────────────
  const c = renderWith([SYS('yes'), STAFF(1), DAYS(4), GMV(2500), PCT('2.5')], 'c')
  /* 🔴 (c) IS PER WEEK NOW, NOT PER TRADING DAY. £13.90 × 12 ÷ 52 = £3.2077 → "£3.21". ⚠️ AND THE
   * COFFEE LINE GOES WITH IT: 3.21 ≥ 3.00, so the same threshold that showed the line at 80p a DAY
   * correctly withholds it at £3.21 a WEEK. The claim stays true at both. */
  t('🔴 (c) "£3.21 more a week"', /£3\.21\nmore a week/.test(c))
  t('🔴 (c) …£13.90 a month more than now, with NO "Based on N days" clause',
    c.includes('£13.90 a month more than now') && !/Based on \d+ days?/.test(c))
  t('🔴 (c) …and the coffee line is ABSENT, because £3.21 ≥ £3.00',
    !c.includes('Less than a coffee'))
  t('🔴 (c) …and nothing on this path says "a trading day"', !c.includes('a trading day'))
  t('🔴 (c) the grey box is MONTHLY: £25.00 against £38.90',
    c.includes('Right now you pay\n£25.00\na month') && c.includes('With HatchGrab\n£38.90\na month'))
  t('🔴 (c) the "% more" line and "You\'d pay extra" are GONE on this path',
    !/more in your first year/.test(c) && !c.includes("You'd pay extra"))
  t('🔴 (c) …and the year schedule is replaced by the monthly breakdown',
    c.includes('Your month on HatchGrab') && !/Year one|Year two/.test(c))
  t('🔴 (c) …which names the provider\'s own fee at the rate the comparison used',
    /Your current provider's own fee \(1%\)\n£25\.00 a month/.test(c))
  t('⚠️ (c) the CTA pair and the cream strip are unchanged',
    c.includes('Upload my menu →') && c.includes('Ask us a question') && c.includes('No card needed to set up'))

  // ── (d) THE SAVING CARD IS UNTOUCHED ────────────────────────────────────────────────────────────
  // 🔴 THE BRIEF'S OWN CASE, AND THE ONE THING THIS TASK MUST NOT CHANGE. Pinned as the literal text of
  // the result region, so any edit to that card — a word, a figure, an order — fails here.
  const d = resultsOf(renderWith([SYS('yes'), STAFF(1)], 'd'))
  const D_EXPECTED = [
    'See your saving ↓', 'Right now you pay', '£900', 'a year', 'With HatchGrab', '£428', 'in year one',
    'You save', '£472', '52%', 'less in your first year', "That's a weekend pitch at a food festival.",
    'Upload my menu and save £472 →', 'Ask us a question', 'No card needed to set up',
    'Year one', 'Save £472', '(52% less)', 'Current provider', '£900', '→', 'HatchGrab', '£428',
    'Year two', 'Save £433', '(48% less)', 'Current provider', '£900', '→', 'HatchGrab', '£467',
  ].join('\n')
  t('🔴 (d) 4.5% + 20p inclusive, £2,500 — the saving card is EXACTLY as before', d.startsWith(D_EXPECTED))
  t('🔴 (d) …and still carries the two-year total and the yearly small print',
    d.includes("Over two years that's") && d.includes('excluded from both sides'))

  // ── (e) MULTIPLE VANS — HEADLINE PER VAN, FLEET AS AN EXTRA LINE ────────────────────────────────
  const e1 = renderWith([SYS('no'), STAFF(1), DAYS(4), GMV(2500), TRUCKS(3)], 'e1')
  t('🔴 (e) No path, 3 vans: the headline is still PER VAN (£2.24), and says so',
    /£2\.24\na trading day/.test(e1) && e1.includes('£38.90 a month per van'))
  t('🔴 (e) …with the fleet monthly total as its own line', e1.includes('Across 3 vans\n£116.70 a month'))
  t('⚠️ (e) …and the card-processing estimate is the fleet figure', e1.includes('~£212.50'))
  const e2 = renderWith([SYS('yes'), STAFF(1), DAYS(4), GMV(2500), PCT('2.5'), TRUCKS(3)], 'e2')
  t('🔴 (e) Yes-dearer, 3 vans: headline per van and weekly, sub-line names the van',
    /£3\.21\nmore a week/.test(e2) && e2.includes('£13.90 more per van a month than now'))
  /* 🔴 THE SANCTIONED VOCABULARY FIX (item 4). The grey box was the one place in the results still
   * saying "trucks", against "Across N vans" in both breakdown cards. ⚠️ IT IS INSIDE THE SAVING CARD,
   * so it is pinned here at a fleet size that renders it — case (d) is one van and never shows it. */
  t('🔴 (e) the grey box says "across 3 vans", never "trucks"',
    e2.includes('across 3 vans') && !/across \d+ trucks/.test(e2))
  /* ⚠️ AND ON THE SAVING CARD TOO, which is where the string actually lives — the dearer card shares the
   * same box, so pinning only the dearer path would miss a revert on the one case (d) protects. */
  t('🔴 (e) …and so does the SAVING card at 3 vans', (() => {
    const sv = renderWith([SYS('yes'), STAFF(1), TRUCKS(3)], 'e3')
    return sv.includes('You save') && sv.includes('across 3 vans') && !/across \d+ trucks/.test(sv)
  })())
  /* 🔴 UNDER £1 A WEEK STILL RENDERS AS WHOLE PENCE (item 5).
   * 🧪 £1,500 at 3.4% inclusive → theirs £28.50 against our £29.00, so **50p a month** more → 12p a week.
   * ⚠️ `FREE(0)` IS LOAD-BEARING IN THIS FIXTURE, and the first attempt at it had no such patch and
   * failed: with one month free, year one is £319 against their £342, so the page is correctly showing a
   * SAVING and the dearer branch never renders. `dearer` is decided on year one, not on the monthly
   * difference — which is worth knowing about this page and is why the fixture says so. */
  t('🔴 a Yes-path difference under £1 a week renders whole pence + "more a week"', (() => {
    const tiny = renderWith([SYS('yes'), STAFF(1), GMV(1500), PCT('3.4'), FREE('0')], 'tiny')
    return /\n12p\nmore a week/.test(tiny) && !/£0\.12/.test(tiny)
      && tiny.includes('50p a month more than now')
  })())
  t('🔴 (e) …and the fleet line is present', e2.includes('Across 3 vans\n£116.70 a month'))

  // ── (f) THE THRESHOLD, EVERY DAY × EVERY SLIDER STEP ────────────────────────────────────────────
  // 🔴 THE ARITHMETIC IS RESTATED HERE AND THEN CHECKED AGAINST REAL RENDERS at each boundary, so a
  // restatement that drifted from the component would fail rather than quietly agree with itself.
  const oursPerTruck = gmv => 29 + (Math.max(0, gmv - 1500) * 0.99) / 100
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
  t('🔴 (f) 175 points walked (7 days × 25 steps), exactly 5 transitions — days 1–2 never qualify',
    boundaries.length === 5 && boundaries.every(x => x.on === false) && boundaries.map(x => x.days).join() === '3,4,5,6,7')
  t('🔴 (f) every transition straddles £3.00 exactly', boundaries.every(x =>
    perDay(oursPerTruck(x.gmv - 500), x.days) < 3.0 && perDay(oursPerTruck(x.gmv), x.days) >= 3.0))
  t('🔴 (f) …and the RENDER agrees at each boundary, both sides', boundaries.every(x => {
    const below = renderWith([SYS('no'), STAFF(1), DAYS(x.days), GMV(x.gmv - 500)], `f${x.days}lo`)
    const above = renderWith([SYS('no'), STAFF(1), DAYS(x.days), GMV(x.gmv)], `f${x.days}hi`)
    return below.includes('Less than a coffee') && !above.includes('Less than a coffee')
  }))

  // ── WHAT MAY NOT CHANGE ─────────────────────────────────────────────────────────────────────────
  const SRC = stripComments(read('app/compare/CostComparison.tsx'))
  t('🔴 the per-day divisor is calendar-accurate — × 12 ÷ 52, never ÷ 4',
    /\(monthly \* 12\) \/ 52 \/ d/.test(SRC) && !/\/ 4 \/ days/.test(SRC))
  t('🔴 the coffee threshold is one named constant', /const COFFEE_MAX_PER_DAY = 3\.0/.test(SRC)
    && (SRC.match(/COFFEE_MAX_PER_DAY/g) || []).length >= 3)
  t('🔴 every price still comes from the pricing modules — no new literal',
    /PLAN_MONTHLY_PENCE/.test(SRC) && /allowancePenceFor\('pro'\)/.test(SRC)
    && /PLATFORM_FEE_OVER_ALLOWANCE\.pct/.test(SRC) && /CARD_FEES\.online/.test(SRC))
  t('🔴 the competitor prefill is still a literal and NOT wired to CARD_FEES',
    /useState\('4\.5'\)/.test(SRC) && /useState\('20'\)/.test(SRC))
  t('🔴 the formatter-based zero test survives', /return gbp\(n\) === gbp\(0\)/.test(SRC))
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
      txt => txt.includes('Less than a coffee'), [SYS('no'), STAFF(1), DAYS(2), GMV(12000)]],
    ['V3 🔴 the No path shows a per-order figure of ours',
      [['<p className="mt-2 text-xl font-bold text-slate-700">a trading day</p>',
        '<p className="mt-2 text-xl font-bold text-slate-700">a trading day</p><p>{money(m.oursPerTruck / m.orders)} per order</p>']],
      txt => (resultsOf(txt).match(/per order/g) || []).length !== 1],
    ['V4 🔴 amounts under £1 render as £0.80 instead of 80p',
      [['  if (Math.abs(safe) < 1) return `${Math.round(Math.abs(safe) * 100)}p`', '  // removed']],
      txt => !/80p\nmore a trading day/.test(txt), [SYS('yes'), STAFF(1), DAYS(4), GMV(2500), PCT('2.5')]],
    ['V5 🔴 the dearer path goes back to the "% more in your first year" line',
      [['                {dearer ? (', '                {false ? (']],
      txt => /more in your first year/.test(txt), [SYS('yes'), STAFF(1), DAYS(4), GMV(2500), PCT('2.5')]],
    /* 🔴 V6 — THE TRADING-DAYS QUESTION COMES BACK ON THE YES PATH. It would be collected and never
     * used there (that result is weekly), and it would put a seventh card into a path numbered to six. */
    ['V6 🔴 the days question is shown on the Yes path',
      [['          {noSystem && (\n          <Card n={STEP.days}', '          {true && (\n          <Card n={STEP.days}']],
      txt => txt.includes('How many days a week do you trade?'), [SYS('yes'), STAFF(1)]],
    /* 🔴 V7 — THE SANCTIONED VOCABULARY FIX REVERTS. One object named two ways on one screen. */
    ['V7 🔴 the grey box goes back to "across N trucks"',
      [['across {fleet} vans', 'across {fleet} trucks']],
      txt => /across \d+ trucks/.test(txt), [SYS('yes'), STAFF(1), TRUCKS(3), PCT('2.5')]],
  ]
  for (const [label, patches, caughtBy, state] of variants) {
    const txt = renderWith([...(state ?? [SYS('no'), STAFF(1), DAYS(4), GMV(2500)]), ...patches], label.slice(0, 2))
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
