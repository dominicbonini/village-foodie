# A select named a column that does not exist, and the refusal that followed stopped every send

**2 October 2026 · built on `683eed3`, shipped as `29e1b74`**
**No migration is required for the fix.** Two migration *files* are added for columns that are
**already live** — they were applied by hand and never committed. Both are idempotent and are no-ops
against production. The SQL is in §4 and in the chat reply.

No `outreach_templates` change. No email sent. No SQL run. No row written. One send path, one contact
writer (`logOutreachContact`), one follow-up writer, every sequence guard and `EMAIL_FRAME_SANDBOX`
unchanged.

> **Nothing in the prompt arrived garbled, and nothing in it contradicted anything else.** One thing
> is worth naming because it looks like a contradiction and is not: the standing rule says **send no
> email**, and the Report section asks for "Send a real email to ZZ and confirm it goes". That is the
> **what-to-test list** — §6 — which is for you to run. I sent nothing.

---

## 1 · The diagnosis

### 1a · `preview` is not a column. It never was.

The send route's outbound-messages select, from 1 October (`6447120`):

```ts
.select('id, direction, is_test, contact_id, message_date, created_at, status, preview, sent_copy')
```

`outreach_messages` has **30 columns** and `preview` is not among them. The authority is
`supabase/migrations/20260928_outreach_messages.sql`, and it agrees exactly with the
`information_schema` list you pasted.

🔴 **`preview` is a DERIVED field, and the timeline route has always derived it.** One line in
`app/api/admin/outreach/timeline/route.ts`:

```ts
preview: previewOf(r.text_body),
```

`previewOf` (in `lib/outreach-timeline.ts`) takes the stored plain text and returns its first three
meaningful lines. `TimelineMessage.preview` is a property of the **response shape**, not of the table —
and that is the whole mistake. The recorded-steps build needed the opening words for
`pairHandLoggedEmails`' second rule, saw `preview` on the type it was reading, and asked the database
for it.

### 1b · What that cost, and why it was total rather than occasional

PostgREST answers an unknown column with **42703 for the entire query** — not a null field, not a
partial row. `data` comes back null and `error` is set. The route then did exactly what it was
designed to do after September's incident:

