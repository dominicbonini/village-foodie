// lib/loyalty/model.ts — loyalty-1 (5 November 2026, docs/loyalty-1-report.md): THE RULES OF A STAMP CARD, pure (no database).
//
// V1 (Dominic's decisions, the reference manual's "Loyalty stamp cards"): ONE STAMP PER ORDER, every plan, no flexible stamp rules.
//   • A stamp is earned when an order is COLLECTED, has a customer email (online orders; walk-ups only where an email was given), a
//     total above zero, belongs to a truck whose loyalty is on, and was collected AFTER the truck switched it on. Never a demo truck's
//     order, never a test-mode order (a Stripe test payment: order_payments.livemode = false).
//   • At `stamps_required` the card earns a reward and loses that many stamps; extra stamps carry over (supabase migration 20261073,
//     loyalty_apply_stamp — the atomic part).
//   • An order later cancelled (or rejected) or FULLY refunded loses its stamp (loyalty_reverse_stamp). A partial refund keeps it.
// The customer is the SAME salted hash reviews-weather-1 uses (lib/reviews/model.ts: sha256 of the truck id and the trimmed,
// lower-cased email), so one customer is one key per truck across reviews and loyalty; the address itself is never stored.
import { emailHash, normaliseEmail } from '@/lib/reviews/model'

export { emailHash, normaliseEmail }

/** How far back the job looks for collected orders it has not stamped (older ones: the backfill, a launch decision). */
export const STAMP_LOOKBACK_DAYS = 7
/** How far back it re-checks stamped orders for a cancellation or a full refund. */
export const REVERSAL_LOOKBACK_DAYS = 90
export const STAMPS_MIN = 2
export const STAMPS_MAX = 20
export const STAMPS_DEFAULT = 8
export const EXPIRES_MAX_DAYS = 3650
export const LABEL_MAX = 80
export const AMOUNT_MAX_MINOR = 100_000_000

export type RewardType = 'free_item' | 'amount_off'
export interface LoyaltySettings {
  truckId: string
  enabled: boolean
  enabledAt: string | null
  stampsRequired: number
  rewardType: RewardType | null
  rewardMenuItemId: string | null
  rewardAmountMinor: number | null
  rewardLabel: string | null
  rewardExpiresDays: number | null
}

/** The order facts a stamp decision needs (orders + its payment ledger rows). */
export interface StampOrder {
  orderKey: string
  truckId: string
  status: string | null
  collectedAt: string | null
  customerEmail: string | null
  total: number | null
  paymentStatus: string | null
  /** Any Stripe test-mode payment row (order_payments.livemode = false). */
  testMode: boolean
  /** Succeeded charges and refunds, minor units. */
  chargedMinor: number
  refundedMinor: number
}

export type StampDecision =
  | { stamp: true; customerKey: string; stampedAt: string }
  | { stamp: false; reason: 'loyalty_off' | 'demo_truck' | 'not_collected' | 'no_time' | 'before_enabled' | 'no_email' | 'zero_total' | 'test_mode' | 'cancelled' | 'refunded' }

/** Fully refunded: the ledger says so (payment_status 'refunded'), or the succeeded refunds cover the succeeded charges. */
export function fullyRefunded(o: Pick<StampOrder, 'paymentStatus' | 'chargedMinor' | 'refundedMinor'>): boolean {
  return o.paymentStatus === 'refunded' || (o.chargedMinor > 0 && o.refundedMinor >= o.chargedMinor)
}
const CANCELLED = new Set(['cancelled', 'rejected'])

/** Should this order earn a stamp on this truck? `isDemo` is lib/demo.ts isDemoIdentifier. */
export function stampDecision(o: StampOrder, s: Pick<LoyaltySettings, 'enabled' | 'enabledAt'>, isDemo: (truckId: string) => boolean): StampDecision {
  if (!s.enabled || !s.enabledAt) return { stamp: false, reason: 'loyalty_off' }
  if (isDemo(o.truckId)) return { stamp: false, reason: 'demo_truck' }
  if (CANCELLED.has(String(o.status ?? ''))) return { stamp: false, reason: 'cancelled' }
  if (o.status !== 'collected') return { stamp: false, reason: 'not_collected' }
  if (!o.collectedAt || Number.isNaN(Date.parse(o.collectedAt))) return { stamp: false, reason: 'no_time' }
  if (Date.parse(o.collectedAt) < Date.parse(s.enabledAt)) return { stamp: false, reason: 'before_enabled' }
  const email = normaliseEmail(o.customerEmail)
  if (!email) return { stamp: false, reason: 'no_email' }
  if (!(Number(o.total) > 0)) return { stamp: false, reason: 'zero_total' }
  if (o.testMode) return { stamp: false, reason: 'test_mode' }
  if (fullyRefunded(o)) return { stamp: false, reason: 'refunded' }
  return { stamp: true, customerKey: emailHash(o.truckId, email), stampedAt: o.collectedAt }
}

