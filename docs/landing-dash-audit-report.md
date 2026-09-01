# Dash audit — the marketing surface

**Date:** 29 August 2026
**READ-ONLY.** No file was changed and no edit is proposed. Every claim is marked READ, INFERRED or UNKNOWN.

---

## 0. 🔴 What the browser actually renders at hatchgrab.com — and it is not the landing page

**READ, and this changes the framing of the whole audit.**

```
proxy.ts:438-439   if (pathname === '/' && isHatchGrab(host)) → rewrite to /landing
proxy.ts:424       /landing → 308 to / → rewritten back to /landing
app/landing/layout.tsx:44-46
                   if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) redirect('/contact')
```

🔴 **IN PRODUCTION A NON-ADMIN AT `hatchgrab.com` RENDERS `/contact`.** The landing is admin-only until
two non-code conditions are met (testimonial permission, real screenshots). **So the public marketing
surface today is `/contact`, and the landing page is an embargoed surface that will become public.**

I audited both, and separate them throughout.

### The routes and components that actually compose each

| Surface | Composed of (READ, from imports) |
|---|---|
| **Public today** — `/contact` | `app/contact/page.tsx` → `HatchGrabContact.tsx`, `ContactForm.tsx`, `components/shared/BrandHomeLink.tsx` |
| **Embargoed** — `/` → `/landing` | `app/landing/page.tsx` → `components/landing/{LandingNav,LandingFooter,DemoUpload}.tsx`, `app/landing/landing.css` |
| **Embargoed** — `/landing/cost` | `app/landing/cost/page.tsx` → `CostComparison.tsx` (inherits the same gate) |
| **Shared data rendered into the landing** | `lib/plan-features.ts` (FEATURE_SECTIONS, PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_ALLOWANCES, FOOTNOTES, TRANSACTION_ROWS), `lib/features.ts` (PLAN_META) |

⚠️ **The footer links to `/privacy` and `/terms`** (`LandingFooter.tsx:39-40`). **I did not audit the legal
pages** — they are linked-from, not composed-into, the marketing pages. **UNKNOWN: their dash usage.**

### Method

🔴 **These files are roughly two-thirds comment, so a raw `grep` is not the answer.** A raw count over
the twelve files gives **377 em dashes**; the true rendered figure is **50**. I parsed each file with
**TypeScript's own tokenizer** (`ts.createSourceFile`) and collected only `StringLiteral`,
`NoSubstitutionTemplateLiteral`, template spans and non-whitespace `JsxText` nodes. **Comments are
excluded by construction, not by regex.** Markdown was scanned with fences and horizontal rules
separated out.

---

## 1 & 2. Every dash in the rendered surface, with classification

### Totals (READ, exact — not estimated)

| Surface | EM (U+2014) | EN (U+2013) | double-hyphen |
|---|---|---|---|
| `app/landing/page.tsx` | **18** | 0 | 11 *(all CSS vars)* |
| `components/landing/DemoUpload.tsx` | **8** | 0 | 11 *(all CSS vars)* |
| `app/landing/cost/CostComparison.tsx` | **6** | 0 | 0 |
| `app/landing/cost/page.tsx` | 0 | 0 | 3 *(all CSS vars)* |
| `lib/plan-features.ts` | **13** | 0 | 0 |
| `lib/features.ts` | **3** | 0 | 0 |
| `app/contact/HatchGrabContact.tsx` | 0 | 0 | 3 *(all CSS vars)* |
| `components/landing/LandingNav.tsx` | **0** | 0 | 0 |
| `components/landing/LandingFooter.tsx` | **0** | 0 | 0 |
| `app/contact/page.tsx` | **0** | 0 | 0 |
| `app/contact/ContactForm.tsx` | **0** | 0 | 0 |
| **TOTAL** | **48** | **0** | **28** |

