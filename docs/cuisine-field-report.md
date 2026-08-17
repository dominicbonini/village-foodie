# Replacing the free-text cuisine field with the dropdown

**No `next dev`, no `next build`, no `cap sync`, no deploy, and 🔴 NO SQL WAS RUN.** **No migration, no
column change, no type change.** **`npx tsc --noEmit` passes with no output** — that is not a build.

**Files changed by THIS task: three.** `components/shared/CuisinePicker.tsx` (new),
`components/DemoGetStarted.tsx`, `app/manage/[token]/page.tsx`. ⚠️ **Two other files are modified in
the working tree and are NOT this task's** — see E6.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** or **INFERRED**. **Manage, the setup wizard, admin and the discovery
map are reported separately.**

# ✅ THE ONE OPEN QUESTION, ANSWERED FIRST

**`Fish & Chips` IS in the canonical list, character-for-character: a plain ASCII ampersand
`U+0026`, one space either side.** Not `&amp;`, not `and`, no non-breaking or double spacing. **A2 has
the byte dump.** ✅ **All eight live values are EXACT MATCHES**, and **all eight round-trip
byte-identically** through the new control — **C1 shows the arithmetic.**

---

# PART A — THE LIST, AND THE AMPERSAND

## A1. The canonical list and its single source

# ✅ ONE LIST, ONE FILE, NO SECOND COPY.

**READ — `lib/cuisines.ts`, which states its own purpose:**

```ts
// lib/cuisines.ts
// ONE source of truth for the cuisine list + the cuisine→emoji map, shared by the signup wizard
// (components/DemoGetStarted.tsx) and — in a later diff — Settings, whose cuisine input is currently
// free-text (app/manage/[token]/page.tsx:6842 `<Input label="Cuisine type" … placeholder="e.g. Italian,
// Thai, Burgers" />`).  Keeping the list here means the two surfaces can never drift.
//
// STORAGE FORMAT: cuisines are written to trucks.cuisine_type as a COMMA-JOINED string ("Pizza, Burgers").
// The live Village Foodie discovery filter splits that column on commas, so a truck tagged "Pizza, Burgers"
// correctly appears under BOTH filters. Do not change that format.

/** The selectable cuisines, ALPHABETICAL, with "Other" last (it reveals a free-text field in the UI). */
export const CUISINES = [
  'Asian',
  'BBQ',
  'Bakery',
  'Burgers',
  'Caribbean',
  'Chicken',
  'Chinese',
  'Coffee',
  'Desserts',
  'Fish & Chips',
  'Greek',
  'Hot Dogs',
  'Indian',
  'Italian',
  'Jacket Potatoes',
  'Kebab',
  'Korean',
  'Mexican',
  'Pie & Mash',
  'Pizza',
  'Seafood',
  'Tacos',
  'Thai',
  'Vegan',
  'Wraps',
  'Other',
] as const
```

**26 entries, verified by parsing the file. ✅ THIS IS THAT LATER DIFF.**

**Per surface, READ:**

| Surface | List used |
|---|---|
| **Setup wizard** | `CUISINES` — was the only consumer |
| **Manage → Settings** | 🔴 **none — free text.** ✅ **Now `CUISINES`, via the shared component** |
| **Admin create-truck** | 🔴 **none — free text.** ⚠️ **UNCHANGED, out of scope (`app/admin/page.tsx:1924-1925`)** |
| **Discovery map** | 🔴 **no fixed list — DERIVED from live data** (A1 note below) |

🔴 **THE DISCOVERY MAP IS NOT A SECOND COPY TO RECONCILE — IT HAS NO LIST AT ALL. READ,
`hooks/useVillageData.ts`:**

```ts
    const types = new Set<string>();
    distanceAndDateFiltered.forEach(e => {
        if (e.type && e.type !== 'Mobile' && !e.type.toLowerCase().includes('static')) {
            const splitTypes = e.type.split(',').map(t => t.trim());
            splitTypes.forEach(t => {
                if (t) types.add(t);
            });
        }
    });
    const dynamicCuisines = Array.from(types).sort();
```

⚠️ **`.split(',').map(t => t.trim())` — THE MAP TRIMS. That is the detail B4 turns on: both `Thai,Asian`
and `Thai, Asian` read back correctly on the map, so the format question is about what this control
WRITES, not about what the map can parse.**

⚠️ **ONE STALE REFERENCE, reported not fixed:** the header cites
`app/manage/[token]/page.tsx:6842`; the control was at **8791** before this change.

## A2. 🔴 `Fish & Chips` — the byte-level answer

**READ — a byte-level dump of the entry as it sits in `lib/cuisines.ts`:**

```
 'Fish & Chips',
