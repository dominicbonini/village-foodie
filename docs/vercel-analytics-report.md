# 🔴 STOPPED — PostHog was not removed. It is live, on the landing page, right now.

**Date:** 9 September 2026 · **Mode:** STOPPED before making the change. **No package installed, no component mounted, no file edited.** 🧪 `git diff --stat package.json package-lock.json` is **empty**. No database row touched, no Sheet cell touched, **no Vercel setting changed**. Nothing staged, committed or pushed; `git add` not run.

**Why:** your own instruction. *"Verify the PostHog removal is complete before adding anything — 🔴 if any PostHog code, env var or script tag survives, report it rather than layering a second tool on top of a half-removed one."* **It is not half-removed. It is entirely present and running.**

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -rn -I -i "posthog"` over the repo with only `node_modules`/`.next`/`.git`/`docs` excluded (`.tsx`, `.ts`, `.json`, `.xcprivacy`, `.md` all in scope), plus `.env*` and `node_modules/` checked directly. 🧪 **Every search's exit code was read.** ⚠️ One did fail: `ls app/privacy*` printed `no matches found` — a **zsh glob failure, not a true negative**; re-run with `find`, the policy is at `app/(legal)/privacy/`. That is the exact false-negative class V12.5 records from the robots.txt incident, and it would have made me report "no privacy policy exists".

---

## 0. `git status --short` — START and END, identical

```
 M DEBUG_SCRAPED_TEXT.txt          ← pre-existing, scraper debug artefact
 M scripts/run-scraper.js          ← pre-existing: SITES_FROM + the auto-exclusion change
?? docs/auto-exclusion-write-report.md · docs/sites-from-*.md · docs/sql/precondition-*
```
`HEAD` = `origin/main` = `9e83a5e`. Nothing staged. **END adds only this report.**

### Files I would have touched, and their state

| file | already modified? | verdict |
|---|---|---|
| `package.json` / `package-lock.json` | 🧪 **no — clean** | would have been a clean hunk |
| `app/layout.tsx` (the real root layout) | 🧪 **no — clean** | 🔴 **but it is where `CSPostHogProvider` is mounted (`:150`)** — an `<Analytics />` added here would sit ~4 lines from the PostHog mount and **would not separate under `git add -p`** from any later PostHog removal |
| `content/legal/privacy-policy.md` | 🧪 **no — clean** | clean hunk |

⚠️ **`scripts/run-scraper.js` carries two other workstreams** (`SITES_FROM`, the auto-exclusion write) — **I would not have touched it**, so those hunks are unaffected either way.

---

## 1. 🔴 THE PREMISE IS FALSE, IN BOTH HALVES

> *"PostHog was REMOVED on 7 September over a consent issue (V12.5). There is currently no analytics of any kind."*

**Neither half holds.**

### What the 7 September commit actually did

🧪 `git show 08ac368` — *"Analytics: **stop sending visitor postcodes to PostHog**, disable session recording"*. Its own message:

> *"Two visitor postcodes were reaching PostHog with the visitor's IP attached… `app/page.tsx:151 searched_postcode` — postcode property removed… `clicked_newsletter_subscribe` — SECOND instance… Also removed."*

**Two event properties were removed and session recording was disabled. PostHog itself was left running.** ⚠️ It is easy to see how "the PostHog change on 7 September, about privacy" compressed into "PostHog was removed" — but the commit is narrow and says so.

### What is live today

| evidence | 🧪 |
|---|---|
| `package.json:41` | `"posthog-js": "^1.359.1"` — a **dependency** |
| `node_modules/posthog-js` | **installed** |
| `.env.local` | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` — **both present** |
| 🔎 `app/providers.tsx:54` | `posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, …)` **at module scope** |
| 🔎 `app/layout.tsx:150` | `<CSPostHogProvider host={host}>` wrapping **the entire app** |
| capture call sites | `app/page.tsx` ×2 · `app/venues/[slug]/VenueClient.tsx` ×4 · `app/trucks/[slug]/TruckClient.tsx` ×1 · `components/EventListCard.tsx` ×4 |

### 🔴 And in the SERVED output, which is the only proof that counts

You were right to insist source is not proof — V12.5 records the double-brand title as correct in every file and wrong when served. So:

```
curl -sk -H "Host: hatchgrab.com" https://localhost:3000/
  <title>Food truck &amp; mobile catering ordering system — HatchGrab UK</title>
  posthog occurrences in SERVED landing HTML: 8
  posthog-js_67e5a716._.js
```

🔴 **That is the landing page — the exact page you want measured — served, with the PostHog bundle in it, 8 occurrences.** The consumer root at `villagefoodie` carries it too (5 occurrences).

### The manual agrees — it never said PostHog was removed

🔎 V12.5 `:8506`: **"PostHog initialises UNCONDITIONALLY in the root layout — no host check, no route check."**
🔎 V12.5 `:21926`: **"The provider is mounted in the ROOT layout, so PostHog sets cookies on every…"**
🔎 V12.5 `:12716`: **"🔴 THE POSTHOG COOKIE CONTRADICTION WITH `/privacy` IS UNRESOLVED… The policy says there are no analytics or tracking cookies; the code sets them on every route of both domains with no consent gate. §43. Nothing has been changed in either."**

