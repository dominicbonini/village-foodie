# Features comparison as a downloadable PDF

**Built and measured. Not deployed, not committed. No SQL, no migrations.**

**VERIFICATION.** Not a typecheck. **I generated a PDF from the route's own code and opened both pages**,
rasterised via `page.pdf({ pageRanges })` + `sips`, and looked at them. I also **measured the gate with a
live unauthenticated request** and **re-measured the landing table** after the refactor to prove it did
not move.

**GARBLED SPANS: none.** ⚠️ **One instruction pair needed a judgement rather than a stop:** item 2 says
*"do not decide"* the price policy, item 8 says *generate one and report what it contains* — which cannot
be done without prices resolving somehow. I resolved it by shipping the **safe existing behaviour**
(follow the flag) as a **one-word switch**, generating with that, and leaving the decision open. Nothing
is locked in. If you read item 2 as forbidding even a default, say so and I will strip the constant.

---

## 1. 🔴 How it is generated FROM THE SOURCE, not from a copy of the markup

**The problem to avoid, in the brief's own terms:** a hand-built table is correct the day it is written
and wrong the first time a row changes — and a PDF is worse than a page for that, because it is
forwarded and kept.

**What I found when I went to do it:** the landing table's *data* already comes from
`lib/plan-features.ts`, but its **presentation rules were private constants inside
`app/landing/page.tsx`** — `TABLE_PLANS`, `PLAN_SUB`, `PLAN_PRICE_LABEL`, `trialFeatureValue`,
`DETAIL_OVERRIDES`, `NAME_OVERRIDES`, `HIDDEN_ROWS` and the `Cell` glyphs. **A PDF renderer importing only
`plan-features.ts` would have had to restate every one of them** — which is precisely the duplication the
brief forbids, arriving by the back door.

**So the rules were extracted, not copied:**

```
lib/landing-table.ts   NEW — the landing's presentation rules, one copy
        ↑                            ↑
app/landing/page.tsx      app/landing/features-pdf/route.ts
   (the web table)              (the PDF)
```

`lib/landing-table.ts` holds **no data**. Every fact still comes from `lib/plan-features.ts` and
`lib/features.ts`. What lives there is only: which plans get columns, what the Trial column resolves to,
which rows are hidden or renamed, and the three cell glyphs — as `cellLabel()`.

**Add a row to `FEATURE_SECTIONS` and it appears in the PDF on the next request, with nothing to update.**

**Proof the refactor changed nothing on the page** — the landing table re-measured in a browser after the
move, against the figures recorded before it:

| | Before | After |
|---|---|---|
| Feature rows rendered | 32 | **32** |
| Standalone "Messenger &…" row | absent | **absent** |
| Merged row cells | `["Coming soon","—","Coming soon","Coming soon"]` | **identical** |
| `Online ordering — Pay at Hatch` cells | — | `["✓","✓","—","—"]` |
| Em-dash cells in the table | — | **29** |

---

## 2. 🔴 The price mask — what it shows today, and the three options

**First, the fact that decides this:** `PLAN_PRICES` is **unmasked at source** — it is
`PLAN_META[p].price` passed straight through (`plan-features.ts:23-24`). Masking is a **render-time
choice**, and the landing page does not make it: the landing shows **real prices**, and gets away with it
only because it is admin-gated. **A PDF has no gate once it leaves your outbox.**

**What the PDF shows today (measured, `PRICE_MODE = 'follow-flag'`, flag off):**

| | Trial | Starter | Pro | Max |
|---|---|---|---|---|
| Header price | Free | Free / free forever | **TBC** | **TBC** |
| Online orders included | Unlimited | — | **TBC** | **TBC** |
| Fee after that | Free | Pay at Hatch | **TBC** | **TBC** |

The non-sensitive values (`Free`, `0%`, `Pay at Hatch`, `Unlimited`, the bare `—`) come through
correctly — they are exempt via `lib/pricing.ts`'s `NON_SECRET_PRICE`. **Only the actual money is TBC.**

### The three options

| | What it does | |
|---|---|---|
| **`'follow-flag'`** *(shipped)* | Obeys `NEXT_PUBLIC_PRICING_PUBLISHED`, exactly as Billing does. Flips to real prices on the day pricing publishes, **with no code change**. | 🟢 **Recommended as the default** |
| **`'always-real'`** | Real prices regardless of the flag. | ⚠️ **What your stated use case actually needs today** |
| **`'omit'`** | No price header, no fee table, no allowances — features only. | Safe but half a comparison |

### 🔴 The recommendation, and the tension in it — stated plainly rather than smoothed over

**I recommend `'follow-flag'` as the default**, because it is the codebase's existing policy, it makes the
document safe to forward by accident, and it needs no code change later.

**But it does not do the job you described.** You asked for something *"to send to an operator who
asks"*. **A PDF whose plan prices read "TBC" cannot be sent to an operator asking about prices.** So the
honest position is:

> The safe default is `'follow-flag'`. **The thing you asked for is `'always-real'`.** Choosing it means
> accepting that the price list is now a file that can be forwarded to anyone, including a competitor,
> and that it has no expiry. That is a commercial decision, not a technical one, and it is yours.

