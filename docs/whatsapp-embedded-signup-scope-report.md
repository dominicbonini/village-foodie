# Embedded Signup — inventory and staged scope

**4 September 2026. DIAGNOSE AND SCOPE ONLY. NOTHING BUILT, nothing changed, nothing committed, staged, pushed, deployed or cap-synced. Native binary untouched. `git add -A` / `git add .` never run. Live production commit is `2ca66cd`.**

**The target this is scoped against, restated so nothing drifts:** an operator opens Manage → Settings, presses **Setup**, Meta's **Embedded Signup** wizard launches, and they onboard **their own existing WhatsApp Business number** — **coexistence**, keeping the number in the WhatsApp Business app on their phone. Inbound to that number fires our auto-replies. **Embedded Signup is a hard requirement.** No HatchGrab-owned number, no shared platform number, no workaround. Scoped for **one truck: `pizzeria-gusto`.**

**Method:** 🔎 **SOURCE-READ** = I read the repo/manual and quote it. 🧪 **BEHAVIOUR-VERIFIED** = observed running. **Nothing in this report is behaviour-verified — I ran no code, opened no dashboard, and obtained no admin session.** Every "absent" below names the patterns searched.

---

# PART 1 — WHAT EXISTS

## 1a. Embedded Signup launcher — 🔴 **ABSENT**
Searched `app/`, `components/`, `lib/`, `public/` for: `FB.login`, `fbAsyncInit`, `connect.facebook.net`, `facebook.*sdk`, `FB.init`, `embedded.?signup` (case-insensitive).
**Every hit is a comment anticipating it**, never code: `manage:9693` (*"Once Embedded Signup exists, Connect becomes…"*), `manage:9803` (*"this control becomes the Embedded Signup launcher"*), `webhooks/meta/whatsapp:292`, and four doc comments in `connection-state.ts`. **No SDK load, no `FB.login` call, no exchangeable-code capture.**

## 1b. Code→business-token exchange route — 🔴 **ABSENT**
Searched `app/api/`, `lib/` for: `oauth`, `exchange.*code`, `access_token.*exchange`, `grant_type`, `client_secret`, `redirect_uri`.
**All hits are unrelated:** `lib/fcm.ts` (Google OAuth2 for Android push) and `lib/payments/authorize.ts` (Stripe `client_secret`). **No Meta exchange exists.**

## 1c. Meta OAuth callback handler — 🔴 **ABSENT**
Same search plus `/callback`. **No route under `app/api/` handles a Meta redirect.**

## 1d. Per-truck Meta business-token storage — 🔴 **ABSENT, in all four forms**
Searched `app/`, `lib/`, `supabase/migrations/` for: `business_token`, `whatsapp_connections`, `encrypt`, `aes-256`, `createCipher`, `cipher`.
**No table, no migration, no column, and no encryption module.** The only `cipher`-adjacent hits are CAA-record parsing in `lib/custom-domain/dns.ts`. 🔴 **This codebase has never stored a third-party credential** — Stripe Connect stores an *identifier* and calls with the platform key.

## 1e. WABA id — ⚠️ **PLATFORM-LEVEL ONLY, no per-truck column**
`META_WHATSAPP_BUSINESS_ACCOUNT_ID` is an **env var** (`lib/meta-whatsapp.ts:124`, `requireConfig()` at `:153-168`), used only by the template tool (`:217`, `:353`). `connection-state.ts:42` declares a `wabaId` field **in a pure type**, not a column. **No migration adds a WABA column to `trucks`.**

## 1f. Writer for `trucks.phone_number_id` — 🔴 **ABSENT (re-confirmed)**
Searched `app/`, `lib/`, `supabase/` for `phone_number_id` co-occurring with `update(`, `insert(`, `upsert(`, `set_`. **Zero write sites.** All 16 references are the webhook's **read** path plus comments. The column's own migration comment says it: *"Set by hand: there is no UI."*

## 1g. Connection-state machine — 🟢 **EXISTS, and is usable as-is**
`lib/whatsapp/connection-state.ts`. 🔎 **Imported by nothing** — searched `app/`, `lib/`, `components/` for `connection-state`: only the file itself.

