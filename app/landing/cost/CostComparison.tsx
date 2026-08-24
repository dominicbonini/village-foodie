'use client'

// app/landing/cost/page.tsx
// The cost comparison calculator. An operator enters what they pay a current provider and sees what a
// year on HatchGrab would cost instead.
//
// ── 🔴 WHY IT LIVES UNDER /landing, AND IT IS NOT A FILING PREFERENCE ───────────────────────────────
// `app/landing/layout.tsx` gates every descendant: in production it redirects anyone who is not an
// admin to /contact. This page is marketing copy carrying real pricing, so it must not be publicly
// reachable while the landing is embargoed. Being a CHILD of that route inherits the gate BY
// CONSTRUCTION — there is no second gate to write and none to forget. A top-level /cost would have
// needed a copy of that layout, and the copy is the drift.
// ⚠️ IF THIS IS EVER MOVED, the gate moves with it or it is gone. And a copied gate must redirect to
// /contact, NOT to '/': proxy.ts rewrites '/' to the landing on hatchgrab.com, so redirecting there
// loops forever on the domain given to Apple as the Marketing URL.
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

function anchor(v: number): string | null {
  if (v < 80) return null
  if (v < 200) return "about a month's public liability cover"
  if (v < 500) return 'a couple of festival pitch fees'
  if (v < 1000) return 'a season of pitch fees'
  if (v < 2000) return 'a new fryer and griddle'
  if (v < 4000) return 'a full refit of your serving counter'
  if (v < 8000) return 'a deposit on another van'
  return 'another van on the road'
}

