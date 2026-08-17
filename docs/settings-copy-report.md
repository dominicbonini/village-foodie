# Settings copy: the order-ready description, both copies

**Two strings changed, nothing else.** `npx tsc --noEmit` passes with no output — **which is not
verification.**

**Two files changed:** `app/dashboard/[token]/page.tsx` and `lib/settings-copy.ts`. **Copy only** — no
behaviour, no columns, no scope, no new files. **No commit, no stage, no revert, no stash, no clean.**
No build, no `next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no migration.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# 🔴 SHOULD THE TWO BE ONE STRING? NO — THEY ARE TWO DIFFERENT SETTINGS.

**They describe the same FEATURE at two different SCOPES, writing to two different columns.**

| | `lib/settings-copy.ts:127` | The Change-1 string |
|---|---|---|
| **Surface** | 🔴 **MANAGE**, two places | 🔴 **DASHBOARD**, one place |
| **Read by** | `app/manage/[token]/page.tsx:3054` (setup review) and `:9872` (Settings → Your trucks → Display settings) | `app/dashboard/[token]/page.tsx:3949` (Settings tab, per-event row) |
| **Column** | `truck_vans.order_ready_enabled` | `truck_events.order_ready_override` |
| **Scope** | the **TRUCK/VAN DEFAULT**, and the seed for new events | **THIS EVENT ONLY** |
| **Control id** | `order_ready_enabled` | `set_order_ready_override` |

**READ — the two Manage consumers, both taking the same constant:**

```tsx
      id: 'order_ready_enabled',
      label: SETTING_COPY.orderReady.label,
      helpText: SETTING_COPY.orderReady.help,
