'use client'

// app/compare/CostComparison.tsx
// The cost comparison calculator. An operator enters what they pay a current provider and sees what a
// year on HatchGrab would cost instead.
//
// ── 🔴 IT MOVED TO /compare ON 2 SEPTEMBER 2026, AND THE GATE HAD TO BE WRITTEN OUT BY HAND ─────
// It lived at /landing/cost, where app/landing/layout.tsx gated every descendant: in production that
// layout redirects anyone who is not an admin to /contact, and being a CHILD route inherited it BY
// CONSTRUCTION — no second gate to write and none to forget.
// 🔴 AT /compare NOTHING WRAPS IT, SO THAT GATE WENT WITH THE MOVE. The original note here said in
// as many words: "IF THIS IS EVER MOVED, the gate moves with it or it is gone." It moved, and the gate
// is now an explicit check at the top of ../page.tsx. THE TWO ARE THE SAME `verifyAdmin` CALL, but they
// are no longer the same code — if the landing's gate ever changes, THIS ONE DOES NOT FOLLOW.
// ⚠️ THE REASON IT NEEDS ONE AT ALL: this page renders REAL, UNMASKED PRICES (no maskPrice import
// anywhere in this file), so it must not be publicly reachable while the landing is embargoed.
// ⚠️ The redirect target is /contact, NEVER '/': proxy.ts rewrites '/' to the landing on hatchgrab.com,
// so redirecting there loops forever on the domain given to Apple as the Marketing URL.
//
// ── 🔴 EVERY PRICE COMES FROM THE STRUCTURED CONSTANTS. NOTHING IS PARSED, NOTHING IS TYPED TWICE. ──
// The prototype hardcoded £29 / £49 / £1,500 / £2,000 / 0.99% / 1.5% / 20p. All seven now come from
// lib/features.ts and lib/plan-features.ts. A marketing page with its own copy of the numbers is
// exactly the gate/marketing drift the parity guard exists to prevent, arriving by another route.
//
// ── ⚠️ MONEY IS POUNDS HERE, AND ONLY HERE ─────────────────────────────────────────────────────────
// The constants are integer PENCE, which is the codebase's money type. This page converts to pounds at
// the boundary below and does the rest of its arithmetic in floats, because the prototype's maths is
// settled and because everything on screen is an ESTIMATE the small print labels as such. 🔴 NOTHING
// HERE CHARGES ANYONE. If any of this is ever reused to compute a real charge, it must be redone in
// pence — see §16 on `orders.total_minor`.
import { useState, useMemo } from 'react'
import { PLAN_MONTHLY_PENCE } from '@/lib/features'
import {
  PLAN_ONLINE_ALLOWANCE,
  PLATFORM_FEE_OVER_ALLOWANCE,
  allowanceAmountLabel,
  allowancePenceFor,
  CARD_FEES,
} from '@/lib/plan-features'

const ORANGE = '#EF8B2C'

// ── 🔴 THE CTA'S COLOUR LIVES IN A CLASS, NOT IN `style`, AND IT CANNOT BE INTERPOLATED ────────────
// `DemoCta`'s props are `{ className?, children }` and it forwards ONLY className to its <button>. It
// takes no `style`. The prototype coloured this CTA with `style={{ backgroundColor: ORANGE }}` on an
// <a>; converting it to <DemoCta> carried `text-white` across and left the background behind, so the
// button rendered white-on-white and was invisible — a blank band the height of a button.
// ⚠️ THE HEX IS REPEATED LITERALLY AND MUST BE. Tailwind scans source for complete class names, so
// `bg-[${ORANGE}]` would compile to NOTHING — a template literal is not statically analysable and the
// class would silently not exist. That failure looks exactly like this bug. Keep the two in step by
// hand; there is no safe way to derive one from the other in a class name.
const CTA_BASE =
  'inline-block rounded-xl text-center font-bold transition focus:outline-none focus-visible:ring-4'
const CTA_PRIMARY = `${CTA_BASE} bg-[#EF8B2C] text-white hover:brightness-95 focus-visible:ring-orange-300`
// ⚠️ SECONDARY IS AN OUTLINE, NOT A SECOND FILL. Two orange buttons side by side would compete and the
// eye would have to choose; the muted one reads as the alternative it is.
const CTA_SECONDARY = `${CTA_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300`
const CREAM = '#FFF7EE'
const INK = '#1A2233'
const SLATE = '#334155'

// ── THE REAL NUMBERS, RESOLVED ONCE AT MODULE LOAD ─────────────────────────────────────────────────
// 🔴 DELIBERATELY AT MODULE SCOPE, NOT INSIDE THE COMPONENT. `allowancePenceFor` THROWS if a tier stops
// being a `{ kind: 'amount' }` — the loud failure the union is there to force. Resolving it here means
// that failure happens at import, before anything renders, rather than mid-interaction on a page that
// has already told someone a number. An unreachable state should break the build, not the third click.
// ⚠️ The union's other two cases ('none' for starter, 'unlimited' for trial) are unreachable because
// this page only ever offers pro and max, and `allowancePenceFor` is typed to those two — so the
// exhaustiveness is enforced by the compiler first and by the throw second.
const PLANS = {
  pro: {
    name: 'Pro',
    monthly: PLAN_MONTHLY_PENCE.pro / 100,
    allowance: allowancePenceFor('pro') / 100,
    allowanceLabel: allowanceAmountLabel(allowancePenceFor('pro')),
  },
  max: {
    name: 'Max',
    monthly: PLAN_MONTHLY_PENCE.max / 100,
    allowance: allowancePenceFor('max') / 100,
    allowanceLabel: allowanceAmountLabel(allowancePenceFor('max')),
  },
} as const

const CARD_PCT = CARD_FEES.online.pct
const CARD_PENCE = CARD_FEES.online.pence
const OVERAGE = PLATFORM_FEE_OVER_ALLOWANCE.pct

// Average order value. ⚠️ THE ONE FIGURE ON THIS PAGE THAT IS OURS RATHER THAN SOURCED — it converts
// order VALUE into an order COUNT so a per-order fee can be applied. The small print states it.
const AOV = 15

// ── 🔴 GROUPING WITHOUT toLocaleString, AND THE REASON IS RECORDED ─────────────────────────────────
// lib/plan-features.ts's `allowanceAmountLabel` avoids toLocaleString because ICU availability differs
// between the build host and the browser: a trimmed-ICU runtime renders 1500 rather than 1,500. This
// page shows an allowance from THAT helper alongside its own computed figures, so if these used a
// locale helper the same screen could show "£1,500" and "£1500" at once. Same regex, same result,
// everywhere.
function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "£1,234" / "£12.34". The page's own dynamic figures. Whole pounds by default. */
function gbp(n: number, dp = 0): string {
  const safe = Number.isFinite(n) ? n : 0
  const fixed = Math.abs(safe).toFixed(dp)
  const [int, frac] = fixed.split('.')
  const sign = safe < 0 ? '-' : ''
  return `${sign}£${group(int)}${frac ? '.' + frac : ''}`
}

// ── 🔴 "DOES IT RENDER AS ZERO?" ASKED OF THE FORMATTER, NOT OF THE NUMBER ─────────────────────────
// A saving of £0.004 is > 0, so the old test claimed a saving and then printed "£0" — "Start free and
// save £0 →". The obvious fix is a threshold like `>= 1`, and it is the wrong one: it hard-codes the
// formatter's rounding in a second place, so changing gbp() to 2dp would silently make the two disagree
// again, in the other direction.
// ⚠️ THIS COMPARES gbp(n) TO gbp(0). The decision is therefore made on THE STRING THE OPERATOR WILL
// ACTUALLY SEE, so the display and the claim cannot diverge by construction — whatever gbp() does later,
// this follows it. There is no magic number to drift.
function rendersAsZero(n: number): boolean {
  return gbp(n) === gbp(0)
}

/** Do we announce a SAVING? Only when it is positive AND survives formatting. */
function isRealSaving(n: number): boolean {
  return n > 0 && !rendersAsZero(n)
}

