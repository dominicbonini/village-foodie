# events-create-3 — three local commits, and time-dates-parity passing again

18 November 2026. **Committed locally on main, not pushed, not deployed.** docs/ is left uncommitted.

## Summary

- **Commits:** three local commits, as asked: the events-create-2 build, the WhatsApp change, and the harness fix.
- **Your premise was slightly off.** None of the 9 "C2" failures was an event pick. All 21 failures were the same single change: the phone-only "📍 venue · times" line that events-overlap-2 added to Add order. In every case the event shown is the same before and after. There was no bug, so nothing needed stopping.
- **The harness now:**
  - names that line precisely, as allowance EO2;
  - adds a new check, DEF, which tests the approved-only default at all four time-boundary instants;
  - passes with **0 failures**.
  - Deliberately breaking the rule makes it fail.

## 1 · Prompt check

- **Garbled spans:** none found.
- **Contradictions:** none, so I didn't stop. Two points worth stating:
  - **Commit (a)'s contents.** You listed "code, all 49 messages files, the generated catalogue, the parity register". The build also changed two more message files: en-US and en-CA carry the postcode overrides ("ZIP code" / "postal code"). It also re-pinned six harnesses, because the build moved the code they check (listed in the events-create-2 report §4). I included both in (a), since they belong to that build. Without the harnesses, commit (a) would have left those six failing.
  - **The C2 premise.** The brief says the 9 C2 failures come "from the approved-only default". They don't; see §3. Your instruction still applied unchanged: I checked each case and found no bug, so I updated the harness.
- **SQL:** none was run, and no database was read or written.
- Pizzeria Gusto and Le Roi du Churrasco were not touched. No landing-page changes. No .env files opened.

## 2 · The commits (local, main, not pushed)

| # | Commit | What |
|---|---|---|
| a | `d3811624` | **events-create-2.** 166 files. <br>• Code: `lib/events/create-event.ts`, `CreateEventSheet`, `NoEventBox`, the dashboard page, the dashboard action route, the Manage route, `AddOrderPanel`, `EventPickerPanel`, `ToastStack`. <br>• Messages: en-GB, the 48 language bases, and the en-US/en-CA overrides. <br>• The generated `messages/ns/*` catalogue. <br>• `scripts/_messages-parity-1e.cjs`. <br>• The six re-pinned harnesses (schedule-graphics-places, event-types, us-rehearsal-fixes, us-polish-batch, money-sweep-parity, and the parity register). <br>Before committing I checked that the messages diff held only the 27 new keys, plus the trailing commas their insertion adds. Nothing from the parallel languages session was in it. |
| b | `1e398b2e` | **whatsapp-approved-only-1.** `lib/whatsapp/upcoming-events.ts`, `lib/whatsapp-classifier.ts`, and the new test `scripts/whatsapp-approved-only-1.cjs` (re-run before committing: 17 passed, 0 failed). |
| c | `53573efb` | **time-dates-parity.** `scripts/time-dates-parity.cjs` only (§4). |

After the three commits the working tree is clean apart from docs/.

## 3 · The 21 failures, one by one

I dumped the exact text difference for every failing leaf with a read-only script that diffs BEFORE and AFTER per leaf.

**All 21 differ in exactly one place.** The AFTER text gains " 📍 The Green — Harnessville · <start>–<end>" right after the Cash/Card buttons. This is Add order's phone-only (`sm:hidden`) line naming the selected event, added by events-overlap-2 (docs/events-overlap-2-report.md §3c). The harness renders without CSS, so a phone-only line is in the text.

### The 9 C2 cases

The C2 allowance covers these screens only at 00:30. At the other three instants the same new line had no allowance, which is why they failed as "C2 may move only at after0030". **These screens set their event explicitly** (`selectedEventId: 'ev-2'`, or `manualEvent` / `controlledEvent`), so no default pick runs in them.

The **old pick** is the event shown in BEFORE; the **new pick** is the event shown in AFTER.

| # | Moment (London) | Screen | Old pick | New pick | What moved | Verdict |
|---|---|---|---|---|---|---|
| 1 | Fri 9 Oct 15:20 BST | Dashboard, tomorrow's event selected | The Green, **Tomorrow · 11:30–14:00** (confirmed) | Same event | + "📍 The Green — Harnessville · 11:30–14:00" | Intended: the phone line names the event shown |
| 2 | Fri 9 Oct 15:20 BST | Add order, tomorrow's event | The Green, **Tomorrow · 11:30–14:00** | Same | + "📍 … · 11:30–14:00" | Intended |
| 3 | Fri 9 Oct 15:20 BST | Add order, yesterday's event | The Green, **Thu 8 Oct 17:00–21:00** | Same | + "📍 … · 17:00–21:00" | Intended |
| 4 | Fri 13 Nov 15:20 GMT | Dashboard, tomorrow's event selected | The Green, **Tomorrow · 11:30–14:00** | Same | + "📍 … · 11:30–14:00" | Intended |
| 5 | Fri 13 Nov 15:20 GMT | Add order, tomorrow's event | The Green, **Tomorrow · 11:30–14:00** | Same | + "📍 … · 11:30–14:00" | Intended |
| 6 | Fri 13 Nov 15:20 GMT | Add order, yesterday's event | The Green, **Thu 12 Nov 17:00–21:00** | Same | + "📍 … · 17:00–21:00" | Intended |
| 7 | Fri 9 Oct 23:30 BST | Dashboard, tomorrow's event selected | The Green, **Tomorrow · 11:30–14:00** | Same | + "📍 … · 11:30–14:00" | Intended |
| 8 | Fri 9 Oct 23:30 BST | Add order, tomorrow's event | The Green, **Tomorrow · 11:30–14:00** | Same | + "📍 … · 11:30–14:00" | Intended |
| 9 | Fri 9 Oct 23:30 BST | Add order, yesterday's event | The Green, **Thu 8 Oct 17:00–21:00** | Same | + "📍 … · 17:00–21:00" | Intended |

