import { PLAN_META, canAccess, type Plan, type Feature } from '@/lib/features'
export type { Plan }

export type FeatureValue = boolean | 'coming_soon'

export interface FeatureRow {
  name: string
  detail?: string       // plain-operator tooltip copy (the landing table's `?` hover text)
  footnote?: string
  starter: FeatureValue
  pro: FeatureValue
  max: FeatureValue
}

export interface FeatureSection {
  title: string
  rows: FeatureRow[]
}

// Prices + positioning blurbs are DERIVED from the single source (lib/features.ts PLAN_META). Do NOT
// re-hardcode them here — the two used to be separate literals and had already drifted (starter/pro wording,
// tester/demo price). Deriving makes that class of drift impossible.
export const PLAN_PRICES: Record<Plan, string> =
  Object.fromEntries((Object.keys(PLAN_META) as Plan[]).map(p => [p, PLAN_META[p].price])) as Record<Plan, string>

export const PLAN_DESCRIPTIONS: Record<Plan, string> =
  Object.fromEntries((Object.keys(PLAN_META) as Plan[]).map(p => [p, PLAN_META[p].description])) as Record<Plan, string>

// Included online-order allowance per plan (the £1,500 / £2,000 headline). Additive — Admin/Billing ignore
// it until they choose to render it; the landing table shows it under the price.
export const PLAN_ALLOWANCES: Record<'starter' | 'pro' | 'max', string> = {
  starter: 'Pay at hatch',
  pro: 'First £1,500 of online orders included, then 0.99%',
  max: 'First £2,000 of online orders included, then 0.99%',
}

