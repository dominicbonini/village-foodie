// lib/event-types/types.ts — what an event type IS, and the suggestions offered for a new one.
//
// ── 🔴 PURE. NO DATABASE, NO NETWORK, NO REACT ─────────────────────────────────────────────────────
// This module and `resolve.ts` beside it are the whole of the feature's meaning, and they are
// importable by the server route, the client screen and the harness alike. Everything that reads the
// database lives in `read.ts`; everything that draws lives in components/manage/EventTypes.tsx.

/* From the leaf: lib/slot-interval.ts imports lib/event-types/resolve.ts, so the vocabulary is taken
 * from the module that has no imports of its own. */
import { INTERVAL_CHOICES, type IntervalChoice } from '@/lib/slot-interval-core'
/* 🔴 THE MODE'S TYPE COMES FROM THE COPY MODULE THAT OWNS IT, not from a second union written here.
 * lib/copy/offlineProtection.ts declares `OFFLINE_PROTECTION_MODES` and derives `OfflineProtectionMode`
 * from it, and that array is "the ONLY place they live" — so a type's column and the van's column are
 * the same two values by construction. That file has no imports of its own, so it is a safe leaf. */
import type { OfflineProtectionMode } from '@/lib/copy/offlineProtection'
/* 🔴 THE LABELS LIVE WHERE SETTINGS AND THE DASHBOARD DEFINE THEM, not here. */
import { SERVICE_SETTING_LABELS } from '@/lib/copy/serviceSettings'

/**
 * One event type, as the database holds it.
 *
 * 🔴 EVERY SETTING IS NULLABLE AND NULL MEANS "SAME AS STANDARD". That is the entire vocabulary, and
 * it is why a brand-new type (a copy of Standard, so all null) changes nothing until it is edited.
 * ⚠️ `false` IS A REAL INSTRUCTION — "switch this off for this type" — and is not the same as null.
 * Anything that treats a falsy value as unset re-inherits the default and silently loses the
 * instruction; that is why every resolver in resolve.ts uses `??` and never `||`.
 */
export interface EventType {
  id: string
  truck_id: string
  name: string
  sort_order: number
  /** The after-order buzzer prompt. null = same as Standard. */
  buzzer_prompt: boolean | null
  /** Split the paid action into Cash/Card. null = same as Standard. */
  takes_cash: boolean | null
  /** The "mark ready" step. null = same as Standard. */
  order_ready: boolean | null
  /** The CUSTOMER collection grid, in minutes. null = same as Standard. */
  collection_interval_mins: number | null
  /** Does offline protection apply? null = same as Standard (the van's switch). */
  offline_protection: boolean | null
  /** What it does when it applies. null = same as Standard. Ignored when the switch resolves off. */
  offline_protection_mode: OfflineProtectionMode | null
  /** The auto-reject delay the 'no_auto_accept' mode requires. null = same as Standard. */
  offline_auto_reject_mins: number | null
  /**
   * ── 🔴 WHICH KIND OF TYPE THIS IS (20261014) ──────────────────────────────────────────────────
   * `'custom'` — the truck made it, and can rename, reorder and delete it.
   * `'private'` — THE built-in Private type. One per truck, created lazily, never renamed, reordered
   * or deleted, and always the LAST column on the grid.
   * ⚠️ OPTIONAL, AND ABSENT MEANS `'custom'`. The column has a NOT NULL default of 'custom', so a
   * response from before 20261014 — or a read that could not see the column — is read as a custom
   * type, which is what every existing type is.
   */
  kind?: 'custom' | 'private'
  /**
   * Private type only: "Take orders by private link and QR code".
   * ⚠️ NOT three-state. No other type offers link ordering at all, so there is nothing to inherit —
   * see the column comment in 20261014.
   */
  private_link_ordering?: boolean | null
}

/**
 * The four service settings a type may carry, in the order the setup screen lists them.
 *
 * 🔴 ONE LIST, USED FOUR TIMES: the screen's rows, the route's write allowlist, "clear my changes"
 * (which clears exactly the event columns these map to) and the harness. A fifth place that spelled
 * them out again is a place that could fall out of step when stage 3 adds a setting.
 */
export const SERVICE_KEYS = [
  'buzzer_prompt', 'takes_cash', 'order_ready', 'collection_interval_mins',
  'offline_protection', 'offline_protection_mode', 'offline_auto_reject_mins',
] as const
export type ServiceKey = (typeof SERVICE_KEYS)[number]

