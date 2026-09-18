import { PLAN_META, canAccess, type Plan, type Feature } from '@/lib/features'
export type { Plan }

import { WHATSAPP_LIVE } from '@/lib/whatsapp-live'
// 🔴 THE FREE ALLOWANCE, IMPORTED RATHER THAN RETYPED. lib/whatsapp/reply-cap.ts has NO imports of its
// own, so this cannot create a cycle. Footnote 6 quotes this number; the Settings card quotes the same
// constant. A hand-typed "1,000" in the footnote would be a second source of truth for a figure Meta
// can change, on the one surface nobody re-reads.
import { META_FREE_REPLIES_PER_MONTH } from '@/lib/whatsapp/reply-cap'
// The two dates and the one number formatter. lib/whatsapp/copy.ts has NO imports of its own, so this
// cannot create a cycle either. 🔴 `formatLimit` rather than a local `.toLocaleString` call: the Settings
// card formats the same number with it, and two formatters is how "1,000" and "1000" end up on two
// surfaces describing one allowance.
import { META_PRICING_CHECKED_ON, META_FREE_ALLOWANCE_FROM, formatLimit } from '@/lib/whatsapp/copy'

/**
 * 🔴 THE WHATSAPP ROW LABEL, IN ONE PLACE. It is simultaneously the rendered row name, the
 * ROW_FEATURE_MAP key, and the row the parity checker singles out. Three literals that had to agree by
 * hand — and the file's own comment warned that renaming the row without the key "drops the row from
 * the parity check silently, and the check then reports clean". A const makes that impossible.
 * ⚠️ lib/landing-table.ts keys its overrides on this same string. Those are separate literals by
 * design (that module is render-only), so changing this value means changing them too.
 */
const WHATSAPP_ROW_NAME = 'WhatsApp auto-replies'

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

// ── 🔴 THE ONLINE-ORDER ALLOWANCE AND THE PLATFORM FEE, AS NUMBERS (23 August 2026) ─────────────────
// These are the values CARD_FEES' own comment names as the mistake it exists not to repeat: "the
// £1,500 / £2,000 allowances were defined ONLY INSIDE display strings, so lib/payments cannot read a
// number and therefore cannot apply an allowance at all." That is now fixed at the definition. Every
// string below is DERIVED; change a NUMBER, never a sentence.
//
// ⚠️ PENCE, INTEGER — the same convention as CARD_FEES.pence and `orders.total_minor` (§16: "the
// authoritative charge amount in pence"). An allowance is compared against order value, which is
// already pence, so anything else would need a conversion at every comparison site.
//
// 🔴 A DISCRIMINATED UNION, NOT A NULLABLE NUMBER, AND THAT IS THE POINT OF TASK 3. "No allowance"
// (starter) and "no ceiling" (trial) are DIFFERENT facts, and both would collapse to a falsy value if
// this were `number | null`. The manual records the cost of exactly that shape: a NULL trial expiry read
// as "expired" would have switched the product off for every self-serve signup, and was only correct
// once the code stopped asking `if (!trialExpiresAt)`. A consumer of this cannot write `if (!allowance)`
// — TypeScript makes them name which case they mean.
export type OnlineAllowance =
  | { kind: 'amount'; pence: number }   // a real ceiling, then PLATFORM_FEE_OVER_ALLOWANCE applies
  | { kind: 'none' }                    // no online-order allowance at all (Pay at Hatch)
  | { kind: 'unlimited' }               // uncapped; no platform fee to apply

// ⚠️ THE FOUR TIERS TRANSACTION_ROWS DOCUMENTS, AND NO MORE. `tester` and `demo` have NO published
// commercial position — no column in the fee table, no allowance sentence, nothing to derive from — so
// they are deliberately absent rather than guessed at. Adding them means deciding what they are sold as,
// which is a commercial decision and not a refactor. See the report.
export const PLAN_ONLINE_ALLOWANCE: Record<'trial' | 'starter' | 'pro' | 'max', OnlineAllowance> = {
  trial:   { kind: 'unlimited' },
  starter: { kind: 'none' },
  pro:     { kind: 'amount', pence: 150000 },
  max:     { kind: 'amount', pence: 200000 },
}

/** HatchGrab's own fee on online-order value ABOVE the plan allowance. 🔴 OURS, unlike CARD_FEES,
 *  which are Stripe's — do not merge the two constants for looking similar. */
export const PLATFORM_FEE_OVER_ALLOWANCE = { pct: 0.99 } as const

/** "0.99%" — the ONLY place the platform fee becomes a string. Mirrors feeLabel()'s treatment of pct:
 *  the number is interpolated as written, so 1.0 would render "1%" exactly as feeLabel already does. */
export function pctLabel(fee: { pct: number }): string {
  return `${fee.pct}%`
}

/** "£1,500" — grouped thousands. ⚠️ DELIBERATELY NOT toLocaleString: this string is compared
 *  byte-for-byte against the pre-refactor value, and locale/ICU availability differs between the build
 *  host and the browser. Manual grouping is deterministic everywhere. */
