# Cuisine control and emoji derivation

Date: 13 August 2026
Status: **ITEM 3 BUILT. ITEMS 1 AND 2 NOT BUILT — the brief's own instruction says to propose rather
than duplicate, and I have.** `tsc --noEmit` clean. No file gained a non-ASCII character class.

**One file changed: `lib/provision-truck.ts`, three added lines.** No `next dev`, no `next build`, no
commit, no deploy, no migration. **No stored `cuisine_type` or `truck_emoji` value was written or
altered for any truck**, Pizzeria Gusto included — nothing in this change runs against existing rows.

Nothing in the prompt arrived garbled.

---

## 0. 🔴 WHY 1 AND 2 ARE PROPOSED, NOT BUILT

Instruction 1 says, verbatim:

> *"Read that component first and reuse its control — do not design a second one. **If it is inline
> rather than extractable, say so and propose the extraction rather than duplicating it.**"*

**I read it. It is inline.** `components/DemoGetStarted.tsx` has no cuisine component — it has state,
four handlers, a derivation and ~40 lines of JSX woven into a 900-line wizard:

| Piece | Line |
|---|---|
| `const [cuisineSlots, setCuisineSlots] = useState<{ value: string; other: string }[]>([{ value: '', other: '' }])` | `:228` |
| `resolvedCuisines` — dedup, non-empty, `'Other'` resolves to its free text | `:253-260` |
| `setCuisineValue` / `setCuisineOther` | `:392-399` |
| `addCuisineSlot` / `removeCuisineSlot` (max 3, min 1) | `:400-401` |
| the `<select>` + conditional free-text `<input>` | `:852-867` |
| "+ Choose another" | `:869-872` |
| the removable chips, shown at 2+ | `:874-888` |

**Nothing here is exported.** Reusing it in two more places means either extracting it into a shared
component — **a fourth file, outside the stated SCOPE of three** — or duplicating ~60 lines twice, which
the brief forbids and which would make this codebase's third copy of a rule that already has a canonical
home.

**So the instruction's own branch applies, and I took it: say so, propose, do not duplicate.**
Section 5 is the proposal, specified closely enough to apply on one word from you.

⚠️ **I am not claiming items 1 and 2 are done. They are not.**

---

## 1 & 2. What I did NOT change

`app/admin/page.tsx` and `app/manage/[token]/page.tsx` are **byte-identical to `HEAD`** — verified by
`git status` (only `lib/provision-truck.ts` is modified) and asserted in the harness (neither file
imports `@/lib/cuisines`).

**So Manage → Settings' cuisine input is still free text, and the admin modal's still is too.** The
non-`CUISINES` preservation question in 2 is answered inside the proposal (section 5c), not by shipped
code.

---

## 3. `lib/provision-truck.ts` — BUILT

### The whole change: three added lines, zero deletions

```
$ git diff lib/provision-truck.ts | grep "^-" | grep -v "^---"
ZERO deletions — purely additive
```

**(a) the import** — the map is shared, not reimplemented:

```ts
// ONE cuisine->emoji map, shared with the signup wizard. Imported rather than reimplemented so the two
// surfaces cannot disagree about what an "Indian" truck's emoji is.
import { emojiForCuisine } from '@/lib/cuisines'
```

**(b) the first-cuisine derivation**, beside the other pre-insert locals:

```ts
// The FIRST cuisine of the comma-joined string, or '' when none was supplied. Split-and-trim rather
// than a regex so it matches how the discovery filter reads the same column.
const firstCuisine = (opts.cuisineType ?? '').split(',')[0]?.trim() ?? ''
```

**(c) the insert key**, immediately after the untouched `cuisine_type` line:

```ts
        cuisine_type: opts.cuisineType ?? null,
        ...(firstCuisine ? { truck_emoji: emojiForCuisine(firstCuisine) } : {}),
```

🔴 **The storage format is untouched.** Nothing writes `cuisine_type` differently; the derivation only
*reads* it, and it reads it by splitting on commas — the same way `lib/cuisines.ts:7-9` says the
discovery filter does.

### ⚠️ ONE DEVIATION FROM A LITERAL READING, AND WHY

The brief says *"derive `truck_emoji` … from the FIRST cuisine, using `emojiForCuisine`"*. Read
literally, that means calling it unconditionally — and `emojiForCuisine(undefined)` returns
**`'🍽️'`** (the "Other" plate).

