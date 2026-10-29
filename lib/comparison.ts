// lib/comparison.ts — 🔴 A COUNTRY'S COMPARISON PAGE, BUILT FROM DATA (compare-de-1, 24 October 2026;
// docs/compare-de-1-report.md). PURE: no request, no database. The page (app/[country]/[section]/[slug]/page.tsx), its
// Markdown and JSON twins (app/api/compare/…) and scripts/compare-de-1.cjs all call `buildComparison`, so the three can
// never disagree.
//
// ── WHAT IS SHOWN, AND TO WHOM ───────────────────────────────────────────────────────────────────────────────────────
// country_settings.comparison_status decides whether the page exists: 'off' → 404, 'admin' → admins only (noindex),
// 'live' → public. Inside the page, a competitor is PUBLIC only when three checks are done in Admin › Pricing check: its
// comparison entry, the plan the entry shows, and its features — all verified. The public view (and every anonymous
// visitor) sees HatchGrab plus those competitors; an admin sees every entry, each unverified one marked.
//
// ── WHERE EACH CELL COMES FROM ───────────────────────────────────────────────────────────────────────────────────────
// comparison-features-1 (29 October 2026): THE ROWS ARE THE MASTER FEATURE LIST (public.comparison_features,
// lib/comparison-features.ts) — every feature whose show_scope is 'all', or 'some' naming this country, grouped, each group
// a heading row. HatchGrab's "No" rows show like any other.
// HatchGrab: each feature's hatchgrab_source — the plan switches (public.plan_features — "ab Pro" when only some plans have
// it), the plan prices (public.plan_prices), the card rate, the country's app flags (country_settings.ios_app_available /
// android_app_available) or a fixed answer in messages. ⛔ No plan, price, allowance, trial length or tier is written here
// (manual §81). A competitor: its answers in public.competitor_feature_values (the country's own row, else the one for
// every country) and the entry's plan in public.competitor_plans, followed to its current version when it was edited.
// 🔴 CELL WORDS COME ONLY FROM A FIXED SET (comparison.cell.yes / no / partial / unknown) plus the short note as advertised;
// the .json twin carries the machine value. 🔴 EVERY AMOUNT HAS ITS UNIT AND PERIOD ("pro Monat", "pro Bestellung",
// "einmalig", "pro Kartenzahlung"). "Ja" only where the vendor says so.
//
// ⛔ No Product, Review, Rating or AggregateRating in the JSON-LD: this page compares tools, it does not rate them.
import type { CountrySettings } from '@/lib/country-settings-types'
import { planMoneyFormatOf } from '@/lib/country-settings-types'
import { feeLabel, formatAmount, formatWholeAmount, pctLabel, type MoneyFormat } from '@/lib/money-format'
import { formatYmd } from '@/lib/time-utils'
import { cardFeeOnlineLabel } from '@/lib/card-fees'
import type { PlanCatalog } from '@/lib/plans'
import { offerPlans, offerTrialMonths, type OfferPlan } from '@/lib/plan-offer'
import { isCountedCompetitor, type Competitor, type CompetitorPlan, type ComparisonEntry } from '@/lib/pricing-check'
import {
  featuresShownIn, featureWords, ourAnswer, effectiveValue, featuresVerifiedFor, FEATURE_GROUPS,
  type ComparisonFeature, type FeatureValueRow, type FeatureValue, type FeatureGroup, type PriceKind,
} from '@/lib/comparison-features'
import { BRANDS } from '@/lib/brand'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { organizationLd, websiteLd } from '@/lib/structured-data'
import { IMPRESSUM_DECISION } from '@/lib/comparison-decisions'

import type { ComparisonFlags, ComparisonStatus } from '@/lib/comparison-types'
export { COMPARISON_STATUSES, isComparisonStatus, type ComparisonFlags, type ComparisonStatus } from '@/lib/comparison-types'

/** The page's translator, the `comparison` namespace (next-intl's getTranslations, or translatorFor in a route). `markup`
 *  formats a message with tags (`<link>`) to a string — the Markdown twin's plain text. */
export type ComparisonT = ((key: string, values?: Record<string, string | number>) => string) & {
  markup?: (key: string, values: Record<string, string | number | ((chunks: string) => string)>) => string
}

