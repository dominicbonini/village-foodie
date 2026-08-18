# KDS phone — `Screen settings` expands in place again. No sheet.

**File changed — ONE source file:** `app/dashboard/[token]/kds/page.tsx`.
**Also written:** `docs/kds-phone-expand-final-report.md` (this file).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

🔴 **TWO THINGS DO NOT FIT AND ARE REPORTED RATHER THAN SOLVED BY SHORTENING A LABEL, AS INSTRUCTED:**
line 3's label cannot share a row with its two options (413px against 358px at 390px), and line 4's two
controls cannot share a row below 430px (396px against 358px). **Both wrap to a tidy second row instead
of overflowing, so the region is 4 LOGICAL lines but 6 VISUAL rows at 375–390px. §2.5 gives every
figure and three proposals.**

---

# THE MODEL AND ITS ERROR BAR

**MEASURED BY MODEL, NOT RENDERED.** Helvetica's published advance widths (units/1000 em — the closest
public metric set to the `-apple-system` / SF Pro Text stack), scaled to the Tailwind size in force,
plus the real padding and gap values read out of the class strings: `text-xs` = 12px, `text-sm` = 14px,
`px-2.5` = 10px a side, `px-3` = 12px a side, `gap-1` = 4, `gap-1.5` = 6, `gap-2` = 8, `gap-x-3` = 12,
`p-1` = 4. Emoji at 1.15em. ⚠️ **±5%** — SF Pro Text is slightly narrower, so the model runs
**pessimistic**. **Content width = viewport − `px-4`: 320 → 288 · 375 → 343 · 390 → 358 · 430 → 398.**

---

# CHANGE 1 — IT EXPANDS IN FLOW AND PUSHES THE BOARD DOWN

```tsx
        {phoneOpen && (
          <div className="w-full sm:hidden flex flex-col gap-2 pt-1">
```

🔴 **`w-full` INSIDE THE HEADER'S OWN `flex-wrap` ROW.** It is an ordinary flex child claiming the full
width, so it wraps onto its own line and **the header simply gets taller**; the header is
`flex-shrink-0` in the page's `h-dvh flex-col` column, so the board below — `flex-1 min-h-0` — shortens
by exactly that height and scrolls inside what is left.

✅ **EXECUTED:** a scan of every line from `{phoneOpen && (` to `</header>` finds **no `fixed`, no
`absolute`, no `z-`, no backdrop and no scroll lock.** **The board is never covered.**

**The toggle:**

```tsx
          onClick={() => setPhoneOpen(v => !v)}
          aria-expanded={phoneOpen}
          …
          Screen settings
          <span aria-hidden className={`text-slate-400 transition-transform ${phoneOpen ? 'rotate-180' : ''}`}>▾</span>
```

| Question | Answer |
|---|---|
| Where does the state live? | React state in the page component. **No storage key added** |
| Survives renders and polls? | ✅ **Yes** — `fetchAll` never touches it |
| Survives a reload? | 🔴 **No** — a reload reopens collapsed |
| Auto-collapse? | ✅ **None.** ✅ **EXECUTED — `setPhoneOpen` has exactly ONE caller in the file, the toggle's own `onClick`.** No effect, no timer, no poll |

**Everything the last task settled is kept:** ✅ no state badges anywhere on the row, ✅ `Screen on` /
`Screen off` in words, ✅ the `🔔`/`🔕` sound toggle, ✅ the row's shrink rules.

---

# CHANGE 2 — THE EXPANDED LAYOUT

| Line | Controls | Labels taken from |
|---|---|---|
| **1** | `List` `Grid` · `Full` `Cook` | the header segments' own button text, verbatim |
| **2** | `Ready step` **On** · `Payment & handover` **Off** | the two switches' own `hidden sm:inline` labels, verbatim |
| **3** | `New order sound` → `Only orders needing confirming` / `All new orders` | the dashboard's heading and both option strings, verbatim |
| **4** | `Sound when an order is due to be cooked` **On/Off** · `Device settings` | the dashboard's label, verbatim; the opener takes the 📱 button's own accessible name |

## 2.1 🔴 NO HELPER SENTENCE SURVIVES ANYWHERE IN THE REGION

