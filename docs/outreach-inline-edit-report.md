# Inline phone + email editing in the outreach table

**9 September 2026.** One file changed: `components/admin/OutreachPanel.tsx`. **No schema change, no
migration, no new endpoint, no new route action, nothing installed.** Nothing staged or committed.

🔴 **NOTHING WAS RENDERED, CLICKED OR TYPED INTO.** No admin session is obtainable. §7 separates what the
compiler confirmed, what was executed, what is structural, and what is reasoned only.

---

## 0. CLAIMS CHECKED AGAINST THE CODE AND THE DATA

✅ **The manual's public-read claim is CONFIRMED, and I tested it rather than repeating it.** 🧪 Reading
`discovery_trucks` with the **anon** key returns HTTP 200 and the real values —
`{"name":"Azahar","contact_email":"info@azaharartisanspanishfood.com","phone":"01223 360747"}`. **Both
columns this task makes easier to fill are readable by anyone with the anon key.** Nothing here widens
that; the write stays behind `verifyAdmin` + service role. ⚠️ But it is worth stating: **this feature
makes it faster to put contact details into a table the public can read.**

⚠️ **I could NOT establish whether anon can WRITE, and my first attempt was a proof that proved nothing.**
I PATCHed an id matching no rows and got `204` — which PostgREST returns for *both* "allowed, matched
nothing" and a policy that filters everything. **Inconclusive, and reported as such rather than as a
pass.** Settling it needs `pg_policies`, which PostgREST cannot query. **Unchanged by this task either way.**

🔴 **TWO FIGURES IN THE BRIEF ARE SLIGHTLY OFF.** Re-derived over the 231 rows this page loads:

| | brief | 🧪 re-derived today |
|---|---|---|
| emails empty | 176 | **172** (59 present) |
| phones empty | 162 | **161** (70 present) |
| input boxes if both always rendered | 462 | **462** ✅ (231 × 2) |

The argument is unaffected — **the large majority of both columns is empty** — but the numbers are what
they are. (Earlier reports in this series derived 55/69 present; the data has moved since.)

---

