# KDS PAUSE — THE READ IS FIXED, AND THE GUARD IS CARRIED OVER

**Diagnosis accepted from `docs/event-pause-diagnosis-report.md` and NOT re-derived.**

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only file written apart from this report.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any database
write. **No pause was set and no screen was tapped.**
**Untouched, verified by an empty `git diff`:** `app/dashboard/[token]/page.tsx` and everything under
`app/api/` — the latter was READ ONLY, for Fix 3.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

## FIX 1 — THE KDS NOW READS THE LIVE EVENT COLUMN

### 1.1 The dashboard's derivation, QUOTED IN FULL FIRST

```tsx
  const isFuturePause=(s:string|null)=>!!s&&new Date(s).getTime()>Date.now()
  const manualPaused=isFuturePause(pausedUntil)||isFuturePause(vanPausedUntil)
  const offlinePaused=isFuturePause(vanOnlinePausedUntil)
```
```tsx
  const pauseUntilEffective=[vanPausedUntil,pausedUntil,vanOnlinePausedUntil].find(isFuturePause)??null
```
```tsx
  const offlinePausedDisplay=offlinePaused&&!(deviceOnline&&activeEventLive)
  const paused=manualPaused||offlinePausedDisplay
  const pauseReason:'manual'|'offline'|null=manualPaused?'manual':offlinePausedDisplay?'offline':null
```

**It ORs THREE values, and they are three different things:**

| Value | Response key | Column behind it | Status |
|---|---|---|---|
| `vanPausedUntil` | `data.vanPausedUntil` | **`truck_events.paused_until`** | 🔴 **THE LIVE MANUAL PAUSE.** What `set_paused` writes and what the customer ordering gate reads |
| `pausedUntil` | `data.truck?.paused_until` | `trucks.paused_until` | 🔴 **DEAD.** Hardcoded `null` by the API (`route.ts:711`); the legacy truck-level column |
| `vanOnlinePausedUntil` | `data.vanOnlinePausedUntil` | `truck_events.online_paused_until` | ⚠️ **A DIFFERENT PAUSE** — the offline AUTO-pause set by `heartbeat-monitor`, not by the operator |

### 1.2 🔴 THE KDS TAKES ONE OF THE THREE, AND HERE IS WHY EACH OTHER IS EXCLUDED

**I did not copy the expression, and I am not omitting part of it silently.**

**`vanPausedUntil` — TAKEN.** It is the whole fix. It is the column `set_paused` writes from this very
handler, and the column `app/api/orders/submit/route.ts` reads to block customers.

**`data.truck?.paused_until` — DELIBERATELY NOT TAKEN.** Including it would OR in a value the API sets
to a literal `null` on every response. It can contribute nothing but the defect this task exists to
remove, and keeping it would leave the next reader thinking the KDS has two sources when it has one.
⚠️ **On the dashboard it is harmless** precisely because it is one of three and the live one sits
beside it; on the KDS it was the ONLY one, which is the entire bug.

**`vanOnlinePausedUntil` — DELIBERATELY NOT TAKEN, AND THIS IS THE ONE WORTH ARGUING ABOUT.**
Three reasons, stated so the decision can be reversed knowingly:

1. **It is not what this toggle controls.** `isPaused` on the KDS drives a BUTTON whose label is
   `Paused — tap to resume`. An offline auto-pause is not something the operator set, and offering
   "tap to resume" for it would send `set_paused` with a null body — which clears **both** columns
   server-side, including an offline protection the operator never asked to defeat.
2. **The dashboard does not OR it raw either.** It gates it through
   `offlinePausedDisplay = offlinePaused && !(deviceOnline && activeEventLive)`, which needs
   `deviceOnline` and `activeEventLive` — two derivations the KDS does not have in that form.
   Copying the OR without the gate would show a stale offline banner on a device that has already
   reconnected. **That is the "do not copy blindly" failure mode, avoided.**
3. **The KDS already tells the operator about being offline**, with its own banner:
   `No connection — showing last known orders. Online ordering has been paused for customers.`

