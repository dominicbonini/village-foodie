# /compare CTAs → the demo modal

**GARBLED SPANS: none. No instruction contradicted another.**

Two files changed: `app/compare/page.tsx` and `app/compare/CostComparison.tsx`.
**Nothing committed, nothing deployed. No SQL, no migrations, no credentials.**
`/signup` and `/setup` were **not** touched — item 4.

---

## 1. All three CTAs now open the demo modal, and it is the same component

### How the landing mounts it

`app/landing/page.tsx` is a **server** component. It imports three things from one client module
(`components/landing/DemoUpload.tsx`) and arranges them in a fixed shape:

| Piece | Where on the landing | Job |
|---|---|---|
| `<DemoModalProvider>` | `page.tsx:104` — wraps the whole tree | holds the single `open` boolean in React context |
| `<DemoCta className=…>` | eight call sites, e.g. `:118`, `:344`, `:530` | a client `<button type="button">` calling `setOpen(true)`; forwards **`className` only** |
| `<DemoModal />` | `page.tsx:542` — once, last | the modal itself; portals to `document.body` |

Context, not a window event — the module's own comment gives the reason: the CTAs sit in server-rendered
markup and cannot hold an `onClick`, so the state has to live somewhere all of them can reach.

### What /compare has now — the identical shape, not a copy

`app/compare/page.tsx` was already a server component, so the same arrangement drops straight in:

- `page.tsx:31` — imports `DemoModalProvider, DemoModal` from `@/components/landing/DemoUpload`
- `page.tsx:129` — `<DemoModalProvider>` wraps the whole return
- `page.tsx:157` — `<DemoModal />`, mounted once, last
- `CostComparison.tsx:32` — imports `DemoCta` from the same module

**Confirmed: the same component, not a copy.** There is exactly one `DemoUpload.tsx` in the repo and
both pages import from it; grep for `DemoCta`/`DemoModalProvider` returns only that module, `LandingNav`,
`app/landing/page.tsx` and `app/compare/*`. Nothing was duplicated, forked or re-implemented.

### The three CTAs

| # | Site | Before | After |
|---|---|---|---|
| 1 | `page.tsx:145` (was `:125`) | `<LandingNav cta={{ href: '/signup', … }} />` → a plain `<a>` | **`<LandingNav landingHref="/landing" />`** — the `cta` prop **dropped**, so the nav falls to its default branch and renders `<DemoCta className="btn btn-primary nav-cta">` |
| 2 | `CostComparison.tsx:858` (was `:832`) | `<a href="/signup" className={CTA_PRIMARY…}>` | **`<DemoCta className={CTA_PRIMARY…}>`** |
| 3 | `CostComparison.tsx:954` (was `:920`) | `<a href="/signup" className={CTA_PRIMARY…}>` | **`<DemoCta className={CTA_PRIMARY…}>`** |

🟢 **The nav CTA is now byte-identical to the landing's own**, because it is literally the same default
branch of `LandingNav` (`LandingNav.tsx:118-123`) that `app/landing/page.tsx:108` renders. Passing a
`cta` was the only thing making it different. That branch also supplies the `.cta-full`/`.cta-short`
span pair the sub-640px layout needs — see item 6.

⚠️ **The `NavCta` interface now has zero callers.** It is left in place: it is a documented extension
point, deleting it is outside this brief, and it costs nothing.

⚠️ **Exactly one provider and one modal per page — checked, not assumed.** `CostComparison.tsx`
deliberately renders neither; a second provider would give its two CTAs a private `open` state that the
mounted `<DemoModal />` never sees, and the buttons would silently do nothing. That hazard is now
recorded at `CostComparison.tsx:176-181`.

---

## 2. What the CTAs said, and what they say now

| # | Site | Before | After |
|---|---|---|---|
| 1 | nav | `Start free →` / short: `Start free` | **`Upload my menu →`** / short: **`Upload menu`** |
| 2 | hero pair, saving branch | `Start free and save £472 →` | **`Upload my menu and save £472 →`** |
| 2 | hero pair, **no-saving** branch | `Start free →` | **`Upload my menu →`** |
| 3 | below the small print | `Start free →` | **`Upload my menu →`** |

All four labels were read off the rendered page in a browser, not from source. **The no-saving branch was
exercised**, not inferred: driving the competitor's cost to zero flips `good` to false, and all three CTAs
then read `Upload my menu →` with no saving claimed — verdict line `0% more in your first year`.

🟢 **`Upload my menu →` is the landing's exact primary label** (`app/landing/page.tsx:118`), and
`Upload menu` its exact short form. The saving figure is kept on the hero CTA because it is the payoff of
the calculator the visitor has just filled in.

### ⚠️ One consequence of the longer label, measured

