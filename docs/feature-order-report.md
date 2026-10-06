# PLAN FEATURE LIST: TWO ITEMS REORDERED

**6 October 2026 · branch `main`, local. Pushed: no. Deployed: no. Nothing written to the database.**

Order only. No wording, no plan membership, no tick/cross, no gating, no prices.

---

## ⛔ ONE THING I STOPPED AND ASKED ABOUT

Your first move hit a stop condition you named: **the anchor was not in the same list as the item.**

| | Section it was in |
|---|---|
| **Private events** | `Max tier` |
| **Branded QR code** (its anchor) | `Online sales & automation` |

Putting one directly after the other therefore moves it **between sections** — it stops appearing under
the "Max tier" heading, which is more than an order change. (There is no in-card reading that rescues
it either: the landing page's Pro card has no "Branded QR code" bullet.)

**You chose: move it across, into Online sales & automation.** Done.

🔴 **And it reads better there, for a reason worth recording.** "Private events" is
`starter: false, pro: true, max: true` — **byte for byte the same cells as the row above it** — so it
was the only Pro-tier row listed under a heading that says *Max tier*. It was only there because it was
split out of the old `Event & festival pricing` row in October; the other half of that split is genuinely
Max-only and stayed.

Your second move needed no decision: **Custom event types & pricing** and **Schedule page on your own
website** were both already in `Max tier`.

---

## THE BEFORE AND AFTER

Only the two affected sections are shown; `Core operations` is untouched.

### `Online sales & automation`

| Before | After |
|---|---|
| Offline Order Protection | Offline Order Protection |
| Online payments | Online payments |
| Advance pre-ordering | Advance pre-ordering |
| Pre-order deadline | Pre-order deadline |
| Customer time slot selection | Customer time slot selection |
| Smart Slot Management | Smart Slot Management |
| Automated stock countdown | Automated stock countdown |
| Auto-accept online orders | Auto-accept online orders |
| **Branded QR code** | **Branded QR code** |
| WhatsApp auto-replies | 🟢 **Private events** ← moved in |
| Messenger & Instagram auto-replies | WhatsApp auto-replies |
| Take payment on your phone | Messenger & Instagram auto-replies |
| Advanced reporting | Take payment on your phone |
| SMS order alerts | Advanced reporting |
| | SMS order alerts |

⚠️ **"WhatsApp auto-replies" is a conditional row** — it exists as its own row only while
`WHATSAPP_LIVE` is on (it is). With the flag off there is one merged row instead. The harness reads the
flag rather than pinning one state.

### `Max tier`

| Before | After |
|---|---|
| Multi-device kitchen sync | Multi-device kitchen sync |
| Multi-user access | Multi-user access |
| **Schedule page on your own website** | **Schedule page on your own website** |
| Buzzer tracking | 🟢 **Custom event types & pricing** ← moved up |
| Kitchen ticket printing | Buzzer tracking |
| Customer-facing display | Kitchen ticket printing |
| Private events | Customer-facing display |
| Custom event types & pricing | Digital loyalty stamp cards |
| Digital loyalty stamp cards | |

---

## PROOF THAT NOTHING BUT ORDER CHANGED

The two row objects are **byte-identical** to the ones that were there before — the whole diff of row
lines is two deletions and two insertions of the same two strings:

```
+ { name: 'Private events', detail: 'Add private events that don’t show on the map, …', starter: false, pro: true, max: true },
+ { name: 'Custom event types & pricing', detail: 'Create your own event types, …', starter: false, pro: false, max: true },
- { name: 'Private events', detail: 'Add private events that don’t show on the map, …', starter: false, pro: true, max: true },
- { name: 'Custom event types & pricing', detail: 'Create your own event types, …', starter: false, pro: false, max: true },
```

And compared against `HEAD` programmatically:

| | |
|---|---|
| **Row count** | 31 static rows before → 31 after (32 at runtime with the WhatsApp flag on, both ways) |
| **Set of names** | identical |
| **Rows whose SECTION changed** | exactly one — `Private events`, which is the move you approved |
| **Cells** | `Private events` still Starter ✗ Pro ✓ Max ✓; `Custom event types & pricing` still Max only |
| **`ROW_FEATURE_MAP`** | `'Private events' → private_events` and `'Custom event types & pricing' → event_types`, untouched — so `findPlanParityViolations()` still checks both hard-`true` cells against `canAccess` |
| **Gating** | nothing: `lib/plan-features.ts` is presentation (its own header says so). The enforcement gate is `canAccess` in `lib/features.ts`, which this change does not touch |

---

## IT IS ONE SHARED SOURCE

**The file:** `lib/plan-features.ts`, export **`FEATURE_SECTIONS`**.

**The importers that render it:**

| File | Surface | How it iterates |
|---|---|---|
| `app/landing/page.tsx:681` | the public comparison table | `FEATURE_SECTIONS.map(…)` → `visibleRows(section).map(…)` |
| `app/manage/[token]/page.tsx:14288` | **Billing** | `FEATURE_SECTIONS.map(…)` → `section.rows.map(…)` |
| `app/admin/page.tsx` | the admin plan view | `FEATURE_SECTIONS` |
| `lib/plans-pdf.ts:129` | the plans PDF | `FEATURE_SECTIONS.map(…)` |

⚠️ **`lib/landing-table.ts` is not a second copy.** It holds render-only *name* and *detail* overrides
for the landing table, plus `visibleRows()` — which is a **filter**, not a sort:

```ts
export function visibleRows(section: FeatureSection): FeatureRow[] {
  return section.rows.filter(row => !HIDDEN_ROWS.has(row.name))
}
```

**Nothing sorts the rows on the way to any screen** — asserted across all four renderers plus
`landing-table.ts`. So the order in `lib/plan-features.ts` is the order every surface shows.

---

## RENDERED, AND WHAT I COULD NOT RENDER

🔴 **The landing page: rendered for real and checked.** `npx next start` on port 3123 (PID recorded and
stopped by that PID), `curl -H "Host: hatchgrab.com" http://127.0.0.1:3123/`, and the comparison table
read out of the returned HTML in document order:

```
── Online sales & automation          ── Max tier
   …                                     Multi-device kitchen sync
   Auto-accept online orders             Multi-user access
   Branded QR code                       Schedule page on your own website
   Private events          ← moved       Custom event types & pricing   ← moved
   WhatsApp auto-replies                 Buzzer tracking
   Messenger & Instagram auto-replies    Kitchen ticket printing
   …                                     …
```

**Both moves are on the rendered page.**

⚠️ **Billing I could not open, and I am not going to claim otherwise.** `/manage/<token>` needs an
operator session, and your rules forbid writing to the database — so I cannot mint one. (The plans PDF
route is a second surface I tried; it is admin-gated and returned 404 without a session, correctly.)

**What stands in its place is stronger than a screenshot would have been:** Billing maps the *same*
array, and it does **less** to it than the landing page does — `section.rows.map(row => …)`, with no
filter and no sort at all. The landing page applies a filter on top of that and still renders this
order. Both facts are asserted by the harness, so if Billing ever gains a sort, that is a failure
rather than something to discover on a screen.

---

## CHECKS

| | |
|---|---|
| `tsc --noEmit` | clean |
| `npx next build` | ✓ compiled |
| **Full sweep** | `node scripts/run-harnesses.cjs` — **95 run, 95 passed, 0 failed** (94 before this build's new harness) |
| **Harnesses pinning the old order** | **none.** Three harnesses mention these feature names (`outreach-reply-attach`, `screenshot-truck-details`, `whatsapp-golive-parity-harness`); all three pass unchanged — none asserts an order |

### 🔴 `scripts/plan-feature-order.cjs` — new

**Nothing checked this list's order.** A row could be moved, or could drift while a section was edited,
and the only way to find out was to look at four screens. The new harness compiles
`lib/plan-features.ts` with the repo's own `tsc` and **loads the real module** (the technique
`whatsapp-golive-parity-harness.cjs` already uses on the same file) — reading the source with a regex
would be checking the shape of the text that produces the list rather than the list.

**22 checks**, in three groups:

1. **The two adjacencies, as `index + 1`** — not "somewhere after". A row that drifted one place down
   would still satisfy a `>` test, which is the version of this check that quietly stops meaning
   anything. Plus: each row is in the same section as its anchor, `Private events` is *not* in
   `Max tier`, and `Custom event types & pricing` still is.
2. **Order only** — the full list of sections and row names, pinned; the two moved rows' cells; their
   `ROW_FEATURE_MAP` entries; the row count; no duplicate names.
3. **One source** — all four renderers import `FEATURE_SECTIONS`; none of them (nor
   `landing-table.ts`) sorts it; `visibleRows` filters and does not reorder; Billing does neither.

⚠️ **Two things about that harness worth knowing.** `ROW_FEATURE_MAP` is **not exported** — only
`findPlanParityViolations()` inside the module reads it — so its two entries are checked against the
source text, which is stated in the file rather than glossed. And the list is **flag-dependent**: the
harness compiles `lib/whatsapp-live.ts` too and expects the WhatsApp row only when the flag is on,
because a list pinned without reading the flag is pinned to one flag state.

---

## Files

| File | |
|---|---|
| `lib/plan-features.ts` | the two rows moved; the comment left where `Private events` was, and notes at both new positions |
| `scripts/plan-feature-order.cjs` | **new** — the order is a checked claim now |
| `scripts/harnesses.json` | the new harness listed |

## Open items for you

| | |
|---|---|
| **Deploy** | not done — you deploy by hand |
| ⚠️ **The landing page's pricing-card bullets** | hand-written literals that twin some of these rows ("Private events with their own ordering link" on the **Pro** card, "Custom event types & pricing" on the **Max** card). They are a different surface with its own per-card order and **nothing checks them against the table** — the file's own comments say so repeatedly. I did not touch them; say the word if you want their order looked at too |
