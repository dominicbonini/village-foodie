# Outbox banner wording — five states, two strings

**REPORT AND PROPOSAL ONLY. 🔴 NOTHING CHANGED — no file edited, nothing committed, nothing deployed.**
**You asked to read the wording before it is final, so it is proposed here and not applied.**

---

## VERIFICATION

**SOURCE READ ONLY.** Every string below is quoted from the file at the line given. **I have not rendered
any of these banners and have not measured them at a working distance.**

**No span of the prompt arrived garbled.**

---

## 1 · Every state that lands an item in `conflict`, and the string it gets

**Five distinct paths. `grep -n "state: 'conflict'" lib/native/orderGate.ts`:**

| # | Line | What actually happened | Was it sent? |
|---|---|---|---|
| **C1** | `:387` | **Malformed op** — missing `order_key` or `url`. Skipped, never posted | 🔴 **Never sent** |
| **C2** | `:412` | **Never reached the server** (offline / DNS / TLS / our own 30s timeout) **and now older than 12h** | 🔴 **Never sent** |
| **C3** | `:424` | **HTTP 409** — the server refused because the order changed elsewhere (cancelled online while advanced offline) | ✅ Sent, **refused** |
| **C4** | `:433` | **Retryable failure (5xx)** that never cleared **and now older than 12h** | ✅ Sent, **not accepted** |
| **C5** | `:437` | **Terminal rejection** (400/401/403/404) after `MAX_ATTEMPTS` | ✅ Sent, **refused** |

### 🔴 THE FAULT: FIVE STATES, TWO STRINGS — AND THE SPLIT IS ON THE WRONG AXIS

**`components/native/OfflineBanner.tsx` branches on `kind` (money vs status), not on WHY it failed.**
**All five states above collapse into one of these two:**

**STRING A — payment conflicts, `:129-133`:**

```
⚠ PAYMENT NOT RECORDED
{orders} — marked as paid on this device, but the server rejected it.
Check the order and take payment again if it is still owed.
```

**STRING B — status conflicts, `:168`:**

```
⚠ {orders} — update didn't sync, needs review
```

| Problem | Which |
|---|---|
| 🔴 **"the server rejected it" is FALSE for C1, C2 and C4** | C1/C2 were never sent at all; C4 was never accepted, not refused |
| **"server", "sync" are developer words** | A |
| **"needs review" does not say what to DO** | B |
| **B does not say the change is still held on the device** | B — it reads as loss |

⚠️ **The reason IS available and unused.** `ConflictEntry` already carries `last_error`
(`lib/native/useOutboxConflicts.ts:39`). **Nothing needs new plumbing to tell these apart** — but reading
it and choosing between strings is a BRANCH, i.e. a logic change. See §3B.

---

## 2 · The online-but-queued banner

**`components/native/OfflineBanner.tsx:197-202`** — shown when the device is online and `queued > 0`:

```
{N} changes saved on this device, syncing…
```

| | |
|---|---|
| ✅ **"saved on this device" is TRUE** | `enqueue()` is awaited before the result returns (`orderGate.ts:293`), so it is durably in Preferences |
| 🔴 **"syncing…" is FALSE while the drain is backing off** | After the write-loss fix, a retryable failure **breaks** the drain and `OfflineBanner:67` waits 5/10/20/40/60s. **Nothing is in progress.** The word says "wait, it's happening"; the truth is "waiting" |
| **"sync" is a developer word** | — |

**Three neighbouring strings use the same vocabulary** and would be left inconsistent if only this one
changed: `:181` *"will sync"*, `:187` *"syncing N changes…"*, `:193` *"All changes synced."*

---

## 3 · Proposed wording

### 🔴 A first, honest constraint

**You asked for STRINGS ONLY. One string covering five states cannot be made accurate for all five by
choosing better words alone — it can only be made NOT FALSE for all five.** So there are two options and
they are not the same job:

- **OPTION A — strings only, no logic.** One wording per banner that is **true in every state**. Ships
  under this task's rules.
- **OPTION B — a small branch on `last_error`.** Wording per state. **Better for the operator, and it is
  a logic change**, so it is a separate approval.

**I recommend A now (it removes the falsehood before Friday) and B as a follow-up.**

### OPTION A — the strings-only proposal

| Where | Now | **Proposed** |
|---|---|---|
| **`:129`** payment headline | `⚠ PAYMENT NOT RECORDED` | **`⚠ PAYMENT NOT RECORDED`** — *unchanged; it is plain, and it states the consequence* |
| **`:131`** payment detail | `{orders} — marked as paid on this device, but the server rejected it.` | **`{orders} — marked paid on this tablet only. It has not gone through.`** |
| **`:133`** payment action | `Check the order and take payment again if it is still owed.` | **`Check the order and take payment again if it is still owed.`** — *unchanged; it already says what to do* |
| **`:168`** status conflict | `⚠ {orders} — update didn't sync, needs review` | **`⚠ {orders} — this change didn't go through. Check the order.`** |
| **`:201`** online-but-queued | `{N} changes saved on this device, syncing…` | **`{N} changes saved on this tablet. Still trying to send them.`** |

