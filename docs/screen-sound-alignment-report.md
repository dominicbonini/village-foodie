# Screen-on and sound — KDS vs dashboard. Read-only review.

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL. NO `git stash`, `checkout` or
`restore` — `status`, `diff`, `show` and file reads only.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 THE HEADLINE IS NOT (A) OR (B). IT IS THAT TWO KEYS ARE SHARED BETWEEN THE SURFACES, WHICH THE BRIEF CALLS NON-NEGOTIABLE.

**READ — both files write the SAME localStorage key for screen-on:**

```
kds/page.tsx:963   localStorage.setItem(`hg_keepawake_${token}`, value ? 'on' : 'off')
page.tsx:1815      localStorage.setItem(`hg_keepawake_${token}`,value?'on':'off')
```

**READ — and the KDS says in its own comment that the sound CONFIG key is shared on purpose:**

```
// PER-DEVICE sound CONFIG (V9.5) — the SAME localStorage key the dashboard uses (hg_soundcfg_${token}),
// so "which sounds fire" is one concept in one place on this device.
```

# 🔴 SO THE SAME iPAD DOES **NOT** HAVE A SEPARATE DASHBOARD AND KDS SCREEN-ON. Turning the screen lock on from the KDS writes the value the dashboard reads, and the other way round. **The same is true of which-sounds.** Only the sound MASTER is genuinely per-surface.

⚠️ **I am not calling the sound-config sharing a defect on my own authority** — it is documented as
deliberate, with a stated reason. **But it contradicts the constraint as this brief states it, and you
should decide which of the two stands.** The screen-on key carries **no such comment** and reads as an
accident of both surfaces copying the same expression.

---

# Q1 — EVERY SCREEN-ON MOUNT

## THE KDS — THREE renderings, TWO of them controls

| # | Where | Classes | Handler | READ |
|---|---|---|---|---|
| 1 | header button | 🔴 **`hidden sm:block shrink-0`** | `screenOnBtn('Screen on'/'Screen off')` | `:2013` |
| 2 | device-sheet row | 🔴 **none — every width** | `screenOnBtn('On'/'Off')` | `:2663` |
| 3 | device-button badge | none — every width | not a control; renders `🌙` when `!screenHeld` | — |

✅ **Both controls call the SAME function** — `screenOnBtn(label)` at `:1007`, one `onClick`,
`toggleKeepScreenOn`. **The duplication is of PLACEMENT, not of implementation.**

# 🔴 COUNT: PHONE **1** · TABLET **2** · DESKTOP **2**. The sheet row never withdraws.

## THE DASHBOARD — ONE control at every width

| Where | Classes | READ |
|---|---|---|
| header button | **`hidden sm:flex …`** | `page.tsx:2845` |
| UserMenu row | **`sm:hidden px-4 py-2 …`** | `UserMenu.tsx:128` |

# ✅ COUNT: PHONE **1** · TABLET **1** · DESKTOP **1**. **The dashboard does not have the two-places problem.**

---

# Q2 — THE DASHBOARD'S PATTERN, QUOTED. THIS IS THE ONE TO REUSE.

```tsx
        <button onClick={toggleKeepScreenOn} title={screenHeld ? 'Screen will stay on' : 'Tap to keep the screen on'} className="hidden …
```
```tsx
            {showScreenToggle && (
              <div className="sm:hidden px-4 py-2 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{keepScreenOn ? 'Screen on' : 'Screen off'}</span>
                  <Toggle on={keepScreenOn} onToggle={() => onToggleScreenOn?.()} />
```

**At every width:** `hidden sm:flex` and `sm:hidden` are **exact complements**, so exactly one renders.
🔴 **The KDS's header button is `hidden sm:block` — the same half of the pair — but its sheet row
carries NO breakpoint class at all.** ⚠️ **The difference between the two surfaces is ONE class.**

---

# Q3 — STORAGE, AND THE SHARED KEYS

