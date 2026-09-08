# S1–S3 build — whatsapp_connections, the state read, and the Setup control

**4 September 2026. Branch `whatsapp-connections-s1-s3`. NOTHING COMMITTED, staged, pushed, deployed or cap-synced. Native binary untouched. `git add -A` / `git add .` never run. `main` is untouched and still at `2ca66cd`.**

⛔ **THE MIGRATION HAS NOT BEEN APPLIED. `whatsapp_connections` DOES NOT EXIST until you run the SQL below by hand in the Supabase SQL editor.** Everything in S2/S3 is built to degrade to `not_connected` while it is absent — proven by execution below, not assumed.

**Method per item:** 🔎 **SOURCE-READ**. 🧪 **EXECUTED** — I ran it (`tsc`, the parity checker, and four proof harnesses against copies of the real modules). **I rendered nothing in a browser.**

---

# 🔴 REPORTED BEFORE CHANGING: the state machine had no expiry concept

You asked me to report this before touching a module the scope report found built and correct. 🔎 **`WhatsAppConnectionInput` had no expiry field.** Its only expiry-adjacent member was:

```ts
/** When the token was observed to be revoked or expired. Non-null outranks everything below it. */
tokenRevokedAt: string | null
```

**That is a past-tense observation — "it already broke" — not a future expiry.** Correct while token lifetime was unknown; insufficient now that the configuration is Meta's *"…With 60 Expiration Token"* template. A type that can only report a dead connection cannot offer reauthorisation **before** a truck stops answering customers.

**The smallest extension, and what I did NOT do:** I added **one field**, `tokenExpiresAt: string | null`, plus one derivation line, one named constant and one pure helper. 🟢 **No new state was added and no existing state changed meaning.** A seventh state (`expiring_soon`) was considered and rejected: the affordance is identical to `revoked` (reconnect), it would force every consumer of the union to handle another case, and — decisively — `canSendWhatsApp` is a single equality on `'ready'`, so a new state would **fail closed and stop a truck sending while its token is still valid.** An elapsed expiry maps onto `revoked`, which its own doc already describes as *"revoked **or has expired** at Meta"*.

---

# S1 — STORAGE

## The type, and the mapping field by field

```ts
export interface WhatsAppConnectionInput {
  wabaId: string | null
  phoneNumberId: string | null
  tokenPresent: boolean          // 🔴 A BOOLEAN, NEVER THE TOKEN ITSELF
  tokenRevokedAt: string | null
  tokenExpiresAt: string | null  // ← added, see above
  paymentMethodPresent: boolean | null   // 🔴 NULL MEANS UNREAD, NOT ABSENT
}
```

| `WhatsAppConnectionInput` | Column | Note |
|---|---|---|
| `wabaId` | `waba_id text not null` | absent ⇒ `not_connected` |
| `phoneNumberId` | `phone_number_id text` | null ⇒ `onboarding_incomplete` |
| `tokenPresent` | **derived** from `access_token_ciphertext is not null` | 🔴 the reduction — the ciphertext is consumed server-side and never travels |
| `tokenRevokedAt` | `token_revoked_at timestamptz` | observed revocation |
| `tokenExpiresAt` | `token_expires_at timestamptz` | 60-day tokens; past ⇒ `revoked` |
| `paymentMethodPresent` | `payment_method_present boolean` | `null` = unread, never rendered as "unpaid" |
| — | `business_id text` | returned by the flow; kept for support/Graph calls |
| — | `finish_type text` | 🔴 **coexistence marker** — see below |
| — | `truck_id uuid PK → trucks(id)` | one row per truck |

🟢 **Consumed with no adaptation layer** — `readWhatsAppConnection` maps the row straight onto the type.

🔴 **`finish_type` is stored because it is not derivable later.** `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` means the customer onboarded **their existing WhatsApp Business app number** — the coexistence case, and the one every food truck hits. Losing it loses the ability to tell coexistence trucks from Cloud-API-only ones, which changes what support may assume and what we may tell an operator about their phone. Free text deliberately: Meta may add values, and an unknown one must store rather than fail.

