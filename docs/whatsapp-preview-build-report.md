# WhatsApp setup preview — build report

**15 September 2026.** `WHATSAPP_LIVE` stays `false`. No migration. No SQL. Nothing staged or committed.
tsc clean; lint rule-for-rule identical to HEAD.

🔴 **ONE DEPLOY PREREQUISITE, AND IT IS NOT OPTIONAL: `META_WHATSAPP_PHONE_NUMBER_ID` must be set before
this ships, or Pizzeria Gusto stops replying.** Proven in §6d. Details in §7.

---

## 0. TREE STATE BEFORE EDITING, AND THE ONE DEVIATION I STOPPED ON

```
$ git status --porcelain=v1
 M docs/reference-manual.md
?? docs/whatsapp-golive-review-report.md

$ git rev-parse HEAD        7b51981609055d87c7a396c846f045c7f10185ba
$ git rev-parse origin/main 7b51981609055d87c7a396c846f045c7f10185ba
```

The standing rule expects **only** `docs/reference-manual.md`. There was a second entry — the untracked
review report this task's own CONTEXT instructs me to read. `git diff --name-only -- . ':!docs'` was
**empty**, so no code differed from `origin/main`. I stopped and asked rather than choosing; Dominic
confirmed *"Proceed — it's expected"*. Recorded here because the rule exists to be visible when it fires.

---

## 1. WHAT I READ BEFORE EDITING

### 1a. `canAccess` — `feature_overrides` and trials

`lib/features.ts`, `canAccess(plan, feature, featureOverrides, trialExpiresAt)`:

- **The override wins over everything, first:** `if (feature in featureOverrides) return featureOverrides[feature] === true`.
  Note `in`, not truthiness — an explicit `false` denies even a granted plan.
- **Trials** (the four-argument branch):
  ```ts
  if (plan === 'trial') {
    if (!trialExpiresAt) return PLAN_FEATURES.trial.has(feature)          // not started yet
    if (new Date(trialExpiresAt) <= new Date()) return false              // expired — UNCHANGED
    return PLAN_FEATURES.trial.has(feature)                               // running
  }
  ```
  A **past** date denies **every** feature. A **null** date grants the whole trial set.
- ⚠️ There is a second, three-argument `if (plan === 'trial')` earlier in the file that has no expiry
  context and always grants the trial set — a different function, not the one the webhook calls.

🔴 **This is why the preview key does not go through `canAccess`.** `TRIAL_FEATURES = [...MAX_FEATURES]`
and both live trucks are plan `trial`, so any key in a plan list is inherited by Pizzeria Gusto.

### 1b. Does the manage page already receive `feature_overrides`? **Yes — no API change needed.**

- The route is `app/api/manage/route.ts`, helper `getTruck`, and its select is **`.select('*')`** — **not**
  a hand-picked field list.
- The client type already declares it: `app/manage/[token]/page.tsx`, `interface Truck` —
  `feature_overrides: Record<string, boolean> | null`.
- It is already consumed in eight places, e.g. `const can = (feature: Feature) => canAccess(truck.plan,
  feature, truck.feature_overrides ?? {}, …)`.

⚠️ **The related rule that DOES bite is about writing, not reading.** `update_truck`'s `allowed` array
deliberately excludes `plan`, `trial_expires_at` and `feature_overrides`, with the reason stated at the
site: *"gating state is never writable by a credential the gated party holds."* Nothing in this build
writes any of the three.

### 1c. `WHATSAPP_TOKEN_ENCRYPTION_KEY` — format, failure, and the `_PREVIOUS` name

`lib/whatsapp/token-crypto.ts`, `readKey`:

- **Format: 32 bytes**, supplied as **base64 (44 chars)** or **hex (64 chars)** — `/^[0-9a-fA-F]{64}$/`
  selects hex, anything else is parsed as base64. Algorithm `aes-256-gcm`, 12-byte IV.
- **It throws** when unset/blank, and throws naming the decoded byte count when the length is wrong.
- **`decryptToken` signals failure by THROWING** — either `'[token-crypto] unrecognised ciphertext
  format'` (not four parts, or no `v1.` prefix) or the GCM auth failure raised by `decipher.final()`.
  It never returns null.
