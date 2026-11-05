// lib/loyalty/service.ts — loyalty-1 (5 November 2026, docs/loyalty-1-report.md): THE SERVER FUNCTIONS FOR LATER USE.
// ⛔ NOT WIRED ANYWHERE: no route, page, checkout or price calls these yet (the UI, checkout redemption and emails are to design).
//   getLoyaltyCard(truckId, email)  → the customer's stamps, the stamps needed and the rewards they can use now
//   redeemReward(rewardId, orderKey) → ONE transaction (loyalty_redeem_reward): refuses expired, voided and already-redeemed rewards;
//                                      the same reward and order again answers as done (idempotent). It does not touch the order's price.
//   readSettings / writeSettings     → a truck's settings, validated (lib/loyalty/model.ts nextSettings — the table's CHECKs, and the
//                                      reward dish must be one of the truck's); switching on stamps the moment (enabled_at).
// The email is never stored: it is normalised and hashed with the truck id (the same key reviews use), then thrown away.
import { emailHash, isAvailable, nextSettings, normaliseEmail, type LoyaltySettings, type Reward, type SettingsInput, type SettingsProblem } from './model'

export type RedeemResult = 'redeemed' | 'already_redeemed_here' | 'not_found' | 'already_redeemed' | 'voided' | 'expired' | 'wrong_order' | 'order_used'
export interface LoyaltyServiceStore {
  settings(truckId: string): Promise<LoyaltySettings | null>
  saveSettings(s: LoyaltySettings, updatedBy: string | null): Promise<void>
  menuItemBelongs(truckId: string, itemId: string): Promise<boolean>
  card(truckId: string, customerKey: string): Promise<{ id: string; stamps: number; lifetimeStamps: number } | null>
  rewards(cardId: string): Promise<Reward[]>
  redeem(a: { rewardId: string; orderKey: string; nowIso: string }): Promise<RedeemResult>
}

export interface LoyaltyCardView {
  stamps: number
  stampsRequired: number
  lifetimeStamps: number
  rewards: Pick<Reward, 'id' | 'earnedAt' | 'expiresAt'>[]
}

/** The customer's card at this truck, or null: no usable email, loyalty not set up, or no card yet. */
export async function getLoyaltyCard(store: LoyaltyServiceStore, truckId: string, email: string, now: Date = new Date()): Promise<LoyaltyCardView | null> {
  const e = normaliseEmail(email)
  if (!e) return null
  const [settings, card] = await Promise.all([store.settings(truckId), store.card(truckId, emailHash(truckId, e))])
  if (!settings || !card) return null
  const nowIso = now.toISOString()
  const rewards = (await store.rewards(card.id)).filter(r => isAvailable(r, nowIso)).sort((a, b) => a.earnedAt.localeCompare(b.earnedAt))
  return { stamps: card.stamps, stampsRequired: settings.stampsRequired, lifetimeStamps: card.lifetimeStamps, rewards: rewards.map(r => ({ id: r.id, earnedAt: r.earnedAt, expiresAt: r.expiresAt })) }
}

/** Redeem a reward against an order (atomic and idempotent in the database). Never changes what the order costs. */
export async function redeemReward(store: LoyaltyServiceStore, rewardId: string, orderKey: string, now: Date = new Date()): Promise<RedeemResult> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(rewardId)) return 'not_found'
  if (!uuid.test(orderKey)) return 'wrong_order'
  return store.redeem({ rewardId, orderKey, nowIso: now.toISOString() })
}

export async function readSettings(store: LoyaltyServiceStore, truckId: string): Promise<LoyaltySettings | null> {
  return store.settings(truckId)
}

/** Validate and save a settings change. Refusals name the field (`problems`), and nothing is written. */
export async function writeSettings(store: LoyaltyServiceStore, truckId: string, input: SettingsInput, updatedBy: string | null, now: Date = new Date()):
  Promise<{ ok: true; settings: LoyaltySettings } | { ok: false; problems: SettingsProblem[] }> {
  const current = await store.settings(truckId)
  const itemId = input.rewardMenuItemId ?? current?.rewardMenuItemId ?? null
  const belongs = itemId ? await store.menuItemBelongs(truckId, itemId) : false
  const r = nextSettings(truckId, current, input, now.toISOString(), id => id === itemId && belongs)
  if (!r.ok) return r
  await store.saveSettings(r.value, updatedBy)
  return { ok: true, settings: r.value }
}
