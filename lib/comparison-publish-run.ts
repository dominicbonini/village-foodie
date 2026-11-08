// lib/comparison-publish-run.ts — the AUTOMATIC PUBLISHING RUN (compare-autopublish-1, 7 November 2026; docs/compare-autopublish-1-report.md).
// Called after every checker run (scripts/competitor-check/main.ts) and by the one-off evaluation (scripts/compare-autopublish-1-oneoff.cjs,
// against an in-memory copy of a read-only export). The rules are lib/comparison-publish.ts; this file reads, applies and records.
//   1 · the pending findings of every competitor on an auto-publish country's page: decided (accept / reject / hold) and applied through
//       Admin's own Accept path (lib/admin/competitor-check-actions.ts acceptFinding) — marked auto_reviewed with the reason;
//   2 · addendum D: a features or pricing page the check could not read, but whose address it saw on the competitor's own site, is added
//       to check_urls (never when Admin set them by hand), so the next check fetches it directly;
//   3 · every switched-on country evaluated: auto_verified_at on publishable entries and plans and on answers that pass the evidence rule;
//       comparison_publish.auto_live / shown / live_since; an event for each change (the weekly summary reads them);
//   4 · the pages told (POST /api/revalidate, tag marketing-countries) — a failure is a warning, never an error.
// Admin's choices win throughout (lib/comparison-publish.ts header). AE is never auto-published.
import { acceptFinding, type CheckAdminStore } from '@/lib/admin/competitor-check-actions'
import { competitorOut, planOut, entryOut, type PricingStore } from '@/lib/admin/pricing-check-actions'
import { valueOut, passesEvidence, pagesCheckedOut, type PageKind } from '@/lib/comparison-features'
import { decideFindings, evaluateCountry, ownSource, NEVER_AUTO, type Decision, type CountryVerdict, type PublishEvent } from '@/lib/comparison-publish'

type Row = Record<string, unknown>

export interface PublishCountry { code: string; currency: string; locale: string; enabled: boolean; comparisonStatus: string }
/** The reads and writes the run needs beyond Admin's two stores. */
export interface PublishStore {
  countries(): Promise<PublishCountry[]>
  /** comparison_publish rows. */
  publishRows(): Promise<Row[]>
  savePublish(code: string, cols: Row): Promise<void>
  /** Pending findings (every column, created_at included). */
  pendingFindings(): Promise<Row[]>
  /** monthly_price findings both checks confirmed, not rejected: competitor_id, country_code, plan_id, found. */
  priceEvidence(): Promise<Row[]>
  /** The note on a held finding (it stays pending). */
  noteFinding(id: string, reason: string): Promise<void>
  /** Rejects a pending finding automatically. */
  rejectFinding(id: string, reason: string, at: string): Promise<void>
  /** Marks an accepted finding as accepted automatically, with the reason. */
  markAccepted(id: string, reason: string): Promise<void>
  setAutoVerified(table: 'comparison_entries' | 'competitor_plans' | 'competitor_feature_values', ids: string[], at: string | null): Promise<void>
  /** competitors.check_urls / check_urls_by / check_failures. */
  setCompetitor(id: string, cols: Row): Promise<void>
  /** competitor_feature_checks: competitor_id, checked_on, pages_checked (the newest per competitor is enough). */
  featureChecks(): Promise<Row[]>
  addEvents(rows: Omit<PublishEvent, 'at'>[], at: string): Promise<void>
}
export interface PublishDeps {
  pricing: PricingStore
  checks: CheckAdminStore
  store: PublishStore
  now: () => Date
  log: (line: string) => void
  /** The country's language has a comparison page (lib/comparison-server.ts comparisonPath). */
  hasPage: (code: string, locale: string) => boolean
  /** Asks the site to refresh its cached country switches; never throws. */
  revalidate?: () => Promise<boolean>
  forceAccept?: ReadonlyMap<string, string>
  forceReject?: ReadonlyMap<string, string>
  /** Skip step 1 (the evaluation only). */
  skipFindings?: boolean
}
export interface PublishReport {
  decisions: Decision[]; failedAccepts: { id: string; error: string }[]; checkUrls: { competitorId: string; urls: string[] }[]
  verdicts: CountryVerdict[]; events: number; revalidated: boolean | null
}

