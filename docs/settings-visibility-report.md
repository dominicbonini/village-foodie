# Settings visibility — the Danger Zone diagnosis, and two builds

**Date:** 25 August 2026
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **NOTHING IS OBSERVED ON A DEVICE.** I ran `npx tsc --noEmit` and a set of source scans. I did not
run `next dev`, did not deploy, and did not open the app on any hardware. **Tasks 2 and 3 are written
and unverified in behaviour.**

✅ **NO NATIVE CHANGE ANYWHERE.** No `Info.plist`, no entitlement, no Swift, no Capacitor config was
touched by any task. All three are web changes that reach the device by deploy.

---

# §1 — TASK 1 (READ ONLY): WHY THE DANGER ZONE IS ABSENT IN THE SHELL

🔴 **THE HYPOTHESIS IS CONFIRMED — AND IT IS WORSE THAN STATED, BECAUSE THE FIX PATTERN ALREADY EXISTS
IN THIS CODEBASE AND THIS ROUTE ALONE DOES NOT USE IT.**

**Nothing was changed. The fix is described in §1.6 and was NOT implemented.**

## 1.1 THE EXACT REQUESTS

`components/manage/DeleteAccountSection.tsx`:

```tsx
  L99   fetch('/api/account/request-deletion')                       // GET, on mount
  L136  fetch('/api/account/request-deletion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },           // ← the ONLY header
          body: JSON.stringify({ confirm: 'DELETE' }),
        })
```

🔴 **BOTH ARE BARE. Neither carries an `Authorization` header.**

## 1.2 HOW THAT ROUTE AUTHENTICATES

`app/api/account/request-deletion/route.ts` — **one resolver, used by GET and POST**:

```ts
async function resolveOperator() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!authUserId) return null
  … .from('operators').eq('auth_user_id', authUserId).maybeSingle()
}
```

`lib/supabase/server.ts` is **`cookies()` and nothing else** — a grep for `Authorization`, `Bearer` and
`headers()` in it returns **nothing**.

🔴 **AND THE ROUTE FILE CONTAINS THE STRING `authorization` EXACTLY ZERO TIMES.**

## 1.3 🔴 WHAT IS DIFFERENT ABOUT THIS ONE — THE PART THAT REFUTES "COOKIE-ONLY IS JUST HOW IT IS"

**There are two working patterns in this app, and the deletion route belongs to neither.**

**Pattern A — token-authenticated. Most of Manage.** `/api/manage`, `/api/manage/commit-menu` and
`/api/stripe/connect` all resolve the truck from `dashboard_token` in the request body
(`.eq('dashboard_token', token)`). **No session is required, so the shell's lack of a cookie is
irrelevant.** That is why the rest of Manage works on the iPad.

**Pattern B — session-authenticated WITH a Bearer fallback.** Seven routes read the header directly:

```
  app/api/auth/me · update-profile · change-email · resend-verification · cancel-email-change ·
  post-login · admin/create-operator      (plus native/my-trucks, native/switch-truck)
```

`app/api/auth/me/route.ts` is the canonical shape, and its comment states the intent:

> *"ADDITIVE (native app): no cookie, but sends its Supabase session as a Bearer so is_admin + identity
> flow to the app. Only reached when there's no cookie user AND an Authorization header is present; a
> browser never enters this branch."*

**And every one of those callers in `app/manage/[token]/page.tsx` sends `nativeAuthHeader()`** — L467,
L486, L11964, L11977, L12009, L12029, all six.

🔴 **`/api/account/request-deletion` IS THE ONLY AUTH-GATED ROUTE IN THE APP WITH NEITHER A TOKEN PATH
NOR A BEARER PATH — and `DeleteAccountSection` is the only session-dependent caller that sends no
header. Both halves are missing. Fixing either one alone does nothing.**

## 1.4 🔴 CAN IT RENDER NOTHING WITHOUT LOGGING ANYTHING? — **YES. IT FAILS COMPLETELY SILENTLY.**

```tsx
  fetch('/api/account/request-deletion')
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then(data => { setSummary(data); setLoadFailed(false) })
    .catch(() => setLoadFailed(true))          // ← swallowed whole
  …
  if (loadFailed || !summary) return null      // ← renders nothing
```

🔴 **A grep for `console.` across the entire component returns NOTHING.** The 403 is rejected into a
`.catch` that discards the error, sets a flag, and the component returns `null`. **No log, no toast, no
empty state, no trace anywhere.** The parent's gate (`userRole === 'owner'`) *passes* — `userRole`
falls back to `'owner'` when `getUser()` is null — so the failure is entirely inside the child.

⚠️ **This is exactly why the device observation was needed: the source gives no signal at all.**

## 1.5 🔴 SIBLINGS — THE PART YOU CARE ABOUT MOST

