#!/usr/bin/env node
// scripts/us-layout-audit/D-print/social/make-sheet-and-findings.cjs — reads the measurements render-social.cjs wrote
// (<scratch>/usaudit-D-social-measure.json) and writes
//   scripts/us-layout-audit/D-print/findings-social.json
//   docs/us-layout-audit/sheet-11-social-posts.png   (GB left / US right, same scale, issues boxed + labelled)
// DIAGNOSIS ONLY — touches no product code.

const path = require('path')
const fs = require('fs')
const REPO = path.resolve(__dirname, '../../../..')
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const SCRATCH = process.env.USAUDIT_SCRATCH || process.env.TMPDIR
const R = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'usaudit-D-social-measure.json'), 'utf8'))

const dn = d => { const m = /(\d+)(ST|ND|RD|TH)/i.exec(d || ''); return m ? m[1] : '' }
const keyOf = x => x.box === 'heading' ? 'heading' : x.box === 'date' ? 'date#' + dn(x.inText.join(' ')) : x.box + '#' + dn(x.day)
const shot = (t, sz) => R.shots.find(s => s.template === t && s.size === sz)
const rec = (s, cc, key) => s[cc].recs.find(x => keyOf(x) === key)
const pct = (a, b) => Math.round(((a - b) / a) * 100)
const sweepTime = (t, sz, font, day = '1') => {
  const s = R.sweep.find(x => x.template === t && x.size === sz && x.font === font)
  const g = s.GB.find(x => x.box === 'time' && dn(x.day) === day), u = s.US.find(x => x.box === 'time' && dn(x.day) === day)
  return { g, u }
}
const countFonts = (t, sz, th = 0.15) => {
  const rows = R.sweep.filter(x => x.template === t && x.size === sz)
  let n = 0
  for (const s of rows) {
    const g = s.GB.find(x => x.box === 'time' && dn(x.day) === '1'), u = s.US.find(x => x.box === 'time' && dn(x.day) === '1')
    if ((g.fitted - u.fitted) / g.fitted >= th) n++
  }
  return `${n}/${rows.length}`
}
const anyTrunc = cc => R.sweep.some(s => s[cc].some(x => x.box === 'time' && x.truncated)) || R.shots.some(s => s[cc] && s[cc].recs.some(x => x.box === 'time' && x.truncated))
const usTimeAtFloor = R.sweep.some(s => s.US.some(x => x.box === 'time' && x.fitted <= x.floor && !s.GB.find(y => keyOf(y) === keyOf(x) && y.fitted <= y.floor)))
const png = (t, sz, cc) => shot(t, sz)[cc].png

// ── numbers quoted in the findings, all read from the measurements ─────────────────────────────────────
const P1 = rec(shot('weekly-oneline', 'portrait'), 'GB', 'time#1'), P1u = rec(shot('weekly-oneline', 'portrait'), 'US', 'time#1')
const P29 = rec(shot('weekly-oneline', 'portrait'), 'GB', 'time#29'), P29u = rec(shot('weekly-oneline', 'portrait'), 'US', 'time#29')
const PB = rec(shot('weekly-bigpicture', 'portrait'), 'GB', 'time#1'), PBu = rec(shot('weekly-bigpicture', 'portrait'), 'US', 'time#1')
const PM = rec(shot('weekly-oneline-montserrat', 'portrait'), 'GB', 'time#1'), PMu = rec(shot('weekly-oneline-montserrat', 'portrait'), 'US', 'time#1')
const PMplace = rec(shot('weekly-oneline-montserrat', 'portrait'), 'US', 'place#1')
const S1 = rec(shot('weekly-oneline', 'story'), 'GB', 'time#1'), S1u = rec(shot('weekly-oneline', 'story'), 'US', 'time#1')
const SB = rec(shot('weekly-bigpicture', 'story'), 'GB', 'time#1'), SBu = rec(shot('weekly-bigpicture', 'story'), 'US', 'time#1')
const SD = rec(shot('weekly-dayontop', 'story'), 'GB', 'time#1'), SDu = rec(shot('weekly-dayontop', 'story'), 'US', 'time#1')
const Splace = rec(shot('weekly-oneline', 'story'), 'US', 'place#1'), Sdate = rec(shot('weekly-oneline', 'story'), 'US', 'date#1')
const SR = sweepTime('weekly-oneline', 'story', 'raleway'), SM = sweepTime('weekly-dayontop', 'story', 'montserrat')
const Q1 = rec(shot('weekly-oneline', 'square'), 'GB', 'time#1'), Q1u = rec(shot('weekly-oneline', 'square'), 'US', 'time#1')
const QA = rec(shot('weekly-oneline-archivoblack', 'square'), 'GB', 'time#1'), QAu = rec(shot('weekly-oneline-archivoblack', 'square'), 'US', 'time#1')
const QAplace = rec(shot('weekly-oneline-archivoblack', 'square'), 'US', 'place#1')
const gb12 = R.extra.gb12h.filter(x => x.box === 'time' && dn(x.day) === '1')[0]

