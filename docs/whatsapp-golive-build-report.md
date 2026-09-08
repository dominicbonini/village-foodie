# WhatsApp go-live — build report

**4 September 2026. Built on the working tree. NOTHING committed, staged, pushed, deployed or cap-synced. Native binary untouched. `git add -A` / `git add .` were never run.**

**Method per item:** 🔎 **SOURCE-READ** = I read/edited the code and quote it. 🧪 **BEHAVIOUR-VERIFIED** = observed executing. The only things I executed are `tsc` and the parity probes (Node, throwaway copies). **I rendered nothing in a browser** — every UI claim below is source-read, and Part 3 is yours to confirm on screen.

---

# PART 0 — the contradiction, settled

## 🔴 FIRST LINE: **the reply preview does NOT render on native.** On iPad and Android the entire auto-replies card — title, description, preview and Connect row — does not exist.

**B2 of the decision report was right. B5 (:261) was wrong, and so was what I told you in chat earlier.** I am not preserving the wrong version as a caveat: the preview is inside the native hide, full stop.

🔎 Source-read. The nesting, with both wrapper boundaries and the closing tags (`app/manage/[token]/page.tsx`):

```jsx
9642:      {!isNativeApp() && (                       ← OUTER wrapper OPENS
9643:      <Card className="p-4 space-y-3">
                 … title, "Coming soon" badge, description …
9719:        <WhatsAppReplyPreview token={token} />    ← THE PREVIEW — inside the outer wrapper
9721:        {!isNativeApp() && (<>                    ← INNER wrapper OPENS (Connect subsection)
                 … Channels heading, WhatsApp row, Messenger, Instagram …
9832:        </>)}                                     ← INNER wrapper CLOSES
9833:      </Card>
9834:      )}                                          ← OUTER wrapper CLOSES
```

The preview sits at **9719**, between the outer open (**9642**) and the outer close (**9834**). It is inside. The card's own comment says the same in words: *"on iPad the entire card disappears, and this line with it."*

**Consequence, applied in item 7:** a footnote pointing operators at the Settings preview would be **false for every iPad and Android operator reading the Billing tab**. My previously-proposed wording did exactly that. It is not used. Footnote 4's replacement references no preview.

---

# PART 1 — the change set

## 1. `WHATSAPP_LIVE` flipped 🔎
`app/manage/[token]/page.tsx:8444` — `const WHATSAPP_LIVE: boolean = false` → **`= true`**. The `: boolean` annotation was already there precisely so both branches stay type-checked; unchanged.

## 2. Both hard-coded "Coming soon" badges removed 🔎

- **Card-title badge** (was `:9660`) — removed the `<Badge label="Coming soon" colour="slate" />` from inside `<div className="flex items-center gap-2">`, leaving `<p className="text-base font-bold text-slate-800">Auto-replies</p>`. This is the one that mattered: it was gated by neither the flag nor `isRowComingSoon`, so the flip alone would have printed **"Auto-replies — Coming soon" directly above a working, editable Connect row.**
- **Channel-row badge in the else branch** (was `:9803`) — removed, as instructed. ⚠️ **Recorded consequence:** that badge lives in the `else` of `{WHATSAPP_LIVE && can('whatsapp_replies') ? … : …}`, so it only ever rendered while the flag was **false**. Removing it changed nothing on the live path. **If the flag is ever flipped back, that frozen row will show a disabled input with no "coming soon" label.** A comment now says so at the site.

🟢 **The Messenger and Instagram badges were NOT touched and did not need to be.** They render from `{isRowComingSoon(MESSENGER_INSTAGRAM_ROW) && …}` (`:9818` → badges at `:9822`/`:9826`), and `isRowComingSoon` reads `FEATURE_SECTIONS` — so they stay correct automatically while row `:284` remains `coming_soon`. I verified `isRowComingSoon` has exactly one call site.

## 3. The stale comment corrected 🔎

**OLD (verbatim, the load-bearing clauses):**
> `🔴 SHOWN AS COMING SOON AND GREYED, BY OPERATOR DECISION, 21 August 2026, PENDING META APPROVAL. Flip WHATSAPP_LIVE to true to restore the editable input and the Connect button…`
> `🔴 THIS STATE DELIBERATELY DOES **NOT** COME FROM lib/plan-features.ts, AND MUST NOT. That module's WhatsApp row reads pro: true, max: true because the feature IS shipped at Pro — it describes the PLAN TIER, not Meta's approval status. Setting it to 'coming_soon' there would rewrite the public landing pricing matrix and the Billing tab for customers, and would make findPlanParityViolations() SKIP the row… Two different facts; two different homes.`

