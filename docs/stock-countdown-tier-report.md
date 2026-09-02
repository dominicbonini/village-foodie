# Automated stock countdown — off Starter, and moved

**Built. Not deployed, not committed. No SQL, no migrations. One file changed: `lib/plan-features.ts`.**

**GARBLED SPANS: none.** No instruction contradicted another. **Only one row matched "automated stock
countdown", so §1's stop condition did not trigger.**

**VERIFICATION.** Not a typecheck. I **ran the parity checker**, **checked `canAccess()` directly for
every tier**, **rendered the landing table in a browser**, and **regenerated the PDF and opened it**.

---

## 1. The row — exactly one, so no stop

| | |
|---|---|
| **Label** | `Automated stock countdown` |
| **Detail** | *"Set a stock count and HatchGrab counts it down as orders come in, then sells out automatically."* |
| **Section (before)** | **Core operations** — `lib/plan-features.ts:194` |
| **Trial** | ✓ — **derived**, not stored (`trialFeatureValue` → `row.max`) |
| **Starter** | **true** |
| **Pro** | **true** |
| **Max** | **true** |

**I searched every row name for "stock", "countdown", "sold out" and "sold-out". Two rows came back, and
only one is the countdown:**

- `Automated stock countdown` — **this one**, the automatic decrementing.
- `Instant sold out toggle` — the **manual** control. A different capability, and §2's answer.

**No ambiguity, so I did not stop.**

---

## 2. What Starter keeps — the manual toggle is already its own row. **No gap.**

```
{ name: 'Instant sold out toggle',
  detail: 'Mark any item sold out in one tap — it greys out for customers straight away.',
  starter: true, pro: true, max: true }
```

It sits in **Core operations** at `:193` — directly above where the countdown used to be — and is
**untouched by this change**. `canAccess('starter','sold_out_toggle')` is **true**, so the row and the
gate agree for Starter on that capability.

🟢 **So the table still says what a Starter truck can do about stock**: mark items sold out by hand. What
it loses is HatchGrab doing it automatically. That is a clean, readable distinction and **no new wording
is needed** — you asked me to recommend some only if there were a gap, and there is not.

⚠️ **One dependency worth recording:** this change is only honest *because* that row exists at
`starter: true`. **If `Instant sold out toggle` is ever moved, gated or renamed, this change silently
becomes a straight removal of Starter's only stock capability.** That is now written into the code
comment beside the moved row so the next person sees it.

---

## 3. Before and after

| Tier | Before | After |
|---|---|---|
| Trial | ✓ (derived from Max) | **✓ — unchanged** |
| **Starter** | **✓ true** | 🔴 **false** |
| Pro | ✓ true | **✓ — unchanged** |
| Max | ✓ true | **✓ — unchanged** |

**Only the Starter cell changed.** Verified in the rendered landing table: `["✓","—","✓","✓"]` for
Trial / Starter / Pro / Max, with the protected `'—'` em dash in the Starter column.

### 🔴 I also moved the row — you asked me to decide, so here is the reasoning

You said *"Decide where best to put it in the list maybe next to smart slot management."* I moved it from
**Core operations** to **Online sales & automation, immediately after Smart Slot Management**.

**Why it could not stay in Core operations:** that section's character is *"what every plan gets"* —
every row in it is `starter: true` apart from the pay-at-hatch row and the two coming-soon app rows.
**A `starter: false` row there makes the section stop meaning anything**, and a reader scanning for "what
do I get on the free plan" would have to read every cell instead of trusting the grouping.

**Why next to Smart Slot Management specifically:** the two are the same idea applied to different
resources — Smart Slot Management paces **orders** against kitchen capacity, this paces **items** against
stock. Both are "HatchGrab manages your capacity for you". *Auto-accept online orders* now follows,
which is right: it is about **handling** orders, not pacing them.

**Every row in the destination section is `starter: false`**, so the new cell is consistent with its
neighbours rather than the exception.

---

## 4. 🔴 The gate — reported, NOT changed, and the gap is real