/** Should a stamped order lose its stamp? 'cancelled' (cancelled or rejected), 'refunded' (fully), or null (it stands). */
export function reversalOf(o: Pick<StampOrder, 'status' | 'paymentStatus' | 'chargedMinor' | 'refundedMinor'>): 'cancelled' | 'refunded' | null {
  if (CANCELLED.has(String(o.status ?? ''))) return 'cancelled'
  if (fullyRefunded(o)) return 'refunded'
  return null
}

// ── settings ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type SettingsProblem =
  | 'stamps_required' | 'reward_type' | 'reward_menu_item' | 'reward_amount' | 'reward_label' | 'reward_expires_days' | 'enabled_without_reward'
export type SettingsInput = Partial<Pick<LoyaltySettings, 'enabled' | 'stampsRequired' | 'rewardType' | 'rewardMenuItemId' | 'rewardAmountMinor' | 'rewardLabel' | 'rewardExpiresDays'>>

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null)

/** A settings change applied over the current settings (or the defaults), validated as the table's CHECKs are — plus the reward
 *  item must be one of this truck's dishes (`itemBelongs`). `enabledAt` is set when loyalty is switched ON (every time it is). */
export function nextSettings(truckId: string, current: LoyaltySettings | null, input: SettingsInput, nowIso: string, itemBelongs: (id: string) => boolean):
  { ok: true; value: LoyaltySettings } | { ok: false; problems: SettingsProblem[] } {
  const base: LoyaltySettings = current ?? { truckId, enabled: false, enabledAt: null, stampsRequired: STAMPS_DEFAULT, rewardType: null, rewardMenuItemId: null, rewardAmountMinor: null, rewardLabel: null, rewardExpiresDays: null }
  const v: LoyaltySettings = { ...base, ...Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined)), truckId }
  const problems: SettingsProblem[] = []
  const stamps = int(v.stampsRequired)
  if (stamps === null || stamps < STAMPS_MIN || stamps > STAMPS_MAX) problems.push('stamps_required')
  if (v.rewardType !== null && v.rewardType !== 'free_item' && v.rewardType !== 'amount_off') problems.push('reward_type')
  if (v.rewardType === 'free_item') {
    if (!v.rewardMenuItemId || !itemBelongs(v.rewardMenuItemId)) problems.push('reward_menu_item')
    v.rewardAmountMinor = null
  } else if (v.rewardType === 'amount_off') {
    const a = int(v.rewardAmountMinor)
    if (a === null || a < 1 || a > AMOUNT_MAX_MINOR) problems.push('reward_amount')
    v.rewardMenuItemId = null
  } else {
    v.rewardMenuItemId = null; v.rewardAmountMinor = null
  }
  if (v.rewardLabel !== null) {
    const l = typeof v.rewardLabel === 'string' ? v.rewardLabel.trim() : ''
    if (!l || l.length > LABEL_MAX) problems.push('reward_label'); else v.rewardLabel = l
  }
  if (v.rewardExpiresDays !== null) { const d = int(v.rewardExpiresDays); if (d === null || d < 1 || d > EXPIRES_MAX_DAYS) problems.push('reward_expires_days') }
  if (v.enabled === true && v.rewardType === null) problems.push('enabled_without_reward')
  if (problems.length) return { ok: false, problems }
  v.enabled = v.enabled === true
  if (v.enabled && !base.enabled) v.enabledAt = nowIso      // switched on now: only orders collected from here earn stamps
  return { ok: true, value: v }
}

// ── rewards ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Reward { id: string; cardId: string; earnedAt: string; expiresAt: string | null; redeemedAt: string | null; voidedAt: string | null }
/** A reward the customer can still use: not redeemed, not voided, not expired. */
export const isAvailable = (r: Reward, nowIso: string): boolean =>
  !r.redeemedAt && !r.voidedAt && (!r.expiresAt || Date.parse(r.expiresAt) > Date.parse(nowIso))