```ts
if (mErr) {
  return refuse(`I could not read this prospect's sent emails, so the duplicate checks cannot run (…). Nothing was sent.`)
}
```

🔴 **So the refusal was not a bug — it was the correct response to a broken read, and the read was
broken for every prospect in the table.** Every non-test send has refused since `6447120`. 🧪 3Bros
Burgers, 2 October, is the one you reported; it was not specific to that truck.

⚠️ **The September fix is why it was loud instead of silent, and that was the right trade.** Before
`91ca45d`, the same class of mistake — `outreach_contacts.email_message_id`, also not a column —
produced `data: null` with the error *discarded*, so `contacts` became `[]`, an empty ladder read as
"never contacted", and a Chase 1 was written as a second first contact (🧪 Smother Spudders). Checking
the error turned a silent corruption into a visible outage. **This build keeps that visibility and
removes the outage.**

### 1c · `sent_copy` was in the same select, and it was never the email's words

`sent_copy` **is** a real column, so it did not contribute to the 42703. But it holds
`'server_filed' | 'appended' | 'absent'` — *where* the copy in your Sent folder is, not what the email
said. It was there as a fallback for the opening words, in `lib/outreach-timeline.ts`:

```ts
const matches = ms.filter(m => openingKey(m.preview ?? m.sent_copy ?? '') === want)
```

That could only ever compare the string `"absent"` against a hand log's first paragraph, so it matched
nothing and did no damage. 🔴 **The harm was that it read as though a second source of the email's
words existed** — which is the belief that produced a `preview` column. It is removed. There is one
source: `preview`, derived from `text_body`. A row whose body was never stored has no opening words,
and no opening words pairs **nothing**, which is the same exactly-one-or-nothing rule as before.

---

## 2 · Every bad column found

I named every column the recorded-steps build's two routes touch, and then — because the brief asked
for a census — **every column named anywhere in `app/`, `lib/` and `components/`** on the six tables.
That is **1,081 column references**. Three distinct columns do not exist in `supabase/migrations/`:

| # | column | named at | exists live? | in migrations? | verdict |
|---|---|---|---|---|---|
| 1 | **`outreach_messages.preview`** | send route, messages `.select()` | 🔴 **no** | 🔴 no | **The outage.** Fixed. |
| 2 | **`outreach_messages.guard_override`** | send route ×1, timeline route ×2 | ✅ yes | 🔴 no | Applied by hand, never committed. File added. |
| 3 | **`outreach_prospects.contact_first_name`** / **`contact_last_name`** | console route: probe, select, `patch.<col> =` | ✅ yes | 🔴 no | Same. File added. |

### Every column the recorded-steps build's selects name, checked one at a time

**`outreach_messages`, the send route** — was 9 names, now 8:

| name | exists | note |
|---|---|---|
| `id` `direction` `is_test` `contact_id` `message_date` `created_at` `status` | ✅ | unchanged |
| `preview` | 🔴 **NO** | **removed** — the defect |
| `sent_copy` | ✅ | **removed anyway** — a Sent-copy state, never the words (§1c) |
| `text_body` | ✅ | **added** — the preview is derived from it |

**`outreach_contacts`, the send route** — all 7 real, and already correct before this build:
`id`, `contacted_at`, `created_at`, `direction`, `kind`, `channel`, `message`. ⚠️ `email_message_id` is
**not** selected; it is derived from `messages.contact_id`, which is what `91ca45d` fixed.

**`outreach_messages`, the timeline route** — 18 columns in `MESSAGE_COLS` plus `guard_override`
behind the probe. All exist. **`preview` is not among them** — it never was; it is computed in the
mapper.

**`outreach_contacts`, the timeline route** — `id`, `contacted_at`, `created_at`, `channel`,
`direction`, `kind`, `message`. All exist.

### Findings 2 and 3 are a different kind of finding, and I did not teach the census to forgive them

`guard_override` and the two name columns **exist in production** — `guard_override` is in the list you
pasted, and `docs/outreach-name-tokens-report.md` counts rows holding first and last names. Nothing is
broken by them. Both sit behind capability probes that fail closed, so a database without them degrades
rather than erroring.

🔴 **But the census cannot tell them apart from finding 1, and must not be taught to.** "This column is
missing from the migrations but I happen to know it is live" is precisely what someone would have said
about `preview` the day before it refused every send. A record that is advisory protects nothing, and
a fresh `supabase db reset` would have produced a schema both routes silently degrade on for ever. So
the two migration files are written instead (§4). They are idempotent; running them against production
changes nothing.

### What it did NOT find

- Nothing wrong with `outreach_events`, `outreach_settings` or `outreach_sequence_slots`.
- No column named in the mail poll, the importer, the Today route, the diagnostics route or any
  component is missing — including the 18-column poll select and every `.or()` filter.
- ✅ **A control:** the census flags **nothing** on the tree as committed, across 1,081 references
  and 148 migration files. A check that always fires is not a check.

---

## 3 · A failed history read asks, instead of blocking

### 3a · The new guard

`guardHistoryUnreadable`, in `lib/outreach-sequence.ts`, beside the four it joins. It is a **`confirm`**,
the same shape as "not before it is due":

> I couldn't check this truck's earlier emails, so I can't confirm this step hasn't already gone
> (reason: sent emails — 42703 column outreach\_messages.preview does not exist). Send anyway?

⚠️ **It carries the reason**, because "I couldn't check" with no cause is unactionable: a 42703 is a
build to fix and a timeout is a retry, and only the code tells them apart. Confirming sends normally
and the sentence is written into `outreach_messages.guard_override` with the guard's id, exactly like
any other waved guard — the existing two lines in the route do it, unchanged.

**It catches any reason, not just a schema one.** Both reads are wrapped in `try`/`catch` *as well as*
checking `error`, because "for ANY reason" includes a rejected promise — a DNS failure or an aborted
socket never returns an error object.

### 3b · 🔴 The three ladder guards fall silent rather than answering from rows nobody read

This is the half that is easy to get wrong, and it is not cosmetic.

With the read failed there are no rows, so `priors` is empty and `step` was derived from an empty
ladder. `guardAlreadySent`, `guardNotDue` and `guardAfterFinal` would therefore **all return null** —
and the send would look **clean**. Three guards reporting "no problem" about data they never saw is a
worse state than one guard saying it could not look. So `evaluateGuards` skips them when
`history_unreadable` fires, and that one guard speaks in their place.

⚠️ **`shared_address` still runs.** It comes from a different read, about a third party; suppressing a
warning that someone else will get the same email, for a reason that has nothing to do with them,
would be wrong.

⚠️ **It applies to a reply too**, unlike the three it replaces. `isReply` comes from `inConversation`,
which is itself derived from the contacts read — so on a failed read it is `false` whatever the truth
is, and exempting a reply would mean trusting the very read that failed.

### 3c · 🔴 And the rung is still not guessed — the Smother Spudders half is kept

**Asking instead of refusing must not re-open the silent-wrong-step path**, and on its own it would
have. `nextStep` on an empty ladder returns `1_first_contact` for every prospect, and the route then
wrote that rung. One condition prevents it:

```ts
if (step.kind && !historyUnreadable && (!replyParent || !inConversation)) derivedKind = step.kind
```

With `derivedKind` left null, `loggedKindFor` falls back to `clientKind` — **the step you chose in the
composer** — rather than a step this server invented from rows it could not fetch. If you confirm the
guard for a Chase 1, a Chase 1 rung is logged.

### 3d · The hard refusals are still hard

Asserted by the harness, each one separately: **no address**, **a linked/live HatchGrab truck**,
**do-not-contact**, **a test send with no `OUTREACH_TEST_RECIPIENT`**, and **a schema violation in the
email itself** (a literal token, a malformed token, an unresolved must-resolve token). None of these is
a question: there is nothing to send to, nothing that may be sent to, nowhere for a test to go, or
nothing that would survive the frame.

⚠️ **Test sends are untouched.** The entire guard block is still inside `if (!isTest)`.

### 3e · The one property given up, stated rather than buried

**A send can now go out while the duplicate checks have not run.** That is the point of the change, and
it is a real trade: if the messages read is broken *and* you wave the guard through, nothing on the
server has verified that this step has not already gone — only you have. What you get in exchange is
that a schema slip in a duplicate check can no longer take the outreach off the air, and the reason is
on screen and in the record rather than in a log. The decision is recorded on the message row with the
sentence you read.

---

## 4 · A schema census, so neither of these can ship again

🔎 `scripts/outreach-schema-census.cjs`, over `scripts/_outreach-schema-census.cjs`. Registered.
Runs in under 2 seconds, with no network, no mailbox and no database.

**The rule.** Every column named in a `.select(…)`, `.insert`, `.update`, `.upsert`, `.eq`, `.order`,
`.in`, `.not`, `.or`, `.is`, `.ilike` (and the rest of the filter family) on `outreach_messages`,
`outreach_contacts`, `outreach_events`, `outreach_prospects`, `outreach_settings` or
`outreach_sequence_slots`, anywhere in `app/`, `lib/` or `components/`, must exist in a `create table`
or `add column` statement in `supabase/migrations/`.

### 🔴 Why no fixture could ever have caught this

**The harnesses passed both times, and that is the defect the census is about.** A harness builds its
rows in JavaScript, so a fixture has whatever property the code asks of it: `m.preview` is `undefined`,
not an error. The pairing simply finds no opening words and the suite is green.

**It was worse than that.** `scripts/outreach-recorded-steps.cjs` asserted:

```js
&& /preview, sent_copy/.test(SEND)
```

🔴 **A harness line required the non-existent column to be in the select.** It *pinned the bug in
place*, and it had already been re-anchored once off `email_message_id` for exactly the same reason.
That line now asserts the two **derivations** instead; the column lists are checked against the
migrations, which is the only thing that can check them.

### How it is written, and the two things that make it conservative

Read off the **TypeScript AST**, not with a regular expression, so a chain spanning ten lines is one
chain and a `.select` inside a comment is not a select.

🔴 **A select it cannot parse is a FAILURE, not a skip.** The whole value is that it sees every select;
one it quietly gives up on is the one the next `preview` hides in. It therefore resolves the runtime
column lists this codebase actually writes:

- `MESSAGE_COLS + (await probe() ? ', guard_override' : '')` — **both branches** are censused, because
  both are selects that will reach PostgREST, and the probed branch is the hand-applied one and so the
  likeliest to be missing;
- `[hasX && 'x', hasY && 'y'].filter(Boolean).join(', ')` — every combination;
- module consts, template literals, `+` concatenation, `??`, and `.join()`;
- ⚠️ an array that is `.push()`ed to after declaration is treated as **unresolvable**, because reading
  the literal alone would under-report, and an under-report is the one answer it must never give.

Anything it still cannot read must appear in a **waiver** — and a waiver is not an exemption. There is
**one**: the capability probe `columnExists(col)`, which passes its own parameter to `.select()`. It
carries the six column names its call sites pass, **and those are censused like any others** — which
is how findings 3 were caught. A waiver that stops matching its call site fails the harness.

🔴 **Embeds are stripped, brackets balanced.** `truck:discovery_trucks!fk (name, website)` names
*another table's* columns; checked against `outreach_prospects` they would be a dozen false alarms, and
a check that cries wolf on correct code is one nobody runs.

**Two bugs were found in the parser while writing it, both of which would have made it lie:** an
embed's own name left behind as a column when a space preceded the bracket (which failed two correct
selects), and three real `.or()` filters it could not read at all. Both are fixed and both have tests.

### What it proves about itself

| | |
|---|---|
| 🧪 **the control on the whole module** | The SQL reader's `outreach_messages` is **byte-for-byte the 30 columns `information_schema` returned** in your paste. If the reader and the live table agree exactly, it is reading the schema and not an approximation. |
| **12 broken variants, each must fail** | `preview` put back (**the one the brief names**) · `email_message_id` put back · a bad INSERT key · a bad `.eq()` · **a bad column in one branch of the probe ternary** · a bad `.order()` · a bad `.or()` · a bad column in the one contact writer's insert · a bad `patch.<col> =` · **a migration file deleted** · a select it cannot resolve · a builder method it has never heard of. |
| **a control** | The tree as committed flags **nothing**. |

### The two migrations (already applied — these are no-ops)

⚠️ **Run them if you want the files and the database to agree on provenance; nothing waits on them.**
Both columns are live. `add column if not exists` and `comment on` are idempotent.

`supabase/migrations/20261001_outreach_messages_guard_override.sql`:

```sql
begin;

