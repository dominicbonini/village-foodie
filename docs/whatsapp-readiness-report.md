# WhatsApp readiness — READ-ONLY DIAGNOSIS

**Date:** 20 August 2026
**Scope:** read-only. **NO FILE WAS CHANGED, no migration written, no deploy run.** The only file
written is this one.
**Prompt integrity:** no span of the brief arrived garbled. No instruction contradicted another.
Nothing needed to be stopped on.

**Method:** `app/api/webhooks/meta/whatsapp/route.ts`, `lib/meta-whatsapp.ts`,
`app/api/admin/whatsapp-templates/route.ts`, `app/admin/whatsapp-templates/page.tsx`,
`lib/auth/admin.ts`, `app/api/manage/route.ts`, `app/api/dashboard/route.ts`,
`supabase/migrations/20260523_messaging_schema.sql` and
`supabase/migrations/20260816_trucks_phone_number_id.sql` were read in full or in the relevant span.
The three prior reports and §20 were read for what they settle and are **not restated here**.

---

# Q1 — The fallback comparison, exactly as written

## 1.a The expression

`app/api/webhooks/meta/whatsapp/route.ts:175-195`, quoted whole because the normalisation and the
comparison are not separable:

```ts
    if (!truck && displayPhoneNumber) {
      const digits = displayPhoneNumber.replace(/\D/g, '')
      const toVariants = [
        `+${digits}`,
        digits,
        digits.startsWith('44') ? `0${digits.slice(2)}` : null,
      ].filter((v): v is string => v !== null)
      const { data } = await supabase
        .from('trucks')
        .select(TRUCK_FIELDS)
        .or(toVariants.map(v => `whatsapp_sender.eq.${v}`).join(','))
        .eq('active', true)
        .maybeSingle()
      truck = (data as TruckRow | null) ?? null
```

The comparison proper is the `.or(...)` line. It expands to a PostgREST disjunction of up to three
exact-equality tests against `whatsapp_sender`.

## 1.b Is normalisation applied? 🔴 **YES — AND THE BRIEF'S PREMISE IS WRONG HERE**

**All four of the named normalisations are present**, and one of them exists specifically for the value
in question:

| Normalisation | Where | Effect on a UK number |
|---|---|---|
| Digit-stripping | `displayPhoneNumber.replace(/\D/g, '')` | `"+44 7380 736226"` → `"447380736226"` |
| E.164 coercion | `` `+${digits}` `` | → `"+447380736226"` |
| Bare international | `digits` | → `"447380736226"` |
| **Leading-zero / country-code handling** | `` digits.startsWith('44') ? `0${digits.slice(2)}` : null `` | → **`"07380736226"`** |

⚠️ **THE NORMALISATION IS ONE-SIDED.** It is applied to **Meta's** value only. `whatsapp_sender` is
read raw, exactly as stored, on every one of the three tests. The code compensates for the stored
format by generating a candidate that matches it, rather than by normalising what is stored — and its
own comment (`:173-174`) says so in as many words: *"the same three shapes the old code built, because
`whatsapp_sender` is free text and Pizzeria Gusto's is stored UK-national (`'07380736226'`) while the
field's placeholder is E.164."*

## 1.c Can this comparison ever match `07380736226`?

🔴 **YES. The third variant IS that string, and it was written for that row.** If Meta delivers a
`display_phone_number` whose digits are `447380736226`, `toVariants[2]` evaluates to the literal
`'07380736226'` and the `.eq` matches Gusto exactly.

**So the fallback is not defective, and "inbound is dead because the comparison cannot match" is not
the finding.** The finding is one level up.

## 1.d 🔴 INBOUND IS NEVERTHELESS DEAD FOR EVERY TRUCK TODAY — for a configuration reason, not a code one

Both lookups key on **the business number the customer messaged TO**. For a message to route:

1. **Primary** needs `trucks.phone_number_id` = Meta's `value.metadata.phone_number_id`.
   🔴 **NULL on all 13 trucks (your query).** The primary can never match. **100% of routing falls
   to the fallback**, exactly as your brief states.
2. **Fallback** needs `value.metadata.display_phone_number` to be **the truck's own registered
   WhatsApp Business sender**, in a form whose digits are `447380736226`.

