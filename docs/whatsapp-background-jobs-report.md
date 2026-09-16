# WhatsApp background jobs — build report

**Workstream:** `whatsapp-background-jobs` · **Date:** 16 September 2026 · **Branch:** `main` · **HEAD at start:** `a05ecc9`

---

## 0. Two premises in the brief that were wrong, and one I got wrong myself

These are first because two of them required changes the brief did not name, and the third corrects something I reported during Step 1.

### 0.1 `sendConfirmationEmail` could not report a failed send — so Step 4's release rule was unimplementable as written

Step 4 says: insert the alert row first, send, and **if the send fails, delete the alert row so it can retry**. But `lib/email.ts`'s sender returned `Promise<void>` and swallowed every failure — a missing API key, a Brevo rejection, a network error — logging and returning. There was no way for a caller to know whether anything was sent.

Without a change there, "if the send fails" can never be true, every claim is permanent, and a failed alert is suppressed forever. That is precisely the failure the release rule exists to prevent.

**Change made:** `sendConfirmationEmail` now returns `Promise<boolean>`. It still **never throws**. All 13 existing call sites write `await sendConfirmationEmail(...)` and ignore the result, so widening `void` → `boolean` changes nothing for any of them.

### 0.2 `sendMetaWhatsApp` threw a plain `Error` with Meta's body inlined — error 131042 could only have been detected by string-matching

`lib/meta-whatsapp.ts` threw `` new Error(`Meta WhatsApp error ${status}: ${body}`) ``. Detecting a billing refusal would have meant regex-matching Meta's prose, which is localised and reworded without notice — a matcher that silently stops matching.

**Change made:** a `MetaSendError` subclass carrying `status`, `code` and `subcode`, plus `isPaymentBlockedError(err)` and the named constant `META_ERROR_PAYMENT_ISSUE = 131042`. **The message string is byte-identical to before**, so existing log lines and catch blocks that only stringify it read exactly as they did.

### 0.3 🔴 I was wrong in Step 1 about the admin address

I reported that no admin notification address existed and that `ADMIN_ALERT_EMAIL` would be a new environment variable. It does exist: `ADMIN_ALERT_TO = 'admin@hatchgrab.com'` in `lib/custom-domain/alert.ts`, a deliberate constant with its reasoning written beside it — *"Not an env var: it is not a secret, it is not per-environment, and a missing variable would silently route the one email that matters to nobody."*

The three admin alerts reuse that constant. **No `ADMIN_ALERT_EMAIL` variable was added.** This workstream adds exactly one new environment variable (§8).

---

## 1. Step 1 — what the reads established

| Question | Answer |
|---|---|
| Cron/job pattern | Vercel `crons` in `vercel.json` → a route under `app/api/cron/`, authorised by `Bearer $CRON_SECRET` with a `verifyAdmin` fallback. Six existing jobs; this is the seventh. **Step 6b is config, not SQL.** |
| Email library | Brevo, `https://api.brevo.com/v3/smtp/email`, via `sendConfirmationEmail`. See §0.1. |
| Admin address | `ADMIN_ALERT_TO` constant. See §0.3. |
| Operator address | `trucks.contact_email`, nullable and blank on plenty of trucks. |
| Admin console pattern | `verifyAdmin(req)` → bare `{ error }` 401; client page carries `nativeAuthHeader()`; the page holds no authority. |
| Signup token exchange | `app/api/manage/whatsapp-signup/route.ts` — `client_id` from `NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID`, `client_secret` from `parseMetaAppSecrets(META_WHATSAPP_APP_SECRET)`. |
| Webhook send-result handling | The reply's `whatsapp_logs` insert was **fire-and-forget** via `.then()`. |
| Manage link | `${NEXT_PUBLIC_HATCHGRAB_URL}/manage/${truck.dashboard_token}?tab=<tab>`, as `app/api/inbound-schedule/route.ts` already builds it. |

---

## 2. Step 2 — the three Meta functions

`lib/whatsapp/meta-admin.ts`. Pure parsers plus injectable fetchers. **None of them throws**; each returns a discriminated result.

