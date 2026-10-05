// lib/copy/serviceSettings.ts
// ONE definition of the NAME of each service setting an event type can change.
//
// ── 🔴 WHY THIS FILE EXISTS, AND WHY IT HOLDS NO NEW WORDING ─────────────────────────────────────
// The Event types modal shows five settings side by side, and the dashboard's "This event" card shows
// the same five. Both used to carry their own short labels — `'Buzzers'`, `'Take cash'`,
// `'Offline protection'` — typed into `SERVICE_ROWS` and into the card. So one setting had TWO names:
// the one Settings calls it, and the one these two new screens called it. An operator who turns
// "Remind me to add a buzzer" off on the dashboard and then goes looking for it in Settings is looking
// for a different phrase.
//
// 🔴 EVERY STRING BELOW IS LIFTED, NOT WRITTEN. Each is the words the operator already meets on
// Manage → Settings or on the dashboard, moved here so there is one copy of it. Nothing in this file
// is a new form of words, and nothing in it should become one: changing a label here changes it on
// every screen that setting appears on, which is the entire point.
//
// ⚠️ IT IS SEPARATE FROM lib/settings-copy.ts BY DESIGN. That file's contract is narrower — "every
// setting that appears on BOTH Manage → Settings and the setup wizard's review screen" — and four of
// these five are not on the wizard. Rather than widen that contract, the one setting that IS in it
// (the order-ready step) is RE-EXPORTED from it below, so it still has exactly one definition.

import { SETTING_COPY } from '@/lib/settings-copy'

/**
 * The five service settings an event type can set, keyed by their `SERVICE_ROWS` id.
 *
 * 🔴 THE SOURCE OF EACH STRING IS NAMED, so the next person can check it rather than trust it.
 */
export const SERVICE_SETTING_LABELS = {
  /** Settings → Your trucks → Kitchen, the Collection times sub-card heading. */
  collection_interval_mins: 'Collection times',

  /**
   * 🔴 RE-EXPORTED FROM lib/settings-copy.ts, NOT RETYPED. Settings renders
   * `SETTING_COPY.orderReady.label` and so does the setup wizard's review screen; this is the same
   * constant, so all four surfaces cannot disagree.
   * ⚠️ IT IS 'Order-ready step' AND NOT '“Mark ready” step' — a decision, 4 October 2026. The design
   * mockup and the brief both said the latter, but that phrase is not a label anywhere in the product;
   * it appears only inside this setting's own help text ("Show a “Mark ready” button…"). Dominic chose
   * the existing string over the mockup's wording rather than rename a constant the wizard also
   * renders. Do not "fix" this to match the mockup.
   */
  order_ready: SETTING_COPY.orderReady.label,

  /** Settings → Order settings, the cash-split row. */
  takes_cash: 'Do you take cash?',

  /** Settings → Your trucks → Kitchen, the offline-protection card heading. */
  offline_protection: 'Offline order protection',

  /**
   * The dashboard's Settings tab, the buzzer-prompt card heading.
   * ⚠️ THIS ONE'S ORIGINAL SITE NO LONGER RENDERS IT. The card moved into the "This event" card in
   * October 2026 and was relabelled `'Buzzers'` on the way — which is how a setting ended up with two
   * names and why this file exists. The string here is that card's title, unchanged.
   */
  buzzer_prompt: 'Remind me to add a buzzer',
} as const

export type ServiceSettingId = keyof typeof SERVICE_SETTING_LABELS

