# Template CREATE proof — PHASE 1 COMPLETE, PHASE 2 BLOCKED

**Date:** 25 August 2026
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **PHASE 2 WAS NOT RUN. NO TEMPLATE WAS CREATED. NOTHING WAS SENT TO META.** The blocker is a missing
environment variable on this machine, not a contradiction — §3. **Nothing was modified, committed, pushed
or deployed.**

---

# §1 — PHASE 1: THE READS

## 1.1 WHAT THE TOOL IS

**Three parts, not one:**

| | |
|---|---|
| **The page** | `app/admin/whatsapp-templates/page.tsx` — a client component. Its own header: *"🔴 ADMIN ONLY. A PLAIN SURFACE FOR ONE JOB: being filmed creating a WhatsApp message template."* |
| **The API route** | `app/api/admin/whatsapp-templates/route.ts` — `GET` (list) and `POST` (create). |
| **The module** | `lib/meta-whatsapp.ts` — holds the Graph constants and both template calls. |

✅ **The page holds NO authority.** Its own comment says so: *"the REAL gate on the server in
app/api/admin/whatsapp-templates/route.ts via `verifyAdmin`. A non-admin loading this URL sees the error
this page renders, because the API refuses them — the page itself is a shell."*

**The gate, on both handlers:**
```ts
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
```
`verifyAdmin` (`lib/auth/admin.ts`) resolves a cookie session first, falls back to an
`Authorization: Bearer` JWT when a request is passed, then requires `operators.is_admin === true`.

## 1.2 THE CREATE CALL, VERBATIM

**Endpoint:** `` `${GRAPH_BASE_URL}/${cfg.wabaId}/message_templates` `` → **`POST https://graph.facebook.com/v19.0/<WABA_ID>/message_templates`**

**Graph version:** `export const GRAPH_API_VERSION = 'v19.0'`. ⚠️ The module flags it: *"v19.0 IS NOT
VERIFIED AS CURRENT, AND NOTHING HERE CAN VERIFY IT … It was deliberately NOT bumped to a guessed
number."* **Not bumped, per your instruction.**

**The payload construction, and the `example` handling you asked about:**
```ts
  // ⚠️ `example.body_text` IS A LIST OF LISTS. Meta's shape is one inner array per example set; one set
  // is enough. Omitted entirely when the body has no variables — sending an empty example object for a
  // variable-free template is a documented rejection.
  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: bodyText }
  if (variableCount > 0) bodyComponent.example = { body_text: [examples] }

  const payload = { name, language, category: input.category, components: [bodyComponent] }
```
🔴 **So for a variable-free template the `example` key is ABSENT ENTIRELY — not `{}`, not `null`.** That
is the specific claim this run was meant to test, and it remains **this module's own reading of Meta's
documentation, untested.**

**The request:**
```ts
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
```
✅ **The whole request body is logged before sending**, deliberately: *"It contains no credential — a
template body is copy — and after a failed review attempt the only useful question is 'what exactly did
we send'."* The raw response is logged too: `` `CREATE response http=${res.status} body=${bodyTextOut}` ``.

## 1.3 AUTHENTICATION AND ENVIRONMENT

```ts
const ENV_WABA  = 'META_WHATSAPP_BUSINESS_ACCOUNT_ID'
const ENV_TOKEN = 'META_WHATSAPP_ACCESS_TOKEN'
```
**Bearer token in the `Authorization` header, from `META_WHATSAPP_ACCESS_TOKEN`** — the same platform
credential the send path uses. **The WABA id goes in the URL path.** `requireConfig()` refuses locally if
either is missing, returning `kind: 'missing_env'` **without contacting Meta.**

## 1.4 REACHABILITY IN PRODUCTION

✅ **Reachable in production, as deployed.** The route's last commit (`2c7ecc2`, 20 August) is an
**ancestor of `origin/main`**, so it is in the deployed line.

**The gate you would pass through:** sign in as an operator whose `operators.is_admin` is true, then open
**`/admin/whatsapp-templates`**. The page fetches the API, which runs `verifyAdmin(req)`; anyone else gets
`401 {"error":"Unauthorised"}`.

⚠️ **I cannot verify from this repository whether the two Meta variables are set in the Vercel
environment.** They are set in production or they are not; the page's own preflight is what would show it.

## 1.5 RATE LIMITING

