# WhatsApp go-live — read-only review

**15 September 2026. READ-ONLY.** No file changed except this report. No index or working-tree command
run. No network call, no package install, no SQL. Environment variables are named, never valued.

**Search exclusions used throughout:** `node_modules`, `.next`, `.git`, and the two native **build-output**
asset directories (`ios/App/App/public`, `android/app/src/main/assets`, excluded as `public`/`assets`).
Native *source* stayed searchable. No search was scoped by file extension.

---

## STEP 0 — TREE STATE

```
$ git status --porcelain=v1
 M docs/reference-manual.md

$ git rev-parse HEAD
7b51981609055d87c7a396c846f045c7f10185ba

$ git rev-parse origin/main
7b51981609055d87c7a396c846f045c7f10185ba

$ git diff --stat
 docs/reference-manual.md | 448 ++++++++++++++++++++++++++++++++++++++++++++++-
 1 file changed, 442 insertions(+), 6 deletions(-)

$ git diff --cached --stat
(empty — nothing staged)
```

**HEAD == origin/main.** There is exactly **one** uncommitted file and **zero** untracked files.

| Workstream | Files |
|---|---|
| Documentation | `docs/reference-manual.md` (modified — the V13.2 manual update) |
| outreach | none uncommitted — landed in `4d4e5b6` |
| logo | none uncommitted — landed in `7b51981` |
| other | none |

🔴 **Stated plainly: NO uncommitted file touches WhatsApp, Meta, plan-features, the operator manage page
or the landing page.** The single modified file is a `.md` document. Verified:
`git diff --name-only -- . ':!docs'` returns **empty**, so **every line of code reviewed below is exactly
what is on `origin/main`.** Its diff does *mention* WhatsApp in prose (21 added lines match
`whatsapp|meta ` case-insensitively), but it changes no executable code.

---

## STEP 1 — THE FLAG

### 1a. Definition and readers

**One definition**, `lib/whatsapp-live.ts:27` — read this session:

```ts
export const WHATSAPP_LIVE: boolean = false
```

**Value in HEAD: `false`. Value in the working tree: `false`.** Identical — the file is unmodified
(`git show HEAD:lib/whatsapp-live.ts` tail matches, and the code diff is empty).

**Every file that reads it** (complete list from `grep -rln "WHATSAPP_LIVE"` with the exclusions above):
`app/landing/page.tsx` · `app/manage/[token]/page.tsx` · `lib/landing-table.ts` · `lib/plan-features.ts`
· `lib/whatsapp-live.ts` itself.

*Control:* the same invocation returned 28 hits for `WHATSAPP_LIVE` and, separately, found
`sendMetaWhatsApp` in `app/api/webhooks/meta/whatsapp/route.ts` — the search finds things.

### 1b. Which manual claim is current

🔴 **The V12.5 claim is current; the older claim is stale. The code wins.**

- ✅ **CURRENT:** the flag lives in `lib/whatsapp-live.ts`, committed **`false`**.
- ❌ **STALE:** "a module-level boolean in `app/manage/[token]/page.tsx` set true". That page now
  **imports** it — `app/manage/[token]/page.tsx:37`, `import { WHATSAPP_LIVE } from '@/lib/whatsapp-live'`.
  There is no local declaration: every `WHATSAPP_LIVE` hit in that file is either the import or a comment
  or a render-site read.
- ❌ **The V12.5 claim that flipping it "moves the landing tile from last to fifth" is ALSO WRONG.** The
  tile position is a **hard-coded literal**, not flag-derived: `app/landing/page.tsx:352` says in a
  comment "*Flipping WHATSAPP_LIVE moves it up to fifth (above) in the same edit*" — i.e. **by hand, in
  the same edit**, not automatically. The flag swaps *which of two `<div className="does-item">` literals
  renders* (`:342` vs `:360`), and each already sits at its own position in the source. Flipping the flag
  alone does not re-order the grid.

### 1c. Every surface whose output changes when the flag flips

| Surface | What changes | Symbol |
|---|---|---|
| **Landing — "what it does" tile** | one of two hard-coded tiles renders; the `Coming soon` badge disappears | `app/landing/page.tsx:342` / `:360` |
| **Landing — Pro-card bullets** | `:539` ternary swaps a split pair of bullets for one welded "coming soon" bullet | `app/landing/page.tsx:539`, `:541`, `:543` |
| **Pricing/feature matrix row** | `pro/max` go `'coming_soon'` → `true`, and the footnote marker moves `'4'` → `'6'` | `lib/plan-features.ts:299–301` |
| **Footnote 6 itself** | **only exists when the flag is true** — `...(WHATSAPP_LIVE ? [ … ] : [])` | `lib/plan-features.ts:540` |
| **Landing table overrides** | `DETAIL_OVERRIDES`, `NAME_OVERRIDES`, `HIDDEN_ROWS` all collapse to empty | `lib/landing-table.ts:67`, `:82`, `:104` |
| **Compare page** | inherits the matrix — it imports from `lib/plan-features` (`app/compare/CostComparison.tsx:40`) | — |
| **Manage → Settings, WhatsApp row** | live branch renders an editable `<input type="tel">` **and** a **Set up / Reconnect** button; else branch renders a **disabled** input | `app/manage/[token]/page.tsx:9974` |

