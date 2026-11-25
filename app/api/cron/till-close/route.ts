// app/api/cron/till-close/route.ts — 🔴 till-pack-4 (25 November 2026, docs/till-pack-4-report.md). THE TILL'S CLOSES, every hour
// (vercel.json crons): the day closes that are due (06:00 on D + 1, truck time), then the month and year closes, then the signatures
// (lib/till/close-run.ts). Demo trucks are skipped. Safe to run twice or in parallel: a close is unique per truck and period, and a second
// close of the same period is refused by the database (till_close_commit, HGT20).
// It writes ONLY the till's own tables (till_closes, till_close_signatures, till_truck_settings, the chain) — never an order or a payment.
// The response is counts only: no hash, no key, no figure.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { isDemoIdentifier } from '@/lib/demo'
import { loadChargeRules } from '@/lib/order-charge-rules'
import { runTillCloses } from '@/lib/till/close-run'
import { loadSigningKey } from '@/lib/till/signing'
import { buildTillArchive, signPendingArchives, supabaseArchiveStorage, type ArchiveDeps } from '@/lib/till/archive'
import { brevoArchiveMailer } from '@/lib/till/archive-mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also run it by hand (the other crons' gate). */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const db = createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  let signingKey = null
  try { signingKey = loadSigningKey() }
  catch { console.error('[till-close] TILL_SIGNING_KEY is set but is not an Ed25519 private key — the closes are written unsigned') }
  // till-pack-5: after a year close, its archive (stored in the private bucket, chained, emailed to the owner); archives written unsigned are signed.
  const archiveDeps: ArchiveDeps = { db, storage: supabaseArchiveStorage(db), signingKey, mailer: brevoArchiveMailer(), log: m => console.error(m) }
  try {
    const r = await runTillCloses(db, {
      signingKey,
      archiveYear: (truckId, start, end) => buildTillArchive(archiveDeps, { truckId, reason: 'year', from: start, to: end, requestedBy: 'system' }),
      signArchives: truckId => signPendingArchives(archiveDeps, truckId),
      isDemo: isDemoIdentifier,
      log: m => console.error(m),
      taxOf: async (truckId) => {
        const { data, error } = await db.from('trucks').select('id, country, tax_rate_milli, base_region_code, tipping_enabled, card_fee_payer, service_fee_enabled, service_fee_bps, service_fee_fixed_minor').eq('id', truckId).single()
        if (error || !data) throw new Error(`truck ${truckId}: ${error?.message ?? 'not found'}`)
        const rules = await loadChargeRules(data)
        return { inclusive: rules.taxInclusive, rateMilli: rules.taxRateMilli ?? null }
      },
    })
    return NextResponse.json({
      ok: r.failed === 0, signing: signingKey ? 'on' : 'unsigned', failed: r.failed,
      trucks: r.trucks.map(t => ({ days: t.days, scanned: t.scanned, months: t.months, years: t.years, signed: t.signed, archives: t.archives, archives_failed: t.archivesFailed, archives_signed: t.archivesSigned, stopped: t.stopped ?? null, verify_ok: t.verifyOk ?? null })),
    })
  } catch (e) {
    console.error('[till-close] the close run stopped (the next run retries):', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'till close run failed' }, { status: 500 })
  }
}
