# KDS — `Screen on` back on the header. One handler, two mounts.

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only file written apart from this report.**
✅ **The dashboard, every shared component, `lib` (including `lib/native/keepAwake.ts`) and `app/api`
are untouched** — `git diff --stat` across all four is **empty**.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

🔴 **ONE THING YOU ASKED ME TO SAY RATHER THAN SOLVE, SAID FIRST: THIS PUSHES THE HEADER TO A THIRD
ROW AT 640px WITH A TYPICAL TRUCK+VAN NAME.** Details and the exact numbers in §7. **Nothing was
moved to make room.**

---

# STAGE 1 — READ ONLY

## Q1 — The sheet's screen-on row, and its handler

**READ — the row as it stood:**

```tsx
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-700">Keep the screen on</span>
                  <button
                    type="button"
                    onClick={toggleKeepScreenOn}
                    aria-pressed={screenHeld}
```

**READ — the handler, and the acquire path below it:**

```tsx
  const toggleKeepScreenOn = async () => {
    if (keepScreenOn) {   // setting is ON → turning OFF
      …
      await applyKeepScreenOn(false)
    } else {            // grey → turning ON / retry (this tap is the gesture; the banner reflects the outcome)
      await applyKeepScreenOn(true)
    }
  }
```
```tsx
  const applyKeepScreenOn = async (value: boolean): Promise<WakeState> => {
    setKeepScreenOn(value)
    let st: WakeState = 'off'
    if (value) { st = await keepAwake() } else { await allowSleep() }
```

# ✅ CONFIRMED: THE ACQUIRE PATH IS `onClick` → `toggleKeepScreenOn` → `applyKeepScreenOn(true)` → `keepAwake()`, EXACTLY AS §11 DESCRIBES.

⚠️ **AND THE HANDLER BRANCHES ON THE SETTING, NOT ON THE LOCK** — `if (keepScreenOn)`, not
`if (screenHeld)`. Its own comment records why: *"once belief diverged from reality … every tap took
the ENABLE branch and the operator could not turn the screen off at all. `wakeState` may DISPLAY; it
must never DECIDE."* **Unchanged by this task.**

## Q2 — `keepAwake()` and `prepareKeepAwake()`

```ts
export async function keepAwake(): Promise<WakeState> {
  if (Capacitor.isNativePlatform()) {
    nativeIntent = true
    ensureNativeListeners()
    return nativeAcquire()
  }
  // WEB — fire the request with NOTHING awaited before it. requestWebLock runs its sync guards then awaits the
  // request() call itself, so request() is reached synchronously within the caller's click handler.
  keepAwakeEnabled = true
  ensureListeners()
  if (!webLock) await requestWebLock()
  return wakeState
}
```

# ✅ §11's RULE STILL HOLDS IN THE CURRENT SOURCE. `request()` is reached with **nothing awaited before it**: the platform check is synchronous, and the only `await import()` lives on the **native** branch, where no activation is needed.

**READ — and the web path does NOT auto-request on mount:**

```ts
  if (webLock) { setWakeState('held'); return }
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) { setWakeState(unsupportedOrInsecure()); return }
  setWakeState('off')   // supported, not yet held → banner button prompts + acquires on its click
```

✅ **`prepareKeepAwake` sets INTENT only on web** and publishes `'off'` = *supported, awaiting a tap*.
Its own doc comment: *"No global one-shot gesture listener: an unreliable pointerdown-triggered
request is exactly what failed on Safari."* 🔴 **Nothing of that shape was reintroduced.**

## Q3 — The state subscription. ✅ IT IS THE LOCK, NOT THE INTENT.

```ts
export function subscribeWakeState(cb: (s: WakeState) => void): () => void {
  wakeListeners.add(cb)
  cb(wakeState)
  return () => { wakeListeners.delete(cb) }
}
```
```tsx
  const [wakeState, setWakeState] = useState<WakeState>('off')
  useEffect(() => subscribeWakeState(setWakeState), [])
```
```tsx
  const screenHeld = wakeState === 'held' || wakeState === 'native'
```

✅ **`screenHeld` is true only for `'held'` (the web lock is acquired) or `'native'` (the plugin holds
it).** `'denied'`, `'off'`, `'unsupported'`, `'insecure'` and `'unknown'` all read false — **so the
button cannot say "on" while the lock is not held.** The module's header states the rule: *"A toggle
that says 'Screen on' while the lock was denied is a lie that auto-pauses an event mid-service."*

