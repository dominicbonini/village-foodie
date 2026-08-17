# KDS — name the controls for what they do. Copy only.

**File changed:** `app/dashboard/[token]/kds/page.tsx` — **the only source file written.**
✅ **The dashboard, every shared component, `lib` and `app/api` are untouched** — `git diff --stat`
across all four is **empty**.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL, any schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

⚠️ **WHAT WAS APPLIED AND WHAT WAS NOT, BEFORE ANYTHING ELSE.** Fix 2 says *"Propose replacements, then
apply the ones I mark"* — **nothing is marked yet, so §2 is proposals only and no label was renamed.**
Fix 3's state strings *"follow whatever `Steps` becomes"*, which is one of those proposals, **so they
are proposed too**; the one part of Fix 3 that stands on its own — the defensive comment on the
unreachable `None` — **is applied.** Fix 1 is applied in full. **That is sequencing, not a
contradiction, so no stop was raised.**

---

# FIX 1 — APPLIED. `Event actions` NOW HAS AN ACCESSIBLE NAME.

```tsx
            <button onClick={() => { setEventNoteInput(activeEvent.customer_note || ''); setShowEventMenu(true) }}
              aria-label="Event actions"
              title="Start, pause, change or finish this event"
              className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400 font-semibold">
              <span className="hidden sm:inline">Event actions </span>▾
            </button>
```

🔴 **`aria-label` IS THE EXACT VISIBLE STRING AT WIDE WIDTH — the Dashboard-link precedent, followed
deliberately.** WCAG 2.5.3 (Label in Name) wants the visible text contained in the accessible name, and
a voice-control user saying *"Event actions"* has to match. **A better-reading paraphrase would have
broken voice control at wide width**, so the longer wording went into `title`, for pointer users, where
it costs nothing.

✅ **Position, icon and the wide-width label are unchanged — attributes only**, exactly as instructed.
⚠️ **If you later mark the `Manage event` proposal in §2, the `aria-label` must move with it**, or the
two will disagree and voice control will match neither. The comment on that button records that the
wording is an open question and points here; it does not yet spell out the coupling.

---

# FIX 2 — PROPOSALS. NOTHING RENAMED.

## 🔴 `Ready step` — LEFT DELIBERATELY, NOT OVERLOOKED

**Not changed, and it should not be.** It matches the dashboard's **"Order-ready step"** setting, and
the settings copy written this session tells operators the two are **set separately on each device**.
Renaming it here would cut that thread: an operator reading *"the order-ready step is set on each
screen"* in Settings would find no such words on the screen it refers to. **The label is jargon, and
the jargon is shared jargon — which is what makes it work.**

## The four proposals

| # | Today | 🔴 **Proposed** | Why it is accurate — checked against what the control DOES | Fits? |
|---|---|---|---|---|
| 1 | `Payment/Collected` | **`Payment & handover`** | The switch decides whether **this screen shows the payment and Collected buttons**, and therefore whether orders leave here. "Payment & handover" names both halves and claims nothing else — it does **not** change which orders are on the board, and does not touch prices. ⚠️ It matches the panel's own row label, *"Take payment and hand over"* | ✅ **18 chars against today's 17.** And it no longer needs a phone-width collapse at all: below `sm:` this button is not rendered — the Steps panel carries it with the full sentence |
| 2 | `Cook` | **`Kitchen`** | It hides every monetary amount and switches to the kitchen item rendering (grouped by category, deals dissolved). ⚠️ **It changes NO buttons and NO type size** — that was the crossing fixed in V11.24 — so a name implying a different *mode of working* would overstate. `Kitchen` names a **view**, which is what that pill holds (`List` / `Grid` are view names too) | ⚠️ **+3 chars ≈ +18px on a row already ~375px over at iPad portrait.** Real but small |
| 3 | `Event actions` | **`Manage event`** | The menu holds Start Event, change event, pause/resume, customer note, change finish time, finish and cancel. **Every one is managing the event**; "actions" names a menu rather than a job | ✅ **12 chars against 13 — narrower.** Collapse unchanged: `▾` plus the `aria-label`, which would move to `Manage event` |
| 4 | `Steps` (mine) | **`This screen`** | It opens *"What this screen does"* and the two rows inside it are exactly what this screen does. **`Steps` inherits the problem `Ready step` has** — it is our word for our model | ⚠️ **+6 chars.** `This screen · Ready + payment` is ~200px at `text-xs`; on a wrapping row that is a wrap, not an overflow. **Shorter alternative: `Does · Ready + payment`** |

