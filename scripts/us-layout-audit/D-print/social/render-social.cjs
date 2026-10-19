#!/usr/bin/env node
// scripts/us-layout-audit/D-print/social/render-social.cjs — US layout audit, group D-print, part "social".
//
//   TMPDIR=<scratch> node scripts/us-layout-audit/D-print/social/render-social.cjs
//
// DIAGNOSIS ONLY. Renders the weekly post (legacy rows + the three "7 days" arrangements) and the single-event post
// at 1080x1080 / 1080x1350 / 1080x1920 for a GB truck (24h, Monday weeks) and a US truck (12h, Sunday weeks) through
// the REAL renderer (lib/weekly-post/render.ts -> draw.ts -> fit.ts, satori via next/og), compiled with the repo's
// own helper scripts/_slot-interval-compile.cjs (the same route scripts/_weekly-post-examples.cjs takes). fit.ts's
// `fitLines` is wrapped (not copied) so every box's asked size, fitted size, floor and truncation is recorded.
// Fixture truck: Pizza Kitchen (test-truck / test-kitchen). Synthetic gradient blank. No DB, no network.
// Output: PNG pairs (downscaled to 540 wide) + measurements JSON in the scratch dir (read by make-findings.cjs).

const path = require('path')
const fs = require('fs')
const REPO = path.resolve(__dirname, '../../../..')
process.chdir(REPO)                                  // fonts.ts reads assets/ relative to cwd
const SCRATCH = process.env.USAUDIT_SCRATCH || process.env.TMPDIR
if (!SCRATCH) throw new Error('set TMPDIR / USAUDIT_SCRATCH to the scratchpad')
process.env.TMPDIR = SCRATCH                         // _slot-interval-compile uses os.tmpdir()
const { compile } = require(path.join(REPO, 'scripts/_slot-interval-compile.cjs'))
const sharp = require(path.join(REPO, 'node_modules/sharp'))

const OUT_PNG = path.join(REPO, 'docs/us-layout-audit/D-print')
fs.mkdirSync(OUT_PNG, { recursive: true })

const LIB = [
  'lib/weekly-post/week.ts', 'lib/weekly-post/week-data.ts', 'lib/weekly-post/layout.ts', 'lib/weekly-post/days.ts',
  'lib/weekly-post/fit.ts', 'lib/weekly-post/draw.ts', 'lib/weekly-post/render.ts', 'lib/weekly-post/locale.ts',
  'lib/weekly-post/format.ts', 'lib/weekly-post/words.ts', 'lib/weekly-post/fonts.ts', 'lib/weekly-post/font-list.ts',
  'lib/weekly-post/font-bundle.ts', 'lib/weekly-post/ttf-metrics.ts', 'lib/time-utils.ts', 'lib/schedule-graphics/places.ts',
]
const c = compile(REPO, LIB, 'usaudit-D-social')
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* there */ }
const M = {
  week: c.req('lib/weekly-post/week.js'),
  data: c.req('lib/weekly-post/week-data.js'),
  layout: c.req('lib/weekly-post/layout.js'),
  days: c.req('lib/weekly-post/days.js'),
  fit: c.req('lib/weekly-post/fit.js'),
  draw: c.req('lib/weekly-post/draw.js'),
  render: c.req('lib/weekly-post/render.js'),
  fonts: c.req('lib/weekly-post/fonts.js'),
  fontList: c.req('lib/weekly-post/font-list.js'),
  bundle: c.req('lib/weekly-post/font-bundle.js'),
  metrics: c.req('lib/weekly-post/ttf-metrics.js'),
}
const { ImageResponse } = require(path.join(REPO, 'node_modules/next/og.js'))

