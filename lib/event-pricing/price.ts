// lib/event-pricing/price.ts — WHAT AN ITEM COSTS AT AN EVENT. Pure, integer pence, one copy.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE RULE, ONCE, FOR EVERY SURFACE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//     effective = the EVENT's own prices (when it has them)
//              ?? the TYPE's prices       (when its "Change prices" switch is on)
//              ?? the MENU price
//
// and within whichever of those applies:
//
//     effective = that setup's TYPED price for this item  ??  that setup's RULE applied to the menu price
//
// ⚠️ `??` AND NEVER `||`, FOR THE REASON lib/event-types/resolve.ts gives: a typed price of £0 is a
// real instruction ("this is free at festivals") and `||` reads it as unset.
//
// ── 🔴 WHY THIS FILE IS PURE, AND WHY THERE IS EXACTLY ONE OF IT ──────────────────────────────────
// Five surfaces have to agree to the penny: the menu API (what the customer is shown), the submit
// route (what they are charged), the walk-up panel (what the operator is charged at the hatch), the
// Event types grid (what the operator is PROMISED they will be charged) and the dashboard sheet
// (where they set it). A second implementation anywhere means a screen that quotes £11 for an order
// that bills £11.05, and nothing to catch it — the exact class of defect
// lib/order-repricing.ts's header was written about. `lib/event-pricing/read.ts` does the reading;
// this decides. No database, no network, no clock, no React.
//
// ── 🔴 INTEGER PENCE THROUGHOUT, AND THE FLOAT TRAP IS THE WHOLE REASON ───────────────────────────
// Every price in this product is stored as `numeric` POUNDS (menu_items_db.price, bundles_db.
// bundle_price, modifier_options.price_adjustment — all pounds, not pence). In IEEE-754 doubles
// 1.15 * 100 is 114.99999999999999 and 0.1 + 0.2 is 0.30000000000000004, so pounds arithmetic on a
// percentage uplift drifts by a penny in a way no test over round numbers would ever show.
//
// So: convert to pence ONCE at the boundary (`toPence`), do every operation on integers, and convert
// back ONCE (`toPounds`). `toMinor`/`fromMinor` in lib/order-repricing.ts are the same pair for the
// same reason, and this module deliberately mirrors their shape rather than inventing a third
// convention. ⚠️ NEVER open-code `* 100` or `/ 100` at a call site.

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE VOCABULARY
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The five things a price rule can be. `'none'` is NOT "no rule" — it means **typed prices only**:
 * the setup is on, the operator has not asked for an across-the-board change, and the per-item
 * prices they typed are the whole of it.
 *
 * ⚠️ THE ABSENCE OF A RULE IS `null`, WHICH IS A DIFFERENT THING. A type whose switch is off, or an
 * event with no own prices, has no setup at all and resolves to the menu — see `resolvePricing`.
 */
export const PRICE_MODES = ['none', 'add_gbp', 'add_pct', 'sub_gbp', 'sub_pct'] as const
export type PriceMode = (typeof PRICE_MODES)[number]

/** The three roundings, exactly as the migration's CHECK constrains them. */
export const PRICE_ROUNDINGS = ['none', 'nearest_1', 'up_1'] as const
export type PriceRounding = (typeof PRICE_ROUNDINGS)[number]

export const isPriceMode = (v: unknown): v is PriceMode => PRICE_MODES.includes(v as PriceMode)
export const isPriceRounding = (v: unknown): v is PriceRounding => PRICE_ROUNDINGS.includes(v as PriceRounding)

/**
 * ⚠️ A `%` MODE SHOWS "%" AND A `£` MODE SHOWS "£", AND THE SCREENS READ IT FROM HERE.
 * The Amount box's suffix was going to be a ternary in two components; one function means the grid
 * and the sheet cannot label the same mode differently.
 */
export const amountUnitFor = (mode: PriceMode | null | undefined): '%' | '£' | null =>
  mode === 'add_pct' || mode === 'sub_pct' ? '%' : mode === 'add_gbp' || mode === 'sub_gbp' ? '£' : null