**It is one word**, `PRICE_MODE`, at `app/landing/features-pdf/route.ts:47`. **I have not decided it.**

---

## 3. How it is produced, and what it depends on

**On demand, from a route:** `GET /landing/features-pdf` → `application/pdf`, with
`Content-Disposition: attachment; filename="hatchgrab-plans-and-features.pdf"` and `Cache-Control:
no-store`. Not built at deploy time, not generated by hand — **so it can never be stale**.

**🟢 NOTHING NEW WAS ADDED TO THE PROJECT.** I expected to need a PDF library and did not: the stack is
already a production dependency, because `app/api/manage/verify-schedule-url/route.ts` already drives
headless Chromium.

```
@sparticuz/chromium  148.0.0     dependencies   ← serverless Chromium (Vercel)
puppeteer-core       24.43.1     dependencies
puppeteer            ^24.36.1    dependencies   ← bundled Chrome (local fallback)
```

**`launchBrowser()` is the same shape as the existing route's** — serverless Chromium first, full
puppeteer as the local fallback — so both paths behave identically on Vercel and on a dev machine.
**Measured locally:** the serverless launch failed with `spawn ENOEXEC` (its Linux binary cannot run on
macOS), the fallback caught it and rendered. That is the documented, intended path.

⚠️ **`maxDuration = 60`** is set — Chromium cold-starts. It does strictly less work than the scrape route
already on the same budget.

⚠️ **The HTML is built in-process and passed to `setContent`, not fetched by navigating to our own URL.**
Navigating would need the admin cookie replayed by the headless browser — a second auth path to get
wrong. There is nothing to fetch: the modules are already imported.

---

## 4. Where the download lives, and who can reach it

**URL: `/landing/features-pdf`.**

### 🔴 It does NOT inherit the landing layout gate — and the brief's assumption that it would is the trap

You asked me to *"confirm it inherits the same protection"*. **It does not, and could not.** A Next.js
layout wraps **pages**. A Route Handler renders no React and is never wrapped by one. Filing it under
`app/landing/` buys it **nothing** — unlike `app/landing/cost/page.tsx`, which is a real page and
genuinely does inherit the gate.

**So the gate is explicit**, and uses `verifyAdmin()` — the same canonical check `app/landing/layout.tsx`
uses, so the two cannot diverge:

```ts
if (!(await verifyAdmin())) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

**Measured, live, unauthenticated:**

```
GET http://…/landing/features-pdf   →   HTTP 404   {"error":"Not found"}
```

**404 rather than 403, deliberately** — it does not confirm the URL exists to someone guessing.

🔴 **Recorded in the file header, because it is the whole risk:** if that check is ever deleted, the
priced feature matrix becomes a public download and **nothing else stands between the URL and the
internet.**

---

## 5. Protected strings

**Untouched, and verified rather than assumed.**

- `'Online ordering — Pay at Hatch'` — moved into `lib/landing-table.ts` inside `trialFeatureValue()`.
  **Dash confirmed U+2014** by codepoint check after the move. It is an exact-match join key for
  `plan-features.ts:185,:401`, `admin/page.tsx:909` and `manage/[token]/page.tsx:11427`.
- The bare `'—'` — now returned by `cellLabel()`. **Confirmed U+2014.** `lib/pricing.ts`'s
  `NON_SECRET_PRICE` matches it by exact string.
- The Pizzeria Gusto testimonial — **`app/landing/page.tsx`'s testimonial block was not touched**; only
  the table helpers were removed and re-imported.

**The PDF renderer never writes back.** It escapes for HTML (`&`, `<`, `>`, `"`) at the point of output
only; `esc()` does not touch dashes or any other character. The source modules are imported read-only.
**`git diff` confirms `lib/plan-features.ts`, `lib/features.ts`, `lib/pricing.ts` and
`app/landing/layout.tsx` are all unchanged.**

---

## 6. The coming-soon rows on paper

**They print the words "Coming soon", in amber, in the plan column — measured on the generated pages.**

| Row | Trial | Starter | Pro | Max |
|---|---|---|---|---|
| **Android kitchen app**³ | Coming soon | Coming soon | Coming soon | Coming soon |
| **WhatsApp, Messenger & Instagram auto-replies**⁴ | Coming soon | — | Coming soon | Coming soon |

**Does it read correctly on paper? Yes — and better than a tick would.** On screen a reader can hover or
click; on paper the cell is all they get, so the words matter. "Coming soon" in a plan column is
unambiguous: **it cannot be mistaken for a ✓**, and it is visually distinct (amber, smaller) from both the
green ✓ and the grey —.

**Two things that make it honest rather than merely legible:**

1. 🔴 **Footnote 4 travels with it** — *"Auto-replies require a business account on each platform. Replies
   are AI-generated and can occasionally be wrong…"*. Without that, "Coming soon" on a paid tier reads as
   a firmer commitment than it is. §7.
2. **The merged social row prints once**, with the Starter column correctly showing **—** rather than
   "Coming soon" — Starter does not get it at all, coming or otherwise. Confirmed on page 2.

