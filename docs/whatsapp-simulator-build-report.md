# WhatsApp reply simulator — BUILD

**Date:** 20 August 2026
**Status:** built, **NOT deployed, NOT committed, `next dev` NOT run.** Joins the existing undeployed batch.
**Prompt integrity:** no span arrived garbled. **One near-contradiction was found and resolved without needing to stop — see 2.b.**

**Files changed (2) and added (2):**

| File | Task | Nature |
|---|---|---|
| `lib/whatsapp-classifier.ts` | 1 | **the one live-path change**, additive only |
| `lib/whatsapp/upcoming-events.ts` | 2 | **new** — the shared schedule read |
| `app/api/manage/whatsapp-preview/route.ts` | 3 | **new** — the route |
| `app/manage/[token]/page.tsx` | 4 | the UI |

**`tsc` was not run and nothing here is offered as tsc-clean.** All four files were **syntax-parsed** with the TypeScript parser — `parseDiagnostics` empty on each — which catches a broken edit and is **not** a typecheck. Everything else below was executed.

---

# TASK 1 — the timeout parameter

## 1.a What changed

`ClassifierParams` gained one optional field, threaded to the two `callGemini` sites that never had a budget:

```ts
  timeoutMs?: number
```

```ts
  const { …, isFollowUp = false, timeoutMs } = params
```

| Call site | Before | After |
|---|---|---|
| classifier (`temp 0.1`) | `callGemini(classifierPrompt, 0.1)` | `callGemini(classifierPrompt, 0.1, timeoutMs)` |
| tier-3 answerer (`temp 0.2`) | `callGemini(menuAnswerPrompt, 0.2, 8000)` | ✅ **UNCHANGED — still `8000`** |
| SPECIFIC_QUERY reply (`temp 0.4`) | `callGemini(replyPrompt, 0.4)` | `callGemini(replyPrompt, 0.4, timeoutMs)` |

✅ **The tier-3 site's 8000 was deliberately not harmonised**, as instructed.

## 1.b 🔴 PROOF THAT THE OMITTED-PARAMETER PATH IS UNCHANGED — EXECUTED, NOT CLAIMED

A copy of the file was taken **before the first edit**. Both versions were then loaded through `jiti` and run against **the same stubbed `fetch`** (intercepting Gemini and Supabase alike), over six inputs covering every bucket and both branches of the greeting. For each run the harness recorded the returned `{ reply, classification }`, any throw, **and every outbound fetch** — its temperature, prompt size, and whether an `AbortSignal` was attached — then byte-compared the two records.

```
=== A. OMITTED PARAMETER: before-copy vs current file, identical inputs ===

  IDENTICAL  MENU_QUERY  (2 gemini calls)      hasSignal per call: [false, true]
  IDENTICAL  SPECIFIC_QUERY (2 gemini calls)   hasSignal per call: [false, false]
  IDENTICAL  ALLERGEN_QUERY (1 call, fixed)    hasSignal per call: [false]
  IDENTICAL  IGNORE (1 call, null reply)       hasSignal per call: [false]
  IDENTICAL  allergen FLOOR trips MENU bucket  hasSignal per call: [false]
  IDENTICAL  plain menu, isFollowUp=true       hasSignal per call: [false, true]

  => byte-identical on 6/6 cases; mismatches = 0
```

✅ **`hasSignal: [false, true]` on MENU_QUERY is the shape to read.** The classifier call carries **no** signal and the tier-3 call carries one — exactly the pre-change arrangement, preserved. **The call counts also confirm the cost profile is untouched: 2 / 2 / 1 / 1 / 1 / 2.**

**Why it holds, mechanically:** an omitted argument and an explicit `undefined` are the same binding in JS, so `timeoutMs` is `undefined` in both shapes, and `callGemini`'s `const controller = timeoutMs ? new AbortController() : undefined` builds nothing either way.

## 1.c Proof that the parameter reaches the right two sites when supplied

```
=== B. PARAMETER SUPPLIED ===
  MENU_QUERY       call 1: temp=0.1  signal=AbortSignal
                   call 2: temp=0.2  signal=AbortSignal
  SPECIFIC_QUERY   call 1: temp=0.1  signal=AbortSignal
                   call 2: temp=0.4  signal=AbortSignal
```