/** A number from free text, or the fallback. Number inputs can still yield '', '-', '1e5' and 'abc'. */
function numOr(raw: string, fallback: number): number {
  if (raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

// ── 🔴 THE SAVING ANCHORS ARE FACTUAL CLAIMS ON A MARKETING PAGE. THEY WERE CHECKED. ───────────────
// An operator knows what a pitch and a year's insurance cost far better than we do, so a wrong anchor
// does not read as a rounding error — it reads as the whole page being invented. Two of the original
// bands were wrong, one by roughly ten times, and they are recorded here rather than quietly fixed.
//
// ── CHECKED AGAINST UK FIGURES, AUGUST 2026 ────────────────────────────────────────────────────────
//   • PUBLIC LIABILITY: roughly £50–500 a YEAR for UK street food, typically about £150 for a sole
//     trader working events. 🔴 THE OLD BAND SAID "about a month's cover" FOR £80–200 — out by about
//     10x, and in the direction that makes our saving look trivial.
//   • FESTIVAL PITCHES: a standard 3-day pitch is around £550, a premium one around £800, day rates
//     from about £128. 🔴 THE OLD BANDS CALLED £200–500 "a couple of pitches" and £500–1,000 "a
//     season" — both overstated what the money actually buys, the second badly.
//
// ⚠️ THE EQUIPMENT AND VAN FIGURES BELOW ARE ESTIMATES AND HAVE NOT BEEN VERIFIED. Do not treat this
// table as uniformly sourced: the insurance and pitch bands were checked against published UK prices,
// the fryer/griddle, counter refit and van deposit bands were not. **If one of those is challenged,
// check it rather than defending it.**
//
// ⚠️ THE SHAPE IS DELIBERATELY UNCHANGED — same signature, same single call site, same null below the
// threshold. Only the boundaries and the strings moved. Below £80 there is deliberately no anchor: a
// saving that small is not made more persuasive by comparing it to anything.
function anchor(v: number): string | null {
  if (v < 80) return null
  if (v < 250) return "a year's public liability cover"
  if (v < 600) return 'a weekend pitch at a food festival'
  if (v < 1200) return 'a couple of festival pitches'
  if (v < 2500) return 'a new fryer and griddle'
  if (v < 5000) return 'a full refit of your serving counter'
  if (v < 12000) return 'a deposit on a second van'
  return 'a second van on the road'
}

// ⚠️ THE PROVIDER AND THE MODAL MOVED UP TO page.tsx (23 August 2026). This component no longer renders
// a DemoCta of its own — its CTAs are plain links now — but the shared LandingNav above it still does,
// so the provider is still required in the tree, one level higher. **There must be exactly one.**
export default function CostComparison() {
  const [trucks, setTrucks] = useState(1)
  const [staff, setStaff] = useState<1 | 2 | null>(null)
  // ── 🔴 THE OVERRIDE IS `null`-ABLE ON PURPOSE, AND `null` IS NOT "PRO". ──────────────────────────
  // Three states, not two: no choice made (follow the suggestion), chose Pro, chose Max. A boolean
  // could not tell "they have not chosen" from "they chose the plan we suggest", and the eyebrow in the
  // panel says something different in each case — "We suggest" vs "Your choice". Collapsing this to a
  // plan key with a default would make the panel claim they had chosen something they never touched.
  const [planOverride, setPlanOverride] = useState<'pro' | 'max' | null>(null)
  const [gmv, setGmv] = useState(2500)
  // ⚠️ RAW STRINGS, NOT NUMBERS, FOR EVERY FREE-ENTRY FIELD. A number-typed state cannot represent "the
  // box is empty while I retype it": `+''` is 0, so clearing the field would snap the value to zero and
  // fight the operator's cursor. The string is what the input shows; `numOr` is what the maths reads.
  // 🔴 4.5% + 20p IS THE COMPETITOR'S PUBLISHED RATE, NOT OURS. §21 records Hatches Up's cost model as
  // "4.5% + 20p all-in on online orders". These are the prefill for what the operator pays TODAY, so
  // they are correctly literals here and must NOT be wired to CARD_FEES. ⚠️ The 20p coincidentally
  // equals CARD_FEES.online.pence — do not "tidy" it into that constant; they are different companies'
  // numbers that happen to match, and the page subtracts one from the other.
  const [feePctRaw, setFeePctRaw] = useState('4.5')
  const [feePenceRaw, setFeePenceRaw] = useState('20')
  const [freeMonthsRaw, setFreeMonthsRaw] = useState('1')
  // ── 🔴 IS THE RATE THEY TYPED ALL-IN, OR PLATFORM-ONLY? ──────────────────────────────────────────
  // The page used to assume ALL-IN unconditionally and subtract card processing out of it. That is
  // right for the rate we prefill (§21 records Hatches Up as "4.5% + 20p all-in") and WRONG for any
  // provider that quotes a platform fee and bills card processing separately: 3% + 20p platform-only
  // was being read as 3% + 20p all-in and shown as 1.5% + 0p, understating their cost and therefore
  // understating the saving. ⚠️ DEFAULTS TO 'inclusive' — the previous behaviour, so an operator who
  // never touches this sees exactly what they saw before.
  const [feeMode, setFeeMode] = useState<'inclusive' | 'ontop'>('inclusive')
  const [trucksRaw, setTrucksRaw] = useState('')

  const feePct = numOr(feePctRaw, 0)
  const feePence = numOr(feePenceRaw, 0)
  const freeMonths = numOr(freeMonthsRaw, 0)

  // ── 🔴 ONE PLACE DECIDES THE ACTIVE PLAN, AND EVERYTHING DOWNSTREAM ALREADY READS IT. ───────────
  // `isMax` used to BE the answer to question 2. It is now the answer OR the operator's override, and
  // because `tier`/`plan`/`allowance` below are unchanged, every figure on the page — the memo, the
  // hero, both year lines, the overage maths — follows the override without a single further edit.
  // ⚠️ `?? `, NOT `||`. `planOverride` is a non-empty string or null; `||` would behave identically
  // TODAY and break the day someone adds a falsy member. The nullish operator says what is meant.
  const suggestedKey: 'pro' | 'max' = staff === 2 ? 'max' : 'pro'
  const activeKey = planOverride ?? suggestedKey
  const isMax = activeKey === 'max'
  const tier = isMax ? PLANS.max : PLANS.pro
  const plan = tier.monthly
  const planName = tier.name
  const allowance = tier.allowance
  const free = Math.min(12, Math.max(0, freeMonths))
  const fleet = Math.max(1, trucks || 1)

  const m = useMemo(() => {
    const orders = gmv / AOV
    // ── 🔴 THE ONLY LINES THE TOGGLE TOUCHES, AND THEY ARE BOTH ON THEIR SIDE. ─────────────────
    // Both branches produce THE SAME QUANTITY: the competitor's PLATFORM fee, with card processing
    // out of it. 'inclusive' strips it out of a rate that contained it; 'ontop' takes a rate that
    // never contained it. That is why card processing stays excluded from BOTH sides in BOTH modes,
    // and it is what makes the two modes comparable to each other at all.
    // 🔴 DO NOT ADD `CARD_PCT` TO OUR SIDE TO "BALANCE" THIS. Card processing sits outside the plan
    // under both modes; `plan`, `allowance` and `overPerTruck` below are deliberately untouched.
    // ⚠️ THE `Math.max(0, …)` CLAMP IS KEPT ON BOTH BRANCHES. In 'inclusive' it is load-bearing (a
    // quoted rate below card cost would otherwise go negative and pay the operator); in 'ontop' it is
    // a guard on a typed value, since the input's `min={0}` does not constrain what can be typed.
    const theirPct = Math.max(0, feeMode === 'ontop' ? feePct : feePct - CARD_PCT)
    const theirPence = Math.max(0, feeMode === 'ontop' ? feePence : feePence - CARD_PENCE)

    const theirsPerTruck = (gmv * theirPct) / 100 + (orders * theirPence) / 100
    const excess = Math.max(0, gmv - allowance)
    const overPerTruck = (excess * OVERAGE) / 100

    const theirsMonth = theirsPerTruck * fleet
    const oursMonth = (plan + overPerTruck) * fleet
    const fleetGmv = gmv * fleet

    const theirsYear = theirsMonth * 12
    const oursY1 = oursMonth * (12 - free)
    const oursY2 = oursMonth * 12

    return {
      // ⚠️ `theirsMonth` and `oursMonth` are still COMPUTED above — theirsYear and oursY1/oursY2 are
      // built from them — but they are no longer RETURNED: the effective-rate line was their only
      // consumer. Returning a value nothing reads is how a deleted feature leaves a trail that looks
      // load-bearing to the next person.
      orders, theirPct, overPerTruck, excess, fleetGmv,
      theirsYear, oursY1, oursY2,
      saveY1: theirsYear - oursY1,
      pctY1: theirsYear > 0 ? ((theirsYear - oursY1) / theirsYear) * 100 : 0,
      saveY2: theirsYear - oursY2,
      pctY2: theirsYear > 0 ? ((theirsYear - oursY2) / theirsYear) * 100 : 0,
      twoYear: theirsYear * 2 - (oursY1 + oursY2),
    }
  }, [gmv, feePct, feePence, feeMode, plan, free, allowance, fleet])

  // 🔴 EVERY PLACE THAT ANNOUNCES A SAVING AS A FIGURE HANGS OFF THIS, so they cannot disagree: the
  // hero heading, the hero colour, the "that's a new fryer" anchor and the primary CTA label.
  const good = isRealSaving(m.saveY1)
  const anch = good ? anchor(m.saveY1) : null
  // ── 🔴 THE VERB ABOVE THE FIGURE, AND IT HAS THREE STATES, NOT TWO. ──────────────────────────────
  // "You save" must never appear over a number that is not a saving. `good` is already
  // `isRealSaving(saveY1)` — positive AND surviving the formatter — so it splits the two claim-making
  // cases; the middle case is the one a boolean would have got wrong. A saving that rounds away is not
  // "extra" either, so it says neither.
  // ⚠️ NO CLAIM IS INVENTED FOR THE ZERO CASE: "About the same" describes the arithmetic and stops.
  const heroVerb = good ? 'You save' : rendersAsZero(m.saveY1) ? 'About the same' : "You'd pay extra"
  // 🔴 KEEP DYNAMIC. The hero figure is sized from the RENDERED STRING's length so a fleet total does
  // not wrap to two lines. A fixed Tailwind size cannot do this — it is the one inline style that must
  // survive conversion.
  const heroDigits = gbp(Math.abs(m.saveY1)).length
  const heroSize = heroDigits > 7 ? 60 : heroDigits > 5 ? 76 : 92

  return (
    <div className="min-h-screen px-5 py-10 md:py-14" style={{ backgroundColor: '#FAF8F5', color: INK }}>
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Cost comparison</p>
        {/* ── 🔴 THIRD WORDING, AND THIS COMMENT EXISTS SO THERE IS NOT A FOURTH. ────────────────────
            The headline has now been:
              1. "How much of your takings / are you handing over?"  — combative. It implies the reader
                 has been careless with their own money, and a combative frame primes a reader to
                 discount the result that follows.
              2. "What do your online / orders actually cost?"       — a question. "Actually" still
                 carries an insinuation, and a question invites the reader to answer it themselves
                 before the page has.
              3. "Compare your online / ordering costs"              — a plain statement of what the
                 page DOES.
            🔴 THE PRINCIPLE BEHIND ALL THREE MOVES, WHICH IS THE THING TO KEEP: this page's job is to be
            BELIEVED, and the figure carries the argument. A headline that poses a question or implies a
            verdict COMPETES with the number. A statement of what the page does gets out of its way.
            ⚠️ So: if you find yourself rewording this again, check first that the new version is not
            arguing. That is what the last two were doing. */}
        <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight md:text-5xl">
          Compare your online
          <br />
          <span style={{ color: ORANGE }}>ordering costs</span>
        </h1>
        {/* ⚠️ "Takes about a minute", NOT "Four quick questions". Being wrong about a count on a page
            about arithmetic undermines the arithmetic, and the count is arguable. */}
        <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600">
          Takes about a minute, and you&apos;ll see what a year on HatchGrab would save you.
        </p>

        <div className="mt-8 space-y-4">
          <Card n="1" title="How many trucks do you run?">
            {/* ⚠️ `flex-wrap` + `gap-2 sm:gap-3`: at 375px three buttons and the 4+ box on one row leaves
                each button under 70px. Wrapping is what stops it overflowing. */}
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => { setTrucks(n); setTrucksRaw('') }}
                  className="min-w-0 flex-1 rounded-xl border-2 py-3 text-base font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={trucks === n && trucksRaw === ''
                    ? { backgroundColor: ORANGE, borderColor: ORANGE, color: '#fff' }
                    : { borderColor: '#E2E8F0', backgroundColor: '#fff', color: SLATE }}>
                  {n}
                </button>
              ))}
              <div className="flex min-w-0 items-center rounded-xl border-2 px-2"
                style={{ borderColor: trucksRaw !== '' ? ORANGE : '#E2E8F0' }}>
                <input type="number" min={1} max={50} inputMode="numeric"
                  value={trucksRaw} placeholder="4+"
                  onChange={e => {
                    const raw = e.target.value
                    setTrucksRaw(raw)
                    // Empty or unparseable falls back to one truck rather than to zero or NaN.
                    setTrucks(Math.max(1, Math.min(50, Math.round(numOr(raw, 1)))))
                  }}
                  className="w-16 min-w-0 py-2 text-center text-base font-black tabular-nums focus:outline-none focus-visible:ring-2"
                  aria-label="Number of trucks" />
              </div>
            </div>
          </Card>

          {/* ⚠️ THE TITLE FOLLOWS QUESTION 1. "each van" was wrong for a one-truck operator, who has one
              van and is being asked about "each" of it. `fleet` is already the clamped truck count. */}
          <Card n="2" title={fleet > 1 ? 'How many people work across your vans?' : 'How many people work the van?'}>
            {/* 🔴 ANSWERING QUESTION 2 CLEARS THE OVERRIDE (the `setPlanOverride(null)` below). Without
                it, an operator who switched to Pro and then changed their answer to "Two or more" would
                be shown "Your choice: Pro" with every figure computed on Pro — a stale decision presented
                as a current one, made from an answer they had just replaced. ⚠️ It resets on EVERY press,
                including pressing the answer already selected: that is still the operator asserting it.
                ⚠️ THIS COMMENT LIVES HERE, NOT NEXT TO THE onClick, BECAUSE A JSX COMMENT PLACED
                DIRECTLY AFTER `.map(o => (` IS AN EXPRESSION, NOT A CHILD, AND FAILS THE BUILD. */}
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {([{ v: 1 as const, label: 'One' }, { v: 2 as const, label: 'Two or more' }]).map(o => (
                <button key={o.v} onClick={() => { setStaff(o.v); setPlanOverride(null) }}
                  className="min-w-0 flex-1 rounded-xl border-2 px-4 py-4 text-base font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={staff === o.v
                    ? { backgroundColor: ORANGE, borderColor: ORANGE, color: '#fff' }
                    : { borderColor: '#E2E8F0', backgroundColor: '#fff', color: SLATE }}>
                  {o.label}
                </button>
              ))}
            </div>
            {/* ── 🔴 A RECOMMENDATION, NOT A FOOTNOTE, AND NOT A VERDICT. ───────────────────────────
                This was a plain grey paragraph under the buttons, which reads as small print. It is the
                OUTCOME of the question above it and it sets every figure on the page, so it now gets the
                treatment of a result. The fill, rounding and padding deliberately MATCH THE HERO CONTEXT
                PANEL (`#F8FAFC`, `rounded-xl`, `px-5 py-4`) so the two read as the same kind of object.
                🔴 FLEX ROWS AND PLAIN BLOCKS ONLY — NO GRID TEMPLATE, NO WIDTH CLASS. Two grid attempts
                in this file collapsed to a single column and rendered as five lines; see
                docs/cost-comparison-panel-fix-report.md §1. ⚠️ DO NOT REINTRODUCE THAT PATTERN HERE.
                ⚠️ Unlike the hero panel this one is FULL WIDTH — no centring wrapper, no width class. It
                is a block inside a left-aligned card, not a centred island, so plain block flow is
                already correct and adding a width would be the exact mistake that broke the hero twice.
                🔴 EVERY NUMBER IS INTERPOLATED. `gbp(plan)` resolves through `tier.monthly` to
                `PLAN_MONTHLY_PENCE`; `tier.allowanceLabel` through `allowancePenceFor` to
                `PLAN_ONLINE_ALLOWANCE`. ⚠️ NO £29, £49, £1,500 OR £2,000 IS WRITTEN IN THIS FILE.
                ⚠️ "on each" IS GATED ON `fleet`, NOT ON `staff` — the allowance is per truck, so it only
                means anything when there is more than one truck to spread it across. */}
            {staff && (
              <div className="mt-4 rounded-xl px-5 py-4" style={{ backgroundColor: '#F8FAFC' }}>
                {/* ⚠️ THE EYEBROW TELLS THE TRUTH ABOUT WHOSE DECISION THIS IS. Once someone overrides,
                    "We suggest Pro" would be a lie — we suggested Max and they declined it. */}
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {planOverride ? 'Your choice' : 'We suggest'}
                </p>
                <p className="mt-1 text-2xl font-black" style={{ color: INK }}>{planName}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {gbp(plan)} per truck per month, with {tier.allowanceLabel} of online orders included
                  {fleet > 1 ? ' on each' : ''}.{isMax ? ' Everyone gets their own login.' : ''}
                </p>
                {/* ── 🔴 THE OVERRIDE MUST NOT SILENTLY MISLEAD. ──────────────────────────────────────
                    Answered "Two or more" but running the figures on Pro: the numbers below are correct
                    and the thing they bought is not what was asked for. ⚠️ DELIBERATELY NOT A WARNING
                    BOX — no border, no icon, no colour. It is one plain sentence at body size, because
                    the operator made this choice on purpose and does not need to be alarmed out of it;
                    they need to not be surprised later. */}
                {staff === 2 && !isMax && (
                  <p className="mt-2 text-sm text-slate-500">
                    Pro does not include separate logins — everyone shares one account.
                  </p>
                )}
                {/* ⚠️ A TEXT BUTTON, NOT A SECOND PAIR OF LARGE BUTTONS. Two big choices here would
                    compete with the answer buttons directly above and turn one question into two.
                    ⚠️ SWITCHING BACK TO THE SUGGESTED PLAN CLEARS THE OVERRIDE RATHER THAN SETTING IT,
                    so the eyebrow returns to "We suggest" instead of claiming a choice that now happens
                    to agree with us. The underline is correct here — this one IS an affordance. */}
                <button type="button"
                  onClick={() => {
                    const other: 'pro' | 'max' = isMax ? 'pro' : 'max'
                    setPlanOverride(other === suggestedKey ? null : other)
                  }}
                  className="mt-3 text-sm font-semibold underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ color: ORANGE }}>
                  Use {isMax ? PLANS.pro.name : PLANS.max.name} instead
                </button>
              </div>
            )}
          </Card>

          <Card n="3" title="Online orders per month, per truck" disabled={!staff}>
            {/* ── 🔴 THE CAPTION HAS TO EXCLUDE THE WINDOW, AND THIS IS AN HONESTY FIX. ──────────────
                It read "One truck · about {N} orders", which named the SCOPE but never said what kind
                of money. Most trucks take the majority of theirs on the card machine at the serving
                window. 🔴 AN OPERATOR ENTERING TOTAL TAKINGS SEES A SAVING SEVERAL TIMES TOO LARGE —
                and the error runs in OUR favour, on a page whose only job is to be believed.
                ⚠️ "One truck ·" WAS DROPPED, NOT LOST. The card's own title is "Online orders per
                month, per truck" and the allowance line below says "per truck" again, so the scope is
                still stated twice. Keeping it would also have made this row ~296px against a ~293px
                card at 375px — it was already a hair over.
                🔴 THE CAPTION IS A LINE OF ITS OWN, BELOW THE AMOUNT, NOT BESIDE IT. At `text-sm` it
                is ~518px; sharing the row with a `text-3xl` amount comes to ~628px against ~293px —
                over by more than the whole card. ⚠️ DO NOT MOVE IT BACK INTO THE ROW.
                ⚠️ THE ORDER COUNT STAYS BESIDE THE AMOUNT. It is the self-check: an operator who knows
                they take forty online orders a month spots a mismatch immediately. */}
            {/* ── 🔴 THE COUNT BELONGS TO THE AMOUNT; THE CAPTION BELONGS TO THE INPUT. ─────────────
                Both used to be `text-sm text-slate-500`, stacked with nothing between them, so they
                read as one disjointed sentence. They do different jobs: the count is a DERIVED VALUE
                of the number above it, the caption is an INSTRUCTION about what to type.
                ✅ THREE TIERS NOW, AND THE COLOURS CARRY THE HIERARCHY: the amount black, the caption
                `text-slate-600` — the SAME colour as the allowance line further down this card, so the
                card's two explanatory lines match — and the count `text-slate-400`, quieter than both.
                ⚠️ THE CAPTION WENT DARKER, NOT LIGHTER. It is the one line on this card that stops an
                operator entering their window takings; it should not be the faintest thing here.

                🔴 `justify-END`, NOT `justify-between`. The amount keeps its place at the RIGHT edge
                (operator preference, 24 August) and the count travels with it, immediately to its left.
                ⚠️ `justify-between` WOULD BE WRONG NOW AND WOULD LOOK RIGHT: with the count and the
                amount in one group it has nothing to push apart, so it would silently do nothing while
                reading as intent. `gap-3` became `gap-2`: the count is bound to the amount, not spaced
                from it. ⚠️ THE CAPTION BELOW IS LEFT-ALIGNED PROSE — it does NOT follow the amount.
                🔴 A FLEX ROW. NO GRID TEMPLATE, NO WIDTH CLASS — that pattern has collapsed twice in
                this file; see docs/cost-comparison-panel-fix-report.md §1.
                ⚠️ BOTH STAY ABOVE THE SLIDER. The caption explains what to enter and has to be read
                before the operator drags anything. */}
            <div className="flex items-baseline justify-end gap-2">
              <span className="text-sm tabular-nums text-slate-400">~{Math.round(m.orders)} orders</span>
              <span className="text-3xl font-black tabular-nums">{gbp(gmv)}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Only orders placed through your ordering page — not cash or card at the window.
            </p>
            <input type="range" min={0} max={12000} step={500} value={gmv}
              onChange={e => setGmv(numOr(e.target.value, 0))} className="hg-range mt-3"
              aria-label="Monthly online order value per truck" />
            {staff && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {m.excess > 0 ? (
                  <>
                    {tier.allowanceLabel} of online orders included per truck. The {gbp(m.excess)} above
                    is charged at {OVERAGE}% — <strong className="tabular-nums">{gbp(m.overPerTruck, 2)}</strong> a
                    month each.
                  </>
                ) : (
                  <>Inside the {tier.allowanceLabel} of online orders included — nothing on top of the plan.</>
                )}
                {fleet > 1 && (
                  <> Across {fleet} trucks: <strong className="tabular-nums">{gbp(m.fleetGmv)}</strong> a month.</>
                )}
              </p>
            )}
          </Card>

          <Card n="4" title="What do you pay per order now?" disabled={!staff}>
            {/* ⚠️ `min-w-0` on both halves is what stops these overflowing at 375px: without it a flex
                child refuses to shrink below its content width and the row pushes past the card. */}
            <div className="flex gap-2 sm:gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Percentage</span>
                <div className="flex items-center rounded-lg border px-3" style={{ borderColor: '#CBD5E1' }}>
                  <input type="number" step={0.1} min={0} max={30} inputMode="decimal" value={feePctRaw}
                    onChange={e => setFeePctRaw(e.target.value)}
                    className="w-full min-w-0 py-2 text-xl font-black tabular-nums focus:outline-none focus-visible:ring-2"
                    aria-label="Percentage fee" />
                  <span className="pl-1 text-lg font-bold text-slate-400">%</span>
                </div>
              </label>
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Plus per order</span>
                <div className="flex items-center rounded-lg border px-3" style={{ borderColor: '#CBD5E1' }}>
                  <input type="number" step={1} min={0} inputMode="numeric" value={feePenceRaw}
                    onChange={e => setFeePenceRaw(e.target.value)}
                    className="w-full min-w-0 py-2 text-xl font-black tabular-nums focus:outline-none focus-visible:ring-2"
                    aria-label="Pence per order" />
                  <span className="pl-1 text-lg font-bold text-slate-400">p</span>
                </div>
              </label>
            </div>
            {/* ── 🔴 A SEGMENTED CONTROL INSIDE QUESTION 4, NOT A SIXTH CARD. ─────────────────────
                It qualifies the two numbers directly above it. A card would have given it the same
                weight as "how many trucks do you run?", which it does not have.

                🔴 WHAT THIS REPLACED AND WHY, SO IT IS NOT REBUILT THAT WAY. It was two text options
                separated by a middot, the selected one marked by ORANGE + semibold and the unselected
                one UNDERLINED. Rendered, it read as one continuous sentence: colour and weight signal
                EMPHASIS rather than SELECTION, an underline signals a LINK, and a middot between two
                clauses is punctuation, not a divider. Nothing said "two mutually exclusive states".
                ⚠️ NO UNDERLINE ON EITHER HALF, EVER. That was the single strongest wrong signal.
                ⚠️ NO SEPARATOR CHARACTER. The container's edge and the filled half do that job.

                🔴 A FLEX ROW. NO GRID TEMPLATE, NO WIDTH CLASS. Both have collapsed in this file —
                see docs/cost-comparison-panel-fix-report.md §1.
                🔴 `flex-1` ON EACH HALF IS LOAD-BEARING AT 375px, AND IT IS NOT A WIDTH CLASS. At their
                natural widths the two halves come to ~326px inside a card that offers ~293px, so the
                pill would overflow. `flex-1` makes them share the row and lets the longer label wrap
                inside its own half instead. ⚠️ DO NOT REPLACE IT WITH A FIXED WIDTH.

                🔴 THE LABEL SITS ABOVE THE CONTROL, NOT BESIDE IT. Inline, "Their rate:" adds ~81px to
                a row that is already over budget — ~407px against ~293px. Above, it costs one line and
                nothing else, and it doubles as the group's accessible name.
                ⚠️ `role="group"` + `aria-labelledby` POINTING AT THAT VISIBLE LABEL. Previously these
                were two loose `aria-pressed` buttons, announced as two unrelated toggles rather than as
                a choice between two — and a segmented control makes that mismatch worse, because it
                LOOKS like a single control. The visible text is the name, so the two cannot drift.
                ⚠️ NOT `role="radiogroup"`: that requires `role="radio"` + `aria-checked` on the halves,
                which would mean dropping `aria-pressed` — and keeping `aria-pressed` was required. */}
            <div className="mt-3 text-sm">
              <p id="fee-mode-label" className="mb-1 text-slate-500">Their rate:</p>
              <div role="group" aria-labelledby="fee-mode-label"
                className="flex rounded-lg border p-1"
                style={{ borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                {([{ v: 'inclusive' as const, label: 'includes card processing' },
                   { v: 'ontop' as const, label: 'is charged on top' }]).map(o => (
                  <button key={o.v} type="button" onClick={() => setFeeMode(o.v)}
                    aria-pressed={feeMode === o.v}
                    className="flex-1 rounded-md px-3 py-1.5 text-center leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={feeMode === o.v
                      ? { backgroundColor: '#FFFFFF', color: INK, fontWeight: 600, boxShadow: '0 1px 2px rgba(15,23,42,0.08)' }
                      : { color: '#64748B' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {/* ── ⚠️ TWO WORDINGS, AND THE SECOND IS NOT THE FIRST WITH A WORD FLIPPED. ──────────────
                MODE 1 ends on "their own fee is X%" — genuinely new, because X is the typed rate MINUS
                card processing, a number the operator has not seen.
                🔴 MODE 2 MUST NOT SAY THAT. There, their own fee IS the number they just typed, so
                restating it tells them nothing and reads as though the page had computed something. The
                new information in mode 2 is the ALL-IN TOTAL — what actually leaves their account once
                card processing is added on top — so that is what the sentence gives them.
                ⚠️ THE TWO GATES DIFFER ON PURPOSE. Mode 1 needs `feePct > CARD_PCT` or there is no
                subtraction worth narrating. Mode 2 has no such precondition — any non-zero rate has an
                all-in total — so it is gated on the inputs being non-zero instead. */}
            {feeMode === 'inclusive' && feePct > CARD_PCT && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Card processing of {CARD_PCT}% + {CARD_PENCE}p is inside that, and you&apos;d pay it
                anywhere. Their own fee is{' '}
                <strong className="tabular-nums" style={{ color: ORANGE }}>{m.theirPct.toFixed(1)}%</strong>.
              </p>
            )}
            {feeMode === 'ontop' && (feePct > 0 || feePence > 0) && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Card processing of {CARD_PCT}% + {CARD_PENCE}p is charged on top of that, so you
                actually pay{' '}
                <strong className="tabular-nums" style={{ color: ORANGE }}>
                  {(feePct + CARD_PCT).toFixed(1)}% + {feePence + CARD_PENCE}p
                </strong>{' '}
                all in.
              </p>
            )}
          </Card>

          {/* ── ⚠️ ITS OWN QUESTION, NOT A FOOTER ON QUESTION 4 (23 August 2026). ────────────────────
              It sat inside "What do you pay per order now?", which asks about the operator's CURRENT
              provider. Months free is a HatchGrab offer — the opposite side of the comparison — so
              nesting it there put our number inside their question and quietly implied the free months
              were something their provider gave them. Separate card, separate subject. */}
          {/* ⚠️ AN OFFER FRAMING THAT STILL ASKS THE QUESTION. ⚠️ It is the only title with two clauses
              and the longest of the five — but card 3 ("Online orders per month, per truck") already
              breaks the plain-question pattern, so the set was never uniform, and rewording this to match
              cards 1/2/4 would have cost the offer framing that is the point of the change. */}
          <Card n="5" title="Your introductory offer — how many months free?" disabled={!staff}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-lg border px-2" style={{ borderColor: '#CBD5E1' }}>
                <input type="number" step={1} min={0} max={12} inputMode="numeric" value={freeMonthsRaw}
                  onChange={e => setFreeMonthsRaw(e.target.value)}
                  className="w-14 min-w-0 py-2 text-center text-lg font-black tabular-nums focus:outline-none focus-visible:ring-2"
                  aria-label="Months free" />
              </div>
              <span className="text-sm text-slate-500">
                {free === 0 ? 'Paying from day one' : 'No plan fee, no service fee'}
              </span>
            </div>
          </Card>
        </div>

        {/* ── 🔴 A NAVIGATION AID. IT IS NOT A GATE, AND MUST NEVER BECOME ONE. ─────────────────────
            The hero below ALREADY renders and updates live as the inputs move. ⚠️ DO NOT hide the
            results behind this link, DO NOT add a "calculate" step, and DO NOT make the figure appear
            only on click. Two reasons, both load-bearing:
              1. THE SLIDER NEEDS LIVE FEEDBACK. A range input whose number does not move as it is
                 dragged reads as broken, not as deferred.
              2. A GATED FIGURE GOES STALE THE INSTANT AN INPUT CHANGES AFTERWARDS — it would then be
                 showing a saving computed from answers that are no longer on screen, which is the one
                 thing this page cannot afford to do.
            ⚠️ SHOWN AT EVERY WIDTH, deliberately. The cards are a single `max-w-2xl` column on every
            screen, so five of them push the results below the fold on a laptop as well as a phone —
            this is not a phone-only problem, and a cue that disappears at a breakpoint is a second
            behaviour to reason about for no gain.
            ⚠️ GATED ON `staff` because the results block below is: without it the link would scroll to
            an element that does not exist and appear to do nothing.
            🔴 `scrollIntoView`, NOT ARITHMETIC ON `window.scrollTo`. app/trucks/[slug]/order/page.tsx
            records why: the browser applies the target's own `scroll-margin-top`, so the offset lives
            on the destination instead of being recomputed by every caller. The `scroll-mt-4` is on the
            results wrapper below.
            ⚠️ `html:has(.hg-landing) { scroll-behavior: smooth }` in landing.css does NOT reach this
            page — the calculator is deliberately outside that scope — so the behaviour is passed
            explicitly here, and reduced-motion is honoured by hand rather than inherited. */}
        {staff && (
          <p className="mt-6 text-center">
            <button type="button"
              onClick={() => {
                const el = document.getElementById('cost-results')
                if (!el) return
                const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
              }}
              className="text-sm font-semibold text-slate-500 underline underline-offset-4 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
              See your saving ↓
            </button>
          </p>
        )}

        {staff && (
          <div id="cost-results" className="mt-6 scroll-mt-4 space-y-4">
            <div className="overflow-hidden rounded-2xl border-2 bg-white shadow-lg" style={{ borderColor: ORANGE }}>
              <div className="px-6 py-9 text-center">
                {/* ── 🔴 THE BEFORE/AFTER, AND IT IS THE ANCHOR THE FIGURE NEEDS TO MEAN ANYTHING. ────────
                    The saving used to stand alone up here while the competitor's annual cost sat in the
                    NEXT CARD DOWN, across a card boundary. A contrast effect needs the two numbers
                    adjacent — a result shown without its anchor loses a substantial part of its
                    perceived value, which is the entire mechanism this page runs on.
                    🔴 THESE ARE READ, NOT RECOMPUTED. `m.theirsYear` and `m.oursY1` are the SAME memo
                    fields the detail card's Year One line renders, so the two presentations cannot
                    disagree. ⚠️ Recomputing them here — even with identical arithmetic — would be a
                    second definition that drifts the first time the model changes.
                    ⚠️ SUBORDINATE ON PURPOSE: `text-sm text-slate-500` against the figure below. They are
                    CONTEXT. If they ever grow to compete with the figure, the hero has two subjects and
                    the contrast stops working. */}
                {/* ── 🔴 ATTEMPT THREE. THE FIRST TWO BOTH DIED THE SAME WAY — READ THIS BEFORE EDITING. ──
                    Both earlier versions put the label, the amount and the qualifier in a MULTI-COLUMN GRID
                    TEMPLATE (`grid-cols-[auto_auto]`, then `grid-cols-[auto_auto_auto]`). Rendered, both
                    collapsed to a SINGLE column: every cell became its own line, `text-right` floated the
                    amounts to the far edge, and two rows rendered as four or five lines.
                    🔴 THE LESSON IS NOT "PICK BETTER COLUMN VALUES". It is that both layouts DEPENDED ON A
                    TEMPLATE BEING HONOURED and neither degraded gracefully when it was not. A flex row has
                    no template to lose: if anything about it fails to apply, the worst case is that the row
                    loses its GAP — it cannot lose its LINE.
                    ⚠️ DO NOT REINTRODUCE A GRID HERE. Two attempts, same failure, same cause.

                    🔴 CENTRING IS DONE BY THIS FLEX WRAPPER, NOT BY A WIDTH ON THE PANEL. `inline-block`
                    (attempt one) made the panel too narrow; `mx-auto w-max` (attempt two) left it full
                    width. A flex item is content-sized by default — `flex-grow: 0` with an `auto` basis —
                    so `justify-center` on the parent centres it without the panel declaring any width at
                    all. ⚠️ DO NOT PUT `w-`, `max-w-` OR `inline-block` BACK ON THE PANEL. Every width this
                    block has ever carried has been the thing that broke it. */}
                <div className="flex justify-center">
                  {/* ── ⚠️ THE FILL WAS STRENGTHENED, AND NO BORDER WAS ADDED. ONE CHANGE, NOT TWO. ──────
                      `#F8FAFC` (slate-50) against a white card is roughly a 2% step — not enough to read
                      as an object, which is why the panel looked like a footnote. It is now `#F1F5F9`
                      (slate-100), a colour ALREADY IN THIS FILE (it is the hairline between the year
                      blocks), so no new value entered the palette.
                      🔴 A BORDER WAS THE OTHER OPTION AND WAS REJECTED. This panel sits inside a card
                      that already carries a 2px ORANGE border; a hairline here would be a second edge
                      inside it. A fill is a SURFACE — it separates without drawing another line.
                      ⚠️ DO NOT NOW ADD THE BORDER TOO. The brief allowed one of the two. */}
                  <div className="rounded-xl px-5 py-4 text-left" style={{ backgroundColor: '#F1F5F9' }}>
                    {/* ⚠️ "a year" IS ON BOTH ROWS, AND THAT IS DELIBERATE. It used to hang off the first row
                        only, as a shared qualifier. Both figures are annual and both must say so — a reader
                        who scans one row must not be able to take that figure as monthly, which is the
                        misreading that flatters us. It costs a repeated word and it removes an ambiguity. */}
                    {/* ⚠️ `text-base` IS COPIED FROM THE ANCHOR SENTENCE ("That's a full refit…"), which is
                        `mt-5 max-w-xs border-t pt-5 text-base text-slate-500` in this same card. It was NOT
                        picked as "one step up from text-sm" and then found to agree — the anchor sentence
                        was read first and its class taken. The two are now the same size on purpose, so if
                        one moves the other must.
                        🔴 THE ROWS STAY BELOW THE FIGURE IN WEIGHT. Larger, not competing: still slate,
                        still no orange, still no bold on the first row. If they ever read as a second
                        subject the contrast the hero runs on is gone. */}
                    {/* ⚠️ ROW ONE KEEPS "a year" AND THAT IS NOT AN OVERSIGHT. Their cost IS a genuine
                        ongoing rate — nothing about it changes after the first twelve months. Row two's
                        does. 🔴 THE TWO QUALIFIERS DIFFER ON PURPOSE; DO NOT HARMONISE THEM.
                        ⚠️ `text-sm sm:text-base`, NOT `text-base`. These rows and the anchor sentence were
                        deliberately matched at `text-base` — THAT MATCH NOW HOLDS ONLY ABOVE 640px, by
                        design: below it the rows drop a step so the panel stays inside a 375px card. The
                        anchor sentence is unchanged and stays `text-base` throughout. */}
                    {/* ⚠️ `gap-1`, NOT `gap-3`. 12px between the label and the amount read as a LAYOUT
                        GUTTER — a large space before the £ — when these rows are meant to read as one
                        sentence. 4px is a word space at this size. ⚠️ DO NOT WIDEN IT BACK: the two
                        spans are one phrase, not two columns (and they cannot be columns — see the
                        report on why alignment costs a width class). */}
                    <div className="flex items-baseline gap-1 whitespace-nowrap text-sm sm:text-base">
                      {/* ── 🔴 BALANCE INVERTED INSIDE EACH ROW: LABEL = CAPTION, AMOUNT = SUBSTANCE. ────
                          Every part of these rows used to be `text-slate-500` at one size, so a label and
                          a figure carried identical emphasis and the row read as PROSE. The panel had
                          been pushed quiet twice so it would not compete with the figure, and it
                          overshot.
                          🔴 ONE SIZE THROUGHOUT — WEIGHT AND COLOUR CARRY THE HIERARCHY, NOTHING ELSE.
                          The labels were briefly `text-xs sm:text-sm`, which rendered SMALLER than the
                          "a year" qualifier beside them and broke the line into two visual sizes. Every
                          span in these rows now inherits the row's `text-sm sm:text-base`:
                            label      (row size)  slate-500   font-normal
                            theirs     (row size)  slate-800   font-semibold
                            ours       (row size)  slate-800   font-bold      ← the one-step lead
                            qualifier  (row size)  slate-500   font-normal
                          ⚠️ slate-500, NOT slate-400 (operator decision, 25 August — "a little grey").
                          At full row size slate-400 was too faint to read as part of the sentence; it had
                          only been that light while the labels were also a size smaller. The fleet note
                          below KEEPS slate-400 — it is genuinely subordinate to these two rows and is now
                          the only thing in the panel set that light.
                          ⚠️ DO NOT PUT A SIZE ON ANY SPAN IN THESE ROWS. The row owns the size.
                          🔴 THE TWO AMOUNTS DIFFER BY WEIGHT ALONE — AND THAT IS THE WHOLE SETTLEMENT
                          (operator decisions, 25 August, in two steps). They briefly differed by weight
                          AND colour (`font-bold text-slate-800` against `font-semibold text-slate-600`),
                          which read as two different KINDS of figure rather than two sides of one
                          comparison. They were then made identical, which lost our emphasis entirely.
                          ⚠️ SAME SIZE, SAME COLOUR, ONE STEP OF WEIGHT. Ours leads without looking like a
                          different sort of number. Do not reintroduce a colour split here.
                          🔴 STOPPING AT slate-800 IS THE POINT, NOT AN ACCIDENT. The percentage line
                          below is `text-lg font-semibold`; these amounts are SMALLER than it and stop
                          short of INK. ⚠️ DO NOT PUSH THEM TO slate-900 OR text-lg — at that point the
                          hero has two subjects and the contrast it runs on is gone.
                          ⚠️ "a year" / "in year one" ARE LIGHT ON PURPOSE — the LABEL's colour, not the
                          amount's. They QUALIFY the amount; in the amount's weight the timeframe would
                          read as a second figure.
                          🔴 NO GRID AND NO WIDTH CLASS ENTERED THIS BLOCK, and the two amounts still do
                          not share a left edge — that cannot be bought without one. See the report. */}
                      <span className="text-slate-500">Right now you pay</span>
                      <span className="font-semibold tabular-nums text-slate-800">
                        {gbp(m.theirsYear)}<span className="font-normal text-slate-500"> a year</span>
                      </span>
                    </div>
                    {/* ⚠️ `mt-1`, NOT a fractional step — the two rows are ONE PAIR, not two paragraphs.
                        🔴 SEMIBOLD AND DARKER, AND DELIBERATELY NOT ORANGE. Orange belongs to the figure
                        below; a second orange number here would give the hero two subjects and kill the
                        contrast the card runs on. ⚠️ THE WEIGHT IS UNCONDITIONAL — it marks OUR row, not the
                        WINNING row, so when we are dearer the emphasis still sits on our number. A weight
                        that flipped with the result would present the same comparison two different ways
                        depending on who won, on a page built to be shown to people shopping around. */}
                    <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap text-sm sm:text-base">
                      <span className="text-slate-500">With HatchGrab</span>
                      {/* ── 🔴 "in year one", NOT "a year". THIS IS AN HONESTY FIX, NOT A WORDING ONE. ──
                          `m.oursY1` is `oursMonth * (12 - free)` — the free months are IN it, so it is
                          lower than every year after it. Labelled "a year" it reads as the ONGOING rate,
                          and an operator planning on that number would have been misled BY US.
                          🔴 THE QUALIFIER GOES ON THE AMOUNT, NOT THE LABEL. "With HatchGrab, first year"
                          plus "£1,027 a year" says year twice and reads badly.
                          ⚠️ DO NOT ADD A YEAR-TWO ROW HERE — considered and rejected. A third row dilutes
                          the two-line contrast this panel exists to create, and the detail card's YEAR TWO
                          block already carries that figure with its own saving directly beneath it. The
                          panel's job is one comparison, not a schedule. */}
                      <span className="font-bold tabular-nums text-slate-800">
                        {gbp(m.oursY1)}<span className="font-normal text-slate-500"> in year one</span>
                      </span>
                    </div>
                    {/* ⚠️ THE AMOUNTS NO LONGER SHARE A RIGHT EDGE, AND THAT WAS THE INSTRUCTED TRADE: the
                        two labels are different lengths, so left-packed flex rows cannot align the amounts
                        without a fixed label width — which is another measurement that can fail, which is
                        the whole problem. Two clean single lines beat a column that renders as five. */}
                    {/* ⚠️ THE FLEET NOTE STAYS INSIDE THE PANEL. It is the SCOPE of every figure in the card,
                        so losing it would leave a one-truck reader and a three-truck reader looking at the
                        same numbers with no way to tell which they were. */}
                    {/* ⚠️ THE FLEET NOTE STAYS AT `text-xs` while the rows go up. It is not a third row —
                        it is the SCOPE of the two above it, and widening the gap between them is what keeps
                        that relationship legible. Raising it too would have made three sizes read as three
                        facts. */}
                    {fleet > 1 && (
                      <p className="mt-2 text-right text-xs text-slate-400">across {fleet} trucks</p>
                    )}
                  </div>
                </div>

                {/* ── 🔴 THE VERB IS ATTACHED TO THE FIGURE, AND THAT IS THE POINT OF ITS SIZE. ──────────
                    This was a small grey uppercase eyebrow, which gets skimmed — so the figure arrived
                    unlabelled and could read as a PRICE rather than a saving. It is now dark and set at
                    the same size as the percentage line below, with `mt-1` under it, so the verb and the
                    number read as one unit rather than as a caption and a number.
                    ⚠️ DO NOT SHRINK IT BACK. Its legibility is the fix, not its styling. */}
                <p className="mt-5 text-lg font-semibold" style={{ color: INK }}>{heroVerb}</p>
                <p className="mt-1 font-black tabular-nums"
                  style={{ color: good ? ORANGE : SLATE, fontSize: heroSize, lineHeight: 0.92, letterSpacing: '-0.03em' }}>
                  {gbp(Math.abs(m.saveY1))}
                </p>
                {/* ⚠️ "in your first year" IS LOAD-BEARING. Without a timeframe the figure can be read as
                    monthly or as a lifetime total, and both misreadings flatter us. */}
                <p className="mt-4 text-lg font-semibold text-slate-500">
                  <span className="tabular-nums">{Math.abs(m.pctY1).toFixed(0)}%</span>{' '}
                  {good ? 'less' : 'more'} in your first year
                </p>
                {anch && (
                  <p className="mx-auto mt-5 max-w-xs border-t pt-5 text-base text-slate-500" style={{ borderColor: '#F1F5F9' }}>
                    That&apos;s {anch}.
                  </p>
                )}
              </div>

              {/* ── 🔴 THE ACTION CHANGED FROM "UPLOAD YOUR MENU" TO "START FREE" (23 August 2026) ──────
                  Someone on the LANDING is asking "what is this?", and uploading a menu answers that.
                  Someone who has just typed in their own trading figures has already decided it is
                  interesting and is asking "is it cheaper for me?" — a file upload is a heavier ask than
                  the moment warrants, and it fails outright for anyone on a phone with no menu file.
                  🔴 SO THIS IS A PLAIN LINK, NOT A DemoCta. Do not convert it back without re-reading
                  this: the demo is the wrong verb at this point in the journey, not merely a different
                  one.
                  🔴 THE FALLBACK BRANCH IS NOT DECORATIVE. When the operator's current provider is
                  cheaper, `good` is false and the label must stop claiming a saving — and it must no
                  longer promise a demo either, so it is now "Start free →" rather than "Try it with your
                  menu →". Exercised — see the report.
                  ⚠️ STACKED BELOW 640px, SIDE BY SIDE ABOVE IT. Two buttons on one row at 375px would
                  leave each about 150px; `flex-col sm:flex-row` gives them the full width each on a
                  phone. */}
              <div className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-3">
                <a href="/signup" className={`${CTA_PRIMARY} flex-1 px-6 py-4 text-lg`}>
                  {good ? `Start free and save ${gbp(m.saveY1)} →` : 'Start free →'}
                </a>
                {/* ── ⚠️ "Ask us a question", NOT "Talk to us" — AND NOT "Chat to us" EITHER. ─────────
                    🔴 EVERY REJECTED LABEL IMPLIED A CHANNEL WE DO NOT HAVE. "Talk to us" implies a
                    phone number, and we publish none. "Chat to us" implies live chat, and there is
                    none. This label describes what the operator would actually DO and promises nothing
                    about how or how fast the answer arrives — which matters more here than on the
                    landing, because the destination is a form plus an email address, not a person.
                    🔴 `topic=Cost%20Comparison` USES THE MECHANISM THAT ALREADY EXISTS — it was NOT
                    built for this. app/contact/ContactForm.tsx reads `topic` from the query string and
                    passes it to the Tally embed; the landing footer sends `General%20Enquiry`, the
                    discovery surfaces send `Add%20Business` / `Report%20Issue` / `ClaimVenue`. Title
                    Case, %20-encoded, matching those four exactly.
                    ⚠️ An enquiry from this page is now identifiable in Tally without anyone asking
                    "where did you come from?" in the form itself. */}
                <a href="/contact?topic=Cost%20Comparison" className={`${CTA_SECONDARY} flex-1 px-6 py-4 text-lg`}>
                  Ask us a question
                </a>
              </div>
              <p className="px-6 py-3 text-center text-xs text-slate-500" style={{ backgroundColor: CREAM }}>
                No card needed to set up
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm md:p-6" style={{ borderColor: '#E2E8F0' }}>
              <YearLine label="Year one" theirs={m.theirsYear} ours={m.oursY1} save={m.saveY1} pct={m.pctY1} />
              <div className="my-5 h-px" style={{ backgroundColor: '#F1F5F9' }} />
              <YearLine label="Year two" theirs={m.theirsYear} ours={m.oursY2} save={m.saveY2} pct={m.pctY2} />

              {/* Same test as the CTA: a two-year total that prints as £0 does not get announced.
                  ⚠️ THE "LEFT, NOT CENTRED, SO THE CARD SHARES ONE EDGE" RULE IS DELIBERATELY OVERRIDDEN
                  HERE (operator decision, 24 August 2026). Sharing the year rows' left edge is exactly
                  what made this read as a third year row rather than as the summary of the two above it.
                  It is now centred and one size up, which is the ONLY thing in this card that is centred —
                  that difference is what says "this is not another row".
                  🔴 DO NOT UNDERLINE IT AND DO NOT MAKE IT A LINK. Everything else in this region is a link
                  or a button, so an underline here would be read as clickable and the click would go
                  nowhere. The orange is emphasis, not affordance.
                  ⚠️ SEPARATED BY SPACE, NOT BY A RULE, AND THE REASON IS THE RULE ITSELF: an identical
                  `#F1F5F9` hairline already separates Year one from Year two, so a second one would enrol
                  this line as a third peer row — the precise misreading being fixed. `mt-8` steps up from
                  the 20px rhythm the year blocks use. ⚠️ IT HAS NOT BEEN SEEN, and it was NOT inflated
                  further to pre-compensate for that. */}
              {isRealSaving(m.twoYear) && (
                <p className="mt-8 text-center text-base text-slate-600">
                  Over two years that&apos;s{' '}
                  <strong className="tabular-nums" style={{ color: ORANGE }}>{gbp(m.twoYear)}</strong> saved.
                </p>
              )}
              {/* ── 🔴 THE EFFECTIVE-RATE LINE WAS REMOVED (23 August 2026). DO NOT REINSTATE IT. ────────
                  It read "{x}% of takings now, against {y}% on HatchGrab." It looks like a helpful
                  summary and it is the one line on the page that tells a competitor exactly what to do:
                  it publishes the precise rate they would need to undercut, computed from our own
                  pricing, on a page whose whole purpose is to be shown to people shopping around.
                  ⚠️ Every other figure here is about THIS operator's situation. That one was about our
                  position in the market. `effTheirs` and `effOurs` were deleted with it. */}
              {/* ⚠️ THE "Adjust plan prices" TOGGLE AND ITS TWO INPUTS WERE DELETED (23 August 2026).
                  Prices come from PLAN_MONTHLY_PENCE and an operator must not be able to edit them — an
                  editable price on a page that computes a saving is a page that can be made to say
                  anything. The `proPrice`/`maxPrice`/`open` state went with them. */}
            </div>
          </div>
        )}

        {/* ── 🔴 "EXCLUDED FROM BOTH SIDES" IS TRUE IN BOTH MODES, AND THE BRIEF ASSUMED IT WAS NOT. ──
            Both toggle branches produce THE SAME QUANTITY — the competitor's PLATFORM fee with card
            processing out of it. 'inclusive' subtracts it from a rate that contained it; 'ontop' takes a
            rate that never contained it. Neither branch ADDS card processing to their side, so it is
            excluded from theirs and from ours under both. ⚠️ REWRITING THIS SENTENCE TO SAY IT IS
            INCLUDED IN THEIRS WOULD HAVE MADE A TRUE FOOTNOTE FALSE. See the report.
            🔴 WHAT DID NEED SAYING is the new ambiguity mode 2 creates: question 4 now prints an ALL-IN
            figure that DOES include card processing, directly above a comparison that does not. Without
            the conditional clause a reader can reasonably assume the 4.5% they were just shown is the
            number being compared. That clause is the only change here. */}
        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Estimates based on the figures you enter, assuming an average order of {gbp(AOV)}. Card
          processing of {CARD_PCT}% + {CARD_PENCE}p per order applies whichever provider you use, so
          it&apos;s excluded from both sides.
          {feeMode === 'ontop' && ' The all-in figure in question 4 includes it — the comparison does not, on either side.'}
          {' '}Check your current provider&apos;s rates before deciding.
        </p>

        {/* The second CTA, for anyone who scrolled past the first. Same action, plainer label. */}
        {/* ⚠️ THE SECOND CTA, for anyone who scrolled past the first. Same destination as the primary.
            ⚠️ ITS `mt-6` WAS CHOSEN WHILE IT WAS INVISIBLE and has still never been judged in position —
            it is 24px below the small print, which is the only gap on the page not set against something
            visible. Reported rather than adjusted; see the report. */}
        <a href="/signup" className={`${CTA_PRIMARY} mt-6 block w-full px-6 py-4 text-base`}>
          Start free →
        </a>
      </div>

      {/* ⚠️ A RANGE INPUT'S DEFAULT FOCUS RING IS INVISIBLE IN MOST BROWSERS once the track is styled —
          the outline draws around a 6px-tall element and is lost against it. The thumb is given the ring
          explicitly so the control is keyboard-discoverable. */}
      <style>{`
        .hg-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;background:#E7E2DA;outline:none}
        .hg-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:999px;background:${ORANGE};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.22);cursor:pointer}
        .hg-range::-moz-range-thumb{width:26px;height:26px;border-radius:999px;background:${ORANGE};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.22);cursor:pointer}
        .hg-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px rgba(239,139,44,.45),0 1px 6px rgba(0,0,0,.22)}
        .hg-range:focus-visible::-moz-range-thumb{box-shadow:0 0 0 4px rgba(239,139,44,.45),0 1px 6px rgba(0,0,0,.22)}
      `}</style>
    </div>
  )
}

function YearLine({ label, theirs, ours, save, pct }: {
  label: string; theirs: number; ours: number; save: number; pct: number
}) {
  return (
    <div>
      {/* ── ⚠️ TOP-DOWN, ALL LEFT-ALIGNED (23 August 2026). ─────────────────────────────────────────
          The label used to sit left with the saving pushed to the right edge by `justify-between`, so
          the eye crossed the whole card to connect two facts about the same year — and the three lines
          started at three different places. They now stack against one edge: label, then the figure,
          then the comparison that explains it. Nothing about the figure changed but its position. */}
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p>
      {/* ⚠️ `isRealSaving`, NOT `save >= 0`. A line that prints "Save £0" makes the same claim the CTA
          fix exists to stop, one card lower. A value that rounds away is not a saving, so it reads
          "Extra £0" — which is literally true (there is £0 difference) and stops short of claiming
          one. ⚠️ NO NEW COPY WAS INVENTED for this case; a dedicated "Level" wording would read better
          and is a decision, not a fix. */}
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: isRealSaving(save) ? ORANGE : SLATE }}>
        {isRealSaving(save) ? 'Save ' : 'Extra '}{gbp(Math.abs(save))}
        {/* ── ⚠️ "(69% less)", NOT A BARE "69%". ────────────────────────────────────────────────
            A bare percentage beside an amount does not say WHAT it is a percentage of — it can read
            as a share of the saving, or of our price, or of nothing.
            🔴 NOT "% off". That is retail-discount language and it implies we are discounting OUR own
            price; this is a comparison against what they pay ELSEWHERE. "less" also inverts correctly
            to "more" in the non-saving case, where "off" would be nonsense.
            ⚠️ "less" IS THE HERO'S OWN WORD — it renders "{n}% less in your first year" — so the two
            are deliberately the same claim at two sizes. Change one and change both.
            ⚠️ STILL SUBORDINATE: `text-sm` against the amount's `text-2xl`, and slate against its
            orange. It explains the number beside it; it is not a second number. */}
        <span className="ml-2 text-sm font-bold text-slate-400">
          ({Math.abs(pct).toFixed(0)}% {isRealSaving(save) ? 'less' : 'more'})
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>Current provider <strong className="tabular-nums text-slate-700">{gbp(theirs)}</strong></span>
        <span className="text-slate-300">→</span>
        {/* ⚠️ "HatchGrab", NOT "HatchGrab Pro"/"HatchGrab Max" (23 August 2026). The tier is already
            stated once, in question 2 — ⚠️ QUOTATION CORRECTED 24 August 2026: that card now reads
            "We suggest Pro" / "We suggest Max" above the price, not the old "Pro — £29 per truck per
            month…". The CLAIM was always true; only the quote had gone stale. Repeating it on both year
            lines made the comparison about which PLAN they would be on, when the line exists to compare
            two TOTALS. `planName` is no longer a prop of this component as a result. */}
        <span>HatchGrab <strong className="tabular-nums" style={{ color: ORANGE }}>{gbp(ours)}</strong></span>
      </div>
    </div>
  )
}

function Card({ n, title, children, disabled }: {
  n: string; title: string; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm transition md:p-6"
      style={{ borderColor: '#E2E8F0', opacity: disabled ? 0.45 : 1 }}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-black text-slate-500"
          style={{ backgroundColor: '#F1F5F9' }}>
          {n}
        </span>
        <p className="text-base font-bold">{title}</p>
      </div>
      {children}
    </div>
  )
}