export interface ComparisonInput {
  settings: CountrySettings
  /** The country in the page's language, inside a sentence ("Deutschland"). */
  countryName: string
  /** The plan catalogue with names in the page's language (lib/plan-names.ts localizePlans). */
  catalog: PlanCatalog
  flags: ComparisonFlags
  competitors: Competitor[]
  plans: CompetitorPlan[]
  entries: ComparisonEntry[]
  /** comparison-features-1: the master feature list and the competitors' current answers. */
  features: ComparisonFeature[]
  values: FeatureValueRow[]
  /** Whether a truck here can take tips / pass a service fee (lib/comparison-features.ts countryCharges). */
  charges?: { tips: boolean; serviceFee: boolean }
  /** Addresses, absolute (HATCHGRAB_ORIGIN): the page, the country's landing, its features page, the twins, contact. */
  urls: { page: string; home: string; features: string; md: string; json: string; contact: string }
  /** Today, YYYY-MM-DD — HatchGrab's own cells are read live, so they are checked today. */
  today: string
}

export interface ViewOptions {
  /** A verified admin is looking (the server checked). */
  admin: boolean
  /** The admin chose "So sieht es öffentlich aus" — or the visitor is not an admin. */
  publicView: boolean
}

/** One cell: its words (a fixed word, plus the note — or the note alone when the value is unknown), the machine value,
 *  the fixed word and the note separately (the .json twin), its source and checked date. */
export interface Cell { text: string; value: FeatureValue; word: string; note: string | null; source: string | null; checkedOn: string | null; unverified?: boolean }
export interface Column {
  key: string; name: string; url: string | null; us: boolean
  /** global-players-1: the short group label under the tool's name — the entry's override, else its focus's
   *  (comparison.groups.*: food-truck ordering system / ordering system / till system); null when the focus is unknown. */
  group: string | null
  /** All three checks done (entry, plan, features). Always true for HatchGrab. */
  verified: boolean; entryVerified: boolean; planVerified: boolean; featuresVerified: boolean
  plan: CompetitorPlan | null; chooseWhen: string | null
}
export interface Row { key: string; group: FeatureGroup; label: string; explain: string; cells: Cell[] }
export interface RowGroup { key: FeatureGroup; label: string; rows: Row[] }
export interface CostLine { tool: string; us: boolean; lines: string[]; source: string | null; checkedOn: string | null; unverified: boolean }
export interface ChecklistItem { key: string; label: string; ok: boolean }

export interface ComparisonView {
  status: ComparisonStatus
  admin: boolean
  publicView: boolean
  /** The newest check date among what is shown (YYYY-MM-DD) and the same in the page's words. */
  checkedOn: string
  checkedLabel: string
  /** The earliest date a shown entry was added — the page's datePublished. */
  publishedOn: string
  columns: Column[]
  /** Every row, in order (the twins); and the same rows by group (the page's table). */
  rows: Row[]
  groups: RowGroup[]
  /** "Begriffe erklärt": each shown feature's one-sentence explanation. */
  explained: { key: string; label: string; explain: string }[]
  /** Fewer than two verified competitors: the "Weitere Anbieter…" note shows under the table. */
  morePending: boolean
  costs: CostLine[]
  cardFee: string
  vat: string
  fit: { ours: string; oursBody: string; oursNot: string; oursNotBody: string; rivals: { name: string; text: string; unverified: boolean }[]; cards: { title: string; body: string }[] }
  faq: { q: string; a: string }[]
  trialMonths: number | null
  checklist: ChecklistItem[]
}

/** The price rows whose competitor side comes from the entry's plan (the rest come from its answers). */
const PLAN_PRICE: readonly PriceKind[] = ['monthly', 'perorder', 'cardfee', 'setup']

/** The plan an entry shows: its own while current, else the current plan with the same name for the same competitor and
 *  country (a plan is never edited in place — an edit inserts a new row), else that competitor's first current plan. */
export function entryPlan(e: Pick<ComparisonEntry, 'primaryPlanId' | 'competitorId' | 'countryCode'>, plans: CompetitorPlan[]): CompetitorPlan | null {
  const own = e.primaryPlanId ? plans.find(p => p.id === e.primaryPlanId) ?? null : null
  if (own && own.supersededAt === null) return own
  const current = plans.filter(p => p.competitorId === e.competitorId && p.countryCode === e.countryCode && p.supersededAt === null)
  return (own && current.find(p => p.planName === own.planName)) ?? current[0] ?? null
}