✅ **temp 0.1 (classifier) and temp 0.4 (SPECIFIC_QUERY) now carry a signal.** temp 0.2 carried one before and after.

## 1.d ✅ BOTH EXISTING CALLERS ARE BYTE-UNCHANGED

```
grep -c "timeoutMs" app/api/webhooks/meta/whatsapp/route.ts  -> 0
grep -c "timeoutMs" app/api/webhooks/whatsapp/route.ts       -> 0
git diff --stat app/api/webhooks/whatsapp/route.ts           -> (empty)
```

Neither webhook opts in, so both take the `undefined` path proven identical in 1.b. **The dormant Twilio route has not been touched by any task today.**

⚠️ **AN ABORT DOES NOT SURFACE AS AN ERROR, AND THAT IS CORRECT.** The classifier's `catch` falls to `MENU_QUERY`; the SPECIFIC_QUERY `catch` returns its deterministic fallback. So a slow Gemini yields a **real deterministic reply**, which is what a customer would get. **What the timeout actually buys is a BOUNDED ROUTE** — without it a hung call has nothing to abort it. Worst case is now roughly 8s + 8s.

---

# TASK 2 — the shared events query

## 2.a What was added

`lib/whatsapp/upcoming-events.ts` — `fetchUpcomingTruckEvents(supabase, truckId)`, plus three exported constants named so a diff shows them: `UPCOMING_EVENT_COLUMNS`, `UPCOMING_EVENT_STATUSES`, `UPCOMING_EVENT_LIMIT`. It takes the Supabase client rather than creating one, so it does not pick its own credentials.

✅ **The UTC `today` expression is reproduced verbatim and NOT fixed**, per scope. The file says so at the top, with the reason: a preview that silently disagreed with the live path about what day it is would be worse than one that reproduces the defect.

## 2.b 🔴 I DID NOT RE-POINT THE EXISTING CALLERS. THE REASONING, INCLUDING A SCOPE TENSION.

⚠️ **The near-contradiction:** Task 2 gives me the call on re-pointing; the out-of-scope list says *"The webhook route's own logic beyond nothing."* **I did not need to stop, because Task 2 explicitly permits leaving them alone, so the narrower reading satisfies both instructions.** Recorded rather than silently chosen.

**Three reasons it is also the right call on its merits:**

1. 🔴 **The Meta webhook is already modified in the working tree** (this morning's secret and lookup fixes) and is queued in an undeployed batch **while an App Store review runs.** Adding a refactor mixes an unreviewed behavioural change with an unreviewed structural one in one file.
2. **The substitution is not purely local there.** The webhook reuses its `events` binding for `events_found` in the `whatsapp_logs` insert, so swapping the query also moves that read.
3. The dormant Twilio route is out of scope either way.

⚠️ **SO THE DUPLICATION STILL EXISTS.** This reduces it from *"two copies and a third being added"* to *"two copies and one shared definition"*. **That is what it is; it is not de-duplication, and the file says so in its own header.**

## 2.c ✅ PROOF OF EQUIVALENCE — the helper builds a BYTE-IDENTICAL PostgREST request

Since I did not re-point the callers, the obligation is to show the new definition **is** the old query. Two checks, both executed.

**First, every clause of the live webhook chain was asserted present verbatim in the real route source** (so the comparison is against the file, not against my memory of it):

```
  present  .from('truck_events')
  present  .select('event_date, start_time, end_time, venue_name, town, postcode, status')
  present  .eq('truck_id', truck.id)
  present  .gte('event_date', today)
  present  .in('status', ['confirmed', 'open', 'unconfirmed'])
  present  .order('event_date', { ascending: true })
  present  .limit(10)
  => all present: true
  today expression in route: present -- const today = new Date().toISOString().split('T')[0]
```

**Second, both chains were run against a stubbed client and the request each builds was compared:**

```
  INLINE (webhook) : GET /rest/v1/truck_events?select=event_date,start_time,end_time,venue_name,town,postcode,status&truck_id=eq.test-truck&event_date=gte.2026-08-20&status=in.(confirmed,open,unconfirmed)&order=event_date.asc&limit=10
  HELPER           : GET /rest/v1/truck_events?select=event_date,start_time,end_time,venue_name,town,postcode,status&truck_id=eq.test-truck&event_date=gte.2026-08-20&status=in.(confirmed,open,unconfirmed)&order=event_date.asc&limit=10

  => BYTE-IDENTICAL REQUEST: YES
```

⚠️ **ONE DELIBERATE DIFFERENCE, and it is in the error path only.** The inline copies discard the Supabase error and pass `?? []`; the helper logs it and returns `[]`. **Same array, but visible in a log line rather than indistinguishable from "no events"** — a truck with a schedule and a failing query otherwise reads to the customer as a truck with no schedule.

---

# TASK 3 — the route

**`app/api/manage/whatsapp-preview/route.ts`**, `POST`, `maxDuration = 60`.

## 3.a Auth and the truck-scoping rule

Resolves the truck from `dashboard_token` in the body, matching `/api/manage`'s own convention (the manage page's `api()` helper already posts a `token` in the body). 401 on a missing or unknown token.