🔴 **Native iOS/Android: NOTHING changes.** The whole auto-replies card sits inside
`{!isNativeApp() && (` at `app/manage/[token]/page.tsx:9824`. **Flipping the flag creates no control in
the native shell.** (Answer to 2d as well.)

**Operator signup/onboarding wizard: no surface.** The complete list of flag-reading files (1a) contains
no signup or onboarding component.

⚠️ **One flag-independent regression, recorded at the site:** `app/manage/[token]/page.tsx:10033–10035`
states the "Coming soon" badge was deleted from the **else** branch. So if the flag were flipped **true**
and later **back to false**, the row would render a disabled input **with no "coming soon" label at all**.

### 1d. Instagram and Messenger — NOT controlled by this flag

🔴 **Flipping `WHATSAPP_LIVE` would not make Instagram or Messenger appear live anywhere.**

| Surface | What controls it |
|---|---|
| Matrix row `'Messenger & Instagram auto-replies'` | a **hard-coded literal**: `starter: false, pro: 'coming_soon', max: 'coming_soon'` — `lib/plan-features.ts:303`. No ternary, no flag. |
| Manage → Settings Instagram/Messenger rows | `isRowComingSoon(MESSENGER_INSTAGRAM_ROW)` — `app/manage/[token]/page.tsx:10091`, which reads the matrix row above |
| Landing tile copy | prose inside the two WhatsApp tiles: "Messenger and Instagram coming soon" (`:343`) / "to follow" (`:361`) |
| Landing Pro-card bullet | `:541` hard-coded `Coming soon` badge |
| The webhooks | `app/api/webhooks/instagram/route.ts` and `app/api/webhooks/messenger/route.ts` are **verify-handshake + log stubs** — they parse, `console.log` the payload and return. No classifier call, no send. |

So the founder's belief that three channel rows are controlled by one flag is **wrong**: the WhatsApp row
is flag-derived; the Messenger & Instagram row is a separate hand-maintained literal, and the two would
have to be edited independently.

### 1e. Is the WhatsApp matrix row derived from the flag? YES — and the parity guard is blind to it

**Derived**, not a second hand-maintained value — `lib/plan-features.ts:299`:

```ts
      WHATSAPP_LIVE
        ? { name: 'WhatsApp auto-replies', footnote: '6', … pro: true,         max: true }
        : { name: 'WhatsApp auto-replies', footnote: '4', … pro: 'coming_soon', max: 'coming_soon' },
```

**The parity guard is `findPlanParityViolations()` in `lib/plan-features.ts`.** Read in full this
session. Its whole test is:

```ts
        if (row[tier] === true && !canAccess(tier, feature)) {
```

🔴 **It does not read `WHATSAPP_LIVE`, and it cannot catch the mismatch that exists today.** Three
reasons, each from the code above:

1. **It only inspects cells that are literally `true`.** While the flag is `false` the WhatsApp cells are
   the string `'coming_soon'`, so the row is **skipped entirely**.
2. **It is one-directional** — "advertised but not allowed". The reverse, *"allowed but advertised as
   coming soon"*, is never tested. That reverse **is today's state**: `whatsapp_replies` is in
   `PRO_FEATURES` (`lib/features.ts:51`), so `canAccess('pro','whatsapp_replies')` is `true` while every
   marketing surface says coming soon.
3. **It `continue`s when a row has no `ROW_FEATURE_MAP` entry**, so a rename silently drops a row from
   the check — recorded in the file's own comments at `:285–289` and `:372`.

*What this check would look like if it were proving nothing:* if I had only grepped for the identifier
`findPlanParityViolations` and found it, I would have concluded "a guard exists" without knowing it is
structurally blind. I ruled that out by reading the function body and its single comparison.

---

## STEP 2 — WHAT "CONNECT" DOES

### 2a. The control, and its network calls

🔴 **First, the naming: there is no "Connect" button any more.** The control is
`<button onClick={onWhatsAppSetup}>` at `app/manage/[token]/page.tsx:10002`, labelled
**`Set up`** or **`Reconnect`** (`:10009`, chosen by `whatsappConnection?.offerReauthorise`).

**With the flag `false` — which is today — the button does not render at all**, so it can make **no**
network call. The else branch renders a `disabled` input only (`:10026`).

**With the flag `true`**, `onWhatsAppSetup` (read in full) does, in order:

