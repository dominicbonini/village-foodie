# WhatsApp → coming soon: applied

**Nothing committed. Nothing deployed. No migration, no SQL. The gate was NOT changed.**
**Restore notes updated by ADDITION only:** `docs/landing-copy-restore-notes.md` §6.

---

## VERIFICATION

- 🔴 **ONE REAL EXECUTION, and it is the only thing here that counts as more than a source read:** I ran
  `findPlanParityViolations()` directly via `tsx`. **It returned 0 violations.** §2 explains why that
  result means less than it looks like.
- **Sanity checks only:** `tsc --noEmit` exit 0; `eslint` **0 problems** on both changed files.
  **Neither is verification.**
- 🔴 **I have not rendered the landing page, the Billing tab or admin in a browser.** Everything about
  what an operator or visitor *sees* is inference from the source.

**No span of the prompt arrived garbled. No instruction contradicted another** — the contradiction that
stopped the previous task was resolved by your decision, so nothing needed stopping on.

---

## 1 · Recorded before touching anything

**`docs/landing-copy-restore-notes.md` §6 was ADDED. Nothing existing in that file was edited** — the
verbatim originals in §1–§4 are untouched and remain the restore source.

**Every string this task changed was already recorded verbatim** in §1 (the row **and** its comment),
§2 (the block **and** its comment) and §3 (the bullet). ✅ **No string was altered without a prior
record.** §6 supersedes the now-stale "NOT CHANGED" labels and gives the restore order.

---

## 2 · The matrix row — flipped

**`lib/plan-features.ts:223`** (was `:212`; the added comment shifted it).

```diff
- starter: false, pro: true,           max: true
+ starter: false, pro: 'coming_soon', max: 'coming_soon'
```

**Existing mechanism, nothing invented.** `Cell()` in `app/landing/page.tsx:95` already renders
`'coming_soon'` as `<span className="soon">Coming soon</span>`, and the Messenger row directly below has
used the same value all along.

**I also rewrote the comment above it**, which asserted *"WhatsApp is LIVE"* — directly contradicting
the row beneath it. **That comment is recorded verbatim in restore notes §1**, and the previous report
flagged it as needing to change in the same edit.

⚠️ **One structural thing I did NOT do, reported rather than actioned.** The file keeps a block labelled
`// Coming soon (kept at the bottom of the section)`. **The WhatsApp row is now coming-soon but sits
ABOVE that label**, so the block no longer contains every coming-soon row in the section. 🔴 **Moving it
is a reorder you did not ask for, and the two rows' order now encodes which channel ships first — so I
left it and am telling you instead.**

---

## 3 · 🔴 THE GATE — what is needed, and what breaks. NOT CHANGED.

### The one-line change

```ts
// lib/features.ts:51 — delete this line
'whatsapp_replies',   // Pro+Max — moved from Max-only: …
```

**That single deletion removes it everywhere**, because the sets chain:

```
PRO_FEATURES  ─┬─► MAX_FEATURES = [...PRO_FEATURES, …]
               └─► TRIAL_FEATURES = [...MAX_FEATURES]  ─► trial AND demo
```

**There is no second place to edit** — `whatsapp_replies` appears once, in `PRO_FEATURES`.

### 🔴 Do the live trucks currently have it? YES — and the reason is the one you named

**Both live trucks are `plan='trial'`, `TRIAL_FEATURES = [...MAX_FEATURES]`, and
`PLAN_FEATURES.trial = new Set(TRIAL_FEATURES)`.** **So `canAccess('trial','whatsapp_replies')` is
`true` today for both.**

⚠️ **Whether a WhatsApp message is actually reaching either truck is a DIFFERENT question and I could
not answer it.** The gate permits it; whether a number is connected depends on `trucks.whatsapp_sender`
and Meta-side configuration. 🔴 **I ran no SQL and did not query production, so I cannot tell you
whether any live message is currently being auto-replied.** **That is the fact to establish before
removing the gate.**

### What breaks if the gate moves

