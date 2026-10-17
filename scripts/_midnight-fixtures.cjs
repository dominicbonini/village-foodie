// scripts/_midnight-fixtures.cjs — the shared fixtures for scripts/midnight-events.cjs (events that run past midnight,
// docs/midnight-and-format-fixes-report.md). A MODULE. Fixtures only: Pizza Kitchen ('test-truck', 'test-kitchen').
//
// Two countries, the same wall-clock moments in each zone; two events on Wednesday 30 September 2026:
//   NORMAL   11:30–22:45   — must be BYTE-IDENTICAL to BEFORE everywhere (it never crosses midnight)
//   MIDNIGHT 20:00–00:30   — must behave by the rule (lib/event-window.ts) at each of MIDNIGHT_MOMENTS
const EVENT_DATE = '2026-09-30'
const NEXT_DATE = '2026-10-01'
const NORMAL = { start_time: '11:30:00', end_time: '22:45:00' }
const MIDNIGHT = { start_time: '20:00:00', end_time: '00:30:00' }
/** MIDNIGHT FOLLOW-UPS (17 October 2026): a NORMAL 18:00–23:30 event whose finish was changed to 00:30 in the finish-time
 *  modal — after that choice it IS an overnight event (decision 2, docs/midnight-followups-report.md). */
const EXTENDED = { start_time: '18:00:00', end_time: '00:30:00' }
const COUNTRIES = {
  GB: { cc: 'GB', tz: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday', currency: 'GBP' },
  US: { cc: 'US', tz: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday', currency: 'USD' },
}
const time = cc => { const c = COUNTRIES[cc]; return { timeZone: c.tz, locale: c.locale, timeFormat: c.timeFormat, dateOrder: c.dateOrder, weekStart: c.weekStart } }
/** The midnight event's moments: [label, local date, local time]. */
const MIDNIGHT_MOMENTS = [
  ['19:00', EVENT_DATE, '19:00'],         // before it opens
  ['23:50', EVENT_DATE, '23:50'],         // running, before midnight
  ['00:15', NEXT_DATE, '00:15'],          // running, after midnight
  ['00:31', NEXT_DATE, '00:31'],          // just ended
  ['next-afternoon', NEXT_DATE, '14:00'], // long over
]
/** The normal event's moments (the same five roles). */
const NORMAL_MOMENTS = [
  ['11:00', EVENT_DATE, '11:00'],
  ['12:00', EVENT_DATE, '12:00'],
  ['22:40', EVENT_DATE, '22:40'],
  ['22:50', EVENT_DATE, '22:50'],
  ['next-afternoon', NEXT_DATE, '14:00'],
]
/** The UTC ISO instant of a wall-clock moment in a country's zone (DST-correct, no library). */
function utcOf(cc, ymd, hhmm) {
  const tz = COUNTRIES[cc].tz
  const [y, m, d] = ymd.split('-').map(Number), [hh, mi] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mi)
  const off = t => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t))
    const g = k => Number(p.find(x => x.type === k).value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - t
  }
  let t = wall - off(wall); t = wall - off(t)
  return new Date(t).toISOString()
}
/** A truck_events row on the fixture truck. */
const eventRow = (id, times, extra = {}) => ({ id, truck_id: 'test-truck', event_date: EVENT_DATE, ...times, venue_name: 'Market Square', town: 'Springfield',
  postcode: 'CB1 1AA', status: 'confirmed', auto_open: false, auto_close: false, collection_interval_mins: 15, van_id: null, notes: null, ...extra })

module.exports = { EVENT_DATE, NEXT_DATE, NORMAL, MIDNIGHT, EXTENDED, COUNTRIES, time, MIDNIGHT_MOMENTS, NORMAL_MOMENTS, utcOf, eventRow }