```
```tsx
                  <p className="text-sm font-semibold text-slate-800">{SETTING_COPY.orderReady.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{SETTING_COPY.orderReady.help}</p>
```

**READ — Manage's own comment naming the split:**

```
              {/* Order-ready step — the TRUCK DEFAULT (order_ready_enabled). Per-event overrides live on
                  the dashboard's Menu & Stock tab. Stage 4 of the order-ready redesign. */}
```

# ✅ SO: THE SAME SETTING DESCRIBED TWICE? **NO. TWO SETTINGS IN A MASTER-SWITCH PAIR.**

`effectiveOrderReady = event.order_ready_override ?? van.order_ready_enabled`. **One is the default,
the other overrides it for a single event.** ⚠️ **Merging them into one string would be wrong, not
merely awkward: the Manage copy has to carry a scope sentence — *"Applies to all events — you can
still turn it on or off for a single event on its dashboard"* — that is meaningless on the dashboard,
which IS that single event.**

## What it would take to have one source — REPORTED, NOT DONE

⚠️ **The shareable part is the FIRST THREE SENTENCES, which are now byte-identical in both.** A single
source would mean adding a second field to `SETTING_COPY.orderReady` — the shared body, plus a
per-scope tail — and having the dashboard import `SETTING_COPY`, which it does not today.

🔴 **THE COST IS THE REASON I DID NOT DO IT UNASKED: `app/dashboard/[token]/page.tsx` currently imports
nothing from `lib/settings-copy.ts`.** Introducing that import couples the dashboard to Manage's copy
module for one string. **Whether that is worth it is a judgement, and the brief said not to extract in
this run.**

---

# CHANGE 1 — THE DASHBOARD, PER-EVENT

**BEFORE — READ (the string I wrote last task):**

```tsx
                  <p className="text-xs text-slate-500 mt-0.5">Show a &ldquo;Mark ready&rdquo; button on the orders screen. Kitchen screens have their own Ready step switch, set on each device &mdash; turning this off here does not turn it off there, and turning it on here does not turn it on there. Whenever an order is marked ready on any screen, the customer is emailed.</p>
```

**AFTER — READ:**

```tsx
                  <p className="text-xs text-slate-500 mt-0.5">Show a “Mark ready” button on the orders screen. Kitchen screens are set separately, on each device. Customers are emailed whenever an order is marked ready.</p>
```

✅ **Your three sentences, verbatim.** ⚠️ **It is roughly a third the length of what it replaces —
which was the problem with the previous version.**

## 🔴 WHICH QUOTES, AND WHY — TYPOGRAPHIC, RAW

**The brief: straight quotes unless the file already uses typographic ones, in which case match the
file.** **READ — the file already uses them, and overwhelmingly as RAW characters:**

```
raw U+201C: 9    raw U+201D: 9    &ldquo; entities: 1
```

🔴 **THE ONE ENTITY WAS THIS STRING** — inherited from the original copy, and the outlier in a file
that writes the character directly everywhere else. **So "match the file" resolves to raw typographic
quotes**, and the file is now internally consistent:

```
$ grep -c "&ldquo;" app/dashboard/[token]/page.tsx
0
```

⚠️ **RAW IS SAFE IN JSX HERE:** `react/no-unescaped-entities` flags `>`, `"`, `'` and `}` — **not curly
quotes** — and the file has carried nine of them in JSX text all along. ⚠️ **The census shows
`U+201C`/`U+201D` rising 9 → 10 and NO class gained**, which is the whole reason to run it on a change
like this.

✅ **`&mdash;` went with the sentence that contained it, so the em dash count is unchanged.**

---

# CHANGE 2 — `lib/settings-copy.ts`, THE TRUCK DEFAULT

## The file's established shape, and why I matched it rather than pasting the three sentences

**READ — the neighbouring entries:**

```ts
  autoAccept: {
    label: 'Auto-accept orders',
    help: 'Incoming web orders are confirmed immediately',
  } as SettingCopy,
```
```ts
  buzzers: {
    label: 'Do you hand out buzzers for collection?',
    help: 'Record which buzzer you gave each customer, so you know who to look for when their food is ready.',
    countLabel: 'How many buzzers do you have?',
  },
```

⚠️ **`orderReady` is the only entry whose help carries a SCOPE sentence, and it needs one: it is the
truck default with a per-event override, so an operator reading it in Manage must be told the override
exists.** **That is the "different established shape" the brief allows for** — so the three sentences
went in verbatim and the scope sentence was kept.

**BEFORE — READ:**

```ts
    help: 'Show a “Mark ready” button on the orders screen and notify customers when their order is ready. '
      + 'Useful for collection at pubs and festivals. Applies to all events — you can still turn it on or '
      + 'off for a single event on its dashboard.',
```

**AFTER — READ:**

```ts
    help: 'Show a “Mark ready” button on the orders screen. Kitchen screens are set separately, on each '
      + 'device. Customers are emailed whenever an order is marked ready. Applies to all events — you can '
      + 'still turn it on or off for a single event on its dashboard.',
```

✅ **The false claim is gone** — *"and notify customers when their order is ready"* implied the setting
controls the email. ✅ **Sentences one to three are byte-identical to Change 1's.** ✅ **Typographic
quotes and the em dash were already the file's convention and are unchanged.**

## ⚠️ ONE SENTENCE WAS DROPPED, AND I AM FLAGGING IT RATHER THAN BURYING IT

🔴 **`'Useful for collection at pubs and festivals. '` IS GONE.** It was editorial rather than factual,
and keeping it alongside three new sentences plus the scope line would have made the help longer than
the one you just asked me to shorten. **Nothing else was removed. Say the word and it goes back.**

---

# 🔴 THE SCAN — IS THERE A THIRD COPY?

# ✅ NO. THESE TWO ARE THE ONLY OPERATOR-FACING DESCRIPTIONS OF THIS SETTING.

**Scanned `app`, `components`, `lib` for `Mark ready`, `Order-ready`, `order ready`, `Ready step`, and
every `help:` / `helpText` / `detail:` string containing "ready".**

| Location | What it is | Repeats the false email claim? |
|---|---|---|
| `app/dashboard/[token]/page.tsx:3949` | 🔴 **the per-event description** | ✅ **FIXED — Change 1** |
| `lib/settings-copy.ts:127` | 🔴 **the truck-default description** | ✅ **FIXED — Change 2** |
| `app/dashboard/[token]/page.tsx:3948` | the label `Order-ready step` | no description |
| `lib/settings-copy.ts:126` | the label `Order-ready step` | no description |
| `app/dashboard/[token]/kds/page.tsx:1514` | the KDS switch label `Ready step` | **no description at all** |
| `page.tsx:2973, 3655, 3676, 3731, 3937, 4197` · `manage:9861, 9867, 9893` · `OrderCard.tsx:132` · `van-utils.ts:25` | **code comments** | not operator-facing |
| `app/api/dashboard/route.ts:530` | a **server log** string | not operator-facing |
| `lib/email.ts:30-31, 42, 62` | the ready EMAIL's own copy (`readySuffix`) | ⚠️ **describes the email, not the setting — correctly** |

⚠️ **THREE MARKETING ROWS MENTION "ready" AND ARE A DIFFERENT FEATURE — checked and cleared:**

```ts
      { name: 'SMS order alerts', detail: "Text customers automatically when their order's ready. …
      { name: 'Customer-facing display',   detail: 'A screen customers can see showing order numbers and when they’re ready.', …
      { name: 'Automatic schedule import', … 'a photo you already post to Facebook…'
```

🔴 **None describes the order-ready setting.** ✅ **The signup wizard (`DemoGetStarted.tsx`) does not
mention it — its three "ready" hits are an email input, a comment, and "button ready".**

⚠️ **NOTHING BEYOND THE TWO STRINGS WAS CHANGED.**

---

# 🔴 VERIFICATION

**`tsc` passing is NOT verification and is not counted.**

| Item | Method |
|---|---|
| The dashboard file already used typographic quotes 9× vs 1 entity | ✅ **EXECUTED** — counted both forms |
| No `&ldquo;` remains in the dashboard file | ✅ **EXECUTED** — `grep -c` returns 0 |
| Both strings now open with the identical three sentences | ✅ **EXECUTED** — matched literally in both files |
| Which surfaces read each string | ✅ **EXECUTED** — `SETTING_COPY` consumers enumerated repo-wide |
| No third operator-facing copy | ✅ **EXECUTED** — five scan patterns across `app`, `components`, `lib` |
| Census, byte scan, carrier | ✅ **EXECUTED** |
| **The Manage rows render the new help** | 🔴 **SOURCE READ ONLY — NOT OBSERVED** |
| **The dashboard row renders the new description** | 🔴 **SOURCE READ ONLY — NOT OBSERVED** |
| **The shorter copy fits its container** | 🔴 **NOT OBSERVED**, but ⚠️ **it is now SHORTER than the string that shipped before last task's version, so the risk runs the safe way** |
| **The curly quotes render correctly in JSX** | 🔴 **SOURCE READ ONLY** — nine siblings in the same file already do |

⚠️ **The email behaviour itself was verified by EXECUTION in the previous task and is not re-verified
here** — `deliverReadyEmail` has two call sites, neither reads the setting, and its only guard is
`if (!order.customer_email) return`. **This task changed copy only; that finding stands unchanged.**

---

# INTEGRITY

## Non-ASCII class census, before and after

### `app/dashboard/[token]/page.tsx` — 53 classes BEFORE, **53 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| **U+201C LEFT DOUBLE QUOTATION MARK** | 9 | 10 | **+1** | 🔴 **the deliberate entity → raw switch.** `&ldquo;` became `“` to match the file's nine existing raw quotes |
| **U+201D RIGHT DOUBLE QUOTATION MARK** | 9 | 10 | **+1** | the closing half of the same pair |
| *all 51 others* | — | — | **0** | 🔴 **including `U+2014`: the removed sentence's `&mdash;` was an ENTITY, so no em dash was added or lost** |

✅ **NO CLASS GAINED, NONE LOST.** ⚠️ **This is exactly the census that mattered here, and it says the
only movement is the two quote characters I intended.**

### `lib/settings-copy.ts` — 8 classes BEFORE, **8 AFTER**

| Class | BEFORE | AFTER | Δ |
|---|---|---|---|
| *every class* | — | — | 🔴 **0 — NO CLASS-COUNT CHANGE AT ALL** |

✅ **The rewrite reused the file's existing `“ ” —` characters exactly**, so the census is byte-stable:
`U+201C` 1, `U+201D` 1, `U+2014` 26, unchanged.

## Carrier-aware check — edited files

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| dashboard | U+26A0 | 78 / 75 / **3** | 78 / 75 / **3** | ✅ **identical** |
| `lib/settings-copy.ts` | U+26A0 | 12 / 12 / **0** | 12 / 12 / **0** | ✅ **identical** |
| dashboard | U+1F534 | 94 / 0 / 94 | 94 / 0 / 94 | ✅ |
| `lib/settings-copy.ts` | U+1F534 | 8 / 0 / 8 | 8 / 0 / 8 | ✅ |

🔴 **Neither file's warning-sign count moved at all — this change touched no emoji.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. Both written files, plus this report in a SEPARATE pass.**

```
  app/dashboard/[token]/page.tsx                        390,152  offending=0  CR=0   (was 390,302)
  lib/settings-copy.ts                                   10,409  offending=0  CR=0   (was 10,392)
  docs/settings-copy-report.md      (SEPARATE PASS)      16,020  offending=0  CR=0
TOTAL OFFENDING: 0
```

⚠️ **The dashboard shrank by 150 bytes and `settings-copy.ts` grew by 17 — the dashboard's description
lost two-thirds of its length and the Manage help gained one sentence net.**

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 30 | 0 | 30 |
| U+1F534 LARGE RED CIRCLE | 23 | 0 | 23 |
| U+26A0 WARNING SIGN | 17 | **17** | **0** |

**Every warning sign is paired; ZERO are bare — 17 of 17.** The file's total U+FE0F count is **17**,
which accounts for all of them and leaves none attached to any other base. ⚠️ **The two unpaired bases
are internally consistent (0 of 30, 0 of 23), so neither is split across two renderings.**
✅ **U+2500 does not appear in this report at all.**

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
 M lib/settings-copy.ts
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-event-bar-fix-report.md
?? docs/kds-event-bar-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-pill-audit-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
?? docs/kds-two-switches-build-report.md
?? docs/kds-two-switches-report.md
?? docs/kds-view-removal-report.md
?? docs/settings-copy-report.md
?? lib/event-display.ts
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/page.tsx` | ⚠️ **PARTLY** — several earlier tasks; **this task made Change 1** |
| `M lib/settings-copy.ts` | 🔴 **THIS TASK — its first change; it was NOT in the diff before** |
| `?? docs/settings-copy-report.md` | 🔴 **THIS TASK** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — nine earlier tasks |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the step switches |
| `M components/dashboard/AddOrderPanel.tsx` · `?? lib/event-display.ts` | ✅ pre-existing — the `fmtVenue` / status-label extractions |
| `M app/manage/[token]/page.tsx` · `M components/DemoGetStarted.tsx` · `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing — cuisine dropdown |
| `M docs/reference-manual.md` | ✅ pre-existing — V11.22 |
| `?? components/shared/EventActionsModal.tsx` · `EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/*.md` (thirteen earlier reports) | ✅ pre-existing |

⚠️ **ELEVEN TASKS' WORK IS NOW UNCOMMITTED, ACROSS EIGHT SOURCE FILES.**
