// lib/comparison-features.ts — THE MASTER LIST OF COMPARED FEATURES and each competitor's answers (comparison-features-1,
// 29 October 2026; docs/comparison-features-1-report.md). PURE AND CLIENT-SAFE: no database, no server imports. Used by the
// comparison pages (lib/comparison.ts), Admin › Pricing check (the Feature list and the country's feature matrix), the
// checker (the features it is asked about) and the importer (data/comparison-features/features.json).
//
// ── THE DATA (20261047) ──────────────────────────────────────────────────────────────────────────────────────────────
//   public.comparison_features        key, group, order, checked (the checker asks about it), show_scope ('all' | 'some' +
//                                     show_countries | 'hidden'), hatchgrab_source (below), and — for a feature added in
//                                     Admin only — its words per locale (labels, explanations). A SEEDED feature's words are
//                                     in messages (comparison.features.<key>.label / .explain / .ours).
//                                     competitor-features-2 (20261062): tier — core / commercial / secondary / off (null = not
//                                     tiered yet, read as core): how often the checker asks (competitor_check_settings.tier_intervals).
//   public.competitor_feature_values  value yes / no / partial / unknown / not_mentioned (competitor-features-2: the competitor's
//                                     own site does not mention it — never shown as a "no"), the note as advertised, quote, source, checked
//                                     date, verification; country_code null = every country, a country's own row wins there.
//                                     🔴 Never edited in place: a new row supersedes the old one (the history rule).
//
// ── HATCHGRAB'S OWN ANSWER (hatchgrab_source) — read from where the truth is, never typed per page ────────────────────
//   plan:<feature>[+<feature>…]  the plan switches (lib/features.ts keys; which plans have them is data, plan_features):
//                                yes on every public plan, yes "from <plan>" on some, no on none
//   builtin                      part of the product on every plan (no switch)
//   flag:ios | flag:android      country_settings.ios_app_available / android_app_available (combined with a plan switch:
//                                "plan:ipad_kds;flag:ios") — the ONE source for the app rows
//   price:<monthly|perorder|cardfee|term|setup|trial_months>   plan_prices, the card rate and the plans' trial (lib/comparison.ts)
//   fixed:<yes|no|partial>[:note]  a fixed answer; with ":note", its note is the message comparison.features.<key>.ours
//   country:tips | country:service_fee   whether the country lets a truck take tips / pass a service fee to the customer
//                                (lib/order-charge-rules.ts and the Charges card: countryCharges below)
//   soon                         "Coming soon" — never "Yes"
//   confirm                      not confirmed yet: Admin shows "to confirm", a page says "not stated"
import type { Feature } from '@/lib/features'
import { planAllowsFeature, publicPlans, type PlanCatalog } from '@/lib/plans'
import { includedTaxOf } from '@/lib/address-formats'

export const FEATURE_GROUPS = ['ordering', 'payments', 'kitchen', 'marketing', 'apps_hardware', 'price_contract'] as const
export type FeatureGroup = (typeof FEATURE_GROUPS)[number]
export const FEATURE_VALUES = ['yes', 'no', 'partial', 'unknown', 'not_mentioned'] as const
export type FeatureValue = (typeof FEATURE_VALUES)[number]
export const SHOW_SCOPES = ['all', 'some', 'hidden'] as const
export type ShowScope = (typeof SHOW_SCOPES)[number]
export const FEATURE_KEY = /^[a-z][a-z0-9_]{1,30}$/
/** competitor-features-2: how often the checker asks about a feature — commercial every 30 days, core 90, secondary 180, off never
 *  (the intervals are competitor_check_settings.tier_intervals). */
export const FEATURE_TIERS = ['core', 'commercial', 'secondary', 'off'] as const
export type FeatureTier = (typeof FEATURE_TIERS)[number]
/** A feature's tier; one not tiered yet (null — an Admin-added feature) is core. */
export const tierOf = (f: { tier?: FeatureTier | null }): FeatureTier => f.tier ?? 'core'
/** competitor-features-2: the features that apply to a competitor of this focus — a street-food market (it runs markets, it does not
 *  sell ordering software) is asked only about discovery and the commercial features, and is never marked down for the rest; every
 *  other focus (food_truck, nearest_local, pop_up, pos, none) gets the full list. */
