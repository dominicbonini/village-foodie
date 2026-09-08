# `token_issued_at` — the proxy is gone

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

⛔ **THE MIGRATION HAS NOT BEEN APPLIED. `whatsapp_connections.token_issued_at` DOES NOT EXIST until you run the SQL below by hand in the Supabase SQL editor.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED. ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 HARNESS FRESHNESS — RUN FIRST, BEFORE ANY NUMBER BELOW

```
token-crypto.ts        ✅ IDENTICAL 549dcf154861e49f…
connection-state.ts    ✅ IDENTICAL 71bdc7c37a5b87b5…
embedded-signup.ts     ✅ IDENTICAL 724a260ae0100d98…
webhook-signature.ts   ✅ IDENTICAL
connection-read.ts     → non-import differences: NONE ✅
route.ts               → non-import differences: NONE ✅
```

🧪 **`shasum -a256` per module against source**, plus `diff` on the two whose import specifiers are rewritten — filtered to show **only** non-import lines, and that filter returned **NONE** for both. A hash proves sameness, so a marker grep proves *recency*:

```
token_issued_at in harness route.ts:            3
token_issued_at in harness connection-read.ts:  3
issuedAtMs in harness route.ts:                 3
row?.updated_at in connection-read.ts:          0   ← the proxy is gone from the copy under test
```

⚠️ **Two counts came in above the number I predicted (3 vs 2) because comments also name those identifiers.** Said rather than quietly adjusted — the decisive evidence is the hashes and the empty non-import diffs, not my arithmetic.

---

# TASK 1 — THE COLUMN

## 🔴 The migration — paste this into Supabase. The column does not exist until you do.

```sql
set lock_timeout = '3s';

begin;

alter table public.whatsapp_connections
  add column if not exists token_issued_at timestamptz;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_token_issued_together;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_token_issued_together
  check (access_token_ciphertext is null or token_issued_at is not null);

commit;

notify pgrst, 'reload schema';
```

⚠️ **`notify pgrst` is not optional here.** Without it PostgREST keeps its cached schema and **every write naming `token_issued_at` fails with "column not found"** — which, since the route writes it in the same statement as the ciphertext, means no truck can connect at all.

The full file, with the reasoning, is `supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql`.

## The two constraints, as they will read after the change

```sql
-- already applied
constraint whatsapp_connections_token_expiry_together
  check (access_token_ciphertext is null or token_expires_at is not null)

-- added by this migration
constraint whatsapp_connections_token_issued_together
  check (access_token_ciphertext is null or token_issued_at is not null)
```

🟢 **Mirrored, not invented.** Same shape, same name pattern, same sentence with one column swapped: *a held token must carry its expiry* / *a held token must carry its issue time*. Two constraints that read alike are two a reader can trust.

🔴 **HONEST LIMIT OF THAT SHAPE, FLAGGED RATHER THAN GLOSSED.** You asked for "non-null whenever a token exists, **and absent when one does not**", *and* for a mirror of the existing constraint. **The mirror only enforces the forward half** — token ⇒ issue time. It does **not** forbid an issue time on a row holding no token. That is equally true of the applied expiry constraint. Enforcing the "absent" half would mean turning **both** into biconditionals — a change to an already-applied constraint, a second pattern, and a separate decision. **I mirrored, as instructed, and am telling you what the mirror does not cover** rather than silently choosing the stricter form.

## Backfill — none needed, and what it would have cost

🟢 **The table is empty, so this is one ALTER and nothing else.** Recorded so the cost of having deferred it is on the record:

Had rows existed and held tokens, **`add constraint` would have failed immediately on validation** — every existing token row violates it — so the migration would have become **(1)** add the column, **(2)** backfill, **(3)** add the constraint (or `NOT VALID` then `VALIDATE`, to avoid a long lock).

🔴 **And step 2 is unrecoverable. Meta does not report when a token was issued** — only `expires_in` at the moment of exchange, long gone. The only candidates would have been:
- **`updated_at`** — the very proxy this column exists to remove, baking the bug in permanently for every pre-existing row;
- **`token_expires_at − 60 days`** — inventing the number this workstream just finished deleting;
- **re-onboarding every truck** to observe a fresh `expires_in`.

