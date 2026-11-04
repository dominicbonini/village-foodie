// lib/paperwork/store.ts — every read and write of a truck's paperwork (paperwork-1, 4 November 2026). SERVER ONLY, SERVICE
// ROLE: the tables have RLS on and no policy, and the bucket is private, so nothing here is reachable from a browser except
// through the routes that call it (app/api/manage/paperwork, app/docs/[token], the daily cron, account deletion).
// 🔴 EVERY QUERY IS SCOPED TO THE TRUCK the caller has already established — a document id alone never reaches a row.
import type { SupabaseClient } from '@supabase/supabase-js'
import { EXTENSION, safeFileName, type DateLabel, type DocumentTypeRow, type DraftDetails, type StoredMime } from './model'

export const DOCUMENT_BUCKET = 'truck-documents'
/** A signed link to open or download a file lasts this long. */
export const SIGNED_URL_SECONDS = 300
/** An upload that was never saved is removed after this long (the daily cron). */
export const PENDING_HOURS = 24

export interface DocRow {
  id: string; truckId: string; typeKey: string | null; customName: string | null; issuer: string | null
  issuedOn: string | null; expiresOn: string | null; nameOnDocument: string | null; coverAmountMinor: number | null; currency: string | null
  storagePath: string | null; mime: StoredMime | null; sizeBytes: number | null; originalFilename: string | null
  status: 'pending' | 'current' | 'superseded' | 'deleted'; supersededBy: string | null; createdAt: string; updatedAt: string
  reminderStage: string | null; reminderExpiresOn: string | null
}
const DOC_COLS = 'id, truck_id, type_key, custom_name, issuer, issued_on, expires_on, name_on_document, cover_amount_minor, currency, storage_path, mime, size_bytes, original_filename, status, superseded_by, created_at, updated_at, reminder_stage, reminder_expires_on'
type Raw = Record<string, unknown>
const s = (v: unknown) => (v == null ? null : String(v))
export function docOf(r: Raw): DocRow {
  return {
    id: String(r.id), truckId: String(r.truck_id), typeKey: s(r.type_key), customName: s(r.custom_name), issuer: s(r.issuer),
    issuedOn: s(r.issued_on), expiresOn: s(r.expires_on), nameOnDocument: s(r.name_on_document),
    coverAmountMinor: r.cover_amount_minor == null ? null : Number(r.cover_amount_minor), currency: s(r.currency),
    storagePath: s(r.storage_path), mime: s(r.mime) as StoredMime | null, sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    originalFilename: s(r.original_filename), status: String(r.status) as DocRow['status'], supersededBy: s(r.superseded_by),
    createdAt: String(r.created_at), updatedAt: String(r.updated_at), reminderStage: s(r.reminder_stage), reminderExpiresOn: s(r.reminder_expires_on),
  }
}
const fail = (what: string, e: { message: string }): never => { throw new Error(`${what}: ${e.message}`) }

// ── types ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function readTypeRows(db: SupabaseClient): Promise<DocumentTypeRow[]> {
  const { data, error } = await db.from('paperwork_document_types').select('key, country_code, position, has_expiry, date_label, active')
  if (error) fail('read document types', error)
  return (data ?? []).map((r: Raw) => ({ key: String(r.key), countryCode: s(r.country_code), position: Number(r.position), hasExpiry: r.has_expiry !== false, dateLabel: (r.date_label === 'review_by' ? 'review_by' : 'expires') as DateLabel, active: r.active !== false }))
}