/**
 * ── ⛔ "Varies by van" IS GONE, AND SO ARE "Set per van" AND "Same as Standard" ──────────────────
 * Dominic, 4 October 2026: "REMOVE 'VARIES BY VAN' COMPLETELY. Every cell is a real setting: a switch
 * that is on or off, or a dropdown showing a real value."
 *
 * All three phrases were the same idea in different clothes — a cell that declined to show a value
 * and asked the operator to go and find it. In three passes they were: "Same as Standard" (an option
 * in every dropdown), then "Set per van" (text plus a link to Settings), then "Varies by van" (an
 * option again). Each was an answer to "what will actually happen at this event?" that was not a
 * value.
 *
 * 🔴 WHAT REPLACES THEM IS A REAL CONTROL AT A REAL VALUE. A type that has set nothing shows, FADED,
 * the value its FIRST van uses — because that is what a reader of this screen is asking — with a
 * hover title saying the value is the van's rather than the type's. Touching it makes it the type's,
 * for every van.
 * ⚠️ THE TITLE IS THE ONLY PLACE THE NUANCE LIVES NOW. It has to be accurate: the control is showing
 * ONE van's value while the others may differ, and the words say so without claiming a number the
 * screen cannot show.
 */
export const TYPE_FOLLOWS_VAN_TITLE = "Follows each van's usual setting"

/**
 * ── ⛔ `TAKES_CASH_ALL_VANS_TITLE` IS DELETED, AND ITS DELETION IS THE FIX ────────────────────────
 * It read **"Applies to all your vans"**, and it was true: `takes_cash` was `trucks.takes_cash`, ONE
 * column for the whole truck, drawn as one switch per van column over a single value. The title was
 * the only thing explaining why flipping one flipped the others.
 *
 * 🔴 Dominic, 5 October 2026, having met it on localhost: "Turning on 'Do you take cash?' for Van 1
 * also turned it on for Van 2… I want every column independent." `truck_vans.takes_cash` (20261012)
 * makes it a per-van setting like the other four, so there is nothing left to explain and the wording
 * is REMOVED rather than reworded — the instruction says so in those words.
 *
 * ⚠️ `trucks.takes_cash` IS NOT GONE. It is the LAST LINK of the resolver chain
 * (event ?? type ?? van ?? truck), so a van that has never been touched still follows it. What is gone
 * is the claim that one switch governs every van, because it no longer does.
 * ⛔ DO NOT REINSTATE A SPANNING CELL FOR THIS ROW. scripts/event-types.cjs asserts one cell per van
 * column for every SERVICE row, and the PRICES rows are the only ones that span (prices are
 * truck-wide; cash is not).
 */

/**
 * ── 🔴 "Same settings for all vans" — THE GRID'S OWN VIEW OF AN EXISTING SWITCH ───────────────────
 * Dominic, 5 October 2026: a "VANS" section at the top of the grid with one row, reading and writing
 * **`truck_vans.same_as_first_van`** through Settings' own `set_van_same_as_first` action. No new
 * flag, no new column, no second save path.
 *
 * ⚠️ THE ANSWER IS READ, NEVER STORED: ON when every non-first ACTIVE van has it on, and any mix
 * reads OFF. That is the model Menu › Kitchen capacity already uses for its own switch
 * (`capacity_same_as_first_van`), and for the same reason — there is no truck-level column, so "are
 * they all the same?" is a question about the vans, and caching it would give two answers that could
 * disagree. **Nothing is written on load.**
 */
export const SAME_SETTINGS_ALL_VANS_LABEL = 'Same settings for all vans'
export const SAME_SETTINGS_ALL_VANS_HEADER = 'All vans'

/**
 * The confirm shown on OFF → ON, verbatim as instructed.
 *
 * 🔴 IT ASKS FIRST BECAUSE IT OVERWRITES. Switching on copies Van 1's settings over every other
 * van's, through the same `set_van_same_as_first` the Settings switch calls — so a truck that had
 * configured Van 2 differently loses that, and must be told before it happens rather than after.
 * ⚠️ IT NAMES KITCHEN CAPACITY'S SEPARATE SWITCH, because `VAN_COPY_FIELDS` and
 * `CAPACITY_COPY_FIELDS` are disjoint and capacity does NOT travel with this — an operator who
 * expected it to would otherwise think the copy had half-failed.
 * ⚠️ ON → OFF ASKS NOTHING AND COPIES NOTHING: every van keeps the values it has.
 */
