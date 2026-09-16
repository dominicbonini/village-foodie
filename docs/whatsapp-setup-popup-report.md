# WhatsApp Set up — the blocked pop-up and the button that never came back

**16 September 2026.** Two files changed, two added. No database change, no SQL, no migration.
`WHATSAPP_LIVE` untouched. tsc clean; lint rule-for-rule identical to HEAD. Nothing staged or committed.

---

## 0. TREE STATE BEFORE EDITING

```
$ git status --porcelain=v1
(empty)
$ git rev-parse HEAD        4adea806614c651b20d2e45e8e292bbf30d8b42e
$ git rev-parse origin/main 4adea806614c651b20d2e45e8e292bbf30d8b42e
```

The brief expected `docs/reference-manual.md` modified and two untracked reports. **The tree was
*cleaner* than that** — commit `4adea80 whatsapp deployment` contains all three, plus the whole
whatsapp-preview build (10 files, 2,011 insertions). **Nothing unexpected appeared**, which is the stop
condition, so I proceeded: HEAD equals origin/main and I am building on committed work, not on top of
someone's uncommitted changes.

---

## 1. WHAT I READ BEFORE EDITING

### 1a. Everything between the click and `FB.login`

`onWhatsAppSetup` in `app/manage/[token]/page.tsx` (now deleted — quoted as it was):

```ts
  const onWhatsAppSetup = async () => {
    if (setupBusy) return
    setSetupBusy(true)
    setSetupNotice(null)
    try {
      const appId = process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID
      const configId = process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_CONFIG_ID
      if (!appId || !configId) { …return }

      const outcome = await launchEmbeddedSignup({ appId, configId })
      …
```

and `launchEmbeddedSignup` in `lib/whatsapp/embedded-signup.ts`:

```ts
  return loadFacebookSdk(opts.appId).then(FB => new Promise<EmbeddedSignupOutcome>(resolve => {
    …
    FB.login(callback, { config_id: …, extras: { … } })
```

**Everything that runs between the click event and `FB.login`, in order:**

| # | What | Defers? |
|---|---|---|
| 1 | `setSetupBusy(true)` | React state update — call is sync, render is not |
| 2 | `setSetupNotice(null)` | same |
| 3 | two `process.env` reads | no — inlined at build |
| 4 | `loadFacebookSdk(appId)` | 🔴 **on a first press: injects a `<script>` and downloads `https://connect.facebook.net/en_US/sdk.js`, then waits for `fbAsyncInit`** — a full network round trip |
| 5 | `.then(FB => …)` | 🔴 **a microtask boundary, even when the SDK is already cached** |
| 6 | `new Promise(resolve => …)` executor | no — runs synchronously inside the `.then` |
| 7 | `listenForSession(...)` | no |
| 8 | `FB.login(...)` | — |

**So: one network round trip and at least one microtask hop before the window is asked for.**

### 1b. When the SDK loads, and for which trucks

**On click only.** `loadFacebookSdk` had exactly **one** caller — `launchEmbeddedSignup:254` — and
`launchEmbeddedSignup` had exactly **one** call site — `page.tsx:9290`, inside `onWhatsAppSetup`.
*(Search across the repo excluding `node_modules`, `.next`, `.git`, `docs` and the native build asset
dirs; `launchEmbeddedSignup` itself was the positive control and returned four hits.)*

**Gusto does not load it today.** It never renders the button (`whatsAppSetupVisible` is false for it),
so there is no click, so there is no load. 🟢 That property had to survive the fix — §3g.

### 1c. Every event that moves the button out of "Opening…"

**Exactly one**, and it is not an event — it is a promise settling.
`setSetupBusy` appears three times in the file: the `useState`, `setSetupBusy(true)` at the top of the
handler, and **`setSetupBusy(false)` at `:9329`, in the `finally`.** That `finally` runs only when the
awaited `launchEmbeddedSignup` promise settles.

