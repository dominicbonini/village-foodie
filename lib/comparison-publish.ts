// lib/comparison-publish.ts — 🔴 COMPARISON PAGES PUBLISH THEMSELVES FROM EVIDENCE-BACKED DATA (compare-autopublish-1, 7 November 2026;
// docs/compare-autopublish-1-report.md). PURE: no database, no clock (the caller passes `today` and `now`). The checker's post-run hook
// (lib/comparison-publish-run.ts), the one-off evaluation (scripts/compare-autopublish-1-oneoff.cjs) and scripts/compare-autopublish-1.cjs
// run these same functions.
//
// It applies only where a country's auto-publish switch is on (public.comparison_publish, 20261078). The UAE is never auto-published.
//
// 1 · FINDINGS, decided automatically (addendum A, B) — `decideFindings`. Per item (a competitor's feature in a country, a plan's field,
//     its classification, a country's availability, a page) only the NEWEST pending finding is decided; older ones are rejected as
//     replaced. Accept ONLY when it passes the evidence rules; otherwise reject, with the reason. A price change of more than 50% is
//     HELD (left pending, listed in the weekly summary). Nothing ever needs Admin's click.
//       • a price / plan: both checks agree (the second check 'confirmed', the quote on the page), the currency is the country's, the
//         amount is a real one (not a placeholder);
//       • a feature "yes" / "partly": a quote found on its page and the page's URL; never against a disagreeing second check;
//       • a feature "no": the competitor's own quote saying so, found on its page AND confirmed by the second check — the existing
//         verifier is what judges the quote against the answer (addendum B);
//       • "not mentioned": only WITHOUT a quote — one that carries a quote contradicts itself and is rejected (addendum B); and it never
//         replaces an answer that has evidence;
//       • a classification: applied, unless Admin set the competitor's category (category_by 'admin'); its quote must be on its page;
//       • "not sold in X": only when both checks agree (it removes the competitor from X's page); "sold in X": its quote on its page;
//       • a new page: added to check_urls (never when Admin set them by hand); a page gone: left for Admin (a page leaves the list by hand).
//     ADMIN'S CHOICES WIN: a finding about a plan or an answer Admin verified, or one Admin un-verified, is rejected — the row is kept.
// 2 · A COUNTRY, evaluated (§3, §4) — `evaluateCountry`. A competitor is PUBLISHABLE when it is counted, has a website (addendum E), has
//     not failed its last two checks, and its plan is publishable: Admin verified it, or (not blocked by Admin) it is current and
//     counted, in the country's currency, with a real price, a source on its own site, a price both checks confirmed at this value, and
//     checked within its interval + 30 days. A held price change keeps the plan while it is within its interval, hidden after. The
//     page's own four-cap (lib/comparison-selection.ts) then chooses who shows; the country is LIVE when ≥ 2 are shown.
// 3 · The marks it writes (the caller writes them): auto_verified_at on each publishable entry and plan, and on each answer that passes
//     the evidence rule (lib/comparison-features.ts passesEvidence) — distinct from Admin's verified_at.
import { PLAN_FIELDS, hostOf } from '@/lib/competitor-check/model'
import { planColsOf } from '@/lib/admin/competitor-check-actions'
import { isCountedCompetitor, type Competitor, type CompetitorPlan, type ComparisonEntry } from '@/lib/pricing-check'
import { selectShown, isCategory, type SelectionCandidate } from '@/lib/comparison-selection'
import { passesEvidence, type FeatureValueRow } from '@/lib/comparison-features'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A price may move by at most this share before it is held for the weekly summary. */
export const MAX_PRICE_MOVE = 0.5
/** Consecutive failed checks that take a competitor down until a good check returns. */
export const TAKE_DOWN_FAILURES = 2
/** A price older than its check interval plus this many days is taken down until it is checked again. */
export const GRACE_DAYS = 30
/** Never auto-published (the brief: AE never live). */
export const NEVER_AUTO = new Set(['AE'])