// ⚠️ THE PROVIDER AND THE MODAL MOVED UP TO page.tsx (23 August 2026). This component no longer renders
// a DemoCta of its own — its CTAs are plain links now — but the shared LandingNav above it still does,
// so the provider is still required in the tree, one level higher. **There must be exactly one.**
export default function CostComparison() {
  const [trucks, setTrucks] = useState(1)
  const [staff, setStaff] = useState<1 | 2 | null>(null)
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
  const [trucksRaw, setTrucksRaw] = useState('')

  const feePct = numOr(feePctRaw, 0)
  const feePence = numOr(feePenceRaw, 0)
  const freeMonths = numOr(freeMonthsRaw, 0)

  const isMax = staff === 2
  const tier = isMax ? PLANS.max : PLANS.pro
  const plan = tier.monthly
  const planName = tier.name
  const allowance = tier.allowance
  const free = Math.min(12, Math.max(0, freeMonths))
  const fleet = Math.max(1, trucks || 1)

  const m = useMemo(() => {
    const orders = gmv / AOV
    const theirPct = Math.max(0, feePct - CARD_PCT)
    const theirPence = Math.max(0, feePence - CARD_PENCE)

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
  }, [gmv, feePct, feePence, plan, free, allowance, fleet])

  // 🔴 EVERY PLACE THAT ANNOUNCES A SAVING AS A FIGURE HANGS OFF THIS, so they cannot disagree: the
  // hero heading, the hero colour, the "that's a new fryer" anchor and the primary CTA label.
  const good = isRealSaving(m.saveY1)
  const anch = good ? anchor(m.saveY1) : null
  // 🔴 KEEP DYNAMIC. The hero figure is sized from the RENDERED STRING's length so a fleet total does
  // not wrap to two lines. A fixed Tailwind size cannot do this — it is the one inline style that must
  // survive conversion.
  const heroDigits = gbp(Math.abs(m.saveY1)).length
  const heroSize = heroDigits > 7 ? 60 : heroDigits > 5 ? 76 : 92

  return (
    <div className="min-h-screen px-5 py-10 md:py-14" style={{ backgroundColor: '#FAF8F5', color: INK }}>
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Cost comparison</p>
        <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight md:text-5xl">
          How much of your takings
          <br />
          <span style={{ color: ORANGE }}>are you handing over?</span>
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

          <Card n="2" title="How many people work each van?">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {([{ v: 1 as const, label: 'One' }, { v: 2 as const, label: 'Two or more' }]).map(o => (
                <button key={o.v} onClick={() => setStaff(o.v)}
                  className="min-w-0 flex-1 rounded-xl border-2 px-4 py-4 text-base font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={staff === o.v
                    ? { backgroundColor: ORANGE, borderColor: ORANGE, color: '#fff' }
                    : { borderColor: '#E2E8F0', backgroundColor: '#fff', color: SLATE }}>
                  {o.label}
                </button>
              ))}
            </div>
            {staff && (
              <p className="mt-3 text-sm text-slate-600">
                {planName} — {gbp(plan)} per truck per month, {tier.allowanceLabel} of online orders
                included on each.
              </p>
            )}
          </Card>

          <Card n="3" title="Online orders per month, per truck" disabled={!staff}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-slate-500">One truck · about {Math.round(m.orders)} orders</span>
              <span className="text-3xl font-black tabular-nums">{gbp(gmv)}</span>
            </div>
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
            {feePct > CARD_PCT && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Card processing of {CARD_PCT}% + {CARD_PENCE}p is inside that, and you&apos;d pay it
                anywhere. Their own fee is{' '}
                <strong className="tabular-nums" style={{ color: ORANGE }}>{m.theirPct.toFixed(1)}%</strong>.
              </p>
            )}
          </Card>

          {/* ── ⚠️ ITS OWN QUESTION, NOT A FOOTER ON QUESTION 4 (23 August 2026). ────────────────────
              It sat inside "What do you pay per order now?", which asks about the operator's CURRENT
              provider. Months free is a HatchGrab offer — the opposite side of the comparison — so
              nesting it there put our number inside their question and quietly implied the free months
              were something their provider gave them. Separate card, separate subject. */}
          <Card n="5" title="How many months free do you get?" disabled={!staff}>
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

        {staff && (
          <div className="mt-6 space-y-4">
            <div className="overflow-hidden rounded-2xl border-2 bg-white shadow-lg" style={{ borderColor: ORANGE }}>
              <div className="px-6 py-9 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {good ? 'Your first year saving' : 'Extra in your first year'}
                  {fleet > 1 && ` · ${fleet} trucks`}
                </p>
                <p className="mt-3 font-black tabular-nums"
                  style={{ color: good ? ORANGE : SLATE, fontSize: heroSize, lineHeight: 0.92, letterSpacing: '-0.03em' }}>
                  {gbp(Math.abs(m.saveY1))}
                </p>
                <p className="mt-4 text-lg font-semibold text-slate-500">
                  <span className="tabular-nums">{Math.abs(m.pctY1).toFixed(0)}%</span>{' '}
                  {good ? 'less than you pay now' : 'more than you pay now'}
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
                <a href="/contact" className={`${CTA_SECONDARY} flex-1 px-6 py-4 text-lg`}>
                  Talk to us
                </a>
              </div>
              <p className="px-6 py-3 text-center text-xs text-slate-500" style={{ backgroundColor: CREAM }}>
                No card needed to set up · Keep your own customers
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm md:p-6" style={{ borderColor: '#E2E8F0' }}>
              <YearLine label="Year one" theirs={m.theirsYear} ours={m.oursY1} save={m.saveY1} pct={m.pctY1} />
              <div className="my-5 h-px" style={{ backgroundColor: '#F1F5F9' }} />
              <YearLine label="Year two" theirs={m.theirsYear} ours={m.oursY2} save={m.saveY2} pct={m.pctY2} />

              {/* Same test as the CTA: a two-year total that prints as £0 does not get announced.
                  ⚠️ Left, not centred, so the whole detail card shares one edge with the year blocks. */}
              {isRealSaving(m.twoYear) && (
                <p className="mt-5 text-sm text-slate-500">
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

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Estimates based on the figures you enter, assuming an average order of {gbp(AOV)}. Card
          processing of {CARD_PCT}% + {CARD_PENCE}p per order applies whichever provider you use, so
          it&apos;s excluded from both sides. Check your current provider&apos;s rates before deciding.
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
        <span className="ml-2 text-sm font-bold text-slate-400">{Math.abs(pct).toFixed(0)}%</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>Current provider <strong className="tabular-nums text-slate-700">{gbp(theirs)}</strong></span>
        <span className="text-slate-300">→</span>
        {/* ⚠️ "HatchGrab", NOT "HatchGrab Pro"/"HatchGrab Max" (23 August 2026). The tier is already
            stated once, in question 2 ("Pro — £29 per truck per month…"). Repeating it on both year
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
