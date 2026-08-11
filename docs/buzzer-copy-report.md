# Buzzer prompt — relabel. Copy only.

**Date:** 11 August 2026
**Result: DONE. Two string literals changed, in one file. No behaviour change of any kind.**
**No `next dev`, no `next build`, no commit, no deploy.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE SEARCH, BEFORE ANY EDIT

## `"Ask for a buzzer number"` — repo-wide

```
app/dashboard/[token]/page.tsx:3490
docs/buzzer-build-report.md:182
docs/buzzer-build-report.md:434
```

## `"Opens the buzzer grid"` — repo-wide

```
app/dashboard/[token]/page.tsx:3491
```

## 🔴 THE ANSWER: IT EXISTS IN EXACTLY ONE PLACE IN THE PRODUCT.

**One label at `app/dashboard/[token]/page.tsx:3490` and one description at `:3491`.** There is no second surface, no shared constant, and no sibling with the same wording. **The two `docs/` hits are a dated build report, not a surface — see below.**

### `lib/settings-copy.ts` — CHECKED, and it does NOT hold this copy

`lib/settings-copy.ts:126-133`, quoted:

```ts
  /** Settings → Your trucks → Display settings. `countLabel` is the nested count row.
   *  ⚠️ THE POOL ONLY (truck_vans.buzzer_count). The per-event PROMPT (truck_events.buzzer_prompt) has
   *  no truck-level column and is not represented here or on either surface — see the report. */
  buzzers: {
    label: 'Do you hand out buzzers for collection?',
    help: 'Record which buzzer you gave each customer, so you know who to look for when their food is ready.',
    countLabel: 'How many buzzers do you have?',
  },
```

🔴 **`SETTING_COPY.buzzers` IS A DIFFERENT SETTING AND MUST NOT BE TOUCHED.** It is the buzzer **POOL** — `truck_vans.buzzer_count`, *"How many buzzers do you have?"* — and the file states in its own comment that the per-event **PROMPT** has no entry here. **Different column, different question, different wording. Left exactly as it is.**

### Manage — CHECKED, and its buzzer row is the same POOL setting

`app/manage/[token]/page.tsx:2958-2986`, quoted:

```tsx
      // ── Q5: BUZZERS — THE POOL ONLY ───────────────────────────────────────────────────────────
      // 🔴 truck_vans.buzzer_count and NOTHING ELSE. The per-event PROMPT is truck_events.buzzer_prompt
      …
      id: 'buzzer_count',
      label: SETTING_COPY.buzzers.label,
      helpText: SETTING_COPY.buzzers.help,
```

✅ **Manage renders `SETTING_COPY.buzzers`, i.e. the pool.** It has no copy resembling the prompt's. **Nothing to change there.**

### The two `docs/` hits — reported, and deliberately LEFT

```
docs/buzzer-build-report.md:182  - UI: [app/dashboard/[token]/page.tsx:2984-3003](…), **"Ask for a buzzer number after each new order?"**
docs/buzzer-build-report.md:434  9. **Event override off:** turn "Ask for a buzzer number after each new order?" off, place an order —
```

⚠️ **These are a historical build report, not a surface.** Your instruction was *"change ALL of them so no surface is left saying the old thing"* — a dated record of what was built at the time is not a surface, and editing it would falsify the record rather than update a screen. ⚠️ **It also names line numbers `2984-3003` that no longer point at this control**, which is itself evidence that it is a snapshot rather than live documentation. **I have left both hits and am naming them here rather than silently deciding.** Say the word if you want them updated.

---

## The change — one file, two lines

**`app/dashboard/[token]/page.tsx`**

### Line 3490 — the label

**BEFORE**
```tsx
                  <p className="text-sm font-semibold text-slate-800">Ask for a buzzer number after each new order?</p>
```

**AFTER**
```tsx
                  <p className="text-sm font-semibold text-slate-800">Remind me to add a buzzer</p>
```

✅ **No question mark**, as specified.

### Line 3491 — the description

**BEFORE**
```tsx
                  <p className="text-xs text-slate-500 mt-0.5">Opens the buzzer grid as soon as you place an order, so the number goes on the board while the customer is still in front of you. You can always add one later by tapping the order.</p>
```

**AFTER**
```tsx
                  <p className="text-xs text-slate-500 mt-0.5">Opens the buzzer grid as soon as you place an order, so the number goes on the board while the customer is still in front of you. With it off you can still add a buzzer any time by tapping the order, but nothing will prompt you. Useful where you hand buzzers out, easy to switch off where you don’t.</p>
```

⚠️ **The first sentence is unchanged** — the new wording keeps it verbatim and replaces only the closing sentence, so the diff is as small as the instruction allows.

⚠️ **Nothing else on this line or in this block moved:** the `className` strings, the `<div>` structure, the `{savingBuzzerPrompt&&…}` spinner, the `<Toggle>` and its `on` / `onToggle` / `disabled` props are all byte-identical.

---

## VERIFICATION

### The old strings are gone

```
$ grep -rn "Ask for a buzzer number after each new order" app components lib
  ZERO HITS in app/ components/ lib/

$ grep -rn "You can always add one later by tapping the order" app components lib
  ZERO HITS in app/ components/ lib/
```

