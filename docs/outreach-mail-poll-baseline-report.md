# The first look that swallowed a reply

**29 September 2026.** Follow-up to `docs/outreach-mail-two-mailboxes-report.md`. Sending stays manual;
the poll stays read-only.

**Nothing was sent during this task** and no mailbox was touched. **No SQL was run**, and none is
needed — the recovery is a new `outreach_settings` key the code writes itself. No `outreach_templates`
row was created, edited, seeded or deactivated; `outreach_snippets` was not touched; no live trading
truck was involved.

---

## 1 · The cause, confirmed in the code

Dominic's diagnosis was right on **both** counts, and the code says so plainly.

### (a) The first look baselined at whatever uid was at the top
```ts
export function planFetch(stored, live): PollPlan {
  if (!stored) return { mode: 'baseline', lastUid: live.highestUid }
  …
}
```
and in `walkMailbox`:
```ts
if (plan.mode === 'baseline') {
  state[path] = { uidvalidity, lastUid: plan.lastUid }
  summary.baselined.push(label)
  return                     // ← nothing processed, ever
}
```

🔴 **The watermark was a property of when the poll happened to run.** The ten-minute cron fired in the
gap between Dominic sending his test email and pressing the button, and baselined `dominic/INBOX` at a
uid that **already included his reply**. From that instant the reply was below the watermark and could
never be read: the next run's plan was `incremental` from `lastUid + 1`.

That also explains the two things that looked odd on screen. The button reported **all zeros** — there
was genuinely nothing above the watermark — and it did **not list `dominic/INBOX` as a first look**,
because `baselined` is only pushed on the `baseline` branch and INBOX had already had its one.

### (b) An empty folder never got a watermark at all
```ts
if (res.skipped) {
  const c = await mailboxCount(client, path)
  if (c === 0 && !state[path]) summary.baselined.push(label)   // ← reports, stores NOTHING
}
```
`withReadOnlyMailbox` deliberately does not open an empty mailbox — `fetch('1:*')` on one throws
"Command failed", which is what produced the first diagnostics run's two errors — so the callback that
writes `state[path]` never ran. `hello/Spam` and `hello/Archive` therefore reported *"first look"* on
every run for hours, and 🔴 **the first message ever to arrive in one of them would have been baselined
away by the next run**, exactly as the INBOX reply was.

⚠️ **One correction to the brief's wording, and it does not change anything.** It asks to "stop
reporting first look for a folder that already has a stored watermark" — the old code already did only
report it for folders without one. The reason those two folders reported it every time is (b): they
never acquired a watermark to have. Fixing (b) fixes the reporting as a consequence.

---

## 2 · The fix

### A date, not the current top uid
`lib/outreach-mail-accounts.ts`:
```ts
export const POLL_SINCE: Record<MailAccount, string> = {
  hello: '2026-09-29T17:26:00Z',
  dominic: '2026-09-29T00:00:00+01:00',
}
```
🔴 **A date is a property of the thing being protected against** — history that belongs to the importer
— where the top uid is a property of when the poll ran. `hello` reads from when Build 2 went live;
`dominic` from the day the mailbox was created, so the whole of it is in range and there is no history
to swallow.

`planFetch` gains the mode and takes the instant:
```ts
export function planFetch(stored, live, since: Date): PollPlan {
  if (!stored) return { mode: 'first_look', since }
  if (String(stored.uidvalidity) !== String(live.uidvalidity)) return { mode: 'rescan', sinceDays: RESCAN_DAYS }
  if (live.highestUid <= stored.lastUid) return { mode: 'none' }
  return { mode: 'incremental', from: stored.lastUid + 1 }
}
```
⚠️ **The original concern is still honoured.** A mailbox with two years in it is still not walked: only
messages at or after `POLL_SINCE` are processed, and anything older is left to the importer, which
writes no contact rows at all.

### SEARCH narrows; the internal date decides
```ts
const query = plan.mode === 'rescan'  ? { since: new Date(Date.now() - plan.sinceDays * 86_400_000) }
            : plan.mode === 'first_look' ? { since: plan.since }
            : `${plan.from}:*`
…
if (plan.mode === 'first_look' && !withinFirstLook(msg.internalDate, plan.since)) continue
```
🔴 **IMAP `SINCE` has day granularity, in the server's own timezone.** It is a narrowing, not the
decision. ⚠️ And it is the **INTERNALDATE**, not the `Date` header: a sender's clock can say anything,
while the internal date is when this server received the message — which is what "since the poll went
live" means.

⚠️ **The watermark advances over every message the search returned**, including ones the date filter
rejects. They have been looked at; re-reading them next run would be pure cost.