| Function | Call | Returns |
|---|---|---|
| `refreshBusinessToken` | `GET /oauth/access_token` · `grant_type=fb_exchange_token`, `client_id`, `client_secret`, `set_token_expires_in_60_days=true`, `fb_exchange_token` | new token + `expires_in`, or `code`/`subcode` only |
| `inspectBusinessToken` | `GET /debug_token?input_token=…`, authorised `Bearer <app_id>\|<app_secret>` | `isValid`, `expiresAt`, `scopes` |
| `readPaymentStatus` | `GET /{waba_id}?fields=primary_funding_id` | `'added'` / `'missing'` / `'error'` |

### The decisions worth naming

- **🔴 The funding id is never returned or logged.** `parsePaymentStatus` reduces it to a boolean at the parse boundary — the single line where it could otherwise escape.
- **🔴 An error is never `'missing'`.** Writing `payment_method_present = false` because a call failed would put a claim about the operator's Meta account in the database on the strength of a network blip.
- **🔴 An unreadable 200 from `debug_token` is an error, not `isValid: false`.** Returning "invalid" for a shape change at Meta would let one bad response revoke every connection in the table on a single nightly run.
- **🔴 `expires_at: 0` means *never expires*** — Meta's sentinel, not 1970.
- **⚠️ `set_token_expires_in_60_days=true` is sent but not trusted.** `token_expires_at` is computed from the `expires_in` Meta actually returned; a null means Meta did not say, and the stored expiry is left alone rather than overwritten with a fabricated 60 days.
- **Meta's error `message` is discarded entirely.** Codes only — see §2b.

### 2b. 🔴 Two of these put the token in the query string, so the URL is secret material

`fb_exchange_token` and `input_token` are query parameters; Meta offers no header form. **There is not one `console.*` call anywhere in `meta-admin.ts`** — deliberately, so there is no line for a later "log the URL for debugging" edit to attach itself to. Meta's error prose on these endpoints can echo the request, which is why only numeric codes are returned. Proved mechanically by V8 (§7).

---

## 3. Step 3 — admin actions and display

- `app/api/admin/whatsapp-connections/route.ts` — `GET` lists every connection (makes **no Meta calls**); `POST` runs `check_token`, `check_payment`, `refresh_token`.
- `app/admin/whatsapp-connections/page.tsx` — the table, at `/admin/whatsapp-connections`.

**🔴 No response from this route contains a token, a ciphertext, or a funding id.** The GET reports token *presence*, expiry and derived days-remaining. "Admin" is not a reason to put a live business token into a browser tab, a proxy log, or a screenshot pasted into a support thread.

- "Refresh token now" is the only action that writes a live credential, and it is the only one that confirms. It is deliberately **not** gated on `WHATSAPP_TOKEN_AUTO_REFRESH` — that flag governs what happens *unattended at 3am*, and an admin pressing a button is the attended case it was protecting.
- 🔴 If Meta issues a new token and the database write then fails, the response says so plainly: the old token is already dead and the truck must reconnect. Reporting success there would be the worst outcome in the file.
- Not linked from the admin console, for the same reason the templates page is not: a nav item means editing the 1,700-line `app/admin/page.tsx` that carries live plan and feature-override controls.

---

## 4. Step 4 — the six emails and the claim sequence

`lib/whatsapp/alert-copy.ts` (six pure builders) and `lib/whatsapp/alerts.ts` (the sender).

| Kind | To | Period key |
|---|---|---|
| `limit_80`, `limit_100`, `payment_blocked` | operator (`trucks.contact_email`) | `YYYY-MM`, the truck's **local** month |
| `token_refresh_failing`, `token_refresh_urgent`, `token_invalid` | admin (`ADMIN_ALERT_TO`) | `YYYY-MM-DD`, the UTC day |

**🔴 The operator/admin split is not cosmetic.** An operator can act on "you are running out of replies" and "add a card in WhatsApp Manager". An operator can do *nothing* about an OAuth refresh failing. So the admin emails may name internals — truck id, Meta error codes, expiry timestamps — and **the operator emails must not**.

