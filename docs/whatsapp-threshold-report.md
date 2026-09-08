# The reauthorise window is now a fraction of the token's own life

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED.

⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

🟢 **Noted and used:** configuration `1544768623597981` is set to **60-day token expiration**, read off the Facebook Login for Business configuration screen. So `expires_in` will be present, and **the no-expiry branch is a genuine error path, not the normal case.** That retires the largest open risk from the previous report — "if this configuration issues permanent tokens, no truck can connect" is now answered: it does not.

---

# 🔴 THE HARNESS FRESHNESS CHECK — DONE FIRST, BEFORE ANY RESULT IS QUOTED

Last time the harness silently ran a pre-edit copy and every case came back at 60 days. **This time freshness is verified by hash, before the proofs, and the check is now part of the run:**

```
token-crypto.ts          ✅ IDENTICAL (549dcf15…67fa6c)
connection-state.ts      ✅ IDENTICAL (ebba9cb0…3fec4d)
embedded-signup.ts       ✅ IDENTICAL (724a260a…e2ccf06)
webhook-signature.ts     ✅ IDENTICAL
connection-read.ts       → diff vs source: ONE line, the import specifier
route.ts                 → diff vs source: SEVEN lines, all import specifiers
```

🧪 **`shasum -a256` on each copied module against its source** — three byte-identical, plus `diff` on the two that are rewritten, showing **only** import-specifier lines and nothing else.

🧪 **And a marker check, because a hash proves sameness but not recency** — the harness copy must contain *this stage's* edits:
```
REAUTHORISE_WINDOW_FRACTION in harness connection-state.ts:  3 occurrences
tokenIssuedAt in harness connection-read.ts:                 3 occurrences
REAUTHORISE_BEFORE_EXPIRY_DAYS, executable uses:             0  (1 match, in the comment recording its removal)
```

🟢 **Every number below was produced by the edited modules.**

---

# TASK 1 — PROPORTIONAL ✅

## The constant

```ts
export const REAUTHORISE_WINDOW_FRACTION = 0.25
```

🟢 **ONE named constant.** No literal at any call site — 🧪 `grep` for executable uses of the old `REAUTHORISE_BEFORE_EXPIRY_DAYS` returns **0**; the single textual match is the comment recording why it went.

**Why a quarter:**
- Reauthorisation is the **operator's** work — they walk Meta's wizard again — so the window has to be a meaningful share of the cycle, not a token gesture.
- It is **absent for the first three quarters of every token's life, whatever that life is.** A prompt that shows for half the cycle is furniture; one that appears in the last quarter is news.
- It **scales both ways with no edit here**: a longer-lived token gets a proportionally longer warning; a shorter-lived one stops being permanently nagged.

## 🟢 Against today's 60-day token it lands at 15 days — one day earlier than the 14 it replaces

**Yes, today's behaviour is effectively unchanged**, and that is deliberate: this fixes the short-token case **without moving the case that was already reasoned about**. The prompt now opens at day 45 of 60 instead of day 46.

⚠️ **Still a judgement, not a measurement.** Nothing observed says a quarter is right. It is one constant so it can be overruled in one place.

## 🔴 Where the lifetime comes from — and the honest caveat

**`tokenExpiresAt − tokenIssuedAt`, both from the stored row.** `tokenIssuedAt` is a new field on `WhatsAppConnectionInput`, sourced from the row's **`updated_at`**.

🟢 **Why that works and needs no migration:** `updated_at` is `timestamptz not null default now()`, so it is always present, and 🧪 **the only writer of `whatsapp_connections` anywhere in the codebase is the signup route** (verified: three write sites, all in `app/api/manage/whatsapp-signup/route.ts`, plus one read in `connection-read.ts`). That route sets `updated_at` **in the same statement that stores the token**, so today the two are seconds apart and the derived lifetime is exact.

🔴 **BUT IT IS A PROXY, NOT A PURPOSE-BUILT COLUMN, AND IT ROTS THE DAY ANYTHING ELSE UPDATES THE ROW.** The first future writer to fill in `payment_method_present` would push `updated_at` forward, making the token look **shorter-lived than it is** and **shrinking** the window. 🔴 **That is the dangerous direction — the prompt would arrive later, not earlier.**

**What the row would need to make this robust** (asked for, and answered): a **`token_issued_at timestamptz`** column written beside `token_expires_at`, or a **`token_lifetime_seconds int`**. Either is a hand-applied migration and is **deliberately not done here**. Until then the rule is recorded at the function: **any new writer of this table must either leave `updated_at` alone or add that column.**

## 🧪 PROOF K — EXECUTED

