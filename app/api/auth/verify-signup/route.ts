// app/api/auth/verify-signup/route.ts
// The click target of the signup verification email. Marks the address confirmed, then bounces them into
// the wizard.
//
// A ROUTE HANDLER, NOT A PAGE: there is nothing to decide here and nothing to read — the only useful
// outcome is landing back where they were, already signed in. A confirmation page would be a dead end
// with a button on it. The existing /verify-email page is a page because the EMAIL-CHANGE flow has real
// failure states worth explaining; this one has one.
//
// NOT AUTHENTICATED, by design: they may open the link on their phone, in a different browser, with no
// session. The token is 256 bits of entropy and single-purpose, so it is the credential.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOperatorWelcomeEmail, firstNameFrom } from '@/lib/email-signup'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const origin = req.nextUrl.origin

  // ── WHERE THIS LINK LANDS ────────────────────────────────────────────────────────────────────────
  // 🔴 IT USED TO SEND EVERY BRANCH TO /setup, AND THAT WAS THE BUG.
  // /setup's first and only step asks "What's your truck called?" with no lookup, so an operator who had
  // ALREADY finished the in-modal wizard — account, truck and all, in about 3 seconds — clicked the
  // confirmation email a minute later and was asked to name a truck that already existed. Their answer
  // was then discarded by create_truck's idempotence guard (it returns the existing row, `resumed:true`).
  // Verification gates nothing (see the note in app/api/signup/route.ts), so this link's only job is to
  // record the click and put the operator back where they were.
  //
  // So: resolve the operator from the token and ask whether they already have a truck.
  //   • truck  → /manage/<dashboard_token>?verify=<status>
  //   • none   → /setup?verify=<status>, exactly as before
  //
  // ⚠️ DELIBERATELY NOT ?import=demo. Bouncing through /setup used to add a SECOND navigation to
  // /manage/<token>?import=demo, which re-ran the Menu bootstrap and delivered a duplicate error toast.
  // The operator already arrived with that param from the wizard; sending it again is what duplicated it.
  const backToSetup = (status: string) => NextResponse.redirect(`${origin}/setup?verify=${status}`)

  if (!token) return backToSetup('invalid')

  const { data: row } = await supabase
    .from('operator_email_verifications')
    .select('id, operator_id, email, expires_at, verified_at')
    .eq('token', token)
    .maybeSingle()

  // No row ⇒ no operator to resolve, so there is nowhere else to send them.
  if (!row) return backToSetup('invalid')

  // Verification is ACCOUNT-level, so any truck this operator owns is a valid destination. Prefer one
  // still in setup — that is where /setup would have sent them — and fall back to their oldest otherwise
  // (an operator who has finished setup should land on their console, not a naming form).
  const { data: trucks } = await supabase
    .from('trucks')
    .select('dashboard_token, setup_step, name')
    .eq('operator_id', row.operator_id)
    .order('created_at', { ascending: true })

  const truck = (trucks ?? []).find(t => t.setup_step && t.setup_step !== 'done') ?? (trucks ?? [])[0] ?? null

  const back = (status: string) =>
    truck?.dashboard_token
      ? NextResponse.redirect(`${origin}/manage/${encodeURIComponent(truck.dashboard_token)}?verify=${status}`)
      : backToSetup(status)

  // Already used is a SUCCESS from the reader's point of view — they clicked twice, or the mail client
  // pre-fetched the link. Telling them it failed would be both false and alarming.
  if (row.verified_at) return back('ok')
  if (new Date(row.expires_at) < new Date()) return back('expired')

  // The success branch WRITES verified_at before redirecting.
  //
  // ⚠️ `.is('verified_at', null)` IS THE SEND GUARD, not a redundant filter. Without it two near-
  // simultaneous clicks (a mail-client prefetch racing the human) both pass the check above, both
  // update, and both send a welcome. With it exactly one UPDATE matches a row, so `updated` is
  // non-empty for exactly one of them — and that is the one that mails.
  const { data: updated, error } = await supabase
    .from('operator_email_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('verified_at', null)
    .select('id')

  // ── WELCOME EMAIL — FIRST SUCCESSFUL VERIFICATION ONLY ───────────────────────────────────────────
  // Reached only from here: the already-verified branch returns above and never gets this far, and a
  // failed or lost-the-race UPDATE leaves `updated` empty. Sent to the address ON THE VERIFICATION ROW
  // — that is the address they just proved they control.
  //
  // 🔴 CANNOT BREAK VERIFICATION. Three layers: sendOperatorWelcomeEmail swallows every error
  // internally, an 8s abort bounds a hung Brevo connection, and this try/catch covers the operator
  // lookup as well. Nothing here feeds `back()` — the redirect is already determined by `error`.
  if (!error && (updated?.length ?? 0) > 0) {
    try {
      const { data: op } = await supabase
        .from('operators').select('name, email').eq('id', row.operator_id).maybeSingle()
      const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL || origin
      await sendOperatorWelcomeEmail({
        to: op?.email || row.email,
        firstName: firstNameFrom(op?.name),
        truckName: (truck?.name ?? '').trim() || null,
        // No truck yet ⇒ point at the step that creates one, which is where `back()` sends them too.
        manageUrl: truck?.dashboard_token
          ? `${base}/manage/${encodeURIComponent(truck.dashboard_token)}`
          : `${base}/setup`,
      })
    } catch (e) {
      console.error('[verify-signup] welcome email failed (verification still succeeded):', e)
    }
  }

  return back(error ? 'invalid' : 'ok')
}
