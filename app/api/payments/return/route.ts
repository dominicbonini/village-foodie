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
import { soldOutRefusalMessage } from '@/lib/payments/sold-out-copy'

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

/**
 * 🔴 WHAT THE DRAFT SAYS HAPPENED, FOR A CALLER THAT DID NOT DO THE PROMOTING.
 *
 * A draft can only be claimed once, so the LOSER of the webhook-versus-redirect race gets `already` and
 * knows nothing about the outcome. When the winner REFUSED, `already` is not "your order exists" — it is
 * "your order never will", and sending that customer to a confirmation screen to poll for sixty seconds
 * is the worst answer available. This is the one read that tells them apart.
 */
async function refusalOnDraft(
  draftKey: string,
): Promise<{ refused: boolean; eventId: string | null; reason: string | null }> {
  const [{ data: draft }, { data: order }] = await Promise.all([
    supabase.from('order_drafts').select('event_id, promotion_failed_at, promotion_failure_reason').eq('order_key', draftKey).maybeSingle(),
    supabase.from('orders').select('order_key').eq('order_key', draftKey).maybeSingle(),
  ])
  return {
    // An ORDER settles it: if one exists this draft promoted, whatever else is recorded on it.
    refused: !order && !!draft?.promotion_failed_at,
    eventId: draft?.event_id ?? null,
    reason: draft?.promotion_failure_reason ?? null,
  }
}

/** The refusal landing URL: the customer's own event, then the sentence. Both or neither is wrong. */
function refusedUrl(menuUrl: string, eventId: string | null, message: string): string {
  const url = new URL(menuUrl)
  if (eventId) url.searchParams.set('event_id', eventId)
  url.searchParams.set('payment_failed', message)
  return url.toString()
}

/**
 * 🔴 THE NAMES, SO THE PAGE CAN TAKE THEM OUT OF THE BASKET ITSELF.
 *
 * The recorded reason is machine-readable by construction — `stock: Fish Cake, Chicken Satay`,
 * `option_sold_out: Extra cheese`, `category_closed: Starters` — and the page cannot act on a sentence.
 * ⚠️ IT RETURNS WHATEVER WAS NAMED, INCLUDING A CATEGORY OR AN OPTION NAME. Matching is the page's job
 * and a name that matches no basket line simply removes nothing, which is the correct outcome for both.
 */
function namesFromReason(reason: string | null): string[] {
  if (!reason || !reason.includes(': ')) return []
  return reason.slice(reason.indexOf(': ') + 2).split(', ').map(s => s.trim()).filter(Boolean)
}

/**
 * The sentence for a refusal SOMEBODY ELSE made.
 *
 * ✅ THE SOLD-OUT WORDING IS NO LONGER WRITTEN TWICE. promoteDraft composes it and does not persist it —
 * only the machine reason ("stock: Fish Cake, Chicken Satay") reaches the draft — so this rebuild is
 * unavoidable, but it now goes through the SAME builder promoteDraft calls. One wording, one file.
 * ⚠️ The two non-sold-out branches keep their own words because they describe different facts.
 */
function messageForRecordedReason(reason: string | null): string {
  const generic = 'Sorry — we could not place your order. No money has been taken.'
  if (!reason) return generic
  if (reason === 'truck_missing') return 'This truck is no longer taking orders. No money has been taken.'
  const named = namesFromReason(reason)
  if (!named.length) return generic
  if (reason.startsWith('category_closed:')) {
    return `Sorry — ${named[0]} closed while you were paying, so we could not place your order. No money has been taken.`
  }
  if (reason.startsWith('stock:') || reason.startsWith('option_sold_out:') || reason.startsWith('option_ceiling:')) {
    return soldOutRefusalMessage(named, 'paying') ?? generic
  }
  return generic
}

