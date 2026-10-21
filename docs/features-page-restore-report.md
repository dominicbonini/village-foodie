# features-page-restore — /features gets its old look and its feature descriptions back

**Date:** 20 October 2026 · **Branch:** main (on top of `4633801c compare page`; uncommitted; nothing pushed or deployed)

**Summary.**
- **The old look is back, with the new content.** /features renders the new plan table (data columns, WHAT YOU PAY, the
  three groups, ✓ / — / coming soon from `plan_features`, the footnotes *, ¹, ²) in the pre-Stage-B page's look.
- **The header** is the old eyebrow "Compare" plus the heading and lede, centred. The heading is still the page's only
  h1, in the old h2's type. The trial callout is centred and the same width as the old lede.
- **Each of the 32 capability rows has a description again,** in the old style. 30 are restored word for word, 1 is the
  text the old page actually printed, and 1 is shortened. None names a plan or a number (grep-proved).
- **Your two changes during the work:** the orange band on the Pro column is removed, and the Pro name is now the same
  colour as Pay as you go and Unlimited. All three columns look the same on /features.
- **Manage › Billing and the plans PDF are unchanged.** Billing's table renders byte-identically to HEAD in GB and US.
- **A live bug, found and fixed on /features:** at phone width the current page squeezed the row-name column to zero
  width, so names broke one letter per line (the page was 15,429px tall at 375px). See §6.
  - **Billing shares the column rule that caused it.** I left Billing alone as you asked, so it can do the same on a
    phone. The one-line fix is in §6, for your decision.
- SEO is unchanged; `MARKETING_COPY_UPDATED` stays at `'2026-10-20'` (it already reads today).

---

## 1 · The "before"

- **The before commit is `c6c44c9e` (US readiness).** It is the parent of `755c284c landing new prices`, the commit
  that deleted `components/landing/FeatureComparison.tsx`, its `.cmp2*` / `.th-*` / `.f-*` / `.fn` CSS in
  `app/landing/landing.css`, and the messages.
- **How it was rendered:**
  - in a temporary git worktree, with `node_modules` cloned copy-on-write (Turbopack refuses a symlinked one);
  - a production build served by `next start` on **port 3200**, separate from yours;
  - `.env.local` was made available to that build as a **symlink**, so Next read it and I never opened it.
- **Then removed:** the symlink, the worktree (`git worktree remove`) and the 3200 server. `git worktree list` no
  longer shows it.
- ⚠️ **Where the descriptions really lived.** The brief says "the deleted featuresPage messages". At `c6c44c9e`,
  `featuresPage` held only the eyebrow ("Compare"), the heading, the lede and a footnote. The **descriptions** were
  `planFeatures.row.<id>.detail` (deleted in Stage B as "unused"). The old page also replaced one of them, offline
  protection, with `planFeatures.landing.offlineProtectionDetail`.
- **Where they live now:** I restored the descriptions and the eyebrow as a **`featuresPage`** namespace, so the name
  you used is now true: `featuresPage.eyebrow` and `featuresPage.detail.<row id>`, en-GB base, en-US overrides.
  - Only /features reads it. The page passes the text into the table as a prop.
  - So Manage's client bundle doesn't grow by 32 sentences.

## 2 · What changed on /features

