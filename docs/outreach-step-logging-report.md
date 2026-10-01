# A Chase 1 send was logged as a second first contact

**1 October 2026 · diagnosis, fix, fixtures — not deployed**

🔴 **The cause is a regression I introduced earlier today**, in the commit the recorded-steps work went out
in (`6447120`). I am naming that first because it changes how urgent the rest is: this was not a
long-standing subtlety, it was live for a few hours and it affected **every non-test send** in that window.

---

## 0 · The one-line cause

`app/api/admin/outreach/mail-send/route.ts:634` selected a column that **does not exist**:

```ts
.select('id, contacted_at, created_at, direction, kind, channel, message, email_message_id')
```

`outreach_contacts` has eight columns — `id, prospect_id, contacted_at, channel, direction, kind, message,
created_at` (`supabase/migrations/20260903_outreach_tracking.sql:54-63`). **There is no
`email_message_id`.** It is *derived*: the link lives on `outreach_messages.contact_id`, and
`app/api/admin/outreach/timeline/route.ts:84-85` inverts that map to produce it.

And the failure was silent **twice over**:

1. PostgREST answers an unknown column with error **42703** and `data: null`;
2. the line destructured `const { data: cRows } = await …` and **discarded `error`**, so `contacts`
   became `[]`.

🔴 **An empty ladder is not an error to `nextStep` — it is a prospect who has never been contacted.**

---

## 1 · Why the server derived `1_first_contact`

🔎 The chain, with the line each link is on:

| | |
|---|---|
| `mail-send/route.ts:632-637` | reads `outreach_contacts` → **error discarded**, `contacts = []` |
| `mail-send/route.ts:647` | `nextStep(…, contacts, new Date())` — **contacts only**; messages are read separately for `priors`, never for the ladder |
| `outreach-step.ts:296-304` | `highestIdx = -1` → `{ state: 'due', kind: CONTACT_KINDS[0] }` → **`1_first_contact`** |
| `mail-send/route.ts:772` | `if (step.kind && …) derivedKind = step.kind` |
| `outreach-sequence.ts:362-370` | `loggedKindFor` → not a reply → returns `stepKind` = `1_first_contact` |
| `mail-send/route.ts:992-995` | `logOutreachContact(… kind …)` writes the second `1_first_contact` |

**Answering the three things the brief asked me to check specifically:**

- **What the server reads to build the ladder:** `contacts` **only**. `nextStep` takes contact rows; the
  `messages` read feeds `priors` and `recordedStepsFor`, not the rung derivation. So a contacts read that
  fails takes the ladder with it and nothing else notices.
- **Is a contact row with no linked message ignored?** 🔴 **No — and that is correct behaviour.**
  `nextStep` never looks at messages, so a hand-logged rung counts whether or not an
  `outreach_messages` row exists. 🧪 Proved on fixtures: the 16 Sep row alone yields `rungsDone: 1` and
  `kind: '2_chase_1'`. **The row was not ignored for being unlinked; it was never fetched.**
- **A date or timezone filter that could miss a midnight-UTC row:** 🔴 **There is none.** The query has
  only `.eq('prospect_id', …)`. `nextStep` slices `contacted_at` to 10 characters for the due-date maths,
  which is timezone-agnostic for a date-only value and correct for `2026-09-16T00:00:00+00`. 🧪 Asserted
  both ways in the harness, with the full timestamp form as its own case.

---

## 2 · Why `guardAlreadySent` did not refuse

**The guard is not at fault — it was starved.** `priors` is built at `:645-664` from the same empty
`contacts` array, so there was no `1_first_contact` prior to compare against and
`outreach-sequence.ts:201-203` found `same.length === 0`.

🧪 On the real rows it refuses correctly: `guardAlreadySent({ step: '1_first_contact', priors })` →
`kind: 'refuse'`, *"First contact has already gone to this prospect — 16 Sept 2026…"*. The harness asserts
that **and** the starved case, so the distinction is pinned.

### Did the send carry an override? The query, not run