**⚠️ Both allowance emails state that customers can still message the truck and that every message still arrives.** An operator reading "WhatsApp has paused" will reasonably conclude they are off the air. Only the automatic *reply* stops. Leaving that unsaid turns a courtesy warning into a panic.

**⚠️ `payment_blocked` does not say "you have no payment method".** It says Meta is refusing the sends for billing. The card may exist and have expired or been declined — telling someone to add a card they already added is how a true alert gets dismissed as broken.

### The sequence: claim → send → release-on-failure

1. `INSERT` the `whatsapp_alerts` row with `ignoreDuplicates` (`on conflict do nothing`).
2. **No returned row ⇒ someone else claimed it ⇒ send nothing.**
3. Only the winner sends.
4. A failed send `DELETE`s the row, restoring the retry.

**🔴 Why insert first.** Checking "have we emailed yet?" and then sending is check-then-act, and the webhook is where it bites: two customer messages crossing the 80% line milliseconds apart both read "not yet" and both send. Making the insert the check moves the decision into the database, where the unique constraint arbitrates. There is no window between deciding and recording, because the record *is* the decision.

**🔴 Why `claim` returns false on an error as well as on a conflict.** Both mean *we do not hold the claim*, and sending without the claim is the one thing that must not happen. It fails closed: with the migration unapplied the insert errors, nothing is claimed, and **no email is sent** rather than a duplicate one.

**⚠️ The accepted failure mode.** A process dying between a successful send and a successful nothing can send twice. Accepted knowingly: the alternative ordering (send, then record) fails the other way — a crash after sending means the alert is never recorded and fires on every subsequent run. Between "occasionally twice" and "possibly forever", and between a duplicate warning and a suppressed one, duplicates win every time.

**🔴 What is logged: truck id and alert kind. Nothing else.** Not the recipient — that is the operator's personal email address.

---

## 5. Step 5 — webhook changes

`app/api/webhooks/meta/whatsapp/route.ts`.

### 5a. The reply's log insert is now awaited

It was fire-and-forget. **That row is the monthly counter** — the spend ceiling, the Settings usage line and the 80%/100% emails are all a `count` over these rows. An un-awaited insert can be cut off when the serverless invocation ends at the `return`, so a message Meta billed the operator for is never counted and the ceiling they chose silently leaks. It still cannot fail the request: the error is logged and the 200 returned regardless.

### 5b. The 80% / 100% emails

Fired after a **counted** send, from both send sites (the reply and the customer-cap handoff — the handoff is billable too).

**🔴 `usageAlertDue` asks "are we at or past the line?", not "did we just cross it?"** A crossing test gets the wrong answer whenever anything is counted out of order, a send is retried, or the operator **lowers their limit mid-month** and jumps past a line they never crossed. Sending only once is not that function's job at all — that is the unique constraint. Two mechanisms, each doing one thing.

**⚠️ A failed count read sends nothing.** `monthCountBefore` is null in the fail-open branch, and null is never treated as zero — zero would read as "this truck has sent nothing this month".

### 5c. Error 131042 → `payment_blocked_at`

On a billing refusal the column is set (first refusal only, so it records when the problem *started*) and the operator is emailed. Cleared on the next send Meta accepts.

**🔴 `payment_blocked_at` is deliberately NOT added to the webhook's `CONNECTION_FIELDS`.** That select is what finds the truck's own send credential, and the migration is applied by hand — so appending the column would make the whole select fail with `42703` until someone runs the SQL, silently downgrading a paying truck to the platform token or stopping it sending. It is read and written through `lib/whatsapp/payment-block.ts`, which tolerates the column's absence. The flag is worth having; it is not worth putting in front of the send path.

### 5d. The Settings banner

`whatsAppRowView` gains `showPaymentBlockedBanner`; `app/manage/[token]/page.tsx` renders a red banner directly under the WhatsApp header.

