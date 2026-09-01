# Website-embed — Stage 2, the setup wizard

**WHICH OF THE THREE I DID: A TYPECHECK AND EIGHT EXECUTIONS. No standalone parse — `tsc --noEmit`
subsumes it.** `npx tsc --noEmit` exits 0. Eight harnesses run the **real** transpiled modules in a
`vm`: the wizard component, the three new `/api/manage` actions (against git HEAD as well as the
working tree), the stamp under 50 concurrent loads, plus the four Stage 1/1b harnesses re-run.

🔴 **Nothing was deployed. No migration was run.** Two migration files exist and are unapplied; **no
SQL of any kind was executed** against that database. Pizzeria Gusto is untouched.

**One instruction pair required a reconciliation rather than a stop — §2.1.** Nothing else in the
prompt arrived garbled, and I found no other contradiction.

---

## 0. Everything this stage changed

| File | Change |
|---|---|
| `supabase/migrations/20260826_trucks_embed_seen.sql` | **NEW — written, NOT run.** `embed_last_seen_at`, `embed_last_referer`. Nothing else. |
| `lib/embed-instructions.ts` | **NEW** — the per-platform copy and the escape-hatch email, one definition |
| `components/dashboard/EmbedWizard.tsx` | **NEW** — the wizard |
| `app/api/manage/route.ts` | three actions added; two of them added to `staffBlockedActions` |
| `app/embed/[slug]/page.tsx` | the throttled stamp |
| `app/dashboard/[token]/page.tsx` | **insertion only** — 1 import, 1 mount (§6.4) |
| `components/dashboard/types.ts` | two **optional** fields, `website?` and `embed_enabled?` |

**Not touched:** `lib/plan-features.ts` · `app/trucks/[slug]/TruckClient.tsx` ·
`app/trucks/[slug]/order/page.tsx` · `components/TruckListCard.tsx` · `proxy.ts` · `vercel.json` ·
`lib/ratelimit.ts` — all verified.

---

## 1. Where it lives, and how it is gated

`components/dashboard/EmbedWizard.tsx`, mounted in the dashboard **Settings** tab.

**The gate follows `PrintingSettings`, which is the existing pattern for a Max-plan settings card** —
the plan, overrides and trial expiry are passed as props and the component calls `canAccess` itself,
returning `null` when it denies:

```tsx
  const allowed = canAccess(plan, 'embed_schedule', featureOverrides ?? {}, trialExpiresAt)
  …
  if (!allowed) return null
```

Silent rather than an upgrade advert, exactly as `PrintingSettings.tsx:101-102` does it. `lib/plan-features.ts`
was not touched.

**Three layers, and only the last two are enforcement.** The card is also hidden from `staff`
(mirroring the `showManageLink={userRole==='owner'||userRole==='manager'}` test already on that page)
and from demo trucks. Underneath that: the two write actions are in `staffBlockedActions`, the API
re-checks `canAccess` server-side, and **`/embed` itself checks a third time at render** (Stage 1) —
so even a row that somehow held `embed_enabled = true` off-plan would still show the fallback.

---

## 2. The steps

### 2.1 🔴 THE ONE PLACE THE VOCABULARY RULE IS BENT, DECLARED RATHER THAN SLIPPED IN

The brief says **no jargon anywhere** — not "iframe", "embed code", "snippet", "HTML", "element" or
"paste the following" — and, two lines earlier, that the instructions must name **"the actual menus
the operator will see"**.

**Those cannot both hold literally.** Wix's menu is called **"Embed HTML"**, reached via **"Add
Elements"** → **"Embed Code"**. WordPress's block is **"Custom HTML"**. Refusing to print those makes
step 2 useless, which is the step whose entire purpose is telling the operator where to click.

**I reconciled rather than stopped, because the two are reconcilable:** a quoted third-party button
label is the platform's word, not ours. **Every sentence we write is plain English; the only banned
words that appear are inside quotation marks and are labels the operator must find on screen.**

That distinction is not asserted — it is **tested**. The harness strips every `"…"` span and searches
what remains, then prints the full list of stripped labels so the exception is auditable:

```
  "iframe"                 absent from our own words ✓
  "embed code"             absent from our own words ✓
  "snippet"                absent from our own words ✓
  "element"                absent from our own words ✓
  "html"                   absent from our own words ✓
  "paste the following"    absent from our own words ✓

  EVERY QUOTED LABEL CARRYING A BANNED WORD — the full declared exception, 4 of them:
    "Add Elements"   (a platform button label, reproduced exactly)
    "Embed Code"     (a platform button label, reproduced exactly)
    "Embed HTML"     (a platform button label, reproduced exactly)
    "Custom HTML"    (a platform button label, reproduced exactly)
  Nothing else in the operator-facing copy contains any of those words.
```

