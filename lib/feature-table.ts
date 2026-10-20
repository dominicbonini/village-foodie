// lib/feature-table.ts — 🔴 THE ROWS OF THE PLAN TABLE AND THE CARD BULLETS: CAPABILITIES, NOT PLANS (Stage B of the new
// pricing, docs/pricing-pages-report.md).
//
// The code may list what the product can DO (lib/features.ts FEATURES); which PLAN has it is data (public.plan_features,
// lib/plans.ts planAllowsFeature). So this file says, for each row of the /features table (and Manage › Billing and the
// plans PDF, which render the same table):
//   • its id — the message key (`planFeatures.row.<id>.name`, the row names the pages have always used);
//   • its group (RUN YOUR SERVICE / ONLINE ORDERS / MARKETING & AUTOMATION — the approved /features mockup);
//   • the Feature it is gated by, if any — a plan that switches that feature off shows "—" in the row;
//   • whether it is COMING SOON (a product not built yet — the same states the frozen table had).
// ⛔ NO PLAN APPEARS HERE. A cell is ✓ / — / coming soon by the plan's switches alone (lib/plan-offer.ts tableCell).
import type { Feature } from '@/lib/features'
import { MESSENGER_INSTAGRAM_LIVE, WHATSAPP_LIVE } from '@/lib/whatsapp-live'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planTable'

export type FeatureGroup = 'run' | 'online' | 'marketing'

export interface FeatureTableRow {
  /** `planFeatures.row.<id>.name` — the row's words. */
  id: string
  group: FeatureGroup
  /** The feature that gates the row; a row with none is on every plan. */
  feature?: Feature
  /** A product not built yet: "Coming soon" on every plan that has the feature (and "—" on one that switches it off). */
  comingSoon?: boolean
  /** A disclosure the row needs (pricing-tidy, 20 October 2026): a superscript marker on the row and a footnote under the
   *  table (`planTable.notes.<note>`) on /features, Manage › Billing and the plans PDF. Numbered by row position (noteOrder). */
  note?: TableNote
}

export type TableNote = 'whatsapp' | 'printing'

/**
 * The footnotes' order — and so their markers (1, 2…, after the card-fee footnote's "*") — is the order their ROWS
 * appear in the table (groups in FEATURE_GROUPS order, then rows in FEATURE_TABLE order), DERIVED, never fixed per row:
 * move a row and its number and footnote position follow (compare-tidy F1, 20 October 2026 — Kitchen ticket printing ¹,
 * WhatsApp auto-replies ²).
 */
export function noteOrder(): TableNote[] {
  const out: TableNote[] = []
  for (const g of FEATURE_GROUPS) for (const r of FEATURE_TABLE) if (r.group === g && r.note && !out.includes(r.note)) out.push(r.note)
  return out
}
export const noteMarker = (n: TableNote): string => String(noteOrder().indexOf(n) + 1)

/**
 * The table's row footnotes — marker + words, in the country's locale — for each surface to render under the table in its
 * own footnote style, below the card-fee footnote: /features, Manage › Billing, the plans PDF.
 */
export function planTableNotes(locale: string | null | undefined): { marker: string; text: string }[] {
  const t = translatorFor(locale, 'planTable')
  return noteOrder().map(n => ({ marker: noteMarker(n), text: t(`notes.${n}` as never) }))
}

/**
 * Every row the plan table shows, grouped and in order. The 33 rows the pages carried before Stage B, less "Online
 * ordering — Pay at Hatch" (taken off on Dominic's request, 20 October 2026, with the "Pay at Hatch orders" money row);
 * "Custom event types & pricing" closes the Online orders group (same request).
 */
