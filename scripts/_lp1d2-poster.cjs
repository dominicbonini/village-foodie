// scripts/_lp1d2-poster.cjs — Language Phase 1d Part 2, area `poster`: what the POSTERS are built from, and the words
// beside them — per country (GB Pizza Kitchen, US the same kitchen: Sunday weeks, America/Chicago). A MODULE, not a harness.
//
//   weekly   THE WEEKLY POSTER AS RENDER SOURCE — not pixels: the element tree satori is handed (`next/og` is a recorder:
//            the root as JSON, width/height, the font names; no font bytes, no PNG), plus every drawn string and the
//            renderer's warnings. renderWeeklyPost exactly as app/api/weekly-post/route.ts calls it (country from
//            countryForTruck, the week from weekRange on the truck's week, buildWeekData with the layout's own options):
//            a week with open days, a DAY OFF, a CANCELLED event, a stacked day, a place with a short name, a PRIVATE event
//            (shown / left out), an empty week, the busy-week preview; the DEFAULT design (defaultLayout: DEFAULT_HEADING,
//            DEFAULT_DAYS_OFF_TEXT) and STORED designs (one that stores GB's "Week commencing…" / "No trading today" —
//            stored values must NOT change, for either country — one with its own words, one with blanks the reader
//            fills); both row models (legacy rows, the `days` block: converted, omit-days-off, quick layout, default
//            block); date styles; words-before; a note; a squeezed design (the "did not fit" warnings).
//   event    THE SINGLE-EVENT POSTER AS RENDER SOURCE — renderEventPost: ordinary, town in the name, no town, cancelled,
//            private (and the route's refusal sentence), a stored design (numeric date, 24h, words-before, a note).
//   caption  THE WORDS BESIDE THE PICTURE — caption.ts (weekCaption, eventPostText, whenPhrase today/tonight/tomorrow/
//            dated, whenWord, shortDate, weekLabel) and caption-template.ts (seedWeekTemplate / seedEventTemplate filled
//            with weekCaptionValues / eventCaptionValues as the route fills them, a STORED template, CAPTION_LABELS,
//            labelsFor) and caption-chips.ts (captionHtml — the chips' labels).
//   qr       THE QR POSTER — lib/generateQRCode.ts with `qrcode`, the canvas, Image and fetch as recorders: every fillText
//            (text, position, font, colour, alignment) and every drawing call; plain and with a logo; the branded QR with
//            a placeholder; QR_POSTER / posterLogoRect.
//   copy     lib/copy/{socialPosts,weeklyPost} — every export (a string as is, an object as JSON, a function called with
//            the samples in CALLS), as scripts/_lp1d-copy.cjs. ⚠️ ON THE NEW CODE THESE MODULES READ THE CATALOGUE IN
//            en-GB (`translatorFor(DEFAULT_LOCALE, …)`), for callers that have not moved; the US view reads the SAME
//            exports from the catalogue in the truck's locale (the module bundled with its locale set to en-US), which is
//            what a US screen reading the namespace shows. At 826471a there is nothing to switch (constants).
//   locale   lib/weekly-post/locale.ts / format.ts / layout.ts outputs that are words: the date-style and place-style
//            samples, every date style for three dates, shortDateTextFor, joinNameTown, DEFAULT_HEADING,
//            DEFAULT_DAYS_OFF_TEXT, POWERED_BY, headingRuns of the default and a stored heading.
// 🔴 EVERY VIEW RUNS ON BOTH CODES (826471a and this tree). Where this tree gives a function a new words/locale input,
//    APP below passes it only when ctx.has(file, /…/) says the code has it — GB exactly as the route passes it.
const path = require('path')
const fs = require('fs')

const W = 1080, H = 1350
const BLANK = 'data:image/png;base64,QkxBTks='
const ORDER_URL = 'https://hatchgrab.com/test-kitchen'

// ── stubs: satori's door and the QR poster's canvas, as recorders ───────────────────────────────────────────────
const STUBS = {
  'next/og': `export class ImageResponse {
  constructor(el, o) { (globalThis.__lp1d2Og ||= []).push({ el, o: o || {} }) }
  async arrayBuffer() { return new ArrayBuffer(0) }
}`,
  qrcode: `const toDataURL = async (url, o) => { (globalThis.__lp1d2Qr ||= []).push(['QRCode.toDataURL', url, o]); return 'data:image/png;base64,UVI=' }
export default { toDataURL }
export { toDataURL }`,
}