/** One setup's across-the-board rule, plus the per-item prices that override it. */
export interface PriceSetup {
  mode: PriceMode | null
  /** In POUNDS for a £ mode, in PERCENT for a % mode. Null/absent ⇒ the rule does nothing. */
  amount: number | null
  rounding: PriceRounding | null
  /**
   * Per-item typed prices in POUNDS, keyed by `menu_items_db.id`.
   *
   * 🔴 KEYED BY ID, NOT BY NAME, AND THAT IS THE ONE PLACE THIS FEATURE DIFFERS FROM THE PRICE BOOK.
   * `event_item_prices.item_id` is a real FK with `on delete cascade`, so deleting a dish takes its
   * typed prices with it and a RENAME keeps them — whereas `event_item_stock` keys on `item_name`
   * and has neither property. The price BOOK is still keyed by name (it has to be: an order line
   * carries a name and no id), so `loadEventPriceBook` maps id → name once, where the names are
   * already in hand.
   */
  typed: Readonly<Record<string, number>>
}

/** Where an item's price came from. Stored on an order line as `price_basis`. */
export type PriceBasis = 'event_type' | 'event'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · POUNDS ⇄ PENCE
// ════════════════════════════════════════════════════════════════════════════════════════════════

const numOr = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

/**
 * Pounds → integer pence. The ONE boundary in.
 *
 * ⚠️ `Math.round`, NOT `Math.trunc`. `11.50 * 100` is 1149.9999999999998 in a double, and truncating
 * it gives 1149 — a penny lost on a price the operator typed exactly. Rounding gives 1150.
 * ⚠️ A NEGATIVE OR UNPARSEABLE MENU PRICE READS AS 0. `menu_items_db.price` is NOT NULL, so this is
 * defence against a malformed `numeric` string arriving through PostgREST, not a real case.
 */
export const toPence = (pounds: unknown): number => {
  const n = numOr(pounds, 0)
  return n <= 0 ? 0 : Math.round(n * 100)
}

/**
 * Integer pence → pounds. The ONE boundary out, and the INVERSE of `toPence`.
 *
 * ⚠️ IT ROUNDS THE INPUT. Everything in this module is already an integer; rounding here means a
 * caller that hands over a float cannot put a sub-penny price into the price book.
 */
export const toPounds = (pence: number): number => Math.round(numOr(pence, 0)) / 100

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE ARITHMETIC
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Round half UP to the penny, on integers only.
 *
 * ⚠️ NOT `Math.round`. `Math.round(-0.5)` is `-0` (it rounds toward +∞), which is the wrong direction
 * for a negative intermediate; this is explicit about the direction so nobody has to know that. Every
 * price is clamped to >= 0 afterwards anyway, so the negative branch only ever feeds the clamp.
 */
const halfUp = (x: number): number => Math.floor(x + 0.5)

/** Nearest whole pound, HALVES UP. £11.50 → £12. Integer arithmetic — no `/100` float. */
const toNearestPound = (pence: number): number => Math.floor((pence + 50) / 100) * 100

/** Ceiling to the whole pound. £2.20 → £3; £2.00 stays £2. Integer arithmetic. */
const toPoundCeiling = (pence: number): number =>
  pence <= 0 ? 0 : (Math.floor((pence - 1) / 100) + 1) * 100

/**
 * ── 🔴 ONE MENU PRICE THROUGH ONE RULE. EVERY DECISION IN RULE 5 IS HERE AND NOWHERE ELSE. ────────
 *
 * @param menuPence the menu price, in integer pence
 * @param setup     the rule to apply (its `typed` map is NOT consulted — see `priceForItem`)
 * @returns the charged price, in integer pence
 *
 * The order of operations is the order of the rule, and it is not interchangeable:
 *
 *   1. ⚠️ **A FREE ITEM STAYS FREE.** A menu price of £0 is a deliberate statement — a sauce thrown
 *      in, a kids' portion, a loyalty item — and "+10%" has nothing to say about it while "+£1"
 *      would start charging for it. A TYPED price may still set one; a RULE may not. This returns
 *      first, so no rounding can reach a zero either.
 *   2. The rule: pence in, pence out. `+ £` / `− £` add and subtract pence. `+ %` / `− %` multiply
 *      and round half-up to the penny **before** the pound rounding sees the figure, because
 *      "£11.50 + 15%, nearest £1" is £13 and not £14 — it is 13.225, which is £13.23 to the penny
 *      and £13 to the pound. Rounding straight from 1322.5 to the pound would give £13 as well here
 *      but £12 for 1249.5, and the two-step order is the one the operator is shown.
 *   3. 🔴 **NEVER BELOW £0**, clamped before rounding. `£1.50 − £2.00` is £0, never −£0.50: a
 *      negative line price would flow into `calculateOrderTotal` and subtract money from the bill.
 *   4. The pound rounding.
 *   5. 🔴 **ROUNDING NEVER CREATES A FREE ITEM.** `£0.40 − 10%` is 36p, and "nearest £1" on 36p is
 *      £0 — which would hand out free food on a rule the operator read as a small discount. Where
 *      rounding would take a non-zero price to zero, the UNROUNDED price stands (36p). The operator
 *      asked for a discount, not a giveaway, and £0 is the one value that changes what the control
 *      MEANS. (It cannot mask a real £0: step 1 already returned for those.)
 */