```
REAUTHORISE_WINDOW_FRACTION = 0.25
  → against a 60-day token that is 15 days (was a flat 14)
  → against a 24-hour token that is 6 hours (was 14 DAYS = the whole life)
```

| Case | State | send | expiringSoon | Reconnect |
|---|---|---|---|---|
| **60-day token, FRESH (age 0)** | `ready` | true | **false** | false |
| 60-day, age 44d (1 day before the window) | `ready` | true | **false** | false |
| 60-day, age 45d (**window opens**) | `ready` | true | **true** | false |
| **60-day token, INSIDE window (age 50d)** | `ready` | true | **true** | false |
| **24-hour token, FRESH (age 0)** | `ready` | true | **false** ✅ | false |
| 24-hour, age 17h (outside) | `ready` | true | **false** | false |
| 24-hour, age 19h (inside) | `ready` | true | **true** | false |
| **60-day token, ALREADY EXPIRED (age 61d)** | **`revoked`** | **false** | false | **true** |
| 24-hour token, ALREADY EXPIRED (age 25h) | **`revoked`** | **false** | false | **true** |

**The bug, shown directly:**
```
24-hour token, FRESH:  OLD (flat 14 days) = true    NEW (fraction of life) = false
60-day  token, FRESH:  OLD (flat 14 days) = false   NEW (fraction of life) = false
```
🟢 **The 24-hour token no longer screams from birth. The 60-day token behaves as it did.**

**Guards — the window must never nag on an unknown or nonsensical row:**
```
tokenIssuedAt null             → false   (do not nag)
tokenExpiresAt null            → false
issued AFTER expiry (life ≤ 0) → false
unparseable timestamps         → false
```
⚠️ **Failing to `false` here means "do not nag", never "do not send".** The send gate is a separate equality on `'ready'` and is untouched by this function.

⚠️ **One stale line, flagged rather than quoted as evidence.** Proof J's closing line still prints `isTokenExpiringSoon(now+24h) = false`. That call now passes only one argument, so `tokenIssuedAt` is `undefined` and the guard returns false — **it is a degenerate call, not a signal.** Proof K is the real coverage. Left in place and labelled rather than deleted, so the previous report's quoted line can be traced.

---

# TASK 2 — NO PATH TYPES A STATE BY HAND ✅

## Static — 🧪 executed against the ROUTE SOURCE (not the harness copy), comment lines excluded

```
route.ts:87   type Ok = { ok: true; state: string; message: string; connection: WhatsAppConnectionView }
route.ts:109  return NextResponse.json<Ok>({ ok: true, state: connection.state, connection, message })
route.ts:148  return NextResponse.json({ ok: true, state: 'unchanged', message: 'Logged.' })

hand-typed connection states: 0   (must be 0)
ok() call sites:              8
```

🔴 **The first run of this check reported "1 (must be 0)" — a false positive.** It was matching the comment that *documents* the old bug (`state: 'token_missing'`). **I tightened the check to skip comment lines rather than explain the number away**, because a check whose red number needs explaining is one nobody trusts the next time it goes red.

**Line 148 is the only literal, and it is correct:** the abandonment/error diagnostics reply. 🧪 It **writes no row** (proven: `rows written: 0`), so `'unchanged'` is not a connection state at all — there is no row to derive one from.

## Dynamic — 🧪 every reachable success path, `state` vs the row

| Path | `state` | `connection.state` | |
|---|---|---|---|
| happy path (coexistence) | `ready` | `ready` | ✅ |
| no `expires_in` | `onboarding_incomplete` | `onboarding_incomplete` | ✅ |
| no phone number (`FINISH_ONLY_WABA`) | `onboarding_incomplete` | `onboarding_incomplete` | ✅ |
| register fails (no PIN) | `onboarding_incomplete` | `onboarding_incomplete` | ✅ |
| subscribe fails | `onboarding_incomplete` | `onboarding_incomplete` | ✅ |
| duplicate `phone_number_id` (23505) | `onboarding_incomplete` | `onboarding_incomplete` | ✅ |

**Disagreements: 0.**

🟢 **All 8 `ok()` call sites** — the eight success returns — go through the one helper that reads the connection back and sets `state` from it. **There is nowhere left in this route to type a connection state.**