🔴 **`token_expires_at` is load-bearing, enforced by a CHECK rather than a bare NOT NULL:** a row legitimately exists *before* a token does (partial onboarding), so the constraint is *"if you hold a token you must know when it dies"*:
```sql
check (access_token_ciphertext is null or token_expires_at is not null)
```

## The migration SQL

⛔ **Run this by hand. Until you do, the table does not exist.**

```sql
set lock_timeout = '3s';

begin;

create table if not exists public.whatsapp_connections (
  truck_id                 uuid        primary key references public.trucks(id) on delete cascade,
  waba_id                  text        not null,
  phone_number_id          text,
  business_id              text,
  finish_type              text,
  access_token_ciphertext  text,
  token_expires_at         timestamptz,
  token_revoked_at         timestamptz,
  payment_method_present   boolean,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint whatsapp_connections_token_expiry_together
    check (access_token_ciphertext is null or token_expires_at is not null)
);

create unique index if not exists whatsapp_connections_phone_number_id_key
  on public.whatsapp_connections (phone_number_id)
  where phone_number_id is not null;

alter table public.whatsapp_connections enable row level security;

drop policy if exists "service_role only" on public.whatsapp_connections;
create policy "service_role only" on public.whatsapp_connections
  for all to service_role using (true) with check (true);

revoke all on public.whatsapp_connections from anon, authenticated, public;

commit;

notify pgrst, 'reload schema';
```

The file (`supabase/migrations/20260904_whatsapp_connections.sql`) carries the full header, including the reason recorded as instructed: **live routes read `trucks`/`operators` with `select('*')`** (`dashboard/route.ts:92-93`, `manage/route.ts:162`, and `dashboard/route.ts:189` names the pattern), so a token column there would be returned the moment it existed, and **a redaction list fails by omission, silently — the same class as the V12.1 `dashboard_token` exposure.** RLS, the service-role-only policy and the **grant revoke** are all in the same migration.

## Encryption — `lib/whatsapp/token-crypto.ts`

AES-256-GCM, format `v1.<iv>.<tag>.<ciphertext>` (self-describing, so a future rotated scheme is distinguishable without a schema change). Throws rather than defaulting on a missing/malformed key — *"an 'encrypted' column nobody can decrypt is worse than a refused write."*

⚠️ **Stated honestly in the module header and here:** **app-level encryption is NOT protection against a compromised process** — anything that can run our code can read the key and decrypt every row. What it raises the bar on is **dumps, backups and exports**: a stolen `.sql` dump, a copied backup, a support export, a screenshot of a table view. **The first control is the separate table; this is the second layer.** I have not written "encrypted at rest".

**Key env var: `WHATSAPP_TOKEN_ENCRYPTION_KEY`.**
- 🟢 **Server-only. It is NOT `NEXT_PUBLIC_`, and it must never be** — a `NEXT_PUBLIC_` prefix is inlined into the client bundle at build time, which would ship the decryption key to every browser. Verified: `grep -rn "NEXT_PUBLIC_WHATSAPP_TOKEN" lib app` → **0 hits**.
- 🔴 **I did not generate or set a key.** It is absent from `.env.local` (verified, 0 occurrences). Generate 32 bytes (base64 or hex) yourself.
- ⚠️ **A variable set in Vercel is NOT a variable in the running deployment until a redeploy.** Setting it in the dashboard changes nothing about the currently-serving build.

### Key rotation — 🔴 there is no rotation path today
Said plainly rather than implied: **no rotation mechanism exists in this module or anywhere in the repo.** Changing `WHATSAPP_TOKEN_ENCRYPTION_KEY` today makes every stored ciphertext undecryptable, and the only recovery is re-onboarding every truck. What a rotation would need (recorded in the module): a `…_PREVIOUS` var read as a decrypt fallback, a re-encrypt pass over the table, then removing the previous key. The `v1.` prefix exists so that pass can tell schemes apart. ⚠️ Tokens expiring at 60 days means the population re-keys on its own cadence — a mitigating fact, **not** a substitute for rotation after a compromise.