🔴 **NO `truckId` IS ACCEPTED FROM THE REQUEST.** Verified mechanically, comments stripped first so the check reads code and not prose:

```
  whatsapp_logs (any)      in CODE: 0   -- none
  any DB write             in CODE: 0   -- none
  meta send                in CODE: 0   -- none
  body.* reads, in full:   body.token, body.token, body.message, body.message
```

✅ **The only two things read from the request are the token and the message.** The single `truckId` occurrence in code is the *parameter name* in the call to `generateWhatsAppReply`, fed from `truck.id`. **`.insert` / `.update` / `.upsert` / `.delete` appear zero times** — decision 4 holds structurally, not by intention.

## 3.b The input cap — **1000 characters**

**What I chose and why:** WhatsApp's own text body limit is **4096**, so 1000 sits comfortably inside what a real customer could send and far past any real menu or schedule question (the example chips are ~20 characters). The live path has **no cap at all** — `customerMessage` is interpolated raw into up to three Gemini prompts — and its only bound is Meta's, which a browser-facing route does not inherit.

⚠️ **THE HONEST COST: the preview cannot reproduce a message between 1000 and 4096 characters.** That is a deliberate trade of fidelity for a bounded bill, and it is the one place the preview is knowingly not the live path.

## 3.c The rate limit — **30 per hour, keyed on the truck**

Implemented **in the route** with its own `vf_rl_wa_preview` prefix. ✅ **`proxy.ts` was not touched** and the route was **not** added to its allowlist — that allowlist is for public bulk-scrapeable paths and must not grow an operator surface.

✅ **KEYED ON THE TRUCK ID, NOT THE IP, AND THAT IS A BETTER KEY THAN THE PUBLIC ROUTES CAN USE.** `proxy.ts`'s own comment laments having no customer identity to key on; this route is authenticated, so it has one. One operator cannot exhaust another's budget, and two operators behind one office address do not collapse into a single bucket. **The truck ID is used, never the token** — the token is a bearer credential and must not reach a Redis key or a log line.

**Sizing, against the worst legitimate session rather than the best:** three chips plus five or six typed questions is ~9; an operator who returns and repeats is ~18. **30 leaves headroom over that and caps the spend at 60 Gemini calls per hour per truck.** Refusal is a 429 with `Retry-After: 3600`.

**Failure direction: FAIL OPEN on a Redis error**, matching `app/api/demo/route.ts` and for the same reason — an operator blocked by our own infrastructure is worse than a brief loss of throttling, and the length cap and auth gate both still apply. **Skipped entirely outside production**, also mirroring the demo route, so local work does not burn the hourly budget.

## 3.d Logging

Every line this route emits is tagged **`[whatsapp-preview]`** and carries `truck=<id>`.

⚠️ **WHAT THE TAG CANNOT COVER, STATED PLAINLY:** the shared function's own lines (`[whatsapp menu query]`, `[WhatsApp classifier] Gemini error:`) are emitted from inside `lib/whatsapp-classifier.ts` and **will still interleave with real customer traffic.** Retagging them would mean changing the live path, which is out of scope. **So the tag tells you which requests were previews; it does not fully separate the two streams.**