export function applyPriceRule(menuPence: number, setup: PriceSetup | null | undefined): number {
  const base = Math.max(0, Math.round(numOr(menuPence, 0)))
  // 1 · a free item stays free.
  if (base === 0) return 0
  if (!setup) return base

  const mode = isPriceMode(setup.mode) ? setup.mode : 'none'
  const rounding = isPriceRounding(setup.rounding) ? setup.rounding : 'none'

  // 2 · the rule.
  let out = base
  if (mode === 'add_gbp' || mode === 'sub_gbp') {
    /* The amount is POUNDS and goes through the same `toPence` the menu price did, so "£1.15" is
     * 115p here exactly as it is there. */
    const deltaPence = toPence(Math.abs(numOr(setup.amount, 0)))
    out = mode === 'add_gbp' ? base + deltaPence : base - deltaPence
  } else if (mode === 'add_pct' || mode === 'sub_pct') {
    /* 🔴 BASIS POINTS, SO 12.5% IS EXACT. `amount` is a percentage with up to two decimals; ×100
     * makes it an integer, and the whole multiplication is then integer × integer / 10000 with one
     * half-up at the end. `base * (10000 ± bp)` for any real menu price is far inside 2^53. */
    const bp = Math.round(Math.abs(numOr(setup.amount, 0)) * 100)
    const factor = mode === 'add_pct' ? 10000 + bp : 10000 - bp
    out = halfUp((base * factor) / 10000)
  }

  // 3 · never below zero.
  out = Math.max(0, out)
  if (out === 0) return 0
  if (rounding === 'none') return out

  // 4 · the pound rounding.
  const rounded = rounding === 'nearest_1' ? toNearestPound(out) : toPoundCeiling(out)
  // 5 · rounding never creates a free item.
  return rounded === 0 ? out : rounded
}

/**
 * One item's price under one setup: **the typed price if there is one, otherwise the rule.**
 *
 * 🔴 A TYPED PRICE IS NEVER ROUNDED AND NEVER RULED. It is what the operator typed, to the penny,
 * and running it through "+10%, always round up" would mean the number they entered is not the
 * number charged — which is the only thing a typed price is for. It is still clamped to >= 0.
 *
 * @param itemId `menu_items_db.id` — the key `typed` is on. A caller with only a name passes null,
 *               which simply means "no typed price", i.e. the rule.
 */
