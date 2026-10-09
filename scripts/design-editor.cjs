#!/usr/bin/env node
// scripts/design-editor.cjs — THE ONE SHARED DESIGN EDITOR, AND THE NEW DRAWING OPTIONS.
//
//   node scripts/design-editor.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO REAL TRUCK ARTWORK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS, AND IT IS ONE PROMISE ABOVE ALL THE OTHERS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// **A DESIGN SAVED BEFORE 6 OCTOBER 2026 MUST RENDER EXACTLY AS IT DID, UNTIL THE TRUCK CHANGES
// SOMETHING.** Eighteen optional fields arrived in `Layout` and `EventLayout` on that day — shadow,
// outline, band, italic, letter and line spacing, tilt, darken, date and place styles, the long-name
// rule, "Words before" — and every one of them has a default that must draw nothing at all. A default
// that draws something is a poster a truck already approved changing on its own.
//
// 🔴 SO THE CENTRAL CHECK IS A PIXEL COMPARISON: a stored layout from BEFORE the change, rendered
// through the real renderer, against the same design expressed in the new fields at their defaults.
// Byte-identical, or this file fails.
//
// 🔴 AND THE OTHER DIRECTION IS CHECKED TOO, per effect: turning each one ON must CHANGE the picture.
// An option that renders identically whether it is on or off is a setting that does nothing — which is
// a worse failure than one that crashes, because the operator believes it worked.
//
// ⛔ TWO DELIBERATE EXCEPTIONS, BOTH ASKED FOR, BOTH ASSERTED AS CHANGES RATHER THAN HIDDEN:
//   • "Time shows as" is gone. A design saved as "From 5pm" now renders "5pm – 9pm".
//   • Raised ordinals are always on. A design saved with them off now draws a raised suffix.
//
// 🔴 THE ARTWORK IS SYNTHETIC. The brief forbids testing against a live trading truck, so the picture
// here is generated in this file. No real truck's design is involved and none is needed: these are
// checks about what the renderer draws.

const path = require('path')
const fs = require('fs')
const { compile } = require('./_slot-interval-compile.cjs')
const REPO = path.resolve(__dirname, '..')

const LIB = [
  'lib/weekly-post/week.ts', 'lib/weekly-post/format.ts', 'lib/weekly-post/locale.ts',
  'lib/weekly-post/font-refs.ts', 'lib/weekly-post/font-bundle.ts',
  'lib/weekly-post/place-pictures.ts',
  'lib/weekly-post/week-data.ts', 'lib/weekly-post/layout.ts', 'lib/weekly-post/fit.ts',
  'lib/weekly-post/contrast.ts', 'lib/weekly-post/fonts.ts', 'lib/weekly-post/font-list.ts',
  'lib/weekly-post/ttf-metrics.ts', 'lib/weekly-post/caption.ts', 'lib/weekly-post/render.ts',
  'lib/weekly-post/image-info.ts', 'lib/weekly-post/backgrounds.ts',
  'lib/time-utils.ts', 'lib/private-events/resolve.ts',
]

const c = compile(REPO, LIB, 'de')
/* ⚠️ node_modules HAS TO BE REACHABLE FROM THE COMPILE OUTPUT. `render.ts` requires `next/og`, and
 * without this the module fails to LOAD — which every check below would score as a failure for
 * entirely the wrong reason. */
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }
const L = c.req('lib/weekly-post/layout.js')
const R = c.req('lib/weekly-post/render.js')
const D = c.req('lib/weekly-post/week-data.js')
const W = c.req('lib/weekly-post/week.js')

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
/* ⛔ COMMENTS STRIPPED BEFORE ANY SOURCE ASSERTION. This project has shipped the bug twice: a check
 * that reads RAW source is satisfied by a COMMENT quoting the thing being checked, and a tombstone
 * explaining a removal kept a check green for a day after the code had changed. */
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SYNTHETIC ARTWORK
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 HALF LIGHT, HALF DARK, so the readability rule has something real to decide about and so an
// effect drawn in black is visible on one half and an effect drawn in white on the other. A flat grey
// would make "the picture changed" depend on which colour the effect happened to use.

const PNG_W = 540, PNG_H = 675