1. Reads `NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID` and `NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID` (names only).
   If either is missing it shows *"WhatsApp setup is not available in this environment."* and returns —
   **no call**.
2. `await launchEmbeddedSignup({ appId, configId })` — loads Meta's SDK and opens the popup.
3. `await fetch('/api/manage/whatsapp-signup', { method: 'POST', … })`.

🔴 **Both, not either — and the two are decoupled on purpose.** Saving the number is a *separate* path:
`onBlur={saveWhatsappSender}` on the input beside it (`:9979`). The comment at `:9983–9997` records why:
the button used to be `onClick={saveWhatsappSender}`, whose early return meant pressing it without
editing the field produced a *"WhatsApp number saved"* toast **and no wizard**.

⚠️ **One defect visible in the ordering:** the `fetch` on step 3 runs **before** the
`outcome.kind === 'abandoned'` and `=== 'error'` checks. So closing Meta's window still **POSTs to the
server**, and only afterwards does the client show *"Nothing was changed."*

### 2b. SDK loading and configuration ID

- **SDK:** `lib/whatsapp/embedded-signup.ts:132` — `const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'`,
  injected as a `<script>` at `:168`, memoised so two presses cannot inject twice, and `FB.init(...)` with
  `xfbml: true` and `version: SDK_GRAPH_VERSION` (`:153–154`).
- **Configuration ID:** `process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID` — **an env var, name only**,
  read at `app/manage/[token]/page.tsx:9271` and passed straight through.

**The two IDs, searched across the WHOLE repo including `docs/`:**

| ID | Hits in **executable code** | Hits elsewhere |
|---|---|---|
| `2892063604490064` | **0** | `app/api/manage/whatsapp-signup/route.ts:59` (**comment**), `supabase/migrations/20260904_whatsapp_connections.sql:27` (**SQL comment**), 4 docs |
| `1544768623597981` | **0** | `app/api/manage/whatsapp-signup/route.ts:60`, `lib/whatsapp/embedded-signup.ts:38`/`:41`, `lib/whatsapp/connection-state.ts:62` (**all comments**), 5 docs |

🔴 **Neither ID is referenced by any executable line.** Which configuration is actually used is decided
entirely by the env var, which is not in the repo — see COULD NOT DETERMINE.
*Control:* the same search style found `NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID` at
`app/manage/[token]/page.tsx:9271`, so it does find live code.

### 2c. Version, extras, and finish handling

All four read from executable lines in `lib/whatsapp/embedded-signup.ts`:

| Constant | Value | Line |
|---|---|---|
| `COEXISTENCE_FEATURE_TYPE` | `'whatsapp_business_app_onboarding'` | `:54` |
| `SESSION_INFO_VERSION` | `'3'` | `:60` |
| `EMBEDDED_SIGNUP_VERSION` | `'v4'` | `:66` |
| `SDK_GRAPH_VERSION` | `'v26.0'` | `:75` |

Sent at `:297–299` as `featureType` / `sessionInfoVersion` / `version`, alongside
`response_type: 'code'` and `override_default_response_type: true` (`:285–286`).

**Event handling** (`:209–233`): the listener refuses any origin that is not `facebook.com` (`:203`) and
any payload whose `type !== 'WA_EMBEDDED_SIGNUP'`. Then:

- `event === 'CANCEL'` **with** `error_message`/`error_code` → `{ kind: 'error' }`
- `event === 'CANCEL'` **without** → `{ kind: 'abandoned' }` (abandonment and error share the event and
  are told apart by their **data**, `:190`)
- **anything else is treated as a finish type and stored as received** (`:226`, `:233`
  `finishType: String(payload.event)`). 🟢 **An unrecognised finish type is not rejected** — the comment
  at `:226–228` is explicit that rejecting it would make the flow fail silently for a case Meta added
  later. The server then applies a default (Step 3a).

### 2d. Inside the native shell

**The control is unreachable.** The entire card is behind `{!isNativeApp() && (` —
`app/manage/[token]/page.tsx:9824`. Nothing renders, so nothing happens.

---

## STEP 3 — THE ONBOARDING SERVER PATH

**Route:** `app/api/manage/whatsapp-signup/route.ts` (the only one; it is the sole `fetch` target of
`onWhatsAppSetup`).

### 3a. Graph calls in order, and versions

`const ONBOARDING_GRAPH_VERSION = 'v21.0'` (`:54`), `const GRAPH = https://graph.facebook.com/${…}` (`:55`).

| # | Call | Line | Version |
|---|---|---|---|
| 1 | **Code → token exchange**, `GET` | `:194` | v21.0 |
| 2 | **Phone registration**, `POST {phone_number_id}/register` | `:350` | v21.0 |
| 3 | **App subscription to the customer's WABA**, `POST {waba_id}/subscribed_apps` | `:365` | v21.0 |