/**
 * ── 🔴 THE ROWS THE SCREENS SHOW, WHICH ARE NOT ONE-PER-COLUMN ────────────────────────────────────
 * Offline protection is ONE row to an operator — a dropdown — and THREE columns in the database,
 * because the control it mirrors is a switch, then a mode, then a delay. Every other setting is one
 * of each.
 *
 * So there are two lists and they answer two different questions:
 *   • `SERVICE_KEYS` — the type's COLUMNS. The route's write allowlist and `blankTypeValues` use it.
 *   • `SERVICE_ROWS` — what a human sees. The modal's rows, `changedCount`, the dashboard card and
 *     "clear my changes" use it.
 * Collapsing them into one list is what would make "3 of 4 settings changed" count an offline change
 * three times, or make the route unable to validate a single key.
 */
export interface ServiceRow {
  id: string
  label: string
  /** The `event_types` columns this row owns. */
  keys: readonly ServiceKey[]
  /** The `truck_events` columns a truck's hand change for this row lives in. */
  eventColumns: readonly string[]
  kind: 'switch' | 'interval' | 'offline'
}

/**
 * ── 🔴 THE ORDER OF THIS ARRAY IS THE ORDER ON THE SCREEN, AND IT IS MOST-IMPORTANT-FIRST ─────
 * Dominic's order, 4 October 2026: Collection times · Order-ready step · Do you take cash? · Offline
 * order protection · Remind me to add a buzzer. It was the reverse of this by accident — the rows had
 * been written in the order the COLUMNS were added to `event_types`, so the buzzer prompt (the setting
 * that matters least and is set per event most often) sat at the top and collection times, which every
 * truck changes, sat fourth.
 *
 * 🔴 BOTH THE MODAL AND THE DASHBOARD'S "This event" CARD RENDER THIS ARRAY, so they cannot drift
 * apart in order. The card used to list the five in its own hand-written sequence.
 *
 * 🔴 EVERY LABEL COMES FROM `SERVICE_SETTING_LABELS`, WHICH LIFTS IT FROM SETTINGS OR THE DASHBOARD.
 * They were short retyped names here — 'Buzzers', 'Take cash', 'Offline protection' — so one setting
 * had two names depending on which screen you were looking at. See lib/copy/serviceSettings.ts.
 * ⚠️ DO NOT PUT A LITERAL BACK IN THIS ARRAY. scripts/event-types.cjs refuses one.
 */
export const SERVICE_ROWS: readonly ServiceRow[] = [
  {
    id: 'collection_interval_mins', label: SERVICE_SETTING_LABELS.collection_interval_mins,
    keys: ['collection_interval_mins'],
    /* ⚠️ THE PAIR IS CLEARED TOGETHER. An operator override with a null customer override is an invalid
     * pair that `applyEventIntervals` ignores (lib/slot-interval.ts), so leaving it would strand a
     * value nothing reads. */
    eventColumns: ['collection_interval_mins_override', 'operator_collection_interval_mins_override'],
    kind: 'interval',
  },
  { id: 'order_ready', label: SERVICE_SETTING_LABELS.order_ready, keys: ['order_ready'], eventColumns: ['order_ready_override'], kind: 'switch' },
  { id: 'takes_cash', label: SERVICE_SETTING_LABELS.takes_cash, keys: ['takes_cash'], eventColumns: ['takes_cash_override'], kind: 'switch' },
  {
    id: 'offline_protection', label: SERVICE_SETTING_LABELS.offline_protection,
    keys: ['offline_protection', 'offline_protection_mode', 'offline_auto_reject_mins'],
    eventColumns: [
      'offline_protection_override', 'offline_protection_mode_override', 'offline_auto_reject_mins_override',
    ],
    kind: 'offline',
  },
  { id: 'buzzer_prompt', label: SERVICE_SETTING_LABELS.buzzer_prompt, keys: ['buzzer_prompt'], eventColumns: ['buzzer_prompt'], kind: 'switch' },
]

/** The label each setting is shown under. The mockup's wording, including the quotation marks. */
export const SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  SERVICE_ROWS.map(r => [r.id, r.label]),
)

