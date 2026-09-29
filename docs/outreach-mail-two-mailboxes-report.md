# Two mailboxes: dominic@ becomes primary, hello@ becomes read-only history

**29 September 2026.** Follow-up to `docs/outreach-mail-replies-report.md`, plus the fix to Build 2's
duplicate protection. **Sending stays manual.**

**Nothing was sent during this task** and no mailbox was touched: the harness runs against pure
functions, a fake table with a real unique index, and a source census. **No SQL was run** — the `account`
column Dominic applied by hand on 29 September is recorded in a migration file with an `APPLIED BY HAND`
header. No `outreach_templates` row was created, edited, seeded or deactivated; `outreach_snippets` was
not touched; the linked-truck refusal and skip are unchanged. Brevo and every transactional path are
untouched.

---

## 1 · The account model

| Account | Role | Credentials |
|---|---|---|
| `dominic` | **PRIMARY** — sends, files its Sent copy, is polled | `OUTREACH_PRIMARY_USER` / `OUTREACH_PRIMARY_PASSWORD` |
| `hello` | **LEGACY** — read-only, still polled for replies to old threads | `OUTREACH_MAIL_USER` / `OUTREACH_MAIL_PASSWORD` (unchanged) |

`lib/outreach-mail-accounts.ts` is the one place that decides. Everything else asks it.

### 🔴 The fallback is the default, and it is why this deploy changes nothing
```ts
return {
  configured,
  primary: dominic ?? hello,
  primaryConfigured: dominic !== null,
}
```
If the primary variables are absent, `hello` sends, files, polls and reads exactly as it did in Build 2,
and every new row is stamped `account: 'hello'`. That matters because **this code reaches production
before Dominic has added the variables**, and a feature that half-switches on deploy — sending from a
mailbox whose password is not set — would break outreach for however long the gap is.

⚠️ **The switch is therefore the environment variable, not the deploy.** Adding it is the moment the
primary takes over; removing it is a complete rollback. Broken variant **V12** removes the fallback and
must fail.

⚠️ **The From address is `dominic@hatchgrab.com` either way.** It was an alias on hello@ and it is now a
mailbox: what changed is who logs in, not who the mail is from. A recipient sees no difference.

⚠️ **Half a credential is no credential.** A username with no password leaves that account unconfigured,
rather than producing a login attempt that fails for a reason that says nothing.

### The column
`outreach_messages.account`, `text NOT NULL`, `check (account in ('hello','dominic'))`, **no default**,
every existing row `'hello'`.

🔴 **`mailbox` + `uid` identify a message inside one account and are meaningless outside it.** With one
account the pair was enough. Opening a September import against dominic@ would either find nothing or —
worse — find a **different** message that happens to hold that uid. `account` is the third part of the
address.

⚠️ **No default, deliberately.** A default would let a future insert forget which mailbox it read from
and silently claim the wrong one. With none, such an insert fails loudly; every insert in the app names
it explicitly.

---

## 2 · Which account each path uses

| Path | Account | Line |
|---|---|---|
| **Send** | the **primary** | `const sender = accountForSend(accounts)` → `account: sender.account` on the insert |
| **Sent copy** of a new send | the primary (inside `deliver`) | `deliver(supabase, {…}, { mailUser, mailPass, … })` |
| **Retry** (manual or automatic) | the **row's own** | `const rowCreds = credentialsFor(accounts, accountOfRow(row))` |
| **Save to Sent** | the **row's own** | `const copyCreds = credentialsFor(accounts, accountOfRow(row))` |
| **View** | the **row's own** | `const viewCreds = credentialsFor(accounts, accountOfRow(row))` |
| **Chaser quote fetch** | the **parent row's own** | `const creds = credentialsFor(accounts, accountOfRow(parent))` |
| **Poll** | **every configured account** | `for (const creds of accounts.configured)` |
| **Importer** | every configured account | `for (const creds of accounts.configured)` |
| **Health check** | every configured account, labelled | `for (const creds of accounts.configured)` |

