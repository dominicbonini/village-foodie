# Hiding the van name on a one-van truck — one additive field, both surfaces

**Files changed — THREE:**

| File | What |
|---|---|
| 🔴 `app/api/dashboard/route.ts` | **GUSTO'S LIVE PATH** — one added field, `activeVanCount` |
| `app/dashboard/[token]/kds/page.tsx` | reads it; the header's van span is gated on it |
| 🔴 `app/dashboard/[token]/page.tsx` | **GUSTO'S LIVE PATH** — reads it; the header string and the capacity chip are gated on it |
| `docs/van-name-hide-report.md` | this file |

**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**
⚠️ **`app/api` was edited under the explicit one-off permission in this brief, for this one additive
field, and for nothing else.**

---

# FIX 1 — THE FIELD

## 1.1 The name

🔴 **`activeVanCount`.** It follows `activeVanName`, which sits three lines from it in the same response
— same prefix, same meaning of "active", and the pair reads as what it is. ⚠️ **The alternatives were
rejected on precedent:** `vanCount` would have joined the `vanShowCookingStep` / `vanBuzzerCount` /
`vanPausedUntil` family, and **every one of those is about the SELECTED EVENT'S van**, which this is not.

## 1.2 The query

```ts
    const { count: vanCount, error: vanCountErr } = await supabase
      .from('truck_vans')
      .select('id', { count: 'exact', head: true })
      .eq('truck_id', truck.id)
      .eq('active', true)
    if (vanCountErr) console.error(`[dashboard] active van count failed for truck ${truck.id}:`, vanCountErr.message)
    else activeVanCount = vanCount ?? null
```

✅ **IT COUNTS THE TRUCK'S VANS, NOT THE EVENT'S** — `.eq('truck_id', truck.id)` and **no event term at
all**. The van block below it is the one scoped to `capacityEvent.van_id`; this one deliberately is not.

🔴 **`active = true` IS THE DEFINITION, COPIED FROM `get_vans`** (`app/api/manage/route.ts:964`), so the
count this response carries and the list the dashboard already holds apply the same rule and cannot
disagree.

⚠️ **YES, IT IS AN EXTRA ROUND TRIP, AND HERE IS THE COST.** It runs on every call of this endpoint —
both surfaces, roughly every 15 seconds. **`head: true` with `count: 'exact'` returns NO ROWS**: the
count comes back in the `Content-Range` header, so this is an index count over one truck's rows, not a
fetch. It is the cheapest shape PostgREST offers and it is one statement on an indexed `truck_id`.
**If that is still too much per poll, the alternative is folding it into an existing query, which would
not be additive — so it was not done.**

🔴 **A FAILURE LEAVES IT `null`, AND `null` MEANS "NOT KNOWN", NEVER "ZERO".** Every client treats null
as *show the van*, so a failed count renders exactly what today renders.

## 1.3 🔴 THE RESPONSE, BEFORE AND AFTER — ONE LINE ADDED, NOTHING ELSE TOUCHED

```ts
    activeVanName,                                  // BEFORE
    vanAutoPause,
```
```ts
    activeVanName,                                  // AFTER
    activeVanCount,                                // the TRUCK's active van count (null ⇒ unknown ⇒ clients show the van)
    vanAutoPause,
```

✅ **EXECUTED — the whole diff of that file, comments stripped, is NINE ADDED LINES AND ZERO REMOVED:**

```
+  let activeVanCount: number | null = null
+    const { count: vanCount, error: vanCountErr } = await supabase
+      .from('truck_vans')
+      .select('id', { count: 'exact', head: true })
+      .eq('truck_id', truck.id)
+      .eq('active', true)
+    if (vanCountErr) console.error(...)
+    else activeVanCount = vanCount ?? null
+    activeVanCount,
```

🔴 **NO EXISTING FIELD WAS RENAMED, REMOVED, RESHAPED OR REORDERED. No existing query's filters, joins,
selects or row shape changed.** The new count query is a separate statement that touches nothing else.

## 1.4 A client that ignores the field is unaffected — checked

