# Keep-awake — fix 4 withdrawn, persistence restored

**Date:** 5 August 2026. Supersedes the review of the same name.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run. No `cap sync`.
No garbled spans in the brief.

**Three files touched, all revisions of the previous build:** `lib/native/keepAwake.ts`, `app/dashboard/[token]/kds/page.tsx`, `app/dashboard/[token]/page.tsx`. **No new code paths** — this removes two effects and corrects the comments that justified them.

---

## 1. ✅ UNMOUNT RELEASE REMOVED — persistence restored on both platforms

| Site | Before | After |
|---|---|---|
| [kds/page.tsx:289-303](app/dashboard/[token]/kds/page.tsx#L289) | `return () => { void allowSleep() }` | **removed**, replaced by a note |
| [dashboard/page.tsx:1004-1009](app/dashboard/[token]/page.tsx#L1004) | `useEffect(()=>()=>{void allowSleep()},[])` | **removed**, replaced by a note |

`grep` confirms **no unmount release remains** on either surface.

Both replacement comments record the two things the brief asked for, kept deliberately separate because conflating them is what caused the bad instruction:

**Why persistence is correct** — *keep-awake is a DEVICE preference meaning "this screen stays on", not "stays on while the KDS is mounted. An operator who steps into Manage mid-service to fix a price must not come back to a slept screen. Unmount is the operator moving BETWEEN screens; it is not them finishing with the app, and releasing there treats a navigation as an exit."*

**Why a release path must still exist** — *iOS's `isIdleTimerDisabled` is PROCESS-WIDE: it survives backgrounding, teardown and route changes, and nothing in the OS clears it. So release on the events that mean the operator no longer wants the screen held — the SETTING going off, and BACKGROUNDING — via a module-level listener that works on every route.*

I also corrected the dashboard's surviving justification comment ([:992-1000](app/dashboard/[token]/page.tsx#L992)): the original 2026-07-28 note reached the **right conclusion by Android-only reasoning**. It now says so — conclusion kept, reasoning replaced — rather than being deleted as it was in the previous build.

## 2. ✅ RELEASE ON INTENT, NOT LIFECYCLE

| Trigger | Where | Status |
|---|---|---|
| Setting turned off | `allowSleep()` via `applyKeepScreenOn(false)` — [kds:451](app/dashboard/[token]/kds/page.tsx#L451), [dashboard:1459](app/dashboard/[token]/page.tsx#L1459) | ✅ kept |
| App backgrounded | `onNativeVisibilityChange()` — [keepAwake.ts:148-160](lib/native/keepAwake.ts#L148), module-level listener | ✅ kept |
| App terminates | — | ⚠️ **no hook exists, and none is needed** — see below |
| Unmount / route change | — | 🔴 **removed** |

The module header now states the ownership rule where it will be read ([keepAwake.ts:100-105](lib/native/keepAwake.ts#L100)): *"ON INTENT, NOT ON LIFECYCLE … The listener below is module-level precisely so backgrounding is caught on EVERY route, including ones with no keep-awake code of their own, such as /manage."*

### ⚠️ Termination: no hook, and it does not matter

`@capacitor/app` exposes `appStateChange`, `pause`, `resume`, `appUrlOpen`, `appRestoredResult` and `backButton` — **there is no terminate event** (checked in `node_modules/@capacitor/app/dist/esm/definitions.d.ts`). I did not add one.

It is not a gap: `isIdleTimerDisabled` is a property of the `UIApplication` singleton, so **it dies with the process**. And iOS terminates apps from the *background* state, by which point the backgrounding release has already run. **Nothing to release, and nothing that could run if there were.**

## 3. ✅ EVERYTHING ELSE FROM THE PREVIOUS BUILD IS UNCHANGED

| Kept | Evidence |
|---|---|
| Toggles branch on the **setting**, not `wakeState` | [kds:453](app/dashboard/[token]/kds/page.tsx#L453), [dashboard:1474](app/dashboard/[token]/page.tsx#L1474) |
| `isKeptAwake()` reconciliation on mount + foreground + around every acquire/release | [keepAwake.ts:107-123](lib/native/keepAwake.ts#L107) |
| Failed release → `'unknown'` + `console.error`, never a false `'off'` | [keepAwake.ts:136-146](lib/native/keepAwake.ts#L136) |
| `prepareKeepAwake(enabled: boolean)` required argument | [keepAwake.ts:220](lib/native/keepAwake.ts#L220) |
| No unconditional enable on KDS mount | `grep "prepareKeepAwake()"` → no call sites |

## 4. FOREGROUND RE-ACQUIRE ON WEB — stated plainly

**Native:** ✅ works, no gesture. `onNativeVisibilityChange` reconciles then calls `nativeAcquire()` if `nativeIntent` is true.

**Web:** 🔴 **`onNativeVisibilityChange` never runs on web** — its first line is `if (!Capacitor.isNativePlatform() …) return`. Web has its own, **pre-existing and untouched** mechanism:

1. The browser auto-releases a screen wake lock when the document hides (spec behaviour — we never release it ourselves).
2. The lock's `release` handler ([keepAwake.ts:58-68](lib/native/keepAwake.ts#L58)) nulls `webLock` and, if intent is still on, publishes `'denied'`.
3. On return, `visibilitychange` / `focus` fire `retry()` ([:80-85](lib/native/keepAwake.ts#L80)) → `requestWebLock()`.

**Can I confirm it succeeds without a gesture? No, and I will not claim it.** The Wake Lock spec permits a request from a visible, focused document with no activation, and Chrome grants it — but this codebase's own hard-won finding is that **Safari denies requests not tied to a live user activation**, and that is why `KeepAwakePrompt` exists. Whether a `focus`-triggered retry counts on WebKit is not determinable from the repo, and I have not run it on a device.

✅ **What I can state: this is unchanged by any of my work.** The web background/foreground path is byte-identical to before the keep-awake sessions began. If it was reliable for Gusto before, it is reliable now; if it was not, this did not make it worse.

## 5. ✅ `/manage` NEEDS NO KEEP-AWAKE CODE — confirmed, not assumed

`grep keepAwake app/manage/[token]/page.tsx` → **nothing**, and nothing is needed:

- **Nothing releases** when the dashboard unmounts, so the lock is still held on arrival.
- **The intent lives in the module**, not the component — `nativeIntent` (native) and `webLock` + `keepAwakeEnabled` (web) are module-level and survive every route change.
- **Backgrounding is still caught on `/manage`**, because the `visibilitychange` listener is registered on `document` at module level, not by a component.

⚠️ **One honest consequence:** `/manage` carries no *toggle*, so an operator cannot turn keep-awake off from there. The release remains reachable — background the app, or return to the dashboard or KDS. Not a stranding path, but it is a route where the only control is elsewhere.

---

## VERIFICATION WALKS

### (a) Setting ON — dashboard → KDS → dashboard, on WEB

| Step | `webLock` | Lock | Tap needed? |
|---|---|---|---|
| Dashboard mount, `prepareKeepAwake(true)` | `null` | not held, `KeepAwakePrompt` shows | ⚠️ **one tap** — pre-existing Safari activation requirement, unchanged by this work |
| Operator taps the prompt → `keepAwake()` → `requestWebLock()` | **set** | **held** | — |
| **→ KDS.** No unmount release. KDS mount → `prepareKeepAwake(true)` → `if (webLock) { setWakeState('held'); return }` | **set** | **held** | ✅ **none** |
| **→ dashboard.** Same path | **set** | **held** | ✅ **none** |

✅ **After the initial acquisition, no tap is ever required again on a route change.** That is the target, and it is met. The one tap at the start is Safari's activation rule and predates all of this.

### (b) Setting ON — dashboard → Manage → dashboard

| Step | Native `isIdleTimerDisabled` | Web `webLock` |
|---|---|---|
| On dashboard | `true` | held |
| **→ /manage.** No unmount release; `/manage` has no keep-awake code | **`true`** | **held** |
| On /manage for several minutes | **`true`** — screen stays on | **held** |
| **→ dashboard.** `prepareKeepAwake(true)`; native re-acquire is idempotent (the plugin no-ops when already disabled), web sees `webLock` and reports held | **`true`** | **held** |

✅ **The screen never sleeps on Manage.** This is the scenario the 2026-07-28 decision existed to protect and that fix 4 broke.

### (c) Setting ON → toggle OFF

| Step | State |
|---|---|
| Tap the toggle. Branches on `keepScreenOn` (**true**) → OFF branch | — |
| `applyKeepScreenOn(false)` → `setKeepScreenOn(false)` → `allowSleep()` | native: `nativeIntent = false`, release, reconcile → `off`. web: `keepAwakeEnabled = false`, `webLock.release()`, `webLock = null`, `off` |
| localStorage ← `'off'` | persists across reloads |
| `[keepScreenOn]` effect re-runs → `prepareKeepAwake(false)` → `allowSleep()` again | idempotent |
| Navigate anywhere; background; foreground | foreground reconcile sees `nativeIntent === false` → `nativeRelease()` |

✅ **Released, and stays released.** Nothing re-acquires: the only acquire paths are `prepareKeepAwake(true)` (gated on the setting), the toggle, and the prompt — and the prompt does not render when the setting is off.

### (d) Setting ON — background, then foreground

| Step | Native | Web |
|---|---|---|
| Backgrounded | `visibilitychange` hidden → `nativeRelease()`. **`isIdleTimerDisabled = false`, `nativeIntent` stays `true`** | browser auto-releases; `release` handler → `webLock = null`, `'denied'` |
| Foregrounded | reconcile → `nativeIntent` true → `nativeAcquire()` → **`true`** | `visibilitychange`/`focus` → `retry()` → `requestWebLock()` — see §4 for the WebKit caveat |

✅ Native is fully paired. Web is pre-existing behaviour, unchanged.

### (e) Any path where the iOS idle timer is disabled with no reachable release?

**No.** Every acquire is reachable by three independent releases:

| Release | Reachable from |
|---|---|
| Setting off | the toggle on dashboard or KDS (⚠️ not from `/manage` — see §5) |
| Backgrounding | **every route** — module-level `document` listener |
| Process death | the OS clears the property |

⚠️ **Two residuals, both stated in the previous build and unchanged:**
1. If `nativeRelease()` itself fails, the flag stays set — but `wakeState` becomes `'unknown'`, a `console.error` names the consequence, and the next reconcile (foreground, mount, or toggle tap) re-reads the OS and retries. Detected and retried, not silent and permanent.
2. A hard process kill between acquire and release leaves nothing to run — self-correcting, because iOS clears the property with the process.

---

## 🔴 GUSTO — is web identical to before any of this work?

**Almost. One deliberate difference, which is exactly the one you named.**

| Change | Reaches Gusto's browser? |
|---|---|
| Unmount release | 🔴 **withdrawn** — web is back to persisting across routes, as before |
| `'unknown'` state | ❌ set only by native-gated paths — never produced in a browser |
| `reconcileWakeState()` | ❌ `if (!Capacitor.isNativePlatform()) return wakeState` on the first line |
| `nativeIntent`, `ensureNativeListeners` | ❌ native branches only; the web `ensureListeners()` retry is untouched |
| `prepareKeepAwake(enabled)` | ✅ web path identical; the new `if (!enabled) { void allowSleep() }` is the caller's old `else` branch moved inside |
| `allowSleep()` web branch | ✅ byte-identical |
| `keepAwake()` web branch | ✅ unchanged, including the no-await-before-request rule Safari needs |
| Background/foreground on web | ✅ unchanged |
| **Toggle branches on the setting** | ✅ **YES — this is the intended difference** |

### The one difference, stated precisely

**Before:** the toggle branched on `screenHeld`. With the setting ON but the lock not held (Safari denied it), tapping took the **enable** branch and retried — so **there was no way to turn the setting off from the toggle in that state.** That is the bug.

**After:** it branches on the setting, so a tap turns it off. ✅ **"Turning the setting off now actually works"** — your stated target.

⚠️ **The precise cost, so it is not discovered later:** the *retry* affordance has moved off the header toggle. An operator whose lock was denied used to retry by tapping the toggle; they now retry with the `KeepAwakePrompt` button, which renders in exactly that state (`keepScreenOn && !held`) and runs the same acquire. **The capability is not lost, but it is a different control.** That follows necessarily from "`wakeState` may inform display; it must not decide" — one control cannot both act on the setting and act on the lock state.

**Everything else on Gusto's web path is as it was before any of this work.**

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline | Now | |
|---|---|---|---|
| `lib/native/keepAwake.ts` | 2 (2 err, 0 warn) | **2 (2, 0)** | ✅ |
| `app/dashboard/[token]/kds/page.tsx` | 16 (14, 2) | **16 (14, 2)** | ✅ |
| `app/dashboard/[token]/page.tsx` | 93 (68, 25) | **93 (68, 25)** | ✅ |

The two `keepAwake.ts` errors are pre-existing `no-explicit-any` on `webLock` and the `(navigator as any)` cast.

**Other checks:** `allowSleep` still imported and used on both surfaces (no unused import); no unmount release remains; `grep "prepareKeepAwake()"` finds no call sites.

### Out of scope — confirmed untouched

Purchase-CTA gates · `lib/commerce-policy.ts` · `HGBridgeViewController.swift`, `Main.storyboard`, `project.pbxproj`, `capacitor.config.*` · `KeepAwakePrompt.tsx` · `UserMenu.tsx` · `app/manage/[token]/page.tsx`.

### 🔴 NOT VERIFIED

**Nothing here has run on a device.** `tsc` and lint prove it compiles and holds its baselines; they prove nothing about `isIdleTimerDisabled` or about whether WebKit grants a `focus`-triggered wake-lock request. The decisive on-device checks are walk (b) — the screen must stay lit on Manage — and walk (c) — it must sleep after the toggle goes off and stay slept.
