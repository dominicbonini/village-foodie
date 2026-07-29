# Confirm-order orange restored + the cash/card split — BUILD REPORT

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ BOTH BUILT.** `tsc --noEmit` clean; 18/18 ledger + 10/10 label regressions pass.
**Migration written, NOT applied. `next dev` / `next build` NOT run.**
**Six files changed:** `supabase/migrations/20260730_takes_cash_and_payment_method.sql` *(new)*,
`lib/payments/ledger.ts`, `app/api/dashboard/action/route.ts`, `components/dashboard/OrderCard.tsx`,
`components/dashboard/AddOrderPanel.tsx`, `components/dashboard/types.ts`,
`app/dashboard/[token]/page.tsx`.

> This file replaces the previous revert-pass report. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

---

## 1. "CONFIRM ORDER" RESTORED TO ORANGE

**The original class at `HEAD`** (`AddOrderPanel.tsx:1116`):

```
w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 rounded-xl text-base
disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]
```

**Restored fill — exact, not a close value:** `bg-orange-600 hover:bg-orange-700 text-white`, together
with `font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors
active:scale-[0.98]`.

The only classes that differ from HEAD are the **layout** ones the side-by-side row requires, which you
said stay: `w-full` → `flex-1 min-w-0`, and `py-4 text-base` → `py-3 text-sm` to sit level with the pay
button. **The fill is byte-identical to the original.**

### ⚠️ How orange and blue read together — flagging, not resolving

**They fight.** Measured:

| | |
|---|---|
| Relative luminance | orange-600 **0.245**, blue-600 **0.153** |
| Contrast *between the two fills* | **1.45:1** |

Two saturated solids of near-identical visual weight, equal width, side by side. Nothing recedes, so
**neither reads as secondary** — the eye has no entry point and the operator must read both labels every
time. That is the "which is the default?" problem the row was meant to remove, relocated from vertical
to horizontal rather than solved. The neutral outline I had (wrongly, unasked) used was doing that job;
brand orange does not.

⚠️ **Second finding, separate from the aesthetics:** **white on orange-600 is 3.56:1 — below the 4.5:1 AA
floor** you have applied consistently. It is the pre-existing brand primary and it fails that bar today
in its original full-width form too, so restoring it changes nothing about the compliance picture — but
you should know the number, because the button next to it now passes at 5.17:1 and the asymmetry is
visible in the data if not on screen.

**Per your instruction I changed nothing else.** Options if you want it addressed — all one-liners, all
yours to pick, none applied: keep as-is; make Confirm an orange *outline* (brand colour, clear
hierarchy); or darken the orange for contrast.

---

## 2. THE CASH/CARD SPLIT

### The migration

**`supabase/migrations/20260730_takes_cash_and_payment_method.sql` — ✅ ADDITIVE.**

```sql
alter table trucks         add column if not exists takes_cash boolean not null default false;
alter table order_payments add column if not exists method text;
alter table order_payments add constraint order_payments_method_chk
  check (method is null or method in ('cash','card'));
```

**RUN ORDER: before deploying.** Settings writes `takes_cash` and the ledger writes `method`; PostgREST
rejects a write naming a column it cannot see (PGRST204). The reverse order is a no-op — defaulted and
nullable, and old code never names them.

**No backfill**, as ruled: existing rows keep `method = NULL`, which is the honest value — `takes_cash`
was off, so nobody was ever asked. The verification block asserts both "every truck reads `f`" and
"every payment row reads `null`".

The header records the `method`-not-`channel` reasoning verbatim so it is not re-litigated, including
the specific failure it avoids: widening `channel` would make every fee query an `in (...)` over a
growing list, and one forgotten member **silently charges a platform fee on cash**.

### Ledger

`lib/payments/ledger.ts` gains `PaymentMethod = 'cash' | 'card'`, threaded through `recordPaymentEvent`
and `recordCollectionPayment` to the insert. **`getOrderBalance` is untouched** — verified by grep:
zero occurrences of `method` inside the derivation. A method is a label on a money event, never a term
in it.

### One tap either way — and how the pending state stays per-button

🔴 **No modal.** Two buttons, one tap each, exactly as specified.

