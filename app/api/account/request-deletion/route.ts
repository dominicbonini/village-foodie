// app/api/account/request-deletion/route.ts
// ── OWNER REQUESTS DELETION OF THE WHOLE ACCOUNT ────────────────────────────────────────────────────
// Stamps the pending state, stops ordering on every truck the account owns, and notifies. It DELETES
// NOTHING and it schedules nothing — see lib/account-deletion.ts for what execution actually does, and
// /api/cron/account-deletion-due for the 30-day reminder, which also deletes nothing.
//
// 🔴 OWNER ONLY, AND "OWNER" MEANS THE ACCOUNT HOLDER. The requester's auth session must resolve to an
// `operators` row, and the account deleted is THAT operator — not a truck they happen to have staff
// access to. A manager or staff member cannot request this, and neither can a token-only dashboard
// session: this is the one action where holding the dashboard link must not be enough.
//
// 🔴 THE SCOPE IS EVERY TRUCK THE OPERATOR OWNS. trucks.operator_id pools multiple trucks under one
// account, so "the whole account" is all of them. A second truck is NOT spared — same account, same
// legal entity, same person's data, and sparing it would leave a live business with no one able to
// log in. See lib/account-deletion.ts.
//
// ⚠️ NO IN-APP CANCEL EXISTS, BY DESIGN. Only Dominic can clear the pending state, by hand. The
// confirmation copy therefore has to say so — an operator who believes they can undo it in Settings will
// discover otherwise at the worst moment.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { HATCHGRAB_SENDER } from '@/lib/email-config'
import { DELETION_WINDOW_DAYS } from '@/lib/account-deletion'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function sendMail(to: string, subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey || !to) return
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
        to: [{ email: to }], subject, htmlContent: html,
      }),
    })
  } catch (err) {
    console.error('[request-deletion] email failed:', err)
  }
}

/** Resolve the session to an operators row. Null = not the account holder (staff/manager have an auth
 *  user but no operators row) or not signed in at all. ONE resolver, used by both handlers, so the GET
 *  preview and the POST can never disagree about who is allowed to see or do this. */
async function resolveOperator(req: NextRequest) {
  let authUserId: string | null = null
  try {
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()   // WEB (cookie) — unchanged, resolves first
    authUserId = user?.id ?? null
  } catch { /* fall through to the Bearer branch below, then to null */ }
  // ── ADDITIVE (native app): no cookie, but sends its Supabase session as a Bearer. ────────────────
  // 🔴 COPIED FROM app/api/auth/me/route.ts, WHICH IS UNCHANGED. Same three lines, same order, same
  // guard. Only reached when there is NO cookie user AND an Authorization header is present, so a
  // browser never enters this branch and the web path is byte-for-byte unchanged.
  // ⚠️ THIS IS WHY THE DANGER ZONE WAS ABSENT ON iPad: this route was the only auth-gated route in the
  // app with neither a dashboard_token path nor a Bearer path, so the shell could not authenticate to
  // it at all. See docs/deletion-auth-fix-report.md.
  if (!authUserId) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
      if (bearerUser) authUserId = bearerUser.id
    }
  }

  if (!authUserId) return null
  const { data } = await supabase
    .from('operators')
    .select('id, email, name, deletion_requested_at, deletion_due_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  return data ? { ...data, authUserId } : null
}