// ── 1 · findings ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type Action = 'accept' | 'reject' | 'hold'
export interface Decision { id: string; action: Action; reason: string; competitorId: string; countryCode: string | null }
export interface DecideCtx {
  competitors: ReadonlyMap<string, Row>
  /** Every plan row (current and superseded), by id. */
  plans: ReadonlyMap<string, Row>
  /** Every CURRENT answer row. */
  values: readonly Row[]
  /** The country's currency. */
  currencyOf: (code: string) => string | null
  /** Admin's explicit decisions in a brief (addendum B, F): finding id → the reason. */
  forceAccept?: ReadonlyMap<string, string>
  forceReject?: ReadonlyMap<string, string>
}
const LEGACY_FIELDS = new Set(['pre_orders', 'capacity_slots', 'multi_location_schedule', 'kds', 'pay_at_truck', 'social_posts', 'whatsapp', 'own_domain', 'ios_app', 'android_app', 'payment_methods', 'min_term'])
const isPlanField = (f: string) => (PLAN_FIELDS as readonly string[]).includes(f)

/** The item a finding is about — the newest pending finding of an item is the one decided. */
export function itemOf(f: Row): string {
  const cid = String(f.competitor_id), field = String(f.field), found = (f.found ?? {}) as Row, cc = str(f.country_code) ?? ''
  if (field === 'feature') return `feature|${cid}|${String(found.feature_key ?? '')}|${cc}`
  if (isPlanField(field)) return `plan|${cid}|${field}|${cc}|${(str(found.plan_name) ?? String(f.plan_id ?? '')).toLowerCase()}`
  if (field === 'classification') return `class|${cid}`
  if (field === 'availability') return `avail|${cid}|${cc}`
  if (field === 'url') return `url|${cid}|${String(found.url ?? f.source_url ?? '')}`
  return `other|${cid}|${field}|${cc}`
}

/** The answer a feature finding gives (as acceptFinding stores it). */
export function answerOf(f: Row): string | null {
  const found = (f.found ?? {}) as Row
  if (f.outcome === 'not_stated') return found.feature === 'not_mentioned' ? 'not_mentioned' : 'unknown'
  if (found.feature === 'not_stated') return 'unknown'
  return ['yes', 'no', 'partial', 'unknown', 'not_mentioned'].find(v => v === found.feature) ?? null
}

/** The monthly price (minor units, or null = price hidden) a plan finding gives; undefined when it gives none. */
function foundMonthly(f: Row, currency: string): { minor: number | null; currency: string } | undefined {
  const found = (f.found ?? {}) as Row
  const c = planColsOf('monthly_price', found, currency)
  if (!c.ok) return undefined
  return { minor: (c.cols.monthly_minor as number | null) ?? null, currency: String(c.cols.currency ?? currency) }
}
const isPlaceholderAmount = (found: Row) => found.amount !== null && found.amount !== undefined && !(typeof found.amount === 'number' && Number.isFinite(found.amount) && found.amount >= 0)