```sql
-- READ-ONLY. The guards recorded against the message linked to the 1 Oct 13:06 contact.
select m.id             as message_id,
       m.contact_id,
       m.message_date,
       m.status,
       m.is_test,
       m.guard_override
from   public.outreach_messages m
join   public.outreach_contacts c on c.id = m.contact_id
where  c.prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763'
  and  c.contacted_at >= '2026-10-01T13:06:00+00'
  and  c.contacted_at <  '2026-10-01T13:07:00+00';
```

⚠️ **`guard_override` may not exist yet** — its migration is the unapplied one from
`docs/outreach-recorded-steps-report.md` §4. If that errors with 42703, the column is simply not there and
the answer is "nothing was recorded either way":

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_messages' and column_name = 'guard_override';
```

🔴 **My prediction, stated before you run it: it will be NULL or the column will be absent, and no
override was involved.** The guard never fired, so there was nothing to wave through — the browser was
never shown a refusal. If it comes back non-null, my diagnosis is incomplete and I want to know.

---

## 3 · Why the client said "Chase 1" while the server logged first contact

**There are two derivations, and they disagreed because one of them silently got no data.**

| Where | Reads | Saw the 16 Sep rung? | Answer |
|---|---|---|---|
| **client** — `ProspectWorkspace.tsx:~300` `nextStep(...)` over rows from `/api/admin/outreach` and the timeline route | contacts fetched by routes that select **real columns only** | ✅ yes | **Chase 1** |
| **server** — `mail-send/route.ts:647` `nextStep(...)` | contacts from the **broken select** → `[]` | ❌ no | **First contact** |

🔴 **It is the same function in both places — `nextStep` — so this is not two rules.** It is one rule
reading two different datasets, one of which was empty. The server is deliberately authoritative
(`:772` re-derives and overrules the client), so the client's correct answer was discarded in favour of
the server's answer computed from nothing. **The architecture was right and the data was missing**, which
is the worst combination: the override that exists to stop a lying client made the wrong answer win.

The right panel's *"Recorded as Chase 1 — the rung this prospect is on"* came from the client's view too,
which is why the page contradicted the row it had just written.

---

## 4 · Why the banner said "due today · was due 8 Oct" about a future date

**Independent of everything above.** `lib/outreach-workspace.ts:160-174` has a deliberate branch **(3b)**:
a `next_action_at` still in the future returns `kind: 'follow_up'` with `daysOverdue: 0` — correctly, and
with a correct label of its own (*"Follow up — Wed 8 Oct"*).

🔴 **But the banner does not use that label.** It rebuilds the sentence:

- `ProspectWorkspace.tsx:1001-1005` — `daysOverdue > 0 ? '… overdue' : 'Follow up — due today'`
- `ProspectWorkspace.tsx:1018` — `` `was due ${shortDate(n.due)}` `` **unconditionally**

**`daysOverdue: 0` was carrying two meanings** — "due today" and "not due yet" — and branch (3b) is the
one that makes them different. An overloaded zero is not a state.

**Fixed** by giving the variant a `dueNow: boolean`: branch (3) sets `true`, branch (3b) `false`. The
scheduled case now returns `n.label` (already correct) and the detail reads *"scheduled for 8 Oct"*.

---

## 5 · The fixes

| | |
|---|---|
| **The phantom column** | removed from the select |
| 🔴 **The read's error is checked** | a failed contacts read **refuses the send**; so does a failed messages read, since `priors` depends on it. *An unreadable ladder must never decide a step — the empty answer always picks the lowest rung* |
| **`email_message_id` is derived** | from `messages.contact_id`, exactly as the timeline route does, so `pairHandLoggedEmails` has the field it needs |
| **One rule, one dataset** | both sides run `nextStep`; the server now reads the rows it was always meant to |
| **The follow-up** | `applyFollowUp` derives the date from **the kind just logged** via `followUpDateFor` — the same function `nextStep` uses for `dueOn`. A Chase 1 send schedules **+7**. ⚠️ A chip the operator has actually touched still wins (`followUp` is null until touched) |
| **The banner** | `dueNow` as above |
| **Grid headers** | `3 days after first contact` · `7 days after chase 1` · `14 days after chase 2`, still derived from `FOLLOW_UP_DAYS` with no second table |

> ⚠️ **AN INCONSISTENCY IN THE BRIEF'S OBSERVATIONS, flagged rather than resolved by guesswork.** It says
> *"the follow-up was set +3 days (the after-first-contact interval)"* and also *"next_action_at is
> 2026-10-08"*. **Those disagree**: 1 Oct + 3 = 4 Oct, while 8 Oct is +7. My reading is that the BUTTON
> suggested 4 Oct (+3, which is what `defaultFollowUpChoice` produces from the step the page thought was
> next) and the stored value ended up 8 Oct. I did not need to resolve it: the instruction — *"the
> follow-up is FOLLOW_UP_DAYS for the step just sent"* — is unambiguous, and the fix derives the date from
> the logged kind rather than from any suggestion, which is right under either reading. **Worth a glance at
> the row if the distinction matters to you.**

### The repair SQL — written, not run

🔴 **I could not quote the id.** The standing rules say run no SQL and I have no database access here, so
*"look it up read-only and quote the id"* was not something I could do. Both forms are below: the lookup,
and a self-contained repair that **refuses unless exactly one row matches**.

```sql
-- ── 1 · READ-ONLY. The two rows, so the id can be read off. ──────────────────────────────────────
select id, contacted_at, kind, channel, direction, left(coalesce(message,''), 40) as message_head
from   public.outreach_contacts
where  prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763'
order  by contacted_at;
```

```sql
-- ── 2 · THE REPAIR. Matched by id, one row, inside a transaction. DO NOT RUN UNTIL YOU HAVE READ 1.
-- Replace :target_id with the id of the 2026-10-01 13:06 row from the select above.
begin;