**Every factual clause in that had stopped being true**: the row *was* `coming_soon` (moved deliberately — `plan-features.ts:272` records why and names this very flag), and it cited `:8378` for a const that had drifted to `:8444`.

**NEW (verbatim):**
> `🟢 LIVE SINCE 4 September 2026. WHATSAPP_LIVE is true (:8444), so the editable input and the Connect button render for any truck whose plan grants whatsapp_replies — which is Pro, Max AND trial/tester/demo, because TRIAL_FEATURES spreads MAX_FEATURES (lib/features.ts:51/55/72). Both live trucks are plan='trial', so both see this row.`
> `⚠️ THE ELSE BRANCH BELOW IS KEPT, not dead code: it is the presentation this row returns to if the flag is ever flipped back.`
> `🔴 THE PREVIOUS COMMENT HERE WAS STALE AND SAID THE OPPOSITE — CORRECTED 4 September 2026. [old text quoted in full] … The two files are now deliberately KEPT IN STEP — this flag and that row are two halves of one statement… If you flip one back, flip the other.`

## 4. `lib/meta/webhook-signature.ts` doc comment fixed 🔎
Line 120's `no_secret_configured → META_APP_SECRET is missing…` now names **`META_WHATSAPP_APP_SECRET`**, with a note that the caller reads `process.env.META_WHATSAPP_APP_SECRET` and uses **no fallback chain** (`webhooks/meta/whatsapp/route.ts:98-109`).

🟢 **Behaviour unchanged, and this is a property of the file, not a claim:** the edit is inside a `/** … */` block, and **this module reads no environment variable at all** — it receives the secret as an argument from the route. Nothing executable was touched. tsc clean.

## 5. The matrix row flipped 🔎
`lib/plan-features.ts` — `pro: 'coming_soon', max: 'coming_soon'` → **`pro: true, max: true`**. `starter: false` unchanged. **Row `:284` (Messenger & Instagram) untouched and still `coming_soon`** — verified by diff.

## 6. Row NOT renamed, and the probes 🔎 + 🧪

🟢 **The label is byte-identical.** `md5` of `name: 'WhatsApp auto-replies'` extracted from `HEAD` and from the working file: **`c3792e22…` both**. The `git diff` on that line shows only `footnote`, `pro` and `max` changed.

The checker (`plan-features.ts:604-619`) reads `ROW_FEATURE_MAP[row.name]` and **`if (!feature) continue`** — a missing entry is skipped in silence. It also runs at module load (`:624-633`): **throws in dev**, `console.error` in production.

🧪 **Probes — run on THROWAWAY COPIES in the scratchpad. Live files never touched.** (Copies made with the `@/lib/features` alias rewritten to a relative path; executed with `node --experimental-strip-types`, `NODE_ENV=production` so the module-load guard logs instead of throwing.)

| Probe | Expected in brief | **Observed** | Reading |
|---|---|---|---|
| **(a)** re-point the key at a Feature no tier grants | 1 violation | 🔴 **2 violations**, both naming the row: `"WhatsApp auto-replies" advertised for pro but canAccess('pro','__probe_ungranted__') is false` and the same for `max` | ✅ **The row IS inspected.** |
| **(b)** delete the map entry, leave the cells `true` | 0 violations | ✅ **0 violations** | ✅ The trap, reproduced: advertised, checked by nothing. |
| **real edited module** | — | ✅ **0 violations** | Passes — but see below. |

⚠️ **Probe (a) returned 2, not 1, and the arithmetic is the reason, not a fault.** The checker emits **one violation per offending tier**, and the row now has **two** `true` cells (`pro`, `max`). One `true` cell would give one violation. The probe's purpose — proving the row is looked at — is satisfied either way, and it is satisfied *because* (a) flagged it while (b) stayed silent.

⚠️ **I had to use a synthetic key.** I enumerated the `Feature` union (24 members) and tested each against `canAccess` for starter/pro/max: **every one is granted by at least one tier**, so no real ungranted Feature exists to point at. Probe (a) used `'__probe_ungranted__'`, which is exactly the condition the brief asked for.

