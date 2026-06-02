import type { Plan } from '@/lib/features'
export type { Plan }

export type FeatureValue = boolean | 'coming_soon'

export interface FeatureRow {
  name: string
  detail?: string
  footnote?: string
  starter: FeatureValue
  pro: FeatureValue
  max: FeatureValue
}

export interface FeatureSection {
  title: string
  rows: FeatureRow[]
}

export const PLAN_PRICES: Record<Plan, string> = {
  starter: 'Free',
  pro: '£29/mo',
  max: '£49/mo',
  trial: 'Free trial',
  tester: 'Lifetime',
}

export const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  starter: 'Weekend traders & walk-up pitches',
  pro: 'Busy trucks scaling pre-orders',
  max: 'High-volume operations & festivals',
  trial: 'All features included — Max tier + Pay at Hatch ordering',
  tester: 'Pre-launch tester — full feature access, lifetime discount',
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
    name: 'Online orders',
    footnote: '2',
    values: {
      starter: 'Pay at Hatch',
      pro: '0.99% + card fee',
      max: '0.99% + card fee',
    },
  },
]

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'Core operations',
    rows: [
      { name: 'Discovery map listing',           starter: true,  pro: true,  max: true  },
      { name: 'Universal web dashboard',         starter: true,  pro: true,  max: true  },
      { name: 'iPad kitchen app', footnote: '3', starter: true,  pro: true,  max: true  },
      { name: 'QR code',                          starter: true,  pro: true,  max: true  },
      { name: 'Meal deals & upsells',            starter: true,  pro: true,  max: true  },
      { name: 'Walk-up order processing', footnote: '1', starter: true, pro: true, max: true },
      { name: 'Instant sold out toggle',         starter: true,  pro: true,  max: true  },
      { name: 'Automated stock countdown',       starter: true,  pro: true,  max: true  },
      { name: 'Online ordering — Pay at Hatch', footnote: '1', starter: true, pro: false, max: false },
    ],
  },
  {
    title: 'Online sales & automation',
    rows: [
      { name: 'Offline Order Protection',                      starter: false, pro: true,           max: true           },
      { name: 'Online payments',                  footnote: '2', starter: false, pro: true,           max: true           },
      { name: 'Advance pre-ordering',                         starter: false, pro: true,           max: true           },
      { name: 'Customer time slot selection',                 starter: false, pro: true,           max: true           },
      { name: 'Smart Slot Management',                        starter: false, pro: true,           max: true           },
      { name: 'Auto-accept online orders',                    starter: false, pro: true,           max: true           },
      { name: 'Facebook, Messenger & Instagram auto-replies', footnote: '4', starter: false, pro: true, max: true },
      { name: 'Personalised schedule generator',              starter: false, pro: 'coming_soon',  max: 'coming_soon'  },
      { name: 'Branded QR code', footnote: '6', starter: false, pro: true,  max: true  },
      { name: 'Advanced reporting', starter: false, pro: true, max: true },
    ],
  },
  {
    title: 'Max tier',
    rows: [
      { name: 'WhatsApp auto-replies',    footnote: '4', starter: false, pro: false, max: true },
      { name: 'Kitchen ticket printing',  footnote: '5', starter: false, pro: false, max: true },
      { name: 'Multi-device kitchen sync', starter: false, pro: false, max: true           },
      { name: 'Multi-user access',         starter: false, pro: false, max: true           },
      { name: 'Customer-facing display',   starter: false, pro: false, max: 'coming_soon'  },
      { name: 'Event & festival pricing', starter: false, pro: false, max: 'coming_soon'  },
      // LOYALTY STAMP CARDS — Max only, coming soon
      // Schema: loyalty_cards(id, truck_id, customer_email, customer_phone, stamps_earned, stamps_redeemed, created_at, last_stamp_at)
      // Stamp rule V1: 1 per order (not per item — avoids redemption complexity)
      // Redemption: operator-side trigger on Add Order + customer-side prompt on online checkout
      // Stickiness note: once stamps are earned, operator churn drops to near zero
      // Walk-up flow: phone number lookup in Add Order panel → auto-increment
      // Online flow: email match on order submit → auto-increment
      // Do NOT build flexible stamp criteria until V1 is live and operators request it
      { name: 'Digital loyalty stamp cards', starter: false, pro: false, max: 'coming_soon' },
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
    text: 'Branded QR code composites your truck logo into the centre of the QR code at high error-correction level. Requires a logo to be uploaded in Settings.',
  },
]
