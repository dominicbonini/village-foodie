# Landing — WhatsApp → coming soon: report

**Restore notes written FIRST, before any edit:** `docs/landing-copy-restore-notes.md`.
**Nothing committed. Nothing deployed. No migration, no SQL.**

---

## WHAT I DID AND DID NOT DO

| Item | Status |
|---|---|
| **Restore notes** | ✅ **Written before anything was touched** — `docs/landing-copy-restore-notes.md` |
| **1(a)** table row → coming soon | 🔴 **STOPPED — the instruction is contradictory. Not applied.** |
| **1(b)** key-features rewrite | ⏸️ **Wording proposed below, NOT applied** (you asked to approve it first, and applying it while 1(a) is blocked would make the page contradict itself) |
| **Mid-turn: pricing reorder** | ✅ **APPLIED** — the one source edit in this task |
| **2** parity checker | ✅ Reported below |
| **3** protected strings | ✅ **None touched** — proven by diff |
| **4** full WhatsApp surface | ✅ Enumerated below, **nothing changed** |
| **5** Android / App Store link | ✅ **Untouched** |

**Total source diff: `app/landing/page.tsx`, 1 insertion, 1 deletion.** `lib/plan-features.ts` is
unmodified.

---

## VERIFICATION

- **Sanity checks only:** `npx tsc --noEmit` exit 0; `eslint app/landing/page.tsx` **0 problems**.
  🔴 **NEITHER IS VERIFICATION.** I have not rendered the landing page, in a browser or otherwise.
- **Executed:** `sed`/`grep` extraction and a `git diff` scoped to the two files.

**No span of the prompt arrived garbled.**

---

# 🔴 1(a) — STOPPED. The instruction is contradictory.

**The comparison table's WhatsApp row is not on the landing page. It is in a shared module, and
changing it changes the operator's Billing tab too — which item 4 forbids.**

**The row (`lib/plan-features.ts:212`):**

```ts
{ name: 'WhatsApp auto-replies', footnote: '4', detail: '…', starter: false, pro: true, max: true },
```

**`FEATURE_SECTIONS` — the array that row lives in — is imported by four surfaces:**

```
app/landing/page.tsx            ← the landing comparison table   (in scope)
app/manage/[token]/page.tsx     ← the operator's BILLING tab     (item 4 says: report, do not change)
app/admin/page.tsx              ← admin                          (item 4 says: report, do not change)
app/landing/cost/CostComparison.tsx
```

**Item 1(a) says:** *change the table row, using the existing `coming_soon` mechanism, **do not invent a
new one***.
**Item 4 says:** *change nothing outside the landing page.*

> 🔴 **BOTH CANNOT HOLD.** The existing mechanism is a **single shared source**, deliberately — the
> parity checker exists precisely so the marketing list and the gate cannot drift. **There is no
> landing-only way to flip that row**, and building one would be inventing the new mechanism 1(a)
> forbids **and** re-creating the drift the architecture prevents.

**So I stopped rather than choosing.** The three ways forward, for your decision:

| Option | Effect |
|---|---|
| **A — accept the spread** | Change `:212` to `pro: 'coming_soon', max: 'coming_soon'`. **The Billing tab and admin change too.** One edit, three surfaces, all consistent. |
| **B — landing-only override** | Add a landing-side exception. 🔴 **I do not recommend it** — it is the new mechanism you forbade, and it reintroduces exactly the drift the checker guards. |
| **C — leave the table, change only the prose** | The table keeps saying ✓ while the copy says coming soon. **The page argues with itself** — the file's own comment at `:349-353` records this exact failure happening before. |

⚠️ **A fact that bears on the decision, which I did not expect to find:**
**`app/manage/[token]/page.tsx:8378` — `const WHATSAPP_LIVE: boolean = false`.** The operator's own
Settings card **already** presents WhatsApp as coming-soon and hides the Connect control. The file says
so at `:9631`: *"That module's WhatsApp row reads `pro: true, max: true` because the feature IS shipped
at the plan level"*.

🔴 **So the product already disagrees with itself today: the plan matrix advertises WhatsApp as
included on all three surfaces, while the control an operator would use is switched off.** **Option A
would close that gap rather than widen it** — which is an argument for accepting the spread rather than
avoiding it.

---