**Four labels. If you want them gone, the platforms' own menus become unnameable and step 2 has to
become "ask someone" for Wix and WordPress. That is your call, not mine to take silently.**

⚠️ **The first run of this check failed** — it applied the exception to "HTML" only, and flagged
"Add Elements" and "Embed Code". The rule was generalised and the label list printed, rather than the
two hits being quietly excused.

### 2.2 Platform picker

Six answers: **Wix · Squarespace · WordPress · Shopify · Something else · Someone else looks after my
website**. Each carries a one-line hint in the operator's terms ("You log in at yoursite.com/wp-admin"),
because an operator who does not know what their site was built with can still recognise how they log
in to it. "Someone else looks after my website" goes straight to the escape hatch.

⚠️ **THE MENU PATHS COME FROM TRAINING AND WERE NOT VERIFIED AGAINST THE LIVE PRODUCTS TODAY.**
Website builders rename menus. Every platform therefore carries a line — *"Do the menus look different
from this? {platform} changes them from time to time"* — pointing at the escape hatch, so a changed UI
is a detour rather than a dead end.

### 2.3 Sandbox — handled as a symptom, not a cause

Stage 1b gave the Order button `target="_blank"`. Wix and Squarespace both wrap pasted content in
their own restricted frame, which can block that. The copy on **those two platforms only** says:

> One thing to watch: on this website builder, the "Order" button sometimes cannot open a new tab. If
> you tap Order on your own site and nothing happens, that is why — get in touch and we will sort it out.

🔴 "Your builder applies a sandbox attribute without allow-popups" is true and useless. **The operator
needs to recognise the symptom**, and the symptom is a button that does nothing.

### 2.4 Escape hatch

`send_embed_instructions` → `lib/embed-instructions.ts` → **`sendConfirmationEmail`**, this codebase's
single Brevo POST helper (its name is historical; the refund, cancellation and event-cancellation
mails all use it). **No second email mechanism, no new key, no new template system.** The body is
generated by the same module the wizard renders on screen, so what the web person reads and what the
operator saw cannot drift.

🔴 **The sender name is the TRUCK, not HatchGrab.** The recipient is a web developer or a friend doing
a favour; an email from a company they have never heard of asking them to change a website is
indistinguishable from phishing. Proven: `senderName === 'Real Thai Food'`.

---

## 3. 🔴 THE WEBSITE ADDRESS — `trucks.website` AND NOTHING ELSE

`save_embed_setup` builds its update object from **named locals**, never spread from the body:

```ts
    const patch: { embed_enabled: boolean; website?: string } = { embed_enabled: enabled }
    if (typeof body.website === 'string' && body.website.trim()) {
      const url = normaliseUrl(body.website)
      if (!url) return NextResponse.json({ error: 'That does not look like a web address' }, { status: 400 })
      patch.website = url
    }
```

**Executed across every wizard path, including the back-and-change-answer paths and two deliberate
smuggling attempts. Every UPDATE payload, captured:**

```
  enable + website (the normal finish)            200   {"embed_enabled":true,"website":"https://www.realthai.co.uk"}
  enable, no website typed                        200   {"embed_enabled":true}
  enable, website left blank string               200   {"embed_enabled":true}
  turn OFF                                        200   {"embed_enabled":false}
  back-and-change: re-save a DIFFERENT site       200   {"embed_enabled":true,"website":"https://newsite.co.uk/events"}
  back-and-change: off then on again              200   {"embed_enabled":true,"website":"https://www.realthai.co.uk"}
  🔴 SMUGGLING: body carries schedule_url          200   {"embed_enabled":true,"website":"https://www.realthai.co.uk"}
  🔴 SMUGGLING: body carries all three             200   {"embed_enabled":true}

  UNION OF ALL COLUMNS WRITTEN: ["embed_enabled","website"]
  PASS  schedule_url never appears in any payload
  PASS  scraper_preference never appears in any payload
  PASS  scraper_rule never appears in any payload
```

The truck row in the harness is seeded with recognisable scraper values
(`schedule_url: 'https://realthai.co.uk/our-schedule-page'`, `scraper_preference: 'auto'`,
`scraper_rule: 'scroll_next'`) so a write to any of them would appear rather than being invisible.
**Nothing reads them either** — they are not consulted as a default for the website field.

⚠️ **A corroborating result from the same run:** `update_settings` with the scraper columns in its
body produces an **empty** payload on both git HEAD and the working tree — the pre-existing ALLOWLIST
already drops them. The separation this stage relies on was already load-bearing.

An unparseable address (`"my events page"`) returns **400 with no write** — `normaliseUrl` refuses
rather than guessing.

---

## 4. Live verification

**Not a server-side fetch.** The wizard tells the operator to open their own website, and the embed
route stamps itself when a browser loads it.