export const SAME_SETTINGS_CONFIRM =
  "Copy Van 1's settings to every van? This copies all of Van 1's van settings, the same as "
  + "'Same as Van 1' in Settings. Kitchen capacity has its own switch."

/**
 * ── 🔴 "Remind me to add a buzzer": WHAT STANDARD'S SWITCH ACTUALLY WRITES, AND THE MISMATCH ─────
 * Dominic asked for Standard to be bound to "whatever control Settings uses to turn buzzers on/off
 * for a van", and to STOP if there were no such action. THERE IS ONE: Settings › Your trucks renders
 * a toggle whose click is
 *
 *     updateVanSetting(van.id, 'buzzer_count', van.buzzer_count == null ? BUZZER_DEFAULT_COUNT : null)
 *
 * i.e. `update_van_settings` with `buzzer_count` — in that handler's destructured allowlist, so it
 * writes. Standard's switch now makes exactly that call, so no STOP was needed and no new save path
 * was added.
 *
 * ⚠️ BUT THE ROW'S TWO COLUMNS ARE NOT THE SAME SETTING, AND THE REPORT SAYS SO PLAINLY. The row is
 * labelled with the DASHBOARD's phrase, "Remind me to add a buzzer", which is the per-event PROMPT
 * (`truck_events.buzzer_prompt`) — and that is what a TYPE's cell writes
 * (`event_types.buzzer_prompt`). Standard's cell writes `truck_vans.buzzer_count`: whether the van
 * has a buzzer rack at all.
 *
 * It is defensible and it is deliberate: Standard's DISPLAYED value was already derived from
 * `buzzer_count !== null` (lib/buzzer.ts's rule — no rack, nothing to prompt for), so binding the
 * control to the same column makes the cell's display and its control agree, where before the display
 * came from one place and the control did not exist. The alternative — a truck-level prompt column —
 * is a migration and a new setting, which is not this build.
 */
export const BUZZER_STANDARD_WRITES_RACK = true

/**
 * The footer, exactly as briefed — two lines.
 *
 * 🔴 THE FIRST LINE IS A PROMISE THE SAVE PATH HAS TO KEEP. "Changing it here also changes it in
 * Settings" is only true because the Standard controls call the SAME server action Settings calls
 * (`update_van_settings` / `update_truck`), not a second path of their own. If that ever stops being
 * true, this sentence is the thing that becomes a lie.
 */
export const EVENT_TYPES_FOOTER_STANDARD =
  'Standard is your usual setup. Changing it here also changes it in Settings.'
export const EVENT_TYPES_FOOTER_ONE_EVENT =
  "To change a setting for one event only, use that event's dashboard."

/** The header's one remaining subtitle. "Grey = same as Standard" is gone — nothing is grey now. */
export const EVENT_TYPES_SUBTITLE = 'Changes save as you go.'

/**
 * The ⋯ menu's reset item, and what it asks before doing it.
 *
 * ⚠️ IT SETS EVERY SETTING ON THAT TYPE BACK TO NULL, which is what the type started as. The confirm
 * exists because it is the one item in that menu that discards work the operator did.
 */
export const MATCH_STANDARD_LABEL = 'Match Standard'
export const MATCH_STANDARD_CONFIRM =
  'Put every setting on this type back to Standard? Anything you changed here will be cleared.'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// EVENT PRICING (§70, October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ── 🔴 WHY THE PRICE LABELS LIVE HERE AND NOT IN THE TWO COMPONENTS ──────────────────────────────
// The same five rows appear on the Event types GRID (per type, truck-wide) and in the dashboard's
// "Prices for this event" SHEET (per event). That is the exact shape the five SERVICE settings were
// in when this file was created — two screens, two sets of retyped labels, one setting with two names
// — and the fix is the same: one definition, both screens import it.
//
// ⚠️ UNLIKE THE SERVICE LABELS ABOVE, THESE ARE **NEW WORDING**, NOT LIFTED. There was no per-event
// or per-type pricing before this build (§70.2: "there is no per-event pricing anywhere"), so there
// is no existing screen to lift a phrase from. Every string below is Dominic's wording from the
// 5 October brief, kept verbatim rather than paraphrased.