- **Ciphertext shape:** `v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>`.
- 🔴 **`WHATSAPP_TOKEN_ENCRYPTION_KEY_PREVIOUS` does NOTHING today.** It appears only inside a comment
  describing a rotation mechanism that the file states plainly does not exist: *"THERE IS NO ROTATION
  MECHANISM IN THIS MODULE TODAY… changing WHATSAPP_TOKEN_ENCRYPTION_KEY right now makes every stored
  ciphertext undecryptable."* **Do not set it expecting an effect.**

### 1d. What makes a connection "ready" — quoted

`lib/whatsapp/connection-state.ts`, `deriveWhatsAppConnectionState`:

```ts
  if (!input.wabaId) return 'not_connected'
  if (input.tokenExpiresAt && new Date(input.tokenExpiresAt).getTime() <= now.getTime()) return 'revoked'
  if (input.tokenRevokedAt) return 'revoked'
  if (!input.phoneNumberId) return 'onboarding_incomplete'
  if (!input.tokenPresent) return 'token_missing'
  if (input.paymentMethodPresent === false) return 'awaiting_payment_method'
  return 'ready'
```

And the send gate: `canSendWhatsApp(state) { return state === 'ready' }` — *"a single equality rather than
a list of 'not these' — a state added later must fail closed."*

⚠️ **A null `token_expires_at` derives as `ready`.** §4 refuses to send on it anyway; see there.

### 1e. Every send

`sendMetaWhatsApp` is defined in `lib/meta-whatsapp.ts` and had **exactly two** call sites, both in
`app/api/webhooks/meta/whatsapp/route.ts`: the **cap handoff** and the **reply**.

🔴 **There is no third send. The "greeting" is not a message.** It is the `isFollowUp` boolean passed into
`generateWhatsAppReply`, which shapes the single reply's text. So "reply, greeting, handoff" is **two**
sends, and both now take the credential.

### 1f. The webhook's client — and yes, it can read `whatsapp_connections`

`app/api/webhooks/meta/whatsapp/route.ts`:
`createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)`.
**Service role**, so the service-role-only RLS policy on `whatsapp_connections` permits the read. No
policy change and no migration are needed.

---

## 2. THE PREVIEW GATE

### 2a. `lib/whatsapp/setup-preview.ts` (new)

```ts
export function hasWhatsAppSetupPreview(overrides: unknown): boolean {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) return false
  return (overrides as Record<string, unknown>)[WHATSAPP_SETUP_PREVIEW_KEY] === true
}
```

- **Never calls `canAccess`**, and `whatsapp_setup_preview` appears in **no** plan list (`lib/features.ts`
  is untouched — see §7).
- **Strict `=== true`.** The realistic admin-console mistake is the **string** `"true"`, which is truthy
  and would switch a live truck's row into an interactive control. It returns false. So do `1`, `"yes"`,
  and the key merely being present.
- Takes `unknown` and never throws: the value arrives as jsonb and as JSON over the wire.

### 2b. Manage page

`app/manage/[token]/page.tsx`, in `SettingsTab` beside `can`:

```ts
const whatsAppSetupVisible = WHATSAPP_LIVE || hasWhatsAppSetupPreview(truck.feature_overrides)
```

Used in exactly two places — the label's colour and the branch predicate
(`{whatsAppSetupVisible && can('whatsapp_replies') ? (`). **The else-branch markup is untouched**, as
required. For any truck without the key the expression is `false || false`, byte-equivalent to the old
`WHATSAPP_LIVE`.

### 2c. Server gate — `app/api/manage/whatsapp-signup/route.ts`

Added immediately after the truck is resolved from the token and **before** the first Graph call and all
three writes (verified by line order: gate at `:144`, exchange `fetch` at `:215`, writes at `:268`,
`:300`, `:398`):

```ts
  if (!WHATSAPP_LIVE && !hasWhatsAppSetupPreview(truck.feature_overrides)) { … 403 … }
```

The truck select gained `feature_overrides` (read only). The refusal is operator-readable: *"WhatsApp
setup is not available for this account yet. Nothing was changed."*

