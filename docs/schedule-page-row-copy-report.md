# "Schedule page on your own website" — row rewording

**GARBLED SPANS: none. No instruction contradicted another.**

Two files changed for this task: `lib/plan-features.ts` and `app/landing/page.tsx`.
**Nothing committed, nothing deployed. No SQL, no migrations, no credentials.**

⚠️ **Scope note:** you sent two briefs in the same turn. The Buzzer tracking tier change is reported
separately in `docs/buzzer-row-max-only-report.md`; both edits touch `lib/plan-features.ts` and the PDF
below was regenerated once, after both.

---

## 1. 🔴 THE LABEL **IS** A JOIN KEY — and the rename moved it

**You were right to gate on this.** Every occurrence of the old label, from a repo-wide grep:

| # | Site | Kind | Action |
|---|---|---|---|
| 1 | `lib/plan-features.ts:359` | the row's `name` | **renamed** |
| 2 | 🔴 **`lib/plan-features.ts:504`** | **`ROW_FEATURE_MAP` key** → `'embed_schedule'` | 🔴 **RE-KEYED IN THE SAME EDIT** |
| 3 | `app/landing/page.tsx:385` | **display copy** — a hand-written `<li>` in the Max pricing card | **changed** — see below |
| 4 | `app/landing/page.tsx:378` | a comment naming the row | updated |
| 5 | `docs/*.md` (4 files) | historical record | **left alone** |

**The other four key maps do NOT name this row** — checked individually, not assumed:
`trialFeatureValue()` (two exceptions, neither is this), `DETAIL_OVERRIDES` (two entries),
`NAME_OVERRIDES` (one), `HIDDEN_ROWS` (one). `isRowComingSoon()` in Manage likewise. **Only
`ROW_FEATURE_MAP` had to move, and it moved.**

### Verified afterwards, not assumed

`ROW_FEATURE_MAP` is a module-private `const` (`lib/plan-features.ts:509`) and is **not exported**, so it
cannot be read at runtime from outside. I parsed it out of source and cross-checked every key against
every live row name:

```
table rows: 32   map entries: 24
STALE KEYS: none — every key joins to a live row
Schedule row key -> embed_schedule
```

🟢 **No stale key anywhere in the map.** This matters exactly as you said: a renamed row with a stale
entry makes `findPlanParityViolations()` hit `if (!feature) continue` and **silently stop checking the
row** — no error, no warning. The checker returns **0 violations**, and for this row that result is
meaningful *only because the join was verified independently*; a broken join would also have returned 0.

### ⚠️ The landing card bullet — a fourth change you did not name, and why I made it

`app/landing/page.tsx:385` is a hand-written `<li>` in the Max pricing card that duplicates this row's
label. It is **not a key** — nothing joins on it. But the card and the comparison table sit on **one
page**, and the code's own comment at that line already warns:

> "Un-badge here and flip there together, **or the page argues with itself** — this bullet is
> hand-written and nothing checks it."

Leaving it would have put two different names for one feature on a single page. **I changed it to match
and am flagging it rather than burying it.** It is display copy only; cells, badges and position on the
card are untouched.

---

## 2. Before and after

| | Before | After |
|---|---|---|
| **Label** | `Your schedule at your own website` | **`Schedule page on your own website`** |
| **Detail** | `Your upcoming dates on a page at your own address, under your own name.` | **`Show your upcoming dates on your own website. Each one links straight through to its order page.`** |

Applied byte-for-byte as supplied, including both full stops.

### Everything else is unchanged — confirmed against the live module

| | |
|---|---|
| **Cells** | `starter: false, pro: false, max: true` — **identical**. Rendered labels `["✓","—","—","✓"]` (Trial / Starter / Pro / Max) |
| **Trial** | still ✓ — derived, `trialFeatureValue()` returns `row.max`; this row is neither of its two named exceptions |
| **Footnote** | **none, before and after.** ⚠️ The brief mentions a "footnote reference"; this row has never carried one. `footnote: '5'` belongs to `Kitchen ticket printing`, the row beneath it. Nothing was added or removed |
| **Position** | **3rd in the `Max tier` section**, after `Multi-user access` — unchanged by this task. (Its *neighbour below* changed, because the other brief moved `Buzzer tracking` in beneath it.) |
| **Section** | `Max tier` — unchanged |