export const PRICE_SETTING_LABELS = {
  /** The switch that turns a type's pricing on. Off = the type charges menu prices exactly. */
  price_change_on: 'Change prices',
  /** The across-the-board rule's mode. */
  price_mode: 'Price change',
  /** The rule's amount. The box's suffix is `amountUnitFor(mode)` — '%' or '£'. */
  price_amount: 'Amount',
  /** Applied after the rule, never to a typed price. */
  price_rounding: 'Rounding',
  /** The per-item section's own row, with the Hide/Show button at its right. */
  item_prices: 'Item prices',
} as const

/**
 * The five price-change choices.
 *
 * 🔴 THE VALUES ARE `PRICE_MODES`' VALUES AND THE MIGRATION'S CHECK, so a label and a column cannot
 * drift apart.
 *
 * ══ 🔴 'none' IS NOW LABELLED "Set each price myself", AND THE STORED VALUE IS UNCHANGED ═══════════
 * It was "None", and "None" was the single most misleading word on this screen: it means **typed
 * prices only**, not "no pricing" — that is the switch being off. An operator reading "None" in a
 * dropdown reasonably concluded nothing was happening, when in fact they had chosen to price item by
 * item. The label now says what it does.
 * ⛔ THE VALUE STAYS `'none'`. It is in the migration's CHECK, in `PRICE_MODES`, and in every row
 * already saved. Renaming the value to match the label would be a data migration to fix a word.
 * ⚠️ AND IT IS LAST IN THE LIST NOW, after the four arithmetic modes — it is the odd one out (it is
 * the absence of a rule rather than a kind of rule), and the four that behave alike belong together.
 */
export const PRICE_MODE_CHOICES = [
  { value: 'add_gbp', label: '+ £' },
  { value: 'add_pct', label: '+ %' },
  { value: 'sub_gbp', label: '− £' },
  { value: 'sub_pct', label: '− %' },
  { value: 'none', label: 'Set each price myself' },
] as const

/**
 * 🔴 THE FOUR MODES THAT HAVE AN AMOUNT AND A ROUNDING.
 * Amount and Rounding appear ONLY for these. `'none'` has neither — there is no across-the-board
 * change, so there is no amount to enter and nothing for a rounding to round.
 * ⚠️ DERIVED FROM THE LIST ABOVE rather than typed again, so a sixth mode cannot be added without
 * deciding which side of this it falls on.
 */
export const PRICE_MODES_WITH_AMOUNT: readonly string[] =
  PRICE_MODE_CHOICES.filter(c => c.value !== 'none').map(c => c.value)

/** The three roundings. ⚠️ 'None' here means no rounding, which IS the absence of the step. */
export const PRICE_ROUNDING_CHOICES = [
  { value: 'none', label: 'None' },
  { value: 'nearest_1', label: 'Nearest £1' },
  { value: 'up_1', label: 'Always round up' },
] as const

/** The Standard column's one cell on the "Change prices" row. */
export const PRICES_STANDARD_CELL = 'Your menu prices'

/**
 * ── 🔴 PRICES ARE TRUCK-WIDE, NEVER PER VAN, AND THIS CELL IS WHERE THAT IS SAID ─────────────────
 * Every other row in the grid draws one control per active van. Pricing has no per-van column in the
 * database and no per-van meaning — a truck does not charge £9 from one trailer and £10 from
 * another at the same pitch — so the Standard side of the PRICES rows is ONE cell spanning every van
 * column. The title is what stops that reading as "the other vans have no price setting".
 */
export const PRICES_TRUCK_WIDE_TITLE = 'Your prices are the same for every van'

/** The item rows' Standard cell heading — the menu price column. */
export const PRICES_MENU_CELL = 'Menu'