**Six states, derived in a deliberately order-sensitive way:**
```ts
if (!input.wabaId)                       return 'not_connected'
if (input.tokenRevokedAt)                return 'revoked'
if (!input.phoneNumberId)                return 'onboarding_incomplete'
if (!input.tokenPresent)                 return 'token_missing'
if (input.paymentMethodPresent === false) return 'awaiting_payment_method'
return 'ready'
```
Plus `canSendWhatsApp` (a single equality — `state === 'ready'`, so a new state fails closed), `needsOperatorAction`, `needsSupportAttention`, `shouldOfferSignup`, `shouldOfferReauthorise`.

🟢 **Usable as-is, and it is more valuable than it looks: its input interface is effectively the storage spec.** `WhatsAppConnectionInput` names exactly what must be persisted — `wabaId`, `phoneNumberId`, `tokenPresent` **(a boolean, never the token — it is client-importable and says so)**, `tokenRevokedAt`, `paymentMethodPresent` (**`null` = unread, not absent**). Building storage against this type is the cheapest correct start.

## 1h. Admin template tool — 🟢 **BUILT, both verbs; CREATE has never run**
`app/admin/whatsapp-templates/page.tsx` + `app/api/admin/whatsapp-templates/route.ts`, `verifyAdmin(req)`-gated, platform credential only.
- **GET** — preflight + `listMessageTemplates` (`route.ts:40,68`).
- **POST** — `createMessageTemplate` (`route.ts:84,116`), reporting Meta's returned status.

🔴 **The CREATE code exists and is wired; it has simply never been executed.** Manual `:11325` — *"create is a different endpoint and has **never** [executed]"* — and `:13768` — *"The template CREATE call has never executed — **the last unproven technical piece before filming**."* Only a LIST has succeeded (`:10479`). **This is a source-read of the manual's record, not something I can behaviour-verify.**

## 1i. `lib/meta-whatsapp.ts` — how sending authorises today
```ts
export async function sendMetaWhatsApp(to, message, phoneNumberId) {
  const res = await fetch(`${GRAPH_BASE_URL}/${phoneNumberId}/messages`, {
    headers: { 'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}` , … }
