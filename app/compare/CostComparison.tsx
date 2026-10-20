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
// ── 🔴 EVERY PRICE COMES FROM THE PLAN DATA. NOTHING IS PARSED, NOTHING IS TYPED TWICE. ──
// Stage B of the new pricing (docs/pricing-pages-report.md): the plans, their monthly prices, included amounts and
// fees are public.plans / plan_prices (lib/plans.ts, through lib/plan-offer.ts), passed in by the server page; card
// processing is the country's (lib/card-fees.ts). The plan the page suggests is the CHEAPEST at the volume entered
// (lib/plan-offer.ts cheapestAt) — ⛔ no plan key or name is written here, and a fourth plan simply joins the choice.
//
// ── ⚠️ MONEY IS POUNDS HERE, AND ONLY HERE ─────────────────────────────────────────────────────────
// The constants are integer PENCE, which is the codebase's money type. This page converts to pounds at
// the boundary below and does the rest of its arithmetic in floats, because the prototype's maths is
// settled and because everything on screen is an ESTIMATE the small print labels as such. 🔴 NOTHING
// HERE CHARGES ANYONE. If any of this is ever reused to compute a real charge, it must be redone in
// pence — see §16 on `orders.total_minor`.
import { useState, useMemo } from 'react'
import { DemoCta } from '@/components/landing/DemoUpload'
import { cardFees } from '@/lib/card-fees'
import type { PlanCatalog } from '@/lib/plans'
import { offerPlans, offerTrialMonths, cheapestAt, type OfferPlan, type FeeShape } from '@/lib/plan-offer'
import type { CountrySettings } from '@/lib/country-settings-types'
import { toMajor, formatMajor, formatWholeAmount, smallFeeLabel, minorDigits, roundsToZero, feeLabel, pctLabel, minorUnitSuffix, type MoneyFormat } from '@/lib/money-format'
import { moneyFormatOf } from '@/lib/country-settings-types'
import { contactHref } from '@/lib/contact-topics'
// Language Phase 1e: every word on this page is in messages (`compare`), read in the locale the PAGE passes in — the
// visitor's country (app/compare/page.tsx, or the /uk and /us routes). Nothing here resolves a country itself.
import { translatorFor } from '@/lib/i18n/translator'
import type { AppLocale } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/compare'

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
// ⚠️ `cursor-pointer` IS NOT COSMETIC HERE — IT REPLACES AN AFFORDANCE THE CONVERSION REMOVED.
// Two of these CTAs became <button>s on 3 September 2026 (see the notes at each). An <a href> gets
// `cursor: pointer` from the UA stylesheet; a <button> does not, and Tailwind's preflight leaves it at
// `default`. Measured after the conversion: both converted CTAs computed `cursor: default` while the
// nav's own CTA computed `pointer` (landing.css `.btn` sets it). That is a hover affordance silently
// lost on the page's two primary actions. Declared on the BASE so the outline CTA — still an <a> — keeps
// the same value rather than relying on the UA default, and the two cannot drift apart again.
const CTA_BASE =
  'inline-block cursor-pointer rounded-xl text-center font-bold transition focus:outline-none focus-visible:ring-4'
const CTA_PRIMARY = `${CTA_BASE} bg-[#EF8B2C] text-white hover:brightness-95 focus-visible:ring-orange-300`
// ⚠️ SECONDARY IS AN OUTLINE, NOT A SECOND FILL. Two orange buttons side by side would compete and the
// eye would have to choose; the muted one reads as the alternative it is.
const CTA_SECONDARY = `${CTA_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300`
const CREAM = '#FFF7EE'
const INK = '#1A2233'
const SLATE = '#334155'

// ── THE REAL NUMBERS, FROM THE PLAN DATA AND THE COUNTRY'S SETTINGS ─────────────────────────────────
// Stage B: one entry per public plan priced in the country (lib/plan-offer.ts offerPlans), in sort_order, converted to
// whole units at this boundary. `included` null = unlimited; the fee is the plan's own (plan_prices.fee_bps), charged
// on online card orders above `included`. Card processing is STRIPE'S, the fee is OURS — two sources, two owners.
// ⚠️ toMajor, NOT `/ 100` — the manual's "never hardcode ×100" (zero-decimal currencies exist).
interface ComparePlan { offer: OfferPlan; key: string; name: string; monthly: number; included: number | null; feePct: number; shape: FeeShape; includedLabel: string | null }
function pricingFrom(s: CountrySettings, catalog: PlanCatalog) {
  const cur = s.currency
  const fmt = moneyFormatOf(s)
  const PLANS: ComparePlan[] = offerPlans(catalog, s.countryCode).map(o => ({
    offer: o, key: o.plan.key, name: o.plan.name,
    monthly: toMajor(o.monthlyMinor, cur),
    included: o.includedMinor === null ? null : toMajor(o.includedMinor, cur),
    feePct: o.feeBps / 100, shape: o.shape,
    includedLabel: o.includedMinor === null ? null : formatWholeAmount(o.includedMinor, fmt),
  }))
  const CARD_PCT = cardFees(s).online.pct
  const CARD_PENCE = cardFees(s).online.fixedMinor
  return { PLANS, CARD_PCT, CARD_PENCE }
}

// Average order value. ⚠️ THE ONE FIGURE ON THIS PAGE THAT IS OURS RATHER THAN SOURCED — it converts
// order VALUE into an order COUNT so a per-order fee can be applied. The small print states it.
const AOV = 15

// ── THE PAGE'S OWN FIGURES, IN THE MARKETING COUNTRY'S CURRENCY (Phase 2A) ───────────────────────────
// Through lib/money-format, grouped ("£1,234") and with the sign before the symbol ("-£5"), exactly as the
// hand-rolled helper this replaces printed them. ⚠️ The ICU worry recorded here before (a trimmed-ICU
// runtime printing "£1500") is measured now, not avoided: scripts/country-settings-parity.cjs renders this
// page and compares it, and lib/plan-features' allowance label is on the same formatter.
/** "£1,234" / "£12.34". The page's own dynamic figures. Whole units by default. */
function gbpIn(f: MoneyFormat, n: number, dp = 0): string {
  const safe = Number.isFinite(n) ? n : 0
  return formatMajor(safe, f, { grouping: true, decimals: dp, minusBeforeSymbol: true })
}

// ── 🔴 MONEY TO THE PENNY, EXCEPT UNDER A POUND ───────────────────────────────────────────────────
// `gbp(x, 2)` renders "£0.80", which on a per-trading-day figure reads as a price list rather than as
// pocket change — and the whole point of the per-day framing is that the number is small enough to be
// recognised instantly. Under £1 it becomes whole pence ("80p").
// ⚠️ IT DELEGATES TO `gbp` FOR EVERYTHING ELSE, so grouping, the sign and the 2dp all stay in one
// place. This adds a case to the formatter; it does not become a second formatter.
// ⚠️ ROUNDED, NOT TRUNCATED, and rounded on the PENCE: 0.8019… × 100 = 80.19… → "80p". Truncating
// would render 0.999 as "99p" when the next line up says "£1.00".
function moneyIn(f: MoneyFormat, n: number): string {
  const safe = Number.isFinite(n) ? n : 0
  if (Math.abs(safe) < 1) return smallFeeLabel(Math.round(Math.abs(safe) * 10 ** minorDigits(f.currency)), f)
  return gbpIn(f, safe, 2)
}

// ── 🔴 A MONTHLY FIGURE AS A TRADING DAY, ON THE CALENDAR AND NOT ON A ROUND NUMBER ───────────────
// `monthly / 4 / days` is the obvious form and it is wrong: a month is not four weeks. Over a year it
// understates the per-day figure by about 8.3% (52/48), which on this page is an error in OUR favour —
// the number we are asking an operator to judge us on would be too small.
// ⚠️ × 12 ÷ 52 FIRST, THEN ÷ days. The monthly amount becomes a WEEKLY amount against the real number
// of weeks in a year, and only then is it divided by the days the van is actually out.
function perTradingDay(monthly: number, days: number): number {
  const d = Math.max(1, Math.min(7, Math.round(days)))
  return (monthly * 12) / 52 / d
}

// ── 🔴 THE HERO FIGURE IS SIZED FROM ITS RENDERED STRING, AND NOW THREE FIGURES SHARE THE RULE ─────
// This was two inline lines computing `heroDigits`/`heroSize` for the saving figure. The per-trading-day
// headlines need exactly the same treatment — "£2.24" and "80p" are short, a fleet figure is not — and a
// second copy of the thresholds would drift the first time one moved.
// ⚠️ IT TAKES THE STRING, NOT THE NUMBER. The point is how wide the thing on screen is, so "80p" (3) and
// "£1,234.56" (9) are measured as rendered rather than inferred from magnitude. A fixed Tailwind size
// cannot do this; it is the one inline style on this page that must survive any conversion.
function heroSizeFor(rendered: string): number {
  return rendered.length > 7 ? 60 : rendered.length > 5 ? 76 : 92
}