✅ **EXECUTED — `Sounds when a ticket turns amber.` is GONE from this file entirely** (0 occurrences),
along with `Stops this device dimming or locking during service…` and `Dings when a new order lands…`
below `sm:`. ⚠️ **The two `Dings…` / `Stops…` sentences still exist at `sm:` and above, inside the
panel's `hidden sm:flex` card, because those widths must not change.** The only string in the region
that is not a control label is line 3's `New order sound` heading, which is the setting's name.

## 2.2 State inside the chip, everywhere

```tsx
                <span>Ready step</span><span className="font-bold">{readyOn ? 'On' : 'Off'}</span>
                <span>Payment &amp; handover</span><span className="font-bold">{handoverOn ? 'On' : 'Off'}</span>
                <span>Sound when an order is due to be cooked</span>
                <span className="font-bold">{(storedSoundCfg ?? DEFAULT_SOUND_CONFIG).order_due ? 'On' : 'Off'}</span>
```

🔴 **Line 4's control carries the pattern through, as instructed.** Same handlers, same `disabled` rule
on the two switches (neither can be turned off while it is the only step the screen performs), same
`writeSoundConfig` on the shared `hg_soundcfg_` key with `soundConfigRef` updated alongside.

## 2.3 Line 3 is segmented, not radios

The two options share one `bg-slate-100 rounded-lg p-1` track and the selected one is white — **exactly
the `List`/`Grid` shape one line above**, so it reads as one setting with two states. Same key, same
writer, same ref update as the panel's copy at `sm:`+.

## 2.4 The four lines, measured

| Line | Model | 320 (288) | 375 (343) | 390 (358) | 430 (398) |
|---|---|---|---|---|---|
| 1 — display | **212.7px** | ✅ +75 | ✅ +130 | ✅ +145 | ✅ +185 |
| 2 — steps | **282.0px** | ⚠️ **+6.0** | ✅ +61 | ✅ +76 | ✅ +116 |
| 3 — label | 95.5px | ✅ | ✅ | ✅ | ✅ |
| 3 — options | **309.7px** | 🔴 **−21.7** | ✅ +33 | ✅ +48 | ✅ +88 |
| 4 — due + opener | **395.9px** | 🔴 **−107.9** | 🔴 **−52.9** | 🔴 **−37.9** | ✅ **+2.1** |
| 4 — due alone | 278.9px | ✅ +9 | ✅ +64 | ✅ +79 | ✅ +119 |

## 2.5 🔴 SO IT IS FOUR LOGICAL LINES AND SIX VISUAL ROWS — SAID PLAINLY, NOT ROUNDED

| Viewport | Visual rows | Why |
|---|---|---|
| **320px** | 🔴 **7** | line 3's options wrap (−21.7), line 4 wraps (−107.9), plus the label row; line 2 clears by only 6.0px |
| **375px** | **6** | the label row + line 4 wrapping |
| **390px** | **6** | same |
| **430px** | **5** | only the label row |

**Three things cause it, and none of them can be fixed without shortening a label you told me not to
shorten:**

1. 🔴 **`New order sound` cannot sit on the options row: 95.5 + 8 + 309.7 = 413.2px against 358px.** It
   is therefore its own row — the only structural decision I made here.
2. 🔴 **`Sound when an order is due to be cooked` is 279px on its own** — it and any second control
   exceed every width except 430px.
3. ⚠️ **At 320px the two options are 21.7px too wide together.** You asked to be told: **this is that.**

**PROPOSED, NOT APPLIED:**
1. ⭐ **Drop the `New order sound` label row.** The two options say what they are (`Only orders needing
   confirming` / `All new orders`), and the setting has no sibling to be confused with in this region.
   **375px and up become 5 rows and 320px becomes 6.** No label is shortened — one is deleted, which is
   your call, not mine.
2. **Give line 4 two deliberate rows** — the due-to-cook chip on one, `Device settings` under it —
   rather than relying on wrap. Same row count, tidier at 430px where it currently sits on one.
3. **Accept the wrap.** `flex-wrap` is already on lines 3 and 4, so nothing overflows or clips at any
   width; the region is simply taller, and it pushes rather than covers.

---

# CHANGE 3 — THE NATIVE DEVICE BLOCK

**It is NOT expanded inline. It stays behind its own opener on line 4:**

```tsx
              {isNativeApp() && !isDemo && (
                <button type="button" onClick={() => setDeviceOpen(true)} …>
                  Device settings
                </button>
              )}
```

