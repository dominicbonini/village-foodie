// app/api/setup/route.ts
// The onboarding wizard's server side. Session-authenticated (these are real operators now, not demo
// token-holders), and it owns the one irreversible act in the flow: creating the real truck.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { provisionTruck } from '@/lib/provision-truck'
import { createSlug } from '@/lib/utils'
import { DEMO_PREFIX } from '@/lib/demo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * `demo-` is a SECURITY BOUNDARY — proxy.ts exempts /dashboard/demo-* from the session gate, so a real
 * truck whose id began `demo-` would have a publicly reachable operator console. provisionTruck asserts
 * this and THROWS.
 *
 * That assertion was written for an admin tool, where an error message about reserved prefixes is fine.
 * Here it would be a real operator hitting a wall for a legitimate business name ("Demo Kitchen",
 * "Demolition Dogs"), so we resolve it SILENTLY instead: drop the hyphen that creates the prefix.
 * "demo-kitchen" → "demokitchen". Still readable, still theirs, no longer the reserved prefix, and no
 * explanation demanded of someone who does not care how our routing works.
 */
function safeSlug(name: string): string {
  const base = createSlug(name)
  return base.startsWith(DEMO_PREFIX) ? base.replace('-', '') : base
}

export async function POST(req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })

  const { data: operator } = await supabase
    .from('operators').select('id, email').eq('auth_user_id', user.id).maybeSingle()
  if (!operator) return NextResponse.json({ ok: false, error: 'No operator record' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 })

  // ── IDENTITY STEP → the truck comes into existence here ─────────────────────────────────────────
  if (body.action === 'create_truck') {
    const name = String(body.name ?? '').trim()
    const contactEmail = String(body.contact_email ?? '').trim() || operator.email || null
    if (name.length < 2) {
      return NextResponse.json({ ok: false, error: 'Give your truck a name.' }, { status: 400 })
    }

    // Idempotence: a double-submit (or a retry after a flaky response) must not mint a second truck.
    const { data: existing } = await supabase
      .from('trucks').select('id, dashboard_token, setup_step')
      .eq('operator_id', operator.id).not('setup_step', 'is', null).neq('setup_step', 'done').limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, truck: existing[0], resumed: true })
    }

    try {
      const result = await provisionTruck(supabase, {
        kind: 'operator',
        name,
        slug: safeSlug(name),
        contactEmail,
        // HIDDEN — the default, restated because it is the security property that matters most here.
        // A truck goes public at NOMINATION (Stage 8), never at creation.
        visibility: 'hidden',
        // Capacity is left BLANK deliberately: it must be an active decision, not an inherited guess.
        // A silently-inherited number means promising collection times the kitchen cannot hit, which is
        // the exact failure the capacity engine exists to prevent.
        // 🔴 CORRECTED — this used to say "lib/go-live-checks.ts blocks go-live until it is set". IT
        // DOES NOT. `checkGoLive` has ZERO call sites and that module is imported by no file, so nothing
        // currently blocks go-live on capacity or on anything else. Leaving capacity blank is still
        // right; it is simply not enforced yet.
        van: { kitchen_capacity: null },
      })

      await supabase.from('trucks')
        .update({ operator_id: operator.id, setup_step: 'menu' })
        .eq('id', result.truck.id)

      return NextResponse.json({ ok: true, truck: result.truck, warnings: result.warnings })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create your truck.'
      console.error('[setup] provisionTruck failed:', msg)
      return NextResponse.json({ ok: false, error: msg }, { status: 400 })
    }
  }

  // ── STEP MARKER — coarse resume (see 20260723_truck_setup_step.sql) ─────────────────────────────
  if (body.action === 'set_step') {
    const step = String(body.step ?? '')
    const truckId = String(body.truck_id ?? '')
    if (!['identity', 'menu', 'event', 'done'].includes(step)) {
      return NextResponse.json({ ok: false, error: 'Unknown step' }, { status: 400 })
    }
    // Scoped to the caller's own truck — a step marker must never be writable across tenants.
    const { error } = await supabase.from('trucks')
      .update({ setup_step: step }).eq('id', truckId).eq('operator_id', operator.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}

// ── GET: the stored demo extraction, for the wizard to re-commit FROM ──────────────────────────────
// The demo→real migration is a RE-COMMIT, not a row copy: the demo stored the raw MenuExtraction in
// demo_sessions.extraction, and that is byte-for-byte the shape the import wizard's review step consumes
// (process-menu returns exactly extractMenu()). So the menu step feeds this straight into the SAME wizard
// — grouped-vs-separate genuinely re-asked, price gate applied, allergens re-decided — losing nothing a
// copy would keep (menu editing is hidden in the demo, so the committed rows are a pure function of this).
//
// AUTH: session (this is a real operator now). Scoped to a demo THEY claimed at signup
// (demo_sessions.claimed_by_operator_id) — so one operator can't pull another's extraction.
export async function GET(req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })

  const { data: operator } = await supabase
    .from('operators').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!operator) return NextResponse.json({ ok: false, error: 'No operator record' }, { status: 401 })

  // ── ?check=truck — "does this operator already have a truck?" (A3) ───────────────────────────────
  // /setup used to render "What's your truck called?" with no lookup at all, so an operator who had
  // already finished the in-modal wizard was asked to name a truck that existed — and create_truck's
  // idempotence guard then discarded the answer. The page needs to know BEFORE it renders.
  //
  // A separate branch rather than a new field on the extraction response, and it RETURNS EARLY: the
  // no-param response below is byte-identical to what it was, so the Manage ?import=demo bootstrap —
  // the only other consumer — is untouched and does not pay for a query it does not use.
  // Same truck-selection rule as verify-signup: prefer one still in setup, else the oldest.
  if (req.nextUrl.searchParams.get('check') === 'truck') {
    const { data: trucks } = await supabase
      .from('trucks').select('dashboard_token, setup_step')
      .eq('operator_id', operator.id)
      .order('created_at', { ascending: true })
    const truck = (trucks ?? []).find(t => t.setup_step && t.setup_step !== 'done') ?? (trucks ?? [])[0] ?? null
    return NextResponse.json({ ok: true, truck: truck ? { dashboard_token: truck.dashboard_token } : null })
  }

  // Query the claimed session WITHOUT the extraction filter, so we can tell three cases apart. The old
  // query folded `.not('extraction','is',null)` into the same statement, which made "no claimed demo" and
  // "claimed demo whose payload is gone" both return null — indistinguishable, so the bootstrap could only
  // ever show a silent blank upload. `reason` is the signal; status stays 200 (a missing demo isn't a
  // failure). null extraction is a REAL condition now that persistExtraction exists: the demo was swept
  // (truck_id → trucks is ON DELETE CASCADE), predates the migration, or the best-effort persist failed.
  const { data: session } = await supabase
    .from('demo_sessions')
    .select('truck_id, extraction, extraction_source')
    .eq('claimed_by_operator_id', operator.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) {
    // This operator did not come from a demo (or the claim never landed). Nothing to say — a normal upload
    // is the correct, unremarkable experience.
    return NextResponse.json({ ok: true, extraction: null, reason: 'no_claim' })
  }
  // 🔴 A SAMPLE MENU MUST NEVER LAND ON A REAL TRUCK. If the demo they converted from was a Pizza/Burger/
  // Curry template (extraction_source = 'template'), the stored payload is NEVER returned here under any
  // circumstance. That is unchanged and must stay. (The return path still uses it — that is a different
  // surface; see /api/demo/return.)
  //
  // ── B1: 'template_withheld' IS ITS OWN REASON, SPLIT OUT OF 'no_extraction' ──────────────────────
  // Both cases return extraction:null, but they are NOT the same event and folding them together made
  // the client say something false. 'no_extraction' means the payload is GONE — swept, pre-migration, or
  // the best-effort persist failed — and telling the operator "your demo menu is no longer available" is
  // honest. 'template_withheld' means the payload is intact and we are DELIBERATELY not giving it to
  // them, because it was a sample and was never theirs. Reporting a deliberate withholding as a loss
  // apologised for something that had not happened, on every single sample signup.
  if (!session.extraction) {
    return NextResponse.json({ ok: true, extraction: null, reason: 'no_extraction' })
  }
  if (session.extraction_source === 'template') {
    return NextResponse.json({ ok: true, extraction: null, reason: 'template_withheld' })
  }

  return NextResponse.json({ ok: true, extraction: session.extraction })
}