export const FOCUS_ONLY: Readonly<Record<string, { keys: readonly string[]; tiers: readonly FeatureTier[] }>> = {
  street_food_markets: { keys: ['discovery'], tiers: ['commercial'] },
}
export const appliesToFocus = (f: { key: string; tier?: FeatureTier | null }, focus: string | null | undefined): boolean => {
  const only = focus ? FOCUS_ONLY[focus] : undefined
  return !only || only.keys.includes(f.key) || only.tiers.includes(tierOf(f))
}

export interface ComparisonFeature {
  key: string; groupKey: FeatureGroup; sortOrder: number; checked: boolean; showScope: ShowScope; showCountries: string[]
  hatchgrabSource: string
  /** competitor-features-2: null = not tiered yet (read as core — tierOf). */
  tier: FeatureTier | null
  /** Only for a feature added in Admin: its words per locale ({"en-GB": …, "de-DE": …}). Empty for a seeded one. */
  labels: Record<string, string>; explanations: Record<string, string>
  updatedAt: string | null
  /** compare-suits-1 (20261075): never a "competitor strength" answer (card readers, tills, taking card payments). Admin's; the
   *  importer never writes it. Absent before 20261075: false. */
  neverCompetitorStrength?: boolean
  /** compare-suits-1 (20261075): a feature a company would certainly advertise — "not mentioned" may read as "not listed", ONLY
   *  when the check that last asked about it fetched the features and pricing pages (and the help centre where one exists). */
  absenceMeansNo?: boolean
}
export interface FeatureValueRow {
  id: string; competitorId: string; featureKey: string; countryCode: string | null; value: FeatureValue
  note: string | null; quote: string | null; sourceUrl: string | null; checkedOn: string | null
  verifiedAt: string | null; verifiedBy: string | null; supersededAt: string | null; createdAt: string | null
  /** compare-autopublish-1 (20261078 / 20261079): verified automatically (the evidence rule), and Admin's block on that. */
  autoVerifiedAt?: string | null; autoBlocked?: boolean
}

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const words = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v as Row).filter(([, x]) => typeof x === 'string' && (x as string).trim()) as [string, string][]) : {})

/** A comparison_features row (or a features.json entry), read tolerantly. */
export function featureOut(r: Row): ComparisonFeature {
  return {
    key: String(r.key), groupKey: (FEATURE_GROUPS as readonly string[]).includes(String(r.group_key)) ? r.group_key as FeatureGroup : 'ordering',
    sortOrder: Number(r.sort_order) || 0, checked: r.checked !== false,
    showScope: (SHOW_SCOPES as readonly string[]).includes(String(r.show_scope)) ? r.show_scope as ShowScope : 'hidden',
    showCountries: Array.isArray(r.show_countries) ? (r.show_countries as unknown[]).filter((c): c is string => typeof c === 'string') : [],
    hatchgrabSource: str(r.hatchgrab_source) ?? 'confirm', labels: words(r.labels), explanations: words(r.explanations),
    tier: (FEATURE_TIERS as readonly string[]).includes(String(r.tier)) ? r.tier as FeatureTier : null,
    updatedAt: str(r.updated_at),
    neverCompetitorStrength: r.never_competitor_strength === true, absenceMeansNo: r.absence_means_no === true,
  }
}
export function valueOut(r: Row): FeatureValueRow {
  return {
    id: String(r.id), competitorId: String(r.competitor_id), featureKey: String(r.feature_key), countryCode: str(r.country_code),
    value: (FEATURE_VALUES as readonly string[]).includes(String(r.value)) ? r.value as FeatureValue : 'unknown',
    note: str(r.note), quote: str(r.quote), sourceUrl: str(r.source_url), checkedOn: str(r.checked_on) ? String(r.checked_on).slice(0, 10) : null,
    verifiedAt: str(r.verified_at), verifiedBy: str(r.verified_by), supersededAt: str(r.superseded_at), createdAt: str(r.created_at),
    autoVerifiedAt: str(r.auto_verified_at), autoBlocked: r.auto_blocked === true,
  }
}

