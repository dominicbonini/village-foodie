# The connected number, from Meta rather than from a text box

**16 September 2026.** Three files changed, four added. `WHATSAPP_LIVE` untouched. No migration run — the
one added is a record of a change already applied. tsc clean; lint one `any` **better** than HEAD.

---

## 0. TREE STATE BEFORE EDITING

```
$ git status --porcelain=v1     (empty — clean)
$ git rev-parse HEAD            765e06047b857f60ba1bfe6bd43e1189609e07f8
$ git rev-parse origin/main     765e06047b857f60ba1bfe6bd43e1189609e07f8
```

Clean tree, HEAD equals origin/main. Proceeded.

---

## 1. WHAT I READ BEFORE EDITING

### 1a. Every reader and writer of `trucks.whatsapp_sender`

**Exactly one writer**, and it was the input I was asked to remove:
`app/manage/[token]/page.tsx` → `saveWhatsappSender` → `api('update_truck', { data: { whatsapp_sender } })`,
allowed by the `allowed` array in `app/api/manage/route.ts` (`:1595`).

**Readers — 🔴 there are many, and two of them matter:**

| File · symbol | What it does with it |
|---|---|
| 🔴 `lib/email.ts` — the contact-method block | **Customer-facing.** Builds "Message us on WhatsApp" links in order emails |
| 🔴 `app/api/webhooks/meta/whatsapp/route.ts` — the `sender_fallback` lookup | **Gusto's only inbound route today** — matches three variants of the display number |
| `app/api/webhooks/whatsapp/route.ts` | the Twilio path, `.eq('whatsapp_sender', toNumber)` |
| `app/api/dashboard/action/route.ts` (5 sites), `app/api/orders/submit/route.ts`, `lib/payments/promote-draft.ts` | pass it into email params |
| `app/api/dashboard/route.ts` | listed in a field allow-list |
| `app/manage/[token]/page.tsx` | the `Truck` interface and the **else branch's disabled input** |

⚠️ **CONSEQUENCE, STATED PLAINLY AND NOT BURIED.** Removing the live-branch input removes the **only UI
writer** of a column that is still read by customer emails and by the webhook's fallback. The column,
its values and every reader are untouched — but a truck on the **live** branch can no longer set it from
Manage. That is the intended trade (the connection now supplies the number) and it is not a change to
the fallback logic, which is on the do-not-change list and was not touched. Gusto is unaffected: it
renders the else branch, whose disabled input still shows its stored `'07380736226'`.

### 1b. The live branch — 🔴 a premise in the brief is wrong

The brief asks "where is the number input, **why is it disabled**". **The live-branch input was not
disabled.** It was fully editable:

```tsx
                    <input
                      type="tel"
                      value={whatsappSender}
                      onChange={e => setWhatsappSender(e.target.value)}
                      onBlur={saveWhatsappSender}
                      placeholder="+447700900000"
                      className="flex-1 min-w-0 truncate border border-slate-200 rounded-xl …"
                    />
```

The **else** branch carries the disabled one (`disabled`, `bg-slate-50 … cursor-not-allowed`) — that is
the one shown to Gusto, and it is untouched. What the live input wrote: `trucks.whatsapp_sender`, on
blur, through `update_truck`.

### 1c. What the row showed per state, and what `connection-read` returned

**The row showed the same thing in every state.** There was no per-state display at all. The only
state-dependent parts were the button's label (`Set up` vs `Reconnect`, from `shouldOfferReauthorise`)
and an `expiringSoon` banner. `not_connected`, `onboarding_incomplete`, `token_missing`,
`awaiting_payment_method`, `revoked` and `ready` all rendered an identical editable text box.

`WhatsAppConnectionView` returned **four** fields and no number: `state`, `offerSignup`,
`offerReauthorise`, `expiringSoon`.

### 1d. The signup route — where both facts are in hand, and the order

- `phoneNumberId` arrives **in the request body** (`:176`), from the browser's Embedded Signup session.
- `accessToken` arrives from the **code exchange** (`fetch` at `:215`).
- 🔴 **Both are known from roughly `:243`**, before any write.