**All three are worse than one ALTER on an empty table. That is the whole argument for doing it today.**

---

# TASK 2 — WRITTEN AND USED

## Where the value comes from, and why it is the issue time and not an approximation

```ts
const issuedAtMs = Date.now()
const issuedAt = new Date(issuedAtMs).toISOString()
const expiresAt = expiresInSeconds === null
  ? null
  : new Date(issuedAtMs + expiresInSeconds * 1000).toISOString()
```

🔴 **ONE INSTANT, USED FOR BOTH ENDS OF THE LIFETIME.** Captured immediately after the exchange returns and **before any write**, and the expiry is that same instant plus Meta's `expires_in`. So `token_expires_at − token_issued_at` **reconstructs `expires_in` exactly** — the two cannot drift by the duration of the writes between them.

⚠️ **It is the exchange instant, not the write instant, and that is the point.** Reading the clock again at the upsert would make the stored lifetime *shorter* than the one Meta actually granted — the same shrink-direction error as the proxy, just smaller.

🟢 **Written in the same statement as the ciphertext**, which the CHECK requires. In the no-`expires_in` branch, where the token is deliberately not stored, `token_issued_at` is `null` alongside `token_expires_at` — both CHECKs are satisfied because the ciphertext is null.

## Every place `updated_at` was an issue-time proxy — and none remain

| Location | Was | Now |
|---|---|---|
| `connection-read.ts:44` | `…, payment_method_present, updated_at'` in the select | 🟢 `…, token_revoked_at, token_issued_at, payment_method_present'` — `updated_at` **no longer selected** |
| `connection-read.ts:94-96` | `const tokenIssuedAt = row?.updated_at` + the "STANDS IN FOR" caveat | 🟢 `row?.token_issued_at`, caveat **deleted** |
| `connection-state.ts:69` | field doc "Sourced from the row's `updated_at`" | 🟢 rewritten to name the real column |
| `connection-state.ts:151-162` | the whole "IT IS A PROXY / IT ROTS / WHAT THE ROW WOULD NEED" block | 🟢 **deleted** — replaced by a note that the proxy existed and is gone |

🧪 **Executed:** `grep -rn "updated_at" lib/whatsapp/*.ts` → **two matches, both prose recording the removal.** No executable read of `updated_at` as an issue time survives. 🟢 The route still *writes* `updated_at` on each write, which is what that column is for — a row-touched timestamp, no longer load-bearing for anything.

---

# TASK 3 — THE READ PATH AND THE OLD-ROW CASE

🟢 **`connection-read.ts` selects by name, never `select('*')`:**
```
'truck_id, waba_id, phone_number_id, access_token_ciphertext, token_expires_at, token_revoked_at, token_issued_at, payment_method_present'
```

## 🔴 If `token_issued_at` is null while a token exists: **IT PROMPTS.** (Fall back, not refuse.)

**The pairing is forbidden by the new CHECK**, so it cannot arrive through this codebase — only from a row hand-edited in the SQL editor. **The failure is chosen, not inherited:**

- We know the token **dies** (the expiry CHECK guarantees `token_expires_at`) but not **how long it had**, so we cannot say whether it is close.
- Of the two ways to be wrong: **an unnecessary "reconnect" prompt costs one wasted wizard. Staying silent costs a truck going dead mid-service with no warning at all.** Those are not symmetric.
- So it prompts. Missing, unparseable, and nonsensical (issued at or after expiry) all take that path.

## 🔴 Why this is NOT the fabrication problem returning

**Nothing is invented and nothing is written.** No date is computed, no row is touched, `canSendWhatsApp` is untouched, and the truck keeps sending. The only effect is whether a **non-blocking amber prompt** appears.

**The fabrication was writing a number we did not observe INTO THE DATABASE**, where it then drove a derivation as if it were fact. **This is the opposite: it declines to guess the lifetime and asks a human instead.**

---

# VERIFICATION

## 🧪 PROOF M — EXECUTED