**The stamp lives on the page, not the API, and that is the load-bearing detail.** The `Referer` on a
client `fetch` from inside the frame is our own `/embed/<slug>` URL — useless. The **page** request is
an iframe subresource, so its referrer is the **framing document**, truncated by the default
`strict-origin-when-cross-origin` policy to a bare origin — `https://theirsite.com` — which is exactly
the "which site was it found on" the wizard shows back.

⚠️ **NOT VERIFIED IN A BROWSER.** That is the referrer-policy specification, not an observation. **A
site sending `Referrer-Policy: no-referrer` gives us nothing**, so the column is nullable and the
wizard confirms the load without naming the page in that case.

🔴 **The baseline, without which the check would be a lie.** A truck embedded last week already has a
stamp. Treating "a stamp exists" as success would congratulate an operator who has pasted nothing. The
wizard captures `last_seen_at` **before** telling them to go and look, and success is a stamp *newer*
than that baseline.

**Never a dead end.** After two minutes (30 polls at 4s) the operator gets three ways forward — *Look
again* · *Ask someone to help* (back to the escape hatch) · *Leave it for now* — under copy that says
plainly: *"It is switched on either way — nothing is broken."*

---

## 5. 🔴 THE STAMP IS A WRITE ON A PUBLIC UNAUTHENTICATED ROUTE

### The throttle: **5 minutes per truck**, enforced **in Postgres**, by the column itself

```ts
    const cutoff = new Date(Date.now() - STAMP_THROTTLE_MS).toISOString()
    await supabase
      .from('trucks')
      .update({ embed_last_seen_at: new Date().toISOString(), embed_last_referer: origin })
      .eq('id', truckId)
      .or(`embed_last_seen_at.is.null,embed_last_seen_at.lt.${cutoff}`)
```

**Two mechanisms, and only the second is correctness:**

- **The fast path** — the page's own query already read `embed_last_seen_at`, so a fresh stamp
  short-circuits before any write is attempted. An optimisation. Under concurrency several requests
  can read the same stale value, so it is *not* the guarantee.
- **🔴 The conditional UPDATE** — Postgres takes a row lock; a concurrent second UPDATE blocks, then
  re-evaluates its predicate against the row the winner just wrote, finds the timestamp fresh, and
  matches **zero rows**. The database is the arbiter.

⚠️ **NO SECOND MECHANISM WAS ADDED, AND I CHECKED STAGE 1's BUCKET FIRST.** `embedRatelimit` answers
*"how many requests may ONE ADDRESS make for this truck"*; this answers *"how often may this TRUCK be
written, across all addresses"*. Different questions. Rather than add a Redis key that could then
disagree with the row, **the throttle is the column**. One source of truth for when a truck was last
seen.

### It cannot block or slow the render

`after()` (Next 16.1.6, `next/server`) runs the stamp **once the response has been sent**, and the
whole body is inside `try`/`catch`. A database outage produces a log line and nothing else.

### Under concurrent loads — executed, and the count is shown

```
  50 concurrent renders → after() callbacks queued: 50
  UPDATE statements that reached the row : 50
  WRITES THAT ACTUALLY APPLIED           : 1

  PASS  50 concurrent loads produce exactly ONE write
  PASS  the referer is stored as an ORIGIN, path and query dropped   https://realthai.co.uk
  PASS  a row stamped 30s ago takes ZERO writes and ZERO update attempts   writes=0 attempts=0
  PASS  a row stamped 6 minutes ago is written again
  PASS  a row stamped 4 minutes ago is NOT written (inside the 5-minute window)
  PASS  no Referer → stamped with a NULL referer, not a crash
  PASS  the page rendered BEFORE any stamp ran (after() defers it)
  PASS  a failing stamp throws nothing out of after()
  PASS  the page tree is still a rendered element
  PASS  embed_enabled FALSE (fallback rendered) is STILL stamped
  PASS  off-plan (fallback rendered) is STILL stamped

  THE STAMP'S UPDATE PAYLOAD: ["embed_last_referer","embed_last_seen_at"]
```

⚠️ **WHAT THAT DOES AND DOES NOT PROVE.** The fake table **models** Postgres's behaviour — writers
serialise on the row, and a blocked writer re-evaluates its predicate against the winner's value
(READ COMMITTED + EvalPlanQual). That is a documented property of the engine, **not** something this
harness demonstrates. What *is* demonstrated is that our code issues a predicate which, under those
semantics, admits exactly one writer per window — and that the fast path, the failure path and the
referer handling behave as claimed. **No database was contacted.**

⚠️ **Stamped on the fallback path too, deliberately.** The fact recorded is "this page was loaded",
which is what verification asks. Gating the stamp on `allowed` would mean an operator checking their
work could never get a confirmation and would be told correct work had failed.

---

## 6. Verification

### 6.1 The plan gate, made to BITE — the wizard