🔴 **ZERO EN DASHES ANYWHERE IN THE RENDERED SURFACE.**
🔴 **ALL 28 DOUBLE-HYPHENS ARE CSS CUSTOM PROPERTIES** — `--font-archivo`, `var(--orange)`,
`var(--head, #16314F)`, `bg-[var(--orange-deep)]`. **Not one is prose.** They are RANGE/OTHER and are
excluded from everything below.

✅ **The actually-public surface — `/contact` — contains no prose dash at all.**

### `app/landing/page.tsx` — 18 em dashes

| line | Class | Source | Sentence |
|---|---|---|---|
| 42 | STRUCTURAL | hand-written (metadata `title`) | `HatchGrab — The ordering system built for food trucks` |
| 64 | **RANGE/OTHER** | 🔴 **SHARED — a join key, not copy** | `if (row.name === 'Online ordering — Pay at Hatch') return true` |
| 96 | **RANGE/OTHER** | hand-written | the `—` glyph in a table cell meaning "not included" (`<span className="no">—</span>`) |
| 133 | RHETORICAL | hand-written | `No signup, no account — just a working demo with your truck's food in it.` |
| 141 | STRUCTURAL | hand-written | `Kitchen screen — tickets in cook order` |
| 142 | STRUCTURAL | hand-written | `Orders dashboard — realistic orders, capacity strip visible` |
| 167 | STRUCTURAL | hand-written | `Set your kitchen's capacity — how much you can cook at once, and how long it takes. Once a collection time is full, customers can't pick it.` |
| 168 | RHETORICAL | hand-written | `Runs on the phone in your apron, the tablet on the counter, the laptop in the van — and the card machine you already take payment on.` |
| 169 | RHETORICAL | hand-written | `We read your schedule straight from your website — or send the photo you already post to Facebook. You just review and confirm.` |
| 192 | RHETORICAL | hand-written | `Three things to sort — and two of them just need a photo.` |
| 194 | **RUN-ON** | hand-written | `Photograph your board or paste it in. Items, prices and extras all come across on their own — you just check they're right.` |
| 214 | RHETORICAL | 🔴 **A REAL CUSTOMER'S WORDS** | `…how many pizzas we have left to sell — and the time slots are fantastic for busy villages.` |
| 255 | STRUCTURAL | hand-written | `Name, time, what they want, and anything they've asked for — on your kitchen screen before they arrive. No note gets missed…` |
| 288 | **RUN-ON** | hand-written | `…Walk-ups carry no HatchGrab platform fee on any plan — your card terminal's own fees still apply.` |
| 292 | RHETORICAL | hand-written | `Your first month is completely free — every feature unlocked.` |
| 293 | **RUN-ON** | hand-written | `…Add online card payments any time — adding online payments doesn't start your subscription.` |
| 379 | RHETORICAL | hand-written | `Your free month includes everything — try the lot before you pick.` |
| 465 | STRUCTURAL | hand-written | `…a working ordering page for you to have a play around with in under 60 seconds — your items, your prices. No sign-up, no card, nothing to install…` |

### `components/landing/DemoUpload.tsx` — 8 em dashes

| line | Class | Source | Sentence |
|---|---|---|---|
| 251, 253 | RHETORICAL | hand-written (error string, ×2) | `Couldn't send that — try again.` |
| 295 (×2) | STRUCTURAL (parenthetical pair) | hand-written | `…builds you a working ordering page — your items, your prices — in under 60 seconds. No sign-up, no card.` |
| 328 | RHETORICAL | hand-written | `This is taking longer than usual — big menus sometimes do.` |
| 338, 384 | STRUCTURAL | hand-written (×2, identical) | `— it's a stand-in so you can see how it works.` |
| 396 | RHETORICAL | hand-written | `✓ Thanks — we've got it. We'll email you.` |
| 434 | RHETORICAL | hand-written | `Look round with a sample truck instead — you can upload yours any time.` |
| 454 | RHETORICAL | hand-written | `Nothing is published — only you can see it.` |

