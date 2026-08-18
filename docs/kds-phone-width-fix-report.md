# KDS phone header — both width failures fixed, no label shortened

**File changed — ONE source file:** `app/dashboard/[token]/kds/page.tsx`.
**Also written:** `docs/kds-phone-width-fix-report.md` (this file).
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `log` and `diff` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any migration, any schema change.

**No span of the prompt arrived garbled.** 🔴 **ONE CONTRADICTION WAS FOUND AND I STOPPED AND ASKED
RATHER THAN CHOOSING — see §3.1.** The DO-NOT list forbids changing `Manage event`; the instruction you
added at the end moves it onto line 3. Separately, the arithmetic made line 3 impossible. **You chose
line 1, and you chose the struck sun over the moon.** Both answers are implemented as given.

**🔴 NOT ONE LABEL WAS SHORTENED OR REWORDED.** `Keep the screen on`, `New-order sound`, `Ready step`,
`Payment & handover`, `List`, `Grid`, `Full`, `Cook` and `Manage event` are all the wide-width wording,
character for character. **The lines were changed, never the words.**

---

# THE WIDTH MODEL, AND ITS ERROR BAR

Every figure below is **MEASURED BY MODEL, NOT RENDERED.** The model is Helvetica's published advance
widths (units/1000 em — the closest public metric set to the `-apple-system` / SF Pro Text stack these
headers actually render in), scaled to the Tailwind size in force, plus the real padding and gap values
read out of the class strings: `text-xs` = 12px, `text-sm` = 14px, `px-2.5` = 10px a side, `px-3` = 12px
a side, `gap-2` = 8px, `gap-x-3` = 12px, `p-1` = 4px. Emoji are counted at 1.15em.

⚠️ **THE ERROR BAR IS ±5%, AND IT IS NOT NOISE — IT IS THE POINT OF THIS TASK.** SF Pro Text is slightly
narrower than Helvetica at small sizes, so the model runs **pessimistic**, which is the right direction.
**±5% on a 340px line is ±17px, which is why "clears by 6px" was never a pass.**
**Content width = viewport − `px-4` (16px a side): 320px → 288 · 375px → 343 · 390px → 358 · 430px → 398.**

---

# FIX 1 — LINE 3

## 1.1 What moved

`Keep the screen on` — **147px of a 358px budget, the longest label on the line and the least-touched
control during service** — is now inside the panel. Line 3 is `New-order sound` and a button renamed
`Screen & sound`.

```tsx
              <button … aria-pressed={soundEnabled} …>
                <span aria-hidden>{soundEnabled ? '🔔' : '🔕'}</span>
                <span>New-order sound</span>
              </button>
              <button type="button" onClick={() => setDeviceOpen(true)} …>
                Screen &amp; sound
              </button>
```

## 1.2 The new width, and the clearance

| Line | Contents | Model | Clearance at 390px |
|---|---|---|---|
| 1 | `List`/`Grid` · `Full`/`Cook` · `Manage event ▾` | **337.9px** | ✅ **20.1px** |
| 2 | `✓ Ready step` · `💷 Payment & handover` | **272.1px** | ✅ **85.9px** |
| **3** | `🔔 New-order sound` · `Screen & sound` | 🔴 **255.2px** | 🔴 **102.8px** |

**Line 3 was 363px against 358px. It is now 255px against 358px — the clearance went from ~6px to
~103px, which is 6× the model's own error bar.** ⚠️ **Line 1 is now the tightest at 20.1px**, still
inside the error bar at 3.4× — see §3.2 for what happens if it is wrong.

## 1.3 🔴 EVERY PLACE `Screen & sound` NOW APPEARS, AND THEY AGREE

| Place | Text | Renders |
|---|---|---|
| The line-3 button | `Screen & sound` | below `sm:` only (inside the `sm:hidden` expanded block) |
| The panel's `<h2>` | `Screen & sound` | below `sm:` only (`<span className="sm:hidden">`) |
| The panel's `<h2>` | `Device settings` | `sm:` and above (`<span className="hidden sm:inline">`) — **unchanged** |
| The panel's inner `<h3>` | `Sound` | `sm:` and above only (`hidden sm:block`) — **unchanged** |

