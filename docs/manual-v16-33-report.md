# manual-v16-33 — reference manual V16.32 → V16.33

18 November 2026. I applied `~/Downloads/reference-manual-delta-v16-33.md` to `docs/reference-manual.md`, following its HOW TO APPLY section.

- **Not committed.** The delta doesn't ask for a commit, so the file is modified in the working tree only.
- **Checks were read-only:** two SELECTs, shown in §3.
- No .env* file was opened.
- **Size:** 219 lines added, 10 changed.
- **Pre-edit copy:** `/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/bfb355fd-67c4-455d-97e7-63529041d235/scratchpad/reference-manual.before-v16-33.md`

(An earlier run of this brief found no delta file. That report is replaced by this one.)

## 0 · Prompt check

- **Garbled spans:** none in the prompt or the delta.
- **Contradictions:** none between the instructions.
- **Where the delta and reality disagree:** step 6 says to record what I observed and flag it. Seven differences are in §4.
  - I wrote the observed state into the manual for five of them.
  - Two are recorded here only: ca-AD's "switched off", and the KDS default.

## 1 · What was applied, step by step

| Step | Done |
|---|---|
| 1 · Version | Header line 1 → `HatchGrab Engineering Reference Manual · V16.33`; front matter → `**Version 16.33**`. Both checked with grep. |
| 2 · Changelog | The V16.33 entry is at the top of `# Changelog`, above V16.32. Changes from the delta's text: ca-AD's legal pages are now done (§4.2), and a dated "Verified 18 November 2026 (read-only)" line records §3. |
| 3 · Open items | Edited in place; heading → `(V16.33, 18 November 2026)`. Details below. |
| 4 · New sections | `# Events: approved only, duplicates and Create event now (V16.33)` and `# Dashboard sign-in (V16.33)`, after `# Partner programme` and before `# Changelog`. |
| 4 · Brand files | Merged into the logo-files list in §38 "Shipped files", where `hatchgrab-wordmark` already appears, as a dated paragraph under the table. No separate `# Brand files` section. |
| 5 · Supersede | Six one-line ⛔ pointers (§2). |
| 6 · Verify | §3. |
| 7 · Nothing else | Nothing else was changed. |

**Open items changes:**
- **Item 1:** the old deploy item is struck and marked "⛔ Done V16.33" (the 13 Nov batch was pushed to `c0192554` and deployed).
  - The new 🔴 deploy item follows, with the observed commit count and contents (§4.1).
- **Item 6:** the V16.33 native checks are added: fil-PH's permit names, ne-NP's log-in word, and the four languages' legal pages.
- **Item 9:** struck; "✅ Investigated and fixed V16.33".
- **Item 12:** the seven harnesses that fail the same way on HEAD are added. app-fixes-2 (55/0) and time-dates-parity now pass.
- **Item 14:** the languages-world-2 text is struck and replaced by the languages-world-3 state (§4.2).
- **New items 27–34**, under "Added V16.33", the next free numbers after 26:
  - 27: the dashboard sign-in steps;
  - 28: the Supabase session settings;
  - 29–30: the two wording decisions;
  - 31: the UK-law line on the delete-account screen;
  - 32: `/api/menu` with two events on one date;
  - 33: the KDS doesn't follow a new event;
  - 34: walk-up-only events.
- No second list was started.

## 2 · Older text superseded (step 5)

Each superseded passage got one line in the manual's style: "⛔ **Superseded V16.33** — …, see 'Events: approved only, …'".

| Where | It said | Pointer |
|---|---|---|
| §10 Add Order, "Event selection" | "lists all upcoming confirmed events. Auto-selects today's event…" | The list shows every event grouped by date, with unapproved ones marked |
| §10, "Auto-event selection on dashboard load (V5)" | Picks the event happening now, then upcoming, regardless of status | Approved only, never unconfirmed (`pickDashboardDefaultEvent`) |
| Changelog (pre-trial session), "Auto-event selection on dashboard load" | Same rule | Same pointer |
| §11 (V11.20), the dashboard-vs-KDS table | Dashboard "time-based, via `pickDefaultEventByTime`" | Same pointer, under the table |
| Changelog (V11.20 summary) | "The dashboard resolves … via `pickDefaultEventByTime`" | Same pointer |
| §20 WhatsApp, "Event lookup" | "confirmed/open/unconfirmed" | Confirmed and open only |

The other two kinds the delta lists turned up nothing:
- **"Walk-ups accept any event":** no passage says so. I searched for walk-up / manual next to status, approved and any event.
- **"Sign out signs out every device":** no passage says so. The sign-out notes (V8-era native sign-out, the UserMenu logout) don't state a scope.

## 3 · Verification (read-only, 18 November 2026)

