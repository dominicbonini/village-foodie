// lib/weekly-post/font-store.ts — getting a font's BYTES. SERVER ONLY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE ONE RULE THIS FILE EXISTS TO KEEP: **NOTHING IS FETCHED WHILE A POST IS BEING RENDERED.**
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// A library font is fetched from Google EXACTLY ONCE — the first time any truck chooses it — and then
// lives in our own private storage for ever. Rendering reads our storage, never Google.
//
// ⛔ WHY THAT MATTERS AND IS NOT AN OPTIMISATION:
//   • **Determinism.** The preview an operator approves has to be the file they download, today and in
//     a year. Google's URLs carry a version (`/v57/`) and that version changes; a render-time fetch
//     would make the output depend on whichever cut Google was serving that week. `fonts.ts` makes the
//     same argument about the bundled files in its own header, and this is the same argument.
//   • **Render time.** The brief's ceiling is 2s and a warm render is ~40ms. Three font fetches over
//     the public internet inside that is a timeout waiting to happen.
//   • **Availability.** A truck making a post at 4pm on a Saturday must not be stopped by a DNS
//     failure at fonts.gstatic.com.
//
// ── 🔴 THE THREE LAYERS, FASTEST FIRST ────────────────────────────────────────────────────────────
//   1. **in-process memory** — a `Map` keyed by storage path. A warm lambda renders with zero I/O.
//   2. **our private storage** — one `download` per face per cold start.
//   3. **Google, once ever, per face, across all trucks** — and then written to layers 2 and 1.
//
// ── ⚠️ EVERY DEPENDENCY IS INJECTED, AND THAT IS WHAT MAKES §5 POSSIBLE ───────────────────────────
// Storage, the cache table and the fetcher are interfaces. `scripts/design-fonts.cjs` drives this file
// with all three mocked, which is how "a library font fetch stores static TTFs and is reused from
// cache on the second call (mock the network in the check)" can be a real check rather than a
// description of one.

import { FACES, FALLBACK_FONT_ID, faceKey, parseFontId, slugOfFamily, type FontFace } from './font-refs'
import { makeFontBundle, type FontBundle, type FontFile } from './font-bundle'
import { catalogueFamily } from './font-catalogue'
import { readFontMetrics } from './ttf-metrics'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE INJECTED EDGES
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface FontStorage {
  download(path: string): Promise<Buffer | null>
  upload(path: string, data: Buffer): Promise<void>
  remove(paths: string[]): Promise<void>
}

/** A row of `public.font_library_cache` — one FACE of one family, shared by every truck. */
export interface LibraryFaceRow {
  family: string
  weight: 400 | 700
  style: 'normal' | 'italic'
  storage_path: string
  licence: string
  source_url: string
}

/** A row of `public.truck_fonts` — one FACE of one family a truck uploaded. */
export interface OwnFaceRow {
  family: string
  display_name: string
  weight: 400 | 700
  style: 'normal' | 'italic'
  storage_path: string
}

export interface FontRegistry {
  /** Every cached face of this family. `[]` = never fetched. */
  libraryFaces(family: string): Promise<LibraryFaceRow[]>
  /** Record freshly fetched faces. ⚠️ Idempotent — two trucks can race on the same family. */
  saveLibraryFaces(rows: LibraryFaceRow[]): Promise<void>
  /** Every face of one of this truck's uploaded families. */
  ownFaces(truckId: string, familySlug: string): Promise<OwnFaceRow[]>
}

export interface FetchedFace {
  weight: 400 | 700
  style: 'normal' | 'italic'
  data: Buffer
  sourceUrl: string
}

/** Fetch a family's static TTFs from the library source. ⚠️ Mocked in the checks. */
export type FontFetcher = (family: string, faces: readonly FontFace[]) => Promise<FetchedFace[]>