// ── documents ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Current and superseded documents (never pending or deleted), newest first. */
export async function listDocuments(db: SupabaseClient, truckId: string): Promise<DocRow[]> {
  const { data, error } = await db.from('truck_documents').select(DOC_COLS).eq('truck_id', truckId).in('status', ['current', 'superseded']).order('created_at', { ascending: false })
  if (error) fail('read documents', error)
  return (data ?? []).map(docOf)
}
export async function getDocument(db: SupabaseClient, truckId: string, id: string): Promise<DocRow | null> {
  const { data, error } = await db.from('truck_documents').select(DOC_COLS).eq('truck_id', truckId).eq('id', id).maybeSingle()
  if (error) fail('read the document', error)
  return data ? docOf(data as Raw) : null
}
/** A new upload: a PENDING row (never listed) whose file goes to <truck>/<id>/<file>. */
export async function createPending(db: SupabaseClient, truckId: string, filename: string): Promise<{ id: string; path: string }> {
  const { data, error } = await db.from('truck_documents').insert({ truck_id: truckId, status: 'pending', original_filename: filename.slice(0, 200) }).select('id').single()
  if (error || !data) fail('start the upload', error ?? { message: 'no row' })
  const id = String((data as Raw).id)
  const path = `${truckId}/${id}/${safeFileName(filename, 'upload')}`
  const { error: e2 } = await db.from('truck_documents').update({ storage_path: path }).eq('id', id).eq('truck_id', truckId)
  if (e2) fail('start the upload', e2)
  return { id, path }
}
export async function patchDocument(db: SupabaseClient, truckId: string, id: string, cols: Raw): Promise<void> {
  const { error } = await db.from('truck_documents').update({ ...cols, updated_at: new Date().toISOString() }).eq('truck_id', truckId).eq('id', id)
  if (error) fail('update the document', error)
}

// ── files ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function signedUploadUrl(db: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path)
  if (error || !data) fail('prepare the upload', error ?? { message: 'no url' })
  return data!.signedUrl
}
export async function downloadFile(db: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const { data, error } = await db.storage.from(DOCUMENT_BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}
export async function uploadFile(db: SupabaseClient, path: string, bytes: Uint8Array, mime: string): Promise<void> {
  const { error } = await db.storage.from(DOCUMENT_BUCKET).upload(path, bytes, { contentType: mime, upsert: true })
  if (error) fail('store the file', error)
}
/** Removes files; returns how many were asked for (storage reports no error for a missing one). */
export async function removeFiles(db: SupabaseClient, paths: readonly (string | null | undefined)[]): Promise<number> {
  const list = paths.filter((p): p is string => !!p)
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await db.storage.from(DOCUMENT_BUCKET).remove(list.slice(i, i + 100))
    if (error) fail('remove files', error)
  }
  return list.length
}
/** A short-lived link to the file: shown inline, or downloaded under a readable name. */
export async function signedFileUrl(db: SupabaseClient, path: string, download: string | null): Promise<string | null> {
  const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, download ? { download } : undefined)
  return error || !data ? null : data.signedUrl
}
/** The name a downloaded file gets: the document's name and its extension. */
export const downloadName = (label: string, mime: StoredMime | null) => `${safeFileName(label, 'document')}.${mime ? EXTENSION[mime] : 'pdf'}`

// ── save, renew, delete ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Saves a checked draft. 🔴 RENEWING: the truck's current document of the same type (or, for a custom document, the one it
 * replaces) is marked superseded FIRST — kept as history, its file kept — then this one becomes current. The unique index
 * (one current per truck and type) makes a second current impossible even under a race.
 */
export async function saveDocument(db: SupabaseClient, truckId: string, id: string, d: DraftDetails, replaces: string | null): Promise<void> {
  const now = new Date().toISOString()
  const old = d.typeKey
    ? db.from('truck_documents').update({ status: 'superseded', superseded_by: id, updated_at: now }).eq('truck_id', truckId).eq('type_key', d.typeKey).eq('status', 'current').neq('id', id)
    : replaces ? db.from('truck_documents').update({ status: 'superseded', superseded_by: id, updated_at: now }).eq('truck_id', truckId).eq('id', replaces).eq('status', 'current').neq('id', id) : null
  if (old) { const { error } = await old; if (error) fail('mark the old document as history', error) }
  const { error } = await db.from('truck_documents').update({
    type_key: d.typeKey, custom_name: d.typeKey ? null : d.customName, issuer: d.issuer, issued_on: d.issuedOn, expires_on: d.expiresOn,
    name_on_document: d.nameOnDocument, cover_amount_minor: d.coverAmountMinor, currency: d.coverAmountMinor ? d.currency : null,
    status: 'current', superseded_by: null, reminder_stage: null, reminder_expires_on: null, reminder_sent_at: null, updated_at: now,
  }).eq('truck_id', truckId).eq('id', id).in('status', ['pending', 'current'])
  if (error) fail('save the document', error)
}