🔴 **AND THAT IS THE PART THAT FAILS.** `07380736226` is not a Business API sender. §20 records it
twice: *"Gusto's `whatsapp_sender` (`07380736226`) is almost certainly the TESTER's mobile, not a
Business API sender"*, and V7.8's *"the Gusto auto-reply number is now whitelisted in Meta"* — that is
the **test-recipient allowlist**, which is the opposite end of the message. §20 also records the
current provider posture as *"ONE shared US Meta test number during testing"*. A handset that receives
WhatsApp cannot simultaneously be the Cloud API sender Meta names in `metadata`.

So `display_phone_number` on any real delivery today is **the shared platform test number**, whose
digits match none of the three variants for any truck. **Result: no truck matches, nothing is sent,
inbound WhatsApp is dead estate-wide.**

⚠️ **THIS IS SOURCE-PLUS-§20 REASONING, NOT AN OBSERVATION.** What settles it in one line is already
in the code — see 1.f.

## 1.e What an unmatched message does — and the trap in it

`route.ts:197-205`:

```ts
    if (!truck) {
      console.warn(
        `[webhook/meta-whatsapp] NO TRUCK for phone_number_id=${phoneNumberId} ` +
        `display=${displayPhoneNumber ?? 'absent'} — message dropped, nothing sent.`,
      )
      return NextResponse.json({ ok: true })
    }
```

- **Replies to nobody.** ✅ Correct — the send at `:280` is downstream and unreachable.
- **Logs?** 🔴 **NO. AND THIS IS THE TRAP.** It writes a `console.warn` to the function log, but the
  `whatsapp_logs` **insert is at `:262`, downstream of the truck lookup**. An unmatched message
  **writes no database row at all.**
- 🔴 **THEREFORE: `whatsapp_logs` SILENCE SINCE 18 JUNE IS NOT EVIDENCE THAT NO MESSAGES ARRIVED.**
  It is equally consistent with messages arriving every day and being dropped at the lookup. This
  matters for Q6 and is the single most load-bearing correction in this report.
- **Returns 200.** Confirmed below.

## 1.f ✅ THE ROUTE RETURNS 200 ON AN UNMATCHED MESSAGE — and on every other non-signature exit

Every `return` in the POST handler, enumerated:

| Line | Condition | Status |
|---|---|---|
| `:82` | request body unreadable | **400** |
| `:102` | **signature verification failed** | **401** — deliberate, see below |
| `:113` | signed but not JSON | 200 |
| `:124` | no `messages` (status callback etc.) | 200 |
| `:137` | no text, or no `phone_number_id` | 200 |
| `:204` | **no truck matched** | **200** ✅ |
| `:208` | plan gate refused | 200 |
| `:276` | IGNORE bucket, nothing to send | 200 |
| `:286` | normal completion (send may have thrown and been caught at `:282`) | 200 |
| `:289` | outer catch-all — *"always 200 — Meta retries on anything else"* | 200 |

⚠️ **THE ONE DELIBERATE NON-200 IS THE SIGNATURE GATE (401).** Its comment argues the case explicitly:
a 2xx there would mean a misconfigured secret silently swallowed every real message. **That is a
considered trade against §20's "must keep returning 200" rule, not a violation of it** — but it does mean
there is a live path on which Meta sees sustained non-2xx and can disable the subscription for every
truck. See 1.g.

**The `NO TRUCK` warn line names both identifiers, so one production log line settles 1.d outright:**
the `display=` value in it IS the string the three variants are compared against.

## 1.g 🔴 A SECOND, UPSTREAM CANDIDATE FOR THE SILENCE — the app-secret variable name

`route.ts:91` reads `process.env.META_APP_SECRET`. §20's env RULE names **`META_WHATSAPP_APP_SECRET`**.
`docs/whatsapp-current-state-read.md` already records this mismatch, so it is not new — but its
consequence is worth stating against *this* question: **if production has the manual's name set and not
the code's, `parseMetaAppSecrets` returns `[]`, the gate fails closed, and every inbound POST is refused
401 before the lookup is ever reached.** That drops messages *earlier* than the fallback does, writes no
`whatsapp_logs` row either, and is the failure mode that makes Meta flag the subscription.

**Which of 1.d and 1.g is actually happening cannot be decided from source.** One log line distinguishes
them, and both strings already exist in the code:

- `REFUSED reason=no_secret_configured secretsConfigured=0` → it is the gate.
- `NO TRUCK for phone_number_id=… display=…` → it is the lookup, and the `display=` value answers 1.c.
- **Neither line present** → no inbound traffic is arriving at all.