🔴 **It sits above the exchange deliberately** — an Embedded Signup code is single-use, so refusing after
burning one would cost a real operator a second run of the wizard.

**Is there any other route that can start or write a connection? No.** Searched the repo (excluding
`node_modules`, `.next`, `.git`, `docs`, and the native build asset dirs) for `from('whatsapp_connections')`:
three hits, all in `app/api/manage/whatsapp-signup/route.ts`, plus one **read** in
`lib/whatsapp/connection-read.ts`. **One route, one gate.**

### 2d. No POST on abandonment or error

The two outcome checks moved **above** the `fetch`. Both messages are unchanged; only the ordering moved.
Previously, closing Meta's window still POSTed — the server ran its configuration checks and truck lookup
for a flow that had already been abandoned, then the browser said *"Nothing was changed."*

---

## 3. INBOUND ROUTING

`resolveWhatsAppRoute` in **`lib/whatsapp/inbound-route.ts`** (new, pure — no I/O, no Supabase, no env).
The webhook now **fetches**; it no longer **decides**.

| Order | Path | Match |
|---|---|---|
| 1 | `connection` | a **READY** `whatsapp_connections` row whose `phone_number_id` equals the inbound metadata |
| 2 | `truck_column` | `trucks.phone_number_id` equals it |
| 3 | `sender_fallback` | the existing `whatsapp_sender` variants match — **unchanged** |

- **Readiness is not re-derived** — the webhook passes `canSendWhatsApp(deriveWhatsAppConnectionState(…))`,
  so a new state cannot change routing behind the resolver's back.
- 🔴 **Conflict**: if 1 and 2 name **different** trucks, `resolveWhatsAppRoute` returns
  `{ kind: 'conflict', … }`; the webhook logs both truck ids and the `phone_number_id`, sends nothing and
  returns **200**. The conflict test runs **before** precedence, or precedence would hide it for ever.
- ⚠️ A **non-ready** connection row does not block the lower paths — a half-onboarded truck that also has
  a hand-set column still receives on the column it used before.
- ⚠️ **The fallback query is still lazy.** It runs only when nothing else matched, exactly as before, so
  no extra query is added to any inbound for Thai Kitchen or a connected truck.

**Logging added** (no customer number, no message text):
```
[webhook/meta-whatsapp] routed path=<path> truck=<id>
[webhook/meta-whatsapp] PLAN GATE DENIED truck=<id> plan=<plan> feature=whatsapp_replies decision=deny — nothing sent.
[webhook/meta-whatsapp] ROUTING CONFLICT phone_number_id=… connection_truck=… truck_column_truck=…
```
🟢 The plan gate was a bare `return` — a suppressed reply left no trace anywhere and was
indistinguishable from the webhook never firing.

**Unchanged:** every message-handling path returns 200; the plan gate and the reply cap stay before the
classifier; the greeting's `isFollowUp` computation is untouched.

---

## 4. SEND CREDENTIAL

`chooseSendCredential` in `lib/whatsapp/inbound-route.ts`, resolved **before** the classifier.

| Path | Credential |
|---|---|
| `connection` | **decrypt that row's token.** Refuse — send nothing, log, 200 — if the ciphertext is null, `token_revoked_at` is set, `token_expires_at` is null or past, or decryption throws. 🔴 **Never falls back to `META_WHATSAPP_ACCESS_TOKEN`.** |
| `truck_column` | platform token — Thai Kitchen's hand-set Meta test number, unchanged |
| `sender_fallback` | platform token **only if** the inbound `phone_number_id` equals `META_WHATSAPP_PHONE_NUMBER_ID`; otherwise refuse and log |

