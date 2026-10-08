export type Plan = 'starter' | 'pro' | 'max' | 'trial' | 'tester' | 'demo'

export type Feature =
  // Core — all plans
  | 'discovery_map'
  | 'web_dashboard'
  | 'ipad_kds'
  | 'qr_menu'
  | 'meal_deals'
  | 'upsells'
  | 'walkup_orders'
  | 'online_ordering_pay_at_hatch'
  | 'sold_out_toggle'
  | 'stock_countdown'
  // Pro
  | 'offline_protection'
  | 'online_payments'
  | 'advance_preordering'
  | 'time_slot_selection'
  | 'smart_batch_pacing'
  | 'auto_accept'
  | 'instagram_messenger_replies'
  | 'branded_qr_code'
  | 'advanced_reporting'
  // Max
  | 'ticket_printing'
  | 'multi_device_kds'
  | 'cook_screen'
  | 'whatsapp_replies'
  | 'embed_schedule'
  | 'schedule_graphics'
  | 'event_types'
  | 'private_events'
  /* ══ ⛔ TOMBSTONE · `places_posts_preview` — REMOVED AT LAUNCH (10 October 2026) ═══════════════════
   *
   * IT WAS A `Feature` IN NO PLAN SET AT ALL, held only through `trucks.feature_overrides`, and granted
   * to exactly one truck: test-kitchen ("Pizza Kitchen"). Its whole job was "is this surface finished
   * for this truck?" while Social media was being built — a second gate in front of the plan gate.
   *
   * 🔴 **SOCIAL MEDIA IS LAUNCHED, SO THE QUESTION IS GONE AND SO IS THE KEY.** Access follows the plan
   * now, through `schedule_graphics` below — the key the route's own comment already called *"may this
   * plan have social posts at all"*. ⛔ TWO KEYS FOR ONE PRODUCT WAS THE THING TO REMOVE, not to
   * re-tier: one of them had to go, and the one that goes is the one whose name says "preview".
   *
   * ⚠️ **THE DATABASE ROW IS LEFT ALONE AND IS NOW INERT.** `canAccess` only ever looks up a key it is
   * given, so `{"places_posts_preview": true}` in `feature_overrides` matches no `Feature` and changes
   * nothing — which is exactly why it is safe to leave it there rather than run an UPDATE.
   * 🔴 AND THAT IS ALSO WHY THE KEY WAS **REMOVED RATHER THAN PROMOTED INTO A PLAN SET.** Had it stayed
   * and joined `PRO_FEATURES`, Pizza Kitchen would still have been granted by its OVERRIDE — overrides
   * win before any plan is consulted — so the one truck used to check the launch would have been the
   * one truck not testing the new gate.
   */