```

**Codepoint by codepoint:**

```
U+0046 'F'   U+0069 'i'   U+0073 's'   U+0068 'h'
U+0020 ' '   U+0026 '&'   U+0020 ' '
U+0043 'C'   U+0068 'h'   U+0069 'i'   U+0070 'p'   U+0073 's'
```

| Hazard checked | Result |
|---|---|
| `&amp;` HTML entity | ❌ **NOT PRESENT** — the raw char is `U+0026` |
| the word `and` | ❌ **NOT PRESENT** |
| Non-breaking space `U+00A0` around it | ❌ **NOT PRESENT** — both spaces are `U+0020` |
| Double or missing spacing | ❌ **NOT PRESENT** — exactly one space each side |
| Full-width ampersand `U+FF06` | ❌ **NOT PRESENT** |

✅ **AND JSX DOES NOT RE-ENCODE IT.** The option is rendered as
`<option key={c} value={c}>{c}</option>` — the value is a **JavaScript string passed as a prop**, never
HTML parsed, so `&` reaches the DOM as `&`. **INFERRED, but it is the standard React text-node path,
and the round-trip test in C1 confirms it at the data level.**

⚠️ **`Pie & Mash` is the other ampersand entry and is byte-identical in form** (`U+0020 U+0026
U+0020`). **No live truck holds it, but it would behave the same.**

## A3. The eight live values against the list

**Checked by parsing `CUISINES` out of the file and comparing exactly — case, spacing and punctuation
all significant.**

| # | Live value | Verdict |
|---|---|---|
| 1 | `Pizza` | ✅ **EXACT MATCH** |
| 2 | `Thai` | ✅ **EXACT MATCH** |
| 3 | `Pizza` | ✅ **EXACT MATCH** |
| 4 | **`Fish & Chips`** | ✅ **EXACT MATCH** — the ampersand included |
| 5 | `Tacos` | ✅ **EXACT MATCH** |
| 6 | `Indian` | ✅ **EXACT MATCH** |
| 7 | `Chinese` | ✅ **EXACT MATCH** |
| 8 | `Burgers` | ✅ **EXACT MATCH** |

# ✅ EIGHT OF EIGHT. ZERO NOT IN LIST.

⚠️ **AND NONE CONTAINS A COMMA**, which confirms your note that the multi-value path has never been
used — and means the one normalisation this control performs (B4) **cannot fire on any live row.**

## A4. 🔴 Off-list values are preserved anyway

**A3 came back clean, so nothing needs rescuing today. The mechanism is there regardless, because the
field has been free text and the next value typed into it may not be clean.**

**HOW: the wizard's own "Other" escape hatch, not a new one.** **READ** — the new
`storedToCuisineSlots`:

```ts
export function storedToCuisineSlots(raw: string | null | undefined): CuisineSlot[] {
  const parts = (raw || '').split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return [{ value: '', other: '' }]
  return parts.slice(0, MAX_CUISINE_SLOTS).map(p =>
    (CUISINES as readonly string[]).includes(p)
      ? { value: p, other: '' }
      : { value: CUISINE_OTHER, other: p }
  )
}
```

🔴 **AN UNRECOGNISED VALUE BECOMES AN "Other" ROW CARRYING ITS EXACT TEXT** — visible in the free-text
box beside the select, editable, and resolving back to itself unchanged. **Verified:**

| Stored | Loads as | Saves back as | Identical |
|---|---|---|---|
| `Wood-fired sourdough` | Other + that text | `Wood-fired sourdough` | ✅ |
| `pizza` *(lowercase)* | Other + `pizza` | `pizza` | ✅ **not silently promoted to `Pizza`** |
| `Fish and Chips` *(the word)* | Other + that text | `Fish and Chips` | ✅ **not silently corrected** |

⚠️ **I CHOSE THIS OVER INJECTING THE STORED VALUE AS AN EXTRA `<option>`.** An injected option shows
the value but quietly **blesses a typo as canonical**, and it would sit in the list looking exactly as
official as `Pizza`. **The "Other" row shows it as what it is: a value outside the list, in a text box,
which is where an operator can fix it.** ⚠️ **It also required no new list plumbing at all.**

---

# PART B — THE CONTROL

## B1. Manage's free-text input, before

**READ — `app/manage/[token]/page.tsx:8791`, the entire control:**

```tsx
        <Input label="Cuisine type" required value={form.cuisine_type || ''} onChange={v => setForm(p => ({...p, cuisine_type: v}))} onBlur={() => saveFormField()} placeholder="e.g. Italian, Thai, Burgers" />