⚠️ **ONE FOLLOW-ON THE BRIEF DID NOT ASK ABOUT, SO IT IS NOT PROPOSED, ONLY NAMED:** if `Cook` becomes
`Kitchen`, its partner `Full` reads oddly beside it — `Full` / `Kitchen` is a pair of different kinds.
`All details` / `Kitchen` would be one pair. **Say if you want that too.**

## What was considered and rejected, so the reasoning is on record

| Rejected | Why |
|---|---|
| `Payment/Collected` → **`Hand over`** | ⚠️ **UNDER-DESCRIBES.** It hides that the switch also decides whether the payment buttons exist at all |
| `Payment/Collected` → **`Takes payment`** | 🔴 **OVERSTATES IN ONE DIRECTION AND UNDER-STATES IN THE OTHER** — it says nothing about the order leaving the screen, which is the consequence an operator actually notices |
| `Cook` → **`No prices`** | ⚠️ **UNDER-DESCRIBES.** It also regroups the items, which is the bigger visual change |
| `Cook` → **`Cook screen`** | 🔴 **OVERSTATES.** There is no separate cook screen any more; the view is derived from the two switches, and this control changes only the card |
| `Steps` → **`Mode`** | 🔴 More jargon, not less |

---

# FIX 3 — THE STATE STRINGS

**Proposed, dependent on #4 above. If `Steps` → `This screen`, the four arms read:**

| State | Today | Proposed |
|---|---|---|
| both on | `Steps · Ready + payment` | `This screen · Ready + payment` |
| ready only | `Steps · Ready only` | `This screen · Ready only` |
| payment only | `Steps · Payment only` | `This screen · Payment only` |
| 🔴 unreachable | `Steps · None` | `This screen · None` |

⚠️ **The four state words need no change of their own** — they already read as plain English after any
of the noun proposals. **Only the noun moves.**

## ✅ APPLIED — THE `None` ARM IS NOW MARKED DEFENSIVE IN THE SOURCE

```tsx
          {/* 🔴 THE `'None'` ARM IS DEFENSIVE AND UNREACHABLE. DO NOT DELETE IT AS DEAD, AND DO NOT
              BUILD A PATH TO IT. Each switch is `disabled` while it is the only step left, so the pair
              cannot both be off — a screen performing no steps has no buttons at all (renderButtons ends
              in `return null`), which on an unattended board is a dead ticket. The arm exists because a
              label with no branch for a state is how a future change to that `disabled` rule ships a
              BLANK button instead of a visible wrong one. If you ever see "None" on a real screen, the
              rule has been broken and the board is not performing any step. */}
```

**It says both halves you asked for: do not delete it as dead, and do not ship a path to it.**

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and `npx eslint` produces a finding
set **byte-identical to HEAD's** (`git show HEAD:…` through `eslint --stdin`, sorted sets diffed).

| Required claim | Method |
|---|---|
| **Every header and event-bar control has an accessible name at every width** | ✅ **EXECUTED.** A script extracted all 14 `<button>`/`<AppLink>` opening tags in the header and event bar (lines 1590–2100), resolved each tag across its lines, stripped `hidden sm:*` children, and asked whether an `aria-label`, a `title` or always-visible text remained. **14 of 14 named.** ⚠️ **One false positive worth stating: the pause button reported "no visible text" because its child is a JSX expression the extractor strips — it renders `Pause orders` / `Paused — tap to resume`, verified by reading it.** |
| **No control is a bare glyph without one** | ✅ **EXECUTED, same pass.** The five glyph-only controls — `←`, `✓`, `💷`, `📱`, `▾` — all carry `aria-label` and/or `title`; **`▾` is the one this task fixed** |
| **`Ready step` is unchanged** | ✅ **EXECUTED** — `git diff` contains no line touching that span |
| **No handler, key, gate or breakpoint changed — the diff is copy-only** | ✅ **EXECUTED.** This task's edits are **two attributes** (`aria-label`, `title`) and **two comments**. `git diff` shows no change to any `onClick`, `useState`, `useCallback`, `disabled`, `hidden sm:contents`, `sm:hidden`, `localStorage`, `Preferences` or `hg_kds_*` line. The census below corroborates: **+9 non-ASCII occurrences, all comment furniture plus the one `▾` quoted in a comment** |
| **The dashboard is unchanged** | ✅ **EXECUTED** — `git diff --stat app/dashboard/[token]/page.tsx components lib app/api` is **empty** |

