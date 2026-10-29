// app/api/admin/pricing-check/route.ts — Admin › Pricing check (pricing-check-1, 23 October 2026).
//
//   GET    the three tables (current and superseded rows), our plan catalogue, every country's card rate and switch
//   POST   { action: 'import' }                          — the research data, once (refused once any research row exists)
//          { action: 'verify' | 'unverify', id }          — Mark verified / Undo verified
//          { action: 'edit_plan', id, fields }            — a NEW row; the old one superseded
//          { action: 'edit_benchmark', countryCode, fields } — the same for a country's data
//          { action: 'set_feature', competitorId, column, value }
//          { action: 'add_competitor', competitor, plan }
//          (compare-de-1's German-research import action is gone — competitor-check-2: data files are imported by the nightly
//          workflow, lib/data-import; GET returns the read-only `imports` lines)
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
import { servicePricingStore, TablesMissing, readDataImports } from '@/lib/admin/pricing-check-store'
import { loadState, importResearch, act, type ActionResult } from '@/lib/admin/pricing-check-actions'
import { importLines } from '@/lib/data-import/importer'
import { comparisonFlags } from '@/lib/comparison-flags'
import { countryCharges, valueOut, featureWords, type ComparisonFeature } from '@/lib/comparison-features'
import { featuresOrFile } from '@/lib/comparison-features-file'
import comparisonEn from '@/messages/ns/en-GB/comparison.json'

/** comparison-features-1: a feature with its English words (Admin is English) — the row's own for an Admin-added one, the
 *  en-GB messages for a seeded one — and the note of HatchGrab's fixed answer. */
type EnFeatures = Record<string, { label?: string; explain?: string; ours?: string }>
function englishFeature(f: ComparisonFeature) {
  const msgs = (comparisonEn as unknown as { features: EnFeatures }).features?.[f.key] ?? {}
  const w = featureWords(f, 'en-GB', k => (k.endsWith('.label') ? msgs.label : msgs.explain) ?? f.key)
  return { ...f, label: w.label, explain: w.explain, ours: msgs.ours ?? null }
}
import { getPlanCatalog } from '@/lib/plans-server'
import { listCountrySettings } from '@/lib/country-settings'
import { isCountedCompetitor, isPendingPos } from '@/lib/pricing-check'
import competitors from '@/data/pricing-research-1/competitors.json'
import plans from '@/data/pricing-research-1/plans.json'
import benchmarks from '@/data/pricing-research-1/benchmarks.json'

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
    // competitor-check-2: say WHAT failed (the store's words name the step and the database's reason), not "try again".
    const why = e instanceof Error ? e.message.replace(/^\[pricing-check-store\]\s*/, '') : String(e)
    console.error('[admin/pricing-check]', why)
    return NextResponse.json({ error: `That failed — ${why}. Reload to see what was saved.` }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return guarded(req, async () => {
    const [state, catalog, countries, imports, flags, featureRows, valueRows] = await Promise.all([loadState(servicePricingStore), getPlanCatalog(),
      listCountrySettings(), readDataImports(), comparisonFlags(), servicePricingStore.features?.() ?? null, servicePricingStore.featureValues?.() ?? []])
    if (!state.ok) return reply(state)
    // competitor-check-1: candidates, closed and not-relevant competitors are never counted or shown here
    // (lib/pricing-check.ts isCountedCompetitor); the Automatic checks tab lists them on its own route.
    // global-players-1: plus a 'pos' competitor still being checked that has a comparison entry (added automatically when
    // its first plan in a comparison country was accepted) — so Dominic can see and verify it like any other.
    const withEntry = new Set(state.data.entries.map(e => e.competitorId))
    const counted = state.data.competitors.filter(c => isCountedCompetitor(c) || (isPendingPos(c) && withEntry.has(c.id)))
    const ids = new Set(counted.map(c => c.id))
    return NextResponse.json({
      ...state.data, catalog,
      competitors: counted, plans: state.data.plans.filter(p => ids.has(p.competitorId)), entries: state.data.entries.filter(e => ids.has(e.competitorId)),
      hiddenCompetitors: state.data.competitors.length - counted.length,
      imports: importLines(imports),
      // comparison-features-1: the app flags are country_settings' (as the comparison page reads them), and what a truck there
      // may add at checkout (tips, a service fee) — HatchGrab's answers for those rows.
      countries: countries.map(c => ({ countryCode: c.countryCode, name: c.name, enabled: c.enabled, currency: c.currency,
        cardFeeOnlinePct: c.cardFeeOnlinePct, cardFeeOnlineFixedMinor: c.cardFeeOnlineFixedMinor,
        iosAppAvailable: flags.get(c.countryCode)?.iosApp === true, androidAppAvailable: flags.get(c.countryCode)?.androidApp === true,
        comparisonStatus: flags.get(c.countryCode)?.status ?? 'off', charges: countryCharges(c) })),
      // comparison-features-1: the master list (the file's until the importer has seeded the table), in English, and the answers.
      ...(() => { const { features, fromFile } = featuresOrFile(featureRows); return { features: features.map(englishFeature), featuresFromFile: fromFile } })(),
      values: valueRows.map(valueOut).filter(v => ids.has(v.competitorId)),
      today: new Date().toISOString().slice(0, 10),
    })
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { const b = await req.json(); if (b && typeof b === 'object') body = b } catch { /* an empty body is refused below */ }
  return guarded(req, async user => {
    if (body.action === 'import') return reply(await importResearch(servicePricingStore, { competitors, plans, benchmarks } as never))
    const at = new Date().toISOString()
    return reply(await act(servicePricingStore, body, { by: user.id, at, today: at.slice(0, 10) }))
  })
}
