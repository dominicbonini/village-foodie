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
 * ── 🔴 "Do you take cash?" IS STORED PER TRUCK, AND APPEARS IN EVERY VAN COLUMN ANYWAY ───────────
 * Dominic, 4 October 2026: "Each van column gets its own switch, like every other row. No control
 * spanning two columns." It had been one control spanning the van columns, which read as "van 2 has
 * no switch" — the report he filed.
 *
 * ⚠️ IT IS `trucks.takes_cash`: ONE COLUMN FOR THE WHOLE TRUCK. There is no per-van cash setting, so
 * the switches in each van column are the SAME setting drawn twice. They show the same value and
 * move together, because each writes the same `update_truck` call Settings makes.
 * 🔴 SO THE TITLE IS NOT DECORATION — it is the only thing that explains why flipping one flips the
 * other. Without it the row looks broken the first time an operator tries to set cash for one van.
 */
export const TAKES_CASH_ALL_VANS_TITLE = 'Applies to all your vans'

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
