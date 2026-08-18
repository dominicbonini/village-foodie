# Event actions → Manage event. One control, one name, both surfaces.

**Files changed — three:** `app/dashboard/[token]/page.tsx` · `app/dashboard/[token]/kds/page.tsx` ·
`components/dashboard/OrderCard.tsx`. ✅ **`components/shared/EventActionsModal.tsx` needed no change
and is byte-for-byte unmodified — see Fix 2.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# FIX 1 — THE DASHBOARD'S OPENER IS `Manage event`

**Three visible strings, and 🔴 BOTH OPENERS GAINED AN `aria-label` — neither had one.**

```tsx
                  <button onClick={()=>setShowDemoEventLock(true)}
                    aria-label="Manage event"
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-slate-700/60 border border-slate-600 rounded px-2.5 py-1 cursor-pointer">
                    <span aria-hidden>🔒</span> Manage event
                  </button>
```
```tsx
                  <button onClick={()=>{setEventNoteInput(activeEvent.customer_note||'');setShowEventMenu(true)}}
                    aria-label="Manage event"
                    className="flex-shrink-0 text-xs font-semibold text-white bg-slate-700 border border-slate-500 hover:bg-slate-600 rounded px-2.5 py-1 transition-colors">
                    Manage event ▾
                  </button>
```
```tsx
              <h3 className="font-black text-slate-900 flex items-center gap-2"><span aria-hidden>🔒</span> Manage event</h3>
```

✅ **The `aria-label` is the exact visible string minus the caret** — the same rule the KDS's opener
follows, so the two surfaces now answer to one name for voice control. **Neither opener had an
`aria-label` or a `title` before**, so nothing was left behind; the coupling is now recorded in a
comment beside the live opener.

⚠️ **THE COMMENT IS A `//` LINE COMMENT, NOT A `{/* */}` JSX ONE, AND THAT WAS FORCED.** The opener
sits in the else-arm of a ternary, where the arm must be a single expression — a JSX comment there is
a parse error (`TS1005`). It was written as a JSX comment first, failed to compile, and was converted.
**No structure was added to accommodate it.**

**The four dashboard comments** at `:2210, :2976, :3147, :3158` were updated to say `Manage event`.

---

# FIX 2 — THE SHARED MODAL CARRIES NO NAME OF ITS OWN. NOTHING TO RENAME.

```tsx
          <h3 className="font-black text-slate-900">{event.venue_name}</h3>
```

# ✅ ITS HEADING IS THE VENUE NAME, PASSED IN AS A PROP. There is no "Event actions" string anywhere in `EventActionsModal.tsx`, so there was never a third name — and the file is **unmodified, 7,492 bytes before and after.**

⚠️ **That is why the divergence was invisible until the scan:** the modal never named itself, so the
two surfaces' openers were the only place the name existed, and they were edited in separate tasks.

---

# FIX 3 — `Screen & sound`, AND ✅ IT IS THE KDS's OWN WRAPPER

```tsx
                <h3 className="text-sm font-bold text-slate-900">Screen &amp; sound</h3>
```

# 🔴 CONFIRMED — IT IS **NOT** `ThisDeviceSettings`. NO STOP WAS NEEDED.

The heading sits in the KDS page's own sheet markup, above the two rows it names; the shared
`ThisDeviceSettings` card is mounted **below** it, behind its own `isNativeApp() && !isDemo` gate, and
**keeps its own "This device" heading.** ✅ **`components/native/OperatorDeviceConfig.tsx` is not in
the diff, so the dashboard's UserMenu is untouched.**

✅ **The steps opener keeps `This screen`** — the collision is closed from the other side, and the new
heading is accurate: that block holds exactly **Keep the screen on** and **New-order sound**.

---

# FIX 4 — `OrderCard`'s PROP DOCS NAME THE CURRENT LABEL

```
 *  the type size and the item renderer. A Payment-&-handover-off device resolves `boardMode` to 'cook',
 *    `viewMode`  — Payment & handover. When the order leaves, and therefore which buttons exist.
```

**Comment-only — the file grew by 2 bytes and its non-ASCII census did not move at all.**

---

# 🔴 THE SCAN — EVERY REMAINING OCCURRENCE, REPO-WIDE

**EXECUTED across `app/`, `components/`, `lib/`, `supabase/`.**

# ✅ ZERO LIVE LABELS, HEADINGS, `aria-label`s, `title`s OR TOOLTIPS CARRY AN OLD NAME. FOUR OCCURRENCES REMAIN, ALL HISTORICAL, ALL DELIBERATE.

| Site | What it is | Deliberate? |
|---|---|---|
| `kds/page.tsx:2118` | *"This read 'Event actions' until V11.25 marked the rename…"* | ✅ **YES — the record of why the name changed.** Deleting it invites the reverse rename |
| `page.tsx:2998` | the same coupling note on the dashboard's opener | ✅ **YES**, same reason |
| `kds/page.tsx:1809` | *"It was 'Payment/Collected' — two internal statuses and a slash that reads as 'or'."* | ✅ **YES** |
| `>Steps<` | — | ✅ **ZERO occurrences.** The `showStepsPanel` identifiers remain and are code, not copy |

