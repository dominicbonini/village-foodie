# WhatsApp message templates — a minimal, admin-only creation tool

**PROMPT INTEGRITY.** No span of the brief arrived garbled.
**STOP CONDITIONS: one fired partially and is reported in §2 rather than silently absorbed.** An admin
gate exists, so that stop did not fire. The `META_WHATSAPP_BUSINESS_ACCOUNT_ID` question has a
**split answer** — definitively absent locally, unverifiable in Vercel from here — and §2 says exactly
what that means before anything else.

**BUILT:** three files, 850 lines. One tracked file modified (`lib/meta-whatsapp.ts`, +400/-1), two new
files. **The webhook, the classifier, auto-replies and every truck-facing surface are untouched. No
migration. Nothing is stored.**

🔴 **ONE THING WAS EXERCISED AGAINST META AND ONE THING WAS NOT — §4.3 draws the line precisely, and it
is not where the brief assumed.** A verification harness reached `graph.facebook.com` with a deliberately
invalid token and received a genuine Meta error envelope. That proves the transport, the URL shape and
the error parsing. It proves nothing about whether Meta will accept the template payload.

---

# PHASE 1 — READ

## 1.1 `lib/meta-whatsapp.ts`, in full, as it was before this task

**READ**, and confirmed identical to what `docs/whatsapp-current-state-read.md` recorded — 26 lines,
one function.

```ts
export async function sendMetaWhatsApp(
  to: string,
  message: string,
  phoneNumberId: string
): Promise<void> {
  const toDigits = to.replace(/^\+/, '')

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body: message },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Meta WhatsApp error ${res.status}: ${err}`)
  }
}
```

## 1.2 🔴 THE VERSION — every place a Graph API version appears

**Search:** `grep -rn "graph\.facebook\.com\|graph\.instagram\.com\|/v[0-9][0-9]*\.[0-9]"` over the tree
excluding `node_modules`, `.next`, `.git` and `docs`.

| Location | Occurrence | Kind |
|---|---|---|
| `lib/meta-whatsapp.ts:8` | `https://graph.facebook.com/v19.0/${phoneNumberId}/messages` | 🔴 **the only executable one in the entire repository** |
| `supabase/migrations/20260816_trucks_phone_number_id.sql:4` | the same URL, inside a comment | prose |

Including `docs/`, four further occurrences appear, all quoting the same line back. **There is exactly
one Graph API version literal that runs**, and there was no other Graph call to disagree with it.
**READ.**

### Should template creation use the same version or a newer one?

**Recommendation: the same version, through a shared constant — which is what was built.** Three
reasons, and the third is the one that decides it:

1. **A second literal is how two calls end up on two versions.** The failure mode is specific and
   nasty: sending keeps working while templates 400, so the version is the last thing anyone suspects.
2. **The constant makes a future bump a one-line change that moves both calls together.** That is
   strictly better than either literal alone, whatever the right number turns out to be.
3. 🔴 **I CANNOT VERIFY WHICH VERSIONS META CURRENTLY SUPPORTS, AND I WILL NOT PUT A GUESSED NUMBER IN
   THE CODE AND CALL IT CORRECT.** `v19.0` is well behind current — that is your premise and I have no
   way to check it. Choosing `v21.0` or `v23.0` here would be inventing a fact. **This is for you to
   check against Meta's Graph API changelog.** If it needs to move, change `GRAPH_API_VERSION` in
   `lib/meta-whatsapp.ts:19` and both the send path and both template calls move with it.

⚠️ **ONE PIECE OF EVIDENCE, AND IT IS WEAKER THAN IT LOOKS.** The verification harness (§4.3) POSTed to
`https://graph.facebook.com/v19.0/<waba>/message_templates` and Meta answered with a structured
`OAuthException` about the token — not a version error, not a 404. **That shows the version path still
resolves and is not removed.** It does **not** show that `v19.0` is supported for template creation:
Meta plausibly rejects the token before it ever validates the rest of the request. **INFERRED, and
deliberately not stated more strongly than that.**

## 1.3 Every admin-only surface, and the gate

**Searches:** `find app/api/admin -type f`, `find app/admin -type f`, `grep -rn "verifyAdmin" lib app`.