export const FEATURE_TABLE: readonly FeatureTableRow[] = [
  // ── RUN YOUR SERVICE ──
  { id: 'walkup_orders', group: 'run', feature: 'walkup_orders' },
  { id: 'kitchen_app', group: 'run', feature: 'ipad_kds' },
  { id: 'multi_device_kitchen', group: 'run', feature: 'multi_device_kds' },
  { id: 'multi_user_access', group: 'run' },
  { id: 'offline_protection', group: 'run', feature: 'offline_protection' },
  { id: 'ticket_printing', group: 'run', feature: 'ticket_printing', note: 'printing' },
  { id: 'web_dashboard', group: 'run', feature: 'web_dashboard' },
  { id: 'meal_deals_upsells', group: 'run', feature: 'meal_deals' },
  { id: 'sold_out_toggle', group: 'run', feature: 'sold_out_toggle' },
  { id: 'stock_countdown', group: 'run', feature: 'stock_countdown' },
  { id: 'buzzer_tracking', group: 'run' },
  { id: 'advanced_reporting', group: 'run', feature: 'advanced_reporting', comingSoon: true },
  { id: 'tap_to_pay', group: 'run', comingSoon: true },
  { id: 'customer_display', group: 'run', comingSoon: true },
  // ── ONLINE ORDERS ──
  { id: 'online_payments', group: 'online', feature: 'online_payments' },
  { id: 'advance_preordering', group: 'online', feature: 'advance_preordering' },
  { id: 'preorder_deadline', group: 'online', feature: 'advance_preordering' },
  { id: 'time_slot_selection', group: 'online', feature: 'time_slot_selection' },
  { id: 'kitchen_capacity', group: 'online', feature: 'smart_batch_pacing' },
  { id: 'auto_accept', group: 'online', feature: 'auto_accept' },
  { id: 'private_events', group: 'online', feature: 'private_events' },
  { id: 'embed_schedule', group: 'online', feature: 'embed_schedule' },
  { id: 'qr_code', group: 'online', feature: 'qr_menu' },
  { id: 'branded_qr_code', group: 'online', feature: 'branded_qr_code' },
  { id: 'discovery_map_listing', group: 'online', feature: 'discovery_map' },
  { id: 'schedule_import', group: 'online' },
  { id: 'event_types', group: 'online', feature: 'event_types' },
  // ── MARKETING & AUTOMATION ──
  { id: 'social_media_posts', group: 'marketing', feature: 'schedule_graphics' },
  { id: 'whatsapp_auto_replies', group: 'marketing', feature: 'whatsapp_replies', comingSoon: !WHATSAPP_LIVE, note: 'whatsapp' },
  { id: 'messenger_instagram_replies', group: 'marketing', feature: 'instagram_messenger_replies', comingSoon: !MESSENGER_INSTAGRAM_LIVE },
  { id: 'sms_order_alerts', group: 'marketing', comingSoon: true },
  { id: 'loyalty_stamp_cards', group: 'marketing', comingSoon: true },
]

export const FEATURE_GROUPS: readonly FeatureGroup[] = ['run', 'online', 'marketing']

/**
 * The FIRST pricing card's bullets ("Everything to run a service"): each is a message `pricing.base.<key>` and is shown
 * only while the first plan has its feature (a bullet with none always shows). Order as in the approved mockup.
 * ⛔ Multi-staff logins are deliberately NOT here (Dominic, Stage B) — they stay a /features table row.
 */
export const BASE_CARD_BULLETS: readonly { key: string; feature?: Feature }[] = [
  { key: 'walkUp', feature: 'walkup_orders' },
  { key: 'online', feature: 'online_ordering_pay_at_hatch' },
  { key: 'preorders', feature: 'advance_preordering' },
  { key: 'capacity', feature: 'smart_batch_pacing' },
  { key: 'privateEvents', feature: 'private_events' },
  { key: 'printing', feature: 'ticket_printing' },
  { key: 'app', feature: 'ipad_kds' },
]

/**
 * How a feature that a later plan ADDS reads as a card bullet, in the order the bullets appear. A feature added but not
 * listed here still shows, after these, under its generic name (`planPrompt.features.<key>.name`).
 * `under`: the feature is shown as a small sub-line beneath that one rather than a bullet of its own.
 * `hidden`: the feature is never a card bullet (it stays a /features table row) — Messenger & Instagram replies, taken
 * off the cards on Dominic's request (20 October 2026); its row keeps its coming-soon state.
 */
export const ADDED_FEATURE_BULLETS: readonly { feature: Feature; under?: Feature; comingSoon?: boolean; hidden?: boolean }[] = [
  { feature: 'whatsapp_replies', comingSoon: !WHATSAPP_LIVE },
  { feature: 'instagram_messenger_replies', hidden: true },
  { feature: 'schedule_graphics' },
  { feature: 'event_types' },
]