/** Public = the entry, its plan and the competitor's features are all verified. */
export function entryIsPublic(e: ComparisonEntry, competitors: Competitor[], plans: CompetitorPlan[], features?: { values: FeatureValueRow[]; keys: string[] }): boolean {
  const c = competitors.find(x => x.id === e.competitorId)
  const p = entryPlan(e, plans)
  return !!(e.verifiedAt && p?.verifiedAt && c?.featuresVerifiedAt && isCountedCompetitor(c)
    && (!features || featuresVerifiedFor(features.values, c.id, e.countryCode, features.keys)))
}

/** "[ … ]" or "[…]" or "[ ... ]" — an unfinished line in the copy. The checklist refuses to go live with one. */
export const PLACEHOLDER = /\[\s*(?:…|\.\.\.)[^\]]*\]/

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null)
const maxDate = (ds: (string | null | undefined)[]) => ds.filter((d): d is string => !!d).sort().pop() ?? null
const minDate = (ds: (string | null | undefined)[]) => ds.filter((d): d is string => !!d).sort()[0] ?? null

export function buildComparison(input: ComparisonInput, t: ComparisonT, opts: ViewOptions): ComparisonView {
  const { settings, catalog, flags, urls } = input
  const country = input.countryName
  const showAll = opts.admin && !opts.publicView
  const money: MoneyFormat = planMoneyFormatOf(settings)
  const ts = { timeZone: settings.defaultTimezone, locale: settings.locale, timeFormat: settings.timeFormat, dateOrder: settings.dateOrder, weekStart: settings.weekStart }
  const pct = (bps: number) => pctLabel(bps / 100, money)
  const amount = (minor: number) => formatAmount(minor, money)

  // ── the columns: HatchGrab, then the entries in their order (public ones only, unless an admin sees everything) ──
  const offers: OfferPlan[] = offerPlans(catalog, settings.countryCode)
  const entries = input.entries.filter(e => e.countryCode === settings.countryCode).sort((a, b) => a.sortOrder - b.sortOrder)
  // global-players-1: food trucks, markets and pop-ups share the food-truck group; a local-restaurant tool and a till its own.
  const groupOf = (focus: Competitor['focus'] | null, override: string | null | undefined): string | null =>
    override?.trim() ? override.trim() : focus === 'pos' ? t('groups.pos') : focus === 'nearest_local' ? t('groups.nearest_local') : focus ? t('groups.food_truck') : null
  const us: Column = { key: 'hatchgrab', name: BRANDS.HATCHGRAB.name, url: urls.home, us: true, group: t('groups.food_truck'), verified: true, entryVerified: true, planVerified: true, featuresVerified: true, plan: null, chooseWhen: null }
  const columns: Column[] = [us]
  for (const e of entries) {
    const c = input.competitors.find(x => x.id === e.competitorId)
    if (!c) continue
    const plan = entryPlan(e, input.plans)
    const col: Column = {
      key: c.id, name: c.name, url: c.website, us: false, group: groupOf(c.focus, e.groupLabel),
      entryVerified: !!e.verifiedAt, planVerified: !!plan?.verifiedAt, featuresVerified: !!c.featuresVerifiedAt, verified: false,
      plan, chooseWhen: e.chooseWhen,
    }
    // global-players-1: a pending 'pos' competitor (not yet counted — a candidate) is never public, whatever is verified.
    col.verified = col.entryVerified && col.planVerified && col.featuresVerified && isCountedCompetitor(c)
    if (col.verified || showAll) columns.push(col)
  }
  const compOf = new Map(input.competitors.map(c => [c.id, c]))

  // ── the features shown here (the master list), and each column's features verification ──
  const shownFeatures = featuresShownIn(input.features, settings.countryCode)
  const shownKeys = shownFeatures.map(f => f.key)
  for (const col of columns) {
    if (col.us) continue
    // The competitor's stamp AND every stated answer shown here carries its own (Mark features verified, per country).
    col.featuresVerified = col.featuresVerified && featuresVerifiedFor(input.values, col.key, settings.countryCode, shownKeys)
    col.verified = col.verified && col.featuresVerified
  }
  for (let i = columns.length - 1; i > 0; i--) if (!columns[i].verified && !showAll) columns.splice(i, 1)
  const verifiedCount = columns.filter(c => !c.us && c.verified).length
  const trialMonths = offerTrialMonths(catalog)

  // ── the cell words: ONLY the fixed set, plus the note (a note alone when the value is not stated) ──
  const word = (v: FeatureValue) => t(`cell.${v}`)
  const cell = (value: FeatureValue, note: string | null, source: string | null, checkedOn: string | null, unverified?: boolean): Cell => {
    const n = note?.trim() || null
    const text = value === 'unknown' && n ? n : n ? t('cell.withNote', { word: word(value), note: n }) : word(value)
    return { text, value, word: word(value), note: n, source, checkedOn, ...(unverified ? { unverified } : {}) }
  }

  // ── HatchGrab's cells ──
  const ourSource = (f: ComparisonFeature) => (f.groupKey === 'price_contract' ? `${urls.home}#pricing` : urls.features)
  const ourBase = (): string => {
    if (!offers.length) return t('table.unknown')
    const lo = Math.min(...offers.map(o => o.monthlyMinor)), hi = Math.max(...offers.map(o => o.monthlyMinor))
    return t('cell.perMonth', { price: lo === hi ? formatWholeAmount(lo, money) : t('table.range', { from: formatWholeAmount(lo, money), to: formatWholeAmount(hi, money) }) })
  }
  const ourOrderFee = (): string => {
    if (!offers.length) return t('table.unknown')
    // One part per fee, in plan order, each with its unit: "0,99 % pro Online-Kartenbestellung (Starter) · keine (Pro, Unlimited)".
    const groups: { fee: string; plans: string[] }[] = []
    for (const o of offers) {
      const fee = o.shape === 'noFee' ? t('table.noFee') : o.shape === 'included'
        ? t('table.feeAfter', { fee: pct(o.feeBps), included: formatWholeAmount(o.includedMinor ?? 0, money) }) : t('costs.feeOnly', { fee: pct(o.feeBps) })
      const g = groups.find(x => x.fee === fee)
      if (g) g.plans.push(o.plan.name); else groups.push({ fee, plans: [o.plan.name] })
    }
    return groups.length === 1 ? groups[0].fee : groups.map(g => t('table.feePlan', { fee: g.fee, plans: g.plans.join(', ') })).join(' · ')
  }
  const ourPrice = (kind: PriceKind, f: ComparisonFeature): Cell => {
    const src = ourSource(f)
    switch (kind) {
      case 'monthly': return cell(offers.length ? 'yes' : 'unknown', offers.length ? ourBase() : null, src, input.today)
      case 'perorder': return cell(offers.length ? (offers.every(o => o.shape === 'noFee') ? 'no' : 'yes') : 'unknown', offers.length ? ourOrderFee() : null, src, input.today)
      case 'cardfee': return cell('yes', t('cell.perCardPayment', { fee: cardFeeOnlineLabel(settings) }), src, input.today)
      case 'term': return cell('no', null, src, input.today)    // no minimum contract (faq.termA)
      case 'setup': return cell('no', null, src, input.today)   // plan_prices has no set-up fee (confirmed 29 Oct)
      case 'trial_months': return trialMonths ? cell('yes', t('cell.trial', { months: trialMonths }), src, input.today) : cell('no', null, src, input.today)
    }
  }
  const ourCell = (f: ComparisonFeature): Cell => {
    const a = ourAnswer(f, { catalog, appFlags: { ios: flags.iosApp, android: flags.androidApp }, charges: input.charges })
    if (a.note?.kind === 'price') return ourPrice(a.note.price, f)
    const note = !a.note ? null
      : a.note.kind === 'plans' ? t('cell.fromPlan', { plan: a.note.plans[0] })
      : a.note.kind === 'flagOff' ? (showAll ? t('cell.flagOff') : t('cell.notInCountry', { country }))
      : a.note.kind === 'soon' ? t('cell.soon')
      : a.note.kind === 'message' ? t(`features.${f.key}.ours`) : null
    return cell(a.value, note, ourSource(f), input.today)
  }

  // ── a competitor's cells ──
  // A competitor's amounts in its plan's own currency, written the country's way.
  const theirs = (minor: number, p: CompetitorPlan) => formatAmount(minor, { ...money, currency: p.currency })
  const priceText = (p: CompetitorPlan): string => {
    if (p.priceHidden || p.monthlyMinor === null) return t('table.priceHidden')
    const base = t(p.yearlyOnly ? 'costs.perMonthYearly' : 'costs.perMonth', { price: theirs(p.monthlyMinor, p) })
    return p.vat === 'excl' ? `${base} ${t('costs.vatExcl')}` : p.vat === 'incl' ? `${base} ${t('costs.vatIncl')}` : base
  }
  const fixedFee = (bps: number, fixedMinor: number, cur: string) =>
    bps && fixedMinor ? feeLabel({ pct: bps / 100, fixedMinor }, { ...money, currency: cur }) : bps ? pct(bps) : formatAmount(fixedMinor, { ...money, currency: cur })
  const rivalOrderFee = (p: CompetitorPlan): { value: FeatureValue; text: string | null } => {
    if (p.unclear && !p.truckFeeBps && !p.truckFeeFixedMinor && !p.customerFeeBps && !p.customerFeeFixedMinor && !(p.cardMode === 'bundled' && p.cardBps)) return { value: 'unknown', text: null }
    const parts: string[] = []
    if (p.truckFeeBps || p.truckFeeFixedMinor) parts.push(t('costs.truckFee', { fee: fixedFee(p.truckFeeBps, p.truckFeeFixedMinor, p.currency) }))
    if (p.customerFeeBps || p.customerFeeFixedMinor) parts.push(t('costs.customerFee', { fee: fixedFee(p.customerFeeBps, p.customerFeeFixedMinor, p.currency) }))
    // A payment fee that already includes the card processing (the vendor's own "online ab 2,5 %").
    if (p.cardMode === 'bundled' && (p.cardBps || p.cardFixedMinor)) parts.push(t('costs.bundledFee', { fee: fixedFee(p.cardBps ?? 0, p.cardFixedMinor ?? 0, p.currency) }))
    return parts.length ? { value: 'yes', text: parts.join(', ') } : { value: 'no', text: t('table.noFee') }
  }
  const rivalPrice = (kind: PriceKind, col: Column, c: Competitor): Cell => {
    const p = col.plan
    const planCell = (value: FeatureValue, note: string | null) => cell(value, note, p?.sourceUrl ?? c.website, p?.checkedOn ?? null, !col.planVerified)
    if (!p) return planCell('unknown', null)
    switch (kind) {
      case 'monthly': return p.priceHidden || p.monthlyMinor === null ? planCell('unknown', t('table.priceHidden')) : planCell('yes', priceText(p))
      case 'perorder': { const r = rivalOrderFee(p); return planCell(r.value, r.text) }
      case 'cardfee':
        if (p.cardMode === 'bundled' && (p.cardBps || p.cardFixedMinor)) return planCell('yes', t('costs.bundledFee', { fee: fixedFee(p.cardBps ?? 0, p.cardFixedMinor ?? 0, p.currency) }))
        return p.cardBps !== null && !p.cardRateAssumed ? planCell('yes', t('cell.perCardPayment', { fee: fixedFee(p.cardBps, p.cardFixedMinor ?? 0, p.currency) })) : planCell('unknown', null)
      case 'setup': return p.setupMinor ? planCell('yes', t('cell.setupFee', { price: theirs(p.setupMinor, p) })) : planCell('no', null)
      default: return planCell('unknown', null)
    }
  }
  const rivalCell = (f: ComparisonFeature, col: Column): Cell => {
    const c = compOf.get(col.key)!
    const kind = /(?:^|;)\s*price:([a-z]+)/.exec(f.hatchgrabSource)?.[1] as PriceKind | undefined
    if (kind && PLAN_PRICE.includes(kind)) return rivalPrice(kind, col, c)
    const v = effectiveValue(input.values, c.id, f.key, settings.countryCode)
    // No answer yet: "not stated", dated by the competitor's features check (a cell always has a date and a source).
    if (!v) return cell('unknown', null, c.website, c.featuresCheckedOn, !col.featuresVerified)
    return cell(v.value, v.note, v.sourceUrl ?? c.website, v.checkedOn ?? c.featuresCheckedOn, !col.featuresVerified)
  }

  // ── the rows, grouped ──
  const rows: Row[] = shownFeatures.map(f => {
    const w = featureWords(f, settings.locale, k => t(k))
    return { key: f.key, group: f.groupKey, label: w.label, explain: w.explain, cells: columns.map(col => (col.us ? ourCell(f) : rivalCell(f, col))) }
  })
  const groups: RowGroup[] = FEATURE_GROUPS.map(g => ({ key: g, label: t(`featureGroups.${g}`), rows: rows.filter(r => r.group === g) })).filter(g => g.rows.length)
  const explained = rows.map(r => ({ key: r.key, label: r.label, explain: r.explain })).filter(e => e.explain)

  // ── costs ──
  const ourLine = (o: OfferPlan) => t('costs.ourPlan', {
    plan: o.plan.name, price: amount(o.monthlyMinor),
    fee: o.shape === 'noFee' ? t('costs.feeNone') : o.shape === 'included'
      ? t('costs.feeIncluded', { included: formatWholeAmount(o.includedMinor ?? 0, money), fee: pct(o.feeBps) })
      : t('costs.feeOnly', { fee: pct(o.feeBps) }),
  })
  const costs: CostLine[] = [{ tool: us.name, us: true, lines: offers.map(ourLine), source: `${urls.home}#pricing`, checkedOn: input.today, unverified: false }]
  for (const col of columns) {
    if (col.us || !col.plan) continue
    const p = col.plan
    const bits = [priceText(p)]
    if (p.setupMinor) bits.push(t('costs.setup', { price: theirs(p.setupMinor, p) }))
    const fee = rivalOrderFee(p)
    if (fee.value === 'yes' && fee.text) bits.push(fee.text)
    costs.push({ tool: col.name, us: false, lines: [t('costs.rivalPlan', { plan: p.planName, price: bits.join(', ') })], source: p.sourceUrl, checkedOn: p.checkedOn, unverified: !col.planVerified })
  }
  const cardFee = t('costs.cardFee', { cardFee: cardFeeOnlineLabel(settings), country })
  const vat = t('costs.vat', { country })

  // ── fit ──
  // global-players-1: the tills card names the till / POS players that are PUBLIC in this country's table (verified and
  // counted — never an unverified one, in either view), instead of fixed example names.
  function tillsBody(): string {
    const names = columns.filter(c => !c.us && c.verified && compOf.get(c.key)?.focus === 'pos').map(c => c.name)
    if (!names.length) return t('fit.tillsBody')
    const list = new Intl.ListFormat(settings.locale, { style: 'long', type: 'conjunction' }).format(names)
    return t('fit.tillsBodyNamed', { names: list, count: names.length })
  }
  const appsMissing = !flags.iosApp || !flags.androidApp
  const fit = {
    ours: t('fit.ours'), oursBody: t('fit.oursBody'), oursNot: t('fit.oursNot'),
    oursNotBody: appsMissing ? `${t('fit.oursNotBody')} ${t('fit.appClause', { country })}` : t('fit.oursNotBody'),
    rivals: columns.filter(c => !c.us && c.chooseWhen).map(c => ({ name: t('fit.rival', { name: c.name }), text: c.chooseWhen!, unverified: !c.entryVerified })),
    cards: [{ title: t('fit.tills'), body: tillsBody() }, { title: t('fit.marketplaces'), body: t('fit.marketplacesBody') }],
  }

  // ── FAQ (the cost answer from plan_prices and the trial from the plans) ──
  const costA = t('faq.costA', { plans: offers.map(ourLine).join('; '), cardFee: cardFeeOnlineLabel(settings) })
  const faq = [
    { q: t('faq.whatQ'), a: t('faq.whatA') },
    { q: t('faq.costQ', { country }), a: trialMonths ? `${costA} ${t('faq.costTrial', { months: trialMonths })}` : costA },
    { q: t('faq.termQ'), a: t('faq.termA') },
    { q: t('faq.locationsQ'), a: t('faq.locationsA') },
    { q: t('faq.capacityQ'), a: t('faq.capacityA') },
    { q: t('faq.tseQ'), a: t('faq.tseA') },
    { q: t('faq.paymentsQ'), a: t('faq.paymentsA') },
  ]

  // ── dates: the newest check among what is shown ──
  const shown = columns.filter(c => !c.us)
  const checkedOn = maxDate(shown.flatMap(c => [c.plan?.checkedOn,
    ...rows.map(r => r.cells[columns.indexOf(c)]?.checkedOn),
    day(entries.find(e => e.competitorId === c.key)?.verifiedAt)])) ?? input.today
  const publishedOn = minDate(shown.map(c => day(entries.find(e => e.competitorId === c.key)?.createdAt))) ?? checkedOn

  // ── the go-live checklist (admins) — every text the page can show is scanned for a placeholder ──
  const texts = [
    ...rows.flatMap(r => [r.label, r.explain, ...r.cells.map(c => c.text)]), ...costs.flatMap(c => c.lines), cardFee, vat,
    fit.oursBody, fit.oursNotBody, ...fit.rivals.map(r => r.text), ...fit.cards.flatMap(c => [c.title, c.body]),
    ...faq.flatMap(f => [f.q, f.a]), t('tldr.body'), t('meta.title'), t('meta.description'), t('h1'),
  ]
  const allVerified = input.entries.filter(e => e.countryCode === settings.countryCode && entryIsPublic(e, input.competitors, input.plans, { values: input.values, keys: shownKeys })).length
  const checklist: ChecklistItem[] = [
    { key: 'apps', label: t('admin.check.apps', { country }), ok: flags.iosApp && flags.androidApp },
    { key: 'verified', label: t('admin.check.verified', { n: allVerified }), ok: allVerified >= 2 },
    { key: 'placeholders', label: t('admin.check.placeholders'), ok: !texts.some(s => PLACEHOLDER.test(s)) },
    { key: 'vat', label: t('admin.check.vat'), ok: vat.trim().length > 0 && vat !== 'costs.vat' },
    { key: 'impressum', label: t('admin.check.impressum'), ok: !!IMPRESSUM_DECISION[settings.countryCode]?.trim() },
  ]

  return {
    status: flags.status, admin: opts.admin, publicView: !showAll,
    checkedOn, checkedLabel: formatYmd(checkedOn, ts, { day: 'numeric', month: 'long', year: 'numeric' }), publishedOn,
    columns, rows, groups, explained, morePending: verifiedCount < 2, costs, cardFee, vat, fit, faq, trialMonths, checklist,
  }
}

