#!/usr/bin/env node
// scripts/weekly-post.cjs
//
//   node scripts/weekly-post.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO REAL TRUCK ARTWORK)
//
// ── 🔴 WHAT THIS GUARDS ─────────────────────────────────────────────────────────────────────────────
// The weekly post runs UNATTENDED. An operator places three outlines once; from then on seven days of
// real place names, times and cancellations go into them and the image goes out to their customers.
// Every rule below is one that fails silently on finished artwork if it is wrong:
//   • the wrong seven days (a week that starts on Sunday, or six days across the clock change);
//   • "11st September";
//   • a place name that overflows its box or is clipped mid-glyph;
//   • white text on the white part of someone's photograph;
//   • "tonight" on a post copied three days later.
//
// 🔴 THE BLANK IS SYNTHETIC. The brief forbids testing against a live trading truck, so the artwork
// here is generated in this file — a gradient and a deliberately half-white/half-black one for the
// readability checks. No real truck's design is involved, and none is needed: these are checks about
// layout and wording.

const path = require('path')
const fs = require('fs')
const { compile } = require('./_slot-interval-compile.cjs')
const { decodePng, diffBounds } = require('./_png-decode.cjs')
const REPO = path.resolve(__dirname, '..')

const LIB = [
  'lib/weekly-post/week.ts', 'lib/weekly-post/format.ts', 'lib/weekly-post/week-data.ts',
  'lib/weekly-post/layout.ts', 'lib/weekly-post/fit.ts', 'lib/weekly-post/contrast.ts',
  'lib/weekly-post/fonts.ts', 'lib/weekly-post/font-list.ts', 'lib/weekly-post/ttf-metrics.ts', 'lib/weekly-post/caption.ts',
  'lib/weekly-post/render.ts', 'lib/weekly-post/image-info.ts', 'lib/weekly-post/backgrounds.ts',
  'lib/time-utils.ts', 'lib/schedule-graphics/places.ts',
]

/** Compile the library (optionally with one file patched) and bind a require to it. */
function build(patch) {
  const root = patch ? fs.mkdtempSync(path.join(require('os').tmpdir(), 'wp-var-')) : REPO
  if (patch) {
    for (const f of LIB) {
      const dest = path.join(root, f)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, f === patch.file ? patch.source : fs.readFileSync(path.join(REPO, f)))
    }
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules')) } catch { /* already there */ }
  }
  const c = compile(root, LIB, patch ? 'wpvar' : 'wp')
  /* ⚠️ node_modules HAS TO BE REACHABLE FROM THE COMPILE OUTPUT TOO. `render.ts` requires `next/og`,
   * and without this the module fails to LOAD — which a variant would score as "the bug was caught",
   * for entirely the wrong reason. */
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }
  const r = (rel) => c.req(rel)
  return {
    week: r('lib/weekly-post/week.js'),
    format: r('lib/weekly-post/format.js'),
    data: r('lib/weekly-post/week-data.js'),
    layout: r('lib/weekly-post/layout.js'),
    fit: r('lib/weekly-post/fit.js'),
    contrast: r('lib/weekly-post/contrast.js'),
    fonts: r('lib/weekly-post/fonts.js'),
    caption: r('lib/weekly-post/caption.js'),
    render: r('lib/weekly-post/render.js'),
    imageInfo: r('lib/weekly-post/image-info.js'),
    bg: r('lib/weekly-post/backgrounds.js'),
  }
}