**This is copy only.** No cell, no footnote, no ordering, no gate.

---

## 3. 🔴 Does the copy match what the feature actually does?

**Yes on both points you asked about. Nothing overstates. No reason to stop.** Established from code:

### (a) What the operator actually gets: **a page HatchGrab serves at their own domain. Not an embed.**

- `trucks.custom_domain` holds a hostname the operator points at us — in practice a **subdomain of their
  own site**; `app/domain/page.tsx:15` gives the worked example `schedule.theirtruck.co.uk`.
- `proxy.ts` **rewrites `/` to `app/domain/page.tsx`** when the request arrives on a host that is not
  ours, so **the address bar stays theirs throughout** (`app/domain/page.tsx:14-16`). The page renders
  `<EmbedSchedule>` inside their own chrome, with their name, their logo and their metadata — the route
  goes to some length to stop Village Foodie branding leaking into the tab title and link preview.
- 🔴 **It is not something they embed.** The public iframe route was **deleted at V11.49**;
  `/api/embed/events` survives *only* as this page's data source and `route.ts:1-4` says its name is
  historical. So "on your own website" describes a page at their address, not markup inside their CMS.
- Five conditions must all hold before customers are sent there (`lib/custom-domain/redirect-target.ts`):
  a domain set, machine-verified, human-confirmed, plan grants `embed_schedule`, and the daily health
  check recent. It fails towards our own page every time.

### (b) Does it link to ordering, or order? **It links. Per-event, and exactly as your wording says.**

`components/TruckListCard.tsx:194` builds each date's CTA as:

```
href={`${orderOrigin ?? ''}/trucks/${slug}/order?event_id=${event.id}`}
```