/** Every string a satori element tree draws, in paint order. */
function textsOf(el, out = []) {
  if (el == null || el === false) return out
  if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return out }
  if (Array.isArray(el)) { for (const c of el) textsOf(c, out); return out }
  if (typeof el === 'object' && el.props) textsOf(el.props.children, out)
  return out
}
/** The render-source view of the last ImageResponse. */
function lastOg(result) {
  const calls = globalThis.__lp1d2Og || []
  const c = calls[calls.length - 1]
  globalThis.__lp1d2Og = []
  if (!c) return 'ERROR no ImageResponse was made'
  const tree = JSON.parse(JSON.stringify(c.el))
  return {
    width: c.o.width, height: c.o.height,
    fonts: (c.o.fonts || []).map(f => `${f.name}/${f.weight}/${f.style || ''}`),
    warnings: result && result.warnings,
    texts: textsOf(c.el),
    tree,
  }
}

// ── the copy modules (as scripts/_lp1d-copy.cjs) ──────────────────────────────────────────────────────────────
const COPY = { socialPosts: 'lib/copy/socialPosts.ts', weeklyPost: 'lib/copy/weeklyPost.ts' }
const CALLS = {
  socialPosts: {
    placeDesignScope: [['Lavenham Village Hall']], standardDesignConfirm: [['Lavenham Village Hall']],
    placePicturesFooter: [[3, 1], [0, 0], [1, 1]], POST_NAME_HINT: [['Lavenham Village Hall']],
    PLACE_PICTURES_NONE_HEADING: [[0], [1], [4]], PLACE_PICTURES_SOME_HEADING: [[0], [1], [4]],
    picturesCount: [[0], [1], [2]], removePictureConfirm: [['Main photo', true], ['Logo', false]],
    weekEventsLine: [[0, 0], [1, 0], [4, 1], [4, 2]], createPostForLabel: [['Fri 16 Oct']], MORE_EVENTS_LABEL: [[1], [5]],
    imageSourceLine: [['event'], ['place-photo', 'The Bull Inn'], ['place-poster', 'The Bull Inn'], ['place-photo', null], ['standard'], ['none']],
    CHIP_ALL: [[0], [1], [7]], CHIP_MISSING: [[0], [1], [7]], CHIP_HIDDEN: [[0], [1], [7]], SHOW_ALL_UPCOMING: [[1], [6]],
    EVENT_BOX_POSTER_SHAPE: [[1080, 1350]], slotRemoveConfirm: [['photo'], ['poster']],
    imageChoicePlacePhoto: [['The Bull Inn']], imageChoicePlacePoster: [['The Bull Inn']], imageChoiceAlsoSave: [['The Bull Inn']],
    CHIP_NO_IMAGES: [[0], [1], [3]], CHIP_NO_PICTURES: [[0], [1], [3]], captionAddLabel: [['Venue']],
    posterBoxBlurb: [[1080, 1350], [null, null]], OTHER_CHOICES: [[['Wed 14th Oct', '14th October']]],
  },
  weeklyPost: {},
}
/** An export 826471a had that this tree removed: how the new code gives the same words — (x) → value, x = { tr(ns) }.
 *  F must equal BEFORE through it. (Filled in as exports move; none has gone yet.) */
const ADAPT = {}
const show = v => {
  if (typeof v === 'string') return v
  if (v === undefined) return '[undefined]'
  return JSON.stringify(v, (k, x) => (typeof x === 'function' ? '[function]' : x))
}