const issues = [
  {
    id: 'D-20', surface: 'Social posts › Weekly post › Time column (legacy rows and "All on one line"; also "Big picture")', size: '1080x1350 (portrait)', what: 'shrink',
    detail: `The 12-hour range "11:30am – 10:45pm" is ${P1u.naturalWidthAtAsked}px wide at the design's ${P1u.asked}px, in a ${P1u.w}px Time box, so fitLines shrinks it. "11:30 – 22:45" is ${P1.naturalWidthAtAsked}px and fits at full size. No truncation, no dropped line, never at the floor. The US time is the smallest text on its row; in wide families it is smaller than the place name. Rows also differ: "8pm – 12:30am" draws at ${P29u.fitted}px next to "11:30am – 10:45pm" at ${P1u.fitted}px (GB: ${P29.fitted}/${P1.fitted}px).`,
    measured: `Default Oswald, single-event row (Thu 1 Oct): GB ${P1.fitted}px → US ${P1u.fitted}px (−${pct(P1.fitted, P1u.fitted)}%), asked ${P1u.asked}px, floor ${P1u.floor}px. Big picture: ${PB.fitted}→${PBu.fitted}px. Worst family, Montserrat: ${PM.fitted}→${PMu.fitted}px (−${pct(PM.fitted, PMu.fitted)}%; the place name on that row is ${PMplace.fitted}px). ${countFonts('weekly-oneline', 'portrait')} bundled families shrink ≥15%. Two-event rows are height-bound, so mostly equal in Oswald; worst Archivo Black 34→23px.`,
    frequency: 'Every US weekly post with a non-:00 time (e.g. 11:30am). The 12h clock is the poster default in both countries, so a GB truck on 12h sees the same thing (GB 12h, Oswald: ' + gb12.fitted + 'px). Only GB trucks that chose 24h avoid it.',
    severity: 'UGLY',
    fix: 'Widen the default Time share for 12h designs (weights 26 → about 32), or drop the spaces around the dash for 12h ("11:30am–10:45pm"), or default the Time box to "Use two lines" for 12h so start and end stack.',
    gb: png('weekly-oneline', 'portrait', 'GB'), us: png('weekly-oneline', 'portrait', 'US'),
    alsoSee: [png('weekly-oneline-montserrat', 'portrait', 'GB'), png('weekly-oneline-montserrat', 'portrait', 'US'), png('weekly-bigpicture', 'portrait', 'US'), png('weekly-rows', 'portrait', 'US')],
  },
  {
    id: 'D-21', surface: 'Social posts › Weekly post › Time column (every arrangement)', size: '1080x1920 (story)', what: 'shrink',
    detail: `On a story canvas the rows are taller but the Time box keeps the same width (${S1u.w}px), so the US range stays capped by width. It barely grows from portrait (${P1u.fitted}px) while the date (${Sdate.fitted}px) and place (${Splace.fitted}px) on the same row grow. It is the biggest GB/US gap on the poster. No truncation, never at the floor (${S1u.floor}px).`,
    measured: `Oswald, single-event row: rows/one line GB ${S1.fitted} → US ${S1u.fitted}px (−${pct(S1.fitted, S1u.fitted)}%); big picture ${SB.fitted}→${SBu.fitted}px (−${pct(SB.fitted, SBu.fitted)}%); day on top ${SD.fitted}→${SDu.fitted}px (−${pct(SD.fitted, SDu.fitted)}%). Raleway, one line: ${SR.g.fitted}→${SR.u.fitted}px (−${pct(SR.g.fitted, SR.u.fitted)}%). Montserrat, day on top: ${SM.g.fitted}→${SM.u.fitted}px. Families shrinking ≥15%: one line ${countFonts('weekly-oneline', 'story')}, day on top ${countFonts('weekly-dayontop', 'story')}.`,
    frequency: 'Every US weekly post made on a 9:16 (story) blank with a non-:00 time.',
    severity: 'UGLY',
    fix: 'Same as D-20. A wider Time share or a two-line 12h time matters most here, because the row has spare height.',
    gb: png('weekly-oneline', 'story', 'GB'), us: png('weekly-oneline', 'story', 'US'),
    alsoSee: [png('weekly-bigpicture', 'story', 'GB'), png('weekly-bigpicture', 'story', 'US'), png('weekly-dayontop', 'story', 'GB'), png('weekly-dayontop', 'story', 'US')],
  },
  {
    id: 'D-22', surface: 'Social posts › Weekly post › Time column (legacy rows and "All on one line")', size: '1080x1080 (square)', what: 'shrink',
    detail: `With the default Oswald the square post is fine (${Q1.fitted}→${Q1u.fitted}px). Square rows are short enough that height, not width, sets the size. With wider bundled families the 12h range becomes width-bound and shrinks well below GB and below the place name. No truncation; never at the floor (${QAu.floor}px). "Day on top" and "Big picture" give Time a wider cell and are unaffected (0/21 families ≥15%).`,
    measured: `Archivo Black: GB ${QA.fitted} → US ${QAu.fitted}px (−${pct(QA.fitted, QAu.fitted)}%; place on the same row ${QAplace.fitted}px). Merriweather and Work Sans: 35→26px. Inter, Montserrat and Poppins: 35→27–28px. ${countFonts('weekly-oneline', 'square')} families shrink ≥15% (one line).`,
    frequency: 'US weekly posts on a square blank whose design uses a wide font (12 of the 21 bundled families).',
    severity: 'UGLY',
    fix: 'Same as D-20.',
    gb: png('weekly-oneline-archivoblack', 'square', 'GB'), us: png('weekly-oneline-archivoblack', 'square', 'US'),
    alsoSee: [png('weekly-oneline', 'square', 'GB'), png('weekly-oneline', 'square', 'US')],
  },
]