### `app/landing/cost/CostComparison.tsx` — 6 em dashes

| line | Class | Source | Sentence |
|---|---|---|---|
| 395 | **RUN-ON** | hand-written | `Pro does not include separate logins — everyone shares one account.` |
| 456 | STRUCTURAL | hand-written | `Only orders placed through your ordering page — not cash or card at the window.` |
| 466 | RANGE/OTHER | hand-written | `% —` (a table cell fragment) |
| 470 | STRUCTURAL | hand-written | `of online orders included — nothing on top of the plan.` |
| 588 | STRUCTURAL | hand-written | `Your introductory offer — how many months free?` |
| 908 | **RUN-ON** | hand-written | `The all-in figure in question 4 includes it — the comparison does not, on either side.` |

### Class totals across prose dashes (excluding CSS vars)

| Class | Count |
|---|---|
| RHETORICAL | 15 |
| STRUCTURAL | 17 |
| RUN-ON | **6** |
| RANGE/OTHER (glyph cells, join key) | 4 |
| *shared-module strings — classified in §3* | 16 |

---

## 3. 🔴 Which strings you cannot edit without changing product UI

### The 16 dashes in shared modules render in **three surfaces**, not one

**READ — every importer of `lib/plan-features.ts`:**

```
app/landing/page.tsx:31              the public comparison table
app/landing/cost/CostComparison.tsx:36
app/admin/page.tsx:10                Admin → Features tab
app/manage/[token]/page.tsx:36       Manage → Billing tab (every operator)
components/manage/PaymentsTab.tsx:35 (fee labels only)
```

**So every string below renders on the landing, in Admin, AND in every operator's Billing tab.**

| file:line | String | Also renders in |
|---|---|---|
| `lib/plan-features.ts:180` | `We fill your schedule automatically — from your website, or a photo you already post to Facebook…` | landing table · Admin · Manage→Billing |
| `:183` | `Mark any item sold out in one tap — it greys out for customers straight away.` | same three |
| `:185` | 🔴 `Online ordering — Pay at Hatch` | **see the join-key warning below** |
| `:202` | `If your internet drops mid-service, orders are held safely and sync when you're back — you never lose one.` | same three |
| `:207` | `Online orders are accepted automatically — no need to confirm each one.` | same three |
| `:238` (×2) | `Run several screens — front counter and kitchen — all showing the same live orders.` | same three |
| `:296` | `Reward repeat customers with digital stamp cards — collected and redeemed automatically.` | same three |
| `:322` | `…Card payments through HatchGrab via Stripe are coming soon — Stripe's own charge…` | FOOTNOTES → same three **+ `PaymentsTab`** |
| `:353` | `…Replies are AI-generated and can occasionally be wrong — you can view every message and reply yourself at any time.` | same three |
| `lib/features.ts:194` | `All features included — Max tier + Pay at Hatch ordering` | PLAN_META.trial.description → landing, Admin, Manage, **FeatureGate** |
| `:195` | `Pre-launch tester — full feature access, lifetime discount` | same |
| `:196` | `Prospect sandbox — full trial before signup (never public)` | same |

⚠️ **Two are NOT UI at all and should not be counted as copy:**
- `lib/plan-features.ts:169` — the bare `'—'` is the **Starter cell value** for "Online orders included".
- `lib/plan-features.ts:436` — the **parity checker's error message**, printed to a console, never rendered.

### 🔴 THE ONE STRING WHOSE DASH IS LOAD-BEARING IN CODE

**`'Online ordering — Pay at Hatch'` — its em dash is a JOIN KEY in four places (READ):**