🟢 **Why the real module passes honestly:** `whatsapp_replies` is in `PRO_FEATURES` (`features.ts:51`), spread into `MAX_FEATURES` (`:55`) and into `TRIAL_FEATURES` (`:72`). `pro: true, max: true` is precisely what the gate enforces, so the previously-recorded marketing-vs-gate gap is **closed**, not skipped.

## 7. Footnote 4 rewritten in place 🔎

**OLD:** `'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong — you can view every message and reply yourself at any time.'`

**NEW:** `'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong.'`

🟢 `number: '4'` unchanged; nothing inserted, moved or renumbered; `hide_pricing`'s `f.number !== '2'` mask untouched.
🟢 **No preview reference**, per Part 0 — it would be false for every iPad and Android operator.
🟢 **True for all four readers**, and it now serves the **Messenger & Instagram** row (unbuilt), so it claims nothing about delivery, charges or an inbox.

## 8. Can one row carry two footnotes? 🔎 **NO — one per row.**

`FeatureRow.footnote?: string` (`plan-features.ts:9`) — a single optional string. All six render sites emit it verbatim into a `<sup>`: landing `:463`/`:481`, admin `:968`/`:988`, PDF `:144`/`:153`. There is no array handling anywhere.

**Options, and what each costs:**

| | Option | Cost / risk |
|---|---|---|
| (a) | Widen to `string \| string[]` | Correct, but touches the type + **6 render sites across 4 files** for a copy change |
| (b) | Second field `footnote2?: string` | Same 6 sites, and invites a third |
| (c) | Fold charges into footnote 4 | 🔴 **Wrong** — 4 is shared with Messenger & Instagram, which is unbuilt and bills nothing; the sentence would be false there |
| (d) | **WhatsApp-specific footnote 6** carrying caveat **+** charges; row points at `'6'` | Zero type change, zero render change, never renumbers, charges appear only where they apply |
| (e) | String hack `footnote: '4,6'` | Renders "4,6" verbatim; no type change, but a comma doing structural work in a free-text field, undocumented |

🟢 **IMPLEMENTED: (d).** It respects the real one-per-row constraint instead of fighting it, keeps footnote 4 truthful for the row that still points at it, and puts the charges statement only on the row that incurs charges. **Nothing is lost from the WhatsApp row** — footnote 6 restates the auto-reply caveat in its own first two sentences.

## 9. The charges footnote 🔎

Appended as **`number: '6'`** (6 was free — the branded-QR footnote was removed at V6.5). **Appended, never inserted or reordered**; `hide_pricing`'s `'2'` mask untouched. No figure.

🟢 **Reach confirmed by source, all four surfaces:** `FOOTNOTES` is imported and its **full text** rendered by the landing (`page.tsx:29`, rendered `:496`), Manage → Billing (`page.tsx:36`), Admin (`page.tsx:10`, rendered `:1010`) and the PDF (`features-pdf/route.ts:26`, rendered `:167` — `FOOTNOTES.map(f => \`<p><sup>${f.number}</sup> ${f.text}</p>\`)`). The row's `<sup>6</sup>` renders at all six row-render sites. ⚠️ The landing's `FOOTNOTE_TEXT_OVERRIDES` contains only `'2'`, so 6 shows the shared text unmodified — which is why it is written for a prospect as well as an operator. ⚠️ The PDF renders footnotes **unmasked**, so treat it as published once sent.

## 10. The two welded landing strings split 🔎

**I counted every occurrence first.** `grep -n "WhatsApp" app/landing/page.tsx` returned **5 hits: 3 in comments (187, 188, 198) and exactly 2 renderable strings (200, 361)**. The comment at `:198` names the three surfaces of this one fact — *"this block, the matrix row in lib/plan-features.ts and the Pro-card bullet below"* — and the "Pro-card bullet" **is** `:361`. There is no fourth surface. **All three changed together in this build.**

🔴 **CORRECTED MID-BUILD, ON THE OPERATOR'S INSTRUCTION.** My first attempt split the *"what it does"* block into **two** `does-item` tiles — which added a **7th tile to a 6-tile grid** and gave an unbuilt stub the same visual weight as five shipped capabilities. **The previous landing setup had this right and I did not review it before changing it:** it carried WhatsApp in the present tense with *"Messenger and Instagram to follow."* **tagged onto the end of the same paragraph**. That shape is restored — **one tile, grid back to 6** (verified: `grep -c 'className="does-item"'` = **6**).