alter table public.outreach_messages
  add column if not exists guard_override jsonb;

comment on column public.outreach_messages.guard_override is
  'The guards waved through when this message was sent: [{"id","message"}], with the sentences as they were shown. Null on a clean send and on every row written before this column existed. Replaces the "Sent anyway:" note in outreach_events; existing notes are left alone.';

commit;

notify pgrst, 'reload schema';

-- verification
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_messages' and column_name = 'guard_override';

select count(*) as messages, count(guard_override) as sent_after_a_warning
from public.outreach_messages;
```

`supabase/migrations/20260930_outreach_prospects_contact_name_split.sql`:

```sql
begin;

alter table public.outreach_prospects
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name  text;

comment on column public.outreach_prospects.contact_first_name is
  'The contact person''s first name, for {{first_name}} and the greeting. Free text, nullable; NULL = not known, which renders as the template''s fallback rather than an empty greeting. Written by the console only; never parsed out of contact_name.';

comment on column public.outreach_prospects.contact_last_name is
  'The contact person''s last name, for {{last_name}}. Free text, nullable; NULL = not known. Independent of contact_first_name — a first name with no last name is the common case and is not an incomplete row.';

commit;

notify pgrst, 'reload schema';

-- verification
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_prospects'
  and column_name in ('contact_name', 'contact_first_name', 'contact_last_name')
