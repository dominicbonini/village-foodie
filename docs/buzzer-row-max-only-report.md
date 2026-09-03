# Buzzer tracking — Pro → Max-only, and moved into the Max tier section

**GARBLED SPANS: none.**

One file changed for this task: `lib/plan-features.ts`.
**Nothing committed, nothing deployed. No SQL, no migrations, no credentials.**
No Feature key invented, no `ROW_FEATURE_MAP` entry added, `lib/features.ts` untouched — item 6.

⚠️ **Scope note:** you sent two briefs in the same turn. The schedule-page rewording is reported
separately in `docs/schedule-page-row-copy-report.md`; both edits are in this one file and the PDF below
was regenerated once, after both.

---

## 1. The cells, before and after

| Tier | Before | After |
|---|---|---|
| **Trial** | ✓ included | **✓ included** — unchanged |
| **Starter** | — excluded | **— excluded** — unchanged |
| **Pro** | ✓ **included** | 🔴 **— excluded** |
| **Max** | ✓ included | **✓ included** — unchanged |

Source values: `starter: false, pro: true, max: true` → **`starter: false, pro: false, max: true`**.

🟢 **Trial is not stored on the row, and it does keep the feature — verified, not assumed.**
`trialFeatureValue()` (`lib/landing-table.ts:41-45`) returns `row.max` for every row except two named
exceptions (`'Online ordering — Pay at Hatch'` → always true, `'SMS order alerts'` → always false).
Buzzer tracking is neither, so Trial follows `max`. Executed against the real module: Trial resolves
`true`, and the rendered cell labels are **`["✓", "—", "—", "✓"]`** across Trial / Starter / Pro / Max.

🟢 **It takes nothing from anyone**, as you said: nobody is on Pro or Max, the platform has not launched.

---

## 2. Every Max-only row — and the placement, which you then corrected

### What I found, and reported as out of place

Before the move there were **five** Max-only rows (`max === true`, `pro !== true`, `starter !== true`):

| Row | Section |
|---|---|
| Multi-device kitchen sync | Max tier |
| Multi-user access | Max tier |
| Schedule page on your own website | Max tier |
| Kitchen ticket printing | Max tier |
| 🔴 **Buzzer tracking** | **Online sales & automation** |

🔴 **It was the only Max-only row outside the `Max tier` section**, and every row remaining in
`Online sales & automation` is `pro: true` or `coming_soon`. So the answer to "does it sit coherently
beside them" was **no** — it would have been the single exception to a rule the table otherwise keeps
without fail. **You then instructed the move, and it is done.**

### Where it sits now

Placed in the **`Max tier`** section, **directly above `Kitchen ticket printing`** (your placement — it
was briefly below before you corrected me). The adjacency is the reason you gave: the same busy van
prints tickets carrying `BUZZER <n>` in large type (`lib/printing/ticket.ts:250-254`).

The section now reads, in data order:

| # | Row | Trial | Starter | Pro | Max |
|---|---|---|---|---|---|
| 1 | Multi-device kitchen sync | ✓ | — | — | ✓ |
| 2 | Multi-user access | ✓ | — | — | ✓ |
| 3 | Schedule page on your own website | ✓ | — | — | ✓ |
| 4 | 🔴 **Buzzer tracking** | ✓ | — | — | ✓ |
| 5 | Kitchen ticket printing | ✓ | — | — | ✓ |
| 6 | Customer-facing display | Coming soon | — | — | Coming soon |
| 7 | Event & festival pricing | Coming soon | — | — | Coming soon |
| 8 | Digital loyalty stamp cards | Coming soon | — | — | Coming soon |

✅ **The section's "coming-soon rows last, in the data itself" convention is preserved.** It went at the
end of the hard-`true` block, not after the `coming_soon` rows: **✓ ✓ ✓ ✓ ✓ then Coming soon × 3** — a
block, not an interleave. That convention is recorded in the section's own comment and was checked
against the rendered output, not just the source.

🟢 **It no longer looks out of place. Every Max-only row is now in the Max tier section, with no
exceptions.** Its old neighbours (`Auto-accept online orders` / `Branded QR code`) now abut each other.

---

## 3. The parity checker — and why a clean run means nothing here

**Result: `findPlanParityViolations()` returns 0 violations.** Executed against the real module, not
inferred.

🔴 **THAT RESULT IS VACUOUS FOR THIS ROW, AND I AM NOT OFFERING IT AS EVIDENCE.** Stating it plainly, as
you asked:

- There is **no `Feature` key for buzzers** in `lib/features.ts`.
- There is **no `ROW_FEATURE_MAP` entry** for `'Buzzer tracking'` — confirmed by parsing the map out of
  source (it is a module-private `const`, not exported, so it cannot be read at runtime from outside).
- `findPlanParityViolations()` does `const feature = ROW_FEATURE_MAP[row.name]; if (!feature) continue`
  — so **this row is skipped entirely.** 24 of the 32 rows carry a map entry; this is one of the 8 that
  do not.
- The checker also only inspects cells that are literally `true`, so a `false` cell like the new Pro
  value would be invisible to it even if the row were mapped.

**A clean run said nothing about this row before the change and says nothing about it after. It is the
same clean run either way.** The 0 is real; it just is not about this.