// ── 🔴 A MONTHLY FIGURE AS A WEEK, FOR THE PATH WITH NO DAYS TO DIVIDE BY ─────────────────────────
// The "Yes" path no longer asks how many days a week they trade (it had nothing to use the answer for
// once that result was reframed), so its difference is shown PER WEEK instead of per trading day.
// ⚠️ IT IS `perTradingDay` WITH THE DAYS STEP LEFT OUT — × 12 ÷ 52 and stop. Same calendar reasoning:
// `monthly / 4` would understate the weekly figure by ~8.3%, in our favour.
function perWeek(monthly: number): number {
  return (monthly * 12) / 52
}

// 🔴 UK high-street coffee is ~£3.50+; keep the claim true.
const COFFEE_MAX_PER_DAY = 3.0

/** The page's translator, in the locale the server page passed in. */
function compareT(locale: AppLocale) {
  return translatorFor(locale, 'compare')
}
type CompareT = ReturnType<typeof compareT>

/** "And your first month is on us." / "…first N months are on us." (an ICU plural). Nothing below one. */
function freeMonthsLine(t: CompareT, n: number): string | null {
  if (n < 1) return null
  return t('freeMonths', { n })
}

// ── A PERCENTAGE THE PAGE COMPUTED, WITH A FIXED NUMBER OF DECIMALS ("3.0%", "69%", "3.07%") ─────────────
// Language Phase 1e: this was `x.toFixed(1) + '%'` (and `.toFixed(0)`, and `.toFixed(2)` with trailing zeros
// stripped). ⚠️ toFixed STILL DECIDES THE DIGITS — exactly as lib/money-format's `rounded` does for money — and Intl
// only lays them out in the page's locale, so the GB output is the string the old code printed. No grouping, as
// before ("1000%", never "1,000%").
function pctFixed(f: Pick<MoneyFormat, 'locale'>, n: number, minDp: number, maxDp: number): string {
  const r = Number((Number.isFinite(n) ? n : 0).toFixed(maxDp))
  return new Intl.NumberFormat(f.locale, { style: 'percent', useGrouping: false, minimumFractionDigits: minDp, maximumFractionDigits: maxDp })
    .format(r / 100)
}

// ── 🔴 "DOES IT RENDER AS ZERO?" ASKED OF THE FORMATTER, NOT OF THE NUMBER ─────────────────────────
// A saving of £0.004 is > 0, so the old test claimed a saving and then printed "£0" — "Start free and
// save £0 →". The obvious fix is a threshold like `>= 1`, and it is the wrong one: it hard-codes the
// formatter's rounding in a second place, so changing gbp() to 2dp would silently make the two disagree
// again, in the other direction.
// ⚠️ IT ASKS THE FORMATTER'S OWN ROUNDING (roundsToZero, lib/money-format.ts) at gbp()'s precision — the
// same rounding gbp() prints with, so the display and the claim still cannot diverge, and there is no magic
// number to drift. 🔴 It used to compare gbp(n) to gbp(0) as STRINGS; Language Phase 0 (14 October 2026)
// moved it to the number, because a formatted string is display text and must never be a key.
function rendersAsZeroIn(f: MoneyFormat, n: number): boolean {
  return roundsToZero(Number.isFinite(n) ? n : 0, f, 0)
}

