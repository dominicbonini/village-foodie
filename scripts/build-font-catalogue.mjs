#!/usr/bin/env node
// scripts/build-font-catalogue.mjs — generate lib/weekly-post/font-catalogue.json from Google's
// public metadata. ⚠️ THIS IS A BUILD SCRIPT, NOT A HARNESS. It uses the network on purpose; it is not
// in scripts/harnesses.json and nothing in the product ever runs it.
//
//   node scripts/build-font-catalogue.mjs              fetch, PROBE every family, write the file
//   node scripts/build-font-catalogue.mjs --no-probe   skip the probe (records probed:false)
//   node scripts/build-font-catalogue.mjs --limit 50   a small run, for checking the script itself
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS FILE DECIDES, AND WHY IT IS A COMMITTED ARTEFACT RATHER THAN A RUNTIME FETCH
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The picker has to list ~1,800 families, and the renderer has to know which of them it may offer. If
// that list were fetched at runtime the picker would depend on Google being up, and — worse — the set
// of fonts a truck can choose from would change under them between opening the screen and saving.
// So the list is generated ONCE, committed, and reviewed in a diff like any other code.
//
// ── 🔴 THE THREE SOURCES, AND WHY EACH ONE ────────────────────────────────────────────────────────
//
//   1. **The family list, categories and weights** — `https://fonts.google.com/metadata/fonts`.
//      Google's own catalogue JSON. ⚠️ IT CARRIES NO LICENCE FIELD, which is why source 2 exists.
//
//   2. **The licence** — the DIRECTORY NAMES in the `google/fonts` GitHub repository, read through the
//      git trees API. 🔴 THE DIRECTORY **IS** THE LICENCE in that repo: `apache/`, `ofl/`, `ufl/`,
//      and `cc-by-sa/`. That makes the licence a fact about where the file lives rather than a string
//      somebody typed, and it is how the brief's "only OFL, Apache 2.0 or UFL" is enforced:
//      ⛔ A FAMILY WHOSE SLUG IS IN NONE OF THOSE THREE DIRECTORIES IS NOT WRITTEN TO THE FILE AT ALL.
//      That is also what keeps Google's own brand fonts (Google Sans and friends) out, without this
//      script having to know their names.
//
//   3. **Whether a STATIC TTF can actually be fetched** — one request per family to the LEGACY v1 CSS
//      endpoint with an **Android 2.2 user agent**. See the note on `TTF_UA` below.
//
// ── ⛔ WHAT IS DELIBERATELY LEFT OUT ──────────────────────────────────────────────────────────────
//   • **Anything without the `latin` subset.** A Noto Tamil or Noto Devanagari face has no Latin
//     glyphs, so "Wednesday 14th October" would render as a row of empty boxes. Offering it would be
//     offering a font that cannot draw the only thing this feature writes.
//   • **Anything with no regular (400) weight.** Four families: Buda (300 only), Molle (italic only),
//     Sunflower (300/500/700) and UnifrakturCook (700 only). Every box in a design asks for a regular
//     or a bold, so a family with neither would need a third weight concept for four fonts.
//   • **Any family whose probe does not return a static TTF.** The brief: *never half-offer a font.*

import fs from 'node:fs/promises'
import path from 'node:path'

const REPO = path.resolve(import.meta.dirname, '..')
const OUT = path.join(REPO, 'lib/weekly-post/font-catalogue.json')