✅ **Zero remaining hits in the product.** The only surviving occurrences anywhere are the two `docs/buzzer-build-report.md` lines quoted above.

### The new strings are present

```
$ grep -n "Remind me to add a buzzer\|easy to switch off where you" "app/dashboard/[token]/page.tsx"
3490:                  <p className="text-sm font-semibold text-slate-800">Remind me to add a buzzer</p>
3491:                  <p className="text-xs text-slate-500 mt-0.5">Opens the buzzer grid as soon as you place an order, so the number goes on the board while the customer is still in front of you. With it off you can still add a buzzer any time by tapping the order, but nothing will prompt you. Useful where you hand buzzers out, easy to switch off where you don’t.</p>
```

### 🔴 The key, the column, the handler, the resolver and the default are UNCHANGED

Grepped after the edit — every one still resolves exactly as before:

| Thing | Grep result |
|---|---|
| **Column `truck_events.buzzer_prompt`** | `app/api/dashboard/route.ts:140` (the named select), `app/api/dashboard/action/route.ts:1657` (`.update({ buzzer_prompt: !!value })`), `lib/buzzer.ts:59, 89` |
| **Action key `set_buzzer_prompt_override`** | `app/dashboard/[token]/page.tsx:1408` (client), `app/api/dashboard/action/route.ts:1644, 1651` (handler) |
| **Resolver `resolveBuzzerPrompt`** | `lib/buzzer.ts:83` |
| **Default** | `lib/buzzer.ts:89` — `return { buzzerCount, buzzerPrompt: event?.buzzer_prompt ?? true }` |
| **Constants** | `BUZZER_MAX_COUNT`, `BUZZER_DEFAULT_COUNT`, `BUZZER_IN_USE_STATUSES`, `BUZZER_PILL_CLASS` — all present, none renamed |

✅ **No variable, constant or key was renamed. No value outside the two `<p>` text nodes was touched.**
✅ **The render condition `{activeEvent&&vanBuzzerCount!=null&&(` at `:3487` is unchanged**, so the setting still appears only for a van that carries buzzers.

### tsc / lint

```
$ npx tsc --noEmit -p tsconfig.json            → clean
$ eslint messages on lines 3490-3491           → 0
```

⚠️ **The zero on lines 3490-3491 matters more than a global exit code**: a raw ASCII apostrophe in JSX text is the classic `react/no-unescaped-entities` trip, and the typographic one avoids it. **Nothing fired.**

### ⚠️ A note on `git diff`

`git diff --stat` reports **24 insertions, 3 deletions** on this file. 🔴 **Only 2 insertions and 2 deletions are this task.** The rest is the uncommitted two-arm gate from the previous task in this session, which is still in the working tree. **This task's complete diff is the four lines quoted in "The change" above** — the two `<p>` elements and nothing else.

---

## NON-ASCII CENSUS

### The apostrophe decision, stated

**The file's convention for USER-FACING copy is the TYPOGRAPHIC apostrophe, U+2019 — and it was already present, exactly once:**

```
app/dashboard/[token]/page.tsx:3351
  ['two','Two presses','Best when payment and handover happen at different moments — someone pays at
   the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected”
   when they take the food.']
```

⚠️ **The file also contains many ASCII apostrophes — but every one of them is inside a `//` COMMENT** (`don't evict`, `can't clobber`, `it's NEWER`, and so on). **Not one appears in operator-facing text.** The single user-facing apostrophe in the file before this change was U+2019, in the settings-tab help string quoted above — two rows from the one being edited.

✅ **I USED U+2019 (typographic).** Two reasons, and both hold independently: it matches the file's only precedent for user-facing copy, and it sits alongside the `“…”` curly quotes that same string already uses. It also keeps the JSX text node free of a raw `'`.

✅ **U+2019 ALREADY EXISTED IN THIS FILE, so no character class was gained.**

### Counts

| | Before | After | Δ |
|---|---|---|---|
| **DISTINCT** | **53** | **53** | 🔴 **0 — unchanged** |
| **TOTAL non-ASCII** | **2447** | **2448** | **+1** |
| `’` U+2019 | 1 | 2 | **+1** — the `don’t` in the new description |

```
characters that DROPPED           : 0
characters that VANISHED entirely : 0
NEW character classes introduced  : 0
```

🔴 **The entire non-ASCII delta is one character: the apostrophe you asked about.** Every other non-ASCII character in the file is untouched, because the new copy contains no em dash, no ellipsis and no other typographic mark.

**Garble scan:** zero U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` mojibake.

---

## Summary

| Question | Answer |
|---|---|
| How many places held this copy? | 🔴 **ONE** — `app/dashboard/[token]/page.tsx:3490-3491` |
| Is it in `lib/settings-copy.ts`? | **NO** — that file holds the buzzer **POOL**, a different setting, and says so |
| Is there a Manage sibling? | **NO** — Manage renders `SETTING_COPY.buzzers`, the pool |
| Files changed | **1** |
| Lines changed | **2** |
| Behaviour changed | **NONE** — column, key, handler, resolver, default, render condition and props all untouched |
| Old strings remaining in the product | **ZERO** |
| New character classes | **ZERO** |
