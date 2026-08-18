# Offline protection on the KDS — four defects, one shared emitter

**Files changed — three:** `lib/native/useHeartbeat.ts` (**new**) · `app/dashboard/[token]/kds/page.tsx` ·
`app/dashboard/[token]/page.tsx`.
✅ **`/api/heartbeat`, `heartbeat-monitor`, the 30s threshold, `truck_events.paused_until`, the
customer gate, the outbox, `gatedAction`, `OfflineBanner` and `app/manage/[token]/page.tsx` are ALL
untouched** — `git diff --stat` on `app/manage`, `app/api` and `supabase` is **empty**.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore`. **Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

## 🔴 A MISTAKE I MADE AND REVERSED, REPORTED FIRST

**My first attempt at Fix 4 used a regex to remove the dashboard's inline effect, and it matched far
too much — 690 lines of `app/dashboard/[token]/page.tsx` were deleted in one edit.** Caught
immediately by `tsc` (five "cannot find name" errors). **Recovered without `git checkout`, which is
forbidden here:** the removed span was reconstructed from `git show HEAD:…` and spliced back by line
number, then the two effects were removed again with **exact literal matching, no regex**.
✅ **VERIFIED RECOVERED:** `tsc` clean, and the payment-method work from an earlier task
(`plainPaidMethod`, `PLAIN_PAID_ACTIONS`, the body spread) is **still present — grep-confirmed, 3
occurrences.** ⚠️ **The span was entirely below this session's other dashboard edits, which is why
HEAD was a safe source for it.**

---

# FIX 1 — THE KDS SHOWS AN OFFLINE PAUSE

## 🔴 WHAT I USED FOR `deviceOnline`, AND WHY NOT THE OUTBOX SIGNAL

**I added a `navigator.onLine` + listener pair, matching the dashboard's. I did NOT reuse `isOffline`.**

```tsx
  const [deviceOnline, setDeviceOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const on = () => setDeviceOnline(true), off = () => setDeviceOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
```

**The argument, since the brief asked for one rather than a substitution:** `isOffline` comes from the
outbox's `getNetworkStatus` / `subscribeNetworkStatus` and answers *"should I queue this write?"* — a
deliberately conservative signal that can lag and that the dev toggle can force. **Using it here would
make a truck's ordering banner depend on a write-queuing heuristic.** The gate this feeds is the
dashboard's, so the honest answer was the dashboard's own expression, reproduced. **Two jobs, two
signals.**

## The gate, and the V11.24 exclusion reversed CORRECTLY

```tsx
  const offlinePausedRaw = onlinePausedUntil ? new Date(onlinePausedUntil) > new Date() : false
  const offlinePausedDisplay = offlinePausedRaw && !(deviceOnline && activeEventLive)
  const anyPaused = isPaused || offlinePausedDisplay
  const pauseReason: 'manual' | 'offline' | null = isPaused ? 'manual' : offlinePausedDisplay ? 'offline' : null
```

**The dashboard's, reproduced — quoted in the source comment beside it:**
`offlinePausedDisplay = offlinePaused && !(deviceOnline && activeEventLive)` ·
`paused = manualPaused || offlinePausedDisplay` · `pauseReason = manualPaused ? 'manual' : …`.

🔴 **A COMMENT ON THE READ SAYS WHY V11.24's EXCLUSION IS BEING REVERSED AND WHY IT WAS RIGHT THEN:**
the dashboard gates the column rather than OR-ing it raw, so copying the OR without the gate would
have shown a stale banner on a reconnected device. **The gate is now here, so the column can be read.
"DO NOT RE-EXCLUDE THIS" is in the file.**

## The banner

```tsx
      {anyPaused && (
          <span>⏸ Orders paused{pauseReason === 'offline' ? ' (device offline)' : ''} — customers cannot order</span>
          {pauseReason === 'manual' && <button onClick={togglePause} className="underline text-white text-xs">Resume</button>}
```

**`(device offline)` is the dashboard's own wording, reused.** ⚠️ **Resume is offered only for a MANUAL
pause** — `togglePause` writes `paused_until`, and an offline pause is cleared by the next heartbeat,
so a Resume button there would not do what it says.

✅ **THE MANUAL PAUSE IS UNTOUCHED.** `pausedUntil`, its `applyPending`/`markPending` guards and its
resume are not in the diff; `isPaused` still reads `vanPausedUntil` alone and still wins the reason.

---

# FIX 2 — THE SWITCH GAP

**`earlyPing: true`, passed by the KDS only.** One ping on mount, ungated.

## 🔴 WHY THE `activeEventLive` GATE EXISTS — ESTABLISHED BEFORE IT WAS WEAKENED

**The gate's own comment answers it:** *"offline protection only matters for a live event; a
confirmed/pre-order event isn't affected by going offline, and **the monitor only pauses status='open'
events**."* ✅ **So a stamp made while no event is live CANNOT cause a wrong pause — the guard was
avoiding pointless traffic, not preventing a wrong write.** The dashboard's own `onAppResume` comment
independently calls an off-event ping *"harmless"*, and the route is idempotent. **No stop was needed,
and the INTERVAL stays gated — only the single mount ping is not.**

---

# FIX 3 — BACKGROUNDING

**The hook carries the `onAppResume` re-ping for both surfaces, and `deviceOnline` is in the interval's
deps** — so a reconnect re-arms immediately instead of waiting up to 15s. **Both were the dashboard's
and neither was the KDS's.**

---

# FIX 4 — ONE EMITTER. BOTH INLINE VERSIONS, AND EVERY DIFFERENCE

| | Dashboard (before) | KDS (before) | In the hook |
|---|---|---|---|
| 15s interval, gated `if(!activeEventLive)return` | ✅ | ✅ | ✅ |
| `navigator.onLine` skip | ✅ | ✅ | ✅ |
| immediate ping on the flip | ✅ | ✅ | ✅ |
| **`deviceOnline` in deps** | ✅ | 🔴 **absent** | ✅ **both** |
| **`onAppResume` re-ping** | ✅ separate effect | 🔴 **absent** | ✅ **both** |
| **console logging** | ✅ | 🔴 absent | ✅ **both** |
| **early ping** | — | — | **KDS only, by flag** |

# ✅ EVERY DIFFERENCE WAS SOMETHING THE DASHBOARD HAD AND THE KDS LACKED, so the extraction preserves the dashboard exactly and raises the KDS. **Nothing had to be flattened, so no stop was triggered.** The only parameter is `earlyPing`.

⚠️ **`app/manage/[token]/page.tsx` HAS A THIRD EMITTER AND IS NOT TOUCHED.** It fits the same hook —
same endpoint, same body — **but it has no `activeEventLive` and no van, so it would need the gate
defaulting true.** Reported, not changed.

---

# REPORT ONLY — THE VAN-SCOPE NARROWING

**A dashboard ping sends no `vanId` and stamps EVERY active van; a KDS opened with `?van_id=` stamps
ONE.** On a multi-van truck, moving to a van-scoped KDS stops refreshing the others, and they go stale
in 30 seconds. **A fix would either send no `vanId` from the KDS (stamping all, losing per-van
precision) or have the route stamp the whole truck on any authenticated ping.** 🔴 **The ROUTE should
own it — it is the only place that knows the truck's full van set, and both clients already send what
it needs.** **Not built; `/api/heartbeat` is out of scope here.**

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `tsc --noEmit` exits 0. Lint: **dashboard 108 findings before and
after — IDENTICAL** (an unused `onAppResume` import appeared and was removed); **KDS 21/21**;
**`useHeartbeat.ts` 0.**

| Claim | Method |
|---|---|
| The KDS shows a banner when the pause is future AND the gate says so, and not otherwise | ✅ **Source read** — the derivation and banner quoted. ⚠️ **NOT rendered; no pause was set** |
| It distinguishes offline from manual | ✅ **Source read** — `pauseReason`, the dashboard's wording |
| **The manual pause, its guards and its resume are unchanged** | ✅ **EXECUTION** — `applyPending`, `markPending` and the `vanPausedUntil` read are **not in the diff** |
| A KDS mount pings before `activeEventLive` resolves | ✅ **Source read** — `earlyPing` is a mount effect with no gate |
| A backgrounded KDS re-pings on resume | ✅ **Source read** — `onAppResume` in the hook. ⚠️ **Native-only and unexercised** |
| One emitter exists | ✅ **EXECUTION** — both inline effects removed; one `useHeartbeat` definition, two call sites |
| **The dashboard's behaviour through it is identical** | 🔴 **SOURCE-READ, NOT EXECUTION.** Every part moved verbatim and the table above enumerates the differences — **but Gusto's ordering depends on this and it has not been run.** The strongest available evidence is that the lint finding set and the census are unchanged apart from the extraction |
| `manage`'s emitter unchanged | ✅ **EXECUTION** — `git diff --stat app/manage` is empty |

## 🔴 NOT VERIFIED

**NOTHING WAS RENDERED, BACKGROUNDED OR TIMED.** No device, no browser, no query. **The switch-gap
premise itself remains INFERRED** — no timing was measured — so `earlyPing` closes a gap whose length
has never been observed.

---

# INTEGRITY

## Byte scan and census — the three files

| File | bytes | classes | occurrences | new class | NUL · control · CR |
|---|---|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 389,542 → **388,836** | **53 → 53** | 3451 → 3491 | ✅ NONE | 0 · 0 · 0 |
| `app/dashboard/[token]/kds/page.tsx` | 183,408 → **192,681** | **33 → 33** | 2954 → 3164 | ✅ NONE | 0 · 0 · 0 |
| `lib/native/useHeartbeat.ts` | **new** → 4,526 | — → 8 | — → 80 | ⚠️ **a NEW FILE, so all 8 are new by definition** | 0 · 0 · 0 |

✅ **The dashboard SHRANK by 706 bytes** — the two inline effects left and an eight-line call arrived,
which is what an extraction should look like. **Carrier-aware: `U+26A0` is 116/116 paired on the KDS
and 2/2 in the new hook; the dashboard's 2 bare are pre-existing.**

## This report — SEPARATE pass, run AFTER writing

```
docs/offline-protection-kds-fix-report.md   11,684 bytes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 | 11 | 0 | 11 |
| U+2705 | 30 | 0 | 30 |
| **U+26A0** | **6** | **6** | **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct. **`U+26A0` is the
only TEXT-presentation base here**, and **every one of its 6 occurrences is PAIRED — 6 OF 6,
ZERO BARE.** Total `U+FE0F` = 6.

## `git status --porcelain`

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
?? docs/offline-protection-kds-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| **`?? lib/native/useHeartbeat.ts`** · **`?? docs/offline-protection-kds-fix-report.md`** | **THIS TASK — the two new entries** |
| `M app/dashboard/[token]/page.tsx` · `M app/dashboard/[token]/kds/page.tsx` | **BOTH** — already modified by earlier tasks this session; this task added to them |
| everything else | **ALL pre-existing** — earlier tasks' source edits and reports, including `M docs/reference-manual.md` |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