order by column_name;

-- 🧪 the name-tokens report expects 231 prospects, 3 with a first name, 1 with a last
select count(*)                                                            as prospects,
       count(*) filter (where coalesce(trim(contact_first_name), '') <> '') as with_first,
       count(*) filter (where coalesce(trim(contact_last_name), '')  <> '') as with_last,
       count(*) filter (where coalesce(trim(contact_name), '')       <> '') as with_legacy_name
from public.outreach_prospects;
```

---

## 5 · The harnesses

**Two registered, three extended.** `node scripts/run-harnesses.cjs` → **81 run · 81 passed · 0
failed.** Goldens untouched (`scripts/_batch-*-generate.cjs` not run; no fixture file changed). ESLint
on every changed source file: **0 errors, 0 warnings**.

| harness | covers | result |
|---|---|---|
| **`outreach-schema-census.cjs`** *(new)* | item 3 — the parser against hand-written cases, 12 broken variants, and the whole tree | ✅ 36 |
| **`outreach-send-read-failure.cjs`** *(new)* | item 1 (select lists **asserted against the census**, not a fixture) · item 2 (asking guard, ladder guards silent, confirming sends, override recorded) · the hard refusals · the standing rules | ✅ 49 |
| `outreach-recorded-steps.cjs` | **the `/preview, sent_copy/` line is gone**; it asserts the derivations now | ✅ 40 |
| `outreach-step-logging.cjs` | the two "unreadable read REFUSES" checks **restated, not weakened** — it now asserts the asking guard *and* that an unreadable ladder still never decides a step | ✅ 29 |
| `outreach-sequence.cjs` | the `derivedKind` assertion re-anchored onto `!historyUnreadable` | ✅ 64 |

⚠️ **One harness weakness was found and fixed while updating `outreach-step-logging.cjs`:** a regex for
"the read records its failure" was satisfied by the `catch` branch alone, so deleting the `error` check
— September's exact bug — went uncaught. Both branches are now named separately.

### ✅ The deploy has landed — proved by bytes, and by a chunk that no longer carries a line this build deleted

The admin UI is behind authentication and I have no session here, so the deploy is verified through the
public static bundle, as `docs/outreach-editor-deploy-report.md` did.

**Which chunks this build changes.** I built `29e1b74` locally, then built `683eed3` locally, and
compared all 90 static chunks. **Exactly two are replaced** — the pair carrying `lib/outreach-sequence.ts`
and `lib/outreach-timeline.ts`:

| | `683eed3` (before) | `29e1b74` (after) |
| --- | --- | --- |
| chunk | `2b4e63991d1528e8.js` | `0775e8ce3b08ddb4.js` |
| chunk | `e7013dc0b2ccab34.js` | `742b3a3f5cc16f35.js` |

**Production serves the new pair and no longer has the old pair:**

| chunk | in which build | local md5 | production | bytes |
| --- | --- | --- | --- | --- |
| `0775e8ce3b08ddb4.js` | **`29e1b74` only** | `d00524010ba06f92aeb65cd51c74ca98` | **200, `d00524010ba06f92aeb65cd51c74ca98`** | 57,824 |
| `742b3a3f5cc16f35.js` | **`29e1b74` only** | `310070aa7432c36cc73184add654d86a` | **200, `310070aa7432c36cc73184add654d86a`** | 57,824 |
| `2b4e63991d1528e8.js` | `683eed3` only | — | **404** | — |
| `e7013dc0b2ccab34.js` | `683eed3` only | — | **404** | — |

🔴 **And the content says so independently of any hash.** The two `683eed3` chunks each contain the
string `sent_copy` — the pairing's opening-words fallback that §1c removes. **The two chunks production
is serving contain it zero times.** That is the deleted line's absence, observed in production.

⚠️ **The controls matter, and one of them is the same coincidence the editor report hit.** The two new
chunks are *both* 57,824 bytes, which on its own looks exactly like a server handing back one fallback
body for any chunk path. They have **different** md5s, each matching its own local file, and a hash that
cannot exist (`/_next/static/chunks/0000000000000000.js`) returns **404**, not a body. Two shared,
unchanged chunks also match byte-for-byte (`3133a81d132e269f.js` →
`7d9f806109dd550789862c6dae649635`; `e6fba60817604cf9.js` → `94ad52f22e1a977ff913fa16f84db7ee`), which
is what establishes that Vercel's build and mine produce identical hashes at all.

⚠️ **One false trail, recorded because it nearly became the proof.** My first candidate was a 449 KB
chunk containing the string `couldn't check this truck` — which reads exactly like the new guard's
sentence. It is not: `components/manage/PaymentsTab.tsx` has said *"We couldn't check this truck's
Stripe account"* since long before this build, and that chunk is **byte-identical in both builds**
(`2bde2c9f44761fdde3c5d454131475a2`). A coincidence of wording, not evidence. It is 404 on production
for reasons that have nothing to do with this deploy, and reading it as "not deployed yet" would have
been wrong in both directions.

