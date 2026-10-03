#!/usr/bin/env node
// scripts/_weekly-post-examples.cjs — a ONE-OFF TOOL that writes the example posters in the report.
//
//   node scripts/_weekly-post-examples.cjs
//
// 🔴 THE BLANK IS SYNTHETIC, AND THAT IS NOT A SHORTCUT. The brief forbids testing against a live
// trading truck, and these images go into a document — so the artwork underneath is generated here,
// by the same renderer, from a gradient. No real truck's design appears anywhere in this repository.
//
// ⚠️ NOT A HARNESS. It asserts nothing and is not in scripts/harnesses.json; it exists so the pictures
// in docs/weekly-post-stage1-report.md can be regenerated from the code that made them, rather than
// being screenshots nobody can reproduce.

const path = require('path')
const fs = require('fs')
const { compile } = require('./_slot-interval-compile.cjs')
const REPO = path.resolve(__dirname, '..')

const LIB = [
  'lib/weekly-post/week.ts', 'lib/weekly-post/format.ts', 'lib/weekly-post/week-data.ts',
  'lib/weekly-post/layout.ts', 'lib/weekly-post/fit.ts', 'lib/weekly-post/contrast.ts',
  'lib/weekly-post/fonts.ts', 'lib/weekly-post/font-list.ts', 'lib/weekly-post/ttf-metrics.ts', 'lib/weekly-post/caption.ts',
  'lib/weekly-post/render.ts', 'lib/weekly-post/image-info.ts', 'lib/weekly-post/backgrounds.ts',
  'lib/time-utils.ts', 'lib/schedule-graphics/places.ts',
]

const c = compile(REPO, LIB, 'wpex')
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }
const M = {
  week: c.req('lib/weekly-post/week.js'),
  data: c.req('lib/weekly-post/week-data.js'),
  layout: c.req('lib/weekly-post/layout.js'),
  render: c.req('lib/weekly-post/render.js'),
}
const { ImageResponse } = require(path.join(REPO, 'node_modules/next/og.js'))

async function blank(w, h, style) {
  const el = {
    type: 'div',
    props: {
      style: { display: 'flex', position: 'relative', width: `${w}px`, height: `${h}px`,
        background: style === 'place'
          ? 'linear-gradient(200deg,#042f2e 0%,#0f766e 50%,#84cc16 100%)'
          : 'linear-gradient(160deg,#0f172a 0%,#7c2d12 55%,#f97316 100%)' },
      children: [
        // a wordmark, so the examples look like a truck's own artwork rather than a bare gradient
        { type: 'div', props: { style: { position: 'absolute', left: 0, top: `${Math.round(h * 0.025)}px`, width: `${w}px`, display: 'flex', justifyContent: 'center', fontSize: `${Math.round(h * 0.028)}px`, color: '#ffffff', opacity: 0.55, letterSpacing: '6px' }, children: 'A SYNTHETIC BLANK · NOT A REAL TRUCK' } },
      ],
    },
  }
  const buf = Buffer.from(await new ImageResponse(el, { width: w, height: h }).arrayBuffer())
  return 'data:image/png;base64,' + buf.toString('base64')
}