/** Every version of the document `id` belongs to: for a type, all of that type; for a custom one, it and what it replaced. */
export function versionsOf(all: readonly DocRow[], doc: DocRow): DocRow[] {
  if (doc.typeKey) return all.filter(d => d.typeKey === doc.typeKey && (d.status === 'current' || d.status === 'superseded'))
  const out = [doc]
  for (let grew = true; grew;) {
    grew = false
    for (const d of all) if (!out.includes(d) && d.supersededBy && out.some(o => o.id === d.supersededBy)) { out.push(d); grew = true }
  }
  return out
}

/**
 * Deletes a document AND ITS EARLIER VERSIONS: their files are removed from storage, their details cleared (status deleted),
 * and the document is taken off every LIVE link (an item naming its type, or the document itself). Returns the files removed.
 */
export async function deleteDocument(db: SupabaseClient, truckId: string, id: string, now: Date = new Date()): Promise<{ files: number; versions: number } | null> {
  const doc = await getDocument(db, truckId, id)
  if (!doc || doc.status === 'deleted' || doc.status === 'pending') return null
  const all = await listDocuments(db, truckId)
  const versions = versionsOf(all, doc)
  const files = await removeFiles(db, versions.map(v => v.storagePath))
  const ids = versions.map(v => v.id)
  const { error } = await db.from('truck_documents').update({
    status: 'deleted', storage_path: null, issuer: null, name_on_document: null, cover_amount_minor: null, currency: null,
    original_filename: null, ai_extracted: null, custom_name: null, mime: null, size_bytes: null, updated_at: now.toISOString(),
  }).eq('truck_id', truckId).in('id', ids)
  if (error) fail('delete the document', error)
  const live = await liveShareIds(db, truckId, now)
  if (live.length) {
    const byDoc = db.from('document_share_items').delete().in('share_id', live).in('document_id', ids)
    const { error: e1 } = await byDoc
    if (e1) fail('take the document off its links', e1)
    if (doc.typeKey) {
      const { error: e2 } = await db.from('document_share_items').delete().in('share_id', live).eq('type_key', doc.typeKey)
      if (e2) fail('take the document off its links', e2)
    }
  }
  return { files, versions: ids.length }
}

/** An upload that was cancelled: its row and its file go. Only a PENDING row. */
export async function cancelPending(db: SupabaseClient, truckId: string, id: string): Promise<boolean> {
  const doc = await getDocument(db, truckId, id)
  if (!doc || doc.status !== 'pending') return false
  await removeFiles(db, [doc.storagePath])
  const { error } = await db.from('truck_documents').delete().eq('truck_id', truckId).eq('id', id).eq('status', 'pending')
  if (error) fail('cancel the upload', error)
  return true
}

/** The daily sweep: uploads never saved, older than PENDING_HOURS — files and rows. Returns how many. */
export async function sweepPending(db: SupabaseClient, now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - PENDING_HOURS * 3600_000).toISOString()
  const { data, error } = await db.from('truck_documents').select('id, storage_path').eq('status', 'pending').lt('created_at', before).limit(500)
  if (error) fail('read abandoned uploads', error)
  const rows = (data ?? []) as Raw[]
  if (!rows.length) return 0
  await removeFiles(db, rows.map(r => s(r.storage_path)))
  const { error: e2 } = await db.from('truck_documents').delete().in('id', rows.map(r => String(r.id))).eq('status', 'pending')
  if (e2) fail('remove abandoned uploads', e2)
  return rows.length
}

