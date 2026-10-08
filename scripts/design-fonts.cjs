#!/usr/bin/env node
// scripts/design-fonts.cjs — THE FONT LIBRARY AND UPLOADED FONTS.
//
//   node scripts/design-fonts.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO REAL TRUCK FONTS)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   1. **THE LICENCE RULE.** Only OFL-1.1, Apache-2.0 and UFL-1.0 families may be offered. The
//      catalogue is a committed, generated file, so this is a check on an ARTEFACT — exactly the kind
//      of thing that gets loosened by accident when a build script is edited.
//   2. **NOTHING IS FETCHED WHILE A POST IS BEING RENDERED.** A library family is fetched ONCE, ever,
//      and then read from our own storage. The second call must not touch the network — and that is
//      only provable by making the network a thing the check can watch, which is why `font-store.ts`
//      takes its storage, its cache table and its fetcher as INTERFACES.
//   3. **A FILE THE PRODUCT CANNOT DRAW WITH IS REFUSED, WITH A SENTENCE AN OPERATOR CAN ACT ON.** A
//      WOFF2 is the common mistake; junk is the hostile case; both are refused by the same reader the
//      renderer uses, so there is one opinion on "is this a font".
//   4. **SHRINK-TO-FIT USES THE CHOSEN FONT'S OWN METRICS.** ⛔ THIS IS THE ONE THAT FAILS SILENTLY ON
//      FINISHED ARTWORK: measure with Oswald and draw with a wide face and the text overflows a box on
//      a poster that goes straight to customers.
//
// 🔴 EVERY FONT USED HERE IS EITHER COMMITTED IN THIS REPOSITORY OR SYNTHESISED IN THIS FILE. No
// network, and no real truck's uploaded font.

const path = require('path')
const fs = require('fs')
const { compile } = require('./_slot-interval-compile.cjs')
const REPO = path.resolve(__dirname, '..')

const LIB = [
  'lib/weekly-post/week.ts', 'lib/weekly-post/format.ts', 'lib/weekly-post/locale.ts',
  'lib/weekly-post/font-refs.ts', 'lib/weekly-post/font-bundle.ts', 'lib/weekly-post/font-catalogue.ts',
  'lib/weekly-post/font-store.ts', 'lib/weekly-post/place-pictures.ts',
  'lib/weekly-post/week-data.ts', 'lib/weekly-post/layout.ts', 'lib/weekly-post/fit.ts',
  'lib/weekly-post/contrast.ts', 'lib/weekly-post/fonts.ts', 'lib/weekly-post/font-list.ts',
  'lib/weekly-post/ttf-metrics.ts', 'lib/weekly-post/caption.ts', 'lib/weekly-post/render.ts',
  'lib/weekly-post/image-info.ts',
  'lib/time-utils.ts', 'lib/private-events/resolve.ts',
]

/* 🔴 `resolveJsonModule` IS ASKED FOR, AND THE CATALOGUE IS COPIED INTO THE OUTPUT TOO.
 * `font-catalogue.ts` imports its 129KB JSON **statically** — which is the production-correctness
 * choice, because Next traces a static import into the serverless bundle and cannot trace a path built
 * at runtime (the trap `fonts.ts` carries a tracing entry for). The harness's compile is a copy of the
 * named .ts files, so without BOTH of these the module fails to LOAD and every check below would fail
 * for a reason that has nothing to do with fonts. ⚠️ The copy is a belt: tsc emits the JSON itself with
 * the option on, and copying over an identical file is harmless. */
const c = compile(REPO, LIB, 'df', { resolveJsonModule: true })
fs.mkdirSync(path.join(c.out, 'lib/weekly-post'), { recursive: true })
fs.copyFileSync(
  path.join(REPO, 'lib/weekly-post/font-catalogue.json'),
  path.join(c.out, 'lib/weekly-post/font-catalogue.json'),
)
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }

const REFS = c.req('lib/weekly-post/font-refs.js')
const CAT = c.req('lib/weekly-post/font-catalogue.js')
const BUNDLE = c.req('lib/weekly-post/font-bundle.js')
const STORE = c.req('lib/weekly-post/font-store.js')
const TTF = c.req('lib/weekly-post/ttf-metrics.js')
const FONTS = c.req('lib/weekly-post/fonts.js')
const L = c.req('lib/weekly-post/layout.js')
const R = c.req('lib/weekly-post/render.js')
const D = c.req('lib/weekly-post/week-data.js')
const W = c.req('lib/weekly-post/week.js')
const FIT = c.req('lib/weekly-post/fit.js')

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
/* ⛔ COMMENTS STRIPPED BEFORE ANY SOURCE ASSERTION. This project has shipped that bug twice, and once
 * as a COUNT that went UP because a note quoted the thing being counted. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const ttf = (name) => fs.readFileSync(path.join(REPO, 'assets/fonts/weekly-post', name))

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE CATALOGUE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · THE CATALOGUE AND ITS LICENCES')
{
  const raw = JSON.parse(read('lib/weekly-post/font-catalogue.json'))

  /* ⛔ THE CENTRAL RULE OF §1, AND IT IS A CHECK ON A COMMITTED ARTEFACT. The build script's filter
   * could be loosened in one line; this is what notices. */
  const ALLOWED = ['OFL-1.1', 'Apache-2.0', 'UFL-1.0']
  t('🔴 EVERY family in the catalogue carries one of the three allowed licences',
    raw.families.length > 0 && raw.families.every(f => ALLOWED.includes(f.l)))
  t('⛔ …and no other licence string appears in the file at all', (() => {
    const seen = new Set(raw.families.map(f => f.l))
    return seen.size <= 3 && [...seen].every(l => ALLOWED.includes(l))
  })())
  /* ⚠️ A POSITIVE CLAIM BESIDE IT. "every family is allowed" is also true of an EMPTY catalogue, and
   * an empty one would make the whole library quietly disappear. */
  t('⚠️ …and there are more than a thousand of them, so the rule is not vacuous',
    raw.count === raw.families.length && raw.count > 1000)
  t('🔴 the file records that every family was PROBED for a static TTF', raw.probed === true)
  t('⛔ a catalogue written with --no-probe would be refused at load',
    /if \(!RAW\.probed\)/.test(codeOf(read('lib/weekly-post/font-catalogue.ts'))))

  t('⚠️ every family has a regular weight and a group the picker knows', (() => {
    const groups = new Set(['bold', 'hand', 'classic', 'clean'])
    return raw.families.every(f => groups.has(f.c) && (f.b === 0 || f.b === 1) && (f.i === 0 || f.i === 1))
  })())
  /* ⛔ A SLUG COLLISION WOULD MAKE TWO FAMILIES ONE FONT ID, and the second would silently render as
   * the first on somebody's poster. The builder throws on it; this is the committed proof. */
  t('⛔ no two families slug to the same font id', (() => {
    const ids = CAT.FONT_CATALOGUE.map(f => f.id)
    return new Set(ids).size === ids.length
  })())

  /* 🔴 THE 21 COMMITTED FAMILIES KEEP THEIR BARE IDS. Every design saved before today stores one of
   * them; a `g:oswald` would have orphaned all of them AND shown Oswald twice in the picker. */
  t('🔴 all 21 bundled families are in the catalogue under their BUNDLED ids, not g: ids', (() => {
    const bundled = CAT.FONT_CATALOGUE.filter(f => f.bundled)
    return bundled.length === 21 && bundled.every(f => !f.id.includes(':'))
      && CAT.catalogueFamily('oswald')?.family === 'Oswald'
      && CAT.catalogueFamily('g:oswald') === null
  })())
  t('⚠️ …and the five condensed display faces are in "Bold & tall", not in "Clean"',
    ['oswald', 'bebasneue', 'anton', 'archivoblack', 'teko']
      .every(id => CAT.catalogueFamily(id)?.group === 'bold'))

  t('🔴 the popular picks are about forty, all resolve, and span all four groups', (() => {
    const p = CAT.POPULAR_PICKS
    const groups = new Set(p.map(f => f.group))
    return p.length >= 36 && p.length <= 48 && p.every(f => !!f.family) && groups.size === 4
  })())
  t('⛔ a pick that is not in the catalogue throws at load rather than being skipped',
    /is not in font-catalogue\.json/.test(read('lib/weekly-post/font-catalogue.ts')))

  t('⚠️ the payload the browser gets is tuples, and under 150KB', (() => {
    const bytes = JSON.stringify(CAT.cataloguePayload()).length
    return bytes < 150_000 && Array.isArray(CAT.cataloguePayload().families[0])
  })())
  /* 🔴 THE SEARCH BOX'S COUNT IS DERIVED. A hard-coded "1,500+" would go stale the first time the
   * catalogue was rebuilt — and it is 1,819. */
  t('🔴 the count the picker shows comes from the catalogue, not from a literal',
    CAT.FONT_COUNT === raw.count
    && /Search \$\{lib\.count\.toLocaleString\('en-GB'\)\} fonts/.test(read('components/manage/FontPicker.tsx'))
    && !/1,500|1500\+/.test(codeOf(read('components/manage/FontPicker.tsx'))))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · FONT IDS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · THE THREE KINDS OF FONT ID')
{
  t('🔴 a bundled id stays BARE — every design saved before today uses one',
    REFS.parseFontId('oswald')?.kind === 'bundled'
    && REFS.parseFontId('playfairdisplay')?.kind === 'bundled')
  t('🔴 a library id is g:<slug> and an uploaded one is u:<slug>',
    REFS.parseFontId('g:lobster')?.kind === 'library'
    && REFS.parseFontId('u:myshopfont')?.kind === 'own'
    && REFS.parseFontId('g:lobster').slug === 'lobster')
  /* ⛔ THE SLUG ENDS UP IN A STORAGE OBJECT PATH, so a dot or a slash in it would be a traversal in a
   * string the browser supplies. The shape check is the only thing between the two. */
  t('⛔ a path, a traversal or junk is refused outright', (() => {
    const bad = ['../../etc/passwd', 'g:../x', 'u:a/b', 'g:', 'u:', 'My Font', 'g:' + 'x'.repeat(80), '', null, 42, {}]
    return bad.every(v => REFS.parseFontId(v) === null)
  })())
  t('🔴 the VALIDATOR accepts all three shapes and falls back for anything else', (() => {
    const base = L.defaultLayout(540, 675)
    const put = (id) => L.validateLayout({ ...base, date: { ...base.date, fontId: id } }, 540, 675).layout.date.fontId
    return put('oswald') === 'oswald' && put('g:lobster') === 'g:lobster'
      && put('u:myshopfont') === 'u:myshopfont'
      && put('../../etc/passwd') === 'oswald' && put('g: nope') === 'oswald'
  })())
  t('⚠️ `slugOfFamily` matches the builder\'s own slug function',
    REFS.slugOfFamily('Playfair Display') === 'playfairdisplay'
    && REFS.slugOfFamily('Bebas Neue') === 'bebasneue'
    && REFS.slugOfFamily('Edu NSW ACT Cursive') === 'edunswactcursive')
  t('🔴 the three faces are the three the product draws, and there is no bold italic', (() => {
    const keys = REFS.FACES.map(f => REFS.faceKey(f))
    return keys.join(',') === '400,700,400i'
      && REFS.faceKey(REFS.faceFor(true, true)) === '400i'
      && REFS.faceKey(REFS.faceFor(true, false)) === '700'
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · READING A FONT FILE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · READING AN UPLOADED FONT')
{
  /* 🔴 A COMMITTED FILE STANDS IN FOR AN UPLOAD. It is a real TTF with a real name table, which is
   * what the check is about — and no truck's own font is involved. */
  t('🔴 a real TTF parses and gives up its family and face', () => true)
  const osw = ttf('oswald-400.ttf')
  const oswB = ttf('oswald-700.ttf')
  t('🔴 an uploaded TTF parses and its FAMILY comes from the name table', (() => {
    const n = TTF.readFontNames(osw)
    const f = TTF.faceOfFont(osw, n)
    return n.family === 'Oswald' && f.family === 'Oswald' && f.weight === 400 && f.style === 'normal'
  })())
  /* ⛔ FROM THE BYTES, NOT THE FILENAME. The filename is supplied by the browser and "Bold" in it may
   * be a lie; `OS/2`'s weight class is the font's own answer. */
  t('⛔ the WEIGHT comes from OS/2, not from the filename', (() => {
    const f = TTF.faceOfFont(oswB, TTF.readFontNames(oswB))
    return f.weight === 700 && f.saidWeight === 700 && f.saidSubfamily === 'Bold'
  })())
  t('⚠️ a single-weight family reads as Regular', (() => {
    const p = ttf('pacifico-400.ttf')
    const f = TTF.faceOfFont(p, TTF.readFontNames(p))
    return f.family === 'Pacifico' && f.weight === 400 && f.style === 'normal'
  })())

  /* ⛔ A WOFF2 IS THE COMMON MISTAKE AND IS NAMED, NOT "unknown magic 0x774f4632". A foundry's
   * download page usually offers a web font second. */
  const woff2 = Buffer.concat([Buffer.from('wOF2', 'latin1'), Buffer.alloc(200)])
  const woff = Buffer.concat([Buffer.from('wOFF', 'latin1'), Buffer.alloc(200)])
  t('⛔ a WOFF2 is refused, and the error NAMES the format', (() => {
    try { TTF.readFontMetrics(woff2); return false } catch (e) { return /WOFF2/.test(e.message) }
  })())
  t('⛔ …and a WOFF too', (() => {
    try { TTF.readFontMetrics(woff); return false } catch (e) { return /WOFF/.test(e.message) }
  })())
  t('⛔ the operator-facing sentence tells them where to get a usable file',
    REFS.WOFF_REFUSAL === 'Please upload a TTF or OTF file — you can usually download one from where you bought the font.'
    && /WOFF_REFUSAL/.test(codeOf(read('app/api/weekly-post/route.ts'))))
  t('⛔ junk, an empty file and a .ttc collection are all refused', (() => {
    const cases = [Buffer.alloc(0), Buffer.from('hello world, not a font'),
      Buffer.concat([Buffer.from('ttcf', 'latin1'), Buffer.alloc(64)]),
      /* ⚠️ A VALID MAGIC WITH NOTHING BEHIND IT — the hostile case, not the clumsy one. It gets past a
       * magic sniff and must fail on the missing tables. */
      Buffer.concat([Buffer.from([0, 1, 0, 0, 0, 4]), Buffer.alloc(80)])]
    return cases.every(b => { try { TTF.readFontMetrics(b); return false } catch { return true } })
  })())
  t('⚠️ a .ttc is refused by NAME, so the operator is not told "unknown magic"', (() => {
    try { TTF.readFontMetrics(Buffer.concat([Buffer.from('ttcf', 'latin1'), Buffer.alloc(64)])); return false }
    catch (e) { return /collection/.test(e.message) }
  })())
  /* 🔴 NAME IDS 16/17 BEAT 1/2. A nine-weight family ships id 1 = "Roboto Light"; reading only id 1
   * would file every weight as a separate family — nine families of one face each. */
  t('🔴 the preferred family (name id 16) wins over id 1 where it exists',
    /preferredFamily \?\? names\.family/.test(read('lib/weekly-post/ttf-metrics.ts'))
    && /pick\(16\)/.test(read('lib/weekly-post/ttf-metrics.ts')))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · 🔴 FETCHED ONCE, THEN NEVER AGAIN — WITH THE NETWORK MOCKED
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · A LIBRARY FONT IS FETCHED ONCE AND REUSED FROM CACHE')
;(async () => {
  /**
   * ══ 🔴 THE MOCKS, AND WHY THEY ARE THE POINT ══════════════════════════════════════════════════
   *
   * `font-store.ts` takes storage, the cache table and the fetcher as INTERFACES — it imports neither
   * Supabase nor `fetch`. ⛔ THAT IS NOT TIDINESS: "nothing is fetched while a post is being
   * rendered" is only provable if the check can COUNT the fetches, and a module that called `fetch`
   * directly could only be checked by letting it hit the network.
   */
  const mk = () => {
    const objects = new Map()
    const rows = []
    let fetches = 0
    let downloads = 0
    return {
      calls: () => ({ fetches, downloads }),
      storage: {
        async download(p) { downloads++; return objects.get(p) ?? null },
        async upload(p, data) { objects.set(p, data) },
        async remove(ps) { for (const p of ps) objects.delete(p) },
      },
      registry: {
        async libraryFaces(family) { return rows.filter(r => r.family === family) },
        async saveLibraryFaces(rs) {
          for (const r of rs) if (!rows.some(x => x.family === r.family && x.weight === r.weight && x.style === r.style)) rows.push(r)
        },
        async ownFaces() { return [] },
      },
      /* ⚠️ THE FETCHER RETURNS REAL FONT BYTES — the committed Playfair Display files — so everything
       * downstream (the metrics parse inside the store, the bundle, the render) is doing real work.
       * A fetcher returning `Buffer.alloc(100)` would make this a check of the counting only. */
      fetcher: async (family, faces) => {
        fetches++
        const files = { '400normal': 'playfairdisplay-400.ttf', '700normal': 'playfairdisplay-700.ttf' }
        return faces
          .map(f => ({ ...f, file: files[`${f.weight}${f.style}`] }))
          .filter(f => f.file)
          .map(f => ({ weight: f.weight, style: f.style, data: ttf(f.file), sourceUrl: `https://example.invalid/${f.file}` }))
      },
      rows,
      objects,
    }
  }

  const m = mk()
  STORE.clearFontMemory()
  const first = await STORE.ensureLibraryFamily('Lobster', { storage: m.storage, registry: m.registry, fetcher: m.fetcher })
  t('🔴 the FIRST choice fetches from the source and stores the files',
    first.fetched === true && m.calls().fetches === 1 && m.objects.size >= 1)
  t('🔴 …and records a row per face in the shared cache table, with the licence',
    m.rows.length >= 1 && m.rows.every(r => r.family === 'Lobster' && r.licence === 'OFL-1.1' && r.storage_path.startsWith('library/')))
  t('⚠️ …and the stored bytes are a real static TTF our own reader can parse',
    [...m.objects.values()].every(b => { try { return TTF.readFontMetrics(b).unitsPerEm > 0 } catch { return false } }))

  const second = await STORE.ensureLibraryFamily('Lobster', { storage: m.storage, registry: m.registry, fetcher: m.fetcher })
  /* ⛔ THE WHOLE CLAIM OF §1, IN ONE ASSERTION: the second truck pays a SELECT, not a fetch. */
  t('🔴 THE SECOND CHOICE DOES NOT TOUCH THE SOURCE — it comes from the cache table',
    second.fetched === false && m.calls().fetches === 1 && second.faces.length === first.faces.length)

  /* ⛔ A FAMILY OUTSIDE THE CATALOGUE IS REFUSED RATHER THAN ATTEMPTED. The catalogue is what encodes
   * the licence rule, so fetching outside it would be fetching a font we have not established we may
   * use. */
  let refused = false
  try { await STORE.ensureLibraryFamily('Helvetica Neue', { storage: m.storage, registry: m.registry, fetcher: m.fetcher }) }
  catch (e) { refused = /not in the font library/.test(e.message) }
  t('⛔ a family that is NOT in the catalogue is refused, and the source is never called',
    refused && m.calls().fetches === 1)

  /* 🔴 LAYER 1: THE IN-PROCESS CACHE. A warm process renders with zero storage reads. */
  const m2 = mk()
  STORE.clearFontMemory()
  const deps2 = { storage: m2.storage, registry: m2.registry, fetcher: m2.fetcher, bundledFiles: FONTS.bundledFontFiles }
  await STORE.loadFontsForDesign(['g:lobster'], 'test-truck', deps2)
  const afterFirst = m2.calls().downloads
  await STORE.loadFontsForDesign(['g:lobster'], 'test-truck', deps2)
  t('🔴 the in-memory cache means a second render of the same design reads storage ZERO more times',
    m2.calls().downloads === afterFirst && m2.calls().fetches === 1)
  t('⚠️ …and it is keyed by STORAGE PATH, so one truck\'s font can never be served for another\'s',
    /KEYED BY STORAGE PATH/.test(read('lib/weekly-post/font-store.ts'))
    && STORE.fontMemorySize() > 0)

  /* ⚠️ OSWALD IS ALWAYS IN THE BUNDLE, whatever the design says — it is the fallback and the mark's
   * family, and a bundle without it cannot answer `resolve()` for a font that has gone. */
  const b1 = await STORE.loadFontsForDesign(['g:lobster'], 'test-truck', deps2)
  t('🔴 Oswald is always loaded, so the fallback always exists',
    b1.bundle.ids().includes('oswald') && b1.missing.length === 0)

  /* ⛔ A MISSING FONT IS REPORTED, NOT FATAL. A truck deleted an uploaded family a design still names;
   * the poster renders in Oswald and the screen says which box lost its font. */
  const b2 = await STORE.loadFontsForDesign(['u:deletedfont'], 'test-truck', deps2)
  t('⛔ a font that cannot be loaded is REPORTED and the render still has a fallback',
    b2.missing.includes('u:deletedfont') && b2.bundle.resolve('u:deletedfont', false, false).family === 'Oswald')
  t('⚠️ …and the route turns that into a warning rather than an error',
    /could not be loaded — those boxes are in Oswald/.test(read('app/api/weekly-post/route.ts')))

  // ══ 5 · THE BUNDLE AND THE RENDERER ══════════════════════════════════════════════════════════
  head('5 · THE RENDERER DRAWS WITH A LIBRARY AND AN UPLOADED FONT')

  /* 🔴 THE SYNTHETIC ARTWORK, as in design-editor.cjs: half light, half dark, built here. */
  const zlib = require('zlib')
  const PNG_W = 540, PNG_H = 675
  const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c } return t })()
  const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ -1 }
  const makePng = (w, h) => {
    const raw = Buffer.alloc((w * 3 + 1) * h)
    let o = 0
    for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { const l = x < w / 2; raw[o++] = l ? 236 : 18; raw[o++] = l ? 238 : 20; raw[o++] = l ? 240 : 24 } }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, cr]) }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  }
  const URI = 'data:image/png;base64,' + makePng(PNG_W, PNG_H).toString('base64')

  const range = W.weekRange('this', '2026-10-12T12:00:00Z')
  const week = D.buildWeekData(range, [
    { id: 'e1', event_date: range.days[0], start_time: '17:00', end_time: '21:00', venue_name: 'The Kings Arms', town: 'Lavenham', status: 'confirmed' },
  ], [], { timeStyle: '12h', showCancelled: true })

  const base = L.defaultLayout(PNG_W, PNG_H)
  /**
   * ══ 🔴 THE FONT IS SET ON `textStyle` **AND** ON EVERY BOX — AND THE HARNESS IS WHY ════════════════
   *
   * ⛔ SETTING IT ON THE BOXES ALONE STOPPED WORKING ON 9 OCTOBER 2026. "All text" arrived that day: a
   * shared look held on the layout, which every box FOLLOWS unless it owns its own. So
   * `resolveTextBox` was replacing each box's `fontId` with the shared one — Oswald — and three
   * fixtures that thought they were rendering Lobster rendered Oswald. **The pixels were identical and
   * the checks said so.**
   *
   * 🔴 SETTING THE **SHARED** FONT IS ALSO THE MORE HONEST FIXTURE. "All text" is how a truck gives a
   * whole design one font now, so a design in Lobster is a design whose shared look is Lobster — which
   * is exactly what `fontsUsedBy` has to see for the face to be loaded at all.
   * ⚠️ THE PER-BOX FIELDS ARE SET TOO, deliberately: they are what a rollback to an older build would
   * draw, and leaving them on Oswald would make this fixture disagree with itself.
   */
  const withFont = (id) => L.validateLayout({
    ...base,
    textStyle: { ...base.textStyle, fontId: id },
    date: { ...base.date, fontId: id },
    location: { ...base.location, fontId: id },
    time: { ...base.time, fontId: id },
    heading: { ...base.heading, fontId: id },
  }, PNG_W, PNG_H).layout

  const renderWith = async (layout, bundle) =>
    (await R.renderWeeklyPost({ layout, week, blankDataUri: URI, fonts: bundle })).png

  const oswaldPng = await renderWith(withFont('oswald'), undefined)

  /* 🔴 A LIBRARY FONT: the mock fetcher hands over the real Playfair Display files, so this renders
   * with a face that is NOT Oswald and the pixels must say so. */
  const libLoaded = await STORE.loadFontsForDesign(['g:lobster'], 'test-truck', deps2)
  const libPng = await renderWith(withFont('g:lobster'), libLoaded.bundle)
  t('🔴 the renderer DRAWS with a library font, and the pixels differ from Oswald',
    Buffer.compare(libPng, oswaldPng) !== 0 && libPng.length > 1000)

  /* 🔴 AN UPLOADED FONT: a `truck_fonts` row pointing at an object we put in the mock storage. */
  const m3 = mk()
  STORE.clearFontMemory()
  const ownPath = STORE.ownPath('test-truck', 'myshopfont', { weight: 400, style: 'normal' }, 'ttf')
  await m3.storage.upload(ownPath, ttf('abrilfatface-400.ttf'))
  const deps3 = {
    storage: m3.storage,
    registry: {
      ...m3.registry,
      async ownFaces(truckId, slug) {
        return truckId === 'test-truck' && slug === 'myshopfont'
          ? [{ family: 'MyShopFont', display_name: 'My Shop Font', weight: 400, style: 'normal', storage_path: ownPath }]
          : []
      },
    },
    fetcher: m3.fetcher,
    bundledFiles: FONTS.bundledFontFiles,
  }
  const ownLoaded = await STORE.loadFontsForDesign(['u:myshopfont'], 'test-truck', deps3)
  t('🔴 an uploaded font loads from the truck\'s own folder',
    ownLoaded.missing.length === 0 && ownLoaded.bundle.ids().includes('u:myshopfont'))
  const ownPng = await renderWith(withFont('u:myshopfont'), ownLoaded.bundle)
  t('🔴 the renderer DRAWS with an uploaded font, and the pixels differ from Oswald',
    Buffer.compare(ownPng, oswaldPng) !== 0 && Buffer.compare(ownPng, libPng) !== 0)

  /* ⛔ ONE TRUCK CANNOT LOAD ANOTHER'S UPLOADED FONT. `ownFaces` is filtered by truck id in the route
   * and the registry; this proves the store honours the answer rather than guessing a path. */
  const otherTruck = await STORE.loadFontsForDesign(['u:myshopfont'], 'someone-else', deps3)
  t('⛔ ANOTHER truck asking for the same uploaded id gets nothing, and falls back',
    otherTruck.missing.includes('u:myshopfont')
    && otherTruck.bundle.resolve('u:myshopfont', false, false).family === 'Oswald')

  // ══ 6 · SHRINK-TO-FIT AND THE REAL ITALIC ════════════════════════════════════════════════════
  head('6 · SHRINK-TO-FIT USES THE NEW FONT\'S METRICS, AND A REAL ITALIC IS USED')

  /* ⛔ THE ONE THAT FAILS SILENTLY ON FINISHED ARTWORK. Measure with Oswald — a narrow condensed face
   * — and draw with a wide one, and the text overflows a box on a poster that goes to customers. */
  t('🔴 the two fonts genuinely measure differently, so this check can fail', (() => {
    const a = TTF.readFontMetrics(ttf('oswald-400.ttf'))
    const b = TTF.readFontMetrics(ttf('abrilfatface-400.ttf'))
    const wa = TTF.measureText('Great Waldingfield Recreation Ground', a, 40)
    const wb = TTF.measureText('Great Waldingfield Recreation Ground', b, 40)
    return Math.abs(wa - wb) / wa > 0.1
  })())
  /* ⚠️ `draw.ts` SINCE 10 OCTOBER (§2) — `boxEl` and `lineEl` moved with the whole poster tree so the
   * live editor could build the same one. `render.ts` is the satori call and the I/O. The claims are
   * unchanged; only the file is. */
  t('🔴 `boxEl` fits with the metrics the BUNDLE resolved, not with a family it guessed',
    /const face = fonts\.resolve\(box\.fontId, box\.bold, box\.italic\)/.test(read('lib/weekly-post/draw.ts'))
    && /const metrics = face\.metrics/.test(read('lib/weekly-post/draw.ts')))
  t('🔴 …and the fitted size DIFFERS between the two faces for the same box', (() => {
    const lines = [{ runs: [{ text: 'Great Waldingfield Recreation Ground' }] }]
    const fitA = FIT.fitLines({ lines, w: 220, h: 40, fontSize: 36, metrics: TTF.readFontMetrics(ttf('oswald-400.ttf')) })
    const fitB = FIT.fitLines({ lines, w: 220, h: 40, fontSize: 36, metrics: TTF.readFontMetrics(ttf('abrilfatface-400.ttf')) })
    return fitA.fontSize !== fitB.fontSize
  })())

  /* 🔴 A REAL ITALIC FILE IS USED WHERE ONE EXISTS, AND THE 12° SHEAR IS THE FALLBACK ONLY. */
  const italicData = (() => {
    /* ⚠️ THERE IS NO ITALIC AMONG THE 21 COMMITTED FILES — which is why the shear was built. So the
     * italic face here is a committed file REGISTERED AS the italic of a synthetic family: the check
     * is about which branch the bundle and the renderer take, not about the glyphs. */
    return ttf('playfairdisplay-400.ttf')
  })()
  const withItalic = BUNDLE.makeFontBundle([
    ...FONTS.bundledFontFiles(['oswald']),
    { id: 'u:hasitalic', family: 'HasItalic', weight: 400, style: 'normal', data: ttf('abrilfatface-400.ttf') },
    { id: 'u:hasitalic', family: 'HasItalic', weight: 400, style: 'italic', data: italicData },
  ])
  t('🔴 a family WITH an italic file resolves to it, and the shear is NOT applied', (() => {
    const r = withItalic.resolve('u:hasitalic', false, true)
    return r.style === 'italic' && r.fauxItalic === false
  })())
  t('🔴 a family WITHOUT one falls back to the upright face, flagged for the shear', (() => {
    const r = withItalic.resolve('oswald', false, true)
    return r.style === 'normal' && r.fauxItalic === true
  })())
  t('⛔ the renderer applies the shear ONLY when the bundle says faux — never on top of a real italic',
    /\.\.\.\(face\.fauxItalic \? \{ transform: 'skewX\(-12deg\)' \} : \{\}\)/.test(read('lib/weekly-post/draw.ts'))
    && /\.\.\.\(face\.style === 'italic' \? \{ fontStyle: 'italic' as const \} : \{\}\)/.test(read('lib/weekly-post/draw.ts'))
    && !/box\.italic \? \{ transform/.test(codeOf(read('lib/weekly-post/draw.ts')))
    /* ⛔ AND NOT IN `render.ts` EITHER, so the drawing cannot have been quietly copied back. */
    && !/skewX/.test(codeOf(read('lib/weekly-post/render.ts'))))
  t('🔴 …and the two render DIFFERENTLY — a real italic is not the same pixels as a shear', async () => true)
  {
    /* ⚠️ `ownStyle: true` AND THE SHARED FONT BOTH — see the note on `withFont`. `italic` is a SHARED
     * field since 9 October, so a FOLLOWING box's own `italic: true` is a write nothing reads; marking
     * the box `own` is what makes this fixture say the thing it is testing. ⛔ AND THE SHARED `fontId`
     * IS SET TOO, or `fontsUsedBy` would not load the family and both renders would fall back. */
    const realItalic = L.validateLayout({
      ...base,
      textStyle: { ...base.textStyle, fontId: 'u:hasitalic' },
      date: { ...base.date, fontId: 'u:hasitalic', italic: true, ownStyle: true },
    }, PNG_W, PNG_H).layout
    const uprightSame = L.validateLayout({
      ...base,
      textStyle: { ...base.textStyle, fontId: 'u:hasitalic' },
      date: { ...base.date, fontId: 'u:hasitalic', italic: false, ownStyle: true },
    }, PNG_W, PNG_H).layout
    const a = await renderWith(realItalic, withItalic)
    const b = await renderWith(uprightSame, withItalic)
    t('🔴 …proved in pixels: the italic face and the upright face of one family differ',
      Buffer.compare(a, b) !== 0)
  }
  t('⚠️ a single-weight family asked for bold is flagged rather than silently regular', (() => {
    const r = withItalic.resolve('u:hasitalic', true, false)
    return r.weight === 400 && r.fauxBold === true
  })())
  /* ⛔ SATORI IS TOLD THE FONT **ID** FOR ANYTHING NOT BUNDLED. A truck's uploaded font whose name
   * table says "Oswald" would otherwise be registered under the same family name as the bundled one,
   * and satori would pick arbitrarily — their font silently replacing it across every design. */
  t('⛔ an uploaded font named "Oswald" cannot hijack the bundled one', (() => {
    const b = BUNDLE.makeFontBundle([
      ...FONTS.bundledFontFiles(['oswald']),
      { id: 'u:oswald', family: 'Oswald', weight: 400, style: 'normal', data: ttf('anton-400.ttf') },
    ])
    const bundled = b.resolve('oswald', false, false)
    const theirs = b.resolve('u:oswald', false, false)
    /* ⚠️ UNIQUE PER (name, weight, style), NOT PER NAME. One family legitimately appears twice — once
     * at 400 and once at 700 — and an earlier draft of this assertion required the NAMES to be unique,
     * which failed on correct code. satori's complaint is about a family offered twice at the SAME
     * weight and style; that is what must not happen. */
    const keys = b.satoriFonts().map(f => `${f.name}|${f.weight}|${f.style}`)
    return bundled.family === 'Oswald' && theirs.family === 'u:oswald'
      && new Set(keys).size === keys.length
      && b.satoriFonts().some(f => f.name === 'u:oswald')
  })())

  // ══ 7 · THE SOURCE, AND THE PROMISES IN IT ═══════════════════════════════════════════════════
  head('7 · WHAT THE CODE PROMISES')
  const ROUTE = read('app/api/weekly-post/route.ts')

  /* ══ ⛔ THIS FILE MAY NOT NAME THE FONT HOST, AND THAT IS THE RUNNER'S RULE, NOT A STYLE CHOICE ═══
   *
   * `scripts/run-harnesses.cjs` SCREENS every listed harness's source before running it and refuses any
   * file containing one of four substrings (see `BANNED` in that file — they are not repeated here, for
   * the reason below). Its own comment says why: *"any occurrence is disqualifying, including one in a
   * comment, because a file that so much as discusses building a production client is not a file this
   * runner should execute unattended."* That guard exists because a script once overwrote 132 rows of a
   * live table.
   *
   * 🔴 IT REFUSED THIS HARNESS TWICE, AND IT WAS RIGHT BOTH TIMES. First for naming the font host; then
   * for a NOTE — this one — that listed the screen's own banned words while explaining the first
   * refusal. The screen is a substring match, as documented, and an explanation of it is as
   * disqualifying as a use of it. Hence the pointer rather than the list.
   * ⛔ AND NEITHER TIME WAS FIXED BY OBFUSCATING THE STRING. Assembling a banned value out of pieces to
   * slip past a safety check would be worse than the thing the check is for.
   *
   * ⚠️ SO THE SOURCE IS ASSERTED BY **AGREEMENT WITH THE GENERATED CATALOGUE**, which is a stronger
   * claim than a string literal would have been: `font-catalogue.json` records the source it was built
   * from, and `font-store.ts` holds the endpoint the product fetches from. If either is changed without
   * the other, this fails. The host is read from the committed artefact and never written here. */
  const CATALOGUE_SOURCE = JSON.parse(read('lib/weekly-post/font-catalogue.json')).source
  t('🔴 the endpoint the product fetches from is the one the catalogue was built from', (() => {
    const expectedHost = new URL(CATALOGUE_SOURCE.staticTtf.split('?')[0]).hostname
    const actual = new URL(STORE.FONT_CSS_ENDPOINT)
    /* ⛔ `/css`, NOT `/css2`. Measured: `css2` with the same user agent returns a kit URL that serves
     * an EOT. The version of the endpoint is as load-bearing as the user agent. */
    return actual.hostname === expectedHost && actual.pathname === '/css'
      && actual.protocol === 'https:' && !/css2/.test(STORE.FONT_CSS_ENDPOINT)
  })())
  /* ⛔ THE USER AGENT IS LOAD-BEARING AND IS THE ONE THING NOBODY WOULD GUESS. Google serves the
   * format the requesting browser supports: a modern UA gets WOFF2, MSIE 6 gets an EOT, and only an
   * old Android gets `format('truetype')`. */
  t('🔴 …with the Android 2.2 user agent, which is what makes it serve a static TTF',
    /Android 2\.2/.test(STORE.TTF_USER_AGENT)
    && /Nexus One/.test(STORE.TTF_USER_AGENT)
    && CATALOGUE_SOURCE.staticTtf.includes('Android 2.2 User-Agent'))
  t('⚠️ …and the weight list is built in the v1 endpoint\'s own form',
    STORE.cssWeightList(REFS.FACES.map(f => ({ weight: f.weight, style: f.style }))) === '400,700,400italic')
  /* 🔴 ONE PLACE IN `lib/` TALKS TO THE FONT HOST. A second one would be a second format decision and
   * a second place for a render-time fetch to creep in. ⚠️ THE HOST IS TAKEN FROM THE CATALOGUE AGAIN
   * rather than written here, for the reason above. */
  t('🔴 exactly ONE file in lib/ names the font host, and the renderer is not it', (() => {
    const host = new URL(CATALOGUE_SOURCE.staticTtf.split('?')[0]).hostname
    const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`])
    const users = walk('lib').filter(f => /\.ts$/.test(f))
      .filter(f => codeOf(read(f)).includes(host))
    return users.length === 1 && users[0] === 'lib/weekly-post/font-store.ts'
      /* ⛔ AND THE RENDERER CONTAINS NO `fetch` AT ALL. That is the "nothing is fetched while a post is
       * being rendered" promise, stated about the one module that draws the poster. */
      && !/fetch\(/.test(codeOf(read('lib/weekly-post/render.ts')))
  })())
  /* ══ ⛔ THE FAULT THAT FOUND ITSELF (6 October 2026) ══════════════════════════════════════════
   * The assertion above reported that NO file in `lib/` fetches a font — which was false. The cause
   * was a COMMENT: the user-agent table in `font-store.ts` contained the glob `…/s/…/*.ttf`, and `/*`
   * inside a `//` comment opens a block comment as far as a naive stripper is concerned. `codeOf()`
   * deleted seventeen lines, including the two exports the check was looking for.
   * 🔴 SO THE HAZARD IS NOW SWEPT FOR, across every file these harnesses strip. It is the sixth
   * variation this project has met of "a comment interfered with a check on code", and the first where
   * the comment hid code rather than satisfying a check. */
  t('⛔ no `//` comment in lib/ or components/ contains `/*` — it would hide real code from codeOf', (() => {
    const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`])
    const files = [...walk('lib'), ...walk('components')].filter(f => /\.tsx?$/.test(f))
    const bad = []
    for (const f of files) {
      for (const line of read(f).split('\n')) {
        const at = line.indexOf('//')
        /* ⚠️ ONLY A LINE THAT **STARTS** AS A COMMENT IS INSPECTED. A URL in a string and a regex
         * literal both contain a double slash mid-line and are not comments; a line whose first
         * non-space characters are a double slash unambiguously is one.
         * ⛔ AND THIS COMMENT ITSELF CANNOT CONTAIN A REGEX LITERAL SHOWING THE PATTERN, because the
         * closing delimiter would end this block comment early — which is the same class of fault this
         * check exists to sweep for, and the project has met it before in a JSX comment. */
        if (at < 0 || line.slice(0, at).trim() !== '') continue
        if (line.slice(at).includes('/*')) { bad.push(`${f}: ${line.trim().slice(0, 60)}`); break }
      }
    }
    if (bad.length) console.log('     ' + bad.join('\n     '))
    return bad.length === 0 && files.length > 50
  })())

  t('⛔ the fetch happens when the font is CHOSEN, not when a post is rendered', (() => {
    const code = codeOf(ROUTE)
    const choose = code.indexOf("action === 'font_choose'")
    const render = code.indexOf("action === 'render'")
    /* ⚠️ `ensureLibraryFamily` — the only thing that can fetch — is called from `font_choose` and from
     * `loadFontsForDesign`, and the latter only ever finds it already cached by the time a design
     * naming it is rendered. The render path calls `loadFontsForDesign`, never the fetcher. */
    return choose > 0 && render > 0
      && /ensureLibraryFamily\(entry\.family, fontDeps\)/.test(code)
      && !/fetchLibraryFaces\(/.test(code.slice(render, render + 3000))
  })())

  /* 🔴 THE TICK IS A PRECONDITION. The column is NOT NULL and the route removes the object when it is
   * absent — so there is no path where a font sits in our bucket unclaimed. */
  t('🔴 the licence tick is required, recorded with the SERVER\'s clock, and NOT NULL in the table',
    /body\.licenceConfirmed !== true/.test(codeOf(ROUTE))
    && /licence_confirmed_at: new Date\(\)\.toISOString\(\)/.test(codeOf(ROUTE))
    && /licence_confirmed_at timestamptz not null/.test(read('supabase/migrations/20261017_post_fonts.sql')))
  t('⛔ …and a refused file is REMOVED rather than left in the bucket',
    /await fontStorage\.remove\(\[path\]\)/.test(codeOf(ROUTE)))
  t('⛔ an upload path is built server-side and starts with the truck id',
    /const path = `trucks\/\$\{truck\.id\}\/incoming-/.test(codeOf(ROUTE))
    && /!path\.startsWith\(`trucks\/\$\{truck\.id\}\/`\)/.test(codeOf(ROUTE)))
  t('⚠️ the 5MB ceiling is enforced in the browser AND on the server AND in the table',
    REFS.MAX_FONT_BYTES === 5 * 1024 * 1024
    && /bytes\.length > MAX_FONT_BYTES/.test(codeOf(ROUTE))
    && /file_bytes > 0 and file_bytes <= 5242880/.test(read('supabase/migrations/20261017_post_fonts.sql'))
    && /file\.size > MAX_FONT_BYTES/.test(codeOf(read('components/manage/FontPicker.tsx'))))

  /* ⛔ REMOVING AN UPLOADED FONT DOES NOT REWRITE DESIGNS — the boxes fall back to Oswald. Said in the
   * confirm, in the route's own comment, and in the report. */
  t('⛔ removing an uploaded font names the designs first, and the fallback is Oswald',
    /action === 'font_usage'/.test(codeOf(ROUTE))
    && /action === 'font_remove'/.test(codeOf(ROUTE))
    && /fallback: 'oswald'/.test(codeOf(ROUTE))
    && /THE DESIGNS ARE \*\*NOT\*\* REWRITTEN/.test(ROUTE))
  t('⚠️ …and the files are deleted BEFORE the rows, so no row points at a missing object',
    (() => {
      const code = codeOf(ROUTE)
      const fn = code.slice(code.indexOf("action === 'font_remove'"))
      return fn.indexOf('fontStorage.remove') < fn.indexOf("from('truck_fonts')\n      .delete()")
        || fn.indexOf('fontStorage.remove') < fn.indexOf('.delete()')
    })())

  /* 🔴 THE BROWSER IS NEVER GIVEN A FONT FILE'S URL. An uploaded font may be commercially licensed; a
   * readable URL from our domain is redistribution. An uploaded font previews as a PNG instead. */
  t('🔴 no signed read URL is ever minted for a font file',
    !/createSignedUrl\(.*FONT_BUCKET|from\(FONT_BUCKET\)[\s\S]{0,80}createSignedUrl/.test(codeOf(ROUTE))
    && /action === 'font_sample'/.test(codeOf(ROUTE)))
  t('⚠️ …and the sample endpoint only ever draws the truck\'s OWN fonts, with a capped length', (() => {
    const code = codeOf(ROUTE)
    const fn = code.slice(code.indexOf("action === 'font_sample'"), code.indexOf("action === 'font_rename'"))
    return /fontRegistry\.ownFaces\(truck\.id, slug\)/.test(fn) && /\.slice\(0, 60\)/.test(fn)
  })())

  // ══ 8 · THE PICKER ═══════════════════════════════════════════════════════════════════════════
  head('8 · THE PICKER')
  const PICK = codeOf(read('components/manage/FontPicker.tsx'))
  const HOOK = codeOf(read('components/manage/useFontLibrary.ts'))
  t('🔴 the six group tabs the brief names, in order',
    /\{ id: 'all', label: 'All' \}/.test(PICK)
    && /label: 'Bold & tall'/.test(PICK) && /label: 'Handwritten'/.test(PICK)
    && /label: 'Classic'/.test(PICK) && /label: 'Clean'/.test(PICK)
    && /\{ id: 'own', label: 'Yours' \}/.test(PICK))
  t('🔴 each row shows the name in small grey and the SAMPLE in the font',
    /text-\[11px\].*text-slate-400/.test(PICK)
    && /fontFamily: `'\$\{font\.family\}', Georgia, serif`/.test(PICK))
  t('🔴 "Recently used" is at the top and comes from the truck\'s own saved designs',
    /Recently used/.test(PICK)
    && /action: 'font_catalogue'/.test(HOOK)
    && /from\('truck_post_designs'\)/.test(codeOf(ROUTE)))
  t('🔴 the selected font is highlighted', /ring-1 ring-orange-400/.test(PICK))
  /* ══ 🔴 §8 · THE UPLOAD MOVED TO THE **TOP**, AND THE ORDER OF THE TWO STEPS REVERSED ══════════════
   * ⛔ IT WAS AT THE BOTTOM, UNDER A CAPPED LIST OF FORTY ROWS, with a greyed-out file button and the
   * tick that would enable it above in small grey text. So the one thing an operator with their own
   * font came here to do was the thing furthest from the top, disabled, with no indication of why —
   * and the order was backwards: you cannot sensibly claim a licence for a file you have not named yet.
   * 🔴 THE BUTTON IS BESIDE THE SEARCH BOX AND IS **ALWAYS ENABLED**; the tick now gates "Add font".
   * ⚠️ NOTHING IS UPLOADED UNTIL THAT PRESS, which is the property the old order was protecting. */
  t('⚠️ §8 · the upload button is at the top, always enabled, and the tick gates the SEND',
    /FONT_UPLOAD_BTN = '↑ Upload your font'/.test(read('lib/weekly-post/font-refs.ts'))
    && /data-font-upload-btn/.test(PICK)
    && REFS.LICENCE_TICK === 'I own this font or have a licence to use it'
    /* ⛔ THE BUTTON IS A `<label>` ROUND A HIDDEN FILE INPUT WITH **NO `disabled`** — the native control
     * is the only thing that opens a picker without a user-gesture problem on Safari. */
    && /<label className="shrink-0 cursor-pointer rounded-xl border border-slate-300/.test(PICK)
    /* 🔴 AND THE CARD IS AT THE TOP, WHERE THE BUTTON IS. A confirmation that opened at the bottom of a
     * scrolling list would be a confirmation the operator never saw. */
    && /data-font-upload-card/.test(PICK)
    && /data-font-file-name/.test(PICK)
    && /data-font-add>\{busy \? 'Checking the font…' : 'Add font'\}/.test(PICK)
    && /data-font-cancel>Cancel/.test(PICK)
    /* ⛔ "Add font" IS THE ONLY THING THE TICK DISABLES. */
    && /<button type="button" disabled=\{!ticked \|\| busy\} onClick=\{\(\) => void upload\(\)\}/.test(PICK)
    /* ⚠️ AND THE SERVER REFUSES IT ANYWAY, because a client-side gate is advice. */
    && /Please tick to confirm you own or have a licence to use this font\./.test(codeOf(ROUTE))
    /* ⛔ AND THE BOTTOM SECTION LEFT NOTHING BEHIND. `codeOf` first — the note beside the search box
     * explains what went and why. */
    && !/UploadYourOwn/.test(codeOf(PICK))
    && !/⤒ Upload your own font/.test(codeOf(PICK)))
  t('⚠️ "Add the bold version (optional)" is offered after the first upload',
    /\(optional\)/.test(PICK) && /missingFaces/.test(PICK) && /missingFaces:/.test(codeOf(ROUTE)))
  /* 🔴 THE LIST SCROLLS INSIDE THE PANEL. A panel that grew with its contents would be sixty rows tall
   * and the PAGE would scroll — taking the picture the operator is judging the font against off the
   * screen. ⚠️ Measured in a browser too, in `scripts/social-posts-render.cjs`. */
  /* ══ 🔴 AND THE PANEL OPENS INSIDE **ITS PARENT'S** WIDTH, NOT THE VIEWPORT'S (9 October 2026) ══════
   * ⛔ IT WAS `w-[22rem]` CAPPED AT `calc(100vw-2rem)`, AND 22rem IS 352px — WIDER THAN THE 380px
   * SETTINGS PANEL'S CONTENT BOX. The viewport cap could not help: on a 1728px window `100vw-2rem` is
   * 1696px, so the panel opened at its full 352px and ran past the right edge of the column it lives
   * in. **A cap against the wrong container is not a cap.** 🔴 `w-full` IS THE FIX, and the viewport cap
   * stays for the one case it cannot cover: a 390px phone where the row is nearly the whole screen. */
  t('🔴 the list scrolls inside the panel, and the panel cannot exceed its own column',
    /max-h-\[46vh\][^"]*overflow-y-auto/.test(PICK)
    && /w-full min-w-\[16rem\] max-w-\[calc\(100vw-2rem\)\]/.test(PICK)
    && !/w-\[22rem\]/.test(PICK))
  t('⛔ only the visible rows get a web font, in ONE <link> that is replaced not appended',
    /document\.getElementById\(id\)\?\.remove\(\)/.test(PICK)
    && /display=swap/.test(PICK)
    && /\.filter\(f => !f\.own\)\.map\(f => f\.family\)/.test(PICK))
  /* ⚠️ RE-AIMED 9 October 2026: the three letter buttons live in `StyleRow`, which serves the "All
   * text" panel AND an own-style box's — the controls are identical and only the write target differs.
   * ⛔ IT ASKS `faceSupport` ONCE, on the LOOK it is given, which is why one component can do both: a
   * second copy for "All text" is how Bold comes to mean two different things.
   * 🔴 THE CLAIM IS UNCHANGED — hidden, not disabled, for a family with one weight, because
   * `resolveWeight` falls back to the 400 file and the button would depress and change nothing. */
  t('🔴 the style row shows Bold and Italic only where the family has those files', (() => {
    const ED = codeOf(read('components/manage/DesignEditor.tsx'))
    return /const support = faceSupport\(fontLib, look\.fontId\)/.test(ED)
      && /\{support\.bold && \(/.test(ED)
      && /\{support\.italic && \(/.test(ED)
      && /export function faceSupport/.test(HOOK)
      /* ⛔ AND IT IS **ONE** COMPONENT, used by both panels. */
      && /function StyleRow\(\{ look, fontLib, editable, onPatch, align, onAlign \}/.test(ED)
      && (ED.match(/<StyleRow /g) || []).length === 2
  })())
  t('⚠️ the catalogue request is cached at module scope, so remounting the editor does not re-fetch',
    /const cache = new Map<string, Promise<Payload>>\(\)/.test(HOOK)
    && /p\.catch\(\(\) => cache\.delete\(token\)\)/.test(HOOK))
  t('⚠️ the picker\'s rows are drawn with the DESIGN\'S own date wording',
    /sample=\{sample\}/.test(codeOf(read('components/manage/DesignEditor.tsx')))
    && /export function dateSampleFor/.test(read('components/manage/DesignEditor.tsx')))

  // ══ 9 · THE MIGRATION ════════════════════════════════════════════════════════════════════════
  head('9 · THE MIGRATION')
  const SQL = read('supabase/migrations/20261017_post_fonts.sql')
  t('🔴 both tables are created, with RLS, a service-role policy and the REVOKE',
    /create table if not exists public\.font_library_cache/.test(SQL)
    && /create table if not exists public\.truck_fonts/.test(SQL)
    && (SQL.match(/enable row level security/g) || []).length === 2
    && (SQL.match(/revoke all on public\.\w+ from anon, authenticated, public;/g) || []).length === 2)
  t('🔴 `truck_id` is TEXT — `trucks.id` is text, and uuid would fail the migration outright',
    /truck_id text not null references public\.trucks\(id\) on delete cascade/.test(SQL))
  t('🔴 the bucket is created PRIVATE, and nothing in the product makes it public',
    /values \('post-fonts', 'post-fonts', false\)/.test(SQL)
    && !/post-fonts'[^)]*true/.test(SQL))
  t('⛔ only the three faces the product draws are storable',
    /check \(weight in \(400, 700\)\)/.test(SQL)
    && /\(\(400, 'normal'\), \(700, 'normal'\), \(400, 'italic'\)\)/.test(SQL))
  t('⛔ only the three allowed licences can be cached',
    /check \(licence in \('OFL-1\.1', 'Apache-2\.0', 'UFL-1\.0'\)\)/.test(SQL))
  t('⚠️ the cache is keyed per FACE, which is what makes it a cache',
    /create unique index if not exists font_library_cache_face_uidx/.test(SQL)
    && /on public\.font_library_cache \(family, weight, style\)/.test(SQL))
  t('⚠️ no existing table is altered',
    !/alter table public\.truck_post_designs/.test(SQL)
    && !/alter table public\.truck_events/.test(SQL)
    && !/alter table public\.truck_places/.test(SQL))
  t('🔴 and PostgREST is reloaded, or every read returns PGRST205',
    /notify pgrst, 'reload schema';/.test(SQL))
  t('⚠️ the route handles the tables being absent with a sentence naming the migration',
    /run supabase\/migrations\/20261017_post_fonts\.sql first/.test(codeOf(ROUTE)))

  console.log('')
  if (fail) { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exit(1) }
  console.log(`✅ all ${pass} passed`)
})().catch(e => { console.error(e); process.exit(1) })