/**
 * ── ⛔ UNUSED SINCE 5 October 2026, AND KEPT ONLY AS A RECORD OF WHAT WAS LOST ───────────────────
 * "Item prices" was a ROW, and its per-type cells read "N typed" (switch on) or "Menu prices" (off).
 * It is a SECTION BAND now, "like PRICES and SERVICE" — and those bands have empty type cells, so
 * the per-type count went with the row.
 *
 * ⚠️ THAT IS A REAL LOSS AND IT IS NAMED RATHER THAN HIDDEN: an operator can no longer see at a
 * glance how many typed prices each type carries. What survives is the evidence itself — a typed
 * price is a blue outlined box in the item rows — and the dashboard card's summary, which still says
 * "N typed" for an EVENT. Restoring it is one cell in the band's `typeCells` branch if Dominic wants
 * it back; it was dropped to follow "a band like PRICES and SERVICE" literally.
 */
export const PRICES_TYPE_OFF_CELL = 'Menu prices'

/** The text button at the right of the "Item prices" row. State is per browser session only. */
/* ══ 🔴 "Show prices" / "Hide prices", AND NO COUNT (5 October 2026) ════════════════════════════
 * It was "Show" / "Hide" with the item count — "Show 23 items". Two problems: the count is a number
 * nobody acts on (an operator does not decide whether to unfold a list based on its length), and
 * "items" in a PRICES band invited the reading that the band was about availability. The pill now
 * names what it reveals. */
export const ITEM_PRICES_SHOW = 'Show prices'
export const ITEM_PRICES_HIDE = 'Hide prices'

/**
 * The DASHBOARD SHEET's footer line.
 *
 * ⛔ REMOVED FROM THE GRID ENTIRELY (5 October 2026). It spanned the van columns inside the ITEM
 * PRICES band and said "Press a price to type your own." — an instruction for something the operator
 * discovers by pressing a price, occupying the one row that could have said something they could not
 * discover. Dominic: remove it completely.
 * ⚠️ IT SURVIVES ON THE SHEET, which is a different screen with room for it and a different audience
 * (somebody at a hatch mid-service who did not set the event up).
 */
export const PRICE_TYPE_HINT = 'Press a price to type your own.'

/**
 * ── 🔴 THE LIVE-EVENT NOTICE, WORD FOR WORD ──────────────────────────────────────────────────────
 * Shown in the sheet when the event's status is `open`. Both sentences are load-bearing and both are
 * TRUE of the implementation: new orders price at request time through `loadEventPriceBook`, and a
 * placed order's prices are the ones stored on its row (price-lock, lib/order-repricing.ts) which
 * nothing in this feature writes to.
 * ⚠️ DO NOT SOFTEN IT TO "may use". An operator changing prices mid-service needs to know that the
 * next order through the hatch is at the new price.
 */
export const PRICES_LIVE_NOTICE =
  'This event is live. New orders use the new prices. Orders already placed keep theirs.'

/* ══ ⛔ THE SHEET'S SIX STRINGS ARE DELETED (5 October 2026) ══════════════════════════════════════
 *   PRICES_SHEET_TITLE · PRICES_CHOICE_OWN · PRICES_CHOICE_MENU · PRICES_SHEET_SAVE ·
 *   PRICES_SEARCH_PLACEHOLDER · PRICES_ROW_LABEL
 * They belonged to the "Prices for this event" sheet and the "This event" card's Prices row, both of
 * which are gone. An event's prices are now set per item from the dashboard's Menu & Stock Price
 * column, which needs no title, no two-way choice, no Save and no search — it is a column of boxes in
 * a list the operator is already reading. */

/** The Menu & Stock card's own description, which the Price column changed. */
export const EVENT_ITEMS_CARD_DESCRIPTION =
  'Prices, item limits and availability for this event only. Changes take effect immediately.'

/** The column header. ⚠️ Kept short — it sits over a 20-unit column beside Item limit. */
export const EVENT_PRICE_COLUMN_LABEL = 'Price'