```
lib/plan-features.ts:383      ROW_FEATURE_MAP['Online ordering — Pay at Hatch'] = 'online_ordering_pay_at_hatch'
app/landing/page.tsx:64       if (row.name === 'Online ordering — Pay at Hatch') return true
app/admin/page.tsx:909        const isPayAtHatch = row.name === 'Online ordering — Pay at Hatch'
app/manage/[token]/page.tsx:11314   ? (row.name === 'Online ordering — Pay at Hatch' ? true : row.max)
```

🔴 **CHANGING THAT EM DASH — even to a hyphen — SILENTLY BREAKS ALL FOUR.** `FeatureRow` has no `id`;
the manual records the label as both identifier and map key. The parity checker would stop inspecting
the row (`if (!feature) continue`) and **report clean**, and the trial column would flip on all three
render surfaces. **This is the single highest-risk string in the audit.**

### And one more coupling

**`lib/pricing.ts:15` — `NON_SECRET_PRICE = new Set([… , '—'])`.** The bare em dash at
`plan-features.ts:169` is exempted from the pre-launch price mask **by exact string match**. Change
either and the Starter cell renders **`TBC`** instead of `—`.

---

## 4. Does any test or guard assert on the exact text?

**Partly — and not in the way a test would.**

- 🔴 **`findPlanParityViolations()` asserts on exact text INDIRECTLY**, via `ROW_FEATURE_MAP[row.name]`
  (`lib/plan-features.ts:418`). **It does not compare strings for equality; it uses one as a lookup key**,
  which fails *open* — a renamed row is skipped, not flagged. **That is worse than an assertion**, because
  the check goes green.
- 🔴 **`lib/pricing.ts:15`** matches `'—'` by set membership (§3).
- 🔴 **Three render-time equality tests** on `'Online ordering — Pay at Hatch'` (§3).
- ✅ **`isRowComingSoon()`** (`app/manage/[token]/page.tsx:8382`) matches on row name, but is only ever
  called with `'Messenger & Instagram auto-replies'` — **no dash, unaffected.**
- ✅ **No unit test, snapshot test or CI assertion exists on any of this text.** **READ: the repository
  has no test runner** — `package.json` scripts are `dev`, `build`, `start`, `lint` only.

---

## 5. `scripts/check-plain-english.mjs`

**READ — what it checks.** It holds an **explicit, hand-maintained corpus** of operator-facing strings
(`CORPUS`, 112 entries) and searches each for a list of **27 banned technical words** — `code`, `embed`,
`domain`, `dns`, `cname`, `url`, `api`, `certificate`, `apex` and so on. Four `EXCLUSIONS` (example
addresses, "QR code", quoted platform labels) are applied and **every exclusion is printed** so the
exception stays auditable. A `KNOWN` list reports genuine violations without failing the exit code.

**🔴 IT HAS NO DASH RULE OF ANY KIND.** The only `—` occurrences in the file are in its own comments and
in corpus strings it passes.

**🔴 IT DOES NOT RUN IN CI OR ANY HOOK.** READ:
- `package.json` scripts: `dev`, `build`, `start`, `lint` — **it is not among them.**
- **No `.husky` directory and no active `.git/hooks`** (samples only).
- `.github/workflows/` contains three scraper workflows; **none references it.**

**🔴 AND ITS CORPUS CONTAINS ZERO LANDING-PAGE STRINGS.** It covers the custom-domain wizard and the QR
settings card. **INFERRED: none of the 48 dashes in this audit is currently checked by anything.**

---

## 6. Does the working tree change any of this copy?

⚠️ **I compared the tree against `HEAD`, not against the deploy.** **UNKNOWN — what is actually deployed
to Vercel;** I did not query it. The last commit is `1d85241` (25 August) and the tree has been dirty
since. **Everything below is tree-vs-HEAD.**

**Rendered-string dash counts for `app/landing/page.tsx`:**

```
HEAD          17 em + 11 double-hyphen
working tree  18 em + 11 double-hyphen
```

**Exactly one rendered dash differs — the testimonial (line 214):**

