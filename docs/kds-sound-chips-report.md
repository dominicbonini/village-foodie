# KDS phone panel — the sound scope becomes two chips in one box

> 🔴 **AMENDED AFTER THE FIRST WRITE, ON INSTRUCTION: "dont change the wording to Ding: keep previous
> wording".** The chips now read **`Only orders needing confirming` / `All new orders`** — the
> dashboard's words, unchanged — and the two surfaces AGREE again. **§1.1 and §1.2 below carry the
> widths for both wordings; the row counts in §3.1 are restated for the restored one.** Everything else
> in this report stands: one box, green selection, `radiogroup` semantics, the no-op guard, `self-start`.

**File changed — ONE source file:** `app/dashboard/[token]/kds/page.tsx`.
**Also written:** `docs/kds-sound-chips-report.md` (this file).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled.** ⚠️ **ONE INSTRUCTION SUPERSEDED ANOTHER INSIDE THE SAME
MESSAGE AND I FOLLOWED THE LATER ONE, WHICH IS STATED HERE RATHER THAN ASSUMED SILENTLY.** Change 1 asks
for "two SEPARATE CHIPS"; your closing paragraph says *"in fact new order sound doesnt need splitting
into 2 boxes if one is green"*. **Built: two chips inside ONE box, the selected one green.** The
closing paragraph also diagnosed the empty space — that is fixed in §1.3. **If you meant two detached
boxes after all, it is a one-class edit.**

---

# 1 — THE CHIPS

## 1.1 🔴 THE WIDTHS, BEFORE COMMITTING TO THE WORDING

**MEASURED BY MODEL, ±5%.** Helvetica advance widths (the closest public metric set to the
`-apple-system` / SF Pro Text stack), `text-xs` = 12px, `px-3` = 12px a side, `gap-1` = 4, `p-1` = 4.
**Content width = viewport − `px-4`: 320 → 288 · 375 → 343 · 390 → 358 · 430 → 398.**

| Wording | Chip 1 | Chip 2 | One box | 320 | 375 | 390 | 430 |
|---|---|---|---|---|---|---|---|
| 🔴 **`Ding: needs confirming` / `Ding: all orders`** | 152.2 | 108.3 | **272.6px** | ✅ **+15.4** | ✅ +70.4 | ✅ +85.4 | ✅ +125.4 |
| the dashboard's `Only orders needing confirming` / `All new orders` | 198.2 | 103.4 | **313.7px** | 🔴 **−25.7** | ✅ +29.3 | ✅ +44.3 | ✅ +84.3 |

🔴 **AMENDED: THE DASHBOARD'S WORDING IS USED, ON YOUR INSTRUCTION, AND IT DOES NOT FIT 320px.** The
short pair fitted all four widths and was rejected — correctly, because one setting must not acquire a
second vocabulary on the way to a second surface. **The consequence is the bottom row of that table:
313.7px against 288px at 320px, so `flex-wrap` is on the track and the second chip drops to a second
line INSIDE the grey box there. 375px and up are one row, with 29.3 / 44.3 / 84.3px of clearance.**
⚠️ **Nothing overflows or clips at any width; only 320px costs a row.**

## 1.2 ✅ THE TWO SURFACES AGREE — THE DIVERGENCE WAS PROPOSED AND REVERSED

| Surface | Wording |
|---|---|
| Dashboard settings card | `New order sound` → `Only orders needing confirming` / `All new orders` — **unchanged, not touched** |
| KDS panel at `sm:` and above | 🔴 **the same as the dashboard's — unchanged** |
| **KDS phone panel** | ✅ **`Only orders needing confirming` / `All new orders` — the same words, after the amendment** |