// ── links to organisers ─────────────────────────────────────────────────────────────────────────────────────────────
export interface ShareRow { id: string; truckId: string; token: string; organiserEmails: string[]; message: string | null; eventId: string | null; expiresAt: string; revokedAt: string | null; createdAt: string; firstOpenedAt: string | null; viewCount: number }
export interface ShareItem { shareId: string; typeKey: string | null; documentId: string | null; position: number }
const shareOf = (r: Raw): ShareRow => ({ id: String(r.id), truckId: String(r.truck_id), token: String(r.token), organiserEmails: (r.organiser_emails as string[]) ?? [], message: s(r.message), eventId: s(r.event_id), expiresAt: String(r.expires_at), revokedAt: s(r.revoked_at), createdAt: String(r.created_at), firstOpenedAt: s(r.first_opened_at), viewCount: Number(r.view_count ?? 0) })
const SHARE_COLS = 'id, truck_id, token, organiser_emails, message, event_id, expires_at, revoked_at, created_at, first_opened_at, view_count'

async function liveShareIds(db: SupabaseClient, truckId: string, now: Date): Promise<string[]> {
  const { data, error } = await db.from('document_shares').select('id').eq('truck_id', truckId).is('revoked_at', null).gt('expires_at', now.toISOString())
  if (error) fail('read links', error)
  return (data ?? []).map((r: Raw) => String(r.id))
}
export async function listShares(db: SupabaseClient, truckId: string): Promise<{ shares: ShareRow[]; items: ShareItem[] }> {
  const { data, error } = await db.from('document_shares').select(SHARE_COLS).eq('truck_id', truckId).order('created_at', { ascending: false }).limit(100)
  if (error) fail('read links', error)
  const shares = (data ?? []).map(shareOf)
  if (!shares.length) return { shares, items: [] }
  const { data: items, error: e2 } = await db.from('document_share_items').select('share_id, type_key, document_id, position').in('share_id', shares.map(x => x.id))
  if (e2) fail('read links', e2)
  return { shares, items: (items ?? []).map((r: Raw) => ({ shareId: String(r.share_id), typeKey: s(r.type_key), documentId: s(r.document_id), position: Number(r.position ?? 0) })) }
}
export async function createShare(db: SupabaseClient, row: { truckId: string; token: string; emails: string[]; message: string | null; eventId: string | null; expiresAt: string }, items: { typeKey: string | null; documentId: string | null }[]): Promise<ShareRow> {
  const { data, error } = await db.from('document_shares').insert({ truck_id: row.truckId, token: row.token, organiser_emails: row.emails, message: row.message, event_id: row.eventId, expires_at: row.expiresAt }).select(SHARE_COLS).single()
  if (error || !data) fail('create the link', error ?? { message: 'no row' })
  const share = shareOf(data as Raw)
  const { error: e2 } = await db.from('document_share_items').insert(items.map((it, i) => ({ share_id: share.id, type_key: it.typeKey, document_id: it.documentId, position: i })))
  if (e2) { await db.from('document_shares').delete().eq('id', share.id); fail('create the link', e2) }
  return share
}
export async function revokeShare(db: SupabaseClient, truckId: string, shareId: string, now: Date = new Date()): Promise<boolean> {
  const { data, error } = await db.from('document_shares').update({ revoked_at: now.toISOString() }).eq('truck_id', truckId).eq('id', shareId).is('revoked_at', null).select('id')
  if (error) fail('turn off the link', error)
  return (data ?? []).length > 0
}

