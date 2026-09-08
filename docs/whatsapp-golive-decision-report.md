# WhatsApp go-live — decision report

**4 September 2026. DIAGNOSIS ONLY — nothing was changed, committed, deployed, synced or built.**

This **supersedes** `docs/whatsapp-golive-report.md`. Where that report's reasoning holds it is carried forward here in my own words with the source behind it; where it was wrong, this document states what is true and does not preserve the wrong version as a caveat.

### Method — what kind of answer each one is
🔎 **SOURCE-READ** — I read the committed code / git state and quote it. **Everything below is source-read.**
🧪 **BEHAVIOUR-VERIFIED** — observed running. **Nothing below is behaviour-verified.** I did not run the app, open an admin session, call Meta, or read Vercel.
An empty grep is stated with the pattern I searched, never as bare absence.

⚠️ **FLAG — `docs/whatsapp-golive-source-check-report.md` does not exist on disk.** I searched the path directly; the file is absent. The "source check" referenced is the verification I ran in the previous turn, reproduced and extended here from source.

---

# PART A

## A1. THE UNDEPLOYED BATCH — the operational blocker

🔎 **Source-read (git).**

```
git status -sb   → ## main...origin/main      (no ahead/behind: ZERO unpushed commits)
git rev-parse HEAD        → 2ca66cd
git rev-parse origin/main → 2ca66cd
```

🔴 **There are no committed-but-unpushed commits. `HEAD == origin/main == 2ca66cd ("whatsapp")`.** The entire undeployed batch is the **working tree** — uncommitted.

**`git diff --stat` (tracked, modified):**

| File | Workstream |
|---|---|
| `app/o/[slug]/page.tsx` (64±) | **Order scan-route rename** — customer-facing |
| `proxy.ts` (10±), `vercel.json` (9+) | Order rename — rate-limit + noindex registrations |
| `lib/custom-domain/copy.ts` (9±) | Order rename — the QR builder |
| `components/EventListCard.tsx` (14±) | **WhatsApp derivation extraction** — customer-facing |
| `docs/reference-manual.md` (569+) | Documentation |
| `ios/App/App.xcodeproj/project.pbxproj` (2+) | **Native project file** |

**Untracked (`??`):** `app/order/[id]/page.tsx` (order rename), `app/admin/outreach/`, `app/api/admin/outreach/`, `lib/outreach.ts` (outreach), `lib/whatsapp-hint.ts` (extraction), five `supabase/migrations/*.sql`, and ~20 `docs/*.md|csv`.

🟢 **The WhatsApp go-live target files are CLEAN** — `app/manage/[token]/page.tsx`, `lib/plan-features.ts` and `app/landing/page.tsx` do not appear in `git status`. They are identical to `2ca66cd`.

### If the Part B commit were pushed today, what else ships?

**It depends entirely on how it is staged, and that is the whole answer:**

- 🟢 **A selective commit** (`git add` of only the three WhatsApp files) ships **only** the WhatsApp change. The uncommitted order-rename / extraction / outreach / ios work stays out of the deploy because it is not in the commit.
- 🔴 **A broad commit (`git add -A`) ships all of it in one deploy:**
  1. **The order scan-route rename** — `/o/` → `/order/`, proxy rate-limit and vercel noindex registrations. This is **the exact path Pizzeria Gusto's customers use while trading today.**
  2. **The WhatsApp derivation extraction** — `EventListCard.tsx` + `lib/whatsapp-hint.ts` change the public Call/Message button on the live Village Foodie site.
  3. **The outreach tab, page and route** — admin-only, small blast radius, but it ships.
  4. **Five migration `.sql` files** — inert in a code deploy; they do not self-apply.
  5. **`ios/App/App.xcodeproj/project.pbxproj`** — adds `INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.food-and-drink"` to both build configs.

### Reaching the shipped iOS app and the mid-review Android listing

