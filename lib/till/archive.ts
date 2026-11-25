// lib/till/archive.ts — 🔴 till-pack-5 (25 November 2026, docs/till-pack-5-6-report.md; Q9, Q10, Q14): MAKE AN ARCHIVE.
//
// SERVER ONLY (the service role). One call = ONE archive and ONE chain entry:
//   1. read the truck's till (public.till_close_context: in the till? its clock, its accounting year, its till start), the version (the
//      database's till_settings.software_version must equal lib/till/version.ts — an archive never names a version it was not made by),
//      and a SNAPSHOT of its records up to the chain head at the start (every row read is bounded by that head);
//   2. build the files and the manifest (lib/till/archive-files.ts), sign the manifest's sha256 with TILL_SIGNING_KEY when it is set
//      (unsigned otherwise — the next run signs it: signPendingArchives), zip them;
//   3. store the zip in the private bucket `till-archives` at <truck>/<year>/<reason>-<from>_<to>-<hash12>.zip — NEVER overwriting (the
//      upload refuses an existing path, and the database refuses any change or deletion of an object in that bucket);
//   4. chain it (public.till_archive_commit: kind 'archive', the manifest's sha256 in the payload, one transaction);
//   5. a 7-day signed link, and the email to the owner in the owner's language (lib/till/archive-email.ts).
// If the upload fails nothing is chained; if the chaining fails the stored zip stays (it is never deleted) and the error is raised.
// WHEN: after each year close (lib/till/close-run.ts → the cron), on request (/api/till/archive, owner or admin), and a final archive before an
// account is closed (lib/account-deletion.ts, BEFORE anything is anonymised — a failure there stops the deletion).
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLocale } from '@/lib/i18n/locales'
import { fiscalYearEnd, fiscalYearOf } from '@/lib/till/close'
import { buildArchive, localDate, sha256Hex, zipArchive, type ArchiveInput, type ChainRow } from '@/lib/till/archive-files'
import { composeArchiveEmail } from '@/lib/till/archive-email'
import type { ArchiveMailer } from '@/lib/till/archive-mailer'
import { signHash, type SigningKey } from '@/lib/till/signing'
import { TILL_SOFTWARE_NAME, TILL_VERSION } from '@/lib/till/version'

export const ARCHIVE_BUCKET = 'till-archives'
export const ARCHIVE_LINK_SECONDS = 7 * 24 * 3600

export interface ArchiveStorage {
  /** Store bytes at a NEW path. Must refuse (throw) if the path exists — an archive is never overwritten. */
  put(path: string, bytes: Uint8Array): Promise<void>
  signedUrl(path: string, seconds: number): Promise<string>
}
export interface ArchiveDeps {
  db: SupabaseClient
  storage: ArchiveStorage
  signingKey: SigningKey | null
  mailer: ArchiveMailer | null
  now?: () => Date
  /** The owner's email and language (default: trucks.operator_id → operators.email; the country's locale). */
  ownerOf?: (truckId: string) => Promise<{ email: string | null; locale: string }>
  log?: (m: string) => void
}
export interface ArchiveRequest {
  truckId: string
  reason: 'year' | 'on_demand' | 'final'
  /** Default: the till's first trading day (final) or the start of the current accounting year (on demand). */
  from?: string
  /** Default: today, truck time. */
  to?: string
  requestedBy: 'system' | 'owner' | 'admin'
}
export interface ArchiveResult {
  archiveId: string; truckId: string; reason: string; from: string; to: string; path: string
  manifestSha256: string; zipSha256: string; zipBytes: number; seq: number; signed: boolean; url: string; emailed: boolean
}

/** A named failure, so callers (account deletion) can say exactly what stopped. */
export class TillArchiveError extends Error {
  constructor(readonly step: string, message: string, readonly code?: string) { super(`till archive failed at "${step}": ${message}`); this.name = 'TillArchiveError' }
}