**I made the key conditional instead**, because two of the three callers pass **no cuisine at all**:

- `/api/setup/route.ts:87-108` — no `cuisineType` (confirmed by reading; the option is absent).
- `lib/provision-demo.ts:112-115` — `{ kind: 'demo', van: {…} }` only.

Writing unconditionally would stamp **every self-serve signup and every demo truck** with 🍽️ instead of
leaving the column's own default standing — a behaviour change to two callers the brief explicitly says
must stay byte-identical. **Nothing is derived from nothing; an absent cuisine means an absent opinion.**

**If you want the literal version, delete the `firstCuisine ? … : {}` wrapper** — one edit. But it
changes the two other callers, which is why I did not.

### What each caller now gets — verified by running the exact expression

```
  /api/setup (passes no cuisineType)           cuisine=undefined      -> (key omitted — DB default stands)
  lib/provision-demo (passes no cuisineType)   cuisine=undefined      -> (key omitted — DB default stands)
  /api/admin/create-truck — tikka-tonic        cuisine="Indian"       -> 🍛
  /api/admin/create-truck — comma-joined       cuisine="Pizza, Burgers" -> 🍕   (the FIRST)
  /api/admin/create-truck — free text          cuisine="Nepalese street food" -> 🍽️  (Other fallback)
  /api/admin/create-truck — blank string       cuisine=""             -> (key omitted)
  /api/admin/create-truck — spaced             cuisine="  Thai , Vegan " -> 🍜   (trimmed)
```

| Caller | Cuisine passed | Emoji written | Behaviour change? |
|---|---|---|---|
| `/api/setup` | none | **none — DB default** | ✅ **none** |
| `lib/provision-demo.ts` | none | **none — DB default** | ✅ **none** |
| `/api/admin/create-truck` | from the form | derived | 🔴 **yes — the intended change** |

### ✅ The wizard's later write still wins — confirmed by reading

`components/DemoGetStarted.tsx:583-596` posts `update_settings` with
`truck_emoji: emojiForCuisine(resolvedCuisines[0])` at **step (d)**, after the truck exists at step (c).
An UPDATE after an INSERT wins by ordering, and `truck_emoji` is on `update_settings`'s allow-list
(`app/api/manage/route.ts:798`).

⚠️ **And for that path there is not even a conflict**: the demo/self-serve provision writes no
`truck_emoji` at all, so the wizard's value lands on the column's default rather than over a derived one.
**Nothing about that flow is broken by this change.**

### No other column touched

Asserted individually: `sheet_id`, `active`, `plan`, `trial_expires_at`, `contact_phone`,
`preorders_enabled`, `completion_presses` all still present and unmodified, and
`cuisine_type: opts.cuisineType ?? null` is byte-identical.

---

## 4. Untouched, as instructed

`qr_code_style`, logo resolution and everything in the QR poster were not opened. `git status` shows one
modified file.

---

## 5. 🔴 THE PROPOSED EXTRACTION — ready to apply

### 5a. A new file: `components/shared/CuisinePicker.tsx`

Self-contained, no wizard coupling:

```tsx
export function CuisinePicker({ value, onChange, max = 3, invalid = false, idPrefix, inputRef }: {
  /** The stored comma-joined string, e.g. "Pizza, Burgers". */
  value: string
  /** Fires with the new comma-joined string. The parent stores it verbatim. */
  onChange: (commaJoined: string) => void
  max?: number
  invalid?: boolean
  idPrefix: string
  inputRef?: React.Ref<HTMLSelectElement>
})
```

**It owns the slot model internally and speaks only the storage format at its edges** — so no caller can
get the comma-joining wrong, which is the constraint that outranks everything.

### 5b. What moves, and what `DemoGetStarted` keeps

Moved: `cuisineSlots`, `resolvedCuisines`, the four handlers, the select/free-text/chips/"+ Choose
another" JSX (`:228, :253-260, :392-401, :852-889`).

Kept by the wizard: `fieldErrors.cuisine` (passed in as `invalid`), `cuisineRef` (passed as `inputRef`),
and `clearFieldErr('cuisine')` (called from its `onChange`). ⚠️ **The wizard must end up
behaviourally identical** — that is the acceptance test for the extraction, and it is why this wants its
own change rather than being bolted onto this one.