/**
 * Which `truck_events` column holds the truck's own hand change for each setting.
 *
 * 🔴 THIS IS WHAT "CLEAR MY CHANGES AND USE <TYPE> EXACTLY" CLEARS — and nothing else. It sets exactly
 * these columns to NULL, so the event falls through to its type for every setting a type can set, and
 * every other per-event setting (the pause, the extra wait, the paid step, the offline rules) is left
 * exactly as the truck left it. Deriving the list from SERVICE_KEYS is what keeps that promise true
 * when stage 3 adds a setting.
 * ⚠️ `collection_interval_mins` MAPS TO THE CUSTOMER COLUMN ONLY. The operator column is cleared
 * alongside it because an operator override with a null customer override is an invalid pair that
 * `applyEventIntervals` ignores (lib/slot-interval.ts:234-237) — leaving it would strand a value that
 * nothing reads.
 */
export const EVENT_OVERRIDE_COLUMNS: Record<string, readonly string[]> = Object.fromEntries(
  SERVICE_ROWS.map(r => [r.id, r.eventColumns]),
)

/**
 * Every `truck_events` column "clear my changes and use <type> exactly" clears — and nothing else.
 *
 * 🔴 DERIVED FROM `SERVICE_ROWS`, so it cannot fall out of step when a row is added. This build added
 * offline protection's three columns to it by adding one row, and that is the whole edit.
 * ⚠️ IT REACHES NOTHING A TYPE CANNOT SET. The pause, the extra wait, the paid step, the completion
 * presses and the offline MARKERS (`online_paused_until`, `offline_no_autoaccept_until`) are not here:
 * a type does not set them, and clearing them would destroy work for no reason. Asserted by
 * scripts/event-types.cjs against an explicit forbidden list.
 */
export const CLEARABLE_EVENT_COLUMNS: readonly string[] = SERVICE_ROWS.flatMap(r => r.eventColumns)

/** A new type starts as a copy of Standard: every setting null, i.e. "same as Standard". */
export function blankTypeValues(): Pick<EventType, ServiceKey> {
  return {
    buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null,
    offline_protection: null, offline_protection_mode: null, offline_auto_reject_mins: null,
  }
}

/**
 * The name chips on "+ New event type" (NewType2 board).
 *
 * ── 🔴 NAMES ONLY. NO DESCRIPTIONS, AND NO PRE-FILLED VALUES ─────────────────────────────────────
 * The first build offered these as SUGGESTIONS that pre-filled settings — "Festival: buzzers on,
 * mark-ready on, collection every 10 min". That was wrong twice over, and both reasons are worth
 * keeping written down:
 *
 *   1. IT GUESSED THE TRUCK'S SERVICE FOR THEM. "Festival" means long queues to one truck and a quiet
 *      afternoon pitch to another. A type that arrives with three settings already changed is a type
 *      the operator has to UNDO before it is honest, and they would not know which three.
 *   2. IT MADE THE CHIP MATTER. Two trucks who both tapped "Festival" got different starting points
 *      from the same word, and nothing on screen said so afterwards.
 *
 * 🔴 SO EVERY NEW TYPE STARTS WITH EVERY SETTING NULL — exactly like Standard — WHICHEVER CHIP WAS
 * TAPPED. The chip fills the NAME FIELD and does nothing else. `blankTypeValues()` is the only
 * starting state, and the screen says so: "It starts exactly like Standard. Change anything after."
 *
 * ⚠️ "Private hire" IS STILL OFFERED AS A NAME. Private visibility is a later stage and the column
 * does not exist, but a truck who does private hires wants the type now for its service settings.
 * Because a chip carries no values, offering the name promises nothing.
 */
export const TYPE_NAME_CHIPS: readonly string[] = ['Festival', 'Pub', 'Market', 'Private hire'] as const

/** The dots beside each type's name on the setup screen, and the chip in the Add event picker. */
export const TYPE_COLOURS = ['#E8550F', '#2563EB', '#7C3AED', '#0D9488', '#C026D3', '#CA8A04'] as const

/** Standard has no row of its own, so its dot is the grey the mockup gives it. */
export const STANDARD_COLOUR = '#94A3B8'

/**
 * A type's colour, by its position in the truck's list.
 *
 * ⚠️ DERIVED, NOT STORED. A colour column would be one more thing to migrate, to validate and to
 * offer a picker for, and the colour carries no meaning — it is there so two columns can be told apart
 * at a glance. Six colours wrap; a truck with seven types sees the first colour twice, which is a
 * cosmetic repeat rather than a fault.
 */
export const colourFor = (index: number): string => TYPE_COLOURS[index % TYPE_COLOURS.length]

/** The interval choices a type may offer, re-exported so the screen needs one import. */
export const TYPE_INTERVAL_CHOICES: readonly IntervalChoice[] = INTERVAL_CHOICES

export const MAX_TYPE_NAME = 40