export interface StoreDeps {
  storage: FontStorage
  registry: FontRegistry
  fetcher: FontFetcher
  /** The 21 committed files, read from disk. Injected so this module never touches `fs`. */
  bundledFiles: (ids: readonly string[]) => FontFile[]
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SOURCE OF STATIC TTFs — AND THE USER AGENT IS THE WHOLE TRICK
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// satori needs a **static TTF or OTF**: not WOFF2, and not a variable font whose axes it would have to
// instantiate. Google Fonts serves whatever format the REQUESTING BROWSER supports, decided from the
// User-Agent — so the format is chosen by what we claim to be. Measured, not assumed:
//
//   | endpoint + UA                                 | what comes back                     |
//   |-----------------------------------------------|-------------------------------------|
//   | `css2?family=` + a modern browser             | **woff2** — satori cannot read it   |
//   | `css?family=` + Chrome 19 / Android 4.4       | **woff** — satori cannot read it    |
//   | `css2?family=` + **MSIE 6**                   | a `/l/font?kit=…` URL serving an **EOT** (`content-disposition: attachment; filename="font.eot"`) |
//   | **`css?family=` + Android 2.2 (Nexus One)**   | ✅ **`format('truetype')`** and a real static `.ttf` on `fonts.gstatic.com/s/…` |
//
// ⛔ AND THAT LINE USED TO END IN A GLOB — a star followed by `.ttf` — WHICH BROKE EVERY
// COMMENT-STRIPPING CHECK IN
// THE PROJECT. A slash-star sequence inside a line comment opens a BLOCK comment as far as a naive
// stripper is concerned, and the next closing delimiter it finds is seventeen lines further down — so
// `codeOf()` deleted `TTF_USER_AGENT` and `FONT_CSS_ENDPOINT` along with it. `scripts/design-fonts.cjs`
// then reported that NO file in `lib/` fetches a font, which was false and looked like a product bug.
// ⚠️ THIS NOTE CANNOT SHOW THE SEQUENCE EITHER, for the same reason. The glob is gone, four other
// instances across `lib/` were swept out with it, and §7 of that harness now forbids the pattern.
//
// ⛔ IT MUST BE THE **v1** ENDPOINT. `css2` with the same Android 2.2 UA still returns the EOT kit URL.
// Both of the first three rows were tried before this one; the table is what the tries said.
//
// ⚠️ THE FILES IT RETURNS ARE PER-WEIGHT **STATIC INSTANCES** — which is what `ttf-metrics.ts` can
// read. Verified end to end: a Playfair Display italic fetched this way parses with our own
// `readFontMetrics` (unitsPerEm 1000, 105 mapped codepoints) and renders through satori.
export const TTF_USER_AGENT = 'Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) '
  + 'AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1'

export const FONT_CSS_ENDPOINT = 'https://fonts.googleapis.com/css'

/** `[400 normal, 700 normal, 400 italic]` → the v1 endpoint's weight list, e.g. `400,700,400italic`. */
export const cssWeightList = (faces: readonly FontFace[]): string =>
  faces.map(f => (f.style === 'italic' ? `${f.weight}italic` : String(f.weight))).join(',')

/**
 * The real fetcher. ⚠️ The ONLY place in the product that talks to fonts.googleapis.com.
 *
 * 🔴 IT ASKS FOR EVERY FACE IN ONE CSS REQUEST and then downloads only the faces that came back. A
 * family with no italic simply has no italic block in the response, which is how "where a real italic
 * file exists" is decided — by the source, not by our catalogue's `i` flag. ⚠️ The catalogue flag
 * drives the PICKER (so the Italic button appears) and this drives the BYTES; if they ever disagreed,
 * the bytes win and `FontBundle.resolve` falls back to the shear.
 */
export async function fetchLibraryFaces(family: string, faces: readonly FontFace[]): Promise<FetchedFace[]> {
  const url = `${FONT_CSS_ENDPOINT}?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${cssWeightList(faces)}`
  const res = await fetch(url, { headers: { 'User-Agent': TTF_USER_AGENT } })
  if (!res.ok) throw new Error(`font source answered ${res.status} for ${family}`)
  const css = await res.text()

  /* ⚠️ PARSED PER `@font-face` BLOCK, not with one global regex over the whole sheet. The blocks are
   * `font-style`, `font-weight`, `src` in that order, and a sheet for three faces has three of them;
   * a global match for `url(...)` would pair the wrong weight with the wrong file. */
  const out: FetchedFace[] = []
  for (const block of css.split('@font-face').slice(1)) {
    const style = /font-style:\s*italic/.test(block) ? 'italic' as const : 'normal' as const
    const weightM = /font-weight:\s*(\d{3})/.exec(block)
    const urlM = /url\((https:\/\/[^)]+\.ttf)\)\s*format\('truetype'\)/.exec(block)
    if (!weightM || !urlM) continue
    const weight = Number(weightM[1]) >= 600 ? 700 as const : 400 as const
    if (!faces.some(f => f.weight === weight && f.style === style)) continue
    if (out.some(f => f.weight === weight && f.style === style)) continue
    const fileRes = await fetch(urlM[1], { headers: { 'User-Agent': TTF_USER_AGENT } })
    if (!fileRes.ok) continue
    const data = Buffer.from(await fileRes.arrayBuffer())
    /* ⛔ PARSED BEFORE IT IS STORED. A file that our own metrics reader cannot read is a file that
     * would render as nothing — and storing it would cache that failure for every truck, for ever. */
    readFontMetrics(data)
    out.push({ weight, style, data, sourceUrl: urlM[1] })
  }
  if (!out.some(f => f.weight === 400 && f.style === 'normal')) {
    throw new Error(`${family}: the font source returned no static regular TTF`)
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// STORAGE PATHS
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ BUILT SERVER-SIDE FROM A SLUG, NEVER FROM ANYTHING A CLIENT SENT. `slugOfFamily` is lowercase
// alphanumeric only, so neither of these can contain a dot, a slash or a `..` — a client-supplied
// path is authority over exactly the object it names, and this bucket holds every truck's fonts.

export const FONT_BUCKET = 'post-fonts'

export const libraryPath = (family: string, f: FontFace): string =>
  `library/${slugOfFamily(family)}-${faceKey(f)}.ttf`

export const ownPath = (truckId: string, familySlug: string, f: FontFace, ext: 'ttf' | 'otf'): string =>
  `trucks/${truckId}/${familySlug}-${faceKey(f)}.${ext}`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// LAYER 1 · THE IN-PROCESS CACHE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ KEYED BY STORAGE PATH, WHICH IS WHY IT IS SAFE TO SHARE ACROSS TRUCKS. A path begins with
 * `library/` or `trucks/<truck id>/`, so one truck's entry can never be read for another's font: they
 * cannot produce the same key. A cache keyed by `(fontId, face)` COULD — `u:myfont` means a different
 * file for every truck — which is the bug this choice avoids.
 *
 * ⚠️ BOUNDED. A long-lived process that rendered a thousand different families would otherwise hold a
 * thousand font files in memory. Oldest-inserted out first, which for this access pattern (a truck
 * renders the same two or three fonts over and over) is as good as LRU and is a third of the code.
 */
const MEMORY_LIMIT = 48
const memory = new Map<string, Buffer>()

const remember = (path: string, data: Buffer) => {
  if (memory.has(path)) memory.delete(path)
  memory.set(path, data)
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memory.delete(oldest)
  }
}

/** For the harness, and for a deploy that wants a cold start. */
export const clearFontMemory = () => memory.clear()
export const fontMemorySize = () => memory.size

async function bytesAt(path: string, storage: FontStorage): Promise<Buffer | null> {
  const hit = memory.get(path)
  if (hit) return hit
  const data = await storage.download(path)
  if (data) remember(path, data)
  return data
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// LAYER 2 + 3 · A LIBRARY FAMILY, FETCHED ONCE ACROSS THE WHOLE PRODUCT
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface EnsureResult {
  faces: Array<{ weight: 400 | 700; style: 'normal' | 'italic'; storage_path: string }>
  /** true = this call went to the font source. For the report, the harness and the log. */
  fetched: boolean
}

/**
 * Make sure a library family's faces are in our storage, and say where.
 *
 * 🔴 THE CACHE TABLE IS CHECKED FIRST AND IS THE WHOLE POINT: the first truck to choose Lobster pays
 * one fetch; every truck after them pays a `select`. ⚠️ A FAMILY WITH A CACHED REGULAR IS TREATED AS
 * DONE — if it has no italic row, that is because the source had no italic, and asking again on every
 * render would be a fetch per render for exactly the families that have the fewest faces.
 *
 * ⛔ IT REFUSES A FAMILY THAT IS NOT IN THE CATALOGUE. The catalogue is what encodes "OFL, Apache 2.0
 * or UFL only" and "a static TTF is obtainable", so fetching outside it would be fetching a font we
 * have not established we may use.
 */
export async function ensureLibraryFamily(
  family: string,
  deps: Pick<StoreDeps, 'storage' | 'registry' | 'fetcher'>,
): Promise<EnsureResult> {
  const entry = catalogueFamily(`g:${slugOfFamily(family)}`) ?? catalogueFamily(slugOfFamily(family))
  if (!entry) throw new Error(`${family} is not in the font library`)

  const cached = await deps.registry.libraryFaces(entry.family)
  if (cached.some(r => r.weight === 400 && r.style === 'normal')) {
    return { faces: cached.map(r => ({ weight: r.weight, style: r.style, storage_path: r.storage_path })), fetched: false }
  }

  /* ⚠️ ONLY THE FACES THE CATALOGUE SAYS EXIST ARE ASKED FOR. Requesting `700` from a single-weight
   * family makes the v1 endpoint answer 400 for the whole request, which would cache a regular file
   * under the bold path — a bold that was silently the regular, on every truck. */
  const want: FontFace[] = FACES
    .filter(f => (f.weight === 700 ? entry.hasBold : f.style === 'italic' ? entry.hasItalic : true))
    .map(f => ({ weight: f.weight, style: f.style }))

  const fetched = await deps.fetcher(entry.family, want)
  const rows: LibraryFaceRow[] = []
  for (const f of fetched) {
    const path = libraryPath(entry.family, f)
    await deps.storage.upload(path, f.data)
    remember(path, f.data)
    rows.push({
      family: entry.family, weight: f.weight, style: f.style,
      storage_path: path, licence: entry.licence, source_url: f.sourceUrl,
    })
  }
  await deps.registry.saveLibraryFaces(rows)
  return { faces: rows.map(r => ({ weight: r.weight, style: r.style, storage_path: r.storage_path })), fetched: true }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE BUNDLE FOR ONE DESIGN
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Load every font a design names, and return the bundle the renderer draws with.
 *
 * 🔴 OSWALD IS ALWAYS LOADED, WHATEVER THE DESIGN SAYS. It is `FontBundle`'s fallback and the
 * "Powered by HatchGrab" mark's family; a bundle without it cannot answer `resolve()` for a font that
 * has gone missing, which is the one case the fallback exists for.
 *
 * ⚠️ A FONT THAT CANNOT BE LOADED IS **SKIPPED, NOT FATAL**, and the reason is collected rather than
 * thrown. A truck who deleted an uploaded family still has a design naming it; the poster renders in
 * Oswald and the screen can say why. Throwing would mean they could not make a post at all until they
 * had found and fixed every box.
 */
export interface BundleResult {
  bundle: FontBundle
  /** Ids that were asked for and could not be loaded. The caller reports these. */
  missing: string[]
  /** true = at least one library family was fetched from the source during this call. */
  fetched: boolean
}

export async function loadFontsForDesign(
  ids: readonly string[],
  truckId: string,
  deps: StoreDeps,
): Promise<BundleResult> {
  const wanted = [...new Set([FALLBACK_FONT_ID, ...ids])]
  const bundledIds: string[] = []
  const files: FontFile[] = []
  const missing: string[] = []
  let fetched = false

  for (const id of wanted) {
    const ref = parseFontId(id)
    if (!ref) { missing.push(id); continue }
    if (ref.kind === 'bundled') { bundledIds.push(ref.id); continue }

    try {
      if (ref.kind === 'library') {
        const entry = catalogueFamily(ref.id)
        if (!entry) { missing.push(id); continue }
        const ensured = await ensureLibraryFamily(entry.family, deps)
        fetched = fetched || ensured.fetched
        for (const f of ensured.faces) {
          const data = await bytesAt(f.storage_path, deps.storage)
          if (data) files.push({ id: ref.id, family: entry.family, weight: f.weight, style: f.style, data })
        }
      } else {
        const rows = await deps.registry.ownFaces(truckId, ref.slug)
        for (const r of rows) {
          const data = await bytesAt(r.storage_path, deps.storage)
          if (data) files.push({ id: ref.id, family: r.display_name || r.family, weight: r.weight, style: r.style, data })
        }
      }
    } catch {
      /* ⚠️ SWALLOWED **PER FONT**, and recorded. One unreachable family must not take the other four
       * down with it, and `missing` is what the screen is told. */
    }
    if (!files.some(f => f.id === ref.id)) missing.push(id)
  }

  /* ⚠️ THE BUNDLED FILES ARE READ IN ONE CALL, by the injected reader — this module never touches
   * `fs`, so the harness can drive it with no font directory at all. */
  files.push(...deps.bundledFiles(bundledIds))
  return { bundle: makeFontBundle(files), missing, fetched }
}
