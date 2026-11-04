// lib/paperwork/organiser.ts — what the organiser's link resolves to (paperwork-1, 4 November 2026). SERVER ONLY.
// Shared by the page (app/docs/[token]/page.tsx), one file (…/file/[documentId]) and the zip (…/all), so the three can never
// disagree about whether a link is live or which documents it shows.
// 🔴 THE PAGE COUNTS A VIEW (paperwork_share_viewed: first_opened_at, view_count) — nothing else is recorded about the organiser.
// The file and zip routes read the share WITHOUT counting.
import type { SupabaseClient } from '@supabase/supabase-js'
import { looksLikeShareToken } from './share'
import { openShare, readShareByToken, deadShareTruck, shareDocuments, readTypeRows, type DocRow, type ShareRow } from './store'
import { typesForCountry, type DocumentType } from './model'

export interface OrganiserTruck { id: string; name: string; country: string | null; logoStoragePath: string | null; timezone: string | null }
export type OrganiserView =
  | { kind: 'live'; share: ShareRow; truck: OrganiserTruck; docs: DocRow[]; types: DocumentType[] }
  | { kind: 'dead'; truck: OrganiserTruck | null }

async function truckOf(db: SupabaseClient, id: string): Promise<OrganiserTruck | null> {
  const { data } = await db.from('trucks').select('id, name, country, logo_storage_path, timezone').eq('id', id).maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  return { id: String(r.id), name: String(r.name ?? ''), country: (r.country as string | null) ?? null, logoStoragePath: (r.logo_storage_path as string | null) ?? null, timezone: (r.timezone as string | null) ?? null }
}

/** The link as the page shows it. `count` = this is a page view (counted once, atomically). */
export async function resolveOrganiserLink(db: SupabaseClient, token: string, count: boolean): Promise<OrganiserView> {
  if (!looksLikeShareToken(token)) return { kind: 'dead', truck: null }
  const share = count ? await openShare(db, token) : await readShareByToken(db, token)
  if (!share) {
    const truckId = await deadShareTruck(db, token)
    return { kind: 'dead', truck: truckId ? await truckOf(db, truckId) : null }
  }
  const truck = await truckOf(db, share.truckId)
  if (!truck) return { kind: 'dead', truck: null }
  return { kind: 'live', share, truck, docs: await shareDocuments(db, share), types: typesForCountry(await readTypeRows(db), truck.country) }
}