/** The list in page order: by group, then sort order, then key. */
export const inOrder = (features: readonly ComparisonFeature[]) => [...features].sort((a, b) =>
  FEATURE_GROUPS.indexOf(a.groupKey) - FEATURE_GROUPS.indexOf(b.groupKey) || a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
/** Shown on a website in this country: scope 'all', or 'some' naming it. A hidden feature never is (it may still be checked). */
export const isShownIn = (f: Pick<ComparisonFeature, 'showScope' | 'showCountries'>, code: string) =>
  f.showScope === 'all' || (f.showScope === 'some' && f.showCountries.includes(code))
export const featuresShownIn = (features: readonly ComparisonFeature[], code: string) => inOrder(features.filter(f => isShownIn(f, code)))
/** The features the country's admin matrix shows: every CHECKED feature that may apply there (hidden ones included). */
export const featuresCheckedFor = (features: readonly ComparisonFeature[], code: string) =>
  inOrder(features.filter(f => f.checked && (f.showScope !== 'some' || f.showCountries.includes(code))))

// ── a competitor's answers ───────────────────────────────────────────────────────────────────────────────────────────
/** Says something: a value other than unknown, or a note or a source. An unknown placeholder says nothing. */
export const isStated = (r: Pick<FeatureValueRow, 'value' | 'note' | 'sourceUrl'>) => r.value !== 'unknown' || !!r.note || !!r.sourceUrl
/** The competitor's current answer in a country: its row for that country, else its row for every country. */
export function effectiveValue(values: readonly FeatureValueRow[], competitorId: string, key: string, code: string | null): FeatureValueRow | null {
  const cur = values.filter(v => v.competitorId === competitorId && v.featureKey === key && v.supersededAt === null)
  return (code ? cur.find(v => v.countryCode === code) : undefined) ?? cur.find(v => v.countryCode === null) ?? null
}
/** Every stated answer among `keys` in the country carries a verification. (An unknown placeholder needs none: the page
 *  says "not stated", which is true.) */
export function featuresVerifiedFor(values: readonly FeatureValueRow[], competitorId: string, code: string, keys: readonly string[]): boolean {
  return keys.every(k => { const v = effectiveValue(values, competitorId, k, code); return !v || !isStated(v) || !!v.verifiedAt })
}
/** The rows "Mark features verified" stamps for a country: the competitor's current rows for that country or every country. */
export const rowsForCountry = (values: readonly FeatureValueRow[], competitorId: string, code: string) =>
  values.filter(v => v.competitorId === competitorId && v.supersededAt === null && (v.countryCode === null || v.countryCode === code))

// ── the old fixed columns (20261048 moves them; nothing reads them after) ──────────────────────────────────────────────
/** competitors' retired columns → feature keys. The two texts move as the note, with value unknown. */
export const LEGACY_FEATURE_COLUMNS: Readonly<Record<string, { key: string; text?: true }>> = {
  pre_orders: { key: 'preorder' }, whatsapp: { key: 'whatsapp' }, social_posts: { key: 'social' }, own_domain: { key: 'domain' },
  ios_app: { key: 'ipad' }, android_app: { key: 'android' }, capacity_slots: { key: 'capacity' }, multi_location_schedule: { key: 'schedule' },
  kds: { key: 'kds' }, pay_at_truck: { key: 'payattruck' }, payment_methods: { key: 'paymethods', text: true }, min_term: { key: 'term', text: true },
}

// ── HatchGrab's own answer ───────────────────────────────────────────────────────────────────────────────────────────
export type PriceKind = 'monthly' | 'perorder' | 'cardfee' | 'term' | 'setup' | 'trial_months'
export interface OurAnswer {
  /** The cell's machine value. */
  value: FeatureValue
  /** Admin's badge. */
  badge: 'yes' | 'no' | 'partial' | 'soon' | 'confirm'
  /** What the note says: plan names ("from Pro"), the country's app flag is off, the fixed answer's message, coming soon,
   *  or a price the comparison builder writes. */
  note: { kind: 'plans'; plans: string[] } | { kind: 'flagOff'; app: 'ios' | 'android' } | { kind: 'message' } | { kind: 'soon' } | { kind: 'price'; price: PriceKind } | null
}
export interface OurContext {
  catalog: PlanCatalog; appFlags: { ios: boolean; android: boolean }
  /** What the country lets a truck add at checkout (countryCharges); absent = not known, the answer is "to confirm". */
  charges?: { tips: boolean; serviceFee: boolean }
}
/** Tips and a customer service fee, as a truck in this country can switch them on: the Charges card shows only where prices
 *  exclude tax, or include a named tax its receipts show (components/manage/ChargesCard.tsx), and a service fee needs the
 *  country to allow one (lib/order-charge-rules.ts). */
export function countryCharges(s: { pricesIncludeTax: boolean; addressFormat: unknown; serviceFeeAllowed: boolean }): { tips: boolean; serviceFee: boolean } {
  const card = !s.pricesIncludeTax || !!includedTaxOf(s.addressFormat)
  return { tips: card, serviceFee: card && s.serviceFeeAllowed }
}

const parts = (src: string) => src.split(';').map(s => s.trim()).filter(Boolean)
/** Is the source in the grammar above? (The importer and the Add feature form check it.) */
export function sourceProblem(src: string): string | null {
  for (const p of parts(src)) {
    if (p === 'builtin' || p === 'soon' || p === 'confirm' || p === 'flag:ios' || p === 'flag:android' || p === 'country:tips' || p === 'country:service_fee') continue
    if (/^fixed:(yes|no|partial)(:note)?$/.test(p)) continue
    if (/^price:(monthly|perorder|cardfee|term|setup|trial_months)$/.test(p)) continue
    if (/^plan:[a-z_]+(\+[a-z_]+)*$/.test(p)) continue
    return `"${p}" is not a HatchGrab source (plan:<switch>, builtin, flag:ios|android, price:<kind>, fixed:<yes|no|partial>[:note], country:tips|service_fee, soon, confirm).`
  }
  return parts(src).length ? null : 'The HatchGrab source is empty.'
}

/** HatchGrab's answer for one feature in one country, from its source. */
export function ourAnswer(f: Pick<ComparisonFeature, 'hatchgrabSource'>, ctx: OurContext): OurAnswer {
  const ps = parts(f.hatchgrabSource)
  if (ps.includes('confirm') || !ps.length) return { value: 'unknown', badge: 'confirm', note: null }
  if (ps.includes('soon')) return { value: 'no', badge: 'soon', note: { kind: 'soon' } }
  const fixed = ps.find(p => p.startsWith('fixed:'))
  if (fixed) {
    const [, v, withNote] = fixed.split(':') as [string, FeatureValue, string | undefined]
    return { value: v, badge: v === 'yes' ? 'yes' : v === 'no' ? 'no' : 'partial', note: withNote ? { kind: 'message' } : null }
  }
  const country = ps.find(p => p.startsWith('country:'))
  if (country) {
    if (!ctx.charges) return { value: 'unknown', badge: 'confirm', note: null }
    const on = country === 'country:tips' ? ctx.charges.tips : ctx.charges.serviceFee
    return { value: on ? 'yes' : 'no', badge: on ? 'yes' : 'no', note: null }
  }
  const price = ps.find(p => p.startsWith('price:'))
  if (price) return { value: 'yes', badge: 'yes', note: { kind: 'price', price: price.slice(6) as PriceKind } }
  // Plan switches (and "builtin": every plan).
  const plan = ps.find(p => p.startsWith('plan:'))
  const switches = plan ? (plan.slice(5).split('+') as Feature[]) : []
  const pub = publicPlans(ctx.catalog)
  const has = pub.filter(p => switches.every(s => planAllowsFeature(ctx.catalog, p.key, s)))
  const app = ps.includes('flag:ios') ? 'ios' : ps.includes('flag:android') ? 'android' : null
  if (!has.length && pub.length) return { value: 'no', badge: 'no', note: null }
  if (app && !(app === 'ios' ? ctx.appFlags.ios : ctx.appFlags.android)) return { value: 'no', badge: 'no', note: { kind: 'flagOff', app } }
  if (pub.length && has.length < pub.length) return { value: 'yes', badge: 'yes', note: { kind: 'plans', plans: [has[0].name] } }
  return { value: 'yes', badge: 'yes', note: null }
}

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A feature's label / explanation in a locale: an Admin-added feature's own words (the locale, else en-GB); a seeded
 *  feature's message (comparison.features.<key>.label / .explain) through `t`. */
export function featureWords(f: Pick<ComparisonFeature, 'key' | 'labels' | 'explanations'>, locale: string, t: (key: string) => string): { label: string; explain: string } {
  const own = (m: Record<string, string>) => m[locale] ?? m['en-GB'] ?? null
  if (Object.keys(f.labels).length) return { label: own(f.labels) ?? f.key, explain: own(f.explanations) ?? '' }
  return { label: t(`features.${f.key}.label`), explain: t(`features.${f.key}.explain`) }
}

// ── compare-suits-1 (6 November 2026; docs/compare-suits-1-report.md): the pages a check read, and what a cell may say ─────────
/** The kind of page a check read, as the model reported it — kept only when that page really fetched in the conversation. */
export const PAGE_KINDS = ['features', 'pricing', 'help', 'other'] as const
export type PageKind = (typeof PAGE_KINDS)[number]
/** Whether the check read the competitor's help centre: read it, saw one linked but did not read it, or saw none. */
export const HELP_CENTRE = ['fetched', 'linked_not_fetched', 'none_found'] as const
export type HelpCentre = (typeof HELP_CENTRE)[number]
/** One page a check asked for. `ok`: it fetched (the API returned the page). `status`: 'fetched', or the API's error code
 *  ("url_not_accessible" …) — the web fetch tool reports no HTTP status code, so none is stored. */
export interface PageChecked { url: string; kind: PageKind; ok: boolean; status: string; fetchedAt: string | null }
/** competitor_feature_checks.pages_checked (20261075): the pages of the check that last asked about the feature. */
export interface PagesChecked { pages: PageChecked[]; helpCentre: HelpCentre | null; checkedAt: string }
export interface FeatureCheckRow { competitorId: string; featureKey: string; countryCode: string | null; checkedOn: string | null; pages: PagesChecked | null }

const PAGE_KIND_SET: readonly string[] = PAGE_KINDS
const HELP_SET: readonly string[] = HELP_CENTRE
/** A pages_checked value, read tolerantly: anything unreadable is null (never "complete"). */
export function pagesCheckedOut(v: unknown): PagesChecked | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Row
  if (!Array.isArray(o.pages)) return null
  const pages: PageChecked[] = []
  for (const x of o.pages as unknown[]) {
    if (!x || typeof x !== 'object') continue
    const p = x as Row
    if (typeof p.url !== 'string' || !PAGE_KIND_SET.includes(String(p.kind))) continue
    pages.push({ url: p.url, kind: p.kind as PageKind, ok: p.ok === true, status: typeof p.status === 'string' ? p.status : (p.ok === true ? 'fetched' : 'not_fetched'),
      fetchedAt: typeof p.fetchedAt === 'string' ? p.fetchedAt : null })
  }
  return { pages, helpCentre: HELP_SET.includes(String(o.helpCentre)) ? o.helpCentre as HelpCentre : null, checkedAt: typeof o.checkedAt === 'string' ? o.checkedAt : '' }
}
export function featureCheckOut(r: Row): FeatureCheckRow {
  const cc = str(r.country_code)
  return { competitorId: String(r.competitor_id), featureKey: String(r.feature_key), countryCode: cc ? cc : null,
    checkedOn: str(r.checked_on) ? String(r.checked_on).slice(0, 10) : null, pages: pagesCheckedOut(r.pages_checked) }
}
/** The check that last asked about a feature in a country: the NEWER of that country's own record and the every-country one
 *  (compare-autopublish-1, 7 November 2026 — a routine check covers every country at once, and it must count when it is the later
 *  look). By checked_on; a tie goes to the country's own record. Only one of them → that one. */