-- before
select id, contacted_at, kind from public.outreach_contacts
where  prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763' order by contacted_at;

-- 🔴 EVERY PREDICATE IS A SAFETY RAIL, NOT A FILTER: the id pins the row, and prospect_id / kind /
-- the one-minute window mean a wrong id cannot match anything.
update public.outreach_contacts
   set kind = '2_chase_1'
 where id = :target_id
   and prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763'
   and kind = '1_first_contact'
   and contacted_at >= '2026-10-01T13:06:00+00'
   and contacted_at <  '2026-10-01T13:07:00+00';

-- after
select id, contacted_at, kind from public.outreach_contacts
where  prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763' order by contacted_at;

-- Expect exactly ONE row changed and the 16 Sep row untouched. If not: rollback;
commit;
```

```sql
-- ── 2b · THE SAME REPAIR WITHOUT NEEDING THE ID BY HAND. It RAISES unless exactly one row matches,
-- so it cannot touch a second row even if the data is not what we think.
begin;

select id, contacted_at, kind from public.outreach_contacts
where  prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763' order by contacted_at;

do $$
declare n int;
begin
  with target as (
    select id from public.outreach_contacts
    where prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763'
      and kind = '1_first_contact'
      and contacted_at >= '2026-10-01T13:06:00+00'
      and contacted_at <  '2026-10-01T13:07:00+00'
  )
  update public.outreach_contacts c
     set kind = '2_chase_1'
    from target t
   where c.id = t.id;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'expected exactly 1 row, matched %', n;
  end if;
end $$;

select id, contacted_at, kind from public.outreach_contacts
where  prospect_id = '1076c481-3941-4e32-9d64-0153d70c6763' order by contacted_at;

commit;
```

### Were other prospects hit the same way? The query, not run

```sql
-- READ-ONLY. Any prospect with more than one OUTBOUND row at the same rung — the shape this bug makes.
-- 🔴 Narrow it to the window the regression was live in by uncommenting the date clause.
select c.prospect_id,
       p.id,
       c.kind,
       count(*)              as rows_at_this_rung,
       min(c.contacted_at)   as first_logged,
       max(c.contacted_at)   as last_logged
