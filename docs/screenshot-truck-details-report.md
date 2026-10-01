# Screenshots tab — truck details, the Facebook link, and a persistent log

**Status: built, green, NOT deployed.** `tsc` clean · `next build` exit 0 · the new harness 164 assertions
plus 32 browser measurements · the full sweep 79 run · 79 passed · 0 failed. **Two migrations are waiting for you to run** — both
are in the chat reply as fenced SQL, neither was run, and the page works without them.

No email was sent. No SQL was run. No Gemini call was made. No live trading truck was touched. No
`outreach_templates` row was created, edited, seeded or deactivated. `do_not_contact` is never set.

---

## 1 · Your four decisions, as built

| # | Decision | Where it lives |
| --- | --- | --- |
| 1 | No-match → create **hidden** | `hiddenTruckInsert`, `createHiddenTruckWithProspect` |
| 2 | Definite match → fill **every** field it read, empty only | `planFill` |
| 3 | Two new columns, `facebook_url` / `instagram_url` | migration 1, below |
| 4 | **No logo.** No crop, no store | logo extraction does not exist in this build |

### 1a · The confirmations item 1 asked for, with file:line

**A hidden row appears in your outreach list.** ✅ The prospects query carries **no filter at all** —
`app/api/admin/outreach/route.ts:197-199` is `.from('outreach_prospects').select(...)` and nothing more. So
visibility flags cannot hide a prospect from you.

**It does not appear in the anonymous payload on any host.** ✅ `app/api/discovery/events/route.ts:76-77`
picks the column by host — `const showCol = isHG ? 'show_on_hg' : 'show_on_vf'` — and `:356-359` requires
`!t.excluded && t[showCol] === true`. **Both** booleans are therefore set false; setting only `show_on_vf`
would hide the truck on Village Foodie and publish it on HatchGrab. The harness asserts the insert fails
that filter on both hosts and holds a broken variant (V4) that omits `show_on_hg`.

**🔴 The scraper does NOT skip a hidden row.** The site-list query selects
`id, name, schedule_url, website, ai_instructions, scraper_strategy, created_at` with **no visibility
filter whatsoever** (`scripts/run-scraper.js:912-914`), and `:939` makes a bare `website` sufficient:

```js
const url = (String(r.schedule_url ?? '').trim() || String(r.website ?? '').trim()) || 'about:blank';
```

**So, as your brief instructed, a row created here carries no `website` and no `schedule_url`.** The
website goes to `outreach_prospects.notes` as `Website from screenshot: …` and the row summary says
`website kept as a note, not on the truck (it would be scraped)`.

**`excluded` versus the show flags — which, and why.** You asked me to report this. The outreach list
**does** show `excluded` trucks (same no-filter query above), so `excluded = true` *would* have worked.
I did not use it: it already means "this scraped row is the shadow of a truck that became a customer"
(`lib/self-serve-discovery-link.ts:73`), and `isOnVillageFoodieMap` treats it as the master hide
(`lib/outreach-step.ts`). Reusing it would make the column ambiguous for every later reader. The insert
touches `excluded` not at all.

**Stage and lead type.** `stage: 'not_contacted'` written explicitly (not left to the column default), and
nothing writes `lead_type_at_first_contact`, `platform` or `do_not_contact`. Pinned by the harness.

### 1b · One writer, two tables, nothing left behind

`createHiddenTruckWithProspect` (`lib/admin/truck-details-write.ts`) does both inserts. Truck first,
because `outreach_prospects.discovery_truck_id` is `not null unique`
(`20260903_outreach_tracking.sql:39`) — the order cannot be swapped. If the prospect insert fails, the
truck row is deleted and the error says *"nothing was left behind"*; if that delete also fails, the error
names the row — `Delete discovery_trucks id <uuid> by hand`. All four paths are tested with a fake client.

⚠️ **There is no transaction and the report does not pretend otherwise.** PostgREST gives one statement
per request; a real transaction needs an RPC, which is another migration and a second home for this logic.
Delete-on-failure is the honest alternative, and its one weak spot is the line above.

---