🔴 **The two customer-facing web workstreams DO reach both shells.** Both Capacitor shells load **production over a remote URL**, so a web deploy changes what the shipped iOS app renders and what a Google reviewer sees mid-review — without any binary being rebuilt. That is the risk to flag, and it belongs to the **order rename and the extraction**, not to the WhatsApp change.

🟢 **The `ios/` project-file change does NOT reach either app via `git push`.** It only takes effect on a native rebuild-and-submit, which a Vercel web deploy does not perform. It is dirty in the tree and would be swept into a broad commit, but it ships to nobody until someone builds the native app.

⚠️ **One thing I could not verify and it materially affects this answer.** The manual (§49, V12.2) states *"nothing has been deployed since before V12.1"*, yet `origin/main` is at `2ca66cd` and local is level with it. If Vercel auto-deploys `main`, `2ca66cd` is already live and the manual's posture line is wrong; if auto-deploy is off or production is pinned, pushing again deploys nothing by itself. **I cannot read Vercel's deployed commit or its auto-deploy setting from here.** Confirm the live commit in the Vercel dashboard before pushing anything — that single reading decides whether a push is a no-op or ships five workstreams at once.

## A2. `ROW_FEATURE_MAP`, verbatim

🔎 Source-read — `lib/plan-features.ts:512`, `const ROW_FEATURE_MAP: Record<string, Feature> = {`. Exact key strings, comments elided:

```ts
'Discovery map listing': 'discovery_map',
'Universal web dashboard': 'web_dashboard',
'QR code': 'qr_menu',
'Meal deals & upsells': 'meal_deals',
'Walk-up order processing': 'walkup_orders',
'Instant sold out toggle': 'sold_out_toggle',
'Automated stock countdown': 'stock_countdown',
'Online ordering — Pay at Hatch': 'online_ordering_pay_at_hatch',
'iPhone and iPad kitchen app': 'ipad_kds',
'Offline Order Protection': 'offline_protection',
'Online payments': 'online_payments',
'Advance pre-ordering': 'advance_preordering',
'Pre-order deadline': 'advance_preordering',
'Customer time slot selection': 'time_slot_selection',
'Smart Slot Management': 'smart_batch_pacing',
'Auto-accept online orders': 'auto_accept',
'Branded QR code': 'branded_qr_code',
'WhatsApp auto-replies': 'whatsapp_replies',
'Messenger & Instagram auto-replies': 'instagram_messenger_replies',
'Advanced reporting': 'advanced_reporting',
'Multi-device kitchen sync': 'multi_device_kds',
```
(The map continues past `multi_device_kds` with the `embed_schedule` entry added 29 August.)

🔴 **`'Android kitchen app'` has no entry, deliberately** — the comment at `:209` records that `findPlanParityViolations()` `continue`s on a row with no entry, so an entry would buy nothing for a uniformly-`coming_soon` row.

## A3. The reply cap

🔎 Source-read.

- **Committed: YES.** `lib/whatsapp/reply-cap.ts` exists (11,155 B) and `git log` attributes it to **`7ee844f "ipad app post updates"`**. It is not an uncommitted file.
- **Wired into the webhook: YES, and it is called, not merely imported.** `app/api/webhooks/meta/whatsapp/route.ts:8-13` imports `decideReplyCap`, `isCapClassification`, `handoffMessage`, the three ceilings and the four cap classifications; `:351` calls **`decideReplyCap({…})`**; `:343` uses `isCapClassification`; `:424` writes `classification: CLASSIFICATION_CUSTOMER_CAP`.
- **The ceilings, as they read in source:**

| Constant | Value |
|---|---|
| `DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H` | **3** (per-customer default, rolling 24h) |
| `MAX_REPLIES_PER_TRUCK_DAY` | **200** — `Math.ceil(MAX_REPLIES_PER_TRUCK_MONTH / 10)`, derived, never a second literal |
| `MAX_REPLIES_PER_TRUCK_MONTH` | **2000** |

🔴 **The per-customer limit is a default, not a constant the decision reads** (`:21`) — `decideReplyCap` takes the limit as an argument.