### An empty folder gets a watermark
```ts
const st = await mailboxStatus(client, path)
mode = 'empty'
if (st && st.messages === 0 && !state[path]) {
  state[path] = emptyWatermark(st.uidvalidity)     // { uidvalidity, lastUid: 0 }
}
```
`mailboxStatus` is new: STATUS already cost a round trip for the count, and asking for `uidValidity` in
the same command is what makes a watermark possible for a folder that is never opened. `lastUid: 0`
means *"nothing seen yet"*, so the next message is read incrementally from uid 1 — **not** baselined.

### The recovery
```ts
const STATE_KEY: Record<MailAccount, string> = {
  hello: 'mail_poll_state',
  dominic: 'mail_poll_state_dominic_v2',
}
```
🔴 `mail_poll_state_dominic` holds the watermarks the broken cron set, including the one above the
reply. A new key gives every dominic@ folder a fresh first look, which now reads from 29 September and
therefore **picks that reply up**.

⚠️ **The old key is left in place, unused, and deliberately not deleted.** It is the only record of what
the broken run did; rewriting it would destroy the evidence, and deleting a row to fix a bug is how the
next person loses the ability to tell what happened. The harness asserts nothing reads it and nothing
deletes it.

⚠️ **hello@ keeps its existing key.** Its INBOX and Sent watermarks are correct — they were set by runs
that actually read those folders — and a fresh first look would re-read a week of mail for nothing. Its
two **empty** folders had no watermark at all, so they acquire one on the next run regardless.

### A summary that explains itself
```ts
summary.folders.push({
  folder: label, mode, examined,
  before: before ? before.lastUid : null,
  after: state[path] ? state[path].lastUid : null,
  since: sinceUsed,
})
```
🔴 **This is the part that makes a future "found nothing" diagnosable.** On 29 September the button said
all zeros and nothing on screen could distinguish "the reply never arrived" from "it did not match"
from "a watermark set four minutes ago skipped it". Under **What each folder did** the panel now shows,
per folder: the mode, how many messages were examined, the watermark **before → after**, and the
first-look date where there was one.

⚠️ `sinceUsed` is recorded where the decision is made rather than inferred from `mode` afterwards —
TypeScript narrows `mode` past the closure that assigns it, and a comparison the compiler believes is
impossible is a comparison that silently stops being made.

---

## 3 · Harness

`node scripts/outreach-mail-poll.cjs` · **16 broken variants, 207 assertions**, no network and no
mailbox.

```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
  ✓ FAILED as required  V1 a folder with no watermark is not given a first look: everything already in it is skipped for good
  ✓ FAILED as required  V2b the first look stops filtering by date: a 2024 email is processed as if it had just arrived
  ✓ FAILED as required  V14 an empty folder stores no watermark: its first message is baselined away
  ✓ FAILED as required  V2 the subject test removed: Outlook's own out-of-office is classified as a reply
  ✓ FAILED as required  V3 auto-reply tested first: a delivery report is filed as an out-of-office and no address is marked
  ✓ FAILED as required  V4 a shared address is resolved to the first prospect: a reply is attributed to the wrong business
  ✓ FAILED as required  V5 the stage filter removed: a reply overwrites a stage Dominic set by hand
  ✓ FAILED as required  V6 the lock never reports itself held: two runs process the same reply
  ✓ FAILED as required  V7 the allow-list defaults to allow: a permanent rejection is retried three times
  ✓ FAILED as required  V8 the test exclusion removed: a stuck TEST send is swept like a real one
  ✓ FAILED as required  V9 the loser of the insert race is told it created the row: the reply is logged twice
  ✓ FAILED as required  V10 the status filter removed: two runs both claim the same failed row and both re-send it
  ✓ FAILED as required  V11 the staleness filter removed: a second run takes a lock that is held right now
  ✓ FAILED as required  V12 the hello@ fallback removed: with no primary configured, nothing can send at all
  ✓ FAILED as required  V13 a stored row's account is ignored: an old hello@ email is opened against dominic@
```

⚠️ **V1 was re-aimed rather than replaced.** It used to prove "the first run processes nothing", which
is the behaviour this task removes; it now proves the opposite failure — a folder with no watermark
getting no first look, which is the 29 September defect verbatim. **V2b** and **V14** are new and cover
the other half of each half: the date filter disappearing, and an empty folder storing nothing.

