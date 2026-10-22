#!/usr/bin/env node
// scripts/check-tzdata.cjs — WHICH NODE AND WHICH TIME-ZONE DATA THIS BUILD RUNS ON (canada-2, 22 October 2026,
// docs/canada-2-report.md §2). Runs before every build (package.json "prebuild"), so the Vercel build log says it plainly.
//
// WHY: tzdb 2026e (29 Sep 2026) holds four Canadian changes — British Columbia permanent UTC−7, Alberta and the Northwest
// Territories permanent UTC−6, Manitoba permanent UTC−5 — each modelled from 1 November 2026, 02:00. A runtime with older tz data
// moves those clocks back an hour on 1 November, so a Canadian truck's times (orders, slots, emails, tickets) would be an hour
// out from then. The first Node releases with 2026e: 22.23.4, 24.22.1, 26.11.0. Vercel chooses the patch of the project's
// major (Settings → Build and Deployment → Node.js Version), so this check is how a deploy shows which data it got.
// Nothing else in the world is touched: every GB, US, IE, AU and NZ zone is identical between 2026a and 2026e (checked hour
// by hour for 2026–2027, docs/canada-2-report.md §2.3).
//
// 🔴 IT NEVER FAILS A BUILD. It prints one line, and a second with a warning when the data is older — a stale runtime must not
// stop every other country's deploy. Canada stays switched off until a deploy prints "present" (the launch list).
'use strict'

/** The four probes: each zone's UTC offset in minutes on 1 December 2026, as tzdb 2026e has it. */
const PROBES = [
  { zone: 'America/Vancouver', want: -7 * 60, change: 'British Columbia permanent UTC−7 (tzdb 2026b)' },
  { zone: 'America/Edmonton', want: -6 * 60, change: 'Alberta and the Northwest Territories permanent UTC−6 (tzdb 2026c, 2026d)' },
  { zone: 'America/Winnipeg', want: -5 * 60, change: 'Manitoba permanent UTC−5 (tzdb 2026e)' },
]
const AT = new Date(Date.UTC(2026, 11, 1, 20, 0))   // 1 Dec 2026, 20:00 UTC — after every change, before any spring change

/** The zone's offset from UTC at `at`, in minutes, as THIS runtime's Intl computes it. */
function offsetMinutes(zone, at = AT) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map(x => [x.type, x.value]))
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  return Math.round((local - at.getTime()) / 60000)
}

/** Which of the 2026 Canadian changes this runtime's tz data is missing (empty when all are present). */
function missingCanada2026() {
  return PROBES.filter(p => offsetMinutes(p.zone) !== p.want)
}

module.exports = { PROBES, AT, offsetMinutes, missingCanada2026 }

if (require.main === module) {
  const missing = missingCanada2026()
  const tz = process.versions.tz || 'unknown'
  console.log(`check-tzdata: Node ${process.version}, ICU ${process.versions.icu || 'none'}, tz data ${tz} — the 2026 Canadian time-zone changes are ${missing.length ? 'MISSING' : 'present'}`)
  if (missing.length) {
    console.log(`check-tzdata: ⚠️ not in this runtime: ${missing.map(m => m.change).join('; ')}. From 1 November 2026 those clocks would read an hour out.`)
    console.log('check-tzdata: ⚠️ needs Node 22.23.4+, 24.22.1+ or 26.11.0+ (tz 2026e). Every other country is unaffected. Keep Canada switched off until a build prints "present".')
  }
}
