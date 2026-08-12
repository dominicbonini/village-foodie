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

export const runtime = 'nodejs'

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

  let res: Awaited<ReturnType<typeof promoteDraft>>
  try {
    res = await promoteDraft(supabase, draftKey, 'redirect')
  } catch (err) {
    // 🔴 THE WEBHOOK IS STILL COMING. This route failing does not mean the order will not exist, so the
    // customer is sent to the confirmation, which will resolve as soon as promotion lands. Telling them
    // it failed would be a guess, and the wrong one.
    console.error(`[payments/return] 🔴 promotion threw for draft=${draftKey} — the webhook remains the authority:`, err)
    return NextResponse.redirect(`${menuUrl}?confirm=${encodeURIComponent(draftKey)}`, { status: 303 })
  }

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
