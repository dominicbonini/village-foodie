# Task report — Fixes 1–3 implemented (admin native landing) · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only).
`docs/last-report.md` belongs to a separate workstream — not read, not written, not opened.

---

## 0. Prompt integrity — three garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item 1: *"Add `.order('created_at')` to BOTH queries in **/-trucks**"* | **`/api/native/my-trucks`** | Characters dropped mid-path; the only `my-trucks` route in the repo, and the file the whole task is about. |
| item 3: *"REQUIRED PRECEDENCE — in this **or a pinned van_devices config** for a permitted truck wins FIRST"* | *"in this **ORDER: (a)** a pinned `van_devices` config for a permitted truck wins FIRST"* | The `(a)` label and the word `ORDER:` were swallowed, leaving `or` as a fragment. The following clauses are explicitly labelled `(b)` and `(c)`, so the missing label is `(a)`, and the sentence is a precedence list. Implemented exactly as (a) → (b) → (c). |
| item 5: *"the native landing inherited the web admin bypass **bthe** web admin redirect"* | *"…the web admin bypass **but not the** web admin redirect"* | Only reading that makes the invariant true and matches the rest of the sentence ("widens access silently"). Recorded in `docs/android.md` in the repaired form. |

None of these changed the work; the precedence one is the only place a misreading would
have mattered, and it is spelled out in §3 below so you can check it.

---

## 1. Fix 1 — deterministic ordering · `app/api/native/my-trucks/route.ts`

`.order('created_at', { ascending: true })` added to **both** truck queries — same column,
same direction as the web router (`app/dashboard/page.tsx:41,63`). No new ordering invented.

**:48** — the admin id-collection query inside `resolvePermittedTrucks`:

```ts
const { data: all } = await supabaseAdmin.from('trucks').select('id').eq('active', true).order('created_at', { ascending: true })
```

**:75** — the detail query in `GET`, with an inline note that this is the load-bearing one:

```ts
// ORDER BY created_at ASC — THIS is the load-bearing one: `trucksOut` is built from THIS result, so
// its order is what the caller's trucks[0] resolves to. Matches the web router's ordering exactly.
supabaseAdmin.from('trucks').select('id, name, dashboard_token').in('id', ids).eq('active', true).order('created_at', { ascending: true }),
```

**Why both, and why the second matters most:** `trucksOut` is mapped from the *detail*
query's result, so ordering only the id query would have achieved nothing — the `Set`
insertion order never reached the response. Ordering both means the id set and the emitted
list agree, and `trucks[0]` is now a defined value.

Left deliberately unordered: the `truck_vans` query (its rows are folded into a `Map`,
order is irrelevant) and the non-admin `owned` / `memberships` queries (they only populate a
`Set` that the ordered detail query re-reads). Say the word if you want those ordered too
for uniformity — it would be harmless, just noise.

---

## 2. Fix 2 — demo trucks excluded from the ADMIN bypass only

**The helper exists**: `isDemoIdentifier` in `lib/demo.ts` — imported at **:3**. I did not
need to hand-roll a prefix check.

**:49** — the filter, inside the admin branch and nowhere else:

```ts
all?.forEach((t: { id: string }) => { if (!isDemoIdentifier(t.id)) ids.add(t.id) })
```

**Scope is exactly as instructed.** The non-admin path (`owned` at :53, `memberships` at
:56) is untouched, so **an operator who genuinely owns a demo truck through the demo-signup
claim still reaches it** — only the all-trucks admin bypass is narrowed. Recorded in the
in-code comment so a future reader does not "tidy" the filter upward into the shared path.

I also corrected the header comment at **:20** — it said *"ADMIN → all active trucks"*,
which the change makes false. It now reads *"ADMIN → all active NON-DEMO trucks"*. A comment
that contradicts its own code is the same drift class this workstream keeps finding.

### The fragility record, inline at :28-40

Written into the file, not just this report:

> ⚠️ **DEMO EXCLUSION IS PREFIX-AS-MARKER, AND THAT IS FRAGILE.** There is NO demo flag on
> `trucks` — the `demo-` prefix on id/slug/dashboard_token (`lib/demo.ts`) is the ONLY
> signal that a truck is a demo, so this filter is a string convention standing in for a
> schema fact. **PRECEDENT FOR WHY THAT ROTS:** the `hg_outbox_seq` incident
> (reference-manual §11) — a per-device COUNTER shared the op-key prefix `'hg_outbox_'`, so
> every outbox enumerator swept the counter in as a malformed op and reported "1 order
> syncing" forever, surviving reinstall. A prefix convention held for a while, then a
> neighbouring key grew into it. **THE DURABLE FIX IS A REAL COLUMN** — `trucks.is_demo
> boolean not null default false`, backfilled from the prefix and written by
> `lib/provision-truck.ts` — after which this filter becomes `.eq('is_demo', false)` and
> stops depending on how ids are spelled. Until then, do not weaken
> `assertReservedPrefix()` (provision-truck.ts), which is what keeps the prefix trustworthy
> at all.