// ── GET — THE PRE-CONFIRMATION SUMMARY ──────────────────────────────────────────────────────────────
// Everything the confirmation dialog must state BEFORE anyone can proceed: which trucks are included,
// how many orders still need fulfilling, and whether a request is already pending.
// 🔴 THE UI MUST NOT COMPUTE THE TRUCK LIST ITSELF. The Manage page holds ONE truck; the account may own
// several. Naming only the truck you happen to be looking at would understate what is being deleted.
export async function GET(req: NextRequest) {
  const operator = await resolveOperator(req)
  if (!operator) return NextResponse.json({ error: 'Only the account owner can view this.' }, { status: 403 })

  const { data: trucks } = await supabase.from('trucks').select('id, name').eq('operator_id', operator.id)
  const truckIds = (trucks ?? []).map(t => t.id as string)

  // ⚠️ "UPCOMING" = not yet finished AND not in the past. Terminal statuses (collected/rejected/cancelled)
  // are excluded because they need no fulfilling; `event_date >= today` excludes history. Deliberately
  // generous at the boundary — an order earlier today still counts, because the point is to warn, and
  // under-counting an obligation is the harmful direction.
  const today = new Date().toISOString().slice(0, 10)
  let upcomingOrders = 0
  if (truckIds.length) {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('truck_id', truckIds)
      .in('status', ['pending', 'confirmed', 'modified', 'cooking', 'ready'])
      .gte('event_date', today)
    upcomingOrders = count ?? 0
  }

  return NextResponse.json({
    ownerEmail: operator.email,
    trucks: (trucks ?? []).map(t => ({ id: t.id, name: t.name })),
    upcomingOrders,
    pending: !!operator.deletion_requested_at,
    requestedAt: operator.deletion_requested_at,
    dueAt: operator.deletion_due_at,
  })
}

