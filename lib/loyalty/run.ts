// lib/loyalty/run.ts — loyalty-1 (5 November 2026, docs/loyalty-1-report.md): THE STAMPING JOB (app/api/cron/loyalty-stamps, every
// 10 minutes) and THE BACKFILL (written, never called — whether past orders count is Dominic's decision at launch).
//
// 🔴 OFF UNLESS BOTH SWITCHES ARE ON: platform_switches.loyalty_enabled (global, false) and the truck's truck_loyalty_settings.enabled
// (false). The global switch is read FIRST and, while it is false, the job returns before reading any order.
// It ONLY READS orders and their payment rows; it writes only the loyalty tables, and only through the three atomic database functions
// (supabase migration 20261073), so it is safe to run twice or in parallel: a stamp is unique per order, and each step locks the card.
// Nothing here is called from order placement, the dashboard action route, a status change, the payment code or a customer page.
import { REVERSAL_LOOKBACK_DAYS, STAMP_LOOKBACK_DAYS, reversalOf, stampDecision, type LoyaltySettings, type StampOrder } from './model'

export interface LoyaltyTruck { settings: LoyaltySettings; active: boolean }
export type ApplyResult = { result: 'stamped' | 'duplicate' | 'wrong_truck'; cardId: string | null; stamps: number | null; rewardId: string | null }
export type ReverseResult = { result: 'reversed' | 'already_reversed' | 'no_stamp'; cardId: string | null; stamps: number | null; voidedRewardId: string | null }

export interface LoyaltyJobStore {
  globalEnabled(): Promise<boolean>
  /** Every truck whose loyalty is switched on, with its settings. */
  enabledTrucks(): Promise<LoyaltyTruck[]>
  /** The truck's collected orders with a customer email, collected at or after `sinceIso` (and before `untilIso` when given), that have
   *  no stamp yet — with their payment facts (test mode, charged, refunded). */
  unstampedCollectedOrders(truckId: string, sinceIso: string, untilIso?: string | null): Promise<StampOrder[]>
  /** The truck's stamps still standing, stamped at or after `sinceIso`, with their orders' current facts. */
  standingStamps(truckId: string, sinceIso: string): Promise<{ orderKey: string; order: Pick<StampOrder, 'status' | 'paymentStatus' | 'chargedMinor' | 'refundedMinor'> | null }[]>
  applyStamp(a: { truckId: string; customerKey: string; orderKey: string; stampedAt: string; stampsRequired: number; expiresDays: number | null; nowIso: string }): Promise<ApplyResult>
  reverseStamp(a: { orderKey: string; reason: 'cancelled' | 'refunded'; nowIso: string }): Promise<ReverseResult>
}
export type LoyaltyJobDeps = { now: () => Date; isDemo: (truckId: string) => boolean }
export type LoyaltyRunResult = { enabled: boolean; trucks: number; stamped: number; duplicates: number; rewards: number; reversed: number; voided: number; skipped: Record<string, number> }

const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

export async function runLoyaltyStamps(store: LoyaltyJobStore, deps: LoyaltyJobDeps): Promise<LoyaltyRunResult> {
  const r: LoyaltyRunResult = { enabled: false, trucks: 0, stamped: 0, duplicates: 0, rewards: 0, reversed: 0, voided: 0, skipped: {} }
  if (!(await store.globalEnabled())) return r          // ← the only read while the global switch is off
  r.enabled = true
  const now = deps.now(), nowIso = now.toISOString()
  for (const t of await store.enabledTrucks()) {
    const s = t.settings
    if (!t.active || !s.enabled || !s.enabledAt || deps.isDemo(s.truckId)) continue
    r.trucks++
    // 1 · new stamps: collected since the later of "switched on" and the lookback
    const since = new Date(Math.max(Date.parse(s.enabledAt), Date.parse(daysAgo(now, STAMP_LOOKBACK_DAYS)))).toISOString()
    await stampOrders(store, s, await store.unstampedCollectedOrders(s.truckId, since), deps, nowIso, r)
    // 2 · reversals: stamped orders since cancelled or fully refunded
    for (const st of await store.standingStamps(s.truckId, daysAgo(now, REVERSAL_LOOKBACK_DAYS))) {
      const why = st.order ? reversalOf(st.order) : null
      if (!why) continue
      const x = await store.reverseStamp({ orderKey: st.orderKey, reason: why, nowIso })
      if (x.result === 'reversed') { r.reversed++; if (x.voidedRewardId) r.voided++ }
    }
  }
  return r
}

async function stampOrders(store: LoyaltyJobStore, s: LoyaltySettings, orders: StampOrder[], deps: LoyaltyJobDeps, nowIso: string, r: { stamped: number; duplicates: number; rewards: number; skipped: Record<string, number> }) {
  for (const o of orders) {
    const d = stampDecision(o, s, deps.isDemo)
    if (!d.stamp) { r.skipped[d.reason] = (r.skipped[d.reason] ?? 0) + 1; continue }
    const x = await store.applyStamp({ truckId: s.truckId, customerKey: d.customerKey, orderKey: o.orderKey, stampedAt: d.stampedAt, stampsRequired: s.stampsRequired, expiresDays: s.rewardExpiresDays, nowIso })
    if (x.result === 'stamped') { r.stamped++; if (x.rewardId) r.rewards++ }
    else if (x.result === 'duplicate') r.duplicates++
    else r.skipped[x.result] = (r.skipped[x.result] ?? 0) + 1
  }
}

/**
 * ⛔ WRITTEN, NOT CALLED (Dominic's launch decision). Stamps a truck's PAST collected orders, under the same rules as the job — except
 * that orders collected BEFORE the truck switched loyalty on are included (that is the point of a backfill), from `fromIso` (default:
 * every order) up to the moment loyalty was switched on. Dry run by default: it reports what it would stamp and writes nothing.
 * Idempotent like the job (a stamp is unique per order), so it can be stopped and run again.
 */
export async function backfillTruckLoyalty(store: LoyaltyJobStore & { settings(truckId: string): Promise<LoyaltySettings | null> }, deps: LoyaltyJobDeps,
  truckId: string, opts: { fromIso?: string | null; dryRun?: boolean } = {}): Promise<{ wouldStamp: number; stamped: number; duplicates: number; rewards: number; skipped: Record<string, number> } | { refused: 'loyalty_off' | 'demo_truck' }> {
  const s = await store.settings(truckId)
  if (!s || !s.enabled || !s.enabledAt) return { refused: 'loyalty_off' }
  if (deps.isDemo(truckId)) return { refused: 'demo_truck' }
  const nowIso = deps.now().toISOString()
  const orders = await store.unstampedCollectedOrders(truckId, opts.fromIso ?? '1970-01-01T00:00:00.000Z', s.enabledAt)
  // The job's rule with the "after switched on" condition lifted: judged as though loyalty had been on since the dawn of time.
  const asIfAlwaysOn: LoyaltySettings = { ...s, enabledAt: '1970-01-01T00:00:00.000Z' }
  const r = { wouldStamp: 0, stamped: 0, duplicates: 0, rewards: 0, skipped: {} as Record<string, number> }
  const eligible = [...orders].sort((a, b) => String(a.collectedAt).localeCompare(String(b.collectedAt))).filter(o => {
    const d = stampDecision(o, asIfAlwaysOn, deps.isDemo)
    if (!d.stamp) r.skipped[d.reason] = (r.skipped[d.reason] ?? 0) + 1
    return d.stamp
  })
  r.wouldStamp = eligible.length
  if (opts.dryRun !== false) return r
  await stampOrders(store, asIfAlwaysOn, eligible, deps, nowIso, r)
  return r
}