🟢 **One thing the run does prove, incidentally:** every one of the 24 map keys still joins to a live row
name — no stale keys — which matters because the other brief renamed a row that *is* mapped.

---

## 4. The gap, recorded in the row's comment

The block comment above the row now states it in as many words:

> 🔴 **THIS ROW HAS NO GATE. THE TABLE EXCLUDES STARTER AND PRO. THE CODE ENFORCES NEITHER.**

and goes on to record:

- no `Feature` key in `lib/features.ts`, and no `canAccess`/`hasFeature` call anywhere guards buzzer
  behaviour — `app/api/dashboard/action/route.ts`, which owns the `set_buzzer` handler, contains
  **zero** `canAccess(` calls in the whole file;
- so a **Starter *or* Pro** truck can use buzzers in full today while the table says both are excluded;
- that this is **deliberate — you are doing feature gating separately** — and safe only because nobody
  is on Pro or Max yet;
- that no key was invented, and why: an unenforced key gates nothing while passing the parity checker
  vacuously;
- the consequence — no map entry, so the checker skips the row — with the explicit warning **not to read
  a clean parity run as evidence the tiers are enforced**;
- that Trial is derived from `max` and therefore keeps the feature.

The next reader does not have to rediscover any of it.

---

## 5. Every surface, and the PDF

`FEATURE_SECTIONS` has **four** renderers. All four were checked.

| Surface | Site | Result |
|---|---|---|
| **Landing** `/` table | `app/landing/page.tsx:472` | 🟢 **Rendered in a browser.** 34 rows; Buzzer tracking at **position 30**, between `Schedule page on your own website` and `Kitchen ticket printing`; cells **`["✓","—","—","✓"]`**; detail text exact; no page errors |
| **PDF** | `app/landing/features-pdf/route.ts:148` | 🟢 **Regenerated and opened** — see below |
| **Admin** plans table | `app/admin/page.tsx:978` | ⚠️ reads the **same** `FEATURE_SECTIONS` array — one source, no second copy — but the page is admin-gated and **I did not render it** |
| **Manage → Billing** | `app/manage/[token]/page.tsx:11394` | ⚠️ same array, same caveat — token-gated, **not rendered** |

⚠️ **Marking the boundary rather than blurring it:** Admin and Billing import the identical exported
constant and map over it, so they cannot disagree with the landing about the cells — but "cannot
disagree" is an argument from the source, not an observation. I did not open either page.

### The PDF — regenerated, opened, and read

⚠️ **The route is admin-gated** (`features-pdf/route.ts:289`, `verifyAdmin()` → 404), and I have no admin
session and invented no credential. So I generated it by **importing the route's own `buildHtml()`** into
a scratch copy with only the HTTP handler and its `verifyAdmin` import removed — the builder and every
module it reads are byte-identical — and called the **same** `page.setContent(...)` +
`page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })` the route calls. **Stating
this precisely because it is a reproduction of the document, not a fetch of the route.**

| | |
|---|---|
| Output | **2 pages, 166,921 bytes** |
| Buzzer tracking | **page 2**, whole; cells `["tick","—","—","tick"]`; 48px row |
| Position in the PDF | inside the **MAX TIER** block, between `Schedule page on your own website` and `Kitchen ticket printing` |

🟢 **Nothing splits across the page break.** I rendered both pages of the actual PDF through Chrome's
viewer and read them. Page 1 ends after `Automated stock countdown`; page 2 opens with the repeated
plan header and runs `Auto-accept online orders` → … → `MAX TIER` → the five ticked rows → the three
Coming-soon rows → the allowance list → the small print. **Every row begins and ends on one page.**

⚠️ **One thing I nearly got wrong, recorded because it would have been a false alarm.** A DOM-geometry
measurement of the unpaginated document put `Advanced reporting` straddling the A4 boundary
(top 1122px, boundary 1122.52px) and I was about to report it. That measurement ignores pagination:
the stylesheet carries `tr { break-inside: avoid; page-break-inside: avoid }` (`route.ts:225`), and the
rendered PDF shows Chrome pushed that row cleanly onto page 2. **The rasterised pages are the evidence
here, not the geometry.**

---

## 6. What I did not do

| | |
|---|---|
| Invent a `Feature` key for buzzers | 🟢 not done |
| Add a `ROW_FEATURE_MAP` entry | 🟢 not done |
| `lib/features.ts` | 🟢 untouched |
| The price mask set (`lib/pricing.ts` `NON_SECRET_PRICE`) | 🟢 untouched — still `['Free','Free trial','Lifetime','0%','Pay at Hatch','Unlimited','—']` |
| `'Online ordering — Pay at Hatch'` (em-dash join key) | 🟢 untouched — both occurrences intact |
| The bare `'—'` not-included value | 🟢 untouched |
| The Pizzeria Gusto testimonial | 🟢 untouched |
| The landing admin gate (`app/landing/layout.tsx`) | 🟢 untouched |
| SQL / migrations | 🟢 none |

**Nothing committed. Nothing deployed.**

---

## Still open

🔴 **The table now excludes Starter and Pro from a feature the code gives to everyone.** That is your
deliberate sequencing — gating comes separately — and it is safe only while nobody is on a paid plan.
It stops being safe on the day the first Pro truck signs up. The row's comment says so; this report says
so; nothing in the code will.