### The new sections
```
── THE FIRST LOOK READS BY DATE, NOT BY THE CURRENT TOP UID ─────────────────────────────
  ✓ 🔴 no stored watermark ⇒ a FIRST LOOK from the date, not a baseline
  ✓ nothing new ⇒ nothing fetched
  ✓ three new ⇒ from the one after the watermark
  ✓ 🔴 uidvalidity changed ⇒ re-read 7 days, not 9000 uids
  ✓ and the window is 7 days
  ✓ 🔴 a folder that was EMPTY last run reads incrementally from uid 1 — it is not baselined away

── WHICH MESSAGES A FIRST LOOK PROCESSES ────────────────────────────────────────────────
  ✓ 🔴 Dominic's 20:50 reply IS processed — the message the old code swallowed
  ✓ a message exactly at the instant is in
  ✓ …and one from the day before is NOT — history stays the importer's job
  ✓ nor is a 2024 email
  ✓ a message with no internal date is left alone rather than guessed at
  ✓ …and so is an unreadable one
  ✓ hello reads from when the poll went live
  ✓ dominic reads from the mailbox's creation day
  ✓ 🔴 …which is before the primary switch, so the whole of that evening is in range

── AN EMPTY FOLDER GETS A WATERMARK ─────────────────────────────────────────────────────
  ✓ 🔴 an empty folder stores lastUid 0 — "nothing seen yet", not "start from the top"
  ✓ the uidvalidity is stored as a string, as elsewhere
  ✓ 🔴 …so the FIRST message ever to arrive is processed
  ✓ …and the watermark then moves past it

── THE RECOVERY, AND WHAT IT DELIBERATELY LEAVES ALONE ─────────────────────────────────
  ✓ 🔴 dominic reads a NEW key, so its folders get the date-based first look and the swallowed reply
  ✓ 🔴 hello keeps its EXISTING key — its INBOX and Sent watermarks were set by runs that really read them
  ✓ ⚠️ the old dominic key is not read anywhere…
  ✓ 🔴 …and nothing deletes it: it is the only record of what the broken run did
  ✓ the importer writes no contact row, as it never has
  ✓ 🔴 a first look re-reading it does NOT create a second row…
  ✓ …and therefore logs no contact for it

── THE SUMMARY EXPLAINS ITSELF ──────────────────────────────────────────────────────────
  ✓ every folder reports what it did
  ✓ …including `folder:` `mode:` `examined:` `before:` `after:` `since:`
  ✓ the examined count is the messages actually handed to the matcher
  ✓ the watermark BEFORE is captured before the walk
  ✓ and the panel shows it
  ✓ ⚠️ …guarded, so an older route that does not send it cannot blank the panel
  ✓ a first look names the date it read from
  ✓ 🔴 …and only a genuine first look is reported as one — a folder with a watermark never is
```

Every earlier section — matching, classification, the bounce lookup, the reply text, the stage rule,
housekeeping, the two-account model, the three atomic claims, the read-only census and the cron
registration — still passes unchanged. Exit **0**, `✅ ALL CHECKS PASSED`.

⚠️ **One existing census assertion was restated, not silently re-pointed.** It checked for
`dominic: 'mail_poll_state_dominic'`; the recovery moves that to `_v2`, and the note explaining why sits
at the assertion.

---

## 4 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0** |
| `node scripts/outreach-mail-poll.cjs` | exit **0** — 16 variants failed as required, 207 assertions passed |
| `node scripts/run-harnesses.cjs` | exit **0** — **61 run · 61 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

### eslint, per rule, against a clean HEAD worktree (`24f9c10`)

| Rule | clean HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 5 | 5 | **0** |
| `react-hooks/immutability` | 1 | 1 | **0** |
| `react-hooks/set-state-in-effect` | 7 | 7 | **0** |

**Zero delta on every rule.** No new files in this task; every change is to files that already existed.

---

## 5 · Files changed

| File | What changed |
|---|---|
| `lib/outreach-mail-accounts.ts` | `POLL_SINCE` and `pollSince()` — the per-account first-look instant. |
| `lib/outreach-mail-poll-rules.ts` | `planFetch` returns `first_look` and takes the instant; `withinFirstLook`; `emptyWatermark`. |
| `lib/outreach-mail-poll.ts` | The date-based first look, the empty-folder watermark, the recovery key, the per-folder report. |
| `lib/outreach-mail-box.ts` | `mailboxStatus` — count **and** uidvalidity without opening the mailbox. |
| `components/admin/OutreachPanel.tsx` | **What each folder did**, guarded so an older route cannot blank the panel. |
| `scripts/outreach-mail-poll.cjs` | V1 re-aimed, V2b and V14 new, four new sections, one assertion restated. |

---

## 6 · Dominic's steps

### 1 · Press Check for replies now
Expect:
- **1 reply logged**;
- the summary lists a **first look** at the `dominic/…` folders **(since 2026-09-28T23:00:00.000Z)** —
  that is 29 September 00:00 British Summer Time, written in UTC;