export function priceForItem(
  menuPence: number,
  setup: PriceSetup | null | undefined,
  itemId: string | null | undefined,
): number {
  if (setup && itemId) {
    const typed = setup.typed?.[itemId]
    if (typed !== null && typed !== undefined) return Math.max(0, toPence(typed))
  }
  return applyPriceRule(menuPence, setup)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · PRECEDENCE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** A type's pricing, as `event_types` holds it. */
export interface TypePricing {
  price_change_on?: boolean | null
  price_mode?: string | null
  price_amount?: number | string | null
  price_rounding?: string | null
}

/**
 * An event's four price columns, as `truck_events` still holds them.
 *
 * ⛔ READ BY NOTHING THAT PRICES AN ORDER (5 October 2026). The whole-event rule is gone — see
 * `resolveEventPricing` — and this type survives for ONE purpose: so a report or a migration can
 * still describe the columns that are left in the database. ⚠️ IT IS DELIBERATELY NOT A PARAMETER OF
 * ANY PRICING FUNCTION, which is what makes "unread" a property of the code rather than a promise.
 */
export interface EventPricingColumns {
  price_own?: boolean | null
  price_mode?: string | null
  price_amount?: number | string | null
  price_rounding?: string | null
}

const setupFrom = (
  row: TypePricing | null | undefined,
  typed: Readonly<Record<string, number>>,
): PriceSetup => ({
  mode: isPriceMode(row?.price_mode) ? row!.price_mode as PriceMode : 'none',
  amount: row?.price_amount === null || row?.price_amount === undefined ? null : numOr(row.price_amount, 0),
  rounding: isPriceRounding(row?.price_rounding) ? row!.price_rounding as PriceRounding : 'none',
  typed,
})

/**
 * ══ 🔴 WHAT APPLIES TO ONE EVENT — AND IT IS RESOLVED **PER ITEM** (5 October 2026) ═══════════════
 *
 *   the event's own price FOR THAT ITEM  ??  the type's price (typed ?? rule)  ??  the menu price
 *
 * ⛔ THIS REPLACES THE WHOLE-EVENT `price_own` PATH, WHICH IS GONE FROM EVERY READER. The old rule
 * was "the event's own prices REPLACE the type's whole" — one switch on the event, with its own rule
 * and its own typed set, and the type not consulted at all once it was on. Two things were wrong
 * with it, and the second is the one that mattered:
 *   1. it made a per-event price change an all-or-nothing act. An operator who wanted £1 more on one
 *      pizza had to adopt a whole second rule for the event and then keep it in step by hand;
 *   2. 🔴 IT WAS A SECOND RULE ENGINE IN A PLACE NOBODY WOULD LOOK. An event on "own prices" silently
 *      stopped following its type, so editing the Festival type changed every festival EXCEPT the one
 *      somebody had nudged — with nothing on either screen to say why.
 *
 * ✅ SO AN EVENT NOW CARRIES **ONLY TYPED PRICES, PER ITEM**, and each one overrides exactly its own
 * item. Every other item keeps following the type, or the menu. That is the whole vocabulary, and it
 * is the one an operator standing at the hatch actually wants: "tonight this one dish costs more".
 *
 * ⚠️ `truck_events.price_own / price_mode / price_amount / price_rounding` ARE STILL IN THE DATABASE
 * AND ARE READ BY NOTHING. Left in place deliberately — dropping columns is a migration, and this
 * change needs none. An event that was left with `price_own = true` therefore stops having its own
 * rule applied; its typed rows, if it has any, keep working and now apply per item. See
 * docs/dashboard-cleanup-report.md for the read-only query that counts them.
 *
 * ⚠️ A TYPE WITH ITS SWITCH OFF KEEPS ITS SAVED RULE AND ITS TYPED PRICES, UNUSED (decision 1).
 * `typeSetup` is null for such a type, so switching back on restores exactly what was there.
 */
export interface EventItemPricing {
  /**
   * The EVENT's own typed prices, POUNDS by `menu_items_db.id`. Each entry overrides ONLY its item.
   * ⚠️ NEVER RULED AND NEVER ROUNDED — it is the number the operator typed, to the penny.
   */
  eventTyped: Readonly<Record<string, number>>
  /** The TYPE's setup (its rule plus its own typed prices), or null when no type pricing applies. */
  typeSetup: PriceSetup | null
}

/** Menu prices exactly — the answer for every truck that has not touched this feature. */
export const MENU_PRICES: EventItemPricing = { eventTyped: {}, typeSetup: null }

/** Does anything at all apply here? False ⇒ the menu, and no line may be stamped. */
export const pricingApplies = (p: EventItemPricing): boolean =>
  !!p.typeSetup || Object.keys(p.eventTyped).length > 0

/**
 * Build the per-event pricing from the two rows.
 * ⚠️ THE EVENT'S RULE COLUMNS ARE NOT A PARAMETER. They cannot be read by accident.
 */
export function resolveEventPricing(
  eventTyped: Readonly<Record<string, number>>,
  type: TypePricing | null | undefined,
  typeTyped: Readonly<Record<string, number>>,
): EventItemPricing {
  return {
    eventTyped,
    typeSetup: type?.price_change_on === true ? setupFrom(type, typeTyped) : null,
  }
}

/** One item's price at one event, and where it came from. */
export interface PricedItem {
  pence: number
  /**
   * Null ⇒ the price did not move from the menu, so NOTHING is stamped on the order line.
   * 🔴 THAT IS THE BYTE-IDENTITY PROMISE, and it is why the basis is computed from the NUMBER rather
   * than from which branch won: an event typed price that happens to equal the menu price has not
   * moved, and stamping `price_basis` on it would make the audit field a claim about nothing.
   */
  basis: PriceBasis | null
}

/**
 * ── 🔴 THE ONE FUNCTION THAT DECIDES WHAT AN ITEM COSTS AT AN EVENT ───────────────────────────────
 * The menu API, the submit route, the walk-up Add order, an edit's new lines and the dashboard's
 * Price column all go through here, so no two of them can charge differently.
 *
 * @param itemId `menu_items_db.id`. A caller with only a name passes null, which means "no typed
 *               price on either side" — the type's rule still applies, because a rule is per item
 *               only in the sense that it is applied to each item's own menu price.
 */
export function priceAtEvent(
  menuPence: number,
  itemId: string | null | undefined,
  p: EventItemPricing,
): PricedItem {
  /* 1 · THE EVENT'S OWN PRICE FOR THIS ITEM. Clamped to >= 0, never ruled, never rounded. */
  if (itemId) {
    const own = p.eventTyped[itemId]
    if (own !== null && own !== undefined) {
      const pence = Math.max(0, toPence(own))
      return { pence, basis: pence === menuPence ? null : 'event' }
    }
  }
  /* 2 · THE TYPE'S PRICE — its own typed price for this item, else its rule. */
  if (p.typeSetup) {
    const pence = priceForItem(menuPence, p.typeSetup, itemId)
    return { pence, basis: pence === menuPence ? null : 'event_type' }
  }
  /* 3 · THE MENU. */
  return { pence: menuPence, basis: null }
}

/**
 * Does this event charge ANY of these items something other than the menu?
 *
 * 🔴 THE AMBIGUOUS-EVENT GUARD IS WHAT THIS IS FOR (decision 7). When an order arrives with no event
 * id and the date has two events, the server must not GUESS which one to price against — but it must
 * also not refuse an order for a truck that has never used this feature, which is every truck today.
 * So the question is not "does this event have a setup" but "would it charge anything different":
 * a type whose switch is on with mode 'none' and no typed prices changes nothing, and an order under
 * it is not ambiguous in any way that matters.
 * ⚠️ IT COMPARES COMPUTED PRICES, NOT COLUMNS. Comparing columns would call `+0%` a change.
 */
export function pricingDiffersFromMenu(
  p: EventItemPricing,
  items: readonly { id: string; pricePence: number }[],
): boolean {
  if (!pricingApplies(p)) return false
  for (const it of items) {
    if (priceAtEvent(it.pricePence, it.id, p).pence !== it.pricePence) return true
  }
  return false
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · WHAT THE SCREENS SAY
// ════════════════════════════════════════════════════════════════════════════════════════════════

const money = (pounds: number): string =>
  `£${(Math.round(pounds * 100) / 100).toFixed(2).replace(/\.00$/, '')}`

export const ROUNDING_PHRASE: Record<PriceRounding, string> = {
  none: 'no rounding',
  nearest_1: 'nearest £1',
  up_1: 'always round up',
}

/**
 * The rule as a phrase: "+10%", "−£1.50", or null when the rule does nothing.
 *
 * ⚠️ A MINUS SIGN (U+2212), NOT A HYPHEN, matching the control labels. The two are a different width
 * and a reader comparing the card's summary with the dropdown would see two different symbols.
 */
export function describeRule(setup: PriceSetup | null | undefined): string | null {
  if (!setup || !isPriceMode(setup.mode) || setup.mode === 'none') return null
  const amount = numOr(setup.amount, 0)
  if (amount <= 0) return null
  switch (setup.mode) {
    case 'add_pct': return `+${amount}%`
    case 'sub_pct': return `−${amount}%`
    case 'add_gbp': return `+${money(amount)}`
    case 'sub_gbp': return `−${money(amount)}`
    default: return null
  }
}

/**
 * The one-line summary on the dashboard's Prices row.
 *
 * 🔴 ONE FUNCTION FOR ALL THREE STATES, so the card, the sheet's heading and the grid's "Item prices"
 * row cannot describe the same setup differently. The three shapes, verbatim from the brief:
 *   "Menu prices"
 *   "Festival's prices · +10%, nearest £1"
 *   "Own prices · +15%, nearest £1 · 1 typed"
 *
 * ⚠️ A ROUNDING OF 'none' IS NOT MENTIONED. "+£1, no rounding" is a phrase about a thing that did not
 * happen; the absence of the clause says it.
 * ⚠️ A SETUP THAT CHANGES NOTHING STILL SAYS WHOSE IT IS. "Festival's prices" with no rule and no
 * typed prices is honest — the switch IS on — and reporting "Menu prices" would make the switch look
 * broken. The prices happen to equal the menu, which is what "Festival's prices" then means.
 */
export function summarisePricing(
  p: EventItemPricing,
  typeName: string | null | undefined,
  /** How many items THIS EVENT has typed a price for. */
  eventTypedCount: number,
): string {
  /* ══ 🔴 RE-WORDED FOR THE PER-ITEM RULE (5 October 2026) ══════════════════════════════════════
   * The third shape used to be "Own prices · +15%, nearest £1 · 1 typed", which described a
   * whole-event rule that no longer exists. An event now only ever has typed prices, so the honest
   * sentence names how many items it has changed and leaves the type's rule where it belongs:
   *   "Menu prices"
   *   "Festival's prices · +10%, nearest £1"
   *   "Festival's prices · +10% · 2 items changed for this event"
   *   "2 items changed for this event"            ← no type, or its pricing is off
   * ⚠️ A ROUNDING OF 'none' IS NOT MENTIONED. "+£1, no rounding" is a phrase about a thing that did
   * not happen; the absence of the clause says it.
   * ⚠️ A TYPE WHOSE SWITCH IS ON BUT CHANGES NOTHING STILL SAYS WHOSE PRICES THEY ARE. Reporting
   * "Menu prices" would make the switch look broken; the prices happen to equal the menu. */
  const own = eventTypedCount > 0
    ? `${eventTypedCount} item${eventTypedCount === 1 ? '' : 's'} changed for this event`
    : null
  if (!p.typeSetup) return own ?? 'Menu prices'
  const parts: string[] = []
  const rule = describeRule(p.typeSetup)
  const rounding = isPriceRounding(p.typeSetup.rounding) ? p.typeSetup.rounding : 'none'
  if (rule) parts.push(rounding === 'none' ? rule : `${rule}, ${ROUNDING_PHRASE[rounding]}`)
  const typeTypedCount = Object.keys(p.typeSetup.typed).length
  if (typeTypedCount > 0) parts.push(`${typeTypedCount} typed`)
  if (own) parts.push(own)
  const head = `${typeName ?? 'Event type'}’s prices`
  return parts.length ? `${head} · ${parts.join(' · ')}` : head
}

/**
 * ── 🔴 THE AMOUNT, VALIDATED ONCE, FOR THE SERVER AND THE SCREENS ─────────────────────────────────
 * Returns the amount to store, or null for "no usable amount" (which the route stores as NULL and the
 * rule then does nothing with).
 *
 * ⚠️ TWO DIFFERENT CEILINGS, BECAUSE THEY ARE TWO DIFFERENT QUANTITIES. A £ amount is money and is
 * capped by the column (`numeric(8,2)`) at 2 decimals and by sense at £1,000 — an uplift bigger than
 * any dish on any menu in this product. A % is a proportion: 0-500% covers "five times the price",
 * which is already absurd, and a subtraction beyond 100% is clamped by the £0 floor rather than
 * refused, because "−200%" is an operator typo whose only sane reading is free.
 * ⚠️ NEGATIVE IS REFUSED, NOT ABSOLUTED. "+ −10%" has two possible readings and neither is one the
 * operator can have meant; the direction is the MODE's job.
 */
export const MAX_PRICE_AMOUNT_GBP = 1000
export const MAX_PRICE_AMOUNT_PCT = 500

export function cleanPriceAmount(mode: PriceMode | null | undefined, raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  if (!Number.isFinite(n) || n < 0) return null
  const unit = amountUnitFor(mode)
  if (unit === null) return null                       // mode 'none' carries no amount
  const max = unit === '%' ? MAX_PRICE_AMOUNT_PCT : MAX_PRICE_AMOUNT_GBP
  if (n > max) return null
  /* ── ⚠️ TWO DECIMALS, ROUNDED NOT REFUSED ───────────────────────────────────────────────────────
   * `numeric(8,2)` would round it on the way in anyway; doing it here means the value the operator
   * sees back is the value that was stored.
   *
   * 🔴 VIA THE EXPONENT, NOT `Math.round(n * 100) / 100`, AND THE HARNESS IS WHAT FOUND IT. `1.005`
   * is not representable in a double: the nearest value is slightly BELOW it, so `1.005 * 100` is
   * 100.49999999999999 and `Math.round` gives 100 — i.e. "£1.005" would be stored as £1.00 while
   * Postgres' own `numeric(8,2)`, which rounds the DECIMAL, would store £1.01. The two would then
   * disagree about a value the operator typed.
   * `Number('1.005e2')` is parsed as a decimal and gives exactly 100.5, which rounds to 101. */
  return Number(`${Math.round(Number(`${n}e2`))}e-2`)
}

/** A typed per-item price, validated. Null ⇒ clear it (fall back to the rule). */
export function cleanTypedPrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null
  return Math.round(n * 100) / 100
}