// ── wrap fitLines (record, never alter) ──────────────────────────────────────────────────────────────
let REC = []
const realFit = M.fit.fitLines
const plain = runs => runs.map(r => r.text).join('')
M.fit.fitLines = function wrapped(input) {
  const res = realFit(input)
  const m = input.metrics
  const asked = Math.max(M.fit.ABSOLUTE_MIN_FONT, Math.round(input.fontSize))
  const ls = Number.isFinite(input.lineSpacing) ? input.lineSpacing : 100
  const gap = M.fit.LINE_GAP * (Math.min(300, Math.max(50, ls)) / 100)
  const perUnit = input.lines.reduce((s, l) => s + M.metrics.lineHeightPx(m, 1) * (l.scale ?? 1) * gap, 0)
  const maxByHeight = perUnit > 0 ? Math.floor(input.h / perUnit) : asked
  const ceiling = Math.max(M.fit.ABSOLUTE_MIN_FONT, Math.min(asked, maxByHeight))
  const floor = Math.max(M.fit.ABSOLUTE_MIN_FONT, Math.min(ceiling, Math.round(asked * M.fit.MIN_FONT_FRACTION)))
  // natural width of the widest line at the asked size (how much it wanted)
  let natW = 0
  for (const l of input.lines) {
    let w = 0
    for (const r of l.runs) w += M.metrics.measureText(r.text, m, (r.raised ? asked * M.fit.RAISED_SCALE : asked) * (l.scale ?? 1), 0)
    natW = Math.max(natW, w)
  }
  REC.push({
    inText: input.lines.map(l => plain(l.runs)), outText: res.lines.map(l => plain(l.runs)),
    w: input.w, h: input.h, asked, ceiling, floor, fitted: res.fontSize, truncated: res.truncated,
    droppedLines: input.lines.length - res.lines.length, usedWidth: Math.round(res.usedWidth * 10) / 10,
    naturalWidthAtAsked: Math.round(natW * 10) / 10, wrapToTwo: !!input.wrapToTwo,
  })
  return res
}

// ── tree walk: box rects + text, to place the annotations ────────────────────────────────────────────
function textOf(el) {
  if (el == null) return ''
  if (typeof el === 'string') return el
  if (Array.isArray(el)) return el.map(textOf).join('')
  const ch = el.props && el.props.children
  if (Array.isArray(ch) && ch.length && ch.every(x => x && x.type === 'div' && x.props && x.props.style && x.props.style.width === '100%')) {
    return ch.map(textOf).join('\n')        // one lineEl per line
  }
  return textOf(ch)
}
function boxesOf(children) {
  const out = []
  for (const el of children) {
    const s = el && el.props && el.props.style
    if (!s || s.overflow !== 'hidden') continue
    out.push({ x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height), text: textOf(el) })
  }
  return out
}

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────
const NOW = { GB: '2026-09-30T10:50:00Z', US: '2026-09-30T15:50:00Z' }       // Wed 30 Sep 2026 11:50 local
const CFG = { GB: { timeZone: 'Europe/London', weekStart: 'monday' }, US: { timeZone: 'America/New_York', weekStart: 'sunday' } }
const TS = { GB: '24h', US: '12h' }
const SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] }
const ev = (id, date, s, e, venue, town) => ({ id, event_date: date, start_time: s, end_time: e, venue_name: venue, town, status: 'confirmed' })
// One event set keyed by DATE (Sun 27 Sep .. Sun 4 Oct), so each poster takes its own 7 days and a date carries the
// same events in both countries. Every day trades; four days have two events. Worst-case times and long names.
const EVENTS = [
  ev('e01', '2026-09-27', '11:30', '22:45', 'Great Waldingfield Recreation Ground', 'Great Waldingfield'),
  ev('e02', '2026-09-28', '11:30', '22:45', 'Lavenham Village Hall', 'Lavenham'),
  ev('e03', '2026-09-28', '20:00', '00:30', 'Long Melford Country Park', 'Long Melford'),
  ev('e04', '2026-09-29', '20:00', '00:30', 'The Kings Arms Beer Garden', 'Bury St Edmunds'),
  ev('e05', '2026-09-30', '11:30', '22:45', 'Great Waldingfield Recreation Ground', 'Great Waldingfield'),
  ev('e06', '2026-09-30', '20:00', '00:30', 'Abbey Gardens Food Festival', 'Bury St Edmunds'),
  ev('e07', '2026-10-01', '11:30', '22:45', 'Clare Castle Country Park', 'Clare'),
  ev('e08', '2026-10-02', '11:30', '22:45', 'Market Square', 'Sudbury'),
  ev('e09', '2026-10-02', '20:00', '00:30', 'The Bull Inn', 'Cavendish'),
  ev('e10', '2026-10-03', '11:30', '22:45', 'Church Green', 'Long Melford'),
  ev('e11', '2026-10-03', '20:00', '00:30', 'Hadleigh Guildhall Courtyard', 'Hadleigh'),
  ev('e12', '2026-10-04', '11:30', '22:45', 'Great Waldingfield Recreation Ground', 'Great Waldingfield'),
]
const EVENT_ONE = ev('one', '2026-09-30', '11:30', '22:45', 'Great Waldingfield Recreation Ground', 'Great Waldingfield')
const EVENT_MID = ev('mid', '2026-09-30', '20:00', '00:30', 'Great Waldingfield Recreation Ground', 'Great Waldingfield')