| Consumer of `/api/dashboard` | How it reads the body | Affected? |
|---|---|---|
| `app/dashboard/[token]/page.tsx` | `await res.json()` → `any`, field-by-field | ✅ no |
| `app/dashboard/[token]/kds/page.tsx` | `await res.json()` → `any`, field-by-field | ✅ no |
| `components/dashboard/types.ts` | ⚠️ **types ROWS, not the envelope** — `Order`, `TruckEvent`, `SoundConfig`. There is no `DashboardResponse` interface anywhere | ✅ no |
| `lib/printing/mapOrderToTicket.ts`, `DemoGetStarted.tsx`, `DemoWelcome.tsx` | consume `orders` / `payments` / demo fields | ✅ no |

✅ **EXECUTED — there is no zod schema, no `JSON.parse` validator and no exhaustive destructure of that
response anywhere in the repo.** An unknown extra key is inert: excess-property checking only applies to
object literals assigned to a typed variable, and nothing types this envelope.

---

# FIX 2 — THE KDS

```tsx
            {vanName && activeVanCount !== 1 ? <span className="truncate shrink min-w-0">{`\u00A0— ${vanName}`}</span> : null}
```

🔴 **THE SPAN THAT DISAPPEARS IS THE WHOLE `{vanName ? … : null}` TERNARY ARM — AND THE `\u00A0` IS
INSIDE IT.** That is exactly why the fix survives: the no-break space is not stripped out of a
surviving element, it leaves WITH the element it belongs to. **There is no state in which a dash renders
without its span, or a span renders without its NBSP.**

✅ **The multi-van case is byte-identical to yesterday:** `\u00A0— Van 1` — no-break space, em dash,
normal space, name. **A space either side of the dash, and the NBSP is what keeps the leading one alive
across the flex-item boundary that ate it before** (`Test Kitchen— Van1`).

⚠️ **`!== 1`, NOT `> 1`.** `null` (unknown) and `0` (no active vans, but a stale URL still carrying a
`van_name`) both fall through to **showing** the name. **The rule only ever hides on a positive,
known 1.**

**The count reaches this surface on both fetch paths** — the poll/refetch at `:551` and the
PIN-submit path at `:1300` — as `setActiveVanCount(data.activeVanCount ?? null)`.

---

# FIX 3 — THE DASHBOARD

```tsx
        truckName={isDemo ? null : (truck?.name ? ((vanName && activeVanCount!==1) ? `${truck.name} — ${vanName}` : truck.name) : null)}
```

🔴 **IT READS THE NEW FIELD, NOT `vans.length`.** The `vans` list from `/api/manage` is still there and
still does **its own job — deciding which van to open the KDS for** (`:1311`: no vans → open with none,
one van → open with it, several → ask). **That is a different question from what the header says, it was
left exactly alone, and using it for the header would have given one fact two sources on two
endpoints.**

**Set at `:940`, beside the sibling it belongs with:**

```tsx
      if(data.activeVanName !== undefined) setActiveVanName(data.activeVanName)
      if(data.activeVanCount !== undefined) setActiveVanCount(data.activeVanCount)
```

## 🔴 GUSTO'S HEADER — BEFORE AND AFTER

| Case | Before | After |
|---|---|---|
| Dashboard opened normally (**no `van_name` in the URL**) | `Pizzeria Gusto` | 🔴 **`Pizzeria Gusto` — IDENTICAL. Nothing changes** |
| Opened from a KDS-style link **with** `van_name`, truck has **1** active van | `Pizzeria Gusto — Van 1` | 🔴 **`Pizzeria Gusto`** |
| …same link, truck has **2+** active vans | `Pizzeria Gusto — Van 1` | ✅ **unchanged** |
| …count not yet arrived (first paint) | `Pizzeria Gusto — Van 1` | ✅ **unchanged — the van shows until the first response** |
| Demo | `null` (no name) | ✅ **unchanged — `isDemo` still short-circuits first** |

⚠️ **`van_name` IS WRITTEN BY THE KDS LINK BUILDER (`:1278`), NOT BY THE DASHBOARD'S OWN NAVIGATION**, so
in the overwhelmingly common case Gusto's dashboard header does not carry a van name today and this
change is invisible to them.