The `hg_outbox_seq` citation is verified against the manual (lines 2392–2396, under §11 —
the fix there was to move op keys to the distinct `'hg_outbox_op_'` prefix plus an `isOpKey`
/ `isOpShape` guard, precisely because the bare prefix was not a reliable marker).

### Proposed migration — NOT written, NOT run

```sql
-- PROPOSAL ONLY. Not added to supabase/migrations/. Dominic runs SQL by hand.
alter table trucks add column if not exists is_demo boolean not null default false;
update trucks set is_demo = true where id like 'demo-%';
```
…then set `is_demo: true` in `lib/provision-truck.ts`'s demo insert, and swap the filter to
`.eq('is_demo', false)`. **No DDL and no migration file was added by me**, per instruction.

---

## 3. Fix 3 — admin branch on `/app`, with the required precedence

### 3.1 Server: `is_admin` returned (additive)

`permittedTruckIds` already had to know `is_admin` internally; it was computed and thrown
away. Rather than issue a second `operators` lookup, I split the helper:

- **:41** `resolvePermittedTrucks(userId): Promise<{ isAdmin: boolean; ids: Set<string> }>` —
  the real implementation.
- **:62** `permittedTruckIds(userId): Promise<Set<string>>` — **kept with its exact original
  signature**, now delegating: `return (await resolvePermittedTrucks(userId)).ids`.

**Why that matters:** `app/api/native/switch-truck/route.ts:8` imports `permittedTruckIds`
and uses it as its security gate at `:29`. Its import, its call, and its behaviour are
unchanged — no second query, no duplicated `is_admin` logic, one source of truth.
(switch-truck does inherit the demo exclusion for admins, which is the intended symmetry:
an admin can no longer *switch into* a demo truck either.)

Response, **:96-100**:

```ts
return NextResponse.json({ trucks: trucksOut, device, is_admin: isAdmin })
```

Additive — existing consumers read `trucks`/`device` and are unaffected. The empty-set early
return at **:73** carries the flag too, so an admin with zero non-demo trucks still gets
routed rather than falling through.

### 3.2 Client: the branch, in the required order

`app/app/page.tsx`. Type widened at **:39** (`is_admin?: boolean`), branch inserted at
**:56-65**, between the device-pin block and the truck fallback:

| Precedence | Line | Behaviour |
| --- | --- | --- |
| **(a) pinned `van_devices` config for a permitted truck** | :48-54 (**unchanged**) | Still wins first — a bound kitchen device boots to its configured screen, admin or not. |
| **(b) `is_admin`** | **:65 — new** | `return go('/admin')` |
| **(c) existing truck resolution** | :68 (unchanged) | `trucks[0]`, now deterministic |

```tsx
if (data.is_admin) return go('/admin')
```

The rationale is recorded in a comment above it, including *why* the branch is required
rather than cosmetic (the bypass grants every active truck, so without it an unpinned admin
falls through to an arbitrary truck's dashboard — in practice a demo, which has no
sign-out).

---

## 4. Constraints — each one checked

| Constraint | Status |
| --- | --- |
| No change to the web `/dashboard` router or any web-visible behaviour | ✅ `app/dashboard/page.tsx` **not opened for edit**. Files changed: `app/api/native/my-trucks/route.ts`, `app/app/page.tsx` — that is all (`git status`). |
| No change to `app/dashboard/[token]/page.tsx` (Fix 4 territory) | ✅ Untouched. Fix 4 **HELD** as instructed — the demo dashboard still has no escape at ≥640px. |
| `my-trucks` is Bearer-only and native-only — still true after the edit? | ✅ **Confirmed, unchanged.** `GET` still starts `userIdFromBearer(req)` → `401` when there is no `Bearer` header (:67-68); there is no cookie path, and I added none. Client-side, both callers are native-gated: `app/app/page.tsx` is behind `isNativeApp()` (:21) and `lib/native/trucks.ts:9-10` returns early when `getNativeAccessToken()` is null, which it always is on web (`session.ts:37`). A browser cannot reach this endpoint usefully, so the changes are native-scoped by construction. |
| No DDL / migration | ✅ None added. `trucks.is_demo` proposed only (§2). |
| Fix 4 held | ✅ Not implemented. |

**Gusto blast radius: nil.** Gusto trades on the web. Neither changed file is in a web
request path — `/app` renders only inside the Capacitor shell (web hits fall through to
`/dashboard` at :21), and `/api/native/my-trucks` is unreachable without a native Bearer.