| # | Site | Effect |
|---|---|---|
| 1 | `app/api/webhooks/whatsapp/route.ts:55` | `if (!canAccess(...)) return` → **auto-replies stop.** 🔴 **If a real customer message arrives, it now goes unanswered rather than answered** — a behaviour change for a customer, not just an operator |
| 2 | `app/api/webhooks/meta/whatsapp/route.ts:250` | Same |
| 3 | `app/manage/[token]/page.tsx:9643` | `WHATSAPP_LIVE && can('whatsapp_replies')` → **no visible change**, `WHATSAPP_LIVE` is already `false` |
| 4 | `findPlanParityViolations()` | **No violation either way** — see the ordering note below |
| 5 | Per-truck `feature_overrides` | ⚠️ **An override still grants it.** `canAccess` checks overrides first, so a truck with `{whatsapp_replies:true}` keeps it. **The escape hatch survives** |

### 🔴 The ordering matters, and it is now in the safe direction

- **Row `true` + gate removed** → `row[tier] === true && !canAccess(...)` → **VIOLATION → throws in
  dev.**
- **Row `coming_soon` + gate removed** → the cell is skipped → **no violation.**

✅ **Because the row moved first, the gate can now be removed without tripping the guard.** ⚠️ **And
that is also the problem: the guard would not have stopped a mistake here either.**

### Why the checker cannot see the current gap

```ts
if (row[tier] === true && !canAccess(tier, feature)) { … }
```

**It only inspects cells that are literally `true`.** Today the row says `'coming_soon'` while
`canAccess('pro'|'max'|'trial','whatsapp_replies')` is **still `true`** — **the product allows what the
marketing says is coming.** 🔴 **The checker catches advertised-but-blocked. This is the opposite:
blocked-in-copy but allowed-in-product. It has no test for that direction at all.**

**My recommendation, for your decision:** delete `lib/features.ts:51` **only after** establishing that
no live truck is receiving auto-replied WhatsApp messages. **The safer interim is a per-truck
`feature_overrides` entry for any truck that genuinely needs it.**

---

## 4 · The key-features block — your approved wording, applied

**`app/landing/page.tsx:187`.**

**BEFORE:**
> **Social media auto-replies**
> “Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re driving to
> the pitch or at the grill. Messenger and Instagram coming soon.

**AFTER:**
> **Social media auto-replies — coming soon**
> “Where are you tonight?” “Do you do gluten free?” Soon your WhatsApp will get answered while you’re
> driving to the pitch or at the grill. Messenger and Instagram to follow.

✅ **Curly quotes preserved exactly** — `“ ”` around both questions, `’` in `you’re`. **I pasted from the
restore notes rather than retyping.**

---

## 5 · The tense comment — updated, not deleted

**`app/landing/page.tsx:174-178` → now `:174-186`.**

**OLD (verbatim, and preserved in restore notes §2):**

> 🔴 THE MIXED TENSES ARE DELIBERATE. WhatsApp is PRESENT tense because it ships at launch; Messenger
> and Instagram carry "coming soon" because they may not. Same standing editorial rule as FOOTNOTES[3]
> in lib/plan-features.ts — the landing page describes the product AT LAUNCH — applied to two features
> with different readiness. It is NOT an inconsistency; do not "harmonise" the tenses.

**NEW:**

> 🔴 THE TENSES ARE NOW UNIFORM, AND THAT IS THE CHANGE. This block used to read WhatsApp in the PRESENT
> tense — "your WhatsApp gets answered" — because it was expected to ship at launch, with Messenger and
> Instagram carrying "coming soon". A standing note here told the next reader NOT to harmonise them, and
> that instruction was correct for that state.
> ⚠️ THAT STATE NO LONGER HOLDS, so the instruction is retired rather than deleted — the reasoning is
> worth keeping because it explains why the old wording looked inconsistent and was not.
> app/manage/[token]/page.tsx:8378 sets `WHATSAPP_LIVE = false`, so the operator's own Connect control
> has been showing "coming soon" the whole time. The copy now says the same thing the product does.
> 🔴 THE NEW RULE, AND IT IS THE SAME RULE UNDERNEATH: the landing page describes the product AS IT IS.
> All three channels are future tense because none of the three is available. If WhatsApp ships, this
> block, the matrix row in lib/plan-features.ts and the Pro-card bullet below all move back together —
> they are three surfaces of one fact and must not drift.

