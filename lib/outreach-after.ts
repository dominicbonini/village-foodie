// lib/outreach-after.ts — run work AFTER the response, without losing it.
//
// 🔴 THE SEND ANSWERS AS SOON AS THE MAIL SERVER HAS THE EMAIL (15 October 2026,
// docs/outreach-instant-send-report.md). The Sent-folder copy and the contact log do not decide whether
// the email may go, so they run after the response through Next's `after()` — on Vercel that is the
// platform's waitUntil, so the function stays alive until they finish (`maxDuration` still bounds it).
// ⚠️ OUTSIDE A REQUEST (a harness calling the handler directly) `after()` throws; the work is then run
// immediately instead of being dropped. ⚠️ FAILURES ARE NEVER SWALLOWED: the caller records them on the
// message row, where the timeline already offers Save to Sent and "log it".
import { after } from 'next/server'

export function runAfter(label: string, work: () => Promise<void>): void {
  const guarded = async () => {
    try { await work() } catch (e) {
      console.error(`[outreach after-send] ${label} failed:`, e instanceof Error ? e.message : String(e))
    }
  }
  try { after(guarded) } catch { void guarded() }
}