export const TRANSACTION_ROWS: {
  name: string
  footnote?: string
  values: Record<'starter' | 'pro' | 'max', string>
}[] = [
  {
    name: 'Walk-up orders',
    footnote: '1',
    values: { starter: '0%', pro: '0%', max: '0%' },
  },
  {
    // One row: the included allowance (£1,500 / £2,000) shown BEFORE the 0.99% fee — "first £X of online orders
    // free, then 0.99% + card fee". Starter = Pay at Hatch (no online card orders).
    name: 'Online orders',
    footnote: '2',
    values: {
      starter: 'Pay at Hatch',
      pro: '£1,500 free, then 0.99% + card fee',
      max: '£2,000 free, then 0.99% + card fee',
    },
  },
]

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'Core operations',
    rows: [
      { name: 'Discovery map listing',           detail: 'Your truck appears on the public HatchGrab map so nearby customers can find you.', starter: true,  pro: true,  max: true  },
      { name: 'Universal web dashboard',         detail: 'Run the whole service from any phone, tablet or laptop browser — nothing to install.', starter: true,  pro: true,  max: true  },
      { name: 'QR code',                          detail: 'A printable QR code that opens your menu and ordering page.', starter: true,  pro: true,  max: true  },
      { name: 'Automatic schedule import',        detail: 'We read your existing website and pull your upcoming locations and times into your schedule automatically — you just review and confirm.', starter: true,  pro: true,  max: true  },
      { name: 'Meal deals & upsells',            detail: 'Bundle items into deals and offer add-ons at checkout to lift the average order.', starter: true,  pro: true,  max: true  },
      { name: 'Walk-up order processing', footnote: '1', detail: 'Take and manage orders at the hatch, paid on your own card terminal.', starter: true, pro: true, max: true },
      { name: 'Instant sold out toggle',         detail: 'Mark any item sold out in one tap — it greys out for customers straight away.', starter: true,  pro: true,  max: true  },
      { name: 'Automated stock countdown',       detail: 'Set a stock count and HatchGrab counts it down as orders come in, then sells out automatically.', starter: true,  pro: true,  max: true  },
      { name: 'Online ordering — Pay at Hatch', footnote: '1', detail: 'Customers order ahead online and pay in person when they collect.', starter: true, pro: false, max: false },
      { name: 'iPad kitchen app', footnote: '3', detail: 'A dedicated kitchen screen for your iPad or tablet showing live orders to cook.', starter: true, pro: true, max: true },
      // Coming soon (kept at the bottom of the section)
      { name: 'Android kitchen app', footnote: '3', detail: 'The same kitchen screen on an Android tablet.', starter: 'coming_soon', pro: 'coming_soon', max: 'coming_soon' },
    ],
  },
  {
    title: 'Online sales & automation',
    rows: [
      { name: 'Offline Order Protection',                      detail: "If your internet drops mid-service, orders are held safely and sync when you're back — you never lose one.", starter: false, pro: true,           max: true           },
      { name: 'Online payments',                  footnote: '2', detail: 'Take card payment upfront when customers order online, via Stripe.', starter: false, pro: true,           max: true           },
      { name: 'Advance pre-ordering',                         detail: 'Let customers order for a future date or time before the event.', starter: false, pro: true,           max: true           },
      { name: 'Customer time slot selection',                 detail: 'Customers pick a collection time slot, spreading demand across your service.', starter: false, pro: true,           max: true           },
      { name: 'Smart Slot Management',                        detail: "HatchGrab paces orders across time slots to match your kitchen's capacity.", starter: false, pro: true,           max: true           },
      { name: 'Auto-accept online orders',                    detail: 'Online orders are accepted automatically — no need to confirm each one.', starter: false, pro: true,           max: true           },
      { name: 'Branded QR code',                              detail: 'Add your logo and colours to your QR code.', starter: false, pro: true,  max: true  },
      { name: 'WhatsApp auto-replies',            footnote: '4', detail: 'Auto-reply to WhatsApp enquiries with your schedule and order link.', starter: false, pro: true,           max: true           },
      // Coming soon (kept at the bottom of the section)
      { name: 'Messenger & Instagram auto-replies', footnote: '4', detail: 'Auto-reply to Messenger and Instagram enquiries with your schedule and order link.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'Advanced reporting', detail: 'Break sales down by date range, item and event to see what’s really selling.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'SMS order confirmations', footnote: '6', detail: "Text customers automatically when their order's confirmed. Coming soon — will carry an additional charge (price to be confirmed).", starter: false, pro: 'coming_soon', max: 'coming_soon' },
    ],
  },
  {
    title: 'Max tier',
    rows: [
      { name: 'Multi-device kitchen sync', detail: 'Run several screens — front counter and kitchen — all showing the same live orders.', starter: false, pro: false, max: true           },
      { name: 'Multi-user access',         detail: 'Give staff their own logins with the right level of access.', starter: false, pro: false, max: true           },
      { name: 'Kitchen ticket printing',  footnote: '5', detail: 'Print order tickets to a thermal printer in the kitchen.', starter: false, pro: false, max: true },
      // Coming soon (kept at the bottom of the section)
      { name: 'Customer-facing display',   detail: 'A screen customers can see showing order numbers and when they’re ready.', starter: false, pro: false, max: 'coming_soon'  },
      { name: 'Event & festival pricing', detail: 'Set different prices for specific events or festivals.', starter: false, pro: false, max: 'coming_soon'  },
      // LOYALTY STAMP CARDS — Max only, coming soon
      // Schema: loyalty_cards(id, truck_id, customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at)
      // Stamp rule V1: 1 per order (not per item — avoids redemption complexity)
      // Redemption: operator-side trigger on Add Order + customer-side prompt on online checkout
      // Stickiness note: once stamps are earned, operator churn drops to near zero
      // Walk-up flow: phone number lookup in Add Order panel → auto-increment
      // Online flow: email match on order submit → auto-increment
      // Do NOT build flexible stamp criteria until V1 is live and operators request it
      { name: 'Digital loyalty stamp cards', detail: 'Reward repeat customers with digital stamp cards — collected and redeemed automatically.', starter: false, pro: false, max: 'coming_soon' },
    ],
  },
]

export const FOOTNOTES: { number: string; text: string }[] = [
  {
    number: '1',
    text: "Walk-up orders use your own card terminal (Zettle, Square, etc.). HatchGrab charges 0% — your terminal provider's standard fees apply.",
  },
  {
    number: '2',
    text: 'Online payments powered by Stripe Connect. Subject to 0.99% HatchGrab platform fee plus Stripe card processing fees (~1.5% + 20p per transaction in the UK).',
  },
  {
    number: '3',
    text: 'iPad not supplied. The kitchen app works on any iPad or tablet running a modern browser. An Apple iPad is recommended for the best experience.',
  },
  {
    number: '4',
    text: 'Auto-replies require a Business account on each platform. Automatically responds to customer enquiries with your schedule and order link only.',
  },
  {
    number: '5',
    text: 'Kitchen ticket printing requires the HatchGrab iPad app and a compatible thermal printer (neither supplied). Compatible printers listed in our help centre.',
  },
  {
    number: '6',
    text: 'SMS confirmations are not yet available and will incur an additional charge once launched; pricing to be confirmed.',
  },
]