---

## 5. Verification

`npx tsc --noEmit` → **exit 0, zero output.** Run twice (after the code edits, and again
after the header-comment correction).

That is the only check available here — gradle, builds, `cap`, dev servers, `adb` and
installs are all forbidden, so **none of this is device-verified**. Per the manual's own
rule, treat as **BUILT, LIVE-TEST PENDING**.

**Suggested live tests, in order:**

1. **Admin, fresh install, no pin** → should land on `/admin`. (The reported bug.)
2. **RTF operator, fresh install** → should still land on RTF's dashboard. (Regression
   check: the path that already worked.)
3. **Admin on a device already pinned to a truck** → should still boot to that truck's
   configured screen, *not* `/admin`. (Proves precedence (a) survived.)
4. **Admin → 📱 This device → Truck** → the switcher list should no longer contain demo
   trucks, and should be in `created_at` order.
5. **Web**: sign in as Gusto on a browser → unchanged. (Should be, by construction.)

---

## 6. `docs/android.md` — appended (541 → 627 lines, nothing overwritten)

New entry `### 2026-07-27 — Admin native launch landed on a demo dashboard: Fixes 1–3
BUILT`: symptom, the three compounding root causes, why RTF was unaffected, what was built,
the `permittedTruckIds`-signature note, the tsc result, and the prefix-as-marker record with
the proposed `trucks.is_demo` column.

Then two flagged sections:

**⚠️ NEW CROSS-CUTTING INVARIANT — candidate for manual §35** (`reference-manual.md:4327`):

> Porting a permission bypass without porting the routing branch that constrains it widens
> access silently: the native landing inherited the web admin bypass but not the web admin
> redirect.

Recorded with *why it generalises*: the V8.7 port copied the bypass into the data layer —
its own comment claims it *"Mirrors the WEB admin model EXACTLY"* — but not
`app/dashboard/page.tsx:30`, the redirect that stops an admin ever reaching truck resolution
on web. On web "all trucks" is never a landing set; on native it was both. **The audit
question is not "did we port the check?" but "did we port everything that made the check
safe?"** Noted as the same shape as the existing §35 entry *"a flag named for a behaviour is
not proof of that behaviour"* — a faithful-looking copy that omits its own precondition.

**Also for §35 — the unordered-first-row class**, logged as an instance of what **V7.8 §3**
already fixed on the web router (`.single()` → LIST + deterministic pick, "2+ → first by
`created_at`"). That session hardened the web path and left the native one — written days
earlier from the same model — with neither the ordering nor the admin branch. Stated as:

> An unordered query whose FIRST ROW is used as an answer has no answer. If code takes `[0]`
> from a query, that query needs an explicit `ORDER BY`.

with the note that the non-reproducibility is the real cost — an admin landing on a real
truck one launch and a demo the next reads as "flaky", which is how this stayed unexplained.

---

## 7. Flagged

- **Fix 4 is still open and still a trap.** With Fixes 1–3 an admin should no longer be
  *sent* to a demo dashboard, but anyone who reaches one at ≥640px still has no sign-out, no
  avatar menu and no switcher (`page.tsx:1813,1823`). Held per instruction; recommend it
  next.
- **`switch-truck` inherits the demo exclusion.** Intended (§3.1), but it is a behaviour
  change beyond the strict letter of "the admin bypass in my-trucks": an admin can no longer
  switch a device *into* a demo truck. Direct URL still works. Flagging so it is a known
  consequence, not a surprise.
- **The prefix filter is load-bearing on `assertReservedPrefix()`.** If that assertion is
  ever weakened, a real operator truck could take a `demo-` id and silently vanish from the
  admin's list — the same failure in the opposite direction. The `is_demo` column removes
  the dependency entirely.
- **`is_admin` now crosses the wire.** It is server-resolved from `operators.is_admin` and
  only ever read for routing; the client never asserts it and no authorisation decision is
  made from it. Worth knowing it exists in the payload.

---

## 8. What I could not do / did not do

- **Could not device-verify anything** — no gradle, builds, `cap`, dev servers, `adb`,
  installs. `npx tsc --noEmit` (exit 0) is the only check run. §5 lists the live tests.
- **Could not confirm which truck an admin previously landed on** — that needed the SQL from
  the last report, which you run by hand. The mechanism is fixed either way.
- **Did not implement Fix 4** — held, as instructed.
- **Did not add DDL or a migration** — `trucks.is_demo` proposed in §2 only.
- **Did not touch** `app/dashboard/page.tsx`, `app/dashboard/[token]/page.tsx`,
  `app/api/native/switch-truck/route.ts`, or `docs/reference-manual.md`.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened.