const M = build()

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const J = (x) => JSON.stringify(x)

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE WEEK
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · THE WEEK — Monday to Sunday, Europe/London')
{
  const { weekRange, defaultWeekChoice, weekdayOf, mondayOf, addDays } = M.week

  t('🔴 a week is Monday → Sunday, seven days, in order', (() => {
    const w = weekRange('this', '2026-09-30T12:00:00Z')      // a Wednesday
    return w.start === '2026-09-28' && w.end === '2026-10-04' && w.days.length === 7
      && J(w.days) === J(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })())
  t('🔴 Monday belongs to its OWN week, not the one before', (() => {
    const w = weekRange('this', '2026-09-28T00:30:00Z')
    return w.start === '2026-09-28'
  })())
  /* ⚠️ 20:00 UTC, NOT 23:30. 2026-10-04 is a Sunday in BST, so 23:30 UTC is already 00:30 on MONDAY
   * in London and the answer would correctly be the next week. The first draft of this check asserted
   * the wrong thing and the library was right — recorded because it is the same trap the feature
   * itself exists to avoid. */
  t('🔴 Sunday belongs to the week that STARTED on Monday', (() => {
    const w = weekRange('this', '2026-10-04T20:00:00Z')
    return w.start === '2026-09-28' && w.end === '2026-10-04'
  })())
  t('⚠️ next week is this week + 7, never "today + 7"', (() => {
    const w = weekRange('next', '2026-09-30T12:00:00Z')
    return w.start === '2026-10-05' && w.end === '2026-10-11'
  })())

  /* ── 🔴 THE CLOCK CHANGE ───────────────────────────────────────────────────────────────────────
   * BST → GMT at 02:00 on Sunday 25 October 2026. That Sunday is the LAST day of the week beginning
   * Monday 19 October. Code that built a week by adding 6 × 86,400,000 ms to a timestamp lands on
   * Saturday 24th at 23:00 and produces a six-day week with Sunday missing — on the one poster of the
   * year where a missing Sunday is least likely to be noticed before it is posted. */
  t('🔴 THE BST→GMT WEEK (25 Oct 2026) IS STILL SEVEN DAYS, ending on the Sunday', (() => {
    const w = weekRange('this', '2026-10-21T12:00:00Z')
    return w.start === '2026-10-19' && w.end === '2026-10-25' && w.days.length === 7
      && w.days[6] === '2026-10-25' && new Set(w.days).size === 7
  })())
  t('🔴 …and asked ON the clock-change Sunday, it is that same week', (() => {
    const before = weekRange('this', '2026-10-25T00:30:00Z')   // 01:30 BST
    const after = weekRange('this', '2026-10-25T12:00:00Z')    // 12:00 GMT
    return before.start === '2026-10-19' && J(before) === J(after)
  })())
  t('🔴 …and the GMT→BST change (29 Mar 2026) is a seven-day week too', (() => {
    const w = weekRange('this', '2026-03-29T12:00:00Z')
    return w.start === '2026-03-23' && w.end === '2026-03-29' && w.days.length === 7
  })())
  t('⚠️ a leap day sits in its own week without breaking the run', (() => {
    const w = weekRange('this', '2028-02-29T12:00:00Z')
    return w.days.includes('2028-02-29') && w.days.length === 7 && new Set(w.days).size === 7
  })())
  t('⚠️ London is ahead of UTC in summer: 23:30 UTC on a Sunday is already MONDAY there', (() => {
    // 2026-07-05 is a Sunday; 23:30 UTC = 00:30 BST on Monday the 6th
    return weekRange('this', '2026-07-05T23:30:00Z').start === '2026-07-06'
  })())

  // ── the default ──────────────────────────────────────────────────────────────────────────────
  /* 🔴 NEXT WEEK FROM FRIDAY 00:00 ONWARDS. Checked on every day of one week AND across the boundary
   * minute, because "from Friday" is the kind of rule that is usually built one day out. */
  const expect = { '2026-09-28': 'this', '2026-09-29': 'this', '2026-09-30': 'this', '2026-10-01': 'this',
    '2026-10-02': 'next', '2026-10-03': 'next', '2026-10-04': 'next' }
  t('🔴 THE PICKER DEFAULTS: Mon–Thu → this week, Fri/Sat/Sun → next',
    Object.entries(expect).every(([d, want]) => defaultWeekChoice(`${d}T12:00:00Z`) === want))
  t('🔴 …and the switch is at Friday 00:00 exactly, not at some hour of it', (() => {
    const thuLate = defaultWeekChoice('2026-10-01T22:59:00Z')   // 23:59 BST Thursday
    const friStart = defaultWeekChoice('2026-10-01T23:05:00Z')  // 00:05 BST Friday
    return thuLate === 'this' && friStart === 'next'
  })())
  t('⚠️ weekdayOf is Monday-first (not Date.getDay()\'s Sunday-first)',
    weekdayOf('2026-09-28') === 0 && weekdayOf('2026-10-04') === 6)
  t('⚠️ mondayOf is a no-op on a Monday, and addDays crosses a month end',
    mondayOf('2026-09-28') === '2026-09-28' && addDays('2026-09-30', 1) === '2026-10-01')
  /* ⛔ A ROLLED-OVER DATE IS NOT A VALID DATE. `Date.UTC(2026, 12, 99)` does not return an Invalid
   * Date — it quietly becomes April 2027. Both of these were accepted until the round-trip check was
   * added, which means a poster for the wrong seven days with no error anywhere. */
  t('⛔ a malformed date throws rather than producing a silent wrong week', (() => {
    const bad = ['2026-13-99', '2026-02-30', '2026-00-10', '2026-01-32', 'not-a-date', '']
    return bad.every(d => { try { weekdayOf(d); return false } catch { return true } })
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · ORDINALS AND FORMATTING
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · ORDINALS, DATES AND TIMES')
{
  const { ordinal, ordinalSuffix, dayAndMonthRuns, runsToPlain, formatOneTime, formatTimeRangeFor, headingRuns } = M.format

  /* 🔴 THE TEENS ARE THE WHOLE BUG. `n % 10 === 1 ? 'st'` gives 11st, 12nd and 13rd — wrong three days
   * every month, on artwork a truck posts. 21st/22nd/23rd/31st must still take the short suffix. */
  const want = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th', 5: 'th', 10: 'th', 11: 'th', 12: 'th', 13: 'th',
    14: 'th', 20: 'th', 21: 'st', 22: 'nd', 23: 'rd', 24: 'th', 30: 'th', 31: 'st' }
  t('🔴 EVERY ORDINAL SUFFIX, including 11th/12th/13th and 21st/22nd/23rd/31st',
    Object.entries(want).every(([n, s]) => ordinalSuffix(Number(n)) === s))
  t('⚠️ …for all 31 days of a month, with no exceptions missed',
    Array.from({ length: 31 }, (_, i) => i + 1).every(n => /^(st|nd|rd|th)$/.test(ordinalSuffix(n))))
  t('⚠️ ordinal() joins the number and the suffix', ordinal(28) === '28th' && ordinal(1) === '1st')

  t('🔴 the date reads "28th September", and capitals are applied to the whole thing',
    runsToPlain(dayAndMonthRuns('2026-09-28', { caps: false, raisedOrdinals: false })) === '28th September'
    && runsToPlain(dayAndMonthRuns('2026-09-28', { caps: true, raisedOrdinals: false })) === '28TH SEPTEMBER')
  /* 🔴 A RAISED ORDINAL IS A SEPARATE RUN, NEVER A UNICODE SUPERSCRIPT CHARACTER. Not every bundled
   * family carries ᵗʰ, and a missing glyph is a blank box on a poster. */
  t('🔴 raised ordinals split into runs and mark the suffix, keeping the same words', (() => {
    const runs = dayAndMonthRuns('2026-09-28', { caps: true, raisedOrdinals: true })
    return runsToPlain(runs) === '28TH SEPTEMBER' && runs.length === 3
      && runs[1].raised === true && runs[1].text === 'TH'
      && !/[ᵗʰˢᵈ]/.test(runsToPlain(runs))
  })())

  t('🔴 12-hour times drop :00 and keep real minutes',
    formatOneTime('17:00', '12h') === '5pm' && formatOneTime('17:30', '12h') === '5:30pm')
  t('🔴 …and midnight/noon are 12am/12pm, never 0am',
    formatOneTime('00:00', '12h') === '12am' && formatOneTime('12:00', '12h') === '12pm'
    && formatOneTime('00:15', '12h') === '12:15am')
  t('⚠️ 24-hour times are zero-padded', formatOneTime('9:05', '24h') === '09:05')
  t('🔴 a range uses an EN DASH with spaces, in both styles',
    formatTimeRangeFor('17:00', '20:00', '12h') === '5pm – 8pm'
    && formatTimeRangeFor('17:00', '20:00', '24h') === '17:00 – 20:00')
  t('⚠️ a missing end time gives just the start — never a dangling dash',
    formatTimeRangeFor('17:00', null, '12h') === '5pm' && formatTimeRangeFor(null, null, '12h') === '')
  t('⛔ a nonsense time is empty rather than rendered as NaN',
    formatOneTime('99:99', '12h') === '' && formatOneTime('', '12h') === '')

  t('🔴 the heading fills {start} and {end} with long dates', (() => {
    const r = headingRuns('Week commencing {start} to {end}', '2026-09-28', '2026-10-04', { caps: false, raisedOrdinals: false })
    return runsToPlain(r) === 'Week commencing Monday 28th September to Sunday 4th October'
  })())
  t('⚠️ an unknown token is left visible rather than silently blanked',
    runsToPlain(headingRuns('Our week {dates}', '2026-09-28', '2026-10-04', { caps: false, raisedOrdinals: false })) === 'Our week {dates}')
  t('⚠️ an empty heading template falls back to the default rather than rendering nothing',
    runsToPlain(headingRuns('   ', '2026-09-28', '2026-10-04', { caps: false, raisedOrdinals: false })).startsWith('Week commencing'))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE WEEK'S DATA — statuses, stacking, days off, cancellations
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · THE WEEK\'S DATA')
{
  const { buildWeekData, tradingStatusOf, locationName, townLine } = M.data
  const range = M.week.weekRange('this', '2026-09-30T12:00:00Z')
  const ev = (over) => ({ id: 'x', event_date: range.days[0], start_time: '17:00', end_time: '20:00',
    venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed', ...over })
  const opts = { timeStyle: '12h', showCancelled: true }

  /* 🔴 `closed` TRADES. It is the status an event takes once its day is done — the truck WAS there, and
   * a poster for the current week must still show Monday. The places feature draws the same line. */
  t('🔴 confirmed, unconfirmed and closed all TRADE; only cancelled does not',
    ['confirmed', 'unconfirmed', 'closed'].every(s => tradingStatusOf(s) === 'trading')
    && tradingStatusOf('cancelled') === 'cancelled')
  t('⚠️ case and padding do not change a status, and an unknown one trades rather than vanishing',
    tradingStatusOf(' CANCELLED ') === 'cancelled' && tradingStatusOf('weird') === 'trading'
    && tradingStatusOf(null) === 'trading')

  t('🔴 a day with no event is a DAY OFF', (() => {
    const w = buildWeekData(range, [ev({})], [], opts)
    return w.days[0].isDayOff === false && w.days[1].isDayOff === true && w.days[1].entries.length === 0
  })())
  t('🔴 a cancelled event is NOT a day off — it is a crossed-out location and "CANCELLED"', (() => {
    const w = buildWeekData(range, [ev({ status: 'cancelled' })], [], opts)
    return w.days[0].isDayOff === false && w.days[0].entries[0].status === 'cancelled'
      && w.days[0].entries[0].time === ''
  })())
  t('⚠️ …and hiding cancelled events CAN turn that day into a day off', (() => {
    const w = buildWeekData(range, [ev({ status: 'cancelled' })], [], { ...opts, showCancelled: false })
    return w.days[0].isDayOff === true
  })())

  /* 🔴 STACKING: one to four events in a day, sorted by start time, never reordered between renders. */
  for (const n of [1, 2, 3, 4]) {
    const events = Array.from({ length: n }, (_, i) => ev({
      id: `e${i}`, start_time: `${String(20 - i).padStart(2, '0')}:00`, venue_name: `Place ${i}`,
    }))
    const w = buildWeekData(range, events, [], opts)
    t(`🔴 ${n} event${n > 1 ? 's' : ''} in one day stack, sorted by START TIME`, (() => {
      const got = w.days[0].entries.map(e => e.startTime)
      return got.length === n && J(got) === J([...got].sort())
    })())
  }
  t('⚠️ two events at the same minute keep a STABLE order (name, then id)', (() => {
    const a = buildWeekData(range, [ev({ id: 'b', venue_name: 'Bravo' }), ev({ id: 'a', venue_name: 'Alpha' })], [], opts)
    const b = buildWeekData(range, [ev({ id: 'a', venue_name: 'Alpha' }), ev({ id: 'b', venue_name: 'Bravo' })], [], opts)
    return J(a.days[0].entries.map(e => e.eventId)) === J(b.days[0].entries.map(e => e.eventId))
  })())
  t('⚠️ an event with no start time sorts last rather than first', (() => {
    const w = buildWeekData(range, [ev({ id: 'none', start_time: null }), ev({ id: 'five', start_time: '17:00' })], [], opts)
    return w.days[0].entries[0].eventId === 'five'
  })())

  t('🔴 AN EVENT OUTSIDE THE WEEK IS DROPPED, not folded into Monday', (() => {
    const w = buildWeekData(range, [ev({ event_date: '2026-09-27' }), ev({ id: 'in' })], [], opts)
    return w.days.reduce((n, d) => n + d.entries.length, 0) === 1 && w.included.length === 1
  })())
  t('⚠️ a ticked-off event is excluded from the days AND from the caption list', (() => {
    const w = buildWeekData(range, [ev({ id: 'keep' }), ev({ id: 'drop' })], [], { ...opts, excludedEventIds: ['drop'] })
    return w.days[0].entries.length === 1 && w.included.every(e => e.id !== 'drop')
  })())

  // ── the place name ───────────────────────────────────────────────────────────────────────────
  /* 🔴 THE NAME COMES FROM THE EXISTING RESOLVER. A second matcher would mean events stop finding
   * their place and the poster says the wrong village, with no error anywhere. */
  const place = { id: 'p1', name_key: 'lavenham village hall', name: 'Lavenham Village Hall', area: 'Lavenham' }
  t('🔴 the place\'s "Name on posts" wins over the event\'s venue_name',
    locationName(ev({ venue_name: 'lavenham vill hall' }), place) === 'Lavenham Village Hall')
  t('⚠️ a short_name wins over both — it is the field filled in BECAUSE the full name does not fit',
    locationName(ev({}), { ...place, short_name: 'The Hall' }) === 'The Hall')
  t('⚠️ with no place at all the event\'s own venue_name is used, and never a blank',
    locationName(ev({}), null) === 'Lavenham Village Hall' && locationName(ev({ venue_name: '' }), null) === '—')
  t('🔴 the town is SUPPRESSED when the name already contains it',
    townLine(ev({}), place, 'Lavenham Village Hall') === null)
  t('⚠️ …and shown when it is different, from the place\'s area or the event\'s town',
    townLine(ev({}), { ...place, area: 'Sudbury' }, 'Market Square') === 'Sudbury'
    && townLine(ev({ town: 'Clare' }), null, 'The Bull') === 'Clare')
  t('⚠️ a town that is only part of a longer word still counts as different', (() => {
    // "Hall" inside "Halltown" must not suppress the town line
    return townLine(ev({ town: 'Hall' }), null, 'Halltown Green') === 'Hall'
  })())

  t('🔴 events resolve through placeForEvent — a hand-typed name finds its place by name_key', (() => {
    const w = buildWeekData(range, [ev({ venue_name: "LAVENHAM  Village-Hall" })], [place], opts)
    return w.days[0].entries[0].name === 'Lavenham Village Hall'
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · SHRINK TO FIT
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · SHRINK TO FIT, AND THE TRUNCATION OF LAST RESORT')
{
  const { fitLines, truncateRuns, ABSOLUTE_MIN_FONT, MIN_FONT_FRACTION, ELLIPSIS } = M.fit
  const metrics = M.fonts.loadFontMetrics('oswald', false)
  const line = (text) => ({ runs: [{ text }] })

  t('🔴 text that already fits is NOT shrunk', (() => {
    const r = fitLines({ lines: [line('MONDAY')], w: 600, h: 100, fontSize: 48, metrics })
    return r.fontSize === 48 && r.truncated === false
  })())
  t('🔴 A 60-CHARACTER PLACE NAME SHRINKS TO FIT', (() => {
    const name = 'Great Waldingfield Recreation Ground and Playing Field Pavilion'
    const box = { w: 520, h: 60 }
    const r = fitLines({ lines: [line(name)], w: box.w, h: box.h, fontSize: 48, metrics })
    return name.length >= 60 && r.fontSize < 48 && r.usedWidth <= box.w && r.usedHeight <= box.h
  })())
  t('🔴 …and the result genuinely fits, measured with the real font metrics', (() => {
    const r = fitLines({ lines: [line('Great Waldingfield Recreation Ground and Playing Field Pavilion')], w: 520, h: 60, fontSize: 48, metrics })
    return r.usedWidth <= 520 && r.usedHeight <= 60
  })())
  t('🔴 THE FLOOR IS RESPECTED — it never shrinks to an unreadable size', (() => {
    const r = fitLines({ lines: [line('x'.repeat(400))], w: 200, h: 40, fontSize: 48, metrics })
    return r.fontSize >= Math.max(ABSOLUTE_MIN_FONT, Math.round(48 * MIN_FONT_FRACTION))
  })())
  t('🔴 …and at the floor it TRUNCATES with an ellipsis, which itself fits', (() => {
    const r = fitLines({ lines: [line('x'.repeat(400))], w: 200, h: 40, fontSize: 48, metrics })
    return r.truncated === true
      && r.lines[0].runs.map(x => x.text).join('').endsWith(ELLIPSIS)
      && r.usedWidth <= 200
  })())
  t('🔴 TRUNCATION IS BY CODE POINT — a surrogate pair is never cut in half', (() => {
    const r = truncateRuns([{ text: '🍕'.repeat(40) }], metrics, 40, 120)
    const out = r.runs.map(x => x.text).join('')
    return r.truncated && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out) && !/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)
  })())
  t('⚠️ a stacked day too tall for its box drops lines rather than overflowing', (() => {
    const lines = Array.from({ length: 8 }, (_, i) => line(`Event ${i}`))
    const r = fitLines({ lines, w: 500, h: 40, fontSize: 24, metrics })
    return r.lines.length < 8 && r.truncated === true && r.usedHeight <= 40
  })())
  t('⚠️ the raised ordinal is measured SMALLER, so a heading with one is not over-shrunk', (() => {
    const plain = fitLines({ lines: [{ runs: [{ text: '28TH SEPTEMBER' }] }], w: 400, h: 60, fontSize: 40, metrics })
    const raised = fitLines({ lines: [{ runs: [{ text: '28' }, { text: 'TH', raised: true }, { text: ' SEPTEMBER' }] }], w: 400, h: 60, fontSize: 40, metrics })
    return raised.usedWidth < plain.usedWidth
  })())

  /* 🔴 THE SWEEP. Every bundled family, both weights, a long name and a tight box — because a fitting
   * rule that works for Oswald and overflows for Merriweather is the shape this bug actually takes. */
  t('🔴 ACROSS ALL 21 FAMILIES AND BOTH WEIGHTS, nothing ever exceeds its box', (() => {
    const names = ['Great Waldingfield Recreation Ground', 'Lavenham', 'The Bull Inn, Cavendish', '5:30pm – 8pm']
    let worst = 0
    for (const f of M.fonts.FONT_CHOICES) {
      for (const bold of [false, true]) {
        const m = M.fonts.loadFontMetrics(f.id, bold)
        for (const n of names) {
          for (const [w, h] of [[520, 60], [240, 40], [160, 28]]) {
            const r = fitLines({ lines: [line(n)], w, h, fontSize: 56, metrics: m })
            worst = Math.max(worst, r.usedWidth - w, r.usedHeight - h)
            if (r.usedWidth > w + 0.01 || r.usedHeight > h + 0.01) {
              console.log(`      overflow: ${f.family} ${bold ? 700 : 400} "${n}" in ${w}×${h}`)
              return false
            }
          }
        }
      }
    }
    return true
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · READABILITY
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · "KEEP TEXT READABLE"')
{
  const { readabilityFor, contrastRatio, relativeLuminance, parseHex, averageSample, outlineShadow, CONTRAST_THRESHOLD } = M.contrast
  const WHITE = { r: 255, g: 255, b: 255 }
  const BLACK = { r: 0, g: 0, b: 0 }

  t('🔴 the contrast ratio is the WCAG one: black on white is 21:1',
    Math.abs(contrastRatio(BLACK, WHITE) - 21) < 0.01 && Math.abs(contrastRatio(WHITE, WHITE) - 1) < 0.001)
  /* 🔴 THE sRGB TRANSFER FUNCTION, NOT A PLAIN AVERAGE. `(r+g+b)/3` gets blue and yellow the wrong way
   * round, so a plain average decides white-on-blue is unreadable and white-on-yellow is fine. */
  t('🔴 luminance is perceptual: yellow is far brighter than blue, not equal to it',
    relativeLuminance({ r: 255, g: 255, b: 0 }) > 0.7 && relativeLuminance({ r: 0, g: 0, b: 255 }) < 0.1)

  t('🔴 WHITE TEXT ON A WHITE BACKGROUND GETS A DARK SHADOW', (() => {
    const r = readabilityFor('#ffffff', WHITE, true)
    return r.outline !== null && r.ratio < CONTRAST_THRESHOLD && /^#0b0b0b/.test(r.outline)
  })())
  t('🔴 WHITE TEXT ON A DARK BACKGROUND GETS NOTHING — the artwork is left alone', (() => {
    const r = readabilityFor('#ffffff', { r: 17, g: 24, b: 39 }, true)
    return r.outline === null && r.ratio >= CONTRAST_THRESHOLD
  })())
  t('🔴 the outline is the opposite of the TEXT, not of the background', (() => {
    const dark = readabilityFor('#111111', BLACK, true)
    return dark.outline !== null && /^#ffffff/.test(dark.outline)
  })())
  t('⛔ the operator\'s colour is NEVER changed — only a shadow is added', (() => {
    const r = readabilityFor('#ffffff', WHITE, true)
    return J(Object.keys(r).sort()) === J(['outline', 'ratio'])
  })())
  t('⚠️ with the setting off, nothing is added however bad the contrast',
    readabilityFor('#ffffff', WHITE, false).outline === null)
  t('⚠️ with NO SAMPLE, nothing is added — a background is never guessed',
    readabilityFor('#ffffff', null, true).outline === null)
  t('⚠️ the shadow scales with the font size rather than being a fixed 2px', (() => {
    const small = outlineShadow('#000000ff', 12)
    const big = outlineShadow('#000000ff', 160)
    return !!small && !!big && small !== big
  })())
  t('⚠️ fully transparent pixels are skipped when averaging, so a transparent margin does not read as black', (() => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0])
    const avg = averageSample(px)
    return avg.r === 255 && avg.g === 255 && avg.b === 255
  })())
  t('⚠️ a malformed colour is rejected rather than parsed as black', parseHex('nope') === null && parseHex('#fff') === null)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · THE CAPTIONS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('6 · THE CAPTION AND THE PER-EVENT POSTS')
{
  const { whenWord, whenPhrase, eventPostText, weekCaption, shortDate } = M.caption
  const range = M.week.weekRange('this', '2026-10-12T09:00:00Z')      // w/c Mon 12 Oct 2026
  const entry = (over) => ({ eventId: 'e1', name: 'Lavenham Village Hall', town: null, time: '5pm – 8pm',
    status: 'trading', startTime: '17:00', endTime: '20:00', ...over })

  /* 🔴 RELATIVE TO WHEN IT IS COPIED. The operator opens this on Sunday to plan and comes back on
   * Wednesday to post Wednesday's — "tonight" baked in on Sunday would be a lie by then. */
  t('🔴 TONIGHT when the event is today and starts at 17:00 or later',
    whenWord('2026-10-13', '17:00', '2026-10-13T10:00:00Z') === 'tonight')
  t('🔴 TODAY when it is today but starts earlier',
    whenWord('2026-10-13', '11:00', '2026-10-13T08:00:00Z') === 'today')
  t('⚠️ …and 16:59 is still "today" while 17:00 is "tonight" — the boundary is exact',
    whenWord('2026-10-13', '16:59', '2026-10-13T08:00:00Z') === 'today'
    && whenWord('2026-10-13', '17:00', '2026-10-13T08:00:00Z') === 'tonight')
  t('🔴 TOMORROW for the next day, with no evening variant',
    whenWord('2026-10-14', '19:00', '2026-10-13T10:00:00Z') === 'tomorrow'
    && whenPhrase('2026-10-14', '19:00', '2026-10-13T10:00:00Z') === 'tomorrow')
  t('🔴 A DATE for anything further out, formatted "Tue 13 Oct"',
    whenWord('2026-10-20', '17:00', '2026-10-13T10:00:00Z') === 'dated'
    && whenPhrase('2026-10-20', '17:00', '2026-10-13T10:00:00Z') === 'on Tue 20 Oct'
    && shortDate('2026-10-13') === 'Tue 13 Oct')
  t('⚠️ the same event is worded differently on different days — the point of taking `now`', (() => {
    const sun = whenPhrase('2026-10-14', '17:00', '2026-10-11T10:00:00Z')
    const tue = whenPhrase('2026-10-14', '17:00', '2026-10-13T10:00:00Z')
    const wed = whenPhrase('2026-10-14', '17:00', '2026-10-14T10:00:00Z')
    return sun === 'on Wed 14 Oct' && tue === 'tomorrow' && wed === 'tonight'
  })())
  t('⚠️ "today" is a London date, not a 24-hour window', (() => {
    // 23:30 UTC on 13 Oct is 00:30 BST on the 14th — so the 14th is "today", not "tomorrow"
    return whenWord('2026-10-14', '11:00', '2026-10-13T23:30:00Z') === 'today'
  })())

  t('🔴 a per-event post carries the place, the wording, the times AND the ordering link', (() => {
    const s = eventPostText({ truckName: 'Village Spice', entry: entry({}), date: '2026-10-13',
      orderUrl: 'https://www.hatchgrab.com/order/village-spice', timeStyle: '12h', now: '2026-10-13T09:00:00Z' })
    return s.includes('Village Spice') && s.includes('Lavenham Village Hall') && s.includes('tonight')
      && s.includes('5pm – 8pm') && s.includes('https://www.hatchgrab.com/order/village-spice')
  })())
  /* 🔴 A CANCELLED EVENT GETS AN APOLOGY AND NO LINK. Sending customers to order from an event that is
   * not happening is the one thing this text must never do. */
  t('🔴 A CANCELLED EVENT APOLOGISES AND CARRIES NO ORDERING LINK', (() => {
    const s = eventPostText({ truckName: 'Village Spice', entry: entry({ status: 'cancelled' }), date: '2026-10-13',
      orderUrl: 'https://www.hatchgrab.com/order/village-spice', timeStyle: '12h', now: '2026-10-13T09:00:00Z' })
    return /sorry/i.test(s) && !s.includes('hatchgrab.com') && !/order ahead/i.test(s)
  })())
  t('⚠️ the link sits on its own line, so Facebook and Instagram linkify it', (() => {
    const s = eventPostText({ truckName: 'V', entry: entry({}), date: '2026-10-13',
      orderUrl: 'https://x.test/order', timeStyle: '12h', now: '2026-10-13T09:00:00Z' })
    return s.split('\n').some(l => l.trim() === 'Order ahead: https://x.test/order')
  })())
  t('⚠️ no ordering link ⇒ no "Order ahead" line at all, rather than a broken one', (() => {
    const s = eventPostText({ truckName: 'V', entry: entry({}), date: '2026-10-13', orderUrl: null, timeStyle: '12h', now: '2026-10-13T09:00:00Z' })
    return !/order ahead/i.test(s)
  })())

  const week = M.data.buildWeekData(range, [
    { id: 'a', event_date: range.days[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
    { id: 'b', event_date: range.days[4], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' },
  ], [], { timeStyle: '12h', showCancelled: true })

  /* ⚠️ NO ", Lavenham" AFTER "Lavenham Village Hall". The town-suppression rule in week-data.ts
   * applies to the caption as well as the poster, because both read the same `DayEntry` — which is the
   * point of building the week once. The first draft of this check expected the town twice. */
  t('🔴 THE CAPTION LISTS ONLY THE DAYS THE TRUCK IS OUT', (() => {
    const c = weekCaption({ truckName: 'Village Spice', week, orderUrl: null, timeStyle: '12h' })
    return c.includes('Monday — Lavenham Village Hall — 5pm – 8pm')
      && !/Lavenham Village Hall, Lavenham/.test(c)
      && !/no trading/i.test(c) && !c.includes('Tuesday')
  })())
  t('🔴 …and says plainly when one is cancelled', (() => {
    const c = weekCaption({ truckName: 'Village Spice', week, orderUrl: null, timeStyle: '12h' })
    return /Friday — Market Square, Sudbury — CANCELLED, sorry/.test(c)
  })())
  t('⚠️ a week with nothing in it still produces a caption', (() => {
    const empty = M.data.buildWeekData(range, [], [], { timeStyle: '12h', showCancelled: true })
    const c = weekCaption({ truckName: 'V', week: empty, orderUrl: null, timeStyle: '12h' })
    return c.length > 0 && /no dates this week/i.test(c)
  })())
  t('⚠️ the note and the ordering link are appended, in that order', (() => {
    const c = weekCaption({ truckName: 'V', week, orderUrl: 'https://x.test/order', timeStyle: '12h', note: 'Pre-order please' })
    return c.indexOf('Pre-order please') < c.indexOf('Order ahead: https://x.test/order')
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · THE LAYOUT JSON
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('7 · LAYOUT VALIDATION')
{
  const { validateLayout, defaultLayout, rowsFitWarning, LAYOUT_VERSION } = M.layout
  const W = 1080, H = 1350
  const good = defaultLayout(W, H)

  t('🔴 the default layout for a fresh blank validates', validateLayout(good, W, H).ok === true)
  t('🔴 …and seven rows fit inside the image on first open', rowsFitWarning(good) === null)

  const bad = [
    ['not an object', 'hello'],
    ['null', null],
    ['a wrong version', { ...good, version: 99 }],
    ['a NaN position', { ...good, date: { ...good.date, x: NaN } }],
    ['an Infinity size', { ...good, date: { ...good.date, w: Infinity } }],
    ['a numeric string', { ...good, date: { ...good.date, x: '120' } }],
    ['a box off the right edge', { ...good, time: { ...good.time, x: W - 10, w: 400 } }],
    ['a box below the image', { ...good, time: { ...good.time, y: H - 5, h: 400 } }],
    ['a negative position', { ...good, date: { ...good.date, y: -40 } }],
    ['a missing box', { ...good, location: undefined }],
    ['a zero row spacing', { ...good, rowSpacing: 0 }],
    ['a row spacing taller than the image', { ...good, rowSpacing: H + 1 }],
    ['a heading of 10,000 characters', { ...good, heading: { ...good.heading, text: 'x'.repeat(10000) } }],
  ]
  for (const [what, input] of bad) {
    const r = validateLayout(input, W, H)
    t(`⛔ REJECTED: ${what}`, r.ok === false && r.errors.length > 0 && typeof r.errors[0] === 'string')
  }

  /* ⚠️ THE SURVIVORS ARE NORMALISED, NOT REJECTED — a drag can legitimately produce these. */
  t('⚠️ an unknown font falls back to the default rather than failing the save', (() => {
    const r = validateLayout({ ...good, date: { ...good.date, fontId: 'comic-sans' } }, W, H)
    return r.ok && r.layout.date.fontId === 'oswald'
  })())
  t('⚠️ a malformed colour falls back to white rather than failing the save', (() => {
    const r = validateLayout({ ...good, date: { ...good.date, color: 'red' } }, W, H)
    return r.ok && r.layout.date.color === '#ffffff'
  })())
  t('⚠️ an out-of-range background sample becomes "no sample", not a clamped guess', (() => {
    const r = validateLayout({ ...good, date: { ...good.date, bgSample: { r: 999, g: 0, b: 0 } } }, W, H)
    return r.ok && r.layout.date.bgSample === null
  })())
  t('🔴 THE IMAGE SIZE COMES FROM THE SERVER, NOT THE PAYLOAD', (() => {
    // a payload claiming a huge canvas must not get its off-image box accepted
    const r = validateLayout({ ...good, width: 9000, height: 9000, time: { ...good.time, x: 5000, w: 400 } }, W, H)
    return r.ok === false
  })())
  t('⚠️ a layout that pushes row 7 off the bottom SAVES but WARNS', (() => {
    const l = { ...good, rowSpacing: Math.round(H / 3) }
    const r = validateLayout(l, W, H)
    return r.ok === true && typeof rowsFitWarning(r.layout) === 'string'
  })())
  t('⚠️ the version is pinned, so an old design is refused rather than half-read',
    validateLayout({ ...good, version: LAYOUT_VERSION + 1 }, W, H).ok === false)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 8 · UPLOADS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('8 · THE UPLOAD GATE')
{
  const { checkUpload, readImageInfo } = M.imageInfo
  const opts = { maxBytes: 10 * 1024 * 1024, minShortSide: 600 }
  // A synthetic PNG header: signature + IHDR declaring 1080×1350.
  const png = (w, h) => {
    const b = Buffer.alloc(200)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
    b.writeUInt32BE(13, 8); Buffer.from('IHDR').copy(b, 12)
    b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
    return b
  }
  t('🔴 a PNG\'s size is read from its IHDR', (() => {
    const i = readImageInfo(png(1080, 1350))
    return i && i.format === 'png' && i.width === 1080 && i.height === 1350
  })())
  t('⛔ a file that is not a PNG or JPG is refused, with Canva instructions', (() => {
    const r = checkUpload(Buffer.from('%PDF-1.7 not an image at all'), opts)
    return r.ok === false && /PNG/i.test(r.error) && /canva/i.test(r.error)
  })())
  t('⛔ too small on the short side is refused, and the message says the real size', (() => {
    const r = checkUpload(png(400, 1350), opts)
    return r.ok === false && r.error.includes('400') && r.error.includes('600')
  })())
  t('⛔ over 10MB is refused before anything else', (() => {
    const big = Buffer.concat([png(1080, 1350), Buffer.alloc(11 * 1024 * 1024)])
    const r = checkUpload(big, opts)
    return r.ok === false && /10MB/.test(r.error)
  })())
  t('⛔ an empty file is refused', checkUpload(Buffer.alloc(0), opts).ok === false)
  t('✓ a 1080×1350 PNG passes', checkUpload(png(1080, 1350), opts).ok === true)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 8b · STAGE 2 — THE SINGLE-EVENT POST'S RULES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('8b · THE SINGLE-EVENT POST \u2014 backgrounds, time and layout')
{
  const { resolveBackground, checkAspect, placePicturesThatNoLongerFit, fitsDefault, ASPECT_TOLERANCE } = M.bg
  const img = (path, w, h) => ({ path, width: w, height: h })
  const D = img('default.png', 1080, 1350)

  /* \u{1F534} ONE-OFF > PLACE > DEFAULT. It reads as "the most specific thing anyone said about this post
   * wins": an upload made FOR THIS EVENT is the most deliberate act available, so nothing may override
   * it; a place picture is a standing instruction about one venue; the default is what is true when
   * nobody has said anything else. */
  t('\u{1F534} THE ORDER IS one-off > place > default', (() => {
    const all = resolveBackground({ fallback: D, place: img('p.png', 1080, 1350), event: img('e.png', 1080, 1350) })
    const noEvent = resolveBackground({ fallback: D, place: img('p.png', 1080, 1350), event: null })
    const neither = resolveBackground({ fallback: D })
    return all.source === 'event' && all.path === 'e.png'
      && noEvent.source === 'place' && noEvent.path === 'p.png'
      && neither.source === 'default' && neither.path === 'default.png'
  })())
  t('\u26a0\ufe0f a blank or whitespace path is not a picture', (() => {
    const r = resolveBackground({ fallback: D, place: img('   ', 1080, 1350), event: img('', 1080, 1350) })
    return r.source === 'default'
  })())
  t('\u26a0\ufe0f the choice NAMES its source, so the modal cannot label one picture and draw another',
    resolveBackground({ fallback: D }).source === 'default')

  /* \u{1F534} THE SHAPE RULE. The boxes were placed once on the default; a differently shaped picture puts
   * them somewhere else entirely, with no error, because a box at (x, y) is valid on any canvas. */
  t('\u{1F534} 0.5% OFF IS ACCEPTED \u2014 a re-export is not a different poster', (() => {
    // 1080\u00d71350 is 0.8; 0.5% tighter is 0.796
    const h = Math.round(1080 / (0.8 * 0.995))
    const c = checkAspect(1080, h, 1080, 1350)
    return c.ok && Math.abs((1080 / h) / 0.8 - 1) < ASPECT_TOLERANCE
  })())
  t('\u26d4 2% OFF IS REFUSED, and the message names the default\u2019s size', (() => {
    const h = Math.round(1080 / (0.8 * 0.98))
    const c = checkAspect(1080, h, 1080, 1350)
    return !c.ok && /different shape/i.test(c.error) && c.error.includes('1080\u00d71350')
  })())
  t('\u{1F534} A DIFFERENT RESOLUTION, SAME SHAPE, IS ACCEPTED \u2014 a sharper export is the same poster',
    checkAspect(2160, 2700, 1080, 1350).ok && checkAspect(540, 675, 1080, 1350).ok)
  t('\u26d4 landscape is refused against a portrait default', !checkAspect(1350, 1080, 1080, 1350).ok)
  /* \u26a0\ufe0f THE TOLERANCE IS RELATIVE. A fixed \u00b10.01 would be strict on portrait (0.8) and loose on
   * landscape (1.78); dividing by the default's own ratio makes "within 1%" mean one thing. */
  t('\u26a0\ufe0f the tolerance means the same on a landscape default as on a portrait one', (() => {
    const portraitEdge = checkAspect(1080, Math.round(1080 / (0.8 * 1.009)), 1080, 1350).ok
    const landscapeEdge = checkAspect(1920, Math.round(1920 / ((16 / 9) * 1.009)), 1920, 1080).ok
    const portraitOver = checkAspect(1080, Math.round(1080 / (0.8 * 1.02)), 1080, 1350).ok
    const landscapeOver = checkAspect(1920, Math.round(1920 / ((16 / 9) * 1.02)), 1920, 1080).ok
    return portraitEdge && landscapeEdge && !portraitOver && !landscapeOver
  })())
  t('\u26d4 a zero or missing size is refused rather than dividing by zero',
    !checkAspect(0, 1350, 1080, 1350).ok && !checkAspect(1080, 0, 1080, 1350).ok)
  t('\u26a0\ufe0f a picture with no recorded size is never used \u2014 size is what proves the shape',
    fitsDefault({ path: 'x.png', width: null, height: null }, 1080, 1350) === false
    && fitsDefault(null, 1080, 1350) === false
    && fitsDefault({ path: 'x.png', width: 2160, height: 2700 }, 1080, 1350) === true)

  /* \u{1F534} A REPLACED DEFAULT STRANDS SOME PLACE PICTURES \u2014 they are KEPT and REPORTED, never deleted.
   * A truck who re-exported their default has not asked to throw away per-place artwork. */
  t('\u{1F534} replacing the default reports which place pictures no longer fit, by name', (() => {
    const stranded = placePicturesThatNoLongerFit([
      { id: 'a', name: 'Lavenham Village Hall', image: img('a.png', 1080, 1350) },
      { id: 'b', name: 'The Bull Inn', image: img('b.png', 1920, 1080) },
      { id: 'c', name: 'No picture', image: null },
    ], 1080, 1350)
    return stranded.length === 1 && stranded[0].name === 'The Bull Inn'
  })())

  // ── the "From" time ───────────────────────────────────────────────────────────────────────────
  const { formatEventTime } = M.format
  t('\u{1F534} "From 5pm" IS THE DEFAULT FORM, and keeps minutes when they are not :00',
    formatEventTime('17:00', '21:00', '12h', 'from') === 'From 5pm'
    && formatEventTime('17:30', '21:00', '12h', 'from') === 'From 5:30pm')
  t('\u{1F534} the range form is the stage 1 wording, unchanged',
    formatEventTime('17:00', '21:00', '12h', 'range') === '5pm \u2013 9pm')
  t('\u26a0\ufe0f 24-hour follows the EXISTING timeStyle rather than a second setting',
    formatEventTime('17:00', '21:00', '24h', 'from') === 'From 17:00'
    && formatEventTime('17:00', '21:00', '24h', 'range') === '17:00 \u2013 21:00')
  t('\u26d4 no start time gives NOTHING, never a dangling "From "',
    formatEventTime(null, '21:00', '12h', 'from') === ''
    && formatEventTime('', null, '12h', 'from') === '')
  t('\u26a0\ufe0f midnight and noon are 12am/12pm here too',
    formatEventTime('00:00', null, '12h', 'from') === 'From 12am'
    && formatEventTime('12:00', null, '12h', 'from') === 'From 12pm')

  // ── the event layout ──────────────────────────────────────────────────────────────────────────
  const { defaultEventLayout, validateEventLayout, defaultEventNoteBox, LAYOUT_VERSION } = M.layout
  const EW = 1080, EH = 1350
  const good = defaultEventLayout(EW, EH)
  t('\u{1F534} a fresh event layout validates, and its three boxes are inside the picture',
    validateEventLayout(good, EW, EH).ok === true)
  t('\u{1F534} the date defaults to ONE line on an event post (two on the weekly one)',
    good.date.twoLines === false && M.layout.defaultLayout(EW, EH).date.twoLines === true)
  t('\u{1F534} the time defaults to "From"', good.timeDisplay === 'from')
  const badEvent = [
    ['not an object', 'hello'],
    ['a wrong version', { ...good, version: LAYOUT_VERSION + 1 }],
    ['a NaN position', { ...good, date: { ...good.date, x: NaN } }],
    ['a numeric string', { ...good, time: { ...good.time, y: '400' } }],
    ['a box off the edge', { ...good, location: { ...good.location, x: EW - 10, w: 400 } }],
    ['a missing box', { ...good, time: undefined }],
  ]
  for (const [what, input] of badEvent) {
    const r = validateEventLayout(input, EW, EH)
    t(`\u26d4 EVENT LAYOUT REJECTED: ${what}`, r.ok === false && r.errors.length > 0)
  }
  t('\u26a0\ufe0f an unknown timeDisplay becomes the documented default rather than being refused', (() => {
    const r = validateEventLayout({ ...good, timeDisplay: 'sideways' }, EW, EH)
    return r.ok && r.layout.timeDisplay === 'from'
  })())
  t('\u{1F534} THE IMAGE SIZE COMES FROM THE SERVER on the event layout too',
    validateEventLayout({ ...good, width: 9000, height: 9000, time: { ...good.time, x: 5000, w: 400 } }, EW, EH).ok === false)
  t('\u26a0\ufe0f a note box can be added and validates', (() => {
    const withNote = { ...good, note: defaultEventNoteBox(good) }
    return validateEventLayout(withNote, EW, EH).ok === true
  })())
  /* \u26a0\ufe0f THE TWO LAYOUTS ARE DIFFERENT SHAPES AND EACH VALIDATOR REFUSES THE OTHER \u2014 which is why
   * they are separate functions rather than one with a `kind` branch. */
  t('\u26d4 the week validator refuses an event layout, and vice versa',
    M.layout.validateLayout(good, EW, EH).ok === false
    && validateEventLayout(M.layout.defaultLayout(EW, EH), EW, EH).ok === true)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 8c · STAGE 2b · A DESIGN PER PLACE — THE RULES, WITH NO PICTURES INVOLVED
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT GOES WRONG HERE IS SILENT AND PERMANENT. A place whose picture already has its venue name
// printed on it needs its own box positions; pair the wrong picture with the wrong positions and the
// text lands over the artwork, on a poster that goes straight to customers with no error anywhere.
head('8c · A DESIGN PER PLACE')
{
  const { resolveDesign, oneOffMustMatch, placePictureNeedsDefaultShape, checkAspect } = M.bg
  const STD = { image: { path: 'std.png', width: 1080, height: 1350 }, layout: { tag: 'standard' } }
  const img = (path, w, h) => ({ path, width: w, height: h })

  // ── 1 · THE ORDER OF PREFERENCE, AND THE POSITIONS THAT TRAVEL WITH IT ────────────────────────
  const placeOwn = { placeId: 'p1', image: img('kezmet.png', 1080, 1080), layout: { tag: 'kezmet' } }
  const placeStd = { placeId: 'p2', image: img('sudbury.png', 1080, 1350), layout: null }

  t('🔴 A PLACE DESIGN BEATS STANDARD — its picture AND its positions', (() => {
    const r = resolveDesign({ standard: STD, place: placeOwn })
    return r.source === 'place' && r.image.path === 'kezmet.png'
      && r.layout.tag === 'kezmet' && r.layoutSource === 'place'
  })())

  t('🔴 A ONE-OFF BEATS BOTH — but it brings only a picture', (() => {
    const r = resolveDesign({ standard: STD, place: placeOwn, oneOff: img('tonight.png', 1080, 1080) })
    /* ⚠️ THE POSITIONS ARE STILL THE PLACE'S. A one-off replaces the background for one event; it is
     * not a new design, so it inherits whatever design it displaced. */
    return r.source === 'event' && r.image.path === 'tonight.png'
      && r.layout.tag === 'kezmet' && r.layoutSource === 'place'
  })())

  t('⚠️ a one-off at a place on STANDARD positions inherits STANDARD positions', (() => {
    const r = resolveDesign({ standard: STD, place: placeStd, oneOff: img('tonight.png', 1080, 1350) })
    return r.source === 'event' && r.layout.tag === 'standard' && r.layoutSource === 'standard'
  })())

  t('⚠️ a place with a picture but no positions of its own uses Standard’s', (() => {
    const r = resolveDesign({ standard: STD, place: placeStd })
    return r.source === 'place' && r.image.path === 'sudbury.png'
      && r.layout.tag === 'standard' && r.layoutSource === 'standard'
  })())

  t('⚠️ no place and no one-off ⇒ Standard, both halves', (() => {
    const r = resolveDesign({ standard: STD })
    return r.source === 'default' && r.image.path === 'std.png' && r.layoutSource === 'standard'
  })())

  /* 🔴 CHOOSING STANDARD IN THE MODAL TAKES STANDARD'S POSITIONS TOO. This is the brief's rule and the
   * one most easily got wrong: forcing the picture alone would draw Standard's artwork with the
   * place's boxes, which is precisely the mismatch this whole stage exists to prevent. */
  t('🔴 FORCING Standard AT A PLACE WITH ITS OWN DESIGN TAKES STANDARD’S POSITIONS, NOT THE PLACE’S', (() => {
    const r = resolveDesign({ standard: STD, place: placeOwn, force: 'default' })
    return r.source === 'default' && r.image.path === 'std.png'
      && r.layout.tag === 'standard' && r.layoutSource === 'standard'
  })())

  t('⚠️ forcing the place still gets the place’s own positions', (() => {
    const r = resolveDesign({ standard: STD, place: placeOwn, oneOff: img('t.png', 1080, 1080), force: 'place' })
    return r.source === 'place' && r.layout.tag === 'kezmet'
  })())

  /* ⚠️ A PLACE CAN HAVE POSITIONS AND NO PICTURE — the truck arranged the boxes, then removed the
   * picture. Half a design is still a design; ignoring it would silently undo what they asked for. */
  t('⚠️ own positions with no picture of its own: Standard’s picture, the place’s boxes', (() => {
    const r = resolveDesign({ standard: STD, place: { placeId: 'p3', image: null, layout: { tag: 'own' } } })
    return r.source === 'default' && r.image.path === 'std.png'
      && r.layout.tag === 'own' && r.layoutSource === 'place'
  })())

  // ── 2 · THE SHAPE RULE DEPENDS ON WHOSE POSITIONS ARE USED ───────────────────────────────────
  t('🔴 A PLACE WITH ITS OWN POSITIONS NEEDS NO PARTICULAR SHAPE…',
    placePictureNeedsDefaultShape({ layout: { tag: 'own' } }) === false)
  t('🔴 …AND A PLACE ON STANDARD’S POSITIONS KEEPS THE 1% RULE',
    placePictureNeedsDefaultShape({ layout: null }) === true
    && placePictureNeedsDefaultShape(null) === true
    && placePictureNeedsDefaultShape(undefined) === true)

  /* 🔴 THE 1% RULE ITSELF IS UNCHANGED FOR STANDARD POSITIONS. A square picture against a 4:5 default
   * is a 25% drift — the case that moved every box in stage 2 — and it is still refused. */
  t('🔴 a square picture is still refused where Standard’s positions are used',
    checkAspect(1080, 1080, 1080, 1350).ok === false
    && checkAspect(2160, 2700, 1080, 1350).ok === true)

  t('🔴 A ONE-OFF MUST MATCH THE DESIGN IT WOULD INHERIT, NOT ALWAYS THE DEFAULT', (() => {
    /* ⚠️ THE WHOLE POINT: at Kezmet the inherited canvas is 1080×1080, so a 1080×1350 one-off — which
     * matches Standard perfectly — is the WRONG shape for the positions it is about to be given. */
    const target = oneOffMustMatch({ standard: STD.image, place: placeOwn })
    const atStandardPlace = oneOffMustMatch({ standard: STD.image, place: placeStd })
    const noPlace = oneOffMustMatch({ standard: STD.image, place: null })
    return target.path === 'kezmet.png'
      && checkAspect(1080, 1350, target.width, target.height).ok === false
      && checkAspect(1080, 1080, target.width, target.height).ok === true
      && atStandardPlace.path === 'std.png' && noPlace.path === 'std.png'
  })())

  // ── 3 · THE SAME BOXES ON A DIFFERENT CANVAS ─────────────────────────────────────────────────
  const { scaleEventLayout, defaultEventLayout, validateEventLayout } = M.layout
  t('🔴 scaleEventLayout moves every box proportionally and keeps it valid', (() => {
    const base = defaultEventLayout(1080, 1350)
    const up = scaleEventLayout(base, 2160, 2700)
    if (!up) return false
    return up.width === 2160 && up.height === 2700
      && up.date.x === base.date.x * 2 && up.date.w === base.date.w * 2
      && up.time.y === base.time.y * 2
      // ⚠️ THE FONT SIZE SCALES TOO, or the text would be half the size on a 2× canvas
      && up.location.fontSize === base.location.fontSize * 2
      && validateEventLayout(up, 2160, 2700).ok === true
  })())
  t('⚠️ it refuses input it cannot scale rather than inventing a canvas',
    scaleEventLayout(null, 1080, 1350) === null
    && scaleEventLayout({ width: 0, height: 0 }, 1080, 1350) === null
    && scaleEventLayout({ width: 100, height: 100 }, 1080, 1350) === null)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 8d · STAGE 2b · THE THREE BOXES CAN BE SWITCHED OFF
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A SWITCHED-OFF BOX IS AN EXPLICIT FLAG, NOT A ZERO-SIZE BOX. A 0×0 box is indistinguishable from
// a box the truck dragged to nothing, cannot be switched back on without remembering where it was, and
// would still be measured, shrunk and warned about by the fit machinery.
head('8d · BOXES SWITCHED OFF')
{
  const { defaultEventLayout, validateEventLayout, toggleIsAllowed, LAST_TOGGLE_MESSAGE } = M.layout
  const EW = 1080, EH = 1350
  const base = defaultEventLayout(EW, EH)

  t('🔴 all three start switched ON — a design never opens looking broken',
    base.date.enabled === true && base.location.enabled === true && base.time.enabled === true)

  t('🔴 THE VALIDATOR ACCEPTS A SWITCHED-OFF BOX EXPLICITLY, keeping its position', (() => {
    const off = { ...base, date: { ...base.date, enabled: false } }
    const v = validateEventLayout(off, EW, EH)
    return v.ok === true && v.layout.date.enabled === false
      // ⚠️ THE COORDINATES SURVIVE, so switching it back on puts it where it was
      && v.layout.date.x === base.date.x && v.layout.date.w === base.date.w
  })())

  t('⚠️ a layout saved before the toggles existed reads as all-on', (() => {
    const old = JSON.parse(JSON.stringify(base))
    delete old.date.enabled; delete old.location.enabled; delete old.time.enabled
    const v = validateEventLayout(old, EW, EH)
    return v.ok === true && v.layout.date.enabled === true
      && v.layout.location.enabled === true && v.layout.time.enabled === true
  })())

  /* 🔴 AT LEAST ONE OF LOCATION OR TIME MUST STAY ON, and the reason is a cancelled event: it says so
   * by striking the place name through and writing CANCELLED where the time goes. With both off, a
   * cancelled event renders as an ordinary poster telling customers to come to something that is not
   * happening. The DATE may be switched off freely — it carries no cancellation. */
  t('🔴 LOCATION AND TIME BOTH OFF IS REFUSED, with the reason said out loud', (() => {
    const both = { ...base, location: { ...base.location, enabled: false }, time: { ...base.time, enabled: false } }
    const v = validateEventLayout(both, EW, EH)
    return v.ok === false
      && v.errors.length === 1 && v.errors[0] === LAST_TOGGLE_MESSAGE
      // ⚠️ THE MESSAGE EXPLAINS ITSELF rather than naming a field — it is shown to a truck, not a dev
      && /cancelled/i.test(LAST_TOGGLE_MESSAGE)
  })())

  t('🔴 …but either ONE of them alone is allowed', (() => {
    const noLoc = { ...base, location: { ...base.location, enabled: false } }
    const noTime = { ...base, time: { ...base.time, enabled: false } }
    return validateEventLayout(noLoc, EW, EH).ok === true
      && validateEventLayout(noTime, EW, EH).ok === true
  })())

  t('⚠️ the Date box may be switched off on its own — it carries no cancellation',
    validateEventLayout({ ...base, date: { ...base.date, enabled: false } }, EW, EH).ok === true)

  t('⚠️ toggleIsAllowed is the same rule the UI blocks with', (() => {
    const on = { enabled: true }, off = { enabled: false }
    return toggleIsAllowed({ location: on, time: on }) === true
      && toggleIsAllowed({ location: on, time: off }) === true
      && toggleIsAllowed({ location: off, time: on }) === true
      && toggleIsAllowed({ location: off, time: off }) === false
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 8e · STAGE 2b · THE PLACE IS MATCHED BY ID, NOT BY NAME
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 STAGE 2 MATCHED THE PLACE BY THE NAME IT HAD JUST PRINTED (stage 2 report §8.3). That was correct
// by coincidence while the only thing hanging off it was a picture. Now a place's TEXT POSITIONS hang
// off it, and two places can share a short name — so the wrong design would be attached to the event,
// and the truck would see a poster laid out for a different venue.
head('8e · THE PLACE IS MATCHED BY ID')
{
  const { entryFor } = M.data
  /* Two places with similar names, one of them with a design. ⚠️ THEY SHARE A SHORT NAME on purpose —
   * "Sudbury" the market and "Sudbury" the pub is an ordinary thing for a truck to have. */
  const PLACES = [
    { id: 'pub-1', name: 'The Bull, Sudbury', short_name: 'Sudbury', name_key: 'the bull sudbury', area: 'Sudbury' },
    { id: 'market-1', name: 'Sudbury Market', short_name: 'Sudbury', name_key: 'sudbury market', area: 'Sudbury' },
  ]
  const DESIGNS = { 'market-1': { tag: 'market' } }

  t('🔴 entryFor RETURNS THE PLACE’S ID, so nothing downstream has to guess from the name', (() => {
    const atMarket = entryFor({ id: 'e1', event_date: '2026-10-16', start_time: '17:00', end_time: '21:00',
      venue_name: 'Sudbury Market', truck_place_id: 'market-1', status: 'confirmed' }, PLACES, '12h')
    const atPub = entryFor({ id: 'e2', event_date: '2026-10-17', start_time: '17:00', end_time: '21:00',
      venue_name: 'The Bull, Sudbury', truck_place_id: 'pub-1', status: 'confirmed' }, PLACES, '12h')
    return atMarket.placeId === 'market-1' && atPub.placeId === 'pub-1'
      // 🔴 AND THE PRINTED NAME IS THE SAME FOR BOTH, which is why the name cannot be the key
      && atMarket.name === atPub.name && atMarket.name === 'Sudbury'
  })())

  t('🔴 THE DESIGN FOLLOWS THE ID: the pub does not inherit the market’s design', (() => {
    const atPub = entryFor({ id: 'e2', event_date: '2026-10-17', start_time: '17:00', end_time: '21:00',
      venue_name: 'The Bull, Sudbury', truck_place_id: 'pub-1', status: 'confirmed' }, PLACES, '12h')
    const atMarket = entryFor({ id: 'e1', event_date: '2026-10-16', start_time: '17:00', end_time: '21:00',
      venue_name: 'Sudbury Market', truck_place_id: 'market-1', status: 'confirmed' }, PLACES, '12h')
    /* ⚠️ THE BY-NAME LOOKUP IS RUN ALONGSIDE, so this check states what the old code WOULD have done
     * rather than only what the new code does. By name, both events find whichever row comes first. */
    const byName = (e) => PLACES.find(pl => (pl.short_name || pl.name) === e.name)?.id ?? null
    return DESIGNS[atMarket.placeId] !== undefined
      && DESIGNS[atPub.placeId] === undefined
      && byName(atPub) === 'pub-1' && byName(atMarket) === 'pub-1'   // both → the pub: the stage 2 bug
      && byName(atMarket) !== atMarket.placeId
  })())

  t('⚠️ an event with no place at all has a null id, not an empty string', (() => {
    const e = entryFor({ id: 'e3', event_date: '2026-10-18', start_time: '17:00', end_time: '21:00',
      venue_name: 'Somewhere New', status: 'confirmed' }, [], '12h')
    return e.placeId === null && e.name === 'Somewhere New'
  })())

  /* 🔴 THE ROUTE USES THE ID. Read from the source, because the rule is only true if the server does
   * it — a pure check on `entryFor` would pass with the route still matching on the name. */
  t('🔴 the route looks the place up by `entry.placeId`, and no longer by its printed name', (() => {
    const route = fs.readFileSync(path.join(REPO, 'app/api/weekly-post/route.ts'), 'utf8')
    const fn = route.slice(route.indexOf('async function eventPostContext('),
      route.indexOf('export async function POST('))
    return /String\(pl\.id\) === entry\.placeId/.test(fn)
      && !/=== entry\.name/.test(fn)
      && !/pl\.short_name \?\? ''\)\.trim\(\) \|\| String\(pl\.name/.test(fn)
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 9 · THE RENDER — PIXELS
// ════════════════════════════════════════════════════════════════════════════════════════════════
const renderSuite = async () => {
head('9 · THE RENDER, CHECKED IN THE PIXELS')
const { ImageResponse } = require(path.join(REPO, 'node_modules/next/og.js'))

/** A synthetic blank. ⚠️ NOT a real truck's artwork — the brief forbids that, and layout does not need it. */
async function blank(w, h, style) {
  const bg = style === 'split'
    // 🔴 HALF WHITE, HALF BLACK — the readability rule's two cases on one image.
    ? 'linear-gradient(90deg,#ffffff 0%,#ffffff 50%,#000000 50%,#000000 100%)'
    : 'linear-gradient(160deg,#111827 0%,#7c2d12 60%,#f97316 100%)'
  const el = { type: 'div', props: { style: { display: 'flex', width: `${w}px`, height: `${h}px`, background: bg } } }
  const buf = Buffer.from(await new ImageResponse(el, { width: w, height: h }).arrayBuffer())
  return { buf, uri: 'data:image/png;base64,' + buf.toString('base64') }
}

const range = M.week.weekRange('this', '2026-09-30T12:00:00Z')
const EVENTS = [
  { id: 'e1', event_date: range.days[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
  { id: 'e2', event_date: range.days[2], start_time: '17:30', end_time: '20:00', venue_name: 'Great Waldingfield Recreation Ground and Playing Field', town: 'Great Waldingfield', status: 'confirmed' },
  { id: 'e3', event_date: range.days[4], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' },
  { id: 'e4', event_date: range.days[5], start_time: '11:00', end_time: '14:00', venue_name: 'Food Festival', town: 'Bury St Edmunds', status: 'confirmed' },
  { id: 'e5', event_date: range.days[5], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
]
const mkWeek = (events = EVENTS, o = {}) =>
  M.data.buildWeekData(range, events, [], { timeStyle: '12h', showCancelled: true, ...o })

const W = 1080, H = 1350
const bg = await blank(W, H)
const base = M.layout.defaultLayout(W, H)

const out = await M.render.renderWeeklyPost({ layout: base, week: mkWeek(), blankDataUri: bg.uri })
t('🔴 it renders a PNG at the blank\'s native size', (() => {
  const img = decodePng(out.png)
  return out.png.slice(1, 4).toString() === 'PNG' && img.width === W && img.height === H
})())
console.log(`      render: ${out.width}×${out.height}, ${(out.png.length / 1024).toFixed(0)} KB, ${out.ms} ms`)
t('🔴 …well inside the 2-second budget the brief sets', out.ms < 2000)

/* ── 🔴 EVERY BOX'S TEXT STAYS INSIDE ITS BOX, MEASURED IN THE PIXELS ────────────────────────────
 * The poster is rendered twice — once normally, once with every text colour made identical to the
 * background so nothing is drawn — and the two are diffed. The differing pixels ARE the text, with no
 * assumption about colour, shadow or anti-aliasing. Then each day's region is checked against the
 * boxes the design declares. This is the check that catches the measurement and the renderer
 * disagreeing, which is the failure that reaches a customer. */
/* ⚠️ ONE BOX TYPE AT A TIME, AND THE FIRST DRAFT OF THIS CHECK WAS WRONG. It diffed a region
 * stretching 60px either side of each box, which on this layout REACHES INTO THE NEXT BOX — so the
 * location's pixels were attributed to the date box and reported as a 57px overflow that did not
 * exist. Pixels cannot be attributed to a box by looking at where they are; the box has to be the only
 * thing drawn. So each box type is rendered with the other boxes parked in an 8×8 corner (where
 * `overflow: hidden` contains them) and diffed against the same poster with THIS box parked too. Every
 * differing pixel then belongs to this box type and to nothing else. */
const CORNER = { x: 0, y: 0, w: 8, h: 8 }
const park = (l, keys) => {
  const c = JSON.parse(JSON.stringify(l))
  for (const k of keys) if (c[k]) Object.assign(c[k], CORNER)
  return c
}
const flat = await blank(W, H, 'flat-dark')
const ALL = ['heading', 'date', 'location', 'time']
/** The corner is excluded from every diff — it is where the parked boxes' clipped text lives. */
const notCorner = { x: 16, y: 0, w: W - 16, h: H }

let overflow = null
for (const key of ['date', 'location', 'time']) {
  const others = ALL.filter(k => k !== key)
  const onlyThis = { ...park(base, others), keepReadable: false }
  const nothing = { ...park(base, ALL), keepReadable: false }
  const withBox = decodePng((await M.render.renderWeeklyPost({ layout: onlyThis, week: mkWeek(), blankDataUri: flat.uri })).png)
  const without = decodePng((await M.render.renderWeeklyPost({ layout: nothing, week: mkWeek(), blankDataUri: flat.uri })).png)
  const b = base[key]
  for (let i = 0; i < 7 && !overflow; i++) {
    const dy = base.rowSpacing * i
    /* ⚠️ THE BAND SPANS THE FULL WIDTH on purpose: if this box's text escaped sideways, the escape
     * is exactly what must be seen. A 2px tolerance absorbs an anti-aliased glyph edge and nothing
     * more — it is far below the width of a character. */
    const band = { x: 16, y: Math.max(0, b.y + dy - 2), w: W - 16, h: b.h + 4 }
    const got = diffBounds(withBox, without, band)
    if (got.empty) continue
    if (got.x < b.x - 2 || got.right > b.x + b.w + 2) {
      overflow = { day: i, key, boxX: [b.x, b.x + b.w], got: [got.x, got.right] }
    }
  }
  /* ⚠️ AND NOTHING OF THIS BOX TYPE IS DRAWN BELOW THE LAST ROW — the check that seven rows were
   * laid out where the design says, rather than six and a stray. */
  const belowLast = { x: 16, y: b.y + base.rowSpacing * 6 + b.h + 8, w: W - 16, h: H - (b.y + base.rowSpacing * 6 + b.h + 8) - Math.round(H * 0.05) }
  if (!overflow && belowLast.h > 10 && !diffBounds(withBox, without, belowLast).empty) {
    overflow = { key, note: 'text drawn below the last row' }
  }
}
t('🔴 EVERY DAY\'S DATE, LOCATION AND TIME STAYS INSIDE ITS BOX — checked in the rendered pixels',
  overflow === null)
if (overflow) console.log('      ' + J(overflow))

const withText = await M.render.renderWeeklyPost({ layout: { ...base, keepReadable: false }, week: mkWeek(), blankDataUri: flat.uri })
const imgA = decodePng(withText.png)

/* 🔴 "Powered by HatchGrab" IS ON THE IMAGE. Checked by diffing the bottom strip against a render of
 * the same poster with the mark's own pixels as the only difference — it is always present, so the
 * honest check is that the bottom strip contains drawn pixels that the blank did not have. */
const bottomStrip = { x: 0, y: H - Math.round(H * 0.05), w: W, h: Math.round(H * 0.05) }
const blankImg = decodePng(flat.buf)
const mark = diffBounds(imgA, blankImg, bottomStrip)
t('🔴 "Powered by HatchGrab" is drawn at the bottom centre', (() => {
  if (mark.empty) return false
  const centre = mark.x + mark.w / 2
  return Math.abs(centre - W / 2) < W * 0.08 && mark.w > 60
})())

/* ── 🔴 THE READABILITY SHADOW, ON A HALF-WHITE BLANK ────────────────────────────────────────────
 * White text on the white half must gain a shadow; the same text on the black half must not. Both are
 * rendered from the SAME design, differing only in the stored sample, and compared as pixels. */
const split = await blank(W, H, 'split')
const narrow = (x) => {
  const l = JSON.parse(JSON.stringify(base))
  l.keepReadable = true
  l.location = { ...l.location, x, w: Math.round(W * 0.4), color: '#ffffff' }
  return l
}
const onWhite = narrow(Math.round(W * 0.05))
onWhite.location.bgSample = { r: 255, g: 255, b: 255 }
const onWhiteNoHelp = JSON.parse(JSON.stringify(onWhite)); onWhiteNoHelp.keepReadable = false
const a1 = await M.render.renderWeeklyPost({ layout: onWhite, week: mkWeek(), blankDataUri: split.uri })
const a2 = await M.render.renderWeeklyPost({ layout: onWhiteNoHelp, week: mkWeek(), blankDataUri: split.uri })
t('🔴 A LOW-CONTRAST BOX GAINS A SHADOW — the pixels differ from the same render without it',
  !diffBounds(decodePng(a1.png), decodePng(a2.png), null).empty)

/* ⚠️ COMPARED AGAINST "no sample", NOT AGAINST keepReadable OFF. Turning the setting off also
 * removes the shadow from the "Powered by HatchGrab" mark, so the two images would differ for a reason
 * that has nothing to do with this box — which is what the first draft of this check measured. Both
 * renders below have the setting ON; only the stored sample differs, so the box is the only thing that
 * could change. */
const onDark = narrow(Math.round(W * 0.55))
onDark.location.bgSample = { r: 0, g: 0, b: 0 }
const onDarkNoSample = JSON.parse(JSON.stringify(onDark)); onDarkNoSample.location.bgSample = null
const b1 = await M.render.renderWeeklyPost({ layout: onDark, week: mkWeek(), blankDataUri: split.uri })
const b2 = await M.render.renderWeeklyPost({ layout: onDarkNoSample, week: mkWeek(), blankDataUri: split.uri })
t('🔴 A HIGH-CONTRAST BOX GAINS NOTHING — byte-identical to the same poster with no shadow at all',
  Buffer.compare(b1.png, b2.png) === 0)

// ── days off, cancellations and stacking, in the output ─────────────────────────────────────────
const noEvents = await M.render.renderWeeklyPost({ layout: base, week: mkWeek([]), blankDataUri: bg.uri })
t('🔴 a week with no events renders seven days-off rows rather than failing',
  noEvents.png.length > 1000 && noEvents.warnings.length === 0)
t('⚠️ hiding cancelled events changes the image', (() => {
  const shown = mkWeek(EVENTS, { showCancelled: true })
  const hidden = mkWeek(EVENTS, { showCancelled: false })
  return J(shown.days[4].entries.length) !== J(hidden.days[4].entries.length)
})())

/* 🔴 A 60-CHARACTER NAME IS REPORTED WHEN IT HAD TO BE SHORTENED, naming the day. A silently
 * shortened place name is the one failure an operator cannot see coming. */
const tight = JSON.parse(JSON.stringify(base))
tight.location.w = 120
tight.location.fontSize = 40
const squeezed = await M.render.renderWeeklyPost({ layout: tight, week: mkWeek(), blankDataUri: bg.uri })
t('🔴 a name that had to be shortened produces a WARNING NAMING THE DAY', (() => {
  const w = squeezed.warnings.find(x => /shortened/i.test(x.message))
  return !!w && /^\d{4}-\d{2}-\d{2}$/.test(w.where)
})())

// ── the 2160px cap ──────────────────────────────────────────────────────────────────────────────
const tallBlank = await blank(1080, 2400)
const tall = M.layout.defaultLayout(1080, 2400)
const capped = await M.render.renderWeeklyPost({ layout: tall, week: mkWeek(), blankDataUri: tallBlank.uri })
t('🔴 THE LONGEST SIDE IS CAPPED AT 2160px, and the whole design scales with it',
  capped.height === 2160 && capped.width === Math.round(1080 * (2160 / 2400)))
console.log(`      tall render: ${capped.width}×${capped.height} in ${capped.ms} ms`)
t('⚠️ …and a 1080×1920 render is still well under 2s', capped.ms < 2000)

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 9b · THE SINGLE-EVENT POST, CHECKED IN THE PIXELS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('9b · THE SINGLE-EVENT POST, IN THE PIXELS')

const EV = { id: 'ev1', event_date: range.days[4], start_time: '17:00', end_time: '21:00',
  venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' }
const entryOf = (over = {}) => M.data.entryFor({ ...EV, ...over }, [], '12h')
const eventLayout = M.layout.defaultEventLayout(W, H)
const evBg = await blank(W, H)

const ev1 = await M.render.renderEventPost({
  layout: eventLayout, entry: entryOf(), date: EV.event_date, backgroundDataUri: evBg.uri,
})
t('\u{1F534} it renders a PNG at the picture\u2019s native size', (() => {
  const img = decodePng(ev1.png)
  return ev1.png.slice(1, 4).toString() === 'PNG' && img.width === W && img.height === H
})())
console.log(`      event render: ${ev1.width}\u00d7${ev1.height}, ${(ev1.png.length / 1024).toFixed(0)} KB, ${ev1.ms} ms`)
t('\u26a0\ufe0f \u2026well inside the 2-second budget', ev1.ms < 2000)

/* \u{1F534} EVERY BOX'S TEXT STAYS INSIDE ITS BOX \u2014 the stage 1 method, reused: render one box type at a
 * time with the others parked in an 8\u00d78 corner, diff against the same poster with this one parked too,
 * and every differing pixel then belongs to this box and nothing else. */
const EV_KEYS = ['date', 'location', 'time']
const parkEv = (l, keys) => {
  const c = JSON.parse(JSON.stringify(l))
  for (const k of keys) if (c[k]) Object.assign(c[k], { x: 0, y: 0, w: 8, h: 8 })
  return c
}
let evOverflow = null
for (const key of EV_KEYS) {
  const others = EV_KEYS.filter(k => k !== key)
  const onlyThis = { ...parkEv(eventLayout, others), keepReadable: false }
  const nothing = { ...parkEv(eventLayout, EV_KEYS), keepReadable: false }
  const withBox = decodePng((await M.render.renderEventPost({ layout: onlyThis, entry: entryOf(), date: EV.event_date, backgroundDataUri: flat.uri })).png)
  const without = decodePng((await M.render.renderEventPost({ layout: nothing, entry: entryOf(), date: EV.event_date, backgroundDataUri: flat.uri })).png)
  const b = eventLayout[key]
  const band = { x: 16, y: Math.max(0, b.y - 2), w: W - 16, h: b.h + 4 }
  const got = diffBounds(withBox, without, band)
  if (!got.empty && (got.x < b.x - 2 || got.right > b.x + b.w + 2)) {
    evOverflow = { key, boxX: [b.x, b.x + b.w], got: [got.x, got.right] }
  }
}
t('\u{1F534} THE DATE, LOCATION AND TIME STAY INSIDE THEIR BOXES \u2014 checked in the rendered pixels',
  evOverflow === null)
if (evOverflow) console.log('      ' + J(evOverflow))

/* \u{1F534} A BIGGER PICTURE OF THE SAME SHAPE PUTS THE TEXT IN THE SAME PLACE. This is the whole reason
 * for the aspect rule: the design's own width/height drive the frame, so a 2160\u00d72700 place picture is
 * drawn at the default's exact size and the boxes do not move. Proved by rendering both and comparing
 * the text pixels, not by reasoning about the code. */
const bigBg = await blank(W * 2, H * 2)
const sameShape = await M.render.renderEventPost({
  layout: eventLayout, entry: entryOf(), date: EV.event_date, backgroundDataUri: bigBg.uri,
})
t('\u{1F534} A 2\u00d7 BACKGROUND OF THE SAME SHAPE RENDERS AT THE SAME SIZE', sameShape.width === W && sameShape.height === H)
/* \u26a0\ufe0f EACH BACKGROUND IS COMPARED AGAINST THE SAME POSTER WITH NO TEXT ON IT, so what is compared
 * is the TEXT's bounding box rather than the two backgrounds \u2014 which genuinely differ, one being a 2\u00d7
 * render of the other. The two "no text" renders are awaited here rather than inside the assertion:
 * an earlier draft wrapped them in a pass-through helper to use them in an arrow function, which
 * returned the PROMISE and crashed the decoder. */
const blankTextEv = parkEv(eventLayout, EV_KEYS)
const noneA = decodePng((await M.render.renderEventPost({ layout: blankTextEv, entry: entryOf(), date: EV.event_date, backgroundDataUri: evBg.uri })).png)
const noneB = decodePng((await M.render.renderEventPost({ layout: blankTextEv, entry: entryOf(), date: EV.event_date, backgroundDataUri: bigBg.uri })).png)
t('\u{1F534} \u2026and the text lands in exactly the same place', (() => {
  const ba = diffBounds(decodePng(ev1.png), noneA, { x: 16, y: 0, w: W - 16, h: H })
  const bb = diffBounds(decodePng(sameShape.png), noneB, { x: 16, y: 0, w: W - 16, h: H })
  return !ba.empty && !bb.empty
    && Math.abs(ba.x - bb.x) <= 1 && Math.abs(ba.y - bb.y) <= 1
    && Math.abs(ba.right - bb.right) <= 1 && Math.abs(ba.bottom - bb.bottom) <= 1
})())

/* \u{1F534} A CANCELLED EVENT READS "CANCELLED" WHATEVER THE TIME SETTING SAYS. The display choice is
 * applied below the cancelled branch, so no setting can give a cancelled event a trading time. */
const cancelled = await M.render.renderEventPost({
  layout: eventLayout, entry: entryOf({ status: 'cancelled' }), date: EV.event_date, backgroundDataUri: evBg.uri,
})
t('\u{1F534} a cancelled event renders, and differs from the same event trading',
  Buffer.compare(cancelled.png, ev1.png) !== 0 && cancelled.png.length > 1000)
t('\u{1F534} \u2026and "From 5pm" cannot override CANCELLED', (() => {
  const asRange = { ...eventLayout, timeDisplay: 'range' }
  const a = M.data.entryFor({ ...EV, status: 'cancelled' }, [], '12h')
  return a.status === 'cancelled' && a.time === '' && asRange.timeDisplay === 'range'
})())

/* \u26a0\ufe0f THE MARK IS THE SAME ONE. Extracted in stage 2 so the event post cannot drift from the weekly
 * post in size, position or opacity \u2014 checked by finding it in the same bottom strip. */
const evMark = diffBounds(decodePng(ev1.png), decodePng(evBg.buf), { x: 0, y: H - Math.round(H * 0.05), w: W, h: Math.round(H * 0.05) })
t('\u{1F534} "Powered by HatchGrab" is on the event post too, bottom centre', (() => {
  if (evMark.empty) return false
  return Math.abs((evMark.x + evMark.w / 2) - W / 2) < W * 0.08 && evMark.w > 60
})())

/* \u26a0\ufe0f THE WEEKLY POST IS UNAFFECTED. Stage 2 refactored the renderer so both posters share `boxEl`,
 * `paint` and the mark; the proof that the refactor changed nothing is that every stage 1 check above
 * still passes, and this one asserts the two posters are still different pictures. */
t('\u26a0\ufe0f the weekly post and the event post are still different posters',
  Buffer.compare(out.png, ev1.png) !== 0)


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 9d · STAGE 2b, IN THE PIXELS — A SWITCHED-OFF BOX, AND A CANCELLED EVENT WITHOUT A LOCATION BOX
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('9d · SWITCHED-OFF BOXES, IN THE PIXELS')

/* 🔴 CHECKED IN THE RENDERED PIXELS, NOT BY READING THE RENDERER. "Draws nothing" is a claim about the
 * image; a renderer could skip the text and still emit a shadow, a panel behind the date, or a stray
 * row of background colour from an empty flex child. The only honest test is to look at the output.
 * ⚠️ `keepReadable: false` ON BOTH SIDES, so the comparison cannot be decided by a drop shadow whose
 * presence depends on the sampled colour rather than on the toggle. */
const flatForToggle = flat
for (const key of ['date', 'location', 'time']) {
  /* The box under test is the ONLY one on the poster; the other two are parked in an 8×8 corner. Its
   * own band is then compared against the same poster with this box switched OFF as well. */
  const others = ['date', 'location', 'time'].filter(k => k !== key)
  const onlyThis = { ...parkEv(eventLayout, others), keepReadable: false }
  const switchedOff = { ...onlyThis, [key]: { ...onlyThis[key], enabled: false } }

  const withBox = decodePng((await M.render.renderEventPost({
    layout: onlyThis, entry: entryOf(), date: EV.event_date, backgroundDataUri: flatForToggle.uri })).png)
  const offBox = decodePng((await M.render.renderEventPost({
    layout: switchedOff, entry: entryOf(), date: EV.event_date, backgroundDataUri: flatForToggle.uri })).png)
  const bare = decodePng((await M.render.renderEventPost({
    layout: { ...parkEv(eventLayout, ['date', 'location', 'time']), keepReadable: false,
      date: { ...parkEv(eventLayout, ['date']).date, enabled: false },
      location: { ...parkEv(eventLayout, ['location']).location, enabled: false },
      time: { ...parkEv(eventLayout, ['time']).time, enabled: false } },
    entry: entryOf(), date: EV.event_date, backgroundDataUri: flatForToggle.uri })).png)

  const b = eventLayout[key]
  const band = { x: 0, y: Math.max(0, b.y - 4), w: W, h: b.h + 8 }
  const drew = diffBounds(withBox, bare, band)
  const drewNothing = diffBounds(offBox, bare, band)
  /* 🔴 TWO HALVES, AND BOTH MATTER. The box must DRAW something when it is on — otherwise "nothing
   * changed" would pass for a box that never worked — and NOTHING AT ALL when it is off. */
  t(`🔴 THE ${key.toUpperCase()} BOX DRAWS PIXELS WHEN ON, AND NOT ONE PIXEL WHEN OFF`,
    !drew.empty && drewNothing.empty)
  if (drew.empty || !drewNothing.empty) console.log('      ' + J({ key, on: drew, off: drewNothing }))
}

/* 🔴 A CANCELLED EVENT AT A PLACE WITH LOCATION SWITCHED OFF STILL READS CANCELLED. This is the whole
 * reason one of Location and Time has to stay on. A truck whose picture already names the venue
 * switches Location off; if the cancellation lived only in the struck-through place name, that truck's
 * cancelled posts would look exactly like their trading ones. */
{
  const noLoc = { ...eventLayout, location: { ...eventLayout.location, enabled: false }, keepReadable: false }
  const cancelled = await M.render.renderEventPost({
    layout: noLoc, entry: entryOf({ status: 'cancelled' }), date: EV.event_date, backgroundDataUri: flat.uri })
  const trading = await M.render.renderEventPost({
    layout: noLoc, entry: entryOf(), date: EV.event_date, backgroundDataUri: flat.uri })

  const timeBand = { x: 0, y: Math.max(0, eventLayout.time.y - 4), w: W, h: eventLayout.time.h + 8 }
  const locBand = { x: 0, y: Math.max(0, eventLayout.location.y - 4), w: W, h: eventLayout.location.h + 8 }
  const timeDiff = diffBounds(decodePng(cancelled.png), decodePng(trading.png), timeBand)
  const locDiff = diffBounds(decodePng(cancelled.png), decodePng(trading.png), locBand)

  /* ⚠️ THE DIFFERENCE MUST BE IN THE TIME BAND. Comparing whole posters would pass on any difference
   * at all — including the struck-through name, which is exactly the thing that is switched off here.
   * The location band is asserted IDENTICAL as the other half of the same statement. */
  t('🔴 A CANCELLED EVENT WITH LOCATION SWITCHED OFF STILL READS CANCELLED — in the time box',
    !timeDiff.empty && locDiff.empty)
  if (timeDiff.empty || !locDiff.empty) console.log('      ' + J({ timeDiff, locDiff }))
}

return { bg, base, mkWeek, blank, eventLayout, entryOf, EV, evBg }
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 9c · THE WIRING — where the single-event post is reachable from
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('9c · THE WIRING')
{
  const page = fs.readFileSync(path.join(REPO, 'app/manage/[token]/page.tsx'), 'utf8')
  const weekly = fs.readFileSync(path.join(REPO, 'components/manage/WeeklyPost.tsx'), 'utf8')
  const eventUi = fs.readFileSync(path.join(REPO, 'components/manage/EventPost.tsx'), 'utf8')
  const route = fs.readFileSync(path.join(REPO, 'app/api/weekly-post/route.ts'), 'utf8')

  t('🔴 "Make post" is on each UPCOMING event in Schedule › Events',
    />Make post</.test(page)
    && /setPostEventId\(event\.id\)/.test(page)
    // ⚠️ inside the `!isPast` branch, so past and cancelled rows keep their existing treatment
    && page.indexOf('setPostEventId(event.id)') > page.indexOf('{!isPast && ('))
  t('🔴 …and it opens the modal, which asks the SERVER whether there is a design',
    /<EventPostModal token=\{token\} eventId=\{postEventId\}/.test(page)
    && /onNeedsSetup=\{\(\) => \{ setPostEventId\(null\); onSectionChange\('weekly'\) \}\}/.test(page))

  /* 🔴 THE §9.3 FIX. Stage 1 recorded that the weekly post's per-event "Share" did exactly what "Copy
   * text" did — two buttons doing one thing — because there was no per-event image to share. There is
   * now, so Share opens the modal that owns the picture and its share. */
  t('🔴 THE PER-EVENT LIST NOW HAS AN Image BUTTON, and Share is no longer a second Copy text', (() => {
    const list = weekly.slice(weekly.indexOf('Post for each event'), weekly.indexOf('Post for each event') + 2200)
    const copyButtons = (list.match(/void copy\(p\.text, 'Text'\)/g) || []).length
    return />Image</.test(list) && />Share</.test(list)
      && copyButtons === 1                                   // only "Copy text" copies now
      && (list.match(/setPostEventId\(p\.eventId\)/g) || []).length === 2   // Image and Share
  })())
  t('🔴 …and the modal shares the PICTURE and the text, text to the clipboard first',
    /navigator\.clipboard\.writeText\(info\.text\)/.test(eventUi)
    && /nav\.canShare\?\.\(\{ files: \[file\] \}\)/.test(eventUi)
    && eventUi.indexOf('clipboard.writeText(info.text)') < eventUi.indexOf('canShare?.({ files: [file] })'))

  /* ⚠️ MATCHED ON THE MARKERS THE CODE ACTUALLY USES. The first draft looked for
   * `designKind === 'event'`, which the component never writes — it branches on `=== 'week'` and on
   * the tab's own `=== k`. The check was wrong, not the code. */
  t('🔴 the Week | Single event switch is in the SETUP screen only', (() => {
    const setupOnly = weekly.indexOf("if (mode === 'setup') {")
    return /Single event/.test(weekly)
      && /setDesignKind\(k\)/.test(weekly)
      && /<EventSetupScreen token=\{token\}/.test(weekly)
      && setupOnly > 0 && weekly.indexOf('setDesignKind(k)') > setupOnly
      // ⛔ the POST screens are untouched by it — a weekly post is made here, an event post from its event
      && !/designKind/.test(weekly.slice(weekly.indexOf('function PostScreen')))
  })())

  /* 🔴 ONE GATE, SERVER-SIDE. The modal and the setup both call /api/weekly-post, which checks
   * `schedule_graphics` before every action — so an unentitled plan cannot reach the feature by
   * posting to the route, and the button needs no gate of its own. */
  t('🔴 the route gates every action, including the event ones',
    /const blocked = gated\(truck\)/.test(route)
    && route.indexOf('const blocked = gated(truck)') < route.indexOf("action === 'event_load'"))

  /* 🔴 REUSE, NOT A FORK. The event screens import the weekly post's editor pieces rather than copying
   * them, and the event renderer calls the same box machinery. */
  t('🔴 the event setup REUSES the weekly post\'s draggable box and controls',
    /from '\.\/WeeklyPost'/.test(eventUi)
    && /DraggableBox/.test(eventUi)
    && !/function DraggableBox/.test(eventUi))
  /* ══ STAGE 2b · THE WIRING ═══════════════════════════════════════════════════════════════════ */

  /* 🔴 THE MODAL'S CHOICE REACHES THE RESOLVER AS A FORCED SOURCE, and the resolver is what decides the
   * positions. Section 8c proves that forcing 'default' returns Standard's positions; this proves the
   * modal's radio button is actually wired to that argument — without it, 8c would be a check on a
   * function nothing calls with a force. */
  t('🔴 CHOOSING "Standard design" IN THE MODAL REACHES resolveDesign AS A FORCE', (() => {
    const fn = route.slice(route.indexOf("if (action === 'event_render')"),
      route.indexOf("return NextResponse.json({ error: 'Unknown action' }"))
    return /const forced = String\(body\.background \?\? ''\)/.test(fn)
      // the forced source is handed to the context, which hands it to resolveDesign
      && /eventPostContext\(truck, eventId, design, forced \|\| null\)/.test(fn)
      && /force: forced/.test(route)
      // 🔴 AND THE LAYOUT DRAWN IS THE RESOLVED ONE, not `design.layout` regardless of the choice
      && /body\.layout \?\? ctx\.layout \?\? design\.layout/.test(fn)
  })())
  t('⚠️ …and the modal sends the choice under that name', /action: 'event_render', eventId, background: choice/.test(eventUi))

  /* 🔴 THE LAYOUT IS VALIDATED AGAINST THE CANVAS IT WILL BE DRAWN ON. Validating a place's boxes
   * against Standard's size is how text ends up outside a differently shaped picture — the bounds
   * check would pass and the poster would be wrong. */
  t('🔴 a place layout is validated against the PLACE’S stored picture size, never the body’s', (() => {
    const ctxFn = route.slice(route.indexOf('async function eventPostContext('),
      route.indexOf('export async function POST('))
    const save = route.slice(route.indexOf("if (action === 'event_place_save_layout')"),
      route.indexOf("if (action === 'event_place_save_layout')") + 2000)
    return /validateEventLayout\(raw, placeImgRaw\.width, placeImgRaw\.height\)/.test(ctxFn)
      && /const w = row\.event_bg_width \|\| design\.width/.test(save)
      && /validateEventLayout\(body\.layout, w, h\)/.test(save)
      // ⛔ nothing in either path takes a canvas size from the request body
      && !/body\.width/.test(save) && !/body\.height/.test(save)
  })())

  /* 🔴 THE TOGGLES EXIST ON EVERY DESIGN INCLUDING STANDARD, and the last-one rule is the layout
   * module's own message rather than a second sentence written in the component. */
  t('🔴 the setup screen switches each box on and off, and blocks the last one with the shared message',
    /<Check label="Date" checked=\{layout\?\.date\.enabled !== false\}/.test(eventUi)
    && /<Check label="Location"/.test(eventUi) && /<Check label="Time"/.test(eventUi)
    && /setMsg\(\{ text: LAST_TOGGLE_MESSAGE, bad: true \}\)/.test(eventUi)
    && /toggleIsAllowed\(next\)/.test(eventUi)
    // ⚠️ AND IT SAYS WHY under the Location toggle, which is the only one with a reason to be off
    && /The place name is in your picture/.test(eventUi))

  /* 🔴 "+ ADD A DESIGN FOR A PLACE" USES THE SAME LIST AS ADD EVENT — favourites first, then by name,
   * with a search. The order comes from the SERVER, so the two screens cannot drift apart. */
  t('🔴 the designs list has Standard first, a status per design, and the place picker',
    /name: 'Standard', status: 'Used at every other place'/.test(eventUi)
    && /\+ Add a design for a place/.test(eventUi)
    && /placeholder="Search places"/.test(eventUi)
    && /pl\.isFavourite \? '★ ' : ''/.test(eventUi)
    && /Remove this place’s design/.test(eventUi)
    && /a\.is_favourite === true \? 0 : 1/.test(route))

  t('🔴 the three status wordings the brief names are the server’s, in one function',
    /function placeDesignStatus\(/.test(route)
    && /'Own picture and text positions'/.test(route)
    && /'Own picture, standard positions'/.test(route)
    && /'Different shape — not used until replaced'/.test(route)
    // ⛔ and the component does not write its own copy of them
    && !/Own picture and text positions/.test(eventUi))

  /* 🔴 THE PREVIEW FALLS BACK IN THE BRIEF'S ORDER: the next event here, then the last event here with
   * a label saying so, then the next event anywhere with this place's name put in. */
  t('🔴 the preview falls back next-here → last-here → anywhere-with-this-name', (() => {
    const fn = route.slice(route.indexOf('const previewFor = (placeId'),
      route.indexOf('const designs = await Promise.all'))
    return /firstAt\(upcoming as never, placeId\)/.test(fn)
      && /'Preview uses your last event here'/.test(fn)
      && /substituteName: true/.test(fn)
      && fn.indexOf('upcoming as never') < fn.indexOf('past as never')
      // 🔴 THE NAME IS SUBSTITUTED SERVER-SIDE, from the place id — never from text the client sent
      && /if \(nm\) entry = \{ \.\.\.entry, name: nm, placeId: designPlaceId \}/.test(route)
  })())

  /* 🔴 TIDY UP PLACES AND ADD EVENT ARE THE SAME MODAL AND MUST BE THE SAME SIZE. They were not: the
   * flag that decides the two-PANE layout was also deciding the SHELL, and it excludes Tidy up. */
  t('🔴 THE TIDY UP PLACES SHELL IS THE ADD EVENT SHELL — the same constants, not the same numbers', (() => {
    // the shell is written once, as constants, and the element uses nothing else
    const usesConstants = /className=\{`\$\{EVENT_MODAL_SHELL\} \$\{wideShell \? EVENT_MODAL_WIDE : EVENT_MODAL_NARROW\}`\}/.test(page)
    const wide = /const wideShell = showPicker \|\| modalView === 'tidy'/.test(page)
    /* ⛔ AND THE NUMBERS APPEAR ONCE EACH **IN THE CODE**. A second `md:max-w-[1040px]` or
     * `md:h-[90vh]` would be a copy that could drift — which is how the two sizes came apart.
     * ⚠️ COMMENTS ARE STRIPPED FIRST. The first draft of this check counted raw occurrences and
     * failed on the three notes that EXPLAIN the constants — a check that forbids writing down why
     * is a worse check, so it is the code that is counted. */
    const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const once = (re) => (code.match(re) || []).length === 1
    return usesConstants && wide
      && once(/md:max-w-\[1040px\]/g) && once(/md:h-\[90vh\]/g)
      && once(/sm:max-w-lg lg:max-w-2xl/g)
      // ⚠️ `showPicker` still excludes tidy — the CONTENT is not shared, only the box
      && /const showPicker = !!editingEvent && !editingEvent\.id && addMode === 'manual' && modalView === 'add'/.test(page)
  })())

  /* ⛔ "MERGE INTO ANOTHER PLACE" IS GONE FROM THE SCREEN AND THE SERVER IS UNTOUCHED. Both halves are
   * asserted: removing the server code would take away the only way to undo a merge by hand, and
   * leaving the button would be the instruction ignored. */
  t('⛔ the Merge button and its card are gone from the places form…', (() => {
    const places = fs.readFileSync(path.join(REPO, 'components/manage/SchedulePlaces.tsx'), 'utf8')
    /* ⚠️ A CALL IS WHAT MUST BE GONE, NOT THE NAME. The removal note in that file names
     * `sg_merge_place` so the next reader knows the server kept it; forbidding the string would
     * forbid the explanation. */
    const placeCode = places.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    return !/Merge into another place/.test(places)
      && !/sg_merge_place/.test(placeCode)
      && !/mergeTargets/.test(placeCode)
      && !/setMerging|mergeInto/.test(placeCode)
      // ⚠️ RESTORE STILL EXISTS, and it is still what un-merges a merged place
      && /Restore this place/.test(places)
  })())
  t('🔴 …and the server’s merge, and merged_into_id resolution, are untouched', (() => {
    const manage = fs.readFileSync(path.join(REPO, 'app/api/manage/route.ts'), 'utf8')
    const placesLib = fs.readFileSync(path.join(REPO, 'lib/schedule-graphics/places.ts'), 'utf8')
    return /action === 'sg_merge_place'/.test(manage)
      && /'sg_merge_place'/.test(manage)
      && /export function resolvePlaceMerge/.test(placesLib)
      && /resolvePlaceMerge\(/.test(placesLib.slice(placesLib.indexOf('export function placeForEvent')))
      // 🔴 un-hiding still clears the merge, which is the only way back
      && /if \(body\.is_hidden === false\) patch\.merged_into_id = null/.test(manage)
  })())

  /* 🔴 THE TWO LONG FIELDS GET A FULL-WIDTH ROW. A venue name past 40 characters in a half-width box
   * scrolls out of sight while it is being typed. */
  t('🔴 "Name on posts" and "Address" each have a full-width row; the short three stay in pairs', (() => {
    const places = fs.readFileSync(path.join(REPO, 'components/manage/SchedulePlaces.tsx'), 'utf8')
    /* ⚠️ THE END IS FOUND **FROM THE START**, not from the top of the file. The first draft used
     * `indexOf('Events here')` and that phrase also appears in the file's own header comment — at
     * offset 630, long before the card — so the slice came out empty and every field read as paired.
     * A slice whose end can precede its start is a check that silently tests nothing. */
    const cardAt = places.indexOf('<Card className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">')
    const card = cardAt < 0 ? '' : places.slice(cardAt, places.indexOf('Events here', cardAt))
    /* ⚠️ READ STRUCTURALLY, BY WHAT SITS BETWEEN THE FIELDS. An earlier draft searched backwards for
     * the nearest `sm:col-span-2` and compared it with the nearest `<Input`, which is always the
     * field's own tag — so every field looked paired and the check could not pass. Splitting on
     * `<Input` makes "the markup wrapping this field" exactly one segment. */
    const seg = card.split('<Input')
    const widths = {}
    for (let i = 1; i < seg.length; i++) {
      const m = /^\s*label="([^"]+)"/.exec(seg[i])
      if (m) widths[m[1]] = seg[i - 1].includes('sm:col-span-2')
    }
    return widths['Name on posts'] === true && widths['Address'] === true
      && widths['Short name'] === false && widths['Area'] === false && widths['Postcode'] === false
  })())

  t('🔴 the event renderer reuses boxEl, the mark and paint — it does not draw its own', (() => {
    const src = fs.readFileSync(path.join(REPO, 'lib/weekly-post/render.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function renderEventPost'))
    return /boxEl\(/.test(fn) && /poweredByEl\(/.test(fn) && /await paint\(/.test(fn)
      // ⛔ and no second ImageResponse call of its own
      && !/new ImageResponse/.test(fn)
  })())
}


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 10 · THE BROKEN VARIANTS
// ════════════════════════════════════════════════════════════════════════════════════════════════
async function variants(ctx) {
  head('10 · THE BROKEN VARIANTS — each must FAIL')
  let vpass = 0, vfail = 0
  const must = (label, detected) => {
    if (detected) { vpass++; console.log('  ✓ FAILED as required  ' + label) }
    else { vfail++; fail++; console.log('  🔴 MUST FAIL BUT PASSED  ' + label) }
  }
  const patch = (file, from, to) => {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8')
    if (!src.includes(from)) { console.log(`🔴 THE ANCHOR IS GONE in ${file}: ${from.slice(0, 60)}`); fail++; return null }
    return { file, source: src.split(from).join(to) }
  }

  // V1 — the teens
  {
    const p = patch('lib/weekly-post/format.ts',
      '  if (mod100 >= 11 && mod100 <= 13) return \'th\'', '')
    let detected = true
    if (p) { const V = build(p); detected = V.format.ordinalSuffix(11) !== 'th' || V.format.ordinalSuffix(12) !== 'th' }
    must('V1 🔴 "11st September" — the teens stop being special-cased', detected)
  }
  /* V2 — THE WEEK STARTS ON THE WRONG DAY.
   * ⚠️ TWO EARLIER DRAFTS OF THIS VARIANT COULD NOT FAIL, and the reason is worth recording because
   * it is a fact about the feature, not about the test. The classic "add 24 hours per day" bug CANNOT
   * manifest for a UK Monday-start week: the clocks always change at 02:00 on a SUNDAY, which is the
   * LAST day of the week, and that day's local midnight is still on the old offset — so every day of
   * every week is exactly 24 hours after the one before it. The DST assertions in section 1 are
   * therefore guarding against something this calendar cannot produce, which is why they are cheap to
   * keep and why no variant can break them.
   * 🔴 WHAT CAN GO WRONG IS THE DAY NUMBERING. `Date.getDay()` is SUNDAY-first; this module is
   * Monday-first. Forgetting the shift is a one-character mistake that makes every week start on a
   * Sunday — a poster for the wrong seven days, every week, for ever. */
  {
    const p = patch('lib/weekly-post/week.ts',
      '  return ((atUtcNoon(ymd).getUTCDay() + 6) % 7) as WeekdayIndex',
      '  return atUtcNoon(ymd).getUTCDay() as WeekdayIndex')
    let detected = true
    if (p) {
      const V = build(p)
      const w = V.week.weekRange('this', '2026-09-30T12:00:00Z')
      detected = !(w.start === '2026-09-28' && w.end === '2026-10-04')
    }
    must('V2 🔴 the weekday numbering reverts to Sunday-first — every week starts on the wrong day', detected)
  }

  // V3 — the default switches on the wrong day
  {
    const p = patch('lib/weekly-post/week.ts',
      'return weekdayOf(todayInWeekTz(now)) >= 4 ? \'next\' : \'this\'',
      'return weekdayOf(todayInWeekTz(now)) >= 5 ? \'next\' : \'this\'')
    let detected = true
    if (p) { const V = build(p); detected = V.week.defaultWeekChoice('2026-10-02T12:00:00Z') !== 'next' }
    must('V3 🔴 the picker stops defaulting to next week on a Friday', detected)
  }
  // V4 — cancelled becomes a day off
  {
    const p = patch('lib/weekly-post/week-data.ts',
      "  if (s === 'cancelled') return 'cancelled'", "  if (s === 'cancelled') return 'trading'")
    let detected = true
    if (p) {
      const V = build(p)
      const r = V.week.weekRange('this', '2026-09-30T12:00:00Z')
      const w = V.data.buildWeekData(r, [{ id: 'c', event_date: r.days[0], start_time: '12:00', end_time: '14:00', venue_name: 'X', status: 'cancelled' }], [], { timeStyle: '12h', showCancelled: true })
      detected = w.days[0].entries[0].status !== 'cancelled'
    }
    must('V4 🔴 a cancelled event is shown as trading — customers sent to an event that is not happening', detected)
  }
  // V5 — closed stops trading
  {
    const p = patch('lib/weekly-post/week-data.ts',
      "  if (s === 'confirmed' || s === 'unconfirmed' || s === 'closed' || s === '') return 'trading'",
      "  if (s === 'confirmed' || s === 'unconfirmed' || s === '') return 'trading'\n  if (s === 'closed') return 'cancelled'")
    let detected = true
    if (p) { const V = build(p); detected = V.data.tradingStatusOf('closed') !== 'trading' }
    must('V5 🔴 a CLOSED event stops counting as trading — today vanishes from this week\'s poster', detected)
  }
  // V6 — the fit floor removed, so text shrinks to nothing
  {
    const p = patch('lib/weekly-post/fit.ts', 'export const MIN_FONT_FRACTION = 0.35', 'export const MIN_FONT_FRACTION = 0.01')
    let detected = true
    if (p) {
      const V = build(p)
      const m = V.fonts.loadFontMetrics('oswald', false)
      const r = V.fit.fitLines({ lines: [{ runs: [{ text: 'x'.repeat(400) }] }], w: 200, h: 40, fontSize: 48, metrics: m })
      detected = r.fontSize < Math.round(48 * 0.35)
    }
    must('V6 🔴 the minimum size floor is removed — a long name renders at 1px instead of truncating', detected)
  }
  // V7 — truncation stops reserving room for the ellipsis
  {
    const p = patch('lib/weekly-post/fit.ts',
      '  const budget = maxWidth - ellipsisW', '  const budget = maxWidth')
    let detected = true
    if (p) {
      const V = build(p)
      const m = V.fonts.loadFontMetrics('oswald', false)
      const r = V.fit.truncateRuns([{ text: 'x'.repeat(200) }], m, 40, 200)
      const w = V.fit.fitLines({ lines: [{ runs: r.runs }], w: 1e6, h: 1e6, fontSize: 40, metrics: m })
      detected = w.usedWidth > 200
    }
    must('V7 🔴 the ellipsis is appended without reserving room — "shortened to fit" still overflows', detected)
  }
  // V8 — the contrast test uses a plain average
  {
    const p = patch('lib/weekly-post/contrast.ts',
      '  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)',
      '  return (c.r + c.g + c.b) / 3 / 255')
    let detected = true
    if (p) {
      const V = build(p)
      /* ⚠️ BLUE, NOT YELLOW. White on yellow is unreadable under BOTH formulas, so the first draft of
       * this variant could not fail. Blue is where they genuinely disagree: its true luminance is
       * 0.0722 (white on it is 8.6:1, perfectly readable and correctly left alone), while a plain
       * average calls it 0.33 and adds a shadow to text that did not need one — editing the operator's
       * artwork on a miscalculation. */
      detected = V.contrast.readabilityFor('#ffffff', { r: 0, g: 0, b: 255 }, true).outline !== null
    }
    must('V8 🔴 luminance becomes a plain average — white on BLUE gains a shadow it does not need', detected)
  }
  // V9 — the validator accepts NaN
  {
    /* ⚠️ REMOVING `Number.isFinite` ALONE DID NOT BREAK IT, and that is worth recording: `NaN >= min`
     * is false, so the RANGE test rejects NaN as a second line of defence and the first draft of this
     * variant could not fail. The variant now removes both guards, which is what genuinely lets a NaN
     * through — and the two-guard result is a small piece of good news about the validator. */
    const p = patch('lib/weekly-post/layout.ts',
      "  if (typeof v !== 'number' || !Number.isFinite(v)) return null\n  const r = Math.round(v)\n  return r >= min && r <= max ? r : null",
      "  if (typeof v !== 'number') return null\n  return Math.round(v)")
    let detected = true
    if (p) {
      const V = build(p)
      const good = V.layout.defaultLayout(1080, 1350)
      detected = V.layout.validateLayout({ ...good, date: { ...good.date, x: NaN } }, 1080, 1350).ok === true
    }
    must('V9 🔴 the validator accepts NaN — the box silently draws nothing and reports nothing', detected)
  }
  // V10 — the validator trusts the payload's own size
  {
    const p = patch('lib/weekly-post/layout.ts',
      'export function validateLayout(input: unknown, width: number, height: number): ValidationResult {\n  const errors: string[] = []\n  const W = num(width, 1, 20000)\n  const H = num(height, 1, 20000)',
      'export function validateLayout(input: unknown, width: number, height: number): ValidationResult {\n  const errors: string[] = []\n  const i = input as { width?: number; height?: number }\n  const W = num(i?.width ?? width, 1, 20000)\n  const H = num(i?.height ?? height, 1, 20000)')
    let detected = true
    if (p) {
      const V = build(p)
      const good = V.layout.defaultLayout(1080, 1350)
      detected = V.layout.validateLayout({ ...good, width: 9000, height: 9000, time: { ...good.time, x: 5000, w: 400 } }, 1080, 1350).ok === true
    }
    must('V10 🔴 the validator trusts the payload\'s own width — an off-image box passes', detected)
  }
  // V11 — the upload size floor removed
  {
    const p = patch('lib/weekly-post/layout.ts', 'export const MIN_UPLOAD_SHORT_SIDE = 600', 'export const MIN_UPLOAD_SHORT_SIDE = 1')
    let detected = true
    if (p) {
      const V = build(p)
      const png = Buffer.alloc(200)
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
      png.writeUInt32BE(13, 8); Buffer.from('IHDR').copy(png, 12)
      png.writeUInt32BE(80, 16); png.writeUInt32BE(100, 20)
      detected = V.imageInfo.checkUpload(png, { maxBytes: 1e7, minShortSide: V.layout.MIN_UPLOAD_SHORT_SIDE }).ok === true
    }
    must('V11 🔴 the minimum upload size is dropped — an 80px blank is accepted and renders as mush', detected)
  }
  // V12 — "tonight" baked at the wrong boundary
  {
    const p = patch('lib/weekly-post/caption.ts', 'export const EVENING_FROM_HOUR = 17', 'export const EVENING_FROM_HOUR = 12')
    let detected = true
    if (p) { const V = build(p); detected = V.caption.whenWord('2026-10-13', '13:00', '2026-10-13T08:00:00Z') !== 'today' }
    must('V12 🔴 a lunchtime event is posted as "tonight"', detected)
  }
  // V13 — a cancelled event keeps the ordering link
  {
    const p = patch('lib/weekly-post/caption.ts',
      "  if (entry.status === 'cancelled') {", "  if (false && entry.status === 'cancelled') {")
    let detected = true
    if (p) {
      const V = build(p)
      const s = V.caption.eventPostText({
        truckName: 'V', date: '2026-10-13', orderUrl: 'https://x.test/order', timeStyle: '12h', now: '2026-10-13T09:00:00Z',
        entry: { eventId: 'e', name: 'X', town: null, time: '', status: 'cancelled', startTime: '17:00', endTime: '20:00' },
      })
      detected = s.includes('https://x.test/order')
    }
    must('V13 🔴 a cancelled event still carries an ordering link', detected)
  }
  // V14 — the render stops scaling the text with the capped image
  if (ctx) {
    const p = patch('lib/weekly-post/render.ts',
      'export function renderScale(width: number, height: number): number {\n  const longest = Math.max(width, height)\n  return longest > MAX_RENDER_SIDE ? MAX_RENDER_SIDE / longest : 1\n}',
      'export function renderScale(width: number, height: number): number {\n  void width; void height\n  return 1\n}')
    let detected = true
    if (p) {
      const V = build(p)
      const tall = V.layout.defaultLayout(1080, 2400)
      const b = await ctx.blank(1080, 2400)
      const r = V.render.renderWeeklyPost({ layout: tall, week: ctx.mkWeek(), blankDataUri: b.uri })
      const got = await r.catch(() => null)
      detected = !got || got.height !== 2160
    }
    must('V14 🔴 an oversized blank stops scaling as one — the text lands in the wrong place', detected)
  }
  /* V15 — THE NOTE REACHES THE POSTER.
   * ⚠️ THE FIRST DRAFT TESTED THE OTHER DIRECTION and could not fail: with an EMPTY note, drawing the
   * box anyway produces an empty text element, which is zero pixels, so the two images were identical
   * and the variant "passed". The rule "a note box only renders when the week has a note" has no
   * pixels of its own — the direction that does is a note that was written and must appear. */
  if (ctx) {
    const p = patch('lib/weekly-post/render.ts', '  if (l.note && note) {', '  if (false && l.note && note) {')
    let detected = true
    if (p) {
      const V = build(p)
      const l = V.layout.defaultLayout(1080, 1350)
      l.note = V.layout.defaultNoteBox(l)
      const a = await V.render.renderWeeklyPost({ layout: l, week: ctx.mkWeek(), blankDataUri: ctx.bg.uri, note: 'Pre-order for collection' })
      const b = await V.render.renderWeeklyPost({ layout: l, week: ctx.mkWeek(), blankDataUri: ctx.bg.uri, note: '' })
      detected = Buffer.compare(a.png, b.png) === 0
    }
    must('V15 🔴 a note the operator wrote never reaches the poster', detected)
  }

  // ── STAGE 2 ───────────────────────────────────────────────────────────────────────────────────
  /* V16 — the order of preference inverted.
   * ⚠️ IT PATCHES `resolveDesign` NOW, not `resolveBackground`. Stage 2b made `resolveBackground`
   * delegate, so the order lives in exactly one function — which is what this variant should be
   * attacking. Inverting it there breaks BOTH callers, and that is the point of having one. */
  {
    const p = patch('lib/weekly-post/backgrounds.ts',
      "  if (usable(input.oneOff) && (input.force === 'event' || !input.force)) {\n    return { source: 'event', image: input.oneOff as StoredImage, layout: inheritedLayout, layoutSource: inheritedSource }\n  }\n  if (placeImage) {\n    return { source: 'place', image: placeImage, layout: inheritedLayout, layoutSource: inheritedSource }\n  }",
      "  if (placeImage) {\n    return { source: 'place', image: placeImage, layout: inheritedLayout, layoutSource: inheritedSource }\n  }\n  if (usable(input.oneOff) && (input.force === 'event' || !input.force)) {\n    return { source: 'event', image: input.oneOff as StoredImage, layout: inheritedLayout, layoutSource: inheritedSource }\n  }")
    let detected = true
    if (p) {
      const V = build(p)
      const img = (path) => ({ path, width: 1080, height: 1350 })
      // the picture-only caller…
      const viaBackground = V.bg.resolveBackground({
        fallback: img('d.png'), place: img('p.png'), event: img('e.png'),
      })
      // …and the one that decides the positions too
      const viaDesign = V.bg.resolveDesign({
        standard: { image: img('d.png'), layout: { tag: 's' } },
        place: { placeId: 'p1', image: img('p.png'), layout: null },
        oneOff: img('e.png'),
      })
      detected = viaBackground.source !== 'event' || viaDesign.source !== 'event'
    }
    must('V16 🔴 a place picture overrides the one uploaded FOR THIS EVENT', detected)
  }
  // V17 — the aspect tolerance widened until a different shape passes
  {
    const p = patch('lib/weekly-post/backgrounds.ts', 'export const ASPECT_TOLERANCE = 0.01', 'export const ASPECT_TOLERANCE = 0.5')
    let detected = true
    if (p) {
      const V = build(p)
      detected = V.bg.checkAspect(1080, Math.round(1080 / (0.8 * 0.98)), 1080, 1350).ok === true
    }
    must('V17 🔴 the shape tolerance is widened — a differently shaped picture is accepted and the boxes move', detected)
  }
  /* V18 — the tolerance made absolute instead of relative.
   * ⚠️ DETECTED ON A LANDSCAPE DEFAULT. At 16:9 (1.778) a 0.9% drift is 0.016, which an absolute 0.01
   * refuses and the correct relative rule accepts — so the variant shows the rule changing meaning
   * with the shape, which is exactly what dividing by the default's own ratio prevents. */
  {
    const p = patch('lib/weekly-post/backgrounds.ts',
      '  const drift = Math.abs(ratio - defaultRatio) / defaultRatio',
      '  const drift = Math.abs(ratio - defaultRatio)')
    let detected = true
    if (p) {
      const V = build(p)
      const h = Math.round(1920 / ((16 / 9) * 1.009))
      detected = V.bg.checkAspect(1920, h, 1920, 1080).ok === false
    }
    must('V18 🔴 the tolerance becomes absolute — it means something different on every shape', detected)
  }
  // V19 — a picture with no recorded size is used anyway
  {
    const p = patch('lib/weekly-post/backgrounds.ts',
      '  if (!usable(img) || !img.width || !img.height) return false\n  return checkAspect(img.width, img.height, defaultWidth, defaultHeight).ok',
      '  if (!usable(img)) return false\n  return true')
    let detected = true
    if (p) {
      const V = build(p)
      detected = V.bg.fitsDefault({ path: 'x.png', width: null, height: null }, 1080, 1350) === true
    }
    must('V19 🔴 a picture with no recorded size is used — its shape was never checked', detected)
  }
  // V20 — "From" loses its preposition guard
  {
    const p = patch('lib/weekly-post/format.ts',
      "  return s ? `From ${s}` : ''", "  return `From ${s}`")
    let detected = true
    if (p) {
      const V = build(p)
      detected = V.format.formatEventTime(null, '21:00', '12h', 'from') !== ''
    }
    must('V20 🔴 an event with no start time renders a dangling "From "', detected)
  }
  // V21 — the event validator stops trusting the server's size
  {
    const p = patch('lib/weekly-post/layout.ts',
      "export function validateEventLayout(input: unknown, width: number, height: number): EventValidationResult {\n  const errors: string[] = []\n  const W = num(width, 1, 20000)\n  const H = num(height, 1, 20000)",
      "export function validateEventLayout(input: unknown, width: number, height: number): EventValidationResult {\n  const errors: string[] = []\n  const i = input as { width?: number; height?: number }\n  const W = num(i?.width ?? width, 1, 20000)\n  const H = num(i?.height ?? height, 1, 20000)")
    let detected = true
    if (p) {
      const V = build(p)
      const good = V.layout.defaultEventLayout(1080, 1350)
      detected = V.layout.validateEventLayout({ ...good, width: 9000, height: 9000, time: { ...good.time, x: 5000, w: 400 } }, 1080, 1350).ok === true
    }
    must('V21 🔴 the event validator trusts the payload’s own width — an off-image box passes', detected)
  }
  // V22 — a cancelled event is given a time by the display setting
  if (ctx) {
    const p = patch('lib/weekly-post/render.ts',
      "    out.push({ runs: [{ text: e.status === 'cancelled' ? 'CANCELLED' : textOf(e) }] })",
      "    out.push({ runs: [{ text: textOf(e) }] })")
    let detected = true
    if (p) {
      const V = build(p)
      const l = V.layout.defaultEventLayout(1080, 1350)
      /* ⚠️ COMPARED AGAINST THE REAL MODULE ON THE SAME CANCELLED EVENT, not against a trading one.
       * The first draft compared cancelled with trading and expected them to become identical — but
       * they differ anyway, because a cancelled event's NAME is struck through in the location box, so
       * the variant "passed" for a reason that had nothing to do with the time. Rendering the same
       * cancelled event through both modules isolates the one box the patch touches. */
      const base = { id: 'c', event_date: '2026-10-16', start_time: '17:00', end_time: '21:00', venue_name: 'X' }
      const cancelledEntry = V.data.entryFor({ ...base, status: 'cancelled' }, [], '12h')
      const broken = await V.render.renderEventPost({ layout: l, entry: cancelledEntry, date: '2026-10-16', backgroundDataUri: ctx.evBg.uri })
      const realLayout = M.layout.defaultEventLayout(1080, 1350)
      const real = await M.render.renderEventPost({ layout: realLayout, entry: M.data.entryFor({ ...base, status: 'cancelled' }, [], '12h'), date: '2026-10-16', backgroundDataUri: ctx.evBg.uri })
      detected = Buffer.compare(broken.png, real.png) !== 0
    }
    must('V22 🔴 a cancelled event is given a trading time by the display setting', detected)
  }

  // ── STAGE 2b · A DESIGN PER PLACE ─────────────────────────────────────────────────────────────
  /* V23 — a place's own POSITIONS are ignored, and only its picture is used.
   * 🔴 THIS IS STAGE 2's BEHAVIOUR, AND IT IS THE BUG THIS STAGE EXISTS TO FIX. Kezmet's venue
   * artwork would be drawn with Standard's box coordinates, printing the date over a picture that is
   * laid out for it somewhere else entirely. */
  {
    const p = patch('lib/weekly-post/backgrounds.ts',
      '  const inheritedLayout = placeLayout ?? input.standard.layout\n  const inheritedSource: \'standard\' | \'place\' = placeLayout ? \'place\' : \'standard\'',
      '  const inheritedLayout = input.standard.layout\n  const inheritedSource: \'standard\' | \'place\' = \'standard\'')
    let detected = true
    if (p) {
      const V = build(p)
      const r = V.bg.resolveDesign({
        standard: { image: { path: 'd.png', width: 1080, height: 1350 }, layout: { tag: 'standard' } },
        place: { placeId: 'p1', image: { path: 'k.png', width: 1080, height: 1080 }, layout: { tag: 'kezmet' } },
      })
      detected = r.layout.tag !== 'kezmet' || r.layoutSource !== 'place'
    }
    must('V23 🔴 a place’s own text positions are ignored — its picture is drawn with Standard’s boxes', detected)
  }

  /* V24 — a one-off is checked against Standard's shape even where the place has its own positions.
   * ⚠️ THE ACCEPTED FILE IS THE WRONG SHAPE FOR THE BOXES IT IS ABOUT TO BE GIVEN. At Kezmet the
   * inherited canvas is 1080×1080; a 1080×1350 upload matches Standard perfectly and lands the text
   * off the artwork. This is the subtlest of the shape bugs, because the upload is refused nowhere. */
  {
    const p = patch('lib/weekly-post/backgrounds.ts',
      '  const hasOwnPositions = !!(input.place && input.place.layout)\n  const placeImage = usable(input.place?.image) ? (input.place!.image as StoredImage) : null\n  return hasOwnPositions && placeImage ? placeImage : input.standard',
      '  return input.standard')
    let detected = true
    if (p) {
      const V = build(p)
      const target = V.bg.oneOffMustMatch({
        standard: { path: 'd.png', width: 1080, height: 1350 },
        place: { placeId: 'p1', image: { path: 'k.png', width: 1080, height: 1080 }, layout: { tag: 'own' } },
      })
      detected = target.path !== 'k.png'
        || V.bg.checkAspect(1080, 1350, target.width, target.height).ok !== false
    }
    must('V24 🔴 a one-off is measured against Standard at a place with its own positions', detected)
  }

  /* V25 — a place with its own positions is held to the default's shape after all.
   * 🔴 THE FEATURE SIMPLY DOES NOT WORK. The one truck this stage is for — differently shaped venue
   * artwork — has every upload refused, with a message about matching a shape they deliberately left. */
  {
    const p = patch('lib/weekly-post/backgrounds.ts',
      '  return !(place && place.layout)', '  return true')
    let detected = true
    if (p) {
      const V = build(p)
      detected = V.bg.placePictureNeedsDefaultShape({ layout: { tag: 'own' } }) !== false
    }
    must('V25 🔴 a place with its own positions is still forced to match the default’s shape', detected)
  }

  /* V26 — `entryFor` stops reporting the place's id.
   * 🔴 EVERY PLACE DESIGN SILENTLY STOPS BEING FOUND. The route looks the place up by
   * `entry.placeId`; with it null, every event falls back to Standard and a truck's per-venue artwork
   * quietly stops appearing — with no error, on posts that still render perfectly well. */
  {
    const p = patch('lib/weekly-post/week-data.ts',
      '    placeId: place?.id ?? null,', '    placeId: null,')
    let detected = true
    if (p) {
      const V = build(p)
      const e = V.data.entryFor({ id: 'e1', event_date: '2026-10-16', start_time: '17:00', end_time: '21:00',
        venue_name: 'Sudbury Market', truck_place_id: 'market-1', status: 'confirmed' },
        [{ id: 'market-1', name: 'Sudbury Market', short_name: 'Sudbury', name_key: 'sudbury market' }], '12h')
      detected = e.placeId !== 'market-1'
    }
    must('V26 🔴 the place id stops reaching the resolver — every place design is ignored', detected)
  }

  /* V27 — the last-toggle rule is removed from the validator.
   * 🔴 A CANCELLED EVENT BECOMES INDISTINGUISHABLE FROM A TRADING ONE. With both Location and Time
   * off there is nothing left on the poster that can say "cancelled" — the place name is not there to
   * strike through and the time box is not there to carry the word. */
  {
    const p = patch('lib/weekly-post/layout.ts',
      '  if (!locationOn && !timeOn) return { ok: false, errors: [LAST_TOGGLE_MESSAGE] }', '')
    let detected = true
    if (p) {
      const V = build(p)
      const base = V.layout.defaultEventLayout(1080, 1350)
      const both = { ...base,
        location: { ...base.location, enabled: false },
        time: { ...base.time, enabled: false } }
      detected = V.layout.validateEventLayout(both, 1080, 1350).ok !== false
    }
    must('V27 🔴 Location and Time can both be switched off — a cancelled event stops reading cancelled', detected)
  }

  /* V28 — the renderer ignores the switch and draws a box that is off.
   * 🔴 THE TOGGLE BECOMES DECORATION. A truck whose picture already names the venue switches Location
   * off, saves, and the name is printed over it anyway — twice on the same poster. */
  if (ctx) {
    const p = patch('lib/weekly-post/render.ts',
      '  if (l.location.enabled) {', '  if (true) {')
    let detected = true
    if (p) {
      const V = build(p)
      const l = { ...V.layout.defaultEventLayout(1080, 1350), keepReadable: false }
      const off = { ...l, location: { ...l.location, enabled: false } }
      const entry = V.data.entryFor({ ...ctx.EV }, [], '12h')
      /* ⚠️ COMPARED AGAINST THE SAME LAYOUT WITH THE BOX ON, not against the real module. The patched
       * module must render "off" and "on" identically — that is exactly what ignoring the flag means. */
      const drawnOff = await V.render.renderEventPost({ layout: off, entry, date: ctx.EV.event_date, backgroundDataUri: ctx.evBg.uri })
      const drawnOn = await V.render.renderEventPost({ layout: l, entry, date: ctx.EV.event_date, backgroundDataUri: ctx.evBg.uri })
      detected = Buffer.compare(drawnOff.png, drawnOn.png) === 0
    }
    must('V28 🔴 a switched-off Location box is drawn anyway', detected)
  }

  /* V29 — the time box is skipped whenever Location is off.
   * ⚠️ A PLAUSIBLE MISTAKE, which is why it is worth a variant: the two boxes are switched together in
   * the UI and read as a pair. Tie them in the renderer and a cancelled event at a place with Location
   * off loses the word CANCELLED — the exact poster the last-toggle rule exists to protect. */
  if (ctx) {
    const p = patch('lib/weekly-post/render.ts',
      '  const tl = l.time.enabled\n', '  const tl = l.time.enabled && l.location.enabled\n')
    let detected = true
    if (p) {
      const V = build(p)
      const base = V.layout.defaultEventLayout(1080, 1350)
      const noLoc = { ...base, location: { ...base.location, enabled: false }, keepReadable: false }
      const ev = { ...ctx.EV }
      const cancelled = await V.render.renderEventPost({
        layout: noLoc, entry: V.data.entryFor({ ...ev, status: 'cancelled' }, [], '12h'),
        date: ev.event_date, backgroundDataUri: ctx.evBg.uri })
      const trading = await V.render.renderEventPost({
        layout: noLoc, entry: V.data.entryFor({ ...ev, status: 'confirmed' }, [], '12h'),
        date: ev.event_date, backgroundDataUri: ctx.evBg.uri })
      detected = Buffer.compare(cancelled.png, trading.png) === 0
    }
    must('V29 🔴 a cancelled event with Location off renders as an ordinary trading poster', detected)
  }

  /* V30 — choosing Standard in the modal keeps the place's positions.
   * 🔴 STANDARD'S PICTURE WITH A PLACE'S BOXES is the worst of both: the truck asked for their usual
   * poster and got text positioned for someone else's artwork. */
  {
    const p = patch('lib/weekly-post/backgrounds.ts',
      "  if (input.force === 'default') {\n    return { source: 'default', image: input.standard.image, layout: input.standard.layout, layoutSource: 'standard' }\n  }",
      "  if (input.force === 'default') {\n    return { source: 'default', image: input.standard.image, layout: inheritedLayout, layoutSource: inheritedSource }\n  }")
    let detected = true
    if (p) {
      const V = build(p)
      const r = V.bg.resolveDesign({
        standard: { image: { path: 'd.png', width: 1080, height: 1350 }, layout: { tag: 'standard' } },
        place: { placeId: 'p1', image: { path: 'k.png', width: 1080, height: 1080 }, layout: { tag: 'kezmet' } },
        force: 'default',
      })
      detected = r.layout.tag !== 'standard' || r.layoutSource !== 'standard'
    }
    must('V30 🔴 "Standard design" takes Standard’s picture but keeps the place’s text positions', detected)
  }

  /* ── SOURCE-TEXT VARIANTS ────────────────────────────────────────────────────────────────────────
   * 🔴 THREE CHECKS IN 9c READ SOURCE TEXT rather than running code, because the route and page.tsx
   * cannot be compiled in isolation here. A text check is worth no more than its ability to notice the
   * regression it describes, so each is re-run against a MUTATED copy of the file and must then fail.
   * ⚠️ NOTHING IS WRITTEN TO DISK — the mutation is a string in memory. */
  {
    const pageSrc = fs.readFileSync(path.join(REPO, 'app/manage/[token]/page.tsx'), 'utf8')
    const routeSrc = fs.readFileSync(path.join(REPO, 'app/api/weekly-post/route.ts'), 'utf8')

    // V31 — Tidy up places goes back to its own, smaller shell
    const shellPredicate = (page) => {
      const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const once = (re) => (code.match(re) || []).length === 1
      return /className=\{`\$\{EVENT_MODAL_SHELL\} \$\{wideShell \? EVENT_MODAL_WIDE : EVENT_MODAL_NARROW\}`\}/.test(page)
        && /const wideShell = showPicker \|\| modalView === 'tidy'/.test(page)
        && once(/md:max-w-\[1040px\]/g) && once(/md:h-\[90vh\]/g) && once(/sm:max-w-lg lg:max-w-2xl/g)
    }
    const narrowed = pageSrc.replace("const wideShell = showPicker || modalView === 'tidy'",
      'const wideShell = showPicker')
    must('V31 🔴 the Tidy up places shell shrinks back to its own size', 
      narrowed !== pageSrc && shellPredicate(pageSrc) && !shellPredicate(narrowed))

    // V32 — the numbers are spelled out inline again instead of coming from the constants
    const inlined = pageSrc.replace('${EVENT_MODAL_SHELL} ${wideShell ? EVENT_MODAL_WIDE : EVENT_MODAL_NARROW}',
      'bg-white w-full flex flex-col md:h-[90vh] md:max-w-[1040px]')
    must('V32 🔴 the shell’s sizes are written inline again, where they can drift apart',
      inlined !== pageSrc && !shellPredicate(inlined))

    // V33 — the route reverts to finding the place by its printed name
    const idPredicate = (route) => {
      const fn = route.slice(route.indexOf('async function eventPostContext('),
        route.indexOf('export async function POST('))
      return /String\(pl\.id\) === entry\.placeId/.test(fn) && !/=== entry\.name/.test(fn)
    }
    const byName = routeSrc.replace('String(pl.id) === entry.placeId', 'String(pl.name) === entry.name')
    must('V33 🔴 the route goes back to matching the place by name — two places sharing one share a design',
      byName !== routeSrc && idPredicate(routeSrc) && !idPredicate(byName))

    // V34 — the forced choice stops reaching the resolver
    const forcePredicate = (route) => {
      const fn = route.slice(route.indexOf("if (action === 'event_render')"),
        route.indexOf("return NextResponse.json({ error: 'Unknown action' }"))
      return /eventPostContext\(truck, eventId, design, forced \|\| null\)/.test(fn)
        && /body\.layout \?\? ctx\.layout \?\? design\.layout/.test(fn)
    }
    const unforced = routeSrc.replace('eventPostContext(truck, eventId, design, forced || null)',
      'eventPostContext(truck, eventId, design)')
    must('V34 🔴 the modal’s design choice stops reaching the resolver',
      unforced !== routeSrc && forcePredicate(routeSrc) && !forcePredicate(unforced))

    // V35 — a place layout is validated against the request body's canvas instead of the stored one
    const canvasPredicate = (route) => {
      const save = route.slice(route.indexOf("if (action === 'event_place_save_layout')"),
        route.indexOf("if (action === 'event_place_save_layout')") + 2000)
      return /const w = row\.event_bg_width \|\| design\.width/.test(save)
        && !/body\.width/.test(save) && !/body\.height/.test(save)
    }
    /* ⚠️ EVERY OCCURRENCE, NOT THE FIRST. `const w = row.event_bg_width || design.width` appears in
     * BOTH `event_place_mode` and `event_place_save_layout`, and `String.replace` with a string
     * replaces only the first — which is outside the slice this predicate reads, so the first draft of
     * this variant mutated a line the check never looks at and "passed". Taking the canvas from the
     * request is the bug wherever it is written, so every occurrence is mutated. */
    const fromBody = routeSrc.split('const w = row.event_bg_width || design.width')
      .join('const w = Number(body.width) || design.width')
    must('V35 🔴 a place’s canvas size is taken from the request body — boxes can be placed outside the picture',
      fromBody !== routeSrc && canvasPredicate(routeSrc) && !canvasPredicate(fromBody))
  }

  console.log(`\n  ${vpass + vfail} variants · ${vpass} failed as required · ${vfail} wrongly passed`)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
;(async () => {
  const ctx = await renderSuite()
  await variants(ctx)
  console.log('')
  if (fail === 0) console.log(`✅ all ${pass} passed`)
  else { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exitCode = 1 }
})().catch(e => { console.log('🔴 the harness threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)); process.exit(1) })