## Q4 — Visibility and focus on web. ✅ THERE IS A FOCUS RETRY, AND THE BADGE FOLLOWS IT.

```ts
      if (keepAwakeEnabled) {
        setWakeState('denied')
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') requestWebLock()
```
```ts
  document.addEventListener('visibilitychange', retry)
  // Safari denies the lock when the document isn't FOCUSED, and `visibilitychange` does NOT fire on a
  // focus/blur change (only on tab hide/show) — so clicking BACK into the page (from DevTools / another
  // window) wouldn't recover it. Retry on window focus so a denial self-heals on the natural next gesture.
  if (typeof window !== 'undefined') window.addEventListener('focus', retry)
```

| Event | What happens |
|---|---|
| Page hidden / lock released by the browser | `release` fires → `'denied'` published → **badge and button go grey immediately** |
| Still visible | an immediate `requestWebLock()` re-try |
| Page regains focus | the `focus` listener retries; **success publishes `'held'` and both indicators go teal** |
| Retry denied again | stays `'denied'` — 🔴 **and this is exactly why the control belongs on the header: recovery then needs a real click, and it should not be two taps deep** |

⚠️ **The retry is not guaranteed.** Safari can deny outside a live activation, which is the case the
header button exists to serve.

## Q5 — The header's breakpoint structure after the phone-controls task

| Element | Breakpoint mechanism |
|---|---|
| Dashboard link label | `hidden sm:inline` |
| `Full` / `Cook`, `List` / `Grid` | none — always visible |
| **The two step switches** | 🔴 **`hidden sm:contents` on their wrapper** — `display: contents` at `sm:` and up so both stay DIRECT children of the header's flex row; `display: none` below |
| **The `Steps` opener** | 🔴 **`sm:hidden`** — the exact inverse |
| Device button | none — always visible, badges included |
| `No extra wait`, `Pause` | none |

# ✅ THE HEADER HAS EXACTLY ONE BREAKPOINT: `sm:`. Nothing uses `md:` or `lg:`.

---

# STAGE 2 — THE BUILD

## 🔴 ONE HANDLER, ONE ELEMENT, TWO MOUNTS — AND IT IS A PLACED VALUE, NOT A COPY

**What was extracted:** the sheet's button, lifted into a `screenOnBtn(label)` helper beside
`toggleKeepScreenOn` — the `paidChip` / `statusBadgeKds` pattern this codebase already uses.

```tsx
  const screenOnBtn = (label: string) => (
    <button
      type="button"
      onClick={toggleKeepScreenOn}
      aria-pressed={screenHeld}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${screenHeld ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}
    >
      <span aria-hidden>{screenHeld ? '☀️' : '🌙'}</span>
      <span>{label}</span>
    </button>
  )
```

**Both mounts, quoted in full — there is no third:**

```tsx
        <div className="hidden sm:block shrink-0">{screenOnBtn(screenHeld ? 'Screen on' : 'Screen off')}</div>
```
```tsx
                  {screenOnBtn(screenHeld ? 'On' : 'Off')}
```

# ✅ `toggleKeepScreenOn` HAS EXACTLY ONE DEFINITION AND EXACTLY ONE `onClick` REFERENCE — INSIDE `screenOnBtn`. EXECUTED: `grep -n` returns the definition at :956, the single `onClick={toggleKeepScreenOn}` at :996, and the two `screenOnBtn(` mounts at :1981 and :2616. **Nothing else calls it.**

⚠️ **THE ONLY DIFFERENCE BETWEEN THE MOUNTS IS THE VISIBLE WORD.** The header carries the whole phrase;
the sheet's row already reads *"Keep the screen on"* beside it and needs only the state. **Same
element, same handler, same classes, same `aria-pressed`.**

✅ **It is a real `<button>` with a real `onClick`.** No `pointerdown` listener, no wrapper that
swallows the click, nothing of the removed one-shot-gesture shape.

## Visibility

| Width | Header button | Sheet row |
|---|---|---|
| **≥ 640px (`sm:`)** | ✅ **visible**, showing the true held/not-held state | ✅ present |
| **< 640px** | ❌ hidden (`hidden sm:block`) | ✅ **present — the sheet keeps its row at ALL widths** |