**The old instruction is retired with its reasoning intact, and the replacement names the reverse
condition** so the next reader knows what would make it change back.

---

## 6 · The Pro-card bullet

**`app/landing/page.tsx:340`.**

```diff
- <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
+ <li>WhatsApp, Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>
```

**Existing mechanism** — `<span className="soon-inline">Coming soon</span>`, the same pattern the two
Max bullets and *"Take payment on your phone"* already use.

⚠️ **ONE JUDGEMENT CALL, FLAGGED.** I merged the label to *"WhatsApp, Messenger & Instagram
auto-replies"* rather than keeping *"WhatsApp auto-replies (Messenger & Instagram coming soon)"* beside
a **Coming soon** badge — the parenthetical would have been redundant and would have implied WhatsApp
was the available one. **If you would rather it read `WhatsApp auto-replies` alone, that is a one-word
edit.** `&amp;` preserved as an entity.

---

## 7 · The three protected strings — untouched

**Proven by diff: none appears in it.**

| String | Status |
|---|---|
| `Online ordering — Pay at Hatch` (3 exact-match occurrences) | ✅ **Untouched** |
| The bare `—` cell value, `app/landing/page.tsx:96` | ✅ **Untouched** |
| The customer testimonial | ✅ **Untouched, and not reproduced** |

⚠️ **The new h3 contains an em dash** — *"Social media auto-replies — coming soon"* — **but it is your
approved wording and is not one of the protected strings.** Recorded so it is not mistaken for dash
drift.

---

## 8 · Every surface that now describes WhatsApp auto-replies

### ✅ Presentation — all four now agree

| # | Surface | Says |
|---|---|---|
| 1 | `lib/plan-features.ts:223` → **landing table, Billing tab, admin** | **"Coming soon"** for Pro and Max; `—` for Starter |
| 2 | `lib/plan-features.ts:225` (Messenger & Instagram) | **"Coming soon"** — unchanged |
| 3 | `app/landing/page.tsx:187` key-features | **"Social media auto-replies — coming soon"** |
| 4 | `app/landing/page.tsx:340` Pro card | **"WhatsApp, Messenger & Instagram auto-replies — Coming soon"** badge |

### ✅ Product — already agreed, unchanged

| # | Surface | Says |
|---|---|---|
| 5 | `app/manage/[token]/page.tsx:8378` | `WHATSAPP_LIVE = false` |
| 6 | `app/manage/[token]/page.tsx:9643` | Connect control **hidden** |

### 🔴 Gate — the one surface that still disagrees

| # | Surface | Says |
|---|---|---|
| 7 | `lib/features.ts:51` | 🔴 **`whatsapp_replies` GRANTED to Pro, Max, trial and demo** |
| 8 | `app/api/webhooks/whatsapp/route.ts:55` | Would **reply** if a message arrived |
| 9 | `app/api/webhooks/meta/whatsapp/route.ts:250` | Would **reply** |

### ⚠️ Two supporting strings I did not change

| # | Surface | Says |
|---|---|---|
| 10 | `lib/plan-features.ts:353` footnote 4 | *"Auto-replies require a Business account… Replies are AI-generated and can occasionally be wrong"* — **describes the feature as operating.** ⚠️ **Attached to both now-coming-soon rows. Not in your list; reads slightly oddly under a "Coming soon" cell** |
| 11 | `lib/plan-features.ts:195` | A comment referencing the Messenger row. **Accurate, untouched** |

> 🔴 **BOTTOM LINE: every marketing surface and every product surface now says "coming soon". The GATE
> still says "included", and three webhook paths would act on it. Items 7–9 are the remaining
> disagreement, and closing it is §3, awaiting your decision.**

---

## What I could not establish

1. 🔴 **Whether any live truck is currently receiving auto-replied WhatsApp messages.** **The decisive
   fact before removing the gate.** Needs `trucks.whatsapp_sender` and the Meta-side config — **I ran no
   SQL.**
2. **How any of this renders.** **Not opened in a browser.** The Billing tab and admin read the same row
   and are expected to change with it — **expected, not observed.**
3. **Whether footnote 4's wording should change** with the rows it annotates (item 10 above).
4. **Whether the coming-soon block should be reordered** so the WhatsApp row joins it (§2).
