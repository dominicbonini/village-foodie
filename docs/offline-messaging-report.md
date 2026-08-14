# Offline messaging consolidated — six banners to four, eleven toasts re-scoped

Date: 14 August 2026
**EDITED: 4 files.** `components/native/OfflineBanner.tsx` · `app/dashboard/[token]/page.tsx` ·
`app/dashboard/[token]/kds/page.tsx` · `components/dashboard/AddOrderPanel.tsx`
`tsc --noEmit`: exit 0 · **0 NUL, 0 control bytes < 0x09** · **no file gained a codepoint class.**

No `next dev`, no `next build`, no `cap sync`, no deploy, no commit.
**No span of the prompt arrived garbled. No instruction contradicted another.**

> ### THE RULE APPLIED THROUGHOUT
> **Persistent state belongs in the BANNER. Per-event confirmation belongs in the TOAST.**
> **The toast keeps IDENTITY and ACTION; the banner keeps STATE.**

---

# PART A — THE COUNT WAS MISLABELLED. FIXED FIRST.

## A1. The function — **unchanged, and correctly so**

**READ, `lib/native/outbox.ts:177-179`:**
```ts
export async function countPendingOps(): Promise<number> {
  return (await listOps()).filter(o => o.state !== 'conflict').length
}
```
**and the kinds it counts, `outbox.ts:67`:**
```ts
export type OutboxKind = 'create' | 'status' | 'edit' | 'stock' | 'buzzer'
```
🔴 **A stock toggle, a buzzer assignment and an order all increment one counter that rendered as
"orders".** ✅ **The function is right — it counts pending work. The LABEL was the lie, and the label is
what changed.**

## A2. ✅ EVERY render site updated — **all four, and none left saying "orders"**

**There are exactly four, all in `OfflineBanner.tsx`.** The complete diff of that file:
```diff
-        📴 Offline — {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, will sync when you&apos;re back online.
+        📴 Offline — {queued} {queued === 1 ? 'change' : 'changes'} saved on this device, will sync when you&apos;re back online. Settings are locked.
-        Syncing {queued} {queued === 1 ? 'order' : 'orders'}…
+        Back online — syncing {queued} {queued === 1 ? 'change' : 'changes'}…
-        Synced {lastSynced} ✓
+        All changes synced.
-        {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, syncing…
+        {queued} {queued === 1 ? 'change' : 'changes'} saved on this device, syncing…
```
🔴 **A repo-wide search for the count rendered as "orders" now returns NOTHING.** ⚠️ **The fourth site
(online-but-still-queued) is not one of B3's three phases** — it is the mid-recovery state. **It was not
in the brief's target copy, so only its LABEL was changed and its wording left alone.**

## A3. ✅ Singular handled — `{queued === 1 ? 'change' : 'changes'}`

"1 change", "2 changes". **The existing ternary shape was kept; only the two words changed**, so the
plural logic cannot drift from the label.

---

# PART B — THE TWO DASHBOARD BANNERS, MERGED

## B1. Both, quoted in full BEFORE the change

**The orange one — `components/native/OfflineBanner.tsx:177-205`:**
```tsx
  // Sync/pending banner — driven by the ACTIONABLE pending count, so conflicts can't keep it up.
  let syncBanner: ReactNode = null
  if (phase === 'offline') {
    syncBanner = (
      <div className="w-full bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
        📴 Offline — {queued} {queued === 1 ? 'order' : 'orders'} saved on this device, will sync when you&apos;re back online.
      </div>
    )
  } else if (phase === 'syncing') {
    …Syncing {queued} {queued === 1 ? 'order' : 'orders'}…
  } else if (phase === 'synced' && lastSynced > 0) {
    …Synced {lastSynced} ✓
  } else if (queued > 0) {
    …{queued} {queued === 1 ? 'order' : 'orders'} saved on this device, syncing…
  }
```

