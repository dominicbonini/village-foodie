# Admin Trucks table — layout and "missing" row actions

Date: 13 August 2026
Status: DIAGNOSED, then FIXED. **One file changed: `app/admin/page.tsx`** — column widths and one
`whitespace-nowrap`. `tsc --noEmit` clean. No non-ASCII character class gained.

No `next dev`, no `next build`, no commit, no deploy, no migration. **`/api/admin`'s select was NOT
touched** — it is not the cause (section 1a(v)). Pizzeria Gusto's row logic is byte-identical.

⚠️ `git status` also lists `lib/provision-truck.ts` — that is the **previous** task's uncommitted
`truck_emoji` change, not part of this one.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## PART 1 — DIAGNOSIS

### a. Each candidate, checked in the order you gave

#### (i) Horizontal overflow — 🔴 **YES, A REAL CAUSE**

The table is `table-fixed` with an explicit `<colgroup>`. Summing the declared widths:

```
Name 11 · Active 5 · Plan 6 · VF-Map 5 · VF-Ord 5 · HG-Map 5 · HG-Ord 5 · Exclude 5 · Dashboard 6 · Manage 6 · Actions 5
= 64rem = 1024px
```

The container, `app/admin/page.tsx:745`:

```tsx
<div className={"w-full min-[1400px]:max-w-6xl min-[1400px]:mx-auto px-4 py-6"}>
```

so the content box is **`min(viewport − 32px, 1152px)`** — the `max-w-6xl` cap applies only from 1400px.
And the table's wrapper, `:903`:

```tsx
<div className="border border-slate-200 rounded-xl overflow-auto max-h-[70vh]">
```

| Viewport | Content box | 1024px table | Result |
|---|---|---|---|
| 1024px | 992px | 1024px | 🔴 **overflows by 32px** — Manage/Actions behind a sideways scroll |
| 1280px | 1248px | 1024px | fits |
| 1440px | 1152px (capped) | 1024px | fits |

**So on a 1024-wide laptop the three rightmost columns were only reachable by scrolling horizontally**,
which reads exactly as "the buttons are missing" — there is no scrollbar hint until you try.

#### (ii) Conditional on `operator_id` — 🔴 **YES, AND IT IS THE CAUSE FOR `tikka-tonic` SPECIFICALLY**

`app/admin/page.tsx:958`:

```tsx
const opNav = isOp && r.op.operator_id && r.op.dashboard_token
```

used at `:1023` and `:1027`:

```tsx
{opNav ? linkBtn(`/dashboard/${r.op.dashboard_token}`, '🖥') : na}
{opNav ? linkBtn(`/manage/${r.op.dashboard_token}`, '⚙️') : na}
```

🔴 **`tikka-tonic` has `operator_id: NULL`** (your context, and expected — promote creates a truck, not an
operator). So `opNav` is falsy and **Dashboard and Manage genuinely render `—`.** Not clipped. Absent by
design.

⚠️ **Edit is NOT gated on it.** `:1036-1040` is `isOp ? <button …>Edit</button> : <Create account>` — no
`operator_id` test. **So if Edit also looked missing, that was (i), not (ii).**

#### (iii) Conditional on `excluded` — **NO**

`excluded` is passed only as the `dim` argument to the `box()` helper (`:966`, `:1005`, `:1013`, `:1021`),
which greys and disables the **VF/HG tickboxes**. It touches no button. `tikka-tonic` is
`excluded: true`, so its four site tickboxes are correctly dimmed — and its **Exclude?** box stays
clickable (`dim = false`, `:1021`).

#### (iv) Conditional on `plan` — **NO**

`plan` drives only the badge at `:998` (`PLAN_BADGE[r.op.plan]`) and the `planFilter` at `:655`. No
control depends on it.

#### (v) `dashboard_token` in the GET select — **NO, IT IS PRESENT AND REACHES THE CLIENT**

`app/api/admin/route.ts:54` selects
`id,name,slug,dashboard_token,plan,trial_expires_at,feature_overrides,active,auto_accept,contact_email,onboarded_at,operator_id,…`
and `AdminTruck` declares `dashboard_token: string | null` (`app/admin/page.tsx:22`).