| Check | Observed | Expected |
|---|---|---|
| `git log --oneline` contains the eight commits | All 8 present: `cf8ff324`, `3ecdbb35`, `5a15ada8`, `d3811624`, `1e398b2e`, `53573efb`, `9198f4a0`, `e3c02790` | ✓ |
| `git rev-parse --short origin/main` | `c0192554`, 2026-11-17 09:18 | ✓ |
| `git rev-list --count origin/main..main` | **93** | ~90 ✓ |
| The five files exist | `lib/auth/require-member.ts`, `lib/native/staffFetch.ts`, `lib/events/create-event.ts`, `components/shared/CreateEventSheet.tsx`, `components/shared/EventPickerPanel.tsx`: all present | ✓ |
| `truck_events.overlap_dismissed_at` | `timestamp with time zone`, nullable YES | ✓ |

**SQL run (read-only):**

```sql
select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='truck_events' and column_name='overlap_dismissed_at';
-- overlap_dismissed_at | timestamp with time zone | YES

select country_code, enabled from country_settings where country_code = 'AD';
-- AD | true
```

The second query was mine, to check the delta's "ca-AD … (switched off)" (§4.2).

**Other checks of the delta's claims:**
- **Quoted wording:** every string the Events section quotes is in `messages/en-GB.json`. This covers the questions, the badges, "This event isn't approved", the order pills, the summary box and the create sheet.
  - The app uses a curly apostrophe (isn’t, can’t); the delta's straight one was kept as written.
- **Brand files:**
  - The PNG sizes are 640×141 and 320×70, for both the colour and white versions.
  - The SVG fills are `#16314F` and `#EF8B2C`.
- **Code facts:**
  - `truck_places` is the table Create event now reads.
  - WhatsApp reads `.in('status', ['confirmed','open'])`.
  - The access token lasts 3600 s (`supabase/config.toml`).
- **dashboard-auth-1 figures and the D1–D7 options:** they match `docs/dashboard-auth-1-report.md`: 69 writes on 5 demo trucks, the risks, and the options.

## 4 · Where the delta and reality disagree (flagged)

1. **Item 1's list of unpushed work.**
   - The delta says the ~90 commits include "the earlier unpushed admin-speed-1, trial-column-1, partners-2/3". **They are already in origin/main.** No commit in `origin/main..main` names them, and partners-3's `79be844f` is an ancestor of origin/main.
   - What the 93 actually are:
     - 83 languages-world-3;
     - events-overlap-2 ×2, events-overlap-8, events-create-2, events-create-4;
     - whatsapp-approved-only-1, time-dates-parity, dashboard-auth-2 (with -3);
     - pricing-copy-4, legal-languages-1.
   - **Written into the manual as observed.**
2. **ca-AD.**
   - The delta says "ca-AD UI installed (switched off), legal next". The progress table in `docs/languages-world-3-report.md` now shows **ca-AD's legal pages done (batch 19)**. Item 14 and the changelog say so.
   - "Switched off": **Andorra's `country_settings` row reads `enabled = true`.** I couldn't tell from the code whether the delta meant the language rather than the country, so I left "switched off" out of the manual rather than state either.
   - **Please confirm** whether Andorra is meant to be live.
3. **`requireMember`'s signature.**
   - The delta: `requireMember(req, truck, action, { mode })`.
   - The code: `requireMember(req, supabase, truck, action, { route, group, actor?, replay?, mode? })`, with modes in the `AUTH_MODE` constant. **The code's version is written.**
4. **Caller kinds.** The code also has **`unresolved`**, for when the sign-in check itself fails. **Added to the list.**
5. **The read-throttle field.**
   - The delta says `reads_suppressed`.
   - The row actually carries **`reads_suppressed_before`** (and `suppressed_since`). **The code's names are written.**
6. **The banner's words.**
   - The delta: the "sign in again" banner.
   - Since app-fixes-2 the banner reads **"Your login needs attention"**, with a **"Log in again"** link. **The actual words are written.**
   - The older §12 text still says "Sign in again". It is outside this delta's four supersede kinds, so it was left alone.
7. **The amber boxes.**
   - The delta: with nothing approved, they show "No event selected".
   - When today's only events are unapproved, the bar and the Orders box say **"Approve an event to take orders"** (still "Select event" only). This is the events-create-4 screenshot 02. **Added as a second sentence.**

**Also noticed, not changed:**
- **The KDS still picks its own default with the status-blind `pickDefaultEventByTime`** (`kds/page.tsx`), and the manual's V11.20 KDS text says so correctly. The delta covers only the dashboard's default.
  - Whether the KDS can default to an unconfirmed event depends on the list it is given. I didn't investigate; this may be worth a look.
- **§12 already records the Supabase session settings as confirmed** ("no session time-box, no inactivity timeout, 3600s access token", from an earlier version). The delta's new item 28 asks for a re-check before this deploy, which is consistent.

## 5 · Not done

- No commit. The delta doesn't ask for one; tell me if you want `docs/reference-manual.md` committed.
- No database writes. No push or deploy. No .env* file opened.