## 2 · Fill-empty-only, and what filling actually means

`planFill` writes `contact_email`, `mobile`, `phone`, `website`, `facebook_url`, `instagram_url`. **Never
`name`.** A saved value is never overwritten; a differing saved value is reported in the row summary
(`Facebook link differs from saved — kept saved`, or `email kept (already had one)`).

⚠️ **"Empty" means blank-or-null, not falsy.** A whitespace-only cell is as empty to a human as a NULL;
treating `'  '` as filled would refuse to write the real address forever.

🔴 **As you accepted: filling an empty `website` enrols that truck in the nightly scrape.** `website` is
the scraper's own URL source (`run-scraper.js:939`), so the moment a matched truck gains one it becomes a
site on the next run. It is also published — `websiteUrl` in the anonymous payload. Recorded here because
it is the one accepted consequence in this change.

Also public, once filled: `phone` (`phoneNumber`). Private: `contact_email`, `mobile`, and the two new
social columns. The area note goes to `outreach_prospects.notes`, which is service-role only.

### 🔴 The mockup's own "Needs a look" example does not behave as drawn

`normalizeVenue` (`lib/venue-signature.ts:8-17`) strips the filler words `the` **and** `co`. So:

```
"The Wrap Van"  → "wrapvan"
"Wrap Van Co"   → "wrapvan"      ← identical
```

They are an **exact normalised-name match**, which your rules make a *definite* match — not "Needs a
look". The harness asserts that, and the fuzzy case is tested with a pair that really is one edit apart
and not equal (`Pizza Mando` against a saved `Pizza Mondo`). If you want "The Wrap Van" to stop at Needs a
look, the filler-word list has to change, and that list is a byte-for-byte mirror of the scraper's — I
have not touched it.

---

## 3 · The Facebook and Instagram link

Canonical forms: `https://www.facebook.com/<vanity>`, `https://www.facebook.com/profile.php?id=<digits>`,
`https://www.instagram.com/<handle>`. Host lower-cased; `m.`/`web.`/`mobile.`/locale prefixes dropped;
trailing slashes and every query parameter dropped except `id` on `profile.php`; `/about`, `/photos`,
`/posts`, `/videos`, `/reviews` and friends dropped; anything not `facebook.com`/`fb.com` (or
`instagram.com`/`instagr.am`) rejected. **A bare `facebook.com` records no URL** — never a guess. Facebook's
own furniture (`/groups/…`, `/pages/…`, `/permalink.php`) is not a vanity and is rejected.

⚠️ **The vanity's CASE is preserved.** The addendum says to lower-case the *host* and lists exactly what
else to drop; it does not say to rewrite the page name. Matching compares canonical forms
case-insensitively (`sameFacebookPage`), so a saved `3BrosBurgers` and a read `3brosburgers` are still the
same page. Instagram handles *are* lower-cased, because you specified that.

🔴 **A vanity URL and a numeric-id URL are not a definite match** on their own — they fall through to the
next key, exactly as item 3 requires.

⚠️ **Instagram is not a match key.** Your five keys are Facebook, website, phone, email, exact name;
Instagram is extracted and filled, never used to assert identity.

🔴 **A social address is never written to `website`.** `bareDomain` refuses facebook/instagram hosts via
the existing `isScraperBlockedDomain` (`lib/url-normalise.ts:99-118`). Without that, a Facebook page read
as "the website" would land in the scraper's URL column.

**The missing-migration behaviour.** Before you run migration 1 the details path writes **nothing at all**
and reports `run the facebook/instagram migration first`; the schedule path is unaffected. ⚠️ It refuses
rather than filling email now and the link "later" — there is no later, the screenshot is gone.
⚠️ The social columns are only *selected* when they exist: asking PostgREST for an unknown column fails the
**whole** query (42703), which would empty the candidate list and turn every screenshot into a new truck —
the exact shape of the bug this repo fixed on the send path last week.

---

## 4 · The persistent log, the running line, and the two kinds of failure