// ── the twins and the structured data ────────────────────────────────────────────────────────────────────────────────

/** schema.org JSON-LD: WebPage, BreadcrumbList, FAQPage and an ItemList of the tools compared (name and url only), with
 *  the Organization and WebSite they point at. ⛔ No Product, Review, Rating or AggregateRating. */
export function comparisonGraph(v: ComparisonView, input: ComparisonInput, t: ComparisonT) {
  const page = input.urls.page
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationLd(input.settings.countryCode),
      websiteLd(),
      {
        '@type': 'WebPage', '@id': `${page}#webpage`, url: page, name: t('h1'), description: t('meta.description'),
        inLanguage: input.settings.locale, datePublished: v.publishedOn, dateModified: v.checkedOn,
        isPartOf: { '@id': `${HATCHGRAB_ORIGIN}/#website` }, publisher: { '@id': `${HATCHGRAB_ORIGIN}/#organization` },
        about: { '@type': 'Thing', name: t('meta.about') }, breadcrumb: { '@id': `${page}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList', '@id': `${page}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumb.home'), item: input.urls.home },
          { '@type': 'ListItem', position: 2, name: t('breadcrumb.here'), item: page },
        ],
      },
      {
        '@type': 'FAQPage', '@id': `${page}#faq`,
        mainEntity: v.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
      {
        '@type': 'ItemList', '@id': `${page}#tools`, name: t('table.title'),
        itemListElement: v.columns.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(c.url ? { url: c.url } : {}) })),
      },
    ],
  }
}

const mdCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
/** Strips the rich-text tags of a message (`<link>…</link>`) for plain text. */
export const plain = (s: string) => s.replace(/<\/?[a-z]+>/gi, '')

/** The page as Markdown — the same view, the same visibility. */
export function comparisonMarkdown(v: ComparisonView, input: ComparisonInput, t: ComparisonT): string {
  const out: string[] = []
  // A message with tags, as plain text (the tags' words kept, the tags dropped).
  const tags = { link: (c: string) => c, md: (c: string) => c, json: (c: string) => c }
  const flat = (k: string, values: Record<string, string | number> = {}) => (t.markup ? t.markup(k, { ...values, ...tags }) : plain(t(k, values)))
  out.push(`# ${t('h1')}`, '', flat('byline', { date: v.checkedLabel }), '', `URL: ${input.urls.page}`, '')
  out.push(`## ${t('tldr.title')}`, '', t('tldr.body'), '')
  out.push(`## ${t('table.title')}`, '', `_${t('table.caption', { country: input.countryName, date: v.checkedLabel })}_`, '')
  out.push(`| ${mdCell(t('table.feature'))} | ${v.columns.map(c => mdCell(c.group ? `${c.name} (${c.group})` : c.name)).join(' | ')} |`)
  out.push(`|${' --- |'.repeat(v.columns.length + 1)}`)
  // comparison-features-1: each group a heading row, then its features; every cell its words and note.
  for (const g of v.groups) {
    out.push(`| **${mdCell(g.label)}** |${' |'.repeat(v.columns.length)}`)
    for (const r of g.rows) out.push(`| ${mdCell(r.label)} | ${r.cells.map(c => mdCell(c.text)).join(' | ')} |`)
  }
  out.push('', t('table.note'))
  if (v.explained.length) {
    out.push('', `## ${t('explained.title')}`, '')
    for (const e of v.explained) out.push(`- **${e.label}:** ${e.explain}`)
  }
  if (v.morePending) out.push('', t('table.morePending'))
  out.push('', `## ${t('costs.title')}`, '')
  for (const c of v.costs) {
    for (const l of c.lines) out.push(`- ${c.us ? '' : `${c.tool} – `}${l}`)
    if (c.source) out.push(`  - ${t('costs.source')}: ${c.source}${c.checkedOn ? ` (${t('costs.checked', { date: c.checkedOn })})` : ''}`)
  }
  out.push('', v.cardFee, '', v.vat, '')
  out.push(`## ${t('fit.title')}`, '', `**${v.fit.ours}** ${v.fit.oursBody}`, '', `**${v.fit.oursNot}** ${v.fit.oursNotBody}`, '')
  for (const r of v.fit.rivals) out.push(`**${r.name}** ${r.text}`, '')
  for (const c of v.fit.cards) out.push(`**${c.title}:** ${c.body}`, '')
  out.push(`## ${t('faq.title')}`, '')
  for (const f of v.faq) out.push(`### ${f.q}`, '', f.a, '')
  out.push(`## ${t('method.title')}`, '', t('method.checked', { date: v.checkedLabel }), '', t('method.prices'), '', t('method.meaning'), '',
    t('method.vendor'), '', t('method.review'), '', `${flat('method.corrections')} ${input.urls.contact}`, '')
  out.push(`JSON: ${input.urls.json}`, '')
  return out.join('\n')
}

