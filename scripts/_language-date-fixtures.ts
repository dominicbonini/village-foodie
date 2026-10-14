// scripts/_language-date-fixtures.ts — every date-word output Language Phase 0 touches, over a wide fixture set.
// Shared by scripts/language-phase-0.cjs, which runs it TWICE: bundled for Node (the server path) and bundled
// for the browser and run in Chromium and WebKit (the client path). The same inputs, the same calls, so the
// three answers can be compared with each other and with the BEFORE capture.
//
// Inputs: every day of 2026, a leap day, New Year either side; four TimeSettings (GB 24h / GB 12h / US 12h /
// US 24h); both countries of the weekly-post table; every date style × capitals × raised ordinals; ordinals
// 0–131; pre-order labels at four clock times; whole weeks Monday- and Sunday-first, with and without a
// cancellation, in both time styles; "today"/"tomorrow" around a fixed now (the caller pins the clock).
import * as T from '@/lib/time-utils'
import * as F from '@/lib/weekly-post/format'
import * as L from '@/lib/weekly-post/locale'
import * as C from '@/lib/weekly-post/caption'
import * as CT from '@/lib/weekly-post/caption-template'
import * as P from '@/lib/preorder'
import * as W from '@/lib/whatsapp/copy'
import * as U from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')
function ymdList(): string[] {
  const out: string[] = []
  for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2026, 11, 31); t += 86400000) {
    const d = new Date(t); out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`)
  }
  return ['2025-12-31', ...out, '2027-01-01', '2028-02-29']
}
const TS: Record<string, T.TimeSettings> = {
  GB24: { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' },
  GB12: { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '12h', dateOrder: 'dmy', weekStart: 'monday' },
  US12: { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' },
  US24: { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '24h', dateOrder: 'mdy', weekStart: 'sunday' },
}
const COUNTRIES = ['GB', 'US'] as const
const STYLES = ['long', 'short', 'dayMonth', 'numeric'] as const
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function runDateFixtures(): Record<string, Record<string, unknown>> {
  const dates = ymdList()
  const r: Record<string, Record<string, unknown>> = {}
  const put = (sec: string, k: string, v: unknown) => { (r[sec] ||= {})[k] = v }

  for (let n = 0; n <= 131; n++) {
    put('timeUtils.ordinalDay', String(n), T.ordinalDay(n))
    put('format.ordinal', String(n), F.ordinal(n))
    put('format.ordinalSuffix', String(n), F.ordinalSuffix(n))
  }

  for (const ymd of dates) {
    for (const [k, ts] of Object.entries(TS)) {
      put('timeUtils.formatOrdinalDate', `${ymd}|${k}`, T.formatOrdinalDate(ymd, ts))
      put('timeUtils.formatOrdinalDate.noWeekday', `${ymd}|${k}`, T.formatOrdinalDate(ymd, ts, false))
      put('timeUtils.formatShortOrdinalDate', `${ymd}|${k}`, T.formatShortOrdinalDate(ymd, ts))
    }
    for (const c of COUNTRIES) {
      for (const style of STYLES) for (const caps of [false, true]) for (const raised of [false, true]) {
        const tc = { caps, raisedOrdinals: raised }
        put('locale.datePartsFor', `${ymd}|${c}|${style}|${caps}|${raised}`, L.datePartsFor(ymd, style, c, tc))
        put('locale.dateLinesFor', `${ymd}|${c}|${style}|${caps}|${raised}`, L.dateLinesFor(ymd, style, c, tc, true))
        put('locale.dateTextFor', `${ymd}|${c}|${style}|${caps}|${raised}`, L.dateTextFor(ymd, style, c, tc))
      }
      put('locale.shortDateTextFor', `${ymd}|${c}`, L.shortDateTextFor(ymd, c))
      put('caption.shortDate', `${ymd}|${c}`, C.shortDate(ymd, c))
      put('caption.weekLabel', `${ymd}|${c}`, C.weekLabel(ymd, c))
    }
    for (const mins of [0, 75, 600, 1439]) {
      put('preorder.formatPreorderLabel', `${ymd}|${mins}|same`, P.formatPreorderLabel('before', mins, ymd, ymd))
      put('preorder.formatPreorderLabel', `${ymd}|${mins}|before`, P.formatPreorderLabel('before', mins, ymd, addDays(ymd, 1)))
    }
    for (const rule of ['on_confirm', 'day_of', '1d', '3d', '7d']) put('preorder.formatPreorderOpenLabel', `${ymd}|${rule}`, P.formatPreorderOpenLabel(rule, ymd))
    put('whatsapp.formatResetDate', ymd, W.formatResetDate(ymd))
    const [y, m, d] = ymd.split('-')
    put('utils.formatFriendlyDate', ymd, U.formatFriendlyDate(`${d}/${m}/${y}`))
  }
  put('locale.LOCALES', 'samples', L.LOCALES)

  // Whole weeks: every Monday- and Sunday-first week of 2026, one entry a day, the fourth day cancelled.
  for (const ymd of dates.filter(x => x.startsWith('2026'))) {
    const wd = new Date(`${ymd}T12:00:00Z`).getUTCDay()
    if (wd !== 1 && wd !== 0) continue
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(ymd, i)
      return {
        date, isDayOff: i === 5,
        entries: [{ name: `Venue ${i}`, town: i % 2 ? 'Lavenham' : null, startTime: '17:00:00', endTime: i === 2 ? null : '21:30:00', status: i === 3 ? 'cancelled' : 'confirmed' }],
      }
    })
    const week = { range: { which: 'this', start: days[0].date, end: days[6].date, days: days.map(x => x.date) }, days, included: [] }
    for (const timeStyle of ['12h', '24h'] as const) {
      put('caption.weekCaption', `${ymd}|${timeStyle}`, C.weekCaption({ truckName: 'Pizza Kitchen', week: week as never, orderUrl: 'https://x.test/o', timeStyle, note: 'Note' }))
      for (const c of COUNTRIES) put('captionTemplate.weekCaptionValues', `${ymd}|${timeStyle}|${c}`, CT.weekCaptionValues({ week: week as never, orderUrl: null, timeStyle, country: c }))
    }
  }
  // Event captions around a fixed now: "tonight", "tomorrow", "on <date>".
  const now = '2026-10-14T11:00:00.000Z'
  for (let i = -1; i <= 9; i++) {
    const date = addDays('2026-10-14', i)
    for (const c of COUNTRIES) for (const timeStyle of ['12h', '24h'] as const) {
      const tz = c === 'US' ? 'America/New_York' : 'Europe/London'
      for (const startTime of ['12:00:00', '18:00:00', null]) {
        put('caption.whenPhrase', `${date}|${c}|${startTime}`, C.whenPhrase(date, startTime, now, c, tz))
        const entry = { name: 'The Crown', town: 'Wickhambrook', startTime, endTime: '21:00:00', status: 'confirmed' }
        put('caption.eventPostText', `${date}|${c}|${timeStyle}|${startTime}`, C.eventPostText({ entry: entry as never, date, truckName: 'Pizza Kitchen', orderUrl: 'https://x.test/o', timeStyle, now, timeZone: tz, country: c }))
        put('captionTemplate.eventCaptionValues', `${date}|${c}|${timeStyle}|${startTime}`, CT.eventCaptionValues({ placeName: 'The Crown', town: 'Wickhambrook', date, startTime, endTime: '21:00:00', orderUrl: null, timeStyle, country: c, now, timeZone: tz }))
      }
    }
  }
  return r
}