```
🔴 **The asymmetry that defines the whole job:** the URL addresses a **per-truck `phoneNumberId`**, while the `Authorization` header is **one platform token** (`META_WHATSAPP_ACCESS_TOKEN`).

**Every call site** (searched `sendMetaWhatsApp` and `from '@/lib/meta-whatsapp'`):
| Site | Purpose |
|---|---|
| `webhooks/meta/whatsapp/route.ts:418` | the cap **handoff** message |
| `webhooks/meta/whatsapp/route.ts:478` | the **auto-reply** |
| `app/api/admin/whatsapp-templates/route.ts:28` | imports the template functions (not the sender) |

**Two send call sites, both in the webhook.** Swapping the credential is therefore a small, well-bounded change — which is why the manual calls Embedded Signup *"an addition inbound and a rewrite outbound"*.

### Inventory summary
| | State |
|---|---|
| Launcher, exchange, callback, token storage, WABA column, `phone_number_id` writer | 🔴 **all absent** |
| Connection-state machine | 🟢 built, unimported, usable |
| Template tool (LIST + CREATE) | 🟢 built; **CREATE never run** |
| Sender | 🟢 works, on the **platform** credential |
| Inbound webhook + routing + classifier + cap | 🟢 built and (per manual) observed working end-to-end |

**Read plainly: the inbound half is done. The entire outbound-identity half — launcher, exchange, storage, per-truck auth — is unbuilt.**

---

# PART 2 — WHAT IS OUTSTANDING

## 2a. Meta dashboard steps that are yours, in order

🔎 The manual is explicit that this is not one form: *"THERE IS NO SINGLE 'TECH PROVIDER APPLICATION'. It is a **state reached by completing separate steps, each with its own review**."*

| # | Step | Blocked by | Unblocks |
|---|---|---|---|
| **M1** | **`public_profile` at Advanced access** | Must be requested **alongside at least one other supported business permission** — a pairing rule, *"not a reason to add scope"* | Required before Facebook Login for Business can go live |
| **M2** | 🔴 **Facebook Login for Business configuration** — login variation ***WhatsApp Embedded Signup***, asset ***WhatsApp accounts***, **only** the two WhatsApp permissions | M1 | 🔴 **Everything.** *"This is the component that mints business tokens; Embedded Signup cannot exist without it."* No launcher code can function before it |
| **M3** | **Run the template CREATE once** (existing admin tool, platform WABA) | Needs an **admin session** — see the flag below | Makes the second recording filmable |
| **M4** | **Film the two recordings** — (a) a message sent **from our app**, received in the WhatsApp client; (b) **our app creating a message template** | (a) is already achievable — inbound→reply was observed end-to-end on `test-truck`; (b) needs M3 | App Review submission |
| **M5** | **App Review: `whatsapp_business_management` at Advanced** | M4 | Template management; completes step 4 of the chain |
| **M6** | **Tech Provider status** | Reached by completing M1–M5 (a *state*, not an application) | 🔴 **Coexistence** — which the manual names as a prerequisite in its own right |
| **M7** | **Access Verification** | — | ⚠️ **Not blocking.** Only raises onboarding from **10 per rolling 7 days → 200** |

### 🔴 THE FLAGGED BLOCKER — and it is smaller than it looks
`whatsapp_business_management` review requires a recording of **a template being created from our app**, and **CREATE has never executed on any version**.

🟢 **It is still a blocker, but not a build blocker — the code is already written and admin-gated.** `POST /api/admin/whatsapp-templates` → `createMessageTemplate` exists at `route.ts:116`. **The smallest path through is to run it once** against the platform WABA, confirm Meta returns a status, then film that same screen. **No new code.**

⚠️ **Two honest caveats.** (1) 🔴 **I cannot run it — it is `verifyAdmin`-gated and I have no admin session.** I am not claiming the tool works; I am reporting that the code path exists. (2) The manual's own rule applies: *"The first authenticated call must not be the one on camera"* — so run it once to prove it, then film a second, clean run.

## 2b. Code to build, in dependency order

Each stage is commissionable on its own.

| Stage | What it does | Depends on | What proves it works |
|---|---|---|---|
| **S1 — Storage** | `whatsapp_connections` table (one row per truck): `waba_id`, `phone_number_id`, encrypted token, `token_revoked_at`, `payment_method_present`. RLS on, anon/authenticated revoked. Encryption module + key. | Decision 2c-i; ideally Meta's single-token answer | Row written and read back; token column unreadable without the key; the table is **not** reachable by the `select('*')` reads on `trucks` |
| **S2 — State read** | Server read → reduce to `WhatsAppConnectionInput` (**token → boolean**) → `deriveWhatsAppConnectionState` → expose to Settings | S1 | Each of the six states renders its correct affordance; **no token ever reaches the client payload** |
| **S3 — Setup control** | Replace Connect with **Setup**, driven by `shouldOfferSignup`/`shouldOfferReauthorise`. 🔴 **Decoupled from `saveWhatsappSender`** — see 3d | S2 | Pressing Setup always acts, including when the number field is untouched |
| **S4 — Launcher** | Meta JS SDK, `FB.login` with the Embedded Signup config, capture the exchangeable code, POST it to us | 🔴 **M2** (config must exist) + S3 | Wizard opens; a code reaches our server. **Cannot be tested before M2** |
| **S5 — Exchange** | Server route: code → **business token**, plus `waba_id` and `phone_number_id`; write via S1 | S4, **M6** | A real token stored for `pizzeria-gusto`; state derives `ready` |
| **S6 — `phone_number_id` writer** | Written by S5 as part of the exchange. Plus a **small admin-only writer** for support/recovery | S1 | Column populated without hand-editing SQL; the **partial unique index** (`WHERE phone_number_id IS NOT NULL`) rejects a duplicate |
| **S7 — Per-truck send** | `sendMetaWhatsApp` takes the truck's token instead of `META_WHATSAPP_ACCESS_TOKEN`. **Two call sites** | S5 | A reply to `pizzeria-gusto`'s own number sends on **their** credential |
| **S8 — Retire the fallback** | Remove the `whatsapp_sender` TO-based lookup once every WhatsApp truck has a `phone_number_id` | S6 — see 3e | Routing is `phone_number_id`-only; the fallback warn stops firing |

🟢 **S1–S3 can be built and tested before Meta approves anything.** S4 onward cannot.

## 2c. Decisions before building

**i. Where the business token is stored, and how.** 🔴 **This is the one that must be settled first.**
- **(a) A column on `trucks`** — 🔴 **Reject.** `app/api/dashboard/route.ts:92-93` and `app/api/manage/route.ts:162` read that row with **`select('*')`**; `dashboard/route.ts:189` names the pattern in its own comment. A token column would be returned by live routes the moment it exists, and **a redaction list fails by omission, silently** — the V12.1 `dashboard_token` class exactly.
- **(b) A dedicated `whatsapp_connections` table + app-level AES-256-GCM** — the manual's recommendation, *"and the separate table matters as much as the encryption"*, precisely because of those `select('*')` reads. **Cost:** a new table, a new encryption module, and **a key to hold and rotate — operational surface this repo does not have today.** ⚠️ State it honestly: *"App-level encryption is not protection against a compromised process; it raises the bar on dumps, backups and exports."*
- **(c) A secrets manager** — strongest, but new infrastructure and a second place credentials live.
🟢 **Recommend (b)**, shaped against `WhatsAppConnectionInput`.

**ii. Whether token refresh is needed.** 🔴 **Cannot be decided from the repo.** It depends on the **token-expiration setting on the Facebook Login for Business screen — which has never been read** (manual `:11279`, `:13772`). **If tokens expire, S1 needs an expiry column and S2 a refresh path; if they do not, both disappear.** ⚠️ **Read it off the screen before designing storage — do not take a number from a third-party integration guide.**

**iii. Ask Meta the single-token question.** *"Whether a single platform token can address all WABAs our app is Tech Provider for… a yes deletes the entire token-storage design. **Do not build token storage before the answer.**"* ⚠️ Evidence has **strengthened against** it — Tech Providers use business tokens *"exclusively"* — so **plan on no**, but ask it as part of the process.

---

# PART 3 — CONSTRAINTS

**3a. v2 deprecation — 15 October 2026, 41 days.** 🟢 **Confirmed, and the plan targets v4.** Manual: *"Embedded Signup v2 is deprecated 15 October 2026 — **build v4**."* ⚠️ **What differs is not readable from this repo** — no Embedded Signup code exists in any version to diff against, and Meta's v2→v4 changes are in their documentation, which I have not read. 🔴 **Do not scope against a v2 integration guide.** This date lands **before** M1–M6 could realistically complete, so v4 is the only sane target.

**3b. Coexistence prerequisites.** The operator's phone must run **WhatsApp Business app 2.24.17 or higher**, and 🔴 **we must already hold Solution Partner or Tech Provider status.** So coexistence — the thing that lets Gusto keep their number on their phone — **is gated behind the entire M1–M6 chain.** It is not a switch at the end; it is the reason the chain must complete.

**3c. Business tokens, scoped per customer.** *"Tech Providers use business tokens **exclusively**."* **What that forces:** one credential **per onboarded truck**, not one for the platform — so storage is **per-row and mandatory**, `sendMetaWhatsApp` must take the truck's token (S7), and revocation is per-truck (hence `tokenRevokedAt` in the state machine). 🔴 **The token-expiration setting has NEVER been read** — manual `:11279`: *"STILL UNREAD: the token-expiration setting on the Facebook Login for Business configuration screen"*, and it is listed again at `:13772` among the unobserved. **Decision 2c-ii is blocked on it.**

**3d. 🔴 The Connect landmine — confirmed, quoted.**
```js
const lastSavedSender = useRef(truck.whatsapp_sender ?? '')
const saveWhatsappSender = async () => {
  if (whatsappSender === lastSavedSender.current) {
    showToast('WhatsApp number saved')
    return
  }
  …
```
The button is `onClick={saveWhatsappSender}` (`manage:9812`). **So an operator who presses Setup without editing the field hits the early `return` and gets a "WhatsApp number saved" toast — and no wizard.** Worse than the original bare `return` it replaced: that was visibly nothing; this is a **success message for something that did not happen**.

**What has to change:** the Setup control must **not route through `saveWhatsappSender` at all.** Launching a wizard is not a save. It needs its own handler that launches unconditionally, independent of the field's value. The save-on-blur may stay on the number input; **the button must be decoupled.** ⚠️ And the toast must go with it — *"WhatsApp number saved"* is the wrong sentence for a flow that is about to hand the operator to Meta.

**3e. `whatsapp_sender` and the TO-based fallback once `phone_number_id` is written.**
🔎 The fallback's own comment sets its retirement condition: *"It is a bridge, not a second routing rule — **delete it once every WhatsApp truck has a phone_number_id**."*

**Answer: it becomes dead for Gusto, stays needed until every WhatsApp truck is migrated, and is dangerous throughout.** Dangerous because 🔴 **`whatsapp_sender` carries no unique index** (unlike `phone_number_id`'s partial unique index), so two trucks sharing a variant makes `maybeSingle()` error — the route logs *"A 'more than one row' error here means two trucks share a whatsapp_sender variant."* At the target's scale (**one truck**) the fallback is unnecessary the moment S5/S6 writes Gusto's `phone_number_id`. **S8 removes it; until then it is a live ambiguity, not a harmless leftover.**

**3f. The operator's payment method.** 🔴 *"Onboarded trucks must add a payment method to their own WhatsApp Business account — a wizard friction step that cannot be removed."* **Where it sits:** inside **Meta's** wizard, not ours — we cannot skip, pre-fill or bypass it. **If they skip it,** the connection completes on our side but Meta reports no payment method, and the state machine already models exactly this: `paymentMethodPresent === false` → **`awaiting_payment_method`**, which `needsOperatorAction` returns true for and `canSendWhatsApp` returns false for. ⚠️ **`null` means UNREAD, not absent** — the machine's comment insists an unread value must never be rendered as *"you have not paid"*. 🟢 **This case is already designed; it just needs the data.**

**3g. The 10-per-7-days onboarding cap.** 🟢 **Confirmed** (manual `:11123`, `:10645-10646`): capped at **10 new business customers per rolling 7 days**, rising to **200** once Business Verification, App Review **and** Access Verification are all complete. 🟢 **It constrains nothing at this scale — the target is one truck.** Access Verification (M7) can be left until after Gusto is live.

---

# PART 4 — THE SHORTEST HONEST PATH TO ONE WORKING TRUCK

**Interleaved, in the order I would actually run it:**

1. **Read the token-expiration setting** on the Facebook Login for Business screen. *Unblocks decision 2c-ii and the shape of S1.* Minutes, and it is currently blocking a design choice.
2. **Ask Meta the single-token question** in writing, as part of the process. *Do not wait on the answer — plan on "no" — but ask it before building storage.*
3. **Request `public_profile` at Advanced access** (M1), paired with a business permission.
4. 🔴 **Configure Facebook Login for Business** (M2) — variation *WhatsApp Embedded Signup*, asset *WhatsApp accounts*, only the two WhatsApp permissions. **Nothing in S4+ can be tested until this exists.**
5. **Run the template CREATE once** via the existing admin tool (M3) — needs your admin session. Then film both recordings (M4), the send one being already achievable.
6. **Submit `whatsapp_business_management` App Review** (M5). ⏳ **Then wait.**
7. **While waiting — build S1, S2, S3.** Storage, the state read, and the Setup control are entirely ours and need no Meta approval. **This is the only parallelism available.**
8. **On approval → Tech Provider status (M6)**, which is also what unlocks **coexistence**.
9. **Build S4 → S5 → S6**: launcher, exchange, `phone_number_id` written by the exchange.
10. **S7** — point `sendMetaWhatsApp` at Gusto's token (two call sites).
11. **Onboard `pizzeria-gusto` through the wizard**, on their own number, with their payment method added inside Meta's flow.
12. **Send a real customer message to their number** and confirm the auto-reply. **S8** — retire the fallback.

**🔴 The longest pole: Meta App Review for `whatsapp_business_management`** — and it is longer than its own duration, because it is **gated behind a recording that cannot be filmed until the CREATE call has been run at least once**, and *"a rejection costs the full 20 days again."*

**What cannot start until Meta approves something:**
- **S4 (launcher) cannot be tested** — arguably cannot be meaningfully written — until **M2** exists. There is no configuration for `FB.login` to point at.
- **S5 (exchange) cannot mint a business token** until **Tech Provider status (M6)**.
- **Coexistence is unavailable** until M6 — so *"keeps their number on their phone"*, the actual requirement, is downstream of the entire chain.
- **S1–S3 are unblocked today.**

⚠️ **And the hard date sits across all of it: Embedded Signup v2 dies 15 October, in 41 days. Target v4 from the first line of S4.**

---

# PART 5 — THE TREE

🟢 **`HEAD` is `2ca66cd`.** Nothing committed, nothing pushed, nothing deployed, no cap sync, native binary untouched.
🟢 **Nothing staged** — `git diff --cached --name-only` empty. No `git add` in any form.
🟢 **Nothing changed by this task** — it was diagnose-only, and the diffstats are byte-for-byte what they were at the end of the previous build:

| Group | Diffstat |
|---|---|
| The five WhatsApp copy files | `5 files changed, 194 insertions(+), 65 deletions(-)` |
| **Pre-existing, untouched** — order rename (`app/o/[slug]/page.tsx`, `proxy.ts`, `vercel.json`, `lib/custom-domain/copy.ts`), derivation extraction (`components/EventListCard.tsx`), `ios/App/App.xcodeproj/project.pbxproj` | `6 files changed, 52 insertions(+), 56 deletions(-)` — **identical to every prior check** |
| Untracked (outreach, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, migrations, docs) | **42 entries, all still untracked and unstaged** |

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Meta's dashboard — none of it.** App mode, the allow-list, the WABA, the Facebook Login for Business screen (**including the token-expiration setting**, which decision 2c-ii depends on), template status, Business Info completeness. **Part 2a is read from the manual's record of Meta's documentation, not from Meta.**
- 🔴 **Meta's v4 Embedded Signup documentation.** I confirmed the deprecation date from the manual; **what actually differs between v2 and v4 I have not read**, and no code exists here to diff. Scope v4 from Meta's current docs, not from this report.
- 🔴 **No admin session, and none attempted.** This blocks **M3 directly** — I cannot run the template CREATE, and I am **not** claiming the admin template tool works. I read that the code path exists (`route.ts:84,116`); whether it succeeds against Meta is unproven, and the manual says so too.
- 🔴 **Whether the CREATE call has ever executed** is a **manual record** (`:11325`, `:13768`), not something I verified.
- ⚠️ **The inbound path "observed working end to end"** is likewise the manual's record of a 20 August test on `test-truck`, not something I saw.
- ⚠️ **I ran no code at all this task** — no `tsc`, no probes. It was scoping only, and nothing was edited to typecheck.

# FLAGS

- ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**
- 🔴 **The `saveWhatsappSender` early-return (3d) is the single cheapest thing to get wrong** and the one most likely to be missed, because the control already "works": it will report success for a wizard that never opened.
- 🔴 **Decision 2c-ii is blocked on a screen nobody has opened.** Storage shape depends on whether tokens expire, and that setting has never been read.
- ⚠️ **`connection-state.ts` is the most valuable asset in the inventory** — it is built, correct, unimported, and its input type is a ready-made specification for S1. Build storage against it rather than designing a schema afresh.

*Nothing built. Nothing changed. Nothing committed. Nothing staged. HEAD = 2ca66cd.*