| | |
|---|---|
| **`ROW_FEATURE_MAP` entry** | `'Automated stock countdown': 'stock_countdown'` (`:452`) — **unchanged** |
| **What `PLAN_FEATURES` grants Starter** | 🔴 **`stock_countdown` is an explicit member of the `starter` Set** — `lib/features.ts:76-87`, listed literally alongside `sold_out_toggle` |
| **`canAccess('starter','stock_countdown')`** | 🔴 **`true`** — measured, not inferred |

**`lib/features.ts` was not touched, per item 8.**

### The gap, stated plainly so it is recorded

> **From now until the gate is changed, the comparison table says a Starter truck does NOT get automated
> stock countdown, while the code still grants it.** The table is ahead of the gate, in the direction
> that under-promises rather than over-promises.

**This is safe only because of the fact you gave me: nobody is on Starter and the platform has not
launched.** On a live platform this would be a truck being told it has lost something it can still use —
confusing, but not harmful. Reversed (table says yes, gate says no) it would be a sold feature that
silently fails, which is the direction the parity checker exists to catch.

It is recorded in three places: here, in a comment beside the row, and in §5's measurement.

### Does this make a sixth unenforced gate? — **No.**

**`stock_countdown` was ALREADY unenforced before this change.** I grepped every `.ts`/`.tsx` in `app/`,
`lib/` and `components/` for `canAccess(…stock…)` and `hasFeature(…stock…)`:

```
(no matches)
```

**Zero enforcement sites.** The key appears only in `lib/features.ts` (its declaration and set membership)
and `lib/plan-features.ts` (the row map). The countdown runs for every plan because **nothing checks the
flag** — exactly the shape the manual records for `online_ordering_pay_at_hatch` as the fifth.

🔴 **So the unenforced-gate count is unchanged. What this change creates is a different thing, and it
deserves its own name: a row↔gate MISMATCH.** Two distinct problems now sit on this one key:

1. **It is unenforced** (pre-existing, not counted here as new).
2. **The table and the grant now disagree** (new, deliberate, being closed separately by you).

**Closing (2) means editing `lib/features.ts`. Closing (1) means adding a real `canAccess` call where the
countdown happens** — and those are two different jobs. Doing only (2) would leave a gate that says no
and code that still counts down. **See §6.**

---

## 5. The parity checker — run, and deliberately not trusted

```
parity violations : none
```

🔴 **That clean run proves nothing about this change, and you were right to say so.**
`findPlanParityViolations` only tests cells that are literally `true`:

```ts
if (row[tier] === true && !canAccess(tier, feature)) { … }
```

**A newly-false Starter cell is invisible to it.** The checker cannot see the gap it was built to prevent
in this direction, because this gap points the other way.

**So I checked every tier directly:**

| Tier | Row says | `canAccess(tier,'stock_countdown')` | Agree? |
|---|---|---|---|
| **starter** | **false** | **true** | 🔴 **NO — the deliberate gap** |
| pro | true | true | ✅ yes |
| max | true | true | ✅ yes |

**The gap is measured and named, not merely unflagged.**

Also verified after the move: **every `ROW_FEATURE_MAP` key still resolves to a real row** (24 keys, none
orphaned). Moving a row between sections does not change its name, so the join key still matches — but
that is the kind of thing that fails silently, so it was checked rather than assumed.

---

## 6. 🔴 What a Starter operator sees in Manage — report only, nothing changed

**Today, and after this change: the stock field is fully settable AND it still works.**

- **No plan gating on the inputs.** `Default stock/event` (`app/manage/[token]/page.tsx:4106`, `:4304`)
  and the per-item stock count carry **no `can(...)`, no `FeatureGate`, no plan check** — grepped, zero
  matches.
- **The countdown itself is not gated either** (§4): zero `canAccess` sites for `stock_countdown`, so it
  decrements for every plan including Starter.

### So is this change leaving a settable-but-inert field? — **No, not yet. And that matters.**

**The field is settable and functional.** The mismatch today is only that the *table* says Starter does
not have a feature the *product* still gives them. Nothing on screen becomes a lie; a number an operator
sets will still count down.