🟢 **"Each one links straight through to its order page" is precise, not loose** — the link carries
**that event's own `event_id`**, so it is that date's order page, not a generic one. The button reads
**"Order now"** when the event is live and **"Pre-order"** otherwise. It opens with
`target="_blank" rel="noopener noreferrer"` deliberately, so ordering and payment happen top-level on
hatchgrab.com (the order page mounts Stripe's own iframe). **The schedule page carries links; it does
not take orders.** Your wording does not overstate it.

### ⚠️ One phrase I want you to look at — flagged, not blocked

The **old** detail said "on a page at your own address", and the row's comment records that as a
deliberate choice:

> 🔴 **THE PAGE IS SERVED AT THEIR ADDRESS. IT IS NOT AN EMBED.** The detail deliberately avoids
> "built into your site", "embedded" and "inside your website" — none of those is what this is, and a
> marketing string that promises an embed is a promise the product would have to keep.

**"Show your upcoming dates on your own website" is nearer that line than "at your own address" was.**
It is not wrong — the page genuinely lives on their domain — but "on your website" can be read as
"inside your existing site", which is the one thing the product does not do.

**I did not stop, because neither thing you asked me to check works differently from your description**
— it is their domain, and it links rather than orders. The preposition is a shade, and the wording is
yours. But you said you did not want it overstating, so: **if you want the narrower phrasing, say the
word and the detail becomes "Show your upcoming dates at your own web address."** The label can stay
either way. The concern is recorded in the row's comment so a later reader sees it too.

⚠️ **A separate caveat, unchanged by this edit but worth restating:** the row is ticked, and this feature
**has never served a page from a real domain in production**. There is also a second gate the matrix
cannot see — `trucks.embed_enabled`, `NOT NULL DEFAULT false` — so a Max truck reading the tick still
gets the fallback page until `domain_provision` sets that column. That was true before today.

---

## 4. Every surface, and the PDF

| Surface | Site | Result |
|---|---|---|
| **Landing** `/` table | `app/landing/page.tsx:472` | 🟢 **Rendered in a browser.** Row at **position 29**; label and both detail sentences exact; cells `["✓","—","—","✓"]`; old label **absent from the whole page** |
| **Landing** Max pricing card | `app/landing/page.tsx:390` | 🟢 bullet now reads `Schedule page on your own website`; card and table agree |
| **PDF** | `app/landing/features-pdf/route.ts:148` | 🟢 **Regenerated and opened** — below |
| **Admin** plans table | `app/admin/page.tsx:978` | ⚠️ same `FEATURE_SECTIONS` array, one source — but admin-gated and **not rendered** |
| **Manage → Billing** | `app/manage/[token]/page.tsx:11394` | ⚠️ same array — token-gated, **not rendered** |

🟢 **`Your schedule at your own website` no longer appears in any live code path** — only in comments
recording the history and in `docs/`, both deliberately left.

### The PDF — regenerated, opened, and read

⚠️ **The route is admin-gated** (`route.ts:289`, `verifyAdmin()` → 404) and I have no admin session and
invented no credential. I generated it by importing the route's own **`buildHtml()`** into a scratch copy
with only the HTTP handler and its `verifyAdmin` import removed — the builder and every module it reads
are byte-identical — then called the **same** `setContent` + `page.pdf({format:'A4', printBackground:
true, preferCSSPageSize:true})`. **A faithful reproduction of the document, not a fetch of the route**,
and I am naming that rather than implying otherwise.

| | |
|---|---|
| Output | **2 pages, 166,921 bytes** |
| This row | **page 2**, inside the MAX TIER block, whole |
| Row height | **48px** — the same as before the reword |

### 🔴 The row height did not change, and nothing splits

You flagged the risk directly: **the label is longer and the detail is now two sentences.** Measured in
the laid-out document:

- **Old detail** — `Your upcoming dates on a page at your own address, under your own name.` (72 chars)
- **New detail** — `Show your upcoming dates on your own website. Each one links straight through to its order page.` (95 chars)

Both wrap to **two lines** in the label column, so the row is **48px either way — no height change at
all.** The extra 23 characters were absorbed by the second line, which had room.

🟢 **Nothing splits across the page break.** I rendered both pages of the actual PDF and read them.
Page 1 ends after `Automated stock countdown`; page 2 carries the repeated plan header, the rest of
Online sales & automation, the **MAX TIER** block — `Multi-device kitchen sync`, `Multi-user access`,
**`Schedule page on your own website`**, `Buzzer tracking`, `Kitchen ticket printing`, then the three
Coming-soon rows — the allowance list and the small print. **Every row begins and ends on one page.**

⚠️ **One near-miss worth recording.** A DOM measurement of the *unpaginated* document put
`Advanced reporting` across the A4 boundary and I nearly reported it as a split. It is not: the
stylesheet carries `tr { break-inside: avoid; page-break-inside: avoid }` (`route.ts:225`) and the
rendered PDF shows Chrome pushed that row whole onto page 2. **The rasterised pages are the evidence,
not the geometry.**

---

## 5. Protected things — untouched

| | |
|---|---|
| `'Online ordering — Pay at Hatch'` | 🟢 both occurrences intact |
| The bare `'—'` not-included value | 🟢 untouched |
| The Pizzeria Gusto testimonial | 🟢 untouched |
| The price mask set (`NON_SECRET_PRICE`) | 🟢 untouched |
| `lib/features.ts` | 🟢 untouched — `embed_schedule` still sits in `MAX_FEATURES` exactly as it did |
| `app/landing/layout.tsx` (landing admin gate) | 🟢 untouched |
| SQL / migrations | 🟢 none |

**Nothing committed. Nothing deployed.**

---

## The one thing awaiting your word

**"on your own website" vs "at your own web address"** (§3). Both are true of the product; the second is
narrower and cannot be read as promising an embed. Your call — I have shipped your wording as approved.