The real component, executed. **Five of eight cases are denials**, and their pass condition is that
`null` was returned:

```
  max plan                           → WIZARD    rendered   PASS
  starter plan                       → NOTHING   null       PASS
  pro plan                           → NOTHING   null       PASS
  trial, expiry NULL                 → WIZARD    rendered   PASS
  trial, EXPIRED                     → NOTHING   null       PASS
  max, override embed_schedule=false → NOTHING   null       PASS
  starter, override =true            → WIZARD    rendered   PASS
  max but truck has NO slug          → NOTHING   null       PASS
    gate: 8/8
```

### 6.2 The plan gate, made to BITE — the server

```
  max                → 200
  starter            → 403   writes attempted: 0    …and it wrote NOTHING
  pro                → 403   writes attempted: 0    …and it wrote NOTHING
  trial, expiry NULL → 200
  trial, EXPIRED     → 403   writes attempted: 0    …and it wrote NOTHING
```

⚠️ **`trial` with a NULL expiry passes, and that is the Stage 1 consequence unchanged.**
`TRIAL_FEATURES` is `[...MAX_FEATURES]` and self-serve signup writes `trial_expires_at: null`, so
every self-serve truck reaches this wizard on day one. **`trucks.embed_enabled` (NOT NULL DEFAULT
false) is still the condition that actually decides whether anything is public.**

### 6.3 The scraper columns

§3 — eight paths, two smuggling attempts, union of all written columns = `{embed_enabled, website}`.

### 6.4 Existing surfaces unchanged

**`/api/manage` — git HEAD vs the working tree, both executed:**

```
  update_settings: identical UPDATE payloads   [["website","cuisine_type"]]     PASS
  update_settings: identical status (200 / 200)                                 PASS
  update_settings (with scraper columns in the body): identical payloads []     PASS
```

**`app/dashboard/[token]/page.tsx` — insertion only, proven structurally.** Both edits were
`str.replace` calls whose replacement **contains the original anchor verbatim**, so nothing could be
deleted or reworded. Asserted afterwards:

```
  ANCHOR SURVIVAL — the lines my two insertions were placed against:
    PRESENT ✓  import { nativeAuthHeader } from '@/lib/native/session'
    PRESENT ✓  {!isDemo&&truck&&<PrintingSettings
    PRESENT ✓  {!isDemo&&<NotificationSettings token={token}/>}

  DELETED LINES IN THE FILE'S FULL DIFF vs HEAD: 4
  …of which relate to the embed (i.e. could be mine): 0
```

⚠️ **Those four deletions are NOT mine.** They are the `nativeAuthHeader` additions from the
deny-by-default workstream (`docs/deny-by-default-report.md`), already in the working tree before this
stage began. This stage added **one import and one mount**, and deleted nothing.

**All eight harnesses, re-run together:**

```
  embed-gate  PASS   embed-api   PASS   posthog        PASS   proxy-embed   PASS
  card-parity-1b PASS   wizard-gate PASS   stamp-throttle PASS   embed-actions PASS
```

⚠️ The Stage 1 gate harness needed `next/server` and `next/headers` stubs added, because the page it
tests gained the stamp. `after()` is captured and **not** run there, so that harness still asserts
only what Stage 1 asserted.

---

## 7. Turning it on and off

**On:** `save_embed_setup { enabled: true, website }` at the point the operator saves their address —
which is the commitment point, and means the real schedule (not the fallback) is what they see when
they go to check. Reaching the end of the wizard therefore always leaves `embed_enabled` true.

**Off:** one button, under copy that says what actually happens:

> If you turn this off, the space on your website does not go blank. Visitors will see your truck's
> name and a link through to your schedule here on HatchGrab instead.

That is the Stage 1 fallback, described in the operator's terms. **An operator will not switch
something off on their own website if they cannot picture the result, and "it stops working" is not a
picture.**

---

## 8. What remains unverified

1. **Nothing was rendered in a browser and no iframe was loaded.** The wizard was executed with a
   stubbed React and stubbed hooks; no click path was walked, no CSS was seen, no email was sent.
2. **The platform menu paths are from training, not from the live products today** — §2.2.
3. **The Referer behaviour is from the specification, not observed** — §4.
4. **Postgres's concurrency behaviour is modelled, not exercised** — §5. No database was contacted.
5. **Neither migration has been applied**, so `embed_enabled`, `embed_last_seen_at` and
   `embed_last_referer` do not exist. Until they do, the wizard's reads return `undefined` and the
   stamp fails into its catch. **Apply both before deploying.**
6. **Brevo was stubbed.** No mail was sent and no Brevo response was seen.
7. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build, and does not exercise
   `after()` at runtime.
8. **The 4-second poll cadence and the two-minute limit were not tested against a real operator's
   patience** — they are a guess, and the way out exists because of that.