**The dark one — `app/dashboard/[token]/page.tsx:2618-2626`:**
```tsx
      {/* Persistent OFFLINE chip — shown on EVERY tab whenever offline (single isOffline source), so the
          operator always knows. Complements OfflineBanner (order-focused, native-only): this signals the
          global offline state + what's locked, on Settings/Stock too. Slim shrink-0 bar in the app-shell. */}
      {isOffline&&(
        <div className="w-full bg-slate-800 text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-2 shrink-0">
          <span>📴 Offline — orders &amp; stock save on this device; settings are locked</span>
        </div>
      )}
```

## B2. ✅ Orange kept, "Settings are locked" absorbed, dark deleted

The dark chip is replaced by a comment block recording what it said, why it went, and that its unique
fact was not lost — **so the next reader cannot reinstate it by accident.**

## B3. The three phases, as specified

| Phase | After |
|---|---|
| **Offline** | `📴 Offline — {n} changes saved on this device, will sync when you're back online. Settings are locked.` |
| **Reconnecting** | `Back online — syncing {n} changes…` |
| **Synced** | `All changes synced.` |
| *(mid-recovery, not in the brief)* | `{n} changes saved on this device, syncing…` — label only |

✅ **Both transient states kept.** The `phase` machine, its thresholds, the drain trigger and the retry
backoff are **untouched** — only the strings inside the three `syncBanner` assignments changed.

⚠️ **ONE INFORMATION LOSS, AND IT IS IN THE SPECIFIED COPY:** the synced phase read
`Synced {lastSynced} ✓` and now reads `All changes synced.` — **the count of what synced is gone**, and
so is the tick. `lastSynced` is still computed and still gates the phase (`phase === 'synced' && lastSynced > 0`),
so **nothing broke; the operator is simply no longer told how many.** **Flagged, not resisted.**

## B4. ✅ COVERAGE IS UNCHANGED — **both were app-shell children, and I checked rather than assumed**

**READ:** the root is `page.tsx:2596` `<div className="bg-slate-50 h-dvh flex flex-col overflow-hidden">`;
`<OfflineBanner …>` is mounted at **`:2602`** and the dark chip was at **`:2622`** — 🔴 **both direct
children of the app-shell root, OUTSIDE `<main>`, which begins hundreds of lines later.**

✅ **So the two had IDENTICAL tab coverage: every tab.** The survivor renders exactly where the deleted
one did. **Nothing needed preserving, and the wider-of-the-two question does not arise.**

⚠️ **One real difference, which the merge inherits:** `OfflineBanner` returns `null` on web
(`:108 if (!isNativeApp()) return null`) and the dark chip was gated on `isOffline`, which is itself
native-gated at its source. **Both were native-only. The web is unaffected either way** — it has
`WebOfflineBanner`, untouched (E3).

---

# PART C — THE TWO TAB-SPECIFIC BANNERS

## C1. ✅ Menu & Stock — DELETED

**BEFORE, `page.tsx:3990-3995`:**
```tsx
            {isOffline&&(
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800 flex items-center gap-2">
                <span aria-hidden>📴</span>
                <span>You&apos;re offline — stock changes are saved on this device and will sync when you reconnect.</span>
              </div>
            )}
```
**Replaced by a comment recording the deletion.** ✅ **Fully covered by
`{n} changes saved on this device` — which, since A2, now genuinely counts the stock ops it is claiming
to cover.** ⚠️ **That is why A came first: before the label fix, deleting this banner would have left
stock changes counted under a heading that said "orders".**

## C2. ✅ Settings — TRIMMED to the one fact nothing else says

**BEFORE, `page.tsx:3469`:**
```tsx
                <span>You&apos;re offline — reconnect to change these settings. (Printer &amp; notification settings still work offline.)</span>
```
**AFTER:**
```tsx
                <span>Printer &amp; notification settings still work offline.</span>
```
✅ **The lead is now carried persistently by the merged banner's "Settings are locked."** 🔴 **What
survives is the EXCEPTION to that rule** — the one thing a global banner cannot say, and the thing an
operator on that tab actually needs.

