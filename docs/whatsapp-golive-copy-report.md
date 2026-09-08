# WhatsApp go-live — copy, cap placement, and Connect scoping

**4 September 2026. Same branch, same working tree. NOTHING committed, staged, pushed, deployed or cap-synced. Native binary untouched. `git add -A` / `git add .` never run. Live production commit is still `2ca66cd`, so everything here is genuinely undeployed.**

**Method per item:** 🔎 **SOURCE-READ** = read/edited and quoted. 🧪 **EXECUTED** = I ran it (`tsc`, and the parity/render harness on copies of the real modules). **I rendered nothing in a browser** — Task 5 is yours.

---

# 🔴 FLAG FIRST — footnote 6 keeps a clause your own rationale calls false

You asked for the replacement because the old text *"tells operators Meta bills them directly, which is false today"*. **The wording you supplied retains that clause** — *"Meta bills you directly for these messages"*.

**I implemented your string verbatim, because you gave it in quotes as the instruction, and I am flagging rather than silently editing it.** The precise position from source:

- **Today it is not true.** Sending runs on **one platform credential** — `lib/meta-whatsapp.ts` authorises every send with `META_WHATSAPP_ACCESS_TOKEN` while addressing a per-truck `phone_number_id` in the URL. On that arrangement **HatchGrab receives the bill, not the operator.**
- **It becomes true** only once Embedded Signup exists and the truck's own WhatsApp Business account carries a payment method — the manual's *"Onboarded trucks must add a payment method to their own WhatsApp Business account."*
- **There is a reading on which it is already true**, and it may be the one you intended: the footnote's first sentence makes *"a WhatsApp Business account"* a **precondition**, so the sentence describes the arrangement being sold, not today's plumbing. On that reading it is a statement about the product an operator is signing up to.

**If you want it strictly true today**, one clause does it and nothing else changes: *"Meta bills for these messages — check Meta's current pricing."* Say the word and it is a one-line edit. **Nothing else in this report depends on which you pick.**

---

# TASK 1 — footnote 6 replaced in place

🔎 `lib/plan-features.ts`. **Replaced, not inserted.**

**OLD:** `'Auto-replies require a WhatsApp Business account. Replies are AI-generated and can occasionally be wrong. WhatsApp messaging is billed by Meta, not by HatchGrab: from 1 October 2026 Meta charges for each automated reply at their published per-country rates, and once your own WhatsApp Business account is connected Meta bills you directly. Auto-replies are limited per customer and per day, and the message that hands a customer over to you counts towards that limit.'`

**NEW:** `'Auto-replies require a WhatsApp Business account. Meta bills you directly for these messages — check Meta\'s current pricing. Responses are AI-generated and can occasionally be wrong.'`

🧪 **Verified by executing the real module:** footnote count **6**, numbers **`1,2,3,4,5,6`** — nothing inserted, moved or renumbered. `number: '6'` unchanged, so `hide_pricing`'s `f.number !== '2'` mask is untouched (footnote 2 is not adjacent to anything I edited).

🟢 **No date, no figure.**

🔎 **Reach — all four surfaces, unchanged by this edit** (they render the whole `FOOTNOTES` array, so a text swap needs no plumbing):

| Surface | Import | Renders footnote text |
|---|---|---|
| Landing | `page.tsx:29` | `:504` — `{FOOTNOTE_TEXT_OVERRIDES[f.number] ?? f.text}` |
| Manage → Billing | `page.tsx:36` | shared `FOOTNOTES` |
| Admin → Features | `page.tsx:10` | `:1010` |
| **features PDF** | `features-pdf/route.ts:26` | `:167` — `FOOTNOTES.map(f => …f.number…f.text…)` |

🟢 **`FOOTNOTE_TEXT_OVERRIDES` still contains only `'2'`** (`app/landing/page.tsx:74-76`, verified). Because the landing render is `OVERRIDES[f.number] ?? f.text`, **footnote 6 falls through to the shared text on every surface — no surface shows a different version.**

# TASK 2 — the cap detail moved into the Settings card

🔎 **Numbers read from `lib/whatsapp/reply-cap.ts`, not restated.** `DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H = 3` (`:25`), `MAX_REPLIES_PER_TRUCK_MONTH = 2000` (`:35`), `MAX_REPLIES_PER_TRUCK_DAY = Math.ceil(2000/10)` = **200** (`:42`). The webhook passes that same constant at its `decideReplyCap` call site (`route.ts:363`), so the rendered number is the enforced one.

