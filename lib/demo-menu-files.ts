// lib/demo-menu-files.ts — demo-2 (30 October 2026, docs/demo-2-report.md): each demo's uploaded menu, kept for Admin.
//
// WHERE: the PRIVATE storage bucket `demo-menus` (20261052), under `<truck_id>/` — the demo session's own key, since
// demo_sessions' primary key IS the truck id. A photo or PDF is stored as uploaded; pasted text as `menu.txt`.
// WHO: the service role only. The bucket is not public and has no storage policy; Admin › Demos hands out a signed
// link that lasts SIGNED_URL_SECONDS. Nothing here returns a public URL.
// HOW LONG: as long as the demo. `deleteDemoMenuFiles` is called by every path that deletes a demo truck (the cleanup
// sweep's three passes), so a file never outlives its demo — and a claimed demo keeps its file exactly as long as the
// sweep keeps its session.
//
// BEST-EFFORT ON THE WAY IN: a demo must never fail because its menu could not be filed (no bucket yet, a network
// error). Deletion reports what it removed, so the sweep can record it.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'

export const DEMO_MENU_BUCKET = 'demo-menus'
export const SIGNED_URL_SECONDS = 60

/** A file name that is safe as a storage key: letters, digits, dot, dash, underscore; at most 80 characters. */
export function safeMenuFileName(name: string | null | undefined, fallback = 'menu'): string {
  const base = String(name ?? '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return (base || fallback).slice(0, 80)
}
/** The folder of one demo's files. Refuses anything that is not a demo truck id. */
export function demoMenuFolder(truckId: string): string {
  if (!isDemoIdentifier(truckId)) throw new Error(`not a demo truck: ${truckId}`)
  return truckId
}

/** Files the uploaded menu (and/or the pasted text) under the demo. Returns the stored paths; [] when nothing was
 *  given or storing failed (logged). Never throws. */
export async function saveDemoMenuFiles(
  supabase: SupabaseClient,
  truckId: string,
  input: { file?: File | null; text?: string | null },
  now: Date = new Date(),
): Promise<string[]> {
  const paths: string[] = []
  try {
    const folder = demoMenuFolder(truckId)
    const stamp = now.getTime()
    if (input.file) {
      const path = `${folder}/${stamp}-${safeMenuFileName(input.file.name, 'menu-upload')}`
      const { error } = await supabase.storage.from(DEMO_MENU_BUCKET).upload(path, await input.file.arrayBuffer(), {
        contentType: input.file.type || 'application/octet-stream', upsert: false,
      })
      if (error) console.warn(`[demo-menu-files] upload failed for ${truckId}: ${error.message}`)
      else paths.push(path)
    }
    if (input.text && input.text.trim()) {
      const path = `${folder}/${stamp}-menu.txt`
      const { error } = await supabase.storage.from(DEMO_MENU_BUCKET).upload(path, new TextEncoder().encode(input.text.trim()), {
        contentType: 'text/plain; charset=utf-8', upsert: false,
      })
      if (error) console.warn(`[demo-menu-files] text upload failed for ${truckId}: ${error.message}`)
      else paths.push(path)
    }
  } catch (err) {
    console.warn(`[demo-menu-files] could not store the menu for ${truckId}:`, err)
  }
  return paths
}

/** The stored files of one demo: [{ path, name, size, createdAt }]. [] when none or the bucket cannot be read. */
export async function listDemoMenuFiles(supabase: SupabaseClient, truckId: string):
  Promise<{ path: string; name: string; size: number | null; createdAt: string | null }[]> {
  try {
    const folder = demoMenuFolder(truckId)
    const { data, error } = await supabase.storage.from(DEMO_MENU_BUCKET).list(folder, { limit: 100 })
    if (error || !data) return []
    return data.filter(o => o.name && o.name !== '.emptyFolderPlaceholder').map(o => ({
      path: `${folder}/${o.name}`, name: o.name.replace(/^\d+-/, ''),
      size: (o.metadata as { size?: number } | null)?.size ?? null, createdAt: o.created_at ?? null,
    }))
  } catch { return [] }
}

/** Deletes every stored file of one demo. Returns how many were deleted (0 when none, or when the bucket is absent). */
export async function deleteDemoMenuFiles(supabase: SupabaseClient, truckId: string): Promise<number> {
  if (!isDemoIdentifier(truckId)) return 0
  const files = await listDemoMenuFiles(supabase, truckId)
  if (!files.length) return 0
  try {
    const { data, error } = await supabase.storage.from(DEMO_MENU_BUCKET).remove(files.map(f => f.path))
    if (error) { console.warn(`[demo-menu-files] delete failed for ${truckId}: ${error.message}`); return 0 }
    return Array.isArray(data) ? data.length : files.length
  } catch (err) {
    console.warn(`[demo-menu-files] delete failed for ${truckId}:`, err)
    return 0
  }
}

/** A link to one stored file that lasts SIGNED_URL_SECONDS — Admin only (the route checks the admin). The path must be
 *  inside a demo's folder. null when it cannot be signed. */
export async function signedDemoMenuUrl(supabase: SupabaseClient, path: string, download = false): Promise<string | null> {
  const folder = path.split('/')[0] ?? ''
  if (!isDemoIdentifier(folder) || path.includes('..')) return null
  try {
    const { data, error } = await supabase.storage.from(DEMO_MENU_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS, download ? { download: path.split('/').pop() ?? true } : undefined)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch { return null }
}