/** The page as JSON — every cell with its source and the date it was checked. */
export function comparisonJson(v: ComparisonView, input: ComparisonInput, t: ComparisonT) {
  return {
    title: t('h1'),
    url: input.urls.page,
    markdown: input.urls.md,
    country: input.settings.countryCode,
    language: input.settings.locale,
    currency: input.settings.currency,
    checked: v.checkedOn,
    publisher: BRANDS.HATCHGRAB.name,
    publisherIsCompared: true,
    tools: v.columns.map(c => ({ name: c.name, ...(c.group ? { group: c.group } : {}), url: c.url, isPublisher: c.us, ...(c.plan ? { plan: c.plan.planName } : {}), ...(!c.verified ? { verified: false } : {}) })),
    // comparison-features-1: every cell's machine value (yes / no / partial / unknown), its word from the fixed set, the note
    // as advertised, the whole text, the source URL and the checked date.
    rows: v.rows.map(r => ({
      key: r.key, group: v.groups.find(g => g.key === r.group)?.label ?? r.group, label: r.label, explanation: r.explain,
      cells: r.cells.map((c, i) => ({ tool: v.columns[i].name, value: c.value, label: c.word, note: c.note, text: c.text, source: c.source, checked: c.checkedOn, ...(c.unverified ? { verified: false } : {}) })),
    })),
    explained: v.explained.map(e => ({ feature: e.label, meaning: e.explain })),
    costs: v.costs.map(c => ({ tool: c.tool, lines: c.lines, source: c.source, checked: c.checkedOn })),
    cardFees: v.cardFee,
    vat: v.vat,
    faq: v.faq.map(f => ({ question: f.q, answer: f.a })),
    method: [t('method.checked', { date: v.checkedLabel }), t('method.prices'), t('method.meaning'), t('method.vendor'), t('method.review')],
  }
}