| Setting | Dashboard key | KDS key | Mechanism | Default | Distinct? |
|---|---|---|---|---|---|
| **screen-on** | `hg_keepawake_${token}` | 🔴 **`hg_keepawake_${token}`** | localStorage | off unless stored | 🔴 **NO — IDENTICAL** |
| **sound master** | `hg_sound_${token}` | `hg_kds_sound_${token}` | localStorage | **ON** (`!== 'off'`) | ✅ **YES** |
| **which-sounds** | `hg_soundcfg_${token}` | 🔴 **`hg_soundcfg_${token}`** | localStorage, via `readSoundConfig` | seeded from `trucks.sound_config` | 🔴 **NO — IDENTICAL, and documented as deliberate** |
| KDS step switches | — | `hg_kds_payments_`/`hg_kds_readystep_` | localStorage **+ Preferences** | derived | ✅ KDS-only |
| KDS card display | — | `hg_kds_cardmode_` | localStorage | follows the board | ✅ KDS-only |

⚠️ **Every key is scoped by `token`, so two trucks on one device never collide** — the per-device
property holds. **What fails is the per-SURFACE property, for two settings.**

---

# Q4 — SOUND, SIDE BY SIDE

| Setting | Dashboard | KDS | Difference |
|---|---|---|---|
| **master on/off** | header `hidden sm:flex` button reading **`🔔 Sound on` / `🔕 Sound off`**; UserMenu row `sm:hidden` with a **`<Toggle>`** and the same words | 🔴 **device-sheet row only** — label **"New-order sound"**, chip **`🔔 On` / `🔕 Off`** | 🔴 **PLACEMENT** (header+menu vs sheet), 🔴 **LABEL** ("Sound on" vs "New-order sound"), 🔴 **CONTROL SHAPE** (button/Toggle vs chip) |
| **key** | `hg_sound_${token}` | `hg_kds_sound_${token}` | ✅ distinct, correct |
| **default** | ON | ON | ✅ same |
| **primes audio on enable** | ✅ | ✅ | ✅ same |
| **which-sounds** (`new_orders`: needs-confirming / all) | ✅ **Settings tab, two radio rows** | 🔴 **NO UI — reads the value, cannot set it** | 🔴 **THE KDS CANNOT CHANGE IT** |
| **"sound when an order is due"** | ✅ Settings `<Toggle>` | 🔴 **no UI** | 🔴 KDS lacks it |
| **volume** | 🔴 **none on either** | 🔴 none | — |
| **per-event choices** | none | none | — |

---

# Q5 — WHICH SURFACE IS RIGHT

| Difference | Better | Why |
|---|---|---|
| **Placement of the master** | 🔴 **THE DASHBOARD.** Breakpoint-switched, one control, always visible at the width that has room | The KDS buries a frequently-toggled setting two taps deep at every width. ⚠️ **The counter-argument is real: the header-width work established the KDS row is ~375px over at iPad portrait, so it has less room to spend than the dashboard does** |
| **Label** | ⚠️ **EQUALLY VALID, AND IT IS A PREFERENCE.** "New-order sound" is more precise about WHAT dings; "Sound on/off" is shorter and matches the KDS's other chips | Neither is wrong; **they should simply be the same word on both** |
| **Control shape** | 🔴 **THE DASHBOARD'S `<Toggle>`.** A switch reads as a setting; a chip reads as a status | ⚠️ **But the KDS's chip family is its established vocabulary** — the step switches and screen-on are all chips. **Changing one to a Toggle would make it the odd one out** |
| **which-sounds absent on the KDS** | 🔴 **THE DASHBOARD** | 🔴 **The KDS READS a value it cannot SET** — an operator on a kitchen screen who wants only needs-confirming orders to ding must walk to the dashboard. **And because the key is SHARED, changing it on the dashboard silently changes the KDS's behaviour** |
| **Default (ON) and audio priming** | ✅ **equal** | identical on both |

---

# Q6 — SHARED OR DUPLICATED