function weekFor(cc, ts = TS[cc]) {
  const range = M.week.weekRange('this', NOW[cc], CFG[cc])
  return M.data.buildWeekData(range, EVENTS, [], { timeStyle: ts, showCancelled: true })
}
function weeklyLayout(variant, W, H, cc, fontId) {
  const l = M.layout.defaultLayout(W, H, cc)
  if (fontId) for (const k of ['heading', 'date', 'location', 'time']) l[k].fontId = fontId
  if (fontId) l.textStyle = { ...l.textStyle, fontId }
  l.timeStyle = TS[cc]
  if (variant === 'rows') return l                              // an unopened (legacy) design
  l.days = M.days.daysFromLegacy(l)                             // what the editor converts to on open
  if (variant === 'dayontop' || variant === 'bigpicture') {
    l.days.arrangement = variant === 'dayontop' ? 'dayOnTop' : 'bigPicture'
    l.days.parts = M.days.QUICK_LAYOUTS[l.days.arrangement].parts.map(p => ({ ...p }))
    l.days.textH = Math.round(l.days.h / 7)                     // a quick layout gets the whole row
  }
  if (variant === 'bigpicture') { l.placePicture.enabled = true; l.placePicture.ifMissing = 'blank' }
  return l
}
function eventLayout(W, H, cc, fontId) {
  const l = M.layout.defaultEventLayout(W, H)
  if (fontId) { for (const k of ['date', 'location', 'town', 'time']) l[k].fontId = fontId; l.textStyle = { ...l.textStyle, fontId } }
  l.timeStyle = TS[cc]
  return l
}
const fontsFor = ids => M.bundle.makeFontBundle(M.fonts.bundledFontFiles([M.fontList.DEFAULT_FONT_ID, ...ids]))

function measureWeekly(variant, W, H, cc, fontId) {
  const layout = weeklyLayout(variant, W, H, cc, fontId)
  const week = weekFor(cc)
  REC = []
  const fonts = fontsFor(M.layout.fontsUsedBy(layout).map(f => f.id))
  const tree = M.draw.weeklyTree({ layout, week, fonts, country: cc })
  const recs = pairBoxes(REC.slice(), boxesOf(tree.children)); REC = []
  return { layout, week, recs, warnings: tree.warnings }
}
function measureEvent(W, H, cc, evt, fontId) {
  const layout = eventLayout(W, H, cc, fontId)
  const entry = M.data.entryFor(evt, [], TS[cc])
  REC = []
  const fonts = fontsFor(M.layout.fontsUsedByEvent(layout).map(f => f.id))
  const tree = M.draw.eventTree({ layout, entry, date: evt.event_date, fonts, country: cc })
  const recs = pairBoxes(REC.slice(), boxesOf(tree.children)); REC = []
  return { layout, entry, recs, warnings: tree.warnings }
}
function pairBoxes(recs, boxes) {
  let j = 0
  for (const r of recs) {
    const want = r.outText.join('\n')
    while (j < boxes.length && boxes[j].text !== want) j++
    if (j < boxes.length) { r.rect = { x: boxes[j].x, y: boxes[j].y, w: boxes[j].w, h: boxes[j].h }; j++ }
  }
  return recs
}
const DAY = /monday|tuesday|wednesday|thursday|friday|saturday|sunday|^(mon|tue|wed|thu|fri|sat|sun)\b|\d{2}\/\d{2}|september|october|^\d+(st|nd|rd|th)/i
function classify(recs, kind) {
  let day = null
  return recs.map((r, i) => {
    const t = r.inText.join(' | ')
    let box
    if (kind === 'weekly' && i === 0) box = 'heading'
    else if (DAY.test(r.inText[0])) { box = 'date'; day = r.inText.join(' ') }
    else if (/\d(am|pm)\b|\d{2}:\d{2}|^cancelled$/i.test(r.inText[0])) box = 'time'
    else box = kind === 'event' && i > 0 && r.inText.length === 1 && /^(Great Waldingfield|Bury|Lavenham|Clare)$/.test(t) ? 'town' : 'place'
    return { ...r, box, day }
  })
}