⚠️ **The Pro-card bullet is a different structure and correctly stays split.** That is a bullet *list*, and the file's own convention gives each coming-soon item its own `<li>` with a `soon-inline` span — `Android kitchen app` (`:350`) and `Take payment on your phone` (`:375`) both do exactly that. Two `<li>` there is consistent; two tiles in the grid was not.

🟢 **The tile was also MOVED TO 3rd IN THE GRID**, on instruction. Order is now: Kill the queue · Never promise a time you can't hit · **Social media auto-replies** · Works on any device · Never type your schedule twice · No signal? Keep serving. The two stale comment blocks that travelled with it were consolidated into one accurate note — the old text asserted *"app/manage/[token]/page.tsx:8378 sets `WHATSAPP_LIVE = false`"* and *"All three channels are future tense because none of the three is available"*, both now false.

## 10b. 🔴 THE COMPARE TABLE WAS ADVERTISING MESSENGER AND INSTAGRAM AS LIVE — a fourth surface, and not a string

**Caught by the operator, not by me.** After the row flip, the landing compare table and the PDF printed **one** row reading **"WhatsApp, Messenger & Instagram auto-replies" with a ✓ under Pro and Max** — advertising two verify-handshake stubs as shipped, on the public landing page *and* in the document sent to prospects.

🔎 The cause is in **`lib/landing-table.ts`**, a render-only override module used by **both** the landing (`page.tsx:39`, rendered `:488-495`) and the PDF (`features-pdf/route.ts:43`, rendered `:150-154`). It merged the two matrix rows for those two surfaces only:
- `NAME_OVERRIDES` renamed `'WhatsApp auto-replies'` → `'WhatsApp, Messenger & Instagram auto-replies'`
- `HIDDEN_ROWS` suppressed the separate `'Messenger & Instagram auto-replies'` row
- `DETAIL_OVERRIDES` described the merged row as *"…on WhatsApp, Messenger and Instagram."*

🔴 **The file's own guard named this exact failure and required the undo.** Verbatim: *"SAFE ONLY BECAUSE THE TWO ROWS CARRY IDENTICAL CELL VALUES (both starter:false, pro:'coming_soon', max:'coming_soon', both footnote 4). **IF THEY EVER DIVERGE THIS MERGE BECOMES A LIE and must be undone: one row cannot show two different sets of ticks.**"* My row flip diverged them — WhatsApp `pro:true, max:true` on footnote 6 against Messenger/Instagram `coming_soon` on footnote 4 — so the merge became precisely the lie it warned about. **This is what "review what we used to show when only WhatsApp was live" resolves to: two separate rows, no rename, nothing hidden.**

**All three overrides undone** (`NAME_OVERRIDES` and `HIDDEN_ROWS` kept as empty map/Set because `rowName()`/`visibleRows()` and both renderers import them). ⚠️ The original reasoning for never merging at *source* still stands and is preserved: merging in `plan-features.ts` would drop `'instagram_messenger_replies'` from the map `findPlanParityViolations` walks, and would silently change Billing and Admin too.

🧪 **Verified by executing the real edited modules** (throwaway harness, `visibleRows`/`rowName`/`rowDetail`/`cellLabel`):

```
"WhatsApp auto-replies"              starter=—  pro=✓           max=✓           fn=6
   detail: Auto-reply to WhatsApp enquiries about your menu and schedule.
"Messenger & Instagram auto-replies" starter=—  pro=Coming soon max=Coming soon fn=4
   detail: Same as WhatsApp auto-replies, for Messenger and Instagram enquiries.
```

⚠️ **The lesson generalises and belongs in the manual:** the three surfaces the landing comment names are all *strings*. This fourth surface is a **render-only override module**, and grepping for the row label would never have found it — the label it prints does not exist anywhere in `FEATURE_SECTIONS`.

## PART 2 — every string I changed, verbatim, and what the copy may claim

🔎 **Re-confirmed from source, and it still holds:**
- **`message_in` / `response_sent` reach no surface.** Every occurrence across `app/`, `components/`, `lib/` is a webhook **write**, a server-side filter (`.not('response_sent','is',null)` in the greeting/cap counts), or a **comment**. There is no JSX reference and no component read.
- **`whatsappStats` never reaches the DOM.** Computed at `app/api/manage/route.ts:1970`, returned `:1977`/`:2024`; on the client it exists **only as a type field** — `app/manage/[token]/page.tsx:11782` — with **zero JSX references**.

