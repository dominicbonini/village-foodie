// lib/outreach-poll-claims.ts — the three places the reply poll must win a RACE, not a check.
//
// 🔴 THE DEFECT THIS FIXES (Build 2, found 29 September 2026). Three guards were written as
// read-then-act, which is not a guard at all when two runs overlap — and two runs overlap by design,
// because the ten-minute cron and the "Check for replies now" button call the same routine:
//
//   1. THE LOCK read `mail_poll_lock`, decided it was free, and then wrote it. Two runs a millisecond
//      apart both read "free" and both proceeded.
//   2. A REPLY was skipped if its Message-ID was in an IN-MEMORY map built at the start of the run.
//      Two runs each built that map before either inserted, so each thought the reply was new. The
//      message row is unique on `message_id` so the second INSERT failed — but the code went on to
//      write the CONTACT row anyway, and `outreach_contacts` has no such constraint. One reply, two
//      rungs, and §57 reads that ladder.
//   3. A FAILED ROW was re-sent after a read said `status = 'failed'`. Two runs could both read it and
//      both re-send the same email to the same prospect.
//
// 🔴 THE SHAPE OF THE FIX IS THE SAME IN ALL THREE: ONE STATEMENT THAT BOTH TESTS AND ACTS, AND THE
// DATABASE DECIDES WHO WON. The caller proceeds only if its own statement returned a row. "Did anything
// happen?" is answered by the write itself rather than by a read taken before it.
//
// Pure of I/O in the sense that matters: every function here takes the client and does exactly one
// round trip, so the harness can drive two of them against one fake table and see who wins.
import type { SupabaseClient } from '@supabase/supabase-js'

export const LOCK_KEY = 'mail_poll_lock'
/** A run older than this is assumed dead — a container frozen mid-poll never releases. */
export const LOCK_STALE_MS = 2 * 60_000

/**
 * Take the poll lock, atomically.
 *
 * 🔴 TWO STATEMENTS, EACH OF WHICH IS ITSELF THE TEST, and neither of which is a read:
 *   • an INSERT that conflicts if the key already exists — this is the first-ever run;
 *   • an UPDATE filtered on `updated_at` being older than the staleness window — this is the takeover
 *     of a dead run. `.lt('updated_at', …)` is evaluated by Postgres against the row it is updating,
 *     so two runs racing it cannot both match.
 * A `select()` on each makes the result observable: rows back means this caller took it.
 *
 * ⚠️ `updated_at` IS THE CLOCK, NOT A FIELD IN THE JSON. A timestamp inside `value` could only be
 * compared by reading it first, which is the bug being fixed.
 */
export async function claimPollLock(supabase: SupabaseClient, now: Date): Promise<boolean> {
  const stamp = now.toISOString()
  const staleBefore = new Date(now.getTime() - LOCK_STALE_MS).toISOString()

  // The first run ever: the row does not exist. A conflict here means somebody else owns it already.
  const { data: inserted } = await supabase
    .from('outreach_settings')
    .insert({ key: LOCK_KEY, value: { takenAt: stamp }, updated_at: stamp })
    .select('key')
  if (inserted && inserted.length > 0) return true

  // The row exists: take it only if whoever holds it has gone quiet for longer than the window.
  const { data: taken } = await supabase
    .from('outreach_settings')
    .update({ value: { takenAt: stamp }, updated_at: stamp })
    .eq('key', LOCK_KEY)
    .lt('updated_at', staleBefore)
    .select('key')
  return !!taken && taken.length > 0
}

/**
 * Release it by making it look ancient, so the next run's `.lt(updated_at, …)` matches immediately.
 * ⚠️ DELETING THE ROW WOULD ALSO WORK AND IS WORSE: the insert path would then be the common case, and
 * an insert that races an insert is the one shape Postgres answers with an error rather than a count.
 */
export async function releasePollLock(supabase: SupabaseClient): Promise<void> {
  const ancient = new Date(0).toISOString()
  try {
    await supabase.from('outreach_settings')
      .update({ value: { takenAt: null }, updated_at: ancient })
      .eq('key', LOCK_KEY)
  } catch { /* the staleness window covers a failure here */ }
}

/**
 * Insert a message row, and say whether THIS caller created it.
 *
 * 🔴 THIS IS THE GATE FOR THE CONTACT LOG. `ignoreDuplicates` turns the unique index on `message_id`
 * into the arbiter: exactly one of two racing runs gets a row back, and only that one goes on to write
 * the rung. The loser gets an empty array and logs nothing — which is the correct outcome, because the
 * reply HAS been recorded, just not by it.
 * ⚠️ IT RETURNS THE ROW, NOT A BOOLEAN, because the caller needs the id to link `contact_id`.
 */
export async function insertMessageOnce<T extends Record<string, unknown>>(
  supabase: SupabaseClient, row: T,
): Promise<{ created: true; id: string } | { created: false; error: string | null }> {
  const { data, error } = await supabase
    .from('outreach_messages')
    .upsert(row, { onConflict: 'message_id', ignoreDuplicates: true })
    .select('id')
  if (error) return { created: false, error: error.message }
  const first = (data ?? [])[0] as { id?: string } | undefined
  if (!first?.id) return { created: false, error: null }   // somebody else won; nothing to do
  return { created: true, id: first.id }
}

/**
 * Claim a failed row for an automatic retry.
 *
 * 🔴 `failed` → `sending` IN ONE STATEMENT, FILTERED ON `failed`. Whoever's update returns a row owns
 * the retry; the other run's update matches nothing because the status has already moved. Without this
 * two overlapping polls could each re-send the same email to the same prospect — the one failure mode
 * this whole feature is arranged to prevent.
 * ⚠️ AND IT LEAVES THE ROW AT `sending`, which is honest: the send is about to be attempted. If the
 * process dies here, the stuck-sending sweep turns it into `uncertain`, which needs a human — exactly
 * what an interrupted send deserves.
 */
export async function claimRetry(
  supabase: SupabaseClient, rowId: string, now: Date,
): Promise<boolean> {
  const { data } = await supabase
    .from('outreach_messages')
    .update({ status: 'sending', updated_at: now.toISOString() })
    .eq('id', rowId)
    .eq('status', 'failed')
    .select('id')
  return !!data && data.length > 0
}