🔴 **A read by uid always uses the row's own account.** An email imported from hello@ in September still
opens after the switch, and a chase to a prospect whose history is in hello@ still quotes it correctly.
Broken variant **V13** makes reads use the primary and must fail.

### 🔴 Why "the legacy account is never written to again" is structural
The send path asks `accountForSend(accounts)`, which returns the **primary**. There is no parameter
through which a caller could name `hello` for a new message. `lib/outreach-mail-deliver.ts` — the one
module that calls `sendMail` or `appendToSent` — **names no account at all**, so it cannot prefer one;
it is handed credentials. The harness asserts both.

⚠️ **One path can still append to hello@, and it is the right one:** *Save to Sent* / the housekeeping
Sent-copy sweep for a row that was **sent from hello@ before the switch**. Its copy belongs beside the
rest of that thread, not in a mailbox where nothing else of that conversation is. It is reachable only
for a pre-existing legacy row, never for a new message.

---

## 3 · Polling both accounts

```ts
for (const creds of accounts.configured) {
  try { await pollOneAccount(supabase, creds, dir, summary) }
  catch (err) { fail(`account:${creds.account}`, err) }
}
```
One connection per account, sequential, logout in `finally`. Read-only throughout: every folder through
`withReadOnlyMailbox` (EXAMINE), every fetch a peek.

**Watermarks are per account**, and the legacy key is unchanged:
```ts
const STATE_KEY: Record<MailAccount, string> = {
  hello: 'mail_poll_state',
  dominic: 'mail_poll_state_dominic',
}
```
🔴 `hello`'s watermarks stay exactly where Build 2 put them, so the switch does not make the poll re-read
hello@'s recent mail as if it were new. `dominic` gets its own key and therefore **its own first look**,
which baselines and processes nothing older — the same rule, applied to a mailbox that is new to us.

🔴 **Threading looks across both accounts.** `dir.byMessageId` is built from every row in the table, so a
reply arriving at dominic@ to an email sent from hello@ still matches its thread — which is the common
case for weeks after the switch.

Matching, classification, the linked-truck skip and the own-address rule are **unchanged** and apply to
both accounts. Every message is recorded with the account it was found in.

---

## 4 · The duplicate-protection fix

Three guards were read-then-act, which is not a guard when two runs overlap — and they overlap by
design, because the ten-minute cron and the button call the same routine. `lib/outreach-poll-claims.ts`
replaces all three with **one statement that is itself the test**, and the caller proceeds only if its
own statement returned a row.

### (a) The reply gate — the one that actually produced duplicates
**The defect:** a reply was skipped if its Message-ID was in an **in-memory map built at the start of
the run**. Two runs each built that map before either inserted, so both thought the reply was new. The
message row is unique on `message_id` so the second INSERT failed — **but the code went on to write the
contact row anyway**, and `outreach_contacts` has no such constraint. One reply, two rungs, and §57 reads
that ladder.

```ts
const made = await insertMessageOnce(supabase, {
  ...messageRow(m, path, account, prospectId, 'received', 'inbound'),
  text_body: text,
})
if (!made.created) {
  if (made.error) summary.errors.push({ step: 'reply', error: made.error })
  return
}
```
```ts
const { data, error } = await supabase
  .from('outreach_messages')
  .upsert(row, { onConflict: 'message_id', ignoreDuplicates: true })
  .select('id')
…
if (!first?.id) return { created: false, error: null }   // somebody else won; nothing to do
```
🔴 **The insert is the gate.** `ignoreDuplicates` turns the unique index into the arbiter: exactly one of
two racing runs gets a row back, and only that one writes the rung. The same gate is used for
auto-replies, bounces and Outlook-sent mail. ⚠️ A row that simply exists is **not an error** — another
run recorded it a moment ago, which is the outcome being arranged for.

The in-memory check survives as a **cheap pre-check**, saving a round trip for the overwhelmingly common
case, and the comment says so.