**The silent-absence shape is: (a) bare `fetch`, to (b) a route with no token path and no Bearer path,
in (c) a component that returns `null` on failure. I checked all three legs across the app.**

**Every bare fetch to a session-dependent route:**

| Caller | Route | Route auth | Consequence in the shell |
|---|---|---|---|
| `DeleteAccountSection` L99, L136 | `/api/account/request-deletion` | 🔴 **cookie only — no token, no Bearer** | 🔴 **SILENT DISAPPEARANCE** |
| `app/dashboard/[token]/page.tsx:854` | `/api/auth/update-profile` | Bearer fallback **exists**; caller sends none | ⚠️ **A FAILING ACTION, NOT A DISAPPEARANCE** — the dashboard's profile-name save. It has error handling, so it surfaces; it does not vanish. **A real sibling of the same family with a different symptom.** |
| `app/manage/[token]/page.tsx:3404` | `/api/manage/commit-menu` | ✅ **token-authed** (`.eq('dashboard_token', token)`, 401 if absent) | ✅ **Works.** The cookie user is best-effort actor attribution only — `catch { /* token-only import */ }`. |

**Components that return `null` on a fetch result:** I enumerated every `return null` in
`components/manage/` and `components/dashboard/`. All are legitimate empty-state guards
(`if (!open)`, `if (vans.length <= 1)`, `if (!breaches.length)`, …). **`PaymentsTab` returns null at
`!status?.accountId || !publishableKey`, but its data comes from `/api/stripe/connect`, which is
token-authed — so it does not disappear in the shell.**

✅ **CONCLUSION: `DeleteAccountSection` is the ONLY instance of the full silent-disappearance shape.**
🔴 **It has exactly one sibling of the wider family — the dashboard's profile save — and that one
fails loudly rather than invisibly.** ⚠️ **Read from source; neither behaviour observed.**

## 1.6 THE SMALLEST CORRECT FIX — ✅ **WEB-ONLY. DEPLOYABLE. NO REBUILD.** *(NOT IMPLEMENTED)*

**Two edits, both existing patterns, neither native:**

1. **`components/manage/DeleteAccountSection.tsx`** — send the header the other six session callers
   already send: `nativeAuthHeader()` from `lib/native/session` on both fetches. **Returns `{}` on web,
   so web behaviour is unchanged.**
2. **`app/api/account/request-deletion/route.ts`** — give `resolveOperator()` the same Bearer fallback
   `app/api/auth/me/route.ts` already has: if no cookie user and an `Authorization: Bearer` is present,
   `supabase.auth.getUser(jwt)`.

🔴 **BOTH ARE NEEDED. Neither alone changes anything** — a header nobody reads, or a reader nobody
sends to.

⚠️ **A third, non-blocking improvement I did not include in "smallest": log the failure.** A component
that can vanish without a trace will hide the next instance of this too.

⚠️ **CONFIRMED WEB-ONLY:** no `Info.plist` key, no entitlement, no Capacitor config and no Swift is
involved. The shell loads the deployed URL, so a deploy carries both edits to the device.

---

# §2 — TASK 2 (BUILD): THE AUTO-REPLIES SECTION IS HIDDEN NATIVELY

✅ **The WHOLE card is wrapped, heading included** — `app/manage/[token]/page.tsx`:

```
  L9251   {!isNativeApp() && (
  L9252   <Card className="p-4 space-y-3">        ← the card carrying the "Auto-replies" heading
   …                                                 the preview, and the Connect subsection
  L9427   </Card>
  L9428   )}
```

✅ **MECHANISM, AS REQUIRED: `isNativeApp()`** — imported at L63 from `lib/native/device`, the **same**
helper the WhatsApp Channels/Connect block already uses at L9322. Its body is
`typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()`.

🔴 **NOT `purchaseCtaAllowed()`** — recorded at the site: that predicate answers a 3.1.1 **commerce**
question and deliberately does not re-export `getPlatform()`; using it to hide a messaging feature would
make the policy unreadable.

✅ **No empty box is left behind.** The wrapper is outside the `<Card>`, so the border, the padding and
the "Auto-replies" title all go with it.

✅ **ALL account types, ALL plans** — the condition is platform only; there is no role or plan term.

✅ **WEB IS UNCHANGED.** `isNativeApp()` is false in every browser, so the card renders exactly as
before. ✅ **Nothing was deleted** — a scanner over code (comments excluded) confirms
`<WhatsAppReplyPreview` is still present, and `WHATSAPP_LIVE` is untouched. **Removing the wrapper
restores the section unchanged when provisioning ships.**

## 2.1 ⚠️ A COMMENT THAT NOW SAID THE OPPOSITE — REVERSED, NOT DELETED

The line above `<WhatsAppReplyPreview />` read *"🔴 OUTSIDE THE NATIVE HIDE, AND IT MUST STAY THAT WAY …
renders on iPad regardless of what isNativeApp() returns"* and *"DO NOT PULL IT INSIDE THE WRAPPER"*.