🔴 **`sm:` AND NOT `md:`, AND HERE IS WHY.** It is the **only** breakpoint this header uses — every
label collapse and the step switches' `hidden sm:contents` / `sm:hidden` pair — **and a second
breakpoint on one wrapping row is how a header starts reflowing in ways nobody can predict from
reading it.** ⚠️ **THE STATED COST: 640–767px is a large phone in landscape rather than a tablet, so
the button appears slightly earlier than "tablet" strictly means.** That is the right direction to be
wrong in: **that band is exactly where a browser KDS runs, and the browser is the platform that needs
the re-acquire.**

## ✅ THE BADGE IS UNTOUCHED

```tsx
          {!soundEnabled && <span aria-hidden className="text-xs">🔕</span>}
          {!screenHeld && <span aria-hidden className="text-xs">🌙</span>}
```

**Not in the diff.** The moon badge still renders from `screenHeld` at **every** width, including where
the header button is also visible. **Two indicators of one state, deliberately: the button is the
CONTROL, the badge is the at-a-glance summary, and the summary must not vanish because the control
appeared.** The device button's `aria-label` still names both states in words.

## ✅ WHAT WAS NOT TOUCHED

The sound control and its sheet row · `ThisDeviceSettings` · the dashboard's UserMenu · the
`isNativeApp() && !isDemo` gate that was moved inward · the two step switches · `hidden sm:contents` ·
`cardStyle` · `hideAmounts` · the board filters · the event scoping · the post-gate handler ·
`app/api`. **`lib/native/keepAwake.ts` is unmodified — `git diff` on `lib` is empty.**

---

# 7. 🔴 THE THIRD ROW. STATED, NOT SOLVED.

# 🔴 AT 640px WITH A TYPICAL TRUCK+VAN NAME, THE HEADER GOES FROM TWO ROWS TO THREE.

**⚠️ ESTIMATE, NOT MEASUREMENT — nothing was rendered.** Same model as the two previous header reports
(0.515em average advance for mixed-case text, 1.15em for emoji), with a greedy line-fill matching what
`flex-wrap` does. **The button adds 112px including its gap.**

| Viewport | available | rows BEFORE | rows AFTER |
|---|---|---|---|
| 🔴 **`sm:` floor (640)** | 608 | 2 | 🔴 **3 — with a typical name.** ✅ 2 with a short one |
| iPad 9.7/10.2 portrait (768) | 736 | 2 | ✅ **2** |
| iPad Air portrait (820) | 788 | 2 | ✅ **2** |
| iPad Pro 11" portrait (834) | 802 | 2 | ✅ **2** |
| 1024 | 992 | 2 | ✅ **2** |
| 1366 | 1334 | 1 | ✅ **1** |

**Row total: 1,147 → 1,258px at a typical name; 1,006 → 1,118px at a short one.**

🔴 **THE THIRD ROW IS CONFINED TO 640–~700px AND DEPENDS ON THE TRUCK+VAN NAME**, which is the row's
biggest variable (57–197px). **Every real tablet width stays at two rows.** ⚠️ **Nothing was moved to
solve it, as instructed** — the candidates that would close it are the `List/Grid/Full/Cook` pill and
the truck/van name, and both were ruled out in V11.25 as a constantly-used control and as how you tell
two screens apart in a two-van truck.

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and `npx eslint` produces a finding
set **byte-identical to HEAD's** (`git show HEAD:…` through `eslint --stdin`, sorted sets diffed).

| Required claim | Method |
|---|---|
| The header button and the sheet row call the same acquire path — one function | ✅ **EXECUTED** — `grep -n` shows one `toggleKeepScreenOn` definition, **one** `onClick` reference (inside `screenOnBtn`), and two `screenOnBtn(` mounts |
| The acquire runs from a `click`, with nothing awaited before `request()` | ✅ **Source read** — `keepAwake()` quoted: the native branch holds the only `await import`, the web branch reaches `requestWebLock()` with no preceding await. ⚠️ **NOT exercised in a browser** |
| The button shows held/not-held, not intent | ✅ **Source read** — `screenHeld = wakeState === 'held' \|\| wakeState === 'native'`, fed by `subscribeWakeState`; `aria-pressed={screenHeld}` |
| At tablet and above the button is on the header; at phone width it is not | ✅ **Source read** — `hidden sm:block` on the header mount. ⚠️ **NOT rendered at any width** |
| The sheet still has its row at every width | ✅ **EXECUTED** — the sheet block carries no width class; `git diff` shows its `<label>` and helper line unchanged, only the button expression replaced by the shared call |
| The `📱 🌙` badge still reflects the true state at every width | ✅ **EXECUTED** — the badge lines are **not in the diff**; they still read `!screenHeld`, the same source the button reads |
| The header row count at each width | 🔴 **ESTIMATE, NOT MEASUREMENT** — labelled as such in §7; the arithmetic was executed, the widths it consumes are modelled |