Broken variant **V9** tells the loser it created the row; the harness then sees two contacts.

### (b) The lock
**The defect:** it read `mail_poll_lock`, decided it was free, then wrote it.
```ts
const { data: inserted } = await supabase.from('outreach_settings')
  .insert({ key: LOCK_KEY, value: { takenAt: stamp }, updated_at: stamp }).select('key')
if (inserted && inserted.length > 0) return true

const { data: taken } = await supabase.from('outreach_settings')
  .update({ value: { takenAt: stamp }, updated_at: stamp })
  .eq('key', LOCK_KEY)
  .lt('updated_at', staleBefore)
  .select('key')
return !!taken && taken.length > 0
```
Two statements, each of which is itself the test: an INSERT that conflicts if the key exists, and an
UPDATE filtered on `updated_at` being older than the window. ⚠️ **`updated_at` is the clock, not a field
inside the JSON** — a timestamp in `value` could only be compared by reading it first, which is the bug.
It still expires after two minutes, so a frozen container cannot disable the feature. **V11** removes the
filter.

### (c) The retry claim
```ts
const { data } = await supabase.from('outreach_messages')
  .update({ status: 'sending', updated_at: now.toISOString() })
  .eq('id', rowId).eq('status', 'failed')
  .select('id')
return !!data && data.length > 0
```
🔴 `failed` → `sending` in one statement filtered on `failed`. Whoever's update returns a row owns the
retry; the loser's matches nothing. Without it, two overlapping polls could each re-send the same email
to the same prospect. ⚠️ It leaves the row at `sending`, which is honest: if the process dies there, the
stuck-sending sweep makes it `uncertain`, which needs a human. **V10** removes the filter.

---

## 5 · The health check

```
GET /api/admin/outreach/mail-health
```
reports, for **each configured account**, SMTP 465, SMTP 587 and IMAP 993 — login only, as before,
never a send — plus which account is primary:

```json
{
  "region": "…",
  "primary": "dominic",
  "primaryConfigured": true,
  "envPresent": { "hello": { "user": true, "password": true },
                  "dominic": { "user": true, "password": true } },
  "accounts": [
    { "account": "hello",   "role": "legacy",  "smtp465": …, "smtp587": …, "imap": … },
    { "account": "dominic", "role": "primary", "smtp465": …, "smtp587": …, "imap": … }
  ]
}
```
🔴 **Two mailboxes means two ways for this to be half-working** — the primary's password wrong and
nothing sends, or the legacy's wrong and every old email stops opening. A single combined verdict would
hide whichever one is fine.

⚠️ **Still booleans and verdicts, never values.** `envPresent` says whether each variable is set; no
address and no password is returned. The checks run **in sequence across accounts as well as within
one**: six simultaneous logins from one IP is what a mail host's brute-force heuristics are built to
notice, and the point of this route is to be allowed to log in.

---

## 6 · Harness

`node scripts/outreach-mail-poll.cjs` · **13 broken variants, 187 assertions**, no network and no
mailbox.

⚠️ **The race tests use a fake table with a REAL unique index**, so two simulated runs genuinely race and
**the table decides** — `upsert … ignoreDuplicates` returns rows only to the first caller for a given
`message_id`, and a filtered `update` returns rows only to the caller whose filter still matched. That
is exactly what the real client does; a mock that just counted calls would prove nothing.

