# Last report — Landing copy follow-ups: offline detail aligned, footnote 5 made platform-neutral

**Date:** 2026-07-28 · **Files touched:** `app/landing/page.tsx`, `lib/plan-features.ts`
**Verification:** `npx tsc --noEmit` → **clean, zero errors.** No `next dev`, no `next build`, no SQL.
**Diff: 2 files, 2 strings + one explanatory comment.**

This report **overwrites** the previous one (the Android promotion), per the rolling convention.

**Prompt integrity:** no garbles. The prompt arrived intact.

---

# 1. `DETAIL_OVERRIDES['Offline Order Protection']` — aligned

`app/landing/page.tsx:71`:

| | |
| --- | --- |
| Before | "If you lose signal, online ordering pauses so customers can't place orders you won't see. **The iPad app** keeps you taking orders offline; the web dashboard needs a connection." |
| After | "…**The iPad and Android app** keeps you taking orders offline; the web dashboard needs a connection." |

Three words, matching the feature card at `:171` exactly. **The two now give one answer to one
question** — this string is the compare-table detail for the same capability the card describes, so a
visitor who read the card and then opened the table was being told two different things about which
device keeps working offline.

The rest of the sentence is untouched, including the clause that actually carries the caveat — *"the web
dashboard needs a connection"* — which is the true and unchanged distinction: native app vs browser, not
iPad vs Android.

**Note on where this lives:** `DETAIL_OVERRIDES` (`:69–72`) is a landing-page-only override map. The
shared `FEATURE_SECTIONS` detail in `lib/plan-features.ts` is deliberately *not* modified by it, so
Billing and Admin keep their own text. I changed only the override — the shared source's detail for that
row names no platform, so it needed nothing.

---

# 2. Footnote 5 — platform-neutral, as proposed

`lib/plan-features.ts:147`:

| | |
| --- | --- |
| Before | "Kitchen ticket printing requires the HatchGrab **iPad app** and a compatible thermal printer (neither supplied). Compatible printers listed in our help centre." |
| After | "Kitchen ticket printing requires the HatchGrab **kitchen app** and a compatible thermal printer (neither supplied). Compatible printers listed in our help centre." |

**Two words, and both halves of the point are preserved:** the iPad-only claim is gone, and Android is
*not* asserted in its place. "(neither supplied)" and the help-centre sentence are verbatim.

## Why this is the right shape, recorded in the file

I put the reasoning at the site (`:141–146`) rather than only in this report, because the next person to
sweep for "iPad" will find this line and be tempted to complete the pattern — every other iPad mention on
the page became "iPad and Android" in the last diff, and this one deliberately did not:

```js
    // PLATFORM-NEUTRAL, deliberately. It said "the HatchGrab iPad app"; it does NOT now say "iPad and
    // Android", because printing is not the same kind of claim as a build target. The recommended
    // backend ('mfi' — Star/Epson via Apple's External Accessory framework, lib/printing/transport.ts:6)
    // is iOS-only by construction, and the cross-platform path ('ble') is documented there as the budget
    // fallback with limited/no paper-out status. Naming Android here would underwrite that. "The
    // HatchGrab kitchen app" stays true whichever backend lands first.
```

**The wording is now robust to either outcome.** If MFi ships first (iOS only), the footnote is still
true. If BLE ships first (both platforms), it is still true. It commits to the app being required —
which is the operational fact a buyer needs — without committing to a platform matrix that isn't built.

**Unchanged from the last report, and still worth knowing:** printing ships on *no* platform today.
`lib/printing/` contains only `createStubTransport` ("Phase A, no hardware"); there is no BLE plugin, no
vendor SDK, and no `printer_class` column. The compare table's `Kitchen ticket printing: max: true`
(`:109`) is a pre-existing claim against that stub — untouched here, and the larger exposure of the two.

---

# 3. Sweep re-run — no iPad-only claim remains

`grep -in "ipad"` across both files, every hit accounted for:

| Location | Text | Status |
| --- | --- | --- |
| `page.tsx:71` | "The iPad and Android app keeps you taking orders offline" | ✅ **this diff** |
| `page.tsx:171` | "Carry on taking orders with the iPad and Android app." | ✅ last diff |
| `page.tsx:272` | "iPad and Android kitchen app" | ✅ last diff |
| `plan-features.ts:77` | Row name — "iPad and Android kitchen app" | ✅ last diff |
| `plan-features.ts:133` | Footnote 3 — "native kitchen apps for iPad and Android… An Apple iPad is recommended" | ✅ last diff. The remaining "iPad" here is the **recommendation**, which is intentional and not a claim of exclusivity |
| `plan-features.ts:147` | Footnote 5 — now "the HatchGrab kitchen app" | ✅ **this diff** |
| `plan-features.ts:73–74`, `:170`, `:172` | Comments + the `ipad_kds` enforcement key | Not copy. The key is the gate identifier in `lib/features.ts`; renaming it would need a data migration |

**Every user-facing iPad-only claim on the landing page is now either "iPad and Android", a stated
recommendation, or platform-neutral.**

---

# 4. Files changed

| File | Change |
| --- | --- |
| `app/landing/page.tsx` | 1 string at `:71`. |
| `lib/plan-features.ts` | 1 string at `:147`, plus a 6-line comment recording why it stops short of naming Android. |
| `docs/last-report.md` | This file, overwritten. |

**Untouched:** pricing figures, plan names, free-month copy, footnotes 1–4, the compare-table values, the
`ipad_kds` Feature key, and everything outside the landing page and its copy source.

---

## 5. What I could not do / did not do

- **Could not run `next dev` or `next build`** — instructed not to. `tsc --noEmit` is clean. Both changes
  are string literals inside existing structures, so the only thing worth an eyeball is that the
  compare-table detail (`:71`) and the feature card (`:171`) now read the same when you expand the row.
- **Did not change the "Kitchen ticket printing" row's `max: true`** — flagged again in §2. That claim
  predates this work and asserts a shipped capability backed by a stub transport; it is a product
  decision, not a copy one.
- **Did not rename the `ipad_kds` Feature key** — enforcement identifier, not copy.
- **Did not commit anything.** This joins the session's unstaged work, the untracked
  `20260728_demo_sessions_extraction_source.sql`, and the staged deletion of `lib/demo-event-refresh.ts`.