from   public.outreach_contacts c
join   public.outreach_prospects p on p.id = c.prospect_id
where  c.direction <> 'inbound'
  and  c.kind in ('1_first_contact','2_chase_1','3_chase_2','4_final_chase')
  -- and c.contacted_at >= '2026-10-01T00:00:00+00'
group  by c.prospect_id, p.id, c.kind
having count(*) > 1
order  by max(c.contacted_at) desc;
```

**No repairs are written for anything this returns**, as instructed.

---

## 6 · The harness

**`scripts/outreach-step-logging.cjs`, registered in `scripts/harnesses.json`** (76 → 77) — **27 checks,
5 broken variants, all caught.** Fixtures only: no live prospect, no send, no database.

The fixture is the live shape — a hand-logged `1_first_contact` dated `2026-09-16` with **no linked
message row**, on a frozen `hu_map` prospect.

| Variant | What it breaks |
|---|---|
| **W1** | the phantom column comes back on the contacts select |
| **W2** | the contacts read stops checking its error — an empty ladder decides the step |
| **W3** | the messages read stops checking its error |
| **W4** | the follow-up goes back to the control's value whatever was sent |
| **W5** | the banner calls a future follow-up "due today" again |

🔴 **One check deliberately asserts the BUG reproduces** — `nextStep(prospect, [], today)` returns
`1_first_contact` — because the fix is "never hand it an empty list", and a test that cannot show the
empty list causing the wrong rung is not testing the fix.

> ⚠️ **THREE OF MY OWN CHECKS WERE TOO BLUNT AND FAILED ON CORRECT CODE.** Worth recording because the
> pattern is now familiar: the `EMAIL_FRAME_SANDBOX` check first looked in the component that *uses* the
> constant rather than the module that *defines* it; then, pointed at the right file, it banned the string
> `allow-scripts` outright — and `lib/outreach-workspace.ts` legitimately **lists** that token in
> `FORBIDDEN_SANDBOX_TOKENS`, the guard that enforces the rule. Banning the characters would have required
> deleting the guard. It pins the constant's value and the token's presence in the ban list now.

### Three stale checks, restated in place — and the sweep is what found two of them

🔴 **Two of these were invisible to every harness I thought to run, and only the full suite caught them.**
That is the second time today; the lesson from the scraper task holds.

| The check | Why it went stale | What it says now |
|---|---|---|
| `outreach-workspace-v2.cjs` · *"the chosen date is written ONLY by `applyFollowUp`, from the one control"*, pinning `const date = dateOverride === undefined ? followUpDate : dateOverride` | 🔴 **That expression WAS the +3 bug.** `followUpDate` is seeded from the step the page thought was next, so a Chase 1 send wrote the after-first-contact interval | pins all three branches — an override wins, then a touched control, then the step just logged via `followUpDateFor` — so "one writer" is still asserted and the new rule with it |
| `outreach-recorded-steps.cjs` · **W6**, patching the select that named `email_message_id` | 🔴 **The anchor itself was the bug.** The variant existed to prove the server reads what the pairing needs; it did so by mutating a select that could never succeed | breaks the **derivation** instead (`contactsForPairing` → `contacts`), which is the same failure one level down: the pairing loses the link |
| `outreach-recorded-steps.cjs` · *"the GUARDS read the same function, over the same pairing"* | pinned `pairHandLoggedEmails({ messages, contacts })` | pins `{ messages, contacts: contactsForPairing }` — same function, same one rule, the corrected argument |

### One stale check, restated in place

| The check | Why it went stale | What it says now |
|---|---|---|
| `outreach-templates-layout.cjs` · *"each later step shows the interval that LEADS to it"*, pinning `'+3 days'` / `'+7 days'` / `'+14 days'` | the labels now name the step the gap runs from — operator decision. 🔴 **The property is unchanged** and still asserted: the gap is the previous step's interval, from `FOLLOW_UP_DAYS` | pins `3 days after first contact` etc., **plus** a case proving it still follows `FOLLOW_UP_DAYS` rather than a written-out cadence |

---

## 7 · Verification

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **compiled successfully** |
| `node scripts/outreach-step-logging.cjs` | **27 passed**, 5 variants caught |
| `node scripts/outreach-templates-layout.cjs` | **127 passed** (was failing on the stale label check) |
| `node scripts/outreach-recorded-steps.cjs` | **40 passed** (was failing on two drifted anchors) |
| `node scripts/outreach-workspace-v2.cjs` | **all passed** (was failing on the stale follow-up check) |
| `node scripts/run-harnesses.cjs` | **77 run · 77 passed · 0 failed**, on an idle machine |

> ⚠️ **THE FIRST FULL SWEEP CAME BACK `77 run · 72 passed · 5 failed`, AND THE SPLIT IS WORTH RECORDING.**
> **Two were genuinely mine** — the stale checks in §6 above — and are fixed. **Three were contention,
> not regressions:** `add-order-refresh-inputs`, `add-order-refresh` and `batch-reservation-edit-lock`,
> none of which references a single file I touched. 🧪 They ran **1368s, 691s and 442s** in that sweep,
> with one failure reading *"409 … after 435468 ms"* — a 435-second request. I had a `next build`,
> Chromium and WebKit running against the same machine at the time, and these three measure real timing
> and real lock contention.
> 🔴 **I did not assume that. Each was re-run ALONE and each passed with a green verdict**, in
> **1.2s, 0.8s and 2.2s** of CPU respectively:
> *"the edit lock is taken only when ON, before any write, exactly once, always released"* ·
> *"the time list refreshes from the same read the popup uses"* ·
> *"every capacity input AND every status change invalidates the Add Order snapshot"*.
> ⚠️ **So the tally in the chat reply is from a sweep run on an idle machine** — a number taken while
> browsers and a build competed for the box is not a measurement of this code.
| `--dry-run` screen | all 77 pass |
| eslint, the four changed source files | **0 problems** |

### Layout — the grid headers are longer, so they were measured

**Chromium and WebKit, 375px and 1440px:**

| | 1440px | 375px |
|---|---|---|
| `day 0` | 1 line, 240px | 1 line |
| `3 days after first contact` | **1 line**, 240px | 2 lines, 76px |
| `7 days after chase 1` | **1 line**, 240px | 2 lines, 75px |
| `14 days after chase 2` | **1 line**, 240px | 2 lines, 73px |
| page scrolls sideways | **no** (375/375 and 1440/1440) | **no** |

⚠️ At 375px the labels wrap to two lines **inside the grid's own `overflow-x-auto` box**, which is how that
grid has always behaved on a phone — the page itself never scrolls sideways. Identical in both engines.

### Kept unchanged

One send path · one contact writer (`logOutreachContact`, 2 call sites, both existing) · one follow-up
writer (`applyFollowUp`, one `useCallback`) · one `nextStep` per page · every sequence guard, in
`evaluateGuards` · `EMAIL_FRAME_SANDBOX = 'allow-same-origin'` with `allow-scripts` still in
`FORBIDDEN_SANDBOX_TOKENS` · no `outreach_templates` row created, edited, seeded or deactivated ·
`do_not_contact` never set automatically. **All pinned by the harness.**

**Nothing was written and nothing was sent.** No SQL was run.

---

## 8 · What to test in the UI — ZZ Test Prospect only

🔴 **"Send test to me" only.** `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`.

1. **The grid headers.** Sequence view: the four columns read *day 0*, *3 days after first contact*,
   *7 days after chase 1*, *14 days after chase 2*.
2. **A future follow-up is not overdue.** Set ZZ's follow-up date to a week out with the chips. The NEXT
   banner reads **"Follow up — \<that date\>"** and *"scheduled for …"* — **never "due today"** and never
   "was due".
3. **The step and its follow-up.** With a first contact already logged against ZZ, the composer offers
   **Chase 1**; the suffix beside Send reads **follow up \<today + 7\>**, not +3.
4. **The refusal.** With a first contact logged, use the step picker to try a **first contact** again — it
   is refused with *"First contact has already gone to this prospect"*, not sent.

⚠️ **Not deployed. It is ready.**