None is a bug.

**The other 12** ("moved and no allowance names it") are the same line on the dashboard's Orders tab (with orders, and empty) and on Add order with today's event, at all four instants. Each shows "📍 … · 12:00–23:59", which is today's event. Again, the event shown is unchanged.

## 4 · What changed in the harness

### EO2: the phone line, named precisely

At every instant, the line is taken out of the AFTER text **only on the six Add order / dashboard screens**, and only when all of these hold:

- it is found **exactly once**;
- it names **exactly the times of the event that screen shows** (today 12:00–23:59, tomorrow 11:30–14:00, yesterday 17:00–21:00);
- BEFORE does not already contain such a line.

What's left is then compared as before: byte for byte, or by the rule that already names the leaf (C2 at 00:30 still checks its "Tomorrow · 11:30–14:00" / "Fri 9 Oct" labels).

The dashboard's own event-bar line ("📍 … 📅 Today …") is excluded by the pattern and never touched.

**Nothing else was loosened:**
- C2 still applies only at 00:30;
- every other allowance is unchanged;
- the BEFORE snapshot was not recaptured.

### DEF (new): the approved-only default at every instant

These screen fixtures never ran the default, so I added a check that does. It runs:

- `pickDashboardDefaultEvent` (the dashboard) and `pickDefaultApprovedEvent` (Add order), from `lib/event-default.ts`;
- beside the old status-blind `pickDefaultEventByTime`;
- on the truck's clock (London), at the four instants, over five fixture sets.

The expectations are written out by hand. Two extra assertions apply to any fixture: a new default is never an unconfirmed or closed event, and a started event that has not ended wins.

The fixture sets:

| Set | What it contains |
|---|---|
| **duplicate** | A scraped unconfirmed copy listed before the approved event at the same times (the 13 November case) |
| **startedEarly** | An open event at 22:00 beside a confirmed one at 17:00 |
| **onlyUnapprovedToday** | Today has only an unconfirmed event; tomorrow has an approved one |
| **overnight** | Last night's open event running 22:00–02:00, plus today's confirmed one |
| **noneApproved** | Only unconfirmed events |

Old pick → new pick (dashboard). Add order's default, where it differs, is in brackets; "—" means no event selected.

| Moment (London) | duplicate | startedEarly | onlyUnapprovedToday | overnight | noneApproved |
|---|---|---|---|---|---|
| Fri 15:20 BST | copy → **approved** | 17:00 confirmed → **open** | copy → — (Add order: tomorrow) | today → today | copy → — |
| Fri 15:20 GMT | copy → **approved** | 17:00 confirmed → **open** | copy → — (Add order: tomorrow) | today → today | copy → — |
| Fri 23:30 BST | 22:00 confirmed → same | open → open | tomorrow → — (Add order: tomorrow) | finished 17:00 event → — | tomorrow's copy → — |
| Sat 00:30 BST | copy → **approved** | 17:00 confirmed → **open** | copy → — (Add order: tomorrow) | overnight open → same | copy → — |

Every new pick matches the intended rule:
- a started event first;
- then an approved one that is current or next;
- never an unconfirmed one, never a finished one;
- the dashboard selects nothing while today's only events are unapproved.

Every old → new change in this table is a case the new rule exists to fix:
- **duplicate:** the old pick chose the scraped copy (the 13 November bug).
- **Fri 23:30, overnight:** the old pick fell back to an event that had already finished.

**One note on the 23:30 overnight case.** I first expected the overnight event there, and the run failed. That was my fixture's mistake, not the code's: at Fri 23:30 last night's event ended at 02:00 that morning, and today's ended at 21:00. "Nothing" is the correct answer, so I corrected the expectation and commented it in the file.

### Proof the checks can fail

Each breakage was applied temporarily and then restored. `git diff` on `lib/event-default.ts` was clean afterwards, and the harness passed again.

| Breakage | Result |
|---|---|
| The default allows unconfirmed events | 23 DEF failures |
| The default no longer drops finished events | 3 DEF failures |
| EO2 told the wrong times for one screen | 3 failures on that screen |

## 5 · Result

`node scripts/time-dates-parity.cjs`:

> ✅ time-dates-parity: GB identical outside the named windows; US correct

- **0 failures.**
- EO2 covers 24 leaves: the 21 that failed, plus the 3 C2 leaves at 00:30, which now also have the line taken out before C2 checks them.
- Every other allowance count is as before.
