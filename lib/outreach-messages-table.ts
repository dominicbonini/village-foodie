// lib/outreach-messages-table.ts — is `outreach_messages` actually there, and what does a database
// error say? Two questions both mail routes ask, answered in one place.
//
// 🔴 THIS FILE IS THE FIX FOR A PROBE THAT SAID YES TO A TABLE THAT DID NOT EXIST. Before the migration
// was applied, the compose window offered Send, and the send failed at the insert with "The message
// could not be recorded". Both routes carried their own copy of the probe, so the same wrong answer was
// wrong twice.

/** The migration has simply not been run. The sentence names the thing to do. */
export const MIGRATION_OFF = 'Email sending is off until the outreach_messages migration is applied.'

export type TableProbe = { ready: true } | { ready: false; refusal: string }

/**
 * 🔴 WHY THE OLD PROBE WAS WRONG, IN ONE SENTENCE: it used `select('id', { head: true })`, and a HEAD
 * response HAS NO BODY, so PostgREST had nowhere to put its error document — the error came back with
 * an EMPTY `code` and an EMPTY `message`. The matcher asked "is this PGRST205, or 42P01, or does the
 * message mention the schema cache?", got no to all three, and returned `true`.
 *
 * Two changes, and the second is the one that matters:
 *   1. the caller runs a NORMAL select with `limit(1)`, so an error arrives with its code intact;
 *   2. 🔴 ANY ERROR MEANS NOT READY. The old shape was a whitelist of known failures with "present" as
 *      the DEFAULT. This is the opposite, and it has to be: an unrecognised error is a table this route
 *      cannot read, and offering to send against a table it cannot read is exactly the bug.
 */
export async function messagesTableProbe(
  run: () => Promise<{ error: { code?: string | null; message?: string | null } | null }>,
): Promise<TableProbe> {
  let error: { code?: string | null; message?: string | null } | null
  try { ({ error } = await run()) } catch (err) {
    return { ready: false, refusal: `Email sending is off: the messages table could not be read (${dbDetail(err)})` }
  }
  if (!error) return { ready: true }
  const code = (error.code ?? '').trim()
  const message = (error.message ?? '').trim()
  if (code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(message)) {
    return { ready: false, refusal: MIGRATION_OFF }
  }
  // Anything else — a permission problem, a dead connection, or the empty-bodied error that caused this
  // bug — is reported WITH its code, so the next failure is diagnosable from the screen.
  return { ready: false, refusal: `Email sending is off: the messages table could not be read (${dbDetail(error)})` }
}

/**
 * A Postgres/PostgREST error reduced to something safe to put on a screen: its code and its message,
 * capped.
 * 🔴 NEVER A CREDENTIAL AND NEVER THE TEST ADDRESS. Neither appears in a schema or constraint error,
 * and the cap stops a long `details` field dragging row content onto the screen with it.
 * ⚠️ AND IT NEVER RETURNS AN EMPTY STRING — an error reported as "" is how the probe bug read as
 * success, so an error with nothing in it says so in words.
 */
export function dbDetail(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code.trim() : ''
  const message = typeof e.message === 'string' ? e.message.trim() : ''
  const joined = [code, message].filter(Boolean).join(': ')
  return joined ? joined.slice(0, 200) : 'the database returned no code or message'
}