**The log.** One `screenshot_log` row per processed file: time, file name and size, kind, outcome,
summary, prospect/truck id, events written, error, and `alerted_at`. **No image.** ⚠️ Said plainly: the
*summary* names an email and a phone number, because it is the line you read on screen — that is the one
place contact data lands in the table, and the table is service-role only.

The list reads from it: **Today**, then **Earlier** (7 days), newest first, filter chips counting from the
same rows. "Today" is your **local** day, not UTC — a UTC boundary would move half a BST evening into
Earlier. Rows still in flight come from the session, because nothing has happened to them yet.

⚠️ **"Needs a look" is actionable only in the session that produced it.** The extracted details were never
stored (your decision 4), so after a reload the row is history and the screenshot has to be dropped again
— which you said was fine. The row still shows; the two buttons do not.

**🔴 90-day retention: there is no suitable existing cron, so I am saying so rather than inventing one.**
`demo-cleanup` is a demo expiry/orphan sweep, not a generic retention job
(`app/api/cron/demo-cleanup/route.ts:1-22`), and none of the other seven crons in `vercel.json:59-96` is
either. Nothing deletes old rows today. The one-line statement to run (or to put in a cron) is in the chat
reply.

**The running line.** `Processing 3 of 12 · 9 waiting` and `Last processed 22:51`, both built in
`lib/admin/screenshot-log.ts` so the wording has one owner and the harness pins it. The page says in one
line that reading happens in this browser tab and closing it stops the queue, and `beforeunload` asks
before you leave with files still waiting.

**Simple versus complete.** `classifyFailure` splits on the kind of error:

| | |
| --- | --- |
| **simple** (no alert) | an unreadable image, a safety filter, no details found, nothing new, needs a look, one 5xx/503 after its retries |
| **complete** (banner + pause + one email) | Gemini auth or quota (401/403/429, "API key", quota, `RESOURCE_EXHAUSTED`), a database write failure, a missing migration, or **three consecutive non-content failures** |

⚠️ The retry loop keeps the HTTP status in its message on purpose: that is how a 429 (quota, an outage) is
told from a 503 (transport, one bad file). ⚠️ The consecutive counter is reset to zero on every success —
three in a row is an outage, three in a day is not.

On a complete failure: a red banner says what is wrong in plain words with a **Retry** button, the queue
**pauses** with the remaining files still `queued`, and one email goes to **dominic@hatchgrab.com**,
subject `HatchGrab screenshots: processing stopped`, body = the reason, the time and how many files are
waiting. Via `sendConfirmationEmail` with `senderName: 'HatchGrab'` — the transactional path, never the
outreach mailbox, never anyone else.

### The alert-once pattern I reused — and which one it is

You asked me to report it. The repo has exactly one: **`decideAdminAlert` in
`lib/custom-domain/check.ts:157`**. Its shape is what I copied, and the important part is what it does
*not* do — it keeps **no "alerted" flag**. It derives the transition from two timestamps
(`last_ok_at` vs `last_checked_at`), because a flag is state that can be left set after a deploy, a retry
or a hand fix. So `alertIsDue` reads the log's own rows:

- never alerted → **due**
- alerted, and a success came after it → **due** (a new outage)
- alerted, no success since → **not due** (same outage, still broken)
- ⚠️ never succeeded and already alerted → **not due**, or a fresh install would alert on every file for
  ever. Same reasoning as that function's "no previous check ⇒ not crossed before" branch, reversed.

🔴 **Without the log table, no email is sent — banner only.** The latch *is* the log, so with no table the
alternative would be one email per file, which is the failure you named and which broken variant V5
catches. The banner still appears and the first thing it says is to run the migration.

---

## 5 · Verification

### `node scripts/screenshot-truck-details.cjs` — **164 passed**

Fixtures only: no network, no database, no Gemini call, no email, no live truck.

- **Classification and the gate** — a details screenshot never runs the schedule path; an unreadable or
  unknown class is `neither` (the class that does nothing, never the one that writes); the gate is an
  allow-list in the source, asserted as source text.