🔴 **The inert-field risk arrives the moment you close the gate, and it will not announce itself.** When
`stock_countdown` is removed from `PLAN_FEATURES.starter`:

- If you **also** add the missing `canAccess` check at the countdown, a Starter operator will still see
  the **Default stock/event** input and the per-item stock count, set a number, and watch it do nothing.
  **That is precisely the "sits on screen looking like it means something" failure you named.**
- If you **do not** add that check, removing it from the Set changes nothing at all — the gate stays
  decorative and the countdown keeps running.

**Recommendation, for the separate gating change and not for now:** treat Manage as part of that change,
not a follow-up. The stock inputs need to be hidden or disabled for a plan without the feature **in the
same commit** that starts enforcing it. **I have changed nothing in Manage.**

---

## 7. Every surface, and the PDF

All four render `FEATURE_SECTIONS` with no per-row filtering, so the row moved on all of them together.

| Surface | Status |
|---|---|
| **Landing table** | ✅ **measured in a browser** |
| **PDF** | ✅ **regenerated and opened** |
| **Admin** (`app/admin/page.tsx:984`) | ⚠️ **not rendered** — no admin credential; creating one needs SQL |
| **Manage → Billing** (`app/manage/[token]/page.tsx:11402`) | ⚠️ **not rendered** — no token, same reason |

### Landing — measured

```
section : "Online sales & automation"
above   : "Smart Slot Management"
ROW     : "Automated stock countdown"  ["✓","—","✓","✓"]   [Trial,Starter,Pro,Max]
below   : "Auto-accept online orders"
Starter keeps: "Instant sold out toggle" in "Core operations"  ["✓","✓","✓","✓"]
```

**Correct section, correct neighbours, correct cells — and Starter's manual toggle still reads ✓ across
all four columns in Core operations.**

### PDF — regenerated and opened

**2 pages, A4, 167,062 bytes.** The moved row is now the **last row on page 1**, rendered **whole** —
both lines of its detail and all four cells — with **nothing split across the page break**
(`tr { break-inside: avoid }` holding). Core operations on page 1 now ends at *Android kitchen app* with
no countdown row, and *Instant sold out toggle* is still there at ✓ ✓ ✓ ✓. Header repeats on page 2;
all five footnotes present. A fresh copy is at `~/Downloads/hatchgrab-plans-and-features.pdf`.

⚠️ **Admin and Manage → Billing are read-from-code, not observed.** Both map every row unfiltered and use
the same cell renderer, so the row will move and read the same way — but I did not see them. 🟢 One
thing that *is* certain: `findPlanParityViolations()` runs at module load and **throws in development**,
and both surfaces import `lib/plan-features.ts`, so if the row and gate disagreed in the *breaking*
direction neither page would render. They will render.

---

## 8. What was not touched

| | |
|---|---|
| The three protected strings | ✅ `'Online ordering — Pay at Hatch'` still 2 occurrences; the bare `'—'` cell literals still 2 |
| `lib/features.ts` (the gate) | ✅ **untouched** — the gap in §4 is deliberate |
| `lib/pricing.ts` (price mask set) | ✅ untouched |
| `app/landing/layout.tsx` (landing admin gate) | ✅ untouched |
| Manage | ✅ untouched (§6 is report-only) |
| Any other row | ✅ only the countdown row moved and only its Starter cell changed |

---

## Files changed

```
lib/plan-features.ts   'Automated stock countdown' moved from 'Core operations' to
                       'Online sales & automation' (after Smart Slot Management), starter true -> false.
                       Trial/Pro/Max unchanged. ROW_FEATURE_MAP unchanged.
```

**Nothing deployed. Nothing committed.**

## The one thing to carry forward

**`stock_countdown` now has a table saying Starter does not get it and a `PLAN_FEATURES` set saying it
does — and no code anywhere that checks either.** Closing that needs two edits, not one: remove it from
the Starter set **and** add the enforcement the key has never had, with Manage's stock inputs hidden in
the same change (§6).