## 1.h ⚠️ TWO SMALLER FINDINGS IN THE SAME BLOCK

1. 🔴 **BOTH LOOKUPS DISCARD THE SUPABASE ERROR.** `:160` and `:182` both destructure `const { data }`
   and never read `error`. `.maybeSingle()` returns an **error, not a row**, when more than one row
   matches. Today only one truck has a populated `whatsapp_sender`, so it cannot fire. **The moment a
   second truck is populated with a colliding variant, the fallback yields `data: null` plus a swallowed
   error — indistinguishable from "no truck" — and drops the message silently.** This is precisely the
   V6.8 lesson recorded in §20 (*"a swallowed supabase-js error is indistinguishable from zero rows;
   always destructure and check `error`"*) recurring in the same subsystem. **Small and obvious to fix.
   NOT FIXED — see the scope note at the top.**
2. ⚠️ **`whatsapp_sender`'s stored value violates its own column contract.**
   `supabase/migrations/20260523_messaging_schema.sql:11-14` documents the format as
   `+447700900000`. Gusto is `07380736226`. The third variant exists only to paper over that drift, and
   the same migration still describes the column as *"the Twilio-registered … number"*, which it has not
   been since V6.3.
3. ⚠️ **`.or()` interpolates `toVariants` unescaped.** Not exploitable: every variant is derived from
   `replace(/\D/g, '')` output, so it can contain only digits and a leading `+` or `0`. **Safe by
   derivation, not by escaping** — recorded because the safety depends on a regex three lines away.

---

# Q2 — Does anything write `phone_number_id`?

## ✅ §20's CLAIM IS VERIFIED. THERE IS NO WRITER ANYWHERE.

**What was searched:** `grep -rn "phone_number_id\|phoneNumberId"` across `*.ts`, `*.tsx`, `*.sql`,
`*.js`, `*.json` over the whole repository, excluding `node_modules/`, `.next/`, `ios/` and `android/`.
That covers every route, the admin console, `lib/`, `scripts/`, `supabase/migrations/` and every seed
file. **28 occurrences, listed by role below. Not one is a write.**

| File | Occurrences | Role |
|---|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts` | 16 | `TRUCK_FIELDS` select, the `TruckRow` type, comments, the **primary lookup** `.eq('phone_number_id', phoneNumberId)`, log lines, and the send argument. **All reads.** |
| `supabase/migrations/20260816_trucks_phone_number_id.sql` | 8 | `ADD COLUMN`, `COMMENT ON COLUMN`, the partial unique index, and header comments. **DDL only — no backfill, no `UPDATE`.** |
| `lib/meta-whatsapp.ts` | 3 | the `phoneNumberId` **parameter** of `sendMetaWhatsApp` and its URL segment. Never touches the column. |
| `lib/whatsapp/connection-state.ts` | 2 | a field on a pure input type. ⚠️ **This module is imported by nothing.** |

**Three independent confirmations that it cannot be written by accident either:**

1. 🔴 **The `update_truck` allow-list does not contain it.** `app/api/manage/route.ts:861` lists 24
   writable columns; `whatsapp_sender` is there, `phone_number_id` is **not**. A hand-crafted
   `update_truck` call cannot set it.
2. **No `.update(`, `.insert(` or `.upsert(` anywhere names the column** — it appears in no object
   literal in the repository.
3. **The other truck-row writers do not reference it**: `lib/provision-truck.ts`, `app/api/setup/route.ts`
   and the admin `create-truck` route contain zero occurrences.

⚠️ **CONSEQUENCE, STATED PLAINLY:** the column can only ever be populated by hand in Supabase, and
until it is, the fallback in Q1 is the whole of inbound routing. That is the onboarding step §20 describes
as manual, and it is genuinely manual.

---

# Q3 — The version pin

## 3.a Where it is defined

**File:** `lib/meta-whatsapp.ts`.
**Surviving identifiers:** `GRAPH_API_VERSION` and `GRAPH_BASE_URL`.

```ts
export const GRAPH_API_VERSION = 'v19.0'
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`
```

## 3.b ✅ ONE CONSTANT. NOT DUPLICATED.

**The literal `'v19.0'` appears exactly ONCE in executable code** — the `GRAPH_API_VERSION`
initialiser. Every other occurrence in the repository is non-executable:

| Occurrence | Kind |
|---|---|
| `lib/meta-whatsapp.ts` — the `GRAPH_API_VERSION` initialiser | 🔴 **the only executable one** |
| `lib/meta-whatsapp.ts` — the byte-identity note and the *"v19.0 IS NOT VERIFIED AS CURRENT"* block | comments |
| `supabase/migrations/20260816_trucks_phone_number_id.sql` — the header comment | SQL comment |
| `docs/whatsapp-*.md`, `docs/reference-manual.md` | documentation |

The module header states the rule and the reason: *"The version used to be a literal inside the send URL.
A second literal in a second function is how two calls end up on two Graph versions and only one of them
breaks when Meta retires a release — which presents as 'sending works, templates 400'."*

## 3.c Which call sites consume it — ⚠️ §20 IS RIGHT IN SUBSTANCE, SHORT BY ONE

§20 says *"the sender and the template calls now share it"*. **Confirmed.** The precise count is **three
executable consumers and one reporting consumer**, all in `lib/meta-whatsapp.ts`:

| Consumer | URL built | Executable? |
|---|---|---|
| `sendMetaWhatsApp` | `` `${GRAPH_BASE_URL}/${phoneNumberId}/messages` `` | yes |
| `listMessageTemplates` | `` `${GRAPH_BASE_URL}/${cfg.wabaId}/message_templates?fields=id,name,status,category,language&limit=${safeLimit}` `` | yes |
| `createMessageTemplate` | `` `${GRAPH_BASE_URL}/${cfg.wabaId}/message_templates` `` | yes |
| `metaTemplateConfigStatus` | returns `graphApiVersion` / `graphBaseUrl` for **display on the admin page** | no call made |

✅ **`lib/meta-whatsapp.ts` has exactly two importers** — `app/api/webhooks/meta/whatsapp/route.ts`
and `app/api/admin/whatsapp-templates/route.ts`. Nothing else in the repository can reach a Graph URL.

## 3.d ✅ THE BUMP IS A ONE-LINE CHANGE, NOT A REFACTOR

**One line:** the `GRAPH_API_VERSION` initialiser in `lib/meta-whatsapp.ts`. All three executable call
sites move together by construction; that is what the constant is for.

⚠️ **Two non-executable references would go stale on a bump** and are worth touching in the same
commit so a future grep does not find a contradiction: the header comment in
`20260816_trucks_phone_number_id.sql`, and the *"expands to `https://graph.facebook.com/v19.0/<id>/messages`"*
note at `lib/meta-whatsapp.ts:11`. **Neither affects behaviour.**

---

# Q4 — The template tool, precisely

## 4.a File paths

| Part | Path |
|---|---|
| **Module** | `lib/meta-whatsapp.ts` — the template half, below the `MESSAGE TEMPLATES` banner: `metaTemplateConfigStatus`, `requireConfig`, `metaFailure`, `listMessageTemplates`, `createMessageTemplate`, `describeFailure` |
| **Route** | `app/api/admin/whatsapp-templates/route.ts` — `GET` (preflight + list), `POST` (create) |
| **Page** | `app/admin/whatsapp-templates/page.tsx` (287 lines) |
| **Gate** | `lib/auth/admin.ts` — `verifyAdmin` |

## 4.b The admin gate

`verifyAdmin(req)` is the **first statement** of both handlers (`route.ts:41` for GET, `:85` for POST),
returning `401 { error: 'Unauthorised' }` on failure. Authority is `operators.is_admin`; the web resolves
the operator from the Supabase session cookie, the native app from a Bearer fallback. ✅ **It is the
canonical check, not a fork** — the same function guards the admin API and the server-side `/landing` gate.

⚠️ **The page's own gate is cosmetic and says so.** `page.tsx:12` records that the real gate is on the
server. Correct posture, recorded so nobody later "hardens" the page and believes that changed anything.

## 4.c The credential — ✅ PLATFORM, CONFIRMED

```ts
const ENV_WABA = 'META_WHATSAPP_BUSINESS_ACCOUNT_ID'
const ENV_TOKEN = 'META_WHATSAPP_ACCESS_TOKEN'
```

- **The token is `META_WHATSAPP_ACCESS_TOKEN`** — 🔴 **the same single platform token the send path
  uses at `lib/meta-whatsapp.ts:34`.**
- **The WABA id is `META_WHATSAPP_BUSINESS_ACCOUNT_ID`**, used as the URL path segment.
- ✅ **Confirmed platform, not per-truck, three ways:** `requireConfig()` reads only `process.env`;
  **no function in the template half takes a truck parameter of any kind**; and the module header states
  it — *"They read the PLATFORM token and the PLATFORM WABA id from the environment, with no truck
  parameter and no lookup."*

⚠️ **A GREP TRAP WORTH RECORDING.** Both are read as `process.env[ENV_WABA]` / `process.env[ENV_TOKEN]`
— a **computed index**. A `grep 'process\.env\.META'` finds neither. This is why
`docs/whatsapp-current-state-read.md` concluded *"the codebase has never held a WABA id in any form"* —
**true when written on 19 August, and superseded by the tool added on 20 August.** §35's *grep for the rail,
not for the file* applies to the access syntax as well as to the name.

## 4.d The exact create payload

`lib/meta-whatsapp.ts:349-352`, quoted:

```ts
  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: bodyText }
  if (variableCount > 0) bodyComponent.example = { body_text: [examples] }

  const payload = { name, language, category: input.category, components: [bodyComponent] }
```

POSTed at `:362-366` to `` `${GRAPH_BASE_URL}/${cfg.wabaId}/message_templates` `` with
`Authorization: Bearer <token>` and `Content-Type: application/json`.

⚠️ **`example.body_text` is a list of lists** — `[examples]`, one inner array per example set — and the
`example` key is **omitted entirely** when the body declares no variables. Both are the module's reading
of Meta's documentation and are marked unproven in its own header.

## 4.e Which version string

✅ **The shared pin.** `createMessageTemplate` and `listMessageTemplates` both build from
`GRAPH_BASE_URL`. **Neither carries its own literal.** This is the state §20 describes.

## 4.f 🔴 HAS AN AUTHENTICATED CALL EVER BEEN MADE? NO. YOUR BELIEF IS CORRECT.

**The distinction, drawn exactly:**

✅ **THE FAKE-TOKEN CALL HAPPENED, AND IT WAS A REAL OUTBOUND REQUEST.** Recorded in
`docs/whatsapp-template-tool-report.md` §4.3: a genuine POST to
`https://graph.facebook.com/v19.0/111122223333444/message_templates`, answered by Meta with
`HTTP 401 {"error":{"message":"Malformed access token EAAG_fake_token_for_the_harness","type":"OAuthException","code":190,"fbtrace_id":"ARzr6l1_FxTIUsmkd8fgCGd"}}`.
**A real `fbtrace_id` means Meta's infrastructure answered.** Nothing was created; no valid credential
was used; the request was rejected at authentication.

🔴 **NO AUTHENTICATED CALL IS RECORDED ANYWHERE.** Searched: the three reports, the module, the route,
the page, and the migration set. There is **no fixture, no captured 2xx, and no
`[meta-templates] LIST ok count=` or `[meta-templates] CREATE ok name=` line** in any committed artefact.
Those two log strings exist in the code (`:259`, `:395`) and are what an authenticated success would emit.

🔴 **AND AN AUTHENTICATED CALL IS CURRENTLY IMPOSSIBLE LOCALLY.** `.env.local` declares exactly two
Meta variables — `META_WEBHOOK_VERIFY_TOKEN` and `META_WHATSAPP_ACCESS_TOKEN`. **`META_WHATSAPP_BUSINESS_ACCOUNT_ID`
is absent** (values were not read; only the variable names were listed). So `requireConfig()` returns
`missing_env` and `route.ts:54-65` refuses **before any Meta call is made**. Whether production has it set
**CANNOT BE DETERMINED from this repository.**

**What would settle it:** the Vercel function logs for `/api/admin/whatsapp-templates`. A single
`[meta-templates] LIST ok count=` line is proof of an authenticated success; its absence across the
tool's whole lifetime is proof of the opposite. Equally, opening the tool and pressing **Load templates**
once produces the answer directly — 🔴 **which is the preflight §4.1 of the tool report already insists on:
the first authenticated call must not be the one on camera.**

---

# Q5 — `messenger_page_token`

## 🔴 DEAD COLUMN. NOTHING READS IT. NOTHING WRITES IT. RECORDED AS DEAD.

**Every occurrence in the repository, exhaustively:**

| Location | What it is |
|---|---|
| `supabase/migrations/20260523_messaging_schema.sql:8` | `add column if not exists messenger_page_token text` |
| `supabase/migrations/20260523_messaging_schema.sql:19-21` | `comment on column … 'Facebook Page Access Token for Messenger API. Set during OAuth flow. Treat as secret — do not expose to client.'` |
| `app/api/dashboard/route.ts:38` | a **comment** citing it as an example of a column that *"exists on the table and appears NOWHERE in the code"* |
| `app/api/dashboard/route.ts:46` | a **`TRUCK_REDACT` entry** — *"Meta provider credential (ditto — exists, unreferenced here)"* |

⚠️ **THE REDACTION ENTRY IS NOT A READ.** It is a key in a `Set` used to *remove* the field from a
spread row. It proves the column is known to exist; it does not constitute a consumer.

**No route, no lib module, no script, no seed file references it. There is no OAuth flow to set it** —
§20 records Messenger and Instagram as verify-handshake + `console.log` stubs, and the Messenger route
confirms it: it parses `entry.messaging[0]`, reads `sender.id` and the text, and does nothing with either.

## ⚠️ IT IS NOT A CREDENTIAL-STORAGE PRECEDENT, AND SHOULD NOT LATER BE READ AS ONE

**Nothing ever wrote it.** It is a column created in May 2026 for an OAuth flow that was never built,
carrying a `comment` that describes intended behaviour rather than actual behaviour. **A column comment is
a claim, and this one has never been true.** The `whatsapp-per-truck-architecture.md` recommendation of a
dedicated `whatsapp_connections` table is untouched by it — there is no existing pattern here to follow
or to point at.

⚠️ **THREE SIBLINGS IN THE SAME CONDITION**, found while answering this and recorded so the census is
complete:

- **`trucks.messenger_page_id`** — created by the same migration, **referenced nowhere in code at all**,
  not even in the redaction list. (Correctly so: a Page ID is an identifier, not a secret, and `SECRETISH`
  does not match `page_id`.)
- **`META_WHATSAPP_PHONE_NUMBER_ID`** — named in §20's env RULE, **read by no code**. The send path takes
  its `phoneNumberId` as an argument from the inbound webhook, never from the environment.
- **`ENCRYPTION_KEY` / `lib/crypto.ts`** — cited by §20 as the token-storage mechanism for Messenger/Instagram.
  **Neither exists.** (Already recorded in `whatsapp-current-state-read.md` §11; repeated here only because
  it is the same "documented credential storage that was never built" class as this question.)

---

# Q6 — What breaks if the version moves

**Nothing was changed. This is a report on consequence only.**

## 6.a Call sites that would change behaviour

**The three executable consumers in 3.c, and nothing else.** `GRAPH_BASE_URL` is not used by the webhook
handler, the signature helper, the classifier, the email path or any order path, and
`lib/meta-whatsapp.ts` has only two importers. ✅ **The blast radius of the pin is the module itself.**

## 6.b Testing the expectation rather than confirming it

Your expectation: *"nothing observable, because nothing is currently working."* I tried to falsify it
three ways. **Two tests it survives. One it does not.**

✅ **TEST 1 — is there a reachable send path to Gusto? NO.** `sendMetaWhatsApp` has exactly one call
site (`route.ts:280`), reachable only after a truck match. Gusto's `phone_number_id` is NULL, so it can
only match via the fallback, which requires Meta to name `447380736226` as the receiving business number —
and Q1.d establishes that number is a test recipient, not a sender. **The send path is unreachable for
Gusto today. Expectation survives.**

✅ **TEST 2 — does the pin reach anything outside the Graph calls? NO.** Verified by grep across the
repository: no other importer, no other consumer, no other URL construction. **Expectation survives.**

🔴 **TEST 3 — IS "NOTHING IS CURRENTLY WORKING" ACTUALLY ESTABLISHED? NO, AND THIS IS THE ONE THAT
FAILS.** The evidence offered for it is `whatsapp_logs` silence since 18 June. **Q1.e shows that an
unmatched message writes no `whatsapp_logs` row at all** — the insert is downstream of the lookup — and
Q1.g shows a signature-gate refusal writes none either. **So the silence is equally consistent with:**

| Reality | `whatsapp_logs` |
|---|---|
| No inbound messages are being sent to any Meta number | silent |
| Messages arrive and are dropped at the truck lookup | **silent** |
| Messages arrive and are refused 401 at the signature gate | **silent** |

**The expectation is probably right. It is not established by the evidence given for it.** Distinguishing
the three needs the production function logs, using the three marker strings listed in Q1.f.

## 6.c 🔴 THE REAL RISK IN A BUMP IS SEQUENCING, NOT BLAST RADIUS

Because the pin is shared, bumping it makes the **template** path the first thing to meet a new version —
and that path has **never had an authenticated success on any version** (Q4.f). 🔴 **A bump immediately
before the review recording would put two unproven variables on camera at once: an unproven version AND
an unproven payload shape.** A failure then would be undiagnosable in the moment, because Meta's 400 would
not say which of the two it objected to.

**Recorded as a sequencing observation, not as a change and not as a recommendation to act now.**

## 6.d ⚠️ THE FAILURE MODE OF A DEAD VERSION, IF TRAFFIC EVER RESUMES

Per your external fact, a call to a deprecated version returns 400 with a version subcode. Traced through
this code, that is **quieter than it should be**:

`sendMetaWhatsApp` throws at `:45-48` → caught at `route.ts:282-284` → `console.error('send failed')`
→ **still returns 200.** But the `whatsapp_logs` insert at `:262` has **already run**, with
`response_sent` populated.

🔴 **SO: A REPLY THAT WAS COMPOSED BUT NEVER DELIVERED IS LOGGED AS THOUGH IT WERE SENT.**
`whatsapp_logs.response_sent` records what the classifier produced, **not what the customer received.**
If inbound traffic ever resumes on a dead version, the table will look healthy while nothing arrives.
**This is unobservable today only because nothing is flowing** — it becomes a live diagnostic trap the
moment routing is fixed, and it is worth knowing before the WhatsApp arc is judged by that table.

## 6.e On version-liveness itself

**Treated as UNKNOWN, per your instruction.** The 20 August fake-token exchange returned a
`401 OAuthException`, not a 400 version subcode — which shows the `v19.0` path segment resolves at Meta's
router rather than 404ing, and **shows nothing about whether the version is still served**, because
authentication was evaluated first. ✅ **Your reading of that evidence is the correct one and the code's
own header agrees:** *"Whether Meta still supports it … CANNOT BE DETERMINED FROM THIS REPOSITORY."*

**The observation that settles it:** one authenticated `listMessageTemplates` call. It returns either a
200 with a template list, or a 400 naming the version — and either answer is definitive.

---

# Small fixes identified and DELIBERATELY NOT MADE

Per the scope rule. Each is named so it can be commissioned later, and none was touched.

1. 🔴 **The swallowed `error` at both truck lookups** (`route.ts:160`, `:182`). Two-character change per
   site. Latent until a second truck is populated, then it drops messages silently. **The highest-value
   item on this list.**
2. ⚠️ **The `META_APP_SECRET` vs `META_WHATSAPP_APP_SECRET` name mismatch** between the code and §20's env
   RULE. **The fix may be to the manual, to the Vercel environment, or to neither — the production
   variable list decides, and I cannot read it.** Do not "fix" the code to match the manual without
   checking, or a working gate will be broken.
3. ⚠️ **The stale column comment on `whatsapp_sender`** — documents `+447700900000` and calls the column
   Twilio-registered. Both wrong; the live value and the live provider disagree with it.
4. ⚠️ **The two non-executable `v19.0` references** that would go stale on a bump (3.d).

---

# What this report does NOT establish

Stated plainly, so none of it is later read as verified:

- **That inbound traffic is or is not arriving.** Source cannot see it. The production function logs can.
- **Whether `META_APP_SECRET` and `META_WHATSAPP_BUSINESS_ACCOUNT_ID` are set in production.** `.env.local`
  is the local environment only; variable **names** were listed, **values were not read**.
- **Whether `v19.0` is still served.** UNKNOWN by instruction, and unresolvable from here.
- **Whether Meta accepts the template payload shape.** Never exercised past authentication.
- **Whether `pizzeria-gusto` is `active = true`.** Both lookups carry `.eq('active', true)`, so an inactive
  row would miss for a fourth, independent reason. **Your live facts do not state it and I did not query.**

⚠️ **One discrepancy between your live facts and the manual, recorded rather than resolved:** your queries
give **13 trucks**; the V11.34 changelog entry states `kds_mode` was set false *"across all sixteen"*.
**Your query wins.** The likely reconciliation is active-versus-total rows, but that is a guess and is
labelled as one.
