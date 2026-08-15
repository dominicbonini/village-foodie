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

// ── CARD PROCESSING FEES — ONE DEFINITION, STRUCTURED (V11.4) ─────────────────────────────────────────
// 🔴 THESE ARE STRIPE'S FEES, NOT OURS. HatchGrab does not set them, cannot guarantee them, and a truck's
// actual rate is confirmed by Stripe during their own onboarding. Never render these as fixed or as ours.
//
// ⚠️ STRUCTURED VALUES, NOT DISPLAY STRINGS, AND THAT IS THE WHOLE POINT. The £1,500 / £2,000 allowances
// were defined only INSIDE display strings, so lib/payments cannot read a number and therefore cannot apply
// an allowance at all. Do not repeat that here: when Stripe Connect and Terminal are built, the payments
// code needs `pct` and `pence` as numbers. Every display string below is DERIVED — add a new surface by
// calling feeLabel(), never by writing "1.4% + 10p" again.
//
// PROVENANCE: verified 6 August 2026 from multiple SECONDARY sources, NOT from stripe.com directly — which
// is why every rendered string carries a hedge ("currently" / "~"). If these are ever confirmed against
// Stripe's own published rates, say so here; until then the hedging is load-bearing, not decoration.
export const CARD_FEES = {
  /** Online payments, standard UK-issued cards. */
  online: { pct: 1.5, pence: 20 },
  /** In-person payments, UK/EEA-issued cards. ⚠️ Cards issued outside the UK/EEA cost MORE — say so
   *  wherever this is rendered; quoting the domestic rate alone would be a claim that is untrue for some
   *  customers. */
  inPerson: { pct: 1.4, pence: 10 },
  /** ADDITIONAL per-authorisation charge for contactless taken on a phone or tablet with no dedicated
   *  reader (Tap to Pay). ⚠️ MUST be stated separately — folding it into the headline in-person rate would
   *  understate the cost for exactly the trucks most likely to use it. */
  tapToPaySurchargePence: 10,
} as const

/** "1.4% + 10p" — the ONLY place a card fee becomes a string. */
export function feeLabel(fee: { pct: number; pence: number }): string {
  return `${fee.pct}% + ${fee.pence}p`
}

export const CARD_FEE_ONLINE_LABEL = feeLabel(CARD_FEES.online)
export const CARD_FEE_IN_PERSON_LABEL = feeLabel(CARD_FEES.inPerson)
export const TAP_TO_PAY_SURCHARGE_LABEL = `${CARD_FEES.tapToPaySurchargePence}p`