🔴 **THEIR ACTIVE VAN COUNT CANNOT BE CONFIRMED FROM THE CODE, AND I DID NOT GUESS IT.** It lives in
`truck_vans` and reading it is a query — **you run those.** The check, if you want it:
`select count(*) from truck_vans where truck_id = … and active = true;` **Whatever it returns, the two
rows above cover both outcomes, and the no-`van_name` row covers their normal path either way.**

---

# EVERY SITE FROM Q4 — WHAT WAS COVERED, AND WHAT WAS DELIBERATELY NOT

| # | Site | Covered? |
|---|---|---|
| 1 | KDS header, `kds/page.tsx:1790` | ✅ **yes** |
| 2 | Dashboard header, `page.tsx:2851` | ✅ **yes** |
| 3 | 🔴 **`AppHeader:119` `alt={truckName}`** | ✅ **YES, AND WITH NO SECOND EDIT — it is the SAME `truckName` prop the `<p>` at `:126` renders, so gating the string at the call site covers the visible copy and the accessible name together.** `components/shared/AppHeader.tsx` was not modified and did not need to be |
| 4 | Capacity card chip, `page.tsx:4158` — `🚐 {activeVanName}` | ✅ **yes — `&&activeVanCount!==1` added.** On a one-van truck it was naming the only van there is |
| 5 | `ThisDeviceSettings` — *"You're viewing: truck — van"* | 🔴 **NO, DELIBERATELY.** It tells an operator which van THIS DEVICE is bound to — the one place the name is the entire point, and it is how you check a mis-binding. Hiding it would break the control, not tidy it |
| 6 | KDS screen-off warning — the auto-pause van list | 🔴 **NO** — it names which vans will auto-pause; with one van that IS the sentence |
| 7 | Manage → Team `van_names` | 🔴 **NO** — a permissions list, not a header |
| 8 | The two URL builders | 🔴 **NO** — they write the parameter; the rule is applied where it is READ, so every entry path (QR, bookmark, native cold launch, typed URL) gets the same answer. That was the whole reason the URL idea was rejected |

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0.** **`npx eslint` per file: route 17 errors / 0 warnings, KDS 18/3 (=21),
dashboard 82/26 (=108) — the KDS and dashboard figures are IDENTICAL to every task this session, and
✅ EXECUTED: all 17 on the route are `@typescript-eslint/no-explicit-any` on pre-existing lines, and
`git diff | grep -c "^+.*as any"` on that file returns 0 — this task introduced none of them.**

| Required claim | Method |
|---|---|
| The response gained exactly one field, nothing else changed shape | ✅ **EXECUTED** — the comment-stripped diff is 9 added lines, 0 removed; the only line inside the response literal is `activeVanCount,`, inserted after `activeVanName` |
| The count is active-only and the truck's | ✅ **EXECUTED (source)** — `.eq('truck_id', truck.id).eq('active', true)`, no event term, matching `get_vans` |
| A one-van truck shows no van name on either surface | ✅ **SOURCE READ** — both gates are `activeVanCount !== 1` over the same field. 🔴 **NOT rendered and NOT exercised against a real one-van truck** — no browser, no device, and I ran no SQL to find one |
| A multi-van truck unchanged, separator and spacing included | ✅ **SOURCE READ** — the KDS arm is the untouched `\u00A0— ${vanName}` span; the dashboard string is the untouched template. **Neither was edited, only gated** |
| Every Q4 site covered, including the `alt` | ✅ **EXECUTED (source)** — table above; sites 1–4 gated, 5–8 exempt with reasons |
| What renders while the count is unknown | ✅ **SOURCE READ** — both surfaces initialise the state to `null` and both gates are `!== 1`, so **the van shows until the first response lands.** Removing once, not adding once |
| Gusto's header before and after | ✅ **SOURCE READ** — the table above. ⚠️ **Their van count is unconfirmed; both branches are stated** |
| No other consumer affected | ✅ **EXECUTED** — the four other consumers all read fields by name off an `any`; **no zod schema, no envelope interface, no exhaustive destructure exists in the repo** |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED OR CALLED.** No `next dev`, no `next build`, no request to the endpoint, no
  device. **The count query's behaviour against the real table is unverified** — including whether the
  service-role client's `head: true` count returns what PostgREST is expected to return here.