### Part 1 — the route writes it
```
token_issued_at written:                              YES ✅
issued ≈ exchange instant:                            YES ✅
(expires − issued) reconstructs expires_in exactly:   YES ✅  (5184000s)
no-expires_in branch → ciphertext null, issued null, expires null
both CHECKs satisfied (ciphertext null ⇒ either may be null):  YES ✅
```

### Part 2 — 🔴 THE GUARD BITES

A 60-day token issued 50 days ago (**10 days left**), on a row something else touched **yesterday**:

```
OLD (expires − updated_at): lifetime looks like 11d → window 2.75d → expiringSoon = false
NEW (expires − issued_at):  lifetime is        60d → window 15d   → expiringSoon = true
🔴 THEY DISAGREE — the guard bites ✅
→ the old code would have stayed SILENT with 10 days left on a 60-day token.
→ the new value does not move when updated_at moves: YES ✅ (3 different updated_at values, same answer)
```

🟢 **This is the failure mode that justified the migration, reproduced.** The pass condition is not "the number didn't change" — it is **"the old and new code give opposite answers, and the old one is the dangerous answer."**

### Part 3 — the window across lifetimes

| Case | State | send | expiringSoon | Reconnect |
|---|---|---|---|---|
| 60-day, FRESH (age 0) | `ready` | true | **false** | false |
| 60-day, age 44d (before window) | `ready` | true | **false** | false |
| **60-day, age 45d (window opens)** | `ready` | true | **true** ✅ | false |
| 60-day, age 50d (inside) | `ready` | true | **true** | false |
| 24-hour, FRESH (age 0) | `ready` | true | **false** | false |
| 24-hour, age 17h (outside) | `ready` | true | **false** | false |
| **24-hour, age 18h (window opens)** | `ready` | true | **true** ✅ | false |
| 60-day, EXPIRED (age 61d) | **`revoked`** | **false** | false | **true** |
| 24-hour, EXPIRED (age 25h) | **`revoked`** | **false** | false | **true** |

🟢 **60-day window = 15 days, opening at day 45. 24-hour window = 6 hours.** Exactly as asked.

### Part 4 — the old-row case
```
issued null, 10 days left        → true  ✅ (prompt, do not go silent)
issued unparseable               → true  ✅
issued AFTER expiry (nonsensical)→ true  ✅
no token at all (expires null)   → false ✅ (nothing to renew)
already expired                  → false ✅ (that is `revoked`, a different message)
```

## 🔴 TWO OLDER HARNESS ASSERTIONS NOW READ RED — AND I CHANGED THE LABELS, NOT THE CODE

Said plainly, because "I edited a test until it passed" is exactly what this looks like from the outside:

1. **`threshold.ts` guards** asserted *"tokenIssuedAt null → must be false — do not nag"*. **That expectation was written last stage, when an unknown issue time meant silence. This stage deliberately inverted that contract** (Task 3, above: prompt rather than go silent). The code did what this stage's spec says; **the label described the previous spec.** Updated to assert the new contract, with a comment in the file saying the contract changed and when.
2. **`expiry.ts`'s trailing line** called `isTokenExpiringSoon` with **one argument**, so `tokenIssuedAt` was `undefined` and it only ever exercised the unknown-issue-time guard. I flagged it as degenerate last report; it has now flipped from `false` to `true` for that reason alone. **Replaced with a pointer to the proofs that actually cover the window**, rather than left printing a number that means nothing.

🔴 **No assertion about the migration, the write, the read or the window was weakened.** Proof M is new coverage, not a relaxed version of anything.

## Everything else