const PRO_FEATURES: Feature[] = [
  'discovery_map',
  'web_dashboard',
  'ipad_kds',
  'qr_menu',
  'meal_deals',
  'upsells',
  'walkup_orders',
  'sold_out_toggle',
  'stock_countdown',
  'offline_protection',
  'online_payments',
  'advance_preordering',
  'time_slot_selection',
  'smart_batch_pacing',
  'auto_accept',
  'instagram_messenger_replies',
  'branded_qr_code',
  'advanced_reporting',
  'whatsapp_replies',   // Pro+Max — moved from Max-only: a Pro truck was sold WhatsApp replies and the gate silently blocked it (canAccess('pro',…)===false)
  // ── PRIVATE EVENTS — Pro, Max and trial (20261014) ───────────────────────────────────────────────
  // 🔴 IN `PRO_FEATURES` IS EXACTLY "Pro, Max and trial", for the reason 'schedule_graphics' records:
  // MAX_FEATURES spreads this array and TRIAL_FEATURES spreads MAX_FEATURES, so one entry here grants
  // all of pro / max / trial / tester / demo.
  //
  // 🔴 AND IT IS DELIBERATELY SPLIT FROM `event_types`, WHICH STAYS MAX-ONLY. They are the same SCREEN
  // and two different products:
  //   • `event_types` — making your own named presets, and the PRICES rows. Max.
  //   • `private_events` — the built-in Private type, the private link and its QR code. Pro.
  // So a Pro truck sees the Event types tab with Standard + Private and nothing else: "+ New event
  // type" and the PRICES rows carry a Max badge and refuse server-side. A single key could not express
  // that, and gating the tab on `event_types` would have hidden a Pro feature behind a Max wall.
  //
  // ⚠️ UNLIKE `embed_schedule` THIS NEEDS NO SECOND ENABLE COLUMN. `embed_schedule` publishes a surface
  // the moment it is on; this one publishes nothing until the truck ticks "Private event" on an event,
  // and until then every event has `is_private = false` and no token. The feature is INERT until the
  // truck acts, so the plan key alone is the whole gate — the same argument `event_types` makes.
  //
  // 🔴 CHECKED SERVER-SIDE ON EVERY ACTION, not only in the UI: app/api/manage/route.ts refuses to make
  // an event private without this key, and app/api/event-types/route.ts gates the link/QR row on it.
  // ⛔ AND A DOWNGRADE DOES NOT UNPUBLISH ANYTHING. An existing private event keeps `is_private` and its
  // token, so its link goes on working and its venue stays off the map — the screens go read-only
  // instead. Taking the gate as permission to RE-PUBLISH a wedding would be the worst possible reading
  // of a billing change.
  // ── SOCIAL MEDIA / THE POST DESIGNS — Pro, Max and trial (10 October 2026) ──────────────────────
  // 🔴 **THIS IS THE ONE KEY FOR SOCIAL MEDIA, AND IT MOVED FROM `MAX_FEATURES` TO HERE AT LAUNCH.**
  // `IN PRO_FEATURES` IS EXACTLY "Pro, Max and trial": `MAX_FEATURES` spreads this array and
  // `TRIAL_FEATURES` spreads `MAX_FEATURES`, so one entry grants pro / max / trial / tester / demo.
  // Starter does not have it, which is what the comparison table says.
  //
  // ⚠️ THE NAME IS HISTORICAL AND IS KEPT ON PURPOSE. It was coined when the feature was "schedule
  // graphics"; it gates the Social media tab, Create a post, Designs, Location settings, the "Make
  // post" row action, Tidy up places and every action in `/api/weekly-post`. 🔴 RENAMING A `Feature`
  // MEANS TOUCHING `trucks.feature_overrides` IN THE DATABASE, where an operator may already hold this
  // key — and the launch does not need that risk to be taken. The one place the name is user-visible
  // is nowhere: it is never shown.
  //
  // 🔴 **IT NOW CARRIES A MARKETING ROW, AND THE PARITY GUARD CHECKS IT.** `lib/plan-features.ts` maps
  // 'Social media posts' to this key, so `findPlanParityViolations()` compares the table's `pro: true,
  // max: true` against `canAccess` on every module load. ⛔ WHILE THE ROW WAS `true` WITH NO MAP ENTRY
  // IT WAS AN UNCHECKED PROMISE ON A PUBLIC PRICING PAGE — the file said so in as many words, and said
  // adding the entry alone would break the build. Adding it *with* this move is what makes it honest.
  //
  // ⚠️ IT NEEDS NO SECOND ENABLE COLUMN, for the reason `event_types` gives: the feature is INERT until
  // the truck acts. A truck that never uploads a blank has no design row, and every screen offers to
  // set one up rather than publishing anything.
  // 🔴 CHECKED SERVER-SIDE ON EVERY ACTION, not only in the UI — `gated()` is called once at the top of
  // `/api/weekly-post`'s POST and GET, so the renders, the saves, the uploads and the font file are all
  // behind it. The screen decides what is DRAWN; the route decides what is DONE.
  'schedule_graphics',
  'private_events',
]

const MAX_FEATURES: Feature[] = [
  ...PRO_FEATURES,   // includes whatsapp_replies now
  'ticket_printing',
  'multi_device_kds',
  'cook_screen',
  // ── /embed/<slug> — the schedule surface an operator frames on their own website. ──────────────
  // 🔴 THIS IS THE PLAN HALF OF A TWO-PART GATE AND IT IS THE WEAKER HALF. TRIAL_FEATURES below is
  // `[...MAX_FEATURES]`, so adding it here also grants it to plan 'trial', 'demo' and 'tester' — and
  // canAccess returns the trial set when trial_expires_at is NULL, which is what self-serve signup
  // writes (lib/provision-truck.ts:415). So a brand-new self-serve truck passes this check on day one.
  // The gate that actually bites is `trucks.embed_enabled`, NOT NULL DEFAULT false. Both must be true.
  // ⚠️ DELIBERATELY NOT ADDED TO lib/plan-features.ts. That file is presentation and gates nothing;
  // the marketing row ("Order page on your own website", currently 'coming_soon') is renamed in a
  // later stage. findPlanParityViolations() iterates MATRIX ROWS and `continue`s when a row has no
  // ROW_FEATURE_MAP entry, so a Feature with no row cannot produce a violation (plan-features.ts:384-386).
  'embed_schedule',
  // ── Event types — a named preset that supplies one event's SERVICE settings. ───────────────────
  // 🔴 MAX ONLY, SO MAX AND TRIAL. `TRIAL_FEATURES` below is `[...MAX_FEATURES]`, and `canAccess`
  // returns the trial set when `trial_expires_at` is NULL — which is what self-serve signup writes
  // (lib/provision-truck.ts:415) — so a brand-new self-serve truck passes this check on day one.
  // ⚠️ AND THAT IS ACCEPTED HERE, DELIBERATELY, UNLIKE `embed_schedule` ABOVE. That feature needed a
  // second `trucks.embed_enabled` gate because it PUBLISHES a surface the moment it is on. This one
  // publishes nothing: a truck that never creates a type has `event_types` empty and every event's
  // `event_type_id` NULL, so every resolver returns today's value. The feature is INERT until the
  // truck acts, so the plan key alone is the whole gate and a second enable column would be a switch
  // with nothing behind it.
  // 🔴 CHECKED SERVER-SIDE ON EVERY ACTION in app/api/event-types/route.ts, not only in the UI — the
  // screen decides what is DRAWN, the route decides what is DONE.
  'event_types',
]