/**
 * ══ 🔴 THE USER AGENT IS THE WHOLE TRICK, AND IT IS WORTH SPELLING OUT ════════════════════════════
 *
 * satori needs a **static TTF or OTF** — not WOFF2, and not a variable font whose axes it would have
 * to instantiate. Google Fonts serves whatever format the requesting browser supports, decided from
 * the User-Agent:
 *
 *   | UA                               | what `css?family=` returns      |
 *   |----------------------------------|----------------------------------|
 *   | a modern browser                 | **woff2** — satori cannot read it |
 *   | Chrome 19 / Android 4.4          | **woff** — satori cannot read it  |
 *   | **MSIE 6**                       | **EOT** (`font.eot`) — useless    |
 *   | **Android 2.2 (Nexus One)**      | ✅ **`format('truetype')`, a real static `.ttf`** |
 *
 * ⛔ AND IT MUST BE THE **v1** ENDPOINT (`/css?family=`), NOT `css2`. `css2` with the same UA returns
 * a `/l/font?kit=…` URL that serves an **EOT** — measured, not assumed. Both of those were tried
 * before this one; the table above is what the measurements said.
 *
 * ⚠️ THE URLS IT RETURNS ARE `fonts.gstatic.com/s/<family>/v<N>/<hash>.ttf` — per-weight STATIC
 * instances, which is exactly what satori wants and what `lib/weekly-post/ttf-metrics.ts` can read.
 * Verified end to end: a Playfair Display italic fetched this way parses with our own
 * `readFontMetrics` (unitsPerEm 1000, 105 mapped codepoints).
 */
const TTF_UA = 'Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) '
  + 'AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1'

const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const TREES = 'https://api.github.com/repos/google/fonts/git/trees'

/** The three licences the brief allows, by the directory they live in. ⛔ `cc-by-sa` is NOT here. */
const LICENCE_DIRS = { apache: 'Apache-2.0', ofl: 'OFL-1.1', ufl: 'UFL-1.0' }

/**
 * Google's five categories → the picker's four group tabs.
 *
 * ⚠️ MONOSPACE GOES IN "Clean", AND THAT IS A JUDGEMENT RATHER THAN A FACT. The brief names four
 * content tabs — Bold & tall · Handwritten · Classic · Clean — and a monospaced face is not any of
 * them. "Clean" is the closest, it is where somebody looking for a plain modern face would look, and
 * there are 150 of them against 1,600 others, so a fifth tab for them would be a tab nobody opens.
 */
const GROUP_OF = {
  'Display': 'bold',
  'Handwriting': 'hand',
  'Serif': 'classic',
  'Sans Serif': 'clean',
  'Monospace': 'clean',
}

/**
 * ⛔ TWO OVERRIDES ON TOP OF GOOGLE'S CATEGORY, BOTH BECAUSE "Bold & tall" IS NOT A GOOGLE CATEGORY.
 *
 *   1. **The 21 bundled families keep `font-list.ts`'s own grouping.** Google calls Oswald, Bebas Neue,
 *      Anton, Archivo Black and Teko "Sans Serif" — which is true and useless: they are the five
 *      condensed display faces this product shipped with, chosen for exactly the "Bold & tall" job, and
 *      Google's category would file every one of them under "Clean" alongside Inter and Lato. It also
 *      calls Abril Fatface "Display" where `font-list.ts` calls it a slab, which is the better answer
 *      for a tab named "Classic".
 *
 *   2. **A condensed or narrow sans counts as "Bold & tall".** ⚠️ THIS ONE IS A HEURISTIC ON THE
 *      FAMILY NAME and is labelled as such: "Barlow Condensed", "Archivo Narrow", "Fira Sans
 *      Compressed". A tall face is what a poster headline wants, Google has no category for it, and the
 *      word is in the family's own name in every case. It is a tab's contents, not a licence or a
 *      weight, so the cost of it being wrong for one family is one family in the wrong tab — and
 *      search covers all 1,819 whichever tab is open.
 */
const CONDENSED = /\b(condensed|narrow|compressed|semicondensed|extracondensed)\b/i

/** `font-list.ts`'s own four groups → the picker's keys. */
const BUNDLED_GROUP = {
  'Bold condensed': 'bold',
  'Slab & serif': 'classic',
  'Handwritten': 'hand',
  'Clean sans': 'clean',
}

/** family name → the slug this product uses as a font id. ⚠️ Must match `slugOfFamily` in font-refs.ts. */
const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The 21 families that are COMMITTED to the repo as .ttf files.
 *
 * 🔴 THEY KEEP THEIR OWN IDS AND ARE MARKED `bundled` IN THE CATALOGUE. Every design saved before
 * today stores one of these ids (`oswald`, `bebasneue`, …), so the catalogue must not introduce a
 * SECOND Oswald under a library id — the picker would show it twice and the two would be the same
 * bytes fetched two different ways. ⚠️ READ OUT OF `font-list.ts` rather than retyped, so the two
 * cannot drift.
 */