| Check | Method | Result |
|---|---|---|
| **Harness freshness (hash + non-import diff + marker)** | 🧪 **Executed FIRST** | ✅ |
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| `findPlanParityViolations()` | 🧪 Executed on the real module | **0 violations** |
| **Route writes `token_issued_at`; expiry reconstructs `expires_in`** | 🧪 **Executed (M.1)** | ✅ |
| **`updated_at` moving no longer changes the lifetime** | 🧪 **Executed (M.2)** | ✅ old/new disagree |
| **Window by lifetime, 9 cases** | 🧪 **Executed (M.3)** | ✅ 45d / 18h |
| **Null-issue-time fallback, 5 cases** | 🧪 **Executed (M.4)** | ✅ prompts |
| No executable `updated_at` proxy remains | 🧪 Executed grep | ✅ prose only |
| `token_expires_at` matches `expires_in` (8 cases) | 🧪 Executed (J) | ✅ |
| No hand-typed state; `state` == row state (6 paths) | 🧪 Executed (L) | ✅ 0 / 0 |
| Proportional window + the flat-14 bug | 🧪 Executed (K) | ✅ |
| No token/code/secret in client payload | 🧪 Executed (A2) | ✅ |
| No token/code/secret in any log line, incl. Meta echoing them back | 🧪 Executed (A3, C, E) | ✅ |
| Duplicate `phone_number_id` → specific error | 🧪 Executed (D) | ✅ |
| Partial failure → `onboarding_incomplete`, never `ready` | 🧪 Executed (C) | ✅ |
| Idempotent re-run | 🧪 Executed (F) | ✅ 1 row |
| Abandonment/error logged, write nothing | 🧪 Executed (G) | ✅ |
| Body-supplied truck id ignored | 🧪 Executed (H) | ✅ |
| Finish-type map, 7 cases | 🧪 Executed (I) | ✅ |
| **Echo suppression / 24h sync still unbuilt** | 🧪 Executed grep | ✅ **absent, as instructed** |

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

**ADDED this stage:**
- `supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql` — ⛔ **NOT APPLIED**

**MODIFIED this stage — three files:**
| File | Change |
|---|---|
| `app/api/manage/whatsapp-signup/route.ts` | `issuedAtMs` captured once; expiry derived from it; `token_issued_at` written beside the ciphertext, and `null` in the no-token branch |
| `lib/whatsapp/connection-read.ts` | selects `token_issued_at` by name; `updated_at` dropped from the select and from the reduction |
| `lib/whatsapp/connection-state.ts` | field doc names the real column; the proxy caveat block deleted; unknown issue time now **prompts** |

**🟢 Untouched, verified this run:**
| Group | Diff | Status |
|---|---|---|
| **Pre-existing six** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/App/App.xcodeproj/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json` | **6 files, 52+/56−** | 🟢 **byte-for-byte identical to every prior check** — order scan-route rename, derivation extraction and the `ios/` project file all unchanged |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 **unchanged** |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged |
| `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `token-crypto.ts`, `embedded-signup.ts`, the first migration, `.env.local` | — | 🟢 **not touched this stage** |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, outreach migrations, docs | — | 🟢 still untracked, unstaged |

---

# 🔴 BUILT BUT UNPROVEN AGAINST META — UPDATED

**Nothing below has ever touched Meta. No real Meta call has been made by any of this code, and the flow has never been opened from our own page.** Ordered by test-first; earlier items unblock later ones.