| | Old page (`c6c44c9e`) | Now (HEAD) | After |
|---|---|---|---|
| Eyebrow | "COMPARE" (Archivo 700, 12px, orange, 0.16em) | none | **"COMPARE"**, the same |
| Heading | h2 "Every feature, side by side." (Archivo 800, 34.4px at 1440, navy, −0.03em) | h1 at the hero size (clamp 2–3rem), left | **h1** "Everything to run your service, on every plan.": the old h2's type (34.4px at 1440), **centred**, still the only h1 |
| Lede | 16px, `--ink-soft`, max 50ch (489px) | max 60ch, left | the old style, 50ch (489px), **centred** |
| Callout | (none) | 60ch, left | **centred**, max 50ch (as wide as the lede), centred text |
| Table frame | no card: rows on the band's wash | white card, border, rounded | **no card** (the old) |
| Plan header | Archivo 800 names (15.2px), orange Archivo 800 prices (14.4px), 2px navy rule, sticky under the nav | Public Sans, grey prices, orange rule under the highlighted column | **the old styles.** Names and prices are data ("Pay as you go", "£29 / month"); there are no sub-labels (the old "per truck / month" line had no new equivalent, so none was added) |
| Highlighted column (Pro) | (none) | tinted band, orange name | **none visible:** no band, and the name the same navy as the others (your two requests). The data's `pt-hl` class is still in the markup, unstyled on /features |
| Column widths | 3.6rem / 6rem (≥620) / 7rem (≥900) | `minmax(4.4rem, 9.5rem)` (the source of the phone bug, §6) | **6rem / 7rem as the old; 4.75rem on phones** (see below) |
| Group headings | orange Archivo 700 caps, 11.5px, 0.14em, sticky under the header | grey caps on a grey band | **the old style and stickiness.** They pin exactly under the header, using its measured height (§3) |
| Rows | 0.7rem padding, 1px `--line` rule, name 14.4px/600 navy | 0.75rem, hairline, 14–15px/400 | **the old** (measured: name 14.4px/600 navy at x=190, w=192px at 1440, as before) |
| Descriptions | 12.8px `--ink-soft`; under the name on phones, their own column from 900px | none | **restored, the same** (the description column starts at x=401 at 1440, as before) |
| ✓ / — / coming soon | text "✓" (orange, 700, 16.8px), faint "—", italic 11.2px "Coming soon" | drawn SVG tick, grey "—", bordered caps pill | **the old glyphs and styles** (measured identical) |
| Money cells | 0.78rem/600 values | bold values | **the old `.val` style** |
| Footnotes | `.fn`: 12.8px `--ink-faint`, superscripts `--ink-soft` | `.price-note` paragraphs | **the old `.fn` block.** Text unchanged: *, ¹ printing, ² WhatsApp, numbered by row order |

**Two places where it deliberately isn't the old page:**
- **The header is centred at every width,** as the brief asks. The old page centred it only at ≤720px; at 1440 it was
  left-aligned (visible in the side-by-sides).
- **The phone column is 4.75rem, not 3.6rem.** The old width fits neither "Unlimited" nor "£69 / month" (70px measured
  at 375). With three plans instead of four, the name column is still wider than the old page's: 97px against 95px.

## 3 · How it was done (files)

- **`components/pricing/PlanTable.tsx`:**
  - new `variant` prop (`'card'`, the default, or `'features'`), plus `details` (description by row id);
  - the features variant changes only class names and wrappers: `pt pt-features`, `.pt-name` + `.pt-desc`, a text ✓,
    `.pt-val` on money cells, and fixed `var(--cmp-col)` columns;
  - **the default variant's output is byte-identical to HEAD** (§5).
- **`components/pricing/PlanTableHeadHeight.tsx`** (new, client, renders a hidden span):
  - measures the sticky plan header and sets `--pt-head-h`, so the group headings pin directly beneath it;
  - the old page used a fixed height per breakpoint, but the plan names are data now ("Pay as you go" wraps on a
    tablet), so a fixed height would drift. This follows the manual's measured-offset pattern (`--addorder-sticky-top`);
  - the CSS keeps a fallback for the first paint.
- **`app/landing/landing.css`:** the /features block now holds the old values for the same roles, every rule
  `.hg-landing .pt-features …` (three classes), so it beats `plan-table.css` without touching Billing's card. It also
  holds the centred header, the callout and `.fn`.
- **`app/features/page.tsx`:** the eyebrow, the features variant with `details`, and the `.fn` footnote block. The
  metadata is untouched.
