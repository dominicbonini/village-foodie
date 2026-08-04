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
import { resolveOperatorTruck } from '@/lib/resolve-operator-truck'

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
  // E2: the rule and its deterministic ordering now live in ONE place — this was one of the two
  // hand-written copies. Behaviour is unchanged; the query and the prefer-in-setup-else-oldest rule
  // moved verbatim into the helper.
  const truck = await resolveOperatorTruck(supabase, row.operator_id)

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
        // ── E2: TOKENLESS, ALWAYS ────────────────────────────────────────────────────────────────
        // 🔴 THIS USED TO BE `${base}/manage/${truck.dashboard_token}` — a long-lived bearer
        // credential for /api/manage, written in plain text into an inbox. It is now the bare
        // `/manage` index, which resolves the operator's truck from their SESSION (app/manage/page.tsx)
        // and forwards. Nothing about the token or /api/manage's auth changed; the email simply stopped
        // carrying it.
        // No branch on `truck` any more, and that is a simplification not a loss: /manage sends an
        // operator with no truck to /setup itself, so the destination is decided at click time against
        // live state rather than baked into an email that may be days old.
        manageUrl: `${base}/manage`,
      })
    } catch (e) {
      console.error('[verify-signup] welcome email failed (verification still succeeded):', e)
    }
  }

  return back(error ? 'invalid' : 'ok')
}