⚠️ **The container is kept**, so it still renders only when `isOffline` and still looks like a notice.
**Only the sentence changed.**

---

# PART D — THE TOASTS

## D1. All twelve offline success toasts, with file:line as found

| # | file:line | Before |
|---|---|---|
| 1 | `page.tsx:1561` | `Buzzer ${prior} removed — saved on this device, will sync when back online` |
| 2 | `page.tsx:1562` | `Buzzer ${buzzerNumber} saved on this device — will sync when back online` |
| 3 | `page.tsx:1851` | `Order #${q?.id} saved on this device — will sync when back online` **(↩ Undo)** |
| 4-7 | `page.tsx:2027, 2034, 2081, 2087` | `Stock saved on this device — will sync when back online` ×4 |
| 8 | 🔴 `page.tsx:2047` | `Saved on this device — will sync when back online` — **names nothing** |
| 9-10 | `page.tsx:2184, 2204` | `Order #${displayId} saved on this device — will sync when back online` ×2 |
| 11 | `kds/page.tsx:594` (pair) | `Buzzer … removed / saved …` |
| 12 | `kds/page.tsx:654` | `Order #${num} saved on this device — will sync when back online` **(↩ Undo)** |
| 13 | `AddOrderPanel.tsx:1156` | `Order ${displayId} saved on this device — will sync when back online` |

⚠️ **The inventory said "eleven"; counting each arm of the two buzzer ternaries separately gives
thirteen strings across twelve `showToast` calls.** **Stated rather than rounded — the count in the
earlier inventory was of call sites, not strings.**

## D2. ✅ The sync clause dropped from every one

```diff
- `Order #${displayId} saved on this device — will sync when back online`
+ `Order #${displayId} saved`
- 'Stock saved on this device — will sync when back online'
+ 'Stock saved'
- `Buzzer ${buzzerNumber} saved on this device — will sync when back online`
+ `Buzzer ${buzzerNumber} saved`
- `Buzzer ${prior} removed — saved on this device, will sync when back online`
+ `Buzzer ${prior} removed`
```
✅ **A repo-wide search for `will sync when back online` now returns NOTHING.** **The banner says it,
persistently, with a count.**

## D3. 🔴 THE UNDO ACTION SURVIVED — **PROVEN BY COUNT AGAINST `HEAD`, NOT BY INSPECTION**

```
$ for f in page.tsx kds/page.tsx: grep -c "↩ Undo" <working> vs git show HEAD:<f>
  app/dashboard/[token]/page.tsx        HEAD=6  now=6  IDENTICAL
  app/dashboard/[token]/kds/page.tsx    HEAD=2  now=2  IDENTICAL
