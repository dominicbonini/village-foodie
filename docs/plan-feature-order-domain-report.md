# Plan features — "Order page on your own website", plus the app-availability line

**Files changed — two:** `lib/plan-features.ts` · `app/landing/page.tsx`.
✅ **`lib/features.ts` is UNCHANGED** — `git diff --stat` on it is empty. Nothing under `app/api`, no
KDS, no dashboard, no ordering page, no SQL.
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or `restore`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1

## Q1 — the row shape

```ts
export type FeatureValue = boolean | 'coming_soon'

export interface FeatureRow {
  name: string
  detail?: string       // plain-operator tooltip copy (the landing table's `?` hover text)
  footnote?: string
  starter: FeatureValue
  pro: FeatureValue
  max: FeatureValue
}
```

🔴 **THERE IS NO `id` FIELD. `name` IS THE IDENTIFIER** — it is also the key of `ROW_FEATURE_MAP`, and
the file warns that renaming a row without renaming its map entry *"silently drops that row from
findPlanParityViolations()"*. **So the brief's `custom_order_domain` row id has no place to go, and I
used the file's convention instead: the row is identified by its `name`, `Order page on your own
website`.** ⚠️ **Nothing was invented — an `id` field would have been a schema change to the type.**

`true` renders a tick; `'coming_soon'` renders the muted "Coming soon" treatment; `false` renders
blank. **Starter and Pro are `false`, which is the file's existing spelling for "empty".**

## Q2 — the Max bullets

🔴 **THEY ARE WRITTEN SEPARATELY, NOT DERIVED.** The table rows live in `lib/plan-features.ts`; the
bullets are hand-written `<li>`s in `app/landing/page.tsx:349-354`:

```tsx
                <li className="lead">Everything in Pro, plus</li>
                <li>Multi-device kitchen sync</li>
                <li>Kitchen ticket printing</li>
                <li>Event &amp; festival pricing <span className="soon-inline">Coming soon</span></li>
                <li>Digital loyalty stamp cards <span className="soon-inline">Coming soon</span></li>