The hero CTA's content box is **262px**. Label ink widths at its own 18px font:

| Label | Ink | |
|---|---|---|
| `Start free and save £472 →` (old) | 232px | fitted on one line |
| **`Upload my menu and save £472 →` (new)** | **294px** | **wraps to two lines** |
| `Upload my menu, save £472 →` | 263px | still wraps (by 1px) |
| `Upload menu and save £472 →` | 264px | still wraps |
| `Upload my menu — save £472 →` | 278px | still wraps |

**No wording keeps both the landing's verb and the saving figure on one line.** The button is therefore
88px tall instead of 60px, and its sibling "Ask us a question" equalises to match. I screenshotted it: it
reads cleanly, both buttons stay the same height, and nothing overflows at 1280px or 375px.

⚠️ **This was not asked for and I am naming it rather than hiding it.** It is data-dependent in both
directions — the old label also wrapped once a saving reached five figures (`Start free and save
£12,345 →` = 258px, 4px inside the budget). **If you would rather have one line, say so and the hero
label becomes a flat `Upload my menu →` like the other two;** that is a one-word instruction, and it
collapses the `good` conditional entirely.

---

## 3. 🔴 Are /signup and /setup still reachable from anywhere public?

**Short answer: no public LINK points at either any more — but both still answer a typed URL with 200,
and there is one live email route into /setup. Details below, because "nothing links to it" and
"nobody can get there" are different claims.**

### /signup — no link anywhere, on any surface

I grepped every `href=`, `redirect(`, `router.push/replace(`, `NextResponse.redirect`, and every
interpolated URL, across `app/`, `components/`, `lib/` and `proxy.ts`.

| Kind | Result |
|---|---|
| `href` to `/signup` | 🟢 **zero**, in source and in the rendered page |
| Nav / footer | 🟢 none. `LandingFooter` links Pricing, Privacy, Terms, Contact — no signup |
| Landing page | 🟢 none, and never had one — all eight of its CTAs are `DemoCta` |
| Emails | 🟢 none. `lib/email-signup.ts` sends exactly two buttons: `verifyUrl` (`:141`) and `manageUrl` (`:208`) |
| Redirects into it | 🟢 none |

🟢 **Confirmed on the live render:** `document.querySelectorAll('a[href*="/signup"]').length === 0` on
`/compare` in a real browser, before and after answering the calculator.

⚠️ **But the route is still directly reachable.** `proxy.ts:310` lists `/signup` on the **public** path
list, so it is deliberately exempt from the auth guard. **Probed anonymously on a hatchgrab host:
`GET /signup` → 200.** Anyone who has the URL, a bookmark, or browser history still gets the form — and
that form still leads to the break. Not deleting it was your instruction (item 4); I am recording that
"unlinked" is not "sealed".

### /setup — never had a public link, and still has three internal routes in

| Route in | Where | Reachable by a member of the public? |
|---|---|---|
| `router.push('/setup')` after account creation | `app/signup/page.tsx:57` | **only via /signup**, which nothing now links to |
| `redirect('/setup')` — signed in, no operator row | `app/manage/page.tsx:50` | signed-in operators only |
| `redirect('/setup')` — signed in, no truck | `app/manage/page.tsx:56` | signed-in operators only — **item 4** |
| `{ redirect: '/setup' }` — login with no truck | `app/api/auth/post-login/route.ts:90`, consumed at `app/login/page.tsx:66` | signed-in operators only |
| 🔴 **`/setup?verify=<status>`** | **`app/api/auth/verify-signup/route.ts:43`** | 🔴 **YES — see below** |

### 🔴 The one live route in that is not behind a login: the verification email

`app/api/auth/verify-signup/route.ts:43` defines `backToSetup`, and it fires on **four** branches
(`:45` no token, `:54` no matching row, and `:67` whenever the operator has no truck). The link that
reaches it is the **"Confirm my email address" button in the signup verification email**
(`lib/email-signup.ts:141`).

**So: an operator whose /setup attempt failed has an email in their inbox whose button lands them on
`/setup?verify=ok`** — the exact screen that cannot complete. It needs no session and no link on any
page. It is a live route into the broken flow, and it is the one this change does **not** close.

⚠️ It is also the *correct* destination given the code as it stands: they have an account and no truck,
and `/setup` is where that state belongs. Closing it means fixing `/setup`, not re-pointing the email.

⚠️ **`/setup` is not on either proxy list** — neither `isProtected` nor `isPublic` — so no guard runs.
**Probed anonymously: `GET /setup` → 200**, and the page renders the truck-name form (its mount check
calls `/api/setup?check=truck`, gets no truck for an anonymous caller, and falls through to the form,
`app/setup/page.tsx:61-76`). Submitting it without a session would fail at the API, so it is reachable
but inert.