✅ **THE BUTTON AND THE HEADING OF WHAT IT OPENS ARE NOW THE SAME FOUR WORDS**, which is the rule this
file already states for the `📱` button and `Device settings`. **The phrase is not a coinage — it is the
wording this codebase used as that sheet's heading until the screen row left it last task, and the row
has now come back.** ⚠️ **The `Sounds & this device` variant added last task is GONE** — it existed to
name the native block, and `Screen & sound` matching the button beats naming the contents.

## 1.4 ⚠️ `Keep the screen on` IS STILL AN ACQUISITION MECHANISM — CONFIRMED, AND ONE COST IS FLAGGED

```tsx
                <label className="sm:hidden flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-700">Keep the screen on</span>
                  {screenOnBtn(screenHeld ? 'On' : 'Off', true)}
                </label>
```

✅ **IT IS A REAL `<button>` RUNNING THE UNCHANGED `toggleKeepScreenOn` ON A REAL `click`.**
`screenOnBtn` is the same function the `hidden sm:block` header mount calls — **one implementation** —
and its `onClick={toggleKeepScreenOn}`, its `aria-pressed={screenHeld}`, its colours and its binary
"green only when actually held" rule are untouched. **Safari's requirement is a COMPLETED gesture, and a
`<button>`'s `click` is exactly that. Nothing here changed that.**

🔴 **THE COST, STATED BECAUSE YOU ASKED TO BE TOLD: RE-ACQUIRING FROM THIS CONTROL IS NOW THREE TAPS ON
A PHONE** — expand, `Screen & sound`, the chip — where it was two.

🔴 **BUT THE RE-ACQUISITION PATH THAT MATTERS IS NOT THIS ONE, AND IT DID NOT MOVE.** `KeepAwakePrompt`
still renders as a **full-width bar in the banner stack directly under the header** whenever the pref is
on and the lock is not held — the exact state a Safari drop produces — and **one tap on that bar
re-acquires**, because that bar is itself a `<button>` whose `onClick` runs the same acquire path. **The
operator does not have to find the toggle; the screen offers the bar.**

⚠️ **THE CONDITION ON WHICH THIS IS SURVIVABLE, WRITTEN INTO THE CODE AS WELL AS HERE: if
`KeepAwakePrompt` is ever removed or gated, `Keep the screen on` belongs back on line 3.**

---

# FIX 2 — THE COLLAPSED ROW CANNOT WRAP

```tsx
        <div className="flex items-center gap-2 min-w-0 shrink sm:shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="font-medium text-slate-900 flex min-w-0">
            <span className="truncate">{truck.name}</span>
            {vanName ? <span className="shrink-0">{` — ${vanName}`}</span> : null}
          </span>
        </div>
```

## 2.1 🔴 THE VAN SURVIVES. THE TRUCK IS WHAT GIVES WAY.

**A plain `truncate` on the single string would have eaten the END of it — which is precisely where the
van name is.** `"Test Kitchen — Van1"` losing `"Van1"` is the failure you named, and it is the failure a
one-span `truncate` produces every time. **So the truck name is its own `truncate` span and the
` — Van 2` is a `shrink-0` sibling that is always drawn whole:**

| Name | Rendered when space is short |
|---|---|
| `The Long Barn Wood-Fired Pizza Co — Van 2` | 🔴 `The Long Barn Wo... — Van 2` (CSS ellipsis; the van intact) |
| `Test Kitchen — Van1` | `Test Kitc... — Van1` — 🔴 **`Van1` never truncates** |
| `Pizzeria Gusto — Van 1` | untouched at 390px and 430px; truncates only at 320/375 with all three badges |
| `Gusto` | never truncates at any width |

⚠️ **ONE OUTER SPAN, NOT TWO FLEX CHILDREN.** The wrapper carries `gap-2`, so a second child would have
inserted 8px between the truck and the van **at every width, including `sm:`+**. The two spans live
inside the original span instead, so the text is still one run.

## 2.2 Can it wrap? — 320 / 390 / 430px, longest plausible name, all three badges

**The row's FLOOR** — what it needs when the truck name has shrunk away entirely — is
`←` + dot + gap + the van run + the toggle with three badges + two `gap-x-3`:

| Viewport | Available | Floor with ` — Van 1` | Floor with ` — Van 12` | Wraps? |
|---|---|---|---|---|
| **320px** | 288 | **281.0px** ✅ | ⚠️ **288.8px** | ⚠️ **NO by 7px with `Van 1`; AT THE LINE with `Van 12`** |
| **375px** | 343 | 281.0 ✅ | 288.8 ✅ | ✅ **no — 54px spare** |
| **390px** | 358 | 281.0 ✅ | 288.8 ✅ | ✅ **no — 69px spare** |
| **430px** | 398 | 281.0 ✅ | 288.8 ✅ | ✅ **no — 109px spare** |

🔴 **AT 390px AND 430px THE ROW CANNOT WRAP FOR ANY NAME OF ANY LENGTH — the floor is 69–109px inside
the budget, and the name absorbs everything above it.** ✅ **375px is equally safe.**

⚠️ **320px (iPhone SE 1st gen / 5s) IS AT THE BOUNDARY IN ONE CASE:** a two-character van number
(`— Van 12`) **and** all three badges gives 288.8px against 288px. **That is 0.8px over on a model with a
±5% error bar, so it is genuinely undecidable without hardware — and it is reported rather than rounded
away, which is the whole reason this task exists.** Removing the pause button from the phone row bought
~104px and is what makes every other case comfortable.

**PROPOSED, NOT APPLIED, if a 320px device is in scope:**
1. ⭐ **Let the van span truncate as a LAST resort** — `truncate` on it too, so `Van 12` becomes `Van 1…`
   only after the truck name is gone. The van still identifies the screen; nothing wraps, ever.
2. **Drop the word `This screen` from the toggle below 360px**, leaving the badges and the chevron.
   Saves ~66px but re-creates the bare-glyph control this file already argues against.
3. **Accept two rows at 320px in that one case.**

---

# 3 — WHAT YOU ADDED AT THE END

## 3.1 🔴 THE CONTRADICTION, AND THE STOP

**`Manage event` is in this task's DO-NOT list AND in the instruction you appended.** I did not choose
between them: **I stopped and asked, with the arithmetic**, and you answered **line 1**. The model behind
the question:

```
  line 3 as instructed:  New-order sound 134.0 + Screen & sound 113.2 + Manage event 117.3 + gaps 16
                      =  380.5px against 358px available  ->  it wraps to a FOURTH line
  line 1:                List/Grid 104.7 + Full/Cook 100.0 + gaps 8              = 212.7px, 145px spare
                      +  Manage event 117.3 + gap 8                             = 337.9px, 20.1px spare
```

**So `Manage event` is on line 1, beside `Full`/`Cook`, with its full words.**

## 3.2 Manage event — one mount per width, never two

```tsx
              {activeEvent && !isDemo && (
                <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
                  aria-label="Manage event" title="Manage event — start, pause, change or finish it" …>
                  Manage event ▾
                </button>
              )}
```

| Width | Line 1's copy | The event bar's copy |
|---|---|---|
| below `sm:` | ✅ **renders**, full words | 🔴 **`hidden sm:block` — does not render** |
| `sm:` and above | 🔴 **inside `sm:hidden` — does not render** | ✅ **renders, unchanged** |

✅ **NOT DUPLICATED AT ANY WIDTH.** Same handler, same two state writes, same `!isDemo` gate, same
`aria-label` and `title`. ⚠️ **The event bar's copy showed a BARE `▾` below `sm:`; that is the copy that
goes, and the phone now gets the words** — the accessibility defect its own comment records is retired
rather than moved. **`EventActionsModal` itself was not touched.**

⚠️ **IF LINE 1's 20px PROVES SHORT ON HARDWARE**, the fix that costs nothing is moving `Manage event` to
its own full-width line 4 — **not** shortening it.

## 3.3 `Pause orders` — off the phone row, with one arm kept

```tsx
        {activeEvent?.status === 'open' && (!isDemo || isPaused) && (
          <button onClick={togglePause}
            className={`${isDemo && isPaused ? '' : 'hidden sm:block'} text-xs px-3 py-1.5 rounded-md border font-medium …`}>
```

🔴 **`hidden sm:block` IS THE WHOLE EDIT. The gate, the handler, the colours and both labels are
unchanged**, and at `sm:`+ a flex child is blockified anyway, so `display:block` is what this button
already computed to.