⚠️ **ONE STRUCTURAL QUESTION WAS RAISED BY A COPY CHANGE AND IS REPORTED RATHER THAN ACTED ON**, per the
brief's stop rule: proposal #2 (`Cook` → `Kitchen`) adds ~18px to a header row this session has already
measured as **~375px over at iPad portrait**. **That is a width consequence of a copy change, not a
structural change to make** — nothing was restructured, and the cost is stated so you can weigh it.

## 🔴 NOT VERIFIED

- **NOTHING WAS RENDERED, TAPPED, OR READ BY ASSISTIVE TECH.** No `next dev`, no `next build`, no
  `cap sync`, no device, no screen reader, no voice control. **Every accessibility claim is a claim
  about attributes in source.**
- **The proposals have never been read by an operator**, which is the only test that settles them.

---

# INTEGRITY

## `app/dashboard/[token]/kds/page.tsx`

**Byte-level tool (Python over `open(…,'rb')`), never grep.**

```
BEFORE   bytes 181,556   chars 175,545   lines 2,580
AFTER    bytes 183,408   chars 177,376   lines 2,600
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Non-ASCII class census — 33 distinct classes before, 33 after. NO NEW CLASS, NONE REMOVED.**

| Codepoint | Before | After | Δ | |
|---|---|---|---|---|
| U+2014 — | 297 | 300 | +3 | comment prose |
| U+1F534 🔴 | 121 | 124 | +3 | comment prose |
| U+FE0F | 107 | 108 | +1 | one selector |
| U+26A0 ⚠️ | 105 | 106 | +1 | one warning |
| U+25BE ▾ | 1 | 2 | +1 | the glyph QUOTED in the new comment — the rendered one is untouched |
| **every other class** | — | — | **0** | |

✅ **NO NEW CLASS AND NONE REMOVED. `U+26A0` and `U+FE0F` both moved +1** — a correctly-paired
addition. **Carrier-aware check on the source: `U+26A0` n=106, 106 paired, 0 bare.**

## This report — SEPARATE pass, run AFTER writing

```
docs/kds-copy-report.md   bytes 13,951
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 14 | 0 | 14 |
| U+2705 ✅ | 17 | 0 | 17 |
| **U+26A0 ⚠️** | **17** | **17** | ✅ **0** |
| U+1F4B7 💷 | 2 | 0 | 2 |
| U+1F4F1 📱 | 2 | 0 | 2 |

`U+1F534`, `U+2705`, `U+1F4B7` and `U+1F4F1` have **emoji presentation by default** — bare is correct
for all four. **`U+26A0` is the only base here that defaults to TEXT presentation**, and ✅ **every one
of its 17 occurrences is PAIRED — 17 OF 17, ZERO BARE.** ⚠️ **`U+2713 ✓`, `U+2190 ←` and
`U+25BE ▾` are quoted as label glyphs and are NOT emoji-presentation bases** — no selector applies to
any of them. The total `U+FE0F` count is 17, which exactly accounts for the 17 paired warning
signs.

## Working tree

```
 M app/api/dashboard/action/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/PaymentActionsModal.tsx
 M docs/reference-manual.md
 M lib/native/orderGate.ts
 M lib/native/useGatedActionResult.tsx
?? docs/kds-copy-report.md
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
?? docs/kds-header-group-report.md
?? docs/kds-header-tidy-report.md
?? docs/kds-phone-controls-report.md
?? docs/modal-backdrop-report.md
?? docs/payment-method-fix-report.md
?? docs/payment-method-report.md
```

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **BOTH** — already modified by five earlier tasks this session; **this task added two attributes and two comments to it** |
| 🔴 `?? docs/kds-copy-report.md` | 🔴 **THIS TASK** — this file, the only new entry |
| `M docs/reference-manual.md` · `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — **left alone, as instructed** |
| `M app/dashboard/[token]/page.tsx` · `M app/api/dashboard/action/route.ts` · `M lib/native/orderGate.ts` · `M lib/native/useGatedActionResult.tsx` · `M components/dashboard/PaymentActionsModal.tsx` | ✅ pre-existing — the payment-method and modal-backdrop tasks |
| the seven other `?? docs/*.md` | ✅ pre-existing — the preceding tasks' reports. ⚠️ **Not named in the brief's two-entry list; left alone on the same footing** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