⚠️ **A design detail worth recording, because it is the same bug you caught on the confirm bar:** the
card's loading key is `` `${action}-${order_key}` ``, so if Cash and Card both fired `mark_paid` they
would **both** grey out and spin on either tap. So the client sends **distinct action names** —
`mark_paid_cash` / `mark_paid_card` — and the server maps all three names to one handler, deriving the
method from the suffix ([action/route.ts:1488-1497](app/api/dashboard/action/route.ts#L1488)). Plain
`mark_paid` stays valid for a truck that does not split. Pending state is per-button by construction, no
new plumbing.

### Where the buttons appear

| Surface | `takes_cash` off | `takes_cash` on |
|---|---|---|
| **Order card** | `Mark paid` / `Mark £5.50 paid` (blue) | **`Cash`** and **`Card`** — bare, no amounts, both blue |
| **Add Order confirm bar** | `Take payment` / `£8.00` (blue) | **`Cash £8.00`** and **`Card £8.00`**, both blue, amount stacked |
| **Cooking-gate row** | one disabled placeholder | **unchanged — still one placeholder**, not split |

All settled rulings honoured: bare labels on cards, amounts only in the confirm bar, gate row not split.
**Both buttons are blue** — both are money actions; no fourth colour introduced.

---

## 3. `takes_cash = false` LEAVES EVERYTHING EXACTLY AS IT IS

The column is `NOT NULL DEFAULT false`, so every truck reads false the moment the migration lands.
Every new affordance sits behind an explicit gate:

| Gate | Location |
|---|---|
| `if (takesCash) { … }` — card buttons | [OrderCard.tsx:192](components/dashboard/OrderCard.tsx#L192) |
| `{takesCash ? ( … ) : ( … )}` — confirm bar | [AddOrderPanel.tsx:1123](components/dashboard/AddOrderPanel.tsx#L1123) |
| `{showPaidStep&&( … )}` — the Settings row is not even rendered | `page.tsx` |
| `method` resolves to `null` unless the action name carries a suffix | [action/route.ts:1495](app/api/dashboard/action/route.ts#L1495) |

With it off: one `Mark paid` button, one `Take payment` button, `method` written as `NULL`, and the
ledger, rollup and `getOrderBalance` behave identically. **And with `show_paid_step` off, the cash
toggle is not reachable at all** — it is a child row of the paid-step card.

⚠️ The `takes_cash` value reaches the client **automatically**, with no map edit — because of the
spread-and-redact projection built two passes ago. This is the first new truck setting since that
change, and it is the first one that could not silently fail to arrive. Worth noting as evidence the fix
did what it was for.

---

## 4. DENSITY

**Card action row** — `flex gap-2`, two `flex-1` buttons, `Btn` padding `px-4`:

| Layout | Card | Body | Per button | Label box | `Cash` ≈29px |
|---|---|---|---|---|---|
| **KDS window grid** (`minmax(240px,1fr)`) | 247px | 215px | 104px | **72px** | ✅ fits |
| **Dashboard solo, 3-col iPad** | 260px | 228px | 110px | **78px** | ✅ fits |
| **Dashboard solo, 2-col** | 380px | 348px | 170px | **138px** | ✅ comfortable |

**Bare labels are what make this fit**, and the numbers show why the settled ruling was right: at the
240px KDS column the label box is 72px, and `Cash £5.50` needs ~73px — it would clip at the exact
narrowest case. `Mark £5.50 paid` (~109px) would clip badly. Amounts genuinely do not fit beside a
second button.

**KDS cook mode: unaffected.** `renderButtons` returns `null` for cook mode outside cooking/ready — the
completion button has never existed there, so nothing was added.

**Cooking-gate row: unchanged**, one disabled placeholder, per the settled ruling.

**Solo grid, both settings on** — the full stack is: notes → `[Edit | Cancel]` ghost row → `[Cash | Card]`.
Two rows of two, plus notes. Vertically that is fine (`py-2.5` ghosts, `py-3` primaries, `gap-2`); the
card grows by one row versus today. ⚠️ **It is busier than any card has been so far** — four tap targets
plus a note in a 260px column. I would want a look at that before Gusto turns both on, but nothing
clips and nothing overlaps.

---

## 5. Verified by READING vs by RUNNING

**By RUNNING:** `npx tsc --noEmit` → exit 0 after each step (it caught the missing `takes_cash` on
`TruckData`); all contrast and luminance figures via WCAG relative luminance; the density arithmetic;
greps confirming the four `takesCash` gates, both card sites receiving the prop, and zero `method`
references inside `getOrderBalance`; regressions **18/18** ledger and **10/10** button-label.

**By READING:** the original Confirm class recovered from `git show HEAD`; the loading-key collision
that drove the distinct action names; that cook mode returns `null` before the completion button.

---

## 6. What I could NOT verify

- 🔴 **The orange/blue judgement is arithmetic, not a look.** 1.45:1 between two fills of near-identical
  luminance is strong evidence they compete, but **whether they actually fight on screen is a visual
  question I cannot settle without rendering.** Treat my recommendation as a prediction to check.
- **Nothing was rendered.** No `next dev`. The Cash/Card pair on a card, the two-button confirm bar, the
  restored orange, and the busier solo card are all **unobserved**.
- **The migration has not been applied**, so `takes_cash` and `method` do not exist yet. Every code path
  gated on them is currently unreachable, and both `VERIFY AFTER APPLYING` blocks are unrun.
- **No Cash or Card tap has ever executed.** The suffixed action names, the method reaching the insert,
  and the per-button pending behaviour are traced by reading, not run.
- **Density is computed** from Tailwind values and a ~0.52em average character advance, not measured in
  a browser. The KDS 72px-vs-73px margin on `Cash £5.50` is *why* the bare-label ruling holds, but it is
  close enough that it would be worth one real look if that decision is ever revisited.
- **The busier solo card** (four targets + notes) is my main visual concern and is unassessed.
- **No `next build`** — tsc-clean does not prove the bundle.