✅ **The API is not at fault, so I did not touch it** — no permission needed.

### b. The actual cause — 🔴 **TWO, AND THEY ARE DIFFERENT PER CONTROL**

| Symptom | Cause |
|---|---|
| **Edit missing on operator rows** (and Dashboard/Manage on trucks that *do* have an operator, e.g. Gusto) | **(i) overflow** — the cells exist and render; they are off-screen at ≤~1056px |
| **Dashboard/Manage showing `—` on `tikka-tonic`** | **(ii) `operator_id` is NULL** — `opNav` is falsy. This is the code working as written |

**They are independent.** Fixing the layout restores Edit everywhere and Dashboard/Manage on every truck
that has an operator. **It will not put Dashboard/Manage on `tikka-tonic`** — see section 3.

### c. Did the Create account button cause or worsen it? — **PARTLY YES, AND THE WRAP IS MINE**

**The wrap: yes, entirely my doing.** The Actions column was `5rem` (80px), sized for "Edit" (~44px at
`text-xs` with `px-2.5`). I put "Create account" (~110px) in it with no `whitespace-nowrap`, in a
`table-fixed` cell that cannot widen. **It had no choice but to wrap onto two lines.**

**The horizontal overflow: no, I did not worsen it.** Under `table-fixed` the colgroup fixes the table's
width, so an over-wide cell **wraps inside its column** rather than pushing the table wider. The 1024px
total was the same before my change. **The overflow predates it** — my change made a pre-existing
squeeze *visible* by putting a wide control in the narrowest column.

⚠️ Stated plainly because it matters: **the wrapping is a regression I introduced; the clipping is not.**

---

## PART 2 — THE FIX

### What changed — widths and one class, nothing else

`grep` over the diff for `opNav`, `openEditModal`, `updateTruck`, `updateDiscovery`, `openPromote`,
`linkBtn` returns **nothing**. **No control logic was touched.**

**(a) The colgroup, retuned** — `app/admin/page.tsx:905-931`:

| Column | Before | After | Why |
|---|---|---|---|
| Name | 11rem | **11rem** | unchanged |
| Active | 5rem | **4rem** | a 16px checkbox |
| Plan | 6rem | **5.5rem** | badge only |
| VF Map / Ordering | 5rem each | **4rem each** | checkboxes |
| HG Map / Ordering | 5rem each | **4rem each** | checkboxes |
| Exclude? | 5rem | **4rem** | checkbox |
| Dashboard | 6rem | **5rem** | one 🖥 button |
| Manage | 6rem | **5rem** | one ⚙️ button |
| 🔴 **Actions** | 5rem | **7.5rem** | now carries "Create account" |
| **TOTAL** | **64rem / 1024px** | **58rem / 928px** | |

**928px clears a 1024px viewport's 992px content box with 64px to spare.**

⚠️ **`table-fixed` scales these proportionally when the container is wider**, so a large monitor still
fills the width — the change tightens the *minimum*, not the appearance at 1440px.

**(b) The button can no longer wrap** — `whitespace-nowrap` added to its className. The 7.5rem column is
the actual fix; this is belt-and-braces so a future label change fails visibly rather than silently
wrapping.

### Against your three constraints

| Constraint | Held? |
|---|---|
| (a) actions reachable without horizontal scrolling at normal desktop width; Create account on one line | ✅ 928px total; 7.5rem column + `whitespace-nowrap` |
| (b) do not change what any control DOES | ✅ zero changes to any handler, href or condition |
| (c) do not change columns, order, or other row kinds | ✅ eleven `<col>`s, same eleven, same order; no `<td>` added, removed or moved |

⚠️ **Rows may be taller** — you allowed it, and two header labels ("Dashboard", "Ordering") are now
closer to their column width, so they may wrap to two lines in the sticky header. **INFERRED**: I cannot
measure rendered text.

---

## 3. 🔴 THE ONE I DID NOT FIX, AND WHY — `tikka-tonic` WILL STILL SHOW `—`