⚠️ **The parity checker's blind spot is unchanged and this PDF does not close it.**
`findPlanParityViolations()` only inspects cells that are literally `true`, so `coming_soon` cells are
skipped entirely — **the check passes vacuously for both these rows**, on screen and on paper. The PDF
faithfully prints whatever the matrix says; it is not a second opinion.

---

## 7. Footnotes and small print — all of it travels

**Every one of the five footnotes is rendered**, in a bordered "Small print" block at the end,
with `break-inside: avoid` so it can never be split across pages. Confirmed present on page 2:

| | Covers |
|---|---|
| **1** | Walk-up orders: 0% on every plan, your own card terminal, and **"card payments through HatchGrab via Stripe are coming soon"** — the in-person rate, the UK/EEA limit and the tap surcharge |
| **2** | Online payments via Stripe Connect, the 0.99% platform fee over allowance, Stripe's own processing fee |
| **3** | **Device not supplied.** Native apps for iPhone and iPad, **Android coming soon** |
| **4** | Auto-replies need a business account per platform; **replies are AI-generated and can occasionally be wrong** |
| **5** | Kitchen ticket printing needs the app and a compatible thermal printer, **printer not supplied** |

**Plus three lines I added, because a PDF outlives the conversation that produced it:**

- The **generation date**, in the sub-heading — so a recipient can tell how old the document is.
- *"Prices shown as 'TBC' are not yet published."* — rendered only when the mask is active, so a reader
  is never left guessing what TBC means.
- *"Figures are the published plan terms at the date above and may change. Card processing fees are
  Stripe's own charge, not HatchGrab's. This document is a summary, not a contract."*

🔴 **That last line is the point of item 7.** A comparison table sent without its footnotes reads as a
commitment. Footnote 1 is the **only** place the walk-up card detail lives; footnote 3 is the only place
"device not supplied" appears. **The footnotes are not optional decoration on this document — they are
what stops it being a promise.**

---

## 8. MEASURED — what the generated PDF actually contains

**Generated from the route's own `buildHtml()` and `launchBrowser()`, then opened and looked at.**

| | |
|---|---|
| **File size** | 159,413 bytes |
| **Pages** | **2** (`/Count 2`, two `/Type /Page` objects) |
| **Page size** | **A4, 595 × 842 pt** — correct, via `preferCSSPageSize` + `@page { size: A4 }` |
| **Anything cut off?** | **No.** Page 2 ends with clear white space below the small print |
| **Table split across pages?** | **Yes, between "Smart Slot Management" and "Auto-accept online orders"** — and it splits cleanly |

**🟢 The header repeats on page 2 — confirmed by looking at it.** `thead { display: table-header-group }`
does it. This is the single thing print gets wrong by default, and it matters most here: a comparison
table whose plan columns are unlabelled after page 1 is unreadable. **Page 2 carries the full Trial /
Starter / Pro / Max header.**

**No row is split across the page break** — `tr { break-inside: avoid }` holds, including the tall rows
whose descriptions run to four lines (Offline Order Protection).

**What is on each page:**

- **Page 1** — title, generation date, plan header, **Fees** (3 rows), **Core operations** (11 rows),
  and the start of **Online sales & automation**.
- **Page 2** — repeated header, the rest of **Online sales & automation**, **Max tier** (7 rows),
  the **online order allowance** list, and the **small print**.

### 🔴 One defect found by looking at it, which I have NOT fixed

**The "Online order allowance" list prints `Starter — TBC`.**

That is wrong in substance: Starter's allowance is `'Pay at hatch'`, which carries no commercial
information and should be exempt from the mask. It is masked because of an **exact-string case
mismatch** in the shared source:

```
lib/plan-features.ts:98    starter: 'Pay at hatch'      ← lower-case h
lib/pricing.ts:15          NON_SECRET_PRICE has 'Pay at Hatch'   ← capital H
```

`NON_SECRET_PRICE` is a `Set` matched by exact string, so `'Pay at hatch' !== 'Pay at Hatch'` and it
falls through to "TBC".

- ⚠️ **This is pre-existing and not caused by this work** — it affects any surface that masks
  `PLAN_ALLOWANCES`, and the PDF simply made it visible.
- ⚠️ **I have not fixed it.** The fix is a one-character change in `lib/plan-features.ts` or another
  entry in `lib/pricing.ts` — both **shared sources outside this task**, and the second touches the same
  set that holds the protected `'—'`. **Flagging it for its own change.**
- It does not appear when `PRICE_MODE` is `'always-real'`.

---

## Files changed

```
lib/landing-table.ts                    NEW — the landing's table rules, extracted so there is one copy
app/landing/features-pdf/route.ts       NEW — the gated PDF route, generated from source at request time
app/landing/page.tsx                    imports the extracted rules instead of defining them
```

Untouched and verified by `git diff`: `lib/plan-features.ts`, `lib/features.ts`, `lib/pricing.ts`,
`app/landing/layout.tsx`, and the testimonial block.

**A sample PDF is at `~/Downloads/hatchgrab-plans-and-features.pdf` if you want to look at it yourself.**

**Nothing deployed. Nothing committed.**