---

# S2 — THE STATE READ AND REAUTHORISATION

`lib/whatsapp/connection-read.ts`. Takes an already-built service-role client (holds no credential itself), reads **named columns** (never `select('*')`), and reduces to the client-safe view. 🟢 **It never imports `token-crypto` and never decrypts** — rendering a state needs to know a token *exists*, not what it says. That is a structural guarantee, not a comment.

## 🧪 PROOF 1 — the token never reaches the client (EXECUTED)

Fed a fully-populated **ready** row whose `access_token_ciphertext` contained a real-shaped secret:

```
keys: [ 'state', 'offerSignup', 'offerReauthorise', 'expiringSoon' ]
payload: {"state":"ready","offerSignup":false,"offerReauthorise":false,"expiringSoon":false}
  ✅ absent: plaintext token
  ✅ absent: ciphertext
  ✅ absent: base64 of token
  ✅ absent: any waba/phone/business id
  ✅ absent: the word token
```

**Every field the browser receives is on that one line.** Not a source read — the payload was serialised and searched for the secret, its base64, the ciphertext envelope and the ids.

## 🧪 PROOF 3 — a missing table cannot fabricate a connection (EXECUTED)

```
[whatsapp/connection-read] read failed, treating as not_connected: relation "whatsapp_connections" does not exist
missing table → {"state":"not_connected","offerSignup":true,"offerReauthorise":false,"expiringSoon":false}
```
🟢 **Fails toward `not_connected`, always** — missing row, missing table or read error. A throw would have taken out the whole Settings tab for a trading truck over a feature they are not using. **No failure path can reach `ready`.**

## The reauthorisation threshold

**`REAUTHORISE_BEFORE_EXPIRY_DAYS = 14`** — one named constant in `connection-state.ts`, never a literal at a call site. Reasoning, so it can be argued with:
- Reauthorisation is **the operator's** action, not ours — they must walk Meta's wizard again, so the window must be long enough for someone cooking six days a week to notice and act.
- Two weeks covers a holiday or a stretch of not opening Manage.
- It is ~23% of the token's life, so the prompt is **absent for most of the cycle** — a nag showing for half the period is one an operator learns to ignore.
- Comfortably longer than a trading week, so it survives a full cycle of their routine.

⚠️ **Expiring-soon is not a state and must not become one.** The truck keeps sending; `canSendWhatsApp` stays `state === 'ready'`.

## 🧪 PROOF 2 — every state and its affordance (EXECUTED)

| Input | State | send | signup | reauth | opAction | support | expSoon |
|---|---|---|---|---|---|---|---|
| no `wabaId` | `not_connected` | false | **true** | false | true | false | false |
| no `phoneNumberId` | `onboarding_incomplete` | false | false | **true** | true | false | false |
| no token | `token_missing` | false | false | false | false | **true** | false |
| `tokenRevokedAt` set | `revoked` | false | false | **true** | true | false | false |
| **`tokenExpiresAt` in the past** | `revoked` | false | false | **true** | true | false | false |
| `paymentMethodPresent === false` | `awaiting_payment_method` | false | false | false | true | false | false |
| all present | `ready` | **true** | false | false | false | false | false |
| expiry in 10 days | `ready` | **true** | false | false | false | false | **true** |

🟢 **`paymentMethodPresent: null` (UNREAD) derives `ready`, not `awaiting_payment_method`** — executed and confirmed. An unread value is never rendered as "you have not paid."

**Affordances rendered:** `not_connected` → **Set up**. `onboarding_incomplete` / `revoked` → **Reconnect**. `token_missing` → needs support, no operator control (they cannot fix it). `awaiting_payment_method` → operator action, but the fix is inside Meta's own account, not our UI. `ready` → no control. `ready` + `expiringSoon` → **Reconnect** prompt while still sending.