The layout fix does **not** give `tikka-tonic` its Dashboard and Manage links, because `opNav` requires
`operator_id`.

**I did not change it, deliberately.** Removing that condition would be a one-line edit:

```tsx
-  const opNav = isOp && r.op.operator_id && r.op.dashboard_token
+  const opNav = isOp && r.op.dashboard_token
```

and it is arguably correct — **both destinations authenticate by token, not by operator**
(`/manage/[token]` and `/dashboard/[token]`; see `docs/tikka-tonic-account-report-2.md` §2), so the links
would work for a truck that has a token and no operator.

**But it is a product decision, not a layout fix**, and it has a side effect you should weigh: the
five `demo-*` trucks also carry `operator_id: NULL`, so they would gain 🖥/⚙️ links too. Your brief says
*"Do not change what any control DOES, only whether and how it renders"* — this changes *whether*, which
is in scope, but it changes it for a row kind you did not ask about.

**Say the word and I will apply it.** Until then the behaviour is unchanged and correct per the existing
rule.

---

## 4. VERIFICATION

### Checked and passing

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| Non-ASCII census, `app/admin/page.tsx` | ✅ **26 classes before, 26 after, none gained** |
| Only width/class lines changed | ✅ diff contains no control identifier |
| Column count and order | ✅ eleven `<col>`s, unchanged order |
| Width arithmetic | ✅ 64rem → 58rem, computed not estimated |

### The three control sets, traced through the render

**Operator row WITH an operator** — e.g. **Pizzeria Gusto** (`operator_id` set, `active: true`,
`excluded: false`, token set):

| Cell | Renders |
|---|---|
| Active | ✅ green checkbox, with the take-offline confirm (`:1002`) |
| Plan | ✅ plan badge |
| VF/HG Map + Ordering ×4 | ✅ tickboxes, enabled (`dim = excluded = false`) |
| Exclude? | ✅ tickbox |
| Dashboard / Manage | ✅ 🖥 / ⚙️ — `opNav` true |
| Actions | ✅ **Edit** |

🔴 **Byte-identical logic to before; only the column widths differ.** Nothing about Gusto's row changed.

**Operator row WITHOUT an operator** — `tikka-tonic` (`operator_id: NULL`, `excluded: true`):

| Cell | Renders |
|---|---|
| Active | ✅ checkbox |
| VF/HG ×4 | ✅ tickboxes, **dimmed** (`excluded: true`) — correct, pre-existing |
| Exclude? | ✅ tickbox, **enabled** |
| Dashboard / Manage | 🔴 **`—`** — section 3 |
| Actions | ✅ **Edit** — now visible without scrolling |

**Unlinked discovery row:**

| Cell | Renders |
|---|---|
| Active / Dashboard / Manage | `—` (unchanged) |
| VF/HG Map + Ordering, Exclude? | ✅ tickboxes → `updateDiscovery` |
| Actions | ✅ **Create account**, now on **one line** in a 7.5rem column |

### 🔴 WHAT I HAVE NOT EXERCISED — I cannot see the rendered page

1. **No browser. Nothing was rendered.** Every width claim is arithmetic over the colgroup and the
   container's classes, not a measurement.
2. **Text widths are estimated.** "Create account" fitting 7.5rem at `text-xs` + `px-2.5` is a
   calculation (~110px into 120px), not something I measured. `whitespace-nowrap` guarantees it will not
   wrap — if it is still too wide it will **overflow** its cell instead, which would look different but
   equally wrong. **Worth a glance at 1024px and at 1440px.**
3. **Header wrapping is unverified** — "Dashboard" in 5rem and "Ordering" in 4rem may wrap to two lines
   in the sticky header. You said rows may be taller; I am flagging that it applies to the header too.
4. **No data was read.** I did not re-query `operator_id` for any truck — I took `tikka-tonic`'s NULL
   from your context and from the earlier reports.
5. **The sticky Name column's interaction with the narrower table is untested.** `sticky left-0` on the
   name cell (`:962`) only matters while scrolling sideways, which should no longer happen at desktop
   widths — but I have not confirmed it looks right when it does not engage.