🔴 **ONE ARM SURVIVES BELOW `sm:`, AND IT IS THE RECOVERY ONE. On a PAUSED DEMO the Manage event menu
cannot be opened at all** — its mount and its only opener are both `!isDemo` — **so this button is the
only resume control that exists in that state.** `isDemo && isPaused` keeps it visible at phone width in
that one case and no other. **Hiding it outright would have stranded a paused demo with no way back**;
that is the same finding Q4 of the previous report recorded, and it has not changed.

✅ **FOR A REAL TRUCK ON A PHONE, PAUSE IS NOT LOST: it is `⏸ Pause orders` inside Manage event**, which
is on line 1. One tap deeper, and it is where the other event-level writes already live.

## 3.4 The moon is gone from the phone

```tsx
          {!screenHeld && <span aria-hidden className="text-xs line-through opacity-70">☀️</span>}
```

**Replaced, not dropped — the condition is identical (`!screenHeld`).** The badge is now the **sun struck
through**, which makes all four badges one rule: **the glyph is the thing, the strike means it is OFF**
(~~`✓`~~ ready step, ~~`💷`~~ handover, `🔕` sound, ~~`☀️`~~ screen). ✅ **The file gained no character —
`☀️` was already `screenOnBtn`'s own on-glyph.**

**Inside the panel the phone's screen chip uses the same treatment**, via a new OPTIONAL second argument:

```tsx
  const screenOnBtn = (label: string, struckSun = false) => (
      <span aria-hidden className={struckSun && !screenHeld ? 'line-through opacity-70' : undefined}>{struckSun || screenHeld ? '☀️' : '🌙'}</span>
```

🔴 **IT DEFAULTS TO FALSE, SO THE `sm:`-AND-ABOVE MOUNT RENDERS ☀️/🌙 EXACTLY AS BEFORE.**
⚠️ **`🌙` THEREFORE STILL EXISTS AT `sm:` AND ABOVE** — on the `📱` button's badge and in `screenOnBtn`'s
default — **because those widths must stay byte-identical this task. Say the word and they follow.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on the KDS: 21 problems (18 errors, 3 warnings) — identical
to HEAD and to every task this session.**

| Required claim | Method, with the figure and its error bar |
|---|---|
| Line 3 fits at 390px with meaningful clearance | ⚠️ **MODEL, ±5%.** **255.2px of 358px → 102.8px clear (≈8× the ±12.8px error bar).** Was 363px / 6px clear. **Not rendered** |
| The expanded state is still three lines | ✅ **EXECUTED (source)** — the block contains exactly three `<div className="flex items-center gap-2">` children and no fourth; ⚠️ **and MODEL for the widths: 337.9 / 272.1 / 255.2 against 358, so none of the three wraps. Line 1's 20.1px is the tightest and is 1.6× its own error bar** |
| The collapsed row cannot wrap at 320, 390, 430px | ⚠️ **MODEL.** ✅ **390px: floor 281–289 of 358 — cannot wrap for ANY name.** ✅ **430px: of 398 — cannot wrap.** ⚠️ **320px: 281.0 of 288 with `— Van 1` (clears), 288.8 of 288 with `— Van 12` (0.8px over, inside the error bar) — §2.2, reported not hidden** |
| The van survives truncation | ✅ **EXECUTED (source)** — the van is its own `shrink-0` span outside the `truncate` span, so the ellipsis can only ever fall inside the truck name |
| Screen-on is reachable in the popup, handler unchanged | ✅ **EXECUTED (source)** — one `screenOnBtn` implementation, `onClick={toggleKeepScreenOn}`, reached by `Screen & sound`. 🔴 **The three-tap cost and the `KeepAwakePrompt` one-tap path are both stated in §1.4** |
| The `🌙`→`☀️` badge still renders on the collapsed toggle | ✅ **EXECUTED (source)** — same `!screenHeld` condition, struck sun, still on the toggle |
| `sm:` and above unchanged | ✅ **AS CLOSE TO PROOF AS SOURCE ALLOWS — every edit is one of four kinds, and each is checkable:** (a) additions inside the `sm:hidden` expanded block (line 1's Manage event); (b) `hidden sm:block` on two things that previously rendered at both widths (the event bar's `▾`, the pause chip) — **at `sm:`+ a flex child is blockified, so `display:block` is what they already computed to**; (c) `sm:hidden` on the panel's screen row — invisible at `sm:`+ either way; (d) `sm:shrink-0` on the name block, restoring `flex-shrink: 0`, which makes `min-w-0` and `truncate` unreachable there. 🔴 **No control that renders at `sm:`+ was added, removed, restyled or re-worded, and `screenOnBtn`'s new argument defaults to the old behaviour.** ⚠️ **Not rendered, so this is an argument from the class strings, not a screenshot** |
| The dashboard is untouched | ✅ **EXECUTED** — `app/dashboard/[token]/page.tsx` is **390,931 bytes**, unchanged from the previous two tasks; `components/shared/*` unchanged (10,494 / 2,849); nothing under `app/api` is in the diff |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED.** Every width here is arithmetic over published font metrics, ±5%.
- 🔴 **TWO FIGURES ARE INSIDE THE ERROR BAR AND ARE NAMED RATHER THAN ROUNDED: line 1's 20.1px, and the
  320px collapsed floor at 288.8 of 288.** Both have a fix proposed and neither was solved by shortening
  a label.