| Surface | Kind |
|---|---|
| `app/api/admin/route.ts` | the console's data API (also `?section=check_admin`) |
| `app/api/admin/create-truck/route.ts` | |
| `app/api/admin/create-operator/route.ts` | |
| `app/api/admin/delete-truck/route.ts` | |
| `app/api/admin/execute-account-deletion/route.ts` | |
| `app/api/admin/provision-demo/route.ts` | |
| `app/api/admin/backfill-usage/route.ts` | |
| `app/admin/page.tsx` | 🔴 **the only admin page**, a client component |
| `app/landing/layout.tsx` | uses the same gate to wall the landing preview in production |

**There is no `app/admin/layout.tsx`.** The authority is entirely server-side, in the API routes.
**READ.**

### The gate — `lib/auth/admin.ts`, quoted whole

```ts
// Canonical admin check — the SINGLE source used by both the admin API (app/api/admin/route.ts) and the
// server-side /landing gate (app/landing/layout.tsx). Do not fork this: web resolves the operator from the
// Supabase session cookie; the native app (no cookie on fetches) passes its session as a Bearer, which is
// only consulted when a NextRequest is supplied and there's no cookie user. Authority = operators.is_admin.
export async function verifyAdmin(req?: NextRequest): Promise<boolean> {
  const supabaseAuth = await createSupabaseServerClient()
  let { data: { user } } = await supabaseAuth.auth.getUser()   // WEB (cookie) — resolves first
  if (!user && req) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await serviceClient.auth.getUser(jwt)
      if (bearerUser) user = bearerUser
    }
  }
  if (!user) return false
  const { data: operator } = await serviceClient
    .from('operators')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .single()
  return !!operator?.is_admin
}
```

**✅ THE STOP DID NOT FIRE.** A canonical, non-forkable admin gate exists, and the new route sits behind
it exactly as its six siblings do.

The page-side convention, from `app/admin/page.tsx`: a `'use client'` component that carries
`...await nativeAuthHeader()` on every fetch (`{}` on web, a Bearer in the native app) and holds no
authority of its own. The new page copies that, unchanged.

## 1.4 How env vars are read and validated elsewhere

**Three distinct patterns exist, and they are chosen by consequence — READ.**

**(a) Throw, when nothing can proceed** — `lib/payments/authorize.ts:43`:

```ts
function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return key
}
```

**(b) Log loudly, name the missing part, and degrade** — `lib/fcm.ts:50`:

```ts
  if (!projectId || !clientEmail || !privateKey) {
    const missing = [!projectId && 'project_id', !clientEmail && 'client_email', !privateKey && 'private_key'].filter(Boolean).join(', ')
    console.error(`[fcm] NOT CONFIGURED: FCM_SERVICE_ACCOUNT_JSON parsed but is missing ${missing} — Android push is DISABLED. ...`)
    return null
  }
```

**(c) Fail closed as a return value** — `lib/meta/webhook-signature.ts:96`:

```ts
  if (secrets.length === 0) return { ok: false, reason: 'no_secret_configured' }
```

**⚠️ AND THE ONE THAT MATTERS MOST HERE — the counter-example.** `lib/meta-whatsapp.ts` itself does
**none** of these. It interpolates the variable directly:

```ts
'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
```

**With the variable unset, today's behaviour is:** the literal string `Bearer undefined` is sent, Meta
returns 401, the function throws, and the webhook's call site **catches and only `console.error`s it**
— while the `whatsapp_logs` row written moments earlier already claims a reply was sent. **That is the
exact silent failure the brief says must not happen on camera**, and it is why the new code uses
pattern (c) with pattern (b)'s naming: a named, returned failure that says *which variable* is missing.

---

# PHASE 2 — STOP CONDITIONS

## ✅ An admin gate exists — that stop did not fire. See §1.3.

## 🔴 `META_WHATSAPP_BUSINESS_ACCOUNT_ID` — A SPLIT ANSWER. READ THIS BEFORE DEPLOYING.

The brief asked me to establish whether it is *genuinely set, not just declared*. What I can establish:

| Question | Answer | Mark |
|---|---|---|
| Is it read by any code in this repo? | **No** — before this task. `grep -rn "META_WHATSAPP_BUSINESS_ACCOUNT_ID"` returned hits only in `docs/`. | **READ** |
| Is it in `.env.local`? | 🔴 **NO. It is not declared there at all.** `grep -n "^META_" .env.local` returns exactly two names: `META_WEBHOOK_VERIFY_TOKEN` and `META_WHATSAPP_ACCESS_TOKEN`. (Values were masked; only names were inspected.) | **READ** |
| Is it set in Vercel? | ⚠️ **CANNOT DETERMINE.** The Vercel CLI is not installed (`which vercel` → not found) and this checkout is not linked (`.vercel/` does not exist). There is no way from here to read the project's environment. | **CANNOT DETERMINE** |
| Is it *genuinely set* rather than declared empty? | ⚠️ **CANNOT DETERMINE for the same reason** — and this is a real distinction, not a quibble: a variable declared with an empty value produces `Bearer ` and an opaque 401 that reads exactly like a revoked token. | **CANNOT DETERMINE** |

### What I did about it, and why I did not simply stop

**The stop condition is "if it cannot be read at runtime".** The runtime that matters is the deployed
one, which is precisely the thing I cannot observe — and your own premise states it is declared there.
Stopping outright would have delivered nothing on the strength of a fact I cannot check either way.

**So the tool answers the question itself, in one click, before anything else is pressed.** The first
thing the page renders is a preflight panel reporting each variable as **present** or **MISSING** — and
`metaTemplateConfigStatus()` treats a whitespace-only value as absent, which is exactly the
"declared but not set" shape. It makes no Meta call to do this.

🔴 **THE PRACTICAL CONSEQUENCE, STATED PLAINLY: RUNNING THIS LOCALLY WILL REPORT
`META_WHATSAPP_BUSINESS_ACCOUNT_ID: MISSING`, BECAUSE IT IS NOT IN `.env.local`.** That is not a bug.
**Open `/admin/whatsapp-templates` on the deployed site and read the preflight before you plan a
recording** — that is the one action that converts this CANNOT DETERMINE into a fact.

## ✅ No instruction contradicted another.

---

# PHASE 3 — THE BUILD

## 3.a The Graph wrapper, extended — `lib/meta-whatsapp.ts` (26 → 425 lines, +400/-1)

**The constants, extracted first as instructed:**