/** ONE pending finding, the newest of its item: accept, reject or hold, with the reason. */
export function decideOne(f: Row, ctx: DecideCtx): { action: Action; reason: string } {
  const id = String(f.id), field = String(f.field), outcome = String(f.outcome), found = (f.found ?? {}) as Row
  const forcedA = ctx.forceAccept?.get(id); if (forcedA) return { action: 'accept', reason: forcedA }
  const forcedR = ctx.forceReject?.get(id); if (forcedR) return { action: 'reject', reason: forcedR }
  const comp = ctx.competitors.get(String(f.competitor_id))
  if (!comp) return { action: 'reject', reason: 'the competitor is gone' }
  const qip = f.quote_in_page === true, second = String(f.second_check ?? 'not_run'), quote = str(f.quote), url = str(f.source_url)
  const agree = second === 'confirmed' && qip

  if (outcome === 'blocked') return { action: 'accept', reason: 'the page could not be read — acknowledged, nothing saved' }

  // ── pages ──
  if (field === 'url' || outcome === 'new_url' || outcome === 'page_gone') {
    if (outcome === 'page_gone') return { action: 'reject', reason: 'a page leaves the check list only by hand' }
    if (outcome === 'unchanged') return { action: 'accept', reason: 'the page is still there' }
    if (comp.check_urls_by === 'admin') return { action: 'reject', reason: 'the check pages are set by hand in Admin' }
    return qip || second === 'confirmed' ? { action: 'accept', reason: 'a page on its own site, added to the check pages' } : { action: 'reject', reason: 'the page was not confirmed' }
  }

  // ── classification (addendum A) ──
  if (outcome === 'classification') {
    if (comp.category_by === 'admin') return { action: 'reject', reason: 'Admin set this competitor’s category' }
    if (second === 'disagreed') return { action: 'reject', reason: 'the second check disagreed' }
    return qip ? { action: 'accept', reason: `classified ${String(found.classification ?? '')}, quoted from its own site` } : { action: 'reject', reason: 'its quote was not on the page' }
  }

  // ── availability ──
  if (outcome === 'in_country') return qip && second !== 'disagreed' ? { action: 'accept', reason: 'sold in this country, quoted from its own site' } : { action: 'reject', reason: 'its quote was not on the page' }
  if (outcome === 'not_in_country') return agree ? { action: 'accept', reason: 'not sold in this country — both checks agree' } : { action: 'reject', reason: 'both checks must agree before a competitor leaves a country' }

  // ── a plan ──
  if (isPlanField(field) || outcome === 'new_plan' || outcome === 'plan_gone') {
    if (outcome === 'not_stated') return { action: 'accept', reason: 'not stated on its site — acknowledged, nothing saved' }
    const plan = f.plan_id ? ctx.plans.get(String(f.plan_id)) ?? null : null
    if (plan && (plan.verified_by || plan.auto_blocked === true)) return { action: 'reject', reason: 'Admin’s own verification of this plan is kept' }
    if (outcome === 'unchanged') return qip || second === 'confirmed' ? { action: 'accept', reason: 'unchanged — its date moves on' } : { action: 'reject', reason: 'could not confirm it is unchanged' }
    if (!agree) return { action: 'reject', reason: 'the two checks did not agree on it (or its quote was not on the page)' }
    if (outcome === 'plan_gone') return plan ? { action: 'accept', reason: 'the plan is gone — both checks agree' } : { action: 'reject', reason: 'no stored plan' }
    const code = str(f.country_code) ?? str(plan?.country_code)
    const want = code ? ctx.currencyOf(code) : null
    const cur = str(found.currency) ?? str(plan?.currency)
    if (want && cur && cur !== want) return { action: 'reject', reason: `the price is in ${cur}, not ${want}` }
    if (isPlaceholderAmount(found)) return { action: 'reject', reason: 'the amount is not a real price' }
    if (outcome === 'new_plan') return code && str(found.plan_name) ? { action: 'accept', reason: 'a new plan — both checks agree' } : { action: 'reject', reason: 'a new plan needs its country and name' }
    if (!plan) return { action: 'reject', reason: 'no stored plan' }
    if (plan.superseded_at) return { action: 'reject', reason: 'the plan has changed since' }
    if (field === 'monthly_price') {
      const now = foundMonthly(f, String(plan.currency))
      const was = typeof plan.monthly_minor === 'number' ? plan.monthly_minor : null
      if (now && now.minor !== null && was !== null && was > 0) {
        const move = Math.abs(now.minor - was) / was
        if (move > MAX_PRICE_MOVE) return { action: 'hold', reason: `held: the price moved by ${Math.round(move * 100)}% (${was / 100} → ${now.minor / 100} ${now.currency}) — more than 50%` }
      }
    }
    return { action: 'accept', reason: 'both checks agree, on its own site' }
  }

  // ── a feature ──
  if (field === 'feature') {
    const key = String(found.feature_key ?? ''), code = str(f.country_code)
    const current = ctx.values.find(v => v.competitor_id === f.competitor_id && v.feature_key === key && (str(v.country_code) ?? null) === code) ?? null
    if (current && (current.verified_by || current.auto_blocked === true)) return { action: 'reject', reason: 'Admin’s own verification of this answer is kept' }
    if (outcome === 'unchanged') return { action: 'accept', reason: 'unchanged — its date moves on' }
    if (outcome !== 'changed' && outcome !== 'not_stated') return { action: 'reject', reason: 'nothing to save' }
    const a = answerOf(f)
    const hasEvidence = !!current && ['yes', 'no', 'partial'].includes(String(current.value)) && !!str(current.quote) && !!str(current.source_url)
    switch (a) {
      case 'yes': case 'partial':
        if (second === 'disagreed') return { action: 'reject', reason: 'the second check disagreed' }
        return quote && url && qip ? { action: 'accept', reason: `"${a}", quoted from its own site` } : { action: 'reject', reason: `a "${a}" needs a quote found on its page` }
      case 'no':
        return quote && url && agree ? { action: 'accept', reason: '"no", in its own words — confirmed by the second check' }
          : { action: 'reject', reason: 'a "no" needs the competitor’s own words, confirmed by the second check' }
      case 'not_mentioned':
        if (quote) return { action: 'reject', reason: 'says "not mentioned" but carries a quote — it contradicts itself' }
        return hasEvidence ? { action: 'reject', reason: 'an answer with evidence is not replaced by "not mentioned"' } : { action: 'accept', reason: '"not mentioned" on the pages it read' }
      case 'unknown':
        return current ? { action: 'reject', reason: 'a stored answer is not replaced by "not stated"' } : { action: 'accept', reason: 'not stated' }
      default: return { action: 'reject', reason: 'no answer to save' }
    }
  }
  if (LEGACY_FIELDS.has(field)) return { action: 'reject', reason: 'an older-format finding — the next check asks again' }
  return { action: 'reject', reason: 'nothing to save' }
}