### 5c. 🔴 How a non-`CUISINES` value is preserved — the answer to instruction 2

**Parse, never coerce.** On load the picker splits `value` on commas and, for each part:

- a member of `CUISINES` → that slot's `<select>` shows it;
- **anything else → the slot is set to `CUISINE_OTHER` and the free-text input is pre-filled with the
  original string verbatim.**

So a truck holding `"Neapolitan sourdough"` opens with the Other option selected and
`Neapolitan sourdough` in the text box. **It renders, it is editable, and if the operator saves without
touching it, `resolvedCuisines` reproduces the identical string.**

⚠️ **Two properties this must have, and they are testable:**

1. **Round-trip identity** — `parse(v)` then `join()` returns `v` for any existing value, modulo
   whitespace around commas. That is what guarantees no truck's stored value changes by being looked at.
2. **No write on mount.** The picker is controlled and fires `onChange` only on user interaction, so
   opening Settings must not save anything. 🔴 **This is the property that protects Pizzeria Gusto** —
   its cuisine must survive its owner merely opening the tab.

### 5d. The three call sites

| Surface | Change |
|---|---|
| `components/DemoGetStarted.tsx` | replace the inline block with `<CuisinePicker …>`; behaviour must be unchanged |
| `app/manage/[token]/page.tsx` | replace the free-text `<Input label="Cuisine type" …>`; saves via the existing `update_settings { cuisine_type }` |
| `app/admin/page.tsx` | replace `cuisineType`'s text input in the create modal; the submitted body is unchanged (still a string) |

**None of these changes the wire format or any allow-list.**

---

## 6. VERIFICATION

### Checked and passing

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| Files modified | ✅ **only `lib/provision-truck.ts`** |
| Diff is purely additive | ✅ zero deletion lines |
| `emojiForCuisine` imported, not reimplemented | ✅ (`CUISINE_EMOJI` appears nowhere in the file) |
| Insert columns untouched | ✅ seven asserted individually |
| `cuisine_type` write unchanged | ✅ |
| Derivation across seven input shapes | ✅ 8 assertions — comma-joined takes the first, whitespace trimmed, unknown → Other, empty/absent → key omitted |
| `/api/setup` and `provision-demo` unchanged | ✅ read: neither passes `cuisineType`; the key is omitted for both |
| Wizard's later `update_settings` still wins | ✅ read: step (d) after creation, on the allow-list |
| Non-ASCII census | ✅ `provision-truck.ts` 12 → 12, `admin/page.tsx` 26 → 26, `manage/[token]/page.tsx` 176 → 176. **None gained** |

### No stored `cuisine_type` changes for any existing truck

**Confirmed by construction, and this is the strongest form of the claim available:** the only changed
code is inside `provisionTruck`'s **INSERT**, which runs exactly once per newly created truck. It
contains no UPDATE, no backfill and no migration, and it cannot execute against a row that already
exists. **Pizzeria Gusto's `cuisine_type` and `truck_emoji` are untouched and unreadable by this code
path.**

⚠️ Items 1 and 2 were not built, so no Settings or admin control can have rewritten a value either.

### 🔴 WHAT I HAVE NOT EXERCISED

**No truck was created. Nothing was run against the database.**

1. **The new insert has never executed.** `truck_emoji` landing as `🍛` for an Indian truck is proved by
   running the *expression*, not by an INSERT.
2. **The column's DB default is assumed, not read.** The "key omitted → DB default stands" case rests on
   there being a sensible default; every read site falls back to `'🍕'`, which is consistent with either
   a `'🍕'` default or NULL. **INFERRED** — unchanged from the previous report.
3. **The wizard's ordering is read, not observed.** I did not run a signup to watch the later
   `update_settings` overwrite anything.
4. **Nothing in items 1, 2 or 5 exists as code**, so none of the picker's behaviour — round-trip
   identity, the Other pre-fill, no-write-on-mount — has been tested. **Those are claims about a design,
   not about shipped code.**
5. **`tikka-tonic`'s emoji is still the default.** This change only affects trucks created *after* it;
   it does not repair the one already made. Fixing that truck is a one-field edit in Settings, or
   `update_settings { truck_emoji: '🍛' }`.
