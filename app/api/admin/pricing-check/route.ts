// app/api/admin/pricing-check/route.ts — Admin › Pricing check (pricing-check-1, 23 October 2026).
//
//   GET    the three tables (current and superseded rows), our plan catalogue, every country's card rate and switch
//   POST   { action: 'import' }                          — the research data, once (refused once any research row exists)
//          { action: 'verify' | 'unverify', id }          — Mark verified / Undo verified
//          { action: 'edit_plan', id, fields }            — a NEW row; the old one superseded
//          { action: 'edit_benchmark', countryCode, fields } — the same for a country's data
//          { action: 'set_feature', competitorId, column, value }
//          { action: 'add_competitor', competitor, plan }
//          compare-de-1: { action: 'import_compare_de' }  — data/compare-de-1/competitors.json, once (refused once its plan ids are in)
//          { action: 'verify_features' | 'unverify_features', competitorId } · { action: 'set_competitor_text', competitorId, field, value }
//          { action: 'entry_add', countryCode, competitorId, primaryPlanId? } · { action: 'entry_update', id, fields }
//          { action: 'entry_verify' | 'entry_unverify' | 'entry_remove', id } · { action: 'entry_move', id, dir }
//
// 🔴 ADMIN ONLY, SERVICE ROLE, SERVER ONLY. The three tables have RLS on and no policies; this route is their only
// reader and writer. Every method passes the admin check first (lib/auth/admin.ts — adminUser is verifyAdmin's own
// check, returning who the admin is so Mark verified can record them), and anything else gets a 404. Field allowlists
// and every rule live in lib/admin/pricing-check-actions.ts. Nothing here is public, and nothing changes a price we
// charge: the tab suggests, and Dominic runs the SQL.

import { NextRequest, NextResponse } from 'next/server'
import { adminUser } from '@/lib/auth/admin'
import { servicePricingStore, TablesMissing } from '@/lib/admin/pricing-check-store'
import { loadState, importResearch, importCompareResearch, act, type ActionResult, type ComparePayload } from '@/lib/admin/pricing-check-actions'
import { getPlanCatalog } from '@/lib/plans-server'
import { listCountrySettings } from '@/lib/country-settings'
import competitors from '@/data/pricing-research-1/competitors.json'
import plans from '@/data/pricing-research-1/plans.json'
import benchmarks from '@/data/pricing-research-1/benchmarks.json'
import compareDe from '@/data/compare-de-1/competitors.json'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const MISSING = { error: 'The pricing check tables are not in the database yet. Run supabase/migrations/20261039_pricing_check.sql, then reload.', missing: true }

function reply<T>(r: ActionResult<T>) {
  return r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

async function guarded(req: NextRequest, run: (user: { id: string }) => Promise<NextResponse>) {
  const user = await adminUser(req)
  if (!user) return notFound()
  try { return await run(user) }
  catch (e) {
    if (e instanceof TablesMissing) return NextResponse.json(MISSING, { status: 503 })
    console.error('[admin/pricing-check]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'That could not be done just now. Nothing was changed — try again in a moment.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return guarded(req, async () => {
    const [state, catalog, countries] = await Promise.all([loadState(servicePricingStore, compareDe as unknown as ComparePayload), getPlanCatalog(), listCountrySettings()])
    if (!state.ok) return reply(state)
    return NextResponse.json({
      ...state.data, catalog,
      countries: countries.map(c => ({ countryCode: c.countryCode, name: c.name, enabled: c.enabled, currency: c.currency,
        cardFeeOnlinePct: c.cardFeeOnlinePct, cardFeeOnlineFixedMinor: c.cardFeeOnlineFixedMinor })),
      today: new Date().toISOString().slice(0, 10),
    })
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { const b = await req.json(); if (b && typeof b === 'object') body = b } catch { /* an empty body is refused below */ }
  return guarded(req, async user => {
    if (body.action === 'import') return reply(await importResearch(servicePricingStore, { competitors, plans, benchmarks } as never))
    if (body.action === 'import_compare_de') return reply(await importCompareResearch(servicePricingStore, compareDe as unknown as ComparePayload))
    const at = new Date().toISOString()
    return reply(await act(servicePricingStore, body, { by: user.id, at, today: at.slice(0, 10) }))
  })
}