export function featureCheckOf(checks: readonly FeatureCheckRow[], competitorId: string, key: string, code: string | null): FeatureCheckRow | null {
  const mine = checks.filter(c => c.competitorId === competitorId && c.featureKey === key)
  const own = code ? mine.find(c => c.countryCode === code) ?? null : null
  const every = mine.find(c => c.countryCode === null) ?? null
  if (own && every) return (every.checkedOn ?? '') > (own.checkedOn ?? '') ? every : own
  return own ?? every
}
/** 🔴 THE PAGES "NOT LISTED" NEEDS: the features page AND the pricing page fetched in that check (compare-autopublish-1, addendum C,
 *  7 November 2026 — the help centre is no longer required; help reads stay off). A failed fetch or a page not asked for: not complete. */
export function pagesComplete(p: PagesChecked | null | undefined): boolean {
  if (!p) return false
  const got = (k: PageKind) => p.pages.some(x => x.kind === k && x.ok)
  return got('features') && got('pricing')
}

// ── compare-autopublish-1 (7 November 2026; docs/compare-autopublish-1-report.md): what an AUTOMATICALLY verified answer may say ──
/** 🔴 THE EVIDENCE RULE (§3, addendum B), for an answer no admin verified, on an auto-publish country's page:
 *   • "yes" / "partly" — only with a quote and its page;
 *   • "no" — only with the competitor's own quote saying so, and its page;
 *   • "not mentioned" — only WITHOUT a quote (one that carries a quote contradicts itself: unusable); it becomes "not listed" only under
 *     absence_means_no with complete pages (cellState);
 *   • anything else: "doesn't say" (unknown) — never a yes or a no.
 *  An answer Admin verified is shown as it is; one Admin blocked (Undo verified) is never used. Returns the value to show. */