**That reasoning was sound and its premise is gone.** It guarded against the V11.18 orphaning failure —
hiding the preview while leaving the title. **The card's own wrapper now hides the title too**, so there
is no orphan to guard against. The comment records the reversal and why, rather than being removed.

⚠️ **The inner `{!isNativeApp() && (<>` at L9322 is now redundant and was deliberately LEFT IN PLACE.**
Removing it changes nothing on either platform and would mean editing the Connect subsection, which this
task does not own. **Reported, not tidied.**

---

# §3 — TASK 3 (BUILD): THE BILLING COPY

## 3.1 (a) THE EXACT NEW WORDING

```
  Billing is managed by HatchGrab
  During early access we set up and adjust plans manually. There is nothing to configure here.
```

**It was:** *"Payment setup coming soon / We're setting up our payment system. During early access,
billing is handled manually. We'll contact you when automated billing is ready."*

✅ **PRESENT TENSE ONLY. NO "COMING SOON". NO PROMISE.** A code-only scan confirms the string
`coming soon` now appears **zero** times in `BillingTab`'s code (it survives only inside the comment
recording the change, and in an unrelated `Badge label="Coming soon"` on the Messenger row, which is
inside the natively-hidden Auto-replies card and was not in scope).

✅ **No claim is made that automated billing is arriving**, because none can be made. The last sentence
tells the operator what to *do* — nothing — which is the question the old copy left open.

## 3.2 (b) THE GATE, AND THE NEW TOTAL

```tsx
  {purchaseCtaAllowed() && (
  <div className="bg-amber-50 …">   … the rewritten block …   </div>
  )}
```

✅ **TWELVE CALL SITES.** Counted with a line-by-line comment scanner, not a regex — my first regex
under-counted and its numbers are withdrawn:

```
  app/manage/[token]/page.tsx   10 → 11
  components/FeatureGate.tsx     1 →  1
  TOTAL                         11 → 12
```

✅ **THE ELEVEN EXISTING SITES ARE UNTOUCHED** — all ten pre-existing manage-page expressions are
present verbatim after the change, and `FeatureGate.tsx` was not opened.

✅ **`purchaseCtaAllowed()` is the right predicate here and the comment says why:** this block describes
payment **mechanics**, the 3.1.1 subject — as against the Auto-replies hide, which is a 2.1 completeness
question about a messaging feature. **The two are deliberately not merged.**

## 3.3 ✅ THE REST OF THE BILLING TAB IS UNTOUCHED — BYTE-COMPARED, NOT ASSERTED

| Region | Result |
|---|---|
| Trial block (incl. **the trial end date**) | ✅ **byte-identical** |
| Starter block | ✅ **byte-identical** |
| Pro/Max block (**current plan**) | ✅ **byte-identical** |
| **The feature matrix** (`matrixContent`) | ✅ **byte-identical** |
| **The footnotes** (`footnotesContent`) | ✅ **byte-identical** |

✅ **Inside `billingCard`, only the amber block changed.** The "Billing & payments" heading and the
`{truck.name} · {plan} plan (trial)` line are **NOT gated** — they state which plan the operator is on,
which is information rather than payment mechanics, and gating them would leave an empty card on iPad.

⚠️ **THE AMBER CONTAINER AND THE ⚙️ WERE LEFT ALONE, AND I AM FLAGGING IT RATHER THAN FIXING IT.** Amber
plus a cog reads as *"something is pending"* — arguably the same shape the copy change exists to remove.
**Restyling was not asked for. Reported, not taken.**

---

# §4 — RAN vs READ, PER TASK

| Task | RAN | READ ONLY | Observed on a device? |
|---|---|---|---|
| **1 — diagnosis** | ✅ **Nothing. No code changed.** Source scans only. | Everything in §1 | 🔴 **No.** Your iPad observation stands alone; I added source, not behaviour. |
| **2 — Auto-replies hide** | `npx tsc --noEmit` → **exit 0**; a comment-aware scanner for the token counts | The rendering | 🔴 **No. Never seen on iPad or on the web.** |
| **3 — billing copy + gate** | `npx tsc --noEmit` → **exit 0**; byte-comparison of five BillingTab regions | The rendering | 🔴 **No.** |

🔴 **`tsc` EXIT 0 IS NOT DONE.** It proves the file parses and types. **It cannot tell you the section
disappears on an iPad, that it still renders on the web, or that the new copy reads well.**
🔴 **Nothing is committed and nothing is deployed**, so none of this is on the device yet — and Task 1's
defect is still live: **the Danger Zone will still be absent on that iPad until the §1.6 fix is built and
deployed.**

✅ **Nothing outside the three tasks was changed. No plan gating, no feature flag, no database row, no
file belonging to pizzeria-gusto or tikka-tonic. Nothing was deleted.**