**Answer, plainly: nothing on any public page links to either route. `/signup` is still URL-reachable and
publicly exempt in `proxy.ts`; `/setup` is still URL-reachable and unguarded; and the signup verification
email is a live, session-free link into `/setup` for anyone already stuck.**

---

## 4. `app/manage/page.tsx:56`, and who is left behind the front door

**Unchanged, and it does exactly what it did.** The file is a resolver, not a page:

```ts
if (!user)                    redirect('/login?next=/manage')   // :40
if (!operator)                redirect('/setup')                // :50
const truck = await resolveOperatorTruck(supabaseAdmin, operator.id)
if (!truck?.dashboard_token)  redirect('/setup')                // :56
redirect(`/manage/${encodeURIComponent(truck.dashboard_token)}`)
```

So `:56` means: **signed in, has an operator row, has no truck → `/setup`.** That is precisely the state
a failed `/signup` → `/setup` attempt leaves behind (account created, truck not), and it is why the loop
in the earlier report is closed: log in → `/manage` → `:56` → `/setup` → phone error → repeat.

### Does routing around the front door strand anyone?

**It changes nothing for them, for better or worse — and that is the honest answer, not a reassuring one.**

- 🟢 **Nobody NEW can enter that state from `/compare`.** The three doors that led there are shut. That is
  the whole value of this change.
- 🔴 **Everyone ALREADY in that state is exactly as stuck as they were.** `:56` still sends them to
  `/setup`, `/setup` still has no phone field, `/api/setup:70-72` still rejects them, and their email
  address is still spent. **Routing around the front door does not open the back one.**
- 🟢 **Load-bearing, and correctly left alone.** Had `:56` been re-pointed at, say, the demo modal, a
  truckless operator would be sent to build an *anonymous demo truck* while already holding an account —
  a different and worse mess. `/setup` is the right destination for that state; the destination is not
  what is broken.

⚠️ **The population is unknown and I did not query it.** "Operators with a row and no truck" is one SQL
query, which I am not permitted to run and did not. That number is the size of the group this change does
not help, and it is still the first thing worth knowing.

---

## 5. What the demo modal requires that /signup did not

### 🔴 The entry requirement genuinely changed — in both directions

| | `/signup` (before) | Demo modal (now) |
|---|---|---|
| **First thing asked for** | **email + password** | **a menu** (file, pasted text, or a sample) |
| Account created at this step | ✅ yes, immediately | 🔴 **no** — deferred to the claim step after the demo is built |
| Card | none | none |
| Time to first screen | instant | **~40–60s provision** while the menu is read |

**So a visitor who arrives at `/compare` intending to *sign up* is no longer offered a signup form.** They
are offered a demo build, and the account comes afterwards, in `components/DemoGetStarted.tsx`. That is a
real change of shape, not just of wording, and it is the reason item 2's relabelling matters: "Start free"
would have promised a signup form that no longer appears.

### Can they proceed without a menu photo? 🟢 **Yes — three routes, and I verified all three are present**

The idle screen offers, in order:

1. **A file** — image or PDF, drag-drop or tap (`MenuUploadFields`)
2. **Pasted text** — a `<textarea>`; `canSubmit = !!file || !!text.trim()` (`DemoUpload.tsx:259`)
3. 🟢 **"See sample menu"** — `DemoUpload.tsx:431-442`, a front-door template route that provisions with
   **no upload of any kind**, under the heading *"Haven't got a menu photo to hand?"*

Verified in the browser at 1280px **and** 375px: file input present, textarea present, "See sample menu"
present and **enabled**. Typing menu text into the textarea flips `Build my demo →` from disabled to
enabled — the same transition, measured on `/compare` and on `/landing`.

**A menu photo is NOT mandatory. Stated plainly, as asked.** The heavier ask is real — a menu is a bigger
opening request than an email address — but it is not a wall, and the sample route means a visitor on a
phone with nothing to hand can still get through.

⚠️ **I did not submit a provision** from either page. A submit builds a real demo truck against the live
API; the brief did not ask for one and it would leave a row behind. Everything above is measured DOM
state and read source, and the boundary is marked here rather than blurred.

### What it collects that /setup never did

Once the demo is built and the visitor claims it, `DemoGetStarted.tsx` collects **contact phone**
(`:234`), **WhatsApp preference** (`:235`), **first and last name**, and **cuisine** — and sends the phone
with `create_truck`, which is why this path satisfies the server requirement that breaks `/setup`. Those
four also populate `preferred_contact_method`, `whatsapp` and `truck_emoji`, all of which are null or
default on the `/setup` path. **That is the "materially more complete truck" your decision rests on, and
it holds up on re-reading.**

---

## 6. End-to-end verification, anonymous, on a hatchgrab host