## 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-filter-ux-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts
```

⚠️ **The brief says only the panel carries prior work — `app/api/admin/outreach/route.ts` does too**, from
the media-upload and delete tasks. **This task did not touch it**, which is also how the "no new route
action" constraint is satisfied. 🧪 The route still exposes exactly four actions: `update_prospect`,
`log_contact`, `delete_contact`, `delete_media`. ✅ **No other file is entangled.**

---

## 2. DIAGNOSIS (before any code)

### 2.1 The modal's write path — and it needs nothing added to be callable from a row

`onPatch(p.id, { contact_email })` → `patchProspect` → **POST `/api/admin/outreach`, action
`update_prospect`** → the route resolves `discovery_truck_id` from the prospect and runs
`supabase.from('discovery_trucks').update(...)` with the **service-role client**, behind **`verifyAdmin`**
(404 to a non-admin).

✅ **Callable from a row unchanged.** `patchProspect` takes `(prospectId, patch)` and nothing else, and the
`Row` component **already receives it** as `onPatch` — it drives `WhatsAppBox` and both `TriStateBox`
columns today. The table needed no new plumbing, only two new callers.

### 2.2 Column widths, and whether an email fits

🔎 Phone **115px**, email **210px**, both `truncate`, from a colgroup whose sum equals `minWidth` exactly.

🧪 Content boxes are 91px and 186px after `px-3`. Stored email lengths: **min 14, median 25, p90 31, max 36**
characters. At `text-sm` (~7px/char) **186px holds ~26 characters, so 37 of 59 (63%) fit untruncated**;
the rest truncate at rest. 🧪 The longest phone is 13 characters ≈ 91px — **exactly the content box**.

**Consequence, accepted:** ~37% of addresses are visually clipped at rest. Mitigated, not solved: the full
value is in the `title`, and the box switches to **left-aligned on focus** so a long address reads from the
start while editing. **Widening email would cost another column its width.**

### 2.3 `visible`, and what happens to an edited row

🔎 `visible` = `prospects.filter(matchesOutreachFilter)` then sorted — a pure derivation, recomputed on
every change to `prospects`, `sort` or `filter`. 🔎 `patchProspect` updates `prospects` **optimistically**.

🔴 **So without protection, committing an edit re-derives the list mid-interaction** — and if the Email or
Phone filter is active, or the table is sorted on the edited column, the row moves or disappears. §5.

---

## 3. WHAT WAS BUILT

`InlineField` — a borderless, always-typeable `<input>` used in the Phone and Email cells.

- **Commits on blur** and on **Enter**; **Escape abandons** the edit and restores the last server value,
  writing nothing.
- 🔴 **One write path.** Both cells call `onPatch(p.id, { phone })` / `{ contact_email }` — **the same
  `update_prospect` the modal uses.** No second action, no second route branch.
- **No click-to-edit step**, as briefed: capturing contacts is the job of the page, so the box is a real
  input at all times.

---

## 4. 🔴 THE UNCHANGED-VALUE GUARD — proven in BOTH directions

**Failure mode, stated first:** *a guard that always returns true produces no write on a no-op **and** no
write on a real change.* **Testing only the no-op cannot tell those apart.** So both were tested.

The `commit` body was **extracted verbatim from the source file** (not retyped) and executed with a
recording `onCommit`:

```js
const commit = () => {
  const next = draft.trim()
  if (next === (seeded.current ?? '').trim()) return
  seeded.current = next
  onCommit(next)
}
```

| case | seeded → draft | writes | want |
|---|---|---|---|
| identical value | `a@b.c` → `a@b.c` | **0** | 0 |
| whitespace only differs | `a@b.c` → `  a@b.c  ` | **0** | 0 |
| empty stays empty | `''` → `'   '` | **0** | 0 |
| **new value** | `a@b.c` → `x@y.z` | **1** (`"x@y.z"`) | 1 |
| **filling an empty** | `''` → `new@truck.co` | **1** | 1 |
| **clearing a value** | `a@b.c` → `''` | **1** (`""` → route maps to NULL) | 1 |
| **blur twice, unchanged the second time** | `a@b.c` → `x@y.z` → `x@y.z` | **1** | 1 |

**7 of 7 pass.** 🔴 **The last four are what make this non-vacuous** — a guard stuck on "never write" fails
every one of them. **Tabbing across a row of empty boxes therefore fires zero writes.**

---

## 5. 🔴 WHAT HAPPENS TO A ROW BEING EDITED — stated plainly

**While an inline Phone or Email box has focus, the row list is FROZEN: the same rows, in the same order.
Nothing can move or vanish under the cursor — not a filter the edit stops matching, not a re-sort of the
column being edited. When focus leaves, the freeze lifts and the list recomputes. If your edit means the
row no longer matches an active filter, it disappears at that moment, with the change saved.**

Mechanics: `heldOrder` captures the visible **ids** on focus; while set, `visible` maps those ids back to
**live objects** from `prospects` — so the cell shows the value you just committed rather than a stale
snapshot — and clears on blur.

⚠️ **The release is deferred by one tick on purpose.** Tabbing Phone → Email fires blur then focus;
releasing synchronously on that blur would recompute the list *between* them and could unmount the row the
focus was travelling to. A pending release is cancelled if another input takes focus.

---

## 6. THE OTHER REQUIREMENTS

**6.1 Appearance.** Transparent background and a **transparent border** at rest, reading as plain text;
`hover:border-slate-200 hover:bg-white` and `focus:border-orange-400 focus:bg-white`. ⚠️
**`border-transparent`, not `border-0`** — the border always occupies its pixel and only changes colour, so
nothing shifts when it appears.

**6.2 🔴 Clicking an input does not open the modal — and it never could have.** 🧪 The `<tr>` carries **no
`onClick`**, and the only handler in the row is on the truck-name `<button>` **in a different cell**. There
is no ancestor handler for a click to bubble to. `onClick={e => e.stopPropagation()}` is on the input as
**belt-and-braces against a future row-level handler**, not because anything today requires it. **Stating
the real reason rather than claiming I fixed a problem that did not exist.**

**6.3 Modal and table cannot disagree.** 🧪 The single source is the panel's **`prospects`** state.
The table reads it through `visible`; the modal reads it through `prospects.find(p => p.id === modalId)`;
**both** are mutated by the one `setProspects` inside `patchProspect`. `InlineField` re-seeds from its
`value` prop whenever the server value changes — **but never while it has focus**, or an incoming update
would overwrite what is being typed.

---

## 7. EVIDENCE CLASS

- ✅ **Compiler-confirmed:** `npx tsc --noEmit` → **0 errors**. ⚠️ **No `next build`** — your dev server is
  live and I have already written production output into its `.next` five times this session.
- ✅ **Executed:** the 7-case guard test (§4) against source extracted verbatim; the anon read test (§0);
  every count and length distribution (§0, §2.2), taken today.
- ✅ **Structural, extracted from source:** the 14 checks in §6 and the four-action route census.
- 🔴 **Reasoned only, NOT OBSERVED:** how the borderless field looks at rest and on hover, whether the
  freeze feels right, whether Enter/Escape behave as intended in a browser. **No control was clicked,
  focused or rendered, and I claim no write succeeded.**

### 🔴 One thing the "is the class present?" habit would have missed

Applying the `text-center` lesson deliberately, I checked whether the styling can **take effect** rather
than only that it is present. 🧪 `app/globals.css` carries an **unlayered, `!important`** rule:

```css
input[type="text"], input[type="email"], … { font-size: 16px !important; }   /* iOS zoom prevention */
@media (min-width: 640px) { … { font-size: inherit !important; } }
```

**Unlayered `!important` beats every Tailwind utility**, so my `text-sm` on these inputs **is inert**.
✅ **The outcome is still correct on a laptop** — above 640px the rule resolves to `inherit`, and the input
inherits **14px from the table's `text-sm`**, which is the size I wanted. **But it arrives by inheritance,
not by my class**, and below 640px these boxes would be 16px. ⚠️ **I did not touch that rule**: it exists to
stop iOS auto-zoom on operator and customer surfaces, and changing it would reach them.

🧪 It is also the **only** bare-`input` element rule in the built CSS, so nothing overrides the border or
background utilities. ⚠️ The `hover:`/`focus:` variants did not appear in my scan of `.next` — **that tree
is a stale production build predating this change and proves nothing either way**; they are standard
utilities generated on demand.

---

## 8. NOT TOUCHED

The filter predicate, the chips, the media cells, the modal's own inputs, every route file, and all other
write paths. 🧪 Scoped `git status --short` over the customer- and operator-facing trees returns nothing.