## 3.e The timeout it passes

`GEMINI_TIMEOUT_MS = 8000`, chosen to **match** the tier-3 answerer's existing 8000 rather than invent a second number. **The live webhook still omits the parameter and is unchanged.**

---

# TASK 4 — the UI

## 4.a Placement — outside the native hide, confirmed

A self-contained `WhatsAppReplyPreview` component, rendered at **sibling position 2** from the seam report — after the `!isNativeApp()` wrapper closes **and** after the Contact card closes:

```tsx
        </div>
        </>)}
      </Card>

      {/* Try your WhatsApp auto-reply — OUTSIDE the `!isNativeApp()` wrapper above ON PURPOSE, so iPad
          operators see it too. Its own card, between Contact details and Your schedule. */}
      <WhatsAppReplyPreview token={token} />

      {/* Your schedule */}
```

✅ **Outside the wrapper, so iPad operators see it. Not plan-gated — there is no `can(...)` call in the component. No new tab.** All three decisions implemented as given.

## 4.b What it contains

A heading, a one-line subtitle, **the two required copy lines**, three tappable example chips, an input with a send control, and the result. No warning boxes.

```tsx
      <p className="text-xs text-slate-400">Replies are built from your live menu and schedule, so those need to be set up first.</p>
      <p className="text-xs text-slate-400">The wording varies slightly each time, exactly as it would for a customer.</p>
```

**Chips, chosen to exercise different buckets:** `Where are you tonight?` (SPECIFIC_QUERY), `Do you do pepperoni?` and `What's on the menu?` (MENU_QUERY, one reaching the grounded answerer). Tapping fills the input **and** runs it. `Enter` submits. A client `maxLength` mirrors the server cap — ⚠️ **the client attribute is a convenience, not the control; the server cap is the control.**

## 4.c 🔴 THE NULL REPLY IS RENDERED AS A RESULT, NOT AS A FAILURE

```tsx
        result.reply === null ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-sm text-slate-600 font-medium">No reply would be sent.</p>
            <p className="text-xs text-slate-400 mt-0.5">That reads as spam, a booking request or something unrelated, so the auto-reply stays quiet.</p>
          </div>
        ) : ( … )
```

**Not a blank box, not an error.** The three other states are distinct: a spinner with *"Working out the reply..."*, a red one-line message for a genuine failure, and the reply itself in a bubble with a quiet `Read as: <classification>` label beneath.

---

# §5 — THE PREFLIGHT TRAP: HOW YOU WOULD TELL

**The trap:** if `GEMINI_API_KEY` is absent, `GEMINI_URL` is built at module load as `…?key=undefined`, every call returns an error envelope with no candidates, `callGemini` yields `''`, and the function degrades to its deterministic fallbacks — **so the preview looks like it works while never calling the LLM at all.**

✅ **I REPRODUCED IT RATHER THAN DESCRIBING IT.** With the key deleted and Gemini returning Google's real *"API key not valid"* envelope:

```
  "Where are you tonight?"   Read as: MENU_QUERY   reply: "Hey there 👋 We've got Pizza from £9.50 and Drinks from £1.75. Check out the full menu…"
  "Do you do pepperoni?"     Read as: MENU_QUERY   reply: "Hey there 👋 We've got Pizza from £9.50 and Drinks from £1.75. Check out the full menu…"
  "What's on the menu?"      Read as: MENU_QUERY   reply: "Hey there 👋 We've got Pizza from £9.50 and Drinks from £1.75. Check out the full menu…"
  "asdfghjkl"                Read as: MENU_QUERY   reply: "Hey there 👋 We've got Pizza from £9.50 and Drinks from £1.75. Check out the full menu…"
```

🔴 **THE SIGNATURE IS UNMISTAKABLE, AND AN OPERATOR CAN SEE IT WITHOUT SERVER ACCESS:**