- **Messages:**
  - `messages/en-GB.json` and `en-US.json` gain the `featuresPage` namespace;
  - its generated files are `messages/ns/{en-GB,en-US}/featuresPage.json` and `lib/i18n/catalog/featuresPage.ts`
    (`node scripts/split-messages.cjs`; `--check` clean).

## 4 · The descriptions — before → after (for your review)

- **30** are restored word for word.
- **1** (Offline order protection) is the text the old page actually printed: its landing override, which replaced
  the shared detail.
- **1** (SMS order alerts) is **rewritten**: I dropped "Will carry an additional charge (price to be confirmed)." It
  promised a charge that no plan data backs. Say if you want it back.
- **No row needed a new description:** Private events and Custom event types & pricing both had one on the old page.
- **None of them named Starter, Pro, Max, a price, an allowance, a fee or "first month".** That's why only SMS needed
  a change.

| # | Row (group) | Old page (c6c44c9e) | Restored (en-GB) | Status |
|---|---|---|---|---|
| 1 | Walk-up order processing (Run your service) | Take and manage orders at the hatch, paid on your own card terminal. | = old | restored verbatim |
| 2 | iPhone, iPad and Android kitchen app (Run your service) | The fullest way to run HatchGrab: a live kitchen screen, plus the only way to keep taking orders when you lose signal. | = old | restored verbatim |
| 3 | Multi-device kitchen sync (Run your service) | Run several screens — front counter and kitchen — all showing the same live orders. | = old | restored verbatim |
| 4 | Multi-user access (Run your service) | Give staff their own logins with the right level of access. | = old | restored verbatim |
| 5 | Offline order protection (Run your service) | If you lose signal, online ordering pauses so customers can’t place orders you won’t see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection. | = old | restored — the text the old page printed (its landing override); the shared detail was "If your internet drops mid-service, orders are held safely and sync when you’re back — you never lose one." |
| 6 | Kitchen ticket printing (Run your service) | Print order tickets to a Bluetooth or wired printer in the kitchen. | = old | restored verbatim |
| 7 | Universal web dashboard (Run your service) | Run your service from any phone, tablet or laptop browser. | = old | restored verbatim |
| 8 | Meal deals & upsells (Run your service) | Bundle items into deals and offer add-ons at checkout to lift the average order. | = old | restored verbatim |
| 9 | Instant sold-out toggle (Run your service) | Mark any item sold out in one tap — it greys out for customers straight away. | = old | restored verbatim |
| 10 | Automated stock countdown (Run your service) | Set a stock count and it counts down as orders come in, then sells out automatically. | = old | restored verbatim |
| 11 | Buzzer tracking (Run your service) | Give an order a buzzer number when you hand one out, so you know which buzzer belongs to which order. | = old | restored verbatim |
| 12 | Advanced reporting (Run your service) | Break sales down by date range, item and event to see what’s really selling. | = old | restored verbatim |
| 13 | Take payment on your phone (Run your service) | Take card payments on a supported phone, so you don’t need a separate card machine. | = old | restored verbatim |
| 14 | Customer-facing display (Run your service) | A screen customers can see showing order numbers and when they’re ready. | = old | restored verbatim |
| 15 | Online payments (Online orders) | Take card payment upfront when customers order online, via Stripe. | = old | restored verbatim |
| 16 | Advance pre-ordering (Online orders) | Let customers order for a future date or time before the event. | = old | restored verbatim |
| 17 | Pre-order deadline (Online orders) | Set a cut-off time for items that need notice. | = old | restored verbatim |
| 18 | Customer time slot selection (Online orders) | Customers pick a collection time slot, spreading demand across your service. | = old | restored verbatim |
| 19 | Kitchen capacity management (Online orders) | Set how much your kitchen can cook at a time and how long it takes. Once a slot is full, customers can’t pick it. | = old | restored verbatim |
| 20 | Auto-accept online orders (Online orders) | Online orders are accepted automatically — no need to confirm each one. | = old | restored verbatim |
| 21 | Private events (Online orders) | Add private events that don’t show on the map, with their own private ordering link and QR code. | = old | restored verbatim |
| 22 | Schedule page on your own website (Online orders) | Show your upcoming dates on your own website. Each one links straight through to its order page. | = old | restored verbatim |
| 23 | QR code (Online orders) | A printable QR code that opens your menu and ordering page. | = old | restored verbatim |
| 24 | Branded QR code (Online orders) | Add your logo to your QR code. | = old | restored verbatim |
| 25 | Discovery map listing (Online orders) | Your truck appears on the public HatchGrab map so nearby customers can find you. | = old | restored verbatim |
| 26 | Automatic schedule import (Online orders) | We fill your schedule automatically — from your website, or a photo you already post to Facebook. You just review and confirm. | = old | restored verbatim |
| 27 | Custom event types & pricing (Online orders) | Create your own event types, with custom prices and settings for events and festivals. | = old | restored verbatim |
| 28 | Social media posts (Marketing & automation) | Upload your designs — we add your dates, places and times for each week and event automatically. | = old | restored verbatim |
| 29 | WhatsApp auto-replies (Marketing & automation) | Auto-reply to WhatsApp enquiries about your menu and schedule. | = old | restored verbatim |
| 30 | Messenger & Instagram auto-replies (Marketing & automation) | Same as WhatsApp auto-replies, for Messenger and Instagram enquiries. | = old | restored verbatim |
| 31 | SMS order alerts (Marketing & automation) | Text customers automatically when their order’s ready. Will carry an additional charge (price to be confirmed). | Text customers automatically when their order’s ready. | **rewritten** — the second sentence named an extra charge, which no plan data backs |
| 32 | Digital loyalty stamp cards (Marketing & automation) | Reward repeat customers with digital stamp cards — collected and redeemed automatically. | = old | restored verbatim |

