// scripts/compare-autopublish-1/memory.ts — the IN-MEMORY tables and stores the one-off (oneoff.ts) and the harness (scripts/compare-autopublish-1.cjs)
// run lib/comparison-publish-run.ts against (compare-autopublish-1, 7 November 2026). The PricingStore / CheckAdminStore / PublishStore
// methods the publishing run uses, over plain rows; BEFORE keeps the starting rows so the caller can write the difference.
import { randomUUID } from 'node:crypto'
import type { PublishStore } from '@/lib/comparison-publish-run'
import type { PricingStore } from '@/lib/admin/pricing-check-actions'
import type { CheckAdminStore } from '@/lib/admin/competitor-check-actions'

type Row = Record<string, unknown>
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

export function memory(base: Row, valuesIn: Row[], pendingIn: Row[], NOW: Date) {
  // ── the tables, in memory (and their snapshots, for the diff) ──
  const T = {
    competitors: new Map<string, Row>((base.competitors as Row[]).map(r => [String(r.id), clone(r)])),
    competitor_plans: new Map<string, Row>((base.plans as Row[]).map(r => [String(r.id), clone(r)])),
    competitor_feature_values: new Map<string, Row>(valuesIn.map(r => [String(r.id), clone(r)])),
    comparison_entries: new Map<string, Row>((base.entries as Row[]).map(r => [String(r.id), clone(r)])),
    competitor_check_findings: new Map<string, Row>(pendingIn.map(r => [String(r.id), clone(r)])),
    comparison_publish: new Map<string, Row>((base.publish as Row[]).map(r => [String(r.country_code), clone(r)])),
  }
  const BEFORE = Object.fromEntries(Object.entries(T).map(([k, m]) => [k, new Map([...m].map(([id, r]) => [id, clone(r)]))])) as typeof T
  const events: Row[] = []
  const at = () => NOW.toISOString()
  const touch = (table: keyof typeof T, id: string, cols: Row) => { const r = T[table].get(id); if (!r) return null; Object.assign(r, clone(cols)); return r }

  const pricing: PricingStore = {
    counts: async () => { throw new Error('not used') }, insertMany: async () => { throw new Error('not used') },
    listAll: async () => ({ competitors: [...T.competitors.values()].map(clone), plans: [...T.competitor_plans.values()].map(clone), benchmarks: [] }),
    getPlan: async id => clone(T.competitor_plans.get(id) ?? null),
    insertPlan: async row => { const r = { auto_verified_at: null, auto_blocked: false, verified_at: null, verified_by: null, superseded_at: null, ...clone(row), id: randomUUID(), created_at: at() }; T.competitor_plans.set(String(r.id), r); return clone(r) },
    supersedePlan: async (id, a) => { const r = T.competitor_plans.get(id); if (!r || r.superseded_at) return false; r.superseded_at = a; return true },
    deletePlan: async id => { T.competitor_plans.delete(id) },
    setPlanVerified: async () => { throw new Error('not used') },
    getCompetitor: async id => clone(T.competitors.get(id) ?? null),
    findCompetitorByName: async () => { throw new Error('not used') }, insertCompetitor: async () => { throw new Error('not used') },
    updateCompetitor: async (id, cols) => clone(touch('competitors', id, cols)),
    currentBenchmark: async () => null, supersedeBenchmark: async () => false, unsupersedeBenchmark: async () => {}, insertBenchmark: async () => { throw new Error('not used') },
    entriesReady: async () => true,
    listEntries: async () => [...T.comparison_entries.values()].map(clone),
    insertEntry: async row => { const r = { pinned: false, hidden: false, group_label: null, auto_verified_at: null, auto_blocked: false, ...clone(row), id: randomUUID(), created_at: at() }; T.comparison_entries.set(String(r.id), r); return clone(r) },
    updateEntry: async (id, cols) => clone(touch('comparison_entries', id, cols)),
    deleteEntry: async id => { T.comparison_entries.delete(id) },
    existingIds: async () => [],
    featureValues: async () => [...T.competitor_feature_values.values()].filter(r => !r.superseded_at).map(clone),
    getFeatureValue: async id => clone(T.competitor_feature_values.get(id) ?? null),
    insertFeatureValue: async row => { const r = { auto_verified_at: null, auto_blocked: false, superseded_at: null, ...clone(row), id: randomUUID(), created_at: at() }; T.competitor_feature_values.set(String(r.id), r); return clone(r) },
    supersedeFeatureValue: async (id, a) => { const r = T.competitor_feature_values.get(id); if (!r || r.superseded_at) return false; r.superseded_at = a; return true },
    unsupersedeFeatureValue: async id => { const r = T.competitor_feature_values.get(id); if (r) r.superseded_at = null },
    touchFeatureValueChecked: async (id, date) => { const r = T.competitor_feature_values.get(id); if (!r || r.superseded_at) return false; r.checked_on = date; return true },
  }
  const checks: CheckAdminStore = {
    settings: async () => null, updateSettings: async () => { throw new Error('not used') }, runs: async () => [], findings: async () => [],
    getFinding: async id => clone(T.competitor_check_findings.get(id) ?? null),
    reviewFinding: async (id, cols) => { const r = T.competitor_check_findings.get(id); if (!r || r.review_status !== 'pending') return null; Object.assign(r, cols); return clone(r) },
    competitors: async () => [...T.competitors.values()].map(clone),
    updateCompetitor: async (id, cols) => clone(touch('competitors', id, cols)),
    setAllIntervals: async () => { throw new Error('not used') },
    touchPlanChecked: async (id, date) => { const r = T.competitor_plans.get(id); if (!r || r.superseded_at) return false; r.checked_on = date; return true },
    countries: async () => (base.countries as Row[]).map(c => ({ code: String(c.code), name: String(c.code), enabled: c.enabled === true, comparisonStatus: String(c.comparisonStatus) })),
    planCountries: async () => [...T.competitor_plans.values()].filter(p => !p.superseded_at).map(p => ({ competitor_id: String(p.competitor_id), country_code: String(p.country_code) })),
  }
  const store: PublishStore = {
    countries: async () => (base.countries as Row[]).map(c => ({ code: String(c.code), currency: String(c.currency), locale: String(c.locale), enabled: c.enabled === true, comparisonStatus: String(c.comparisonStatus) })),
    publishRows: async () => [...T.comparison_publish.values()].map(clone),
    savePublish: async (code, cols) => { T.comparison_publish.set(code, { ...(T.comparison_publish.get(code) ?? { country_code: code, auto_publish: true, admin_off: false }), ...clone(cols) }) },
    pendingFindings: async () => [...T.competitor_check_findings.values()].filter(f => f.review_status === 'pending').map(clone),
    priceEvidence: async () => clone(base.evidence as Row[]),
    noteFinding: async (id, reason) => { touch('competitor_check_findings', id, { auto_reason: reason }) },
    rejectFinding: async (id, reason, a) => { const r = T.competitor_check_findings.get(id); if (r && r.review_status === 'pending') Object.assign(r, { review_status: 'rejected', reviewed_by: null, reviewed_at: a, auto_reviewed: true, auto_reason: reason }) },
    markAccepted: async (id, reason) => { touch('competitor_check_findings', id, { auto_reviewed: true, auto_reason: reason }) },
    setAutoVerified: async (table, ids, a) => { for (const id of ids) touch(table, id, { auto_verified_at: a }) },
    setCompetitor: async (id, cols) => { touch('competitors', id, cols) },
    featureChecks: async () => clone(base.checks as Row[]),
    addEvents: async (rows, a) => { for (const r of rows) events.push({ ...r, at: a }) },
  }

  return { T, BEFORE, events, pricing, checks, store }
}