🔴 **What this proves and what it does not.** It proves production is running `29e1b74`. It does **not**
prove the guard renders: `guardHistoryUnreadable` is server-side only — the guard functions are
tree-shaken out of the client bundle entirely, so no static asset can show it. The sentence is built by
the route and sent to the browser. That needs your eyes, and it is §6.

---

## 6 · What to test

🔴 **ZZ Test Prospect only. No send to 3Bros Burgers or any other prospect** — the one in §1b refused,
it did not go, and re-sending it is a decision for you and not a test.

### The one that matters: the send works again

1. **Open ZZ Test Prospect → compose → Send a real (non-test) email.**
   ✅ **It goes.** No "I could not read this prospect's sent emails". This is the whole fix; if it
   sends, item 1 is done.
2. Check the email arrives, and that the history shows **one** row for it with the right step.
3. ⚠️ **Also send a TEST send to ZZ** (the test button) and confirm it still goes and logs no rung —
   the test path should be exactly as it was.

### The asking guard — ZZ only, and it needs a deliberate break

The guard fires only when a read genuinely fails, which it no longer does. To see it:

4. Point the browser at the send endpoint for ZZ with the messages table momentarily unreadable — or,
   more simply, **trust the harness for this one** (`outreach-send-read-failure.cjs`, §2 of its
   output) and check instead that **nothing asks when the read is fine**: send to ZZ and confirm you
   get **no** "I couldn't check this truck's earlier emails" prompt.
