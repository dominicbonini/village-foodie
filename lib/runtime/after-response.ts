// lib/runtime/after-response.ts
// 🔴 WORK THAT MUST OUTLIVE THE RESPONSE, DECLARED TO THE RUNTIME RATHER THAN ORPHANED.
//
// ── THE FAILURE THIS EXISTS FOR, AND IT IS EVIDENCED, NOT THEORETICAL ───────────────────────────
// Order 25 (12 August 2026). The Stripe webhook returned its 2xx and started promotion with
// `void promoteDraft(...)`. The claim landed 345 ms later; the order row appeared 23.5 s after that;
// `promoteDraft` did not RESOLVE for 149.8 s. Vercel's runtime log for that window carries 24 RECEIVED
// lines, one DUPLICATE and one 500 — and NOT ONE `promotion(...) -> promoted` completion line, which
// startPromotion writes inside its own `.then`. The work ran. Its logs surfaced under no invocation.
// 🔴 THAT IS SUSPENSION, NOT SLOWNESS, and a floating promise is exactly what invites it: the runtime
// was never told the work existed, so it had no reason to keep the container awake for it.
//
// ── WHAT `after()` CHANGES ──────────────────────────────────────────────────────────────────────
// Next 16.1.6 ships it (`node_modules/next/server.d.ts`: `export { after } from 'next/dist/server/after'`)
// and nothing in this repo used it. Its own type declaration says it "allows you to schedule callbacks
// to be executed after the current request finishes" — the framework now KNOWS about the task, and the
// invocation's `maxDuration` becomes the budget for it rather than an accident of scheduling.
// ⚠️ THIS IS NOT A GUARANTEE AND IS NOT PRESENTED AS ONE. Whether Vercel holds a container open for an
// `after()` task, and for how long, is platform behaviour that cannot be read out of this repo. What is
// certain is the direction: declared work can be waited for, an orphaned promise cannot.
//
// ── 🔴 WHY THE try/catch IS NOT DEFENSIVE PADDING ──────────────────────────────────────────────
// `after()` requires a request scope and THROWS outside one. Both callers are webhook/redirect handlers
// whose contract is that nothing between verification and the response may throw — a throwing handler is
// precisely what turns one Stripe delivery into several. So a failure to schedule degrades to exactly
// the behaviour that shipped before this file existed (a floating promise), loudly, and the response is
// never at risk. Falling back is strictly better than today; throwing would be strictly worse.
import { after } from 'next/server'

/**
 * Keep `task` alive past the response.
 *
 * @param task  a promise ALREADY IN FLIGHT, or a thunk to start after the response. Pass an in-flight
 *              promise when the caller may want to await part of it first (the redirect route races it
 *              against a deadline); pass a thunk when the work must not begin before the 2xx.
 * @param label for the log line if scheduling fails. Never the payload.
 */
export function keepAlive(task: Promise<unknown> | (() => Promise<unknown>), label: string): void {
  try {
    // ⚠️ `after` accepts either shape — see AfterTask in next/dist/server/after/after.d.ts.
    after(task)
  } catch (err) {
    // 🔴 THE OLD BEHAVIOUR, ON PURPOSE. An orphaned promise is what this file replaces; it is also the
    // only sane fallback, because the alternative is either throwing (breaks the response contract) or
    // awaiting (breaks the latency contract). Loud, so a deployment where this never works is visible.
    console.error(
      `[after-response] 🔴 could not schedule "${label}" with after() — falling back to a floating ` +
      `promise, which the runtime may drop:`, err instanceof Error ? err.message : err,
    )
    // ⚠️ `.catch` because an orphaned REJECTION is an unhandled rejection, which on some runtimes kills
    // the process. Every caller's task already swallows its own errors; this is the second belt.
    void Promise.resolve(typeof task === 'function' ? task() : task)
      .catch(e => console.error(`[after-response] 🔴 fallback task "${label}" rejected:`, e))
  }
}