⚠️ **ONE STALE CROSS-REFERENCE WAS FOUND AND FIXED IN PASSING, AND IT IS EXACTLY THE CLASS THIS TASK
EXISTS TO CLOSE.** `kds/page.tsx:2103` read *"Same reasoning as the dashboard's **Event actions**
menu"* — true when written, **false the moment Fix 1 landed**, since the dashboard's is now `Manage
event` too. **A comment describing a neighbouring surface goes stale when that surface is renamed.**

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and **each of the four files
produces a lint finding set identical to its own HEAD version** (`eslint --stdin`): dashboard 108/108,
KDS 21/21, `OrderCard` 5/5, `EventActionsModal` 0/0.

| Required claim | Method |
|---|---|
| Both openers read `Manage event`, both accessible names match | ✅ **EXECUTED** — all three visible strings and both `aria-label`s quoted from source; the scan finds no old label |
| The shared modal carries no third name | ✅ **EXECUTED** — zero `Event actions` occurrences in `EventActionsModal.tsx`; its heading is `{event.venue_name}`, and the file is **unchanged in bytes** |
| The device sheet reads `Screen & sound`, the steps opener still `This screen` | ✅ **EXECUTED** — both quoted; `OperatorDeviceConfig.tsx` is not in the diff |
| `OrderCard`'s prop docs name the current label | ✅ **EXECUTED** — both lines quoted, zero `Payment/Collected` left in that file |
| No live label carries an old name | ✅ **EXECUTED** — the scan above; **4 remain, every one inside a comment explaining the rename** |
| 🔴 **The dashboard diff is text nodes and attributes only, class strings character-identical** | ✅ **EXECUTED.** `git diff` on the dashboard contains **exactly one changed line carrying a `className`** — the `<h3>` — and its class string is **character-identical**; only the text after `</span>` moved. **No `onClick`, `useState`, `useCallback` or `disabled` line is in the diff.** The two `aria-label`s are added attributes, not changed classes |
| `Cook` and `Ready step` unchanged | ✅ **EXECUTED** — no diff line touches either |

## 🔴 NOT VERIFIED

- **NOTHING WAS RENDERED, TAPPED, OR READ BY ASSISTIVE TECH.** No `next dev`, no `next build`, no
  device, **no screen reader and no voice control** — so "voice control now matches on both surfaces"
  is a claim about attributes.
- ⚠️ **This edits Pizzeria Gusto's live path.** The change is three visible strings and two added
  attributes, and the diff shape above is the whole of the evidence that nothing else moved.

---

# INTEGRITY

## Byte scan and census — all four files

**Byte-level tool (Python over `open(…,'rb')`), never grep.** ⚠️ **The KDS page's "before" is this
session's working copy, not HEAD.**

| File | bytes | lines | classes | occurrences | NUL · control · CR · TAB |
|---|---|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 389,542 → **390,059** | 5,022 → 5,028 | **53 → 53** | 3451 → **3452** | 0 · 0 · 0 · 0 |
| `app/dashboard/[token]/kds/page.tsx` | 187,616 → **188,200** | 2,647 → 2,653 | **33 → 33** | 3031 → **3035** | 0 · 0 · 0 · 0 |
| `components/dashboard/OrderCard.tsx` | 107,664 → **107,666** | 1,520 → 1,520 | **31 → 31** | 2089 → **2089** | 0 · 0 · 0 · 0 |
| `components/shared/EventActionsModal.tsx` | 7,492 → **7,492** | 131 → 131 | **9 → 9** | 120 → **120** | 0 · 0 · 0 · 0 |

# ✅ NO FILE GAINED OR LOST A CHARACTER CLASS, AND THE TOTAL CENSUS MOVED BY **FIVE OCCURRENCES** ACROSS FOUR FILES — which is what a copy-only change should look like.

**Carrier-aware check on the sources:** `U+26A0` is fully paired in the KDS page (111/111) and the
shared modal (5/5); the dashboard page has **2 bare** and `OrderCard` **2 bare** — ⚠️ **all four
pre-existing and unchanged** (`OrderCard`'s are the `⚠️ PAYMENT NOT RECORDED` / `⚠️ Last update didn't
sync` conflict markers, which are rendered text the source writes bare).

## This report — SEPARATE pass, run AFTER writing

```
docs/event-actions-rename-report.md   bytes 11,266
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 9 | 0 | 9 |
| U+2705 ✅ | 25 | 0 | 25 |
| **U+26A0 ⚠️** | **11** | **11** | ✅ **0** |
| U+1F512 🔒 | 3 | 0 | 3 |

`U+1F534`, `U+2705` and `U+1F512` have **emoji presentation by default** — bare is correct for all
three. **`U+26A0` is the only base here that defaults to TEXT presentation**, and ✅ **every one of its
11 occurrences is PAIRED — 11 OF 11, ZERO BARE.** ⚠️ **`U+25BE ▾` is quoted as a label
glyph and is not an emoji-presentation base.** Total `U+FE0F` = 11, exactly the 11 paired
warnings.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
```

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/page.tsx` · `M app/dashboard/[token]/kds/page.tsx` · `M components/dashboard/OrderCard.tsx` | ⚠️ **BOTH** — all three were already modified by earlier tasks this session; **this task added copy edits to them** |
| 🔴 `?? docs/event-actions-rename-report.md` | 🔴 **THIS TASK** — this file, the only new entry |
| `M docs/reference-manual.md` · `?? docs/kds-event-isolation-report.md` | ✅ pre-existing |
| `M app/api/dashboard/action/route.ts` · `M lib/native/orderGate.ts` · `M lib/native/useGatedActionResult.tsx` · `M components/dashboard/PaymentActionsModal.tsx` | ✅ pre-existing — the payment-method and modal-backdrop tasks |
| the eleven other `?? docs/*.md` | ✅ pre-existing — the preceding tasks' reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
