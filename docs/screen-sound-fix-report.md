# Screen-on and sound — five fixes

**Files changed — three:** `app/dashboard/[token]/kds/page.tsx` · `app/dashboard/[token]/page.tsx` ·
`components/dashboard/UserMenu.tsx`.
✅ **`lib/native/keepAwake.ts`, `lib/sound-prefs.ts`, `KeepAwakePrompt` and everything under `app/api`
are untouched.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or `restore`.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, any SQL.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# FIX 1 — ONE SCREEN-ON CONTROL. ONE CLASS.

```tsx
                <label className="sm:hidden flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-700">Keep the screen on</span>
                  {screenOnBtn(screenHeld ? 'On' : 'Off')}
                </label>
```

**`sm:hidden` added — the exact complement of the header button's `hidden sm:block`.**

| Width | Header | Sheet | Controls |
|---|---|---|---|
| phone (<640) | hidden | ✅ shown | **1** |
| tablet (≥640) | ✅ shown | hidden | **1** |
| desktop | ✅ shown | hidden | **1** |

✅ **Both mounts still call one `screenOnBtn`.** `KeepAwakePrompt`, the badge, `toggleKeepScreenOn` and
`lib/native/keepAwake.ts` are **not in the diff.**

---

# FIX 2 — THE SHARED KEY, SPLIT

```tsx
    const own = localStorage.getItem(`hg_kds_keepawake_${token}`)
    const pref = own ?? localStorage.getItem(`hg_keepawake_${token}`)
    return isDemo ? pref === 'on' : pref !== 'off'
```
```tsx
    try { localStorage.setItem(`hg_kds_keepawake_${token}`, value ? 'on' : 'off') } catch {}
```

# 🔴 ONCE-ONLY AND IDEMPOTENT BY CONSTRUCTION — NO FLAG AND NO TIMESTAMP. The guard is "my own key is unset" (`own ?? …`), and the only thing that ever writes that key is this surface's own toggle. **A second read after any write takes the `own` branch and never consults the shared key again, so re-running cannot change the outcome.** An operator whose screen stays on today keeps it; the first tap from this surface makes the two independent for ever.

✅ **THE DASHBOARD'S KEY IS UNTOUCHED** — `grep -c hg_keepawake_` on the dashboard is **2** before and
after (its read and its write), and neither line is in the diff. **The KDS's 3 occurrences are the
migration's fallback read plus two mentions inside the new comment; it writes only `hg_kds_keepawake_`.**

⚠️ **THE localStorage-vs-Preferences RULE HOLDS AND IS RESTATED IN THE FILE:** Preferences is for
values that must survive a WKWebView cold kill because they decide **board membership** (the two step
switches). This decides appearance and a hardware lock — **losing it costs one tap, not a wrong board**
— so it stays where the dashboard's equivalent is.

---

# FIX 3 — THE KDS CAN NOW SET WHICH-SOUNDS

**The dashboard's rows, quoted before reuse:**

```tsx
                    <p className="text-sm font-semibold text-slate-800 mb-1.5">New order sound</p>
                      {([['needs_confirming','Only orders needing confirming'],['all','All new orders']] as const).map(([val,label])=>(
```

**Reused verbatim — same two options, same labels, same radio shape.** The KDS's version writes through
the shared helper:

```tsx
                          const next = { ...(storedSoundCfg ?? DEFAULT_SOUND_CONFIG), new_orders: val }
                          writeSoundConfig(token, next); setStoredSoundCfg(next); soundConfigRef.current = next
```

✅ **It writes the SHARED `hg_soundcfg_${token}`, and the sharing stays** — that is documented as
deliberate, and the defect was never the sharing but that only one surface could write it.
✅ **`readSoundConfig` / `DEFAULT_SOUND_CONFIG` reused; no new option and no new vocabulary.**
⚠️ **`soundConfigRef` is updated alongside the state** so the ding decision — which reads the ref —
takes effect on the very next order without a re-render.

# ⚠️ NO CROSS-SURFACE SYNC WAS BUILT, AND THE CONSEQUENCE IS STATED RATHER THAN LEFT TO BE FOUND: the dashboard reads this key into its own state at mount, so a change made on the KDS reaches an ALREADY-OPEN dashboard **only after that page reloads**. Both surfaces are correct on their next load.

---

# FIX 4 — THE MASTER'S LABEL, ALIGNED. SHAPES UNCHANGED.

| Surface | Before | After | Shape |
|---|---|---|---|
| dashboard header button | `🔔 Sound on` / `🔕 Sound off` | **`🔔 New-order sound`** | ✅ **still a header button** |
| dashboard UserMenu row | `🔔 Sound on` / `🔕 Sound off` | **`🔔 New-order sound`** | ✅ **still a `<Toggle>`** |
| KDS sheet row | `New-order sound` | **unchanged** | ✅ **still a chip** |

⚠️ **THE STATE IS NOW CARRIED BY THE CONTROL, NOT THE WORDS** — the bell glyph still flips 🔔/🔕, and
the Toggle still shows on/off. **That is what a switch is for**, and it is why only the words moved.