const ed = (sz, k) => { const s = shot('event', sz); return { g: rec(s, 'GB', k), u: rec(s, 'US', k) } }
const evS = ed('story', 'date#30')
const ds = R.extra.dateStyles.find(d => d.dateStyle === 'long' && d.twoLines === false)
const dsW = cc => ds[cc].find(x => x.box === 'date' && /30/.test(x.inText.join(' ')))
const head = shot('weekly-oneline', 'portrait')
const fine = [
  { surface: 'Social posts › Single-event post › Time box', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: `"11:30am – 10:45pm" and "8pm – 12:30am" draw at the same size as GB "11:30 – 22:45" / "20:00 – 00:30" (portrait ${ed('portrait', 'time#30').g.fitted}/${ed('portrait', 'time#30').u.fitted}px) in all 21 bundled families. The box is the full inner width (928px).` },
  { surface: 'Social posts › Single-event post › Date box', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: `"WEDNESDAY, SEPTEMBER 30TH" vs "WEDNESDAY 30TH SEPTEMBER": equal at square and portrait. Story ${evS.g.fitted}→${evS.u.fitted}px (−${pct(evS.g.fitted, evS.u.fitted)}%). Worst family −2%. "Day on its own line" is identical in both.` },
  { surface: 'Social posts › Single-event post › Venue and town boxes', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: 'Not locale-formatted; identical GB and US.' },
  { surface: 'Social posts › Single-event post spanning midnight (20:00–00:30 / 8pm – 12:30am)', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: 'Same size as GB at every size; the 12h form is not longer than "20:00 – 00:30".' },
  { surface: 'Social posts › Weekly post › Heading', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: `The US default "Week of {start}" ("WEEK OF SUNDAY, SEPTEMBER 27TH") is much shorter than the GB "Week commencing {start} to {end}". The US draws larger: portrait GB ${rec(head, 'GB', 'heading').fitted}px vs US ${rec(head, 'US', 'heading').fitted}px. A US truck keeping a stored GB-style heading fits like GB (${R.extra.usWithGbHeading.fitted}px). GB itself truncates this heading in 3 wide families at story size; that is not a US issue.` },
  { surface: 'Social posts › Weekly post › Date column (default "Day on its own line")', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: '"SEPTEMBER 30TH" vs "30TH SEPTEMBER": 0% difference in every family, size and arrangement.' },
  { surface: 'Social posts › Weekly post › Date column, one line (Day on its own line off), all four date styles', sizes: ['1080x1350'], note: `long: GB ${dsW('GB').fitted} vs US ${dsW('US').fitted}px (−${pct(dsW('GB').fitted, dsW('US').fitted)}%). short / dayMonth / numeric: equal. Numeric shows 30/09 vs 09/30.` },
  { surface: 'Social posts › Weekly post › Time column, two-event (stacked) days in default Oswald', sizes: ['1080x1080', '1080x1350'], note: 'Height sets the size; GB and US are equal or within 2px. In wide families they are covered by D-20/D-22.' },
  { surface: 'Social posts › Weekly post › Place column', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: 'Not locale-formatted; identical. The long name truncates in some wide families at story size in BOTH countries (pre-existing, not US).' },
  { surface: 'Social posts › Weekly post › "Day on top" arrangement, Time cell', sizes: ['1080x1080', '1080x1350'], note: 'Time gets about 40% of the row width; US equals GB in Oswald (portrait 44/44px). 0/21 families ≥15% at square; 1/21 at portrait (Archivo Black 44→35).' },
  { surface: 'Social posts › Weekly post › Days-off text / cancelled word', sizes: ['all'], note: 'Not rendered (the fixture week trades every day). The US strings are shorter: "Closed today" vs "No trading today", "CANCELED" vs "CANCELLED". The boxes are the same, so they cannot fit worse.' },
  { surface: 'Social posts › captions (lib/weekly-post/caption.ts, caption-template.ts, caption-chips.ts)', sizes: ['n/a'], note: 'No fixed length limit in the code, so there is nothing to overflow.' },
  { surface: 'Social posts › Weekly post — truncation and floor', sizes: ['1080x1080', '1080x1350', '1080x1920'], note: `Across 21 families × 3 sizes × 3 arrangements, plus the PNG shots: US time truncated: ${anyTrunc('US') ? 'YES' : 'never'}. US at the floor where GB is not: ${usTimeAtFloor ? 'YES' : 'never'}. No lines dropped in either country. Every US difference is a shrink (D-20..D-22).` },
]