**So the copy claims no inbox, no reply capability, no "unlimited", and no truck-owned number. Final strings:**

| Where | Verbatim |
|---|---|
| Footnote 4 | `Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong.` |
| Footnote 6 | `Auto-replies require a WhatsApp Business account. Replies are AI-generated and can occasionally be wrong. WhatsApp messaging is billed by Meta, not by HatchGrab: from 1 October 2026 Meta charges for each automated reply at their published per-country rates, and once your own WhatsApp Business account is connected Meta bills you directly. Auto-replies are limited per customer and per day, and the message that hands a customer over to you counts towards that limit.` |
| Matrix row | `{ name: 'WhatsApp auto-replies', footnote: '6', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true, max: true }` |
| Landing "what it does" tile — **ONE tile, grid stays at 6** | `<h3>Social media auto-replies</h3><p>“Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon.</p>` |
| Pro-card bullets | `<li>WhatsApp auto-replies</li>` and `<li>Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` |
| Manage card title | `<p className="text-base font-bold text-slate-800">Auto-replies</p>` (badge gone) |

⚠️ **One claim I did NOT remove, because it is not mine to decide:** the Connect button still reads **"Connect"** while `saveWhatsappSender` only writes `whatsapp_sender`. It connects nothing. The codebase records that as a deliberate forward-looking verb (it becomes the Embedded Signup launcher) and forbids adding a connected/disconnected indicator. **It is now visible to both trial trucks on web for the first time.** Flagged, not changed.

---

# PART 3 — localhost click-through (Safari, macOS)

🧪 **I verified none of this on screen. `tsc` is clean and the parity probes ran, and that is all.** Your dev server is on **:3000**; my second instance could not start (the `.next` lock), so everything below is yours to confirm.