## 🔴 THE HEADER-BUTTON WIDTH — PROPOSED, NOT SOLVED

**`New-order sound` is 16 characters against `Sound on`'s 8 and `Sound off`'s 9 — roughly +45px** at
that button's `text-xs`. ⚠️ **ESTIMATE, NOT MEASURED.** The button is `hidden sm:flex`, so it only
renders at ≥640px, and the dashboard header is the one with room — **but this is the first time both
states are the same length, so the row no longer changes width when sound is toggled, which is a small
improvement.** **If it does crowd at 640–768px, the fix is that button's own label, not moving
anything else.** **Nothing was moved.**

---

# FIX 5 — THE KDS MASTER STAYS IN THE SHEET

**Recorded in the source so it is not "aligned" later:**

```tsx
                  {/* 🔴 THE MASTER STAYS IN THIS SHEET AND IS NOT MOVED TO THE HEADER. DO NOT "ALIGN"
                      IT LATER. The dashboard puts its master on the header because it has the room; this
                      header is ~375px over at iPad portrait before anything is added. Same setting, two
                      surfaces, two constraints — a legitimate divergence, not an oversight. */}
```

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `tsc --noEmit` exits 0, and **all three files produce a lint
finding set identical to their own HEAD**: KDS 21/21, dashboard 108/108, UserMenu 1/1.

| Claim | Method |
|---|---|
| Exactly one screen-on control at phone, tablet and desktop | ✅ **EXECUTED for the classes** — `hidden sm:block` and `sm:hidden` are complements. ⚠️ **NOT rendered at any width** |
| A device with a stored `hg_keepawake_` keeps screen-on after the split | ✅ **Source read** — the `own ?? shared` fallback. ⚠️ **No browser, no stored value exercised** |
| 🔴 **The dashboard's screen-on is unaffected** | ✅ **EXECUTED** — its two `hg_keepawake_` lines are **not in the diff**; the dashboard diff contains only the sound label |
| Which-sounds is settable from the KDS and writes the shared key | ✅ **Source read** — `writeSoundConfig(token, next)`. ⚠️ **Never clicked** |
| Both surfaces label the master `New-order sound`, with their own shapes | ✅ **EXECUTED** — three label sites changed, **no control element changed**: the diff contains no `<Toggle>`, no button element and no className |
| 🔴 **The dashboard's Settings rows and sound master behaviour are unchanged** | ✅ **EXECUTED** — `saveSoundConfig`, the radio rows and the master's handler are **not in the diff**; the only dashboard change is one string literal |

## 🔴 NOT VERIFIED

**NOTHING WAS RENDERED, CLICKED OR MEASURED.** No `next dev`, no device, no browser — so the migration
has never actually read a stored value, the new radio rows have never been shown, and the header
button's width claim is an estimate.

---

# INTEGRITY

| File | bytes | classes | occurrences | new class | NUL · control · CR | U+26A0 |
|---|---|---|---|---|---|---|
| `app/dashboard/[token]/kds/page.tsx` | 183,408 → **197,607** | **33 → 33** | 2954 → 3254 | ✅ NONE | 0 · 0 · 0 | **119/119 paired, 0 bare** |
| `app/dashboard/[token]/page.tsx` | 389,542 → **388,849** | **53 → 53** | 3451 → 3491 | ✅ NONE | 0 · 0 · 0 | 84/82, **2 bare — pre-existing** |
| `components/dashboard/UserMenu.tsx` | 16,239 → **16,820** | **16 → 16** | 87 → 91 | ✅ NONE | 0 · 0 · 0 | **4/4 paired, 0 bare** |

⚠️ **The two page files' "before" is HEAD, which is behind the working tree by this session's earlier
uncommitted work — the lesson from `docs/splice-verification-report.md`. The deltas above are
therefore session-cumulative, not this task's alone.**

## This report — SEPARATE byte-level pass, run AFTER writing

```
docs/screen-sound-fix-report.md   10,515 bytes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
TOTAL OFFENDING: 0
```

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 | 7 | 0 | 7 |
| U+2705 | 20 | 0 | 20 |
| **U+26A0** | **9** | **9** | **0** |
| U+1F514 | 5 | 0 | 5 |
| U+1F515 | 3 | 0 | 3 |

`U+1F534`, `U+2705` and the glyph rows below them have **emoji presentation by default** — bare is
correct for all of them. **`U+26A0` is the only TEXT-presentation base here, and every one of its 9
occurrences is PAIRED — 9 OF 9, ZERO BARE.** Total `U+FE0F` = 9.

## `git status --porcelain`

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/splice-verification-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| **`?? docs/screen-sound-fix-report.md`** · **`M components/dashboard/UserMenu.tsx`** | **THIS TASK — UserMenu was clean at HEAD** |
| `M app/dashboard/[token]/kds/page.tsx` · `M app/dashboard/[token]/page.tsx` | **BOTH** — already modified by earlier tasks; this task added to them |
| everything else | **ALL pre-existing** — earlier tasks' edits and reports |

Nothing was committed, staged, reverted, stashed or cleaned.
