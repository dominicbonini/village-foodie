// app/api/payments/return/route.ts
// Where Stripe sends the customer after they authorise. THE OPTIMISATION TRIGGER, not the authority.
//
// ── WHY A SERVER ROUTE SITS BETWEEN STRIPE AND THE CONFIRMATION ─────────────────────────────────────
// Under order-first the order already existed, so Stripe could return the customer straight to
// /trucks/{slug}/order?confirm={key} and it rendered. It does not exist now. Something has to promote
// the draft, and the returning customer is the fastest trigger available — the webhook is authoritative
// but arrives when it arrives, and a customer staring at a spinner is a customer who thinks it failed.
//
// 🔴 THIS ROUTE IS AN OPTIMISATION AND MUST NEVER BE THE ONLY THING THAT WORKS. A customer who closes
// the tab after authorising never reaches it, and their order must still exist. That is the webhook's
// job (app/api/webhooks/stripe, payment_intent.amount_capturable_updated). Both call the same
// promoteDraft; whichever arrives first wins; the loser gets `already` and does nothing.
//
// ── ⚠️ THE CONFIRMATION SCREEN IS UNTOUCHED ────────────────────────────────────────────────────────
// On success this redirects to the SAME URL Stripe used to point at directly, so the confirmation
// renders from the order row exactly as it does for a pay-at-hatch customer. Nothing about that screen
// or the `?confirm=` branch changed for this phase.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { promoteDraft } from '@/lib/payments/promote-draft'
import { keepAlive } from '@/lib/runtime/after-response'

export const runtime = 'nodejs'

// ── 🔴 THE BUDGET, AND WHY IT IS THE CEILING RATHER THAN SOMETHING SNUGGER. ───────────────────────
// This route had NO maxDuration and so inherited the platform default the repo documents at
// app/api/demo/route.ts:23 as "10s on Hobby / 15s on Pro". That is BELOW the measured cost of a
// promotion (order 25: 23.5s from claim to insert), and being killed here is the single worst outcome
// this route can produce: the claim is taken BEFORE the work, so a killed promoter leaves `promoted_at`
// set with no order row, and the webhook then stands down on `already`.
// Set to 300, matching app/api/demo/route.ts, which records it as "the highest a Vercel Pro Node
// function permits (300s)". ⚠️ REQUIRES THE PRO PLAN: on Hobby the cap is 60s.
// 🔴 THE CUSTOMER NEVER WAITS THAT LONG — see REDIRECT_DEADLINE_MS. This budget is for the `after()`
// continuation that carries on once they have already been sent to their confirmation.
export const maxDuration = 300

// ── 🔴 HOW LONG A WAITING HUMAN IS MADE TO WAIT, AND WHY IT IS NOT "UNTIL PROMOTION FINISHES". ────
// Awaiting the whole of promoteDraft would hold this request through the order insert AND the capacity
// rebuild AND two Brevo sends — order 24 measured 20.4s end to end, of which only the first 2.5s
// produced the order row the customer is waiting for. The rest is work they have no reason to watch.
// So the promotion is RACED against this deadline. Beat it and they are redirected to a confirmation
// that renders instantly. Miss it and they are redirected anyway, to exactly the screen and exactly the
// polling behaviour they get today — while the SAME promotion continues under after().
// 🔴 SO THE DEADLINE CANNOT MAKE ANYTHING WORSE. It never cancels, never abandons and never releases the
// claim; it only stops WAITING. The floor of this design is today's behaviour, and the ceiling is an
// instant confirmation.
// ⚠️ 6000ms is ~2.4x the 2.5s a healthy promotion took to reach its insert (order 24, 12 August), and
// far inside the 60s the confirmation screen tolerates before it gives up (page.tsx:675-677).
const REDIRECT_DEADLINE_MS = 6000