```

⚠️ **So a row and its bullet can drift** — nothing links them. **Both were edited.**

## Q3 — the parity checker

```ts
export function findPlanParityViolations(): string[] {
  for (const section of FEATURE_SECTIONS) {
    for (const row of section.rows) {
      const feature = ROW_FEATURE_MAP[row.name]
      if (!feature) continue
      for (const tier of tiers) {
        if (row[tier] === true && !canAccess(tier, feature)) {
```

# ✅ A NEW `coming_soon` ROW PASSES ON TWO INDEPENDENT GROUNDS: `ROW_FEATURE_MAP` has no entry for it, so `if (!feature) continue` skips it before any tier is read; and even if it had one, the guard tests `row[tier] === true`, and `'coming_soon'` is not `true`. **Confirmed by EXECUTION — see Verification.**

## Q4 — every existing row, and the `cook_screen` trap

**Gated rows (`ROW_FEATURE_MAP`):** Discovery map listing · Universal web dashboard · **QR code** ·
Meal deals & upsells · Walk-up order processing · Instant sold out toggle · Automated stock countdown
· Online ordering — Pay at Hatch · iPhone, iPad and Android kitchen app · Offline Order Protection ·
Online payments · Advance pre-ordering · Customer time slot selection · Kitchen ticket printing.
**Coming-soon rows:** Customer-facing display · Event & festival pricing · Digital loyalty stamp cards.

🔴 **NOTHING COVERS THIS FEATURE, AND THE TWO NEAR-MISSES ARE NAMED IN THE SOURCE COMMENT.** `QR code`
(→ `qr_menu`) and the order link are things operators **already have on every plan** — and both point
**at our address**. This row is the page served at **theirs**. ⚠️ **The `cook_screen` precedent —
"Customer-facing display" mapped to a flag gating an operator grill screen — is exactly why that
distinction was written into the file rather than left to a reader.**

## Q5 — does a marketing-only row need a `lib/features.ts` entry?

# ✅ NO. `ROW_FEATURE_MAP` is a partial `Record<string, Feature>` and the checker's `if (!feature) continue` is the file's own statement that a row may have no gate. **All three existing coming-soon rows are absent from it. `lib/features.ts` was not touched.**

---

# STAGE 2 — THE ROW

```ts
      { name: 'Order page on your own website', detail: 'Your ordering page at your own web address, so customers stay with you.', starter: false, pro: false, max: 'coming_soon' },
```

**Placement:** immediately after `Event & festival pricing` and before `Digital loyalty stamp cards`,
**inside the block the file labels `// Coming soon (kept at the bottom of the section)`.** ⚠️ **That
comment is a stated convention, so putting it anywhere else would have broken it.**

## 🔴 WHAT I CUT FROM THE DETAIL, AND WHY

**Brief:** *"…at your own web address, so customers stay with you **instead of being sent to ours**."*
**Shipped:** *"…at your own web address, so customers stay with you."*

**Cut: `instead of being sent to ours` — 30 characters.** The other details in this section run 48–96
characters; the brief's line is **103**, the longest in the file. **The clause it drops is the contrast,
not the fact, and the fact is what a tooltip is for.** ⚠️ **Say the word and it goes back.**

✅ **NO EMBED IS PROMISED.** The string contains none of "built into your site", "embedded" or "inside
your website", and a source comment records why.

## The bullet

```tsx
                <li>Order page on your own website <span className="soon-inline">Coming soon</span></li>
```

⚠️ **The brief's bullet was `Order page on your own website (coming soon)`. I used the section's
EXISTING treatment** — the `soon-inline` span the other two coming-soon bullets use — **rather than
parenthesised text, so the three read as one set.** **Say if you want the parentheses instead.**

---

# STAGE 3 — THE FOOTER LINE

```tsx
          <div className="foot-base">
            <span>© 2026 HatchGrab</span>
            <span>iPhone and iPad apps coming soon</span>
```

✅ **Plain text in a `<span>`. No badge, no logo, no `<a>`, no `href`, no image.** A source comment
records all three reasons: Apple's guidelines require a badge to link to a live listing; "coming soon"
never claims availability; and Android is buildable but not shipping alongside iOS.

⚠️ **THE FOOTER MENTIONED NO APPS BEFORE THIS, so there is nothing to conflict with.** The only
existing "coming soon" copy on the page is *"WhatsApp auto-replies (Messenger &amp; Instagram coming
soon)"* and the two Max bullets — **none of them about apps.**

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `tsc --noEmit` exits 0.

| Claim | Method |
|---|---|
| The row renders `Coming soon` on Max, blank on Starter and Pro | ✅ **Source read** — `max: 'coming_soon'`, `starter/pro: false`, the same literals the three existing coming-soon rows use. ⚠️ **The table was not rendered** |
| 🔴 **`findPlanParityViolations` passes** | ✅ **EXECUTED** — run via `tsx`: **`PARITY VIOLATIONS: 0 []`** |
| No existing row, label or tier value changed | ✅ **EXECUTED** — the `lib/plan-features.ts` diff is one added row plus its comment; **no `-` line touches any existing row** |
| The Max bullets gained exactly one entry | ✅ **EXECUTED** — one added `<li>`, no `-` line in that list |
| The footer line is text only | ✅ **EXECUTED** — one added `<span>`; the diff contains no `<a>`, `href` or `img` |
| `lib/features.ts` unchanged | ✅ **EXECUTED** — `git diff --stat lib/features.ts` is **empty** |

**NOTHING WAS RENDERED.** No `next dev`, no `next build`, no browser — so the table's and the footer's
appearance is a claim about source.

---

# INTEGRITY

| File | bytes | lines | classes | occurrences | NUL · control · CR |
|---|---|---|---|---|---|
| `lib/plan-features.ts` | 24,100 → **25,910** | 318 → 334 | **12 → 12** | 240 → — | 0 · 0 · 0 |
| `app/landing/page.tsx` | 35,294 → **36,189** | 513 → 523 | **19 → 19** | 247 → — | 0 · 0 · 0 |

✅ **NO NEW CHARACTER CLASS IN EITHER FILE.** Carrier-aware: `U+26A0` is **16/16 paired** in
`plan-features.ts` and **13/13 paired** in `landing/page.tsx` — **zero bare in both.**

---

# SECOND ROW — "Take payment on your phone"

**Added alongside the first, same file, same shape. Row 2 of 2.**

```ts
      { name: 'Take payment on your phone', detail: 'Take card payments on a supported phone, so you don’t need a separate card machine.', starter: false, pro: 'coming_soon', max: 'coming_soon' },
```

## Row id — the same answer as row 1

🔴 **`tap_to_pay` has nowhere to go: `FeatureRow` has no `id` field.** The row is identified by its
`name`, which is also the `ROW_FEATURE_MAP` key. **File convention used; nothing invented.**

## 🔴 THE PRO/MAX CONVENTION — CHECKED, NOT ASSUMED

**READ — every Pro feature in this file also shows on Max:**

```ts
      { name: 'Online payments',                  footnote: '2', detail: 'Take card payment upfront when customers order online, via Stripe.', starter: false, pro: true,           max: true           },
```

# ✅ THE CONVENTION IS `pro` ⇒ `max`. So this row is `pro: 'coming_soon', max: 'coming_soon'` — Starter empty, both higher tiers showing Coming soon. **Had the convention been Pro-only, Max would have been left empty; it is not.**

## ⚠️ THE OVERLAP CHECK — AND ONE ROW IS CLOSER THAN EXPECTED

| Existing row | Overlaps? |
|---|---|
| 🔴 **`Walk-up order processing`** — *"Take and manage orders at the hatch, **paid on your own card terminal**."* | 🔴 **THE CLOSE ONE.** Its detail explicitly names the operator's own terminal — **precisely the thing this feature would replace.** They are not the same: that row is taking the ORDER, this is taking the CARD. ⚠️ **But if tap-to-pay ever ships, that detail becomes half-stale** and should be revisited. **Not changed here.** |
| `Online payments` — *"Take card payment upfront when customers order online, via Stripe."* | ✅ **No.** The CUSTOMER pays, online, before arriving. This row is the OPERATOR taking a card in person. |
| any other row | ✅ **No row touches payment METHOD at all.** |

# ✅ `takes_cash` IS A TRUCK SETTING AND APPEARS NOWHERE IN `lib/plan-features.ts` — it is not a plan row and cannot be confused with one. **CONFIRMED by grep: zero occurrences in this file.**

## The wording, and what it deliberately does not say

✅ **"a supported phone"** — never "phone or tablet". **Tap to Pay on iPhone is not available on iPad**,
which still needs a physical reader, so widening it would advertise something that cannot work.
✅ **No device model and no OS version.** *"iPhone XS or later on iOS 17+"* is wrong the moment either
moves; **"supported" stays true and the requirement is checked in-product.** Both reasons are recorded
in a source comment beside the row.

⚠️ **The detail is the brief's, verbatim, at 83 characters — within the section's 48–96 range, so
nothing was cut this time.** ⚠️ **The apostrophe is the file's typographic `’`, matching its
neighbours rather than an ASCII `'`.**

## The Pro bullet

```tsx
                <li>Take payment on your phone <span className="soon-inline">Coming soon</span></li>
```

**Appended to the Pro list**, using the section's existing `soon-inline` treatment rather than the
brief's parenthesised `(coming soon)` — **the same choice, for the same reason, as row 1.**
⚠️ **It is the FIRST coming-soon bullet in the Pro list**, where Max already had two.

## Verification for row 2

| Claim | Method |
|---|---|
| Renders Coming soon on Pro AND Max, blank on Starter | ✅ **Source read** — the literals quoted |
| 🔴 **`findPlanParityViolations` still passes** | ✅ **EXECUTED, re-run after this row: `PARITY: 0 []`** |
| No gate entry added | ✅ **EXECUTED** — `git diff --stat lib/features.ts` still **empty**; Q5 established a row may have no gate |
| No existing row changed | ✅ **EXECUTED** — the diff adds one row and one `<li>`; no `-` line touches an existing row |

## This report — SEPARATE byte-level pass, run AFTER writing

```
docs/plan-feature-order-domain-report.md   13,858 bytes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
TOTAL OFFENDING: 0
```

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 | 11 | 0 | 11 |
| U+2705 | 22 | 0 | 22 |
| **U+26A0** | **13** | **13** | **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct for both. **`U+26A0`
is the only TEXT-presentation base here, and every one of its 13 occurrences is PAIRED — 13 OF
13, ZERO BARE.** Total `U+FE0F` = 13.

## `git status --porcelain`

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
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
| **`M lib/plan-features.ts`** · **`M app/landing/page.tsx`** · **`?? docs/plan-feature-order-domain-report.md`** | **THIS TASK — both files were clean at HEAD** |
| everything else | **ALL pre-existing** — this session's earlier source edits and reports |

Nothing was committed, staged, reverted, stashed or cleaned.