| Thing | State | Which precedent |
|---|---|---|
| `toggleKeepScreenOn` / `applyKeepScreenOn` | **inline in BOTH pages, near-identical** | 🔴 **the `useGatedActionResult` case** — it closes over `token`, `keepScreenOn` and `truck?.id` and touches no shared ref. **Extractable.** ⚠️ Except the KDS's carries an extra branch (the auto-pause-van warning modal) the dashboard's lacks — **a parameter, not a blocker** |
| `keepAwake` / `subscribeWakeState` | ✅ **already shared** — `lib/native/keepAwake.ts` | already done |
| `screenOnBtn` (KDS) | inline placed value, **two mounts, one implementation** | fine as is |
| dashboard screen-on + sound rows | ✅ **in `components/dashboard/UserMenu.tsx` — a SHARED component the KDS does not mount** | ⚠️ **the `applyPending` case in reverse:** UserMenu is shared *code* used by one surface; wiring the KDS into it would drag the whole menu |
| sound master state + priming | **inline in both**, near-identical | **the `useGatedActionResult` case** — small and self-contained |
| `readSoundConfig` / `DEFAULT_SOUND_CONFIG` | ✅ **already shared** | already done |

---

# Q7 — THE BADGE

**READ — `!screenHeld` renders `🌙` and `!soundEnabled` renders `🔕` on the device button, at every
width.**

🔴 **IF SCREEN-ON LEAVES THE SHEET AT TABLET WIDTH, THE BADGE STAYS CORRECT — it reads `screenHeld`,
not the sheet's presence.** ⚠️ **But it becomes REDUNDANT there:** the header button already shows the
same state in words a few pixels away, so the badge would be a second indicator of a visible control.
**At phone width it remains the only at-a-glance signal and is doing real work.**

# ✅ THE DASHBOARD HAS NO EQUIVALENT BADGE. Its state lives only on the control itself — which is consistent, because it never hides that control.

---

# Q8 — WHAT DEPENDS ON EACH MOUNT

**INFERRED from reading each site; nothing was rendered.**

| Reader | Depends on the header mount? | The sheet mount? |
|---|---|---|
| `screenOnBtn` itself | both call it — **removing either leaves the function used** | same |
| `toggleKeepScreenOn` | no — it is the handler, not a caller | no |
| `screenHeld` / `wakeState` | no — a subscription | no |
| `KeepAwakePrompt` | 🔴 **no, and this is the safety net that matters:** it renders full-width under the header whenever the pref is on and the lock is not held, with its own acquiring button | no |
| the `🌙` badge | no | no |
| the sheet's `<h3>Screen &amp; sound</h3>` | no | ⚠️ **YES in wording only** — with screen-on gone at tablet, that heading names one row it still has and one it does not |

# ✅ NOTHING READS EITHER MOUNT. Adding `sm:hidden` to the sheet row is a display change with no dependent — the acquisition path, the state and the recovery banner are all untouched by it.

⚠️ **ONE CONSEQUENCE WORTH STATING: at tablet width the device sheet would then hold ONLY the sound
row**, and its heading `Screen & sound` would be half-true. **Reported, not resolved.**

---

# VERIFICATION

**Every claim above is a READ of source. NOTHING WAS RENDERED, TAPPED OR MEASURED** — no `next dev`,
no device, no browser. The two INFERRED claims are Q7's redundancy judgement and Q8's dependency
table, both marked.

**RECOMMENDING NOTHING beyond Q5's better/worse judgements.**

---

# INTEGRITY

```
docs/screen-sound-alignment-report.md   12,250 bytes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
TOTAL OFFENDING: 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 | 27 | 0 | 27 |
| U+2705 | 18 | 0 | 18 |
| **U+26A0** | **11** | **11** | **0** |
| U+1F319 | 3 | 0 | 3 |
| U+1F515 | 3 | 0 | 3 |
| U+1F514 | 2 | 0 | 2 |

`U+1F534`, `U+2705` and every glyph in the rows below them have **emoji presentation by default** —
bare is correct for all of them. **`U+26A0` is the only TEXT-presentation base here, and every one of
its 11 occurrences is PAIRED — 11 OF 11, ZERO BARE.** Total `U+FE0F` = 11.

## `git status --porcelain`

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/splice-verification-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| **`?? docs/screen-sound-alignment-report.md`** | **THIS PASS — the only new entry, and the only file written** |
| everything else | **ALL pre-existing** — this session's uncommitted source edits and reports |

Nothing was committed, staged, reverted, stashed or cleaned.