```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
  ✓ FAILED as required  V1 the first run has no baseline: it reads the mailbox from uid 1 and logs all of it
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

### The new sections
```
── TWO ACCOUNTS, AND THE FALLBACK THAT MAKES THE DEPLOY A NO-OP ────────────────────────
  ✓ with only the old vars, one account
  ✓ 🔴 …and hello@ still does the sending
  ✓ …the primary is not configured
  ✓ …so hello@ is NOT read-only yet — it is still the sender
  ✓ with both, both are configured
  ✓ 🔴 …and the PRIMARY sends
  ✓ …logging in as dominic@
  ✓ the primary is configured
  ✓ 🔴 …so hello@ is read-only from now on
  ✓ a primary username with no password is not configured
  ✓ neither configured ⇒ no primary, and callers refuse as before
  ✓ a 'hello' row opens hello@
  ✓ a 'dominic' row opens dominic@
  ✓ ⚠️ a row with no account is legacy — that is where those uids point
  ✓ …and so is a row with a value nobody recognises
  ✓ credentials are looked up per account
  ✓ …and are null for an account that is not set up
  ✓ the primary reads OUTREACH_PRIMARY_USER
  ✓ …and the legacy keeps the existing variable

── 🔴 TWO CONCURRENT RUNS, ONE REPLY, ONE CONTACT ROW ───────────────────────────────────
  ✓ 🔴 exactly ONE of two concurrent runs creates the message row
  ✓ …and the loser is told so without an error
  ✓ 🔴 …so exactly ONE contact row is written for the reply
  ✓ and exactly one message row exists
  ✓ a later run finds it already recorded
  ✓ …and writes no second contact row

── 🔴 TWO CONCURRENT RUNS, ONE FAILED ROW, ONE RETRY ────────────────────────────────────
  ✓ 🔴 exactly ONE run claims the retry — the other re-send never happens
  ✓ …and the row is left at `sending`, which is honest
  ✓ a row that is no longer `failed` cannot be claimed again

── 🔴 THE LOCK IS ONE STATEMENT, NOT A READ THEN A WRITE ────────────────────────────────
  ✓ 🔴 exactly ONE of two concurrent runs takes the lock
  ✓ a third attempt while it is held gets nothing
  ✓ ⚠️ …but a run that has gone quiet for 2 minutes is taken over
  ✓ and a released lock is immediately available

── SOURCE CENSUS: WHICH ACCOUNT EACH PATH USES ─────────────────────────────────────────
  ✓ the send resolves its account through `accountForSend`
  ✓ 🔴 …and the new row is stamped with that account
  ✓ the send route reads no credential from the environment directly any more
  ✓ …nor does the poll
  ✓ …nor does the importer
  ✓ View opens the ROW'S account, not the primary
  ✓ the chaser quote opens the ROW'S account, not the primary
  ✓ a retry opens the ROW'S account, not the primary
  ✓ Save to Sent opens the ROW'S account, not the primary
  ✓ housekeeping does too
  ✓ the send route itself neither sends nor appends — both live in the deliver module
  ✓ …which is the one module that does
  ✓ 🔴 …and it names no account at all, so it cannot prefer the legacy one
  ✓ the poll never resolves a SEND account — its only send is a retry of an existing row
  ✓ the poll walks every configured account
  ✓ …and so does the importer
  ✓ 🔴 each account has its OWN watermarks…
  ✓ …and hello@ keeps the existing key, so the switch does not re-read its recent mail
  ✓ …while dominic@ gets its own, and therefore its own first look
  ✓ the importer stamps each new row with the account it read from
  ✓ …and so does the poll
  ✓ the health check tests every account
  ✓ …labels which is primary
  ✓ 🔴 …and still never sends — it is a login check
  ✓ the poll takes the lock atomically
  ✓ …and the read-then-write version is gone
  ✓ every recorded message goes through the insert gate
  ✓ 🔴 …and no handler inserts directly any more, which is what made the contact log racy
  ✓ the retry is claimed atomically