**🔴 It outranks the amber allowance note, which is suppressed while it shows.** Both are about paying Meta, and "you may exceed the free allowance" buries "your replies are not going out right now" under something that merely might happen.

**🔴 `readWhatsAppConnection` asks for the column, then asks again without it if that fails.** This function turns any read error into `not_connected`, so an unconditional select would blank a trading truck's WhatsApp box and offer to set up a connection it already has.

---

## 6. Step 6 — the daily job

`app/api/cron/whatsapp-maintenance/route.ts`, registered in `vercel.json` at `0 3 * * *` (03:00 UTC). Config only — nothing was run.

```json
{ "path": "/api/cron/whatsapp-maintenance", "schedule": "0 3 * * *" }
```

Per connection: inspect → conditionally refresh → read payment status.

- **🔴 It never emails an operator. Not once, for any outcome.** Everything it learns is plumbing. Its three alerts all go to the admin. The operator alerts fire from the webhook, on a real customer message — which is when they are both true and actionable.
- **🔴 Refreshing is gated on `WHATSAPP_TOKEN_AUTO_REFRESH === 'on'`, exactly.** Unset, `'true'`, `'1'`, `'ON'`, a stray space — all off. This flag decides whether a cron rewrites live credentials for every connected truck unattended, so enabling it should take a deliberate, exact act and every typo should land on the side where nothing is rewritten. **The flag gates the write, not the look:** inspection and payment status still run with it off, so the admin console and the alerts keep working while automatic refreshing stays parked.
- **Refresh threshold: 30 days of a 60-day token**, giving thirty consecutive chances to succeed. A failed refresh is normal (rate limits, dropped networks); a threshold tight enough to look efficient would turn one bad week into a dead connection.
- **🔴 Safe to run twice**, three ways: the token alerts are keyed on the UTC day so a second run's claim loses; a second run will not attempt a refresh because the first pushed the expiry past the threshold; and every write is an overwrite of an observation, never an increment.
- **It refuses rather than skips** when the encryption key or app credentials are missing — reporting "0 refreshed" over a total outage would be a silent all-clear.

---

## 7. Step 7 — proofs

`scripts/whatsapp-background-jobs-harness.cjs`. Every function is passed in as an argument, so the identical assertions run against the real code and against eight broken variants.

```
── BROKEN VARIANTS: each MUST report FAILURE ────────────────────────────────
  ✓ FAILED as required  V1 a 200 with no access_token counts as a successful refresh
  ✓ FAILED as required  V2 an unreadable debug_token 200 is read as "token invalid"
  ✓ FAILED as required  V3 a failed payment lookup is recorded as "no payment method"
  ✓ FAILED as required  V4 the alert sends BEFORE it claims the row (check-then-act)
  ✓ FAILED as required  V5 a failed send keeps the claim, silencing the alert forever
  ✓ FAILED as required  V6 expires_at 0 is read as 1970 instead of "never expires"
  ✓ FAILED as required  V7 the allowance threshold is an exact-crossing test
  ✓ FAILED as required  V8 a failed inspection revokes the connection
  ✓ FAILED as required  V8b the log scanner catches a bare AND an interpolated URL, and ignores prose
✅ all 48 passed
```

### V8 — the log scan, and a correction it forced

The scanner walks every `console.*` call in all seven new files and flags forbidden identifiers in the arguments. Its first version flagged a real line:

```
🔴 app/api/cron/whatsapp-maintenance/route.ts: console.error mentions `token`
```

That line is `console.error('[whatsapp-maintenance] token encryption key not configured')` — the **word**, in a message string, logging nothing. **The scanner was wrong, not the code.** It now strips plain string literals and keeps only `${…}` expressions inside template literals, because that is where an interpolated token would appear. Left as it was, the first person to hit that false positive would have weakened the pattern until it caught nothing.

Its own control (V8b) now proves all three cases: a bare identifier is caught, an interpolated one is caught, and prose containing the word is not.

### Everything else