**Same key, same stored values (`needs_confirming` / `all`), same writer, and now the same words on all
three surfaces.** ⚠️ **THE PRICE OF AGREEING IS THE 320px ROW** (313.7 of 288) **and the loss of the
scope word: with the `New order sound` heading gone, nothing VISIBLE on the phone says these two chips
are about sound** — the `radiogroup`'s `aria-label` says it to assistive tech only. **If that reads
badly on the device, the fix is a heading row back (costing a row at every width) or the shorter
wording; both are yours to call.**

## 1.3 The empty space you spotted — cause and fix

```tsx
            <div role="radiogroup" … className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 self-start">
```

🔴 **`self-start` IS THE FIX, AND THE CAUSE WAS THE PARENT.** The expanded region is
`flex flex-col`, whose default `align-items: stretch` makes every child full width — so the grey track
ran to the edge of the screen with the second chip floating in ~85px of empty grey. The other lines
never showed it because they are `flex` ROWS, where children are content-sized. **`self-start` opts this
one box out of the stretch, so the track now ends where the words end.**

---

# 2 — 🔴 THE TOGGLE/RADIO AMBIGUITY

## 2.1 What was done

```tsx
            <div role="radiogroup" aria-label="New order sound" …>
                  <button key={val} type="button" role="radio" aria-checked={selected}
                    onClick={() => {
                      if (selected) return
                      const next = { ...(storedSoundCfg ?? DEFAULT_SOUND_CONFIG), new_orders: val }
                      writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
                    }}
```

| Control | Role | State | A screen reader says |
|---|---|---|---|
| `Ready step On` | plain `<button>` + `aria-pressed` | pressed / not | **"toggle button, pressed"** |
| `Payment & handover Off` | plain `<button>` + `aria-pressed` | pressed / not | **"toggle button, not pressed"** |
| `Sound when an order is due to be cooked On` | plain `<button>` + `aria-pressed` | pressed / not | **"toggle button, pressed"** |
| 🔴 **`Ding: needs confirming`** | 🔴 **`role="radio"` in a `role="radiogroup"`** | `aria-checked` | 🔴 **"radio button, selected, 1 of 2"** |

✅ **The group carries `aria-label="New order sound"`** — required, because the visible heading that
named it was removed. **The name the assistive tech announces is therefore still the dashboard's word
for this setting, even though the visible chips are not.**

## 2.2 🔴 THE HONEST ANSWER ON THE VISUAL SIDE: THEY STILL LOOK ALIKE, AND I AM NOT SHIPPING THAT QUIETLY

**To assistive tech they are now unambiguous.** **To a sighted operator they are not fully
distinguished, and you should decide whether that is acceptable:**

- ✅ **The one real visual cue is the shared grey track.** The two radios sit inside one
  `bg-slate-100 rounded-lg p-1` box; every toggle beside them is a free-standing chip with no track.
  That is the same shape `List`/`Grid` uses for a choice, so the language is at least internally
  consistent — **a track means "pick one of these", a lone chip means "this switches".**
- 🔴 **But the ACTIVE state is now identical**: `bg-green-100 text-green-700` on both, by your
  instruction that one colour language runs across the panel.
- ⚠️ **So the honest statement is: the container distinguishes them, the chip itself does not.** If that
  is not enough, the cheapest fix that does not touch the palette is a hairline divider between the two
  radios inside the track, or restoring the white `shadow-sm` treatment for radio selection only —
  **both are visual-only and neither is applied, because you asked for the same green.**

## 2.3 Tapping the selected chip writes nothing — confirmed

```tsx
                      if (selected) return
```

✅ **EXECUTED (source): the guard is the FIRST statement in the handler**, so on the selected chip there
is no `writeSoundConfig`, no `setStoredSoundCfg`, no `soundConfigRef` assignment and no re-render.
🔴 **The value written by the OTHER chip is unchanged** — `{ ...current, new_orders: val }` with `val`
still `'needs_confirming'` or `'all'`, through `writeSoundConfig` on the shared `hg_soundcfg_` key.
**`readSoundConfig` and `DEFAULT_SOUND_CONFIG` were not touched.**