Existing order: exchange (`:215`) → **phase A** upsert, token + WABA, `phone_number_id: null` (`:300`) →
`register` (`:371`, conditional on finish type) → `subscribed_apps` (`:386`) → **phase B** update,
`phone_number_id` last (`:397`) → `ok(...)`.

**Nothing read contradicted the plan**, other than 1b above, which changes no instruction — the input is
removed either way.

---

## 2. THE CHANGE

### 2a. One Graph GET, placed where it cannot matter

`lib/whatsapp/phone-profile.ts` (new) — `fetchPhoneNumberProfile` issues
`GET {GRAPH}/{phone_number_id}?fields=display_phone_number,verified_name` with the **business token**, on
the shared `GRAPH` base (which is `GRAPH_VERSION`, v21.0). Parsing is the pure
`parsePhoneNumberProfile`.

🔴 **It runs AFTER phase B and before the success return**, and that position is half of why it cannot
break onboarding. By then the token is stored, the number registered, the app subscribed and phase B has
succeeded — the truck **is** connected. The other half: `fetchPhoneNumberProfile` **never throws and
never rejects**; the columns are nullable, so nulls are a legitimate stored state, not a failed write.

⚠️ **The log carries an HTTP status and nothing else** — not the number, not the name, not the token, not
Meta's error body (which can echo request parameters). A status distinguishes a network failure from a
401 from a 404, which is the whole diagnostic question.

⚠️ **Both columns are written even when the lookup failed**, so a retried signup overwrites a stale pair
with nulls rather than leaving yesterday's number beside today's connection.

🟢 `ok()` re-reads the row through `readWhatsAppConnection` **after** the writes, so the number and name
reach the browser on the same response that reports success.

### 2b. `connection-read`