/** Do we announce a SAVING? Only when it is positive AND survives formatting. */
function isRealSavingIn(f: MoneyFormat, n: number): boolean {
  return n > 0 && !rendersAsZeroIn(f, n)
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
// ⚠️ LANGUAGE PHASE 1e: it returns the anchor's ID now; the whole sentence ("That’s a year’s public liability
// cover.") is the message `compare.anchor.<id>`. ⚠️ THE BANDS ARE UK FIGURES, applied to the amount in the visitor's
// currency — a US visitor gets the same bands in dollars (listed for Dominic in the Phase 1e report).
type AnchorId = 'liability' | 'weekendPitch' | 'festivalPitches' | 'fryer' | 'counter' | 'vanDeposit' | 'secondVan'
function anchor(v: number): AnchorId | null {
  if (v < 80) return null
  if (v < 250) return 'liability'
  if (v < 600) return 'weekendPitch'
  if (v < 1200) return 'festivalPitches'
  if (v < 2500) return 'fryer'
  if (v < 5000) return 'counter'
  if (v < 12000) return 'vanDeposit'
  return 'secondVan'
}

// ⚠️ THE PROVIDER AND THE MODAL LIVE IN ../page.tsx, NOT HERE, AND THAT IS STILL TRUE. This component
// renders TWO <DemoCta>s of its own again (3 September 2026) and the shared LandingNav above it renders
// a third, so all three depend on the <DemoModalProvider> one level higher. **There must be exactly one.**
// 🔴 DO NOT ADD A PROVIDER HERE TO "MAKE THIS COMPONENT SELF-CONTAINED". A second provider would give
// these two CTAs their own `open` state, invisible to the <DemoModal /> mounted under the first one, and
// the buttons would simply do nothing when clicked. No error, no warning — a dead CTA.
export default function CostComparison({ settings, catalog, locale }: {
  /** The marketing country's settings, read server-side by app/compare/page.tsx. */
  settings: CountrySettings
  /** The plan catalogue (public.plans / plan_prices / plan_features), read server-side by the page. */
  catalog: PlanCatalog
  /** The page's language — the visitor's country's locale, decided by the server page (never re-resolved here). */
  locale: AppLocale
}) {
  const t = useMemo(() => compareT(locale), [locale])
  const { PLANS, CARD_PCT, CARD_PENCE } = useMemo(() => pricingFrom(settings, catalog), [settings, catalog])
  // The marketing country's money format, and the page's helpers bound to it (same names, same calls).
  const fmt = moneyFormatOf(settings)
  // Card processing as one phrase ("1.5% + 20p", "2.9% + 30¢") and the overage rate ("0.99%") — lib/money-format's
  // own labels, so the coin ("p" / "¢") comes from its table and is never typed here.
  const cardFee = feeLabel({ pct: CARD_PCT, fixedMinor: CARD_PENCE }, fmt)
  const gbp = (n: number, dp = 0) => gbpIn(fmt, n, dp)
  const money = (n: number) => moneyIn(fmt, n)
  const isRealSaving = (n: number) => isRealSavingIn(fmt, n)
  const rendersAsZero = (n: number) => rendersAsZeroIn(fmt, n)
  // ── 🔴 THE FIRST QUESTION, AND IT HAS NO DEFAULT ─────────────────────────────────────────────────
  // The page assumed every visitor already pays another provider, so a truck with no system at all was
  // asked what it pays per order and then shown a "saving" against a number it had invented for itself.
  // 🔴 `null` IS NOT "YES". Three states, not two — the same reasoning as `planOverride` below: a
  // boolean cannot tell "has not answered" from "answered no", and everything downstream renders a
  // DIFFERENT PAGE for those two. Defaulting it either way would put a figure on screen computed from
  // an assumption the operator never made.
  const [hasSystem, setHasSystem] = useState<'yes' | 'no' | null>(null)
  const noSystem = hasSystem === 'no'
  // ── 🔴 TRADING DAYS, DEFAULT 4 ───────────────────────────────────────────────────────────────────
  // Every per-day figure on the page divides by this. 4 is the brief's default; it is a NUMBER and not a
  // nullable, because unlike `hasSystem` there is no page-changing decision riding on it — a default
  // here is an estimate the operator adjusts, not an assumption about their business model.
  const [days, setDays] = useState(4)
  const [trucks, setTrucks] = useState(1)
  const [staff, setStaff] = useState<1 | 2 | null>(null)
  // ── 🔴 THE OVERRIDE IS `null`-ABLE ON PURPOSE, AND `null` IS NOT A PLAN. ──────────────────────────
  // No choice made (follow the suggestion), or the key of the plan chosen instead. A boolean
  // could not tell "they have not chosen" from "they chose the plan we suggest", and the eyebrow in the
  // panel says something different in each case — "We suggest" vs "Your choice". Collapsing this to a
  // plan key with a default would make the panel claim they had chosen something they never touched.
  const [planOverride, setPlanOverride] = useState<string | null>(null)
  const [gmv, setGmv] = useState(2500)
  // ⚠️ RAW STRINGS, NOT NUMBERS, FOR EVERY FREE-ENTRY FIELD. A number-typed state cannot represent "the
  // box is empty while I retype it": `+''` is 0, so clearing the field would snap the value to zero and
  // fight the operator's cursor. The string is what the input shows; `numOr` is what the maths reads.
  // 🔴 NO PREFILL (decided 10 October 2026). Both boxes start EMPTY, with neutral placeholders: the page
  // asks what the operator pays rather than suggesting a rate, and names no other provider anywhere. The
  // country_settings.competitor_* columns that used to fill these are retired and unread (20261010_10).
  const [feePctRaw, setFeePctRaw] = useState('')
  const [feePenceRaw, setFeePenceRaw] = useState('')
  // Stage B: prefilled with the trial's length (plans.trial_months) — the offer a new truck actually gets.
  const [freeMonthsRaw, setFreeMonthsRaw] = useState(() => String(offerTrialMonths(catalog) ?? 0))
  // ── 🔴 IS THE RATE THEY TYPED ALL-IN, OR PLATFORM-ONLY? ──────────────────────────────────────────
  // The page used to assume ALL-IN unconditionally and subtract card processing out of it. That is
  // right for a provider that quotes one all-in rate and WRONG for any
  // provider that quotes a platform fee and bills card processing separately: 3% + 20p platform-only
  // was being read as 3% + 20p all-in and shown as 1.5% + 0p, understating their cost and therefore
  // understating the saving. ⚠️ DEFAULTS TO 'inclusive' — the previous behaviour, so an operator who
  // never touches this sees exactly what they saw before.
  const [feeMode, setFeeMode] = useState<'inclusive' | 'ontop'>('inclusive')
  const [trucksRaw, setTrucksRaw] = useState('')

  const feePct = numOr(feePctRaw, 0)
  const feePence = numOr(feePenceRaw, 0)
  // Has the operator typed what they pay? Either box counts. Until then the "Yes" path shows no result.
  const rateTyped = feePctRaw.trim() !== '' || feePenceRaw.trim() !== ''
  const freeMonths = numOr(freeMonthsRaw, 0)

  // ── 🔴 ONE PLACE DECIDES THE ACTIVE PLAN, AND EVERYTHING DOWNSTREAM ALREADY READS IT. ───────────
  // Stage B: the suggestion is the CHEAPEST plan at the online volume entered (lib/plan-offer.ts cheapestAt — the
  // same rule as the landing's "Which plan is cheapest for me?" bar), so it moves with the slider. It used to be the
  // staff answer (two or more people → the plan with separate logins); every plan has separate logins now.
  // The override is a plan key; every figure on the page — the memo, the hero, both year lines, the fee maths —
  // follows `tier` below.
  // ⚠️ `?? `, NOT `||`: the nullish operator says what is meant.
  const suggested = cheapestAt(PLANS.map(p => p.offer), Math.round(gmv * 10 ** minorDigits(settings.currency))) ?? PLANS[0].offer
  const suggestedKey = suggested.plan.key
  const activeKey = planOverride && PLANS.some(p => p.key === planOverride) ? planOverride : suggestedKey
  const tier = PLANS.find(p => p.key === activeKey) ?? PLANS[0]
  const plan = tier.monthly
  const planName = tier.name
  const feePctLabel = pctLabel(tier.feePct, fmt)
  // The memo below reads these two primitives, not `tier` itself (a new object each render).
  const included = tier.included
  const planFeePct = tier.feePct
  const free = Math.min(12, Math.max(0, freeMonths))
  const fleet = Math.max(1, trucks || 1)

  /* ── 🔴 THE CARD NUMBERS ARE COMPUTED, BECAUSE THE TWO PATHS HAVE DIFFERENT LENGTHS ─────────────
   * The "No" path hides "What do you pay per order now?" entirely, so hard-coded numbers would read
   * 1, 2, 3, 4, 6, 7 — a gap that looks like a missing question and invites the operator to go looking
   * for it. These are the only place a step number is written, and `n={STEP.x}` at each call site.
   * ⚠️ THE FIRST FOUR ARE THE SAME ON BOTH PATHS, so they are literals; only the tail moves. */
  const STEP = {
    system: 1, trucks: 2, people: 3, orders: 4,
    fee: 5,     // Yes path only — hidden entirely on No
    days: 5,    // No path only — hidden entirely on Yes (1 October 2026)
    free: 6,    // both paths, and the last question on each
  }

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
    // Stage B: the plan's fee on online orders above what it includes — all of them when it includes nothing,
    // none when it is unlimited (included null) or charges no fee.
    const excess = included === null ? 0 : Math.max(0, gmv - included)
    const overPerTruck = (excess * planFeePct) / 100

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
      // ── 🔴 `theirsMonth` AND `oursMonth` ARE RETURNED AGAIN, AND THEY HAVE READERS ────────────
      // The note that stood here said they were computed but deliberately NOT returned, because the
      // effective-rate line was their only consumer and "returning a value nothing reads is how a
      // deleted feature leaves a trail that looks load-bearing". That was right at the time. Both the
      // per-trading-day framings read them now — monthly is the unit this page frames everything in —
      // so they are returned, with readers.
      orders, theirPct, overPerTruck, excess, fleetGmv,
      theirsMonth, oursMonth,
      /** 🔴 OUR MONTHLY COST FOR ONE VAN — plan + overage, before the fleet multiplier. Every per-day
       *  headline is PER VAN, so this is the figure they divide, never `oursMonth`. */
      oursPerTruck: plan + overPerTruck,
      /** 🔴 STRIPE'S ESTIMATE, PER VAN. Derived from CARD_FEES only, and NEVER added to our total:
       *  card processing is paid to Stripe and is excluded from both sides of every comparison here. */
      cardPerTruck: (gmv * CARD_PCT) / 100 + (orders * CARD_PENCE) / 100,
      theirsYear, oursY1, oursY2,
      saveY1: theirsYear - oursY1,
      pctY1: theirsYear > 0 ? ((theirsYear - oursY1) / theirsYear) * 100 : 0,
      saveY2: theirsYear - oursY2,
      pctY2: theirsYear > 0 ? ((theirsYear - oursY2) / theirsYear) * 100 : 0,
      twoYear: theirsYear * 2 - (oursY1 + oursY2),
    }
  // CARD_PCT / CARD_PENCE are the settings' (memoised above on `settings`), so they are listed; `included` / `planFeePct` the plan's.
  }, [gmv, feePct, feePence, feeMode, plan, free, included, planFeePct, fleet, CARD_PCT, CARD_PENCE])

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
  /* ── 🔴 THE THIRD CASE, NAMED, BECAUSE IT NOW RENDERS A DIFFERENT CARD ──────────────────────────
   * `good` splits "saves" from "does not save"; `rendersAsZero` splits "about the same" out of the
   * second. What is left is the one case item 6 reframes: we genuinely cost more.
   * ⚠️ LANGUAGE PHASE 1e: the verb is part of the hero's message now — `hero.save` ("You save") when `good`,
   * `hero.same` ("About the same") otherwise, and the dearer case renders its own `hero.dearer`. The old third
   * arm, "You'd pay extra", was unreachable on screen (the dearer branch never rendered it) and went with the
   * `heroVerb` string; `dearer` below is still what keeps a dearer result from being labelled "About the same". */
  const dearer = !good && !rendersAsZero(m.saveY1)
  /** What HatchGrab costs ABOVE the current provider, per van per month. Positive only when `dearer`. */
  const extraPerTruck = m.oursPerTruck - m.theirsMonth / fleet
  // 🔴 KEEP DYNAMIC. The hero figure is sized from the RENDERED STRING's length so a fleet total does
  // not wrap to two lines. A fixed Tailwind size cannot do this — it is the one inline style that must
  // survive conversion.
  const heroSize = heroSizeFor(gbp(Math.abs(m.saveY1)))
  // Stage B: the breakdown's fee row, worded by the plan's SHAPE (lib/plan-offer.ts feeShape) — one copy for both paths.
  const feeRow = tier.shape === 'noFee'
    ? <BRow label={t('breakdown.noFee')} amount={gbp(0, 2)} />
    : m.excess > 0
      ? <BRow label={tier.shape === 'feeOnly'
          ? t('breakdown.feeOnly', { pct: feePctLabel, excess: gbp(m.excess) })
          : t('breakdown.over', { pct: feePctLabel, excess: gbp(m.excess), allowance: tier.includedLabel ?? '' })}
          amount={gbp(m.overPerTruck, 2)} />
      : <BRow label={tier.shape === 'feeOnly' ? t('breakdown.feeOnly', { pct: feePctLabel, excess: gbp(0) }) : t('breakdown.inside', { allowance: tier.includedLabel ?? '' })} amount={gbp(0, 2)} />

  return (
    <div className="min-h-screen px-5 py-10 md:py-14" style={{ backgroundColor: '#FAF8F5', color: INK }}>
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('eyebrow')}</p>
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
          {t.rich('title', { br: () => <br />, accent: c => <span style={{ color: ORANGE }}>{c}</span> })}
        </h1>
        {/* ⚠️ "Takes about a minute", NOT "Four quick questions". Being wrong about a count on a page
            about arithmetic undermines the arithmetic, and the count is arguable — and it is now arguable
            in two directions, because the two paths ask a different number of questions.
            🔴 IT NO LONGER PROMISES A SAVING. It read "…you'll see what a year on HatchGrab would save
            you", which is a claim the page cannot keep for a truck with no system to save against — and
            could not keep even on the Yes path when we come out dearer. It now says what the page DOES
            on each path and promises the outcome of neither. */}
        <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600">
          {t('intro')}
        </p>

        <div className="mt-8 space-y-4">
          {/* ── 🔴 THE QUESTION THE PAGE USED TO ANSWER FOR ITSELF ──────────────────────────────────
              Everything below used to assume a current provider. A truck with no online ordering was
              asked "What do you pay per order now?", had no answer, and was shown a saving against the
              prefilled 4.5% — a figure WE put there. That is the page inventing the comparison it then
              wins, which is the one thing it cannot do and still be believed.
              ⚠️ NO DEFAULT, AND THE BUTTONS ARE THE *STAFF* QUESTION'S BUTTONS, CLASS FOR CLASS —
              `px-4 py-4 text-base font-bold`. 🔴 THEY WERE `px-3 py-3 text-sm font-black sm:text-base`
              AND THAT WAS WRONG (corrected 1 October 2026, operator spotted it): `font-black` is 900
              against the 700 every other WORDED option on this page uses, so these two read as a heavier
              class of control than "One" / "Two or more" directly below them. The numeric buttons —
              trucks, and trading days — keep `font-black` because a single digit at 700 looks unset
              beside them; it is the WORDED options that have to agree with each other.
              ⚠️ SO THE RULE IS: worded options match the staff buttons, digits match the truck buttons.
              ⚠️ `flex-wrap` AND `min-w-0 flex-1` FOR THE SAME REASON QUESTION 2 HAS THEM: at 375px two
              labels this long on one row need to be allowed to wrap rather than overflow the card. */}
          <Card n={STEP.system} title={t('system.title')}>
            {/* ── ⚠️ STACKED BELOW 640px, SIDE BY SIDE ABOVE IT — THE CTA PAIR'S OWN PATTERN ──────────
                🔴 A CONSEQUENCE OF MATCHING THE STAFF BUTTONS' TEXT SIZE, MEASURED NOT GUESSED. At
                `text-base` in a shared row these are 143px wide at 375px, and "Yes, with another system"
                wraps to THREE lines — a 108px-tall button against the 60px one below it. Full width each
                on a phone puts both on one line (305px wide at 1440, 343px at 375) and leaves the text
                formatting identical, which is the thing that had to match.
                ⚠️ `flex-col sm:flex-row` IS COPIED FROM THE CTA PAIR in this same file, which stacks for
                exactly this reason — two long labels that will not share a 375px row. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              {([['yes', t('system.yes')], ['no', t('system.no')]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setHasSystem(v)}
                  className="min-w-0 flex-1 rounded-xl border-2 px-4 py-4 text-base font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={hasSystem === v
                    ? { backgroundColor: ORANGE, borderColor: ORANGE, color: '#fff' }
                    : { borderColor: '#E2E8F0', backgroundColor: '#fff', color: SLATE }}>
                  {label}
                </button>
              ))}
            </div>
          </Card>

          <Card n={STEP.trucks} title={t('trucks.title')} disabled={!hasSystem}>
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
                  aria-label={t('trucks.aria')} />
              </div>
            </div>
          </Card>

          {/* ⚠️ THE TITLE FOLLOWS QUESTION 1. "each van" was wrong for a one-truck operator, who has one
              van and is being asked about "each" of it. `fleet` is already the clamped truck count. */}
          <Card n={STEP.people} title={t('people.title', { fleet })}
            disabled={!hasSystem}>
            {/* 🔴 ANSWERING QUESTION 2 CLEARS THE OVERRIDE (the `setPlanOverride(null)` below). Without
                it, an operator who switched plan and then changed their answer would be shown "Your
                choice" from before — a stale decision presented as a current one, made from an answer
                they had just replaced. ⚠️ It resets on EVERY press,
                including pressing the answer already selected: that is still the operator asserting it.
                ⚠️ THIS COMMENT LIVES HERE, NOT NEXT TO THE onClick, BECAUSE A JSX COMMENT PLACED
                DIRECTLY AFTER `.map(o => (` IS AN EXPRESSION, NOT A CHILD, AND FAILS THE BUILD. */}
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {([{ v: 1 as const, label: t('people.one') }, { v: 2 as const, label: t('people.twoOrMore') }]).map(o => (
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
                🔴 EVERY NUMBER IS INTERPOLATED, from public.plan_prices (Stage B): `tier.monthly`, `tier.includedLabel`,
                `tier.feePct`. ⚠️ NO PRICE, ALLOWANCE OR FEE IS WRITTEN IN THIS FILE.
                ⚠️ "on each" IS GATED ON `fleet`, NOT ON `staff` — the allowance is per truck, so it only
                means anything when there is more than one truck to spread it across. */}
            {staff && (
              <div className="mt-4 rounded-xl px-5 py-4" style={{ backgroundColor: '#F8FAFC' }}>
                {/* ⚠️ THE EYEBROW TELLS THE TRUTH ABOUT WHOSE DECISION THIS IS. Once someone overrides,
                    "We suggest" would be a lie — we suggested another plan and they declined it. */}
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {planOverride ? t('plan.yourChoice') : t('plan.weSuggest')}
                </p>
                <p className="mt-1 text-2xl font-black" style={{ color: INK }}>{planName}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {/* Stage B: worded by the plan's SHAPE; every plan has separate logins, so "Two or more" says so on any. */}
                  {tier.shape === 'included'
                    ? t('plan.summary', { price: gbp(plan), allowance: tier.includedLabel ?? '', fleet })
                    : tier.shape === 'feeOnly'
                      ? t('plan.summaryFeeOnly', { hasMonthly: plan > 0 ? 'yes' : 'no', price: gbp(plan), pct: feePctLabel })
                      : t('plan.summaryNoFee', { price: gbp(plan) })}
                  {staff === 2 && <>{' '}{t('plan.ownLogin')}</>}
                </p>
                {/* ⚠️ TEXT BUTTONS, NOT A SECOND SET OF LARGE BUTTONS. Big choices here would
                    compete with the answer buttons directly above and turn one question into two.
                    Stage B: one per OTHER plan (the data's), in sort_order.
                    ⚠️ SWITCHING BACK TO THE SUGGESTED PLAN CLEARS THE OVERRIDE RATHER THAN SETTING IT,
                    so the eyebrow returns to "We suggest" instead of claiming a choice that now happens
                    to agree with us. The underline is correct here — this one IS an affordance. */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {PLANS.filter(p => p.key !== activeKey).map(p => (
                    <button key={p.key} type="button"
                      onClick={() => setPlanOverride(p.key === suggestedKey ? null : p.key)}
                      className="text-sm font-semibold underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{ color: ORANGE }}>
                      {t('plan.switchTo', { plan: p.name })}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* ── 🔴 THE SAME SLIDER, TWO QUESTIONS ───────────────────────────────────────────────────
              On the Yes path this asks what they DO take online; on the No path what they THINK they
              would. 🔴 THE INPUT, RANGE, STEP AND "~N orders" ARE DELIBERATELY IDENTICAL — the quantity
              is the same quantity and every figure downstream reads it the same way. Only the words
              change, because only the certainty does. */}
          <Card n={STEP.orders}
            title={noSystem ? t('orders.titleNo') : t('orders.titleYes')}
            disabled={!hasSystem || !staff}>
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
              <span className="text-sm tabular-nums text-slate-400">{t('orders.count', { count: Math.round(m.orders) })}</span>
              <span className="text-3xl font-black tabular-nums">{gbp(gmv)}</span>
            </div>
            {/* ⚠️ BOTH WORDINGS DO THE SAME JOB — they keep WINDOW takings out of the figure, which is
                the honesty fix the long note above describes. The No-path version has to do it while
                asking for a guess, so it names the two kinds of order a truck would expect online
                rather than only saying what to exclude. */}
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {noSystem ? t('orders.captionNo') : t('orders.captionYes')}
            </p>
            <input type="range" min={0} max={12000} step={500} value={gmv}
              onChange={e => setGmv(numOr(e.target.value, 0))} className="hg-range mt-3"
              aria-label={t('orders.sliderAria')} />
            {staff && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {/* Stage B: worded by the plan's SHAPE — a fee on everything, an included amount, or unlimited. */}
                {tier.shape === 'noFee' ? (
                  t('orders.noFee')
                ) : tier.shape === 'feeOnly' ? (
                  t.rich('orders.feeOnly', { pct: feePctLabel, over: gbp(m.overPerTruck, 2), b: c => <strong className="tabular-nums">{c}</strong> })
                ) : m.excess > 0 ? (
                  t.rich('orders.overAllowance', {
                    allowance: tier.includedLabel ?? '', excess: gbp(m.excess), pct: feePctLabel, over: gbp(m.overPerTruck, 2),
                    b: c => <strong className="tabular-nums">{c}</strong>,
                  })
                ) : (
                  t('orders.insideAllowance', { allowance: tier.includedLabel ?? '' })
                )}
                {fleet > 1 && (
                  <>{' '}{t.rich('orders.acrossFleet', { fleet, amount: gbp(m.fleetGmv), b: c => <strong className="tabular-nums">{c}</strong> })}</>
                )}
              </p>
            )}
          </Card>

          {/* ── 🔴 HIDDEN ENTIRELY ON THE "No" PATH, NOT DISABLED ───────────────────────────────────
              A truck with no system has nothing to type here, and a greyed-out card still reads as a
              question they have failed to answer. 🔴 THE TOGGLE AND BOTH SENTENCES GO WITH IT — they
              describe a rate that does not exist on this path, and leaving either behind would put a
              competitor's fee model on a page that has just been told there is no competitor.
              ⚠️ THE STATE IS NOT RESET. `feePctRaw`/`feePence`/`feeMode` keep their values while the
              card is hidden, so switching back to "Yes" restores what was typed rather than silently
              clearing it. Nothing on the No path READS them — see the results branch. */}
          {!noSystem && (
          <Card n={STEP.fee} title={t('fee.title')} disabled={!hasSystem || !staff}>
            {/* ⚠️ `min-w-0` on both halves is what stops these overflowing at 375px: without it a flex
                child refuses to shrink below its content width and the row pushes past the card. */}
            <div className="flex gap-2 sm:gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold text-slate-600">{t('fee.pctLabel')}</span>
                <div className="flex items-center rounded-lg border px-3" style={{ borderColor: '#CBD5E1' }}>
                  <input type="number" step={0.1} min={0} max={30} inputMode="decimal" value={feePctRaw}
                    onChange={e => setFeePctRaw(e.target.value)} placeholder={t('fee.pctPlaceholder')}
                    className="w-full min-w-0 py-2 text-xl font-black tabular-nums placeholder:text-base placeholder:font-semibold placeholder:text-slate-400 focus:outline-none focus-visible:ring-2"
                    aria-label={t('fee.pctAria')} />
                  <span className="pl-1 text-lg font-bold text-slate-400">%</span>
                </div>
              </label>
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold text-slate-600">{t('fee.fixedLabel')}</span>
                <div className="flex items-center rounded-lg border px-3" style={{ borderColor: '#CBD5E1' }}>
                  <input type="number" step={1} min={0} inputMode="numeric" value={feePenceRaw}
                    onChange={e => setFeePenceRaw(e.target.value)} placeholder={t('fee.fixedPlaceholder')}
                    className="w-full min-w-0 py-2 text-xl font-black tabular-nums placeholder:text-base placeholder:font-semibold placeholder:text-slate-400 focus:outline-none focus-visible:ring-2"
                    aria-label={t('fee.fixedAria')} />
                  {/* The box takes MINOR units, so its unit is the currency's coin — "p", "¢" — from lib/money-format's
                      table (Language Phase 1e; it was a typed "p"). */}
                  <span className="pl-1 text-lg font-bold text-slate-400">{minorUnitSuffix(fmt.currency) ?? ''}</span>
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
              <p id="fee-mode-label" className="mb-1 text-slate-500">{t('fee.modeLabel')}</p>
              <div role="group" aria-labelledby="fee-mode-label"
                className="flex rounded-lg border p-1"
                style={{ borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                {([{ v: 'inclusive' as const, label: t('fee.modeInclusive') },
                   { v: 'ontop' as const, label: t('fee.modeOnTop') }]).map(o => (
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
                {t.rich('fee.inclusiveNote', {
                  fee: cardFee, pct: pctFixed(fmt, m.theirPct, 1, 1),
                  b: c => <strong className="tabular-nums" style={{ color: ORANGE }}>{c}</strong>,
                })}
              </p>
            )}
            {/* ⚠️ The all-in per-order figure is a coin amount through smallFeeLabel ("40p", "50¢"); from one whole
                unit up it is written as money ("£1.20" where the old typed suffix printed "120p"). */}
            {feeMode === 'ontop' && (feePct > 0 || feePence > 0) && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {t.rich('fee.onTopNote', {
                  fee: cardFee, pct: pctFixed(fmt, feePct + CARD_PCT, 1, 1), fixed: smallFeeLabel(feePence + CARD_PENCE, fmt),
                  b: c => <strong className="tabular-nums" style={{ color: ORANGE }}>{c}</strong>,
                })}
              </p>
            )}
          </Card>
          )}

          {/* ── 🔴 TRADING DAYS — THE DIVISOR EVERY PER-DAY FIGURE ON THIS PAGE USES ──────────────────
              Its POSITION differs by path and that is deliberate: on the Yes path it follows the fee
              question, on the No path it follows the orders question, so on both it is the last thing
              asked before the offer. Months free stays last on both.
              ⚠️ SEVEN BUTTONS IN ONE ROW, NOT A SLIDER OR A SELECT. Seven is few enough to show, and a
              single tap beats dragging for a value an operator knows exactly.
              ⚠️ `flex-wrap` IS STILL ON IT. Seven buttons at 375px are ~38px each, which fits — but the
              row must be allowed to wrap rather than overflow if the gap or the font ever changes.
              ⚠️ NO `min-w-0 flex-1` BOX BESIDE THEM: unlike question 2 there is no "8+" case to type.
              A week has seven days. */}
          {/* ── 🔴 HIDDEN ENTIRELY ON THE "Yes" PATH (1 October 2026, operator decision) ─────────────
              It was asked on both paths and the Yes path no longer has anything to divide by days: that
              result is framed PER WEEK now (item 2), so the answer would have been collected and never
              used — a question that costs a tap and changes nothing on screen.
              ⚠️ HIDDEN, NOT DISABLED, for the same reason the fee question is on the other path: a
              greyed-out card reads as a question they have failed to answer.
              ⚠️ THE STATE IS NOT RESET, matching the fee question exactly — `days` keeps its value while
              the card is hidden, so switching back to "No" restores what was chosen rather than silently
              returning it to 4. Nothing on the Yes path reads it. */}
          {noSystem && (
          <Card n={STEP.days} title={t('days.title')} disabled={!hasSystem || !staff}>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <button key={n} onClick={() => setDays(n)}
                  className="min-w-0 flex-1 rounded-xl border-2 py-3 text-base font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={days === n
                    ? { backgroundColor: ORANGE, borderColor: ORANGE, color: '#fff' }
                    : { borderColor: '#E2E8F0', backgroundColor: '#fff', color: SLATE }}>
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {t('days.help')}
            </p>
          </Card>
          )}

          {/* ── ⚠️ ITS OWN QUESTION, NOT A FOOTER ON QUESTION 4 (23 August 2026). ────────────────────
              It sat inside "What do you pay per order now?", which asks about the operator's CURRENT
              provider. Months free is a HatchGrab offer — the opposite side of the comparison — so
              nesting it there put our number inside their question and quietly implied the free months
              were something their provider gave them. Separate card, separate subject. */}
          {/* ⚠️ AN OFFER FRAMING THAT STILL ASKS THE QUESTION. ⚠️ It is the only title with two clauses
              and the longest of the five — but card 3 ("Online orders per month, per truck") already
              breaks the plain-question pattern, so the set was never uniform, and rewording this to match
              cards 1/2/4 would have cost the offer framing that is the point of the change. */}
          <Card n={STEP.free} title={t('free.title')} disabled={!hasSystem || !staff}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-lg border px-2" style={{ borderColor: '#CBD5E1' }}>
                <input type="number" step={1} min={0} max={12} inputMode="numeric" value={freeMonthsRaw}
                  onChange={e => setFreeMonthsRaw(e.target.value)}
                  className="w-14 min-w-0 py-2 text-center text-lg font-black tabular-nums focus:outline-none focus-visible:ring-2"
                  aria-label={t('free.aria')} />
              </div>
              <span className="text-sm text-slate-500">
                {free === 0 ? t('free.none') : t('free.some')}
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
        {/* ⚠️ GATED ON `hasSystem` AS WELL AS `staff` NOW, for the reason the note above gives: the
            results block below is, so without it this would scroll to an element that does not exist. */}
        {hasSystem && staff && (
          <p className="mt-6 text-center">
            <button type="button"
              onClick={() => {
                const el = document.getElementById('cost-results')
                if (!el) return
                const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
              }}
              className="text-sm font-semibold text-slate-500 underline underline-offset-4 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
              {/* 🔴 IT MUST NOT SAY "saving" ON THE No PATH. There is nothing to save against, and a
                  link promising one would be the page making the claim its own result refuses to. */}
              {noSystem ? t('jump.cost') : t('jump.saving')}
            </button>
          </p>
        )}

        {hasSystem && staff && (
          <div id="cost-results" className="mt-6 scroll-mt-4 space-y-4">
            {noSystem ? (
            /* ── 🔴 THE "No, not yet" RESULT — A PRICE, NOT A COMPARISON ─────────────────────────────
               There is nothing to compare against, so every element of the saving card would be a claim
               the page cannot support: no "You save", no percentage, no anchor, no year-one/year-two
               schedule. What this operator is deciding is whether the thing is worth its price, and the
               per-trading-day figure is that price in the unit they already think in.
               🔴 AND NEVER A PER-ORDER FIGURE ON THIS PATH. We charge a plan plus a percentage over an
               allowance; dividing that by an order count would invent a per-order rate we do not charge,
               on the one path where the operator has no per-order number of their own to check it
               against. ⚠️ `m.orders` is still used for the CARD-PROCESSING estimate below, which is
               Stripe's genuine per-order fee and is labelled as theirs. */
            <>
              <div className="overflow-hidden rounded-2xl border-2 bg-white shadow-lg" style={{ borderColor: ORANGE }}>
                <div className="px-6 py-9 text-center">
                  {/* 🔴 PER VAN, ALWAYS. `m.oursPerTruck` is one van's plan + overage; `m.oursMonth` is
                      the fleet. A fleet figure here would read as the price of the product.
                      ⚠️ ONE SENTENCE, THREE BLOCKS (Language Phase 1e): the lead, the figure and the unit are one
                      message whose tags render the three paragraphs, so a language can reorder them. */}
                  {t.rich('noSystem.hero', {
                    amount: money(perTradingDay(m.oursPerTruck, days)),
                    lead: c => <p className="text-lg font-semibold" style={{ color: INK }}>{c}</p>,
                    figure: c => (
                      <p className="mt-1 font-black tabular-nums"
                        style={{ color: ORANGE, fontSize: heroSizeFor(money(perTradingDay(m.oursPerTruck, days))), lineHeight: 0.92, letterSpacing: '-0.03em' }}>
                        {c}
                      </p>
                    ),
                    unit: c => <p className="mt-2 text-xl font-bold text-slate-700">{c}</p>,
                  })}
                  <p className="mt-3 text-sm text-slate-500">
                    {t('noSystem.basedOn', { days, monthly: money(m.oursPerTruck), fleet })}
                  </p>
                  <div className="mx-auto mt-5 max-w-xs border-t pt-5" style={{ borderColor: '#F1F5F9' }}>
                    {/* 🔴 THE COFFEE LINE IS CONDITIONAL AND HAS NO SUBSTITUTE. Above the threshold
                        nothing is rendered in its place — a weaker comparison ("less than a pint") would
                        be a second claim to defend, and an empty slot says nothing untrue. */}
                    {perTradingDay(m.oursPerTruck, days) < COFFEE_MAX_PER_DAY && (
                      <p className="text-base font-semibold" style={{ color: INK }}>{t('coffee')}</p>
                    )}
                    {freeMonthsLine(t, free) && (
                      <p className="mt-2 text-sm text-slate-500">{freeMonthsLine(t, free)}</p>
                    )}
                  </div>
                </div>
                {/* ⚠️ THE CTA PAIR AND THE CREAM STRIP ARE THE SAME TWO CONTROLS AS THE SAVING CARD'S.
                    🔴 NO AMOUNT IN THE PRIMARY LABEL on this path — the saving card's version carries the
                    saving, and there is no saving here to carry. */}
                <div className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-3">
                  <DemoCta className={`${CTA_PRIMARY} flex-1 px-6 py-4 text-lg`}>{t('cta.upload')}</DemoCta>
                  <a href={contactHref('costComparison')} className={`${CTA_SECONDARY} flex-1 px-6 py-4 text-lg`}>
                    {t('cta.ask')}
                  </a>
                </div>
                <p className="px-6 py-3 text-center text-xs text-slate-500" style={{ backgroundColor: CREAM }}>
                  {t('cta.noCard')}
                </p>
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm md:p-6" style={{ borderColor: '#E2E8F0' }}>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">{t('breakdown.title')}</p>
                <div className="mt-4 space-y-2">
                  <BRow label={t('breakdown.plan', { plan: planName })} amount={gbp(plan, 2)} />
                  {feeRow}
                  <div className="h-px" style={{ backgroundColor: '#E2E8F0' }} />
                  <BRow label={t('breakdown.total')} amount={money(m.oursPerTruck)} bold orange />
                  {free >= 1 && (
                    <BRow small label={t('breakdown.freeMonths', { n: free })} amount={t('breakdown.freeAmount', { amount: gbp(0) })} />
                  )}
                  {fleet > 1 && (
                    <BRow small label={t('breakdown.acrossFleet', { fleet })} amount={t('breakdown.perMonth', { amount: money(m.oursMonth) })} />
                  )}
                </div>
                {/* ── 🔴 STRIPE'S FEE, NAMED AS STRIPE'S, AND NOT IN OUR TOTAL ──────────────────────
                    It sits in its own inset BELOW the rule precisely so it cannot be read as part of the
                    HatchGrab line above it. 🔴 DERIVED FROM `cardFees()` ONLY — these are Stripe's rates,
                    we do not set them, and the "~" is the hedge lib/plan-features.ts requires on them.
                    ⚠️ THE SECOND SENTENCE IS THE POINT OF SHOWING IT AT ALL: an operator comparing this
                    against "nothing" needs to know the fee is not new money, it is the money they already
                    pay at the window. */}
                <div className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: '#F8FAFC' }}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-slate-500">
                      {t('breakdown.card', { fee: cardFee })}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      ~{money(fleet > 1 ? m.cardPerTruck * fleet : m.cardPerTruck)}
                    </span>
                  </div>
                </div>
              </div>
            </>
            ) : !rateTyped ? (
            /* ── 🔴 THE "Yes" PATH SHOWS NO RESULT UNTIL A RATE IS TYPED (Phase 2A, decided) ───────────────
               Before, an empty rate read as 0% + 0p, so the page computed a "saving" against a provider that
               charges nothing — a figure from an assumption the operator never made. Until they type what
               they pay, there is nothing to compare against, so the result is replaced by the one sentence
               that says what to do. */
            <p className="rounded-2xl border bg-white p-6 text-center text-base font-semibold text-slate-600 shadow-sm" style={{ borderColor: '#E2E8F0' }}>
              {t('enterRate')}
            </p>
            ) : (
            <>
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
                      {/* ⚠️ MONTHLY ON THE DEARER PATH, YEARLY OTHERWISE, AND THE QUALIFIER FOLLOWS THE
                          FIGURE. That card's whole frame is now a month and a trading day; a yearly pair
                          inside it would be the one place on the card still arguing in years, and a
                          reader comparing the box to the sub-line above would be comparing two units.
                          🔴 STILL READ FROM THE MEMO, NEVER RECOMPUTED — `theirsMonth`/`oursMonth` are
                          the fields the monthly framing uses throughout, so the box cannot disagree with
                          the sub-line. ⚠️ FLEET TOTALS ON BOTH, as before: the "across N trucks" note
                          below is what scopes them, and the headline is the only PER-VAN figure here. */}
                      {/* Language Phase 1e: label, amount and qualifier are ONE message (`panel.now…`); its tags
                          render the same three spans, with nothing between them. */}
                      {t.rich(dearer ? 'panel.nowMonth' : 'panel.nowYear', {
                        amount: dearer ? gbp(m.theirsMonth, 2) : gbp(m.theirsYear),
                        label: c => <span className="text-slate-500">{c}</span>,
                        fig: c => <span className="font-semibold tabular-nums text-slate-800">{c}</span>,
                        q: c => <span className="font-normal text-slate-500">{c}</span>,
                      })}
                    </div>
                    {/* ⚠️ `mt-1`, NOT a fractional step — the two rows are ONE PAIR, not two paragraphs.
                        🔴 SEMIBOLD AND DARKER, AND DELIBERATELY NOT ORANGE. Orange belongs to the figure
                        below; a second orange number here would give the hero two subjects and kill the
                        contrast the card runs on. ⚠️ THE WEIGHT IS UNCONDITIONAL — it marks OUR row, not the
                        WINNING row, so when we are dearer the emphasis still sits on our number. A weight
                        that flipped with the result would present the same comparison two different ways
                        depending on who won, on a page built to be shown to people shopping around. */}
                    <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap text-sm sm:text-base">
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
                      {/* ⚠️ "a month", NOT "in year one", ON THE DEARER PATH. `oursY1` has the free
                          months inside it, which is exactly why it needs that qualifier; a MONTHLY
                          figure does not, and the free months are stated on their own line below. */}
                      {t.rich(dearer ? 'panel.oursMonth' : 'panel.oursYear', {
                        amount: dearer ? gbp(m.oursMonth, 2) : gbp(m.oursY1),
                        label: c => <span className="text-slate-500">{c}</span>,
                        fig: c => <span className="font-bold tabular-nums text-slate-800">{c}</span>,
                        q: c => <span className="font-normal text-slate-500">{c}</span>,
                      })}
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
                    {/* ⚠️ "vans", NOT "trucks" (1 October 2026, operator decision). It is the only place
                        in the results that still said "trucks", against "Across N vans" in both breakdown
                        cards — one object named two ways on one screen. 🔴 IT IS INSIDE THE SAVING CARD,
                        so it is a sanctioned change to the card case (d) pins; case (d) is a SINGLE van,
                        so this line does not render there and that diff stays empty.
                        ⚠️ THIS COMMENT SITS ABOVE THE GUARD, NOT INSIDE IT. Placed directly after
                        `{fleet > 1 && (` it is an EXPRESSION, not a child, and fails the build — the same
                        trap the staff question's own comment records a few hundred lines above. I made it
                        here first and tsc caught it. */}
                    {fleet > 1 && (
                      <p className="mt-2 text-right text-xs text-slate-400">{t('panel.acrossFleet', { fleet })}</p>
                    )}
                  </div>
                </div>

                {/* ── 🔴 THE VERB IS ATTACHED TO THE FIGURE, AND THAT IS THE POINT OF ITS SIZE. ──────────
                    This was a small grey uppercase eyebrow, which gets skimmed — so the figure arrived
                    unlabelled and could read as a PRICE rather than a saving. It is now dark and set at
                    the same size as the percentage line below, with `mt-1` under it, so the verb and the
                    number read as one unit rather than as a caption and a number.
                    ⚠️ DO NOT SHRINK IT BACK. Its legibility is the fix, not its styling. */}
                {/* ── 🔴 WHEN WE COST MORE, THE CARD STOPS ARGUING ABOUT THE YEAR ─────────────────────
                    It read "You'd pay extra / £168 / 19% more in your first year". Three things were
                    wrong with that as a way to lose: the biggest number on screen was the one against us,
                    a percentage of a yearly total is the least relatable form the difference has, and
                    "extra" frames the product as a surcharge on what they already do rather than as a
                    different thing with more in it.
                    🔴 THE DIFFERENCE IS THE SAME ARITHMETIC, IN A UNIT THAT CAN BE JUDGED. 80p a trading
                    day is a number an operator can decide about; £168 a year is one they can only flinch
                    at. ⚠️ NOTHING IS HIDDEN — the monthly difference is on the sub-line and both monthly
                    totals are in the grey box above, so the yearly figure is a multiplication away.
                    ⚠️ SLATE, NOT ORANGE. Orange is for a figure in the operator's favour; it would be
                    the page cheering a cost. The saving case is untouched and keeps its orange. */}
                {/* 🔴 "a week", NOT "a trading day" (1 October 2026). The trading-days question is
                    gone from this path, so there is no divisor to make a per-DAY claim with — and
                    inventing one from a default of 4 would put a figure on screen computed from an
                    answer the operator was never asked for.
                    ⚠️ LANGUAGE PHASE 1e: each hero is ONE message (`hero.dearer`, `hero.save`, `hero.same`) whose
                    tags render the same paragraphs — the lead or verb, the figure, and the unit or percentage line. */}
                {dearer ? (
                  <>
                    {t.rich('hero.dearer', {
                      amount: money(perWeek(extraPerTruck)),
                      lead: c => <p className="mt-5 text-lg font-semibold" style={{ color: INK }}>{c}</p>,
                      figure: c => (
                        <p className="mt-1 font-black tabular-nums"
                          style={{ color: SLATE, fontSize: heroSizeFor(money(perWeek(extraPerTruck))), lineHeight: 0.92, letterSpacing: '-0.03em' }}>
                          {c}
                        </p>
                      ),
                      unit: c => <p className="mt-2 text-xl font-bold text-slate-700">{c}</p>,
                    })}
                    {/* ⚠️ NO "Based on N days" CLAUSE HERE — there is no N on this path. The sub-line is
                        the monthly difference alone, and the per-van wording moves INTO it rather than
                        being appended, so it reads as one phrase at any fleet size. */}
                    <p className="mt-3 text-sm text-slate-500">
                      {t('hero.dearerSub', { amount: money(extraPerTruck), fleet })}
                    </p>
                    <div className="mx-auto mt-5 max-w-xs border-t pt-5" style={{ borderColor: '#F1F5F9' }}>
                      {/* 🔴 THE SAME `COFFEE_MAX_PER_DAY` THRESHOLD, APPLIED TO THE FIGURE ACTUALLY SHOWN
                          — which on THIS path is WEEKLY, not daily. So the line appears only when the
                          whole weekly difference is under £3.00, which is a stricter test than the No
                          path's and leaves the claim true either way: £3 buys a coffee whatever period
                          the figure covers. ⚠️ THE CONSTANT IS DELIBERATELY NOT RENAMED — it is the
                          price of a coffee, not a statement about which period it is compared against. */}
                      {perWeek(extraPerTruck) < COFFEE_MAX_PER_DAY && (
                        <p className="text-base font-semibold" style={{ color: INK }}>{t('coffee')}</p>
                      )}
                      {freeMonthsLine(t, free) && (
                        <p className="mt-2 text-sm text-slate-500">{freeMonthsLine(t, free)}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* ⚠️ "in your first year" IS LOAD-BEARING. Without a timeframe the figure can be read
                        as monthly or as a lifetime total, and both misreadings flatter us. */}
                    {t.rich(good ? 'hero.save' : 'hero.same', {
                      amount: gbp(Math.abs(m.saveY1)), pct: pctFixed(fmt, Math.abs(m.pctY1), 0, 0),
                      verb: c => <p className="mt-5 text-lg font-semibold" style={{ color: INK }}>{c}</p>,
                      figure: c => (
                        <p className="mt-1 font-black tabular-nums"
                          style={{ color: good ? ORANGE : SLATE, fontSize: heroSize, lineHeight: 0.92, letterSpacing: '-0.03em' }}>
                          {c}
                        </p>
                      ),
                      sub: c => <p className="mt-4 text-lg font-semibold text-slate-500">{c}</p>,
                      num: c => <span className="tabular-nums">{c}</span>,
                    })}
                  </>
                )}
                {anch && (
                  <p className="mx-auto mt-5 max-w-xs border-t pt-5 text-base text-slate-500" style={{ borderColor: '#F1F5F9' }}>
                    {t(`anchor.${anch}`)}
                  </p>
                )}
              </div>

              {/* ── 🔴 IT WENT BACK TO THE DEMO MODAL (3 September 2026), AND THE OLD NOTE WAS READ FIRST.
                  What stood here from 23 August argued the opposite, and it is kept below because the
                  argument is still sound and someone will make it again:

                    "Someone on the LANDING is asking 'what is this?', and uploading a menu answers that.
                     Someone who has just typed in their own trading figures has already decided it is
                     interesting and is asking 'is it cheaper for me?' — a file upload is a heavier ask
                     than the moment warrants, and it fails outright for anyone on a phone with no menu
                     file. SO THIS IS A PLAIN LINK, NOT A DemoCta."

                  🔴 WHAT OVERRULED IT IS NOT A BETTER ARGUMENT ABOUT VERBS — IT IS THAT THE LINK'S
                  DESTINATION DOES NOT WORK. /signup → /setup has been unable to complete since 4 August
                  2026 (app/api/setup/route.ts:70-72 requires a `contact_phone` that app/setup/page.tsx
                  never asks for), and it fails AFTER creating the account, so the visitor's email address
                  is spent and every later login returns them to the same dead screen. A heavier ask that
                  works beats a lighter one that cannot. See ../page.tsx and the two reports named there.
                  ⚠️ THE "no menu file on a phone" OBJECTION IS REAL AND IS ANSWERED, NOT IGNORED. The
                  modal's idle screen offers three routes, not one: a file, PASTED TEXT, or "See sample
                  menu" (DemoUpload.tsx:431-442), which provisions from a template with no upload at all.
                  🔴 THE FALLBACK BRANCH IS NOT DECORATIVE. When the operator's current provider is
                  cheaper, `good` is false and the label must stop claiming a saving. Both branches now
                  lead with the same verb as the landing's own CTAs, so the label describes the next
                  screen — a menu upload — rather than promising a "free start" that begins elsewhere.
                  ⚠️ STACKED BELOW 640px, SIDE BY SIDE ABOVE IT. Two buttons on one row at 375px would
                  leave each about 150px; `flex-col sm:flex-row` gives them the full width each on a
                  phone.
                  ⚠️ CTA_PRIMARY CARRIES ITS COLOUR IN A CLASS (`bg-[#EF8B2C]`), WHICH IS WHY THIS
                  CONVERSION IS SAFE — see the note on CTA_BASE above. DemoCta forwards className ONLY
                  and takes no `style`; the last attempt at this coloured the button with `style` and
                  rendered it white-on-white. Nothing here uses `style`. */}
              <div className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-3">
                <DemoCta className={`${CTA_PRIMARY} flex-1 px-6 py-4 text-lg`}>
                  {good ? t('cta.uploadSave', { amount: gbp(m.saveY1) }) : t('cta.upload')}
                </DemoCta>
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
                <a href={contactHref('costComparison')} className={`${CTA_SECONDARY} flex-1 px-6 py-4 text-lg`}>
                  {t('cta.ask')}
                </a>
              </div>
              <p className="px-6 py-3 text-center text-xs text-slate-500" style={{ backgroundColor: CREAM }}>
                {t('cta.noCard')}
              </p>
            </div>

            {/* ── 🔴 THE YEAR SCHEDULE IS REPLACED WHEN WE COST MORE, NOT KEPT ALONGSIDE ────────────
                `YearLine` renders "Extra £168 (19% more)" twice — the exact two figures item 6 removes
                from the card above, in a larger size, immediately below it. Reframing the hero and
                leaving this would have moved the claim rather than changed it.
                ⚠️ WHAT REPLACES IT IS THE SAME BREAKDOWN THE "No" PATH SHOWS, plus one line naming the
                provider's own monthly fee — so the comparison is still on the page, as two totals a
                reader can subtract, rather than as a verdict we have drawn for them. */}
            {dearer ? (
            <div className="rounded-2xl border bg-white p-5 shadow-sm md:p-6" style={{ borderColor: '#E2E8F0' }}>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">{t('breakdown.titleDearer')}</p>
              <div className="mt-4 space-y-2">
                <BRow label={t('breakdown.plan', { plan: planName })} amount={gbp(plan, 2)} />
                {feeRow}
                <div className="h-px" style={{ backgroundColor: '#E2E8F0' }} />
                <BRow label={t('breakdown.total')} amount={money(m.oursPerTruck)} bold orange />
                {/* 🔴 THEIR OWN FEE, AT THE RATE THE COMPARISON ACTUALLY USED. `m.theirPct` is the
                    PLATFORM rate with card processing taken out of it (or left out, in 'ontop' mode) —
                    the same quantity both sides are compared on. Printing the typed 4.5% here would
                    name a rate the arithmetic above does not use. */}
                <BRow small label={t('breakdown.provider', { pct: pctFixed(fmt, m.theirPct, 0, 2) })}
                  amount={t('breakdown.perMonth', { amount: money(m.theirsMonth / fleet) })} />
                {fleet > 1 && (
                  <BRow small label={t('breakdown.acrossFleet', { fleet })} amount={t('breakdown.perMonth', { amount: money(m.oursMonth) })} />
                )}
              </div>
            </div>
            ) : (
            <div className="rounded-2xl border bg-white p-5 shadow-sm md:p-6" style={{ borderColor: '#E2E8F0' }}>
              <YearLine fmt={fmt} t={t} label={t('year.one')} theirs={m.theirsYear} ours={m.oursY1} save={m.saveY1} pct={m.pctY1} />
              <div className="my-5 h-px" style={{ backgroundColor: '#F1F5F9' }} />
              <YearLine fmt={fmt} t={t} label={t('year.two')} theirs={m.theirsYear} ours={m.oursY2} save={m.saveY2} pct={m.pctY2} />

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
                  {t.rich('twoYear', { amount: gbp(m.twoYear), b: c => <strong className="tabular-nums" style={{ color: ORANGE }}>{c}</strong> })}
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
                  Prices come from planMonthlyMinor() (country_settings) and an operator must not be able to edit them — an
                  editable price on a page that computes a saving is a page that can be made to say
                  anything. The `proPrice`/`maxPrice`/`open` state went with them. */}
            </div>
            )}
            </>
            )}
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
        {/* 🔴 THE "No" PATH NEEDS ITS OWN SMALL PRINT, because every clause of the other one is about a
            comparison it does not make: "excluded from both sides" names two sides, "question 4" is a
            question it does not ask, and "your current provider's rates" is a provider it does not have.
            ⚠️ WHAT IT KEEPS is the only two things that are still true on this path — the average-order
            assumption the order COUNT is derived from, and that card processing is payable to Stripe
            whichever way they take the money. */}
        {noSystem ? (
          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            {t('smallPrint.no', { aov: gbp(AOV) })}
          </p>
        ) : (
        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          {t('smallPrint.yes', { aov: gbp(AOV), fee: cardFee })}
          {/* ⚠️ LANGUAGE PHASE 1e (named GB fix): this said "question 4", which went stale when "Do you take online
              orders now?" became question 1 — the fee question is STEP.fee (5). The number now comes from STEP. */}
          {feeMode === 'ontop' && <>{' '}{t('smallPrint.onTop', { n: STEP.fee })}</>}
          {' '}{t('smallPrint.check')}
        </p>
        )}

        {/* ⚠️ THE SECOND CTA, for anyone who scrolled past the first. Same ACTION as the primary — it
            opens the same one <DemoModal /> mounted in ../page.tsx — and deliberately the plainer label:
            the primary above carries the saving figure, and repeating it here would read as a second,
            different offer.
            🔴 IT IS A <DemoCta> AS OF 3 SEPTEMBER 2026, NOT AN <a href="/signup">. The reasoning is in
            the long note on the primary CTA above; read that before changing either, because the two
            must always do the same thing.
            ⚠️ ITS `mt-6` WAS CHOSEN WHILE IT WAS INVISIBLE and has still never been judged in position —
            it is 24px below the small print, which is the only gap on the page not set against something
            visible. Reported rather than adjusted; see the report.
            ⚠️ `block w-full` ON A <button>: fine, and it must stay explicit. A button is inline-block by
            default and CTA_BASE's own `inline-block` would otherwise win, leaving this control sized to
            its text instead of spanning the column. */}
        <DemoCta className={`${CTA_PRIMARY} mt-6 block w-full px-6 py-4 text-base`}>
          {t('cta.upload')}
        </DemoCta>
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

function YearLine({ label, theirs, ours, save, pct, fmt, t }: {
  label: string; theirs: number; ours: number; save: number; pct: number
  /** The marketing country's money format. */
  fmt: MoneyFormat
  /** The page's translator (its locale is the server page's). */
  t: CompareT
}) {
  const gbp = (n: number, dp = 0) => gbpIn(fmt, n, dp)
  const isRealSaving = (n: number) => isRealSavingIn(fmt, n)
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
        {t.rich(isRealSaving(save) ? 'year.save' : 'year.extra', {
          amount: gbp(Math.abs(save)), pct: pctFixed(fmt, Math.abs(pct), 0, 0),
          note: c => <span className="ml-2 text-sm font-bold text-slate-400">{c}</span>,
        })}
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
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>{t.rich('year.current', { amount: gbp(theirs), b: c => <strong className="tabular-nums text-slate-700">{c}</strong> })}</span>
        <span className="text-slate-300">→</span>
        {/* ⚠️ "HatchGrab", NOT "HatchGrab Pro"/"HatchGrab Max" (23 August 2026). The tier is already
            stated once, in question 2 — ⚠️ QUOTATION CORRECTED 24 August 2026: that card now reads
            "We suggest Pro" / "We suggest Max" above the price, not the old "Pro — £29 per truck per
            month…". The CLAIM was always true; only the quote had gone stale. Repeating it on both year
            lines made the comparison about which PLAN they would be on, when the line exists to compare
            two TOTALS. `planName` is no longer a prop of this component as a result. */}
        <span>{t.rich('year.ours', { amount: gbp(ours), b: c => <strong className="tabular-nums" style={{ color: ORANGE }}>{c}</strong> })}</span>
      </div>
    </div>
  )
}

/**
 * One label/amount line in a breakdown card.
 *
 * 🔴 ONE COMPONENT FOR BOTH BREAKDOWNS — the "No" path's "Your month, broken down" and the Yes path's
 * "Your month on HatchGrab" share every row shape, and two copies would drift the first time a weight
 * or a gap moved.
 * ⚠️ A FLEX ROW WITH `justify-between`, NOT A GRID. The long note on the hero panel records two grid
 * attempts in this file that both collapsed to one column per cell; a flex row cannot lose its line.
 * ⚠️ `shrink-0` ON THE AMOUNT and no width on the label: the amount keeps its place at the right edge
 * and the label wraps instead, which is what keeps a long over-allowance label inside a 375px card.
 */
function BRow({ label, amount, bold, small, orange }: {
  label: string; amount: string; bold?: boolean; small?: boolean; orange?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${small ? 'text-xs' : 'text-sm'}`}>
      <span className={small ? 'text-slate-500' : bold ? 'font-bold' : 'text-slate-600'}
        style={bold ? { color: INK } : undefined}>
        {label}
      </span>
      <span className={`shrink-0 tabular-nums ${bold ? 'font-bold' : small ? 'text-slate-500' : 'font-semibold text-slate-800'}`}
        style={orange ? { color: ORANGE } : undefined}>
        {amount}
      </span>
    </div>
  )
}

function Card({ n, title, children, disabled }: {
  /** ⚠️ A NUMBER NOW, NOT A STRING. The step numbers are COMPUTED (`STEP` above) because the two paths
   *  have different lengths, and a string prop would have meant `String(STEP.days)` at every call site. */
  n: number; title: string; children: React.ReactNode; disabled?: boolean
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