---

# 3 — WHAT IT RECOVERED, AND THE COLOUR CHANGE YOU ADDED

## 3.1 Visual rows, before and after

**MODEL, ±5%.** The heading row is gone; nothing else about the region's structure changed.

| Viewport | Before | 🔴 **After** | What still costs a row |
|---|---|---|---|
| **320px** | 7 | 🔴 **6** | line 4 wraps (−107.9px); **the restored wording wraps inside its track (−25.7px)**; line 2 clears by only +6.0px |
| **375px** | 6 | 🔴 **5** | line 4 wraps (−52.9px) |
| **390px** | 6 | 🔴 **5** | line 4 wraps (−37.9px) |
| **430px** | 5 | 🔴 **4** | ✅ **nothing — four lines, four rows** |

✅ **Closer to four at every width, and exactly four at 430px.** ⚠️ **320px is 6 rather than 5 because
the restored wording needs two lines inside its track there — the cost of matching the dashboard.** 🔴 **The only remaining excess below
430px is the one you put out of scope: `Sound when an order is due to be cooked` (278.9px) plus
`Device settings` (109.0px) needs 395.9px.**

⚠️ **THIS CHANGE DOES NOT AFFECT THAT OVERFLOW AND WAS NOT ALLOWED TO — reported, not fixed.** Line 4's
two controls are untouched; their widths are the same as in the previous report.

## 3.2 The colour change to `List`/`Grid` and `Full`/`Cook`

**Done as asked: the same green for the active one, and the two boxes are NOT split into separate
chips** — each pair keeps its single `bg-slate-100 rounded-lg p-1` track.

| | Selected treatment |
|---|---|
| Phone panel (`sm:hidden`) | 🔴 **`bg-green-100 text-green-700`** |
| The header's own segments at `sm:`+ | ✅ **`bg-white text-slate-900 shadow-sm` — unchanged, because those widths must be byte-identical** |