# ⏸️ 1(b) — proposed wording, for your approval. NOT applied.

**Current (`app/landing/page.tsx:179`):**

> **Social media auto-replies**
> “Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re driving to
> the pitch or at the grill. Messenger and Instagram coming soon.

**Proposed:**

> **Social media auto-replies**
> “Where are you tonight?” “Do you do gluten free?” The questions that arrive while you’re driving to
> the pitch or standing at the grill — answered for you, from your menu and your schedule. **WhatsApp,
> Messenger and Instagram coming soon.**

**Why this shape:** it keeps the two real customer questions (the concrete part that makes the benefit
land), keeps the two moments an operator genuinely cannot reply — **which the file's comment at `:170`
says is the whole point of the feature** — and moves all three channels into one honest "coming soon"
instead of splitting the tense.

⚠️ **Alternative if you want it shorter:**

> “Where are you tonight?” “Do you do gluten free?” The questions that arrive mid-service, answered for
> you from your menu and schedule. **WhatsApp, Messenger and Instagram coming soon.**

### 🔴 Applying 1(b) requires a second edit you have not asked for

`app/landing/page.tsx:174-178` is a standing editorial rule that **forbids this exact change**:

> 🔴 THE MIXED TENSES ARE DELIBERATE. WhatsApp is PRESENT tense because it ships at launch; Messenger
> and Instagram carry "coming soon" because they may not. … It is NOT an inconsistency; **do not
> "harmonise" the tenses.**

**You are the author of that rule and may reverse it — but the comment must be rewritten in the same
edit or the file will instruct the next reader to undo the change.** Recorded in the restore notes §2.

---

# 2 · The parity checker

**`findPlanParityViolations()` would still pass. That says less than it appears to, in three separate
ways.**

```ts
if (row[tier] === true && !canAccess(tier, feature)) { out.push(...) }
```

1. 🔴 **It only inspects cells that are literally `true`.** Flipping the row to `'coming_soon'` means
   the cell **is no longer inspected at all**. The check passes **vacuously** — it stops looking rather
   than confirming anything.
2. 🔴 **The GATE would be unchanged.** `whatsapp_replies` stays in `PRO_FEATURES`
   (`lib/features.ts:51`), so `canAccess('pro','whatsapp_replies')` remains **true**. **The table would
   advertise "coming soon" for a feature the product still grants.** The checker cannot see this — it
   only catches the opposite direction (advertised-but-blocked).
3. ⚠️ **It is EXPLICIT, not scraped.** `ROW_FEATURE_MAP` is hand-maintained; the file's own comment at
   `:401` says a row with no entry is skipped. **The map does have an entry for this row, so it is in
   scope — but only because someone remembered.**

⚠️ **And it fails open in production:** dev throws, production `console.error`s only. **A violation on a
live page is a log line nobody reads.**

### Does moving the row change what any tier is advertised as including?

**Yes, on all three surfaces:**

| Tier | Today | After option A |
|---|---|---|
| Starter/Free | — (not included) | — **unchanged** |
| **Pro** | **✓ included** | **"Coming soon"** |
| **Max** | **✓ included** | **"Coming soon"** |

🔴 **Pro and Max would no longer advertise WhatsApp auto-replies as an included feature — on the
landing page, in the operator's Billing tab, and in admin.** ⚠️ **That is a commercial change, not a
copy change: it removes a listed feature from two paid tiers.**

---

# 3 · The three protected strings — untouched, and proven

**`git diff` on both files contains none of them.**

| String | Location | Status |
|---|---|---|
| `Online ordering — Pay at Hatch` | `lib/plan-features.ts:185`, `:383`, `app/landing/page.tsx:64` | ✅ **Untouched.** 🔴 **Three occurrences joined by exact match** — noted in the restore notes |
| The bare `—` cell value | `app/landing/page.tsx:96` (`<span className="no">—</span>`) | ✅ **Untouched** |
| The testimonial | `app/landing/page.tsx` | ✅ **Untouched, and not reproduced anywhere** |

**No requested change needed to touch any of them**, so the stop condition in item 3 did not arise.

---

# 4 · Every place WhatsApp auto-replies are presented as available

**Nothing below was changed.**

### Marketing / plan presentation