🔴 **THE STATED CONSEQUENCE:** if the event is offline-auto-paused while this device is online (another
van's device went dark, say), **the KDS's red pause banner will not show it.** That is unchanged
behaviour, not a regression — the KDS never showed it — but it is now a deliberate omission rather
than an accident, and it is the obvious next thing to fix if it matters.

### 1.3 The change, QUOTED

Both read paths had the identical defect. **Both** were changed.

```tsx
      setPausedUntil(applyPending('vanPausedUntil', data.vanPausedUntil ?? null))
```

`fetchAll` (was `setPausedUntil(data.truck?.paused_until ?? null)`), and `submitPin` — the PIN-entry
seed, which is the FIRST board an operator sees — the same line, the same guard.

⚠️ **`extra_wait_mins` ON THE VERY NEXT LINE IS NOT THE SAME CASE AND WAS NOT TOUCHED.** The same
"DELIBERATE OVERRIDES" block that nulls the pause sources extra-wait FROM the event:

```ts
      paused_until:        null,
      extra_wait_mins:     (selectedEvent as any)?.extra_wait_mins ?? 0,
      extra_wait_started_at: (selectedEvent as any)?.extra_wait_started_at ?? null,
```

**So `data.truck.extra_wait_mins` already carries live event data and the KDS's read of it is
correct.** Pause is the only field in that block set to a constant.

### 1.4 `isPaused` can now be true, and the toggle can reach its resume arm

```tsx
  const isPaused = pausedUntil ? new Date(pausedUntil) > new Date() : false
```

Unchanged — it did not need to change. It was false forever only because `pausedUntil` was null
forever. `togglePause`'s arm selection is the same expression over the same state:

```tsx
    const isPaused = pausedUntil && new Date(pausedUntil) > new Date()
```

**Verified by execution — see §5.** With a live value, tap 1 takes the PAUSE arm and tap 2 takes the
RESUME arm.

---

## FIX 2 — THE GUARD, CARRIED TO THE KDS

### 2.1 It is NOT a shared helper. It is inline in the dashboard page.

**EXECUTED — repo-wide search for `applyPending`:** the only definition is
`app/dashboard/[token]/page.tsx:260`, a `useCallback` closing over a local ref. `lib/buzzer.ts`
exports `applyPendingBuzzers`, which is a *different* function (it patches an order ARRAY).

```tsx
  const pendingWritesRef=useRef<Record<string,{v:any;meta?:any}>>({})
  const applyPending=useCallback((key:string,serverVal:any)=>{
    const p=pendingWritesRef.current, g=p[key]
    if(!g) return serverVal
    if(serverVal===g.v){ delete p[key]; return serverVal }
    return g.v
  },[])
  const markPending=useCallback((key:string,value:any)=>{ pendingWritesRef.current[key]={v:value} },[])
```

### 2.2 What extraction would touch, and 🔴 WHICH I CHOSE

**Extraction would touch, on the surface Pizzeria Gusto trades on:**

- `pendingWritesRef` itself — which is **not** a pause ref. It is shared by **three** key conventions:
  scalars (`pausedUntil`, `vanPausedUntil`, `extraWaitMins`, `extraWaitStartedAt`, `kitchenCapacity`,
  `capacityWindowMins`, `effectiveOrderReady`, `effectiveBuzzerPrompt`), buzzers (`buzzer:${orderKey}`,
  read through `peekPendingBuzzer` into `lib/buzzer.ts`), and category availability
  (`catavail:${eventKey}:${cat}`, the only one that stores `meta`).
- **17 call sites** across the dashboard page (lines 260, 267, 271, 826, 887, 888, 892, 897, 910, 911,
  913, 914, 918, 919, 1642, 1653, 1687, 1732, 1802, 1810, 1817, 1826, 2109–2116), including three that
  reach INTO `pendingWritesRef.current` directly rather than through the two callbacks.
- `fetchAll`'s dependency array (line 958), and therefore the identity of the dashboard's main fetch.

🔴 **I CHOSE A LOCAL EQUIVALENT IN THE KDS.** Three reasons:

1. **The brief forbids the change extraction requires.** *"DO NOT CHANGE THE DASHBOARD'S USE OF IT."*
   There is no extraction that leaves the dashboard's use untouched — even a pure delegation rewrites
   the definition the dashboard's six pause/extra-wait guards run through.
2. **The precedent in THIS FILE is the local one, and it is documented.** Fifteen lines above the new
   code, the KDS's buzzer guard says exactly this:
   > *"The dashboard keeps these in its shared pendingWritesRef under `buzzer:${order_key}`; the KDS
   > has no such shared ref, so it owns a dedicated one. The MECHANISM is identical and both feed the
   > same two helpers in lib/buzzer.ts, which is what keeps the two surfaces behaving the same."*
3. **The duplication precedent cited in the brief — six missing status badges, a second post-gate
   copy — is about duplicated BEHAVIOUR (markup and control flow) drifting.** This is four lines of
   pure reconciliation with no product decisions in it. ⚠️ **That is a judgement, not a guarantee**,
   and the risk is real: **if the dashboard's `applyPending` ever changes, this copy must change with
   it.** The new comment says so in those words.

**The honest recommendation, since it is not what I did:** the right end state is
`lib/pendingWrites.ts` with both surfaces importing it. That is a dashboard change and belongs in its
own task, with its own verification of all 17 sites.

### 2.3 The local guard, QUOTED

```tsx
  const pendingWritesRef = useRef<Record<string, unknown>>({})
  /** Return the value to use for `key`, releasing the guard once the server echoes the desired value. */
  const applyPending = useCallback(<T,>(key: string, serverVal: T): T => {
    const p = pendingWritesRef.current
    if (!(key in p)) return serverVal
    if (serverVal === p[key]) { delete p[key]; return serverVal }
    return p[key] as T
  }, [])
  /** Register an optimistic write BEFORE its setState, so a refetch mid-write cannot clobber it. */
  const markPending = useCallback((key: string, value: unknown) => { pendingWritesRef.current[key] = value }, [])
```

🔴 **ONE DELIBERATE DIFFERENCE FROM THE DASHBOARD, AND IT IS A CORRECTNESS ONE.** The dashboard BOXES
its value as `{v:value}` and tests `if(!g)`; the box is what makes a pending `null` still truthy.
This version stores the bare value, so a truthiness test would collapse "no guard" and "pending null"
into the same case — **and a Resume is exactly a pending null.** It therefore tests `key in p`.
**Both forms are correct; only these two forms are.** Verified by execution — §5, check 6.

And in `togglePause`:

```tsx
    markPending('vanPausedUntil', paused_until)
    setPausedUntil(paused_until)
```

⚠️ **The handler's trailing `fetchAllRef.current()` was LEFT IN PLACE.** With the right field and the
guard it is no longer harmful — it now returns the value just written, which *releases* the guard
rather than clobbering it, and it makes the board authoritative within one round trip instead of
sixty seconds. Removing it was not asked for and is no longer necessary.

---

## FIX 3 — THE HARDCODED NULL. REPORTED, NOT ACTED ON.

**NOT CHANGED. `app/api/dashboard/route.ts` was read and nothing under `app/api` was written —
`git diff app/api` is empty.**

```ts
      // ── DELIBERATE OVERRIDES — these are NOT the raw column values, and must stay AFTER the spread ──
      // Pause + extra-wait are EVENT-scoped now — sourced from the selected event, not the truck.
      // (Legacy trucks.* columns left unread; the badge reads these via the response.)
      paused_until:        null,
```

### 🔴 EVERY CONSUMER OF `data.truck?.paused_until`, REPO-WIDE

**EXECUTED — a repo-wide search for `paused_until` across `app/`, `lib/`, `components/` and
everything outside them; these are ALL of them.**

| # | Consumer | Line | State after this task |
|---|---|---|---|
| 1 | KDS `fetchAll` | `kds/page.tsx:399` | 🔴 **NO LONGER A CONSUMER** — reads `data.vanPausedUntil` |
| 2 | KDS `submitPin` | `kds/page.tsx:1015` | 🔴 **NO LONGER A CONSUMER** — reads `data.vanPausedUntil` |
| 3 | Dashboard `fetchAll` | `page.tsx:913` | ⚠️ **STILL A CONSUMER**, deliberately — one of three OR'd sources, guarded, and harmless while null |

# ✅ AFTER THIS TASK THE FIELD HAS EXACTLY ONE CONSUMER IN THE REPO, AND IT IS THE DASHBOARD'S.

**Everything else that mentions `paused_until` writes or reads a DIFFERENT thing:**

| Site | What it actually touches |
|---|---|
| `api/dashboard/action/route.ts:2430-2439` | **writes `truck_events.paused_until`** — the live column |
| `api/orders/submit/route.ts:264-310` | **reads `truck_events.paused_until`** — the customer gate |
| `api/menu/[truckId]/route.ts:264` | **reads `ev.paused_until`** — the event row, for the menu badge |
| `api/dashboard/route.ts:141, 505, 751` | selects the event column and serves it as `vanPausedUntil` |
| ⚠️ **`api/manage/route.ts:861`** | `'paused_until'` is on `update_truck`'s allow-list, so the column is **still WRITABLE** through manage — but **EXECUTED: no client posts that key** (`app/manage/[token]/page.tsx` posts `update_truck` at 2998, 3130, 3200, 8371 and none includes it). **Dead in practice, live in principle.** |

### Should the field be removed from the response?

**My answer: not yet, and not in the same change as anything else — but it should go.**

**What would break if it were removed today:** ✅ **nothing at runtime.** The one remaining consumer is
`data.truck?.paused_until||null` behind optional chaining and an `||`, so an absent field yields the
same `null` it yields now, feeds the same `applyPending('pausedUntil', …)`, and `manualPaused` still
resolves from `vanPausedUntil`. **`truck.paused_until` is also part of whatever type the `truck` state
carries** — that is a type surface to check, not a behaviour.

**Why it should still wait:** the field's removal is only safe *because* the dashboard's OR has a live
sibling. That makes it a dashboard change, on the live-money surface, for zero behavioural gain.
🔴 **And the field being present-and-null is what makes the bug just fixed IMPOSSIBLE to re-introduce
silently on a third surface** — a new reader gets `null` and an empty banner, which is visible;
removing it gets `undefined`, which under `?? null` is identical, so removal buys no safety either.
**The real fix is deleting the column and the allow-list entry, not the response key.** Consumer list
delivered; nothing changed.

---

## FIX 4 — THE DURATION. REPORTED, NOT ACTED ON.

**NOT CHANGED.** The `window.confirm` and the hardcoded two hours are exactly as they were.

**THE KDS — the whole gate and the whole duration:**

```tsx
    const isPaused = pausedUntil && new Date(pausedUntil) > new Date()
    if (!isPaused) {
      const confirmed = window.confirm('Pause orders? Customers will see "Not accepting orders" until you resume.')
      if (!confirmed) return
    }
    const paused_until = isPaused
      ? null
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
```

**THE DASHBOARD — a styled modal, three durations plus indefinite:**

```tsx
            <h3 className="font-black text-slate-900 text-base text-center mb-1">Pause online orders</h3>
            <p className="text-slate-500 text-sm text-center mb-4">Customers can still browse the menu but won't be able to order.</p>
            <div className="space-y-2 mb-4">
              {[{label:'10 minutes',mins:10},{label:'20 minutes',mins:20},{label:'30 minutes',mins:30}].map(({label,mins})=>(
```
```tsx
              <button onClick={()=>{const until=new Date('2099-01-01').toISOString();…}}>Until I turn it back on</button>
```

**The gap, stated plainly:** the dashboard's longest FINITE option is **30 minutes**; the KDS's only
option is **four times the dashboard's maximum**, chosen by nobody, with no way to pick anything else
and no display of what was chosen. An operator pausing for a two-minute till problem pauses for two
hours.

### 🔴 `window.confirm` INSIDE A CAPACITOR WEBVIEW IS A BROWSER DIALOG ON A NATIVE APP

It renders the WKWebView's own system alert: it carries the page's ORIGIN in its title, it cannot be
styled, it is not dismissible by the Android back button through `useAndroidBack` (it is outside
React's tree entirely, so the surface's ordered back-handler stack never sees it), and it blocks the
JS thread — including the 15-second heartbeat — until it is answered. ⚠️ **On a kitchen screen that is
also the thing keeping the van marked online, a modal dialog that blocks the heartbeat is not a
cosmetic problem.** ⚠️ **This is a source-read claim about WebView behaviour, not something observed
on a device in this task.**

### What a shared control would touch

`EventActionsModal` is **already shared** and already carries `paused` / `onPause` / `onResume` —
the KDS mounts it at `kds/page.tsx:2059-2061` and the dashboard at `page.tsx:4975`. **So the natural
home exists and needs no new plumbing.** A shared duration picker would touch:

- **The KDS:** replace `window.confirm` + the 2-hour literal with the picker; `togglePause` would
  split into `pause(mins)` and `resume()`, since one toggle cannot carry a duration.
- **The dashboard:** `showPauseModal` and its inline JSX (`page.tsx:4474-4487`) would move into the
  shared component — 🔴 **a change on Pizzeria Gusto's live path**, and the reason this is a separate
  task.
- **Both surfaces' resume paths**, which must keep clearing `online_paused_until` as they do now.
- **The offline outbox**, which neither pause path currently uses at all (both are bare `fetch`).

**DO NOT FIX IT — and it was not fixed.**

---

## 5. VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION, and it is not offered as any.** `npx tsc --noEmit` exits 0.
`npx eslint` on the KDS reports **21 problems (18 errors, 3 warnings) — byte-identical to the finding
set produced by the HEAD version of the same file**, compared by piping `git show HEAD:…` through
`eslint --stdin` and diffing the sorted finding sets. **This change adds no lint finding.** (Two
dependency arrays gained `applyPending` / `markPending` purely to keep that true; both are
empty-dep `useCallback`s, so their identity is fixed and no hook is re-created.)

### 5.1 What was EXECUTED

**The pause state machine was transcribed line-for-line from the edited file into a standalone
harness and run — 19 assertions, all passing.** `applyPending`, `markPending`, `isPaused`,
`togglePause`'s arm selection, both fetch paths and the API's two response keys are the real code;
what is simulated is React's state, the network and the database.

| # | Assertion | Result |
|---|---|---|
| 1 | **The OLD path reproduces the reported bug** — banner up on tap, gone after the trailing refetch, server still paused | ✅ **PASS** |
| 2 | **`isPaused` is true after a pause AND survives the trailing refetch** | ✅ **PASS** |
| 2b | The guard releases itself once the server echoes | ✅ **PASS** |
| 3 | **The second tap takes the RESUME arm** | ✅ **PASS** |
| 3b | **A resume clears the pause and the banner** — server row null, `isPaused` false | ✅ **PASS** |
| 4 | **No further tap sends a second pause while one is active** — the third tap is a RESUME and the first pause stamp is never overwritten by another pause | ✅ **PASS** |
| 5 | **The race the guard exists for** — a refetch returning STALE state does not drop the banner, and the guard releases only on the echo | ✅ **PASS** |
| 6 | **A resume is a pending NULL, not an absent guard** — banner stays down against a stale refetch | ✅ **PASS** |

### 5.2 EXECUTED versus READ, item by item

| Required claim | Method |
|---|---|
| The KDS's paused value now comes from the live event column | ✅ **EXECUTED** — `grep` shows zero remaining `data.truck?.paused_until` reads in the KDS; both sites read `data.vanPausedUntil`, which `route.ts:751` sources from `truck_events.paused_until` |
| `isPaused` becomes true after a pause and the banner survives the trailing refetch | ✅ **EXECUTED** — harness checks 2 and 2b, **against transcribed logic, not a running board** |
| The toggle can reach its resume arm | ✅ **EXECUTED** — harness check 3 |
| A resume clears the pause and the banner | ✅ **EXECUTED** — harness check 3b. ⚠️ **The SERVER half is READ ONLY** — `set_paused` with a null body writes `{paused_until:null, online_paused_until:null}`; no request was sent |
| The dashboard's pause, resume and banner are unchanged in every branch | ✅ **EXECUTED** — `git diff app/dashboard/[token]/page.tsx` is **empty**. Not one byte moved |
| No further tap sends a second pause while one is active | ✅ **EXECUTED** — harness check 4 |

### 5.3 🔴 WHAT WAS **NOT** VERIFIED, STATED PLAINLY

- **NOTHING WAS RENDERED AND NOTHING WAS TAPPED.** No `next dev`, no `next build`, no `cap sync`, no
  device. Per your instruction, the screen was not touched.
- **NO REQUEST WAS SENT AND NO ROW WAS READ.** Whether the event from the original incident is still
  paused is still Q9 of the diagnosis, still unanswered, and 🔴 **still worth running before anyone
  taps that screen** — although after this fix a tap on a paused event now RESUMES rather than
  re-pausing, so the evidence-destroying behaviour is gone.
- **The harness is a transcription.** It proves the state machine; it does not prove React batches,
  re-renders or effect ordering behave as assumed. The one assumption worth naming: `setPausedUntil`
  in the handler and `setPausedUntil` in the refetch are ordinary state writes with no interleaving
  beyond what is simulated.

---

## 6. WHAT WAS NOT CHANGED

Checked, not assumed — **`git diff --stat` names exactly one non-doc file**:

`app/api/dashboard/action/route.ts` (the pause write) · `truck_events.paused_until` ·
`online_paused_until` · the customer ordering gate · the heartbeat paths · the board filters · the
two per-device switches · `cardStyle` · `hideAmounts` · the type sizes · `renderButtons` · the
post-gate handler · the toast system · the push work · **anything under `app/api`** — all untouched.
**No SQL, no migration, no schema change.** Within the KDS itself, the pause BUTTON, the banner
markup, `EventActionsModal`'s props, the `queued` branch and `handleSetWait` are all unmodified.

---

## 7. INTEGRITY

### 7.1 `app/dashboard/[token]/kds/page.tsx` — byte scan and census

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 144,553   chars 139,846   lines 2,144
AFTER    bytes 149,420   chars 144,624   lines 2,197
NUL 0 · control bytes <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**
Occurrences 2,317 → 2,359. Only five classes moved, all of them comment furniture:

| Codepoint | Before | After | Δ |
|---|---|---|---|
| U+2500 ─ box drawing | 1807 | 1825 | +18 |
| U+2014 — em dash | 212 | 223 | +11 |
| U+1F534 🔴 | 83 | 88 | +5 |
| U+FE0F variation selector | 70 | 74 | +4 |
| U+26A0 ⚠️ | 69 | 73 | +4 |
| **every other class (28 of them)** | — | — | **0** |

⚠️ **One new class was introduced and then removed before the final scan.** A U+2026 (…) had crept
into a new comment; it was replaced with nothing so the census would show no new class. The figures
above are the FINAL state.
✅ **`U+26A0` and `U+FE0F` moved by the SAME +4**, which is what a correctly-paired addition looks
like. **Carrier-aware check on the source: `U+26A0` n=73, 73 paired, 0 bare.** `U+1F534` n=88 bare
(emoji presentation by default), `U+2705` n=2, `U+2713` n=4, `U+23F8` n=1 — all bare, all unchanged.

### 7.2 This report — SEPARATE pass, run AFTER writing

```
docs/kds-pause-fix-report.md   bytes 25,803
NUL 0 · control bytes <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE.** Bare versus paired per base,
never as a raw total:

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 22 | 0 | 22 |
| U+2705 ✅ | 22 | 0 | 22 |
| **U+26A0 ⚠️** | **14** | **14** | ✅ **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct and they render as
emoji everywhere. ⚠️ **No other emoji-presentation base occurs in this report at all** — in particular
`U+23F8`, which the KDS banner carries, is not quoted here, so it has no row rather than a zero one.
**`U+26A0` is the one base
that defaults to TEXT presentation**, and every one of its 14 occurrences is **PAIRED —
14 OF 14, ZERO BARE**. The report's total `U+FE0F` count is 14, which exactly accounts
for the 14 paired warning signs and leaves none attached to any other base.

### 7.3 Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M components/dashboard/OrderCard.tsx
?? docs/event-pause-diagnosis-report.md
?? docs/kds-cook-type-report.md
?? docs/kds-pause-fix-report.md
?? docs/kds-type-equalise-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`M app/dashboard/[token]/kds/page.tsx`** | 🔴 **THIS TASK.** The file was CLEAN at HEAD before this pass — the only source file written |
| 🔴 **`?? docs/kds-pause-fix-report.md`** | 🔴 **THIS TASK** — this file |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the Cook/Full type work |
| `?? docs/event-pause-diagnosis-report.md` | ✅ pre-existing — the accepted diagnosis |
| `?? docs/kds-cook-type-report.md` · `?? docs/kds-type-equalise-report.md` | ✅ pre-existing — the type tasks |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
