// app/api/admin/execute-account-deletion/route.ts
// ── MANUAL EXECUTION. ADMIN ONLY. NEVER ON A TIMER. ─────────────────────────────────────────────────
// The 30-day cron emails; this is what Dominic calls afterwards. Wraps lib/account-deletion's
// executeAccountDeletion — anonymise + remove identity, RETAINING trucks, orders and order_payments as
// an anonymous financial record.
//
// 🔴 THIS IS NOT deleteTruckCascade AND MUST NEVER CALL IT. That helper deletes `orders` first, and
// order_payments cascades from both orders(order_key) and trucks(id) — running it here would destroy the
// six-year accounting record this route exists to preserve. The two operations are kept in separate
// modules for exactly this reason.
//
// ⚠️ A DRY RUN IS THE DEFAULT. `execute: true` is required to change anything, so the natural first call
// reports the blast radius instead of causing it — the same shape as the admin hard-delete's dry run.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { executeAccountDeletion, AccountDeletionError } from '@/lib/account-deletion'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const operatorId = typeof body.operatorId === 'string' ? body.operatorId.trim() : ''
  const execute = body.execute === true
  if (!operatorId) return NextResponse.json({ error: 'operatorId required' }, { status: 400 })

  const { data: operator } = await supabase
    .from('operators')
    .select('id, email, name, deletion_requested_at, deletion_due_at')
    .eq('id', operatorId)
    .maybeSingle()
  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 })

  // 🔴 THE PENDING STATE IS THE AUTHORISATION. No request, or a request Dominic has cancelled, means this
  // is just an admin erasing somebody's data — refuse. Re-checked here and again inside the helper.
  if (!operator.deletion_requested_at) {
    return NextResponse.json(
      { error: 'This account has no pending deletion request. Nothing to execute.', code: 'not_pending' },
      { status: 409 },
    )
  }

  const { data: trucks } = await supabase.from('trucks').select('id, name').eq('operator_id', operatorId)
  const truckIds = (trucks ?? []).map(t => t.id as string)

  // Counted before, and reported either way — the retained figures are the point of the whole design.
  // ⚠️ THE PAYMENT COUNT IS DELIBERATELY NOT FILTERED ON `livemode`. This is the second documented
  // exception to the exclude-test-rows-by-default rule (the other is delete-truck's guard 3), and for
  // the same reason: `paymentsIntact` below is a REGRESSION DETECTOR for physical retention, not a
  // report of money. Its entire job is "did this run destroy any row it promised to keep?" — and a
  // filtered count would be blind to test rows being destroyed, which is exactly the kind of quiet
  // partial deletion the check exists to catch. It must count everything the table holds.
  // 🔴 Do not "tidy" this into consistency with the money paths. They answer a different question.
  const counts = { orders: 0, payments: 0, staff: 0 }
  for (const truckId of truckIds) {
    const [o, p, s] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('truck_id', truckId),
      supabase.from('order_payments').select('*', { count: 'exact', head: true }).eq('truck_id', truckId),
      supabase.from('truck_users').select('*', { count: 'exact', head: true }).eq('truck_id', truckId),
    ])
    counts.orders += o.count ?? 0
    counts.payments += p.count ?? 0
    counts.staff += s.count ?? 0
  }

  if (!execute) {
    return NextResponse.json({
      dryRun: true,
      operatorId,
      dueAt: operator.deletion_due_at,
      trucks: (trucks ?? []).map(t => ({ id: t.id, name: t.name })),
      willAnonymise: { orders: counts.orders, operator: 1, trucks: truckIds.length },
      willDelete: { staffMemberships: counts.staff, authUsers: 'staff with no other membership, plus the owner' },
      willRetain: { trucks: truckIds.length, orders: counts.orders, orderPayments: counts.payments },
      note: 'Pass execute:true to run. order_payments is never touched by this path.',
    })
  }

  try {
    const result = await executeAccountDeletion(supabase, operatorId)
    // ⚠️ Re-count payments AFTER the run and return it. The whole design rests on this number not moving,
    // so it is measured rather than asserted — a regression that started deleting payments would show up
    // here as a changed figure instead of being discovered years later by an accountant.
    let paymentsAfter = 0
    for (const truckId of result.truckIds) {
      const { count } = await supabase.from('order_payments').select('*', { count: 'exact', head: true }).eq('truck_id', truckId)
      paymentsAfter += count ?? 0
    }
    return NextResponse.json({
      success: true,
      ...result,
      paymentsBefore: counts.payments,
      paymentsAfter,
      paymentsIntact: paymentsAfter === counts.payments,
    })
  } catch (err) {
    if (err instanceof AccountDeletionError) {
      // Not transactional — name the failing step so the partial state is diagnosable, and re-running is
      // safe because every step is idempotent.
      console.error(`[execute-account-deletion] failed at "${err.step}" for ${operatorId}:`, err.message)
      return NextResponse.json(
        { error: err.message, code: 'deletion_failed', failedStep: err.step, partial: true }, { status: 500 },
      )
    }
    console.error('[execute-account-deletion] unexpected failure:', err)
    return NextResponse.json({ error: 'Unexpected failure' }, { status: 500 })
  }
}