```ts
export const GRAPH_API_VERSION = 'v19.0'
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`
```

**The one edit to existing code**, and the entire diff to `sendMetaWhatsApp`:

```diff
-  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
+  const res = await fetch(`${GRAPH_BASE_URL}/${phoneNumberId}/messages`, {
```

**✅ PROVEN EQUIVALENT BY EXECUTION, NOT BY INSPECTION — see §4.2.** Both template literals were
extracted from the two file versions, evaluated over eight `phoneNumberId` shapes, and byte-compared:
8/8 identical, 0 mismatches. A line-by-line diff of the function shows **26 lines before, 26 after, one
differing line — the one above.**

## 3.b LIST — `listMessageTemplates(limit = 50)`

`GET ${GRAPH_BASE_URL}/${wabaId}/message_templates?fields=id,name,status,category,language&limit=N`

Returns `{ ok: true, templates: MessageTemplateSummary[], raw }` or `{ ok: false, error }`. `limit` is
clamped to 1–100 locally. **Pagination is deliberately not followed** — this demonstrates that listing
works; it is not a template manager.

🔴 **A 200 WITH AN UNPARSEABLE BODY IS A FAILURE, NOT AN EMPTY LIST.** Rendering "no templates" for a
response whose shape we did not understand is exactly the silent failure this tool exists to avoid.

## 3.c CREATE — `createMessageTemplate(input)`

`POST ${GRAPH_BASE_URL}/${wabaId}/message_templates` with:

```json
{
  "name": "order_ready_notification",
  "language": "en_GB",
  "category": "UTILITY",
  "components": [
    { "type": "BODY",
      "text": "Hi {{1}}, your order at {{2}} is ready to collect. Thanks for ordering ahead!",
      "example": { "body_text": [["Sarah", "Pizzeria Gusto"]] } }
  ]
}
```

**One BODY component. No header, no footer, no buttons.** Every extra component is another shape that
can be wrong on camera.

**Two local validations run before any network call**, chosen because both are certain, both are the
usual first rejection, and both have an instant answer:

- **The name rule** `/^[a-z0-9_]{1,512}$/`, with a suggested corrected name in the message.
- **Variable/example parity** — `{{1}}`, `{{2}}` … are counted as a **distinct set** (so `{{1}}` twice
  needs one example), and exactly that many examples are required. `example.body_text` is omitted
  entirely when there are no variables.

⚠️ **Everything else is Meta's to judge**, and Meta's refusal is passed through verbatim rather than
pre-empted by a guess about its rules.

## 3.d The admin surface

**`app/api/admin/whatsapp-templates/route.ts` (138 lines)** — `GET` (with `?section=config` for the
preflight, which makes no Meta call) and `POST`. `verifyAdmin(req)` first on both; **401 on failure**,
matching its six siblings.

⚠️ **EVERY OTHER FAILURE IS A 200 WITH `ok: false` AND A `message`.** Deliberate: on camera, a non-2xx
makes the browser's own error handling and a `fetch` rejection compete with the message we actually
want read aloud. A structured body the page renders beats an HTTP status it must decode.

**`app/admin/whatsapp-templates/page.tsx` (287 lines)** — three sections: **Configuration** (the
preflight, rendered on mount), **Existing templates** (a Load button and a table), **Create a template**
(name, language, category, body, examples), with a collapsible **raw response from Meta** under each
result.

🔴 **NO OPERATOR ACCESS AND NO PER-TRUCK ANYTHING.** No truck id is accepted, sent or looked up
anywhere in either file. The token is the platform token; the WABA is ours.

⚠️ **NOT LINKED FROM THE ADMIN CONSOLE, DELIBERATELY.** Adding a nav item means editing
`app/admin/page.tsx` — 1,700 lines carrying the live plan, trial and feature-override controls. The
risk of touching that file is not worth a link on a tool that will be opened by URL a handful of times.
**Navigate to `/admin/whatsapp-templates` directly.**

## 3.e Failing loudly and specifically

`TemplateFailure` is a closed union of four arms, and `describeFailure()` turns any of them into the one
sentence both the log line and the page use — so a failure cannot be worded two ways.

| Arm | What it says |
|---|---|
| `missing_env` | 🔴 **names the exact variables** — "Not configured: META_WHATSAPP_BUSINESS_ACCOUNT_ID is missing from this environment. Set it and redeploy." |
| `invalid_input` | names the field and the rule, with a suggested fix for the name case |
| `meta_error` | **Meta's own `message` verbatim**, plus HTTP status, `code`, `error_subcode` and `type`, plus the raw body (truncated at 4,000 chars) |
| `network` | "Could not reach Meta: …" |

🔴 **THE FUNCTIONS NEVER THROW.** Every failure is a return value. An exception surfacing as a blank
screen mid-recording is the worst outcome available, so it is made structurally impossible rather than
handled by discipline.

## 3.f Logging, so a failed review attempt can be diagnosed afterwards

| Line | When |
|---|---|
| `[meta-templates] LIST GET <url>` | every list |
| `[meta-templates] CREATE POST <url> payload=<full JSON>` | 🔴 **the entire request body**, before sending |
| `[meta-templates] CREATE response http=<status> body=<full body>` | 🔴 **Meta's entire response**, before any branching |
| `[meta-templates] CREATE FAILED name=… http=… — <describeFailure>` | on refusal |
| `[meta-templates] CREATE refused locally — <message>` | on local validation failure |
| `[admin/whatsapp-templates] CREATE requested name=… bodyChars=… examples=…` | at the route |

🔴 **THE TOKEN IS NEVER LOGGED, ANYWHERE.** The WABA id is (it is an identifier, not a credential); the
bearer never reaches a log line. The template payload contains no secret — a template body is copy — and
after a failed attempt the only useful question is *what exactly did we send*, which nothing else can
answer once the page has been closed.

## What was NOT touched — verified, not asserted

`git status --porcelain` shows **one modified tracked file**, `lib/meta-whatsapp.ts`. The webhook, the
classifier, `lib/twilio.ts`, every truck-facing surface, `app/admin/page.tsx` and every migration are
**unmodified**. No migration was added; **this tool stores nothing**. No per-truck token handling was
built — that decision remains open.

---

# PHASE 4 — VERIFICATION

## 4.1 Producing the review video, step by step

**Before you record — the preflight run.**

| # | Do this | You will see |
|---|---|---|
| 0 | Deploy. Sign in as an operator whose `operators.is_admin` is true | — |
| 1 | Open **`/admin/whatsapp-templates`** (type the URL; it is not linked) | The page, with **Configuration** already populated |
| 2 | Read the Configuration panel | `META_WHATSAPP_BUSINESS_ACCOUNT_ID: present` and `META_WHATSAPP_ACCESS_TOKEN: present`, both green, plus the Graph base URL. 🔴 **If either says MISSING in red, stop — set it in Vercel and redeploy. Do not start recording.** |
| 3 | Press **Load templates** | Either a table of existing templates, or "Meta returned no templates for this account", or a red error block carrying Meta's own words. 🔴 **This is the real go/no-go: it proves the token and WABA id work together.** |

**The recording itself.**

| # | Do this | You will see |
|---|---|---|
| 4 | Start recording with the page visible, Configuration panel in frame | green presence indicators |
| 5 | Press **Load templates** on camera | the current list — establishes the starting state |
| 6 | Fill the form. Defaults are pre-filled and are a real message this product would send: name `order_ready_notification`, language `en_GB`, category `UTILITY`, body `Hi {{1}}, your order at {{2}} is ready to collect. Thanks for ordering ahead!`, examples `Sarah, Pizzeria Gusto` | ⚠️ **Change the name** if you have run this before — Meta rejects a duplicate name |
| 7 | Press **Create template** | The button reads "Creating…", then a **green panel**: *Template "order_ready_notification" was created. Meta's status for it is PENDING — a new template is normally PENDING until Meta reviews it.* |
| 8 | The list reloads by itself | the new template appears with status `PENDING` |
| 9 | Optionally expand **Raw response from Meta** | Meta's JSON, with the template id |

Steps 5 → 8 are the demonstration: our app listed, created, and showed the result.

## 4.2 What happens on each failure

| Failure | What the admin sees | Where it is decided |
|---|---|---|
| **Env var missing** | Preflight goes **red** naming the variable; Load and Create both return *"Not configured: META_WHATSAPP_BUSINESS_ACCOUNT_ID is missing from this environment. Set it and redeploy."* 🔴 **No Meta call is made** | locally, before the network |
| **Env var declared but empty** | Identical to missing — whitespace-only is treated as absent, precisely so this does not present as a token problem | locally |
| **Token invalid or revoked** | Red panel: *"Meta refused this (HTTP 401) · code 190 · OAuthException: Malformed access token …"* — **Meta's own words**, plus the raw body | Meta |
| **WABA id wrong** | Meta's own error, typically a 400 with an "Unsupported get request" / object-not-found message and code 100. The raw body is on screen | Meta |
| **Template name rejected locally** | *"Template name "Order Ready" is not valid. Meta allows lowercase letters, digits and underscores only — no spaces, no capitals, no hyphens. Try "order_ready"."* Instant, no round trip | locally |
| **Template name rejected by Meta** (e.g. already exists) | Meta's own message verbatim, with code and subcode | Meta |
| **Category rejected** | The route refuses anything outside `MARKETING`/`UTILITY`/`AUTHENTICATION` with *"Category must be one of … — got "x"."* The page only offers the three | locally |
| **Variable/example mismatch** | *"The body declares 2 variables but 1 example was given. Meta requires one sample value per variable, in order."* | locally |
| **Meta unreachable** | *"Could not reach Meta: …"* | locally |
| **Not an admin** | The API returns 401 and the page shows *"Unauthorised"* | `verifyAdmin` |
| **A 200 Meta body we cannot parse** | Treated as an error and the raw body is shown — never as an empty list | locally |

## 4.3 🔴 WHAT HAS AND HAS NOT BEEN EXERCISED AGAINST META

**This is more nuanced than "nothing has been tested", and the difference matters, so it is drawn
exactly.**

**⚠️ ONE REAL REQUEST REACHED META.** The verification harness (§4.4) called `createMessageTemplate`
with a deliberately fake token and a fake WABA id. It made a genuine outbound POST to
`https://graph.facebook.com/v19.0/111122223333444/message_templates` and Meta answered:

```
[meta-templates] CREATE response http=401 body={"error":{"message":"Malformed access token EAAG_fake_token_for_the_harness","type":"OAuthException","code":190,"fbtrace_id":"ARzr6l1_FxTIUsmkd8fgCGd"}}
[meta-templates] CREATE FAILED name=order_ready http=401 — Meta refused this (HTTP 401) · code 190 · OAuthException: Malformed access token EAAG_fake_token_for_the_harness
```

**Nothing was created. No valid credential was used. The request was rejected at authentication.**

**✅ PROVEN by that exchange:** the URL is well-formed and reachable; the `v19.0` path segment resolves
rather than 404ing; `metaFailure()` parses a **genuine** Meta error envelope correctly; `describeFailure()`
renders a genuine Meta error into the sentence the page shows.

🔴 **NOT PROVEN, AND THIS IS THE PART THAT MATTERS:**

- **That Meta will accept the template payload shape.** `components: [{type:'BODY', text, example:{body_text:[[…]]}}]`
  is written from Meta's documented Cloud API and **has never been accepted by Meta**. The request never
  got past authentication, so the body was almost certainly never validated.
- **That `v19.0` supports template creation.** A 401 is returned before request validation; the version
  path resolving is not the same as the version supporting this endpoint. **Your changelog check stands.**
- **That the LIST response shape is right.** `data[].{id,name,status,category,language}` is documented,
  unverified.
- **That the field names are current.** `error_subcode`, `status`, `category` on the create response —
  all documented, all unproven.

🔴 **SO: THE FIRST REAL RUN MAY STILL FAIL ON A VERSION OR FIELD-SHAPE DIFFERENCE THIS READ CANNOT
ANTICIPATE.** That is why §4.1 puts a full preflight *and* a live Load-templates call **before** the
recording starts — the first authenticated call must not be the one on camera.

## 4.4 The harness — execution, not type-checking

**`tsc` was not run. It would not be verification if it had been:** a module with no callers
type-checking clean proves it parses, not that it behaves.

**What was run instead — two executions against the real files:**

**(a) URL equivalence.** Both template literals extracted from the pre-change copy and the current file,
evaluated over eight `phoneNumberId` shapes (normal, empty, short, 40 digits, containing a space,
non-ASCII, a traversal string), byte-compared:

```
OLD template literal: https://graph.facebook.com/v19.0/${phoneNumberId}/messages
NEW template literal: ${GRAPH_BASE_URL}/${phoneNumberId}/messages
GRAPH_BASE_URL    = "https://graph.facebook.com/v19.0"
cases=8 byte-identical=8 mismatches=0
```

plus a line-by-line diff of the function: **26 lines before, 26 after, exactly one differing line.**

**(b) The real module, through `jiti`**, exercising every branch that does not need a valid credential:

```
=== pass=26 fail=0 ===
```

Covering: both constants; the preflight with both variables absent, whitespace-only, and present;
**eight** local-validation refusals (capitals, spaces, hyphen, empty language, empty body, 1-var/0-examples,
2-vars/1-example, 0-vars/1-example) each asserted to name the right field; duplicate `{{1}}` needing only
one example; `missing_env` refusing **before** the network on both list and create; and `describeFailure`
rendering all five failure shapes.

⚠️ **The harness lives in the scratchpad, not in the repository.** Nothing was added to the project to
support it.

## 4.5 The executable diff and line counts

```
 lib/meta-whatsapp.ts | 401 ++++++++++++++++++++++++++++++++++++++++++++++++++-
 1 file changed, 400 insertions(+), 1 deletion(-)
```

| File | Lines | Status | Change |
|---|---|---|---|
| `lib/meta-whatsapp.ts` | 425 | **modified** | +400 / -1. The single deletion is the URL literal; everything else is added below the existing function |
| `app/api/admin/whatsapp-templates/route.ts` | 138 | **new** | — |
| `app/admin/whatsapp-templates/page.tsx` | 287 | **new** | — |
| **Total** | **850** | | |

`git status --porcelain`:

```
 M lib/meta-whatsapp.ts
?? app/admin/whatsapp-templates/
?? app/api/admin/whatsapp-templates/
?? docs/whatsapp-current-state-read.md
?? docs/whatsapp-per-truck-architecture.md
?? lib/whatsapp/
```

The last three pre-existed this task — they are the two earlier reports and the connection-state helper
from the architecture pass. **Nothing else in the tree changed.**

---

# 5. INTEGRITY CENSUS

Each file was censused in a **separate pass after** its write, with a byte-level tool
(`scratchpad/bytecheck.py`) and a carrier-aware variation-selector scanner (`scratchpad/vscheck.py`) —
**never grep**.

## 5.1 `lib/meta-whatsapp.ts`

```
bytes=20065   NUL(0x00)=0   other disallowed control bytes=0   TOTAL FLAGGED=0
TAB(0x09)=0   LF(0x0A)=425  CR(0x0D)=0
non-ASCII chars=354 distinct=9
    200  U+2550 BOX DRAWINGS DOUBLE HORIZONTAL      11  U+26A0 WARNING SIGN
     89  U+2500 BOX DRAWINGS LIGHT HORIZONTAL       11  U+FE0F VARIATION SELECTOR-16
     28  U+2014 EM DASH                              9  U+1F534 LARGE RED CIRCLE
      4  U+2026 HORIZONTAL ELLIPSIS                  1  U+00A7 SECTION SIGN
      1  U+00B7 MIDDLE DOT
```

```
    U+2500 BOX DRAWINGS LIGHT HORIZONTAL  bare=89   +VS16=0   +VS15=0
    U+2550 BOX DRAWINGS DOUBLE HORIZONTAL bare=200  +VS16=0   +VS15=0
    U+26A0 WARNING SIGN                   bare=0    +VS16=11  +VS15=0
    U+1F534 LARGE RED CIRCLE              bare=9    +VS16=0   +VS15=0
    U+FE0F total=11  attached to a base above=11  unaccounted=0  leading-orphan=0
```

⚠️ **U+2550 IS NEW TO THIS FILE and is introduced deliberately** — the double rule marks the one
section boundary between the send path and the template block, which is the boundary a future reader
most needs to see. U+00B7 (middle dot) appears once, in `describeFailure`'s separator.

## 5.2 `app/api/admin/whatsapp-templates/route.ts`

```
bytes=6178   NUL(0x00)=0   other disallowed control bytes=0   TOTAL FLAGGED=0
TAB(0x09)=0  LF(0x0A)=138  CR(0x0D)=0
non-ASCII chars=96 distinct=7
     83  U+2500      6  U+2014      3  U+1F534      1  U+2026
      1  U+26A0      1  U+2705      1  U+FE0F
```

```
    U+2500 bare=83  +VS16=0   |  U+26A0 bare=0 +VS16=1  |  U+2705 bare=1 +VS16=0  |  U+1F534 bare=3 +VS16=0
    U+FE0F total=1  attached=1  unaccounted=0  leading-orphan=0
```

## 5.3 `app/admin/whatsapp-templates/page.tsx`

```
bytes=13399  NUL(0x00)=0   other disallowed control bytes=0   TOTAL FLAGGED=0
TAB(0x09)=0  LF(0x0A)=287  CR(0x0D)=0
non-ASCII chars=98 distinct=7
     80  U+2500      9  U+2014      3  U+2026      2  U+26A0
      2  U+FE0F      1  U+1F534     1  U+2705
```

```
    U+2500 bare=80  +VS16=0   |  U+26A0 bare=0 +VS16=2  |  U+2705 bare=1 +VS16=0  |  U+1F534 bare=1 +VS16=0
    U+FE0F total=2  attached=2  unaccounted=0  leading-orphan=0
```

## 5.4 Across all three files

**0 NUL bytes. 0 other disallowed control bytes. 0 tabs. 0 CR — LF throughout.**

**NO BASE IS SPLIT ACROSS BOTH CARRIERS IN ANY FILE.** U+26A0 — the only base whose default
presentation is text — is paired with U+FE0F on **every** occurrence (11 + 1 + 2 = 14) and bare on
**none**. U+2500, U+2550, U+2705 and U+1F534 are default-emoji-or-text-neutral and are bare on every
occurrence with **no** selector attached to any of them. Every U+FE0F in every file is accounted for by
an immediately preceding U+26A0; none is orphaned and none leads a file.

Every non-ASCII codepoint used is already this codebase's established comment vocabulary — the box rules
used by every neighbouring module, the three marker glyphs, the em dash, the ellipsis, the section sign
and the middle dot. **No smart quotes, no non-breaking spaces, no en dashes, no look-alike
substitutions.**

## 5.5 This report

Censused after the write; the figures are appended below.

### Byte scan

```
--- docs/whatsapp-template-tool-report.md
    NUL(0x00)=0  other control bytes<0x09/0x0B/0x0C/0x0E-0x1F/0x7F=0  TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0  CR(0x0D)=0
```

**0 NUL. 0 other disallowed control bytes. 0 tabs. 0 CR.**

### Non-ASCII census, and one correction the census caught

The first pass over this report found **eleven** distinct codepoints, one of which should not have been
here:

- 🔴 **U+2212 MINUS SIGN, once**, in the line-count table's `+400 / −1`. Every other diff figure in this
  report writes `-1` with an ASCII hyphen, so this was a **look-alike substitution** — precisely the
  class this census exists to catch. **It was replaced with an ASCII hyphen** and the file re-scanned.
  The replacement was asserted: exactly one occurrence found before, zero after.
- ⚠️ **U+2013 EN DASH, once**, in "clamped to 1–100". **Kept deliberately** — that is a numeric range,
  which is what an en dash is for, and it is not standing in for a hyphen in prose.

The remaining vocabulary is this codebase's usual set: the three marker glyphs, the em dash, the
ellipsis, the section sign, the middle dot (in quoted `describeFailure` output), and the rightwards
arrow. No smart quotes, no non-breaking spaces, no other look-alikes.

### Carrier-aware variation-selector check, per base

```
    U+26A0 WARNING SIGN         bare=0    +VS16=11   +VS15=0
    U+2705 WHITE HEAVY CHECK    bare=5    +VS16=0    +VS15=0
    U+1F534 LARGE RED CIRCLE    bare=21   +VS16=0    +VS15=0
    U+FE0F total=11  attached to a base above=11  unaccounted=0  leading-orphan=0
```

**NO BASE IS SPLIT ACROSS BOTH CARRIERS.** U+26A0 is paired on all 11 occurrences and bare on none;
U+2705 and U+1F534 are bare on all of theirs with no selector attached; every U+FE0F is accounted for.

### Fixed-point note

The figures above are from the pass taken after the report body was written and after the U+2212
correction; appending this census block moved the totals again. A final pass over the completed file was
run. **NUL bytes = 0, other disallowed control bytes = 0, tabs = 0, CR = 0**, and the per-base carrier
result is unchanged: U+26A0 paired on every occurrence and bare on none, U+2705 and U+1F534 bare on
every occurrence, no orphaned selector anywhere.

**ONE HONEST CORRECTION TO THE PARAGRAPH ABOVE, CAUGHT BY THE FINAL PASS.** Writing this census block
put the two flagged characters BACK into the file, because it quotes them as evidence. The final scan
therefore reports **one U+2212 and two U+2013**, and an earlier draft of this note claimed U+2212 was
absent, which was wrong the moment the note was written. The true final state:

- **U+2212, one occurrence** - inside the quoted string in the bullet above, cited as the artefact that
  was corrected. It is a **citation, not a use**: the line-count table it came from now carries an
  ASCII hyphen.
- **U+2013, two occurrences** - one in "clamped to 1-100" (a real numeric range, kept), one quoting
  that same string in the bullet above.

A census that reports a file it cannot describe without changing is a fixed point that does not exist;
saying which occurrences are quotations is the accurate way to close it.