✅ **None.** `proxy.ts`'s allowlist predicates evaluated against `/api/admin/whatsapp-templates`:
`isCustomerEvents=false`, `isStrictPublic=false`, `isGeneralPublic=false` → **`inLimitedScope = false`**,
so the path is never considered for limiting. A scan of the route and the module for
`ratelimit|throttle|quota` returns nothing. ⚠️ **Meta's own API limits still apply and are not visible from
here.**

---

# §2 — 🔴 WHICH OF THE THREE I DID

| | |
|---|---|
| **Parse** | Yes — all three files read. |
| **Typecheck** | **No.** I did not run `tsc` for this task; nothing was changed, so there was nothing to typecheck. |
| **Execution** | **PARTIAL, AND NOT THE ONE THAT COUNTS.** I executed `metaTemplateConfigStatus()` from the real module — a pure config read that makes **no network call**. 🔴 **`createMetaTemplate` was NOT executed. No request reached Meta.** |

---

# §3 — 🔴 WHY PHASE 2 DID NOT RUN

**`META_WHATSAPP_BUSINESS_ACCOUNT_ID` is absent from `.env.local` on this machine.** Executed from the
real module, unmodified:

```
  metaTemplateConfigStatus():
    wabaIdPresent      : false
    accessTokenPresent : true
    graphApiVersion    : v19.0
    graphBaseUrl       : https://graph.facebook.com/v19.0
    missing            : ["META_WHATSAPP_BUSINESS_ACCOUNT_ID"]
```

**Only three `META_*` keys exist locally:** `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`,
`META_WHATSAPP_ACCESS_TOKEN`. **The WABA id is not among them, and it is the URL path segment** —
without it there is no endpoint to post to.

🔴 **RUNNING ANYWAY WOULD HAVE PRODUCED THE WRONG ARTEFACT.** `requireConfig()` returns
`kind: 'missing_env'` and `createMetaTemplate` returns before the `fetch`. **You would have got a local
refusal dressed up as a result — not the Meta response you asked for.**

## 3.1 THREE THINGS I DELIBERATELY DID NOT DO

1. 🔴 **I did not call the Graph API directly with a hand-built payload.** It would have tested **a
   different payload than the one that ships** — the precise anti-pattern this codebase recorded two days
   ago, when a filter had to be *imported* rather than retyped for the same reason. **The point is to prove
   the module's payload, not my transcription of it.**
2. 🔴 **I did not fetch or infer the WABA id from Meta** to fill the gap. That is an unrequested call to a
   live account, and a WABA id I derived is not necessarily the one production sends on.
3. ✅ **I did not modify the module, the route, the page, the webhook, or the Graph version.**

## 3.2 TWO WAYS TO GET THE RESULT — 🔴 YOUR CHOICE, I HAVE NOT PICKED ONE

- **A — Use the deployed admin page.** Sign in as an admin and open `/admin/whatsapp-templates` in
  production. ✅ **This is the better route and it is what the page was built for**: it exercises the exact
  production path, with production's own credentials, and the page renders Meta's raw response on screen.
  **Off camera, as intended.**
- **B — Give me the WABA id.** Add `META_WHATSAPP_BUSINESS_ACCOUNT_ID` to `.env.local` and I will run the
  **unmodified** `createMetaTemplate` once, with `name: hatchgrab_test_template_delete_me`, no variables,
  a short fixed body, `UTILITY`, `en_GB` — and report the raw response verbatim, success or failure, first
  attempt only, no retry.

⚠️ **B sends from this machine using the platform token in `.env.local`.** If that token differs from
production's, the template lands on whatever WABA the id names. **A avoids that question entirely.**

---

# §4 — WHAT REMAINS UNPROVEN

🔴 **Everything the task set out to prove.** Specifically:

1. **The CREATE payload shape has still never been executed.** ⚠️ **The `example.body_text` list-of-lists
   structure and the "omit `example` entirely when there are no variables" decision are both still this
   module's reading of Meta's documentation** — the exact claims that were meant to stop being readings.
2. **`v19.0` is still unverified as a supported version**, and a CREATE is where a dead version would
   surface.
3. **Whether the two Meta variables are set in the Vercel environment** — not visible from the repository,
   and route A would answer it immediately via the page's preflight.

✅ **No template was created. No message was sent. Nothing was modified, committed, pushed or deployed.**