// ── DRIFT GUARD (the structural fix) ────────────────────────────────────────────────────────────────────
// This file (PRESENTATION) and lib/features.ts (the ENFORCEMENT gate — PLAN_FEATURES / canAccess) are two
// hand-maintained records that can silently disagree — the same class as the /api/dashboard subset and the
// update_settings allowlist. They LEGITIMATELY differ on 'coming_soon' (no gate equivalent) and on
// marketing-only rows (no Feature at all), so we do NOT merge them — we CROSS-CHECK: any row advertised as a
// hard `true` for a tier MUST be allowed by the gate for that tier. This catches the WhatsApp class (marketed
// Pro, gated Max-only) automatically. The name→Feature map is the one coupling; rows without a mapping
// (Multi-user access, schedule generator, loyalty, event pricing) are marketing-only and skipped.
const ROW_FEATURE_MAP: Record<string, Feature> = {
  'Discovery map listing': 'discovery_map',
  'Universal web dashboard': 'web_dashboard',
  'QR code': 'qr_menu',
  'Meal deals & upsells': 'meal_deals',
  'Walk-up order processing': 'walkup_orders',
  'Instant sold out toggle': 'sold_out_toggle',
  'Automated stock countdown': 'stock_countdown',
  'Online ordering — Pay at Hatch': 'online_ordering_pay_at_hatch',
  'iPad kitchen app': 'ipad_kds',
  'Offline Order Protection': 'offline_protection',
  'Online payments': 'online_payments',
  'Advance pre-ordering': 'advance_preordering',
  'Customer time slot selection': 'time_slot_selection',
  'Smart Slot Management': 'smart_batch_pacing',
  'Auto-accept online orders': 'auto_accept',
  'Branded QR code': 'branded_qr_code',
  'WhatsApp auto-replies': 'whatsapp_replies',
  'Messenger & Instagram auto-replies': 'instagram_messenger_replies',
  'Advanced reporting': 'advanced_reporting',
  'Multi-device kitchen sync': 'multi_device_kds',
  'Kitchen ticket printing': 'ticket_printing',
  'Customer-facing display': 'cook_screen',
}

/** Every "advertised hard-true for a tier, but the gate blocks it" mismatch. Empty ⇒ presentation and gate
 *  agree on every hard-true cell. Exported so a future test / CI step (or a one-off script) can assert on it. */
export function findPlanParityViolations(): string[] {
  const tiers: Array<'starter' | 'pro' | 'max'> = ['starter', 'pro', 'max']
  const out: string[] = []
  for (const section of FEATURE_SECTIONS) {
    for (const row of section.rows) {
      const feature = ROW_FEATURE_MAP[row.name]
      if (!feature) continue
      for (const tier of tiers) {
        if (row[tier] === true && !canAccess(tier, feature)) {
          out.push(`"${row.name}" advertised for ${tier} but canAccess('${tier}','${feature}') is false`)
        }
      }
    }
  }
  return out
}

// Runs at module load — this file is imported by every pricing surface (Admin, Billing, and the landing
// table), so the check fires whenever one of them renders. Dev → THROW loudly (a mismatch is a bug to fix
// before it ships). Production → console.error only, never crash a live operator/customer page.
{
  const violations = findPlanParityViolations()
  if (violations.length > 0) {
    const msg = '[plan-features] presentation↔gate DRIFT — advertised but not allowed:\n  - '
      + violations.join('\n  - ')
      + '\nFix: add the feature to the correct tier in lib/features.ts, or change the flag in FEATURE_SECTIONS.'
    if (process.env.NODE_ENV !== 'production') throw new Error(msg)
    console.error(msg)
  }
}