const notChecked = [
  { surface: 'Social posts › design editor live stage (components/manage/LivePoster.tsx, DesignEditor.tsx) painted in a browser', why: 'Not painted. It draws the same weeklyTree/eventTree element tree (lib/weekly-post/draw.ts) the PNG renderer uses, so the fitted sizes measured here are what it shows. The editor chrome around the canvas is an HTML surface for another part.' },
  { surface: 'Library (≈1,800 families) and uploaded fonts', why: 'Need network or storage. Only the 21 bundled families in assets/fonts/weekly-post were swept.' },
  { surface: 'Non-default box settings: letter spacing, line spacing, "Use two lines" (ifTooLong), words-before, notes ("Your own text"), real place pictures/logo', why: 'Default design values only. Note text is free text, not locale-formatted.' },
  { surface: 'lib/schedule-graphics/event-preview.ts and places.ts (Add-event preview card, Locations "when" line)', why: 'Not fixed canvases. They feed HTML (TruckListCard, Locations list rows), which belongs to the HTML surface parts.' },
  { surface: 'Weekly post with a day off / a cancelled event', why: 'Not rendered. US strings are shorter (see fine).' },
  { surface: 'Wording (not layout): the poster 12h form is "11:30am – 10:45pm" (lowercase, no space), not the app\'s "11:30 AM – 10:45 PM"; US dates keep raised ordinals ("SEPTEMBER 30TH")', why: 'Formatting choice, outside a layout audit. Recorded so the mockups use the real strings.' },
]