/** A minimal, valid PNG built by hand — no encoder, no dependency, deterministic. */
function makePng(w, h) {
  const zlib = require('zlib')
  const raw = Buffer.alloc((w * 3 + 1) * h)
  let o = 0
  for (let y = 0; y < h; y++) {
    raw[o++] = 0
    for (let x = 0; x < w; x++) {
      /* ⚠️ A HARD VERTICAL EDGE, not a gradient: the left half is near-white and the right half is
       * near-black, so a box straddling the middle averages to mid-grey and the contrast rule has a
       * genuine decision to make rather than an obvious one. */
      const light = x < w / 2
      raw[o++] = light ? 236 : 18
      raw[o++] = light ? 238 : 20
      raw[o++] = light ? 240 : 24
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

let CRC_TABLE = null
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let cc = n
      for (let k = 0; k < 8; k++) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1
      CRC_TABLE[n] = cc
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return crc ^ -1
}

const URI = 'data:image/png;base64,' + makePng(PNG_W, PNG_H).toString('base64')

/** One week of real-shaped data: a trading day, a stacked day, a cancelled one and a day off. */
function mkWeek(extra = {}) {
  const range = W.weekRange('this', '2026-10-12T12:00:00Z')
  const events = [
    { id: 'e1', event_date: range.days[0], start_time: '17:00', end_time: '21:00', venue_name: 'The Kings Arms', town: 'Lavenham', status: 'confirmed' },
    { id: 'e2', event_date: range.days[2], start_time: '12:00', end_time: '14:00', venue_name: 'Great Waldingfield Recreation Ground', town: 'Great Waldingfield', status: 'confirmed' },
    { id: 'e3', event_date: range.days[4], start_time: '17:00', end_time: '20:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' },
    ...(extra.events ?? []),
  ]
  return D.buildWeekData(range, events, [], { timeStyle: '12h', showCancelled: true, showPrivate: extra.showPrivate === true })
}

const render = (layout, opts = {}) =>
  R.renderWeeklyPost({ layout, week: opts.week ?? mkWeek(), blankDataUri: URI, note: opts.note ?? null, country: opts.country })

const base = () => L.defaultLayout(PNG_W, PNG_H)

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · 🔴 AN OLD DESIGN RENDERS EXACTLY AS IT DID
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · AN OLD DESIGN IS UNCHANGED')
;(async () => {
  /**
   * ══ 🔴 A LAYOUT AS IT WAS **STORED** BEFORE 6 OCTOBER 2026 ═══════════════════════════════════
   *
   * ⛔ IT IS BUILT BY **STRIPPING** THE NEW FIELDS, NOT BY WRITING A JSON FIXTURE BY HAND. A hand-written
   * fixture is a guess at what the column holds; deleting the keys the validator did not used to write
   * — and adding back the two it DID (`bgTrading`, `raisedOrdinals`) — produces the exact shape, and it
   * keeps working when a field is added, because a new field with no default would then be missing
   * here too and the comparison would fail loudly rather than quietly skipping it.
   */
  const OLD_BOX_KEYS = ['italic', 'letterSpacing', 'lineSpacing', 'tilt', 'ifTooLong', 'wordsBefore', 'effects', 'enabled']
  const OLD_TOP_KEYS = ['darken', 'dateStyle', 'placeStyle', 'notes']
  const asStored = (l) => {
    const strip = (b) => {
      const o = { ...b }
      for (const k of OLD_BOX_KEYS) delete o[k]
      return o
    }
    const o = { ...l, heading: strip(l.heading), date: strip(l.date), location: strip(l.location), time: strip(l.time) }
    for (const k of OLD_TOP_KEYS) delete o[k]
    /* ⚠️ THE TWO FIELDS THE OLD VALIDATOR DID WRITE AND THE NEW ONE DOES NOT. `raisedOrdinals: false`
     * is on every box (it was the default) and `bgTrading: null` is on the date box. */
    o.heading.raisedOrdinals = false; o.date.raisedOrdinals = false
    o.location.raisedOrdinals = false; o.time.raisedOrdinals = false
    o.date.bgTrading = null
    return o
  }

  const stored = asStored(base())
  t('⚠️ the "as stored" fixture really is missing the new fields — otherwise this section proves nothing',
    !('effects' in stored.date) && !('darken' in stored) && !('dateStyle' in stored)
    && !('notes' in stored) && stored.date.raisedOrdinals === false)

  const v = L.validateLayout(stored, PNG_W, PNG_H)
  t('🔴 a stored layout from before the change still validates', v.ok === true)
  t('🔴 …and every new field comes back at a no-op default', (() => {
    const l = v.layout
    const fx = l.date.effects
    return l.darken === 0 && l.dateStyle === 'long' && l.placeStyle === 'nameTownBelow'
      && l.notes.length === 0
      && fx.shadow === 'none' && fx.outline === false && fx.band === false
      && l.date.italic === false && l.date.letterSpacing === 0 && l.date.lineSpacing === 100
      && l.date.tilt === 0 && l.date.ifTooLong === 'shrink' && l.date.wordsBefore === ''
      && l.date.enabled === true && l.heading.enabled === true
  })())
  t('⚠️ the design-wide `keepReadable` becomes each box\'s own default, so one answer still covers the poster',
    v.layout.keepReadable === true
    && [v.layout.heading, v.layout.date, v.layout.location, v.layout.time]
      .every(b => b.effects.keepReadable === true))

  /* 🔴 THE PIXEL COMPARISON. This is the check the whole section exists for. */
  const week = mkWeek()
  const a = await render(v.layout, { week })
  const b = await render(base(), { week })
  t('🔴 A STORED DESIGN RENDERS BYTE-IDENTICALLY to the same design built fresh',
    Buffer.compare(a.png, b.png) === 0)

  /* ⚠️ AND THE COMPARISON IS NOT VACUOUS. If the renderer produced the same bytes for every layout —
   * a blank picture, say — the check above would pass whatever happened. One changed field must
   * change the image. */
  const moved = { ...base(), date: { ...base().date, x: base().date.x + 40 } }
  const cMoved = await render(moved, { week })
  t('⚠️ …and the comparison can fail: moving one box changes the bytes',
    Buffer.compare(b.png, cMoved.png) !== 0)

  /* ══ ⛔ THE OLD `bgTrading` BECOMES THE BAND, AT THE SAME LOOK ════════════════════════════════ */
  const withPanel = asStored(base())
  withPanel.date.bgTrading = '#ff0000'
  const vp = L.validateLayout(withPanel, PNG_W, PNG_H)
  t('⛔ an old "Background behind the date" colour arrives as the BAND, switched on', (() => {
    const fx = vp.layout?.date.effects
    return !!fx && fx.band === true && fx.bandColour === '#ff0000'
      && fx.bandOpacity === 100 && fx.bandRadius === 0 && fx.bandPadding === 0
  })())
  /* 🔴 AND AT THE SAME LOOK MEANS THE SAME PIXELS. Fully opaque, square corners and no padding is
   * exactly what the old code drew — a rectangle filling the box — so the band must reproduce it. */
  const bandEquivalent = { ...base() }
  bandEquivalent.date = { ...bandEquivalent.date, effects: { ...bandEquivalent.date.effects, band: true, bandColour: '#ff0000' } }
  const pa = await render(vp.layout, { week })
  const pb = await render(bandEquivalent, { week })
  t('🔴 …and it draws the same pixels the old panel drew', Buffer.compare(pa.png, pb.png) === 0)
  t('⚠️ a design already saved by the NEW editor keeps its own band — the legacy field is not re-read', (() => {
    const both = { ...vp.layout }
    both.date = { ...both.date, bgTrading: '#00ff00', effects: { ...both.date.effects, band: false } }
    const r = L.validateLayout(both, PNG_W, PNG_H)
    return r.ok && r.layout.date.effects.band === false
  })())

  // ══ 2 · ONE CHECK PER NEW EFFECT ════════════════════════════════════════════════════════════
  head('2 · EVERY NEW OPTION ACTUALLY DRAWS SOMETHING')
  /**
   * ⛔ AN OPTION THAT RENDERS IDENTICALLY WHETHER IT IS ON OR OFF IS WORSE THAN ONE THAT CRASHES,
   * because the operator believes it worked and posts the result. Each case below renders the SAME
   * design twice — once plain, once with one field changed — and requires the bytes to differ.
   *
   * ⚠️ THE FIELD IS CHANGED ON THE **DATE** BOX AND THE DATE BOX IS DRAWN SEVEN TIMES (one per row),
   * so every one of these has plenty of pixels to differ in. A field changed on a box that happened to
   * be empty would produce no difference and the check would fail for the wrong reason.
   */
  const plain = base()
  const plainPng = (await render(plain, { week })).png

  const variants = [
    ['Shadow · Soft', l => ({ ...l, date: { ...l.date, effects: { ...l.date.effects, shadow: 'soft' } } })],
    ['Shadow · Strong', l => ({ ...l, date: { ...l.date, effects: { ...l.date.effects, shadow: 'strong' } } })],
    ['Outline', l => ({ ...l, date: { ...l.date, effects: { ...l.date.effects, outline: true, outlineColour: '#ff00ff' } } })],
    ['Band', l => ({ ...l, date: { ...l.date, effects: { ...l.date.effects, band: true, bandColour: '#ff0000' } } })],
    ['Band · see-through', l => ({ ...l, date: { ...l.date, effects: { ...l.date.effects, band: true, bandColour: '#ff0000', bandOpacity: 40 } } })],
    ['Band · corners', l => ({ ...l, date: { ...l.date, effects: { ...l.date.effects, band: true, bandColour: '#ff0000', bandRadius: 14 } } })],
    ['Band · space around', l => ({ ...l, date: { ...l.date, effects: { ...l.date.effects, band: true, bandColour: '#ff0000', bandPadding: 6 } } })],
    ['Italic', l => ({ ...l, date: { ...l.date, italic: true } })],
    ['Letter spacing', l => ({ ...l, date: { ...l.date, letterSpacing: 3 } })],
    ['Line spacing', l => ({ ...l, date: { ...l.date, lineSpacing: 160 } })],
    ['Tilt', l => ({ ...l, date: { ...l.date, tilt: -8 } })],
    ['Words before', l => ({ ...l, date: { ...l.date, wordsBefore: 'Find us' } })],
    ['If it doesn’t fit · two lines', l => ({ ...l, location: { ...l.location, ifTooLong: 'twoLines' } })],
    ['Darken the picture', l => ({ ...l, darken: 40 })],
    ['Date style · short', l => ({ ...l, dateStyle: 'short' })],
    ['Date style · numeric', l => ({ ...l, dateStyle: 'numeric' })],
    ['Place style · name, town', l => ({ ...l, placeStyle: 'nameTown' })],
    ['Place style · name only', l => ({ ...l, placeStyle: 'nameOnly' })],
    ['Day on its own line', l => ({ ...l, date: { ...l.date, twoLines: !l.date.twoLines } })],
    ['An item switched off', l => ({ ...l, heading: { ...l.heading, enabled: false } })],
  ]
  /**
   * ══ 🔴 THE LOOK VARIANTS MUST MARK THE BOX `ownStyle` — AND THE HARNESS IS WHAT SAID SO ═══════════
   *
   * ⛔ NINE OF THESE STOPPED BEING DETECTABLE ON 9 OCTOBER 2026: every shadow, outline and band case,
   * plus Italic and Letter spacing. "All text" arrived the same day — a shared look held on the layout,
   * which every box FOLLOWS unless it owns its own — so `resolveTextBox` was replacing each variant's
   * carefully-set `effects` / `italic` / `letterSpacing` with the shared look's, and the two renders
   * came out identical. **A variant that cannot change the picture cannot be caught.**
   *
   * 🔴 THIS IS NOT A WORKAROUND. It is these fixtures telling the truth about what they test: a box
   * with a band the shared style does not have IS a box with its own style, and setting a look field on
   * a FOLLOWING box is now a write nothing reads. ⚠️ WHICH IS ALSO THE REAL LESSON FOR THE PRODUCT, and
   * it is why the settings panel does not draw a following box's font and colour at all.
   *
   * ⚠️ IT IS APPLIED BY **FIELD**, not to every variant. `tilt`, `lineSpacing`, `wordsBefore`,
   * `twoLines`, `ifTooLong` and `enabled` are PER BOX for ever, so marking their boxes `own` would be
   * saying something false about what they are testing — and would hide a regression in the exact place
   * this split is most likely to produce one.
   */
  const LOOK_FIELDS = new Set(['effects', 'italic', 'letterSpacing', 'bold', 'caps', 'color', 'fontId'])
  /** Mark every box whose LOOK this variant changed as owning its style. */
  const ownWhereLookChanged = (before, after) => {
    const out = { ...after }
    for (const key of ['heading', 'date', 'location', 'time']) {
      const a = before[key], b = after[key]
      if (!a || !b) continue
      const changed = [...LOOK_FIELDS].some(f => JSON.stringify(a[f]) !== JSON.stringify(b[f]))
      if (changed) out[key] = { ...b, ownStyle: true }
    }
    return out
  }
  for (const [name, mut] of variants) {
    const l = L.validateLayout(ownWhereLookChanged(plain, mut(plain)), PNG_W, PNG_H)
    if (!l.ok) { t(`🔴 ${name}: the layout validates`, false); continue }
    let png = null
    try { png = (await render(l.layout, { week })).png } catch { /* reported below */ }
    t(`🔴 ${name}: renders, and the picture CHANGES`, !!png && Buffer.compare(png, plainPng) !== 0)
  }

  /* ⚠️ A TILT OUTSIDE ±15° IS REFUSED RATHER THAN CLAMPED-AND-DRAWN, because a box rotated 40° leaves
   * its own outline and the editor's drag handles would no longer be over the text they move. */
  t('⚠️ the new numeric fields are bounded, not trusted', (() => {
    const bad = L.validateLayout({ ...plain, date: { ...plain.date, tilt: 90, lineSpacing: 9000, letterSpacing: 1e9 } }, PNG_W, PNG_H)
    return bad.ok && bad.layout.date.tilt === 0 && bad.layout.date.lineSpacing === 100
      && bad.layout.date.letterSpacing === 0
  })())
  t('⛔ a NaN in a new field is refused rather than reaching satori as a silently undrawn element', (() => {
    const bad = L.validateLayout({ ...plain, darken: NaN, date: { ...plain.date, tilt: Infinity } }, PNG_W, PNG_H)
    return bad.ok && bad.layout.darken === 0 && bad.layout.date.tilt === 0
  })())
  t('⚠️ "Darken the picture" is capped at the brief\'s 60%, so a design cannot become a black rectangle',
    L.validateLayout({ ...plain, darken: 100 }, PNG_W, PNG_H).layout.darken === 0
    && L.validateLayout({ ...plain, darken: 60 }, PNG_W, PNG_H).layout.darken === 60)

  // ══ 3 · THE TWO DELIBERATE BREAKS ═══════════════════════════════════════════════════════════
  head('3 · THE TWO DELIBERATE BREAKS, ASSERTED AS CHANGES')
  /* ⛔ THESE ARE THE ONLY TWO PLACES A POSTER A TRUCK HAS ALREADY APPROVED CHANGES WITHOUT THEM
   * TOUCHING IT. Both were asked for; both are in docs/design-editor-report.md. Asserting them here
   * means they cannot be reintroduced by accident, and cannot be forgotten either. */
  t('⛔ BREAK 1 · a single-event design saved as "From 5pm" now renders the range', (() => {
    const e = L.defaultEventLayout(PNG_W, PNG_H)
    const r = L.validateEventLayout({ ...e, timeDisplay: 'from' }, PNG_W, PNG_H)
    return r.ok && !('timeDisplay' in r.layout)
  })())
  t('⛔ BREAK 2 · raised ordinals are always on — a box saved with them off now draws a raised suffix', (() => {
    const stripped = asStored(base())
    const r = L.validateLayout(stripped, PNG_W, PNG_H)
    /* ⚠️ THE FIELD IS GONE FROM THE STORED SHAPE, which is what makes it unconditional: there is no
     * value left for the renderer to honour. The renderer's own `caseOf` passes `true`. */
    return r.ok && !('raisedOrdinals' in r.layout.date)
      /* ⚠️ `draw.ts`, NOT `render.ts` — 10 OCTOBER 2026 (§2). `caseOf` moved with the rest of the
       * drawing when the poster tree left the renderer so the live editor could build the same one.
       * The constant and its reason are unchanged; only the file is. */
      && /raisedOrdinals: true/.test(codeOf(read('lib/weekly-post/draw.ts')))
  })())
  /* ⚠️ THE CHECK IS "NO CONTROL", NOT "NO MENTION". The editor still PASSES `raisedOrdinals: false` to
   * the formatter that builds the grey sample beside "Date" — a sample is a plain string and cannot
   * draw a superscript, so that is the correct value there and must not be mistaken for a setting. A
   * bare `!/raisedOrdinals/` failed on exactly that line, which would have had me delete a correct
   * call to satisfy a harness. */
  t('⛔ …and neither setting can be CHANGED from the editor any more', (() => {
    const src = codeOf(read('components/manage/DesignEditor.tsx'))
    return !/timeDisplay/.test(src)
      && !/raisedOrdinals:\s*(true|v|!)/.test(src)
      && !/patchSel\(\{ raisedOrdinals/.test(src)
      && !/patchEffects\(\{ raisedOrdinals/.test(src)
      // ⚠️ and the only mention left is the sample formatter's argument
      && (src.match(/raisedOrdinals/g) || []).length === 1
  })())

  // ══ 4 · PRIVATE EVENTS ══════════════════════════════════════════════════════════════════════
  head('4 · PRIVATE EVENTS ON THE WEEKLY POST')
  const priv = {
    id: 'p1', event_date: W.weekRange('this', '2026-10-12T12:00:00Z').days[1],
    start_time: '18:00', end_time: '23:00',
    venue_name: 'Hartest Village Hall', town: 'Hartest', status: 'confirmed', is_private: true,
  }
  const off = mkWeek({ events: [priv] })
  const on = mkWeek({ events: [priv], showPrivate: true })
  t('🔴 OFF BY DEFAULT: a private event is not in the week at all', (() => {
    const ids = off.days.flatMap(d => d.entries.map(e => e.eventId))
    return !ids.includes('p1') && off.included.every(e => e.id !== 'p1')
  })())
  t('🔴 ON: it takes its place in the week, with its date and its times', (() => {
    const day = on.days.find(d => d.entries.some(e => e.eventId === 'p1'))
    const row = day?.entries.find(e => e.eventId === 'p1')
    return !!row && row.time === '6pm – 11pm' && day.date === priv.event_date
  })())
  /* ⛔ THE RULE THAT MATTERS, AND IT IS ASSERTED AS AN ABSENCE **BESIDE** A POSITIVE CLAIM. A check
   * that only said "the row does not contain Hartest" would pass if the row did not exist at all —
   * which is the OFF case, and would make this check meaningless in the ON case it is written for. */
  t('⛔ …and the row NEVER carries the venue, the town or anything else about the place', (() => {
    const row = on.days.flatMap(d => d.entries).find(e => e.eventId === 'p1')
    if (!row) return false
    const all = JSON.stringify(row)
    return row.name === 'Private event' && row.town === null && row.placeId === null
      && !/Hartest/i.test(all)
  })())
  t('⚠️ a private event that is ALSO cancelled is left out for being private, not kept for being cancelled', (() => {
    const w = mkWeek({ events: [{ ...priv, status: 'cancelled' }] })
    return w.days.flatMap(d => d.entries).every(e => e.eventId !== 'p1')
  })())
  /* 🔴 AND THE DECISION IS ON THE SERVER. A browser-side filter could not have affected the PNG at
   * all, because the renderer runs server-side — so the flag has to reach `buildWeekData`. */
  const ROUTE = codeOf(read('app/api/weekly-post/route.ts'))
  t('🔴 THE SERVER DECIDES: the flag is read once, strictly, and reaches every week it builds',
    /const showPrivate = body\.showPrivate === true/.test(ROUTE)
    && (ROUTE.match(/showPrivate,/g) || []).length >= 3
    && /if \(ev\.is_private === true && opts\.showPrivate !== true\) continue/.test(codeOf(read('lib/weekly-post/week-data.ts'))))
  t('⛔ …and `=== true`, so a truthy string from a hand-made payload cannot publish a booking', (() => {
    const w = W.weekRange('this', '2026-10-12T12:00:00Z')
    const built = D.buildWeekData(w, [priv], [], { timeStyle: '12h', showCancelled: true, showPrivate: 'yes' })
    return built.days.flatMap(d => d.entries).every(e => e.eventId !== 'p1')
  })())
  const MAKE = codeOf(read('components/manage/WeeklyPost.tsx'))
  t('🔴 the make screen has the toggle, off by default, next to "Show cancelled events"',
    /Show private events/.test(MAKE)
    && /useState\(false\)/.test(MAKE.slice(MAKE.indexOf('const [showPrivate'), MAKE.indexOf('const [showPrivate') + 200))
    && MAKE.indexOf('Show cancelled events') < MAKE.indexOf('Show private events')
    // ⚠️ and it is sent with BOTH requests, so the picture and the caption agree
    && /renderPng\(token, \{ week, excluded, note, layout, showPrivate \}\)/.test(MAKE)
    && /action: 'captions', week, excluded, note, showPrivate/.test(MAKE))

  // ══ 5 · THE EDITOR'S SHAPE, AS SOURCE ═══════════════════════════════════════════════════════
  head('5 · ONE EDITOR, TWO COLUMNS, ONE PANEL, A FITTED POSTER')
  const ED = codeOf(read('components/manage/DesignEditor.tsx'))
  const EDCOPY = read('lib/copy/socialPosts.ts')
  const BITS = codeOf(read('components/manage/DesignEditorBits.tsx'))
  /* 🔴 `DraggableBox` IS ITS OWN FILE and §4's outline, label, guide and preview claims all live in it.
   * ⚠️ `codeOf` first, because the tombstones there name the treatment that went. */
  const BITS_BOX = codeOf(read('components/manage/DraggableBox.tsx'))
  /* ══ 🔴 THE SECTION HEADING HAS NOW INVERTED **TWICE** IN TWO DAYS, AND BOTH ARE RECORDED ═══════════
   *   • 7 Oct: "ONE EDITOR, NO RIGHT-HAND COLUMN" — a 250px list, the poster, and a wrapping toolbar
   *     above it with two pop-ups on the end.
   *   • 9 Oct (morning): "THREE COLUMNS, NO POP-UPS" — the list, the poster, and a 320px settings
   *     column. The pop-ups went because **a pop-up covers the thing it changes**.
   *   • 9 Oct (later): **TWO columns.** The list moved INSIDE the panel.
   * ⛔ WHY THE THIRD SHAPE: the list on the far left and the settings on the far right were the two
   * halves of ONE job with the poster between them, so picking a box and changing it was a 1,000px
   * round trip — and on a 16-inch window the poster was still only getting the middle third.
   * 🔴 WHAT THE LIST LOST IS NAMED HERE RATHER THAN HIDDEN: its live grey samples ("Date · Wednesday
   * 14th October"). Two across has room for a name, a switch and a badge, not for a sample. What
   * replaces them is a poster big enough to read. */
  /* ══ ⚠️ REWRITTEN 10 OCTOBER 2026, BECAUSE THE PHONE EDITOR CHANGED THE CLASS LIST ════════════════
   * ⛔ IT USED TO MATCH `grid-cols-1 min-[1100px]:grid-cols-[…]` AS ONE ADJACENT STRING, which broke the
   * moment the element gained the phone's `flex`/`grow`/`md:grid` classes between them — while the claim
   * it was making was still perfectly true. 🔴 SO IT READS THE ELEMENT'S CLASS LIST AS **TOKENS** now.
   * ⚠️ `grid-cols-1` MUST BE UNPREFIXED, and that is the sharpest clause here: Tailwind compiles the
   * `md:` block AFTER the `min-[1100px]:` one, so a `md:`-prefixed column count would match at 1100 and
   * WIN, dropping the settings panel below the poster at every desktop size. It did exactly that, and
   * `scripts/phone-editor.cjs` caught it by measuring the element at 768, 1100 and 1728. */
  const gridCls = (ED.match(/className="([^"]*)"\s*\n\s*data-editor-grid>/) || [])[1] || ''
  const gridTok = new Set(gridCls.split(/\s+/).filter(Boolean))
  t('🔴 two columns from 1100px, one below — and never `lg`',
    gridTok.has('grid-cols-1')
    && gridTok.has('min-[1100px]:grid-cols-[minmax(0,1fr)_380px]')
    && !/\blg:grid-cols/.test(ED)
    /* ⛔ AND THE PANEL IS STICKY **ABOVE THE BREAKPOINT ONLY**. Below it the panel is under the poster,
     * where there is nothing above it to stay level with — a `sticky` there would pin it to the top of
     * a scroll container it fills, which is a no-op at best. */
    && /min-\[1100px\]:sticky min-\[1100px\]:top-4 min-\[1100px\]:max-h-\[calc\(100vh-2rem\)\] min-\[1100px\]:overflow-y-auto/.test(ED)
    /* ⚠️ `items-start`, SO THE PANEL DOES NOT STRETCH to the poster's height and leave a tall empty
     * card under MORE OPTIONS. ⛔ `md:` NOW, because below the breakpoint the same element is the phone
     * shell's flex column and its one child must stretch to the full width. */
    && gridTok.has('gap-4') && gridTok.has('md:items-start'))

  /* ⛔ THE TOOLBAR AND BOTH POP-UPS ARE STILL GONE. `codeOf` first — the tombstone where `Toolbar` was
   * names it, the Popovers and every reason they went. */
  t('⛔ the toolbar and the two pop-ups are gone, and nothing opens a Popover',
    !/<Toolbar/.test(ED)
    && !/function Toolbar\(/.test(ED)
    && !/<Popover/.test(ED)
    && !/✦ Effects ▾/.test(ED) && !/Advanced ▾/.test(ED)
    /* ⚠️ `Popover` IS STILL A SHARED PRIMITIVE WITH OTHER CALLERS — the import went, the component did
     * not. Asserted so "we deleted the pop-ups" cannot be read as "we deleted the component". */
    && /export function Popover/.test(read('components/manage/DesignEditorBits.tsx')))

  /* ══ 🔴 THE PANEL IS ONE ELEMENT IN ONE PLACE NOW ════════════════════════════════════════════════
   * ⚠️ IT WAS BUILT ONCE AND RENDERED **TWICE** — a sticky third column above 1100 and a copy under the
   * preview below it — because the ITEM LIST was a separate column that stayed put at both widths. With
   * the list inside the panel there is one element, and the breakpoint moves the whole panel. */
  t('🔴 the settings panel is one element in one place',
    /const settingsPanel = \(/.test(ED)
    && (ED.match(/\{settingsPanel\}/g) || []).length === 1
    /* ⛔ AND THE TWO OLD WRAPPERS ARE GONE, so "one place" is not a count that happens to be right. */
    && !/min-\[1100px\]:hidden mt-3">\{settingsPanel\}/.test(ED)
    && !/hidden min-\[1100px\]:block sticky/.test(ED))

  /* ══ 🔴 THE ITEM GRID — TWO ACROSS, AT THE TOP OF THE PANEL, WITH "All text" LEADING ════════════════
   * ⚠️ ONE HEADING, ONE LIST, and a grey "click to edit" beside it: the buttons look like labels, and a
   * label is not obviously a control. */
  t('🔴 the item list is two across at the top of the panel, under one heading',
    /EDITOR_LEFT_TITLE = 'ON YOUR POST'/.test(EDCOPY)
    && /EDITOR_CLICK_TO_EDIT = 'click to edit'/.test(EDCOPY)
    && /data-item-grid>/.test(ED)
    && /\{itemGrid\}/.test(ED)
    /* 🔴 `grid-cols-2`, NOT A WRAPPING FLEX — the second column lines up down the panel instead of
     * starting wherever the longest name on the row above ended. */
    && /<div className="mt-1\.5 grid grid-cols-2 gap-1\.5">/.test(ED)
    && !/On your weekly post/.test(ED) && !/Text on your post/.test(ED)
    && /Each row/.test(ED))

  /* ══ 🔴 §4 (10 October 2026) · "Aa  Style all the writing", WITH ITS OWN SECOND LINE ══════════════
   * ⛔ IT READ "Aa  All text · change all the writing at once" — a NAME, a middot and an EXPLANATION on
   * one line, which at this width truncated to "Aa All text · change all the…". The half that said what
   * the button DOES was the half that got cut. ⚠️ THE NAME IS THE INSTRUCTION NOW and the explanation
   * is a grey line of its own underneath. */
  t('🔴 §4 · "Style all the writing" leads the grid, full width, with its own second line',
    /export const ALL_TEXT_KEY = 'all-text'/.test(ED)
    && /ALL_TEXT_ITEM = 'Style all the writing'/.test(EDCOPY)
    && /ALL_TEXT_SAMPLE = 'Font, colour and effects for everything'/.test(EDCOPY)
    && /\{itemBtn\(ALL_TEXT_KEY, `Aa  \$\{ALL_TEXT_ITEM\}`, null, ALL_TEXT_SAMPLE\)\}/.test(ED)
    /* 🔴 THE SECOND LINE IS A LINE, NOT A SUFFIX — `data-item-sub`, on its own row, truncating on its
     * own. ⛔ A middot AND A SPAN ON THE SAME LINE IS WHAT IT REPLACED. */
    && /data-item-sub>\{subLabel\}/.test(ED)
    && !/· \{ALL_TEXT_SAMPLE\}/.test(ED)
    /* ⚠️ AND IT IS **ABOVE** THE TWO-ACROSS GRID in document order, which is what "first" means. */
    && ED.indexOf('{itemBtn(ALL_TEXT_KEY,') < ED.indexOf('grid grid-cols-2 gap-1.5'))

  /* ══ 🔴 §4 · EVERY BUTTON IN THE GRID CARRIES A › ══════════════════════════════════════════════════
   * ⛔ THEY LOOKED LIKE TOGGLES — a bordered rectangle with a word in it, beside a real on/off switch —
   * so the one thing the grid did not say is that pressing one OPENS something. */
  t('🔴 §4 · every item button carries a › so it reads as "this opens settings"',
    /data-item-chevron aria-hidden="true"/.test(ED)
    && /›<\/span>/.test(ED)
    /* ⚠️ ON THE **SHARED** BUILDER, so a button added later cannot be the one without it. */
    && /const itemBtn = \(key: ItemKey, label: string, extra\?: React\.ReactNode, subLabel\?: string\)/.test(ED))

  /* ══ 🔴 EVERY TEXT BOX SAYS WHICH WAY IT IS WIRED, FROM THE GRID — §3, 9 October 2026 ════════════
   * ⛔ THE "own" BADGE ALONE WAS HALF AN ANSWER. A box with no badge was either FOLLOWING All text or
   * not a text box at all, and the operator could not tell which without selecting it.
   * 🔴 SO A FOLLOWING TEXT BOX CARRIES A 🔗 and an own-style one keeps its badge — and the grid's
   * heading line says what the 🔗 means, which is the one fact here an operator cannot work out.
   * ⚠️ THE PICTURE AND THE ROW SPACING GET NEITHER, which is correct: `boxAt` returns null for both,
   * they have no text, and "All text" has nothing to say about them. */
  t('🔴 a following box shows 🔗, an own-style box shows "own", and the legend explains it',
    /border-orange-400 bg-orange-50/.test(ED)
    && /OWN_BADGE = 'own'/.test(EDCOPY)
    && /data-own-badge>\{OWN_BADGE\}/.test(ED)
    && /FOLLOW_GLYPH = '🔗'/.test(EDCOPY)
    && /data-follow-glyph title=\{STYLE_MATCH\}>\{FOLLOW_GLYPH\}/.test(ED)
    /* ⛔ THE THREE-WAY BRANCH, IN ORDER: no box at all ⇒ nothing, own ⇒ badge, otherwise ⇒ 🔗. */
    && /!b \? null\s*\n\s*: b\.ownStyle/.test(ED)
    /* ══ 🔴 §B9 (10 October 2026) · THE HEADING SAYS WHAT TO DO, NOT WHAT A GLYPH MEANS ═════════════
     * ⛔ THE 🔗 LEGEND HELD THAT SLOT FOR ONE ROUND. On the weekly grid the glyph now appears on
     * NOTHING — the four text boxes it marked are inside "The 7 days" — so the legend explained a
     * symbol that is not on screen. ⚠️ THE GLYPH ITSELF SURVIVES on the single event design's buttons,
     * with its meaning in the button's `title`. */
    && /EDITOR_CLICK_ONE = 'click one to change it'/.test(EDCOPY)
    && /data-click-one>\{EDITOR_CLICK_ONE\}/.test(ED)
    && !/data-link-legend/.test(ED)
    && !/\{EDITOR_CLICK_TO_EDIT\}/.test(ED))

  /* 🔴 Background picture IS THE LAST ROW, under a divider, and "+ Add your own text" is a full-width
   * dashed button above it. ⛔ THE BACKGROUND HAD A CARD OF ITS OWN BELOW THE LIST, which made it the
   * one thing you could change without selecting it — and the one item whose settings were not in the
   * settings panel. */
  t('🔴 §3 · the background is a SECTION at the foot of every panel, and nothing selects it',
    /export const BACKGROUND_KEY = 'background'/.test(ED)
    /* ⛔ NO BUTTON IN THE GRID — that went on 9 October, and the claim is kept because a button is the
     * obvious thing to add back. */
    && !/itemBtn\(BACKGROUND_KEY/.test(ED)
    /* ══ 🔴 §3 (10 October 2026) · AND NO LONGER A **SELECTION** EITHER ═══════════════════════════════
     * ⛔ FOR ONE ROUND A PRESS ON A BLANK PART OF THE POSTER SELECTED IT — which meant a press on the
     * artwork CLOSED whatever panel was open, including "Style all the writing" and a half-scrolled
     * font list. The surface this screen is built around touching was the one that lost your place.
     * 🔴 THE SECTION IS AT THE FOOT OF `shell`, so it is on EVERY panel, in the same place, folded. */
    && !/onPointerDown=\{\(\) => editable && setSelected\(BACKGROUND_KEY\)\}/.test(ED)
    && !/if \(selected === BACKGROUND_KEY\)/.test(ED)
    && /BACKGROUND_SECTION = '🖼 BACKGROUND PICTURE'/.test(EDCOPY)
    && /BACKGROUND_SUMMARY = 'Replace picture · Darken the picture · size advice'/.test(EDCOPY)
    && /data-background-section>/.test(ED)
    && /<Section title=\{BACKGROUND_SECTION\} summary=\{BACKGROUND_SUMMARY\}/.test(ED)
    /* ⚠️ FOLDED BY DEFAULT, and the flag lives with the other two section flags so opening it survives
     * selecting a different box. */
    && /const \[bgOpen, setBgOpen\] = useState\(false\)/.test(ED)
    /* ⛔ AND IT IS INSIDE `shell`, which every branch returns through — a section added to one branch
     * would be a section three panels do not have. */
    && (() => {
      const shell = ED.slice(ED.indexOf('const shell = (body: React.ReactNode'), ED.indexOf('if (selected === ALL_TEXT_KEY)'))
      return /data-background-section/.test(shell)
    })()
    /* ⚠️ "All text" IS NOW THE ONLY KEY WITH NO BOX, so the fallback rule names one. */
    && /const selectableWithoutBox = chosen === ALL_TEXT_KEY$/m.test(ED))

  /* ══ 🔴 THE COMPACT SETTINGS ROWS — LABEL LEFT, CONTROLS RIGHT, PAIRS SHARING A LINE ═══════════════
   * ⛔ THE LABEL WAS **ABOVE** ITS CONTROLS, which is two lines per setting; eight settings is sixteen
   * lines, and on a 16-inch window the brief requires everything but an opened MORE OPTIONS to fit with
   * no page scroll. The stacked form was the single biggest consumer of the height that needed.
   * 🔴 `78px` IS A FIXED COLUMN so the labels line up down the panel. */
  t('🔴 every setting is label-left at 78px, with controls on the right',
    /<div className="flex items-center gap-2" data-field=\{label\}>/.test(ED)
    && /w-\[78px\] shrink-0 text-\[10px\] font-bold uppercase leading-tight tracking-wide text-slate-400/.test(ED)
    /* ⚠️ THE PAIRS THE BRIEF NAMES: Font with the Size stepper, and Style with Line up. */
    && /<Field label="Font">\s*\n\s*<div className="flex items-center gap-1\.5">/.test(ED)
    && /<StyleRow look=\{shown\} fontLib=\{fontLib\} editable=\{editable\}\s*\n\s*onPatch=\{patchSel\} align=\{sel\.align\} onAlign/.test(ED)
    && /\{LABEL_LINE_UP\}<\/span>\s*\n\s*<AlignButtons align=\{align\}/.test(ED))

  /* ══ 🔴 §C (10 October 2026) · "Shows" WAS FOUR QUESTIONS WEARING ONE LABEL ═══════════════════════
   * ⛔ IT SAT OVER A DATE FORMAT, A PLACE FORMAT, A CLOCK AND A FREE-TEXT BOX. The word told an operator
   * that the control did something and nothing about what. ⚠️ EACH IS ASKED IN FULL NOW — and the date's
   * dropdown, which shows today's answer when it is closed, names the OTHER choices underneath.
   * 🔴 THE ITEM'S OWN SETTING STILL **LEADS**, because what an item says is the question an operator
   * asks before how it looks. */
  t('🔴 §C · the item\'s own setting is asked in plain words, and it still leads', (() => {
    const body = ED.slice(ED.indexOf('const showsRow = ('), ED.indexOf('function StyleRow'))
    return /LABEL_DATE_STYLE = 'How the date is written'/.test(EDCOPY)
      && /LABEL_TIME_STYLE = 'How the times are written'/.test(EDCOPY)
      && /LABEL_PLACE_STYLE = 'How the place is written'/.test(EDCOPY)
      && /LABEL_HEADING_TEXT = 'What the heading says'/.test(EDCOPY)
      && /LABEL_OWN_TEXT = 'What it says'/.test(EDCOPY)
      && /<Field label=\{LABEL_DATE_STYLE\}>/.test(body)
      && /<Field label=\{LABEL_TIME_STYLE\}>/.test(body)
      && /<Field label=\{LABEL_PLACE_STYLE\}>/.test(body)
      && /<Field label=\{LABEL_HEADING_TEXT\}>/.test(body)
      && /<Field label=\{LABEL_OWN_TEXT\}>/.test(body)
      /* ⛔ AND THE OLD WORD IS GONE FROM THE WHOLE FILE, so this cannot pass while "Shows" is still
       * drawn somewhere else. */
      && !/label="Shows"/.test(ED)
      && body.indexOf('<Field label={LABEL_DATE_STYLE}>') < body.indexOf('<Field label="Font">')
      /* ⚠️ THE DATE'S "Other choices: …" NAMES WHAT THE CLOSED DROPDOWN CANNOT SHOW. */
      && /OTHER_CHOICES = \(samples: readonly string\[\]\): string =>/.test(EDCOPY)
      && /data-other-choices>/.test(body)
      && /otherDateChoices = spec\.dateStyles\.filter\(d => d\.id !== layout\.dateStyle\)/.test(ED)
  })())

  /* ⚠️ EVERY CONTROL THE TOOLBAR HAD IS STILL REACHABLE — the three style buttons, the alignment icons,
   * the font picker, the size stepper and the colour field. ⛔ `Place style` IS WEEKLY-ONLY. */
  t('⚠️ every control the toolbar had is in the panel',
    ['Font', 'Colour'].every(l => new RegExp(`label="${l}"`).test(ED))
    /* ⚠️ THE OTHER FOUR ARE CONSTANTS NOW (§C), so they are asserted by the constant and not by a
     * literal — a literal would go stale the first time the wording changed and would pass anyway. */
    && ['LABEL_TEXT_SIZE', 'LABEL_LINE_UP', 'LABEL_LETTERS', 'LABEL_DATE_STYLE']
      .every(k => new RegExp(`label=\\{${k}\\}`).test(ED))
    && /selected === 'location' && isWeek && \(\s*\n\s*<Field label=\{LABEL_PLACE_STYLE\}>/.test(ED)
    && /<FontPicker value=\{shared\.fontId\}/.test(ED)
    && /<FontPicker value=\{shown\.fontId\}/.test(ED)
    && /<ColourField value=\{shown\.color\}/.test(ED)
    && /<Stepper value=\{sel\.fontSize\} min=\{6\} max=\{H\} step=\{2\}/.test(ED))

  /* 🔴 TWO SECTIONS, WITH THE BRIEF'S OWN DEFAULTS: MAKE IT STAND OUT open, MORE OPTIONS folded with a
   * summary naming what is inside. ⛔ THE "TEXT" HEADING IS GONE — with the item's name in bold directly
   * above the font and colour rows it was a second heading for the same block. ⚠️ THE BLOCK IS STILL
   * MARKED `data-settings-section="TEXT"`, which is what the render harness measures. */
  t('🔴 MAKE IT STAND OUT is open by default and MORE OPTIONS is folded, with a summary',
    /EDITOR_SECTION_STAND = 'MAKE IT STAND OUT'/.test(EDCOPY)
    && /EDITOR_SECTION_MORE = 'MORE OPTIONS'/.test(EDCOPY)
    && /const \[standOpen, setStandOpen\] = useState\(true\)/.test(ED)
    && /const \[moreOpen, setMoreOpen\] = useState\(false\)/.test(ED)
    && /data-settings-section="TEXT">/.test(ED)
    && !/\{EDITOR_SECTION_TEXT\}/.test(ED)
    /* 🔴 THREE SUMMARIES, BECAUSE MORE OPTIONS HOLDS THREE DIFFERENT THINGS. One was a lie on two of
     * the three selections: "All text" has no tilt and no "centre the box", and a FOLLOWING box has no
     * letter spacing and no band padding. A folded section whose sign names things that are not behind
     * it is worse than one with no sign. */
    && /EDITOR_MORE_SUMMARY =\s*\n\s*'Spacing, tilt, words before, line spacing, darken the picture, centre the box'/.test(EDCOPY)
    && /EDITOR_MORE_SUMMARY_ALL =/.test(EDCOPY)
    && /EDITOR_MORE_SUMMARY_BOX =/.test(EDCOPY)
    /* ⛔ AND "copy this style" IS OUT OF ALL THREE, because that button is gone. */
    && !/copy this style/.test(EDCOPY.slice(EDCOPY.indexOf('EDITOR_MORE_SUMMARY ='), EDCOPY.indexOf('ALL_TEXT_ITEM'))))

  /* ══ 🔴 THE SHADOW ROW, AND THE TWO SWITCHES ON ONE LINE ════════════════════════════════════════════
   * ⚠️ THE BRIEF'S OWN LAYOUT: Shadow None/Soft/Strong, then Outline and Band behind on one line, then
   * the band's colour and see-through on one line **when the band is on**. ⛔ TWO `CheckRow`s WITH A
   * HINT UNDER EACH was four lines for two switches, on a panel whose whole problem is height. */
  t('🔴 Shadow is three buttons; Outline and Band share a line; the band\'s two settings share another',
    /\(\['none', 'soft', 'strong'\] as const\)\.map/.test(ED)
    && /<Switch on=\{fx\.outline\} label=\{EFFECT_OUTLINE\}/.test(ED)
    && /<Switch on=\{fx\.band\} label=\{EFFECT_BAND\}/.test(ED)
    && /\{fx\.band && \(\s*\n\s*<div className="mb-2 flex items-center gap-2">/.test(ED)
    /* ══ 🔴 §C · IN PLAIN WORDS, AND THE OLD ONES ARE GONE ═══════════════════════════════════════
     * ⛔ "MAKE IT STAND OUT" WAS A CLAIM; "MAKE IT EASIER TO READ" is the job. "Band behind" was a
     * typesetter's word with its object missing. */
    && /SECTION_EASIER_TO_READ = 'MAKE IT EASIER TO READ'/.test(EDCOPY)
    && /EFFECT_SHADOW = 'Shadow behind the letters'/.test(EDCOPY)
    && /EFFECT_OUTLINE = 'Outline round the letters'/.test(EDCOPY)
    && /EFFECT_BAND = 'Coloured strip behind the words'/.test(EDCOPY)
    && /<GroupHeading>\{EFFECT_SHADOW\}<\/GroupHeading>/.test(ED)
    && /title=\{SECTION_EASIER_TO_READ\}/.test(ED)
    && !/\{EDITOR_SECTION_STAND\}/.test(ED)
    && /\{EFFECT_SEE_THROUGH\}/.test(ED)
    /* ⚠️ SHOWN AS "see-through" AND STORED AS OPACITY — the conversion lives in one place. */
    && /patchEffects\(\{ bandOpacity: 100 - Math\.min\(100, Math\.max\(0, Number\(e\.target\.value\) \|\| 0\)\) \}\)/.test(ED))

  /* ⛔ **NOTHING IS LOST** — AND THIS IS THE CHECK THAT SAYS SO. `EffectsPanel` is the SAME component the
   * "✦ Effects ▾" pop-up held, and `AdvancedPanel` SPLIT IN TWO rather than being re-authored: half its
   * controls are LOOK (now shared) and half are per box for ever. Asserting their CONTENTS is what
   * proves none was dropped in the split. */
  t('⛔ every setting the pop-ups held is still reachable, across the split',
    /<EffectsPanel fx=\{shared\.effects\}/.test(ED)
    && /<EffectsPanel fx=\{shown\.effects\}/.test(ED)
    && /function MoreShared\(/.test(ED) && /function MoreBox\(/.test(ED)
    && !/function AdvancedPanel\(/.test(ED)
    /* ⚠️ THE LOOK HALF — letter spacing, the shadow's strength, the outline's thickness, the band's
     * corners and padding, "keep it readable", and the design-wide darken. */
    && ['LABEL_LETTER_SPACE', 'LABEL_SHADOW_STRENGTH', 'LABEL_OUTLINE_WIDTH', 'LABEL_BAND_CORNERS',
      'LABEL_BAND_PADDING'].every(k => new RegExp(`label=\\{${k}\\}`).test(ED))
    && /EFFECT_AUTO = 'Keep it readable automatically'/.test(EDCOPY)
    /* ══ 🔴 §B3 · "Darken the picture" LEFT MORE OPTIONS AND WENT TO THE PICTURE ═══════════════════
     * ⛔ **THIS IS WHY IT READ AS DOING NOTHING.** It was mounted in the MORE OPTIONS of "All text" and
     * of an own-style box — and on a box that FOLLOWS All text, `MoreShared` is not drawn at all, so an
     * operator who selected the Date and opened MORE OPTIONS could not find it. The renderer has always
     * drawn it (proved in the pixels above). ⚠️ IT IS IN THE BACKGROUND'S OWN CARD NOW. */
    && !/<DarkenSlider/.test(ED)
    && !/function DarkenSlider/.test(ED)
    && /data-darken>/.test(ED)
    /* ⚠️ `MAX_DARKEN`, NOT 60. §B3 of the 10 October brief asks the slider for 0–70 and the validator
     * was raised to match — a slider that offered a value the save refuses would be worse than one
     * capped too low. ⛔ THE CEILING IS ONE CONSTANT, shared by the editor, the validator and the
     * renderer: 60 in one and 70 in another is a slider whose top third does nothing. */
    && /<Slider label=\{DARKEN_LABEL\} value=\{layout\.darken\} min=\{0\} max=\{MAX_DARKEN\} step=\{5\}/.test(ED)
    && /export const MAX_DARKEN = 70/.test(read('lib/weekly-post/layout.ts'))
    /* ⚠️ `draw.ts` SINCE 10 OCTOBER (§2) — `darkenEl` moved with the rest of the poster tree so the
     * live editor could build the same one. The ceiling and its reason are unchanged. */
    && /Math\.min\(MAX_DARKEN, percent\)/.test(read('lib/weekly-post/draw.ts'))
    && !/Math\.min\(60, percent\)/.test(read('lib/weekly-post/draw.ts'))
    && /DARKEN_HINT = 'Puts a dark layer over your picture so white writing is easier to read\.'/.test(EDCOPY)
    /* ⚠️ THE PER-BOX HALF — words before, line spacing, tilt, the two centre buttons, long names, and
     * removing a note box. */
    /* ⚠️ "Words before" IS A `<label>` WITH ITS OWN HINT, not a `Field` — it is a full-width text input
     * with a sentence under it, which is the one control in MORE OPTIONS that does not fit the
     * label-left row. Asserted by its own words rather than by a `Field` label it does not have. */
    && /\{LABEL_WORDS_BEFORE\}<\/label>/.test(ED)
    && /WORDS_BEFORE_HINT = 'Drawn in front of what this item says, like “From”\./.test(EDCOPY)
    && ['LABEL_LINE_HEIGHT', 'LABEL_TILT'].every(k => new RegExp(`label=\\{${k}\\}`).test(ED))
    && /\{LABEL_CENTRE_ON\}/.test(ED)
    && /\{LABEL_TOO_LONG\}/.test(ED)
    /* ══ 🔴 §6 (10 October 2026) · "Remove this text box" LEFT MORE OPTIONS ═══════════════════════
     * ⛔ IT WAS A RED **LINK AT THE BOTTOM OF A FOLDED SECTION** — the hardest place on the panel to
     * find a destructive action, and the easiest to press by accident once found, because a link has no
     * edges. 🔴 IT IS A RED-OUTLINED BUTTON AT THE FOOT OF THE PANEL, with the key named beside it. */
    && !/Remove this text box/.test(ED)
    && /DELETE_OWN_TEXT = '🗑 Delete this text'/.test(EDCOPY)
    && /DELETE_OWN_TEXT_KEY = 'or press Delete'/.test(EDCOPY)
    && /data-delete-note/.test(ED)
    && /data-delete-hint>\{DELETE_OWN_TEXT_KEY\}/.test(ED)
    && /border border-red-300 bg-white/.test(ED)
    /* 🔴 AND THE KEY, WITH THE SAME FOCUS TEST THE OTHER TWO HANDLERS USE — a Backspace in a text field
     * must delete a CHARACTER, or an operator correcting a typo loses their text box. */
    && /if \(e\.key !== 'Delete' && e\.key !== 'Backspace'\) return/.test(ED)
    && (() => {
      const fn = ED.slice(ED.indexOf("if (e.key !== 'Delete'"), ED.indexOf("removeNote(selected)", ED.indexOf("if (e.key !== 'Delete'")))
      return fn.indexOf("tag === 'INPUT'") < fn.indexOf('e.preventDefault()')
        && /if \(readOnly \|\| noteIndex\(selected\) < 0\) return/.test(fn)
    })()
    /* ⛔ THE GROUP HEADINGS WENT WITH §C. "Wording", "Position", "Long names" and "Stand out" were
     * labels ON labels — every control under them already says what it does, in full. */
    && /MORE_SUMMARY_PLAIN =/.test(EDCOPY)
    && /summary=\{MORE_SUMMARY_PLAIN\}/.test(ED)
    /* ⛔ AND THE ONE THING THAT WAS DELIBERATELY REMOVED IS GONE: "Copy this style to all text" was a
     * one-way bulk write, and "All text" replaces it with a relationship. */
    && !/Copy this style to all text/.test(ED)
    && !/copyStyleToAll/.test(ED))

  /* ⚠️ AND THE TWO ITEMS WITH NO TEXT KEEP THEIR OWN PANELS. A picture has no font and a row spacing has
   * no box, so neither goes through the sections — they are their own bodies. */
  t('⚠️ the picture and the row spacing have their own panels, with every control they had',
    /function PicturePanel\(/.test(ED) && /function RowsPanel\(/.test(ED)
    && /label="Picture">/.test(ED) && /label="Corners">/.test(ED)
    && /label="If a location has no image">/.test(ED)
    && /Draw a border/.test(ED) && /Border width/.test(ED) && /Corner radius/.test(ED)
    && /label="Spacing">/.test(ED) && /Show cancelled events/.test(ED)
    && /\+ Add location pictures/.test(ED))

  /* ⚠️ WITH NOTHING SELECTED THE PANEL SAYS WHAT TO DO — an instruction, not a status. */
  t('⚠️ with nothing selected the panel gives the brief\'s instruction',
    /EDITOR_NOTHING_SELECTED = 'Click anything on your post to change it'/.test(EDCOPY)
    && /EDITOR_SETTINGS_FOR = 'Settings for the box you’ve picked'/.test(EDCOPY)
    /* ⚠️ `wrap`, NOT `shell`: with `only` undefined `wrap` IS `shell` (the desktop card), and with a
     * group set it is the sheet's bare body. One branch, both screens. */
    && /if \(!selItem\) return wrap\(/.test(ED)
    && /\{EDITOR_NOTHING_SELECTED\}/.test(ED))

  /* ══ 🔴 THE POSTER IS FITTED TO THE MEASURED AREA, AND THERE IS A ZOOM ═════════════════════════════
   * ⛔ IT WAS `maxHeight: min(64vh, 820px)` AND A WIDTH DERIVED FROM IT — a GUESS at how much of the
   * window the poster may have, wrong in both directions: on a 16-inch window 64vh left a third of the
   * height unused, and on a short window the title row and the hint pushed the bottom off the screen
   * because neither was counted.
   * 🔴 SO THE AREA IS MEASURED AND THE POSTER IS `min(areaW, areaH × ratio)`, which is what "the largest
   * size that fits, both width and height" means. ⚠️ ONLY A LAYOUT ENGINE KNOWS `areaH`. */
  t('🔴 the poster is fitted to the measured area, not capped by a `vh` guess',
    /const areaRef = useRef<HTMLDivElement \| null>\(null\)/.test(ED)
    && /const fitW = area\.w && area\.h \? Math\.max\(40, Math\.min\(area\.w, area\.h \* ratio\)\) : 0/.test(ED)
    && /width: shownW \? `\$\{Math\.round\(shownW\)\}px` : 0/.test(ED)
    /* ⛔ AND THE OLD `vh` CAP IS GONE FROM THE STAGE. */
    && !/maxHeight: 'min\(64vh, 820px\)'/.test(ED)
    /* ⚠️ `setState` FROM THE OBSERVER'S CALLBACK, NOT FROM THE EFFECT BODY — the lint rule that forbids
     * the latter is right, and an observer callback is an event, which is where a write belongs. */
    && /const ro = new ResizeObserver\(read\)/.test(ED)
    /* ══ 🔴 AND THE **PADDING IS SUBTRACTED**, WHICH IS WHERE THE FIRST VERSION WAS WRONG ═════════════
     * ⛔ `clientWidth` IS THE CONTENT BOX **PLUS PADDING** and minus the scrollbar. Reading it straight
     * made the poster 366px wide inside a 342px content box on a phone — so the area scrolled sideways
     * at **Fit**, where nothing should scroll at all. The render harness caught it.
     * ⚠️ READ FROM THE COMPUTED STYLE rather than hard-coded as 12: `p-3` is a class somebody will
     * change, and a number copied out of it is a number that goes stale silently. */
    && /const px = parseFloat\(cs\.paddingLeft\) \+ parseFloat\(cs\.paddingRight\)/.test(ED)
    && /const py = parseFloat\(cs\.paddingTop\) \+ parseFloat\(cs\.paddingBottom\)/.test(ED)
    && /w: Math\.max\(0, el\.clientWidth - \(Number\.isFinite\(px\) \? px : 0\)\)/.test(ED)
    && !/setArea\(\{ w: el\.clientWidth, h: el\.clientHeight \}\)/.test(ED))

  /* ══ 🔴 §2 · [−] [100%] [+] AND A SEPARATE "Fit to screen" ════════════════════════════════════════
   * ⛔ THE PERCENTAGE **WAS** THE Fit BUTTON, so one control was a label when fitted and a value when
   * not, and pressing it was how you got back. Two jobs wearing one hat: an operator who wanted to read
   * the zoom had to know that reading it was also pressing it.
   * 🔴 THE NUMBER IS A PLAIN LABEL NOW and "Fit to screen" is its own button, **disabled at Fit** —
   * which is the only honest state for a button that would do nothing. ⚠️ A step count, not a scale, so
   * Fit survives a resize: at Fit the poster re-fits itself, and at +2 it stays twice as big as
   * whatever Fit now is. */
  t('🔴 the zoom is [−] [100%] [+] plus "Fit to screen", greyed out when already fitted',
    /const \[zoomStep, setZoomStep\] = useState\(0\)/.test(ED)
    && /const ZOOM_FACTOR = 1\.25/.test(ED)
    && /const ZOOM_MIN = -2, ZOOM_MAX = 6/.test(ED)
    && /EDITOR_FIT_TO_SCREEN = 'Fit to screen'/.test(EDCOPY)
    /* ⛔ THE READOUT IS A `<span>`, NOT A BUTTON — asserted as the element, because "it is a label" is
     * exactly the claim and a styled button would look identical. */
    && /<span data-zoom-readout\s*\n\s*className="w-12 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-600">\s*\n\s*\{zoomPercent\}%/.test(ED)
    /* ⚠️ `tabular-nums` AND A FIXED WIDTH, so stepping 100 → 125 → 156 does not move + under the
     * operator's finger. */
    && /const zoomPercent = Math\.round\(ZOOM_FACTOR \*\* zoomStep \* 100\)/.test(ED)
    && /data-zoom-fit>\{EDITOR_FIT_TO_SCREEN\}/.test(ED)
    && /onClick=\{\(\) => setZoomStep\(0\)\} disabled=\{atFit\}/.test(ED)
    && /const atFit = zoomStep === 0/.test(ED)
    /* ══ ⛔ `grid` + `margin:auto`, **NOT** `flex` + `justify-center` ════════════════════════════════
     * They centre the same way and they overflow differently, and the difference is a real bug: a flex
     * container with `justify-content: center` whose item is too big overflows BOTH sides, and the part
     * past the start edge is UNREACHABLE — `scrollLeft` cannot go below 0. At 150% the left half of the
     * poster could not be scrolled to. `margin: auto` on a grid item centres it while keeping the
     * scrollable region correct in both directions.
     * ⚠️ `min-w-0 max-w-full` SAYS TWICE what the grid track's `minmax(0,1fr)` already says, because the
     * symptom Dominic reported — the settings panel pushed off the screen — is what happens if either
     * is missing. */
    /* ⚠️ THE `grid` AND THE `m-auto` ARE WHAT THIS CLAUSE IS ABOUT and both are still here; what is new
     * is the phone's sizing. ⛔ `md:h-[min(72vh,820px)] md:grow-0` IS THE DESKTOP'S OLD INLINE HEIGHT,
     * moved to a class so that below the breakpoint `grow` can hand the poster whatever the sheet and
     * the item bar leave it. */
    && /data-stage-area\s*\n\s*data-phone-stage\s*\n\s*className="grid min-h-0 min-w-0 max-w-full grow overflow-auto rounded-2xl bg-slate-100 p-3\s*\n\s*md:h-\[min\(72vh,820px\)\] md:grow-0"/.test(ED)
    && /className="relative m-auto select-none touch-none overflow-hidden rounded-xl bg-slate-200"/.test(ED)
    && !/justify-center overflow-auto/.test(ED))

  /* ══ 🔴 §B1 (10 October 2026) · "👁 Preview post" IS A BUTTON, AND THE SWITCH IS GONE ═════════════
   * ⛔ THE "✎ Edit | 👁 Preview" SWITCH LASTED ONE ROUND. It was a MODE: the poster stayed where it
   * was and the outlines went, so the operator had to remember which state they were in, every other
   * control silently changed meaning, and a design left in Preview looked like an editor that had
   * stopped working. 🔴 AN OVERLAY HAS NO STATE TO REMEMBER.
   * ⚠️ AND IT SHOWS THE PNG THE STAGE IS ALREADY DRAWING — the real renderer's output — rather than
   * asking for a second one that could answer differently. */
  t('🔴 §B1 · "👁 Preview post" opens the real PNG over the top, and the Edit/Preview switch is gone',
    /PREVIEW_POST_BTN = '👁 Preview post'/.test(EDCOPY)
    && /const \[previewOpen, setPreviewOpen\] = useState\(false\)/.test(ED)
    && /data-preview-post/.test(ED)
    && /data-post-preview onClick/.test(ED)
    && /<img src=\{preview\} alt=\{PREVIEW_POST_TITLE\} data-post-preview-img/.test(ED)
    && /data-post-preview-close/.test(ED)
    && /PREVIEW_POST_CLOSE = 'Close'/.test(EDCOPY)
    /* ⛔ EVERY TRACE OF THE MODE IS GONE — the flag, the switch, the hint, and the `hidden` prop that
     * made a box disappear. A mode half-removed is a mode. */
    && !/preview3/.test(ED)
    && !/data-view-switch/.test(ED)
    && !/data-view-hint/.test(ED)
    && !/\{EDITOR_PREVIEW_HINT\}/.test(ED)
    && !/hidden=\{/.test(ED)
    && !/if \(hidden\) return null/.test(BITS_BOX))

  /* ══ 🔴 §4 · ONLY THE SELECTED BOX IS DRAWN LOUDLY ════════════════════════════════════════════════
   * ⛔ EVERY BOX HAD A 2px DASHED `white/70` OUTLINE AND A PERMANENT BLACK LABEL — eleven of each on a
   * weekly design, over the truck's own artwork. The labels were the worse half: opaque, outside their
   * box, and overlapping each other on a poster scaled to 440px.
   * 🔴 THE SELECTED BOX KEEPS ITS SOLID ORANGE OUTLINE, HANDLES AND LABEL; every other is a 1px dashed
   * `white/25` hairline with no label. ⚠️ HOVER BRINGS THE NAME BACK, which is what makes a hairline
   * usable. ⛔ `group-hover` RATHER THAN `useState`: eleven boxes each holding a hover flag is eleven
   * re-renders during a mouse sweep, and the answer is purely visual. */
  t('🔴 §B5 · only the selected box is loud, and every text box is legible on any picture',
    /border-2 border-orange-500/.test(BITS_BOX)
    /* ══ 🔴 §B5 (10 October 2026) · A TWO-TONE OUTLINE AND AN EDITOR-ONLY TINT ═══════════════════════
     * ⛔ A WHITE HAIRLINE DISAPPEARS ON A WHITE PICTURE and a dark one disappears on a dark one, and a
     * truck's artwork is reliably one or the other. The border is white and dashed; the `outline` is a
     * thin dark edge outside it, drawn by the browser rather than by a second element.
     * 🔴 AND THE TINT IS WHAT MAKES **WHITE WRITING** VISIBLE WHILE EDITING — rgba(15,23,42,.28) behind
     * the words, never in the PNG. ⚠️ TEXT BOXES ONLY: a tinted picture box would show the operator a
     * photograph darker than the one they are about to post. */
    && /border border-dashed border-white\/70 outline-slate-900\/50 hover:border-white/.test(BITS_BOX)
    && /outline outline-1/.test(BITS_BOX)
    && /backgroundColor: 'rgba\(15,23,42,\.28\)'/.test(BITS_BOX)
    && /data-box-tint=\{tint \? 'on' : undefined\}/.test(BITS_BOX)
    && /tint=\{!isPic\}/.test(ED)
    && /data-box-outline=\{active \? 'selected' : 'faint'\}/.test(BITS_BOX)
    && /hidden bg-black\/50 text-white group-hover:block/.test(BITS_BOX)
    && /className=\{`group absolute touch-none cursor-move/.test(BITS_BOX)
    /* ⛔ AND THE OLD FAINT HAIRLINE IS GONE, so this cannot pass against the invisible one. */
    && !/border-white\/25/.test(BITS_BOX)
    /* ⚠️ THE LABEL IS `pointer-events-none`, or a label — which sits OUTSIDE its box — would swallow a
     * drag aimed at the box above it. */
    && /pointer-events-none absolute -top-5 left-0/.test(BITS_BOX))

  /* ══ 🔴 §4 · THE CENTRE GUIDES ARE PINK, AND ONLY WHILE SNAPPED ═══════════════════════════════════
   * ⚠️ PINK RATHER THAN ORANGE, which is the brief's instruction and the right one: orange is this
   * product's "selected / press me" colour and is already the selected box's outline, so an orange guide
   * on an orange outline said two things in one colour.
   * ⛔ THE SNAP ITSELF IS UNCHANGED and is asserted on the TOLERANCE, not on the colour: a guide that
   * drew without snapping, or snapped without drawing, would be the two halves disagreeing. */
  t('🔴 §4 · the centre guides are pink, drawn only while snapped, and the snap is the same rule',
    /bg-pink-500" data-guide="v"/.test(ED)
    && /bg-pink-500" data-guide="h"/.test(ED)
    && !/bg-orange-400 pointer-events-none/.test(ED)
    /* ⛔ ONE DECISION FEEDS BOTH THE SNAP AND THE GUIDE, in `DraggableBox`. */
    && /const snappedX = Math\.abs\(x - wantX\) <= tol/.test(BITS_BOX)
    && /onGuides\?\.\(\{ v: snappedX \? cx : null, h: snappedY \? cy : null \}\)/.test(BITS_BOX)
    /* ⚠️ AND THEY ARE CLEARED ON RELEASE — `NO_GUIDES` in `end`. */
    && /onGuides\?\.\(NO_GUIDES\)/.test(BITS_BOX))

  /* ══ 🔴 §4 · ARROW KEYS NUDGE, AND ONLY WHEN NOTHING IS BEING TYPED IN ════════════════════════════
   * ⛔ THE FOCUS TEST IS THE WHOLE FEATURE. A heading's text field, "Words before", the font search box
   * and every `<select>` all use the arrow keys for their own purposes — stealing them would mean an
   * operator correcting a typo moved their Date box instead. ⚠️ THE SAME TEST THE ⌘Z HANDLER USES.
   * 🔴 ONE UNDO STEP PER RUN. Twenty presses of ↓ is one thing the operator did; twenty undo steps to
   * get back is not. ⛔ AND IT IS THE SAME `beginGesture` + `live` PAIR A DRAG USES — a nudge IS a tiny
   * drag, and giving it its own mechanism would be two ways to move a box. */
  t('🔴 §4 · arrow keys nudge 1px (Shift 10), never in a field, and a run is ONE undo step',
    /const step = e\.shiftKey \? 10 : 1/.test(ED)
    && /e\.key === 'ArrowLeft' \? \[-step, 0\]/.test(ED)
    /* ⛔ THE FOCUS TEST COMES **BEFORE** `preventDefault`, or a `<select>` that had already consumed the
     * key would be prevented from doing so. */
    && (() => {
      const fn = ED.slice(ED.indexOf('const step = e.shiftKey'), ED.indexOf('window.addEventListener', ED.indexOf('const step = e.shiftKey')))
      return fn.indexOf("tag === 'INPUT'") < fn.indexOf('e.preventDefault()')
        && /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT' \|\| t\?\.isContentEditable/.test(fn)
    })()
    /* 🔴 ONE HISTORY STEP PER RUN: the first press opens it, a 600ms gap closes it. */
    && /if \(!nudgeOpen\.current\) beginGesture\(\)/.test(ED)
    && /nudgeOpen\.current = setTimeout\(\(\) => \{ nudgeOpen\.current = null \}, 600\)/.test(ED)
    /* ⚠️ CLAMPED TO THE POSTER, exactly as a drag is — the validator refuses a box reaching outside the
     * image, so a nudge that could produce one would be a nudge that cannot be saved. */
    && /Math\.max\(0, Math\.min\(W - box\.w, box\.x \+ dx\)\)/.test(ED)
    /* ⛔ AND THE TIMER IS CLEARED ON UNMOUNT. */
    && /useEffect\(\(\) => \(\) => \{ if \(nudgeOpen\.current\) clearTimeout\(nudgeOpen\.current\) \}, \[\]\)/.test(ED))

  /* ══ 🔴 §3 · THE "LOOK" SWITCH REPLACED THE TWO COLOURED NOTES ════════════════════════════════════
   * ⛔ EACH NOTE HAD THE STATE-CHANGING LINK **INSIDE THE SENTENCE DESCRIBING THE STATE**, so the thing
   * you pressed was a word in the thing you read — and the two states looked like two different
   * components rather than two positions of one setting, so "what are my options here?" had no answer
   * on screen. 🔴 A TWO-WAY SWITCH SHOWS BOTH POSITIONS AT ONCE.
   * ⚠️ THE BEHAVIOUR IS UNCHANGED: `makeOwn` copies the shared look in and marks the box own in one
   * commit, `makeFollow` drops it. */
  t('🔴 §C · a text box\'s STYLE is a two-way switch, in plain words, with a hint under it',
    /* ══ ⛔ "LOOK" BECAME "Style", AND THE POSITIONS SAY WHAT THEY DO (§C, 10 October 2026) ═══════════
     * "LOOK" was a noun an operator had to map onto the switch's behaviour; "🔗 Same as All text" named
     * a relationship rather than an outcome. ⚠️ THE BEHAVIOUR IS BYTE-FOR-BYTE WHAT IT WAS — the same
     * two functions, in the same one commit. */
    /STYLE_HEADING = 'Style'/.test(EDCOPY)
    && /STYLE_MATCH = 'Match the other writing'/.test(EDCOPY)
    && /STYLE_OWN = 'Style this one on its own'/.test(EDCOPY)
    && /data-look>/.test(ED)
    && /\(\[\[false, STYLE_MATCH\], \[true, STYLE_OWN\]\] as const\)\.map/.test(ED)
    && /onClick=\{\(\) => \(wantOwn \? makeOwn\(selected\) : makeFollow\(selected\)\)\}/.test(ED)
    && /aria-pressed=\{owns === wantOwn\}/.test(ED)
    /* 🔴 AND THE HINT EXPLAINS THE POSITION YOU ARE IN AND NAMES THE OTHER ONE. */
    && /data-look-hint>\s*\n\s*\{owns \? STYLE_OWN_HINT : STYLE_MATCH_HINT\}/.test(ED)
    && /STYLE_MATCH_HINT = 'Font, colour and effects come from All text, so everything matches\.'/.test(EDCOPY)
    && /STYLE_OWN_HINT = 'Font, colour and effects are set just for this\.'/.test(EDCOPY)
    /* ⛔ AND THE OLD HEADING IS NO LONGER DRAWN. */
    && !/\{LOOK_HEADING\}/.test(ED)
    /* ⛔ AND THE TWO NOTES LEFT THE SCREEN. `codeOf` first — the tombstone names them. */
    && !/data-follow-note/.test(ED) && !/data-own-note/.test(ED)
    && !/data-change-just-this/.test(ED) && !/data-match-all/.test(ED)
    /* ⚠️ "Use this style for all text" STAYS at the foot of an own-style box — §3 says so. */
    && /data-use-for-all>/.test(ED))

  /* ══ 🔴 §5 · THE BACKGROUND PICTURE'S SHAPE, AND WHETHER IT IS THE BEST ONE ════════════════════════
   * ⛔ THE SIZE ALONE TOLD AN OPERATOR NOTHING THEY COULD ACT ON. "3840 × 2160" is a fact; what they
   * need to know is that a 16:9 picture will be letterboxed into a feed that gives a 4:5 one half again
   * as much height. ⚠️ THE TEST IS THE **RATIO**, NOT THE ORIENTATION: a 9:16 story-shaped design is
   * portrait and is NOT what shows biggest in a feed, so it correctly gets the tip.
   * ⚠️ AND THE TIP IS ONLY SHOWN WHERE IT WOULD CHANGE SOMETHING — advice to do what has already been
   * done is the fastest way to teach an operator to stop reading grey text. */
  t('🔴 §5 · a 4:5 background gets a green tick, anything else gets the tip',
    /const isBestShape = Math\.abs\(ratio - 4 \/ 5\) < 0\.01/.test(ED)
    && /BG_BEST_SUFFIX = '✓ best for Instagram & Facebook'/.test(EDCOPY)
    && /BG_PORTRAIT_TIP =\s*\n\s*'Tip: a portrait picture \(1080 × 1350, 4:5\) shows biggest on Instagram and Facebook feeds\.'/.test(EDCOPY)
    && /\{isBestShape && <span className="font-bold text-green-700" data-bg-best> \{BG_BEST_SUFFIX\}<\/span>\}/.test(ED)
    && /\{!isBestShape && \(/.test(ED)
    && /data-bg-tip>\{BG_PORTRAIT_TIP\}/.test(ED)
    /* ⛔ AND THE SIZE IS STILL THERE, in grey, before the green half. */
    && /data-bg-size>\s*\n\s*\{W\} × \{H\} · \{shapeName\(W, H\)\}/.test(ED))

  /* ══ ⚠️ THE Background picture BUTTON CARRIES ITS NAME AND NOTHING ELSE ════════════════════════════
   * DOMINIC: *"remove the box showing 'Background picture 3840×2160' unless it has a purpose but it
   * doesn't seem to do anything."* ⛔ **IT HAS ONE AND IT IS THE ONLY ONE THERE IS**: the settings it
   * opens hold "Replace picture", the sole way to change a design's artwork — and §5 puts the shape
   * advice there too. So the CONTROL stays.
   * 🔴 WHAT WAS DOING NOTHING WAS THE **DUPLICATION**: the card had its own "Background picture" heading
   * directly under the panel's own title, and the size appeared on the button AND in the card. Four
   * readouts of two facts. The heading is the panel's now and the size is in the settings alone. */
  t('⚠️ the background card has no second heading, and holds the size, the tip and the darkening',
    /data-bg-size>/.test(ED)
    && /data-darken>/.test(ED)
    && !/· \{W\} × \{H\}<\/span>/.test(ED)
    /* ⛔ THE CARD IS A PLAIN BLOCK NOW — no border, no heading — because the panel already drew both. */
    /* ⚠️ IT TAKES A GROUP NOW — `pictureCard(only?)` is how the phone sheet's Picture and Darken tabs
     * are two halves of THIS card rather than a copy of it. With no argument it is the desktop's. */
    && /const pictureCard = \(only\?: SettingsGroup\) => \(\s*\n\s*<div className="space-y-2">/.test(ED)
    && !/uppercase tracking-wide text-slate-400 mb-2">Background picture/.test(ED)
    /* ⚠️ AND "Replace picture" IS STILL THERE, which is the whole reason the control was kept. */
    && /\{replacing \? 'Uploading…' : 'Replace picture'\}/.test(ED))

  /* ⚠️ THE HINT IS THE BRIEF'S SENTENCE, with a "·" between the two gestures rather than a full stop —
   * they are two gestures, not two sentences. ⛔ AND IT SHARES ITS LINE WITH THE ZOOM, so the control
   * costs no height on the one screen whose whole problem is height. */
  /* ⚠️ THE SENTENCE IS DESKTOP-ONLY SINCE 10 OCTOBER, and the paragraph around it is not: at 390 it
   * wrapped onto THREE lines and took 48px off the poster, to say something a finger discovers in one
   * gesture — while the phone's own grey line below names both ways to choose a box. ⛔ THE `<p>` STAYS
   * so the live-font warning inside it, which a phone operator must still see, keeps its place. */
  t('⚠️ the hint under the poster is the brief\'s sentence, on the zoom\'s line',
    /data-stage-hint>/.test(ED)
    && /<span className="hidden md:inline">Drag a box to move it · drag a corner to resize<\/span>/.test(ED)
    && /data-live-font-note/.test(ED)
    && ED.indexOf('data-stage-hint') < ED.indexOf('data-zoom>'))

  /* ══ 🔴 THE SWITCH KNOB SITS **INSIDE** ITS TRACK — REPORTED BY DOMINIC ════════════════════════════
   * ⛔ IT WAS POSITIONED BY A TRANSFORM FROM AN `auto` LEFT EDGE: `absolute top-0.5 … translate-x-4`.
   * `absolute` with NO `left` uses the element's STATIC POSITION, which is a property of the inline
   * formatting context it would have had — not a reliable 0. The knob is the only child of an empty
   * `block` span, so where that lands is engine-dependent, and in Safari it resolved outside the track's
   * left edge; `translate-x-4` then carried it out the other side.
   * 🔴 BOTH EDGES ARE STATED NOW AND NOTHING IS TRANSFORMED. ⚠️ Measured as well, by the render harness. */
  t('🔴 the switch knob is positioned by left/right, never by a transform',
    /\$\{on \? 'left-auto right-0\.5' : 'left-0\.5 right-auto'\}/.test(BITS)
    && /data-switch-knob/.test(BITS)
    && !/translate-x-4/.test(BITS)
    /* ⚠️ A 36 × 20 TRACK AND A 16px KNOB, so 2px of clearance at whichever end it is at. */
    && /relative block h-5 w-9 rounded-full/.test(BITS)
    && /absolute top-0\.5 h-4 w-4 rounded-full bg-white shadow transition-all/.test(BITS))

  /* ══ ⛔ THE "below 900px the list becomes chips" CHECK IS RETIRED — 9 OCTOBER 2026 ═════════════════
   *
   * IT ASSERTED that below 900px the 250px left column was replaced by a row of wrapping chips above
   * the poster, and that they WRAPPED rather than scrolling sideways — because a horizontally scrolling
   * strip hides half its own contents at the width with the least room to find them.
   * 🔴 THE CLAIM IS GONE BECAUSE THE COLUMN IS GONE. The item list lives INSIDE the panel now, and the
   * panel drops under the poster below 1100px — so there is no width at which the list is absent and
   * nothing for a chip row to stand in for. ⚠️ A CHECK WHOSE SUBJECT NO LONGER EXISTS cannot fail, and
   * one that cannot fail is worse than none: it reads as coverage.
   * ⛔ WHAT REPLACES IT is the one-breakpoint claim at the top of this section plus the render harness's
   * measurement of the panel actually sitting under the poster at 1000px.
   * ⚠️ AND THE MARKUP WENT WITH THE CLAIM. Keeping it would have left something unreachable:
   * `min-[900px]:hidden` inside a column that only exists above 1100 can never paint. */

  /* ══ 🔴 THE FONT LIST OPENS INSIDE ITS PARENT'S WIDTH ═════════════════════════════════════════════
   * ⛔ IT WAS `w-[22rem]` CAPPED AT `calc(100vw-2rem)`, AND 22rem IS 352px — WIDER THAN THE 380px
   * PANEL'S CONTENT BOX. The viewport cap could not help: on a 1728px window `100vw-2rem` is 1696px, so
   * the panel opened at its full 352px and ran past the right edge of the column it lives in.
   * **A cap against the wrong container is not a cap.** 🔴 `w-full` IS THE FIX. */
  t('🔴 the font list opens inside the panel and scrolls within itself', (() => {
    const PICK = codeOf(read('components/manage/FontPicker.tsx'))
    return /absolute z-50 left-0 top-full mt-1 w-full min-w-\[16rem\] max-w-\[calc\(100vw-2rem\)\]/.test(PICK)
      && !/w-\[22rem\]/.test(PICK)
      /* ⚠️ AND THE LIST STILL SCROLLS INSIDE THE PANEL rather than growing it. */
      && /max-h-\[46vh\]/.test(PICK)
  })())

  /* ⚠️ NO COMPONENT SPELLS A DATE ORDER OUT ANY MORE. A hard-coded ordinal or a `${d}/${m}` is the bug
   * `locale.ts` exists to make impossible, and this is the sweep that keeps it impossible. */
  t('🔴 NO hard-coded date wording anywhere in the three editor files', (() => {
    const files = ['components/manage/DesignEditor.tsx', 'components/manage/DesignEditorBits.tsx',
      'components/manage/WeeklyPost.tsx', 'components/manage/EventPost.tsx']
    const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/
    return files.every(f => {
      const src = codeOf(read(f))
      /* ⚠️ THE SAMPLE **DATE** IS ALLOWED — '2026-10-14' is an ISO date, not a wording. What is
       * forbidden is a month NAME, an ordinal suffix built by hand, or a numeric d/m order. */
      return !MONTHS.test(src) && !/\$\{ordinal\(/.test(src) && !/'(st|nd|rd|th)'/.test(src)
    })
  })())
  t('🔴 and the country is read through ONE function, in the route, never defaulted in a component',
    /countryForTruck\(/.test(ROUTE)
    && !/countryForTruck/.test(ED)
    && /export function countryForTruck/.test(codeOf(read('lib/weekly-post/locale.ts'))))

  // ══ 6 · §8 · THE DESIGNS PAGE'S WORDING AND ORDER ═══════════════════════════════════════════
  head('6 · THE DESIGNS PAGE')
  const SP = codeOf(read('components/manage/SocialPosts.tsx'))
  const COPY = codeOf(read('lib/copy/socialPosts.ts'))
  t('🔴 Box 2 is "Single event post design", and "standard" is BOLD',
    /EVENT_DESIGN_TITLE = 'Single event post design'/.test(COPY)
    && /EVENT_DESIGN_BLURB_BOLD = 'standard'/.test(COPY)
    && /<strong className="font-bold text-slate-700">\{EVENT_DESIGN_BLURB_BOLD\}<\/strong>/.test(SP)
    // ⛔ and the old title is gone from the component, not merely unused
    && !/"Event post design"/.test(SP))
  t('⚠️ its description and "Used for:" line are the brief\'s',
    /design for a post about one event\. We write that event’s date, place and times on top of it\./.test(COPY)
    && /EVENT_DESIGN_USED_FOR = 'every post about a single event\.'/.test(COPY))
  t('⚠️ its button reads "Set up single event design" / "Edit single event design"',
    /EVENT_DESIGN_BUTTON_NEW = 'Set up single event design'/.test(COPY)
    && /EVENT_DESIGN_BUTTON_EDIT = 'Edit single event design'/.test(COPY)
    && /\{data\.standard\.ready \? EVENT_DESIGN_BUTTON_EDIT : EVENT_DESIGN_BUTTON_NEW\}/.test(SP))
  /* ⚠️ BOX 3'S FOOTER IS NO LONGER ONE OF THE PLACES THAT HAS TO AGREE (part 3). It used to end
   * "…using your single event post design", so renaming Box 2 renamed it too — and that is exactly why
   * it was listed here. It counts PICTURES now and names no design at all, which removes it from this
   * check rather than weakening it. 🔴 THE REMAINING READERS ARE NAMED INDIVIDUALLY, so a copy that
   * reverts to the old name in any one of them fails. */
  t('🔴 the matching wording elsewhere agrees — nothing still says "event post design" on its own',
    /EMPTY_EVENT_TITLE = 'You haven’t designed a single event post yet'/.test(COPY)
    && /EVENT_DESIGN_BUTTON_EDIT = 'Edit single event design'/.test(COPY)
    && /Everywhere else uses your single event post design\./.test(COPY)
    && /Use your single event post design at \$\{place\}\?/.test(COPY)
    && /USE_STANDARD_LINK = 'Use your single event post design here instead'/.test(COPY)
    && !/otherwise your Standard event design/.test(COPY)
    /* ⛔ AND THE RETIRED FOOTER LEFT NOTHING BEHIND — see social-posts.cjs §4d. */
    && !/placeDesignFooter/.test(COPY) && !/placeDesignFooter/.test(SP))
  /* ══ ⛔ "Designs for a place" IS GONE AND SO IS ITS SORT — 7 October 2026 ════════════════════════
   * THE CLAIM THIS CHECK MADE: the locations with no picture sort FIRST, and their row button is
   * orange, because the box's job was to get a picture onto a venue that had not got one.
   * 🔴 THE SCREEN IT DESCRIBED NO LONGER EXISTS. Designs is TWO boxes — the weekly design and the
   * single event design — and the locations are their own sub-tab with a TABLE. The sort was replaced
   * by a filter CHIP ("Missing images n"), which is better in the way that matters: the number is
   * visible before it is pressed, so an operator knows whether there is anything to do without
   * scrolling a list to find out.
   * ⚠️ `BTN_OUTLINE_ORANGE` WENT WITH IT. The table has no row buttons at all: a row selects, and the
   * acting is in the pane beside it.
   *
   * ⛔ IT IS **REPLACED**, NOT DELETED, because a pure absence proves nothing — the three claims below
   * are the live shape of what the old one was about, and each would fail if the chips were lost. */
  t('🔴 the locations with no image are a FILTER CHIP, not a sort — and the count is on the chip',
    /* ⚠️ "No pictures" (9 October 2026), from "No images" (8 October), from "Missing images" before
     * that. ⛔ EACH RENAME FIXED A DIFFERENT FAULT: "missing" implied something ought to be there and
     * all of them are optional; "images" named the poster as well, and the chip now counts the two
     * PICTURES — which is also why the word matches the three boxes' own. */
    /CHIP_NO_PICTURES = \(n: number\): string => `No pictures \$\{n\}`/.test(COPY)
    && /CHIP_ALL = \(n: number\): string => `All \$\{n\}`/.test(COPY)
    && /CHIP_HIDDEN = \(n: number\): string => `Hidden \$\{n\}`/.test(COPY)
    /* ⚠️ AND THE SCREEN RENDERS ALL THREE, from one helper — so a restyle cannot leave one of them
     * looking like a different control. */
    && /\{chip\('all', CHIP_ALL\(visible\.length\)\)\}/.test(SP)
    && /\{chip\('missing', CHIP_NO_PICTURES\(missing\.length\)\)\}/.test(SP)
    && /\{chip\('hidden', CHIP_HIDDEN\(hidden\.length\)\)\}/.test(SP))
  /* 🔴 "MISSING" MEANS **EITHER** SLOT IS EMPTY, NOT BOTH, and that is the whole point of the number.
   * A location with an event photo and no weekly picture has something still to do; a chip counting
   * only the locations with nothing at all would report zero for a truck whose weekly poster is
   * drawing twenty blank boxes. ⛔ ASSERTED ON THE **RULE** IN lib, not only on the screen's copy of
   * it — the screen filters inline and `missingImages` is the function the harness can drive. */
  t('⛔ "No pictures" counts a location with EITHER PICTURE empty, and ignores the poster', (() => {
    const lib = read('lib/weekly-post/place-pictures.ts')
    const code = codeOf(lib.slice(lib.indexOf('export function missingImages')))
    return /return places\.filter\(p => !p\.weekly \|\| !p\.eventPhoto\)\.length/.test(code)
      /* ⛔ AND THE POSTER IS **NOT** IN THE TEST, which is the half that changed: with three slots,
       * "either is empty" including the poster would match nearly every location. */
      && !/!p\.poster/.test(code)
      /* ⚠️ AND THE SCREEN'S OWN FILTER IS THE SAME TEST, spelled on the two picture fields. A second,
       * weaker test here would make the chip's number and the chip's list disagree. */
      && /visible\.filter\(p => !p\.weeklyImage \|\| !p\.eventPhotoImage\)/.test(SP)
  })())
  /* ⛔ AND NOT ONE OF THE OLD SORT'S PIECES SURVIVES. A removal that leaves the helper behind is a
   * removal the next person undoes by accident. */
  t('⛔ the old sort, its orange row button and its two group headings are all gone',
    !/const an = \(a\.pictureCount \?\? 0\) === 0 \? 0 : 1/.test(SP)
    && !/const BTN_OUTLINE_ORANGE =/.test(SP)
    && !/className=\{none \? BTN_OUTLINE_ORANGE : BTN_OUTLINE\}/.test(SP)
    && !/PLACE_PICTURES_NONE_HEADING/.test(SP)
    && !/PLACE_PICTURES_SOME_HEADING/.test(SP))

  // ══ 7 · THE EDITOR MUST NOT CRASH ON A DESIGN SAVED BEFORE PART 1 ═══════════════════════════════
  head('7 · an OLD stored layout opens — the editor crash of 7 October 2026')

  /* ⛔ THE BUG, VERBATIM FROM DOMINIC'S CONSOLE:
   *     TypeError: undefined is not an object (evaluating 'PLACE_STYLE_SAMPLES[l.placeStyle].split')
   *       at itemsOf (components/manage/DesignEditor.tsx:183)
   * Pizza Kitchen's only saved design is kind 'event' and predates part 1, so it has no `placeStyle`.
   * The validators guarded every WRITE and no READ: `event_load` sent the jsonb column straight to the
   * browser behind an `as EventLayout` cast, which asserts nothing at runtime.
   *
   * 🔴 THE FIXTURES ARE THE REAL PRE-PART-1 SHAPES, lifted from `defaultEventLayout` / `defaultLayout`
   * as they stood at git HEAD — not a guess at what an old design looks like. Each is missing exactly
   * the fields part 1 added: no `placeStyle`, no `dateStyle`, no effects. */
  const OLD_BASE = {
    fontId: 'oswald', bold: false, color: '#ffffff', caps: true, raisedOrdinals: false,
    align: 'center', bgSample: null,
  }
  const oldEventLayout = (w, h) => ({
    version: 1, width: w, height: h,
    date: { ...OLD_BASE, enabled: true, x: 50, y: 600, w: w - 100, h: 60, fontSize: 37, twoLines: false, bgTrading: null, bgDayOff: null },
    location: { ...OLD_BASE, enabled: true, x: 50, y: 680, w: w - 100, h: 60, fontSize: 36, caps: false },
    time: { ...OLD_BASE, enabled: true, x: 50, y: 760, w: w - 100, h: 60, fontSize: 36 },
    note: null, timeStyle: '12h', timeDisplay: 'from', keepReadable: true,
  })

  /* ⚠️ THE PRECONDITION IS ASSERTED FIRST. A fixture that happened to carry `placeStyle` would make
   * every check below pass without testing anything. */
  t('🔴 the fixture really is a pre-part-1 shape — no placeStyle, no dateStyle', (() => {
    const o = oldEventLayout(1080, 1350)
    return o.placeStyle === undefined && o.dateStyle === undefined
  })())

  /* 🔴 CONTROL: THE BARE INDEX REALLY WOULD HAVE THROWN ON THIS FIXTURE. Without this, every check
   * below could pass against a fixture that never reproduced the bug — which is the failure mode a
   * regression test is most prone to. This is the exact expression from DesignEditor.tsx:183. */
  t('🔴 CONTROL: the OLD expression `PLACE_STYLE_SAMPLES[l.placeStyle].split` throws on this fixture', (() => {
    const LOC = c.req('lib/weekly-post/locale.js')
    const old = oldEventLayout(1080, 1350)
    if (LOC.PLACE_STYLE_SAMPLES[old.placeStyle] !== undefined) return false
    try { LOC.PLACE_STYLE_SAMPLES[old.placeStyle].split('\n'); return false } catch { return true }
  })())

  // ── (a) Pizza Kitchen's real stored event layout shape ──────────────────────────────────────────
  t('🔴 (a) an OLD EVENT layout comes back with every field the editor reads', (() => {
    const r = L.readStoredEventLayout(oldEventLayout(1080, 1350), 1080, 1350)
    return !!r.layout && r.repaired === false
      && typeof r.layout.placeStyle === 'string' && r.layout.placeStyle.length > 0
      && typeof r.layout.dateStyle === 'string' && r.layout.dateStyle.length > 0
      && !!r.layout.placePicture
  })())
  /* ⛔ AND IT IS NOT "repaired" — the operator's boxes survive. A fallback to the default would also
   * stop the crash and would silently throw their positions away, so the two outcomes are told apart. */
  t('⛔ …and the operator\'s own box positions are KEPT, not replaced by the default', (() => {
    const r = L.readStoredEventLayout(oldEventLayout(1080, 1350), 1080, 1350)
    const d = L.defaultEventLayout(1080, 1350)
    return r.layout.date.y === 600 && r.layout.date.y !== d.date.y
  })())

  // ── (b) a place's own layout, on its own canvas ─────────────────────────────────────────────────
  t('🔴 (b) a PLACE\'S OWN old layout opens, validated against the PLACE\'S picture size', (() => {
    const r = L.readStoredEventLayout(oldEventLayout(900, 900), 900, 900)
    return !!r.layout && r.repaired === false && typeof r.layout.placeStyle === 'string'
      && r.layout.width === 900 && r.layout.height === 900
  })())

  // ── (c) a weekly layout from before part 1 ──────────────────────────────────────────────────────
  t('🔴 (c) an OLD WEEKLY layout opens with every field the editor reads', (() => {
    const base = L.defaultLayout(1080, 1350)
    /* ⚠️ BUILT BY DELETING part 1's fields from a current default, which is the honest way to make
     * "the same design, saved earlier": every other field is then exactly what the product writes. */
    const old = JSON.parse(JSON.stringify(base))
    delete old.placeStyle; delete old.dateStyle; delete old.placePicture
    const r = L.readStoredLayout(old, 1080, 1350)
    return !!r.layout && typeof r.layout.placeStyle === 'string'
      && typeof r.layout.dateStyle === 'string' && !!r.layout.placePicture
  })())

  /* 🔴 AND THE LAST RESORT NEVER RETURNS null. Junk, a wrong version and `undefined` all have to yield
   * a usable layout — the editor opening on defaults beats a screen that does not load. */
  t('⛔ unreadable stored values fall back to the default rather than crashing', (() => {
    for (const junk of [null, undefined, 42, 'nope', {}, { version: 99 }]) {
      const e = L.readStoredEventLayout(junk, 1080, 1350)
      const w = L.readStoredLayout(junk, 1080, 1350)
      if (!e.layout || e.repaired !== true || !w.layout || w.repaired !== true) return false
      if (typeof e.layout.placeStyle !== 'string' || typeof w.layout.placeStyle !== 'string') return false
    }
    return true
  })())

  // ── the sample lookup itself must be total ──────────────────────────────────────────────────────
  t('🔴 `placeStyleSample` never throws — the exact call that crashed', (() => {
    const LOC = c.req('lib/weekly-post/locale.js')
    for (const v of [undefined, null, '', 'nope', 7, {}]) {
      let out
      try { out = LOC.placeStyleSample(v).split('\n').join(' · ') } catch { return false }
      if (typeof out !== 'string' || out.length === 0) return false
    }
    /* ⚠️ AND A KNOWN ID STILL GETS ITS OWN SAMPLE, not the fallback — otherwise "never throws" would
     * be satisfied by a function that always returns the same string. */
    return LOC.placeStyleSample('nameOnly') === LOC.PLACE_STYLE_SAMPLES.nameOnly
      && LOC.placeStyleSample('nameOnly') !== LOC.placeStyleSample(undefined)
  })())

  // ── and the routes actually use the one door ────────────────────────────────────────────────────
  t('🔴 every READ path normalises: event_load (standard + per place) and load (weekly)', (() => {
    const route = codeOf(read('app/api/weekly-post/route.ts'))
    return /readStoredEventLayout\(design!\.layout, design!\.width \?\? 0, design!\.height \?\? 0\)\.layout/.test(route)
      && /readStoredEventLayout\(pl\.event_layout, pw, ph\)\.layout/.test(route)
      && /readStoredLayout\(design!\.layout, design!\.width \?\? 0, design!\.height \?\? 0\)\.layout/.test(route)
      /* ⛔ AND THE RAW SEND IS GONE. The bug was `layout: design!.layout` — asserted as an absence so a
       * future read site cannot quietly reintroduce it beside the fixed one. */
      && !/layout: design!\.layout\b/.test(route)
  })())
  t('⛔ …and the editor no longer indexes the samples table directly', (() => {
    const ed = codeOf(read('components/manage/DesignEditor.tsx'))
    return /placeStyleSample\(l\.placeStyle\)\.split/.test(ed)
      && !/PLACE_STYLE_SAMPLES\[l\.placeStyle\]/.test(ed)
  })())

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 ROUND 6 (10 October 2026) — "THE 7 DAYS", AND AN EDITOR THAT SAYS WHAT IT DOES
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  head('ROUND 6 · "The 7 days", the editor-wide fixes, and plain words')

  const DAYS = read('lib/weekly-post/days.ts')
  const RENDER = read('lib/weekly-post/render.ts')
  /* ⚠️ §2 (10 October 2026) · THE POSTER TREE IS `draw.ts` NOW. `render.ts` is the satori call and the
   * I/O; everything that decides where a row goes and what it says moved, so the live editor could
   * build the SAME tree instead of a second one. The claims below follow the code. */
  const DRAW = read('lib/weekly-post/draw.ts')
  const SOC = read('components/manage/SocialPosts.tsx')
  const WK = read('components/manage/WeeklyPost.tsx')

  /* ══ 🔴 §A1 · SIX ITEMS BECAME ONE ════════════════════════════════════════════════════════════════
   * ⛔ Date, Place, Time, Location picture, "Each row" and "Rows" were six answers to one question:
   * where do the seven days go? ⚠️ THE FOUR PARTS ARE STILL **SELECTABLE** — clicking the words on the
   * poster opens that part's text settings — they are simply not buttons in the grid any more. */
  t('🔴 §A1 · the weekly grid is "Week heading" and "The 7 days", and the parts are not buttons',
    /export const DAYS_KEY = 'days'/.test(ED)
    && /DAYS_ITEM = 'The 7 days'/.test(EDCOPY)
    && /DAYS_ICON = '☰'/.test(EDCOPY)
    && /key: DAYS_KEY, name: `\$\{DAYS_ICON\} \$\{DAYS_ITEM\}`/.test(ED)
    /* 🔴 THE FOUR PARTS MOVE TO THE `part` GROUP, AND THE GRID FILTERS THAT GROUP OUT. */
    && /group: 'top' \| 'row' \| 'own' \| 'part'/.test(ED)
    && /const group: Item\['group'\] = week7 \? 'part'/.test(ED)
    /* ⚠️ ONE FILTER NOW, NOT TWO (§3, 10 October 2026): the background is not an item at all any
     * more, so there is nothing to exclude by key. */
    && /items\.filter\(i => i\.group !== 'part'\)/.test(ED)
    /* ⛔ AND "Rows" ONLY SURVIVES FOR A DESIGN STILL ON THE OLD MODEL — there is no row-spacing
     * control on a converted design, because there is no row spacing. */
    && /if \(isWeekLayout\(l\) && !l\.days\) \{/.test(ED)
    && /PART_ITEM_KEY: Record<DayPartKey, ItemKey>/.test(ED))

  /* ══ 🔴 THE CONVERSION HAPPENS **ON OPEN**, IN THE EDITOR, AND NOWHERE ELSE ═══════════════════════
   * ⛔ NOT IN `readStoredLayout` — the RENDERER goes through that, and converting there would change
   * what every unopened design draws, which is the one thing the brief forbids.
   * ⚠️ AND THE CONVERTED LAYOUT IS THE "saved" BASELINE, so opening an old design does not report
   * unsaved changes it did not make. */
  t('🔴 an old weekly design is converted ON OPEN, and the conversion is not "unsaved changes"',
    /export function withDays\(l: AnyLayout\): AnyLayout \{/.test(ED)
    && /if \(!isWeekLayout\(l\) \|\| l\.days\) return l/.test(ED)
    && /const opened = useMemo\(\(\) => withDays\(initialLayout\), \[initialLayout\]\)/.test(ED)
    && /useState<History>\(\{ past: \[\], present: opened, future: \[\] \}\)/.test(ED)
    && /useState<string>\(\(\) => JSON\.stringify\(opened\)\)/.test(ED)
    /* ⛔ AND THE READ PATH IS UNTOUCHED. `layout.ts` re-exports `daysFromLegacy` for the editor and
     * never CALLS it: a call inside `readStoredLayout` would convert every design the RENDERER reads,
     * which is precisely what "renders exactly as today until its owner opens it" forbids. ⚠️ Asserted
     * as "mentioned once, and that once is the re-export". */
    && (() => {
      const lay = codeOf(read('lib/weekly-post/layout.ts'))
      return (lay.match(/daysFromLegacy/g) || []).length === 2
        && /import \{[\s\S]*daysFromLegacy,/.test(lay)
        && /export \{ daysFromLegacy \}/.test(lay)
        && !/daysFromLegacy\(/.test(lay)
    })())

  /* ══ 🔴 ONE LAYOUT FUNCTION, CALLED BY BOTH THE RENDERER AND THE EDITOR ═══════════════════════════
   * ⛔ THE BRIEF'S OWN REQUIREMENT ("the editor preview and the satori renderer must keep resolving
   * through shared functions so they can't drift"). A cell the operator clicks has to be the cell the
   * PNG draws in, and two pieces of arithmetic that agree today are two that can stop agreeing. */
  t('🔴 `dayCells` is the ONE place a row\'s geometry is decided — renderer and editor both call it',
    /export function dayCells\(days: DaysBlock, on: DayPartsOn, row: number\): DayCell\[\]/.test(DAYS)
    && /import \{ dayCells, shapeRadius, type DayPartsOn, type DaysBlock \} from '\.\/days'/.test(DRAW)
    && /for \(const cell of dayCells\(days, on, i\)\)/.test(DRAW)
    && /dayCells\(days, on, row\)/.test(ED)
    /* ⛔ AND THE RENDERER STILL HAS ITS LEGACY LOOP, because a design nobody has opened must render
     * exactly as it does today. ⚠️ The presence of BOTH paths is the compatibility promise. */
    && /if \(l\.days\) \{/.test(DRAW)
    && /const dy = l\.rowSpacing \* i/.test(DRAW)
    /* 🔴 §2 · AND THE **EDITOR** NOW CALLS THE SAME TREE BUILDERS, which is the strongest form this
     * claim has ever taken: the cells the operator clicks and the cells the PNG is drawn from are not
     * two agreeing computations, they are one list of objects painted twice. */
    && /import \{ eventTree, weeklyTree \} from '@\/lib\/weekly-post\/draw'/.test(ED)
    && /weeklyTree\(\{/.test(ED) && /eventTree\(\{/.test(ED)
    && /weeklyTree\(\{/.test(RENDER) && /eventTree\(\{/.test(RENDER))

  /* ══ 🔴 §A2 · THE PANEL ═══════════════════════════════════════════════════════════════════════════ */
  t('🔴 §A2 · the panel has quick layouts, the parts list with ⋮⋮, days off and a picture shape',
    /function DaysPanel\(/.test(ED)
    && /data-quick-layouts>/.test(ED)
    && /QL_ONE_LINE = 'All on one line'/.test(EDCOPY)
    && /QL_DAY_ON_TOP = 'Day on top'/.test(EDCOPY)
    && /QL_BIG_PICTURE = 'Big picture'/.test(EDCOPY)
    && /data-quick=\{id\}/.test(ED)
    && /<QuickLayoutIcon kind=\{id\} \/>/.test(ED)
    && /DAYS_PARTS_HEADING = 'WHAT’S IN EACH ROW'/.test(EDCOPY)
    && /data-part-row=\{p\.key\}/.test(ED)
    && /data-part-handle=\{p\.key\}/.test(ED)
    && /DAYS_PARTS_HINT =\s*\n\s*'Drag ⋮⋮ to change the order\. To change how the words look, click them on your poster\.'/.test(EDCOPY)
    && /data-days-off>/.test(ED)
    && /DAYS_OFF_MESSAGE = 'Show a message'/.test(EDCOPY)
    && /DAYS_OFF_OMIT = 'Leave them out'/.test(EDCOPY)
    && /data-days-off-text/.test(ED)
    && /data-shape=\{id\}/.test(ED)
    && /SHAPE_CIRCLE = 'Circle'/.test(EDCOPY)
    /* ⛔ AND NO PERCENTAGE IS SHOWN ANYWHERE — the brief's instruction. The ⇔ handle moves a width the
     * operator can see; a number beside it would be a unit they have to learn. */
    && !/%<\/span>\s*\n\s*\{\/\* weight/.test(ED)
    /* ⛔ "Gap between days" / row spacing IS GONE FROM THE PANEL — §A1 removes it, because `h / 7` is
     * not a thing to get wrong. ⚠️ SCOPED TO THE PANEL'S OWN BODY: `RowsPanel` still has a Spacing
     * stepper and still must, for a design whose stored block could not be read. */
    && (() => {
      const body = ED.slice(ED.indexOf('function DaysPanel('), ED.indexOf('function QuickLayoutIcon('))
      return !/label="Spacing"/.test(body) && !/rowSpacing/.test(body)
    })())

  /* ⚠️ THE EXAMPLES BESIDE THE PARTS ARE **LIVE** — the design's own date wording and its own clock.
   * A fixed "Mon 5th Oct" beside a design set to "05/10" would be the one line that cannot be right. */
  t('⚠️ …and the parts\' examples are the design\'s own wording, not fixed strings',
    /dayDate: dateSampleFor\(layout, country\)/.test(ED)
    && /times: formatTimeRangeFor\('17:00', '21:00', layout\.timeStyle\)/.test(ED)
    && /place: placeStyleSample\(layout\.placeStyle\)/.test(ED))

  /* ══ 🔴 §A1/§A3 · THE POSTER: ONE DRAGGABLE BLOCK, CELLS THAT CANNOT SWALLOW THE DRAG ═════════════
   * ⛔ CELLS THAT TOOK POINTER EVENTS WOULD LEAVE ALMOST NOWHERE TO GRAB THE BLOCK, and the brief's
   * first instruction about it is "drag the box to move all the rows". So the cells are drawn
   * `pointer-events-none` and a press that does not move is reported by `onTap` and hit-tested against
   * the same `dayCells`. */
  t('🔴 §A3 · the cells are pointer-transparent and a tap on the block selects the part under it',
    /function DaysLayer\(/.test(ED)
    && /className=\{`pointer-events-none absolute outline outline-1/.test(ED)
    && /data-day-cell=\{c\.key\}/.test(ED)
    && /onTap=\{selectPartAt\}/.test(ED)
    && /const selectPartAt = \(nx: number, ny: number\) =>/.test(ED)
    && /onTap\?: \(nativeX: number, nativeY: number\) => void/.test(BITS_BOX)
    && /if \(!s\.moved && s\.mode === 'move' && onTap\) \{ onTap\(s\.tapX, s\.tapY\); return \}/.test(BITS_BOX)
    /* ⚠️ AND THE ⇔ HANDLES ARE ON ROW 1 ONLY — twenty-one handles over a truck's artwork is the
     * "second design on top of their design" this editor has already fixed once. */
    && /dayBoundaries\(days, on\)\.map/.test(ED)
    && /data-day-handle=/.test(ED)
    && /export function dayBoundaries\(days: DaysBlock, on: DayPartsOn, row = 0\)/.test(DAYS))

  /* ══ 🔴 §A1/§B6 · A CORNER SCALES THE WORDS, A SIDE STRETCHES THE BOX ═════════════════════════════
   * ⛔ BEFORE TODAY A CORNER CHANGED THE BOX AND LEFT THE TEXT ALONE, so the handles — the most obvious
   * control on the screen — did the one thing an operator did not want, and there were no side handles
   * at all: the only way to make a box WIDER was to make it taller too.
   * 🔴 THE FACTOR IS MEASURED FROM THE GESTURE'S START, never frame by frame, or fifty frames of ×1.02
   * would not be ×2.7. */
  t('🔴 §B6 · corner handles scale the words, side handles only stretch, and the factor is from the start',
    /export interface DragInfo \{/.test(BITS_BOX)
    && /kind: 'move' \| 'corner' \| 'side'/.test(BITS_BOX)
    && /const SIDES = \['n', 'e', 's', 'w'\] as const/.test(BITS_BOX)
    && /kind: isSide\(s\.mode\) \? 'side' : 'corner'/.test(BITS_BOX)
    && /factor: s\.box\.h > 0 \? h \/ s\.box\.h : 1/.test(BITS_BOX)
    && /\{active && SIDES\.map\(m => \{/.test(BITS_BOX)
    /* ⚠️ THE EDITOR APPLIES IT TO THE SIZE THE DRAG STARTED WITH — `dragFrom`, not the live value. */
    && /const dragFrom = useRef<\{ textH: number; date: number; place: number; time: number \} \| null>\(null\)/.test(ED)
    && /if \(info\?\.kind !== 'corner' \|\| !from\) return \{ \.\.\.l, days: next \} as AnyLayout/.test(ED)
    && /const startSize = dragFrom\.current\?\.date \?\? 0/.test(ED)
    && /info\?\.kind === 'corner' && startSize > 0/.test(ED)
    /* 🔴 AND THE BLOCK'S CORNER SCALES THE **BAND** AND ALL THREE PARTS, in proportion. */
    && /days: \{ \.\.\.next, textH: Math\.max\(8, Math\.round\(from\.textH \* f\)\) \}/.test(ED))

  /* ⚠️ A PART HAS NO POSITION OF ITS OWN, so the two controls that move a box are not drawn for one —
   * a control that writes to a field nothing draws is the failure an operator cannot see. */
  t('⚠️ a day-row part cannot be nudged or centred — it has no position of its own',
    /if \(selected === 'date' \|\| selected === 'location' \|\| selected === 'time' \|\| selected === PLACE_PICTURE_KEY\) return/.test(ED)
    && /\{!isPart && \(/.test(ED)
    && /const isPart = isWeek && !!\(layout as Layout\)\.days/.test(ED))

  /* ══ 🔴 §B2 AND §B7 · TWO THINGS THAT WERE REAL AND ARE GONE ══════════════════════════════════════
   * ⚠️ BOTH ARE TOMBSTONED RATHER THAN DELETED QUIETLY: "A busy week" is still a server capability and
   * the filled example's upload endpoint and stored file are untouched. What they lost is their door. */
  t('🔴 §B2/§B7 · "A busy week" and the filled example are off the weekly editor',
    !/\{ id: 'busy', label: 'A busy week' \}/.test(WK)
    && /\{ id: 'this', label: 'This week' \},\s*\n\s*\{ id: 'next', label: 'Next week' \},/.test(WK)
    && !/overlayUrl/.test(codeOf(ED))
    && !/Show it faintly/.test(WK)
    && !/Add a filled example/.test(WK)
    /* ⛔ AND THE SERVER SIDE IS UNTOUCHED — `busy` still reaches the render action. */
    && /busy: which === 'busy'/.test(WK)
    && /body\.busy === true/.test(codeOf(read('app/api/weekly-post/route.ts'))))

  /* ══ 🔴 §B8 · THE RESET MESSAGE IS TRUE OR ABSENT ═════════════════════════════════════════════════
   * ⛔ IT WAS SHOWN WHENEVER THE SERVER SAID `resetLayout` — which it says for any new blank of a
   * different SIZE, including a re-export of the same artwork at a higher resolution, where the boxes
   * land exactly where they were. A line claiming the operator's work had moved appeared when nothing
   * had, and stayed until something else replaced it. */
  t('🔴 §B8 · the "boxes have moved" line needs a new SHAPE and boxes that really moved, and it fades',
    /NEW_SHAPE_RESET =/.test(EDCOPY)
    && /if \(done\.resetLayout && shapeChanged && boxesMoved\) setFlash\(NEW_SHAPE_RESET\)/.test(WK)
    && /const shapeChanged = !before/.test(WK)
    && /const boxesMoved = !oldLayout/.test(WK)
    && /setTimeout\(\(\) => \{ setFlashText\(null\); flashTimer\.current = null \}, 5000\)/.test(WK)
    && /data-flash/.test(WK)
    /* ⚠️ AND THE SAME RULE ON THE SINGLE EVENT SCREEN. */
    && /else if \(done\.resetLayout && shapeChanged\) \{\s*\n\s*setFlash\(NEW_SHAPE_RESET\)/.test(read('components/manage/EventPost.tsx'))
    /* ⛔ AND THE OLD UNCONDITIONAL SENTENCE IS GONE FROM BOTH. */
    && !/New image size — the boxes have been reset/.test(WK)
    && !/New picture size — the boxes have been reset/.test(read('components/manage/EventPost.tsx')))

  /* ══ 🔴 §B10 · **THE BUG**: THE DIALOG WAS BELOW THE EARLY RETURNS ════════════════════════════════
   * ⛔ IT WAS RENDERED IN THE BOXES VIEW'S JSX, which is after three `if (view.kind === …) return`
   * branches. So from inside an editor with unsaved changes a pill press set the state and **nothing
   * appeared** — which is exactly what Dominic reported about "Location settings".
   * 🔴 IT IS ONE ELEMENT, BUILT ABOVE THE RETURNS AND INCLUDED BY ALL FOUR. */
  t('🔴 §B10 · the leave dialog is built above the early returns and rendered by every view', (() => {
    const soc = SOC
    const built = soc.indexOf('const leaveDialog = leaveTo && (')
    const firstReturn = soc.indexOf("if (view.kind === 'weekly-post') {")
    return built > 0 && firstReturn > built
      /* ⚠️ ALL FOUR VIEWS INCLUDE IT — three full-page editors and the boxes view. */
      && (soc.match(/\{leaveDialog\}/g) || []).length === 4
  })())
  t('🔴 §B10 · three buttons, and "Save and leave" waits for the save before it leaves',
    /LEAVE_TITLE = 'Save your changes first\?'/.test(EDCOPY)
    && /LEAVE_BODY = 'You’ve changed this design since you last saved\.'/.test(EDCOPY)
    && /LEAVE_SAVE_AND_GO = 'Save and leave'/.test(EDCOPY)
    && /LEAVE_WITHOUT_SAVING = 'Leave without saving'/.test(EDCOPY)
    && /data-save-and-leave/.test(SOC)
    && /data-leave-anyway/.test(SOC)
    && /data-keep-editing/.test(SOC)
    && /try \{ await save\?\.\(\) \} catch \{ setLeaveTo\(null\); return \}/.test(SOC)
    /* 🔴 AND THE EDITOR HANDS ITS SAVE UP, re-registered whenever the layout changes. */
    && /onSaver\?: \(save: \(\(\) => void \| Promise<void>\) \| null\) => void/.test(ED)
    && /onSaver\?\.\(doSave\)/.test(ED)
    && /return \(\) => onSaver\?\.\(null\)/.test(ED)
    && /editorSave\.current = fn/.test(SOC))
  t('🔴 §B10 · "‹ Designs" asks too — one guard, every exit',
    /const back = \(\) => \{\s*\n\s*if \(editorDirty\) \{ setLeaveTo\('back'\); return \}/.test(SOC)
    && /useState<SocialArea \| 'back' \| null>\(null\)/.test(SOC)
    && /const leaveNow = useCallback\(\(to: SocialArea \| 'back'\) => \{/.test(SOC))

  /* ══ 🔴 "All text" › Text size — A NUMBER YOU CHOOSE, NOT TWO NUDGE BUTTONS (10 October 2026) ══════
   * ⛔ "Smaller | Bigger" MADE AN OPERATOR PRESS AND LOOK, PRESS AND LOOK, and never answered the
   * question they were asking. ⚠️ THE NUMBER IS THE DATE BOX'S SIZE AND EVERY BOX MOVES IN PROPORTION:
   * a design's boxes are deliberately different sizes, so setting them all to one number would flatten
   * a hierarchy the truck built on purpose. 🔴 THE REFERENCE BOX LANDS EXACTLY ON WHAT WAS TYPED, which
   * is what keeps the readout and the design agreeing. */
  t('🔴 "All text" has a Text size you choose, and it scales every box in proportion',
    /const setAllTextSize = \(px: number\) => commit\(l => \{/.test(ED)
    && /const ratio = to \/ from/.test(ED)
    && /const from = Math\.max\(1, l\.date\.fontSize\)/.test(ED)
    && /<Stepper value=\{layout\.date\.fontSize\} min=\{6\} max=\{H\} step=\{2\}\s*\n\s*minusLabel="A−" plusLabel="A\+" onChange=\{v => setAllTextSize\(v\)\}/.test(ED)
    && /ALL_TEXT_SIZE_HINT = 'Changes every box at once and keeps the big ones bigger\.'/.test(EDCOPY)
    && /data-all-size-hint>\{ALL_TEXT_SIZE_HINT\}/.test(ED)
    /* ⛔ AND THE TWO BUTTONS ARE GONE, so this cannot pass while they are still on the panel. */
    && !/data-all-smaller/.test(ED) && !/data-all-bigger/.test(ED) && !/scaleAllText/.test(ED))

  /* ⚠️ AND A DRAG CANNOT PRODUCE A BLOCK THE VALIDATOR WOULD REFUSE. `parseDays` requires seven rows
   * that each clear the 8px floor; `DraggableBox`'s own floor is 8 for any box, which is the wrong one
   * here — a block dragged to 8px tall would look saveable and the save would be refused after the
   * work. ⛔ THE SAME RULE THE CLAMP-TO-THE-PICTURE FOLLOWS, and older than this round. */
  t('⛔ a corner drag cannot shrink "The 7 days" below what the validator accepts',
    /minH\?: number/.test(BITS_BOX)
    && /const MIN_H = Math\.max\(MIN, Math\.round\(minH\)\)/.test(BITS_BOX)
    && /minH=\{DAYS_IN_WEEK \* 8\}/.test(ED))

  /* ══ 🔴 §5 (10 October 2026) · ONE FOLD ARROW, AND THE WHOLE ROW OPENS IT ══════════════════════════
   * ⛔ IT WAS `▴` / `▾` SWAPPED BY A TERNARY — two different glyphs, which is two things that can
   * disagree, and at 12px neither reads as an arrow. A triangle pointing UP when open is also the
   * opposite convention from every other disclosure in this product.
   * 🔴 ONE `<svg>` CHEVRON, ROTATED 90° WHEN OPEN, at the brief's 18px. ⚠️ AND ONE COMPONENT: `Section`
   * is the only fold in this editor, so "they can't differ" is structural rather than a convention. */
  t('🔴 §5 · one chevron, rotated — right when closed, down when open, 18px',
    /function FoldArrow\(\{ open \}: \{ open: boolean \}\)/.test(ED)
    && /data-fold-arrow=\{open \? 'open' : 'closed'\}/.test(ED)
    && /width="18" height="18"/.test(ED)
    && /\$\{open \? 'rotate-90' : ''\}/.test(ED)
    && /<FoldArrow open=\{open\} \/>/.test(ED)
    /* ⛔ THE TWO GLYPHS ARE GONE FROM THE DRAWN SOURCE, so this cannot pass while one of them is still
     * being rendered somewhere. */
    && !/\{open \? '▴' : '▾'\}/.test(ED)
    /* 🔴 THE WHOLE HEADING ROW IS THE BUTTON — a 10px label with an 18px arrow is two small targets
     * unless the row between them is one, which on an iPad is the whole control. */
    && /<button type="button" onClick=\{onToggle\} aria-expanded=\{open\} data-fold-head\s*\n\s*className="flex w-full items-center justify-between/.test(ED)
    /* ⚠️ AND EVERY FOLD IN THE EDITOR GOES THROUGH `Section`: three mounts, one component. */
    && (ED.match(/<Section title=/g) || []).length >= 3
    && (ED.match(/function Section\(/g) || []).length === 1)

  /* ══ ⚠️ §B3's LIVE HALF — the overlay draws only what the PNG has not caught up with ══════════════ */
  /* ══ 🔴 §2 (10 October 2026) · THE DARKENING IS THE **SETTING** NOW, NOT THE DIFFERENCE ═══════════
   * ⛔ IT USED TO DRAW ONLY WHAT THE PNG HAD NOT CAUGHT UP WITH, because the stage WAS the PNG and the
   * PNG already had some darkening baked in. With a live tree the stage shows the BLANK, so there is
   * nothing baked in and the layer is simply `layout.darken` — the brief's "the darkening as a CSS
   * layer at the same strength". 🔴 THE OLD SUBTRACTION SURVIVES FOR THE FALLBACK, where the stage is
   * once again the PNG and the old reasoning holds exactly — and BOTH halves are asserted, because a
   * version that kept only one of them would be wrong in one of the two states the screen has. */
  t('⚠️ §B3/§2 · the darkening is a CSS layer at full strength live, and the difference on the PNG',
    /const \[previewDarken, setPreviewDarken\] = useState\(0\)/.test(ED)
    && /setPreviewDarken\(layout\.darken\)/.test(ED)
    && /const liveDarken = liveTree \? layout\.darken : Math\.max\(0, layout\.darken - previewDarken\)/.test(ED)
    && /data-darken-overlay/.test(ED))

  /* ══ 🔴 §2 · THE STAGE DRAWS THE BLANK AND THE WORDS, AND THE PNG IS FOR "👁 Preview post" ════════
   *
   * ⛔ **DOMINIC:** *"when i move a box the text stays in its old position for seconds."* The stage was
   * an `<img>` of the server's PNG, so a drag moved the outline at once and the words waited 400ms of
   * debounce plus a render. 🔴 FOUR CLAIMS, AND EACH IS A WAY THE STALENESS COULD COME BACK:
   *   • the stage's picture is `background.url` **whenever there is a live tree** — never the PNG;
   *   • the tree is built by the RENDERER's own `weeklyTree` / `eventTree`, in the same render;
   *   • the fonts are the renderer's own files, so `fitLines` measures the same widths;
   *   • and the PNG is still what "👁 Preview post" opens.
   * ⚠️ THE TIME IS RE-DERIVED FROM THE LIVE `timeStyle` through `timeTextFor`, which is the function
   * `entryFor` itself uses — without it, switching 12h/24h would leave the old clock on the stage
   * until the week was fetched again, which is this bug in its last hiding place. */
  t('🔴 §2 · the stage draws the blank and every word live; the PNG is only for Preview post',
    /<img data-stage-img src=\{liveTree \? background\.url : \(preview \?\? background\.url\)\}/.test(ED)
    && /<LivePoster tree=\{liveTree\.children\}/.test(ED)
    && /const liveFonts = useLiveFonts\(token, fontFaces\)/.test(ED)
    && /timeTextFor\(e\.status, e\.startTime, e\.endTime, layout\.timeStyle\)/.test(ED)
    /* ⛔ AND THE PNG IS STILL THE THING "Preview post" SHOWS. A live stage that also replaced the
     * preview would have removed the one place an operator can see the real file. */
    && /data-post-preview-img/.test(ED)
    /* ══ 🔴 **ONE CONVERSION FROM POSTER PIXELS TO SCREEN PIXELS** — 10 OCTOBER, AFTER THE BUG ════════
     * ⛔ THE EDITOR USED TO HAND `LivePoster` THE WIDTH THE STAGE WAS **ASKED** TO BE (`shownW`) while
     * every box outline was placed with the width the stage **MEASURED** (`scale`). Two conversions for
     * one job, and the operator found what that costs: *"the box being moved and the words it holds are
     * in different places."* 🔴 IT IS THE BOXES' OWN `scale` NOW, and the design's own width, so there
     * is one number and nothing to drift. ⚠️ `shownW` MUST NOT COME BACK as a prop of this component. */
    && /<LivePoster tree=\{liveTree\.children\} W=\{liveTree\.W\} H=\{liveTree\.H\}/.test(ED)
    && /scale=\{scale\} designW=\{W\} \/>/.test(ED)
    && !/shownW=\{/.test(ED)
    /* 🔴 `LivePoster` MOUNTS THE TREE AND DECIDES NOTHING. ⚠️ Three translations and no more — see its
     * header: the family alias, `box-sizing`, and the one scale. */
    && (() => {
      const LP = read('components/manage/LivePoster.tsx')
      return /liveFamily\(fam\)/.test(LP) && /boxSizing: 'border-box'/.test(LP)
        && /transform: `scale\(\$\{k\}\)`/.test(LP)
        /* ⛔ IT MUST NOT BUILD, FIT OR WORD ANYTHING. A `fitLines` here would be the second renderer
         * this whole design exists to avoid. */
        && !/fitLines/.test(LP) && !/dayCells/.test(LP) && !/locationLinesFor/.test(LP)
    })()
    /* ══ 🔴 AND THE `transform-origin` IS **INLINE**, WHICH IS THE WHOLE OF THE 10 OCTOBER BUG ════════
     * ⛔ IT WAS THE TAILWIND CLASS `origin-top-left`, AND NO COMPILED CHUNK UNDER `.next/static`
     * CONTAINED THE RULE: Tailwind emits only the utilities it finds at build time, and that class was
     * used by exactly one file — created after the build. With no rule, `transform-origin` falls back
     * to the element's CENTRE, and scaling the poster about its centre threw the heading's words to
     * (540, 464) in a 460×575 stage and row 7's 341px below the bottom edge. Both reported symptoms.
     * 🔴 A LOAD-BEARING GEOMETRIC PROPERTY DOES NOT GO IN A CLASS. ⚠️ `scripts/live-text-place.cjs`
     * reads it off the live layer's computed style in a real browser, which is the check that cannot
     * be satisfied by the source alone. */
    && (() => {
      const LP = read('components/manage/LivePoster.tsx')
      return /transformOrigin: 'top left'/.test(LP) && !/className="[^"]*origin-top-left/.test(LP)
    })()
    /* ⛔ AND AN UPLOADED FAMILY IS STILL NEVER SENT TO A BROWSER — the rule `font_sample` states, which
     * §2 does not get to reverse. The GET refuses it and `live-fonts.ts` does not ask. */
    && /if \(ref\.kind === 'own'\) \{/.test(read('app/api/weekly-post/route.ts'))
    && /An uploaded font is not served to the browser\./.test(read('app/api/weekly-post/route.ts')))

  console.log('')
  if (fail) { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exit(1) }
  console.log(`✅ all ${pass} passed`)
})().catch(e => { console.error(e); process.exit(1) })
