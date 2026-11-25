// app/api/till/archive/route.ts — 🔴 till-pack-5 (25 November 2026, docs/till-pack-5-6-report.md): AN ARCHIVE ON REQUEST. NO SCREEN.
//
// POST, JSON. WHO: an admin (any truck: { truckId }), or the truck's OWNER (the dashboard token, { token }, and a session that
// lib/truck-access.ts resolves to role 'owner' — staff, managers, demo and anonymous callers are refused).
//   { action: 'build', from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }  → a NEW archive of that period (default: the current accounting year to
//      today): stored in the private bucket, chained (kind 'archive'), emailed to the owner; answers its id, fingerprint and a 7-day link.
//   { action: 'link', archiveId }                                 → a NEW 7-day link to an existing archive of this truck (emailed too).
// Errors are English JSON with a `code`, like the other admin / owner APIs.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { resolveTruckAccessWith } from '@/lib/truck-access'
import { loadSigningKey } from '@/lib/till/signing'
import { buildTillArchive, issueArchiveLink, supabaseArchiveStorage, TillArchiveError, ARCHIVE_LINK_SECONDS, type ArchiveDeps } from '@/lib/till/archive'
import { brevoArchiveMailer } from '@/lib/till/archive-mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const db = createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body', code: 'bad_request' }, { status: 400 }) }

  // ── who ──
  let truckId: string | null = null
  let requestedBy: 'owner' | 'admin' = 'owner'
  if (typeof body.token === 'string' && body.token) {
    const { data: truck } = await db.from('trucks').select('id, operator_id').eq('dashboard_token', body.token).maybeSingle()
    if (!truck) return NextResponse.json({ error: 'Unauthorised', code: 'invalid_token' }, { status: 401 })
    const access = await resolveTruckAccessWith(db, req, truck as { id: string; operator_id: string | null })
    if (!access.ok || access.role !== 'owner' || access.via === 'demo') return NextResponse.json({ error: 'Only the truck owner can ask for an archive', code: 'owner_only' }, { status: 403 })
    truckId = (truck as { id: string }).id
    requestedBy = access.via === 'admin' ? 'admin' : 'owner'
  } else if (await verifyAdmin(req)) {
    if (typeof body.truckId !== 'string' || !body.truckId) return NextResponse.json({ error: 'truckId required', code: 'bad_request' }, { status: 400 })
    truckId = body.truckId
    requestedBy = 'admin'
  } else {
    return NextResponse.json({ error: 'Unauthorised', code: 'unauthorised' }, { status: 401 })
  }

  let signingKey = null
  try { signingKey = loadSigningKey() } catch { console.error('[till-archive] TILL_SIGNING_KEY is set but is not an Ed25519 private key — the archive is unsigned') }
  const deps: ArchiveDeps = { db, storage: supabaseArchiveStorage(db), signingKey, mailer: brevoArchiveMailer(), log: m => console.error(m) }
  const expiresAt = () => new Date(Date.now() + ARCHIVE_LINK_SECONDS * 1000).toISOString()

  try {
    if (body.action === 'link') {
      if (typeof body.archiveId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.archiveId)) return NextResponse.json({ error: 'archiveId required', code: 'bad_request' }, { status: 400 })
      const r = await issueArchiveLink(deps, truckId, body.archiveId)
      return NextResponse.json({ ok: true, archive: { id: body.archiveId, manifest_sha256: r.manifestSha256, url: r.url, url_expires_at: expiresAt(), emailed: r.emailed } })
    }
    if (body.action !== 'build') return NextResponse.json({ error: 'action must be build or link', code: 'bad_request' }, { status: 400 })
    const from = typeof body.from === 'string' && YMD.test(body.from) ? body.from : undefined
    const to = typeof body.to === 'string' && YMD.test(body.to) ? body.to : undefined
    if ((body.from !== undefined && !from) || (body.to !== undefined && !to)) return NextResponse.json({ error: 'from / to must be YYYY-MM-DD', code: 'bad_request' }, { status: 400 })
    const r = await buildTillArchive(deps, { truckId, reason: 'on_demand', from, to, requestedBy })
    return NextResponse.json({ ok: true, archive: { id: r.archiveId, period: { from: r.from, to: r.to }, manifest_sha256: r.manifestSha256, zip_bytes: r.zipBytes, signed: r.signed, url: r.url, url_expires_at: expiresAt(), emailed: r.emailed } })
  } catch (e) {
    if (e instanceof TillArchiveError) {
      const status = e.code === 'HGT20' ? 409 : e.step === 'request' || e.step === 'link' ? 400 : 500
      return NextResponse.json({ error: e.message, code: `archive_${e.step}` }, { status })
    }
    console.error('[till-archive] failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'The archive could not be made', code: 'archive_failed' }, { status: 500 })
  }
}