1. **Manage → Settings → Auto-replies card.** Open `http://localhost:3000/manage/<dashboard_token>` → Settings.
   - **Expect:** a card titled **"Auto-replies" with NO "Coming soon" badge beside it**; the WhatsApp row showing a **normal-weight label**, an **editable `+447700900000` phone input**, and an orange **"Connect"** button. Below it, **Messenger and Instagram rows still badged "Coming soon"**.
   - **Wrong if:** the title still shows "Coming soon" (badge removal failed); the WhatsApp input is greyed/disabled (flag didn't take — hard-refresh, Next caches); **or the Messenger/Instagram badges vanished** (that would mean row `:284` was touched — it must not be).
2. **The preview, same card.** Type "Where are you tonight?" and submit.
   - **Expect:** a reply bubble. It calls `/api/manage/whatsapp-preview` and sends nothing to Meta.
   - **Note:** this is the control footnote 4 deliberately does **not** mention, because it does not exist on iPad/Android.
3. **Manage → Billing tab.** Same page, Billing.
   - **Expect:** "WhatsApp auto-replies" with a **✓ under Pro and Max**, a superscript **⁶**, and "Messenger & Instagram auto-replies" still reading **Coming soon**. In the footnotes below: **4** without the "view every message" clause, and **6** with the charges paragraph.
   - **Wrong if:** the WhatsApp row still says "Coming soon", or footnote 4 still contains "view every message and reply yourself".
4. **Landing compare table + blocks.** `http://localhost:3000/landing`.
   - **Expect:** the "what it does" grid holds **SIX tiles** with **"Social media auto-replies" THIRD** (after "Never promise a time you can't hit") — WhatsApp in the present tense with *"Messenger and Instagram coming soon."* tagged on the end of the same paragraph. In the Pro card, **"WhatsApp auto-replies" with no badge** and **"Messenger & Instagram auto-replies — Coming soon"** on its own line. In the table, the WhatsApp row shows ✓/✓ with ⁶.
   - 🔴 **In the compare table specifically, expect TWO separate rows:** `WhatsApp auto-replies` ✓/✓ with ⁶, and `Messenger & Instagram auto-replies` reading **Coming soon** with ⁴.
   - **Wrong if:** there are **seven tiles**; the tile is not 3rd; the tile heading still says "— coming soon"; WhatsApp shows a "Coming soon" pill anywhere; or — the one that was actually broken — the table prints a **single merged row "WhatsApp, Messenger & Instagram auto-replies" with a tick**, which would mean `lib/landing-table.ts` re-merged them.
5. **The features PDF.** `http://localhost:3000/landing/features-pdf`.
   - **Expect:** the WhatsApp row ✓ under Pro and Max with **⁶**, and **both footnote 4 and footnote 6 printed in full beneath the table**.
   - **Wrong if:** the footnote block is missing, or 6 is absent — that would mean the charges note does not travel with the document you send to prospects.
   - ⚠️ Footnotes print **unmasked**, including pricing footnote 2.
6. 🔴 **A whole-page throw is the loudest failure and it is by design.** `plan-features.ts` runs `findPlanParityViolations()` at module load and **throws in dev**. If any pricing surface shows a Next error overlay naming *"presentation↔gate DRIFT"*, the row and the gate disagree — read the message, don't patch the page.

---

# PART 4 — the tree

🟢 **`HEAD` is still `2ca66cd`.** Nothing committed, nothing pushed, nothing deployed, no cap sync, native binary untouched.
🟢 **Nothing is staged** — `git diff --cached --name-only` is empty. I never ran `git add -A` or `git add .` (or any `git add`).

**Files I modified — the complete list (FIVE), for selective review after Gusto trades:**

1. `app/manage/[token]/page.tsx` — flag flip, two badges removed, stale comment corrected
2. `lib/plan-features.ts` — row flip + footnote ref, footnote 4 rewritten, footnote 6 appended
3. `app/landing/page.tsx` — welded strings split, tile re-tensed and moved to 3rd, stale comments consolidated
4. `lib/meta/webhook-signature.ts` — doc comment only
5. `lib/landing-table.ts` — **the row-merge undone** (NAME_OVERRIDES / HIDDEN_ROWS / DETAIL_OVERRIDES), which is what stopped the landing table and the PDF advertising Messenger and Instagram as live

🟢 **Untouched and still uncommitted, exactly as I found them** (diffstat unchanged): `app/o/[slug]/page.tsx` (64±), `proxy.ts` (10±), `vercel.json` (9+), `lib/custom-domain/copy.ts` (9±) — the **order scan-route rename**; `components/EventListCard.tsx` (14±) + untracked `lib/whatsapp-hint.ts` — the **derivation extraction**; `ios/App/App.xcodeproj/project.pbxproj` (2+); untracked `app/order/[id]/page.tsx`, `app/admin/outreach/`, `app/api/admin/outreach/`, `lib/outreach.ts`, the five migrations and the docs.

⚠️ **The staging discipline still decides the blast radius.** A selective commit of the four files above ships only WhatsApp. A broad commit ships the customer-facing order rename and the extraction in the same deploy — and because both Capacitor shells load production remotely, that reaches the shipped iOS app and the mid-review Android listing without any rebuild.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **I rendered nothing in a browser.** No screen in Part 3 was seen by me. `tsc` passing and the probes running are not evidence that a page looks right.
- 🔴 **No admin session was obtained and none was attempted.** The **Admin → Features tab** is one of the four surfaces footnote 6 reaches, and I am **not** claiming it renders correctly — I read that it imports and maps `FOOTNOTES` (`app/admin/page.tsx:10`, `:1010`), which is a statement about code, not about a screen. Confirming it needs your session.
- 🔴 **Vercel's deployed commit and auto-deploy setting** — unread, as in the decision report. Nothing here is deployed either way.
- 🔴 **Meta's dashboard** — app mode, allow-list, WABA and template state. Unreachable from source, and untouched: **nothing in this change set requires the Meta app mode to move from development to live.**
- 🔴 **Meta's per-country rates** — still unread, which is why footnote 6 carries no figure.
- ⚠️ **Probe (a) needed a synthetic Feature key** because all 24 union members are granted by some tier. Stated rather than glossed.
- ⚠️ **Whether the reply cap has ever fired** — behaviour, needs production logs. Source shows it committed (`7ee844f`) and called (`decideReplyCap` at the webhook's `:351`).

# FLAGS

- ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.** "Build, do not commit" and "write your report to `docs/…`" resolve cleanly: the four source files plus this report are the only things written.
- ⚠️ **One brief expectation did not match source and I did not bend the result to it:** probe (a) yields **2** violations, not 1, because the row carries two `true` cells. Reported as observed.
- ⚠️ **Item 2's rationale was loose for the second badge** — the else-branch badge was already gated by the flag, so removing it had no effect on the live path. Removed as instructed; the flag-off consequence is recorded in the code and above.

*Nothing committed. Nothing staged. Nothing deployed. HEAD = 2ca66cd.*