| Check | Result |
|---|---|
| `scripts/whatsapp-background-jobs-harness.cjs` | ✅ 48 passed, 8 variants + scanner control all failed first |
| `scripts/whatsapp-connection-view-harness.cjs` | ✅ 87 passed |
| `scripts/whatsapp-settings-row-harness.cjs` | ✅ 131 passed |
| `scripts/whatsapp-setup-machine-harness.cjs` | ✅ 30 passed |
| `npx tsc --noEmit` | ✅ clean, whole project |
| eslint, 7 modified files vs a clean `HEAD` worktree | **284 errors / 75 warnings at HEAD, 284 / 75 now — delta 0 on every rule** |
| eslint, 8 new files | ✅ 0 problems |

---

## 8. Step 8 — the tree, and the environment

```
 M app/api/webhooks/meta/whatsapp/route.ts      the awaited log insert, thresholds, 131042
 M app/manage/[token]/page.tsx                  the payment-blocked banner
 M lib/email.ts                                 sendConfirmationEmail returns boolean (§0.1)
 M lib/meta-whatsapp.ts                         MetaSendError + isPaymentBlockedError (§0.2)
 M lib/whatsapp/connection-read.ts              payment_blocked_at, with the retry fallback
 M lib/whatsapp/connection-view.ts              showPaymentBlockedBanner
 M lib/whatsapp/usage.ts                        usageAlertDue + USAGE_WARN_FRACTION
 M vercel.json                                  the 03:00 UTC cron entry
?? lib/whatsapp/meta-admin.ts                   the three Meta functions
?? lib/whatsapp/maintenance.ts                  the daily job's pure decisions
?? lib/whatsapp/alerts.ts                       claim → send → release
?? lib/whatsapp/alert-copy.ts                   the six emails
?? lib/whatsapp/payment-block.ts                the column, tolerant of it not existing
?? app/api/cron/whatsapp-maintenance/route.ts   the daily job
?? app/api/admin/whatsapp-connections/route.ts  the three admin actions
?? app/admin/whatsapp-connections/page.tsx      the admin table
?? scripts/whatsapp-background-jobs-harness.cjs the proofs
?? supabase/migrations/20260916_whatsapp_alerts.sql  ⛔ UNAPPLIED
```

### ⚠️ Two modified files carry earlier workstreams' changes as well

`git diff --stat` reports 492 changed lines in `app/manage/[token]/page.tsx` and 144 in `scripts/whatsapp-settings-row-harness.cjs`. Most of that is the box-layout, channel-boxes and payment-row workstreams, which were already uncommitted when this one began (you approved building on them). **Git cannot separate them.** This workstream's own contribution to `page.tsx` is the banner block plus two lines: `paymentBlockedAt` into the view call, and clearing it in the disconnect reset.

### ⛔ The migration is NOT applied

`supabase/migrations/20260916_whatsapp_alerts.sql` creates `whatsapp_alerts` and adds `whatsapp_connections.payment_blocked_at`. It must be run by hand in the Supabase SQL editor, and its last line — `notify pgrst, 'reload schema';` — must not be skipped.

**Until it is applied, everything degrades to today's behaviour and nothing breaks:** the alert claim fails, so **no emails are sent** rather than duplicate ones; `connection-read` retries without the column and the WhatsApp box renders exactly as it does now; the banner never shows. The send path is untouched either way.

### Environment variables

**New — one:**

- **`WHATSAPP_TOKEN_AUTO_REFRESH`** — set to exactly `on` to let the nightly job refresh tokens. Anything else, including unset, means off. Every other part of the job runs regardless. **Leave it unset until you have watched the admin console's "Refresh token now" work against a real connection.**

**Existing, now also read by the new code:** `CRON_SECRET`, `NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID`, `META_WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `NEXT_PUBLIC_HATCHGRAB_URL`.

---

## 9. Pizzeria Gusto

The only trading truck. Nothing it sees changes until the migration is applied, and after that only if Meta actually refuses one of its sends for billing. Its send path, credential selection and reply behaviour are unchanged; the one behavioural difference is that its `whatsapp_logs` row is now written before the response returns instead of possibly being dropped — which makes its monthly counter more accurate, never less.