export async function POST(req: NextRequest) {
  // ── Who is asking? A real logged-in session, resolved to an operator. ─────────────────────────────
  // ⚠️ THIS HANDLER RESOLVES THE CALLER INLINE RATHER THAN CALLING `resolveOperator`, AND THE COMMENT
  // ON THAT FUNCTION CLAIMING "ONE resolver, used by both handlers" HAS THEREFORE ALWAYS BEEN FALSE.
  // 🔴 NOT COLLAPSED HERE, DELIBERATELY: this handler distinguishes 401 (not signed in) from 403 (signed
  // in, but no operators row — a staff/manager). `resolveOperator` returns null for both and cannot tell
  // them apart, so folding this into it would change the 403 the brief says not to touch. The Bearer
  // fallback is therefore applied in BOTH places — five identical lines, once each — rather than the
  // handler being rewritten. See docs/deletion-auth-fix-report.md.
  let authUserId: string | null = null
  try {
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()   // WEB (cookie) — unchanged, resolves first
    authUserId = user?.id ?? null
  } catch { /* fall through to the Bearer branch below, then to 401 */ }
  // ── ADDITIVE (native app): no cookie, but sends its Supabase session as a Bearer. ────────────────
  // 🔴 COPIED FROM app/api/auth/me/route.ts, WHICH IS UNCHANGED. Same three lines, same order, same
  // guard. Only reached when there is NO cookie user AND an Authorization header is present, so a
  // browser never enters this branch and the web path is byte-for-byte unchanged.
  // ⚠️ THIS IS WHY THE DANGER ZONE WAS ABSENT ON iPad: this route was the only auth-gated route in the
  // app with neither a dashboard_token path nor a Bearer path, so the shell could not authenticate to
  // it at all. See docs/deletion-auth-fix-report.md.
  if (!authUserId) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
      if (bearerUser) authUserId = bearerUser.id
    }
  }

  if (!authUserId) return NextResponse.json({ error: 'Sign in to request account deletion.' }, { status: 401 })

  const { data: operator } = await supabase
    .from('operators')
    .select('id, email, name, deletion_requested_at, deletion_due_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (!operator) {
    // Staff and managers have an auth user but no operators row — they are not the account holder.
    return NextResponse.json({ error: 'Only the account owner can request deletion.' }, { status: 403 })
  }

  // Idempotent: re-requesting must not restart the clock. The window is fixed at the FIRST request.
  if (operator.deletion_requested_at) {
    return NextResponse.json({
      alreadyPending: true,
      requestedAt: operator.deletion_requested_at,
      dueAt: operator.deletion_due_at,
    })
  }

  const body = await req.json().catch(() => ({}))
  // Typed confirmation, same principle as the admin hard-delete's Guard 1: prove you know what you are
  // doing, rather than proving you can click.
  if (typeof body.confirm !== 'string' || body.confirm.trim().toUpperCase() !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm.', code: 'confirm_mismatch' }, { status: 400 })
  }

  const now = new Date()
  const dueAt = new Date(now.getTime() + DELETION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const { data: trucks } = await supabase.from('trucks').select('id, name').eq('operator_id', operator.id)
  const truckIds = (trucks ?? []).map(t => t.id as string)

  // ── Stamp the ACCOUNT RECORD first ───────────────────────────────────────────────────────────────
  // 🔴 ORDER MATTERS. The operator row is authoritative; the truck flags are a derived enforcement
  // cache. Stamping the account first means a failure between the two leaves an account that is pending
  // but still trading (visible, recoverable, and the cron still finds it) rather than trucks that have
  // stopped trading with no account record explaining why.
  const { error: opErr } = await supabase
    .from('operators')
    .update({ deletion_requested_at: now.toISOString(), deletion_requested_by: authUserId, deletion_due_at: dueAt.toISOString() })
    .eq('id', operator.id)
  if (opErr) return NextResponse.json({ error: opErr.message }, { status: 500 })

  if (truckIds.length) {
    const { error: truckErr } = await supabase
      .from('trucks')
      .update({ deletion_requested_at: now.toISOString() })
      .in('id', truckIds)
    if (truckErr) {
      // The account IS pending (the authoritative row is stamped). Ordering has NOT stopped. Say so
      // rather than reporting a clean success — the operator must not believe they are closed when a
      // customer can still order.
      console.error('[request-deletion] truck flags failed:', truckErr.message)
      return NextResponse.json(
        { error: 'Your deletion request was recorded, but we could not stop ordering on every truck. Contact support.', code: 'partial_stamp' },
        { status: 500 },
      )
    }
  }

  // ── Notify EVERY owner, plus Dominic ─────────────────────────────────────────────────────────────
  // 🔴 NOT JUST THE REQUESTER. If the request is malicious or mistaken, telling only the person who made
  // it defeats the point. The owner set is the union of the account email and every truck_users row with
  // role='owner' across the account's trucks — neither source alone is complete (trucks.operator_id is
  // nullable, truck_users is per-truck).
  const owners = new Set<string>()
  if (operator.email) owners.add(operator.email as string)
  if (truckIds.length) {
    const { data: coOwners } = await supabase
      .from('truck_users').select('email').in('truck_id', truckIds).eq('role', 'owner')
    for (const o of coOwners ?? []) if (o.email) owners.add(o.email as string)
  }

  const dueLabel = dueAt.toISOString().slice(0, 10)
  const truckList = (trucks ?? []).map(t => t.name).join(', ') || '(no trucks)'
  const ownerHtml = `
    <p>We have received a request to delete this HatchGrab account.</p>
    <p><strong>Online ordering has stopped immediately</strong> on: ${truckList}. Your dashboard stays
    available to read for the next ${DELETION_WINDOW_DAYS} days.</p>
    <p>The account is scheduled for deletion on <strong>${dueLabel}</strong>.</p>
    <p><strong>This cannot be cancelled from inside the app.</strong> If this was not you, or you have
    changed your mind, reply to this email as soon as possible.</p>
    <p>When the account is deleted we remove your personal details and your customers' details. We keep
    anonymous accounting records, which we are legally required to retain.</p>`
  for (const to of owners) await sendMail(to, 'Your HatchGrab account is scheduled for deletion', ownerHtml)

  if (HATCHGRAB_SENDER.replyTo) {
    await sendMail(HATCHGRAB_SENDER.replyTo,
      `[ACTION] Account deletion requested — due ${dueLabel}`,
      `<p>Operator <code>${operator.id}</code> (${operator.email ?? 'no email'}) requested account deletion.</p>
       <p>Trucks: ${truckList}</p><p>Due: <strong>${dueLabel}</strong></p>
       <p>Ordering has stopped. Nothing will execute automatically — you will be reminded, and you action it by hand.</p>
       <p>To CANCEL: clear <code>operators.deletion_requested_at</code> (and <code>trucks.deletion_requested_at</code>) for this operator.</p>`)
  }

  return NextResponse.json({ success: true, requestedAt: now.toISOString(), dueAt: dueAt.toISOString(), trucks: truckIds.length })
}