That promise has **three** `resolve()` calls and **all three are inside the `FB.login` callback**. There
is no timeout, no rejection path, no `message`-listener resolve. `listenForSession` only *records* a
cancel into a closure variable; it never resolves anything.

🔴 **If `FB.login`'s callback never fires, nothing settles, the `finally` never runs, and the button says
"Opening…" for ever.** There is no other exit.

### 1d. Diagnosis

**Observation 1 (Safari blocked the window): the hypothesis is CORRECT, and the code makes it worse than
stated.** A browser permits `window.open` — which `FB.login` uses — only while the click's *transient
user activation* is live. Awaiting ends the synchronous portion of the handler. On a **first** press
there was not merely a microtask gap but **an entire script download** (1a, step 4) between the click and
the window. Safari is the strictest browser about this, so it blocked. 🟡 One honest limit: the code
proves the gap exists; it cannot prove which browser heuristic fired. The gap is necessary and sufficient
to explain the block, and removing it is the only fix available to us.

**Observation 2 (stuck on "Opening…"): confirmed, and the code proves it outright.** The founder allowed
the pop-up through **Safari's own blocked-pop-up control**, so the window was opened by the browser, not
by the SDK's `window.open` call — the SDK therefore never held a handle to poll, never detected the
close, and never invoked its callback. By 1c, no callback means nothing settles, and nothing settles
means the button never comes back. **This part needs no assumption about Safari at all: even if the SDK
had simply failed to notice, the outcome is the same, because the code has exactly one exit and it is
that callback.**

**Where the code contradicts nothing:** the hypothesis as put — *"popup opened after an async gap, so the
SDK lost the window handle and never learned it closed"* — is consistent with everything I read. The one
refinement is that the SDK never *had* the handle rather than losing it, because the window it would have
opened was blocked and a different one was opened by Safari.

---

## 2. THE FIX

### 2a. SDK loaded when the button renders, and only then

`WhatsAppSetupControl` is a **separate component** rendered only inside
`{whatsAppSetupVisible && can('whatsapp_replies') ? … : …}`. Its `useEffect` calls `loadFacebookSdk`, and
an effect runs when the component **mounts**. A hook cannot live inside that conditional; a component
rendered *by* it can — that is the mechanism, not tidiness.

While loading, the button is **disabled** and reads **"Preparing…"**. If the SDK fails, it reads
**"Unavailable"** and the reason is shown (ad blockers routinely block `connect.facebook.net`).

### 2b. `FB.login` called synchronously in the click

New export `startEmbeddedSignup(FB, { configId }, { complete, cancelled })` in
`lib/whatsapp/embedded-signup.ts` — **callbacks, not a promise**, deliberately: returning a promise would
tempt the next reader to `await` it at the call site and reintroduce the exact gap this removes.

The click handler, in full between event and window: one ref read, one counter increment, one `dispatch`,
one `onNotice(null)`, then `startEmbeddedSignup`. **No await, no promise, no timer, no state-dependent
async work.**

⚠️ `launchEmbeddedSignup` is **kept but no longer used by the page**, with a header saying *"DO NOT CALL
IT FROM A CLICK HANDLER."* Both launchers now share one `LOGIN_OPTIONS(configId)` so the v4 `extras`
cannot drift between them.

### 2c. The standing instruction, always visible

Rendered directly under the button whenever the button is shown:

> A Facebook window will open to connect your WhatsApp Business account. If nothing appears, allow
> pop-ups for hatchgrab.com in your browser, then press Set up again.

🔴 It is **not** an error message and does not wait for one. Said before the press it is an instruction;
said after, it is an excuse.

### 2d. The waiting state and "Start again"

The button reads **"Waiting for Facebook window…"** and a **Start again** link sits beside it.
Start again returns to idle **immediately**, makes **no** server request, and sets **no notice at all** —
the operator is reporting a missing window, not a failure. 🔴 It needs no event from Meta, which is
precisely the state it rescues.

