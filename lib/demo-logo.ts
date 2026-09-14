// lib/demo-logo.ts
// The logo for a BRANDED demo (outreach "Create Demo"): how a discovery_trucks.logo_url value becomes a
// trucks.logo_storage_path value — a BUCKET PATH in truck-media, which is the only thing resolveTruckLogo
// (lib/truck-logo.ts) and Manage's buildQr know how to render.
//
// 🔴 TWO SOURCES ARE ACCEPTED AND EVERYTHING ELSE IS REFUSED. This is an ALLOWLIST, not a check against
// what the column happens to hold today (109 `/logos/…` paths, 45 of our own truck-media URLs, nothing
// external — 12 September 2026). The scraper writes logo_url, so tomorrow's row may point anywhere, and
// there is no server-side fetch of an arbitrary URL anywhere in this app; this file must not become the
// first. A refused source is not an error: the demo is built without a logo and the caller records why.
//
//   1. `/logos/<file>`           — a static file in THIS repo (public/logos). Read from disk, uploaded to
//                                  truck-media under the demo truck's own folder. The path is reduced to
//                                  its basename and re-checked against a strict character class, so a
//                                  value like `/logos/../.env` cannot reach the filesystem.
//   2. our own truck-media URL   — `<SUPABASE_URL>/storage/v1/object/public/truck-media/<path>`. The
//                                  object already exists in the bucket; the path after the prefix is
//                                  written to logo_storage_path DIRECTLY. No fetch, no bytes moved.
//                                  ⚠️ The demo then POINTS AT the discovery row's object rather than owning
//                                  a copy. Deleting that discovery logo (the outreach media delete)
//                                  leaves the demo's logo dangling — a demo is disposable, so that is the
//                                  accepted trade for never copying bytes; recorded in the build report.
//
// A bare filename is normalised the way every display surface already normalises it — formatImageUrl
// (lib/image-utils.ts) prefixes a bare name with `/logos/` — BEFORE the allowlist runs, so this file
// cannot disagree with the outreach modal's own thumbnail about what a value means.

import { readFile } from 'fs/promises'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatImageUrl } from '@/lib/image-utils'

const MEDIA_BUCKET = 'truck-media'
const STORAGE_PUBLIC_SEGMENT = `/storage/v1/object/public/${MEDIA_BUCKET}/`
/** Basename rule for the static branch: letters, digits, dot, dash, underscore; one extension. */
const SAFE_BASENAME = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif|svg)$/i

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
}

export type DemoLogoSource =
  | { kind: 'static'; file: string }            // basename under public/logos
  | { kind: 'storage'; objectPath: string }     // path inside truck-media
  | { kind: 'none' }                            // nothing stored
  | { kind: 'refused'; reason: string }         // outside the allowlist — build without a logo

/** The Supabase origins we will recognise as OUR bucket. Both env names, because the outreach upload
 *  writes the URL with `NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL` and resolveTruckLogo reads
 *  NEXT_PUBLIC_SUPABASE_URL — a value written under one must be recognised under the other. */
export function ownStorageOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map(v => v.replace(/\/+$/, ''))
}

/** PURE. Classify a discovery_trucks.logo_url value. Exported so the allowlist can be tested without a
 *  bucket or a filesystem. */
export function classifyDemoLogoSource(
  logoUrl: string | null | undefined,
  origins: string[] = ownStorageOrigins(),
): DemoLogoSource {
  const raw = formatImageUrl(logoUrl ?? null, 'logos')
  if (!raw) return { kind: 'none' }

  // Branch 1 — static file. Exactly `/logos/<basename>`, nothing deeper, nothing traversing.
  if (raw.startsWith('/logos/')) {
    const rest = raw.slice('/logos/'.length)
    const base = path.posix.basename(rest)
    if (rest !== base || !SAFE_BASENAME.test(base)) {
      return { kind: 'refused', reason: `static path is not a plain /logos/<file>: ${raw}` }
    }
    return { kind: 'static', file: base }
  }

  // Branch 2 — our own bucket. Origin must match one of OUR Supabase URLs exactly (scheme + host), then
  // the public-object segment for THIS bucket, then a non-empty object path with no traversal.
  for (const origin of origins) {
    const prefix = origin + STORAGE_PUBLIC_SEGMENT
    if (raw.startsWith(prefix)) {
      const objectPath = raw.slice(prefix.length).split('?')[0]
      if (!objectPath || objectPath.split('/').some(seg => seg === '' || seg === '.' || seg === '..')) {
        return { kind: 'refused', reason: `storage URL has no usable object path: ${raw}` }
      }
      return { kind: 'storage', objectPath: decodeURIComponent(objectPath) }
    }
  }

  return { kind: 'refused', reason: `not a /logos/ file or our own ${MEDIA_BUCKET} URL: ${raw}` }
}

export interface CopyDemoLogoResult {
  /** The value written to trucks.logo_storage_path, or null when nothing was written. */
  logoStoragePath: string | null
  source: DemoLogoSource
  /** Set when a recognised source could not be applied (disk read, upload, column write). */
  error?: string
}

/**
 * Put the discovery logo on the demo truck. Never throws: a logo is decoration on a disposable truck and
 * must never fail the provision. Writes trucks.logo_storage_path itself so the caller has one call.
 */
export async function copyDemoLogo(
  supabase: SupabaseClient,
  truckId: string,
  logoUrl: string | null | undefined,
  opts: { publicDir?: string; now?: Date } = {},
): Promise<CopyDemoLogoResult> {
  const source = classifyDemoLogoSource(logoUrl)
  if (source.kind === 'none' || source.kind === 'refused') return { logoStoragePath: null, source }

  let objectPath: string
  if (source.kind === 'storage') {
    objectPath = source.objectPath
  } else {
    // Static: read the repo file and upload it under the demo truck's own folder, the same
    // `<truck.id>/<timestamp>-<name>` shape the operator upload uses (/api/manage get_upload_url).
    const publicDir = opts.publicDir ?? path.join(process.cwd(), 'public')
    const filePath = path.join(publicDir, 'logos', source.file)
    let bytes: Buffer
    try {
      bytes = await readFile(filePath)
    } catch (err) {
      return { logoStoragePath: null, source, error: `could not read public/logos/${source.file}: ${err instanceof Error ? err.message : 'unknown'}` }
    }
    const ext = source.file.split('.').pop()!.toLowerCase()
    objectPath = `${truckId}/${(opts.now ?? new Date()).getTime()}-${source.file}`
    const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET)
      .upload(objectPath, bytes, { contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream', upsert: false })
    if (upErr) return { logoStoragePath: null, source, error: `upload failed: ${upErr.message}` }
  }

  const { error: dbErr } = await supabase.from('trucks')
    .update({ logo_storage_path: objectPath }).eq('id', truckId)
  if (dbErr) return { logoStoragePath: null, source, error: `logo_storage_path write failed: ${dbErr.message}` }
  return { logoStoragePath: objectPath, source }
}