Driven with Puppeteer against `http://hatchgrab.127.0.0.1.nip.io:3000` — a real host header, no session,
no cookies. **Not a typecheck.**

### Every CTA clicked

The results panel is gated on the staff answer (`{staff && …}`), so the calculator was answered first;
all three CTAs were then clicked individually and the modal inspected after each:

| CTA | Clicked | Modal opened | Heading | Closed cleanly |
|---|---|---|---|---|
| nav `Upload my menu →` | ✅ | ✅ | `✨ Upload your menu` | ✅ |
| hero `Upload my menu and save £472 →` | ✅ | ✅ | `✨ Upload your menu` | ✅ |
| footer `Upload my menu →` | ✅ | ✅ | `✨ Upload your menu` | ✅ |

`/signup` links on the rendered page: **0**. Page errors and console errors: **none**.

### Compared field by field against the landing's modal

Same modal opened from `/landing` and diffed on every captured field — heading, first 320 characters of
body copy, button list, file input, textarea, disabled state, card width, portal parent:

**`IDENTICAL on every field captured.`** Card width 448px both; portal parent `BODY` both; buttons
`["×", "See sample menu", "Build my demo →"]` both.

### Behaviour, not just presence

| | `/compare` | `/landing` |
|---|---|---|
| `Build my demo →` disabled before typing | `true` | `true` |
| …after typing menu text | `false` | `false` |
| Escape closes the modal | `true` | `true` |
| Page errors | none | none |

### Rendering, at two widths

| | 1280px | 375px |
|---|---|---|
| nav CTA text | `Upload my menu →` (177×48) | **`Upload menu`** (125×48) — the short label swaps in correctly |
| nav height | 72px, unchanged | 72px, unchanged |
| hero CTA | orange `rgb(239,139,44)` on white, 310×88 | 299×88 |
| footer CTA | orange on white, 672×56 | 335×56 |
| horizontal page scroll | none | none |

🟢 **The white-on-white failure mode did not recur.** `CostComparison.tsx:43-51` records that a previous
attempt at this conversion lost the background because it lived in a `style` prop, which `DemoCta` does
not forward. `CTA_PRIMARY` carries its colour in a literal class (`bg-[#EF8B2C]`), so it survived — and
the computed background was measured on all three, not assumed.

### 🔴 The one difference found — and fixed

**Converting `<a href>` to `<button>` silently dropped the pointer cursor.** Measured immediately after
the conversion: both converted CTAs computed `cursor: default`, while the nav's CTA computed `pointer`
(landing.css `.btn` sets it explicitly). An `<a href>` gets `pointer` from the UA stylesheet; a `<button>`
does not, and Tailwind's preflight leaves it at `default`. That is a hover affordance lost on the page's
two primary actions — invisible in a screenshot, and exactly the kind of thing this conversion was likely
to cost.

**Fixed** by adding `cursor-pointer` to `CTA_BASE` (`CostComparison.tsx:52-59`), which also covers the
still-`<a>` outline CTA so the two cannot drift apart. **Re-measured: all three now compute
`cursor: pointer` at both widths.**

**No other difference was found between the two pages.**

---

## 7. Protected things — untouched

| | Status |
|---|---|
| `'Online ordering — Pay at Hatch'` (the em-dash join key) | 🟢 untouched |
| The bare `'—'` not-included cell value | 🟢 untouched |
| The Pizzeria Gusto testimonial | 🟢 untouched |
| `lib/pricing.ts` — the price mask set | 🟢 untouched |
| `lib/features.ts` | 🟢 untouched — imported by `CostComparison.tsx` for `PLAN_MONTHLY_PENCE`, not modified |
| `app/landing/layout.tsx` | 🟢 untouched |
| `/signup`, `/setup` and their API routes | 🟢 untouched — item 4 |
| `components/landing/DemoUpload.tsx`, `LandingNav.tsx`, `app/landing/page.tsx` | 🟢 untouched — the landing page renders unchanged, verified in the browser |

`git diff --stat` for this task: **`app/compare/page.tsx` and `app/compare/CostComparison.tsx` only.**
(The stat also lists `app/landing/*` and `lib/plan-features.ts` — those are the earlier uncommitted work
from this session, not this task.)

---

## What is still open

1. 🔴 **The verification email still lands a truckless operator on `/setup`** (item 3). It is the last
   session-free route into the broken flow, and this change does not close it.
2. 🔴 **Anyone already stuck is still stuck** (item 4). Unknown population; one query would size it.
3. ⚠️ **The hero CTA now wraps to two lines** (item 2). One word from you makes it one line.
4. ⚠️ **`/signup` and `/setup` still answer a typed URL with 200.** Deliberate — you said not to delete
   them — and worth a decision separately from this one.

**Nothing committed. Nothing deployed.**