export function allowanceAmountLabel(pence: number): string {
  return '£' + String(Math.round(pence / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export const PLATFORM_FEE_LABEL = pctLabel(PLATFORM_FEE_OVER_ALLOWANCE)

/** The allowance in pence for a tier that has one. 🔴 EXISTS SO NOTHING BELOW RE-STATES A NUMBER —
 *  every derived string reads through this, so PLAN_ONLINE_ALLOWANCE stays the only place the amounts
 *  are written. It THROWS rather than falling back: if a future edit makes one of these tiers 'none' or
 *  'unlimited', this fails loudly at module load instead of rendering "£NaN" on the pricing table. */
export function allowancePenceFor(tier: 'pro' | 'max'): number {
  const a = PLAN_ONLINE_ALLOWANCE[tier]
  if (a.kind !== 'amount') {
    throw new Error(`[plan-features] PLAN_ONLINE_ALLOWANCE.${tier} is '${a.kind}', but a display string expects an amount.`)
  }
  return a.pence
}

// Included online-order allowance per plan (the £1,500 / £2,000 headline). Additive — Admin/Billing ignore
// it until they choose to render it; the landing table shows it under the price.
// ⚠️ DERIVED from PLAN_ONLINE_ALLOWANCE + PLATFORM_FEE_OVER_ALLOWANCE. `starter` stays a literal because
// 'Pay at Hatch' is a description of a MODEL, not a formatted amount, and lib/pricing.ts exempts it from
// the pre-launch mask via NON_SECRET_PRICE.
// 🔴 THE CAPITAL H IS LOAD-BEARING AND THIS LINE READ 'Pay at hatch' UNTIL 2 SEPTEMBER 2026.
// NON_SECRET_PRICE is a Set matched by EXACT STRING, and 'Pay at hatch' !== 'Pay at Hatch'. So the value
// this comment claimed was exempt was NOT exempt: every masked surface printed "TBC" for Starter's
// allowance — a plan whose whole point is that it costs nothing. The comment above asserted the match
// rather than checking it, and was wrong for as long as the line existed.
// ⚠️ CAPITAL H IS THE CANONICAL SPELLING. Every other occurrence in the codebase already used it —
// TRANSACTION_ROWS (:170), the protected row label (:185, :401), lib/features.ts:194, both Admin sites,
// both Manage sites and the landing's own prose. This line was the single outlier.
// ⚠️ NOTHING COMPARES THIS VALUE. Its only readers render it (app/landing/page.tsx:321 and the PDF
// route), so the change is display-only — and the display now matches the term used everywhere else.
export const PLAN_ALLOWANCES: Record<'starter' | 'pro' | 'max', string> = {
  starter: 'Pay at Hatch',
  pro: `First ${allowanceAmountLabel(allowancePenceFor('pro'))} of online orders included, then ${PLATFORM_FEE_LABEL}`,
  max: `First ${allowanceAmountLabel(allowancePenceFor('max'))} of online orders included, then ${PLATFORM_FEE_LABEL}`,
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
  // ⚠️ THE FOUR NUMERIC CELLS ARE DERIVED (23 August 2026). 'Unlimited', '—', 'Free' and 'Pay at Hatch'
  // stay literal: they are words describing a MODEL, not formatted amounts, and lib/pricing.ts matches
  // on those exact strings in NON_SECRET_PRICE to exempt them from the pre-launch mask.
  { name: 'Online orders included', footnote: '2', cells: { trial: 'Unlimited', starter: '—',            pro: allowanceAmountLabel(allowancePenceFor('pro')), max: allowanceAmountLabel(allowancePenceFor('max')) } },
  { name: 'Fee after that',         footnote: '2', cells: { trial: 'Free',      starter: 'Pay at Hatch', pro: PLATFORM_FEE_LABEL,  max: PLATFORM_FEE_LABEL  } },
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
      { name: 'Online ordering — Pay at Hatch', footnote: '1', detail: 'Customers order ahead online and pay in person when they collect.', starter: true, pro: false, max: false },
      // ── 🔴 RE-MERGED, 5 September 2026. ANDROID IS LIVE ON GOOGLE PLAY. ──────────────────────────
      // These were two rows — 'iPhone and iPad kitchen app' (true/true/true) and 'Android kitchen app'
      // (coming_soon ×3) — split on 1 September because iOS was approved and Android was still in
      // review, so one row could not state both truthfully. **That precondition is spent: both apps
      // are shipped.** The split row's own note set the condition for undoing it, and this is it:
      //     "Re-merge them the day Android ships, and not before — and if you do, DELETE the Android
      //      row rather than renaming this one, so the ROW_FEATURE_MAP entry below stays attached to
      //      the row that carries the real feature."
      // 🔴 THAT INSTRUCTION WAS FOLLOWED EXACTLY, AND IT MATTERS MORE THAN IT LOOKS. `FeatureRow` has
      // no id, so THE LABEL IS THE ROW_FEATURE_MAP KEY. Renaming this row without moving its map entry
      // in the same edit drops it from findPlanParityViolations() — the checker `continue`s on a row
      // with no entry, so it stops looking and **reports clean**. The entry at ROW_FEATURE_MAP was
      // re-keyed to the new label in this same change; both probes are in
      // docs/android-golive-landing-report.md.
      // ⚠️ THE ANDROID ROW WAS DELETED, NOT RENAMED. It never had a map entry (there is no
      // Android-specific Feature), so deleting it removes nothing the checker was watching.
      // 🔴 iPhone IS STILL NAMED FIRST AND DELIBERATELY. The kitchen app is the SAME app with the same
      // features on a phone, and Pizzeria Gusto run their service on phones rather than tablets —
      // naming only tablets under-claimed what a live operator does every day. Footnote 3 carries the
      // browser fallback and the "device not supplied" caveat for all three.
      { name: 'iPhone, iPad and Android kitchen app', footnote: '3', detail: 'The fullest way to run HatchGrab: a live kitchen screen, plus the only way to keep taking orders when you lose signal.', starter: true, pro: true, max: true },
    ],
  },
  {
    title: 'Online sales & automation',
    rows: [
      { name: 'Offline Order Protection',                      detail: "If your internet drops mid-service, orders are held safely and sync when you're back — you never lose one.", starter: false, pro: true,           max: true           },
      { name: 'Online payments',                  footnote: '2', detail: 'Take card payment upfront when customers order online, via Stripe.', starter: false, pro: true,           max: true           },
      { name: 'Advance pre-ordering',                         detail: 'Let customers order for a future date or time before the event.', starter: false, pro: true,           max: true           },
      // 🔴 PRE-ORDER DEADLINES — ADDED 2 SEPTEMBER 2026. WORDING SUPPLIED AND APPROVED BY THE OPERATOR;
      // it is not editorial and must not be "tidied". Placed immediately after Advance pre-ordering, on
      // request and because it is the same capability's second half: that row sells ordering ahead, this
      // one sells the cut-off that makes it safe to promise.
      // 🟢 THE FEATURE IS BUILT, BOTH HALVES — this row is not a claim ahead of the product:
      //   • enforced on the customer path by lib/preorder.ts, a PURE function called by BOTH the menu
      //     read (app/api/menu/[truckId]/route.ts:566-576) and submit (orders/submit/route.ts:535-540),
      //     so display and enforcement cannot diverge; also honoured by lib/orders/auto-accept.ts:91 and
      //     the card path in lib/payments/promote-draft.ts:288-291.
      //   • configurable in Manage today: master toggle, deadline type/value/action (page.tsx:8809-8826)
      //     and per-item inclusion (:8829-8843).
      // ⚠️ THE DETAIL DELIBERATELY STOPS AT THE CUT-OFF. It read "...Choose what happens after: the item
      // shows as sold out, or the order comes to you to approve." until 2 September 2026, when the
      // operator cut that second sentence. 🔴 DO NOT REINSTATE IT AS A TIDY-UP — the removal was the
      // instruction, not an omission.
      // 🟢 NOTHING WAS LOST IN ACCURACY. The cut sentence described `preorder_past_action`, which is
      // 'sold_out' | 'force_pending' and nothing else; the table now simply does not mention the choice.
      // Saying less than the product does is safe. If it is ever put back, those two ARE the only two
      // values (Manage labels them "Mark sold out" and "Allow, require approval") — so the sentence was
      // correct, just longer than wanted.
      // ⚠️ "cut-off time" COVERS BOTH KINDS. preorder_deadline_type is 'hours_before' (whole hours before
      // event start) or 'daily_cutoff' (a clock time on the event's date); an hours_before offset still
      // resolves to a time, so the wording does not exclude it.
      // 🔴 NO NEW Feature KEY, AND THAT IS DELIBERATE — see ROW_FEATURE_MAP below.
      { name: 'Pre-order deadline',                           detail: 'Set a cut-off time for items that need notice.', starter: false, pro: true,           max: true           },
      { name: 'Customer time slot selection',                 detail: 'Customers pick a collection time slot, spreading demand across your service.', starter: false, pro: true,           max: true           },
      { name: 'Smart Slot Management',                        detail: "Orders are paced across time slots to match your kitchen's capacity.", starter: false, pro: true,           max: true           },
      // 🔴 MOVED OUT OF 'CORE OPERATIONS' AND OFF STARTER — 2 September 2026, ON REQUEST.
      // Before: 'Core operations', starter TRUE. After: here, starter FALSE. Trial/Pro/Max unchanged.
      // 🟢 THE SECTION MOVE IS PART OF THE CHANGE, NOT TIDYING. 'Core operations' is the section whose
      // character is "what every plan gets" — every row in it is starter:true apart from the pay-at-hatch
      // row and the two coming-soon app rows. Leaving a starter:false row there makes the section stop
      // meaning anything. Every row in THIS section is starter:false, so it is where a paid-tier
      // capability belongs.
      // 🟢 NEXT TO SMART SLOT MANAGEMENT ON PURPOSE: the two are the same idea applied to different
      // resources — Smart Slot Management paces ORDERS against kitchen capacity, this paces ITEMS against
      // stock. Auto-accept follows because it is about handling orders, not pacing them.
      // ⚠️ STARTER IS NOT LEFT WITH NOTHING. 'Instant sold out toggle' stays in Core operations at
      // starter:true — the manual control — so the table still says what a Starter truck can do about
      // stock. If that row is ever moved or gated, this change becomes a silent removal.
      // 🔴 THE GATE IS DELIBERATELY NOT CHANGED HERE. lib/features.ts still grants 'stock_countdown'
      // to starter, so the table now says no while the code says yes. That is a KNOWN, ACCEPTED gap
      // being closed separately — see docs/stock-countdown-tier-report.md 4. It is safe only because
      // nothing is on Starter yet: the platform has not launched.
      { name: 'Automated stock countdown',                    detail: 'Set a stock count and it counts down as orders come in, then sells out automatically.', starter: false, pro: true,           max: true           },
      { name: 'Auto-accept online orders',                    detail: 'Online orders are accepted automatically — no need to confirm each one.', starter: false, pro: true,           max: true           },
      { name: 'Branded QR code',                              detail: 'Add your logo to your QR code.', starter: false, pro: true,  max: true  },
      // Auto-replies stay SPLIT across two rows. They USED to be split because WhatsApp was live and the
      // other two were not; as of 1 September 2026 ALL THREE are coming soon, so the split now carries a
      // different fact: WhatsApp is the one being built first. Do not re-merge them into one row — a
      // combined row loses that ordering, and re-merging is a decision to take deliberately, not a tidy-up.
      // 🟢 WHATSAPP IS LIVE SINCE 16 September 2026, when `WHATSAPP_LIVE` was set true for the first time
      // in a commit (lib/whatsapp-live.ts). The ON branch below is what now renders.
      // ⚠️ CORRECTING THE RECORD: a previous version of this comment said the row "moved BACK to
      // pro: true, max: true" on 4 September 2026. It did not — that change lived in an unstaged working
      // tree and was never committed (docs/whatsapp-landing-revert-report.md established this on
      // 8 September). Both branches were then preserved behind the switch, which is why the flip is a
      // one-line change today rather than a copy rewrite.
      // 🔴 FLIP BOTH OR NEITHER. This row and that flag are two halves of one statement — the operator's
      // Connect control and the public matrix must never disagree about whether the feature exists.
      // 🟢 THE GATE ALREADY MATCHED AND DID NOT MOVE. lib/features.ts:51 grants `whatsapp_replies` to Pro,
      // :55 spreads it into Max and :72 into trial/tester/demo — so `pro: true, max: true` is exactly what
      // the gate enforces, and the recorded marketing-vs-gate gap is closed rather than papered over.
      // 🔴 THIS ROW IS SINGLED OUT BY findPlanParityViolations(), IN BOTH DIRECTIONS (16 September 2026).
      // The checker used to inspect only cells that are literally `true`, so while this row read
      // 'coming_soon' it passed VACUOUSLY — the one row with a "flip both or neither" rule was the one
      // row the check could not see. It now also fails when a cell says 'coming_soon' while the flag is
      // true, and when a cell says live while the flag is false.
      // 🟢 RENAMING IS NO LONGER A SILENT HAZARD. The label, the ROW_FEATURE_MAP key and the checker's
      // test all read WHATSAPP_ROW_NAME, so they cannot drift apart by hand.
      // ⚠️ lib/landing-table.ts still keys its render-only overrides on the same string as separate
      // literals; changing WHATSAPP_ROW_NAME means changing those too.
      // ⚠️ FOOTNOTE '4' IN BOTH BRANCHES, AND THE NUMBER NO LONGER MOVES WITH THE FLAG (16 September
      // 2026). This row briefly pointed at a WhatsApp-only footnote 6 while live, because a row carries
      // exactly ONE footnote (`FeatureRow.footnote?: string`) and the shared footnote 4 could not carry
      // Meta's charges without claiming billing for the Messenger & Instagram row below it. That is
      // resolved by making footnote 4's TEXT conditional instead of the row's NUMBER: see FOOTNOTES.
      // 🟢 SO THE ONLY THING THE FLAG CHANGES HERE IS THE CELLS. Both branches are otherwise identical,
      // which is deliberate — it is now impossible for the marker and the footnote to disagree.
      // 🔴 BEHIND THE SINGLE SWITCH (lib/whatsapp-live.ts). OFF is byte-identical to what production
      //    rendered at 08ac368: footnote '4', coming_soon on both tiers. ON is the go-live row.
      WHATSAPP_LIVE
        ? { name: WHATSAPP_ROW_NAME,                  footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true, max: true }
        : { name: WHATSAPP_ROW_NAME,                  footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      // Coming soon (kept at the bottom of the section)
      { name: 'Messenger & Instagram auto-replies', footnote: '4', detail: 'Same as WhatsApp auto-replies, for Messenger and Instagram enquiries.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      // 🔴 MOVED HERE FROM THE PAYMENTS SECTION, AND FOOTNOTED. It sits with the other coming-soon
      // rows rather than among the shipped payment ones, so the block the file calls "Coming soon
      // (kept at the bottom of the section)" stays true of every row in it.
      // ⚠️ FOOTNOTE 1 IS THE CARD-FEE ONE — the single place the in-person rate, the UK/EEA limit and
      // the tap surcharge live. This row takes a card in person, so it is governed by exactly those
      // facts and points at the same footnote rather than restating any of them.
      // 🔴 "A SUPPORTED PHONE", NEVER "PHONE OR TABLET". Tap to Pay on iPhone needs a recent iPhone, a
      // current iOS and an Apple entitlement, and is NOT available on iPad — an iPad still needs a
      // physical reader. Widening this to tablets would advertise something that cannot work.
      // ⚠️ AND NO DEVICE OR OS VERSION IS NAMED. Marketing copy that says "iPhone XS or later on iOS 17+"
      // is wrong the moment either moves; "supported" stays true and the requirement is checked in-product.
      // ⚠️ NOT 'Walk-up order processing' AND NOT 'Online payments'. That row is taking the ORDER at the
      // hatch (and its detail names the operator's OWN terminal, which this would replace); this one is
      // taking the CARD in person, on the phone itself. 'Online payments' is the customer paying upfront
      // through Stripe before they arrive. Three different moments, three rows.
      { name: 'Take payment on your phone', footnote: '1', detail: 'Take card payments on a supported phone, so you don\u2019t need a separate card machine.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'Advanced reporting', detail: 'Break sales down by date range, item and event to see what’s really selling.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
      { name: 'SMS order alerts', detail: "Text customers automatically when their order's ready. Will carry an additional charge (price to be confirmed).", starter: false, pro: 'coming_soon', max: 'coming_soon' },
    ],
  },
  {
    title: 'Max tier',
    rows: [
      { name: 'Multi-device kitchen sync', detail: 'Run several screens — front counter and kitchen — all showing the same live orders.', starter: false, pro: false, max: true           },
      { name: 'Multi-user access',         detail: 'Give staff their own logins with the right level of access.', starter: false, pro: false, max: true           },
      // ── MOVED HERE 29 August 2026, AND IT IS THE ONE ROW THAT MOVED. ────────────────────────
      // Previously last-but-one in this section, below 'Event & festival pricing'. Every other row holds
      // its position relative to every other — only this one was lifted.
      // ✅ AND THE SECTION'S "coming-soon rows last, in the data itself" CONVENTION STILL HOLDS. The move
      // put a `coming_soon` row above a hard-`true` one and briefly broke it; the flip to `true` below
      // restored it. Max tier now reads ✓ ✓ ✓ ✓ then Coming soon × 3 — still a block, not an interleave.
      //
      // 🔴 THE PAGE IS SERVED AT THEIR ADDRESS. IT IS NOT AN EMBED. The detail deliberately avoids
      // "built into your site", "embedded" and "inside your website" — none of those is what this is,
      // and a marketing string that promises an embed is a promise the product would have to keep.
      // ⚠️ NOT THE QR CODE AND NOT THE ORDER LINK, both of which operators already have on every plan
      // ('QR code' → qr_menu above). Those point AT our address; this one IS theirs.
      // ⚠️ RENAMED 29 August 2026 from 'Order page on your own website'. The surface serves a SCHEDULE
      // whose order button deep-links back to ours — it is not an ordering page at their address, and the
      // old name promised one. 🔴 THE LABEL IS THE JOIN KEY (FeatureRow has no `id`): it is the
      // ROW_FEATURE_MAP key, the isRowComingSoon() key in Manage, and the trialFeatureValue() key on the
      // landing table.
      // ⚠️ THE SENTENCE THAT STOOD HERE — "This row appears in NONE of the three, so the rename moved no
      // key" — WAS TRUE ONLY FOR THE 29 AUGUST RENAME, AND WENT STALE THE SAME DAY: the flip to `true`
      // added the ROW_FEATURE_MAP entry below in that same change. It is corrected rather than deleted
      // because it is exactly the assumption a later rename would inherit and be wrong about. THE ROW
      // NOW CARRIES A MAP KEY, and the 3 September rename moved it — see the block on the row itself.
      // 🔴 FLIPPED 'coming_soon' → true, 29 August 2026, ON AN EXPLICIT OPERATOR DECISION that reversed
      // this workstream's own brief ("IT STAYS coming_soon"). Recorded because the reversal is the whole
      // history of this cell: the card bullet had its Coming-soon badge removed first, which left the
      // pricing card and the comparison table on ONE page disagreeing, and this closes that gap.
      // 🔴 THE ROW_FEATURE_MAP ENTRY WENT IN THE SAME CHANGE, and it had to. The parity checker only
      // inspects hard-`true` cells AND only rows carrying a map entry — with the flip but no entry, this
      // row would be advertised as included with nothing whatsoever verifying it. See 'Your schedule at
      // your own website' → 'embed_schedule' below. canAccess('max','embed_schedule') is true (EXECUTED).
      // ⚠️ WHAT THE TICK DOES NOT PROVE. The checker binds MARKETING to the GATE, never either to
      // REALITY, and this feature has never served a page from a real domain in production. There is also
      // a SECOND gate the matrix cannot see: `trucks.embed_enabled`, NOT NULL DEFAULT false
      // (lib/features.ts:64, app/api/embed/events/route.ts:70). A Max truck reading this tick still gets
      // the fallback page until that column is set for them by domain_provision.
      // 🔴 REWORDED 3 SEPTEMBER 2026. WORDING SUPPLIED AND APPROVED BY THE OPERATOR — not editorial,
      // do not "tidy" it. Was: 'Your schedule at your own website' / 'Your upcoming dates on a page at
      // your own address, under your own name.' Cells, footnote (none) and position are UNCHANGED; this
      // is copy only.
      // 🔴 THE LABEL IS A JOIN KEY AND THE RENAME MOVED IT. FeatureRow has no `id`, so the NAME is the
      // key in ROW_FEATURE_MAP (→ 'embed_schedule', renamed in the SAME edit below), and would also be
      // the key in isRowComingSoon(), trialFeatureValue(), DETAIL_OVERRIDES, NAME_OVERRIDES and
      // HIDDEN_ROWS. Grepped: this row appears in ROW_FEATURE_MAP ONLY — the other five do not name it.
      // ⚠️ A RENAME THAT LEAVES A STALE MAP ENTRY IS SILENT. findPlanParityViolations() does
      // `if (!feature) continue`, so the row would simply stop being checked, with no error anywhere.
      // 🟢 THE COPY WAS CHECKED AGAINST THE CODE BEFORE IT WENT IN, and both halves hold:
      //   • "on your own website" — HatchGrab SERVES this page at the operator's own domain (typically a
      //     subdomain they point at us, e.g. schedule.theirtruck.co.uk). proxy.ts rewrites '/' to
      //     app/domain/page.tsx for a custom host, so the address bar stays theirs throughout. 🔴 IT IS
      //     NOT AN EMBED — the public iframe route was DELETED at V11.49; /api/embed/events survives only
      //     as this page's data source and its name is historical.
      //   • "links straight through to its order page" — EXACT, and per-event, not generic.
      //     components/TruckListCard.tsx:194 builds each date's CTA as
      //     `/trucks/<slug>/order?event_id=<that event's id>` on hatchgrab.com, target="_blank" so
      //     payment happens top-level on our origin. The page LINKS to ordering; it does not order.
      // ⚠️ THE ONE PHRASE TO WATCH: the previous detail deliberately avoided "built into your site",
      // "embedded" and "inside your website", because promising an embed is a promise the product would
      // have to keep. "on your own website" is close to that line — flagged to the operator, who owns
      // the wording. It is NOT a description of an embed today; if the product ever gains one, this line
      // needs re-reading rather than extending.
      { name: 'Schedule page on your own website', detail: 'Show your upcoming dates on your own website. Each one links straight through to its order page.', starter: false, pro: false, max: true },
      // ── 🔴 MOVED INTO THE MAX TIER SECTION, 3 SEPTEMBER 2026, ON THE OPERATOR'S INSTRUCTION. ──────
      // It was added on 3 September in 'Online sales & automation' (between 'Auto-accept online orders'
      // and 'Branded QR code') as a Pro feature. When the cells went Pro -> Max-only it became the ONLY
      // Max-only row outside this section — every other one (Multi-device kitchen sync, Multi-user
      // access, the schedule page, Kitchen ticket printing) already lived here — so it was moved.
      // 🟢 PLACED DIRECTLY ABOVE 'Kitchen ticket printing' (operator's placement, 3 September 2026 — it
      // was briefly below), AND THAT ADJACENCY IS THE REASON GIVEN: the same busy van prints tickets
      // carrying BUZZER <n> in large type (lib/printing/ticket.ts:250-254). Buzzers are a busy-van
      // problem and Max is the busy-van plan. ⚠️ Keep the two rows TOGETHER if either ever moves.
      // ✅ THE SECTION'S "coming-soon rows last, in the data itself" CONVENTION IS PRESERVED. It goes at
      // the END of the hard-`true` block, not after the coming_soon rows: Max tier now reads
      // ✓ ✓ ✓ ✓ ✓ then Coming soon x 3 — still a block, not an interleave.
      //
      // 🟢 THE FEATURE IS BUILT, AND FULLY: assignment from BOTH operator surfaces (the board's bell
      // chip, components/dashboard/OrderCard.tsx:724-732, and the KDS grid, components/dashboard/
      // BuzzerGrid.tsx), through one atomic server action (assign_buzzer_atomic, migration 20260804),
      // displayed on the board and printed on the kitchen ticket. The rack size is an operator setting
      // (truck_vans.buzzer_count) and the setup wizard asks for it as Q5 of its review step.
      // 🟢 THE COPY DESCRIBES THE WHOLE FEATURE. The customer NEVER sees a buzzer number — grepped the
      // order page, the submit route, the emails, Twilio and WhatsApp: zero references. So "so you know"
      // is exactly right and no customer-facing half is being left out.
      // 🔴 WORDING SUPPLIED AND APPROVED BY THE OPERATOR; not editorial, do not "tidy" it.
      //
      // 🔴 THIS ROW HAS NO GATE. THE TABLE EXCLUDES **STARTER AND PRO**. THE CODE ENFORCES NEITHER.
      // There is NO Feature key for buzzers in lib/features.ts and NO canAccess/hasFeature call anywhere
      // guards buzzer behaviour — app/api/dashboard/action/route.ts, which owns the set_buzzer handler,
      // contains ZERO canAccess( calls in the whole file. So a Starter OR Pro truck can use buzzers in
      // full today while this table says both are excluded. That is DELIBERATE, NOT AN OVERSIGHT:
      // feature gating is being done separately. It is safe only because nobody is on Pro or Max — the
      // platform has not launched. A key was NOT invented for it: an unenforced key gates nothing while
      // passing the parity checker vacuously, which the manual already records five times over.
      // ⚠️ CONSEQUENCE: there is no ROW_FEATURE_MAP entry, so findPlanParityViolations() hits
      // `if (!feature) continue` and SKIPS this row entirely. A clean parity run says NOTHING about this
      // row. Do not read one as evidence that the tiers are enforced.
      // ⚠️ TRIAL IS NOT STORED ON THE ROW. trialFeatureValue() (lib/landing-table.ts:41-45) returns
      // row.max for every row bar two named exceptions, and this is neither — so Trial follows max and
      // keeps the feature. Cells read: Trial ✓ · Starter — · Pro — · Max ✓.
      { name: 'Buzzer tracking',           detail: 'Give an order a buzzer number when you hand one out, so you know which buzzer belongs to which order.', starter: false, pro: false, max: true },
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
      { name: 'Kitchen ticket printing',  footnote: '5', detail: 'Print order tickets to a Bluetooth or wired printer in the kitchen.', starter: false, pro: false, max: true },
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
    text: `Online payments powered by Stripe Connect. Subject to ${PLATFORM_FEE_LABEL} HatchGrab platform fee plus Stripe `
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
    // ⚠️ "Device not supplied", NOT "Tablet not supplied", AND THE CHANGE IS FORCED BY THE ROW ABOVE.
    // With iPhone named, a footnote framed entirely around tablets would list a phone app and then say
    // the fallback runs "on any tablet" — which invites the reader to ask why a phone app is in a tablet
    // footnote. The caveat is about not supplying HARDWARE; it was never about tablets specifically.
    // 🟢 "with Android coming soon" REMOVED 5 September 2026 — the Android app is live on Google Play.
    // Both apps are shipped, so both are present tense, which is what the standing rule above requires.
    text: 'Device not supplied. There are native kitchen apps for iPhone, iPad and Android, and the kitchen screen also runs on any phone or tablet with a modern browser.',
  },
  {
    // 🔴 THE FINAL CLAUSE WAS REMOVED 4 September 2026 AND MUST NOT COME BACK. It read
    // "— you can view every message and reply yourself at any time", and BOTH halves were false:
    // `whatsapp_logs` stores `message_in`/`response_sent` and NO surface renders either (verified by
    // search: the only reads are a Reports count on classification flags and the greeting timestamp
    // check), and "reply yourself" needs coexistence, which is unbuilt. It was the sharpest false claim
    // in the product's pricing copy, and it rendered to prospects, operators and admin alike.
    // ⚠️ IT DELIBERATELY DOES NOT POINT AT THE SETTINGS PREVIEW. The preview sits INSIDE the
    // `!isNativeApp()` wrapper that hides the whole Auto-replies card (app/manage/[token]/page.tsx:9642
    // opens it, :9834 closes it, the preview is at :9719), so it does not exist for an iPad or Android
    // operator — and this footnote renders to them on the Billing tab.
    // ⚠️ THIS FOOTNOTE SERVES **BOTH** AUTO-REPLY ROWS AGAIN (16 September 2026). WhatsApp briefly had
    // its own footnote 6; that split is undone and 6 is gone. See the note on the text below for why one
    // footnote can now carry both rows when it previously could not.
    number: '4',
    // ── 🔴 ONE FOOTNOTE, TWO ROWS, AND THE TEXT MOVES WITH THE FLAG. ────────────────────────────────
    // A row carries exactly ONE footnote (`FeatureRow.footnote?: string`), so a shared footnote must be
    // true of EVERY row pointing at it. That is what forced the split in the first place: while WhatsApp
    // was live and this text was static, putting Meta's charges here would have claimed billing for the
    // Messenger & Instagram row, which is unbuilt and bills nothing.
    // 🟢 WHAT CHANGED IS THE CONDITION, NOT THE RULE. The billing sentences appear only when
    // WHATSAPP_LIVE is true — which is exactly when a row pointing here can actually be billed — and the
    // opening clause was already platform-neutral ("a Business account on each platform"), so it stays
    // true of both rows in both states. The ONE claim that is WhatsApp-specific is the billing, and it
    // is now the only part that is conditional.
    // ⚠️ IT IS STILL SLIGHTLY OVER-BROAD WHEN LIVE, AND THAT IS ACCEPTED AND RECORDED. A reader of the
    // Messenger & Instagram row sees a footnote naming WhatsApp billing. It names WhatsApp explicitly
    // rather than saying "the platform bills you", so it cannot be read as a claim ABOUT Messenger or
    // Instagram — and those rows say "Coming soon", so nothing is promised about them anyway.
    // 🔴 OFF-BRANCH IS BYTE-IDENTICAL TO THE PREVIOUS STATIC STRING. Do not "simplify" it into the
    // template literal: with the flag off this footnote must claim nothing about charges at all.
    text: WHATSAPP_LIVE
      // 🔴 EVERY WORD OPERATOR-SUPPLIED AND EXACT. Do not tidy it, reorder the clauses or "improve" the
      // punctuation — the semicolon in "Correct at <date>; Meta may change" is deliberate, and so is
      // "check with Meta" rather than a link: this string is printed into the features PDF as well as
      // the page, and a PDF cannot be clicked.
      // 🔴 NOTHING IN IT IS A LITERAL. Both dates and the allowance are interpolated, because the same
      // three constants render the Settings billing summary — and the one thing worse than a stale date
      // on a pricing surface is two surfaces carrying DIFFERENT stale dates.
      ? `Auto-replies require a Business account on each platform. Meta, not HatchGrab, bills your WhatsApp account for replies. From ${META_FREE_ALLOWANCE_FROM} the first ${formatLimit(META_FREE_REPLIES_PER_MONTH)} a month are free. Correct at ${META_PRICING_CHECKED_ON}; Meta may change its prices, so check with Meta. Replies are AI-generated and can occasionally be wrong.`
      : 'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong.',
  },
  {
    number: '5',
    // PLATFORM-NEUTRAL, deliberately. It said "the HatchGrab iPad app"; it does NOT now say "iPad and
    // Android", because printing is not the same kind of claim as a build target. The recommended
    // backend ('mfi' — Star/Epson via Apple's External Accessory framework, lib/printing/transport.ts:6)
    // is iOS-only by construction, and the cross-platform path ('ble') is documented there as the budget
    // fallback with limited/no paper-out status. Naming Android here would underwrite that. "The
    // HatchGrab kitchen app" stays true whichever backend lands first.
    text: 'Kitchen ticket printing requires the HatchGrab kitchen app and a compatible Bluetooth or wired printer (neither supplied). Compatible printers listed in our help centre.',
  },
  // 🔴 THERE IS NO FOOTNOTE 6, AND THE NUMBERING STOPS AT 5 IN BOTH FLAG STATES (16 September 2026).
  // It existed only while WHATSAPP_LIVE was true and carried the WhatsApp billing text; that text has
  // moved into footnote 4, which both auto-reply rows now share.
  // 🔴 NUMBERING IS LOAD-BEARING — DO NOT RENUMBER OR REORDER THIS ARRAY TO "TIDY UP". `hide_pricing`
  // masks the pricing footnote by the magic string `f.number !== '2'` (docs/reference-manual.md §44);
  // renumbering would silently unmask it with no error, no type failure and no test. Removing 6 is safe
  // precisely because it was LAST and CONDITIONAL: 1-5 do not move, in either state.
  // ⚠️ 6 IS NOW FREE AGAIN. If a future footnote needs a number, append 6 — do not insert.
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
  // 🔴 RE-KEYED 5 September 2026, IN THE SAME EDIT AS THE ROW RENAME. The label IS the key — a rename
  // here that lags the row silently removes it from findPlanParityViolations(), which then reports
  // clean because it is no longer looking. The Feature ('ipad_kds') is unchanged: it is the same app.
  'iPhone, iPad and Android kitchen app': 'ipad_kds',
  'Offline Order Protection': 'offline_protection',
  'Online payments': 'online_payments',
  'Advance pre-ordering': 'advance_preordering',
  // 🔴 MAPPED TO THE EXISTING GATE, NOT A NEW ONE. `advance_preordering` is what actually enforces
  // this on the customer path — orders/submit/route.ts:535 reads exactly that key before any deadline
  // logic runs, so a separate 'preorder_deadlines' Feature would gate nothing.
  // ⚠️ INVENTING ONE WOULD MAKE A SIXTH UNENFORCED GATE. The manual already records five keys with zero
  // canAccess sites as a problem; adding a key that no code checks would advertise a control that does
  // not exist and would pass the parity checker vacuously.
  // 🟢 TWO ROWS SHARING ONE KEY IS FINE HERE: findPlanParityViolations looks the key up PER ROW, so
  // both rows are checked against the same grant — and both carry the same starter/pro/max values, so
  // they cannot drift apart without the checker seeing it.
  'Pre-order deadline': 'advance_preordering',
  'Customer time slot selection': 'time_slot_selection',
  'Smart Slot Management': 'smart_batch_pacing',
  'Auto-accept online orders': 'auto_accept',
  'Branded QR code': 'branded_qr_code',
  [WHATSAPP_ROW_NAME]: 'whatsapp_replies',
  'Messenger & Instagram auto-replies': 'instagram_messenger_replies',
  'Advanced reporting': 'advanced_reporting',
  'Multi-device kitchen sync': 'multi_device_kds',
  // 🔴 ADDED 29 August 2026 IN THE SAME CHANGE AS THE CELL FLIP TO `true`, AND THAT PAIRING IS THE
  // WHOLE POINT. findPlanParityViolations() `continue`s on any row with no entry here, so a row flipped
  // to hard-`true` without its entry is advertised as included and checked by nothing. The manual records
  // this exact trap (§4) — it is why the row was left 'coming_soon' for as long as it was.
  // ⚠️ The Feature key is 'embed_schedule', NOT a new one: lib/features.ts:69 already carries it in
  // MAX_FEATURES, and its comment there predicted this rename. Keyed on the CURRENT row name.
  // 🔴 RE-KEYED 3 SEPTEMBER 2026 with the row's rename, in the SAME edit — was
  // 'Your schedule at your own website'. THIS KEY AND THE ROW'S `name` MUST MATCH CHARACTER FOR
  // CHARACTER. They are joined by exact string and nothing checks the join: a stale key here does not
  // error, it makes findPlanParityViolations() `continue` past the row and quietly stop checking it.
  'Schedule page on your own website': 'embed_schedule',
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
        // ── DIRECTION 1 — EVERY ROW, UNCHANGED. Advertised as a hard tick but the gate refuses it.
        if (row[tier] === true && !canAccess(tier, feature)) {
          out.push(`"${row.name}" advertised for ${tier} but canAccess('${tier}','${feature}') is false`)
        }

        // ── DIRECTION 2 — THE WHATSAPP ROW ONLY ───────────────────────────────────────────────────
        // 🔴 WHY ONLY THIS ROW. The reverse test — "the gate allows it, so the table must tick it" — is
        // WRONG as a general rule. A feature can legitimately be gated on and deliberately unadvertised
        // (soft launch, an internal capability, a row still being written), and applying this to every
        // row would turn each of those into a build-breaking error at module load. This row is different
        // because it has a PUBLISHED SWITCH: WHATSAPP_LIVE is a single declaration that is supposed to
        // make the gate, the matrix, the landing tile and the Settings control agree. That promise is
        // exactly the thing worth enforcing, and it is enforceable precisely because the switch exists.
        //
        // 🔴 AND WHY IT IS NEEDED AT ALL. Until now this row passed VACUOUSLY: the check only ever
        // inspected cells that are literally `true`, and while the flag was off the cells read
        // 'coming_soon' — so the one row with a documented "flip both or neither" rule was the one row
        // the checker could not see. It reported clean on a state it had never actually tested.
        if (row.name !== WHATSAPP_ROW_NAME) continue

        if (WHATSAPP_LIVE) {
          // A coming-soon cell while the product says the feature is live. This is the half that would
          // leave the public matrix saying "coming soon" under a Settings page offering Set up.
          if (row[tier] === 'coming_soon') {
            out.push(`"${row.name}" is 'coming_soon' for ${tier} but WHATSAPP_LIVE is true`)
          }
          // The gate allows it, so the table must say so rather than nothing.
          if (canAccess(tier, feature) && row[tier] !== true) {
            out.push(`"${row.name}" is not advertised for ${tier} but canAccess('${tier}','${feature}') is true and WHATSAPP_LIVE is true`)
          }
        } else {
          // 🔴 THE OTHER DIRECTION OF THE SAME PROMISE. A live cell while the flag is off would
          // advertise on the pricing table what the Settings card still calls coming soon — the exact
          // mismatch the 8 September investigation was commissioned to prevent.
          if (row[tier] === true) {
            out.push(`"${row.name}" advertised as live for ${tier} but WHATSAPP_LIVE is false`)
          }
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
