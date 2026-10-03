#!/usr/bin/env node
// scripts/_fetch-weekly-post-fonts.cjs — a ONE-OFF PROVISIONING TOOL, not a harness.
//
//   node scripts/_fetch-weekly-post-fonts.cjs          # fetch any font that is missing
//   node scripts/_fetch-weekly-post-fonts.cjs --force  # re-fetch everything
//
// ── 🔴 WHY THE FONT FILES ARE IN THE REPOSITORY AT ALL ──────────────────────────────────────────────
// The weekly-post renderer must be DETERMINISTIC: the same design and the same week must produce the
// same PNG today and in a year, and the preview the operator approves must be the file they download.
// Fetching a font at render time breaks that in three ways — a network failure becomes a failed post,
// Google can reissue a family with different metrics (every `v57` in these URLs has been `v53` and
// will be `v61`), and a cold serverless function would pay the fetch on every render.
// So the TTFs are committed, and `lib/weekly-post/fonts.ts` reads them from disk.
//
// ⚠️ THIS SCRIPT IS NOT RUN BY THE BUILD OR BY ANY HARNESS. It is the recorded provenance of those
// files: what was fetched, from where, and under which licence. Re-running it is how you add a family
// or refresh one, deliberately, as a committed change with a diff.
//
// ⚠️ THE LICENCE IS READ FROM THE DIRECTORY google/fonts PUTS THE FAMILY IN — `ofl/`, `apache/` or
// `ufl/` — which is the authoritative answer. `fonts.google.com/metadata/fonts` carries only an
// `isOpenSource` boolean, so it cannot tell OFL-1.1 from Apache-2.0, and the brief asks for the actual
// licence of each family.

const fs = require('fs')
const path = require('path')
const https = require('https')

const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'assets/fonts/weekly-post')
const MANIFEST = path.join(OUT, 'MANIFEST.json')
const FORCE = process.argv.includes('--force')

/**
 * The curated list. Four groups, because those are the looks a food truck's weekly post actually
 * uses, and a list of twenty sans-serifs would be a list of one choice.
 *
 * ⚠️ `weights` IS DELIBERATELY SHORT. Two weights per family (400/700) is what the design controls
 * offer, and every extra weight is another file in the serverless bundle. Families that ship a single
 * weight (Anton, Bebas Neue, Pacifico, Abril Fatface, Permanent Marker) list only 400 — asking Google
 * for 700 returns the 400 file under a 700 name, which would silently make "bold" a lie.
 */
const FAMILIES = [
  // ── bold condensed / display: the "SATURDAY" look most weekly posts use ────────────────────────
  { family: 'Oswald',           slug: 'oswald',          group: 'Bold condensed', weights: [400, 700] },
  { family: 'Bebas Neue',       slug: 'bebasneue',       group: 'Bold condensed', weights: [400] },
  { family: 'Anton',            slug: 'anton',           group: 'Bold condensed', weights: [400] },
  { family: 'Archivo Black',    slug: 'archivoblack',    group: 'Bold condensed', weights: [400] },
  { family: 'Teko',             slug: 'teko',            group: 'Bold condensed', weights: [400, 700] },
  // ── slab / serif ───────────────────────────────────────────────────────────────────────────────
  { family: 'Roboto Slab',      slug: 'robotoslab',      group: 'Slab & serif',   weights: [400, 700] },
  { family: 'Playfair Display', slug: 'playfairdisplay', group: 'Slab & serif',   weights: [400, 700] },
  { family: 'Merriweather',     slug: 'merriweather',    group: 'Slab & serif',   weights: [400, 700] },
  { family: 'Bitter',           slug: 'bitter',          group: 'Slab & serif',   weights: [400, 700] },
  { family: 'Abril Fatface',    slug: 'abrilfatface',    group: 'Slab & serif',   weights: [400] },
  // ── script / handwritten ───────────────────────────────────────────────────────────────────────
  { family: 'Kalam',            slug: 'kalam',           group: 'Handwritten',    weights: [400, 700] },
  { family: 'Caveat',           slug: 'caveat',          group: 'Handwritten',    weights: [400, 700] },
  { family: 'Pacifico',         slug: 'pacifico',        group: 'Handwritten',    weights: [400] },
  { family: 'Permanent Marker', slug: 'permanentmarker', group: 'Handwritten',    weights: [400] },
  { family: 'Dancing Script',   slug: 'dancingscript',   group: 'Handwritten',    weights: [400, 700] },
  // ── clean sans ─────────────────────────────────────────────────────────────────────────────────
  { family: 'Inter',            slug: 'inter',           group: 'Clean sans',     weights: [400, 700] },
  { family: 'Montserrat',       slug: 'montserrat',      group: 'Clean sans',     weights: [400, 700] },
  { family: 'Poppins',          slug: 'poppins',         group: 'Clean sans',     weights: [400, 700] },
  { family: 'Raleway',          slug: 'raleway',         group: 'Clean sans',     weights: [400, 700] },
  { family: 'Work Sans',        slug: 'worksans',        group: 'Clean sans',     weights: [400, 700] },
  { family: 'Lato',             slug: 'lato',            group: 'Clean sans',     weights: [400, 700] },
]