`CONNECTION_FIELDS` gains the two columns; `WhatsAppConnectionView` gains `displayPhoneNumber` and
`verifiedName`, both `?? null`. Both callers pass the whole view through unchanged
(`app/api/manage/route.ts:296` and the signup route's `Ok` type), so nothing else needed touching.

### 2c/2d. The row, driven by a pure view model

The free-text input is **gone from every live state**. `lib/whatsapp/connection-view.ts` (new) —
`whatsAppRowView({ state, displayPhoneNumber, verifiedName })` returns
`{ showNumberInput: false, facts, showBareConnected, showSetupControl }`, and the markup renders that.

| Situation | Shown |
|---|---|
| `not_connected` | nothing about a number — 🔴 even if stale values sit on the row |
| connection + number | **Connected number: +44 …** |
| connection + name | **Business name: …** |
| `ready`, nothing stored | the single word **Connected** |
| any non-ready state, nothing stored | 🔴 **nothing** — it must not claim Connected beside a Reconnect button |
| `revoked` with values | still shows them — the link is real even when our token lapsed |

🔴 **Nothing is ever invented.** A null shows no row: not a placeholder, not "unknown", not the old typed
value. Empty and whitespace-only stored values are treated as absent (Meta returns `verified_name: ""`
before approval, and a blank "Business name:" row looks like a bug).

**Kept:** every existing state message, the `expiringSoon` banner, the Reconnect behaviour, the Set up
control and all of its copy, the `!isNativeApp()` wrapper, the server gate, and **the else-branch markup
byte-for-byte**.

⚠️ **Two symbols were deleted, not left dangling:** `saveWhatsappSender` and its `lastSavedSender` ref had
no caller once the input went, and `setWhatsappSender` had no user. `whatsappSender` itself stays,
because the else branch still displays it.

### 2e. The migration record

`supabase/migrations/20260916_whatsapp_connection_profile.sql` — **not run**, and its header says so:
already applied by hand in production, PostgREST already reloaded. It exists so the repo's history
accounts for two columns that otherwise appear from nowhere. It contains exactly the `alter table … add
column if not exists …` and the `notify pgrst, 'reload schema';`.

### 2f. UK English throughout ("Connected number", "Business name", "Set up" the verb).

---

## 3. PROOFS

### 3a/3b. Broken variants first — `scripts/whatsapp-connection-view-harness.cjs`

Rerunnable with `node scripts/whatsapp-connection-view-harness.cjs`; it compiles the TypeScript itself.
The suite takes **both** the view model and the parser as arguments.

```
── BROKEN VARIANTS: each MUST report FAILURE ──
  ✓ FAILED as required  V1 the view still offers a number input when not connected
  ✓ FAILED as required  V2 a ready connection with a stored number hides it
  ✓ FAILED as required  V3 the view invents a number when the stored value is null
  ✓ FAILED as required  V4 the parser throws on a malformed response

── THE REAL CODE ──
✅ all 87 passed
```

Covered: all six states × four value combinations (no input in any of them) · not_connected with stale
values · both/number-only/name-only · whitespace values · the bare "Connected" only for `ready` · revoked
still showing its number · the parser against a full response, each field missing, an empty string, a
non-object, null, undefined, a string, a number, an array, an empty object, an error envelope, and
non-string field types.

⚠️ **The harness crashed on V2 the first time** — `both.facts[0].label` threw when a variant emptied
`facts`. **A harness that falls over has not "reported FAILURE"**, so every indexed read is now
optional-chained and V2 is recorded as failed assertions instead.

### 3c. A failed lookup leaves onboarding successful — by evaluation

The step was **extracted so this is provable by injection**, and `fetchImpl` is a parameter for exactly
that reason. Driven with seven injected fetches:

```
  ✓ network throw  failure=network status=null profile={"displayPhoneNumber":null,"verifiedName":null}
  ✓ 401            failure=http    status=401  …nulls
  ✓ 404            failure=http    status=404  …nulls
  ✓ 500            failure=http    status=500  …nulls
  ✓ 2xx, bad JSON  failure=http    status=200  …nulls
  ✓ 2xx, no fields failure=null    status=200  …nulls
  ✓ 2xx, full      failure=null    status=200  {"displayPhoneNumber":"+44 7700 900000","verifiedName":"Pizzeria Gusto"}
```

**None throws; every failure yields nulls.** The other half — "the route still returns success" — is
structural and I am saying plainly that it is **read, not executed**: the route is not injectable without
restructuring the whole handler, which was not asked for. The evidence is that between the lookup block
and the success return there is **exactly one `return`** — the success one — and no `throw` and no
`fail(`; both failure branches inside the block are `console.warn` only.

### 3d. What each proof would look like if it proved nothing

| Proof | If it proved nothing | How that was ruled out |
|---|---|---|
| **No number input** | Asserting it for one state — true of a view that shows the input only when connected. | Asserted for **all six states × four value combinations**; V1 reintroduces it for one state and is caught. |
| **Values are shown** | Asserting only `facts.length > 0` — true of a view that fabricates. | Label **and** value are asserted against the stored strings; V2 empties them and is caught. |
| **Nothing invented** | Testing only the both-present case, where nothing needs inventing. | Number-only and name-only cases assert the **absence** of the other row; V3 adds a "Not available" row and is caught. |
| **Parser never throws** | Testing only well-formed objects. | Nine malformed inputs including `null`, a string and an error envelope; V4 throws and is caught. |
| **Failed lookup is harmless** | Asserting the parser returns nulls — which says nothing about the fetch. | The **fetcher** is driven with seven injected failures, asserting `failure`, `status` **and** nulls. |
| **Gusto unchanged** | Reading the code and asserting equivalence. | The branch predicate is **evaluated** and printed, plus a diff filter over the else-branch markup with a positive control. |

### 3e. Gusto — evaluated

```
  pizzeria-gusto   whatsAppSetupVisible=false → renders the ELSE branch (untouched)
  test-truck       whatsAppSetupVisible=true  → renders the LIVE branch (changed)
```

And the else-branch markup is untouched: a diff filter for its distinctive lines (`disabled`,
`bg-slate-50 text-slate-400 cursor-not-allowed`, the "ONE ROW: label, number, badge" comment) returns
**nothing added or removed**. *Positive control:* the same filter applied to live-branch markers
(`whatsAppRowView`, `Connected number`, `type="tel"`) returns my changes, so the filter works.

🟢 **Gusto sees exactly what it saw: the label, a disabled box showing `07380736226`, and no button.**

### 3f. TypeScript and lint

- **`npx tsc --noEmit -p .` — clean.**
- **Lint**, three changed files that exist at HEAD, same eslint and config, HEAD in a detached worktree:
  **HEAD 285 errors → now 284**, warnings 75 on both sides. The single moved rule is
  `@typescript-eslint/no-explicit-any`, **254 → 253** — i.e. **one fewer**, because deleting
  `saveWhatsappSender` removed a `catch (e: any)`. No rule increased.
- `lib/whatsapp/connection-view.ts` and `lib/whatsapp/phone-profile.ts` lint **0 / 0** on their own.

### 3g. What the harness cannot prove, and the manual steps

**It cannot prove:**
- that Meta's Graph API actually returns `display_phone_number` and `verified_name` for **this**
  configuration's numbers, or in that shape. Every response in the harness is one I wrote.
- that the business token has permission to read the phone number node. A 401 here is handled and
  logged, but whether it happens is Meta's answer.
- that the two columns exist in production (you reported them added; I did not query).
- anything about how the row **looks** — only what the view model decides.

**After a real signup on the test truck:**

| # | Do | Expect |
|---|---|---|
| 1 | Complete Embedded Signup on the test truck. | The success panel appears as before. **On the same response**, the row shows **Connected number:** and, if Meta has approved one, **Business name:**. |
| 2 | Reload Manage → Settings. | The same two lines persist (they came from the database, not from the signup response). |
| 3 | Look at the row. | 🔴 **No editable number box anywhere in the live branch**, in any state. |
| 4 | Check the server log for that signup. | Either nothing about the profile, or one `phone profile lookup failed` line carrying **only** `failure` and `status`. No number, no name, no token. |
| 5 | If the name is missing but the number is there | Expected while Meta has not approved a display name — the row shows the number alone and invents nothing. |
| 6 | If **both** are missing and the state is ready | The row reads the single word **Connected**. Check step 4's log for the status: 401 = token scope, 404 = wrong id, network = transient, retry by reconnecting. |
| 7 | Open **Gusto's** Settings. | Label, **disabled** box showing `07380736226`, no button, no new lines. Identical to before. |
| 8 | Send Gusto a WhatsApp. | It still replies — its `whatsapp_sender` value and the webhook's fallback are untouched. |

---

## 4. FINISH

```
$ git status --porcelain=v1
 M app/api/manage/whatsapp-signup/route.ts
 M app/manage/[token]/page.tsx
 M lib/whatsapp/connection-read.ts
?? lib/whatsapp/connection-view.ts
?? lib/whatsapp/phone-profile.ts
?? scripts/whatsapp-connection-view-harness.cjs
?? supabase/migrations/20260916_whatsapp_connection_profile.sql

$ git diff --stat
 app/api/manage/whatsapp-signup/route.ts | 43 +++++++++++++++++-
 app/manage/[token]/page.tsx             | 78 ++++++++++++++++++---------------
 lib/whatsapp/connection-read.ts         | 12 ++++-
 3 files changed, 96 insertions(+), 37 deletions(-)
```

| File | Reason |
|---|---|
| `lib/whatsapp/phone-profile.ts` **(new)** | the pure parser plus a never-throwing, injectable fetcher for Meta's number profile |
| `lib/whatsapp/connection-view.ts` **(new)** | the pure view model — what the row shows, decided in one place |
| `scripts/whatsapp-connection-view-harness.cjs` **(new)** | the proofs, rerunnable with plain `node` |
| `supabase/migrations/20260916_whatsapp_connection_profile.sql` **(new)** | a record of the two columns already applied by hand; **not to be run** |
| `app/api/manage/whatsapp-signup/route.ts` | one Graph GET after phase B, writing both columns; cannot fail onboarding |
| `lib/whatsapp/connection-read.ts` | selects and returns `display_phone_number` and `verified_name` |
| `app/manage/[token]/page.tsx` | live branch renders read-only facts from the view model; editable number input and its dead writer removed |

**Not changed:** `lib/whatsapp-live.ts`, `lib/whatsapp/setup-preview.ts`, `lib/whatsapp/inbound-route.ts`,
`lib/whatsapp/setup-machine.ts`, the webhook, the `whatsapp_sender` fallback, the `update_truck` allowed
list, plan lists, landing, and the else-branch markup of the WhatsApp row.