/** A check-admin store whose reviews are marked automatic (no admin id) — what acceptFinding writes through. */
function autoChecks(checks: CheckAdminStore): CheckAdminStore {
  return { ...checks, reviewFinding: (id, cols) => checks.reviewFinding(id, { ...cols, reviewed_by: null }) }
}
/** A pricing store that never clears Admin's features stamp (acceptFinding does when Admin accepts by hand): an automatic accept leaves
 *  Admin's verification as it is — the new answer is unverified anyway, and the evidence rule decides what it may say. */
function autoPricing(pricing: PricingStore): PricingStore {
  return { ...pricing, updateCompetitor: (id, cols) => { const { features_verified_at: _drop, ...rest } = cols; void _drop; return pricing.updateCompetitor(id, rest) } }
}

/** What a page's address says it is: its pricing page or its features page (null: neither). */
export function guessKind(url: string): 'pricing' | 'features' | null {
  let p = ''
  try { p = new URL(url).pathname.toLowerCase() } catch { return null }
  if (/(^|\/)(pricing|prices|price|plans|preise|preis|tarife?|kosten|precios|prix|tarifs|prezzi|prijzen)(\/|$|[.-])/.test(p)) return 'pricing'
  if (/(^|\/)(features?|funktionen|leistungen|product|products|produkt|fonctionnalites|funcionalidades)(\/|$|[.-])/.test(p)) return 'features'
  return null
}