### 2e. The 20-second hint — added, never substituted

After 20 seconds with no event, this line is **added** below the standing instruction:

> Can’t see the Facebook window? It may have been blocked. Allow pop-ups for hatchgrab.com, then press
> Start again.

🔴 **There is no automatic timeout and the attempt is never abandoned.** A genuine signup runs for
minutes — business verification, number entry, an SMS code — so a timeout that gave up would break the
normal case in order to tidy the broken one. Asserted by the harness, twice.

⚠️ **One character differs from the brief:** the apostrophe in "Can’t" is typographic (`’`), not straight
(`'`). `react/no-unescaped-entities` flags a straight apostrophe in JSX text, and the file already uses
`’` elsewhere ("Meta’s"). Say the word and I will escape it instead.

### 2f. Closed without completion

The SDK's `cancelled` callback dispatches `window_closed`, and the reducer shows the **existing**
message — `CLOSED_NOTICE`, byte-identical to before — and returns to idle.

### 2g. A success is never discarded

🔴 `succeeded` is the **only** event with no staleness test. A code that arrives after "Start again" is
still processed, because the code is single-use and the account link has **already been made at Meta**;
dropping it would strand the operator with a connection they can neither see nor redo. Only
closed / cancel / error from a superseded attempt are ignored. **The current structure guarantees this**
— the attempt id is captured in the click's closure and handed to Meta's callbacks, so a late success
knows which attempt it belonged to and the reducer accepts it regardless.

### 2h / 2i. Kept

No POST on abandonment or error (the outcome is judged in the callback, and only `complete` calls
`submit`). All existing messages unchanged. The `!isNativeApp()` wrapper untouched. The server gate in
`app/api/manage/whatsapp-signup/route.ts` untouched. UK English throughout ("Set up" the verb,
"pop-ups", "Meta reported a problem").

⚠️ **Two stale comments corrected in passing**, both now false and both about this flow: one still said
the 30-second code path went through `launchEmbeddedSignup`; the other said *"ABANDONMENT AND ERRORS ARE
POSTED TOO"*, which stopped being true when the outcome checks moved above the fetch in the previous
build.

---

## 3. PROOFS

### 3a/3d. The reducer and where the harness lives

`lib/whatsapp/setup-machine.ts` — `setupReducer(state, event)`, pure: no React, no SDK, no network.
Harness: **`scripts/whatsapp-setup-machine-harness.cjs`**, run with

```
node scripts/whatsapp-setup-machine-harness.cjs
```

It compiles the TypeScript itself with the repo's own `tsc` into a temp directory, so it needs no build
step and no test framework — this repo has neither, and its convention is standalone `scripts/`.

### 3b/3c. Broken variants first, then the real reducer

🔴 **"Did this cause a request?" is a real question about the reducer**, because the component POSTs if
and only if the reducer reports phase `submitting`. So V2 below *is* "triggers a request".

```
── BROKEN VARIANTS: each MUST report FAILURE ──
  ✓ FAILED as required  V1 Start again leaves the state in waiting
        caught: 🔴 waiting + Start again -> idle …and 5 more
  ✓ FAILED as required  V2 Start again / closed triggers a request
        caught: waiting + closed -> idle …and 7 more
  ✓ FAILED as required  V3 a success from a superseded attempt is dropped
        caught: 🔴 superseded attempt + SUCCESS -> PROCESSED (submitting)
        caught: 🔴 …and it carries the attempt it belonged to
  ✓ FAILED as required  V4 the 20-second tick abandons the attempt
        caught: 🔴 waiting + 20s -> hint shown
        caught: 🔴 waiting + 20s is STILL waiting (no abandonment)

── THE REAL REDUCER ──
✅ all 30 passed
```