🔴 **A correction to my own earlier wording, from source.** `reply-cap.ts:68-70` is explicit: *"THE HANDOFF IS ITSELF A BILLABLE MESSAGE. A per-customer limit of 3 therefore yields THREE replies PLUS ONE handoff — **four billable messages, not three.**"* The handoff is **additional**, not one of the three. My previous phrasing ("counts towards that limit") understated the invoice by 25%. The new copy says *"one more"*.

**Wording, verbatim as it renders:**

> **Each customer gets up to 3 replies in 24 hours. After that they get one more message handing them over to you — Meta charges for that one too.**

(The `3` is `{DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H}`, imported from the decision module — it cannot drift from the enforced value, and when the per-truck override lands it reads the truck's number.)

**Where it sits:** in the **Auto-replies card**, inside the **Connect subsection**, immediately under the *"Channels"* heading and its *"Requires Business accounts on each platform."* caption — i.e. directly above the WhatsApp/Messenger/Instagram rows, where an operator configuring the feature is already reading. Styled `text-xs text-slate-500`, one paragraph.

⚠️ **Web-only, like the whole card.** The card is wrapped in `{!isNativeApp() && …}`, so these lines do not appear on iPad or Android — the same constraint that kept footnote 4 from pointing at the preview. **Only the two per-truck ceilings (200/day, 2000/month) are not surfaced anywhere**; they are runaway backstops rather than a promise, and I did not invent copy for them.

🟢 **I did not put a price or a date in the card**, for the same reason footnote 6 carries none.

---

# TASK 3 — SCOPE ONLY. NOTHING BUILT.

**I built none of this. No file below was created or edited for Task 3.**

## 3a. Meta prerequisites for Embedded Signup that do not exist today

🔎 Source: the manual's Meta-documentation blocks (checked 20 Aug 2026) plus the repo.

| Prerequisite | State | Where it is blocked |
|---|---|---|
| **Facebook Login for Business configuration** | 🔴 **Does not exist** | Step 3 of 5. It is the component that **mints business tokens**; Embedded Signup cannot exist without it. Needs login variation *WhatsApp Embedded Signup*, asset *WhatsApp accounts*. Also needs **`public_profile` at Advanced access** — state **unread**. |
| **Tech Provider status** | 🔴 **Not held** | Needs business verification **and** app review. Review requires **TWO screen recordings**: a message created and sent **from our app** and received in the WhatsApp client, **and** our app creating a **message template**. 🔴 **The second recording cannot be made today — `CREATE` has never executed and no template has ever been created** (only a `LIST` call has succeeded). |
| **`whatsapp_business_management` app review** | 🔴 **Never submitted** | Only `whatsapp_business_messaging` went in. Template management — and therefore the template recording above — depends on it. Half of step 4. |
| **Per-truck business-token storage** | 🔴 **Does not exist** | See 3b. 🔴 **And the manual says do not build it yet:** *"OPEN AND BLOCKING: ONE QUESTION TO META… whether a single platform token can address all WABAs our app is Tech Provider for… **a yes deletes the entire token-storage design.** Ask it as part of the Tech Provider application. **Do not build token storage before the answer.**"* ⚠️ Evidence has since **strengthened against** a single token — *"Tech Providers use business tokens **exclusively**"* — so **plan on the answer being no**, but ask it. |
| **Embedded Signup v2 deprecation — 15 October 2026** | 🔴 **41 days away** | *"Embedded Signup v2 is deprecated 15 October 2026 — **build v4**."* Anything scoped against v2 is scoped against a dead API. This is the hardest date in the file and it lands **before** any of the above could realistically complete. |
| **Coexistence** (truck keeps its existing number) | 🔴 Unavailable | Requires **Solution Partner or Tech Provider status already held**, plus the business on WhatsApp Business app **2.24.17+**. The manual calls this *"the path that fits this market"* — every truck already has WhatsApp Business on a phone with their number on flyers. |
| **Operator payment method** | ⚠️ Unavoidable friction | *"Onboarded trucks must add a payment method to their own WhatsApp Business account — a wizard friction step that cannot be removed."* |

**Net:** the two hardest steps sit in front of everything, one of them (the template recording) is blocked by a permission that was never submitted, and the v2 deprecation lands first.

## 3b. What per-truck credential storage requires in THIS codebase

🔎 **Nothing here has ever stored a third-party credential.** Stripe Connect is the near-precedent and the manual is precise about where it stops: *"per-truck third-party credential, an onboarding flow we do not control, a status route, a webhook that syncs state. ⚠️ **It breaks on exactly one row: Connect stores an IDENTIFIER and calls with the platform key; a Meta business token IS the credential.** That single difference is the whole of the new problem."*

🔴 **A redaction list on `trucks` fails by omission, and I verified the reason rather than repeating it.** Live routes read the row with `select('*')`:
- `app/api/dashboard/route.ts:92-93` — `.from('trucks').select('*')`
- `app/api/manage/route.ts:162` — `.select('*')`
- and `dashboard/route.ts:189` names the pattern in its own comment: *"a NAMED select here (unlike orders/trucks, which use `select('*')`)"*.

**So a token column added to `trucks` would be returned by those routes the moment it exists, and every future column is opted in by default.** A redaction list is a list someone must remember to update; `select('*')` guarantees the failure is silent. This is the same class as the V12.1 `dashboard_token` exposure.

**What it therefore requires, from the manual's recommendation:**
1. **A dedicated `whatsapp_connections` table** — *"the separate table matters as much as the encryption"*, precisely because of the `select('*')` reads above. A new table is not reached by them at all.
2. **App-level AES-256-GCM**, with the honest framing the manual insists on: ⚠️ *"App-level encryption is not protection against a compromised process; it raises the bar on dumps, backups and exports. **Say that rather than calling it 'encrypted at rest' and stopping.**"*
3. **RLS on, anon/authenticated revoked** — the V12.1 posture, not just a policy.
4. **A key to hold and rotate** — this repo has no application-level encryption key today, so that is new operational surface, not just a column.

🔴 **And per the manual, none of it should be built until Meta answers the single-token question.**

## 3c. `trucks.phone_number_id` — writer, and the smallest safe one

🟢 **Confirmed again: NO WRITER.** I searched `app/` and `lib/` for `phone_number_id` co-occurring with `update(` / `insert(` / `upsert(` — **zero results**. The column's own migration comment says so: *"Set by hand: there is no UI."* It is read in the webhook (routing) and nowhere written.

🔎 **The index that protects it** (`supabase/migrations/…phone_number_id.sql`):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS trucks_phone_number_id_key
  ON trucks (phone_number_id)
  WHERE phone_number_id IS NOT NULL;
```
**Partial unique.** Uniqueness is enforced only across non-NULL values, so the 11 trucks with NULL are unaffected while **two trucks can never share an id**. That matters because the id **is** the routing key: a duplicate would make `maybeSingle()` error and inbound routing ambiguous. **The database already refuses the dangerous state — a writer cannot create it even if its validation is wrong.**

**Smallest safe admin-only writer:**
- **Route:** extend the existing `app/api/admin/route.ts` with one action (e.g. `set_phone_number_id`). 🔴 **Not a new route and not a manage/operator route** — it reuses `verifyAdmin(req)`, the canonical gate every admin route already uses, so no new auth surface is introduced. Operators must not write it; it is a Meta-side identifier they cannot verify.
- **Validation:** `truck_id` required and existing; value either `null` (to clear) or a **string of digits only**, trimmed, length-bounded (Meta ids are numeric strings — the live one is `1179821708546925`); reject anything else rather than coercing. Write with the **service-role client** (as every admin route does).
- **Conflict handling:** catch the unique-violation (`23505`) and return a **specific** error naming the truck that already holds it — do not let it surface as a generic 500. The index is the guarantee; the message is the usability.
- **Audit:** log truck id, old value, new value, admin identity. It is a routing-critical field with no UI history.
- ⚠️ **It writes an identifier, not a credential**, so it needs none of 3b's encryption work — which is exactly why it is the cheap half.

## 3d. Three costed options for the Connect control

**What it does today** (`app/manage/[token]/page.tsx`): `<button onClick={saveWhatsappSender}>Connect</button>` → `api('update_truck', { whatsapp_sender })`. It writes one text field. It connects nothing. Since the flag flip it is **visible to both trial trucks on web** for the first time.

| | Operator experience | What it claims that is not true | Cost to undo when Embedded Signup lands |
|---|---|---|---|
| **(a) Leave it** | Types a number, clicks **Connect**, gets a saved field and no feedback. Nothing happens next; nothing tells them why. | 🔴 **"Connect"** — the verb asserts a connection the product cannot make. The codebase already forbids a connected/disconnected indicator for this reason (*"a label asserting a state nobody checked"*), which concedes the label is ahead of the product. | **Zero.** The control becomes the Embedded Signup launcher; the label was chosen for that. |
| **(b) Request-setup action** | Clicks **"Request WhatsApp setup"**; number is saved and you are notified; they see *"We'll set this up and confirm."* Matches the hand-provisioning that genuinely happens (`phone_number_id` set by hand). | 🟢 **Nothing.** It describes the real process. ⚠️ Only honest if the request actually reaches someone — otherwise it is a worse lie than (a). | **Small.** Swap the handler and the label back to the launcher; delete the notification path. One screen, one route. |
| **(c) Build the admin writer behind it** | Unchanged for the operator — still no self-serve. Admin gains a supported way to set `phone_number_id` instead of hand-editing Supabase. | 🟡 **Still "Connect"** on the operator side: (c) fixes the *admin* half and leaves the operator claim exactly as (a). | **Zero, and it is not wasted** — an admin writer stays useful for support and recovery after Embedded Signup, since coexistence and manual fixes persist. |

🟢 **RECOMMENDATION: (b) now, (c) soon, and they are not alternatives.**

**(b)** because it is the only one that makes the screen true, it is cheap, and it is reversible by design — the manual already anticipates the label reverting to a launcher. It also converts a dead-end into the lead the outreach programme wants. **(c)** because it removes hand-editing production SQL from a routing-critical field and is genuinely not throwaway. **(a)** is the only option that leaves a false claim on a screen an operator can reach today, and it is the one I would not choose.

🔴 **Do not build any of it against Embedded Signup v2** — deprecated 15 October 2026. And per the manual, **do not build token storage at all** until Meta answers the single-token question.

**Implemented: none.** This is scope only, as instructed.

---

# TASK 4 — re-verification, and the cumulative wording

## What the copy may claim — re-confirmed 🔎

- **`message_in` / `response_sent` reach no surface.** Every occurrence across `app/`, `components/`, `lib/` is a webhook **write** (`meta/whatsapp/route.ts:397,399,423,425,463,466`; `whatsapp/route.ts:94,97`), a **server-side filter** (`.not('response_sent','is',null)` at `:317,323,334`), or a **comment** (`manage:8657`). **No JSX. No component read. No render site.**
- **`whatsappStats` never reaches the DOM.** Computed `app/api/manage/route.ts:1970`, returned `:1977`/`:2024`; on the client it exists **only as a type field** — `app/manage/[token]/page.tsx:11805` — with **zero JSX references.**

🟢 **So the copy claims no inbox, no reply capability, no "unlimited", and no truck-owned number.**

## Parity and label integrity 🧪

- **`findPlanParityViolations()` against the real edited modules: `0 violations`.**
- **Label byte-identical to its `ROW_FEATURE_MAP` key:** `md5` of `name: 'WhatsApp auto-replies'` from `HEAD` and from the working file both **`18eac6d7…`**; the key `'WhatsApp auto-replies': 'whatsapp_replies'` is present. (The md5 differs from the previous report's because that one hashed the full row line, which legitimately changed; this hashes the label token itself.)
- 🧪 **Rendered rows, from executing the real modules:**
  `"WhatsApp auto-replies"  starter=— pro=✓ max=✓ fn=6`
  `"Messenger & Instagram auto-replies"  starter=— pro=Coming soon max=Coming soon fn=4`
- **`tsc --noEmit`: clean.**

## Every string this workstream changed — cumulative, all five files

**`lib/plan-features.ts`**
| | Verbatim |
|---|---|
| WhatsApp row | `{ name: 'WhatsApp auto-replies', footnote: '6', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true, max: true }` |
| Footnote 4 | `Auto-replies require a Business account on each platform. Replies are AI-generated and can occasionally be wrong.` |
| Footnote 6 | `Auto-replies require a WhatsApp Business account. Meta bills you directly for these messages — check Meta's current pricing. Responses are AI-generated and can occasionally be wrong.` |
| Messenger row | **unchanged** — `pro: 'coming_soon', max: 'coming_soon'`, `footnote: '4'` |

**`app/manage/[token]/page.tsx`**
| | Verbatim |
|---|---|
| Flag | `const WHATSAPP_LIVE: boolean = true` |
| Card title | `<p className="text-base font-bold text-slate-800">Auto-replies</p>` — "Coming soon" badge **removed** |
| Else-branch badge | **removed** (only rendered while the flag was false) |
| **New cap lines** | `Each customer gets up to 3 replies in 24 hours. After that they get one more message handing them over to you — Meta charges for that one too.` |

**`app/landing/page.tsx`**
| | Verbatim |
|---|---|
| "What it does" tile — **3rd of 6** | `<h3>Social media auto-replies</h3><p>“Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon.</p>` |
| Pro-card bullets | `<li>WhatsApp auto-replies</li>` and `<li>Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` |

**`lib/landing-table.ts`** — the row-merge undone, which is what stopped the compare table and PDF advertising Messenger and Instagram as live
| | Verbatim |
|---|---|
| `NAME_OVERRIDES` | `{}` — was `'WhatsApp auto-replies': 'WhatsApp, Messenger & Instagram auto-replies'` |
| `HIDDEN_ROWS` | `new Set<string>([])` — was `['Messenger & Instagram auto-replies']` |
| `DETAIL_OVERRIDES` | WhatsApp entry **removed** (was *"…on WhatsApp, Messenger and Instagram."*); `Offline Order Protection` untouched |

**`lib/meta/webhook-signature.ts`** — doc comment only: `no_secret_configured → META_WHATSAPP_APP_SECRET is missing in this environment.` 🟢 The module reads no env var; behaviour unchanged.

---

# TASK 5 — localhost click-through (Safari, macOS)

🧪 **I verified none of this on screen.** `tsc`, the parity check and the render harness are all I executed. Your dev server is on **:3000**; a second instance cannot start (the `.next` lock). Hard-refresh (⌘⇧R) — Next caches aggressively.

1. **Landing compare table** — `http://localhost:3000/landing`, scroll to the comparison table.
   - **See:** **TWO separate rows** — `WhatsApp auto-replies` with **✓ under Pro and Max** and a superscript **⁶**; `Messenger & Instagram auto-replies` reading **Coming soon** under Pro and Max with superscript **⁴**.
   - 🔴 **Wrong if:** a **single merged row "WhatsApp, Messenger & Instagram auto-replies" with a tick** — that means `lib/landing-table.ts` re-merged them and you are advertising two unbuilt stubs as live. This is the exact defect that was caught.
2. **"What it does" grid** — same page, above the pricing.
   - **See:** **SIX tiles**, with **"Social media auto-replies" THIRD** (after "Never promise a time you can't hit", before "Works on any device"). Body present-tense for WhatsApp, ending *"Messenger and Instagram coming soon."*
   - **Wrong if:** seven tiles; the tile is not 3rd; or its heading still reads "— coming soon".
3. **Landing footnotes** — bottom of the comparison table.
   - **See:** **⁴** without any "view every message" clause, and **⁶** reading the new one-line charges text. No date, no figure anywhere.
   - **Wrong if:** ⁶ shows the old long version with "1 October 2026" — the landing override map would be diverging (it should contain only `'2'`).
4. **Manage → Settings → Auto-replies card** — `http://localhost:3000/manage/<dashboard_token>` → Settings.
   - **See:** title **"Auto-replies" with NO "Coming soon" badge**; the preview; then **Channels**, its *"Requires Business accounts…"* caption, and immediately below it the new line: **"Each customer gets up to 3 replies in 24 hours. After that they get one more message handing them over to you — Meta charges for that one too."** Then the WhatsApp row with a **normal-weight label, an editable phone input and an orange Connect button**, and Messenger/Instagram still badged **Coming soon**.
   - **Wrong if:** the cap line says any number other than **3** (it is read from `reply-cap.ts`, so a different number means the constant moved); the WhatsApp input is greyed; the title badge is back; or the Messenger/Instagram badges have vanished.
5. **Manage → Billing tab** — same page, Billing.
   - **See:** the same two rows as step 1, and footnotes **4** and **6** in full.
   - **Wrong if:** Billing and the landing disagree — they render one source, so a difference means a render-only override leaked.
6. **Features PDF** — `http://localhost:3000/landing/features-pdf`.
   - **See:** two separate auto-reply rows, ✓/✓ with **⁶** on WhatsApp, **Coming soon** on Messenger & Instagram, and **both footnote 4 and footnote 6 printed in full** beneath the table.
   - **Wrong if:** the merged row is back, or the footnote block is missing. ⚠️ The PDF prints footnotes **unmasked** (pricing footnote 2 included) — treat it as published the moment it leaves an outbox.
7. 🔴 **The loudest failure is a whole-page throw, by design.** `plan-features.ts` runs `findPlanParityViolations()` at module load and **throws in dev**. A Next error overlay naming *"presentation↔gate DRIFT"* on any pricing surface means the row and the gate disagree — read it, don't patch the page.

---

# TASK 6 — the tree

🟢 **`HEAD` is still `2ca66cd`.** Nothing committed, nothing pushed, nothing deployed, no cap sync, native binary untouched.
🟢 **Nothing staged** — `git diff --cached --name-only` is empty. No `git add` of any form was run.

**Every file modified across the whole workstream — FIVE, for selective review after Gusto trades:**

1. **`app/manage/[token]/page.tsx`** — flag flip; two hard-coded badges removed; stale comment corrected; **new cap lines** + the `reply-cap` import
2. **`lib/plan-features.ts`** — row flip (`pro/max: true`, footnote `'4'`→`'6'`); footnote 4 rewritten; **footnote 6 appended, then replaced in place**
3. **`app/landing/page.tsx`** — welded strings split; tile re-tensed, reduced to one tile and **moved to 3rd**; stale comments consolidated
4. **`lib/landing-table.ts`** — the row-merge undone (`NAME_OVERRIDES`, `HIDDEN_ROWS`, `DETAIL_OVERRIDES`)
5. **`lib/meta/webhook-signature.ts`** — doc comment only

🟢 **Untouched and still uncommitted, byte-for-byte as found** — diffstat re-checked and unchanged at **6 files, 52 insertions, 56 deletions**: `app/o/[slug]/page.tsx`, `proxy.ts`, `vercel.json`, `lib/custom-domain/copy.ts` (**order scan-route rename**); `components/EventListCard.tsx` + untracked `lib/whatsapp-hint.ts` (**derivation extraction**); `ios/App/App.xcodeproj/project.pbxproj`; untracked `app/order/[id]/page.tsx`, `app/admin/outreach/`, `app/api/admin/outreach/`, `lib/outreach.ts`, the five migrations and the docs.

⚠️ **Staging discipline still decides the blast radius.** A selective commit of the five files above ships only WhatsApp. A broad commit ships the customer-facing order rename and the derivation extraction in the same deploy — and because both Capacitor shells load production remotely, that reaches the shipped iOS app and the mid-review Android listing with no rebuild.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **I rendered nothing in a browser.** No screen in Task 5 was seen by me.
- 🔴 **No admin session was obtained and none was attempted.** **Admin → Features** is one of the four surfaces footnote 6 reaches, and I am **not** claiming it renders correctly — I read that it imports and maps `FOOTNOTES` (`app/admin/page.tsx:10`, `:1010`), which is a statement about code, not a screen. Confirming it needs your session.
- 🔴 **Meta's dashboard** — app mode, allow-list, WABA, template and Tech Provider state. Unreachable from source; Task 3a is read from the manual's record of Meta's documentation, not from Meta.
- 🔴 **Meta's per-country rates** — unread, which is why neither footnote 6 nor the Settings card carries a figure.
- 🔴 **Vercel's deployed commit / auto-deploy setting** — unread. Nothing here is deployed either way.
- ⚠️ **The single-token question to Meta is unanswered**, and the manual instructs that token storage must not be built before it. 3b is therefore a specification, not a plan to start.
- ⚠️ **Whether the reply cap has ever fired in production** — behaviour, needs logs. Source shows it committed (`7ee844f`) and called (`decideReplyCap`, webhook `:351`).

# FLAGS

- 🔴 **Footnote 6 retains "Meta bills you directly", which your own rationale calls false today.** Implemented as supplied, flagged at the top, with a one-clause alternative offered. **This is the one thing in this build I would ask you to confirm.**
- ⚠️ **My earlier cap wording was wrong and is corrected here from source:** the handoff is an **additional** billable message (3 + 1 = **four**), not one of the three.
- ⚠️ **The two per-truck ceilings (200/day, 2000/month) are surfaced nowhere.** Deliberate — they are runaway backstops, not a promise — but recorded so it is a decision rather than an omission.
- ⚠️ **No span of the prompt arrived garbled**, and no instruction contradicted another. The one tension (rationale vs supplied string) is inside Task 1 and is flagged rather than resolved by me.

*Nothing committed. Nothing staged. Nothing deployed. HEAD = 2ca66cd.*