async function bundledFamilies() {
  const src = await fs.readFile(path.join(REPO, 'lib/weekly-post/font-list.ts'), 'utf8')
  const out = new Map()
  for (const m of src.matchAll(/\{\s*id:\s*'([a-z0-9]+)',\s*family:\s*'([^']+)',\s*group:\s*'([^']+)'/g)) {
    const group = BUNDLED_GROUP[m[3]]
    if (!group) throw new Error(`font-list.ts has a group this script does not map: "${m[3]}"`)
    out.set(m[2], { id: m[1], group })
  }
  if (out.size !== 21) throw new Error(`expected 21 bundled families in font-list.ts, found ${out.size}`)
  return out
}

const getJson = async (url, init) => {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${url} → ${r.status}`)
  return r.json()
}

/** slug → licence name, from the google/fonts directory tree. */
async function licencesBySlug() {
  const root = await getJson(TREES + '/main', { headers: { 'User-Agent': 'hatchgrab-font-catalogue' } })
  const out = new Map()
  for (const [dir, licence] of Object.entries(LICENCE_DIRS)) {
    const node = root.tree.find(t => t.path === dir && t.type === 'tree')
    if (!node) throw new Error(`google/fonts has no ${dir}/ directory any more — the licence source has moved`)
    const tree = await getJson(`${TREES}/${node.sha}`, { headers: { 'User-Agent': 'hatchgrab-font-catalogue' } })
    /* ⛔ A TRUNCATED TREE WOULD SILENTLY DROP LICENCES, and a family with no licence is a family this
     * script excludes — so a truncated response would quietly shrink the catalogue by hundreds of
     * fonts and look like Google had removed them. */
    if (tree.truncated) throw new Error(`the ${dir}/ tree came back truncated — paginate it before trusting this run`)
    for (const t of tree.tree) if (t.type === 'tree') out.set(t.path, licence)
  }
  return out
}

/**
 * Does this family yield a static TTF? One cheap CSS request.
 *
 * ⚠️ IT ASKS FOR 400 ONLY. A family that can serve a static regular can serve a static bold and
 * italic from the same endpoint — they are the same mechanism, and asking for three weights per
 * family would triple a 1,800-request probe to prove something the first answer already proves.
 */
async function probeTtf(family) {
  const url = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family).replace(/%20/g, '+')}:400`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': TTF_UA } })
    if (!r.ok) return false
    return /url\(https:\/\/[^)]+\.ttf\)\s*format\('truetype'\)/.test(await r.text())
  } catch { return false }
}

/** Run `work` over `items` with a fixed number of workers. ⚠️ Bounded, so 1,800 fetches do not all
 *  open at once and get throttled into false negatives. */
async function pool(items, size, work) {
  let i = 0
  const runners = Array.from({ length: size }, async () => {
    while (i < items.length) { const n = i++; await work(items[n], n) }
  })
  await Promise.all(runners)
}