/** The deadline arm of the race. Resolves to this sentinel; never rejects, never cancels anything. */
const STILL_RUNNING = Symbol('promotion-still-running')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const draftKey = req.nextUrl.searchParams.get('draft')
  const truck = req.nextUrl.searchParams.get('truck') ?? ''
  const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? req.nextUrl.origin
  const menuUrl = `${base}/trucks/${encodeURIComponent(truck)}/order`

  // ⚠️ A REDIRECT, NEVER A JSON BODY. A human is at the other end of this request, in a browser, having
  // just paid. Every exit below lands them on a page.
  if (!draftKey) {
    console.warn('[payments/return] no draft key — sending to the menu')
    return NextResponse.redirect(menuUrl, { status: 303 })
  }

  // ── 🔴 START IT, HAND IT TO THE RUNTIME, THEN WAIT ONLY AS LONG AS A HUMAN SHOULD. ─────────────
  // `keepAlive` is called with the IN-FLIGHT promise rather than a thunk, precisely because this route
  // wants to await part of it. Registering it before the race means the continuation is declared to the
  // runtime whether we end up waiting for it or not — the whole lesson of order 25.
  // ⚠️ THE `.catch` IS ON THE SHARED PROMISE, so the deadline arm winning can never leave an unhandled
  // rejection behind. It converts a throw into the `error` shape this switch already handles.
  const work: Promise<Awaited<ReturnType<typeof promoteDraft>>> =
    promoteDraft(supabase, draftKey, 'redirect').catch(err => {
      console.error(`[payments/return] 🔴 promotion threw for draft=${draftKey} — the webhook remains the authority:`, err)
      return { status: 'error' as const, orderKey: draftKey, detail: err instanceof Error ? err.message : 'threw' }
    })
  keepAlive(work, `promotion:${draftKey}`)

  const raced = await Promise.race([
    work,
    new Promise<typeof STILL_RUNNING>(resolve => setTimeout(() => resolve(STILL_RUNNING), REDIRECT_DEADLINE_MS)),
  ])

  if (raced === STILL_RUNNING) {
    // 🔴 NOT A FAILURE, AND NOTHING WAS ABANDONED. Promotion is still running under after(); the
    // customer goes to the confirmation, which polls for up to 60s and fills in the moment the order
    // row lands. This is precisely the experience they had before this route was wired at all.
    console.warn(
      `[payments/return] promotion for draft=${draftKey} exceeded ${REDIRECT_DEADLINE_MS}ms — redirecting ` +
      `now and letting it finish under after(); the confirmation screen will poll it in.`,
    )
    return NextResponse.redirect(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { status: 303 })
  }

  // ⚠️ NO try/catch HERE ANY MORE, AND NOTHING IS LOST BY THAT. A throw is caught on the shared promise
  // above and arrives as `{ status: 'error' }`, which the `default` arm below already sends to the
  // confirmation — the same redirect the old catch produced, for the same stated reason: the webhook is
  // still coming, and telling the customer it failed would be a guess, and the wrong one.
  const res = raced

  switch (res.status) {
    case 'promoted':
    case 'already':
      // ✅ THE ORDER EXISTS — created by this request, or by the webhook a moment before it. The draft's
      // key IS the order's key, so this is the same confirmation URL the order-first build produced and
      // the screen renders unchanged.
      return NextResponse.redirect(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { status: 303 })

    case 'refused': {
      // ── 🔴 THE CASE THAT REACHES SOMEBODY'S BANK STATEMENT ────────────────────────────────────────
      // The re-check refused: what they authorised for sold out, or closed, while they were paying.
      // promoteDraft has ALREADY cancelled the authorisation — a hold released, never a charge refunded —
      // and recorded why on the draft. There is no order and there will not be one.
      //
      // 🔴 THE CUSTOMER IS TOLD, IN WORDS, ON THE PAGE THEY LAND ON, AND THE FIRST THING THE SENTENCE
      // MUST DO IS SAY NO MONEY WAS TAKEN. Anything vaguer and they check their banking app, see a
      // pending authorisation that has not yet dropped off, and conclude they have been charged for
      // nothing. The message is built in promoteDraft so the webhook path logs the identical wording.
      // ⚠️ `cancelled: false` means the cancel call itself failed. The customer is told the same thing —
      // no money will be taken — because that is still true: the hold expires on its own and the sweep
      // retries. What changes is that this is loud in the logs for a human to chase.
      if (!res.cancelled) {
        console.error(
          `[payments/return] 🔴 REFUSED AND NOT CANCELLED draft=${draftKey} (${res.reason}) — a hold may ` +
          `remain on this customer's card. The sweep will retry; check Stripe if it persists.`,
        )
      }
      const url = new URL(menuUrl)
      url.searchParams.set('payment_failed', res.customerMessage)
      return NextResponse.redirect(url.toString(), { status: 303 })
    }

    case 'error':
    default:
      // Ours, not theirs, and retryable — lock contention is the realistic cause. The webhook will try
      // again; the customer is sent to the confirmation, which fills in when it lands.
      console.warn(`[payments/return] promotion incomplete for draft=${draftKey} (${res.detail}) — webhook will retry`)
      return NextResponse.redirect(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { status: 303 })
  }
}