```

**And the two offline-path toasts quoted after the change:**
```tsx
          showToast(savedMsg,'success',{duration:7000,action:{label:'↩ Undo',run:offlineUndo}})
          showToast(`Order #${num} saved`, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
```
🔴 **Only the message string changed. `action`, `label`, `run: offlineUndo` and `duration: 7000` are
byte-identical.** ✅ **The copy changed; the action did not.**

## D4. ✅ THE BARE TOAST GAINED AN IDENTITY RATHER THAN LOSING A CLAUSE

**`page.tsx:2047` is `updateCategoryAvailable(category, available)`** — the operator toggled **one
named category**, and the toast said nothing about which.
```diff
- showToast('Saved on this device — will sync when back online')
+ showToast(`${category} availability saved`)
```
🔴 **This is the only toast that got LONGER, and deliberately: its job is to say WHICH thing, and it was
the one toast not doing it.** A generic "Saved" would have been weaker than what it replaced.

⚠️ **A JUDGEMENT I DID NOT MAKE UNILATERALLY:** the four `Stock saved` toasts (4-7) have `itemName` /
`category` / `optionId` in scope and could name them the same way. **D4 named only `:2047`, so I changed
only `:2047`.** **Worth deciding separately — the same argument applies.**

## D5. ✅ Duration and variant preserved on every changed toast

**Verified per call:** #3 and #12 keep `'success'` + `duration: 7000` + the Undo action; #13 keeps
`'success'`; #1-2, #4-8, #9-11 pass **no** options and still pass none. 🔴 **Every edit was inside the
template literal or the quoted string — no argument after it was touched.**

---

# PART E — THE FOUR UNTOUCHABLES

## E1-E3. ✅ ALL FOUR CONFIRMED PRESENT AND UNCHANGED

| # | What | Verified |
|---|---|---|
| **E1** | `AddOrderPanel.tsx:1229` — *"Couldn't reach the server — you appear to be offline. The order was NOT sent…"* | ✅ present, **not in the diff** |
| **E2a** | `OfflineBanner.tsx:129` — **`⚠ PAYMENT NOT RECORDED`** + two-step dismissal | ✅ present, **not in the diff** |
| **E2b** | `OfflineBanner.tsx:168` — *"— update didn't sync, needs review"* | ✅ present, **not in the diff** |
| **E3a** | `WebOfflineBanner.tsx:69` (web-only) | ✅ **file absent from `git status` entirely** |
| **E3b** | `kds/page.tsx:1221` — *"No connection — showing last known orders…"* | ✅ **`git diff` for that file contains ZERO lines matching "No connection"** |

**The complete `kds/page.tsx` diff — two toasts, nothing else:**
```diff
-          ? `Buzzer ${prior ?? ''} removed — saved on this device, will sync when back online`
-          : `Buzzer ${buzzerNumber} saved on this device — will sync when back online`)
+          ? `Buzzer ${prior ?? ''} removed`
+          : `Buzzer ${buzzerNumber} saved`)
-          showToast(`Order #${num} saved on this device — will sync when back online`, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
+          showToast(`Order #${num} saved`, 'success', { duration: 7000, action: { label: '↩ Undo', run: offlineUndo } })
```
🔴 **The KDS banner and its detector are untouched — it runs `lib/native/network.ts`, a different
detector, and unifying it is a separate task (§11).**

## E4. ⚠️ WHY THEY CANNOT BE SUPPRESSED BY ANYTHING ABOVE — and this remains true

**All four failure paths are REACTIVE — triggered by a failed fetch or a rejected replay, never by a
polled flag:**
- E1 fires on `!isNativeApp() && !result.queued && result.status == null` — **a thrown fetch.**
- E2a/E2b fire on an op reaching `state === 'conflict'` — **a 409 or exhausted retries**, recorded by
  the drain.

🔴 **Nothing in this task touched a detector, the outbox, the gate, the drain or the ledger, so no
change here can silence them. That property is intact.**

**Scope proof — `git diff --stat`:**
```
 app/dashboard/[token]/kds/page.tsx     |   6 +-
 app/dashboard/[token]/page.tsx         |  53 ++--
 components/dashboard/AddOrderPanel.tsx |  29 +-
 components/native/OfflineBanner.tsx    |   8 +-
 docs/reference-manual.md               | 498 ++++++++++++++++++++++++++++++++-
```
✅ **`lib/native/*`, `lib/payments/*`, `components/WebOfflineBanner.tsx` and `components/dashboard/OrderCard.tsx`
do not appear.** ⚠️ `docs/reference-manual.md` is the **V11.17 update from a previous task**, not this one.

---

# PART F — INTEGRITY

## F1 / F2. Non-ASCII census, before and after

| File | Bytes | Lines | Distinct | Gained | Lost |
|---|---|---|---|---|---|
| `components/native/OfflineBanner.tsx` | 11,580 → **11,619** | 208 → 208 | **9 → 8** | **NONE** | ⚠️ **`U+2713` ✓** |
| `app/dashboard/[token]/page.tsx` | 372,846 → **373,163** | 4,837 → 4,840 | **53 → 53** | **NONE** | **NONE** |
| `app/dashboard/[token]/kds/page.tsx` | 91,699 → **91,554** | 1,552 → 1,552 | **32 → 32** | **NONE** | **NONE** |
| `components/dashboard/AddOrderPanel.tsx` | 168,834 → **168,993** | 2,474 → 2,476 | **36 → 36** | **NONE** | **NONE** |

🔴 **NO FILE GAINED A CODEPOINT CLASS — the check the brief specifically warned about.**

**Every difference explained:**

- 🔴 **`OfflineBanner.tsx` LOST `U+2713` (✓), 1 → 0.** Its only occurrence was in `Synced {lastSynced} ✓`,
  and **B3's specified replacement — `All changes synced.` — has no tick.** ⚠️ **Reported rather than
  silently absorbed: this is a class LOSS, the mirror of the gain the census usually catches, and it is
  a direct consequence of the copy that was decided.** `—` 16 → 17 (+1) from `Back online — syncing`.
- **`page.tsx`:** `📴` **3 → 1 (−2)** — the two deleted banners each carried one; the merged banner's
  own `📴` lives in `OfflineBanner.tsx`. `—` **484 → 479 (−5)** — the deleted sentences and the dropped
  sync clauses. `─` +31, `🔴` +3, `⚠`/`FE0F` +2/+2 — the three replacement comment blocks, in the file's
  house style, **the ⚠️ pair moving in lockstep.**
- **`kds/page.tsx`:** `—` **110 → 107 (−3)** — exactly the three sync clauses removed. **The file
  SHRANK by 145 bytes; nothing was added.**
- **`AddOrderPanel.tsx`:** `⚠`/`FE0F` **+1/+1** — one warning marker in the comment explaining why the
  clause went. **No other class moved.**

## F3. Byte scan — byte-level tool, never grep

| File | NUL | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `components/native/OfflineBanner.tsx` | **0** | **0** | **0** |
| `app/dashboard/[token]/page.tsx` | **0** | **0** | **0** |
| `app/dashboard/[token]/kds/page.tsx` | **0** | **0** | **0** |
| `components/dashboard/AddOrderPanel.tsx` | **0** | **0** | **0** |

## F4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## F5. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OfflineBanner.tsx
 M docs/reference-manual.md          <- V11.17, previous task
?? docs/offline-messaging-report.md
?? docs/offline-order-number-report.md
```
**`git diff --stat` is quoted in E4.** **Nothing committed.**

## F6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and it verifies almost nothing here

🔴 **THIS TASK IS ALMOST ENTIRELY STRING LITERALS, WHICH TYPESCRIPT DOES NOT READ.** It would have been
equally happy with *"Offline — {n} bananas saved"*, with a missing plural branch, or with the settings
sentence deleted rather than trimmed.

**What it DID check:** that `${category}` exists in scope at the D4 site, and that no JSX was left
unbalanced by the two deletions. **What it cannot:** that the copy is right, that the merged banner
renders on every tab, or that anything appears at all. **Nothing was run on a device.**

---

# WHAT REMAINS

1. ⚠️ **Nothing was rendered.** Every claim about what an operator sees is read from source.
2. 🔴 **The KDS banner still runs a DIFFERENT detector** (`lib/native/network.ts` — raw
   `@capacitor/network`, which reports online on a connected-but-dead uplink) while the dashboard runs
   the ping-based one. **Two screens in one truck can still disagree. §11; a separate task, deliberately.**
3. ⚠️ **`WebOfflineBanner` was not consolidated** — it is web-only and out of scope, so a web operator
   sees a differently-worded bar. **Correct for now; worth one look before launch.**
4. ⚠️ **The four `Stock saved` toasts still do not name the item** (D4). The same argument that justified
   changing `:2047` applies to them. **Not done, because the brief named one site.**
5. ⚠️ **The synced phase no longer reports HOW MANY synced** (B3). **In the specified copy; flagged.**
6. **Six banners are now four** — merged, deleted, trimmed — **and the two that remain outside this
   task's scope are the web one and the KDS one.**