**en-US overrides (restored verbatim from the old en-US file):**

| Row | en-US description |
|---|---|
| Walk-up order processing | Take and manage orders at the window, paid on your own card terminal. |
| Instant sold-out toggle | Mark any item sold out in one tap — it grays out for customers right away. |
| Customer time slot selection | Customers choose a pickup time slot, spreading demand across your service. |
| WhatsApp auto-replies | Auto-reply to WhatsApp inquiries about your menu and schedule. |
| Messenger & Instagram auto-replies | Same as WhatsApp auto-replies, for Messenger and Instagram inquiries. |
| Take payment on your phone | Take card payments on a supported phone, so you don’t need a separate card reader. |

**Grep proof** (`scripts/pricing-pages.cjs`, check "no description names a plan, a number…"): every en-GB and en-US
description is tested against
`/\b(Starter|Max|Pro|Unlimited|Pay as you go|trial|plan|plans|tier)\b|[0-9£$€%]|first month|allowance|\bfee\b/i`.
- **Result: 0 hits.**
- 32 en-GB descriptions for 32 table rows, none missing, none extra.
- 6 en-US overrides, all on real rows.
- The page renders all 32, in table order, and the 3 money rows have none.

## 5 · Billing and the plans PDF — unchanged

- **Billing:** a temporary probe rendered the **default** `PlanTable` from HEAD and from the working tree, with the
  seed catalogue, over a matrix of:
  - GB and US settings;
  - highlight on pro, payg, unlimited, or none;
  - an identity mask or a "TBC" mask;
  - sticky top unset or `3rem`.
  - **Result: 32/32 renders byte-identical.** The probe and its temporary copy of HEAD's file were deleted.
  - In the sweep, `pricing-pages` §6 (Billing, GB/US) and `plans-data-model`'s Billing check still pass on `pt pt-card`.
- **The PDF:** `lib/plans-pdf.ts` builds its own HTML and doesn't use `PlanTable`. Neither it nor any message namespace
  it reads changed (the only new namespace is `featuresPage`). `pricing-pages` §5 (PDF, GB/US, masked) passes.
- **Billing's tint and orange name are untouched;** only /features cancels them.