**How it is done, exactly:**

| Piece | Before this task | Now |
|---|---|---|
| The opener on a phone | none — the panel held everything | 🔴 **line 4's `Device settings` button, carrying the SAME `isNativeApp() && !isDemo` gate as the block**, so on web or in demo it does not exist and cannot open an empty panel |
| The panel's phone contents | display segments, step switches, sound rows, native card | 🔴 **the native card and nothing else.** The whole sound card is now `hidden sm:flex`, so below `sm:` the panel renders `ThisDeviceSettings` alone |
| `ThisDeviceSettings` gate | `isNativeApp() && !isDemo` | ✅ **unchanged, at the same mount point** |
| The panel's heading | `Screen settings` / `Device settings` pair | `Device settings` at both widths — **the same words the `sm:`+ heading always had, and now the same words as the phone opener** |

⚠️ **Truck/van rebinding, default screen, notifications and app-lock are set-once settings and are
deliberately NOT among the per-service controls** — that is the reason for the separate opener, and it
is written into the file beside it.

---

# CHANGE 4 — `Test Kitchen— Van1`

## 4.1 🔴 THE CAUSE, WHICH WAS MINE

**Two tasks ago I split the name into two spans** so the truck could truncate while the van survived:

```tsx
          <span className="font-medium text-slate-900 flex min-w-0">
            <span className="truncate …">{truck.name}</span>
            {vanName ? <span …>{` — ${vanName}`}</span> : null}
```

🔴 **THE OUTER SPAN IS `flex`, SO EACH CHILD IS A FLEX ITEM — AND A FLEX ITEM'S OWN LEADING WHITE-SPACE
IS STRIPPED.** The string was ` — Van1`, so the space before the em dash was removed at layout time and
the two runs butted together: `Test Kitchen— Van1`. **Before the split it was one text node and the
space rendered normally.** The van being `shrink-0` had nothing to do with it; **making the name two
boxes did.**

## 4.2 The fix

```tsx
            {vanName ? <span className="truncate shrink min-w-0">{` — ${vanName}`}</span> : null}
```

🔴 **A NO-BREAK SPACE, WRITTEN AS THE ESCAPE ` `.** NBSP is not collapsible white-space, so it
survives being first in a flex item. **In this font it has the same advance as the space it replaces
(278/1000 em, identical), which is why `sm:` and above is pixel-unchanged.** ⚠️ **Written as an escape
rather than a literal deliberately: a literal NBSP is invisible to the next reader and would add a
character class to this file. The escape is ASCII on disk.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the KDS: 21 problems (18 errors, 3 warnings) — identical
to HEAD and to every task this session.**

| Required claim | Method |
|---|---|
| Expanding pushes the board down, does not overlay | ✅ **EXECUTED** — no `fixed`, `absolute`, `z-` or backdrop anywhere between `{phoneOpen && (` and `</header>`; the block is a `w-full` flex child of a `flex-wrap` header that is `flex-shrink-0` above a `flex-1 min-h-0` board. ⚠️ **Not rendered** |
| Four lines and no more at 320/375/390/430 | 🔴 **FOUR LOGICAL LINES; SIX VISUAL ROWS at 375–390, seven at 320, five at 430.** ⚠️ **MODEL, ±5%** — every figure in §2.4, every cause and three proposals in §2.5. **This is the one requirement not met, and it is not met because meeting it needs a label shortened** |
| No helper sentence remains | ✅ **EXECUTED** — `Sounds when a ticket turns amber.` has 0 occurrences in the file; the region contains no prose but control labels and line 3's setting name |
| The collapsed row still cannot wrap | ⚠️ **MODEL** — unchanged from the last task except the toggle gaining a chevron (110.4 → 128.2px). **Line A = 173.6px fixed + a name budget of 102/157/172/212px at 320/375/390/430; line B = `Screen settings` + `Manage event` = 257.5px, which fits 288 at 320px with 30.5px spare.** Two lines by your earlier decision, neither overflowing |
| Name and van render with a space | ✅ **EXECUTED (source)** — ` ` before the em dash; cause diagnosed in §4.1. ⚠️ **Not rendered — verify on the device that reported it** |
| The native block is gated and behind its own opener | ✅ **EXECUTED (source)** — `isNativeApp() && !isDemo` on both the opener and the mount; the sound card is `hidden sm:flex` so the phone panel holds only that card |
| `sm:` and above unchanged | ✅ **AS CLOSE TO PROOF AS SOURCE ALLOWS.** Every edit is one of five kinds: (a) new elements inside the `sm:hidden` expanded region; (b) removals from the panel of things that were `sm:hidden`; (c) `hidden sm:flex` on the panel's sound card — it was `flex`, and `sm:flex` is the same `display` at those widths; (d) the `<h2>` losing its breakpoint spans while rendering the identical `Device settings` text at `sm:`+; (e) ` ` for a space of identical advance. 🔴 **No control that renders at `sm:`+ was added, removed, restyled or reworded.** ⚠️ **Not rendered** |
| The dashboard is untouched | ✅ **EXECUTED** — `app/dashboard/[token]/page.tsx` **390,931 bytes**, unchanged across all four KDS tasks; `EventActionsModal.tsx` 10,494 and `ExtraWaitModal.tsx` 2,849 unchanged; nothing under `app/api` in the diff |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED.** Every width is arithmetic over published font metrics, ±5%.
- 🔴 **THE FOUR-LINE TARGET IS MISSED AT EVERY WIDTH BELOW 430px**, by the amounts in §2.4.
- ⚠️ **Line 2 clears 320px by 6.0px — inside the error bar.** If it wraps there, it wraps to two tidy
  rows; nothing clips.