## 🔴 NOT VERIFIED

- **NOTHING WAS RENDERED AND NOTHING WAS TAPPED.** No `next dev`, no `next build`, no `cap sync`, no
  device, **and no browser** — so 🔴 **the one thing this task exists for, that a click on the header
  button re-acquires a dropped web lock, has not been seen happening.** It is the same code path the
  sheet row has been running, which is the strongest claim available from source.
- **The third-row finding is modelled**, and its band (640–~700px) is the least-used width on this
  surface, so it is also the least likely to be noticed if the model is wrong in either direction.
- **`display: contents` at wide width remains unobserved** (carried from the previous task); this
  change adds a sibling to that row without touching it.

---

# INTEGRITY

## `app/dashboard/[token]/kds/page.tsx`

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 183,408   chars 177,376   lines 2,600
AFTER    bytes 187,261   chars 181,073   lines 2,644
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**

| Codepoint | Before | After | Δ | |
|---|---|---|---|---|
| U+2500 ─ | 2213 | 2260 | +47 | comment rules |
| U+2014 — | 300 | 308 | +8 | comment prose |
| U+1F534 🔴 | 124 | 132 | +8 | comment prose |
| U+FE0F | 108 | 112 | +4 | selectors |
| U+26A0 ⚠️ | 106 | 110 | +4 | comment prose |
| U+2192 → | 20 | 23 | +3 | the acquire-chain arrows |
| **every other class** | — | — | **0** | |

🔴 **NO NEW CLASS AND NONE REMOVED — ☀️ and 🌙 were already in this file**, on the sheet row this task
lifted; the button MOVED rather than multiplied. ✅ **`U+26A0` and `U+FE0F` both moved +4** — a
correctly-paired addition. **Carrier-aware check on the source: `U+26A0` n=110, 110 paired,
0 bare.**

## This report — SEPARATE pass, run AFTER writing

```
docs/kds-screen-on-header-report.md   bytes 17,686
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 21 | 0 | 21 |
| U+2705 ✅ | 34 | 0 | 34 |
| **U+26A0 ⚠️** | **13** | **13** | ✅ **0** |
| **U+2600 ☀** | **4** | **3** | **1** |
| U+1F319 🌙 | 5 | 0 | 5 |
| U+1F4F1 📱 | 2 | 0 | 2 |
| U+1F515 🔕 | 2 | 0 | 2 |

**`U+26A0` and `U+2600` are the two bases here that default to TEXT presentation.** ✅ **Every `U+26A0`
is PAIRED — 13 OF 13, ZERO BARE.** ⚠️ **`U+2600` is 3 paired and 1 bare** — the
paired ones are verbatim quotes of the button's own `☀️`, which the source writes paired; any bare one
is the codepoint LABEL in the table row above, where the glyph is named rather than quoted. Every
remaining base has emoji presentation by default. Total `U+FE0F` = 16 = 13 warnings +
3 sun.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/kds-screen-on-header-report.md
```

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **BOTH** — already modified by six earlier tasks this session; **this task added `screenOnBtn` and the two mounts to it** |
| 🔴 `?? docs/kds-screen-on-header-report.md` | 🔴 **THIS TASK** — this file, the only new entry |
| `M docs/reference-manual.md` · `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — **left alone, as instructed** |
| `M app/dashboard/[token]/page.tsx` · `M app/api/dashboard/action/route.ts` · `M lib/native/orderGate.ts` · `M lib/native/useGatedActionResult.tsx` · `M components/dashboard/PaymentActionsModal.tsx` | ✅ pre-existing — the payment-method and modal-backdrop tasks |
| the eight other `?? docs/*.md` | ✅ pre-existing — the preceding tasks' reports. ⚠️ **Not named in the brief's two-entry list; left alone on the same footing** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