export async function runPublish(d: PublishDeps): Promise<PublishReport> {
  const nowIso = d.now().toISOString(), today = nowIso.slice(0, 10)
  const stamp = { by: '', at: nowIso, today }
  const countries = (await d.store.countries()).filter(c => c.enabled)
  const pubRows = new Map((await d.store.publishRows()).map(r => [String(r.country_code), r]))
  const autoOn = (code: string) => !NEVER_AUTO.has(code) && (pubRows.get(code)?.auto_publish ?? true) !== false
  const autoCodes = new Set(countries.filter(c => autoOn(c.code)).map(c => c.code))
  const currencyOf = new Map(countries.map(c => [c.code, c.currency]))
  const events: Omit<PublishEvent, 'at'>[] = []

  // ── 1 · findings ──
  let decisions: Decision[] = []
  const failedAccepts: { id: string; error: string }[] = []
  const entries0 = (await d.pricing.listEntries()).map(entryOut)
  const scope = new Set(entries0.filter(e => autoCodes.has(e.countryCode)).map(e => e.competitorId))
  if (!d.skipFindings) {
    const all = await d.pricing.listAll()
    const pending = (await d.store.pendingFindings()).filter(f => scope.has(String(f.competitor_id)))
    const values = d.pricing.featureValues ? await d.pricing.featureValues() : []
    decisions = decideFindings(pending, {
      competitors: new Map(all.competitors.map(c => [String(c.id), c])), plans: new Map(all.plans.map(p => [String(p.id), p])), values,
      currencyOf: code => currencyOf.get(code) ?? null, forceAccept: d.forceAccept, forceReject: d.forceReject,
    })
    const byId = new Map(pending.map(f => [String(f.id), f]))
    const checks = autoChecks(d.checks), pricing = autoPricing(d.pricing)
    // Oldest first, so a later finding's write lands on top of an earlier one's (rejections first: they write nothing).
    const order = [...decisions].sort((a, b) => String(byId.get(a.id)?.created_at ?? '').localeCompare(String(byId.get(b.id)?.created_at ?? '')))
    for (const x of order) {
      const f = byId.get(x.id)!
      const what = String(f.field) === 'feature' ? `feature ${String(((f.found ?? {}) as Row).feature_key ?? '')}` : String(f.field)
      if (x.action === 'reject') { await d.store.rejectFinding(x.id, x.reason, nowIso); events.push({ country_code: x.countryCode, competitor_id: x.competitorId, kind: 'finding_rejected', detail: `${what}: ${x.reason}` }); continue }
      if (x.action === 'hold') {
        if (f.auto_reason !== x.reason) { await d.store.noteFinding(x.id, x.reason); events.push({ country_code: x.countryCode, competitor_id: x.competitorId, kind: 'held', detail: `${what}: ${x.reason}` }) }
        continue
      }
      const r = await acceptFinding(pricing, checks, x.id, stamp)
      if (r.ok) { await d.store.markAccepted(x.id, x.reason); events.push({ country_code: x.countryCode, competitor_id: x.competitorId, kind: 'finding_accepted', detail: `${what}: ${x.reason}` }) }
      else {
        const reason = `could not be saved: ${r.error}`
        failedAccepts.push({ id: x.id, error: r.error }); x.action = 'reject'; x.reason = reason
        await d.store.rejectFinding(x.id, reason, nowIso); events.push({ country_code: x.countryCode, competitor_id: x.competitorId, kind: 'finding_rejected', detail: `${what}: ${reason}` })
      }
    }
    const n = (a: string) => decisions.filter(x => x.action === a).length
    d.log(`publish: findings — ${n('accept')} accepted, ${n('reject')} rejected, ${n('hold')} held (${failedAccepts.length} could not be saved)`)
  }

  // ── 2 · addendum D: the features and pricing pages a check saw but could not read → check_urls ──
  const all = await d.pricing.listAll()
  const competitors = all.competitors.map(competitorOut)
  const checkUrls: { competitorId: string; urls: string[] }[] = []
  {
    const newest = new Map<string, Row>()
    for (const r of await d.store.featureChecks()) {
      const p = pagesCheckedOut(r.pages_checked)
      if (!p) continue
      const cid = String(r.competitor_id), was = newest.get(cid)
      if (!was || String(p.checkedAt) > String((pagesCheckedOut(was.pages_checked)?.checkedAt) ?? '')) newest.set(cid, r)
    }
    for (const c of competitors) {
      if (!scope.has(c.id) || c.checkUrlsBy === 'admin') continue
      const p = pagesCheckedOut(newest.get(c.id)?.pages_checked)
      if (!p) continue
      const add: string[] = []
      for (const kind of ['features', 'pricing'] as PageKind[]) {
        if (p.pages.some(x => x.kind === kind && x.ok)) continue
        // A refused page the model did not name keeps kind "other" — its address says what it is (/pricing, /preise, /features …).
        const seen = p.pages.find(x => !x.ok && !!x.url && ownSource(x.url, c) && (x.kind === kind || (x.kind === 'other' && guessKind(x.url) === kind)))
        if (seen && !(c.checkUrls ?? []).includes(seen.url) && !add.includes(seen.url)) add.push(seen.url)
      }
      if (!add.length) continue
      await d.store.setCompetitor(c.id, { check_urls: [...(c.checkUrls ?? []), ...add], check_urls_by: 'auto' })
      c.checkUrls = [...(c.checkUrls ?? []), ...add]
      checkUrls.push({ competitorId: c.id, urls: add })
      events.push({ country_code: null, competitor_id: c.id, kind: 'check_urls_saved', detail: `the next check reads ${add.join(', ')} directly` })
    }
  }

  // ── 3 · every switched-on country ──
  const plans = all.plans.map(planOut)
  const current = plans.filter(p => p.supersededAt === null)
  const entries = (await d.pricing.listEntries()).map(entryOut)
  const values = (d.pricing.featureValues ? await d.pricing.featureValues() : []).map(valueOut)
  const evidence = await d.store.priceEvidence()
  const held = new Set((await d.store.pendingFindings()).filter(f => typeof f.auto_reason === 'string' && f.auto_reason.startsWith('held') && f.plan_id).map(f => String(f.plan_id)))
  const verdicts: CountryVerdict[] = []
  const entryMark = new Map<string, boolean>(), planMark = new Map<string, boolean>()
  for (const c of countries) {
    const pub = pubRows.get(c.code)
    const v = evaluateCountry({ code: c.code, currency: c.currency, hasPage: d.hasPage(c.code, c.locale), autoPublish: autoCodes.has(c.code), adminOff: pub?.admin_off === true,
      today, competitors, plans: current, entries, values, priceEvidence: evidence, heldPlanIds: held })
    verdicts.push(v)
    for (const cv of v.competitors) {
      const on = autoCodes.has(c.code) && cv.publishable
      entryMark.set(cv.entryId, on)
      if (cv.planId && autoCodes.has(c.code)) planMark.set(cv.planId, (planMark.get(cv.planId) ?? false) || (cv.planPublishable && !plans.find(p => p.id === cv.planId)?.verifiedAt))
      const e = entries.find(x => x.id === cv.entryId)!
      if (on && !e.autoVerifiedAt) events.push({ country_code: c.code, competitor_id: cv.competitorId, kind: 'published', detail: cv.reason })
      if (!on && e.autoVerifiedAt) events.push({ country_code: c.code, competitor_id: cv.competitorId, kind: /held/.test(cv.reason) ? 'held' : 'taken_down', detail: cv.reason })
      const before = (Array.isArray(pub?.shown) ? pub!.shown as Row[] : []).find(s => s.competitorId === cv.competitorId)
      if (on && e.autoVerifiedAt && before && before.planId && before.planId !== cv.planId) events.push({ country_code: c.code, competitor_id: cv.competitorId, kind: 'changed', detail: 'its plan or price changed (both checks agree)' })
    }
    const wasLive = pub?.auto_live === true
    if (v.live !== wasLive) events.push({ country_code: c.code, competitor_id: null, kind: v.live ? 'country_live' : 'country_not_live', detail: v.live ? `live: ${v.shown.map(s => s.name).join(', ')}` : `not live: ${v.reason}` })
    const shown = v.shown.map(s => ({ ...s, planId: v.competitors.find(x => x.competitorId === s.competitorId)?.planId ?? null }))
    await d.store.savePublish(c.code, { auto_live: v.live, shown, evaluated_at: nowIso, live_since: v.live ? (wasLive ? pub?.live_since ?? nowIso : nowIso) : null, updated_at: nowIso })
  }
  // Entries outside an auto-publish country lose any automatic mark.
  for (const e of entries) if (!entryMark.has(e.id)) entryMark.set(e.id, false)
  const apply = async (table: 'comparison_entries' | 'competitor_plans', marks: Map<string, boolean>, had: (id: string) => boolean) => {
    const on = [...marks].filter(([id, v]) => v && !had(id)).map(([id]) => id), off = [...marks].filter(([id, v]) => !v && had(id)).map(([id]) => id)
    if (on.length) await d.store.setAutoVerified(table, on, nowIso)
    if (off.length) await d.store.setAutoVerified(table, off, null)
  }
  await apply('comparison_entries', entryMark, id => !!entries.find(e => e.id === id)?.autoVerifiedAt)
  for (const p of current) if (p.autoVerifiedAt && !planMark.has(p.id)) planMark.set(p.id, false)
  await apply('competitor_plans', planMark, id => !!plans.find(p => p.id === id)?.autoVerifiedAt)
  // The answers: every current answer of a competitor in scope — marked when it passes the evidence rule as it is.
  const valueMark = new Map<string, boolean>()
  for (const v of values) if (scope.has(v.competitorId) || v.autoVerifiedAt) valueMark.set(v.id, scope.has(v.competitorId) && passesEvidence(v))
  const vOn = [...valueMark].filter(([id, on]) => on && !values.find(v => v.id === id)?.autoVerifiedAt).map(([id]) => id)
  const vOff = [...valueMark].filter(([id, on]) => !on && !!values.find(v => v.id === id)?.autoVerifiedAt).map(([id]) => id)
  if (vOn.length) await d.store.setAutoVerified('competitor_feature_values', vOn, nowIso)
  if (vOff.length) await d.store.setAutoVerified('competitor_feature_values', vOff, null)

  if (events.length) await d.store.addEvents(events, nowIso)
  for (const v of verdicts.filter(x => autoCodes.has(x.code) && d.hasPage(x.code, countries.find(c => c.code === x.code)!.locale)))
    d.log(`publish: ${v.code} ${v.live ? 'LIVE' : 'not live'} — ${v.reason}${v.shown.length ? ` (${v.shown.map(s => s.name).join(', ')})` : ''}`)
  const changed = events.some(e => !e.kind.startsWith('finding_'))
  const revalidated = changed && d.revalidate ? await d.revalidate() : null
  return { decisions, failedAccepts, checkUrls, verdicts, events: events.length, revalidated }
}