🟢 **No connected/disconnected indicator was added anywhere.** Nothing fabricates a state.

---

# S3 — THE SETUP CONTROL

**Replaced `Connect` with `Set up` / `Reconnect`**, chosen by `whatsappConnection?.offerReauthorise` (derived server-side from `shouldOfferSignup` / `shouldOfferReauthorise`).

## 🔴 Decoupled from `saveWhatsappSender` — the guard, quoted

```js
const saveWhatsappSender = async () => {
  if (whatsappSender === lastSavedSender.current) {
    showToast('WhatsApp number saved')
    return                                    // ← the landmine
  }
  …
```
The old button was `onClick={saveWhatsappSender}`. Once it launches a flow, an operator pressing it **without editing the number** hits that early return and gets a **"WhatsApp number saved" toast and no wizard** — a success message for something that did not happen, and worse than the bare `return` it replaced because it is indistinguishable from working.

The new handler shares **no code path**:
```js
const onWhatsAppSetup = () => setSetupNoticeOpen(true)
```
No arguments, no previous value, no branch, no early return.

## 🧪 PROOF 4 — Setup always acts, both cases (EXECUTED)

```
FIELD UNTOUCHED (value unchanged) — the landmine case
   OLD (onClick=saveWhatsappSender): wizard opened = false  ← 🔴 SILENT FAILURE
   NEW (onClick=onWhatsAppSetup):    setup acted   = true  ✅
FIELD EDITED   (value changed)
   OLD (onClick=saveWhatsappSender): wizard opened = false  ← 🔴 SILENT FAILURE
   NEW (onClick=onWhatsAppSetup):    setup acted   = true  ✅
```
The save-on-blur stays on the input, unchanged — saving the number **is** still a save.

## What Setup does in the interim, and exactly what the operator sees

The launcher does not exist (S4), and **Meta requires HTTPS for Embedded Signup domains, so it cannot be exercised on localhost at all.** Pressing **Set up** opens an inline panel beneath the row:

> **Connecting WhatsApp isn't self-serve yet.**
> You'll keep your existing WhatsApp Business number and carry on using it on your phone — we set the connection up with Meta for you. Message us and we'll arrange it.
> *[Close]*

🔴 **It records nothing and claims nothing.** No write, no "request received", no status change — *a receipt with no row behind it is the fabricated state this codebase forbids.* It states what is true (coexistence, manual setup) and who does it. Replace this block with the launcher in S4; **the handler does not change.**

⚠️ If you would rather Setup genuinely lodged a request, that is a real write and a real surface (somewhere for it to land) — a deliberate S3.5, not something to bolt on.

## Config id

**`NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID=2892063604490064`**, added to `.env.local` (gitignored — verified 0 git entries). 🟢 Correctly `NEXT_PUBLIC_`: it is **not a secret**, and Meta's own implementation puts it in client-side JavaScript. S4 has nothing to hunt for.

## Web-only — 🟢 still holds

🔎 Confirmed unchanged: the whole auto-replies card sits inside `{!isNativeApp() && (` … `)}`, with the Connect subsection redundantly wrapped again inside it. **Everything in S3 is web-only and appears on no iPad or Android build.**

---

# S4 CONTRACT — DOCUMENTED, NOTHING BUILT