export async function GET(req: NextRequest) {
  const draftKey = req.nextUrl.searchParams.get('draft')
  const truck = req.nextUrl.searchParams.get('truck') ?? ''
  const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? req.nextUrl.origin
  const menuUrl = `${base}/trucks/${encodeURIComponent(truck)}/order`

  // ── 🔴 TWO CALLERS, TWO SHAPES, ONE DECISION. ─────────────────────────────────────────────────
  // `json=1` is the IN-PAGE caller: the customer never left, `confirmPayment` resolved without a
  // redirect, and the page is still standing with their basket in it. It asks for the outcome as data
  // so a refusal can be rendered where they are — in the order sheet, beside the sold-out notice the
  // pay-at-hatch path has always used — instead of throwing the page away to say one sentence.
  // ⚠️ WITHOUT IT NOTHING CHANGES. Stripe's own redirect (3DS, wallets, any flow that leaves the page)
  // arrives as a top-level navigation with no such parameter and still gets a 303 to a page, because a
  // browser following a redirect cannot render JSON.
  const wantsJson = req.nextUrl.searchParams.get('json') === '1'
  const reply = (redirectTo: string, payload: Record<string, unknown>) =>
    wantsJson ? NextResponse.json(payload) : NextResponse.redirect(redirectTo, { status: 303 })

  if (!draftKey) {
    console.warn('[payments/return] no draft key — sending to the menu')
    return reply(menuUrl, { outcome: 'pending', orderKey: null })
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
    return reply(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { outcome: 'pending', orderKey: draftKey })
  }

  // ⚠️ NO try/catch HERE ANY MORE, AND NOTHING IS LOST BY THAT. A throw is caught on the shared promise
  // above and arrives as `{ status: 'error' }`, which the `default` arm below already sends to the
  // confirmation — the same redirect the old catch produced, for the same stated reason: the webhook is
  // still coming, and telling the customer it failed would be a guess, and the wrong one.
  const res = raced

  switch (res.status) {
    case 'promoted':
      // ✅ THE ORDER EXISTS, created by this request. The draft's key IS the order's key, so this is the
      // same confirmation URL the order-first build produced and the screen renders unchanged.
      return reply(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { outcome: 'confirmed', orderKey: draftKey })

    case 'already': {
      // ── 🔴 SOMEBODY ELSE PROMOTED IT, AND `already` DOES NOT SAY WHETHER THEY SUCCEEDED. ─────────
      // The webhook fires on `payment_intent.amount_capturable_updated`, which Stripe emits the instant
      // the customer authorises — the same instant this request starts. Losing that race is ordinary.
      // Until now the loser assumed success and sent the customer to a confirmation screen; when the
      // winner had REFUSED, that screen polls for an order that will never exist and then gives up,
      // which is a worse outcome than the redirect this whole change is about.
      const outcome = await refusalOnDraft(draftKey)
      if (!outcome.refused) {
        return reply(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { outcome: 'confirmed', orderKey: draftKey })
      }
      const message = messageForRecordedReason(outcome.reason)
      console.warn(
        `[payments/return] draft=${draftKey} was already REFUSED by the other trigger (${outcome.reason}) — ` +
        `telling the customer instead of sending them to a confirmation that will never fill in.`,
      )
      return reply(refusedUrl(menuUrl, outcome.eventId, message), {
        outcome: 'refused', orderKey: draftKey, message, soldOut: namesFromReason(outcome.reason),
      })
    }

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
      // 🔴 THE EVENT TRAVELS WITH THE MESSAGE. Without it the redirect lands on the truck's EVENT
      // PICKER — a customer who has just had a card authorised and released is asked which market day
      // they meant, with their order gone. `?event_id=` is the page's existing deep-link and scopes it
      // to the event they were ordering from. Read from the draft, which is the only thing that still
      // knows: nothing in the redirect URL carries it.
      const { eventId } = await refusalOnDraft(draftKey)
      return reply(
        refusedUrl(menuUrl, eventId, res.customerMessage),
        { outcome: 'refused', orderKey: draftKey, message: res.customerMessage, soldOut: namesFromReason(res.reason) },
      )
    }

    case 'error':
    default:
      // Ours, not theirs, and retryable — lock contention is the realistic cause. The webhook will try
      // again; the customer is sent to the confirmation, which fills in when it lands.
      console.warn(`[payments/return] promotion incomplete for draft=${draftKey} (${res.detail}) — webhook will retry`)
      return reply(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { outcome: 'pending', orderKey: draftKey })
  }
}