Every case the brief listed is covered: preparing → ready · click → waiting · closed → idle with the
message · Start again → idle with no request · 20s → hint and still waiting · superseded + closed →
ignored · superseded + success → processed · waiting + success → submitting. Plus: a second click while
waiting is ignored, a second attempt gets a new id, and **attempt 1 closing cannot end attempt 2**.

### 3e. What each proof would look like if it proved nothing

| Proof | If it proved nothing | How that was ruled out |
|---|---|---|
| **Start again returns to idle** | Asserting only `phase === 'idle'` — true of a reducer that ignores the event when already idle. | Driven **from `waiting`**, and V1 (which ignores it) fails on that exact assertion. |
| **No request on Start again / closed** | The reducer performs no I/O, so "no request" is vacuous unless tied to something observable. | Tied to `phase !== 'submitting'`, the component's one trigger; V2 makes those events produce `submitting` and is caught. |
| **Success never dropped** | Testing only a *live* success — which a staleness-checking reducer also passes. | Tested from the state **after** `start_again`, where the attempt is retired; V3 drops exactly that and is caught. |
| **20s does not abandon** | Asserting only that the hint appears — true even if the phase also changed. | Paired with `phase === 'waiting'` and `attempt === 1`; V4 changes the phase and is caught. |
| **Gusto unaffected** | Reading the code and asserting equivalence. | The predicate is **evaluated** for both trucks and printed (§3g). |
| **SDK not loaded for Gusto** | Grepping for `loadFacebookSdk` and seeing one caller. | Paired with the structural fact that its **only** caller is inside `WhatsAppSetupControl`, whose **only** render site is inside the visibility conditional. |

### 3f. 🔴 What the harness CANNOT prove, and the manual steps

**It cannot prove:**
- that Safari now *permits* the pop-up. Transient-activation behaviour lives in the browser; a Node
  harness has no window, no click and no activation. What is provable in code is that **no await, promise
  or timer remains between the click and `FB.login`** — the necessary condition. Sufficiency is Safari's.
- that Meta's SDK detects the window closing. That is inside `connect.facebook.net/en_US/sdk.js`. **This
  is why "Start again" exists**: it is the exit that needs no cooperation from Meta at all.
- that the SDK script actually loads (ad blockers, tracking protection, corporate proxies).
- anything about the real `/api/manage/whatsapp-signup` round trip.

**Manual steps, Safari on Mac, default pop-up blocking ON, signed in as the test truck:**

| # | Do | Expect |
|---|---|---|
| 1 | Open Manage → Settings. **Do not click anything.** Safari → Develop → Show Web Inspector → Network. | A request to `connect.facebook.net/en_US/sdk.js` fires **on load**. The button briefly reads **"Preparing…"**, disabled, then becomes **"Set up"**. The grey line about a Facebook window is visible **under** the button from the start. |
| 2 | Press **Set up**. | The Facebook window **opens without Safari blocking it**. 🔴 This is the fix for observation 1. If Safari still blocks, stop and tell me — the diagnosis is wrong. |
| 3 | Close the Facebook window immediately, doing nothing in it. | The button returns to **"Set up"** and *"Setup was closed before it finished…"* appears. 🟡 If the SDK does not notice, the button stays on **"Waiting for Facebook window…"** — go to step 4. That is expected-and-handled, not a failure. |
| 4 | With the button on "Waiting…", press **Start again**. | It returns to **"Set up"** instantly. **No notice, nothing red, nothing in the Network tab** — confirm no request to `/api/manage/whatsapp-signup`. 🔴 This is the fix for observation 2. |
| 5 | Press **Set up**, then wait 20 seconds without touching the Facebook window. | The amber *"Can’t see the Facebook window?…"* line **appears below** the grey one. The button is **still** "Waiting for Facebook window…" — it must **not** give up. |
| 6 | Leave it another two minutes. | Still waiting. No timeout. |
| 7 | In Safari → Settings → Websites → Pop-up Windows, set **hatchgrab.com → Block**. Reload, press **Set up**. | The window does not open; after 20s the amber line tells you why and what to do. |
| 8 | Set it back to **Allow**, press **Start again**, then **Set up**, and complete the flow properly. | The button goes **"Waiting…" → "Finishing…"**, then the existing success or warning panel appears. |
| 9 | Repeat step 8 but press **Start again** *during* the Facebook flow, then finish it anyway. | 🔴 The setup **still completes** — the code is not discarded. This is 2g and the harness's V3. |
| 10 | Open Gusto's manage page with the Network tab open. | **No request to `connect.facebook.net`.** The WhatsApp row shows a disabled number field, no button, and none of the new copy. |