Call 2 is **conditional** on a finish-type table (`:319–327`): `register: false` for coexistence, WABA-only
and grant-only; `true` for the Cloud API and OBO-migration flows. 🟢 **An unrecognised finish type
defaults to `register: true`** — *"a provisioned number that is never registered is silently mute"* (`:327`).

### 3b. Storage, encryption, expiry

- **Table:** `whatsapp_connections` (`:247`, `:279`, `:377`).
- **Encryption:** `encryptToken()` from `lib/whatsapp/token-crypto.ts`, stored as
  `access_token_ciphertext` (`:285`). Key env var **name**: `WHATSAPP_TOKEN_ENCRYPTION_KEY`
  (`lib/whatsapp/token-crypto.ts:24`, `const KEY_ENV = …`, read via `process.env[KEY_ENV]` at `:37`).
  There is also a named-only successor `WHATSAPP_TOKEN_ENCRYPTION_KEY_PREVIOUS` referenced in a comment
  at `:95`.
- **Expiry — yes, only from the exchange response.** `TOKEN_LIFETIME_DAYS` no longer exists in executable
  code; the only hit is `:58`, a comment recording that *"the 60 was FABRICATED after the v4 switch"*.
  The live rule is at `:63–64`: the expiry comes from `expires_in` *"or it does not come at all"*, and
  there is an explicit **no-expiry branch** (`:247–254`) that upserts with
  `access_token_ciphertext: null` and `token_expires_at: null` — 🟢 **the token is deliberately not
  stored when Meta returns no expiry.**

### 3c. 🔴 THE ROUTING GAP — onboarding does NOT write the column the webhook routes on

**The webhook routes on `trucks.phone_number_id`** — `app/api/webhooks/meta/whatsapp/route.ts:181`,
`.eq('phone_number_id', phoneNumberId)` against the `trucks` select at `:25`.

**Onboarding writes `whatsapp_connections.phone_number_id`** — `route.ts:377–378`:

```ts
  const phaseB = await supabase
    .from('whatsapp_connections')
    .update({ phone_number_id: phoneNumberId, updated_at: new Date().toISOString() })
```

**The onboarding route's only access to `trucks` is a SELECT** (`:124–128`, `.select('id, name')`).

*Absence check, with its control:* `grep -rn "phone_number_id" … | grep -iE "update|insert|upsert|allowed"`
across the repo (exclusions as stated, `docs` excluded) returns **exactly one line** — `route.ts:378`,
the `whatsapp_connections` update above. The same invocation's control, `whatsapp_sender` in
`app/api/manage/route.ts`, hits `:1595` where it appears in the `update_settings` `allowed` array — so the
search does find writable fields when they exist. **`trucks.phone_number_id` has no writer in the
application at all.**

🔴 **So what makes an onboarded truck's inbound messages reach it? Only the fallback.**
`app/api/webhooks/meta/whatsapp/route.ts:234–235` logs:

> `routed by whatsapp_sender FALLBACK, not phone_number_id — truck=… phone_number_id=… is not stored. Set it to retire this path.`

That fallback depends on `trucks.whatsapp_sender`, which is written by the **save-on-blur input** — a
different control from the Set up button. **An operator who completes Embedded Signup but never types
their number into the field beside it has no route at all**, and the code's own log line calls this path
one to retire.

### 3d. Partial-failure states

Every failure path returns `ok(...)` — an HTTP success carrying an operator-facing sentence — so the
wizard never reports a raw error. Read from the route:

| Failure | Stored state | Operator sees |
|---|---|---|
| No encryption key | nothing written (`:165` guard precedes the exchange) | configuration error |
| Exchange returns no `expires_in` | row upserted with **null** token and null expiry (`:247–254`) | — |
| Registration refused by Meta | Phase A row exists (token + WABA), `phone_number_id` still **null** | *"Your account is linked but Meta would not register the number… please contact support rather than running it again."* (`:358`) |
| Registration skipped, no id | as above | *"…this number needs registering by us before replies can start."* (`:348`) |
| Phase B unique violation (23505) | Phase A row exists, no number | *"That WhatsApp number is already connected to another HatchGrab account…"* (`:389`) |
| Phase B other error | Phase A row exists, no number | *"Almost there — we could not finish saving…"* (`:391`) |

🟢 The two-phase shape is deliberate: *"THE NUMBER GOES IN LAST, AND THAT IS WHAT MAKES THE STATE
`ready`"* (`:376`). ⚠️ But every one of these leaves a row that **looks** partially connected while the
webhook still cannot route to it (3c).

### 3e. Scoping — 🟢 SOUND

```ts
  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name')
    .eq('dashboard_token', token)
```