```

⚠️ **Note `onBlur={() => saveFormField()}` — a save on every blur, with no list and no validation. The
placeholder was the only hint that multiple values were even possible.**

## B2. The wizard's dropdown, and what I did

**READ — the wizard's control BEFORE, inline in `components/DemoGetStarted.tsx`:**

```tsx
                    <div className="flex flex-col gap-2">
                      {cuisineSlots.map((slot, i) => (
                        <div key={i} className="flex flex-col gap-1.5">
                          <select
                            id={`demo-cuisine-${i}`} ref={i === 0 ? cuisineRef : undefined} value={slot.value}
                            onChange={e => setCuisineValue(i, e.target.value)}
                            className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${fieldErrors.cuisine ? 'border-red-400' : 'border-slate-200'}`}>
                            <option value="">Choose a cuisine…</option>
                            {CUISINES.map(c => <option key={c} value={c}>{c === CUISINE_OTHER ? 'Other…' : c}</option>)}
                          </select>
                          {slot.value === CUISINE_OTHER && (
                            <input type="text" value={slot.other} onChange={e => setCuisineOther(i, e.target.value)}
                              placeholder="Tell us your cuisine"
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                          )}
                        </div>
                      ))}
                    </div>
                    {cuisineSlots.length < 3 && (
                      <button type="button" onClick={addCuisineSlot}
                        className="mt-2 text-xs font-bold text-orange-600 hover:text-orange-700">+ Choose another</button>
                    )}
                    {/* Chips — only once 2+ cuisines are chosen; each removable. */}
                    {resolvedCuisines.length >= 2 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
…
```

# ✅ I EXTRACTED IT. `components/shared/CuisinePicker.tsx`, used by BOTH surfaces.

**Extraction was practical, and I did it rather than building a matching control**, because a matching
control is precisely how this codebase grew two cuisine fields in the first place. **The markup moved
VERBATIM** — same ids, same classes, same `Other…` behaviour, same three-row cap, same chips, same
`×` remove buttons. ⚠️ **The census proves it moved rather than being rewritten: `DemoGetStarted` lost
exactly one `U+00D7` and the new file gained exactly one** (E2).

**What had to change to make it shareable, and only this:**

- **The four row-mutation helpers moved inside**, and the component hands back the whole array. **READ**
  — what replaced them in the wizard:
  ```ts
    // (setCuisineValue / setCuisineOther / addCuisineSlot / removeCuisineSlot moved into CuisinePicker —
    //  it owns the row mutations now and hands back the whole array. `clearFieldErr('cuisine')` still fires
    //  on every change, at the component's onChange, exactly as these four did.)
  ```
- **`resolvedCuisines` became the exported `resolveCuisines`, character-for-character:**
  ```ts
    const resolvedCuisines = resolveCuisines(cuisineSlots)
  ```
- **Two props carry what the component cannot own:** `firstSelectRef` (the wizard focuses row 0 on a
  validation failure) and `invalid` (the wizard colours the border red; the message stays in the
  wizard).

⚠️ **THE WIZARD'S BEHAVIOUR IS UNCHANGED, per B6.** Its state, its validation, its emoji derivation and
its submit are all still its own — the component is **controlled** and owns no state whatsoever.

## B3. More than one, with add-another

**READ — the shared component:**

```tsx
      {slots.length < MAX_CUISINE_SLOTS && (
        <button type="button" onClick={addSlot} disabled={disabled}
          className="mt-2 text-xs font-bold text-orange-600 hover:text-orange-700">+ Choose another</button>
      )}
```

```ts
/** The wizard's cap, kept so both surfaces offer the same number of rows. */
export const MAX_CUISINE_SLOTS = 3
```

✅ **Up to three, `+ Choose another` to reveal the next, removable chips at 2+ — identical on both
surfaces because it is the same code.** ⚠️ **`removeSlot` never removes the last row**, so the control
always has something to render:

```ts
  const removeSlot = (i: number) =>
    onChange(slots.length <= 1 ? slots : slots.filter((_, j) => j !== i))
```

## B4. 🔴 The stored format — COMMA-SPACE, matching the wizard

**WHAT THE WIZARD PRODUCES — READ, `components/DemoGetStarted.tsx`, unchanged by this task:**

```ts
          cuisine_type: resolvedCuisines.join(', '),
```

🔴 **`join(', ')` — COMMA THEN SPACE.**

**WHAT MANAGE NOW WRITES — READ, the shared helper both surfaces resolve through:**

```ts
export function cuisinesToStored(slots: CuisineSlot[]): string {
  return resolveCuisines(slots).join(', ')
}
```

✅ **THE SAME EXPRESSION. MATCHED, NOT APPROXIMATED.**

**EXACTLY WHAT IS WRITTEN:**

| Selection | String written |
|---|---|
| One: Pizza | `Pizza` |
| One: Fish & Chips | `Fish & Chips` |
| Two: Pizza, Burgers | `Pizza, Burgers` |
| Three: Pizza, Burgers, Wraps | `Pizza, Burgers, Wraps` |
| Other → `Wood-fired` | `Wood-fired` |
| Nothing selected | `` *(empty string)* |

⚠️ **THE ONE NORMALISATION, DECLARED: a stored `Thai,Asian` (no space) would be re-saved as
`Thai, Asian`.** That is the only input this control does not return byte-identically. 🔴 **It cannot
occur on live data — none of the eight values contains a comma at all (A3)** — and the map trims on
read, so both forms resolve identically there. **Reported rather than hidden.**

## B5. The same endpoint, the same allow-listed field

**READ — `app/api/manage/route.ts`, the `update_settings` allow-list, unchanged:**

```ts
      'name', 'description', 'cuisine_type', 'contact_email', 'contact_phone',
```

**READ — manage's saver, unchanged:**

```ts
  const saveFormField = async (overrides?: Record<string, unknown>) => {
    try {
      // update_settings returns the updated row ({ truck }); push it up so the parent `truck` is
      // authoritative-fresh and a remount doesn't revert the field to the stale original value.
      const res = await api('update_settings', { ...form, ...overrides })
```

**READ — the new call site:**

```tsx
          <CuisinePicker
            slots={cuisineSlots}
            onChange={next => {
              setCuisineSlots(next)
              const joined = cuisinesToStored(next)
              setForm(p => ({ ...p, cuisine_type: joined }))
              void saveFormField({ cuisine_type: joined })
            }}
            idPrefix="settings"
          />
```

✅ **Same action, same field.** ⚠️ **TWO DELIBERATE DETAILS:**

1. **Saves on CHANGE, not on blur.** A `<select>` has no meaningful blur — the choice **is** the
   commit. The old text box needed blur because a half-typed word is not an answer.
2. **The value is passed EXPLICITLY as an override.** `saveFormField` spreads `{...form, ...overrides}`
   and `setForm` is asynchronous, so calling it bare would have sent **the previous render's**
   `cuisine_type`. 🔴 **That is a real save-the-old-value bug, avoided by copying the
   `saveContactPhone` pattern already in this file.**

**READ — the seeding, so an existing value appears:**

```ts
  const [cuisineSlots, setCuisineSlots] = useState<CuisineSlot[]>(() => storedToCuisineSlots(truck.cuisine_type))
```

⚠️ **SEEDED, NOT DERIVED PER RENDER.** Deriving would rebuild the rows on every keystroke elsewhere in
the settings form and discard a half-typed "Other" the instant it did not yet resolve. **`form` is
seeded from `truck` on the same mount, so the two have identical lifetimes.**

## B6. Nothing else changed

| Asked not to change | Status |
|---|---|
| The column `trucks.cuisine_type` | ✅ **UNTOUCHED — no migration, no SQL, `supabase/` absent from the diff** |
| Its type | ✅ **UNTOUCHED — still a comma-joined string** |
| The wizard's behaviour | ✅ **UNTOUCHED — same markup, same state, same validation, same submit** |
| `lib/cuisines.ts` | ✅ **NOT EDITED — the list is untouched** (absent from the diff) |
| Admin's free-text field | ✅ **NOT TOUCHED — out of scope, flagged at A1** |

## B7. Back handler — nothing to register

✅ **No overlay and no picker was added. The control is an INLINE FIELD in the settings form**, exactly
as the free-text input it replaces was, and as the wizard's is. **There is no dismissible layer, so
there is nothing for a non-committing back arm to close.**

⚠️ **For the record: `app/manage/[token]/page.tsx` does have its own `useAndroidBack` list; it was not
modified, because adding an arm for a control that cannot be open would be dead state.**

---

# PART C — PROVE NOTHING IS LOST

## C1. 🔴 The eight live values: open Settings, press save, change nothing

**The arithmetic, computed by running the real `CUISINES` list through the real algorithm:**

**The path is `stored → storedToCuisineSlots → resolveCuisines → join(', ') → saved`.**

| # | Stored today | Loads as slot | Displays | Saves | Byte-identical? |
|---|---|---|---|---|---|
| 1 | `Pizza` | `{value:'Pizza', other:''}` | dropdown showing **Pizza** | `Pizza` | ✅ |
| 2 | `Thai` | `{value:'Thai', other:''}` | **Thai** | `Thai` | ✅ |
| 3 | `Pizza` | `{value:'Pizza', other:''}` | **Pizza** | `Pizza` | ✅ |
| 4 | **`Fish & Chips`** | `{value:'Fish & Chips', other:''}` | **Fish & Chips** | `Fish & Chips` | ✅ |
| 5 | `Tacos` | `{value:'Tacos', other:''}` | **Tacos** | `Tacos` | ✅ |
| 6 | `Indian` | `{value:'Indian', other:''}` | **Indian** | `Indian` | ✅ |
| 7 | `Chinese` | `{value:'Chinese', other:''}` | **Chinese** | `Chinese` | ✅ |
| 8 | `Burgers` | `{value:'Burgers', other:''}` | **Burgers** | `Burgers` | ✅ |

# ✅ EIGHT OF EIGHT BYTE-IDENTICAL. NOTHING IS LOST.

**Worked through for row 4, the one that mattered:**

```
'Fish & Chips'
  → split(',')            → ['Fish & Chips']
  → map(trim)             → ['Fish & Chips']          (no leading/trailing space to lose)
  → filter(Boolean)       → ['Fish & Chips']
  → in CUISINES?          → TRUE (exact, U+0026 to U+0026)
  → slot                  → { value: 'Fish & Chips', other: '' }
  → resolveCuisines       → ['Fish & Chips']
  → join(', ')            → 'Fish & Chips'
IDENTICAL ✅
```

⚠️ **AND NOTE WHAT DOES NOT HAPPEN: nothing saves at all unless the operator changes a selection.** The
new control fires `saveFormField` **only from `onChange`**. Merely opening Settings and looking at the
field writes nothing.

**Edge cases, same method:**

| Stored | Saves | Identical | Note |
|---|---|---|---|
| `` / `null` | `` | ✅ | one empty row rendered |
| `Thai, Asian` | `Thai, Asian` | ✅ | the wizard's own format |
| `Thai,Asian` | `Thai, Asian` | 🔴 **NO** | **the only normalisation — cannot occur on live data (B4)** |
| `Wood-fired sourdough` | `Wood-fired sourdough` | ✅ | via Other |
| `pizza` | `pizza` | ✅ | case preserved, not promoted |
| `Fish and Chips` | `Fish and Chips` | ✅ | not corrected to the `&` form |

## C2. The discovery map still resolves every truck

✅ **YES — and it must, because this diff changes no stored value.**

**READ — the map's resolution order, `app/api/discovery/events/route.ts`:**

```ts
      type: truck?.cuisine_type || linked.cuisine || '',
```

**INFERRED, and it follows from C1:** the eight stored strings are unchanged unless an operator
deliberately changes one, so `truck.cuisine_type` still resolves for all eight, `dynamicCuisineOptions`
still derives the same eight options, and `finalFilteredList` still matches them:

```ts
      if (filters.cuisine !== 'all') {
        const eventTypes = event.type ? event.type.toLowerCase().split(',').map(t => t.trim()) : ['mobile'];
        if (!eventTypes.includes(filters.cuisine.toLowerCase())) return false;
      }
```

⚠️ **`Fish & Chips` survives the filter path too**: both the option and the comparison go through
`.toLowerCase()` on the **same string**, so `fish & chips === fish & chips`. **The ampersand is never
HTML-encoded on either side.**

## C3. Clearing the field entirely

**IS EMPTY ALLOWED? Technically yes; it is discouraged but not blocked.**

- **READ** — the old input carried `required`, which is a **visual asterisk on manage's `Input`
  helper**, not a submit gate; the field saved on blur regardless. **The new control keeps the same
  visual marker** (`<span className="text-red-500">*</span>`) and likewise does not block.
- **READ** — clearing every row yields `resolveCuisines` → `[]` → `join(', ')` → `''`, and `''` is sent
  to `update_settings`. **No client validation rejects it.**
- ⚠️ **The wizard, by contrast, DOES block it** — `if (resolvedCuisines.length === 0) errs.cuisine = 'Tell us what you cook.'`
  **INFERRED: so a truck can only reach an empty cuisine by clearing it in Settings.**

🔴 **WHAT THE MAP DOES WITH AN EMPTY VALUE — and it is customer-facing:**

- **The truck contributes NO option** to `dynamicCuisineOptions` (the `if (e.type && …)` guard fails).
- **It matches NO cuisine filter**: `event.type` is falsy, so `eventTypes` becomes `['mobile']`, which
  equals no cuisine.
- ✅ **It STILL APPEARS under "All Food"** — `filters.cuisine !== 'all'` is the only gate.

⚠️ **So clearing the field removes the truck from every cuisine-filtered view of the public map while
leaving it in the unfiltered list.** **REPORTED, NOT BLOCKED — adding a client-side guard would be a
behaviour change beyond this scope. Flagging it as the one way an operator can still harm their own
listing.**

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
$ git diff --stat
 app/dashboard/[token]/kds/page.tsx | 60 ++++++++++++++++++++++++++++
 app/manage/[token]/page.tsx        | 35 ++++++++++++++++-
 components/DemoGetStarted.tsx      | 80 +++++++++++---------------------------
 components/dashboard/OrderCard.tsx | 24 ++++++++++++
 4 files changed, 140 insertions(+), 59 deletions(-)
```

🔴 **ONLY TWO OF THOSE FOUR ARE THIS TASK'S** — `app/manage/[token]/page.tsx` and
`components/DemoGetStarted.tsx` — **plus the untracked new file
`components/shared/CuisinePicker.tsx`.** See E6.

| Boundary | Proof |
|---|---|
| **No migration** | `supabase/**` absent from the diff; **no SQL was run** |
| **No gate** | `lib/features.ts`, `lib/plan-features.ts` absent |
| **No payment path** | `lib/payments/**` absent; `app/api/**` absent |
| **No type change** | `trucks.cuisine_type` is still a comma-joined string; `lib/cuisines.ts` **not edited** |
| **No API change** | `app/api/manage/route.ts` **not modified** — the same action, the same allow-list |
| **No admin change** | `app/admin/**` absent |
| **No discovery change** | `hooks/useVillageData.ts`, `app/page.tsx`, `app/api/discovery/**` absent |

## D2. What each operator sees

**Pizzeria Gusto:** in Manage → Settings the "Cuisine type" text box is now a dropdown already showing
**Pizza**, with a `+ Choose another` link if they ever add a second — and nothing they do elsewhere
touches it, their stored value is unchanged, and the KDS and dashboard are completely unaffected.

**Tikka Tonic:** exactly the same, showing **Indian** — a handed-over truck whose stored string is
untouched by this diff, so their public map listing is identical until they choose to change it.

## D3. Does any customer-facing surface change?

# 🔴 NO. NOT ONE.

**INFERRED, and it rests on C1:** this diff changes **no stored value**. The discovery map, the truck
pages and the venue pages all read `trucks.cuisine_type`, which is byte-identical for all eight trucks
after the change. **No customer-facing file was edited** — `app/page.tsx`, `hooks/useVillageData.ts`,
`components/EventListCard.tsx` and `app/api/discovery/**` are all absent from the diff.

⚠️ **The one route to a customer-facing change is an operator deliberately editing their cuisine — which
was true before this change too, and is now constrained to a curated list instead of free text.**
⚠️ **The exception is C3's clearing case, which is newly easy to do by accident with a dropdown
(select the blank first option) where before it took deleting text. Reported.**

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census, before and after

### `components/DemoGetStarted.tsx` — 19 classes BEFORE, **19 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+00D7 MULTIPLICATION SIGN | 6 | 5 | **−1** | the chip's `×` remove button **moved into the component** — which gained exactly 1 |
| U+2026 HORIZONTAL ELLIPSIS | 4 | 3 | **−1** | `Choose a cuisine…` and `Other…` moved out (−2); my new comment quotes `"Other…"` (+1) |
| U+2014 EM DASH | 150 | 151 | **+1** | prose in the replacement comment |
| U+26A0 WARNING SIGN | 3 | 4 | **+1** | one caveat marker — **paired** |
| U+FE0F VAR SELECTOR-16 | 3 | 4 | **+1** | ✅ **exactly matches the U+26A0 delta** |
| *all 14 other classes* | — | — | **0** | unchanged |

✅ **NO CLASS GAINED, NO CLASS LOST.**

### `app/manage/[token]/page.tsx` — 176 classes BEFORE, **176 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 105 | 108 | **+3** | headline markers in the new comments |
| U+2014 EM DASH | 812 | 815 | **+3** | prose in the new comments |
| U+2500 BOX DRAWINGS | 3752 | 3837 | **+85** | one comment box rule |
| U+26A0 WARNING SIGN | 99 | 101 | **+2** | caveat markers — **both paired** |
| U+FE0F VAR SELECTOR-16 | 108 | 110 | **+2** | ✅ **exactly matches the U+26A0 delta** |
| *all 171 other classes* | — | — | **0** | unchanged |

✅ **NO CLASS GAINED, NO CLASS LOST.**

### `components/shared/CuisinePicker.tsx` — NEW FILE, 8 classes

**No "before" exists, so no class can be gained.** ⚠️ **Every class in it already existed in the file
it was extracted from, or in the codebase generally:**

```
U+00D7  1     the chip's × remove button  (moved from DemoGetStarted, which lost exactly 1)
U+1F534 3     headline markers
U+2014  12    em dashes in prose
U+2026  5     'Choose a cuisine…' + 'Other…' + quoted prose
U+2192  3     arrows in the round-trip explanation
U+2500  157   comment box rules
U+26A0  4     caveat markers — ALL PAIRED
U+FE0F  4     exactly matches the U+26A0 count
```

🔴 **NO NEW GLYPH WAS INVENTED FOR THE OPTION LIST, WHICH IS WHERE E1 WARNED ONE WOULD CREEP IN.** The
list itself is **not duplicated** into this file — it is imported from `lib/cuisines.ts`, so there is
no second copy of `Fish & Chips` anywhere to drift typographically. ✅ **`lib/cuisines.ts` was NOT
EDITED: 2,465 bytes, 28 classes, unchanged.**

## E3. 🔴 Carrier-aware variation-selector check

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| **DemoGetStarted** | U+26A0 | 3 / 3 / **0** | 4 / 4 / **0** | ✅ **still zero bare** |
| | U+2705 | 1 / 0 / 1 | 1 / 0 / 1 | ✅ unchanged |
| | U+1F534 | 6 / 0 / 6 | 6 / 0 / 6 | ✅ unchanged |
| **manage** | U+26A0 | 99 / 91 / **8** | 101 / 93 / **8** | ✅ **bare UNCHANGED at 8** |
| | U+2705 | 8 / 0 / 8 | 8 / 0 / 8 | ✅ unchanged |
| | U+1F534 | 105 / 0 / 105 | 108 / 0 / 108 | ✅ consistent — all bare |
| **CuisinePicker** | U+26A0 | *(new)* | 4 / **4** / **0** | ✅ **all paired** |
| | U+1F534 | *(new)* | 3 / 0 / 3 | ✅ matches both parents' bare form |

🔴 **THE 8 BARE U+26A0 IN `manage` ARE PRE-EXISTING AND THE COUNT IS UNCHANGED. All 7 warning signs I
added across the three files are paired**, matching each file's dominant form. **`DemoGetStarted` had
zero bare before and has zero bare after.**

## E4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  components/DemoGetStarted.tsx          81,072 bytes  offending=0  CR=0   (was 83,071)
  app/manage/[token]/page.tsx           785,187 bytes  offending=0  CR=0   (was 782,627)
  components/shared/CuisinePicker.tsx     8,254 bytes  offending=0  CR=0   (new)
  lib/cuisines.ts                         2,465 bytes  offending=0  CR=0   (NOT EDITED)
```

✅ **Zero offending bytes, zero CR, before and after, in all four.**

## E5. Byte scan of this report

Separate pass, run after writing: **34,068 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR. **Carrier-aware check on this report:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 64 | 0 | 64 |
| U+1F534 LARGE RED CIRCLE | 30 | 0 | 30 |
| U+26A0 WARNING SIGN | 30 | **30** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 30 of 30**, and the file's total U+FE0F
count is **30**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
two unpaired bases are internally consistent (0 of 64, 0 of 30), so neither is split across two
renderings.** ✅ **U+2500 does not appear in this report at all.**

## E6. 🔴 `git status`, and which entries are THIS task's

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
?? components/shared/CuisinePicker.tsx
?? docs/cuisine-field-report.md
?? docs/kds-ready-toggle-report.md
```

| Entry | This task? |
|---|---|
| `?? components/shared/CuisinePicker.tsx` | ✅ **YES — the extracted component** |
| `M components/DemoGetStarted.tsx` | ✅ **YES — the wizard now uses it** |
| `M app/manage/[token]/page.tsx` | ✅ **YES — Settings now uses it** |
| `?? docs/cuisine-field-report.md` | ✅ **YES — this report** |
| `M app/dashboard/[token]/kds/page.tsx` | 🔴 **NO — the KDS ready-step toggle, previous task, uncommitted** |
| `M components/dashboard/OrderCard.tsx` | 🔴 **NO — same, previous task** |
| `?? docs/kds-ready-toggle-report.md` | 🔴 **NO — the previous task's report** |

⚠️ **THE TWO `M` ENTRIES I DID NOT TOUCH ARE THE READY-STEP WORK YOU HAVE NOT COMMITTED.** They are in
`git diff --stat` above and must not be read as part of this change.

---

# PART F — WHAT YOU MUST TEST

**1. 🔴 AN EXISTING VALUE SHOWS.** Open Manage → Settings → Truck details on a truck holding `Pizza`.
**PASS:** the field is a dropdown **already showing Pizza**, not blank and not "Choose a cuisine…".
**FAILURE:** it shows blank or the placeholder. 🔴 **That is the silent-drop failure — stop and tell
me before saving anything.**

**2. 🔴 THE AMPERSAND TRUCK.** Do the same for the truck holding `Fish & Chips`.
**PASS:** the dropdown shows **Fish & Chips** with a normal ampersand.
**FAILURE:** it shows blank, `Fish &amp; Chips`, or lands in the "Other" box. ⚠️ **"Other" would mean
the list entry and the stored value differ after all — send me the exact rendering.**

**3. 🔴 SAVE WITHOUT CHANGING ANYTHING.** Open Settings, touch nothing in the cuisine field, edit
another field (e.g. Description) so the form saves, then re-read the truck's `cuisine_type`.
**PASS:** byte-identical to before — `Pizza` is still `Pizza`, `Fish & Chips` still has its `&`.
**FAILURE:** any change at all, including an empty value. ⚠️ **Check all eight trucks; the query from
the last report re-run afterwards is the cleanest proof.**

**4. Add a second cuisine.** Press `+ Choose another`, pick `Burgers` on a Pizza truck.
**PASS:** a chip row appears showing both, and the stored value becomes exactly `Pizza, Burgers` —
**comma then ONE space**.
**FAILURE:** `Pizza,Burgers` (no space) or `Pizza , Burgers`. ⚠️ **Spacing is the thing to look at;
only `, ` matches what the wizard writes.**

**5. Remove one.** Press the `×` on the `Burgers` chip.
**PASS:** back to `Pizza`, byte-identical to the original.
**FAILURE:** an empty value, or `Pizza, ` with a trailing separator.

**6. The third row and the cap.** Add a third cuisine, then look for a fourth.
**PASS:** three rows maximum; `+ Choose another` disappears at three — same as the wizard.
**FAILURE:** a fourth row is offered.

**7. "Other" round-trips.** Choose `Other…`, type `Wood-fired sourdough`, save, then reload Settings.
**PASS:** it comes back in an **Other** row with the text intact.
**FAILURE:** it is empty, or has been snapped to a list entry.

**8. 🔴 THE DISCOVERY MAP STILL FILTERS.** With all eight values untouched, open the public map and
filter by **Fish & Chips**, then by **Pizza**.
**PASS:** the same trucks appear as before this change.
**FAILURE:** a truck is missing from its own cuisine filter. 🔴 **That is customer-facing — tell me
immediately.**

**9. The wizard is unchanged.** Run the signup wizard's step 1.
**PASS:** the cuisine control looks and behaves exactly as it did — three rows, `Other…`, chips at 2+,
and the red border plus "Tell us what you cook." if you try to continue with none chosen.
**FAILURE:** any difference, especially the validation message or the focus jump to the first row.
⚠️ **This is a live signup surface; it was extracted, not rewritten, so any change here is a
regression.**

**10. Clearing it (know the consequence before you try).** Set the first row back to
`Choose a cuisine…` with no other rows.
**PASS:** it saves an empty value — **allowed, and C3 explains that the truck then drops out of
cuisine-filtered map views while remaining under "All Food".**
**FAILURE:** an error, or the field refusing to render afterwards. ⚠️ **Do this on a test truck, not on
Gusto or Tikka Tonic.**