⚠️ **What I did not establish:** whether the cap has ever *fired* in production. That is behaviour, needs logs, and I did not read any. The code path exists and is called; that is all source can tell you.

## A4. `GRAPH_API_VERSION`

🔎 Source-read — `lib/meta-whatsapp.ts:19`:

```ts
export const GRAPH_API_VERSION = 'v19.0'
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`   // :20
```

**Every consumer** (searched `GRAPH_API_VERSION|GRAPH_BASE_URL` across `app/` and `lib/`):

| Site | Use | Executable? |
|---|---|---|
| `lib/meta-whatsapp.ts:20` | derives `GRAPH_BASE_URL` | derivation |
| `lib/meta-whatsapp.ts:31` | `fetch(\`${GRAPH_BASE_URL}/${phoneNumberId}/messages\`)` — **the send** | ✅ |
| `lib/meta-whatsapp.ts:217` | `${GRAPH_BASE_URL}/${wabaId}/message_templates?fields=…` — template **LIST** | ✅ |
| `lib/meta-whatsapp.ts:353` | `${GRAPH_BASE_URL}/${wabaId}/message_templates` — template **CREATE** | ✅ |
| `lib/meta-whatsapp.ts:146-147` | echoed as `graphApiVersion` / `graphBaseUrl` in a diagnostic payload | reporting only |

**Three executable consumers** — send, template-list, template-create — behind one constant. ⚠️ `v19.0` is past its 21 May 2026 deprecation date; the file's own comment (`:13`) says nothing in it can verify currency.

## A5. The Meta webhook

🔎 Source-read — `app/api/webhooks/meta/whatsapp/route.ts`.

**Env var for the app secret: `META_WHATSAPP_APP_SECRET`** — `:109`, `parseMetaAppSecrets(process.env.META_WHATSAPP_APP_SECRET)`. The comment at `:98-104` is explicit that this is **deliberately not a fallback chain**: it read `META_APP_SECRET` until 20 August 2026, *"a name PRODUCTION HAS NEVER DEFINED"*, and a chain `META_WHATSAPP_APP_SECRET ?? META_APP_SECRET` **is refused** rather than added. (⚠️ Note `lib/meta/webhook-signature.ts:120` still names `META_APP_SECRET` in a doc comment — stale text, no behaviour.)

**Both truck lookups destructure and log — YES, both:**

| Lookup | Destructure | Error handling |
|---|---|---|
| **PRIMARY** — `.from('trucks').eq('phone_number_id', phoneNumberId).eq('active',true).maybeSingle()` | `const { data, error }` | `if (error) console.error('[webhook/meta-whatsapp] LOOKUP FAILED (primary, phone_number_id) code=…')` |
| **FALLBACK** — `.from('trucks').or(toVariants.map(v => \`whatsapp_sender.eq.${v}\`)).eq('active',true).maybeSingle()` | `const { data, error }` | `if (error) console.error('[webhook/meta-whatsapp] LOOKUP FAILED (fallback, display_phone_number) code=…')`, plus a `console.warn` when routing actually used the fallback |

🔴 The in-file reasoning is worth preserving: *"A QUERY THAT ERRORED IS NOT A QUERY THAT FOUND NOTHING, AND `const { data }` COULD NOT TELL THEM APART."* The fallback is the site the check exists for — `whatsapp_sender` carries **no unique index**, so two trucks sharing a variant makes `maybeSingle()` error rather than match.

---

# PART B — the change set, enumerated, NOT made

## B1. `WHATSAPP_LIVE` — every behaviour that changes

🔎 Source-read. Definition: `app/manage/[token]/page.tsx:8444` — `const WHATSAPP_LIVE: boolean = false`. It is a **module-local const in the manage page**; it is not imported anywhere else.

I searched `WHATSAPP_LIVE` across `app/`, `lib/`, `components/`. **Exactly two executable consumers**, both in the WhatsApp channel row:

| Site | Before (`false`) | After (`true`) |
|---|---|---|
| `:9755` | `<label className="… text-slate-400">WhatsApp</label>` — label **greyed** | label renders `text-slate-600` — **normal weight** |
| `:9756` | `WHATSAPP_LIVE && can('whatsapp_replies')` is false → renders the **else** branch: one row of label + number + a **"Coming soon" badge** where the button would be | renders the **live** branch: an editable `<input type="tel">` (value `whatsappSender`, `onBlur={saveWhatsappSender}`, placeholder `+447700900000`) **and** a `<button onClick={saveWhatsappSender}>Connect</button>` |

Every other `WHATSAPP_LIVE` hit (`landing:193`, `manage:8378`-reference, `:8517`, `:9626`, `:9741`, `plan-features:272`) is a **comment**, not a consumer.

🔴 **`can('whatsapp_replies')` is TRUE for both live trucks, so the live branch really would render.** `lib/features.ts:51` puts `whatsapp_replies` in `PRO_FEATURES`; `:55` `MAX_FEATURES = [...PRO_FEATURES]`; `:72` `TRIAL_FEATURES = [...MAX_FEATURES]`. Both trading trucks are `plan='trial'`, so the gate grants it. **"Max-only, no live truck sees it" is false**, exactly as you said.

🔴 **Flipping the flag alone leaves a self-contradicting card.** Two "Coming soon" statements near it are **hard-coded literals, not gated by `WHATSAPP_LIVE`**:
- the card title badge — `<p>Auto-replies</p><Badge label="Coming soon" colour="slate" />` (≈`:9650`), added 28 August so an operator who does not open the card still sees the state;
- the channel-row badge in the else branch (`:9756`+).

Flip the flag without touching those and the operator sees **"Auto-replies — Coming soon"** above a working, editable Connect row. A complete flip is **flag + both badges**, in the same change.

🔴 **`WHATSAPP_LIVE` does not touch the marketing surfaces at all.** It is local to the manage page. The pricing matrix, landing and PDF are driven by `lib/plan-features.ts:282`, a **separate switch** (B4). These are two independent flips and neither implies the other.

## B2. Does flipping it produce a visible control the operator cannot operate?

🔴 **FIRST LINE, as asked: NO — flipping `WHATSAPP_LIVE` creates NO control on the shipped iOS app or the mid-review Android listing. The entire auto-replies card is hidden on native and the flag cannot reveal anything there.**

🔎 Source-read. The card is **double-wrapped**:
- the **whole Card** — `{!isNativeApp() && (<Card …>` (≈`:9634`), whose comment reads: *"THE WHOLE AUTO-REPLIES CARD IS HIDDEN IN THE NATIVE APP (25 August 2026). ALL account types, ALL plans, heading included… **A control a user can see and cannot operate is a Guideline 2.1 completeness defect, and this build is answering a 2.1 rejection.**"*
- the **Connect subsection** again — `{!isNativeApp() && (<>` — now redundant and deliberately left in place.

`isNativeApp()` is `typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()`, **false in every browser**, so the failure direction is safe: a wrong answer shows the card on iPad, never hides it from a web operator.

**So the revealed control is WEB-ONLY.** On web, this is what it is:

```tsx
<button
  onClick={saveWhatsappSender}
  className="flex-shrink-0 text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
>
  Connect
</button>
```

Its governing comment: *"THE LABEL "Connect" STAYS… **STILL BINDING: the button today only writes `whatsapp_sender`.** 🔴 DO NOT ADD A connected/disconnected INDICATOR until the flow exists — that would be a label asserting a state nobody checked. A forward-looking VERB is a product decision; a fabricated STATE is a lie. 🔴 BEHAVIOUR IS BYTE-IDENTICAL to 10 August. Same `onClick={saveWhatsappSender}`, same save-on-blur beside it, same handler, same request, same column."*

**Applying the rule you quoted** — *"Coming soon against a fact about a plan is fine; Coming soon against a control a user can see and cannot operate is a defect"*:

🟢 **This lands on the permitted side, on two independent grounds.** (1) The control **can** be operated: it persists `whatsapp_sender` via `saveWhatsappSender` → `api('update_truck', …)`, and the codebase records that Pizzeria Gusto already has a sender set through it — the card comment states outright *"IT IS NOT A DEAD CONTROL AND MUST NOT BE DELETED."* (2) The rule's jurisdiction is the **native build**, and the flag reveals nothing there.

⚠️ **The honest residue, which is a copy question not a 2.1 question:** the verb "Connect" promises a connection the button does not make — it saves a number and provisions nothing. That is a deliberate, dated product decision (the control becomes the Embedded Signup launcher later), not an accident. It is worth deciding whether an operator flipping this on today would read "Connect" as "my WhatsApp is now connected." Nothing in the product would correct them.

## B3. Splitting the landing row

🔎 Source-read. WhatsApp is welded to Messenger and Instagram in **two strings in one file**, and the matrix is already split.

| # | File · line | Exact current string | What splitting requires |
|---|---|---|---|
| 1 | `app/landing/page.tsx:200` | `<div className="does-item"><h3>Social media auto-replies — coming soon</h3><p>“Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow.</p></div>` | Rewrite into **two** items, or one present-tense WhatsApp item plus a retained coming-soon line for M/I. The heading itself says "coming soon" and the body says "**Soon** your WhatsApp will get answered" — both halves are tense-bound to WhatsApp being unshipped. |
| 2 | `app/landing/page.tsx:361` | `<li>WhatsApp, Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` | Split into **two `<li>`**: a WhatsApp one with the `soon-inline` span **removed**, and `<li>Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` **kept**. |
| 3 | `lib/plan-features.ts:282` / `:284` | already **two separate rows** | Only `:282` (WhatsApp) flips; `:284` (`Messenger & Instagram auto-replies`, `pro:'coming_soon', max:'coming_soon'`) **stays untouched**. |

🔴 **The codebase already names these three as one fact.** The comment immediately above `:200` reads: *"…this block, the matrix row in `lib/plan-features.ts` and the Pro-card bullet below all move back together — **they are three surfaces of one fact and must not drift**."* That is your checklist: `:200`, `:361`, `plan-features:282`. Change any two and the third contradicts them.

⚠️ **Messenger and Instagram must stay coming soon** — their webhooks are verify-handshake + `console.log` stubs. Nothing in this split touches `:284`.

## B4. `plan-features.ts:282` and the parity checker

🔎 Source-read. Current row:

```ts
{ name: 'WhatsApp auto-replies', footnote: '4',
  detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.',
  starter: false, pro: 'coming_soon', max: 'coming_soon' },
```

**Does the row have a `ROW_FEATURE_MAP` entry? YES —** `'WhatsApp auto-replies': 'whatsapp_replies'` (A2). No new entry is needed on the flip; the binding already exists and is keyed on the current label.

**What arming means here.** `findPlanParityViolations()` *"only inspects cells that are literally `true`, so a coming_soon cell is skipped entirely. The check passes vacuously here"* (`plan-features.ts:279-280`). So today the row is **not** checked. Flip `pro`/`max` to `true` and it becomes checked against the `whatsapp_replies` grant.

🟢 **The flip should be parity-clean**: `whatsapp_replies` is in `PRO_FEATURES` (`features.ts:51`) and `MAX_FEATURES` inherits it (`:55`), so `pro:true, max:true` matches the gate exactly. `starter:false` matches too (`whatsapp_replies` is not in the starter set).

⚠️ 🔴 **A stale comment will actively mislead whoever does this flip.** `app/manage/[token]/page.tsx` (≈`:9741`) still asserts: *"THIS STATE DELIBERATELY DOES NOT COME FROM lib/plan-features.ts, AND MUST NOT. That module's WhatsApp row reads `pro: true, max: true`… Setting it to 'coming_soon' there would rewrite the public landing pricing matrix… Two different facts; two different homes."* **That is no longer true.** `plan-features.ts:272` carries the later decision — *"WHY THIS ROW MOVED TO coming_soon. `app/manage/[token]/page.tsx:8378` sets `WHATSAPP_LIVE = false`"* — and the row **was** moved to `coming_soon` to match the flag. The two comments contradict each other and the manage-page one is the stale side. (It also cites `:8378` for a const now at `:8444`.) Correct or delete it in the same change, or the next reader will "restore" the matrix row on its authority.

**The two probes — to be run on throwaway copies, never on live files:**
- **(a) Proof the row is inspected.** Copy the module; re-point `'WhatsApp auto-replies'` at a `Feature` **no tier grants**; run `findPlanParityViolations()`. **Expect exactly 1 violation.** A clean result means the row is not being inspected and the flip bought nothing.
- **(b) The trap in pure form.** Copy the module; **delete** the `'WhatsApp auto-replies'` map entry, leave the cells `true`; run it. **Expect 0 violations** — advertised as included, checked by nothing. This is the outcome a rename produces silently, because the key is the label string.

🔴 **Therefore: if the row is ever renamed** (e.g. dropping a word from the label), the `ROW_FEATURE_MAP` key must be renamed **in the same commit**, and probe (a) re-run. A green check on a row nothing looks at is indistinguishable from a green check on a correct row.

## B5. Footnote 4

🔎 Source-read — `lib/plan-features.ts:489-491`, verbatim:

```ts
{
  number: '4',
  text: 'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong — you can view every message and reply yourself at any time.',
},
```

🔴 **The final clause is false on both halves, and the codebase says so.** `app/manage/[token]/page.tsx:8652` records that *"view every message" — HAS NO PRODUCT BEHIND IT*: `whatsapp_logs` stores `message_in` and `response_sent`, and no surface renders them. "Reply yourself" depends on coexistence, which is unbuilt. The row it annotates is carried by **both** `:282` (WhatsApp) and `:284` (Messenger & Instagram).

**Proposed replacement — text edited in place, same `number: '4'`:**

> `'Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong — preview exactly what your customers will be told from your Settings page.'`

Why it works for all three readers: the **prospect** on the landing gets a truthful capability plus a named safeguard; the **operator** on Billing is pointed at a control that exists today (the preview is real, and it renders on web *and* iPad because it sits outside the native hide); the **admin** reads the same sentence with nothing to reconcile. It removes only the unbuilt claim and adds none.

🟢 **Confirmed: this edits text in place and adds or moves no number.** `number: '4'` is unchanged, no footnote is inserted, reordered or renumbered. `hide_pricing` masks by the magic string `f.number !== '2'`, and footnote 2 is untouched, so the mask is unaffected.

## B6. The WhatsApp charges small print

**Proposed text — no figure:**

> **WhatsApp charges.** WhatsApp messaging is billed by Meta, not by HatchGrab. From 1 October 2026 Meta charges for each automated reply, at their published per-country rates. Once your own WhatsApp Business account is connected, Meta bills those charges to you directly. Auto-replies are limited per customer and per day, and the message that hands a customer over to you counts towards that limit.

Every clause is load-bearing: **"billed by Meta, not by HatchGrab"** stays true both while we are on the platform credential and after Embedded Signup moves billing to the operator; **"Once your own … is connected"** is conditional, so it does not go stale on the design change; the last clause states plainly that a per-customer limit of 3 is **four billable messages**, because the handoff is itself billable; and **no figure appears** — Meta's per-country rates were due 1 September and neither of us has read them. Nothing about Gemini: that spend is ours under every design and is never the operator's concern.

**Where it belongs:** a **new footnote `number: '6'`** in `PLAN_FOOTNOTES`, attached to the WhatsApp row via `footnote: '6'` — **appended, never inserted.** Footnote 6 is free (the branded-QR footnote was removed at V6.5), so nothing renumbers and the `f.number !== '2'` mask is untouched. Appending is preferable to extending footnote 4 because footnote 4 is shared with the Messenger/Instagram row (`:284`), which is unbuilt and bills nothing — a charges sentence there would be false for that row.

🟢 **Confirmed it reaches the PDF.** `app/landing/features-pdf/route.ts:26` imports `FOOTNOTES`; `:167` renders **every** footnote's full text: `FOOTNOTES.map(f => \`<p><sup>${esc(f.number)}</sup> ${esc(f.text)}</p>\`)`. The row superscript renders at `:144`/`:153`. The file's own comment (`:159-161`) says *"THE ALLOWANCE LINES AND THE FOOTNOTES TRAVEL WITH THE TABLE, ALWAYS… footnote 4 is what makes the auto-reply rows honest."* So a new footnote 6 appears on the landing, Billing, Admin **and** the PDF. ⚠️ Note the PDF renders footnotes **unmasked**, so write it to be safe for anyone the document is forwarded to.

## B7. Does any of this require Meta app mode dev → live?

🟢 **CONFIRMED — no. Your reading is right, and source supports it.**

Every item in this change set is code that renders in our own app: `WHATSAPP_LIVE` (a module-local const), two hard-coded "Coming soon" badges, two cells in `plan-features.ts`, two landing strings, and footnote text. **None of them is read by Meta, and none of them sends a message.** I searched for `WHATSAPP_LIVE` across `app/`, `lib/` and `components/`: its only executable consumers are the two manage-page render sites at `:9755`/`:9756`.

Meta's app mode governs **delivery** — in development mode a recipient must be on the allow-list or delivery silently fails. That only bites a truck actually configured to send or receive, and **no trading truck is**:
- `trucks.phone_number_id` is the routing key (`webhook route:173`) and **has no writer** — I searched `app/` and `lib/` for `phone_number_id` combined with `update|insert|upsert`, and found **no write site**; it is set by hand.
- The fallback path routes on `whatsapp_sender`, which for Gusto holds a tester mobile rather than a Business API sender.

So the operator-facing flip and the Meta app-mode flip are **independent**, and doing the first requires nothing of the second. ⚠️ The corollary is the honest limit: flipping `WHATSAPP_LIVE` lets an operator **save a number** through a control labelled "Connect"; it does not make that number receive anything, because provisioning is a hand-edit in Supabase and Embedded Signup does not exist.

---

# WHAT I COULD NOT READ, AND WHY

- 🔴 **Vercel's deployed commit and auto-deploy setting** — no dashboard or API read. This is the one gap that changes A1's answer, and it should be read before any push.
- 🔴 **Anything in Meta's dashboard** — app mode, the recipient allow-list, WABA/template/display-name status, webhook subscription fields. Not reachable from source.
- 🔴 **Meta's published UK per-country rates** — external, due 1 September, unread by both of us. This is why B6 carries no figure.
- ⚠️ **Whether the reply cap has ever fired** — behaviour, needs production logs. Source proves only that it is committed and called.
- ⚠️ **Runtime rendering of any of this.** I did not run the app. Everything above is read from committed source and git state.
- 🔴 **No admin session was obtained and none was attempted.** Nothing in this report describes an admin surface as working; every admin-surface statement here is a claim about **code**, not about an observed screen.

# FLAGS

- ⚠️ **`docs/whatsapp-golive-source-check-report.md` does not exist** — I searched the exact path. Reported as absence, not worked around.
- ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.** "Diagnose only / change nothing" and "write your report to `docs/…`" resolve cleanly: the report is the only artefact written, and nothing in the product, the database, Meta or git was touched.
- 🔴 **A stale comment inside the codebase contradicts the code** (B4): the manage page still instructs that `plan-features.ts` must never be set to `coming_soon` and describes the row as `pro:true,max:true`, which it is not. Whoever makes this change will meet that instruction and should not follow it.

*Nothing changed. Nothing committed. Nothing deployed. No cap sync. Native binary untouched.*