const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '')
async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>, step: string): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new TillArchiveError(step, `${fn}: ${error.message}`, (error as { code?: string }).code)
  return data as T
}
async function paged<T>(step: string, build: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await build(i, i + 999)
    if (error) throw new TillArchiveError(step, error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

/** The supabase-js storage adapter for the private bucket. */
export function supabaseArchiveStorage(db: SupabaseClient): ArchiveStorage {
  return {
    async put(path, bytes) {
      const { error } = await db.storage.from(ARCHIVE_BUCKET).upload(path, bytes, { contentType: 'application/zip', upsert: false })
      if (error) throw new TillArchiveError('store', error.message)
    },
    async signedUrl(path, seconds) {
      const { data, error } = await db.storage.from(ARCHIVE_BUCKET).createSignedUrl(path, seconds, { download: path.split('/').pop() })
      if (error || !data?.signedUrl) throw new TillArchiveError('link', error?.message ?? 'no signed URL')
      return data.signedUrl
    },
  }
}

async function defaultOwnerOf(db: SupabaseClient, truckId: string): Promise<{ email: string | null; locale: string }> {
  const { data: t } = await db.from('trucks').select('id, operator_id, country').eq('id', truckId).maybeSingle()
  const truck = t as { operator_id: string | null; country: string | null } | null
  const { data: op } = truck?.operator_id ? await db.from('operators').select('email').eq('id', truck.operator_id).maybeSingle() : { data: null }
  const { data: cs } = truck?.country ? await db.from('country_settings').select('locale').eq('country_code', truck.country).maybeSingle() : { data: null }
  return { email: ((op as { email?: string | null } | null)?.email) ?? null, locale: resolveLocale((cs as { locale?: string | null } | null)?.locale) }
}

interface Context {
  now: string; applies: boolean; till_started_at: string | null; time_zone: string; currency: string | null
  fiscal_year_end: { month: number | null; day: number | null } | null; country_tax_year_start: { month: number | null; day: number | null } | null
}

/** 🔴 ONE ARCHIVE. */
export async function buildTillArchive(deps: ArchiveDeps, req: ArchiveRequest): Promise<ArchiveResult> {
  const { db } = deps
  const ctx = await rpc<Context>(db, 'till_close_context', { p_truck: req.truckId }, 'context')
  if (!ctx.applies) throw new TillArchiveError('context', `${req.truckId} is outside the till`, 'HGT20')
  if (!ctx.till_started_at) throw new TillArchiveError('context', `${req.truckId} has no till records yet`, 'HGT20')
  const tz = ctx.time_zone
  const now = deps.now ? deps.now() : new Date(ctx.now)
  const today = localDate(now.toISOString(), tz)
  const fyEnd = fiscalYearEnd(ctx.fiscal_year_end, ctx.country_tax_year_start)
  const startDay = localDate(ctx.till_started_at, tz)
  const to = req.to ?? today
  const from = req.from ?? (req.reason === 'final' ? startDay : fiscalYearOf(to, fyEnd).start)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new TillArchiveError('request', `bad period ${from} – ${to}`)
  if (to > today) throw new TillArchiveError('request', `the period ends after today (${to} > ${today})`)
  const year = fiscalYearOf(to, fyEnd)

  // the version: the database's and the code's must agree
  const { data: st, error: stErr } = await db.from('till_settings').select('software_name, software_version, signing_public_key, signing_key_id').eq('id', true).maybeSingle()
  if (stErr || !st) throw new TillArchiveError('version', stErr?.message ?? 'no till settings')
  const settings = st as { software_name: string; software_version: string; signing_public_key: string | null; signing_key_id: string | null }
  if (settings.software_version !== TILL_VERSION) throw new TillArchiveError('version', `the database runs till module ${settings.software_version}, this code is ${TILL_VERSION}`)

  // the key: registered on first use; a different key signs nothing
  let key: SigningKey | null = deps.signingKey
  if (key) {
    try { await rpc(db, 'till_register_signing_key', { p_public_key: key.publicKeyB64, p_key_id: key.keyId }, 'key') }
    catch (e) { deps.log?.(`[till-archive] ${req.truckId}: the signing key was refused (${codeOf(e) || 'error'}) — the archive stays unsigned`); key = null }
  }
  const publicKey = key ? { key: key.publicKeyB64, keyId: key.keyId } : settings.signing_public_key && settings.signing_key_id ? { key: settings.signing_public_key, keyId: settings.signing_key_id } : null

  // the snapshot: the head now, and every row up to it
  const { data: h, error: hErr } = await db.from('till_chain_heads').select('last_seq, last_hash').eq('truck_id', req.truckId).maybeSingle()
  if (hErr || !h) throw new TillArchiveError('snapshot', hErr?.message ?? 'no chain head')
  const head = h as { last_seq: number; last_hash: string }
  const H = Number(head.last_seq)
  const chain = await paged<ChainRow>('snapshot', (a, b) => db.from('till_chain').select('truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version, created_at')
    .eq('truck_id', req.truckId).lte('seq', H).order('seq').range(a, b))
  if (chain.length !== H || Number(chain[chain.length - 1]?.seq) !== H || chain[chain.length - 1]?.hash !== head.last_hash) throw new TillArchiveError('snapshot', `the chain read (${chain.length}) is not the head (${H})`)
  const closes = await paged<ArchiveInput['closes'][number]>('snapshot', (a, b) => db.from('till_closes').select('period_type, period_start, period_end, seq, hash, totals, gt_incl_minor, gt_excl_minor, gt_abs_minor, gt_period_minor, chain_head_seq, chain_head_hash, software_version, signing_at_commit, time_zone, currency, created_at')
    .eq('truck_id', req.truckId).lte('seq', H).order('seq').range(a, b))
  const closeSignatures = await paged<ArchiveInput['closeSignatures'][number]>('snapshot', (a, b) => db.from('till_close_signatures').select('seq, key_id, signature, signed_at').eq('truck_id', req.truckId).lte('seq', H).order('seq').range(a, b))
  const archives = await paged<ArchiveInput['archives'][number]>('snapshot', (a, b) => db.from('till_archives').select('id, reason, period_start, period_end, manifest_sha256, zip_sha256, seq, hash, chain_head_seq, chain_head_hash, software_version, created_at')
    .eq('truck_id', req.truckId).lte('seq', H).order('seq').range(a, b))
  const archiveSignatures = await paged<ArchiveInput['archiveSignatures'][number]>('snapshot', (a, b) => db.from('till_archive_signatures').select('archive_id, key_id, signature, signed_at').eq('truck_id', req.truckId).order('archive_id').range(a, b))
  const devices = await paged<ArchiveInput['devices'][number]>('snapshot', (a, b) => db.from('till_device_fingerprints').select('order_key, device_id, fingerprint, device_created_at, recorded_at').eq('truck_id', req.truckId).order('order_key').range(a, b))
  const actors = await paged<ArchiveInput['actors'][number]>('snapshot', (a, b) => db.from('till_entry_actors').select('seq, role, action, recorded_at').eq('truck_id', req.truckId).lte('seq', H).order('seq').range(a, b))

  const generatedAt = now.toISOString()
  const input: ArchiveInput = {
    truckId: req.truckId, reason: req.reason, from, to, timeZone: tz, currency: ctx.currency, accountingYear: year,
    software: { name: TILL_SOFTWARE_NAME, version: TILL_VERSION }, databaseSoftwareVersion: settings.software_version, generatedAt,
    chain, closes, closeSignatures, archives, archiveSignatures, devices, actors, publicKey,
  }
  const built = buildArchive(input)
  const signature = key ? { keyId: key.keyId, signature: signHash(key, built.manifestSha256) } : null
  const zip = zipArchive(built, generatedAt, signature)
  const zipSha = sha256Hex(zip)
  const path = `${req.truckId}/${year.start.slice(0, 4)}/${req.reason}-${from}_${to}-${built.manifestSha256.slice(0, 12)}.zip`

  await deps.storage.put(path, zip)
  const commit = await rpc<{ archive_id: string; seq: number; signed: boolean }>(db, 'till_archive_commit', {
    p_truck: req.truckId, p_reason: req.reason, p_start: from, p_end: to, p_year_start: year.start, p_year_end: year.end, p_path: path,
    p_manifest_sha: built.manifestSha256, p_zip_sha: zipSha, p_bytes: zip.byteLength, p_head_seq: H, p_head_hash: head.last_hash,
    p_key_id: signature?.keyId ?? null, p_signature: signature?.signature ?? null, p_requested_by: req.requestedBy }, 'chain')

  const url = await deps.storage.signedUrl(path, ARCHIVE_LINK_SECONDS)
  const emailed = await emailOwner(deps, req.truckId, { from, to, url, hash: built.manifestSha256, tz })
  return { archiveId: commit.archive_id, truckId: req.truckId, reason: req.reason, from, to, path, manifestSha256: built.manifestSha256, zipSha256: zipSha,
    zipBytes: zip.byteLength, seq: Number(commit.seq), signed: !!signature, url, emailed }
}

async function emailOwner(deps: ArchiveDeps, truckId: string, a: { from: string; to: string; url: string; hash: string; tz: string }): Promise<boolean> {
  if (!deps.mailer) return false
  const owner = await (deps.ownerOf ?? (id => defaultOwnerOf(deps.db, id)))(truckId)
  if (!owner.email) { deps.log?.(`[till-archive] ${truckId}: no owner email — not sent`); return false }
  const mail = composeArchiveEmail({ to: owner.email, locale: owner.locale, timeZone: a.tz, from: a.from, to_: a.to, link: a.url, hash: a.hash })
  return (await deps.mailer.send(mail)).ok
}

/** A NEW 7-day link to an existing archive (the on-demand API), emailed to the owner too. */
export async function issueArchiveLink(deps: ArchiveDeps, truckId: string, archiveId: string): Promise<{ url: string; emailed: boolean; manifestSha256: string }> {
  const { data, error } = await deps.db.from('till_archives').select('id, truck_id, storage_path, manifest_sha256, period_start, period_end').eq('id', archiveId).eq('truck_id', truckId).maybeSingle()
  if (error || !data) throw new TillArchiveError('link', error?.message ?? 'no such archive for this truck')
  const row = data as { storage_path: string; manifest_sha256: string; period_start: string; period_end: string }
  const ctx = await rpc<Context>(deps.db, 'till_close_context', { p_truck: truckId }, 'context')
  const url = await deps.storage.signedUrl(row.storage_path, ARCHIVE_LINK_SECONDS)
  const emailed = await emailOwner(deps, truckId, { from: row.period_start, to: row.period_end, url, hash: row.manifest_sha256, tz: ctx.time_zone })
  return { url, emailed, manifestSha256: row.manifest_sha256 }
}

/** Sign every archive of the truck written unsigned (no key then) — the closes' rule. */
export async function signPendingArchives(deps: ArchiveDeps, truckId: string): Promise<number> {
  const key = deps.signingKey
  if (!key) return 0
  const { data: rows, error } = await deps.db.from('till_archives').select('id, manifest_sha256').eq('truck_id', truckId).eq('signing_at_commit', 'unsigned')
  if (error) throw new TillArchiveError('sign', error.message)
  const { data: sigs } = await deps.db.from('till_archive_signatures').select('archive_id').eq('truck_id', truckId)
  const have = new Set(((sigs ?? []) as { archive_id: string }[]).map(s => s.archive_id))
  let n = 0
  for (const r of (rows ?? []) as { id: string; manifest_sha256: string }[]) {
    if (have.has(r.id)) continue
    if (await rpc<boolean>(deps.db, 'till_sign_archive', { p_truck: truckId, p_archive_id: r.id, p_key_id: key.keyId, p_signature: signHash(key, r.manifest_sha256) }, 'sign')) n++
  }
  return n
}

/** 🔴 THE FINAL ARCHIVE before an account closes: every truck of the account that has till records gets one, from its till start to today,
 *  and its email must have gone — otherwise this THROWS (account deletion stops, nothing anonymised). */
export async function finalArchivesFor(deps: ArchiveDeps, truckIds: readonly string[]): Promise<ArchiveResult[]> {
  if (!truckIds.length) return []
  const { data, error } = await deps.db.from('till_chain_heads').select('truck_id, last_seq').in('truck_id', truckIds as string[])
  if (error) throw new TillArchiveError('final', `could not read the till: ${error.message}`)
  const tillTrucks = ((data ?? []) as { truck_id: string; last_seq: number }[]).filter(r => Number(r.last_seq) > 0).map(r => r.truck_id).sort()
  const out: ArchiveResult[] = []
  for (const truckId of tillTrucks) {
    const r = await buildTillArchive(deps, { truckId, reason: 'final', requestedBy: 'admin' })
    if (!r.emailed) throw new TillArchiveError('final_email', `${truckId}: the final archive ${r.archiveId} is stored and chained, but its email to the owner was not sent`)
    out.push(r)
  }
  return out
}

/** The year archives that are due: a year close with no 'year' archive yet (lib/till/close-run.ts asks after its closes). */
export async function dueYearArchives(db: SupabaseClient, truckId: string): Promise<{ start: string; end: string }[]> {
  const { data: ys, error } = await db.from('till_closes').select('period_start, period_end').eq('truck_id', truckId).eq('period_type', 'year').order('period_start')
  if (error) throw new TillArchiveError('due', error.message)
  const { data: as, error: aErr } = await db.from('till_archives').select('period_start, period_end').eq('truck_id', truckId).eq('reason', 'year')
  if (aErr) throw new TillArchiveError('due', aErr.message)
  const done = new Set(((as ?? []) as { period_start: string; period_end: string }[]).map(a => `${a.period_start}:${a.period_end}`))
  return ((ys ?? []) as { period_start: string; period_end: string }[]).filter(y => !done.has(`${y.period_start}:${y.period_end}`)).map(y => ({ start: y.period_start, end: y.period_end }))
}