```diff
- <blockquote>Took orders all night and didn’t miss one. First Saturday in years I’ve not had a
-   queue out the door.</blockquote>                                          ← HEAD, NO dash

+ <blockquote>{"HatchGrab has made ordering so much easier. Everything's organised, we can track
+   stock and know exactly how many pizzas we have left to sell — and the time slots are
+   fantastic for busy villages."}</blockquote>                               ← tree, ONE em dash
```

🔴 **THAT EM DASH IS INSIDE A REAL CUSTOMER'S QUOTED WORDS.** The manual and the file's own comment
record it as unedited operator speech. **It is the one dash in this audit that must not be changed on
style grounds.**

**Everything else is comment-only:**

```
components/landing/DemoUpload.tsx      UNCHANGED vs HEAD
components/landing/LandingNav.tsx      UNCHANGED vs HEAD
components/landing/LandingFooter.tsx   UNCHANGED vs HEAD
app/landing/cost/CostComparison.tsx    UNCHANGED vs HEAD
app/contact/page.tsx                   UNCHANGED vs HEAD
lib/plan-features.ts / lib/features.ts MODIFIED — but every dash-bearing diff line is a comment
```

---

## 7. `content/store-listing.md`

**READ — 15 dashes: 7 em (U+2014), 0 en, 8 double-hyphen.**

🔴 **NONE OF THEM IS IN THE COPY THAT SHIPS.**

- **All 8 double-hyphens are `---` markdown horizontal rules** (lines 10, 18, 28, 38, 84, 95, 109, 120)
  — document structure.
- **5 of the 7 em dashes are in `##` headings** — `# Store listing copy — single source`,
  `## Short description — Play Store (80 characters max)`, `## Subtitle — App Store (30 characters max)`,
  `## Full description — Play Store…`, `## Full description — App Store…`. **Headings are the file's own
  scaffolding and are not submitted.**
- **The remaining 2 are in the changelog** (lines 124-125): *"**26 August 2026** — created…"* and
  *"App Store copy not yet reconciled with what was submitted to Apple —"*. **Internal record-keeping.**

✅ **The Play Store short description, full description and App Store copy — the text that goes to Google
and Apple — contain no em dash, no en dash and no double-hyphen.** I extracted the fenced copy blocks
and scanned them separately to confirm this.

⚠️ **`content/store-listing.md` is UNTRACKED** (`git ls-files` returns nothing), so **none of it has ever
been committed or deployed** — item 6 does not apply to it.

---

## 8. What I could not establish

1. **UNKNOWN — what is deployed at hatchgrab.com right now.** All of §6 is tree-vs-`HEAD`.
2. **UNKNOWN — dash usage on `/privacy` and `/terms`**, which the footer links to. Out of the composed
   surface; not audited.
3. **UNKNOWN — whether the App Store copy in `store-listing.md` matches what was actually submitted.**
   The file's own changelog says it is *"not yet reconciled with what was submitted to Apple"*.
4. **NOT OBSERVED — no page was rendered in a browser for this audit.** The composition was derived from
   `proxy.ts`, the layout gate and the import graph; the dash inventory from the TypeScript AST.
   **INFERRED, not observed: that every string node I counted actually reaches the screen** — a string in
   an unreachable branch would still be counted.
5. **UNKNOWN — whether `DETAIL_OVERRIDES`** (`app/landing/page.tsx:85`) suppresses any shared dashed
   `detail` on the landing specifically. It carries one entry, for `Offline Order Protection`, which
   **is** one of the dashed shared strings (`plan-features.ts:202`) — **INFERRED: the landing renders the
   override, and Admin/Manage render the original**, so that one string's landing text may differ from
   the other two surfaces. I did not verify the override's own text for dashes.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** One framing note
rather than a contradiction: the brief says to work from what the browser renders at hatchgrab.com, and
what it renders for the public is `/contact` — so I audited the embargoed landing as well, and labelled
which is which throughout.