async function blank(W, H) {
  const el = { type: 'div', props: { style: { display: 'flex', position: 'relative', width: `${W}px`, height: `${H}px`,
    background: 'linear-gradient(160deg,#0f172a 0%,#7c2d12 55%,#f97316 100%)' }, children: [
    { type: 'div', props: { style: { position: 'absolute', left: 0, top: `${Math.round(H * 0.025)}px`, width: `${W}px`, display: 'flex', justifyContent: 'center',
      fontSize: `${Math.round(H * 0.026)}px`, color: '#ffffff', opacity: 0.5, letterSpacing: '4px' }, children: 'PIZZA KITCHEN · SYNTHETIC BLANK' } }] } }
  const buf = Buffer.from(await new ImageResponse(el, { width: W, height: H }).arrayBuffer())
  return 'data:image/png;base64,' + buf.toString('base64')
}
async function savePng(buf, name) {
  const file = path.join(OUT_PNG, name)
  await sharp(buf).resize({ width: 540 }).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(file)
  return path.relative(REPO, file)
}

;(async () => {
  const result = { shots: [], sweep: [], extra: {} }
  const blanks = {}
  for (const [sz, [W, H]] of Object.entries(SIZES)) blanks[sz] = await blank(W, H)

  // 1. PNG pairs + measurements, default font (Oswald)
  for (const [sz, [W, H]] of Object.entries(SIZES)) {
    for (const variant of ['rows', 'oneline', 'dayontop', 'bigpicture']) {
      const shot = { template: `weekly-${variant}`, size: sz, W, H, scale: 540 / W }
      for (const cc of ['GB', 'US']) {
        const m = measureWeekly(variant, W, H, cc)
        const out = await M.render.renderWeeklyPost({ layout: m.layout, week: m.week, blankDataUri: blanks[sz], country: cc })
        const png = await savePng(out.png, `social-weekly-${variant}-${sz}-${cc.toLowerCase()}.png`)
        shot[cc] = { png, recs: classify(m.recs, 'weekly'), warnings: out.warnings }
      }
      result.shots.push(shot)
    }
    for (const [key, evt] of [['event', EVENT_ONE], ['event-midnight', EVENT_MID]]) {
      const shot = { template: key, size: sz, W, H, scale: 540 / W }
      for (const cc of ['GB', 'US']) {
        const m = measureEvent(W, H, cc, evt)
        const out = await M.render.renderEventPost({ layout: m.layout, entry: m.entry, date: evt.event_date, backgroundDataUri: blanks[sz], country: cc })
        // the midnight event post is measured at every size but only saved at portrait, to keep the PNG budget small
        const png = key === 'event' || sz === 'portrait'
          ? await savePng(out.png, `social-${key}-${sz}-${cc.toLowerCase()}.png`) : null
        shot[cc] = { png, recs: classify(m.recs, 'event'), warnings: out.warnings }
      }
      result.shots.push(shot)
    }
  }

  // 1b. The worst families from the sweep (wide faces), weekly "7 days" one-line: Montserrat portrait, Archivo Black square
  for (const [font, sz] of [['montserrat', 'portrait'], ['archivoblack', 'square']]) {
    const [W, H] = SIZES[sz]
    const shot = { template: `weekly-oneline-${font}`, size: sz, W, H, scale: 540 / W, font }
    for (const cc of ['GB', 'US']) {
      const m = measureWeekly('oneline', W, H, cc, font)
      const out = await M.render.renderWeeklyPost({ layout: m.layout, week: m.week, blankDataUri: blanks[sz], country: cc })
      const png = await savePng(out.png, `social-weekly-oneline-${font}-${sz}-${cc.toLowerCase()}.png`)
      shot[cc] = { png, recs: classify(m.recs, 'weekly'), warnings: out.warnings }
    }
    result.shots.push(shot)
  }

  // 2. Measurement-only sweep: every bundled family, portrait + story, weekly oneline/dayontop/rows + event
  for (const f of M.fontList.FONT_CHOICES) {
    for (const sz of ['square', 'portrait', 'story']) {
      const [W, H] = SIZES[sz]
      for (const variant of ['rows', 'oneline', 'dayontop']) {
        const row = { font: f.id, size: sz, template: `weekly-${variant}` }
        for (const cc of ['GB', 'US']) row[cc] = classify(measureWeekly(variant, W, H, cc, f.id).recs, 'weekly')
        result.sweep.push(row)
      }
      const row = { font: f.id, size: sz, template: 'event' }
      for (const cc of ['GB', 'US']) row[cc] = classify(measureEvent(W, H, cc, EVENT_ONE, f.id).recs, 'event')
      result.sweep.push(row)
    }
  }

  // 3. Extras: GB on its DEFAULT 12h clock (so the clock vs the country can be told apart), date styles, heading
  {
    const [W, H] = SIZES.portrait
    const l = weeklyLayout('oneline', W, H, 'GB'); l.timeStyle = '12h'
    REC = []
    M.draw.weeklyTree({ layout: l, week: weekFor('GB', '12h'), fonts: fontsFor(['oswald']), country: 'GB' })
    result.extra.gb12h = classify(REC, 'weekly')
    result.extra.dateStyles = []
    for (const ds of ['long', 'short', 'dayMonth', 'numeric']) for (const two of [true, false]) {
      const row = { dateStyle: ds, twoLines: two }
      for (const cc of ['GB', 'US']) {
        const ll = weeklyLayout('oneline', W, H, cc); ll.dateStyle = ds; ll.date.twoLines = two
        REC = []; M.draw.weeklyTree({ layout: ll, week: weekFor(cc), fonts: fontsFor(['oswald']), country: cc })
        row[cc] = classify(REC, 'weekly').filter(r => r.box === 'date' || r.box === 'heading')
      }
      result.extra.dateStyles.push(row)
    }
    // the GB stored heading kept on a US truck (a stored heading is never replaced)
    const lu = weeklyLayout('oneline', W, H, 'US'); lu.heading.text = 'Week commencing {start} to {end}'
    REC = []; M.draw.weeklyTree({ layout: lu, week: weekFor('US'), fonts: fontsFor(['oswald']), country: 'US' })
    result.extra.usWithGbHeading = classify(REC, 'weekly')[0]
    // event post date one line vs two
    for (const two of [true, false]) for (const cc of ['GB', 'US']) {
      const le = eventLayout(W, H, cc); le.date.twoLines = two
      REC = []; M.draw.eventTree({ layout: le, entry: M.data.entryFor(EVENT_ONE, [], TS[cc]), date: EVENT_ONE.event_date, fonts: fontsFor(['oswald']), country: cc })
      result.extra[`eventDate_${cc}_two${two}`] = classify(REC, 'event')[0]
    }
  }

  fs.writeFileSync(path.join(SCRATCH, 'usaudit-D-social-measure.json'), JSON.stringify(result, null, 1))
  fs.rmSync(c.out, { recursive: true, force: true })
  console.log('shots', result.shots.length, 'sweep rows', result.sweep.length)
})().catch(e => { console.error(e && e.stack || e); process.exit(1) })