| # | Location | What it says |
|---|---|---|
| 1 | 🔴 `lib/plan-features.ts:212` | The matrix row — `pro: true, max: true`. **Renders on landing, Billing AND admin** |
| 2 | `app/landing/page.tsx:179` | The key-features block (1(b)) |
| 3 | `app/landing/page.tsx:332` | Pro card bullet: *"WhatsApp auto-replies (Messenger & Instagram coming soon)"* ⚠️ **NOT in your list. Presents WhatsApp as included. Hand-written — the file notes at `:352` that "nothing checks it"** |
| 4 | `lib/plan-features.ts:209-211` | The comment asserting *"WhatsApp is LIVE"* |
| 5 | `lib/plan-features.ts:353` | Footnote 4 — describes auto-replies as operating |

### The gate — says it is available

| # | Location | What it does |
|---|---|---|
| 6 | `lib/features.ts:51` | `whatsapp_replies` in `PRO_FEATURES` — **Pro and Max are granted it** |
| 7 | `lib/plan-features.ts:396` | `ROW_FEATURE_MAP` join |

### The product — says it is NOT available

| # | Location | What it does |
|---|---|---|
| 8 | 🔴 `app/manage/[token]/page.tsx:8378` | **`WHATSAPP_LIVE = false`** |
| 9 | `app/manage/[token]/page.tsx:9643` | Connect control gated on `WHATSAPP_LIVE && can(...)` — **hidden today** |
| 10 | `app/manage/[token]/page.tsx:8451` | *"WhatsApp is coming-soon behind WHATSAPP_LIVE"* |

### Live runtime paths

| # | Location |
|---|---|
| 11 | `app/api/webhooks/whatsapp/route.ts:55` — gated on `canAccess(...'whatsapp_replies')` |
| 12 | `app/api/webhooks/meta/whatsapp/route.ts:250` — same |
| 13 | `app/api/manage/whatsapp-preview/route.ts` — the preview |

⚠️ **I did NOT find WhatsApp auto-replies described as available in onboarding, emails or
`content/legal/*`.** 🔴 **An empty grep is not proof of absence** — I searched `app/`, `lib/`,
`components/` and `content/` for "whatsapp" case-insensitively and read every hit that was not an
import or a log line.

🔴 **THE FULL SURFACE IN ONE SENTENCE: five marketing surfaces say it is included, two gate entries
grant it, three product locations say it is coming soon, and three webhook paths would serve it if a
message arrived.**

---

# 5 · Android and the App Store — untouched

✅ **No Android string, config or build file was read or changed.**
✅ **No App Store link was added anywhere.**
**Neither appears in the diff.**

---

# ✅ The mid-turn request — applied

**"In the pricing section, move Offline order protection to the second bullet, just below *Everything in
Free, plus*."**

**Applied to the Pro card, `app/landing/page.tsx:326-333`. BEFORE and AFTER are both recorded verbatim
in the restore notes §3b.**

```
  <li className="lead">Everything in Free, plus</li>
+ <li>Offline order protection</li>
  <li>Take payment online</li>
  …
- <li>Offline order protection</li>
  <li>Take payment on your phone …</li>
```

- **A pure reorder** — same eight `<li>` elements, no text, entity, class or indentation changed.
- **Landing-only.** These bullets are hand-written JSX, **not** sourced from `lib/plan-features.ts`, so
  **Billing and admin are unaffected** and the parity checker does not read them.
- **The Max card is untouched** — it has no "Offline order protection" bullet of its own; it inherits
  via *"Everything in Pro, plus"*.
- ⚠️ **Line numbers below `:326` shifted by one.** The WhatsApp bullet formerly at `:331` is now `:332`;
  the restore notes record this.

---

## What I could not establish

1. **Whether the page renders correctly after the reorder.** **Not opened in a browser.** tsc and
   eslint are sanity checks.
2. **Whether removing WhatsApp from Pro/Max is commercially acceptable** — a business decision, not
   something the repository can answer.
3. **Whether any operator is currently using WhatsApp auto-replies.** `WHATSAPP_LIVE = false` suggests
   the connect flow is off, **but the webhook paths are live and gated only on plan** — so a truck
   already connected by another route would still be served. **I did not query production.**
4. **Whether the wording in 1(b) is right.** **That is yours to approve; it is why I did not apply it.**