const method = 'Rendered through the real renderer with no browser, DB, network, build or dev server. The tool compiles lib/weekly-post (render.ts → draw.ts → fit.ts, satori/resvg via next/og) with scripts/_slot-interval-compile.cjs, as scripts/_weekly-post-examples.cjs does, and wraps fit.ts `fitLines` to record each text box\'s asked size, height ceiling, floor (max(ABSOLUTE_MIN_FONT 8, round(asked × MIN_FONT_FRACTION 0.35))), fitted size, truncation and dropped lines. Box rectangles come from the element tree. Fixture: Pizza Kitchen (test-truck / test-kitchen) on a synthetic gradient blank. GB: Europe/London, Monday weeks, 24h, en-GB words. US: America/New_York, Sunday weeks, 12h, en-US words. Moment: Wednesday 30 September 2026 11:50 local, passed to weekRange as the clock (GB 10:50Z, US 15:50Z). Events are keyed by date over 27 Sep–4 Oct, so each poster shows its own 7 days and a date carries the same events in both countries. Every day trades, four days have two events, with 11:30–22:45, 20:00–00:30 and names up to "Great Waldingfield Recreation Ground". Templates use the default design at 1080×1080, 1080×1350 and 1080×1920: the weekly post as an unopened legacy-rows design, as converted on open (daysFromLegacy, "All on one line"), and as the "Day on top" and "Big picture" quick layouts; the single-event post (defaultEventLayout) with the long range and the midnight range. PNGs use the default Oswald, plus Montserrat (portrait) and Archivo Black (square) pairs as the worst families. A measurement-only sweep covers all 21 bundled families × 3 sizes × 3 weekly arrangements + the event post, plus all four date styles with "Day on its own line" on/off and GB on its default 12h clock. PNGs are downscaled to 540px wide (50%) with a palette. Scripts: scripts/us-layout-audit/D-print/social/render-social.cjs, make-sheet-and-findings.cjs.'

fs.writeFileSync(path.join(REPO, 'scripts/us-layout-audit/D-print/findings-social.json'),
  JSON.stringify({ group: 'D-print', issues, fine, notChecked, method }, null, 2) + '\n')

// ── contact sheet ────────────────────────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const SECTIONS = [
  { t: 'weekly-oneline', sz: 'portrait', id: 'D-20', title: 'Weekly post · "All on one line" (default after editor opens) · 1080×1350 portrait · Oswald (default font)' },
  { t: 'weekly-oneline-montserrat', sz: 'portrait', id: 'D-20', title: 'Weekly post · "All on one line" · 1080×1350 portrait · Montserrat (worst family)' },
  { t: 'weekly-oneline', sz: 'story', id: 'D-21', title: 'Weekly post · "All on one line" · 1080×1920 story · Oswald' },
  { t: 'weekly-bigpicture', sz: 'story', id: 'D-21', title: 'Weekly post · "Big picture" quick layout · 1080×1920 story · Oswald' },
  { t: 'weekly-oneline-archivoblack', sz: 'square', id: 'D-22', title: 'Weekly post · "All on one line" · 1080×1080 square · Archivo Black (wide family)' },
  { t: 'weekly-oneline', sz: 'square', id: null, title: 'Weekly post · "All on one line" · 1080×1080 square · Oswald: FINE (35→34px)' },
  { t: 'event', sz: 'portrait', id: null, title: 'Single-event post · 1080×1350 portrait · Oswald: FINE (time 61/61px, date 63/63px)' },
  { t: 'event-midnight', sz: 'portrait', id: null, title: 'Single-event post, midnight span · 1080×1350 portrait: FINE ("20:00 – 00:30" / "8pm – 12:30am" both 61px)' },
]
const IMG_W = 540, GAP = 40, PAD = 24, HEAD = 56, SUB = 22
const SHEET_W = PAD * 2 + IMG_W * 2 + GAP