1. **Every question returns the same sentence** — the category summary — including gibberish.
2. **`Read as:` always says `menu query`.** A schedule question never becomes SPECIFIC_QUERY, and gibberish never becomes IGNORE. The classifier fails open to MENU_QUERY, so **the bucket label is the tell.**
3. **The reply never mentions an event, a specific dish or the customer's actual question.**

✅ **The `Read as:` line was added for exactly this** — it is the cheapest possible in-product preflight. **For you, server-side, the same failure shows as `[WhatsApp classifier] Gemini error:` or a silent empty return in the function logs.** The definitive check is one preview of *"Where are you tonight?"*: if it does not come back labelled **specific query**, the LLM is not being reached.

---

# §6 — VERIFICATION SUMMARY

| Check | Method | Result |
|---|---|---|
| Task 1 omitted-parameter path unchanged | before-copy vs current, stubbed fetch, 6 inputs, byte-compare | ✅ **6/6 identical, 0 mismatches** |
| Task 1 parameter reaches both untimed sites | recorded `AbortSignal` per fetch | ✅ **temp 0.1 and 0.4 now signalled** |
| Task 1 tier-3 site untouched | recorded call | ✅ **still 8000** |
| Existing callers unopted-in | `grep -c timeoutMs` | ✅ **0 and 0** |
| Task 2 helper equals the live query | clause assertions + PostgREST URL compare | ✅ **byte-identical request** |
| Route writes nothing | comment-stripped grep | ✅ **0 `whatsapp_logs`, 0 writes, 0 Meta sends** |
| Route accepts no `truckId` | comment-stripped grep of body reads | ✅ **only `token` and `message`** |
| Missing-key trap signature | reproduced with the key deleted | ✅ **captured, and it is operator-visible** |
| Syntax | TypeScript parser, `parseDiagnostics` | ✅ **clean on all four files** — a parse check, **not** a typecheck |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL, 0 orphan selectors, ZERO new bare glyphs** |

**Census detail:** `lib/whatsapp-classifier.ts`'s non-ASCII inventory is **identical before and after** — every line I added is pure ASCII. `page.tsx`'s pre-existing bare glyphs (8 × U+26A0, 1 × U+270F, 3 × U+1F5D1) are **unchanged at HEAD and now**, so none of them is mine.

---

# §7 — WHAT REMAINS UNOBSERVED

Stated plainly. **None of this is demonstrated by the build.**

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run, per scope. **The component has never been displayed in a browser**, on any device. Layout, wrapping, the chip row on a narrow screen and the iPad case are all unverified.
2. 🔴 **THE ROUTE HAS NEVER BEEN CALLED.** No server was started. Its auth, its cap, its 429 and its response shape are correct by reading, not by request.
3. 🔴 **NO REAL GEMINI CALL WAS MADE THROUGH ANY OF THIS.** Every LLM behaviour above was exercised against a stub. **The first real preview will be the first real call.**
4. ⚠️ **THE RATE LIMITER HAS NEVER RUN.** It is skipped outside production by design, so local testing will not exercise it at all. Its first execution will be in production.
5. ⚠️ **THE ABORT PATH IS UNOBSERVED.** I proved the `AbortSignal` is constructed and attached; I did **not** observe a genuinely slow Gemini being aborted and degrading to the fallback.
6. ⚠️ **`maxDuration = 60` is unverified against the actual Vercel plan.** The repo records 60s as the Hobby ceiling and 300s as Pro; 60 is safe on either, but the worst-case ~17s has not been measured.
7. ⚠️ **The route reads `process.env.SUPABASE_URL`**, matching `/api/manage`. That variable is therefore already proven present in production by that route working — but I read variable **names** only and did not verify it directly.
8. ⚠️ **No typecheck was run**, only a parse. A type error — for instance in how `SupabaseClient` is accepted by the helper — would not have been caught by anything I did.

## ✅ The one thing that IS settled

**The preview cannot diverge from the live reply by construction**, because there is no second implementation: one exported function, one shared schedule definition proven to build the identical query, and a route that adds only a cap, a limit and a timeout. **The prose will still differ run to run — Gemini runs at 0.1 / 0.2 / 0.4, not 0 — which is why the second copy line is required and not optional. The guards are deterministic; the wording is not.**
