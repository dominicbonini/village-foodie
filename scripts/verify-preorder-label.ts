// scripts/verify-preorder-label.ts
// Unit proof for the PURE pre-order label fns (V7.8) — no I/O, no DB, no clock.
//
// Run:  npx tsx scripts/verify-preorder-label.ts
//
// Covers preorderDeadlineClock (the ONE cross-day math source) + formatPreorderLabel (pure, no
// device-local time). Mirrors the cases in the build spec: same-day hours_before, cross-day
// hours_before, daily_cutoff, the closed_pending string, and null for a non-config.

import { preorderDeadlineClock, formatPreorderLabel, isPreorderDeadlinePassed, type PreorderConfig } from '../lib/preorder'

let failures = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  const ok = g === w
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗ FAIL'}  ${label}\n        got ${g}  want ${w}`)
}

const HOURS = (type: 'hours_before' | 'daily_cutoff', value: number): PreorderConfig =>
  ({ enabled: true, deadlineType: type, deadlineValue: value, pastAction: 'force_pending' })

// eventStart 16:30 = 990 minutes-of-day.
const START_1630 = 16 * 60 + 30

// 1) same-day hours_before: 16:30 − 2h ⇒ 14:30 on the event date.
{
  const clock = preorderDeadlineClock(HOURS('hours_before', 2), '2026-07-15', START_1630)
  eq('hours_before 2h clock', clock, { mins: 14 * 60 + 30, date: '2026-07-15' })
  eq('hours_before 2h label', clock && formatPreorderLabel('before', clock.mins, clock.date, '2026-07-15'), 'Pre-order by 14:30')
}

// 2) cross-day hours_before: 16:30 − 24h ⇒ 16:30 on the PREVIOUS day ⇒ ", Ddd D Mon" with weekday.
//    2026-07-14 is a Tuesday (real calendar — see the spot-check below).
{
  const clock = preorderDeadlineClock(HOURS('hours_before', 24), '2026-07-15', START_1630)
  eq('hours_before 24h clock', clock, { mins: START_1630, date: '2026-07-14' })
  eq('hours_before 24h label (weekday)', clock && formatPreorderLabel('before', clock.mins, clock.date, '2026-07-15'), 'Pre-order by 16:30, Tue 14 Jul')
}

// 2b) WEEKDAY-CORRECTNESS spot-check against the real calendar: cutoff 2026-06-27 (24h before a
//     2026-06-28 event) — 2026-06-27 is a SATURDAY. UTC-noon getUTCDay must agree.
{
  const clock = preorderDeadlineClock(HOURS('hours_before', 24), '2026-06-28', START_1630)
  eq('cross-day 27 Jun 2026 = Saturday', clock && formatPreorderLabel('before', clock.mins, clock.date, '2026-06-28'), 'Pre-order by 16:30, Sat 27 Jun')
  const realDow = new Date('2026-06-27T12:00:00Z').getUTCDay() // 6 = Sat
  eq('27 Jun 2026 getUTCDay is 6 (Sat)', realDow, 6)
}

// 3) daily_cutoff: 720 ⇒ 12:00 on the event date (same-day ⇒ no date suffix).
{
  const clock = preorderDeadlineClock(HOURS('daily_cutoff', 720), '2026-07-15', START_1630)
  eq('daily_cutoff 720 clock', clock, { mins: 720, date: '2026-07-15' })
  eq('daily_cutoff 720 label', clock && formatPreorderLabel('before', clock.mins, clock.date, '2026-07-15'), 'Pre-order by 12:00')
}

// 4) closed_pending string (mins/date/eventDate ignored).
eq('closed_pending label', formatPreorderLabel('closed_pending', 0, '', ''), 'Pre-orders closed. Kitchen to approve.')

// 5) null for a non-config (disabled), and isPreorderDeadlinePassed stays inert.
{
  const off: PreorderConfig = { enabled: false, deadlineType: 'daily_cutoff', deadlineValue: 720, pastAction: 'sold_out' }
  eq('disabled clock = null', preorderDeadlineClock(off, '2026-07-15', START_1630), null)
  eq('disabled verdict inert', isPreorderDeadlinePassed(off, '2026-07-15', START_1630, '2026-07-15', 0), { isPreorder: false, passed: false, pastAction: null })
}

// 6) DRY check: isPreorderDeadlinePassed agrees with the clock it now delegates to (24h cross-day,
//    now = 16:29 on the cutoff day ⇒ not passed; 16:30 ⇒ passed).
{
  const cfg = HOURS('hours_before', 24)
  eq('verdict not-passed @16:29 cutoff-day', isPreorderDeadlinePassed(cfg, '2026-07-15', START_1630, '2026-07-14', START_1630 - 1).passed, false)
  eq('verdict passed @16:30 cutoff-day', isPreorderDeadlinePassed(cfg, '2026-07-15', START_1630, '2026-07-14', START_1630).passed, true)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