/** The organiser page's read: the share, if the token is live, with ONE view counted (atomically, in the database). */
export async function openShare(db: SupabaseClient, token: string): Promise<ShareRow | null> {
  const { data, error } = await db.rpc('paperwork_share_viewed', { p_token: token })
  if (error) fail('open the link', error)
  const hit = (data as Raw[] | null)?.[0]
  if (!hit) return null
  return readShareByToken(db, token)
}
/** The share for a token WITHOUT counting a view (a file or the zip): null unless live. */
export async function readShareByToken(db: SupabaseClient, token: string, now: Date = new Date()): Promise<ShareRow | null> {
  const { data, error } = await db.from('document_shares').select(SHARE_COLS).eq('token', token).maybeSingle()
  if (error) fail('open the link', error)
  if (!data) return null
  const share = shareOf(data as Raw)
  return share.revokedAt || Date.parse(share.expiresAt) <= now.getTime() ? null : share
}
/** For the expired message: the truck a dead token belonged to (its name only), or null. */
export async function deadShareTruck(db: SupabaseClient, token: string): Promise<string | null> {
  const { data } = await db.from('document_shares').select('truck_id').eq('token', token).maybeSingle()
  return data ? String((data as Raw).truck_id) : null
}
/**
 * 🔴 ALWAYS THE CURRENT VERSION: what a share shows today — for each item naming a type, the truck's CURRENT document of that
 * type (a renewal appears by itself); for an item naming a document, that document while it is current. In the share's order.
 */
export async function shareDocuments(db: SupabaseClient, share: ShareRow): Promise<DocRow[]> {
  const { data: items, error } = await db.from('document_share_items').select('type_key, document_id, position').eq('share_id', share.id).order('position')
  if (error) fail('read the link', error)
  const { data: docs, error: e2 } = await db.from('truck_documents').select(DOC_COLS).eq('truck_id', share.truckId).eq('status', 'current')
  if (e2) fail('read the link', e2)
  const current = (docs ?? []).map(docOf)
  const out: DocRow[] = []
  for (const it of (items ?? []) as Raw[]) {
    const d = it.type_key ? current.find(x => x.typeKey === it.type_key) : current.find(x => x.id === it.document_id)
    if (d && !out.includes(d)) out.push(d)
  }
  return out
}

// ── account deletion and the hard delete of a test truck ───────────────────────────────────────────────────────────
/** Everything Paperwork holds for these trucks: every file in storage, every document row and every link (with its items). */
export async function deleteTruckPaperwork(db: SupabaseClient, truckIds: readonly string[]): Promise<{ files: number; documents: number; shares: number }> {
  let files = 0, documents = 0, shares = 0
  for (const truckId of truckIds) {
    const { data, error } = await db.from('truck_documents').select('id, storage_path').eq('truck_id', truckId)
    if (error) fail(`read documents of ${truckId}`, error)
    const rows = (data ?? []) as Raw[]
    files += await removeFiles(db, rows.map(r => s(r.storage_path)))
    // Anything left under the truck's folder (an upload whose row never existed) goes too.
    const { data: left } = db.storage ? await db.storage.from(DOCUMENT_BUCKET).list(truckId, { limit: 1000 }) : { data: [] }
    for (const folder of left ?? []) {
      const { data: inner } = await db.storage.from(DOCUMENT_BUCKET).list(`${truckId}/${folder.name}`, { limit: 100 })
      files += await removeFiles(db, (inner ?? []).map(o => `${truckId}/${folder.name}/${o.name}`))
    }
    const { data: sh, error: e1 } = await db.from('document_shares').delete().eq('truck_id', truckId).select('id')
    if (e1) fail(`delete links of ${truckId}`, e1)
    shares += (sh ?? []).length
    const { error: e2 } = await db.from('truck_documents').update({ superseded_by: null }).eq('truck_id', truckId)
    if (e2) fail(`delete documents of ${truckId}`, e2)
    const { data: del, error: e3 } = await db.from('truck_documents').delete().eq('truck_id', truckId).select('id')
    if (e3) fail(`delete documents of ${truckId}`, e3)
    documents += (del ?? []).length
  }
  return { files, documents, shares }
}