/**
 * The line under an item whose price THIS EVENT has changed: "menu £12.00 · this event", or
 * "Festival £12.00 · this event" when the price it departs from is the TYPE's rather than the menu's.
 *
 * 🔴 IT NAMES THE PRICE THIS ONE DEPARTS FROM, NOT THE DIFFERENCE. "+£1" would restate what the
 * figure above already says, and it would be wrong the moment the underlying price moved. The
 * fallback figure is the one thing the operator cannot see while their own number is on screen.
 * ⛔ AND IT NAMES THE **TYPE** WHERE THE TYPE IS WHAT IT DEPARTS FROM. Saying "menu £12.00" about an
 * event price that actually departs from a Festival rule is a different and false claim — and it is
 * the one an operator would act on when deciding whether to clear it.
 * ⚠️ "this event", NOT "this event only" (Dominic, 5 October 2026). The card's own description
 * already says "for this event only"; the row-level line is a reminder, not a second statement.
 *
 * @param fallbackPounds what this item would cost here WITHOUT the event's own price
 * @param typeName       the event type's name when the fallback is ITS price, else null for the menu
 */
export const eventPriceOwnNote = (fallbackPounds: number, typeName?: string | null): string =>
  `${typeName ?? 'menu'} £${fallbackPounds.toFixed(2)} · this event`

/* ══ 🔴 THE PRICE COLUMN IS READ-ONLY UNTIL "✎ Edit prices" (5 October 2026, Dominic) ═════════════
 * ⛔ IT WAS AN OPEN INPUT BESIDE Item limit, AND THAT WAS THE DEFECT. Prices change rarely and are
 * the one value on this card that a customer is charged, yet they sat in the same always-editable box
 * as a stock number an operator edits twenty times a service — so the easiest thing to change by
 * accident was the only thing with a till consequence.
 * 🔴 SO THE TWO MODES ARE SEPARATE ACTS: reading, and editing. Nothing is written until Save, and
 * Cancel means no request was ever made. */

/** The header button that opens edit mode. ⚠️ The pencil is in the string, so every surface agrees. */
export const EVENT_PRICE_EDIT = '✎ Edit prices'
export const EVENT_PRICE_CANCEL = 'Cancel'
export const EVENT_PRICE_SAVE = 'Save prices'

/**
 * The blue note under the card header while editing.
 *
 * 🔴 THE SECOND SENTENCE IS A PROMISE THE SCREEN KEEPS, NOT A WARNING. Item limits and Available
 * really are disabled in edit mode — one act at a time, so a half-finished price edit cannot be
 * entangled with a stock change the operator did mean to keep.
 */
export const EVENT_PRICE_EDIT_NOTE =
  'Editing prices for this event only. Item limits and availability are locked until you save.'

/**
 * The extra line when the event is LIVE.
 * ⚠️ SHORTER THAN `PRICES_LIVE_NOTICE`, DELIBERATELY. That one was a one-shot toast beside an
 * always-editable box; this sits under a header for as long as the editor is open, and the sentence
 * that matters while deciding a number is the first one.
 */
export const EVENT_PRICE_LIVE_NOTE = 'Live: new orders use the new prices.'

/**
 * The sub-row the offline-protection SWITCH reveals when it is on.
 *
 * 🔴 THE ROW IS A SWITCH NOW, NOT A DROPDOWN (5 October 2026). It was one three-choice select —
 * "Off / Pause ordering / Keep taking orders…" — which made the row the only one in the grid that was
 * not a switch, and which put a safety-critical MODE at the same level as an on/off. The switch is
 * the question ("is offline protection on?"); the mode is a detail of the answer, so it is an
 * indented sub-row that is not there when the switch is off.
 * ⚠️ THE MODE'S LABELS STILL COME FROM `OFFLINE_PROTECTION_MODES`, unchanged — this is a change of
 * SHAPE, not of vocabulary, so Settings › Kitchen and the dashboard still word them identically.
 */
export const OFFLINE_WHEN_OFFLINE_LABEL = 'When offline'