const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]

// Single source of truth — what each plan includes
export const PLAN_FEATURES: Record<Plan, Set<Feature>> = {
  starter: new Set([
    'discovery_map',
    'web_dashboard',
    'ipad_kds',
    'qr_menu',
    'meal_deals',
    'upsells',
    'walkup_orders',
    'online_ordering_pay_at_hatch',
    'sold_out_toggle',
    'stock_countdown',
  ]),
  pro: new Set(PRO_FEATURES),
  max: new Set(MAX_FEATURES),
  trial: new Set(TRIAL_FEATURES),
  tester: new Set(MAX_FEATURES),
  // Demo = prospect-facing SANDBOX. Mirrors TRIAL's feature profile (full product access — menu, schedule,
  // ordering screens, KDS preview — so a prospect can try everything before signup). Distinct from Tester
  // (internal). ⚠️ FUTURE (demo-feature build, NOT here): a Demo-plan truck must be fully walled off from
  // the public VF/HG discovery queries — its activity must never surface publicly.
  demo: new Set(TRIAL_FEATURES),
}

// Base check — plan tier only, no overrides
export function hasFeature(plan: Plan, feature: Feature): boolean {
  if (plan === 'trial') {
    // Trial with no expiry context is treated as active — callers that have
    // expiry info should use hasFeatureWithContext instead
    return PLAN_FEATURES.trial.has(feature)
  }
  return PLAN_FEATURES[plan]?.has(feature) ?? false
}

// ── BATCH RESERVATIONS — THE PER-TRUCK SWITCH (P3, 18 September 2026) ─────────────────────────────
// ON iff trucks.feature_overrides->>'batch_reservations' = 'true' OR trucks.plan = 'demo'. OFF otherwise.
// It is NOT a Feature and never passes through canAccess: feature_overrides already carries one non-plan
// key (whatsapp_setup_preview, lib/whatsapp/setup-preview.ts) and canAccess only ever looks up a known
// Feature, so a second such key changes no entitlement, no parity check and no plan matrix — only the
// admin card's "(n active)" count, which the existing key already inflates. Resolved SERVER-SIDE from the
// truck row the routes already read (select('*') everywhere except /api/slots, which names the two
// existing columns) and carried in capacityInputs so web and device draw the same picture.
export function resolveBatchReservations(truck: { plan?: string | null; feature_overrides?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!truck) return false
  if (truck.plan === 'demo') return true
  const v = truck.feature_overrides && typeof truck.feature_overrides === 'object' ? (truck.feature_overrides as Record<string, unknown>)['batch_reservations'] : undefined
  return v === true || v === 'true'
}

// Full check — respects feature_overrides and trial expiry
export function canAccess(
  plan: Plan,
  feature: Feature,
  featureOverrides: Record<string, boolean> = {},
  trialExpiresAt: string | null = null
): boolean {
  // Per-truck override wins over everything
  if (feature in featureOverrides) {
    return featureOverrides[feature] === true
  }

  // ── TRIAL: A NULL EXPIRY MEANS "NOT STARTED", NOT "EXPIRED" (Y2, 4 August 2026) ────────────────
  // 🔴 THIS LINE USED TO READ `if (!trialExpiresAt) return false` AND THAT IS NOW WRONG BY DESIGN.
  // Self-serve signup provisions plan 'trial' with `trial_expires_at` NULL, because nomination — the
  // operator choosing which event starts their free trial — does not exist yet and is what sets the
  // date. Under the old expression every self-serve operator would have been denied EVERY feature the
  // moment they signed up: the product switched off for the only people it was being opened to.
  //
  // NULL therefore grants the trial feature set, which is exactly the access plan 'demo' granted these
  // trucks before the switch — so this is a rename of the pre-trial state, not a widening of it.
  //
  // ⚠️ THE EXPIRED BRANCH IS DELIBERATELY UNTOUCHED. A PAST date still denies everything. Whether an
  // expired trial should instead fall back to Starter's feature set is a real question and an open
  // decision — it is NOT settled here, and changing it in the same edit would have hidden a product
  // decision inside a provisioning change. See docs/plan-trial-report.md.
  if (plan === 'trial') {
    if (!trialExpiresAt) return PLAN_FEATURES.trial.has(feature)          // not started yet
    if (new Date(trialExpiresAt) <= new Date()) return false              // expired — UNCHANGED
    return PLAN_FEATURES.trial.has(feature)                               // running
  }

  return PLAN_FEATURES[plan]?.has(feature) ?? false
}