⚠️ **SO THE SAME CONTROL IS GREEN-SELECTED ON A PHONE AND WHITE-SELECTED ON A TABLET.** That is forced
by the byte-identical rule, not chosen. ⚠️ **AND A GAP IS LEFT OPEN DELIBERATELY: those two pairs are
choices, not toggles, exactly like the sound pair — but they remain plain buttons with no `radiogroup`
semantics, because the display controls are on this task's DO-NOT list and only their colour was
asked for.** Say the word and they get the same roles.

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint`: 21 problems (18 errors, 3 warnings) — identical to HEAD and
to every task this session.**

| Required claim | Method |
|---|---|
| The two chips fit one row at 320/375/390/430 | ⚠️ **MODEL, ±5% — AND THE HONEST ANSWER AFTER THE AMENDMENT IS "AT THREE OF THE FOUR".** The dashboard's wording is 313.7px: ✅ 375 (+29.3), ✅ 390 (+44.3), ✅ 430 (+84.3), 🔴 **320 (−25.7) — one row inside the track becomes two.** `flex-wrap` keeps it tidy; nothing clips. **Not rendered** |
| The selected chip is green, matching `Ready step On` | ✅ **EXECUTED (source)** — both use the literal `bg-green-100 text-green-700`; a scan of the phone region finds **0** occurrences of the old `bg-white … shadow-sm` selection and 8 of the green one |
| The pair is a radiogroup, distinct from the toggles | ✅ **EXECUTED (source)** — one `role="radiogroup"` with `aria-label`, two `role="radio"` + `aria-checked` children; the three neighbouring controls remain `aria-pressed` buttons. 🔴 **The VISUAL distinction is only the shared track — §2.2, said plainly** |
| Tapping the selected chip writes nothing | ✅ **EXECUTED (source)** — `if (selected) return` precedes every write. ⚠️ **Not exercised in a browser** |
| The value written is unchanged | ✅ **EXECUTED (source)** — same two values, same `writeSoundConfig`, same key, same `soundConfigRef` update. `readSoundConfig`, `DEFAULT_SOUND_CONFIG` and the dashboard's rows are not in the diff |
| The panel's row count, before and after | ⚠️ **MODEL** — 7/6/6/5 → **6/5/5/4** at 320/375/390/430 with the restored wording. §3.1 |
| `sm:` and above unchanged | ✅ **AS CLOSE TO PROOF AS SOURCE ALLOWS — every edit in this task is inside the `{phoneOpen && (…)}` block, which is `sm:hidden`.** ✅ **EXECUTED: the file outside that block still contains the 4 original `bg-white text-slate-900 shadow-sm` selections (the header's segments) and the panel's own which-sounds radios with the dashboard's wording, untouched.** ⚠️ **Not rendered** |
| The dashboard is untouched | ✅ **EXECUTED** — `app/dashboard/[token]/page.tsx` **390,931 bytes**, unchanged across all five KDS tasks; `EventActionsModal.tsx` 10,494 and `ExtraWaitModal.tsx` 2,849 unchanged; nothing under `app/api` in the diff |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED.** Every width is arithmetic over published font metrics, ±5%.
- 🔴 **320px NO LONGER FITS ON ONE ROW** with the dashboard's wording (−25.7px) and wraps inside its
  track. That is a deliberate trade for matching the dashboard's words.
- 🔴 **THE VISUAL TOGGLE/RADIO DISTINCTION RESTS ENTIRELY ON THE SHARED TRACK** — §2.2.
- ✅ **The two surfaces word this setting identically again** — §1.2 — but nothing visible on the phone
  now names the setting as a SOUND setting; only the `aria-label` does.

---

# INTEGRITY

⚠️ **"BEFORE" IS THE FIGURE THE PREVIOUS REPORT RECORDED FOR THIS FILE** — the tree was already dirty and
`checkout` is forbidden. **The census is also checked against `HEAD`.**

```
app/dashboard/[token]/kds/page.tsx
BEFORE (end of the previous task)   221,458 bytes
AFTER (including the wording amendment)   224,006 bytes · 216,571 chars · 3,009 lines
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after; `added-vs-HEAD: none`, `removed:
none`.** Occurrences 3,598 → 3,614, unchanged by the amendment (the labels are pure ASCII). **Carrier-aware on the source: `U+26A0` n=134, 134 paired, ✅ 0
bare; `U+2600` n=5, 5 paired, ✅ 0 bare.** ⚠️ **The chip labels are pure ASCII, so the census could not
move on their account.**

🔴 **ONE CHARACTER WAS INTRODUCED AND REMOVED BEFORE THIS REPORT WAS WRITTEN:** `U+2026 …`, in a comment
quoting a class string. **Rewritten as `...`. Sixth task running that this pass has caught something.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/kds-sound-chips-report.md   bytes 16,885
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 32 | 0 | 32 |
| U+26A0 (warning sign — TEXT presentation) | 15 | 15 | 0 |
| U+2705 (check mark button) | 31 | 0 | 31 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.

## Working tree

```
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
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M app/dashboard/[token]/kds/page.tsx` | ⚠️ already `M`; 🔴 **THIS TASK wrote to it — the only source file written** |
| 🔴 `?? docs/kds-sound-chips-report.md` | 🔴 **THIS TASK** — this file |
| `M app/dashboard/[token]/page.tsx`, `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, `?? docs/kds-view-panel-report.md`, `?? docs/kds-phone-expand-report.md`, `?? docs/kds-phone-width-fix-report.md`, `?? docs/kds-phone-controls-final-report.md`, `?? docs/kds-phone-expand-final-report.md` | ✅ pre-existing — the five previous KDS tasks; **none touched by this one** |
| `M app/landing/*`, `M lib/plan-features.ts`, `?? docs/landing-features-move-report.md` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