- **`sendMetaWhatsApp` now takes the access token as its fourth argument** and refuses an empty one
  (an empty token would reach Meta as `Bearer ` and return a 401 the caller would log as *"Meta
  refused"*, hiding our bug inside theirs).
- **The platform env var is read in exactly one place**: `platformAccessToken()` in `lib/meta-whatsapp.ts`.
- 🔴 **Resolved before the classifier on purpose** — `generateWhatsAppReply` is a model call, and paying
  for a reply we then cannot deliver is money spent to produce nothing.
- ⚠️ **It is stricter than `canSendWhatsApp`.** A null `token_expires_at` derives as `ready` and the
  table's CHECK forbids a stored ciphertext with no expiry — but *forbidden by a constraint* is not
  *cannot arrive*, and a token of unknown lifetime is one we cannot say is live.
- ⚠️ The refusal `reason` is a fixed sentence from a closed set; the decrypt error is caught and
  discarded inside the pure function so no key material or ciphertext shape can reach a log.

### Reconnect for expired and revoked — **already covered, no change made**

Executed against the real functions:

```
  healthy   state=ready                  Reconnect offered: false
  EXPIRED   state=revoked                Reconnect offered: true
  REVOKED   state=revoked                Reconnect offered: true
  no phone  state=onboarding_incomplete  Reconnect offered: true
```

`deriveWhatsAppConnectionState` maps **both** an elapsed `tokenExpiresAt` and a non-null `tokenRevokedAt`
to `'revoked'`, and `shouldOfferReauthorise` is `state === 'onboarding_incomplete' || state === 'revoked'`.
**Nothing needed adding.**

### Graph version — one constant, and what moved

**`lib/whatsapp/graph-version.ts` (new): `GRAPH_VERSION = 'v21.0'`.**
`lib/meta-whatsapp.ts` re-exports it as `GRAPH_API_VERSION` (the name four consumers already use).

| Consumer | Was | Now |
|---|---|---|
| `sendMetaWhatsApp` — the send URL | v19.0 | **v21.0** |
| `listMessageTemplates` | v19.0 | **v21.0** |
| `createMessageTemplate` | v19.0 | **v21.0** |
| the diagnostics object in `lib/meta-whatsapp.ts` | v19.0 | **v21.0** |
| onboarding (`ONBOARDING_GRAPH_VERSION`) | v21.0 | v21.0 — unchanged |
| the browser SDK (`SDK_GRAPH_VERSION`) | v26.0 | **v26.0 — deliberately NOT included** |

🔴 **The send path moved UP to meet onboarding, not the reverse** — onboarding's version is the
constrained end. ⚠️ **The two template functions are the ones to watch**: they are admin-only and never on
a truck's path, but template field shapes are what Meta actually revises between releases. Verify the
admin templates page after deploying.

---

## 5. ECHO AND NON-MESSAGE LOGGING

Any change carrying no `messages` array now logs **the field name and the top-level key names of its
value** — no values, no numbers, no text:

```
[webhook/meta-whatsapp] non-message change field=<field> value_keys=<sorted,key,names>
```

This covers delivery statuses, template status updates, and `smb_message_echoes`. 🟢 **No behaviour is
added for echoes** — acting on one means deciding what an operator's own reply does to the reply cap and
to the greeting's first-message-of-the-day test, which is a product decision, not a logging one.

---

## 6. PROOFS

### 6a/6b. The harness, and the mutation controls that come first

The harness takes its three functions as **arguments**, so identical assertions run against the real
implementations and against deliberately broken variants. **A harness that imports what it tests cannot
be shown to detect anything.**

```
── MUTATION CONTROLS: each MUST report FAILURE ──
  ✓ FAILED as required  V1 routing order swapped (truck_column before connection)
        caught: route: 🔴 connection BEATS truck_column when both name the same truck
        caught: route: 🔴 conflict when they name DIFFERENT trucks
  ✓ FAILED as required  V2 connection path falls back to the PLATFORM token
        caught: cred: 🔴 expired token → refuse, never platform
        caught: cred: 🔴 revoked token → refuse, never platform   …and 7 more
  ✓ FAILED as required  V3 preview helper accepts the string "true"
        caught: preview: 🔴 the STRING "true" → false
        caught: preview: 1 → false

── THE REAL CODE ──
✅ all 33 passed
```

Scenarios covered: Gusto-shaped truck · Thai-Kitchen-shaped truck · ready connection · not-ready
connection (payment method false) · expired · revoked · null expiry · null ciphertext · decrypt failure ·
connection-for-a-different-number · conflict · preview key `true` / `"true"` / `1` / `false` / missing /
null / undefined / array.

⚠️ **One assertion failed on the first run against correct code, and it was my harness.** The helper used
`over.platformPnid ?? PLATFORM_PNID`, so passing `null` — the case under test — silently restored the real
value. Fixed to `'platformPnid' in over ? … : …`. It had also contaminated V1 and V3's detection lists; after
the fix both still fail, for the right reasons only (V1 on precedence and conflict, V3 on the string).

### 6c. What each proof would look like if it proved nothing

| Proof | If it proved nothing | How that was ruled out |
|---|---|---|
| **Routing order** | A fixture where only one path can match passes under any order. | V1 swaps the order and the harness fails on two assertions — the same-truck precedence case and the conflict case, both of which need two simultaneous matches. |
| **Connection never uses the platform token** | Asserting only that a healthy connection yields the truck token — true even if the unhealthy cases silently fell back. | Five unhealthy cases each assert `kind === 'refuse'` **and** that no `accessToken` field exists; V2 adds exactly that fallback and the harness fails on all ten. |
| **Preview strictness** | Testing only `true` and `missing` — both behave identically under truthiness. | `"true"`, `1` and `false` are asserted; V3 uses truthiness and fails on `"true"` and `1`. |
| **Gusto unchanged** | Reading the code and asserting the expression is equivalent. | Both predicates are **evaluated** side by side (§6d) and printed. |
| **Reconnect coverage** | Grepping for `'revoked'` in `shouldOfferReauthorise`. | The state machine is **run** over four inputs, showing expired and revoked both derive to `revoked` and both offer Reconnect. |

### 6d. 🔴 GUSTO — before and after, evaluated not asserted

Inputs exactly as specified: `plan: 'trial'`, `feature_overrides: {}`, `whatsapp_sender: '07380736226'`,
`phone_number_id: null`, no connection row.

```
── MANAGE PAGE: the WhatsApp row branch predicate ──
  before: WHATSAPP_LIVE                   = false
  after : WHATSAPP_LIVE || hasPreview({}) = false
  ✓ IDENTICAL — Gusto still sees the disabled else-branch

── WEBHOOK: route + credential ──
  route = matched/sender_fallback truck=pizzeria-gusto   (unchanged: sender_fallback, as today)
  META_WHATSAPP_PHONE_NUMBER_ID SET    → platform  ✓ same token as today
  META_WHATSAPP_PHONE_NUMBER_ID UNSET  → refuse    🔴 GUSTO WOULD STOP REPLYING
```

**Manage page: identical.** The else-branch markup is untouched, and the predicate evaluates the same.

**Webhook: identical *provided* the new env var is set.** Gusto routes `sender_fallback` exactly as
today and sends on the platform token exactly as today. 🔴 **If `META_WHATSAPP_PHONE_NUMBER_ID` is not
set, Gusto's replies stop.** That is the one way this change can touch the trading truck, it is entirely
a deploy-configuration matter, and it is why §7 lists the variable as a prerequisite rather than a
follow-up. The refusal names itself in one log line if it ever happens.

### 6e. TypeScript and lint

- **`npx tsc --noEmit -p .` — clean, no output.**
- **Lint:** the four changed files that exist at HEAD, same eslint and config, HEAD in a detached
  worktree vs the working tree — **287 errors / 75 warnings on both sides, every rule count identical.**
- The three new files lint **0 errors / 0 warnings** on their own.

---

## 7. FINISH

```
$ git status --porcelain=v1
 M app/api/manage/whatsapp-signup/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/manage/[token]/page.tsx
 M docs/reference-manual.md
 M lib/meta-whatsapp.ts
?? docs/whatsapp-golive-review-report.md
?? lib/whatsapp/graph-version.ts
?? lib/whatsapp/inbound-route.ts
?? lib/whatsapp/setup-preview.ts

$ git diff --stat
 app/api/manage/whatsapp-signup/route.ts |  23 +-
 app/api/webhooks/meta/whatsapp/route.ts | 220 ++++++++++++++--
 app/manage/[token]/page.tsx             |  40 ++-
 docs/reference-manual.md                | 448 +++++++++++++++++++++++++++++++-
 lib/meta-whatsapp.ts                    |  35 ++-
 5 files changed, 723 insertions(+), 43 deletions(-)
```

| File | Why |
|---|---|
| `lib/whatsapp/setup-preview.ts` **(new)** | the preview gate — one strict boolean off `feature_overrides` |
| `lib/whatsapp/inbound-route.ts` **(new)** | `resolveWhatsAppRoute` + `chooseSendCredential`, both pure |
| `lib/whatsapp/graph-version.ts` **(new)** | one Graph version for every server-side Meta call |
| `app/api/webhooks/meta/whatsapp/route.ts` | uses both pure functions; credential before the classifier; path / plan-gate / conflict / non-message logging |
| `app/api/manage/whatsapp-signup/route.ts` | preview gate above the exchange and all writes; select gained `feature_overrides` |
| `app/manage/[token]/page.tsx` | `whatsAppSetupVisible` on the WhatsApp row; outcome checks moved above the POST |
| `lib/meta-whatsapp.ts` | token is an argument; `platformAccessToken()` is the single env reader; shared Graph version |
| `docs/reference-manual.md` | **pre-existing** — the V13.2 manual update from an earlier task, untouched here |
| `docs/whatsapp-golive-review-report.md` | **pre-existing** — the earlier review, untouched here |

**Not changed, as instructed:** `lib/whatsapp-live.ts` (still `false`), `lib/plan-features.ts`,
`lib/landing-table.ts`, `app/landing/page.tsx`, footnotes, `lib/features.ts` plan lists, the
Messenger/Instagram webhooks, the reply-cap limits, and the else-branch markup of the WhatsApp row.

### Before deploying

1. 🔴 **`META_WHATSAPP_PHONE_NUMBER_ID`** — **NEW, and required.** The `phone_number_id` of the
   platform's own Meta test number, exactly as Meta reports it in the webhook metadata (an opaque digit
   string, not the display number). **Without it Gusto stops replying** (§6d). It exists nowhere in the
   repo today — verified by search, with `META_WHATSAPP_ACCESS_TOKEN` as the positive control.