⚠️ **So the consent issue you remember is real — but it was never resolved by removing PostHog. It is still open, with PostHog still running.**

---

## 2. Why this stops the task rather than just delaying it

**Adding Vercel Web Analytics now would give you two analytics tools, not one** — and the second is being chosen *because* it is cookieless and needs no consent banner. That reasoning only holds if the cookie-setting one is gone. It is not.

🔴 **Concretely, the thing Vercel Analytics is meant to avoid is already happening.** V12.5 `:8477`, **confirmed in production on 26 August 2026**:

> PostHog `$current_url` values included **`/dashboard/realthaifood-23f80551121b`** and **`/manage/realthaifood-23f80551121b`**, repeatedly, across `$autocapture` and `$pageview` events — **with van ids and event ids alongside.**

**A dashboard token is a full credential in a URL, and tokens have already leaked into a third-party analytics store.** Your brief says not to mount anything that could put such a path into an analytics payload — 🔴 **that condition is already violated by the tool that is running.** Mounting a second one at the root without addressing the first would mean two stores receiving those paths.

---

## 3. The answers you would need anyway

### Scope — mounting at the root instruments everything

🔎 The real root layout is **`app/layout.tsx`** (the only `layout.tsx` at `app/`'s top level; the six others — `app/(legal)`, `app/landing`, `app/dashboard/[token]/kds`, `app/kds/[kds_token]`, `app/dev`, `app/trucks/[slug]/order` — are **nested**, and a nested layout in Next.js **wraps** the root, it does not replace it).

🔴 **So mounting `<Analytics />` there instruments every route**, including 🧪 `app/dashboard/[token]`, `app/manage/[token]` and `app/kds/[kds_token]` — **the surfaces Pizzeria Gusto uses while trading.**

⚠️ **What Vercel Web Analytics would collect on those pages:** the page path (**which contains the token**), referrer, UTM parameters, country, and coarse device/browser/OS. It is cookieless and does not fingerprint — but **the path is the payload**, and that is precisely the leak already recorded. **It cannot be scoped to the landing page from the root.** If you want landing-only, the component has to be mounted in `app/landing/layout.tsx` instead — which exists — and that is the option I would put to you.

### The privacy policy — what it says now

🔎 The document is `content/legal/privacy-policy.md` (rendered by `app/(legal)/privacy/page.tsx`, which reads it at build time and is explicitly not to be paraphrased). The processor table lists **seven**:

| Provider | What it does | Where |
|---|---|---|
| Supabase | Database and authentication | UK (London) |
| **Vercel** | **Website and application hosting** | UK (London) |
| Brevo | Sending transactional email | EU |
| Google (Gemini) | Menu extraction, WhatsApp auto-replies | US |
| Apple and Google | Push notifications | US |
| Meta (WhatsApp) | Carrying WhatsApp messages | US |
| Stripe | Taking payments | US |

🔴 **PostHog is not in it.** 🧪 The policy names it nowhere. And 🔎 the cookies paragraph says, published, today:

> **"We do not use advertising, tracking or third-party analytics cookies, and we do not track you across other websites."**

⚠️ **That sentence is currently contradicted by the running code** — the manual's unresolved contradiction, quoted in §1.

**Would Vercel Analytics need a new row?** ⚠️ **Arguably not a new *provider* row** — Vercel is already listed — but the "What it does" cell would need widening, because "website and application hosting" does not cover analytics. **Proposed wording, for you to accept or reject — I am not deciding whether to publish it:**

> `| Vercel | Website and application hosting, and privacy-friendly visitor analytics (page views and referrers; no cookies, no cross-site tracking) | United Kingdom (London) |`

🔴 **But the more consequential edit is the one this task did not ask for:** either PostHog is removed and the cookies paragraph becomes true, or PostHog stays and **both the table and that paragraph are wrong as published**. **Adding a Vercel row while that stands would make the policy more detailed and no more accurate.**

---

## 4. What I did not do, and what I would propose

**Not done:** `@vercel/analytics` not installed · no component mounted · `app/layout.tsx` untouched · the privacy policy untouched · no Vercel setting changed · PostHog **not** re-added and **not** removed (removing it is a separate decision with four capture sites and a provider to unpick, and you did not ask for it).

⚠️ **Nothing in this report is deployed or enabled**, because nothing was built. For completeness on your Step 4 point: even had I made the change, data would appear only after **both** a deploy **and** you enabling Web Analytics in the Vercel project settings — 🔴 **neither has happened, and I have not touched the project settings.**

**The three ways forward, for you to pick:**

1. **Remove PostHog first, then add Vercel Analytics at the root.** Makes the published cookies paragraph true, ends the token leak, and gives you one tool. Largest change.
2. **Mount Vercel Analytics in `app/landing/layout.tsx` only.** Gives you exactly what you asked for — landing-page visitor numbers — with **no token-bearing path** ever reaching it, and leaves PostHog untouched for now. Smallest change that is safe. ⚠️ Still leaves the policy contradiction open, and you would have two tools.
3. **Do nothing yet** and settle the PostHog question first.

🔴 **I recommend 2 if you want numbers this week, and 1 as the real fix.** But this is your call, and I have stopped rather than choosing.

**No span of the prompt arrived garbled.** The instruction to add the tool and the instruction to verify the removal first were in tension only because the premise turned out false; the brief told me which one wins, and I followed it.