5. If you do want to see it live: `revoke select on public.outreach_messages from service_role;` in a
   transaction, press Send on **ZZ**, read the prompt, confirm it, then **roll back**. 🔴 Do this on ZZ
   and nothing else, and do not leave the revoke in place.
   - Expect: *"I couldn't check this truck's earlier emails, so I can't confirm this step hasn't
     already gone (reason: …). Send anyway?"* — and **only** that prompt, not `already_sent` or
     `not_due` alongside it.
   - Confirm it → the email sends → open that email in the reading panel → one grey line:
     **"Sent after a warning: I couldn't check this truck's earlier emails…"**.

### The guards that must still behave

6. **"Not before it is due"** still asks on ZZ if you push a step early, and **already-sent** still
   refuses a repeated rung. Neither should have moved.
7. **No address:** clear ZZ's `contact_email` and press Send — **still a flat refusal**, not a question.
   Put it back.

### The CRM, which reads the same rows

8. Open two or three prospects' histories (**read-only**, no sending) and confirm the email previews
   still show their first lines. The preview comes from `text_body` through `previewOf` and is
   unchanged, but it is the field this build touched and worth one look.

### The census, which you can run yourself

9. `node scripts/outreach-schema-census.cjs` → **✅ all 36 passed**.
10. `node scripts/run-harnesses.cjs` → **81 run · 81 passed**.

### Optional, and not needed for anything above

11. Run the two migrations in §4. Both are no-ops against the live database; they make the repository's
    record match it.