// ── the week's events, by day index into the truck's own week (Monday-first GB, Sunday-first US) ─────────────────
const weekEvents = days => [
  { id: 'w1', event_date: days[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
  // days[1] — a day off
  { id: 'w2', event_date: days[2], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' },
  { id: 'w3', event_date: days[3], start_time: '18:00', end_time: '22:00', venue_name: 'Bures Hall', town: 'Bures', status: 'confirmed', is_private: true },
  // days[4] — a day off
  { id: 'w4', event_date: days[5], start_time: '11:00', end_time: '14:00', venue_name: 'Food Festival', town: 'Bury St Edmunds', status: 'confirmed' },
  { id: 'w5', event_date: days[5], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
  { id: 'w6', event_date: days[6], start_time: '12:00', end_time: '16:00', venue_name: 'Church Green', town: 'Long Melford', status: 'unconfirmed' },
]
const PLACES = [
  { id: 'pl-green', name_key: 'church green', name: 'Church Green', short_name: 'The Green', area: 'Long Melford' },
]
/** "This week" around Friday 9 October 2026 (17:20Z): the relative caption words. Dates inside both countries' week. */
const RELATIVE_EVENTS = [
  { id: 'r1', event_date: '2026-10-07', start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'confirmed' },
  { id: 'r2', event_date: '2026-10-09', start_time: '11:30', end_time: '14:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
  { id: 'r3', event_date: '2026-10-09', start_time: '17:30', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
  { id: 'r4', event_date: '2026-10-10', start_time: '12:00', end_time: '16:00', venue_name: 'Church Green', town: 'Long Melford', status: 'confirmed' },
  { id: 'r5', event_date: '2026-10-10', start_time: '18:00', end_time: '21:00', venue_name: 'Food Festival', town: 'Bury St Edmunds', status: 'cancelled' },
  { id: 'r6', event_date: '2026-10-09', start_time: null, end_time: null, venue_name: 'The Kings Arms', town: null, status: 'confirmed' },
]

/** The parameter list of `name` in `file` on THIS code ('' when there is no such function) — so a new input (the
 *  poster's country, a locale) is passed only where the code takes it, and the same view runs on 826471a. */
function paramsOf(ctx, file, name) {
  const src = ctx.src(file)
  const m = new RegExp(`(?:function\\s+${name}\\s*(?:<[^>]*>)?\\s*|(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?)\\(`).exec(src)
  if (!m) return ''
  let i = m.index + m[0].length, d = 1
  const from = i
  for (; i < src.length && d; i++) { if (src[i] === '(') d++; else if (src[i] === ')') d-- }
  return src.slice(from, i - 1)
}

async function views(ctx) {
  const { kit } = ctx
  const out = {}
  const WP = f => `lib/weekly-post/${f}.ts`
  /** Whether `name` in lib/weekly-post/<file>.ts takes `param` on this code. */
  const takes = (file, name, param) => new RegExp(`\\b${param}\\b`).test(paramsOf(ctx, WP(file), name))
  const catalogs = ['posterWords', 'captions', 'weeklyPost', 'weeklyPostApi', 'socialPosts', 'privateEvents']
    .filter(ns => fs.existsSync(path.join(ctx.REPO, `lib/i18n/catalog/${ns}.ts`)))
  const imports = catalogs.map(ns => `\nimport '@/lib/i18n/catalog/${ns}'`).join('')
  const hasWords = fs.existsSync(path.join(ctx.REPO, WP('words')))
  const P = await kit.bundle('lp1d2-poster', `
export * as week from '@/lib/weekly-post/week'
export * as data from '@/lib/weekly-post/week-data'
export * as layout from '@/lib/weekly-post/layout'
export * as days from '@/lib/weekly-post/days'
export * as render from '@/lib/weekly-post/render'
export * as caption from '@/lib/weekly-post/caption'
export * as tpl from '@/lib/weekly-post/caption-template'
export * as chips from '@/lib/weekly-post/caption-chips'
export * as locale from '@/lib/weekly-post/locale'
export * as format from '@/lib/weekly-post/format'
export * as qr from '@/lib/generateQRCode'
export * as pe from '@/lib/private-events/copy'
export { translatorFor } from '@/lib/i18n/translator'` + (hasWords ? "\nexport * as words from '@/lib/weekly-post/words'" : '') + imports, { stubs: STUBS })

  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const tr = ns => P.translatorFor(C.locale, ns)
    // ── how the ROUTE calls things (app/api/weekly-post/route.ts): country from countryForTruck, the week on the truck's
    //    own clock and first day, `now` the request's ──
    const country = P.locale.countryForTruck(C.truck)
    const wk = { timeZone: C.time.timeZone, weekStart: C.time.weekStart === 'sunday' ? 'sunday' : 'monday' }
    const now = new Date()
    const next = P.week.weekRange('next', now, wk)
    const thisWeek = P.week.weekRange('this', now, wk)
    const truckName = C.truck.name
    const tz = C.time.timeZone
    // ── APP: each call with the inputs THIS code takes (a country / locale only where the signature has one) ──
    const withC = (file, name, args) => (takes(file, name, 'country') ? [...args, country] : args)
    const APP = {
      defaultLayout: () => P.layout.defaultLayout(...withC('layout', 'defaultLayout', [W, H])),
      validateLayout: l => P.layout.validateLayout(...withC('layout', 'validateLayout', [l, W, H])),
      validateEventLayout: l => P.layout.validateEventLayout(...withC('layout', 'validateEventLayout', [l, W, H])),
      busyWeekData: (range, o) => P.data.busyWeekData(...withC('week-data', 'busyWeekData', [range, o])),
      rowsFitWarning: l => P.layout.rowsFitWarning(...(takes('layout', 'rowsFitWarning', 'locale') ? [l, C.locale] : [l])),
      seedWeek: () => P.tpl.seedWeekTemplate(...withC('caption-template', 'seedWeekTemplate', [truckName])),
      seedEvent: () => P.tpl.seedEventTemplate(...withC('caption-template', 'seedEventTemplate', [truckName])),
      // weekCaption names no country at 826471a (GB's words); given one only if its input grows the field
      weekCaption: input => P.caption.weekCaption(/country/.test(ctx.src(WP('caption')).split('export interface WeekCaptionInput')[1]?.split('}')[0] || '') ? { ...input, country } : input),
      labels: () => (P.tpl.captionLabelText ? P.tpl.CAPTION_LABELS.map(l => ({ ...l, label: P.tpl.captionLabelText(l.id, country) })) : P.tpl.CAPTION_LABELS),
      labelsFor: kind => {
        const ls = P.tpl.labelsFor(...withC('caption-template', 'labelsFor', [kind]))
        return P.tpl.captionLabelText && !takes('caption-template', 'labelsFor', 'country') ? ls.map(l => ({ ...l, label: P.tpl.captionLabelText(l.id, country) })) : ls
      },
      captionHtml: t => P.chips.captionHtml(...withC('caption-chips', 'captionHtml', [t])),
      placeStyleSample: id => P.locale.placeStyleSample(...withC('locale', 'placeStyleSample', [id])),
      placeStyleSamples: () => (P.locale.placeStyleSamplesFor ? P.locale.placeStyleSamplesFor(country) : P.locale.PLACE_STYLE_SAMPLES),
      // DEFAULT_HEADING / DEFAULT_DAYS_OFF_TEXT were constants; on this tree they are the poster country's messages
      defaultHeading: () => ('DEFAULT_HEADING' in P.format ? P.format.DEFAULT_HEADING : P.words.defaultHeadingFor(country)),
      defaultDaysOff: () => ('DEFAULT_DAYS_OFF_TEXT' in P.layout ? P.layout.DEFAULT_DAYS_OFF_TEXT : P.words.defaultDaysOffFor(country)),
      headingRuns: (text, dateRuns) => P.format.headingRuns(text, next.start, next.end, { caps: true, raisedOrdinals: true }, dateRuns,
        ...(takes('format', 'headingRuns', 'defaultHeading') ? [P.words.defaultHeadingFor(country)] : [])),
    }

    // ════ weekly ══════════════════════════════════════════════════════════════════════════════════════════
    const opts = (l, o = {}) => ({ timeStyle: l.timeStyle, showCancelled: l.showCancelled, showPrivate: false, excludedEventIds: [], ...o })
    const weekFor = (l, o, events = weekEvents(next.days), range = next) => P.data.buildWeekData(range, events, PLACES, opts(l, o))
    const valid = l => {
      const v = APP.validateLayout(l)
      if (!v.ok || !v.layout) throw new Error('layout refused: ' + (v.errors || []).join('; '))
      return v.layout
    }
    const renderWeek = async (l, week, note = null) => {
      globalThis.__lp1d2Og = []
      const r = await P.render.renderWeeklyPost({ layout: l, week, blankDataUri: BLANK, note, country })
      return lastOg(r)
    }
    const base = () => valid(APP.defaultLayout())
    const weekly = async (state, fn) => ctx.safeAsync(out, `${cc}|weekly|${state}`, fn)
    await weekly('default', async () => { const l = base(); return renderWeek(l, weekFor(l)) })
    await weekly('default.privateShown', async () => { const l = base(); return renderWeek(l, weekFor(l, { showPrivate: true })) })
    await weekly('default.cancelledHidden', async () => { const l = valid({ ...base(), showCancelled: false }); return renderWeek(l, weekFor(l)) })
    await weekly('default.emptyWeek', async () => { const l = base(); return renderWeek(l, weekFor(l, {}, [])) })
    await weekly('default.thisWeek', async () => { const l = base(); return renderWeek(l, weekFor(l, {}, RELATIVE_EVENTS, thisWeek)) })
    await weekly('default.note', async () => {
      const b = base(); const l = valid({ ...b, notes: [P.layout.defaultNoteBox(b)] })
      return renderWeek(l, weekFor(l), 'Card payments welcome')
    })
    await weekly('default.busy', async () => { const l = base(); return renderWeek(l, APP.busyWeekData(next, opts(l))) })
    await weekly('default.squeezed', async () => {
      const b = base()
      const l = valid({ ...b, location: { ...b.location, w: 90 }, heading: { ...b.heading, w: 140 }, date: { ...b.date, w: 60 }, time: { ...b.time, x: b.time.x + b.time.w - 40, w: 40 } })
      return renderWeek(l, weekFor(l))
    })
    for (const ds of ['short', 'dayMonth', 'numeric']) {
      await weekly(`default.date-${ds}`, async () => { const l = valid({ ...base(), dateStyle: ds }); return renderWeek(l, weekFor(l)) })
    }
    await weekly('default.nameTown24h', async () => { const l = valid({ ...base(), placeStyle: 'nameTown', timeStyle: '24h' }); return renderWeek(l, weekFor(l)) })
    // STORED designs — as a saved row reaches the renderer (validateLayout of the stored JSON)
    await weekly('stored.gbWords', async () => {
      // the live test-truck design stores GB's words: they stay exactly as stored, for either country
      const b = base()
      const l = valid({ ...b, heading: { ...b.heading, text: 'Week commencing {start} to {end}' }, daysOffText: 'No trading today' })
      return renderWeek(l, weekFor(l))
    })
    await weekly('stored.ownWords', async () => {
      const b = base()
      const l = valid({ ...b, heading: { ...b.heading, text: 'Find us: {start} – {end}' }, daysOffText: 'Resting the oven',
        time: { ...b.time, wordsBefore: 'From' }, dateStyle: 'short' })
      return renderWeek(l, weekFor(l))
    })
    await weekly('stored.blanks', async () => {
      // a saved row with an empty heading and an empty days-off text: what is drawn when nothing is stored
      const b = base()
      const l = valid({ ...b, heading: { ...b.heading, text: '' }, daysOffText: '' })
      return renderWeek(l, weekFor(l))
    })
    // the `days` block model
    const daysOf = (l, over = {}) => valid({ ...l, days: { ...P.layout.daysFromLegacy(l), ...over } })
    await weekly('days.converted', async () => { const l = daysOf(base()); return renderWeek(l, weekFor(l)) })
    await weekly('days.omitDaysOff', async () => { const l = daysOf(base(), { daysOff: 'omit' }); return renderWeek(l, weekFor(l)) })
    await weekly('days.dayOnTop', async () => {
      const l = daysOf(base(), { arrangement: 'dayOnTop', parts: P.days.QUICK_LAYOUTS.dayOnTop.parts.map(p => ({ ...p })) })
      return renderWeek(l, weekFor(l))
    })
    await weekly('days.defaultBlock', async () => { const l = valid({ ...base(), days: P.days.defaultDaysBlock(W, H) }); return renderWeek(l, weekFor(l, { showPrivate: true })) })
    await weekly('days.storedGbWords', async () => {
      const b = base()
      const l = valid({ ...b, heading: { ...b.heading, text: 'Week commencing {start} to {end}' }, daysOffText: 'No trading today', days: P.layout.daysFromLegacy(b) })
      return renderWeek(l, weekFor(l))
    })
    ctx.safe(out, `${cc}|weekly|rowsFitWarning`, () => {
      const b = base()
      return [APP.rowsFitWarning(b), APP.rowsFitWarning({ ...b, rowSpacing: b.rowSpacing * 2 })]
    })

    // ════ event ═══════════════════════════════════════════════════════════════════════════════════════════
    const validEv = l => {
      const v = APP.validateEventLayout(l)
      if (!v.ok || !v.layout) throw new Error('event layout refused: ' + (v.errors || []).join('; '))
      return v.layout
    }
    const evBase = () => validEv(P.layout.defaultEventLayout(W, H))
    const renderEvent = async (l, ev, note = null) => {
      globalThis.__lp1d2Og = []
      const entry = P.data.entryFor(ev, PLACES, l.timeStyle)
      const r = await P.render.renderEventPost({ country, layout: l, entry, date: ev.event_date, backgroundDataUri: BLANK, note })
      return lastOg(r)
    }
    const EV = { id: 'ev1', event_date: next.days[4], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' }
    const event = async (state, fn) => ctx.safeAsync(out, `${cc}|event|${state}`, fn)
    await event('ordinary', async () => renderEvent(evBase(), EV))
    await event('townInName', async () => renderEvent(evBase(), { ...EV, venue_name: 'Lavenham Village Hall', town: 'Lavenham' }))
    await event('noTown', async () => renderEvent(evBase(), { ...EV, town: null }))
    await event('cancelled', async () => renderEvent(evBase(), { ...EV, status: 'cancelled' }))
    await event('private', async () => renderEvent(evBase(), { ...EV, is_private: true }))
    await event('placeShortName', async () => renderEvent(evBase(), { ...EV, venue_name: 'Church Green', town: 'Long Melford' }))
    await event('stored', async () => {
      const b = evBase()
      const l = validEv({ ...b, dateStyle: 'numeric', timeStyle: '24h', time: { ...b.time, wordsBefore: 'From' }, notes: [P.layout.defaultEventNoteBox(b)] })
      return renderEvent(l, EV, 'Pizza until we sell out')
    })
    await event('stored.cancelled', async () => {
      const b = evBase()
      const l = validEv({ ...b, dateStyle: 'short', date: { ...b.date, bgDayOff: '#991b1b' } })
      return renderEvent(l, { ...EV, status: 'cancelled' })
    })
    await event('squeezed', async () => {
      const b = evBase()
      const l = validEv({ ...b, location: { ...b.location, w: 60 }, town: { ...b.town, w: 40 }, date: { ...b.date, w: 60 }, time: { ...b.time, w: 30 } })
      return renderEvent(l, EV)
    })
    // the route refuses a private event's single post before anything is drawn: its sentence, in the truck's language
    ctx.safe(out, `${cc}|event|privateRefusal`, () => tr('privateEvents')('noSinglePost'))

    // ════ caption ═════════════════════════════════════════════════════════════════════════════════════════
    const cap = (state, fn) => ctx.safe(out, `${cc}|caption|${state}`, fn)
    const layout0 = base()
    const capWeek = weekFor(layout0, { showPrivate: true })
    const relWeek = weekFor(layout0, {}, RELATIVE_EVENTS, thisWeek)
    const weekVals = (week, o = {}) => P.tpl.weekCaptionValues({ week, orderUrl: ORDER_URL, timeStyle: layout0.timeStyle ?? '12h', country, ...o })
    const weekFilled = (tpl, week, o) => P.tpl.fillCaptionTemplate(tpl, weekVals(week, o))
    // the route's `captions` action: the saved template or the seed, filled; the note appended
    cap('seedTemplates', () => ({ week: APP.seedWeek(), event: APP.seedEvent() }))
    cap('week.seed', () => weekFilled(APP.seedWeek(), capWeek))
    cap('week.seed.more', () => ({
      thisWeek: weekFilled(APP.seedWeek(), relWeek),
      empty: weekFilled(APP.seedWeek(), weekFor(layout0, {}, [])),
      note: `${weekFilled(APP.seedWeek(), capWeek)}\n\n${'Card payments welcome'}`,
      noLink: weekFilled(APP.seedWeek(), capWeek, { orderUrl: null }),
      h24: weekFilled(APP.seedWeek(), capWeek, { timeStyle: '24h' }),
    }))
    const STORED_WEEK_TPL = 'This week from {truck}! 🍕\n{week-dates}\n\n{day-list}\n\nOrder ahead: {order-link}'
    cap('week.stored', () => ({
      own: weekFilled(STORED_WEEK_TPL, capWeek),
      // a template saved in GB's words stays in them, for either country
      gbWords: weekFilled('Pizza Kitchen — where we are this week:\n\n{day-list}\n\nOrder ahead: {order-link}', capWeek),
    }))
    cap('week.values', () => weekVals(capWeek))
    cap('week.weekCaption', () => ({
      full: APP.weekCaption({ truckName, week: capWeek, orderUrl: ORDER_URL, timeStyle: '12h', note: 'Card payments welcome' }),
      empty: APP.weekCaption({ truckName, week: weekFor(layout0, {}, []), orderUrl: null, timeStyle: '12h' }),
    }))
    // the per-event list on the make screen: eventPostText for every entry, at `now`
    cap('week.perEvent', () => relWeek.days.flatMap(d => d.entries.map(e => ({
      eventId: e.eventId, date: d.date, name: e.name, status: e.status,
      text: P.caption.eventPostText({ truckName, entry: e, date: d.date, orderUrl: ORDER_URL, timeStyle: '12h', now, timeZone: tz, country }),
    }))))
    // the single-event post's text (the route's `event_post`): the saved template or the seed; a cancelled event's apology
    const evText = (ev, tpl, extra = {}) => {
      const entry = P.data.entryFor(ev, PLACES, '12h')
      if (entry.status === 'cancelled') {
        return P.caption.eventPostText({ truckName, entry, date: ev.event_date, orderUrl: ORDER_URL, timeStyle: '12h', now, timeZone: tz, country })
      }
      return P.tpl.fillCaptionTemplate(tpl || APP.seedEvent(), P.tpl.eventCaptionValues({
        placeName: entry.name, town: entry.town ?? ev.town ?? null, date: ev.event_date, startTime: entry.startTime, endTime: entry.endTime,
        orderUrl: ORDER_URL, timeStyle: '12h', socialTag: null, country, now, timeZone: tz, ...extra,
      }))
    }
    cap('event.seed', () => ({
      ...Object.fromEntries(RELATIVE_EVENTS.map(ev => [ev.id, evText(ev)])),
      nextWeek: evText(EV), tagged: evText(EV, null, { socialTag: '@buresmusicfest' }), noLink: evText(EV, null, { orderUrl: null }),
    }))
    cap('event.stored', () => ({
      own: evText(EV, 'Catch {truck} at {place} {day-date} ({times}) 🔥\n{order-link}'),
      gbWords: evText(RELATIVE_EVENTS[2], 'Pizza Kitchen at {venue}, {area} {day-date}, {times}.\n\nOrder ahead: {order-link} {location-tag}'),
    }))
    cap('event.cancelled', () => ({
      tomorrow: evText(RELATIVE_EVENTS[4]),
      nextWeek: evText({ ...EV, status: 'cancelled' }),
      noTown: evText({ ...RELATIVE_EVENTS[4], town: null }),
      tonight: evText({ ...RELATIVE_EVENTS[2], status: 'cancelled' }),
      today: evText({ ...RELATIVE_EVENTS[1], status: 'cancelled' }),
    }))
    cap('event.values', () => P.tpl.eventCaptionValues({ placeName: 'The Bull Inn', town: 'Cavendish', date: '2026-10-09', startTime: '17:30', endTime: '21:00', orderUrl: ORDER_URL, timeStyle: '12h', socialTag: '@bullinn', country, now, timeZone: tz }))
    cap('when', () => RELATIVE_EVENTS.concat([EV]).map(e => [e.event_date, e.start_time, P.caption.whenWord(e.event_date, e.start_time, now, tz), P.caption.whenPhrase(e.event_date, e.start_time, now, country, tz)]))
    cap('dates', () => ({
      shortDate: ['2026-10-09', '2026-09-01', '2026-12-25', 'not-a-date'].map(d => P.caption.shortDate(d, country)),
      weekLabel: [next.start, thisWeek.start, '2026-09-28'].map(d => P.caption.weekLabel(d, country)),
    }))
    cap('labels', () => ({ all: APP.labels(), week: APP.labelsFor('week'), event: APP.labelsFor('event') }))
    cap('chips', () => ({
      seedWeek: APP.captionHtml(APP.seedWeek()),
      seedEvent: APP.captionHtml(APP.seedEvent()),
      stored: APP.captionHtml(STORED_WEEK_TPL + '\n{place} {area} {times} {location-tag} {unknown} <b>&'),
    }))

    // ════ qr ══════════════════════════════════════════════════════════════════════════════════════════════
    const qrView = async (state, fn) => ctx.safeAsync(out, `${cc}|qr|${state}`, async () => {
      const log = []
      const saved = { document: globalThis.document, Image: globalThis.Image, fetch: globalThis.fetch, cou: URL.createObjectURL, rou: URL.revokeObjectURL }
      const arg = a => (a && typeof a === 'object' && a.__img ? `[image ${a.src}]` : a)
      const ctx2d = () => {
        const st = {}
        const target = {
          measureText: t => ({ width: String(t).length * (Number((/(\d+)px/.exec(st.font || '') || [])[1]) || 10) * 0.55 }),
        }
        return new Proxy(target, {
          get: (o, k) => {
            if (k in o) return (...a) => { log.push(['measureText', ...a]); return o[k](...a) }
            if (k in st) return st[k]
            return (...a) => { log.push([String(k), ...a.map(arg)]) }
          },
          set: (o, k, v) => { st[k] = v; log.push([`${String(k)}=`, v]); return true },
        })
      }
      globalThis.__lp1d2Qr = []
      globalThis.document = { createElement: tag => { log.push(['createElement', tag]); return { tag, width: 0, height: 0, getContext: () => ctx2d(), toDataURL: t => `data:${t}` } } }
      globalThis.Image = class { constructor() { this.__img = true; this.naturalWidth = 64; this.naturalHeight = 64 } set src(v) { this._src = v; setTimeout(() => this.onload && this.onload(), 0) } get src() { return this._src } }
      globalThis.fetch = async u => { log.push(['fetch', String(u)]); return { ok: true, blob: async () => ({}) } }
      URL.createObjectURL = () => 'blob:logo'; URL.revokeObjectURL = () => {}
      try {
        const result = await fn()
        return { result, qrcode: globalThis.__lp1d2Qr, drawn: log.filter(l => l[0] === 'fillText').map(l => l[1]), calls: log }
      } finally {
        globalThis.document = saved.document; globalThis.Image = saved.Image; globalThis.fetch = saved.fetch
        URL.createObjectURL = saved.cou; URL.revokeObjectURL = saved.rou
        delete globalThis.__lp1d2Qr
      }
    })
    // exactly as Manage's buildQr calls it (app/manage/[token]/page.tsx): url, logoUrl (branded only), truckName
    await qrView('poster.standard', () => P.qr.generateQRCodePNG({ url: ORDER_URL, logoUrl: null, truckName }))
    await qrView('poster.branded', () => P.qr.generateQRCodePNG({ url: ORDER_URL, logoUrl: 'http://127.0.0.1:9/storage/v1/object/public/truck-media/logo.png', truckName }))
    await qrView('poster.longName', () => P.qr.generateQRCodePNG({ url: ORDER_URL, logoUrl: null, truckName: 'The Very Long Named Wood-Fired Pizza Kitchen Company' }))
    await qrView('withLogo.plain', () => P.qr.generateQRWithLogo(ORDER_URL, null, 600))
    await qrView('withLogo.placeholder', () => P.qr.generateQRWithLogo(ORDER_URL, null, 320, 'Your logo here'))
    ctx.safe(out, `${cc}|qr|geometry`, () => ({ QR_POSTER: P.qr.QR_POSTER, logoRect: P.qr.posterLogoRect() }))

    // ════ locale ══════════════════════════════════════════════════════════════════════════════════════════
    const loc = (state, fn) => ctx.safe(out, `${cc}|locale|${state}`, fn)
    loc('dateStyleSamples', () => P.locale.localeFor(country))
    loc('placeStyleSamples', () => ({ samples: APP.placeStyleSamples(), picked: P.locale.PLACE_STYLE_IDS.map(id => APP.placeStyleSample(id)).concat([APP.placeStyleSample('bogus')]) }))
    const DATES = ['2026-10-12', '2026-10-01', '2026-10-23', next.start, next.end]
    loc('dateText', () => DATES.map(d => P.locale.DATE_STYLE_IDS.map(s => [
      P.locale.dateTextFor(d, s, country, { caps: false, raisedOrdinals: false }),
      P.locale.dateTextFor(d, s, country, { caps: true, raisedOrdinals: true }),
    ])))
    loc('dateLines', () => DATES.map(d => P.locale.DATE_STYLE_IDS.map(s => P.locale.dateLinesFor(d, s, country, { caps: true, raisedOrdinals: true }, true))))
    loc('shortDateText', () => ({ dates: DATES.map(d => P.locale.shortDateTextFor(d, country)), joinNameTown: [P.locale.joinNameTown('The Bull Inn', 'Cavendish'), P.locale.joinNameTown('The Bull Inn', ' '), P.locale.joinNameTown('The Bull Inn', null)] }))
    loc('defaults', () => ({ heading: APP.defaultHeading(), daysOffText: APP.defaultDaysOff(), POWERED_BY: P.render.POWERED_BY }))
    loc('defaultLayoutWords', () => { const l = APP.defaultLayout(); return { heading: l.heading.text, daysOffText: l.daysOffText } })
    loc('headingRuns', () => {
      const dr = (ymd, c) => P.locale.dateLinesFor(ymd, 'long', country, c, false)[0]
      return { default: APP.headingRuns(APP.defaultLayout().heading.text, dr), blank: APP.headingRuns('', dr), stored: APP.headingRuns('Week commencing {start} to {end}', dr), own: APP.headingRuns('Find us {start} – {end} {dates}', dr) }
    })
  }

  // ════ copy ════════════════════════════════════════════════════════════════════════════════════════════════
  // GB: the modules as they are. US: the same modules with their catalogue read in en-US (a no-op at 826471a).
  const copyEntry = Object.entries(COPY).map(([k, f]) => `export * as ${k} from '@/${f.replace(/\.ts$/, '')}'`).join('\n')
    + "\nexport { translatorFor } from '@/lib/i18n/translator'" + imports
  const usPatches = Object.values(COPY).map(file => ({ file, from: /translatorFor\(DEFAULT_LOCALE,/g, to: "translatorFor('en-US',", optional: true }))
  const BG = await kit.bundle('lp1d2-poster-copy-gb', copyEntry)
  const BU = await kit.bundle('lp1d2-poster-copy-us', copyEntry, { patches: usPatches })
  for (const [C, B] of [[ctx.GB, BG], [ctx.US, BU]]) {
    const cc = C.cc
    const x = { locale: C.locale, cc, tr: ns => B.translatorFor(C.locale, ns) }
    for (const name of Object.keys(COPY)) {
      const M = B[name] || {}
      // ONE VIEW PER MODULE AND FIRST LETTER of the export's name (stable when an export is added or goes), each
      // { export: value } — a function's calls as `name|i`.
      const vals = {}
      const put = (k, fn) => { try { vals[k] = fn() } catch (err) { vals[k] = 'ERROR ' + String(err && err.message || err).slice(0, 200) } }
      for (const a of Object.keys(ADAPT).filter(k => k.startsWith(`${name}.`)).map(k => k.slice(name.length + 1))) {
        if (a.split('|')[0] in M) continue
        put(a, () => show(ADAPT[`${name}.${a}`](M, x)))
      }
      for (const e of Object.keys(M)) {
        const v = M[e]
        if (typeof v === 'function') {
          const calls = CALLS[name] && CALLS[name][e]
          if (!calls) { vals[e] = '[function]'; continue }
          calls.forEach((args, i) => put(`${e}|${i}`, () => show(v(...args))))
          continue
        }
        if (typeof v === 'number' || typeof v === 'boolean') continue
        put(e, () => show(v))
      }
      for (const k of Object.keys(vals).sort()) {
        const id = `${cc}|copy|${name}|${k[0].toUpperCase()}`
        ;(out[id] ||= {})[k] = vals[k]
      }
    }
  }
  return out
}

module.exports = { views, CALLS, ADAPT }