// ── 🔴 THE FEE TABLE. ONE DEFINITION, READ BY THE LANDING PAGE AND BY MANAGE > BILLING. ──────────────
// ⚠️ THIS EXPORT USED TO BE TWO ROWS WITH NO TRIAL COLUMN, AND THE LANDING PAGE KEPT ITS OWN THREE-ROW
// COPY (`LANDING_FEE_ROWS`) BESIDE IT. The comment on that copy said so outright — "the shared
// TRANSACTION_ROWS is NOT modified; Manage > Billing / Admin keep their own version" — and that
// duplication was the actual defect: the two surfaces made DIFFERENT CLAIMS about what a trial truck
// gets, and no amount of fixing the rendering could have kept them together. The landing page's shape
// won because it was the correct one; this is now the only place these values exist.
//
// 🔴 THREE ROWS, NOT TWO, AND THE SPLIT IS WHY. Collapsing the allowance and the fee into one cell
// ("£1,500 free, then 0.99% + card fee") produced a cell that wrapped to four lines in a 56px column.
// One short fact per cell fits one line at 390px on both surfaces.
//
// ⚠️ `trial` IS A REAL COLUMN NOW. Manage used to render `row.values.starter` for the trial column
// because there was no trial data to read — which made Billing tell a trial operator they were on
// "Pay at Hatch" when a trial carries MAX's feature set (lib/features.ts: `TRIAL_FEATURES =
// [...MAX_FEATURES]`), including online payments. Manage's own trial banner already said the truth:
// "Full Max features + Pay at Hatch ordering — completely free* / *Standard card processing fees apply
// on online orders". Unlimited, free, Stripe's fees still apply — which is exactly what these cells say.
//
// ⚠️ `—` AND `Unlimited` CARRY NO PRICE. lib/pricing.ts treats them as non-sensitive, like `0%` and
// `Pay at Hatch`, so the pre-launch mask leaves them alone; `£1,500`, `£2,000` and `0.99%` are still
// masked to "TBC" until pricing is published.
export const TRANSACTION_ROWS: {
  name: string
  footnote?: string
  cells: Record<'trial' | 'starter' | 'pro' | 'max', string>
}[] = [
  { name: 'Walk-up orders',         footnote: '1', cells: { trial: '0%',        starter: '0%',           pro: '0%',     max: '0%'     } },
  { name: 'Online orders included', footnote: '2', cells: { trial: 'Unlimited', starter: '—',            pro: '£1,500', max: '£2,000' } },
  { name: 'Fee after that',         footnote: '2', cells: { trial: 'Free',      starter: 'Pay at Hatch', pro: '0.99%',  max: '0.99%'  } },
]

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'Core operations',
    rows: [
      { name: 'Discovery map listing',           detail: 'Your truck appears on the public HatchGrab map so nearby customers can find you.', starter: true,  pro: true,  max: true  },
      { name: 'Universal web dashboard',         detail: 'Run your service from any phone, tablet or laptop browser.', starter: true,  pro: true,  max: true  },
      { name: 'QR code',                          detail: 'A printable QR code that opens your menu and ordering page.', starter: true,  pro: true,  max: true  },
      { name: 'Automatic schedule import',        detail: 'We fill your schedule automatically — from your website, or a photo you already post to Facebook. You just review and confirm.', starter: true,  pro: true,  max: true  },
      { name: 'Meal deals & upsells',            detail: 'Bundle items into deals and offer add-ons at checkout to lift the average order.', starter: true,  pro: true,  max: true  },
      { name: 'Walk-up order processing', footnote: '1', detail: 'Take and manage orders at the hatch, paid on your own card terminal.', starter: true, pro: true, max: true },
      { name: 'Instant sold out toggle',         detail: 'Mark any item sold out in one tap — it greys out for customers straight away.', starter: true,  pro: true,  max: true  },
      { name: 'Automated stock countdown',       detail: 'Set a stock count and HatchGrab counts it down as orders come in, then sells out automatically.', starter: true,  pro: true,  max: true  },
      { name: 'Online ordering — Pay at Hatch', footnote: '1', detail: 'Customers order ahead online and pay in person when they collect.', starter: true, pro: false, max: false },
      // MERGED ROW. This was 'iPad kitchen app' (true/true/true) with a separate 'Android kitchen app'
      // (coming_soon/coming_soon/coming_soon) beneath it. Android now launches alongside iPad, so the second
      // row became a duplicate of this one and was removed. Both rows were UNIFORM across all three plans,
      // so the merge needed no per-plan decision — see the report.
      { name: 'iPad and Android kitchen app', footnote: '3', detail: 'The fullest way to run HatchGrab: a live kitchen screen, plus the only way to keep taking orders when you lose signal.', starter: true, pro: true, max: true },
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
      { name: 'Branded QR code',                              detail: 'Add your logo to your QR code.', starter: false, pro: true,  max: true  },
      // Auto-replies are SPLIT on purpose: WhatsApp is LIVE, Messenger/Instagram are coming soon. Do not
      // re-merge them into one row — a combined row reads as "all three work today", which isn't true.
      // Both carry footnote 4 (business account required + AI replies can be wrong).
      { name: 'WhatsApp auto-replies',            footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true,           max: true           },
      // Coming soon (kept at the bottom of the section)
      { name: 'Messenger & Instagram auto-replies', footnote: '4', detail: 'Same as WhatsApp auto-replies, for Messenger and Instagram enquiries.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'Advanced reporting', detail: 'Break sales down by date range, item and event to see what’s really selling.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'SMS order alerts', detail: "Text customers automatically when their order's ready. Will carry an additional charge (price to be confirmed).", starter: false, pro: 'coming_soon', max: 'coming_soon' },
    ],
  },
  {
    title: 'Max tier',
    rows: [
      { name: 'Multi-device kitchen sync', detail: 'Run several screens — front counter and kitchen — all showing the same live orders.', starter: false, pro: false, max: true           },
      { name: 'Multi-user access',         detail: 'Give staff their own logins with the right level of access.', starter: false, pro: false, max: true           },
      // 🔴 'coming_soon', NOT true — 14 August 2026. A TICK IS A CLAIM THAT IT WORKS, AND IT DOES NOT.
      // components/printing/PrintingSettings.tsx has NO connect(): the Phase-A stub that wrote
      // 'Demo printer (Phase A stub)' and manufactured a connected state was REMOVED, and no real
      // transport replaced it. The card itself already says "Coming soon" (:99) — so the matrix was
      // asserting `true` for the same capability the product's own settings card calls unbuilt.
      // ⚠️ THIS IS THE ONLY MATRIX VALUE THAT CHANGED, and it is a DISPLAY value: lib/plan-features.ts is
      // PRESENTATION (its own header at :229 says so) and nothing reads it to gate. The enforcement gate
      // is canAccess in lib/features.ts, which is UNTOUCHED — `ticket_printing` still resolves exactly as
      // it did, so no truck gains or loses access to anything.
      // ⚠️ It also cannot break findPlanParityViolations(): that guard only inspects cells that are hard
      // `true` (`row[tier] === true && !canAccess(...)`), so turning one into 'coming_soon' removes a
      // check rather than adding one. 'coming_soon' is explicitly a legitimate divergence (:231).
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
    // 🔴 THIS FOOTNOTE IS THE ONE PLACE THE WALK-UP DETAIL LIVES. The lede and the pricing asterisk point
    // at it and stop. Every fact here — the in-person rate, the UK/EEA limit, the tap surcharge and
    // "coming soon" — appears EXACTLY ONCE across the whole surface, and this is that once.
    // ⚠️ "is coming soon", NOT "is" — Stripe Connect and Terminal are BOTH UNBUILT. The manual records
    // advertising an unbuilt capability as an error already made once (kitchen printing).
    // ⚠️ Cut deliberately and NOT to be reinstated: "Stripe's fees are Stripe's, not ours" ("Stripe's own
    // charge" already says whose they are), "your actual rate is confirmed by Stripe", "more for cards
    // issued elsewhere" ("on UK and EEA cards" already limits the claim), and "Cash is always free"
    // (nobody thinks cash carries a platform fee). Each was a second statement of something already said.
    // ⚠️ ALSO CUT, AND NOT TO BE RESTORED (72 words -> 59):
    //   • "however you take the money" — the next two sentences enumerate exactly that.
    //   • "(Zettle, Square, etc.)" — examples of a thing every operator already owns.
    //   • "still 0% from us" — the opening sentence already says 0% on every plan, and repeating it
    //     invites the reader to go looking for the catch.
    // 🔴 "without a dedicated reader" IS NOT CUTTABLE. Removing it makes the tap surcharge read as though
    // it ALWAYS applies, overstating the cost for every truck that owns a reader. That is a false claim,
    // not a long one. This has now been re-established twice; do not revisit it.
    text: `Walk-up orders: HatchGrab charges 0% on every plan. Use your own card terminal and only your `
      + `provider's standard fees apply. Card payments through HatchGrab via Stripe are coming soon — `
      + `Stripe's own charge, currently around ${CARD_FEE_IN_PERSON_LABEL} on UK and EEA cards, plus `
      + `${TAP_TO_PAY_SURCHARGE_LABEL} per authorisation if you tap on a phone or tablet without a `
      + `dedicated reader.`,
  },
  {
    number: '2',
    text: `Online payments powered by Stripe Connect. Subject to 0.99% HatchGrab platform fee plus Stripe `
      + `card processing fees (~${CARD_FEE_ONLINE_LABEL} per transaction on standard UK cards).`,
  },
  {
    number: '3',
    // ⚠️ "An Apple iPad is recommended for the best experience." WAS REMOVED AND MUST NOT BE RESTORED.
    // It was a PREFERENCE STATED AS A FINDING. The full order flow has never been run on real hardware on
    // either platform, so there is no basis for preferring one — and on current evidence ANDROID is the
    // better-validated of the two: FCM push works and a token has landed, while iOS push has never
    // registered a token at all (§36). It also reads as second-class to a truck that already owns an
    // Android tablet, for no commercial gain.
    //
    // 🔴 DO NOT ADD "coming soon" HERE. The native apps are in the PRESENT TENSE deliberately: the landing
    // page describes the product AT LAUNCH, and neither app ships before both are ready. This is a
    // STANDING EDITORIAL RULE for the landing copy, not an oversight. (It is the opposite of footnote 1,
    // where "coming soon" is correct because Stripe walk-ups are a LATER addition to a shipped product.)
    text: 'Tablet not supplied. There are native kitchen apps for iPad and Android, and the kitchen screen also runs on any tablet with a modern browser.',
  },
  {
    number: '4',
    text: 'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong — you can view every message and reply yourself at any time.',
  },
  {
    number: '5',
    // PLATFORM-NEUTRAL, deliberately. It said "the HatchGrab iPad app"; it does NOT now say "iPad and
    // Android", because printing is not the same kind of claim as a build target. The recommended
    // backend ('mfi' — Star/Epson via Apple's External Accessory framework, lib/printing/transport.ts:6)
    // is iOS-only by construction, and the cross-platform path ('ble') is documented there as the budget
    // fallback with limited/no paper-out status. Naming Android here would underwrite that. "The
    // HatchGrab kitchen app" stays true whichever backend lands first.
    text: 'Kitchen ticket printing requires the HatchGrab kitchen app and a compatible thermal printer (neither supplied). Compatible printers listed in our help centre.',
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
  // ⚠️ Keyed on the ROW NAME, so renaming a row here without renaming it above silently drops that row
  // from findPlanParityViolations() — the guard stops checking and reports clean. Renamed with the merge.
  // The Feature key itself ('ipad_kds') is the ENFORCEMENT identifier in lib/features.ts and is NOT
  // renamed: it gates one KDS capability on both platforms, and changing it would need a data migration.
  'iPad and Android kitchen app': 'ipad_kds',
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