export function getPlanFeatures(plan: Plan): Set<Feature> {
  return PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter
}

// ── 🔴 THE MONTHLY PLAN PRICE, AS A NUMBER. STRUCTURED FIRST, DISPLAYED SECOND. ─────────────────────
// Added 23 August 2026, following the convention lib/plan-features.ts's CARD_FEES already established
// and whose comment tells the next person to follow it: "STRUCTURED VALUES, NOT DISPLAY STRINGS … the
// £1,500 / £2,000 allowances were defined only INSIDE display strings, so lib/payments cannot read a
// number and therefore cannot apply an allowance at all. Do not repeat that here."
// `PLAN_META.price` was exactly that mistake for the plan fee: '£29/mo' is unparseable arithmetic, so
// nothing could compute an annual cost, a saving, or a pro-rata charge without a regex over prose.
//
// ⚠️ PENCE, AS AN INTEGER, AND THE REASON IS NOT STYLE. It matches CARD_FEES (`pence: 20`), it matches
// `orders.total_minor` — which §16 records as "the authoritative charge amount in pence" — and it is the
// only representation that cannot accumulate a rounding error across twelve months of arithmetic.
// Money is an integer of the smallest unit everywhere else in this codebase; this is not the place to
// introduce a float.
//
// ⚠️ ONLY THE THREE PURCHASABLE TIERS. `trial`, `tester` and `demo` carry no monthly fee to express —
// their PLAN_META prices are the words 'Free trial', 'Lifetime' and 'Demo', which are not amounts and
// are not derived below. Inventing a number for them would be inventing a commercial fact.
export const PLAN_MONTHLY_PENCE: Record<'starter' | 'pro' | 'max', number> = {
  starter: 0,
  pro: 2900,
  max: 4900,
}

/** "£29/mo" — the ONLY place a monthly plan fee becomes a string. Pence are shown only when non-zero,
 *  so a future £29.50 renders correctly without this needing to be revisited. */
export function planPriceLabel(pence: number): string {
  const pounds = Math.floor(pence / 100)
  const rem = pence % 100
  return rem === 0 ? `£${pounds}/mo` : `£${pounds}.${String(rem).padStart(2, '0')}/mo`
}

// Plan display metadata — THE SINGLE SOURCE for plan name/price/description across the whole app: upgrade
// prompts AND the pricing / billing / landing tables. lib/plan-features.ts DERIVES PLAN_PRICES +
// PLAN_DESCRIPTIONS from this — do NOT re-hardcode those strings anywhere; that divergence was the drift
// (three text mismatches had already crept in between the two copies).
// ⚠️ `price` IS NOW ITSELF DERIVED for pro and max — see PLAN_MONTHLY_PENCE above. Change the NUMBER,
// never this string. `starter` keeps the literal word 'Free' because £0 displays as a word, not as
// '£0/mo', and that word is also what lib/pricing.ts's NON_SECRET_PRICE set matches on.
export const PLAN_META: Record<Plan, {
  name: string
  price: string
  description: string
}> = {
  starter: { name: 'Starter', price: 'Free',       description: 'Weekend traders & walk-up pitches' },
  pro:     { name: 'Pro',     price: planPriceLabel(PLAN_MONTHLY_PENCE.pro), description: 'Busy trucks scaling pre-orders' },
  max:     { name: 'Max',     price: planPriceLabel(PLAN_MONTHLY_PENCE.max), description: 'High-volume operations & festivals' },
  trial:   { name: 'Trial',   price: 'Free trial', description: 'All features included — Max tier + Pay at Hatch ordering' },
  tester:  { name: 'Tester',  price: 'Lifetime',   description: 'Pre-launch tester — full feature access, lifetime discount' },
  demo:    { name: 'Demo',    price: 'Demo',       description: 'Prospect sandbox — full trial before signup (never public)' },
}

// Maximum vans allowed per plan
export function maxVans(plan: Plan): number {
  if (plan === 'starter') return 1
  if (plan === 'pro') return 2
  return 999 // max / trial
}

// Which plan is needed for a given feature
export function requiredPlan(feature: Feature): Plan {
  if (PLAN_FEATURES.starter.has(feature)) return 'starter'
  if (PLAN_FEATURES.pro.has(feature)) return 'pro'
  return 'max'
}