const main = async () => {
  const args = process.argv.slice(2)
  const probe = !args.includes('--no-probe')
  const limitAt = args.indexOf('--limit')
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : 0

  process.stdout.write('· metadata… ')
  const meta = (await getJson(METADATA_URL)).familyMetadataList
  process.stdout.write(`${meta.length} families\n`)

  process.stdout.write('· licences… ')
  const licences = await licencesBySlug()
  process.stdout.write(`${licences.size} directories\n`)

  const bundled = await bundledFamilies()
  process.stdout.write(`· bundled… ${bundled.size} families keep their own ids\n`)

  const dropped = { noLicence: 0, noLatin: 0, noRegular: 0, noTtf: 0 }
  let candidates = []
  const seenSlug = new Map()

  for (const f of meta) {
    const s = slug(f.family)
    const licence = licences.get(s)
    if (!licence) { dropped.noLicence++; continue }
    if (!f.subsets?.includes('latin')) { dropped.noLatin++; continue }
    if (!f.fonts?.['400']) { dropped.noRegular++; continue }
    /* ⛔ A SLUG COLLISION WOULD MAKE TWO FAMILIES ONE FONT ID — and the second one would silently
     * render as the first on somebody's poster. It has never happened; it fails loudly if it does. */
    if (seenSlug.has(s)) throw new Error(`slug collision: "${f.family}" and "${seenSlug.get(s)}" both slug to "${s}"`)
    seenSlug.set(s, f.family)
    const own = bundled.get(f.family)
    const group = own
      ? own.group
      : (GROUP_OF[f.category] === 'clean' && CONDENSED.test(f.family) ? 'bold' : (GROUP_OF[f.category] ?? 'clean'))
    candidates.push({
      f: f.family,
      c: group,
      l: licence,
      b: f.fonts['700'] ? 1 : 0,
      i: f.fonts['400i'] ? 1 : 0,
      p: f.popularity ?? 9999,
      ...(own ? { bundled: own.id } : {}),
    })
  }
  if (limit) candidates = candidates.slice(0, limit)
  candidates.sort((a, b) => a.p - b.p || a.f.localeCompare(b.f))

  if (probe) {
    process.stdout.write(`· probing ${candidates.length} families for a static TTF`)
    const bad = new Set()
    let done = 0
    await pool(candidates, 10, async (c) => {
      /* ⚠️ A BUNDLED FAMILY IS NOT PROBED. Its .ttf is committed in `assets/fonts/weekly-post/`, so
       * whether Google would serve one is irrelevant to whether we can draw with it. */
      if (!c.bundled && !(await probeTtf(c.f))) bad.add(c.f)
      if (++done % 200 === 0) process.stdout.write('.')
    })
    dropped.noTtf = bad.size
    candidates = candidates.filter(c => !bad.has(c.f))
    process.stdout.write(` ${bad.size} refused\n`)
    if (bad.size) console.log('  refused:', [...bad].slice(0, 20).join(', ') + (bad.size > 20 ? ' …' : ''))
  } else {
    process.stdout.write('· ⚠️ PROBE SKIPPED (--no-probe) — the file will record probed:false\n')
  }

  const out = {
    $comment: [
      'GENERATED by scripts/build-font-catalogue.mjs. Do not hand-edit — re-run the script.',
      'Only OFL-1.1, Apache-2.0 and UFL-1.0 families are here; the licence comes from the directory',
      'the family lives in inside the google/fonts repository. Every family listed has been PROBED to',
      'yield a static TTF (see `probed`), has the latin subset, and has a regular 400 weight.',
      'Fields: f=family, c=group (bold|hand|classic|clean), l=licence, b=has 700, i=has 400 italic,',
      'p=Google popularity rank, bundled=this family ships as a committed .ttf under that font id.',
    ],
    generatedAt: new Date().toISOString().slice(0, 10),
    source: {
      metadata: METADATA_URL,
      licences: 'https://github.com/google/fonts — the apache/, ofl/ and ufl/ directory names',
      staticTtf: 'https://fonts.googleapis.com/css?family=… with an Android 2.2 User-Agent',
    },
    probed: probe,
    count: candidates.length,
    dropped,
    families: candidates,
  }
  /* ⚠️ ONE FAMILY PER LINE. A 1,800-entry array pretty-printed at two spaces is 16,000 lines of diff
   * nobody can read; one line each makes "which fonts changed?" a readable diff. */
  const body = candidates.map(c => '    ' + JSON.stringify(c)).join(',\n')
  const head = JSON.stringify({ ...out, families: '@@FAMILIES@@' }, null, 2)
  await fs.writeFile(OUT, head.replace('"@@FAMILIES@@"', `[\n${body}\n  ]`) + '\n')

  console.log(`\n✅ ${candidates.length} families → lib/weekly-post/font-catalogue.json`)
  console.log(`   dropped: ${dropped.noLicence} no allowed licence · ${dropped.noLatin} no latin `
    + `· ${dropped.noRegular} no regular weight · ${dropped.noTtf} no static TTF`)
  console.log(`   with a bold: ${candidates.filter(c => c.b).length} · with an italic: ${candidates.filter(c => c.i).length}`)
}

main().catch(e => { console.error('🔴 ' + e.message); process.exit(1) })
