// lib/weekly-post/fonts.ts — the font BYTES. SERVER ONLY.
//
// ⛔ THIS MODULE READS THE FILESYSTEM. It must never be imported, directly or through another module,
// by a `'use client'` component — doing so fails the production build. The pure list lives in
// `./font-list` and is what the browser imports.
//
// 🔴 READ FROM DISK, NEVER FETCHED. The files live in `assets/fonts/weekly-post/`, committed, with
// their provenance and licences in `MANIFEST.json` and `scripts/_fetch-weekly-post-fonts.cjs`. The
// renderer must be deterministic: the preview an operator approves has to be the file they download,
// today and in a year. A render-time fetch would make the output depend on the network and on whichever
// version Google is serving that week — every `v57` in those URLs has been `v53` and will be `v61`.
//
// ⚠️ VERCEL NEEDS TO BE TOLD. A file read with `fs` from a route is only in the serverless bundle if
// the tracer sees it, and it cannot see a path built at runtime — so `next.config.ts` carries an
// `outputFileTracingIncludes` entry for this directory. Without it the fonts are present locally and
// absent in production, which is the worst shape of bug this feature could have.

import fs from 'node:fs'
import path from 'node:path'
import { readFontMetrics, type FontMetrics } from './ttf-metrics'
import { DEFAULT_FONT_ID, FONT_BY_ID, resolveWeight } from './font-list'

export * from './font-list'

/** Where the committed TTFs are. ⚠️ Mirrored in next.config.ts's tracing include. */
export const FONT_DIR = 'assets/fonts/weekly-post'

const fileCache = new Map<string, Buffer>()
const metricCache = new Map<string, FontMetrics>()

function fileFor(id: string, weight: 400 | 700): string {
  const f = FONT_BY_ID.get(id) ?? FONT_BY_ID.get(DEFAULT_FONT_ID)!
  return `${f.id}-${weight}.ttf`
}

/**
 * The font bytes, cached per process.
 *
 * ⚠️ AN UNKNOWN id FALLS BACK TO THE DEFAULT rather than throwing. A design saved with a family that a
 * later deploy removed must still render — a weekly post that cannot be produced because a font was
 * retired is a worse failure than one produced in Oswald.
 */
export function loadFontFile(id: string, bold: boolean): { data: Buffer; family: string; weight: 400 | 700 } {
  const choice = FONT_BY_ID.get(id) ?? FONT_BY_ID.get(DEFAULT_FONT_ID)!
  const weight = resolveWeight(choice.id, bold)
  const file = fileFor(choice.id, weight)
  const cached = fileCache.get(file)
  if (cached) return { data: cached, family: choice.family, weight }
  const full = path.join(process.cwd(), FONT_DIR, file)
  const data = fs.readFileSync(full)
  fileCache.set(file, data)
  return { data, family: choice.family, weight }
}

/** The metrics for the same (id, bold), cached — so `fitText` costs one parse per font per process. */
export function loadFontMetrics(id: string, bold: boolean): FontMetrics {
  const choice = FONT_BY_ID.get(id) ?? FONT_BY_ID.get(DEFAULT_FONT_ID)!
  const weight = resolveWeight(choice.id, bold)
  const key = `${choice.id}-${weight}`
  const hit = metricCache.get(key)
  if (hit) return hit
  const m = readFontMetrics(loadFontFile(choice.id, bold).data)
  metricCache.set(key, m)
  return m
}

/** Every font file a design needs, for satori's `fonts` option. One entry per distinct (id, weight). */
export function fontsForDesign(ids: readonly { id: string; bold: boolean }[]): Array<{ name: string; data: Buffer; weight: 400 | 700; style: 'normal' }> {
  const seen = new Set<string>()
  const out: Array<{ name: string; data: Buffer; weight: 400 | 700; style: 'normal' }> = []
  for (const { id, bold } of ids) {
    const f = loadFontFile(id, bold)
    /* ⚠️ KEYED BY FAMILY **AND** WEIGHT. Passing one family twice at the same weight makes satori warn
     * and pick arbitrarily; passing it once at each weight is what lets a design use regular and bold
     * of the same family in different boxes. */
    const key = `${f.family}-${f.weight}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: f.family, data: f.data, weight: f.weight, style: 'normal' })
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE BUNDLED FILES AS `FontFile`s (6 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// `font-store.ts` builds one bundle out of three sources — committed files, library files from our
// storage, and a truck's uploads — and it must not touch `fs` to do it (the harness drives it with no
// font directory). So this is the one function that turns a committed id into bytes, and it is
// INJECTED into the store rather than imported by it.

/**
 * Every face this product has a committed file for, for the given ids.
 *
 * ⚠️ IT RETURNS BOTH WEIGHTS WHERE BOTH EXIST, rather than the one the design currently asks for. The
 * bundle resolves `bold` itself, and a design whose box is toggled to bold in the editor must not need
 * a second round trip to find a file that was on disk all along. Six of the 21 are single-weight;
 * `resolveWeight` already answers that and `FontBundle.resolve` flags it as a faux bold.
 * ⛔ NO ITALIC FILES EXIST FOR ANY OF THE 21, which is why the 12° shear was built in the first place
 * (part 1, §5.2). A library or uploaded family with a real italic gets one; these never will unless
 * the files are committed.
 */
export function bundledFontFiles(ids: readonly string[]): import('./font-bundle').FontFile[] {
  const out: import('./font-bundle').FontFile[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const choice = FONT_BY_ID.get(id)
    if (!choice) continue
    for (const weight of [400, 700] as const) {
      if (!choice.weights.includes(weight)) continue
      const key = `${choice.id}|${weight}`
      if (seen.has(key)) continue
      seen.add(key)
      const f = loadFontFile(choice.id, weight === 700)
      out.push({ id: choice.id, family: f.family, weight, style: 'normal', data: f.data })
    }
  }
  return out
}