- **The 3Bros example** — classified `truck_details`, **not** schedule; matched on **website**; fills
  **email and mobile** (and the Facebook link when the address bar shows it); does **not** refill the
  website it matched on; writes **no logo**; notes the area once; summary reads as the mockup does.
  Tested **with and without** the address bar — without it, `facebook_url` is null, never a guess.
- **The addendum, case by case** — tracking parameters dropped, `m.facebook.com` normalised, `/about` and
  `/photos` tails dropped, every parameter but `id` dropped from `profile.php`, non-Facebook rejected,
  bare `facebook.com` → no URL, vanity-vs-numeric not definite, `@handle` accepted, `/p/` post rejected.
- **Matching** — each of the five keys definite on its own; similar-name-only → Needs a look; two
  prospects matching → Needs a look with both candidates offered.
- **Fill-empty** — four saved values each refused and reported; whitespace counts as empty; an identical
  value is not a conflict.
- **Hidden creation** — invisible on both hosts, no `website`/`schedule_url`, therefore not a scraper
  site; `excluded` untouched; website and area land in the prospect notes.
- **The writer** — insert order, rollback on a failed prospect insert, the named-row message when the
  rollback itself fails, no prospect attempted after a failed truck insert, a failed truck update fails
  the file, an empty plan writes nothing at all.
- **Notes** — appended, never rewritten, and the same note twice adds nothing.
- **The log, failures, the alert, the running line** — as described in §4.
- **Unchanged elsewhere** — `lib/admin/screenshot-events.ts`, `app/api/inbound-schedule/route.ts`,
  `lib/schedule-extract.ts`, `lib/outreach-contact-log.ts` and `lib/outreach-events.ts` asserted
  **byte-identical to HEAD** with `git diff --quiet`; the schedule POST body pinned as source text; no
  `outreach_templates` and no `do_not_contact` anywhere in the route; `EMAIL_FRAME_SANDBOX` still
  `'allow-same-origin'`.

**Byte-identical schedule payload** is therefore proven the strongest way available: the module that
builds it was not edited at all, and the route's body expression is pinned character for character.

### Broken variants — six, each must be caught

| | Variant | Caught by |
| --- | --- | --- |
| V1 | the gate written as a deny-list (`!== 'truck_details'`) | `shouldRunSchedule` is an allow-list |
| V2 | a planner that fills regardless of what is saved | `planFill` refuses four saved values |
| V3 | a fuzzy name auto-applied — built from the repo's **own** matcher, not a straw man | `matchProspect` returns needs-a-look |
| V4 | a hidden insert that forgets `show_on_hg` | published on HatchGrab |
| V4b | the website written onto the new row | it becomes a scraper site |
| V5 | an alert with no latch | fires twice in one outage |
| V6 | the Facebook URL stored as read | keeps `m.` and `?mibextid` |

### `HG_RENDER=1` — 32 measurements, two engines, two widths

Chromium and WebKit, at **1728×1000 (16" MBP)** and **2560×1400 (27" monitor)**, against this build's
compiled stylesheet, with the class names **lifted from `ScreenshotsPanel.tsx`** so a rename fails here.
The fixture uses the longest summary the code can actually emit (~260 characters: every field filled plus
a kept conflict).

**🔴 This caught a real layout fault.** That worst-case summary wrapped the row to **125px — three lines —
in both engines at both widths.** Your brief asks for a one-line summary, so the summary column now
carries `truncate` with a `title` holding the full text, and the panel uses the admin shell's own
`max-w-6xl` instead of narrowing to `max-w-4xl`. Re-measured:

```
card 1104px · summary column up to 725px · rows 7 · heights 69/69/69/69/69/69/68
```

one line per row, no sideways scroll, name column exactly 176px, chip fully drawn, summary clear of the
time column, and the seven filter chips on one row — in **both** engines at **both** widths.

⚠️ **It is not the page, and the harness says so.** There is no admin session obtainable here (V12.6:
you are the sole admin), so what is measured is the list's own markup and classes, not the live tab.

---

## 6 · What you need to do by hand

The tab has never been used live, so these are the steps I cannot run.