- **The struck-glyph convention is untested on hardware.** ~~`☀️`~~ meaning "the screen will dim" is
  legible in principle; whether a cook reads it that way at a glance is a question for the van.

---

# INTEGRITY

⚠️ **THE "BEFORE" IS THE FIGURE THE PREVIOUS REPORT RECORDED FOR THIS FILE**, because the tree was
already dirty and `checkout` is forbidden. **The census is ALSO checked against `HEAD`, which is
stricter.**

```
app/dashboard/[token]/kds/page.tsx
BEFORE (end of the previous task)   212,091 bytes
AFTER                               220,411 bytes · 212,809 chars · 2,959 lines
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED**, and the
same 33 as `HEAD`. **Carrier-aware on the source: `U+26A0` n=134, 134 paired, ✅ 0 bare; `U+2600` n=4, 4
paired, ✅ 0 bare — the new struck-sun badge is `☀️`, PAIRED, matching the file's existing usage.**

🔴 **ONE CHARACTER WAS INTRODUCED AND REMOVED BEFORE THIS REPORT WAS WRITTEN:** `U+2026 …`, in a comment
showing what a truncated name looks like. **Rewritten as `...`.** That is the third task running in
which this pass has caught something.

## This report — a SEPARATE pass, run AFTER writing

```
docs/kds-phone-width-fix-report.md   bytes 21,845
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 27 | 0 | 27 |
| U+26A0 (warning sign — TEXT presentation) | 19 | 19 | 0 |
| U+2705 (check mark button) | 33 | 0 | 33 |
| U+2B50 (star) | 1 | 0 | 1 |
| U+2600 (sun — TEXT presentation) | 8 | 8 | 0 |
| U+1F4B7 (banknote) | 2 | 0 | 2 |
| U+1F4F1 (mobile phone) | 2 | 0 | 2 |
| U+1F515 (bell with slash) | 2 | 0 | 2 |
| U+1F514 (bell) | 2 | 0 | 2 |
| U+1F319 (crescent moon) | 4 | 0 | 4 |
| U+2713 (check mark — TEXT presentation) | 2 | 0 | 2 |
| U+25BE (triangle — TEXT presentation) | 4 | 0 | 4 |
| U+23F8 (pause) | 1 | 0 | 1 |

U+26A0 and U+2600 are the two bases used as emoji here that have TEXT presentation by default,
and every occurrence of each is PAIRED with U+FE0F. U+2713 and U+25BE are bare because they are
quoted from source, where this codebase leaves them bare by design. The remaining bases have
emoji presentation by default, so bare is correct for them.

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
| 🔴 `M app/dashboard/[token]/kds/page.tsx` | ⚠️ already `M` before this task; 🔴 **THIS TASK wrote to it — the only source file written** |
| 🔴 `?? docs/kds-phone-width-fix-report.md` | 🔴 **THIS TASK** — this file |
| `M app/dashboard/[token]/page.tsx`, `M components/shared/EventActionsModal.tsx`, `?? components/shared/ExtraWaitModal.tsx`, `?? docs/kds-view-panel-report.md`, `?? docs/kds-phone-expand-report.md` | ✅ pre-existing — the two previous KDS tasks; **none was touched by this one** |
| `M app/landing/*`, `M lib/plan-features.ts`, `?? docs/landing-features-move-report.md` | ✅ pre-existing — the landing tasks |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
