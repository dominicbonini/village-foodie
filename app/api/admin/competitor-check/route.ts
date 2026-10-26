// app/api/admin/competitor-check/route.ts — Admin › Pricing check › Automatic checks (competitor-check-1, 25 October 2026).
//
//   GET   settings, the tiles (lib/competitor-check/overview.ts), the findings (every pending one + recent reviewed ones),
//         recent runs, and the competitors' names
//   POST  { action: 'accept' | 'reject', id } · { action: 'accept_unchanged', ids } · { action: 'settings', fields }
//         { action: 'pause' | 'resume' } · { action: 'start_deep' } · { action: 'check_now', competitorId }
//
// 🔴 ADMIN ONLY, SERVICE ROLE, SERVER ONLY — the pricing-check route's guard (lib/auth/admin.ts adminUser), anyone else
// gets a 404. Nothing here calls the Claude API: the checker runs in GitHub Actions; this route only reviews what it found.
import { NextRequest, NextResponse } from 'next/server'
import { adminUser } from '@/lib/auth/admin'
import { servicePricingStore } from '@/lib/admin/pricing-check-store'
import { serviceCheckStore } from '@/lib/admin/competitor-check-store'
import { acceptFinding, rejectFinding, acceptAllUnchanged, settingsCols, loadChecks } from '@/lib/admin/competitor-check-actions'
import type { ActionResult } from '@/lib/admin/pricing-check-actions'

export const dynamic = 'force-dynamic'
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const MISSING = { error: 'The automatic checks tables are not in the database yet. Run supabase/migrations/20261043_competitor_check_1.sql, then reload.', missing: true }
const reply = <T,>(r: ActionResult<T>) => (r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status }))

async function guarded(req: NextRequest, run: (user: { id: string }) => Promise<NextResponse>) {
  const user = await adminUser(req)
  if (!user) return notFound()
  try { return await run(user) }
  catch (e) {
    console.error('[admin/competitor-check]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'That could not be done just now. Nothing was changed — try again in a moment.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return guarded(req, async () => {
    const data = await loadChecks(serviceCheckStore, new Date().toISOString().slice(0, 10))
    return data ? NextResponse.json(data) : NextResponse.json(MISSING, { status: 503 })
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { const b = await req.json(); if (b && typeof b === 'object') body = b } catch { /* refused below */ }
  return guarded(req, async user => {
    if (!(await serviceCheckStore.settings())) return NextResponse.json(MISSING, { status: 503 })
    const at = new Date().toISOString()
    const stamp = { by: user.id, at, today: at.slice(0, 10) }
    const id = typeof body.id === 'string' ? body.id : ''
    switch (body.action) {
      case 'accept': return id ? reply(await acceptFinding(servicePricingStore, serviceCheckStore, id, stamp)) : NextResponse.json({ error: 'Which finding?' }, { status: 400 })
      case 'reject': return id ? reply(await rejectFinding(serviceCheckStore, id, stamp)) : NextResponse.json({ error: 'Which finding?' }, { status: 400 })
      case 'accept_unchanged': {
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 2000) : []
        return reply(await acceptAllUnchanged(servicePricingStore, serviceCheckStore, ids, stamp))
      }
      case 'settings': {
        const r = settingsCols((body.fields ?? {}) as Record<string, unknown>)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
        const saved = await serviceCheckStore.updateSettings({ ...r.cols, updated_at: at, updated_by: user.id })
        if ('check_interval_days' in r.cols) await serviceCheckStore.setAllIntervals(Number(r.cols.check_interval_days))
        return NextResponse.json({ settings: saved })
      }
      case 'pause': case 'resume': return NextResponse.json({ settings: await serviceCheckStore.updateSettings({ paused: body.action === 'pause', updated_at: at, updated_by: user.id }) })
      case 'start_deep': return NextResponse.json({ settings: await serviceCheckStore.updateSettings({ deep_requested_at: at, updated_at: at, updated_by: user.id }) })
      case 'check_now': {
        const cid = typeof body.competitorId === 'string' ? body.competitorId : ''
        if (!cid) return NextResponse.json({ error: 'Which competitor?' }, { status: 400 })
        const r = await serviceCheckStore.updateCompetitor(cid, { check_requested_at: at })
        return r ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'That competitor is gone.' }, { status: 404 })
      }
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }
  })
}