/** Every pending finding in scope, decided: the newest of each item by its own rules, the older ones rejected as replaced. */
export function decideFindings(pending: readonly Row[], ctx: DecideCtx): Decision[] {
  const byItem = new Map<string, Row[]>()
  for (const f of pending) { const k = itemOf(f); byItem.set(k, [...(byItem.get(k) ?? []), f]) }
  const out: Decision[] = []
  for (const list of byItem.values()) {
    list.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || String(b.id).localeCompare(String(a.id)))
    const [newest, ...older] = list
    const forced = (f: Row) => ctx.forceAccept?.has(String(f.id)) || ctx.forceReject?.has(String(f.id))
    const one = (f: Row, d: { action: Action; reason: string }) => out.push({ id: String(f.id), ...d, competitorId: String(f.competitor_id), countryCode: str(f.country_code) })
    one(newest, decideOne(newest, ctx))
    for (const f of older) one(f, forced(f) ? decideOne(f, ctx) : { action: 'reject', reason: `replaced by a newer check (${String(newest.created_at ?? '').slice(0, 10)})` })
  }
  return out
}

// ── 2 · a country ────────────────────────────────────────────────────────────────────────────────────────────────────
export interface CountryInput {
  code: string
  currency: string
  /** The country has a comparison page (its language has one: lib/comparison-server.ts comparisonPath). */
  hasPage: boolean
  autoPublish: boolean
  adminOff: boolean
  today: string
  competitors: readonly Competitor[]
  /** Current plans (any country — filtered here). */
  plans: readonly CompetitorPlan[]
  entries: readonly ComparisonEntry[]
  values: readonly FeatureValueRow[]
  /** monthly_price findings both checks confirmed (any review status but rejected): competitor_id, country_code, plan_id, found. */
  priceEvidence: readonly Row[]
  /** Pending findings HELD (their plan id). */
  heldPlanIds: ReadonlySet<string>
}
export interface CompetitorVerdict { competitorId: string; name: string; entryId: string; publishable: boolean; reason: string; planId: string | null; planPublishable: boolean; manual: boolean }
export interface CountryVerdict {
  code: string; live: boolean; reason: string
  shown: { competitorId: string; name: string }[]
  competitors: CompetitorVerdict[]
}

