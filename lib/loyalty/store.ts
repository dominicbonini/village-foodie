// lib/loyalty/store.ts — loyalty-1 (5 November 2026, docs/loyalty-1-report.md): the loyalty job's and server functions' reads and
// writes against Supabase (service role). An in-memory twin stands in for it in scripts/loyalty-1.cjs.
// 🔴 READS ONLY from orders and order_payments. Writes only the loyalty tables: settings directly; stamps, reversals and redemptions
// ONLY through the three atomic database functions (migration 20261073), which lock the card's row.
// A failed read THROWS (the job then stops; its next run retries) — except the global switch, which reads as OFF when it can't be read.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoyaltySettings, Reward, StampOrder } from './model'
import type { ApplyResult, LoyaltyJobStore, LoyaltyTruck, ReverseResult } from './run'
import type { LoyaltyServiceStore, RedeemResult } from './service'

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : null)
const n = (v: unknown) => (typeof v === 'number' ? v : v === null || v === undefined || v === '' ? null : Number(v))
const PAGE = 1000, CHUNK = 200
const ORDER_COLS = 'order_key, truck_id, status, collected_at, customer_email, total, payment_status'

export const settingsOf = (r: Row): LoyaltySettings => ({
  truckId: String(r.truck_id), enabled: r.enabled === true, enabledAt: s(r.enabled_at), stampsRequired: Number(r.stamps_required ?? 8),
  rewardType: r.reward_type === 'free_item' || r.reward_type === 'amount_off' ? r.reward_type : null, rewardMenuItemId: s(r.reward_menu_item_id),
  rewardAmountMinor: n(r.reward_amount_minor), rewardLabel: s(r.reward_label), rewardExpiresDays: n(r.reward_expires_days),
})
const rowOf = (v: LoyaltySettings, updatedBy: string | null): Row => ({
  truck_id: v.truckId, enabled: v.enabled, enabled_at: v.enabledAt, stamps_required: v.stampsRequired, reward_type: v.rewardType,
  reward_menu_item_id: v.rewardMenuItemId, reward_amount_minor: v.rewardAmountMinor, reward_label: v.rewardLabel, reward_expires_days: v.rewardExpiresDays,
  updated_at: new Date().toISOString(), updated_by: updatedBy,
})
const chunks = <T>(xs: T[], size = CHUNK): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size)); return out }
const fail = (what: string, e: { message: string } | null) => { if (e) throw new Error(`[loyalty] ${what}: ${e.message}`) }