const get = (url, asBuffer) => new Promise((resolve, reject) => {
  /* ⚠️ NO BROWSER USER-AGENT, ON PURPOSE. Google serves WOFF2 to anything that looks modern, and
   * satori/resvg need TTF or OTF. Sending no UA is what makes css2 answer with
   * `format('truetype')` — which is the whole reason this fetch works at all. */
  https.get(url, { headers: { 'accept': '*/*' } }, res => {
    if (res.statusCode === 301 || res.statusCode === 302) { get(res.headers.location, asBuffer).then(resolve, reject); return }
    if (res.statusCode !== 200) { res.resume(); reject(new Error(`${res.statusCode} ${url}`)); return }
    const chunks = []
    res.on('data', c => chunks.push(c))
    res.on('end', () => resolve(asBuffer ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')))
  }).on('error', reject)
})

/** OFL-1.1, Apache-2.0 or UFL-1.0 — decided by which directory google/fonts keeps the family in. */
async function licenceOf(slug) {
  for (const [dir, file, name] of [
    ['ofl', 'OFL.txt', 'OFL-1.1'],
    ['apache', 'LICENSE.txt', 'Apache-2.0'],
    ['ufl', 'UFL.txt', 'UFL-1.0'],
  ]) {
    try {
      await get(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${slug}/${file}`, false)
      return name
    } catch { /* try the next directory */ }
  }
  return 'UNKNOWN'
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const manifest = []
  for (const f of FAMILIES) {
    const spec = f.weights.join(';')
    const css = await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@${spec}`, false)
    /* ⚠️ PARSED AS (weight, url) PAIRS IN ORDER, not by assuming the blocks come back sorted. */
    const blocks = css.split('@font-face').slice(1)
    const byWeight = new Map()
    for (const b of blocks) {
      const w = /font-weight:\s*(\d+)/.exec(b)
      const u = /src:\s*url\((https:\/\/[^)]+?\.ttf)\)/.exec(b)
      if (w && u) byWeight.set(Number(w[1]), u[1])
    }
    const licence = await licenceOf(f.slug)
    for (const w of f.weights) {
      const url = byWeight.get(w)
      if (!url) { console.log(`🔴 ${f.family} ${w}: no TTF in the css2 response`); process.exitCode = 1; continue }
      const file = `${f.slug}-${w}.ttf`
      const dest = path.join(OUT, file)
      if (FORCE || !fs.existsSync(dest)) {
        const buf = await get(url, true)
        /* ⚠️ A SANITY FLOOR. A truncated or error-page response would otherwise be committed as a
         * "font" and fail only at render time, inside satori, with an unhelpful message. */
        if (buf.length < 8000) throw new Error(`${file}: suspiciously small (${buf.length} bytes)`)
        if (buf.readUInt32BE(0) !== 0x00010000 && buf.slice(0, 4).toString() !== 'true' && buf.slice(0, 4).toString() !== 'OTTO') {
          throw new Error(`${file}: not a TTF/OTF (magic ${buf.slice(0, 4).toString('hex')})`)
        }
        fs.writeFileSync(dest, buf)
        console.log(`  fetched ${file}  ${(buf.length / 1024).toFixed(0)} KB  ${licence}`)
      }
      manifest.push({ family: f.family, group: f.group, weight: w, file, licence, source: url, bytes: fs.statSync(dest).size })
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify({
    note: 'Written by scripts/_fetch-weekly-post-fonts.cjs. The renderer reads these files from disk; nothing is fetched at render time.',
    fetchedAt: new Date().toISOString().slice(0, 10),
    fonts: manifest,
  }, null, 2) + '\n')
  const total = manifest.reduce((n, m) => n + m.bytes, 0)
  console.log(`\n${manifest.length} files, ${new Set(manifest.map(m => m.family)).size} families, ${(total / 1024 / 1024).toFixed(1)} MB`)
  const bad = manifest.filter(m => m.licence === 'UNKNOWN')
  if (bad.length) { console.log('🔴 licence undetermined: ' + bad.map(m => m.family).join(', ')); process.exitCode = 1 }
})().catch(e => { console.log('🔴 ' + e.message); process.exit(1) })