**Before anything: run both migrations** (chat reply). Until migration 1 is run the details path refuses
and says so; until migration 2 is run there is no history and no outage email, only the banner.

1. **A schedule screenshot** (the behaviour that already worked). Drop one. Expect chip **Schedule** and
   `N events added`, and the events where they always went. **This is the regression check that matters
   most** — if it changed, stop and tell me.
2. **The 3Bros screenshot**, with Safari's address bar showing `facebook.com/…`. Expect chip **Updated**
   and `Added email 3brosfood@gmail.com, mobile 07400 049108, Facebook link … · area noted · matched on
   website`. Then open the prospect: email and mobile filled, the Facebook link set, **the website
   unchanged**, and a note `From screenshot: Brighton and Hove`.
3. **The same screenshot again.** Expect **Nothing new** and no second area note.
4. **A Facebook page screenshot with post timestamps** ("20 September at 18:18"). Expect **no events at
   all** — confirm by checking that no discovery event appeared for that day — and no email to anyone.
5. **A screenshot of a truck not in outreach.** Expect **New truck**. Then confirm on
   `villagefoodie` **and** `hatchgrab` hosts that it is **not** in the public trucks list, and that
   `discovery_trucks.website` for it is **null** with the website in the prospect's notes instead.
6. **A near-miss name** → **Needs a look** with *Same truck* and *Add as new*. Press *Same truck* and
   check the fields filled; drop another and press *Add as new*.
7. **Queue behaviour** — drop six at once: `Processing 1 of 6 · 5 waiting` counts down, then try to close
   the tab mid-queue and confirm the browser asks.
8. **The outage path** — the honest way to see it without breaking anything is to rename `GEMINI_API_KEY`
   in your environment for one drop: expect the red banner, the queue paused, **one** email, and that a
   second drop while still broken sends **no** second email. Restore the key, drop a good file, and the
   next outage may alert again.

⚠️ **Test writes only against ZZ Test Prospect (Dominic)** — `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46` — or
fixtures, as you instructed. Steps 2, 3 and 6 write to whatever prospect they match, so point them at a
screenshot naming the test prospect, or expect to undo the fill by hand.

---

## 7 · Judgement calls and open points, flagged not chosen

1. **The mockup's `logo` in the 3Bros row** is superseded by your decision 4 — no logo anywhere. Done as
   instructed; noted because the mockup still shows it.
2. **"The Wrap Van" / "Wrap Van Co"** is a definite name match, not Needs a look. §2. Nothing to fix
   unless you want the filler-word list changed, which mirrors the scraper's.
3. **A `both` screenshot gets one row**, and its outcome is the details outcome when that wrote something,
   otherwise `Schedule`; the summary names both halves. The brief does not say which chip a `both` row
   should carry — my choice, easily changed.
4. **`neither` is logged as `Nothing new`** with `Not a schedule or a contact-details screenshot — nothing
   to do`, because your outcome list has no sixth chip for it.
5. **The row name links to `/admin/outreach/p/<id>`** (`prospectPath`, `lib/outreach-queue.ts:104`) — a
   real per-prospect page, so the mockup's "linking to the prospect" is met properly. A log row with no
   prospect shows the file name, unlinked.
6. **No CHECK constraint on `screenshot_log.outcome`**, following the reasoning recorded for
   `outreach_prospects.stage` (`20260903_outreach_tracking.sql:32-36`): PostgREST exposes no CHECK
   metadata, so the valid set lives in one exported constant both route and panel import. `outreach_events`
   chose a CHECK; either is defensible and I picked the stage precedent.
7. **The "what was filled" history line goes to `outreach_events`** via `addNote`, the single writer
   (`lib/outreach-events.ts`), **never** to `outreach_contacts`. 🔴 A contact row is a rung on the ladder
   and `nextStep` derives from it — writing one here would corrupt the sequence, which is the failure that
   module's header records twice.

---

## 8 · eslint, stated plainly

The repo is **not** eslint-clean, so "green" needs a number. My two changed files carried **2** errors
before this work (one `catch (err: any)` each) and now carry **1**:

```
components/admin/ScreenshotsPanel.tsx
  124:26  error  Calling setState synchronously within an effect  react-hooks/set-state-in-effect
```

That is the mount-time fetch, `useEffect(() => { void loadLog() }, [loadLog])` — the repo's own idiom for
exactly this, identical to `components/admin/OutreachPanel.tsx:520`, which carries the same error today
(along with two more of it and two `any`s). Every `any` I had added is gone: the PostgREST embed is typed
(`Embedded`), the untrusted decision body is a `Partial<Record<keyof TruckDetails, string>>`, and both
catch blocks narrow with `instanceof Error`. `tsc --noEmit` is clean and `next build` exits 0.

---

## 9 · Kept unchanged

The schedule extraction and `/api/inbound-schedule` behaviour (both byte-identical to HEAD) · one send
path · one contact writer (`logOutreachContact`) · one follow-up writer (`applyFollowUp`) · one `nextStep`
per page · every sequence guard · `EMAIL_FRAME_SANDBOX = 'allow-same-origin'` · no `outreach_templates`
row created, edited, seeded or deactivated · `do_not_contact` never set automatically. **All pinned by the
harness.**

---

## 10 · The SQL, for the record

All four blocks are in the chat reply as well, which is where you run them from. **Nothing here was run.**

### Migration 1 — the two social columns

```sql
begin;
alter table public.discovery_trucks
  add column if not exists facebook_url  text,
  add column if not exists instagram_url text;
commit;
notify pgrst, 'reload schema';
```

Deliberately NOT added to `TR_SELECT` in `app/api/discovery/events/route.ts:68` (so they never reach the
anonymous payload) and NOT added to the scraper's site-list select (`run-scraper.js:912-914`), so a social
link can never become a scrape URL. Both facts are code, and both are already true in this build.

### Migration 2 — the screenshot log

```sql
begin;

create table if not exists public.screenshot_log (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  file_name      text,
  file_size      integer,
  kind           text,                 -- schedule | truck_details | both | neither
  outcome        text        not null,  -- lib/admin/screenshot-log.ts SCREENSHOT_OUTCOMES
  summary        text,
  prospect_id    uuid references public.outreach_prospects(id) on delete set null,
  truck_id       uuid references public.discovery_trucks(id)   on delete set null,
  events_written integer,
  error          text,
  alerted_at     timestamptz
);

create index if not exists screenshot_log_created_idx on public.screenshot_log (created_at desc);

alter table public.screenshot_log enable row level security;
drop policy if exists "service_role only" on public.screenshot_log;
create policy "service_role only" on public.screenshot_log
  for all to service_role using (true) with check (true);
revoke all on public.screenshot_log from anon, authenticated, public;

commit;
notify pgrst, 'reload schema';
```

⚠️ `on delete set null` on both ids, not cascade: deleting a prospect must not delete the history of what
was filed against it.

### The backfill decision query — READ ONLY, decides nothing

```sql
select
  count(*)                                                                      as total_trucks,
  count(*) filter (where website      ilike '%facebook.com%'
                      or website      ilike '%fb.com%')                         as website_is_facebook,
  count(*) filter (where website      ilike '%instagram.com%'
                      or website      ilike '%instagr.am%')                     as website_is_instagram,
  count(*) filter (where schedule_url ilike '%facebook.com%'
                      or schedule_url ilike '%fb.com%')                         as schedule_url_is_facebook,
  count(*) filter (where schedule_url ilike '%instagram.com%'
                      or schedule_url ilike '%instagr.am%')                     as schedule_url_is_instagram
from public.discovery_trucks;
```

No backfill is performed in this change, as instructed. 🧪 For context, `OutreachPanel.tsx:1859` already
records 64 of 102 `website` values and 4 of 26 `schedule_url` values as facebook.com.

### 90-day retention — there is no suitable cron, so this is yours to place

```sql
delete from public.screenshot_log where created_at < now() - interval '90 days';
```

As §4 records, no existing cron is a generic retention job, so **nothing deletes these rows today.** Either
run that line occasionally, or say the word and I will add a cron route and the `vercel.json` entry as its
own change.