## 6 · ⚠️ A live bug: the current /features (and possibly Billing) at phone width

**The cause.** HEAD's table columns are `minmax(0,1fr) repeat(3, minmax(4.4rem, 9.5rem))`. On a narrow screen the
grid grows the three plan columns to their 9.5rem maximum **before** the flexible name column gets any space. At
375px the name column ends up **0px wide**. With `overflow-wrap: anywhere`, every name and group heading then breaks
one letter per line ("O / n / l / i / n / e …").

**The effect.** The live page is 15,429px tall at 375, against 3,305 for the old page at 1440. It's in
`docs/features-page-restore/side-375-top.png` (middle column).

**Fixed on /features** by this change (fixed columns via `--cmp-col`). The page is now 7,835px at 375, with no
horizontal scroll (`scrollWidth` 375 at 375; 1440 at 1440).

**Manage › Billing uses the same default rule,** so on a phone-width Manage it very likely does the same. I didn't
change Billing (your instruction).
- **The one-line fix** is in `components/pricing/PlanTable.tsx`: give the plan columns a fixed width rather than
  `minmax(4.4rem, 9.5rem)`, e.g. `repeat(n, minmax(4.4rem, 1fr))` with the name column `minmax(8rem, 2fr)`.
- Say if you want it.

## 7 · SEO

- **/uk/features `<head>`** (title, description, robots `index, follow`, canonical, three hreflang alternates) is
  **identical** before and after, diffed by curl on the production builds.
- **One h1** on /uk and /us. `<html lang>` en-GB / en-US.
- `/features` still 302s to the country page.
- **`MARKETING_COPY_UPDATED`** (`lib/marketing-meta.ts`) is `'2026-10-20'`, which is today, so it **did not need
  moving** for this copy change.

## 8 · Proof

**Screenshots** (production builds, full page, headless Chrome), saved in `docs/features-page-restore/`. Each image
shows OLD (`c6c44c9e`, :3200) | NOW (HEAD `4633801c`, :3100) | AFTER (this change, :3100):
- `side-1440-full.png` and `side-1440-top.png`;
- `side-375-full.png` and `side-375-top.png`.

**What differs between OLD and AFTER**, and nothing else:
- the plan columns: 3 data plans instead of Trial / Starter / Pro / Max;
- the money rows: WHAT YOU PAY instead of Fees;
- the groups: Run your service / Online orders / Marketing & automation instead of the tiers;
- the footnotes: *, ¹, ²;
- the new wording (h1, lede, callout);
- the centred header at 1440;
- the 4.75rem phone columns.

**Measured, OLD vs AFTER at 1440** (identical):
- eyebrow 12px/700 orange;
- heading 34.4px/800 navy;
- lede 16px `--ink-soft`, 489px wide;
- plan name 15.2px/800 and price 14.4px/800 orange, in 109px cells;
- group 11.52px/700 orange;
- row name 14.4px/600 navy at x=190, w=192;
- description 12.8px `--ink-soft` from x=401;
- ✓ 16.8px/700 orange; "—" 14.4px faint; "Coming soon" 11.2px/600 italic faint;
- footnotes 12.8px faint;
- row padding 11.2px.

**Sticky, mid-scroll:**
- the plan header pins at the nav (72px) on both;
- the group heading pins at the header's bottom: 141px at 1440 and 156px at 375. The old one pinned about 8px under
  its header, because of its fixed offset.

**What was executed:**
- **tsc:** clean (`tsc --noEmit`, exit 0).
- **Build:** `next build` passes, run four times (before capture, then after each round of changes, the last including
  your two colour changes).
- **Lint:** `eslint` on `app/features/page.tsx`, `components/pricing/PlanTable.tsx` and
  `components/pricing/PlanTableHeadHeight.tsx`: 0 errors, 0 warnings. The CSS is checked by `seo-fixes`' strict
  postcss parse.