`app/api/manage/whatsapp-signup/route.ts:124–127`, under the comment *"THE TRUCK COMES FROM THE TOKEN AND
FROM NOTHING ELSE"*. The client cannot name a truck. Every write is `.eq('truck_id', truck.id)`.
**One truck's credential cannot be written against another**, and a partial unique index on
`phone_number_id` additionally stops two trucks claiming one number (`:383–389`).

---

## STEP 4 — SENDING AND WHO PAYS

### 4a. The token selection — there is none

`lib/meta-whatsapp.ts:31–35`, quoted:

```ts
  const res = await fetch(`${GRAPH_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
```

**There is no selection logic to quote, because there is no branch.** Both cases are identical:

- **(i) a truck onboarded through Embedded Signup** → `META_WHATSAPP_ACCESS_TOKEN`
- **(ii) a truck with only a hand-set `phone_number_id`** → `META_WHATSAPP_ACCESS_TOKEN`

The only per-truck value that reaches the send is `phoneNumberId`, used as a **path segment**.

### 4b. 🔴 Stated plainly

**`decryptToken` has ZERO callers.** It is defined at `lib/whatsapp/token-crypto.ts:77`; every other
occurrence of `access_token_ciphertext` or `decryptToken` in executable code is either the *write*
(`route.ts:285`), a *presence test* (`lib/whatsapp/connection-read.ts:100`,
`tokenPresent: !!row?.access_token_ciphertext`), a comment, or a migration.

*Control, same invocation:* `encryptToken` returns three hits including a real call site at
`app/api/manage/whatsapp-signup/route.ts:285` — so the search does find callers. The absence is real.

🔴 **An onboarded truck's replies go out on the platform `META_WHATSAPP_ACCESS_TOKEN`. The per-truck
token is encrypted, stored, and never read. That contradicts "trucks pay Meta directly."**
⚠️ `lib/whatsapp/connection-read.ts:13` asserts *"Decryption belongs to the send path"* — the send path
does not do it. The code disagrees with its own comment.

### 4c. Every Graph API version constant

| Constant | Value | File | Consumers |
|---|---|---|---|
| `GRAPH_API_VERSION` | **`'v19.0'`** | `lib/meta-whatsapp.ts:19` | `GRAPH_BASE_URL` (`:20`), diagnostics (`:146`) |
| `GRAPH_BASE_URL` | `…/v19.0` | `lib/meta-whatsapp.ts:20` | **send** (`:31`), diagnostics (`:147`), template list (`:217`), template create (`:353`) |
| `ONBOARDING_GRAPH_VERSION` | **`'v21.0'`** | `app/api/manage/whatsapp-signup/route.ts:54` | `GRAPH` (`:55`) → exchange, register, subscribed_apps |
| `SDK_GRAPH_VERSION` | **`'v26.0'`** | `lib/whatsapp/embedded-signup.ts:75` | `FB.init` (`:154`) |

**Three versions, three independent decisions** — the route's own comment at `:51–53` says so. The send
path at **v19.0** is the oldest.

---

## STEP 5 — THE REPLY CAP

### 5a. 🟢 IT EXISTS AND IT IS WIRED. The founder's belief is wrong.

`lib/whatsapp/reply-cap.ts` exists (11,155 bytes) and is imported by
`app/api/webhooks/meta/whatsapp/route.ts:5–13`.

**Limit values, read from executable lines in `lib/whatsapp/reply-cap.ts`:**

| Constant | Value | Line |
|---|---|---|
| `DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H` | **3** | `:25` |
| `MAX_REPLIES_PER_TRUCK_MONTH` | **2000** | `:35` |
| `MAX_REPLIES_PER_TRUCK_DAY` | **`Math.ceil(MAX_REPLIES_PER_TRUCK_MONTH / 10)`** = 200 | `:42` |

🟢 The manual's description matches: three windows, the day limit derived as a tenth of the month limit,
per-customer limit a parameter defaulting to 3.

**Before the classifier: yes.** The three counting queries run at `:312–336`, the decision and the handoff
send at `:415–425`, and `generateWhatsAppReply` — the classifier — is first called at **`:445`**.

### 5b. Commit and ancestry

```
$ git log --oneline -- lib/whatsapp/reply-cap.ts
7ee844f ipad app post updates          (2026-09-01)

$ git merge-base --is-ancestor 7ee844f origin/main
YES — it is an ancestor of origin/main
```

**One commit introduced it and it is on `origin/main`.** It is shipped.

### 5c. Operator-facing parts

| Part | Exists? | Evidence |
|---|---|---|
| **Settings copy stating the limit** | 🟢 **YES** | `app/manage/[token]/page.tsx:9946–9949`: *"Each customer gets up to {DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H} replies in 24 hours. After that they get one more message handing them over to you — **Meta charges for that one too**."* — and the number is **imported from the module** (`:42`), not typed, so it cannot drift |
| **Onboarding copy** | ❌ no | no signup/onboarding surface reads the module |
| **A database column** | ❌ no | no per-truck override column; the comment at `:9940` calls a per-truck override *"intended"*, not built |
| **A settings control** | ❌ no | the limit is a module constant; nothing writes it |
| **A displayed usage count** | ❌ no | nothing renders the day/month counters |

🟢 **The disclosure that the handoff is itself billable is present and correct**, and the comment at
`:9942–9944` explains why: *"a limit of 3 yields THREE replies PLUS ONE handoff — four billable messages,
not three. Saying '3 a day' alone would understate the invoice by 25%."*

### 5d. What the per-truck count includes

Counted from `whatsapp_logs` where `response_sent is not null`, `:312–336`. Three windows: per customer
(24h), per truck (26h → local day), per truck (month, `head: true` count-only).

🔴 **Not everything the platform sends is counted:**

- **Cap/handoff messages are EXCLUDED from the month count** by
  `.or('classification.is.null,classification.not.in.(…CAP_CLASSIFICATIONS…)')` (`:336`) and from the
  customer count by `isCapRow` (`:352`). **They are billable but not counted** — the operator-facing copy
  admits the billing; the counter does not include it.
- **Templates are NOT counted at all.** Every writer of `whatsapp_logs` is
  `app/api/webhooks/meta/whatsapp/route.ts` (`:396`, `:422`, `:460`) and
  `app/api/webhooks/whatsapp/route.ts:91` (the Twilio path). The template senders in `lib/meta-whatsapp.ts`
  (`:217`, `:353`) write **no** log row, so template sends never enter any window.
- **The greeting IS counted** — it is inserted at `:396` with `response_sent` set.

---

## STEP 6 — COEXISTENCE AND DOUBLE REPLIES

### 6a. 🔴 No echo handling. A coexistence truck WOULD double-reply.

*Absence check with control, one invocation:* `grep -rniE "smb_message_echo|message_echoes|is_echo|\"echo\"|'echo'"`
across the repo (stated exclusions, `docs` excluded) returns **zero hits**. The same invocation then
found `messages` in `app/api/webhooks/meta/whatsapp/route.ts:138` — the search works.

The payload check is `app/api/webhooks/meta/whatsapp/route.ts:138–142`:

```ts
    const messages = value?.messages
    if (!messages?.length) {
      return NextResponse.json({ ok: true })
```

A `smb_message_echoes` payload carries no `messages` array, so it is **dropped at `:140` and 200'd**.
🔴 **If a coexistence truck's owner answers from the WhatsApp Business app, the platform never learns it.
The next customer inbound is treated as unanswered and the bot replies too** — and because the owner's
reply is invisible, it also never counts toward any cap window.

### 6b. History sync — not built

Same search shape for `history_sync|historysync|smb_app_state|message_history`: **zero hits**. Control in
the same invocation: `FINISH_COEXISTENCE` returns 4 hits including
`lib/whatsapp/embedded-signup.ts:85`. Absence is real.

### 6c. 🟢 The path taken IS distinguished — for registration only

`app/api/manage/whatsapp-signup/route.ts:319–328` maps five finish-type constants to a register/skip
decision, and `const isCoexistence = finishType === FINISH_COEXISTENCE` (`:328`) is persisted as
`coexistence: isCoexistence` (`:396`). ⚠️ **Nothing downstream reads that flag** — it does not change
webhook behaviour, so 6a applies to coexistence trucks identically.

---

## STEP 7 — GATES, SECRETS, WEBHOOK

### 7a. Plans, expired trial, and silence

**`whatsapp_replies` is granted to Pro, Max, and every trial-family plan.** `lib/features.ts:51` places it
in `PRO_FEATURES`; `MAX_FEATURES` spreads `PRO_FEATURES` (`:55`); `TRIAL_FEATURES = [...MAX_FEATURES]` (`:72`).

**An expired trial gets nothing** — `lib/features.ts`, `canAccess`:

```ts
    if (new Date(trialExpiresAt) <= new Date()) return false              // expired — UNCHANGED
```

A **past** date denies **every** feature, not just this one. A **null** expiry means "not started" and
**grants** the trial set.

🔴 **The denial is still completely silent.** `app/api/webhooks/meta/whatsapp/route.ts:250–252`:

```ts
    if (!canAccess(truck.plan, 'whatsapp_replies', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ ok: true })
    }
```

No `console.log`, no `console.error`, no log row. A customer messages a truck on an expired trial and
**nothing anywhere records that a reply was suppressed.** ⚠️ This is inconsistent with the sibling path
at `:244`, which *does* log loudly when no truck matches.

### 7b. Secret readers (names only)

| Variable | Reader — file : symbol |
|---|---|
| `META_APP_SECRET` | `app/api/webhooks/messenger/route.ts:43` — inside the route handler, via `parseMetaAppSecrets` |
| | `app/api/webhooks/instagram/route.ts:43` — same |
| `META_WHATSAPP_APP_SECRET` | `app/api/manage/whatsapp-signup/route.ts:170` — via `parseMetaAppSecrets` |
| | `app/api/webhooks/meta/whatsapp/route.ts:109` — via `parseMetaAppSecrets` |
| `META_WHATSAPP_ACCESS_TOKEN` | `lib/meta-whatsapp.ts:34` — `sendMetaWhatsApp` (and named at `:125`) |
| | `app/admin/whatsapp-templates/page.tsx:154` — displayed as a **name** in a diagnostics panel |

🟢 **Deliberately not a fallback chain** — `app/api/webhooks/meta/whatsapp/route.ts:104` records that
`META_WHATSAPP_APP_SECRET ?? META_APP_SECRET` *"would have worked and is REFUSED"*. So the WhatsApp
surfaces and the Messenger/Instagram surfaces read **different** secrets by design.

### 7c. Webhook status codes

🟢 **Every message-handling path returns 200.** `NextResponse.json({ ok: true })` at `:131`, `:142`,
`:155`, `:247`, `:251`, `:405`, and the terminal path after the send. The only non-200s are **not**
message handling: `403` for a failed verify (`:62`), `400` for an unreadable body (`:89`), `401` for an
invalid signature (`:120`).

**An unmatched `phone_number_id`** → logged as an error naming the id (`:244`), then `200` (`:247`). 🟢
Meta is not made to retry; the event is visible in logs.

---

## STEP 8 — COPY AND DISCLOSURE

### 8a. Where the Meta-billing disclosure is

Only **two** surfaces carry it. Searched for `pay meta|meta charges|meta bills|billed by meta|directly to
meta|…` with the stated exclusions; control in the same invocation (`WhatsApp auto-replies`) returned four
hits, so the search works.

**1. Pricing footnote — `lib/plan-features.ts:563`:**

> `'Auto-replies require a WhatsApp Business account. Meta bills you directly for these messages — check Meta\'s current pricing. Responses are AI-generated and can occasionally be wrong.'`

🔴 **This footnote is inside `...(WHATSAPP_LIVE ? [ … ] : [])` (`:540`). With the flag `false` it does not
exist on any page.** The disclosure appears only *after* the flip.

**2. Manage → Settings — `app/manage/[token]/page.tsx:9946–9949`:**

> `Each customer gets up to {DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H} replies in 24 hours. After that they get one more message handing them over to you — Meta charges for that one too.`

🟢 This one renders today (it is outside the flag branch), but only on web — the card is
`!isNativeApp()` gated.

**Landing page: no disclosure. Compare page: only via the matrix footnote, i.e. flag-gated. Onboarding
wizard: none.**

🟢 **Neither contains a price or a date.** Both are deliberate — `lib/plan-features.ts` says *"check
Meta's current pricing"* rather than a figure, and the Settings comment at `:9945` states *"NO PRICE AND
NO DATE — Meta's rates are unread."* ⚠️ A date **does** appear in a non-rendered comment,
`lib/whatsapp/reply-cap.ts:8` (*"From 1 October 2026 Meta charges PER MESSAGE"*), which no user sees.

### 8b. Committed or working-tree only?

🟢 **Every surface is committed on `origin/main`.** `git status --porcelain=v1 -- app lib components content`
returns **empty**; the control (`-- docs`) returns the one modified manual. HEAD == origin/main.

---

## CONTRADICTIONS WITH THE MANUAL

| # | Manual claim | Code reality — **the code wins** |
|---|---|---|
| 1 | (older §) `WHATSAPP_LIVE` is a module-level boolean in `app/manage/[token]/page.tsx`, set **true** | It is `export const WHATSAPP_LIVE: boolean = false` in `lib/whatsapp-live.ts:27`; the manage page **imports** it (`:37`). **Stale and wrong in both location and value.** |
| 2 | (V12.5) Flipping the flag "moves the landing tile from last to fifth **as well as** changing its label" | The tile position is **hard-coded**. `app/landing/page.tsx:352` records that moving it is done **by hand in the same edit**. The flag swaps which of two literals renders. |
| 3 | (V11.41) The reply cap's "per-customer limit passed as a parameter defaulting to 3" and the three windows | 🟢 **Confirmed** — `reply-cap.ts:25/:35/:42`. This manual claim holds. |
| 4 | — (code comment, not manual) `lib/whatsapp/connection-read.ts:13`: *"Decryption belongs to the send path"* | The send path never calls `decryptToken`. **The code contradicts its own comment.** |
| 5 | — (code comment) `app/manage/[token]/page.tsx:9953`: *"🟢 LIVE SINCE 4 September 2026. `WHATSAPP_LIVE` is true (:8444)"* | `WHATSAPP_LIVE` is **false**, and there is no `:8444` declaration — the const moved to `lib/whatsapp-live.ts`. **A stale comment that will mislead the next reader**, exactly as a prior report predicted. |

---

## BLOCKERS TO FLIPPING `WHATSAPP_LIVE`

| # | Blocker | Evidence |
|---|---|---|
| **B1** | 🔴 **Onboarding does not write the column the webhook routes on.** A truck can complete Embedded Signup and still receive nothing. | Only writer of `phone_number_id` is `whatsapp-signup/route.ts:378` → **`whatsapp_connections`**. Webhook matches `trucks.phone_number_id` (`meta/whatsapp/route.ts:181`). Absence proven with control (§3c). |
| **B2** | 🔴 **Replies bill to the platform, not the truck.** `decryptToken` has no caller; every send uses `META_WHATSAPP_ACCESS_TOKEN`. Contradicts the disclosure at `plan-features.ts:563` that the flip itself switches on. | `lib/meta-whatsapp.ts:34`; absence of `decryptToken` callers proven with control (§4b) |
| **B3** | 🔴 **Coexistence double-replies.** No `smb_message_echoes` handling; owner replies from the WhatsApp Business app are invisible and uncounted. | `meta/whatsapp/route.ts:138–142`; zero-hit search with control (§6a) |
| **B4** | 🔴 **The parity guard cannot catch a WhatsApp mismatch.** It never reads the flag, skips `'coming_soon'` cells, and only tests one direction. | `findPlanParityViolations`, `lib/plan-features.ts` (§1e) |
| **B5** | ⚠️ **Plan-gate denials are silent.** An expired trial's suppressed replies leave no trace anywhere. | `meta/whatsapp/route.ts:250–252` (§7a) |
| **B6** | ⚠️ **Flipping back would leave a badge-less frozen row.** The else-branch "Coming soon" badge was deleted. | `app/manage/[token]/page.tsx:10033–10035` |
| **B7** | ⚠️ **The POST fires even on abandonment/error**, because the fetch precedes the outcome checks. | `app/manage/[token]/page.tsx`, `onWhatsAppSetup` (§2a) |
| **B8** | ⚠️ **Instagram/Messenger will not move with the flag** and are a separate hand edit — the founder's model is wrong. | `lib/plan-features.ts:303` (§1d) |
| **B9** | ⚠️ **Send path is pinned to Graph v19.0** while onboarding uses v21.0 and the SDK v26.0. | §4c |
| **B10** | ⚠️ **Nothing changes on native.** If go-live is expected to reach the iOS/Android shells, it does not. | `app/manage/[token]/page.tsx:9824` |

---

## DB FACTS NEEDED

Plain-English questions; no SQL written this session.

1. **`trucks`** — for each truck that has completed Embedded Signup, is `phone_number_id` populated, and
   is `whatsapp_sender` populated? This decides whether B1 is currently biting anyone.
2. **`whatsapp_connections`** — how many rows exist; how many have a non-null `access_token_ciphertext`;
   how many have a null `phone_number_id` (a Phase-A-only, half-finished connection)?
3. **`whatsapp_connections`** — for rows with a token, what is `token_expires_at`? This settles what
   lifetime the live configuration actually issues, which no report has established.
4. **`trucks`** — what are the `plan` and `trial_expires_at` values for the two live trucks? Needed to say
   whether `canAccess('…','whatsapp_replies')` is true for them today.
5. **`whatsapp_logs`** — how many rows in the current month per truck, and how many carry a cap
   classification? This says how close any truck is to the 200/day or 2000/month ceilings.
6. **`trucks`** — is `messenger_page_id` / `messenger_page_token` populated on any row? The columns exist
   (`20260523_messaging_schema.sql`) and no code reads them.

---

## COULD NOT DETERMINE FROM THE REPO

1. **Which Facebook Login for Business configuration is live.** Neither ID appears in executable code; the
   value is `NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID` in a gitignored env file / Vercel. **Only Meta's
   console or Vercel can answer.**
2. **What token lifetime that configuration issues.** The code now takes expiry only from `expires_in`, so
   the repo has no answer by design.
3. **Whether the Meta app is in Live mode**, and which products/permissions the configuration carries.
4. **Whether the app is subscribed to the `smb_message_echoes` webhook field** in the Meta dashboard —
   irrelevant today, since nothing would handle it (B3), but it determines how much work B3 is.
5. **Whether `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_ACCESS_TOKEN` and
   `WHATSAPP_TOKEN_ENCRYPTION_KEY` are defined in the production environment.** Names only were read;
   values were never printed and Vercel was not contacted.
6. **Whether the allowed-domains list on the configuration includes the production host** — required for
   Embedded Signup to open at all.

---

## SCOPE

No file changed except this report. No `git add`, `commit`, `stash`, `checkout`, `reset` or `restore`.
No package installed, no server started, no network call, no SQL. No environment variable value printed.