🔴 **The echo suppression and the 24-hour sync remain SCOPED AND UNBUILT, deliberately.** 🧪 Verified unchanged: no `smb_app_data`, `sync_type`, `smb_message_echoes` or `smb_app_state_sync` anywhere in `app` or `lib`.

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| **Harness runs the edited modules** | 🧪 **Executed — hash + diff + marker, BEFORE any proof** | ✅ |
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| `findPlanParityViolations()` | 🧪 Executed on the real module | **0 violations** |
| **Proportional window, 9 cases** | 🧪 **Executed (K, new)** | ✅ table above |
| **Window guards, 4 cases** | 🧪 **Executed (K, new)** | ✅ all false |
| **No hand-typed state, static** | 🧪 **Executed (L, new)** | ✅ 0, 8 `ok()` sites |
| **`state` == row state, 6 paths** | 🧪 **Executed (L, new)** | ✅ 0 disagreements |
| `token_expires_at` matches `expires_in` (3 lifetimes) | 🧪 Executed (J) | ✅ exact |
| Absent/0/negative/non-numeric/null `expires_in` stores no token | 🧪 Executed (J) | ✅ 5 cases |
| No token/code/secret in the client payload | 🧪 Executed (A2) | ✅ |
| No token/code/secret in ANY log line — success | 🧪 Executed (A3) | ✅ |
| …exchange failure, **code echoed in Meta's error body** | 🧪 Executed (E) | ✅ |
| …call-3 failure, **token echoed in Meta's error body** | 🧪 Executed (C) | ✅ |
| State derives from a row this route wrote | 🧪 Executed (B) | ✅ |
| Duplicate `phone_number_id` → specific error | 🧪 Executed (D) | ✅ |
| Partial failure → `onboarding_incomplete`, never `ready` | 🧪 Executed (C) | ✅ |
| Idempotent re-run | 🧪 Executed (F) | ✅ 1 row |
| Abandonment + error logged, write nothing | 🧪 Executed (G) | ✅ 0 rows |
| Body-supplied truck id ignored | 🧪 Executed (H) + grep | ✅ |
| Finish-type map, 7 cases | 🧪 Executed (I) | ✅ unchanged |
| Only one writer of `whatsapp_connections` | 🔎 Source-read grep | ✅ the signup route |
| Echo suppression / 24h sync still unbuilt | 🧪 Executed grep | ✅ absent |

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

**MODIFIED THIS STAGE — three files:**
| File | Change |
|---|---|
| `lib/whatsapp/connection-state.ts` | `REAUTHORISE_BEFORE_EXPIRY_DAYS` → `REAUTHORISE_WINDOW_FRACTION = 0.25`; `tokenIssuedAt` added to the input; `isTokenExpiringSoon` takes the issue time and computes the lifetime |
| `lib/whatsapp/connection-read.ts` | selects `updated_at`, passes it as `tokenIssuedAt` |
| `app/manage/[token]/page.tsx` | the comment naming the window updated |

## Every file in the S1–S5 workstream

**NEW (untracked):**
1. `supabase/migrations/20260904_whatsapp_connections.sql` — ✅ **applied in production**
2. `lib/whatsapp/token-crypto.ts` — AES-256-GCM, server-only
3. `lib/whatsapp/connection-read.ts` — the S2 reduction
4. `lib/whatsapp/embedded-signup.ts` — the S4 v4 launcher
5. `app/api/manage/whatsapp-signup/route.ts` — the S5 three-call route

**MODIFIED (tracked) — `3 files changed, 334 insertions(+), 39 deletions(-)`:**
| File | Diff |
|---|---|
| `app/manage/[token]/page.tsx` | +260/−… (Setup control, launcher wiring, state plumbing) |
| `lib/whatsapp/connection-state.ts` | +100 |
| `app/api/manage/route.ts` | +13 |

**`.env.local`** (gitignored): `NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID` → `1544768623597981`, `NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID` added.