- **`scripts/pricing-pages.cjs`:** 145/145. Re-pinned (§3 of the harness) to `pt pt-features` and the `.fn` block, and
  it reads row names without their descriptions. New checks:
  - the eyebrow above the one h1;
  - 32 descriptions, in table order, from the messages; none on money rows;
  - the plan/number grep;
  - the old cell glyphs;
  - US descriptions use the en-US wording.
- **Re-pins** (each marked `⚠️ RE-PINNED (features-page-restore, 20 October 2026)`; done by a sub-agent from my brief;
  no product code touched):
  - **New shared module `scripts/_lp-features-restore.cjs`** (registered in `scripts/harnesses.json`). It is an exact
    forward transform of the Stage B /features page into this one, in six named steps:
    - eyebrow;
    - `pt-card` → `pt-features`, plus the hidden span and the columns;
    - `pt-name` / `pt-desc`;
    - SVG tick → ✓;
    - `pt-val`;
    - `price-note` → `.fn`.

    Each step throws if its anchor is stale, and it must reproduce the page **byte for byte**. Nine deliberate
    tamperings (a wrong description, no eyebrow, the SVG tick, a wrapped "—", and so on) all fail it.
  - **The harnesses** (before → after):
    - `_lp-stage-b.cjs` requires that proof, then runs Stage B's checks on the recovered shape. This fixes
      `language-phase-1e` (1022 + 3 failing → 1023/0) and `language-phase-1e-tidy` (60 + 9 failing → 61/0);
    - `plans-data-model` (149 + 1 → 150/0);
    - `marketing-country-parity` (143/144 → 145/145; "the new h1" now expects the eyebrow before it, plus a new check
      that all 32 descriptions appear in order);
    - `_messages-parity-1e.cjs`: `messages-parity` 25724 + 2 → 25726/0. `featuresPage.detail.sms_order_alerts` is a
      named, exact check: it must equal the first sentence of the old detail. No other key's check was loosened.
  - **No product bug** was found by any re-pin.
- **Full sweep (`node scripts/run-harnesses.cjs`, final tree, after your two colour changes): 143 of 145 harnesses
  pass.**
  - **`event-types-render` failed in the sweep** with rc=1, but its output stops mid-check with no failed check printed.
    It **passes when re-run alone (rc=0)**. It drives headless Chrome over Manage's event-types screen, which this
    change doesn't touch, so I take it for a flake. It passed in the sweep before the colour changes.
  - **`demo-rebuild-replace`** is the other failure, below.
- **`demo-rebuild-replace`**, the one failure, fails the same single check as in every workstream today (§5 "an event
  on ANOTHER date is kept, as before"). Its fixture is dated today.
  - ⚠️ **The clock-pinned re-run that proves this was not run this time.** The sub-agent's attempt
    (`node -r <scratchpad>/clock-1019.cjs scripts/demo-rebuild-replace.cjs`) was **blocked by a permission prompt**,
    and I didn't run it in its place.
  - Earlier today the same command passed 36/36. Run it yourself, or allow it, to confirm.

## 9 · Not changed / for you

- **The SMS description's dropped sentence** (§4): restore it if you want it.
- **Billing's phone-width columns** (§6): a one-line fix, if you want it.
- ~~**The old page's footer had App Store / Google Play badges;** today's footer (HEAD and after) doesn't. Not touched,
  just noticed in the side-by-side.~~ ⛔ **Corrected (features-followups, 20 October 2026):** wrong. Both badges are in
  the footer of /uk/features, /uk and /us/features (live HTML). They are `loading="lazy"` (seo-fixes S7), and the
  full-page screenshots were taken without scrolling, so they hadn't loaded yet. See `docs/features-followups-report.md` §2.
- **The old header** had sub-labels under each price ("per truck / month", "free forever"). Today's plan data has none
  for the table, so none were added. The column reads "£29 / month".
- **Nothing committed, pushed or deployed.** The 3100 production server from the proofs is stopped at the end of this
  task.