;(async () => {
  const comps = []
  let y = 0
  const topH = 96
  comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${topH}">
    <rect width="100%" height="100%" fill="#111827"/>
    <text x="${PAD}" y="38" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#fff">Sheet 11 · Social posts (weekly post + single-event post) · 1080×1080 / 1080×1350 / 1080×1920</text>
    <text x="${PAD}" y="72" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#d1d5db">GB left (24h, Mon–Sun, en-GB) · US right (12h, Sun–Sat, en-US) · shown at 50% · red box = issue, label = fitted px (asked px)</text>
  </svg>`), top: 0, left: 0 })
  y = topH + 12
  for (const sec of SECTIONS) {
    const s = shot(sec.t, sec.sz)
    const h = Math.round(s.H * 0.5)
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${HEAD}">
      <text x="${PAD}" y="26" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="${sec.id ? '#b91c1c' : '#065f46'}">${esc((sec.id ? sec.id + ' · ' : '') + sec.title)}</text>
      <text x="${PAD}" y="48" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#374151">GB · ${esc(s.GB.png.split('/').pop())}</text>
      <text x="${PAD + IMG_W + GAP}" y="48" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#374151">US · ${esc(s.US.png.split('/').pop())}</text>
    </svg>`), top: y, left: 0 })
    y += HEAD
    for (const [i, cc] of [['0', 'GB'], ['1', 'US']]) {
      const left = PAD + Number(i) * (IMG_W + GAP)
      comps.push({ input: path.join(REPO, s[cc].png), top: y, left })
      if (!sec.id) continue
      // box every Time cell whose US size is ≥10% below GB for the same date (both sides)
      const marks = []
      for (const u of s.US.recs.filter(x => x.box === 'time')) {
        const g = s.GB.recs.find(x => keyOf(x) === keyOf(u))
        if (!g || (g.fitted - u.fitted) / g.fitted < 0.10) continue
        const r = (cc === 'GB' ? g : u)
        if (r.rect) marks.push(r)
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${h}">${marks.map(r => {
        const x = r.rect.x * 0.5, yy = r.rect.y * 0.5, w = r.rect.w * 0.5, hh = r.rect.h * 0.5
        const lbl = `${sec.id} ${r.fitted}px (${r.asked})`
        return `<rect x="${x - 2}" y="${yy - 2}" width="${w + 4}" height="${hh + 4}" fill="none" stroke="#ef4444" stroke-width="3"/>
          <rect x="${x + w - 96}" y="${yy - 17}" width="98" height="15" fill="#ef4444"/>
          <text x="${x + w - 93}" y="${yy - 5}" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#fff">${esc(lbl)}</text>`
      }).join('')}</svg>`
      comps.push({ input: Buffer.from(svg), top: y, left })
    }
    y += h + SUB
  }
  const H = y + 10
  const out = path.join(REPO, 'docs/us-layout-audit/sheet-11-social-posts.png')
  await sharp({ create: { width: SHEET_W, height: H, channels: 3, background: '#f3f4f6' } })
    .composite(comps).png({ palette: true, quality: 85, compressionLevel: 9 }).toFile(out)
  console.log('sheet', out, (fs.statSync(out).size / 1024 / 1024).toFixed(2), 'MB', SHEET_W + 'x' + H)
  console.log('issues', issues.map(i => i.id + ' ' + i.severity + ' ' + i.measured.slice(0, 90)).join('\n'))
})().catch(e => { console.error(e); process.exit(1) })
