// lib/demo-kitchen.ts — the three kitchen numbers the ADMIN Create Demo asks for, and their bounds.
//
// 🔴 ADMIN-ONLY, AND ABSENT MEANS TODAY'S DEMO. The anonymous landing-page path (`/api/demo`) never sends
// these; `parseDemoKitchen` returns `null` for an absent set and `provisionDemo` then behaves exactly as it
// did before this file existed. That is what makes "a demo created without touching the controls is
// byte-identical to one created today" true by construction rather than by inspection.
//
// WHY A MODULE AND NOT THREE PARSES IN THE ROUTE: the bounds are asserted by
// scripts/demo-seed-parameters.cjs against the SAME code the route runs, so the harness cannot drift from
// the validator, and the modal's own `min`/`max`/`step` attributes are generated from these constants.
import { INTERVAL_CHOICES, isIntervalChoice, DEFAULT_INTERVAL, type IntervalChoice } from '@/lib/slot-interval'
import { MAIN_PREP_SECS, MAIN_BATCH_SIZE } from '@/lib/demo-assumptions'

/** Collection times: exactly the five the Collection times box offers everywhere else. */
export const DEMO_INTERVAL_CHOICES = INTERVAL_CHOICES
export const DEMO_DEFAULT_INTERVAL: IntervalChoice = DEFAULT_INTERVAL

/** Cook time, in MINUTES. 1 is the smallest meaningful batch; 60 is an hour, past which a three-hour demo
 *  service could not show two batches back to back — the board would have nothing to demonstrate. */
export const DEMO_COOK_MINS_MIN = 1
export const DEMO_COOK_MINS_MAX = 60
export const DEMO_DEFAULT_COOK_MINS = Math.round(MAIN_PREP_SECS / 60)      // 5, today's value

/** Batch size, in ITEMS per batch. 1 is a single-item grill; 50 is far past any real hatch and exists only
 *  to stop a typo (500) seeding a board no operator would recognise. */
export const DEMO_BATCH_MIN = 1
export const DEMO_BATCH_MAX = 50
export const DEMO_DEFAULT_BATCH = MAIN_BATCH_SIZE                          // 4, today's value

/** The resolved set, as provisioning consumes it. `prepSecs` because that is the column's unit. */
export interface DemoKitchen {
  intervalMins: IntervalChoice
  prepSecs: number
  batchSize: number
}

export const DEMO_KITCHEN_MESSAGES = {
  interval: `Collection times must be one of ${DEMO_INTERVAL_CHOICES.join(', ')} minutes.`,
  cook: `Cook time must be a whole number of minutes between ${DEMO_COOK_MINS_MIN} and ${DEMO_COOK_MINS_MAX}.`,
  batch: `Batch size must be a whole number between ${DEMO_BATCH_MIN} and ${DEMO_BATCH_MAX}.`,
} as const

const whole = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isInteger(n) ? n : NaN        // NaN ⇒ present but not a whole number ⇒ an ERROR, not absent
}

/**
 * Parse the three fields off a request.
 *
 * 🔴 ABSENT AND INVALID ARE DIFFERENT ANSWERS, AND CONFLATING THEM IS THE FAILURE THIS GUARDS. A silently
 * dropped "batch size 500" would build a demo at 4 and tell the admin nothing; an absent field must build
 * today's demo. So: all three absent → `{ kitchen: null }`. Any present-but-wrong → `{ error }`, which the
 * route returns as a 400 with that sentence. A PARTIAL set is accepted — each missing field takes today's
 * value — because the modal always sends all three and a partial set can only come from a script.
 */
export function parseDemoKitchen(raw: {
  intervalMins?: unknown; cookMins?: unknown; batchSize?: unknown
}): { kitchen: DemoKitchen | null; error?: string } {
  const ivRaw = raw.intervalMins, cookRaw = raw.cookMins, batchRaw = raw.batchSize
  const absent = (v: unknown) => v === null || v === undefined || v === ''
  if (absent(ivRaw) && absent(cookRaw) && absent(batchRaw)) return { kitchen: null }

  let intervalMins: IntervalChoice = DEMO_DEFAULT_INTERVAL
  if (!absent(ivRaw)) {
    const n = whole(ivRaw)
    if (n === null || Number.isNaN(n) || !isIntervalChoice(n)) return { kitchen: null, error: DEMO_KITCHEN_MESSAGES.interval }
    intervalMins = n
  }
  let cookMins = DEMO_DEFAULT_COOK_MINS
  if (!absent(cookRaw)) {
    const n = whole(cookRaw)
    if (n === null || Number.isNaN(n) || n < DEMO_COOK_MINS_MIN || n > DEMO_COOK_MINS_MAX) return { kitchen: null, error: DEMO_KITCHEN_MESSAGES.cook }
    cookMins = n
  }
  let batchSize = DEMO_DEFAULT_BATCH
  if (!absent(batchRaw)) {
    const n = whole(batchRaw)
    if (n === null || Number.isNaN(n) || n < DEMO_BATCH_MIN || n > DEMO_BATCH_MAX) return { kitchen: null, error: DEMO_KITCHEN_MESSAGES.batch }
    batchSize = n
  }
  return { kitchen: { intervalMins, prepSecs: cookMins * 60, batchSize } }
}

/** True when the set is exactly today's demo, so provisioning can skip every write and stay byte-identical. */
export function isDefaultDemoKitchen(k: DemoKitchen | null): boolean {
  return !k || (k.intervalMins === DEMO_DEFAULT_INTERVAL && k.prepSecs === MAIN_PREP_SECS && k.batchSize === MAIN_BATCH_SIZE)
}
