# Demo trucks provisioned with the One-page layout

**7 September 2026 · one file changed · nothing staged, committed or pushed**

**Marking.** 🔎 source-read · 🧪 executed. **No `git add` in any form. Nothing deployed.**

**Garbled spans: none. One instruction conflicted with a convention inside the file itself — flagged in Step 3 and resolved in favour of your instruction, not silently.**

---

## 🔴 THIS CHANGE HAS NO EFFECT UNTIL IT IS DEPLOYED

`lib/provision-truck.ts` runs on Vercel. The edit is **uncommitted, unpushed, undeployed**. Until it ships, every new demo truck continues to take the column default `'tabs'`. 🔴 **Nothing about this report describes working software — it describes an edit in a working tree.** `tsc` passing is a type check, not verification of behaviour, and no demo truck has been provisioned to observe.

---

# STEP 1 — STOP CONDITIONS

🧪 `git status --porcelain -- lib/provision-truck.ts`, verbatim, **before any edit**:

```
```

**Empty — no output at all.** The long form confirmed it:

```
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

🧪 The file exists (33,983 bytes) and `git ls-files --error-unmatch` returns **TRACKED**.

🎯 **Not modified, not untracked, not staged.** A single-file commit of `lib/provision-truck.ts` would carry **only** this change and none of the six uncommitted workstreams. **Step 1 cleared.**

*Failure mode if this proved nothing:* `git status --porcelain` prints nothing both for a clean file **and for a path that does not exist or is misspelled** — the two are indistinguishable from the empty output alone. Ruled out by the two extra checks: `ls -la` found the file, and `git ls-files --error-unmatch` confirmed it is tracked. An untracked file would have printed `?? lib/provision-truck.ts`.

---

# STEP 2 — READ AND ENUMERATE

## 2a. The two profiles — and a correction to the question

🔎 Both profiles are **separate object literals** inside one `Record`, at `lib/provision-truck.ts:134`:

```ts
134: const PROVISION_PROFILES: Record<ProvisionKind, ProvisionProfile> = {
137:   operator: {
138:     identity: 'readable',
150:     plan: 'trial',
...
188:   demo: {
189:     identity: 'random',
190:     plan: 'demo',
...
```

The two lines you asked me to quote:

- **`:150` — `plan: 'trial',`** (operator profile)
- **`:189` — `plan: 'demo',`** (demo profile) *(now `:190` after the edit)*

🔴 **BUT THE PREMISE OF THE QUESTION IS HALF WRONG, AND THE HALF THAT IS WRONG DECIDES THE IMPLEMENTATION.** The *profiles* are separate objects. **The INSERT is not.** There is exactly **one** insert statement, at `:396`, shared by both kinds and parameterised throughout by `profile.X`:

```ts
336:   const profile = PROVISION_PROFILES[opts.kind]
...
395:     const { data, error } = await supabase
396:       .from('trucks')
397:       .insert({
...
450:         truck_order_email_enabled: profile.truckOrderEmailEnabled,
451:         auto_accept: profile.autoAccept,
455:         preorders_enabled: profile.preordersEnabled,
459:         notes_require_review: profile.notesRequireReview,
465:         completion_presses: profile.completionPresses,
```

**So it is "one shared insert with per-profile values", not "two objects each with their own insert".** A demo-only column cannot be written by editing a demo-only insert, because no such statement exists — it has to be a profile field the shared insert reads. That is exactly the pattern the file already uses for `preordersEnabled`, `notesRequireReview`, `showPaidStep`, `takesCash` and `completionPresses`.

## 2b. Is `add_order_layout` currently written by either profile?

🧪 **No — the string does not appear in `lib/provision-truck.ts` at all**, in either spelling, before this change. Grep over the file returned nothing.

🎯 **So today both operator and demo trucks inherit the column default.** 🔎 `supabase/migrations/20260814_trucks_add_order_layout.sql:39` — `ADD COLUMN IF NOT EXISTS add_order_layout text NOT NULL DEFAULT 'tabs'`. Every truck ever provisioned has been `'tabs'` unless a human changed it in Settings.

## 2c. Every site that inserts into `trucks`

🧪 Searched with **no `--include` filter**, across every extension in the tree — 🔎 the extensions actually present are: `avif cjs css csv gitignore html ico iml jpeg jpg js json local log md mjs png sql svg toml ts tsbuildinfo tsx txt webp xml yml`. Four independent patterns:

| Pattern | Result |
|---|---|
| `.from('trucks')` anywhere | **113 call sites** across `app/`, `lib/`, `scripts/`, `supabase/` |
| Of those, followed within 3 lines by `.insert(` or `.upsert(` | 🎯 **exactly one file: `lib/provision-truck.ts` — 1 occurrence** |
| Raw SQL `INSERT INTO trucks` (incl. `.sql` migrations) | **zero in code**; two matches, both in `docs/*.md` quoting earlier greps |
| `rpc('…truck…')` — an insert hidden behind a database function | **zero** |

🎯 **`lib/provision-truck.ts:396` is the repository's only insert into `trucks`.** Every other one of the 113 sites is a `select`, `update` or `delete`.

**Can a demo truck be produced anywhere else?** 🧪 **No.** One call site passes `kind: 'demo'`:

| Caller | kind | Demo truck? |
|---|---|---|
| `lib/provision-demo.ts:113` | 🎯 **`'demo'`** | ✅ the only one |
| `app/api/setup/route.ts:87` | `'operator'` | no |
| `app/api/admin/create-truck/route.ts:100` | caller-supplied `ProvisionTruckOptions` | ⚠️ see below |

⚠️ **One honest caveat on the admin route.** `/api/admin/create-truck` passes options through, so an admin could in principle request `kind: 'demo'`. It is behind `verifyAdmin`, and 🔎 `assertReservedPrefix` (`:313`) enforces the `demo-` prefix rule either way — so it cannot produce a mislabelled truck. It routes to the **same** profile, so this change applies there too, consistently. **There is no second creation path to leave inconsistent, so Step 2c cleared rather than stopped.**

⚠️ **The manual says `lib/provision-truck.ts:390`; the `.from('trucks')` is at `:396`.** Six lines of drift from edits since. The claim is correct; the line number is stale.

## 2d. Spelling counts across the whole repository

🧪 Case-sensitive, fixed-string, all extensions, `node_modules`/`.next`/`.git`/`ios`/`android` excluded:

| Spelling | Occurrences |
|---|---|
| `add_order_layout` | **83** |
| `addOrderLayout` | **18** |
| `AddOrderLayout` | **9** — all inside camelCase identifiers: `saveAddOrderLayout` ×3, `savingAddOrderLayout` ×3, `setSavingAddOrderLayout` ×3 |
| `order_layout` | 83 — the same 83, matched as a substring |
| `add-order-layout` | 1 — a documentation filename |
| `addorderlayout` (all-lower) | **0** |
| `orderLayout` (bare camel) | **0** |

*Failure mode if this proved nothing:* 🔴 **a grep returning zero because the string is spelled differently is indistinguishable from a grep proving absence** — this is the exact trap that hid a `.js` file for a round. Ruled out three ways: I enumerated the tree's real extensions and used no `--include`; I searched **six** spellings including two that returned zero, so a zero here is a measured zero rather than an unasked question; and the two non-zero variants were expanded to show what they actually are, rather than left as a count.

**Where the column is read and written today** (unchanged by this work): read at `components/dashboard/AddOrderPanel.tsx:2121`, written by exactly one action — `set_add_order_layout` at `app/api/dashboard/action/route.ts:2470-2475`. 🔎 That handler whitelists rather than coerces, which is why a typo would persist verbatim.

---

# STEP 3 — THE CHANGE

**Diff — 31 lines added, 0 removed, one file:**

```diff
@@ interface ProvisionProfile @@
   completionPresses: 'one' | 'two'
+  /** `trucks.add_order_layout`: … (full comment in the file) */
+  addOrderLayout?: 'tabs' | 'scroll'
 }

@@ PROVISION_PROFILES.demo @@
   demo: {
     identity: 'random',
     plan: 'demo',
+    // A demo menu is short and the whole story is one uninterrupted walk-up order …
+    addOrderLayout: 'scroll',
     nameRequired: false,

@@ the shared insert @@
         completion_presses: profile.completionPresses,
+        ...(profile.addOrderLayout ? { add_order_layout: profile.addOrderLayout } : {}),
         default_auto_open: true,
```

🧪 `git diff --stat` → `1 file changed, 31 insertions(+)`. 🧪 **Removed lines: 0.** The operator profile is byte-identical.

**What each part does:**

| | |
|---|---|
| **Optional field on the type** | so the operator profile need not declare anything |
| **`addOrderLayout: 'scroll'` on `demo` only** | the policy lives with the profile, as every other policy in this file does |
| **Conditional spread in the shared insert** | when a profile declares nothing, **the key is not written at all** and the column's own default stands |

🎯 **Existing trucks: untouched** — this is an `insert` payload, reached only when a row is created. 🎯 **New operator trucks: untouched** — their profile declares nothing, so no key is written and the DB default applies exactly as before. 🎯 **The column default: not altered.** 🎯 **No migration written.**

## 🔴 THE CONFLICT I HIT, AND WHY I DID NOT STOP

Your instruction: *"in the DEMO profile ONLY … Do not touch the operator profile."*
🔎 This file's own documented convention, at `:87-99` and repeated five times: every profile field is **required** on the type *"so a fixed POLICY cannot be forgotten by a new profile"* — *"a new profile must state its answer rather than inherit a silence."*

**A required field would force the operator profile to declare a value. That is touching it.** The two cannot both hold.

**I followed your instruction and made the field optional**, because it was explicit and unambiguous, and because the conflict is instruction-versus-house-style rather than instruction-versus-instruction — which is what your stop rule is for. 🔴 **The cost is real and is written into the file rather than left in this report: a future third profile that omits this field will silently inherit `'tabs'`, which is precisely what the convention exists to prevent.** If you would rather have the convention, the change is to make the field required and add `addOrderLayout: 'tabs'` to the operator profile — one line, no behaviour change, but it touches the operator profile.

---

# STEP 4 — PROOF

| Claim | Evidence | 🔴 What it would look like proving nothing | How ruled out |
|---|---|---|---|
| `provision-truck.ts` was clean before editing | 🧪 empty `--porcelain` | Empty output also means *path not found* | `ls -la` found it; `git ls-files --error-unmatch` said TRACKED |
| One insert into `trucks` | 🧪 4 patterns, all extensions | A `.ts`-scoped grep would miss a `.js` writer — this has happened here | No `--include`; extensions enumerated first; raw-SQL and `rpc()` searched separately |
| `add_order_layout` absent from the file | 🧪 grep returns nothing | Absence could be a spelling miss | Six spellings searched repo-wide; two returned 0, four returned counts |
| Only the demo profile declares it | 🧪 6 matches in the file, one is the assignment at `:213` | A second assignment elsewhere would not show in a diff I chose to read | Grepped the whole file after editing, not just the diff |
| Operator profile untouched | 🧪 `git diff` shows **0 removed lines** | A same-line edit shows as −1/+1 and could be missed by eye | Counted removals mechanically: `grep -c '^-[^-]'` → 0 |
| The union type prevents a typo | 🧪 **negative control** | ✅ passing proves nothing about a value the type should reject | Temporarily wrote `'scrol'` → 🎯 **`tsc` exited 2** with `TS2820: Type '"scrol"' is not assignable to type '"tabs" \| "scroll" \| undefined'`. Restored; `tsc` back to exit 0 |

🧪 **`npx tsc --noEmit` → exit 0** on the final state.

🔴 **`tsc` clean is not verification.** It proves the shapes agree. It does not prove a demo truck is created, that the column receives `'scroll'`, or that the Add Order screen renders One page. **None of that has been observed, because provisioning a demo truck is a write and none was made.** The first real evidence will be a demo truck created **after deployment**, checked with:

```sql
SELECT id, plan, add_order_layout FROM trucks WHERE id LIKE 'demo-%' ORDER BY created_at DESC LIMIT 5;
```

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged. Nothing committed, pushed or deployed. No `git add` was run in any form.**

🧪 `git status --porcelain -- lib/provision-truck.ts` → `M lib/provision-truck.ts` — the only file I touched, plus this report. The tree moved from 26 to **27 modified** solely because of that one file; the six uncommitted workstreams are untouched.

---

# WHAT I COULD NOT VERIFY

- 🔴 **That this works.** No demo truck was provisioned; no row was written; nothing was deployed. Everything above is a read of code and a type check.
- 🔴 **That the live column really is `NOT NULL DEFAULT 'tabs'`.** Taken from the migration file and the manual, **not** from the live database — I ran no query. If the column were altered by hand, an operator truck writing nothing would inherit whatever is actually there.
- ⚠️ **Whether `'scroll'` is the right choice for a demo.** That is a product judgement I have implemented, not verified. A demo with a long menu may read worse as one page.
- ⚠️ **Whether any third profile is planned.** The optionality is only a hazard if one is added; I could not know.
- ⚠️ **The 113 `.from('trucks')` sites were classified by a 3-line context scan.** An insert split unusually far from its `.from(` would evade it — I did not read all 113 by hand.