**🟢 UNTOUCHED, verified this run:**
| Group | Diff | Status |
|---|---|---|
| **Pre-existing six** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/App/App.xcodeproj/project.pbxproj`, `lib/custom-domain/copy.ts`, `proxy.ts`, `vercel.json` | **6 files, 52+/56−** | 🟢 **byte-for-byte identical to every prior check** — order scan-route rename, derivation extraction and the `ios/` project file all unchanged |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 **unchanged** |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, outreach migrations, docs | — | 🟢 still untracked, unstaged |

---

# 🔴 BUILT BUT UNPROVEN AGAINST META — THE TEST LIST

**Everything below has only ever run against a harness, a stub or a scripted Graph. 🔴 NO REAL META CALL HAS EVER BEEN MADE BY ANY OF THIS CODE, AND THE FLOW HAS NEVER BEEN OPENED FROM OUR OWN PAGE.** Ordered by what I would test first — earlier items block later ones.

| # | Thing | What is unproven | Blocks |
|---|---|---|---|
| **1** | 🔴 **Coexistence engagement** | The Builder showed only "create a new number" / "virtual number". Evidence points **against**, weakened only because the test account had nothing to connect. **Test: a Meta account owning a number live in WhatsApp Business app 2.24.17+; look for "connect your existing WhatsApp Business account" at the WABA step.** | everything |
| **2** | 🔴 **The `extras` v4 shape actually opening a flow** | Proven only from Meta's generated URI. `setup: {}` is kept although Meta's URI omits it — **if the flow refuses to open, remove that line first.** Needs HTTPS. | 3–9 |
| **3** | 🔴 **The webhook topic-field subscriptions** | Whether `smb_message_echoes`, `history`, `smb_app_state_sync` are subscribed. **Meta dashboard — I cannot read it.** | 7, 8 |
| **4** | 🔴 **Call 1, the code exchange** | Never made. Includes whether `META_WHATSAPP_APP_SECRET`'s first entry belongs to app `2196172484540444`. **30-second TTL means one shot per flow.** | 5–9 |
| **5** | 🔴 **`expires_in` arriving, and its value** | The config screen says 60 days; **no response has been seen.** Confirms both the expiry write and that the no-expiry branch stays an error path. | — |
| **6** | 🔴 **Call 3, `subscribed_apps`** | Never made. **Without it a connection looks perfect and receives nothing.** | 7 |
| **7** | 🔴 **An inbound customer message reaching the webhook on a coexistence number** | The end-to-end claim the whole workstream makes. | — |
| **8** | 🔴 **The 24-hour sync** | 🔴 **NOT BUILT.** The clock starts at the first successful onboarding — **so test 1–7 knowing the window is already running and will be missed.** | — |
| **9** | 🔴 **Double-reply / echo suppression** | 🔴 **NOT BUILT.** Latent until a coexistence truck answers from the van, then live. | — |
| 10 | ⚠️ **Call 2, `register`** | Never made, and **never taken by coexistence**. Needs `WHATSAPP_REGISTRATION_PIN`, which has no value. Only reachable via a non-coexistence finish type. | — |
| 11 | ⚠️ **`token-crypto` against a production key** | Round-tripped only with a harness key. `decryptToken` still has **no caller** — the send path is S7. | — |
| 12 | ⚠️ **The route inside Next.js** | `runtime = 'nodejs'`, `maxDuration`, request parsing — source-read only. | — |
| 13 | ⚠️ **Every UI surface** | Nothing rendered in a browser at any stage. The Setup button, the tri-tone panel and the expiry prompt are code-verified only. | — |
| 14 | ⚠️ **The `smb_message_echoes` payload shape** | Quoted from Meta's docs; **no echo has ever arrived.** The trap I flagged — customer in `to`, not `from` — is read off an example. | — |

⚠️ **Not Meta, but on the same list:** `app/api/webhooks/messenger/route.ts:43` and `instagram/route.ts:43` still read the **deleted** `META_APP_SECRET` and will 401 every genuine delivery. Carried forward across three reports, still unfixed — still a different app family's decision.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The real `expires_in`.** The configuration screen says 60 days and I am taking that as given; **no exchange response has been seen.** If it is not 60, the window follows automatically — that is the point of the fraction — but the "15 days ≈ today's 14" claim would move.
- 🔴 **Whether `updated_at` will stay a valid issue-time proxy.** True today because one writer exists. **A future writer breaks it silently and in the dangerous direction.** The guard is a comment, not a mechanism — the mechanism is a column and a migration.
- 🔴 **Coexistence engagement** — see the test list. Evidence currently points against.
- 🔴 **Meta's dashboard — none of it.** Topic-field subscriptions, allowed domains, app mode, which secret is which.
- 🔴 **No real Meta call, ever.** Every proof runs against a scripted Graph and a recording client.
- ⚠️ **`0.25` is a judgement.** It is not derived from operator behaviour, retention data or anything observed — only from the reasoning printed beside it.
- ⚠️ **Nothing rendered in a browser this stage.** `page.tsx` changed by one comment.

# FLAGS

- 🟢 **The fixed-day threshold is gone.** One constant, proportional, proven across 9 cases and 4 guards; today's 60-day behaviour effectively unchanged (15 days vs 14).
- 🔴 **`updated_at` is a proxy for the token's issue time.** Exact now, rots on the next writer, and the fix is a `token_issued_at` column — a migration, deliberately not taken.
- 🟢 **No response can disagree with the row any more** — 8 call sites, one helper, 0 hand-typed states, 0 disagreements across 6 paths.
- 🔴 **The double-reply defect and the 24-hour sync remain unbuilt**, as instructed, and both go live on the first real coexistence onboarding.
- 🔴 **Coexistence engagement is unproven with evidence against it** — test 1 on the list.
- ⚠️ **`GRAPH_API_VERSION = 'v19.0'`** remains past deprecation and shared with the template calls. Reported, unchanged.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. No Meta call has ever been made by this code.*
