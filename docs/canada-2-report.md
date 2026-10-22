# canada-2: getting Canada ready to switch on

**Date:** 22 October 2026 · **Branch:** `main` (uncommitted, on top of `fadb352f`, with canada-1's uncommitted work) · nothing
pushed or deployed · **no SQL run, and no database change needed.** The Saskatchewan and Manitoba closures are data in the
address config, not the database. canada-1's NOT RUN SQL is unchanged.

**The prompt** arrived intact: nothing was garbled and no two instructions contradicted each other.

## ⚠️ First: four things to know

1. **Production's Node version can't be read from the repo.** There's no `engines` field, no `.nvmrc` or `.node-version`,
   no `.vercel/` folder, and no runtime in `vercel.json`. So the Vercel project's own setting decides the major version,
   and Vercel chooses the patch ("Vercel automatically rolls out minor and patch updates when needed").
   - The 2026 Canadian time-zone changes need **tz data 2026e**. The first Node releases with it came out yesterday:
     **22.23.4** and **24.22.1** (21 Oct), plus 26.11.0.
   - This machine runs Node 22.22.3 with tz 2026a, which **lacks** them.
   - What you need to do in Vercel is in §2.4.
2. **No code fix for the time zones, by choice.** Vercel lets a project choose only the major version, so no code can
   force 2026e. Pinning `engines` would change the runtime for every live country, and the alternatives (bundled ICU data,
   per-zone offset overrides at every Intl call) aren't small.
   - **Built instead:** `scripts/check-tzdata.cjs`, run before every build. It prints the Node version and tz data, and
     whether the Canadian changes are present, so every Vercel build log says it plainly.
   - It **never fails a build.**
   - **Proved:** tz 2026a and 2026e give **identical** times for every GB, US, IE, AU and NZ zone at every hour of
     2026–2027 (§2.3).
3. **The dates were already the build date.** anz-terms had set the page, `COUNTRY_TERMS_UPDATED` and `TERMS_VERSION`
   to 22 October 2026 (`2026-10-22`), and today is 22 October. "Moved together to the build date" therefore changes no
   value.
   - Neither change is deployed, so there's no clash between two documents sharing one version.
   - If this ships on a later day, move all three together then.
4. **Saskatchewan and Manitoba are closed with Quebec's flag, keeping their tax data.** The flag now carries a **reason**:
   `language` (Quebec, French) or `taxLines` (SK, MB). The one sentence `tradeArea.region_closed` words both. The
   two-part tax build is the backlog item (§4).

## Summary

- **Signup and Where you trade refuse QC, SK and MB**, through the real `/api/setup` and `/api/manage` routes, and in the
  signup step itself:
  - "Trucks based in Saskatchewan can't sign up yet: we're adding separate GST and PST lines first. If your truck is
    based somewhere else, choose that town or city."
  - The same for Manitoba. Quebec's sentence is unchanged ("…HatchGrab isn't available in French yet…").
  - **Ontario, BC, Alberta and Nova Scotia sign up** and store their province.
- **Time zones:**
  - All four Canadian changes are in tzdb 2026e (BC 2026b, Alberta 2026c, NWT 2026d, Manitoba 2026e). tzdb dates each
    from 1 Nov 2026.
  - A runtime without them shows Vancouver, Edmonton and Winnipeg an hour out from that date. Every other zone is
    identical.
  - The build log now reports which tz data a deploy has.
- **The terms:** the Canada section is after New Zealand.
  - "Notices and governing law" and "Contact" are written out in full, and the Quebec line also names Saskatchewan and
    Manitoba.
  - US, Ireland, Australia and New Zealand are byte-identical, as are the Terms of Service and Privacy Policy.
  - No "[FLAG".
- **Proof:**
  - `canada-2` **33/33**, with negative controls; `canada-1` still **85/85**;
  - screenshots in WebKit and Chromium;
  - tsc, build, lint and the full sweep are in §5.

## 1 · Saskatchewan and Manitoba closed

**The data** (`lib/address-formats.ts`):

```ts
signupClosed?: { reason: 'language'; needsLanguage: string } | { reason: 'taxLines' }
{ code: 'MB', name: 'Manitoba', salesTax: CA_TAX.gstRstMb, signupClosed: { reason: 'taxLines' } },
{ code: 'QC', name: 'Quebec', signupClosed: { reason: 'language', needsLanguage: 'French' } },
{ code: 'SK', name: 'Saskatchewan', salesTax: CA_TAX.gstPstSk, signupClosed: { reason: 'taxLines' } },
```

- **The validator** now allows a closed region to keep its tax. It checks only that a closure is well formed.
- **The words** (`messages/en-GB.json`, `tradeArea.region_closed`):
  "Trucks based in {region} can't sign up yet{reason, select, language {: HatchGrab isn't available in {language} yet}
  taxLines {: we're adding separate GST and PST lines first} other {}}. If your truck is based somewhere else, choose
  that town or city."
  - This is your sentence, said per province. It is named as a new wording in messages-parity.
- **Where it applies:** `checkTradeArea` (`lib/trade-area.ts`) refuses, and every path runs it: the signup step,
  `/api/setup`, provisioning, and Manage › Where you trade.
  - As in canada-1, only a town **picked** from Places carries a province. A typed town with no pick has none and isn't
    refused.

| Path (real code, in-memory database) | QC | SK | MB | ON | BC | AB | NS |
|---|---|---|---|---|---|---|---|
| Signup, `/api/setup` create_truck | 400 + reason | 400 + reason | 400 + reason | created, "ON" | created, "BC" | created, "AB" | created, "NS" |
| Where you trade, `/api/manage` update_trade_area (truck in Toronto) | 400, stays ON | 400, stays ON | 400, stays ON | | saved | | saved |
| The signup step (`baseAnswerErrors`) | `language`, French | `taxLines` | `taxLines` | open | open | open | open |

**The tax data stays:** SK GST + PST 11%, MB GST + RST 12%, ready for when they open.

## 2 · Time zones

### 2.1 What production runs: not readable from the repo
- **Nothing in the repo pins Node:**
  - `package.json`: no `engines`;
  - no `.nvmrc`, `.node-version` or `.tool-versions`;
  - no `.vercel/` folder;
  - `vercel.json` sets functions' memory and duration and headers, but no runtime.
- **So Vercel's own setting decides:** Settings → **Build and Deployment** → **Node.js Version**.
  <https://vercel.com/docs/functions/runtimes/node-js/node-js-versions>:
  - the choices are "**24.x** (default)" and "**22.x**";
  - "Only major versions are available. Vercel automatically rolls out minor and patch updates when needed, such as to
    fix a security issue."
- **The scrapers on GitHub Actions** use `node-version: '24'` (three workflows) and `'22'` (`process-next-truck`). They
  resolve to the latest patch at run time.
- **This machine** (the build output's new first line): `check-tzdata: Node v22.22.3, ICU 78.2, tz data 2026a — the 2026
  Canadian time-zone changes are MISSING`.

### 2.2 What changed, and which Node has it
From <https://data.iana.org/time-zones/tzdb/NEWS> (newest: "Release 2026e - 2026-09-29"):

| Change | First tzdb release | NEWS |
|---|---|---|
| British Columbia, America/Vancouver, permanent −07 | 2026b (22 Apr) | "British Columbia moved to permanent -07 on 2026-03-09." |
| Alberta, America/Edmonton, permanent −06 | 2026c (8 Jul) | "Alberta moved to permanent -06 on 2026-06-18." |
| Northwest Territories, permanent −06 | 2026d (11 Sep) | "…moved to permanent -06 on 2026-08-21." (America/Inuvik; the rest is America/Edmonton) |
| Manitoba, America/Winnipeg, permanent −05 | 2026e (29 Sep) | "Manitoba moves to permanent -05 on 2026-10-31." |

- **How tzdb models them:** each switch happens on 2026-11-01 at 02:00 ("temporarily model the change to occur on
  2026-11-01 at 02:00 instead"). Offsets before then are the same; the abbreviations change.
- **2026e also warns:** "Another TZDB release may be needed soon if any of the portions of northwestern Ontario
  historically aligned with America/Winnipeg do" follow.

**Node with all four**, from the Node changelogs' "deps: update timezone to 2026e":

| Line | First with 2026e | Latest (22 Oct) |
|---|---|---|
| 22.x LTS | **22.23.4** (21 Oct) | 22.23.4 |
| 24.x LTS (Vercel's default) | **24.22.1** (21 Oct). 24.22.0 (14 Oct) does not have it | 24.22.1 |
| 26.x | 26.11.0 (7 Oct) | 26.12.1 |

**Verified here:** I downloaded the official `node-v24.22.1-darwin-arm64.tar.gz`, checked it against nodejs.org's
`SHASUMS256.txt` ("OK"), and it reports `v24.22.1 tz 2026e icu 78.3`.

### 2.3 Evidence: GB, US, IE, AU, NZ unchanged; three Canadian zones affected
Every hour of 2026 and 2027 (17,520 instants per zone), formatted by Intl, under Node 22.22.3 (tz 2026a) and Node
24.22.1 (tz 2026e):

| Country | Zones | Result |
|---|---|---|
| GB · IE | Europe/London · Europe/Dublin | **identical** |
| US | New_York, Chicago, Denver, Phoenix, Los_Angeles, Anchorage, Honolulu | **identical** |
| AU | Sydney, Melbourne, Brisbane, Adelaide, Darwin, Perth, Hobart | **identical** |
| NZ | Auckland, Chatham | **identical** |
| CA | Toronto, Regina, Halifax, St_Johns, Moncton, Whitehorse, Iqaluit | identical |
| CA | **America/Vancouver** | 4,504 hours differ from 2026-11-01 09:00 UTC (2026a "01:00", 2026e "02:00") |
| CA | **America/Edmonton** | 4,505 hours differ from 2026-11-01 08:00 UTC |
| CA | **America/Winnipeg** | 4,506 hours differ from 2026-11-01 07:00 UTC |

- **Before 1 November nothing differs anywhere,** so no time shown today is wrong.
- **After it,** only BC, Alberta (and the NWT) and Manitoba trucks are affected. Manitoba is closed anyway.

### 2.4 What you change in Vercel

**Do this before switching Canada on:**
1. In Vercel, open **Settings → Build and Deployment → Node.js Version**. Choose **24.x** (the default; 22.x also works,
   from 22.23.4).
2. **Redeploy.**
3. In the **build log**, find the line `check-tzdata: Node v24.x.x, ICU …, tz data … — the 2026 Canadian time-zone
   changes are …`.
   - It must say **present** (Node 24.22.1 or later, tz 2026e).
   - If it says **MISSING**, Vercel hasn't rolled the new patch out yet. Redeploy later (Vercel promises patches "when
     needed"), or ask Vercel support when 24.22.1 reaches the build image. Keep Canada switched off until a build says
     "present".

**What I didn't do, and why:**
- **`engines: { node: "24.x" }` in package.json** would override the dashboard for every country, and still only picks
  the major.
- **Bundling ICU data** (`NODE_ICU_DATA`, about 30 MB) is risky in a serverless function.
- **Fixed-offset overrides** for the three zones would touch every Intl call that takes a zone.

None of those is small and safe for every live country.

**Devices:** a customer's or operator's own device formats some times with its own tz data.
- Chrome ships its own (it updates with Chrome).
- Safari and iOS take Apple's system data, so an iOS update is needed (from memory; no source found).
- That is outside the app. From 1 November, a BC or Alberta device with old data could show its own clock an hour
  out, in any app.

**Built:** `scripts/check-tzdata.cjs`, run by `prebuild` after `split-messages`.
- It reads three probe offsets for 1 December 2026: Vancouver −7, Edmonton −6, Winnipeg −5.
- It prints one line, and warnings when they're missing.
- It **always exits 0.**
- canada-2 §2 checks its reading against an independent one (Intl `longOffset`) and that it never fails.

## 3 · The terms: Canada section applied

The text is canada-1 §6, with the brief's changes:

- **Spelled out in full:**
  - "**Notices and governing law.**": Terms §12; England and Wales; "This does not take away any protection that the law
    of your province or territory gives you and that cannot be excluded by agreement."
  - "**Contact.**": privacy@hatchgrab.com and the Rosedale address.
- **The Quebec line is now "Quebec, Saskatchewan and Manitoba":** "HatchGrab is not available yet to trucks based in
  Quebec, because it is not yet available in French, or to trucks based in Saskatchewan or Manitoba, because we are
  adding separate GST and PST lines first."
- **No [FLAG markers**; the open questions are below.
- **The rest is as drafted.** The "Sales tax" paragraph still says "(GST, HST, or GST and PST)", which stays true of the
  data once SK and MB open.
- **Spelling:** the US section's precedent is the country's own. Canadian English writes these words as drafted.

**Unchanged:** everything before `## Canada` (the intro, US, Ireland, Australia, New Zealand) is byte-identical to
`scripts/fixtures/country-terms-before-canada.md`, a copy of the page taken before the change. The Terms of Service
(`52fc845a…`) and the Privacy Policy (`400c0045…`) are byte-identical to `7fcd4fc9`.

### Open questions for a lawyer (L) or accountant (Acc)

- **T1 (L), "Prices":** "Any fixed charge a customer must pay, other than tax, has to be in the price they see first"
  restates Competition Act s. 74.01(1.1) for the truck. Does a statement about the truck's own pricing duty belong in
  our terms?
- **T2 (L), "Breaches":** a promise to report to the OPC and tell people. Under PIPEDA, the duty falls on the
  organization in control. If HatchGrab is the truck's service provider for customers' data (canada-1 C4), the truck
  reports and we help. The NZ section words this split; this one doesn't yet.
- **T3 (L), "The law that applies":** BC and Alberta PIPA apply to intra-provincial collection by organizations in those
  provinces. Does the sentence over-state their reach over HatchGrab, a UK company?
- **T4 (L), "Notices and governing law":** England and Wales for Canadian small businesses, against provincial consumer
  law. Ontario's CPA protects "consumers", and a truck buying software is a business, so the section preserves only
  non-excludable protections.
- **T5 (L/Acc), "Our prices":** this asks for a GST/HST number, but nothing in HatchGrab collects one yet. The simplified
  GST/HST regime counts unregistered trucks towards CAD 30,000 (canada-1 C1).
- **T6 (L), "Marketing emails":** "only with your consent". CASL also allows implied consent (s. 6, for example an
  existing business relationship). Is promising express consent intended?
- **Carried over from canada-1 §7, all still open:**
  - C2 drip pricing liability;
  - C3 provincial internet-agreement disclosure (Ontario O. Reg. 17/05 ss. 31–33; BC; Alberta);
  - C5 Quebec (Bill 96, Law 25);
  - C6 allergens online;
  - C7 CASL senders;
  - C8 Ontario's $4 point-of-sale rebate.

## 4 · Backlog

- **The two-part tax (canada-1 §2.4), needed to open Saskatchewan and Manitoba.**
  - **Database:** a `tax_parts jsonb` on `orders` and `order_drafts` (NOT RUN SQL when built).
  - **Data:** `salesTax.parts` on the region.
  - **Engine:** each part rounded once, summed into `tax_minor`, with the column carried on promotion.
  - **Lines:** `chargeLinesFor` emits one line per part, and every surface draws it.
  - **Then:** remove `signupClosed` from SK and MB, and update the terms line.
- **Collect a GST/HST registration number at signup** (canada-1 C1; backlog §27).
- **Northwestern Ontario:** watch for a tzdb release after 2026e if areas aligned with America/Winnipeg follow
  Manitoba.

## 5 · Proof

| Check | Result |
|---|---|
| `scripts/canada-2.cjs` (new, swept) | **33/33**: §1 the real `/api/setup` and `/api/manage` routes and the signup step (QC, SK, MB refused with their words; ON, BC, AB, NS open; tax data kept); §2 check-tzdata (agrees with an independent reading, exits 0, in prebuild, no engines pin); §3 the terms (before `## Canada` byte-identical, Terms and Privacy byte-identical, shape, the points, Notices and Contact in full, the Quebec / SK / MB line, no FLAG, dates, render) |
| Negative controls (restored after each) | Saskatchewan reopened: **4 failures**. One digit changed in New Zealand's section: **2 failures** |
| `scripts/canada-1.cjs` | **85/85**, unchanged (Quebec's sentence reads exactly as before) |
| tz evidence | §2.3: Node 22.22.3 / tz 2026a against official Node 24.22.1 / tz 2026e (SHA-256 verified): every live country's zones identical at every hour of 2026–2027 |
| Screenshots (`docs/canada-2/`) | `/country-terms` from a production build (`next start` on :3123, stopped afterwards), WebKit 2359 and Chromium 1243: `<engine>-country-terms-full-1280.png`, `<engine>-canada-<1280\|390>.png`. `measurements.json`: status 200, headings `["United States","Ireland","Australia","New Zealand","Canada"]`, "Last updated" 22 October 2026, no "[FLAG", no horizontal scroll at 390 |
| tsc | 0 errors |
| build | passes, and the build log now opens with the check-tzdata line |
| lint | **2,445 errors / 378 warnings before and after**; no file has more than before |
| full sweep | **160 run · 160 passed · 0 failed** |

**Re-pinned for these approved changes:**
- `scripts/us-legal-draft.cjs`: the list of country headings now ends with Canada.
- `scripts/anz-terms.cjs`: New Zealand's section now ends at `## Canada`, and the render check reads "then any later
  country's". `canada-2` re-proves everything before Canada byte for byte.
- `scripts/_messages-parity-1e.cjs`: `tradeArea.region_closed`'s named new wording now covers the tax-lines reason.

## 6 · Files

- **Data and config:** `lib/address-formats.ts`: SK and MB closed (`taxLines`), Quebec's flag with its reason, the
  validator. `messages/en-GB.json`: `tradeArea.region_closed` with the reason select (and the generated
  `messages/ns/en-GB/tradeArea.json`).
- **Code:** `lib/trade-area.ts` (the refusal carries the reason). `package.json` (`prebuild` runs check-tzdata).
- **Terms:** `content/legal/country-specific-terms.md` (the Canada section).
- **Scripts:**
  - new: `scripts/check-tzdata.cjs`, `scripts/canada-2.cjs`, `scripts/fixtures/country-terms-before-canada.md`;
  - re-pins: `scripts/us-legal-draft.cjs`, `scripts/anz-terms.cjs`, `scripts/_messages-parity-1e.cjs`;
  - `scripts/harnesses.json`.
- **Images:** `docs/canada-2/` (6 screenshots, `measurements.json`).

## Read-only SQL run

None. This workstream needed no database read.

## Undo (only if Dominic asks)

Nothing ran in the database. Reverting the files above:
- reopens SK and MB;
- removes the Canada terms section;
- takes check-tzdata out of `prebuild`.