export function supabaseLoyaltyStore(db: SupabaseClient): LoyaltyJobStore & LoyaltyServiceStore {
  /** Test mode and the succeeded charged / refunded amounts, per order (order_payments — read only). */
  async function paymentFacts(keys: string[]): Promise<Map<string, { testMode: boolean; chargedMinor: number; refundedMinor: number }>> {
    const out = new Map<string, { testMode: boolean; chargedMinor: number; refundedMinor: number }>()
    for (const k of keys) out.set(k, { testMode: false, chargedMinor: 0, refundedMinor: 0 })
    for (const part of chunks(keys)) {
      const { data, error } = await db.from('order_payments').select('order_key, kind, amount_minor, state, livemode').in('order_key', part)
      fail('payments', error)
      for (const p of (data ?? []) as Row[]) {
        const f = out.get(String(p.order_key)); if (!f) continue
        if (p.livemode === false) f.testMode = true
        if (p.state !== 'succeeded') continue
        if (p.kind === 'charge') f.chargedMinor += Number(p.amount_minor) || 0
        if (p.kind === 'refund') f.refundedMinor += Number(p.amount_minor) || 0
      }
    }
    return out
  }
  async function stampedKeys(keys: string[]): Promise<Set<string>> {
    const out = new Set<string>()
    for (const part of chunks(keys)) {
      const { data, error } = await db.from('loyalty_stamps').select('order_key').in('order_key', part)
      fail('stamps', error)
      for (const r of (data ?? []) as Row[]) out.add(String(r.order_key))
    }
    return out
  }
  const rpcRow = async (fn: string, args: Row): Promise<Row> => {
    const { data, error } = await db.rpc(fn, args)
    fail(fn, error)
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error(`[loyalty] ${fn}: no answer`)
    return row as Row
  }

  return {
    async globalEnabled() {
      const { data, error } = await db.from('platform_switches').select('loyalty_enabled').limit(1).maybeSingle()
      if (error) { console.error('[loyalty] the global switch could not be read — treated as OFF:', error.message); return false }
      return (data as Row | null)?.loyalty_enabled === true
    },
    async enabledTrucks(): Promise<LoyaltyTruck[]> {
      const { data, error } = await db.from('truck_loyalty_settings').select('*').eq('enabled', true)
      fail('settings', error)
      const rows = (data ?? []) as Row[]
      if (!rows.length) return []
      const { data: trucks, error: tErr } = await db.from('trucks').select('id, active').in('id', rows.map(r => String(r.truck_id)))
      fail('trucks', tErr)
      const active = new Map(((trucks ?? []) as Row[]).map(t => [String(t.id), t.active !== false]))
      return rows.map(r => ({ settings: settingsOf(r), active: active.get(String(r.truck_id)) ?? false }))
    },
    async unstampedCollectedOrders(truckId, sinceIso, untilIso) {
      const rows: Row[] = []
      for (let from = 0; ; from += PAGE) {
        let q = db.from('orders').select(ORDER_COLS).eq('truck_id', truckId).eq('status', 'collected').gte('collected_at', sinceIso)
          .not('customer_email', 'is', null).gt('total', 0)
        if (untilIso) q = q.lt('collected_at', untilIso)
        const { data, error } = await q.order('collected_at', { ascending: true }).order('order_key', { ascending: true }).range(from, from + PAGE - 1)
        fail('orders', error)
        rows.push(...((data ?? []) as Row[]))
        if (!data || data.length < PAGE) break
      }
      const keys = rows.map(r => String(r.order_key))
      const done = await stampedKeys(keys)
      const open = rows.filter(r => !done.has(String(r.order_key)))
      const pay = await paymentFacts(open.map(r => String(r.order_key)))
      return open.map((o): StampOrder => ({
        orderKey: String(o.order_key), truckId: String(o.truck_id), status: s(o.status), collectedAt: s(o.collected_at), customerEmail: s(o.customer_email),
        total: n(o.total), paymentStatus: s(o.payment_status), ...pay.get(String(o.order_key))!,
      }))
    },
    async standingStamps(truckId, sinceIso) {
      const stamps: Row[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from('loyalty_stamps').select('order_key').eq('truck_id', truckId).is('reversed_at', null).gte('stamped_at', sinceIso)
          .order('stamped_at', { ascending: true }).order('order_key', { ascending: true }).range(from, from + PAGE - 1)
        fail('stamps', error)
        stamps.push(...((data ?? []) as Row[]))
        if (!data || data.length < PAGE) break
      }
      const keys = stamps.map(r => String(r.order_key))
      const orders = new Map<string, Row>()
      for (const part of chunks(keys)) {
        const { data, error } = await db.from('orders').select('order_key, status, payment_status').in('order_key', part)
        fail('orders', error)
        for (const o of (data ?? []) as Row[]) orders.set(String(o.order_key), o)
      }
      const pay = await paymentFacts(keys)
      return keys.map(k => {
        const o = orders.get(k)
        return { orderKey: k, order: o ? { status: s(o.status), paymentStatus: s(o.payment_status), chargedMinor: pay.get(k)!.chargedMinor, refundedMinor: pay.get(k)!.refundedMinor } : null }
      })
    },
    async applyStamp(a): Promise<ApplyResult> {
      const r = await rpcRow('loyalty_apply_stamp', { p_truck_id: a.truckId, p_customer_key: a.customerKey, p_order_key: a.orderKey, p_stamped_at: a.stampedAt,
        p_stamps_required: a.stampsRequired, p_expires_days: a.expiresDays, p_now: a.nowIso })
      return { result: r.out_result as ApplyResult['result'], cardId: s(r.out_card_id), stamps: n(r.out_stamps), rewardId: s(r.out_reward_id) }
    },
    async reverseStamp(a): Promise<ReverseResult> {
      const r = await rpcRow('loyalty_reverse_stamp', { p_order_key: a.orderKey, p_reason: a.reason, p_now: a.nowIso })
      return { result: r.out_result as ReverseResult['result'], cardId: s(r.out_card_id), stamps: n(r.out_stamps), voidedRewardId: s(r.out_voided_reward_id) }
    },
    // ── the server functions' reads ──
    async settings(truckId) {
      const { data, error } = await db.from('truck_loyalty_settings').select('*').eq('truck_id', truckId).maybeSingle()
      fail('settings', error)
      return data ? settingsOf(data as Row) : null
    },
    async saveSettings(v, updatedBy) {
      const { error } = await db.from('truck_loyalty_settings').upsert(rowOf(v, updatedBy), { onConflict: 'truck_id' })
      fail('save settings', error)
    },
    async menuItemBelongs(truckId, itemId) {
      const { data, error } = await db.from('menu_items_db').select('id').eq('id', itemId).eq('truck_id', truckId).maybeSingle()
      fail('menu item', error)
      return !!data
    },
    async card(truckId, customerKey) {
      const { data, error } = await db.from('loyalty_cards').select('id, stamps, lifetime_stamps').eq('truck_id', truckId).eq('customer_key', customerKey).maybeSingle()
      fail('card', error)
      const c = data as Row | null
      return c ? { id: String(c.id), stamps: Number(c.stamps), lifetimeStamps: Number(c.lifetime_stamps) } : null
    },
    async rewards(cardId): Promise<Reward[]> {
      const { data, error } = await db.from('loyalty_rewards').select('id, card_id, earned_at, expires_at, redeemed_at, voided_at').eq('card_id', cardId)
      fail('rewards', error)
      return ((data ?? []) as Row[]).map(r => ({ id: String(r.id), cardId: String(r.card_id), earnedAt: String(r.earned_at), expiresAt: s(r.expires_at), redeemedAt: s(r.redeemed_at), voidedAt: s(r.voided_at) }))
    },
    async redeem(a): Promise<RedeemResult> {
      const r = await rpcRow('loyalty_redeem_reward', { p_reward_id: a.rewardId, p_order_key: a.orderKey, p_now: a.nowIso })
      return r.out_result as RedeemResult
    },
  }
}