;(async () => {
  const W = 1080, H = 1350
  const uri = await blank(W, H)
  const range = M.week.weekRange('this', '2026-09-30T12:00:00Z')
  const d = range.days
  const base = M.layout.defaultLayout(W, H)

  /* ⚠️ THE DESIGN IS NUDGED AWAY FROM THE BARE DEFAULT so the pictures show what an operator would
   * actually end up with: a bolder date, a panel behind the days off, raised ordinals. Nothing here is
   * a different code path — it is the same layout JSON the editor writes. */
  const styled = JSON.parse(JSON.stringify(base))
  styled.heading.fontId = 'anton'
  styled.heading.caps = true
  styled.date.fontId = 'oswald'
  styled.date.bold = true
  styled.date.raisedOrdinals = true
  styled.date.bgDayOff = '#00000055'
  styled.location.fontId = 'oswald'
  styled.location.caps = false
  styled.time.fontId = 'oswald'
  styled.time.bold = true

  const weeks = {
    'quiet': [
      { id: '1', event_date: d[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
      { id: '2', event_date: d[3], start_time: '17:00', end_time: '20:30', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
      { id: '3', event_date: d[5], start_time: '11:00', end_time: '15:00', venue_name: 'Church Green', town: 'Long Melford', status: 'unconfirmed' },
    ],
    'busy': [
      { id: '1', event_date: d[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
      { id: '2', event_date: d[1], start_time: '17:30', end_time: '20:30', venue_name: 'Great Waldingfield Recreation Ground and Playing Field', town: 'Great Waldingfield', status: 'confirmed' },
      { id: '3', event_date: d[2], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'confirmed' },
      { id: '4', event_date: d[4], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
      { id: '5', event_date: d[5], start_time: '11:00', end_time: '14:30', venue_name: 'Food Festival', town: 'Bury St Edmunds', status: 'confirmed' },
      { id: '6', event_date: d[5], start_time: '17:00', end_time: '21:00', venue_name: 'Church Green', town: 'Long Melford', status: 'confirmed' },
      { id: '7', event_date: d[6], start_time: '12:00', end_time: '16:00', venue_name: 'Clare Country Park', town: 'Clare', status: 'unconfirmed' },
    ],
    'cancelled': [
      { id: '1', event_date: d[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
      { id: '2', event_date: d[2], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' },
      { id: '3', event_date: d[4], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
    ],
  }

  const notes = { busy: 'Pre-order any time for collection', quiet: '', cancelled: '' }
  for (const [name, events] of Object.entries(weeks)) {
    const week = M.data.buildWeekData(range, events, [], { timeStyle: '12h', showCancelled: true })
    const out = await M.render.renderWeeklyPost({ layout: styled, week, blankDataUri: uri, note: notes[name] })
    const file = path.join(REPO, 'docs', `weekly-post-example-${name}.png`)
    fs.writeFileSync(file, out.png)
    console.log(`  ${path.relative(REPO, file)}  ${out.width}×${out.height}  ${(out.png.length / 1024).toFixed(0)} KB  ${out.ms} ms  warnings: ${out.warnings.length}`)
  }

  // ══ STAGE 2 · THE SINGLE-EVENT POST ══════════════════════════════════════════════════
  /* ⚠️ A SECOND SYNTHETIC PICTURE, SHAPED DIFFERENTLY FROM THE DEFAULT ON PURPOSE — it stands in for
   * "their artwork with that venue's photo in it", and having two makes the place-background example
   * visibly a different picture rather than the same one relabelled. */
  const placeUri = await blank(W, H, 'place')
  const evLayout = M.layout.defaultEventLayout(W, H)
  evLayout.date.fontId = 'anton'
  evLayout.date.raisedOrdinals = true
  evLayout.location.fontId = 'oswald'
  evLayout.time.fontId = 'oswald'
  evLayout.time.bold = true

  const EVENTS = {
    'default': { bg: uri, ev: { id: 'a', event_date: d[4], start_time: '17:00', end_time: '21:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' } },
    'place': { bg: placeUri, ev: { id: 'b', event_date: d[5], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' } },
    'cancelled': { bg: uri, ev: { id: 'c', event_date: d[2], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' } },
  }
  /* ⚠️ THE NOTE EXAMPLE NEEDS A NOTE BOX. The renderer draws a note only when the design HAS a box
   * and the post HAS text — passing a note with no box (as a first draft of this script did) correctly
   * renders nothing, which would have made the example quietly misleading. */
  const withNote = { ...evLayout, note: M.layout.defaultEventNoteBox(evLayout) }
  for (const [name, { bg, ev }] of Object.entries(EVENTS)) {
    const entry = M.data.entryFor(ev, [], '12h')
    const note = name === 'place' ? 'Pre-order for collection' : ''
    const out = await M.render.renderEventPost({
      layout: note ? withNote : evLayout, entry, date: ev.event_date, backgroundDataUri: bg, note,
    })
    const file = path.join(REPO, 'docs', `event-post-example-${name}.png`)
    fs.writeFileSync(file, out.png)
    console.log(`  ${path.relative(REPO, file)}  ${out.width}×${out.height}  ${(out.png.length / 1024).toFixed(0)} KB  ${out.ms} ms  warnings: ${out.warnings.length}`)
  }
})().catch(e => { console.log('🔴 ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)); process.exit(1) })