- **Finish types.** `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` = the customer onboarded **their existing WhatsApp Business app number** (coexistence — the food-truck case). `FINISH` = a number provisioned into the Cloud API instead. Both stored verbatim in `finish_type`.
- 🔴 **The exact success-payload field list and the complete finish-type enumeration must be read from Meta's current v4 documentation. I have not read it and have not invented it.** What is established here is the two finish types above and that the flow returns the WABA id, the phone number id and the business id — the columns exist for them. **Do not scope the exchange route from this bullet; scope it from Meta's docs.** Writing a payload shape I have not verified is precisely the "asserting a state from an earlier read" failure the manual records.
- **Abandoned / error shapes** — same position: **unread, not invented.** The state machine already models the outcome of an abandoned flow (`onboarding_incomplete` — a WABA with no phone number id), so the storage side is ready regardless of the payload's exact shape.
- 🔴 **The 30-second code TTL is the dominant design constraint on the exchange route.** It forces: the exchange must be **server-to-server and immediate** — the client posts the code straight to our route and that route calls Meta at once; **no queue, no retry-later, no background job**, because a retry after 30 seconds is guaranteed to fail. A failed exchange must surface as **`token_missing`** (identifiers stored, no token) so the operator sees "we're fixing it" rather than being told to redo the wizard, and support can retry by re-running the flow rather than by replaying a dead code.
- 🔴 **`account_update` must be subscribed before onboarding works, and it is not.** Two separate gaps: (1) the subscription itself is a **Meta dashboard** setting I cannot read; (2) 🔎 **verified in code — the webhook handles no such field.** It reads `entry.changes[0].value.messages` (`route.ts:136-138`) and nothing else, so an `account_update` payload would arrive and be ignored even once subscribed. **S4 needs a branch there.**
- ⚠️ **The SDK's `FB.init` version is separate from the send-path pin.** 🔎 There is **no SDK version anywhere in the repo** (the launcher is unbuilt — searched `FB.init`, `sdk.js`, `v26`). The only pin is `GRAPH_API_VERSION = 'v19.0'` (`lib/meta-whatsapp.ts:19`), **past its deprecation date and shared by the send path and both template calls.** Latest is v26.0. **Reported; changed nothing.** Do not assume the launcher's version and the sender's pin move together — they are independent decisions.

---

# VERIFICATION

| Item | Source-read / Executed | Result |
|---|---|---|
| `tsc --noEmit` | 🧪 **Executed** | **clean** |
| `findPlanParityViolations()` | 🧪 **Executed** on the real modules | **0 violations** |
| Token absent from client payload | 🧪 **Executed** (Proof 1) | ✅ 4 fields, no token/ciphertext/id |
| All six states + affordances | 🧪 **Executed** (Proof 2) | ✅ table above |
| Missing table → `not_connected` | 🧪 **Executed** (Proof 3) | ✅ never fabricates connected |
| Setup acts in both cases | 🧪 **Executed** (Proof 4) | ✅ both; old handler silently failed both |
| Migration applied | ❌ **NOT APPLIED** — by design | table does not exist |
| Card is web-only | 🔎 Source-read | wrapper unchanged |
| `.env.local` untracked; no key invented | 🧪 **Executed** (`git status`, greps) | ✅ 0 git entries, 0 key occurrences |

## Localhost click-through — Safari, macOS

⚠️ **I rendered none of this.** Hard-refresh (⌘⇧R). Your dev server is on **:3000**.

🔴 **Which states you can actually reach today: only `not_connected`.** The migration is unapplied, so `readWhatsAppConnection` fails to `not_connected` for every truck. **`onboarding_incomplete`, `token_missing`, `revoked`, `awaiting_payment_method`, `ready` and the expiring-soon prompt cannot be reached without a real connection row** — they are covered by Proof 2 instead, and become reachable once you run the migration and insert a row by hand.

1. **Settings loads at all** — `http://localhost:3000/manage/<dashboard_token>` → Settings.
   **See:** the page renders normally. **Wrong if** it errors or the tab is blank — that would mean the connection read is throwing instead of degrading, which Proof 3 says it must not.
2. **The Auto-replies card** — **See:** title "Auto-replies" (no badge), the preview, Channels, the cap line ("up to 3 replies in 24 hours…"), then the WhatsApp row with an editable number input and an orange **Set up** button. **Wrong if** the button still reads **Connect**.
3. 🔴 **The decoupling — the important one.** **Without touching the number field**, press **Set up**.
   **See:** the panel *"Connecting WhatsApp isn't self-serve yet…"*. **Wrong if** you get a **"WhatsApp number saved" toast** and no panel — that is the exact landmine, and it would mean the button is still wired to `saveWhatsappSender`.