const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** The plan an entry shows (lib/comparison.ts entryPlan, repeated so this file needs no page code). */
function planOf(e: ComparisonEntry, plans: readonly CompetitorPlan[]): CompetitorPlan | null {
  const own = e.primaryPlanId ? plans.find(p => p.id === e.primaryPlanId) ?? null : null
  if (own && own.supersededAt === null) return own
  const current = plans.filter(p => p.competitorId === e.competitorId && p.countryCode === e.countryCode && p.supersededAt === null)
  return (own && current.find(p => p.planName === own.planName)) ?? current[0] ?? null
}
/** The source is on the competitor's own site (its website's or a check page's domain). */
export function ownSource(url: string | null, c: Pick<Competitor, 'website' | 'checkUrls'>): boolean {
  const h = hostOf(url)
  if (!h) return false
  const domains = [c.website, ...(c.checkUrls ?? [])].map(u => hostOf(u)).filter((d): d is string => !!d)
  return domains.some(d => h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`))
}
/** Both checks confirmed the plan's CURRENT monthly price (or that it is hidden). */
export function priceConfirmed(p: CompetitorPlan, evidence: readonly Row[]): boolean {
  return evidence.some(f => {
    if (f.competitor_id !== p.competitorId || (str(f.country_code) ?? p.countryCode) !== p.countryCode) return false
    const found = (f.found ?? {}) as Row
    const sameName = f.plan_id === p.id || (str(found.plan_name) ?? '').toLowerCase() === p.planName.toLowerCase()
    if (!sameName) return false
    const m = foundMonthly(f, p.currency)
    if (!m) return false
    if (m.minor === null) return p.priceHidden
    return !p.priceHidden && m.currency === p.currency && m.minor === p.monthlyMinor
  })
}

/** Whether a plan may be published automatically, and why not. */
export function planVerdict(p: CompetitorPlan | null, c: Competitor, x: Pick<CountryInput, 'currency' | 'today' | 'priceEvidence' | 'heldPlanIds'>): { ok: boolean; manual: boolean; reason: string } {
  if (!p) return { ok: false, manual: false, reason: 'no current plan' }
  if (p.verifiedAt) return { ok: true, manual: true, reason: 'Admin verified the plan' }
  if (p.autoBlocked) return { ok: false, manual: false, reason: 'Admin took back the plan’s verification' }
  if (p.status !== 'counted') return { ok: false, manual: false, reason: `the plan is ${p.status}` }
  if (p.priceHidden || p.monthlyMinor === null) return { ok: false, manual: false, reason: 'no price stated' }
  if (p.unclear) return { ok: false, manual: false, reason: 'the price is marked unclear' }
  if (p.currency !== x.currency) return { ok: false, manual: false, reason: `the price is in ${p.currency}, not ${x.currency}` }
  if (!ownSource(p.sourceUrl, c)) return { ok: false, manual: false, reason: 'no source on its own site' }
  const interval = c.checkIntervalDays || 90
  if (addDays(p.checkedOn, interval + GRACE_DAYS) < x.today) return { ok: false, manual: false, reason: `taken down: the price was last checked ${p.checkedOn}, more than its interval + ${GRACE_DAYS} days ago` }
  if (x.heldPlanIds.has(p.id) && addDays(p.checkedOn, interval) < x.today) return { ok: false, manual: false, reason: 'a price change is held, and the old price is past its check interval' }
  if (!priceConfirmed(p, x.priceEvidence)) return { ok: false, manual: false, reason: 'the price has not been confirmed by both checks' }
  return { ok: true, manual: false, reason: x.heldPlanIds.has(p.id) ? 'the old price stays while a change is held' : 'its price is confirmed by both checks, on its own site' }
}

/** 🔴 ONE COUNTRY: who is publishable, who the four-cap shows, and whether the page is live. */
export function evaluateCountry(x: CountryInput): CountryVerdict {
  const comps = new Map(x.competitors.map(c => [c.id, c]))
  const verdicts: CompetitorVerdict[] = []
  const cands: SelectionCandidate<CompetitorVerdict>[] = []
  const entries = x.entries.filter(e => e.countryCode === x.code)
  for (const e of entries) {
    const c = comps.get(e.competitorId)
    if (!c) continue
    const plan = planOf(e, x.plans)
    const pv = planVerdict(plan, c, x)
    const manualEntry = !!e.verifiedAt
    const v: CompetitorVerdict = { competitorId: c.id, name: c.name, entryId: e.id, publishable: false, reason: '', planId: plan?.id ?? null, planPublishable: pv.ok, manual: manualEntry && pv.manual }
    if (!isCountedCompetitor(c)) v.reason = `not counted (${c.lifecycle}${c.addedAsCandidate ? ', a candidate' : ''})`
    else if (!c.website?.trim()) v.reason = 'no website (never shown)'
    else if (e.autoBlocked && !manualEntry) v.reason = 'Admin took back the entry’s verification'
    else if ((c.checkFailures ?? 0) >= TAKE_DOWN_FAILURES && !v.manual) v.reason = `taken down: its last ${c.checkFailures} checks failed`
    else if (!pv.ok) v.reason = pv.reason
    else { v.publishable = true; v.reason = pv.reason }
    verdicts.push(v)
    if (!v.publishable) continue
    const verifiedFeatures = x.values.filter(r => r.competitorId === c.id && r.supersededAt === null && (r.countryCode === null || r.countryCode === x.code) && (r.verifiedAt || passesEvidence(r))).length
    cands.push({ entry: v, name: c.name, pinned: e.pinned === true, hidden: e.hidden === true, sortOrder: e.sortOrder,
      category: isCategory(c.category) ? c.category : null, pricingVerified: true, verifiedFeatures })
  }
  const sel = selectShown(cands)
  const shown = sel.shown.map(s => ({ competitorId: s.entry.competitorId, name: s.entry.name }))
  for (const n of sel.notShown) n.candidate.entry.reason = n.reason === 'hidden' ? 'hidden by Admin' : `${n.candidate.entry.reason}; beyond the four shown`
  const live = !NEVER_AUTO.has(x.code) && x.hasPage && x.autoPublish && !x.adminOff && shown.length >= 2
  const reason = NEVER_AUTO.has(x.code) ? 'never auto-published'
    : !x.hasPage ? 'its language has no comparison page yet'
    : !x.autoPublish ? 'auto-publish is off'
    : x.adminOff ? 'Admin set the country off'
    : shown.length >= 2 ? `${shown.length} competitors shown` : `only ${shown.length} competitor${shown.length === 1 ? '' : 's'} publishable (2 needed)`
  return { code: x.code, live, reason, shown, competitors: verdicts }
}

// ── 3 · the summary email ────────────────────────────────────────────────────────────────────────────────────────────
export interface PublishEvent { at: string; country_code: string | null; competitor_id: string | null; kind: string; detail: string }
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const KIND_TITLE: Record<string, string> = {
  country_live: 'Countries that went live', country_not_live: 'Countries that went off', published: 'Competitors newly published', changed: 'Competitors changed',
  held: 'Held back', taken_down: 'Taken down', finding_accepted: 'Findings accepted automatically', finding_rejected: 'Findings rejected automatically', check_urls_saved: 'Check pages saved',
}
/** The weekly summary to Dominic (the internal admin email path — never an outreach template). Null when nothing changed. */
export function weeklySummary(events: readonly PublishEvent[], live: readonly string[], names: ReadonlyMap<string, string>, adminUrl: string): { subject: string; html: string; text: string } | null {
  if (!events.length) return null
  const order = ['country_live', 'country_not_live', 'published', 'changed', 'held', 'taken_down', 'finding_accepted', 'finding_rejected', 'check_urls_saved']
  const line = (e: PublishEvent) => [e.country_code, e.competitor_id ? names.get(e.competitor_id) ?? e.competitor_id : null].filter(Boolean).join(' · ') + `: ${e.detail}`
  const text: string[] = [`Comparison pages, the last 7 days.`, '', `Live now: ${live.length ? live.join(', ') : 'none'}`]
  const html: string[] = [`<p>Comparison pages, the last 7 days.</p><p><b>Live now:</b> ${esc(live.length ? live.join(', ') : 'none')}</p>`]
  for (const k of order) {
    const list = events.filter(e => e.kind === k)
    if (!list.length) continue
    // Findings: counted by reason (they can run to hundreds), each reason once.
    const rows = k.startsWith('finding_')
      ? [...list.reduce((m, e) => m.set(e.detail, (m.get(e.detail) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${n} × ${d}`)
      : list.map(line)
    text.push('', `${KIND_TITLE[k]} (${list.length})`, ...rows.map(r => `- ${r}`))
    html.push(`<h3>${esc(KIND_TITLE[k])} (${list.length})</h3><ul>${rows.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`)
  }
  text.push('', `Admin: ${adminUrl}`)
  html.push(`<p><a href="${esc(adminUrl)}">Admin › Pricing check</a></p>`)
  const n = events.filter(e => !e.kind.startsWith('finding_')).length
  return { subject: `Comparison pages: ${live.length} live, ${n} change${n === 1 ? '' : 's'} this week`, html: html.join(''), text: text.join('\n') }
}