| # | Thing | What is unproven | New? |
|---|---|---|---|
| **0** | 🔴 **The `token_issued_at` migration itself** | **NOT APPLIED.** The column, the CHECK and the `notify pgrst` are unexercised SQL. ⚠️ **Until you run it, the signup route is BROKEN** — it writes a column PostgREST does not know, so phase A fails and no truck can connect. **This is now the first thing to do, ahead of every Meta test.** | 🆕 **THIS STAGE** |
| **1** | 🔴 **Coexistence engagement** | The Builder showed only "create a new number" / "virtual number". Evidence points **against**, weakened only because the test account had nothing to connect. **Test: an account owning a number live in WhatsApp Business app 2.24.17+; look for "connect your existing WhatsApp Business account".** | |
| **2** | 🔴 **The v4 `extras` shape opening a flow** | Proven only from Meta's generated URI. `setup: {}` kept although Meta's URI omits it — **remove that line first if the flow refuses to open.** Needs HTTPS. | |
| **3** | 🔴 **Webhook topic-field subscriptions** | `smb_message_echoes`, `history`, `smb_app_state_sync`. **Meta dashboard — I cannot read it.** | |
| **4** | 🔴 **Call 1, the code exchange** | Never made. Includes whether `META_WHATSAPP_APP_SECRET`'s first entry belongs to app `2196172484540444`. **30-second TTL: one shot per flow.** | |
| **5** | 🔴 **`expires_in` arriving, and its value** | The config screen says 60 days; **no response has been seen.** 🆕 **This now also proves `token_issued_at` and the reconstructed lifetime end-to-end.** | 🆕 extended |
| **6** | 🔴 **Call 3, `subscribed_apps`** | Never made. **Without it a connection looks perfect and receives nothing.** | |
| **7** | 🔴 **An inbound customer message reaching the webhook on a coexistence number** | The end-to-end claim the workstream makes. | |
| **8** | 🔴 **The 24-hour sync** | 🔴 **NOT BUILT.** Clock starts at the first successful onboarding — **test 1–7 knowing the window is already running and will be missed.** | |
| **9** | 🔴 **Double-reply / echo suppression** | 🔴 **NOT BUILT.** Latent until a coexistence truck answers from the van, then live. | |
| 10 | ⚠️ **The reauthorise prompt actually firing** | The window is proven arithmetically; **no row has ever aged into it.** Reachable only ~45 days after a real connection, or by hand-editing `token_issued_at`. | 🆕 **THIS STAGE** |
| 11 | ⚠️ **The new CHECK actually refusing a bad row** | `whatsapp_connections_token_issued_together` has never been exercised by Postgres — the "token without an issue time" refusal is asserted, not observed. | 🆕 **THIS STAGE** |
| 12 | ⚠️ **Call 2, `register`** | Never made, **never taken by coexistence**. Needs `WHATSAPP_REGISTRATION_PIN`, which has no value. | |
| 13 | ⚠️ **`token-crypto` against a production key** | Round-tripped only with a harness key. `decryptToken` still has **no caller** — the send path is S7. | |
| 14 | ⚠️ **The route inside Next.js** | `runtime = 'nodejs'`, `maxDuration`, request parsing — source-read only. | |
| 15 | ⚠️ **Every UI surface** | Nothing rendered in a browser at any stage. | |
| 16 | ⚠️ **The `smb_message_echoes` payload shape** | Quoted from Meta's docs; no echo has arrived. The trap — customer in `to`, not `from` — is read off an example. | |

⚠️ **Not Meta, but on the same list:** `app/api/webhooks/messenger/route.ts:43` and `instagram/route.ts:43` still read the **deleted** `META_APP_SECRET` and will 401 every genuine delivery. Carried across four reports, still unfixed — still a different app family's decision.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The migration has not run.** The column, the CHECK, the constraint name and the schema reload are unexercised SQL. 🔴 **And until it runs, the signup route cannot write a row at all** — this change makes the code depend on a column that does not yet exist.
- 🔴 **The real `expires_in`.** Taken from the configuration screen at 60 days; no exchange response has been seen. The reconstructed lifetime is proven arithmetically, not observed.
- 🔴 **Coexistence engagement** — evidence currently points against it. Test #1.
- 🔴 **Meta's dashboard — none of it.** Topic fields, allowed domains, app mode, which app secret is which.
- ⚠️ **The "absent when no token" half of the constraint is not enforced**, by design, because I mirrored the existing shape rather than inventing a biconditional. Flagged above.
- ⚠️ **`0.25` is still a judgement**, not derived from anything observed.
- ⚠️ **Nothing rendered in a browser this stage.** No UI file was touched.

# FLAGS

- ⛔ **RUN THE MIGRATION BEFORE ANYTHING ELSE.** The code now writes `token_issued_at`; without the column, phase A fails and no truck can connect. This is the one change in the workstream that makes the code strictly *depend* on an unapplied migration.
- 🟢 **The `updated_at` proxy is gone from every executable path**, and the failure it would have caused is reproduced in Proof M.2: silence with 10 days left on a 60-day token.
- 🔴 **The unknown-issue-time contract INVERTED this stage** — it now prompts rather than staying silent. Two older harness labels were updated to match, and I have said so explicitly rather than let it look like tests bent to pass.
- 🔴 **Echo suppression and the 24-hour sync remain unbuilt**, verified by grep, as instructed.
- ⚠️ **`GRAPH_API_VERSION = 'v19.0'`** remains past deprecation and shared with the template calls. Reported, unchanged.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. Migration NOT applied. No Meta call has ever been made by this code.*