2. **`WHATSAPP_TOKEN_ENCRYPTION_KEY`** — 32 bytes as **base64 (44 chars)** or **hex (64 chars)**. Needed
   only for the `connection` path; without it `encryptionKeyConfigured()` refuses onboarding, and any
   existing connection refuses to send rather than falling back.
   ⚠️ Do **not** set `WHATSAPP_TOKEN_ENCRYPTION_KEY_PREVIOUS` — it does nothing (§1c).
3. **`META_WHATSAPP_ACCESS_TOKEN`**, **`META_WHATSAPP_APP_SECRET`** — already required; unchanged.
4. **Set the preview key on the test truck only**, in the admin console, as a real JSON boolean:
   `feature_overrides.whatsapp_setup_preview = true`. **The string `"true"` will not work, by design.**
   Do not put it on `pizzeria-gusto`.

### After deploying

1. **Gusto first.** Send it a WhatsApp and confirm a reply. The log must read
   `routed path=sender_fallback truck=pizzeria-gusto`. If instead you see `NO USABLE CREDENTIAL …
   reason=sender fallback: inbound number is not the platform number`, item 1 above is wrong or missing.
2. **Thai Kitchen** — confirm `routed path=truck_column` and a reply, unchanged.
3. **Manage → Settings on Gusto** — the WhatsApp row must still show a **disabled** input and no button.
4. **Manage → Settings on the test truck** — the **Set up** button should now appear.
5. **Run Embedded Signup on the test truck**, then close Meta's window mid-flow once: the browser must
   say *"Setup was closed before it finished"* and **no** request should reach `/api/manage/whatsapp-signup`.
6. **Admin → WhatsApp templates** — confirm the list still loads on Graph **v21.0** (§4).
7. **Watch for `non-message change field=…`** lines to learn whether Meta is sending `smb_message_echoes`
   at all. Nothing acts on them yet.

### Scope

No migration was written or needed — the service-role client already reads `whatsapp_connections` under
its existing RLS, and every column used is in the schema Dominic supplied. **No SQL appears in this
report.** Nothing staged, committed, stashed, checked out, reset or restored.