- ⚠️ **REACTIVATION LANDS ON THE NEXT POLL, NOT INSTANTLY.** `truck_vans` is deliberately outside the
  realtime publication (see the dashboard page's 30-line note at `:1120`, which explains that publishing
  it would fan every 15-second heartbeat UPDATE out to every connected dashboard). **A reactivated
  second van brings the name back within one poll cycle. That was accepted rather than engineered
  around.**
- ⚠️ **One extra round trip per poll, per surface** — §1.2.

---

# INTEGRITY

⚠️ **"BEFORE" FOR THE TWO PAGE FILES IS THE FIGURE THE PREVIOUS REPORTS RECORDED**; the tree was already
dirty and `checkout` is forbidden. **The class census is also checked against `HEAD`, which is stricter.**

```
app/api/dashboard/route.ts          HEAD 49,584 → 52,065 bytes · 808 lines · 9 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   🔴 U+00A0 literal no-break space: 0   ·   🔴 U+2014 em dash: 102
   classes added vs HEAD: NONE · removed: NONE   ·   U+26A0 20, all 20 paired, 0 bare

app/dashboard/[token]/kds/page.tsx  BEFORE 226,010 → 227,467 bytes · 3,045 lines · 33 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   🔴 U+00A0 literal no-break space: 0 — the fix is the ASCII escape, whose occurrences went 3 → 5
      (the two new ones are in the comment explaining the gate)
   🔴 U+2014 em dash: 415
   classes added vs HEAD: NONE · removed: NONE   ·   U+26A0 139, all 139 paired, 0 bare

app/dashboard/[token]/page.tsx      BEFORE 390,931 → 392,305 bytes · 5,043 lines · 53 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   🔴 U+00A0 literal no-break space: 0 — and it must stay 0: that header is ONE text node, where a
      plain space renders normally. The KDS's fix must not be copied here
   🔴 U+2014 em dash: 512  (511 before + the one in `${truck.name} — ${vanName}`, which is unchanged
      and simply now sits inside a longer conditional)
   classes added vs HEAD: NONE · removed: NONE   ·   U+26A0 84, 82 paired, ⚠️ 2 bare — both PRE-EXISTING
      and neither in this task's diff
```

✅ **No file gained or lost a non-ASCII class, and no literal no-break space exists in any of the three.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/van-name-hide-report.md   bytes 17,836
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
U+00A0 literal no-break space: 0   (every mention is written as the ASCII escape)
U+2014 em dash: 70
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 35 | 0 | 35 |
| U+26A0 (warning sign — TEXT presentation) | 13 | 13 | 0 |
| U+2705 (check mark button) | 28 | 0 | 28 |
| U+1F690 (minibus) | 1 | 0 | 1 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/api/dashboard/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M components/shared/EventActionsModal.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/ExtraWaitModal.tsx
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-phone-controls-final-report.md
?? docs/kds-phone-expand-final-report.md
?? docs/kds-phone-expand-report.md
?? docs/kds-phone-width-fix-report.md
?? docs/kds-screen-on-header-report.md
?? docs/kds-sound-chips-report.md
?? docs/kds-view-panel-report.md
?? docs/landing-features-move-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/screen-sound-fix-report.md
?? docs/splice-verification-report.md
?? docs/van-name-hide-report.md
?? docs/van-name-visibility-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M app/api/dashboard/route.ts` | 🔴 **THIS TASK — it was CLEAN at HEAD before this task.** The only API file touched, one additive field |
| 🔴 `M app/dashboard/[token]/kds/page.tsx` | ⚠️ already `M`; 🔴 **THIS TASK wrote to it** |
| 🔴 `M app/dashboard/[token]/page.tsx` | ⚠️ already `M`; 🔴 **THIS TASK wrote to it — first time in six tasks** |
| 🔴 `?? docs/van-name-hide-report.md` | 🔴 **THIS TASK** — this file |
| `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, every `?? docs/kds-*.md`, `?? docs/van-name-visibility-report.md` | ✅ pre-existing — earlier tasks this session |
| `M app/landing/*`, `M lib/plan-features.ts`, `?? docs/landing-features-move-report.md` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