- the prospect's **stage is `replied`**;
- **Contact history** has one inbound `reply` row;
- **Emails** shows the **Reply**, and **View** opens it;
- 🔴 **in Outlook, the reply is still unread.**

Open **What each folder did**. `dominic/INBOX` should read *first look*, with a non-zero **examined**
count and the watermark moving from **—** to a real uid. That panel is the thing that was missing on
29 September: had it existed, it would have shown `dominic/INBOX` at *incremental*, examined 0, with a
watermark already above the reply.

⚠️ **hello@'s folders are not re-read.** `hello/INBOX` and `hello/Sent` keep their watermarks and
should read *incremental* or *none*; `hello/Spam` and `hello/Archive` will show *empty* and, from now
on, hold a watermark instead of reporting a first look forever.

### 2 · Press it again
Expect **0 replies logged** and **no second row** in Contact history. The message is skipped on its
`message_id`, and the insert gate means a run that loses the race logs nothing.

### 3 · Let the cron do it
Reply once more from Hotmail and **wait for the ten-minute run without pressing anything**. The reply
should be logged when you next look. That is the check that the scheduled path works on its own — the
button and the cron run the same routine, and this build changes neither of them beyond the first look.

### 4 · If step 1 logs nothing
Open **What each folder did** and read `dominic/INBOX`:
- **first look, examined 0** — the reply is older than 29 September 00:00 BST, or IMAP `SINCE` did not
  return it. Tell me the row and I will look.
- **incremental, before ≥ the reply's uid** — a watermark is still above it; the recovery key did not
  take effect, which would mean the deploy has not landed.
- **none** — nothing new in the folder at all, so the reply is not where we think it is.

---

## 7 · Commit and deploy evidence

**Commit `617144c`** — *"Fix the poll's first look: read by date, not by the current top uid"*, on
`main`, pushed to `origin/main` (`24f9c10..617144c`). Seven files, all pre-existing. No other work is
in it.

**Deployed and serving on production, confirmed 2026-09-29T20:24:12Z.**

Proved by the build-fingerprint method. The set of `/_next/static/chunks/*.js` the home page references
was captured **before** the push and then polled:

```
fingerprint before push: 42adda6d711367670afe9eedc5958d3f
poll 1: 42adda6d711367670afe9eedc5958d3f
poll 2: 42adda6d711367670afe9eedc5958d3f
poll 3: 42adda6d711367670afe9eedc5958d3f
poll 4: afad185570ad1056be6af430fe13d2c6     ← DEPLOY LANDED
```

The route checks below were taken after it changed.

| Request | Status | Content-Type | Body |
|---|---|---|---|
| `GET /api/admin/outreach/mail-poll` | 405 | — | POST-only, so the path exists |
| `GET /api/cron/outreach-replies` | 401 | `application/json` | `{"error":"Unauthorised"}` |
| `GET /api/admin/outreach/does-not-exist-check` | 404 | `text/html` | the app's HTML 404 page |

The last row is the control: a non-existent path returns the rendered HTML 404.

⚠️ **The routes are unchanged by this commit, so those three rows prove the site is up rather than that
this fix is live.** The fingerprint change is what proves the build was replaced, and the first press
of **Check for replies now** is what proves the fix works — §6 step 1, where `dominic/INBOX` must read
**first look** in the per-folder panel. That panel is itself part of this commit, so its presence is
also the visible confirmation that the new code is the code running.

⚠️ **The ten-minute cron may reach the new build before Dominic does.** That is harmless and is the
point of the design: the first look is by date, so whichever runs first — cron or button — processes
the reply, and the other finds it already recorded and logs nothing.

---

## 8 · Final state of the working tree

```
On branch main
Your branch is up to date with 'origin/main'.

Changes committed in 617144c:

  new file:   docs/outreach-mail-poll-baseline-report.md
  modified:   lib/outreach-mail-accounts.ts
  modified:   lib/outreach-mail-poll-rules.ts
  modified:   lib/outreach-mail-poll.ts
  modified:   lib/outreach-mail-box.ts
  modified:   components/admin/OutreachPanel.tsx
  modified:   scripts/outreach-mail-poll.cjs

Untracked files:
  (none)

nothing to commit, working tree clean
```

Nothing was staged, committed, stashed, reset or restored beyond this task's own files; `git add -A`
and `git add .` were not used. **No SQL was run and none is needed** — the recovery is a new
`outreach_settings` key the code writes for itself, and the old one is left untouched. Two
`slot-head-dots-*` worktrees from an earlier session remain listed as prunable: pre-existing,
untouched, and already on the open-items list.
