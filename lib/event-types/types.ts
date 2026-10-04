// lib/event-types/types.ts — what an event type IS, and the suggestions offered for a new one.
//
// ── 🔴 PURE. NO DATABASE, NO NETWORK, NO REACT ─────────────────────────────────────────────────────
// This module and `resolve.ts` beside it are the whole of the feature's meaning, and they are
// importable by the server route, the client screen and the harness alike. Everything that reads the
// database lives in `read.ts`; everything that draws lives in components/manage/EventTypes.tsx.

/* From the leaf: lib/slot-interval.ts imports lib/event-types/resolve.ts, so the vocabulary is taken
 * from the module that has no imports of its own. */
import { INTERVAL_CHOICES, type IntervalChoice } from '@/lib/slot-interval-core'

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
}

/**
 * The four service settings a type may carry, in the order the setup screen lists them.
 *
 * 🔴 ONE LIST, USED FOUR TIMES: the screen's rows, the route's write allowlist, "clear my changes"
 * (which clears exactly the event columns these map to) and the harness. A fifth place that spelled
 * them out again is a place that could fall out of step when stage 3 adds a setting.
 */
export const SERVICE_KEYS = ['buzzer_prompt', 'takes_cash', 'order_ready', 'collection_interval_mins'] as const
export type ServiceKey = (typeof SERVICE_KEYS)[number]

/** The label each setting is shown under. The mockup's wording, including the quotation marks. */
export const SERVICE_LABELS: Record<ServiceKey, string> = {
  buzzer_prompt: 'Buzzers',
  takes_cash: 'Take cash',
  order_ready: '“Mark ready” step',
  collection_interval_mins: 'Collection times',
}

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
export const EVENT_OVERRIDE_COLUMNS: Record<ServiceKey, readonly string[]> = {
  buzzer_prompt: ['buzzer_prompt'],
  takes_cash: ['takes_cash_override'],
  order_ready: ['order_ready_override'],
  collection_interval_mins: ['collection_interval_mins_override', 'operator_collection_interval_mins_override'],
}

/** A new type starts as a copy of Standard: every setting null, i.e. "same as Standard". */
export function blankTypeValues(): Pick<EventType, ServiceKey> {
  return { buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null }
}

/**
 * The suggestions "+ New event type" offers, from the NewType board.
 *
 * 🔴 NONE OF THEM SETS "PRIVATE", AND PRIVATE HIRE IS STILL OFFERED BY NAME. Private visibility is a
 * later stage and the column does not exist, so a suggestion that promised it would be describing
 * something the build cannot do. The NAME is still useful — a truck who does private hires wants the
 * type now, for its service settings — so it is offered with a description of what it actually does.
 * ⚠️ THE DESCRIPTIONS NAME ONLY SETTINGS THIS BUILD RESOLVES. "Shorter menu, prices up" is the
 * mockup's Festival line and is deliberately NOT used: nothing in this build changes a menu or a
 * price, and a suggestion that said so would be a promise the next order breaks.
 */
export interface TypeSuggestion {
  name: string
  description: string
  values: Pick<EventType, ServiceKey>
}

export const TYPE_SUGGESTIONS: readonly TypeSuggestion[] = [
  {
    name: 'Festival',
    /* Long queues, a rack of buzzers, and a tighter grid because people are walking past. */
    description: 'Buzzers on, mark-ready step on, collection every 10 minutes',
    values: { buzzer_prompt: true, takes_cash: null, order_ready: true, collection_interval_mins: 10 },
  },
  {
    name: 'Pub',
    /* A pitch where the truck is the kitchen: nothing unusual, which is a type worth having so the
     * truck can SEE that this venue is ordinary rather than wondering. */
    description: 'Your normal service',
    values: { buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null },
  },
  {
    name: 'Market',
    /* Daytime trade, small orders, and cash is still common. */
    description: 'Take cash on, collection every 15 minutes',
    values: { buzzer_prompt: null, takes_cash: true, order_ready: null, collection_interval_mins: 15 },
  },
  {
    name: 'Private hire',
    /* A booked function: one host, a known headcount, no queue to manage. */
    description: 'Buzzers off, take cash off',
    values: { buzzer_prompt: false, takes_cash: false, order_ready: null, collection_interval_mins: null },
  },
] as const

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