- **The NBSP fix is verified in source, not on the device that showed `Test Kitchen— Van1`.**

---

# INTEGRITY

⚠️ **"BEFORE" IS THE FIGURE THE PREVIOUS REPORT RECORDED FOR THIS FILE** — the tree was already dirty and
`checkout` is forbidden. **The census is also checked against `HEAD`.**

```
app/dashboard/[token]/kds/page.tsx
BEFORE (end of the previous task)   216,158 bytes
AFTER                               221,458 bytes · 214,061 chars · 2,983 lines
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after; `added-vs-HEAD: none`, `removed:
none`.** Occurrences 3,559 → 3,598. **Carrier-aware on the source: `U+26A0` n=132, 132 paired, ✅ 0
bare; `U+2600` n=5, 5 paired, ✅ 0 bare.**

🔴 **ONE CHARACTER WAS INTRODUCED AND REMOVED BEFORE THIS REPORT WAS WRITTEN:** `U+25B4 ▴` — in a
comment explaining that U+25B4 would be a new character class. **The pass caught its own subject.** It
now reads `U+25B4` in words. **Fifth task running that this pass has caught something.**
⚠️ **AND THE NBSP DELIBERATELY DID NOT ADD ONE** — ` ` is written as an ASCII escape, so the file's
bytes are unchanged in class terms while the rendered output gains the space.

## This report — a SEPARATE pass, run AFTER writing

```
docs/kds-phone-expand-final-report.md   bytes 18,296
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 28 | 0 | 28 |
| U+26A0 (warning sign — TEXT presentation) | 15 | 15 | 0 |
| U+2705 (check mark button) | 40 | 0 | 40 |
| U+2B50 (star) | 1 | 0 | 1 |
| U+1F4F1 (mobile phone) | 1 | 0 | 1 |
| U+1F515 (bell with slash) | 1 | 0 | 1 |
| U+1F514 (bell) | 1 | 0 | 1 |
| U+25BE (triangle — TEXT presentation) | 1 | 0 | 1 |

U+26A0 and U+2600 are the two bases used as emoji here that have TEXT presentation by default,
and every occurrence of each is PAIRED with U+FE0F. U+2713 and U+25BE are bare because they are
quoted from source, where this codebase leaves them bare by design. The rest have emoji
presentation by default, so bare is correct for them.

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
| 🔴 `?? docs/kds-phone-expand-final-report.md` | 🔴 **THIS TASK** — this file |
| `M app/dashboard/[token]/page.tsx`, `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, `?? docs/kds-view-panel-report.md`, `?? docs/kds-phone-expand-report.md`, `?? docs/kds-phone-width-fix-report.md`, `?? docs/kds-phone-controls-final-report.md` | ✅ pre-existing — the four previous KDS tasks; **none touched by this one** |
| `M app/landing/*`, `M lib/plan-features.ts`, `?? docs/landing-features-move-report.md` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