```

Every Build 2 section — the watermark, matching, classification, the bounce lookup, the reply text, the
stage rule, housekeeping, the read-only census and the cron registration — still passes unchanged.
Exit **0**, `✅ ALL CHECKS PASSED`.

---

## 7 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0** |
| `node scripts/outreach-mail-poll.cjs` | exit **0** — 13 variants failed as required, 187 assertions passed |
| `node scripts/run-harnesses.cjs` | exit **0** — **61 run · 61 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

### eslint, against a clean HEAD worktree (`3a92f80`)
Six changed files, measured before and after: **zero findings on either side**, so the delta is **0 on
every rule**. The two new files — `lib/outreach-mail-accounts.ts` and `lib/outreach-poll-claims.ts` —
also lint with **zero findings**.

⚠️ One unused import (`dbDetail`) was left behind when the poll's handlers moved to the shared insert
gate. It was removed rather than suppressed.

---

## 8 · Files

### New
| File | What it is |
|---|---|
| `lib/outreach-mail-accounts.ts` | The account model: which mailbox sends, which is read-only, which a stored row belongs to, and the fallback. Pure. |
| `lib/outreach-poll-claims.ts` | The three atomic claims — the lock, the message-insert gate, the retry claim. |
| `supabase/migrations/20260929_outreach_messages_account.sql` | The record of the `account` column Dominic applied by hand. |

### Changed
| File | What changed |
|---|---|
| `lib/outreach-mail-config.ts` | A note that `dominic@` is now a mailbox; the host, ports and From are unchanged. |
| `lib/outreach-mail-poll.ts` | Walks every configured account with its own watermarks; atomic lock, insert gate and retry claim; housekeeping uses each row's account. |
| `lib/outreach-mail-deliver.ts` | Carries the row's account; still names no account itself. |
| `app/api/admin/outreach/mail-send/route.ts` | Sends as the primary and stamps the row; View, quote, retry and Save-to-Sent use the row's account. |
| `app/api/admin/outreach/mail-import/route.ts` | Walks both accounts and stamps each new row. |
| `app/api/admin/outreach/mail-health/route.ts` | Reports every account, labelled, and which is primary. |
| `scripts/outreach-mail-poll.cjs` | Five new variants, four new sections, and a fake table with a real unique index. |

---

## 9 · Dominic's steps

### 1 · Add the primary credentials
**Vercel → Project → Settings → Environment Variables → Production:**

| Name | Value | Mark as |
|---|---|---|
| `OUTREACH_PRIMARY_USER` | `dominic@hatchgrab.com` | — |
| `OUTREACH_PRIMARY_PASSWORD` | the mailbox password | **Sensitive** |

Leave `OUTREACH_MAIL_USER` / `OUTREACH_MAIL_PASSWORD` exactly as they are — hello@ is still read for
replies to old threads, and every existing email still opens from it.

**Then redeploy.** Environment variables are read at boot, so until you redeploy nothing changes —
which is also the safe state: everything keeps working through hello@.

### 2 · Health check — both accounts must pass
Open `/api/admin/outreach/mail-health`. Expect:
- `"primary": "dominic"` and `"primaryConfigured": true`;
- an entry for **each** account, `role` `primary` and `legacy`;
- `smtp465`, `smtp587` and `imap` all succeeding **for both**.

🔴 If `dominic` fails, stop and fix the password before sending anything — the send path is now pointed
at it. If `hello` fails, sending still works but old emails will not open; fix it too.

### 3 · Check for replies now — expect a first look at dominic@
Press it. Expect the summary to say **first look at dominic/INBOX, dominic/Spam, dominic/Archive,
dominic/Sent — older mail was left alone**.

🔴 **That is the design, not a failure.** A new mailbox is baselined exactly as Build 2 baselined
hello@: it records where the mailbox is and reports only what arrives afterwards. Use **Import past
emails** if you want its history recorded — that writes no contact rows.

hello@ is **not** baselined again; its watermarks are untouched, so it carries on from where Build 2
left it.

### 4 · The reply test
🔴 **ZZ Test Prospect (Dominic)** — prospect `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46` — is the only
prospect to test with.

1. **Compose → Send** a real email to it. Check the message row is recorded (Emails list) and that in
   **Outlook** the copy appears in **dominic@'s Sent folder**, not hello@'s.
2. In **Hotmail**, reply to it. **Do not open it in Outlook.**
3. Press **Check for replies now**.

Expect:
- **1 reply logged**;
- the prospect's **stage is `replied`**;
- **Contact history** has exactly **one** inbound `reply` row — press the button again and it stays one;
- **Emails** shows the **Reply**;
- 🔴 **in Outlook, the reply is still unread.**

### 5 · Old history still opens
On any prospect with imported September emails, press **View** on one. It must open exactly as before —
it is being read from **hello@**, where its uid still means what it meant. 🔴 If this fails, the legacy
credentials are wrong; the health check will say so.

### 6 · If you want to roll back
Remove `OUTREACH_PRIMARY_USER` and `OUTREACH_PRIMARY_PASSWORD` and redeploy. Everything returns to
hello@ doing all of it. Rows already stamped `dominic` keep opening from dominic@ — so leave the
variables in place if any exist, or that history stops opening.

---

## 10 · Commit and deploy evidence

**Commit `223a502`** — *"Two mailboxes: dominic@ becomes primary, hello@ becomes read-only history"*, on
`main`, pushed to `origin/main` (`3a92f80..223a502`). Eleven files: four new, seven changed. No other
work is in it.

**Deployed and serving on production, confirmed 2026-09-29T17:57:16Z.**

Proved by the build-fingerprint method. The set of `/_next/static/chunks/*.js` the home page references
was captured **before** the push and then polled:

```
fingerprint before push: ea49c6b2750f1b6305b0a7d0f2d2f1cc
poll 1: ea49c6b2750f1b6305b0a7d0f2d2f1cc
poll 2: ea49c6b2750f1b6305b0a7d0f2d2f1cc
poll 3: ea49c6b2750f1b6305b0a7d0f2d2f1cc
poll 4: 9f129c9f796606a8a6e7d03cba9a4b05     ← DEPLOY LANDED
```

The route checks below were taken after it changed.

| Request | Status | Content-Type | Body |
|---|---|---|---|
| `GET /api/admin/outreach/mail-health` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `GET /api/admin/outreach/mail-poll` | 405 | — | POST-only, so the path exists |
| `GET /api/admin/outreach/mail-send` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `GET /api/admin/outreach/does-not-exist-check` | 404 | `text/html` | the app's HTML 404 page |

The last row is the control: a non-existent path returns the rendered HTML 404, so a JSON refusal is
each route's own `verifyAdmin` answering. ⚠️ The 404 is deliberate — an admin route does not confirm its
own existence to an unauthenticated caller.

⚠️ **The deployed code is currently in its FALLBACK state, and that is the intended outcome of this
deploy.** Until `OUTREACH_PRIMARY_USER` / `OUTREACH_PRIMARY_PASSWORD` are added, hello@ does exactly
what it did yesterday. The evidence above shows the build is serving; §9 is what switches it over, and
the health check in step 2 is what confirms the switch.

---

## 11 · Final state of the working tree

```
On branch main
Your branch is up to date with 'origin/main'.

Changes committed in 223a502:

  new file:   lib/outreach-mail-accounts.ts
  new file:   lib/outreach-poll-claims.ts
  new file:   supabase/migrations/20260929_outreach_messages_account.sql
  new file:   docs/outreach-mail-two-mailboxes-report.md
  modified:   lib/outreach-mail-config.ts
  modified:   lib/outreach-mail-poll.ts
  modified:   lib/outreach-mail-deliver.ts
  modified:   app/api/admin/outreach/mail-send/route.ts
  modified:   app/api/admin/outreach/mail-import/route.ts
  modified:   app/api/admin/outreach/mail-health/route.ts
  modified:   scripts/outreach-mail-poll.cjs

Untracked files:
  (none)

nothing to commit, working tree clean
```

Nothing was staged, committed, stashed, reset or restored beyond this task's own files; `git add -A`
and `git add .` were not used. **No SQL was run** — the `account` column was Dominic's, applied by hand,
and the migration file records it. Two `slot-head-dots-*` worktrees from an earlier session remain
listed as prunable: pre-existing, untouched, and already on the open-items list.
