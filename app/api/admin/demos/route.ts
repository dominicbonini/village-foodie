// app/api/admin/demos/route.ts — demo-2 (30 October 2026, docs/demo-2-report.md): Admin › Demos.
//
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&source=all|landing|outreach
//   → { demos: one row per demo that still exists (its session), funnel: the counts for those dates }
// GET ?file=<path>[&download=1] → { url }: a signed link to one stored menu file that lasts 60 seconds.
//
// ADMIN ONLY (verifyAdmin — the session cookie on the web, the Bearer on the native app); anyone else gets a 404. Read
// only. The rows are the LIVING demos — a demo's session, menu files and orders are deleted when it expires — while the
// funnel reads public.demo_events, which the sweep never deletes, so it can count demos that no longer exist.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { listDemoMenuFiles, signedDemoMenuUrl } from '@/lib/demo-menu-files'
import { demoFunnel, type DemoSource } from '@/lib/demo-events'
import { isDemoIdentifier } from '@/lib/demo'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const YMD = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_NAME = /^Demo Kitchen \([a-z0-9]+\)$/i

export interface AdminDemoRow {
  truckId: string; createdAt: string; expiresAt: string | null; source: DemoSource
  email: string | null; marketingOptIn: boolean | null; country: string | null; truckName: string | null
  itemsFound: number; extraction: string | null
  files: { path: string; name: string; size: number | null }[]
  ordered: boolean; finishedWalkthrough: boolean; startedSignup: boolean; signedUp: boolean
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req).catch(() => false))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(req.url)

  const file = url.searchParams.get('file')
  if (file) {
    const signed = await signedDemoMenuUrl(supabase, file, url.searchParams.get('download') === '1')
    return signed ? NextResponse.json({ url: signed }) : NextResponse.json({ error: 'That file could not be opened' }, { status: 404 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const from = YMD.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : monthAgo
  const to = YMD.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to')! : today
  const sourceParam = url.searchParams.get('source')
  const source: DemoSource | 'all' = sourceParam === 'landing' || sourceParam === 'outreach' ? sourceParam : 'all'
  const fromIso = `${from}T00:00:00.000Z`
  const toIso = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString()   // inclusive of `to`

  // ── the living demos ──
  const { data: sessions, error } = await supabase.from('demo_sessions').select('*')
    .gte('created_at', fromIso).lt('created_at', toIso).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: `Could not read the demos: ${error.message}` }, { status: 500 })
  const rows = ((sessions ?? []) as Record<string, unknown>[])
    .filter(s => isDemoIdentifier(String(s.truck_id)))
    .filter(s => source === 'all' || (source === 'outreach') === !!s.discovery_truck_id)
  const ids = rows.map(s => String(s.truck_id))

  const [trucksRes, itemsRes, eventsRes, funnelRes] = await Promise.all([
    ids.length ? supabase.from('trucks').select('id, name, country').in('id', ids) : Promise.resolve({ data: [] as unknown[] }),
    ids.length ? supabase.from('menu_items_db').select('truck_id').in('truck_id', ids).eq('is_active', true) : Promise.resolve({ data: [] as unknown[] }),
    ids.length ? supabase.from('demo_events').select('demo_id, event').in('demo_id', ids) : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('demo_events').select('demo_id, event, source').gte('at', fromIso).lt('at', toIso).limit(50_000),
  ])
  const trucks = new Map(((trucksRes.data ?? []) as { id: string; name: string | null; country: string | null }[]).map(t => [t.id, t]))
  const items = new Map<string, number>()
  for (const r of (itemsRes.data ?? []) as { truck_id: string }[]) items.set(r.truck_id, (items.get(r.truck_id) ?? 0) + 1)
  const steps = new Map<string, Set<string>>()
  for (const r of (eventsRes.data ?? []) as { demo_id: string; event: string }[]) {
    if (!steps.has(r.demo_id)) steps.set(r.demo_id, new Set())
    steps.get(r.demo_id)!.add(r.event)
  }
  const files = await Promise.all(ids.map(id => listDemoMenuFiles(supabase, id)))

  const demos: AdminDemoRow[] = rows.map((s, i) => {
    const id = String(s.truck_id)
    const t = trucks.get(id)
    const has = (e: string) => steps.get(id)?.has(e) ?? false
    const name = (t?.name ?? '').trim()
    return {
      truckId: id, createdAt: String(s.created_at), expiresAt: (s.expires_at as string | null) ?? null,
      source: s.discovery_truck_id ? 'outreach' : 'landing',
      // `visitor_email` is the email given before the build (demo-2); `email` the "keep my demo" one. Either may be null.
      email: (s.visitor_email as string | null) ?? (s.email as string | null) ?? null,
      marketingOptIn: 'marketing_opt_in' in s ? !!s.marketing_opt_in : null,
      country: t?.country ?? null,
      truckName: name && !DEFAULT_NAME.test(name) ? name : null,
      itemsFound: items.get(id) ?? 0,
      extraction: (s.extraction_source as string | null) ?? null,
      files: files[i].map(f => ({ path: f.path, name: f.name, size: f.size })),
      ordered: has('order_placed'), finishedWalkthrough: has('ready_pressed'), startedSignup: has('signup_started'),
      signedUp: has('signup_done') || !!s.claimed_by_operator_id,
    }
  })

  const funnelRows = (funnelRes as { data?: unknown[]; error?: { message: string } | null })
  return NextResponse.json({
    from, to, source, demos,
    funnel: demoFunnel((funnelRows.data ?? []) as { demo_id: string | null; event: string; source: string | null }[], source),
    // Before 20261052 the table does not exist; the tab says so rather than showing zeros as if they were counts.
    funnelAvailable: !funnelRows.error,
  })
}