4. **Repeat with the field edited** — type a digit, then press **Set up**. **See:** the same panel. **Wrong if** behaviour differs between 3 and 4 in any way.
5. **The save still works** — edit the number and click **outside** the field (blur). **See:** "WhatsApp number saved". **Wrong if** blur no longer saves — the save-on-blur was meant to be untouched.
6. **Close the panel** — press Close. **See:** it disappears; nothing was written, no status appears anywhere.
7. **Native check (cannot be done in Safari):** the entire card must be absent on iPad/Android. Source-confirmed only.

---

# THE TREE

🟢 **Branch: `whatsapp-connections-s1-s3`.** 🟢 **`main` untouched, still `2ca66cd`.** 🟢 **Branch HEAD also `2ca66cd` — no commit was made.** 🟢 **Nothing staged.** No `git add` in any form.

**Files ADDED (untracked):**
1. `supabase/migrations/20260904_whatsapp_connections.sql` — ⛔ not applied
2. `lib/whatsapp/token-crypto.ts`
3. `lib/whatsapp/connection-read.ts`

**Files MODIFIED this stage:**
| File | Diff |
|---|---|
| `lib/whatsapp/connection-state.ts` | +54 (one field, one derivation line, one constant, one helper) |
| `app/api/manage/route.ts` | +13 (the read, and `whatsappConnection` on the payload) |
| `app/manage/[token]/page.tsx` | +164/−31 (state plumbing, Setup control, notice, expiry prompt) — *also carries the earlier copy work* |

🟢 **Untouched, byte-for-byte:**
- **Copy workstream** (`lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts`): `4 files changed, 139 insertions(+), 49 deletions(-)` — unchanged by this stage.
- **Pre-existing uncommitted work**: `6 files changed, 52 insertions(+), 56 deletions(-)` — **identical to every prior check** (order scan-route rename, derivation extraction, `ios/` project file).
- Untracked outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, migrations and docs — all still untracked and unstaged.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The migration is not applied, so nothing in S1 has ever touched a real database.** The table, the CHECK, the RLS and the revoke are unexercised SQL. **Verify after you run it.**
- 🔴 **No admin session, and none attempted.** The Settings card is behind a `dashboard_token` URL rather than admin auth, so the click-through is yours to run — but **I am not claiming any Manage surface renders correctly**; every UI statement here is about code.
- 🔴 **Meta's dashboard — none of it.** Whether `account_update` is subscribed, the app's current mode, the token-expiration setting as displayed. The 60-day lifetime is taken from **your** established fact, not read by me.
- 🔴 **Meta's v4 Embedded Signup payload shape** — not read, and deliberately **not invented**. This is the one place the S4 contract is incomplete, and it is incomplete on purpose.
- ⚠️ **`token-crypto.ts` has never been executed** — no key is configured, so encrypt/decrypt have not run even once. Its correctness is source-read only. **Generate a key and round-trip a string before S5 depends on it.**
- ⚠️ **The expiry threshold (14 days) is a judgement, not a measurement.** Nothing observed says 14 is right; the reasoning is above so you can overrule it in one constant.

# FLAGS

- ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**
- 🔴 **`WhatsAppConnectionInput` was extended by one field** — reported above before the change, minimal and additive, no new state.
- 🔴 **`whatsapp_connections` does not exist until you run the SQL.** Everything degrades to `not_connected` until then, so the Settings card looks identical to before apart from the button label and the notice.
- ⚠️ **`GRAPH_API_VERSION` is still `v19.0`, past deprecation, shared by the sender and both template calls.** Reported, unchanged, as instructed.
- ⚠️ **No key rotation path exists.** Stated plainly rather than implied.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. Migration NOT applied.*
