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
//   public.competitor_feature_values  value yes / no / partial / unknown, the note as advertised, quote, source, checked
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
export const FEATURE_VALUES = ['yes', 'no', 'partial', 'unknown'] as const
export type FeatureValue = (typeof FEATURE_VALUES)[number]
export const SHOW_SCOPES = ['all', 'some', 'hidden'] as const
export type ShowScope = (typeof SHOW_SCOPES)[number]
export const FEATURE_KEY = /^[a-z][a-z0-9_]{1,30}$/

export interface ComparisonFeature {
  key: string; groupKey: FeatureGroup; sortOrder: number; checked: boolean; showScope: ShowScope; showCountries: string[]
  hatchgrabSource: string
  /** Only for a feature added in Admin: its words per locale ({"en-GB": …, "de-DE": …}). Empty for a seeded one. */
  labels: Record<string, string>; explanations: Record<string, string>
  updatedAt: string | null
}
export interface FeatureValueRow {
  id: string; competitorId: string; featureKey: string; countryCode: string | null; value: FeatureValue
  note: string | null; quote: string | null; sourceUrl: string | null; checkedOn: string | null
  verifiedAt: string | null; verifiedBy: string | null; supersededAt: string | null; createdAt: string | null
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
    updatedAt: str(r.updated_at),
  }
}
export function valueOut(r: Row): FeatureValueRow {
  return {
    id: String(r.id), competitorId: String(r.competitor_id), featureKey: String(r.feature_key), countryCode: str(r.country_code),
    value: (FEATURE_VALUES as readonly string[]).includes(String(r.value)) ? r.value as FeatureValue : 'unknown',
    note: str(r.note), quote: str(r.quote), sourceUrl: str(r.source_url), checkedOn: str(r.checked_on) ? String(r.checked_on).slice(0, 10) : null,
    verifiedAt: str(r.verified_at), verifiedBy: str(r.verified_by), supersededAt: str(r.superseded_at), createdAt: str(r.created_at),
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