export function evidenceValue(v: Pick<FeatureValueRow, 'value' | 'quote' | 'sourceUrl' | 'verifiedAt' | 'autoBlocked'>): FeatureValue {
  if (v.verifiedAt) return v.value
  if (v.autoBlocked) return 'unknown'
  const quoted = !!v.quote?.trim() && !!v.sourceUrl?.trim()
  switch (v.value) {
    case 'yes': case 'partial': case 'no': return quoted ? v.value : 'unknown'
    case 'not_mentioned': return v.quote?.trim() ? 'unknown' : 'not_mentioned'
    default: return 'unknown'
  }
}
/** The answer passes the evidence rule as it is (what auto_verified_at records for Admin). */
export const passesEvidence = (v: Pick<FeatureValueRow, 'value' | 'quote' | 'sourceUrl' | 'verifiedAt' | 'autoBlocked'>) =>
  !v.verifiedAt && !v.autoBlocked && v.value !== 'unknown' && evidenceValue(v) === v.value

/** What a competitor's cell may say. 'no_quoted': a "no" with its quote and page; 'no_unquoted': a "no" without them (an older
 *  answer — shown as No in the table, but never used as a known "no" in the "Which suits" answers); 'not_listed': the raw answer
 *  is not_mentioned (kept as it is), the feature is absence_means_no and that check read every page it needs. */
export type CellState = 'yes' | 'partial' | 'no_quoted' | 'no_unquoted' | 'not_listed' | 'not_mentioned' | 'unknown'
export const isQuotedNo = (v: Pick<FeatureValueRow, 'value' | 'quote' | 'sourceUrl'>) => v.value === 'no' && !!v.quote?.trim() && !!v.sourceUrl?.trim()
/** A competitor's answer, as a state. `pending`: a newer check proposed a different answer that is not reviewed yet — never "not listed". */
export function cellState(v: FeatureValueRow | null, f: Pick<ComparisonFeature, 'absenceMeansNo'>, check: FeatureCheckRow | null, pending = false): CellState {
  if (!v) return 'unknown'
  switch (v.value) {
    case 'yes': return 'yes'
    case 'partial': return 'partial'
    case 'no': return isQuotedNo(v) ? 'no_quoted' : 'no_unquoted'
    case 'not_mentioned': return f.absenceMeansNo === true && !pending && pagesComplete(check?.pages) ? 'not_listed' : 'not_mentioned'
    default: return 'unknown'
  }
}