**Why *"didn't go through"* is the load-bearing phrase:** it is **true whether the change was never sent
(C1, C2), refused (C3, C5) or not accepted (C4)**. It makes no claim about who saw it. *"The server
rejected it"* claims all three at once and is wrong in two.

**Why "saved on this tablet" stays:** it is **true** — the record is durably stored — and dropping it
would imply loss. **Only "syncing…" is replaced**, because that was the false part.

### Optional consistency pass (same rules, adjacent strings)

| Where | Now | Proposed |
|---|---|---|
| `:181` offline | `📴 Offline — {N} changes saved on this device, will sync when you're back online. Settings are locked.` | **`📴 No connection — {N} changes saved on this tablet. They'll be sent when you're back online. Settings are locked.`** |
| `:187` draining | `Back online — syncing {N} changes…` | **`Back online — sending {N} changes…`** |
| `:193` done | `All changes synced.` | **`All changes sent.`** |

⚠️ **Not required by your two items. Offered because "sync" survives in three neighbours otherwise.**

### OPTION B — per-state wording (needs a branch; NOT proposed for this task)

| State | Wording |
|---|---|
| **C1** malformed | `⚠ {orders} — this change couldn't be read and wasn't sent. Do it again.` |
| **C2** never sent, 12h | `⚠ {orders} — this change never reached us. It's still on this tablet. Do it again.` |
| **C3** 409 | `⚠ {orders} — this order changed somewhere else, so your change wasn't applied. Check the order.` |
| **C4** not accepted, 12h | `⚠ {orders} — we couldn't get this change through. Check the order and do it again.` |
| **C5** refused | `⚠ {orders} — this change wasn't accepted. Check the order.` |

🔴 **C3 is the one the operator most needs told apart** — *someone else changed it* calls for a different
action from *do it again*, and today both read *"needs review"*.

---

## 4 · Where each string lives, and the logic guarantee

| String | File | Line |
|---|---|---|
| Payment headline / detail / action | `components/native/OfflineBanner.tsx` | `129` / `131` / `133` |
| Status conflict | `components/native/OfflineBanner.tsx` | `168` |
| Offline | `components/native/OfflineBanner.tsx` | `181` |
| Draining | `components/native/OfflineBanner.tsx` | `187` |
| Done | `components/native/OfflineBanner.tsx` | `193` |
| **Online-but-queued** | `components/native/OfflineBanner.tsx` | `201` |

> ✅ **Every proposed change in Option A is a replacement of literal JSX text inside an existing element.
> No condition, no branch, no state, no prop, no import, and no file outside `OfflineBanner.tsx`.**
> **`orderGate.ts` and `useOutboxConflicts.ts` are not touched by Option A** — the five states keep
> exactly the routing they have today.

⚠️ **Option B would change `OfflineBanner.tsx` logic** (branching on `last_error`) and would be better
served by a proper `reason` field on `ConflictEntry` rather than parsing an error string. **Not proposed
here.**

---

## 5 · KDS vs dashboard vs native shell — 🔴 every one of these is SHARED

**`<OfflineBanner>` is mounted on BOTH surfaces, with the same props and the same strings:**

- **KDS** — `app/dashboard/[token]/kds/page.tsx:1896`
- **Dashboard** — `app/dashboard/[token]/page.tsx:3302`

**And it renders on native only** — `if (!isNativeApp()) return null` (`OfflineBanner.tsx:108`). The web
equivalent is a separate component, `components/WebOfflineBanner.tsx`, which **shares none of these
strings** and is driven by its own `/api/ping` poll.

> 🔴 **A COOK AND AN OPERATOR SEE IDENTICAL WORDING TODAY, AND OPTION A KEEPS IT THAT WAY.**

**Whether they should is a real question, and I am not deciding it:** *"take payment again if it is still
owed"* is an instruction a **cook on the KDS cannot act on** — they are not at the till. **Splitting the
copy by surface would mean threading a prop into a shared component — a logic change, and a third
option.** ⚠️ **Flagged, not proposed.**

---

## What I could not establish

1. 🔴 **That any proposed string fits.** **I have not rendered them.** The status conflict line shares one
   row with a Dismiss button and `{orders}` can be *"#12, #14, #15 +2 more"* — **the proposed line is
   longer than the current one and may wrap on a narrow tablet.** Needs a look on the device.
2. **Whether "tablet" is right on every device** — the shells run on iPad and Android tablets; if any
   operator uses a phone, "this device" is the safer word.
3. **Which of C1-C5 actually occurs in practice.** If C3 dominates, Option B's value is high; if C2
   dominates, Option A is nearly as good. **Nothing measures this today** — `last_error` is stored but
   never reported off the device.