### 3g. Gusto — evaluated, not asserted

One predicate decides both the button and the SDK load, so they cannot diverge:

```
  pizzeria-gusto   whatsAppSetupVisible=false → button does NOT render → WhatsAppSetupControl never mounts → SDK never loads
  test-truck       whatsAppSetupVisible=true  → button RENDERS → WhatsAppSetupControl mounts → SDK loads
```

**Before:** `loadFacebookSdk` ← `launchEmbeddedSignup` ← `onWhatsAppSetup` (a click). Gusto never renders
the button, so no click, so no load.
**After:** `loadFacebookSdk` ← `WhatsAppSetupControl`'s mount effect. Its **only** render site is
`page.tsx:10125`, inside `{whatsAppSetupVisible && can('whatsapp_replies') ? (`. Gusto renders the else
branch, whose markup is untouched.

🟢 **Gusto's page contacts `connect.facebook.net` in neither version**, and its WhatsApp row is
byte-identical. Step 10 above confirms it in the browser.

### 3h. TypeScript and lint

- **`npx tsc --noEmit -p .` — clean.**
- **Lint:** the two changed files that exist at HEAD, same eslint and config, HEAD in a detached worktree
  vs the working tree — **287 errors / 75 warnings on both sides, every rule count identical.**
  ⚠️ An intermediate pass showed `no-explicit-any` at **256 → 257**; that one was mine (`catch (e: any)`)
  and was **fixed, not declared** — narrowed to `catch (e: unknown)` with an `instanceof Error` test.
- `lib/whatsapp/setup-machine.ts` lints **0 / 0** on its own.

---

## 4. FINISH

```
$ git status --porcelain=v1
 M app/manage/[token]/page.tsx
 M lib/whatsapp/embedded-signup.ts
?? lib/whatsapp/setup-machine.ts
?? scripts/whatsapp-setup-machine-harness.cjs

$ git diff --stat
 app/manage/[token]/page.tsx     | 249 ++++++++++++++++++++++++++++------------
 lib/whatsapp/embedded-signup.ts | 102 ++++++++++++----
 2 files changed, 259 insertions(+), 92 deletions(-)
```

| File | Reason |
|---|---|
| `lib/whatsapp/setup-machine.ts` **(new)** | the button's state as a pure reducer — the only place a transition is decided |
| `scripts/whatsapp-setup-machine-harness.cjs` **(new)** | the proofs, rerunnable with plain `node`; self-compiling |
| `lib/whatsapp/embedded-signup.ts` | adds `startEmbeddedSignup` (synchronous, callback-based); shared `LOGIN_OPTIONS`; exports `FBGlobal` |
| `app/manage/[token]/page.tsx` | new `WhatsAppSetupControl` (SDK on mount, sync click, copy, Start again, 20s hint); deletes the awaiting handler and `setupBusy`; two stale comments corrected |

**Not changed:** `lib/whatsapp-live.ts`, `lib/whatsapp/setup-preview.ts`, `lib/whatsapp/inbound-route.ts`,
the webhook, `app/api/manage/whatsapp-signup/route.ts`, plan lists, landing, and the **else-branch markup
of the WhatsApp row**.

**No SQL appears in this report.** No database change was made or needed.
