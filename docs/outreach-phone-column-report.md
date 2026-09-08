# Surface phone + scraped WhatsApp hint — STOPPED on item 2's reuse condition

**GARBLED SPANS: none.**

🔴 **I STOPPED AND CHANGED NOTHING — this is the exact case item 2 tells me to stop on.** The scraped
WhatsApp derivation the live call button uses is **inline in `components/EventListCard.tsx`, not an
exported function**, so it cannot be *reused* without editing that file — which is outside the "outreach
page and its route only" scope. Item 2 forbids copying it. So I did neither, and I am asking you which way
to go. **No file was edited. Nothing deployed. No phone number or WhatsApp value written.**

---

## Why item 2 stops here

Item 2: *"REUSE the existing derivation rather than writing a second one — the live button and this page
must not be able to disagree. If it cannot be reused without changing a file outside scope, say so and STOP
rather than copying the logic."*

**The existing derivation is inline in `components/EventListCard.tsx:105-127`:**
```ts
const cleanPhone = primaryEvent.phoneNumber ? primaryEvent.phoneNumber.replace(/[^\d+]/g, '') : '';
let waPhone = cleanPhone.replace('+', '');
if (waPhone.startsWith('0')) waPhone = '44' + waPhone.slice(1);
const isMobileNumber = waPhone.startsWith('447');
// methodsStr = accepted_methods.toLowerCase()
const acceptsWhatsApp = methodsStr.includes('whatsapp');
```

**I searched exhaustively before concluding — absence reported as absence, not assumed:**
- No `export function`/`export const` in `lib/` performs the `447`-mobile + `accepted_methods='whatsapp'`
  derivation.
- No function anywhere takes `accepted_methods`/`methodsStr` and returns a WhatsApp boolean.
- `startsWith('447')` appears in **exactly one place in the whole repo** — `EventListCard.tsx:109`.
- `lib/email.ts:343` has a *similar-looking* `44`-normalisation for `wa.me` links, but it is a **different
  inline expression** in the email module and does **not** do the `accepted_methods` check — it is not the
  derivation the call button uses.

🔴 **So there is nothing to import.** To make the live button and the outreach page share ONE derivation
(the task's explicit requirement — "must not be able to disagree"), the inline logic in
`EventListCard.tsx` must be **extracted into a shared module and EventListCard pointed at it** — which
means **editing `components/EventListCard.tsx`, outside the permitted scope**.

⚠️ **The tempting in-scope shortcut is the forbidden one.** I could add a NEW derivation to `lib/outreach.ts`
(in scope) and import it into the outreach page — but `EventListCard.tsx` would keep its own inline copy, so
**two implementations would exist and could drift.** That is "writing a second one", which item 2 rules
out, and it defeats the whole point (the live button and this page *could then disagree*). So that path is
not a legitimate reuse; it is the copy the task forbids, wearing a different hat.

**Therefore: reuse is impossible within scope, copying is forbidden → STOP.** Exactly as item 2 directs.

---

## The decision I need from you

| Option | What it means | Touches |
|---|---|---|
| 🟢 **A. Authorise the extraction (recommended)** | Lift the inline derivation out of `EventListCard.tsx` into a shared function (e.g. `whatsappHintFromPhoneAndMethods(phone, accepted_methods)` in `lib/outreach.ts` or a small `lib/whatsapp-hint.ts`), point **both** the live button and the outreach page at it, then build items 1-5. **One source, no drift** — what item 2 wants. | `components/EventListCard.tsx` (out of the stated scope) + `lib/` + the outreach page/route |
| ❌ **B. A second implementation in `lib/outreach.ts`** | Only the outreach page uses it; `EventListCard` keeps its inline copy. **Item 2 forbids this** (two sources can disagree). Listed only so the trade-off is explicit. | outreach page/route + `lib/` |
| **C. Drop the scraped hint** | Build only the parts that need no derivation (below), and leave the WhatsApp hint out. | outreach page/route only |

**My recommendation: A.** It is the only option that satisfies "must not be able to disagree", and the
extraction is small and mechanical (five lines into one pure function, no behaviour change to the live
button). But it edits a file outside the scope you set, so it is your call — I will not touch
`EventListCard.tsx` without your say-so.

---

## What is buildable WITHIN scope, and what is blocked (so you can choose C if you prefer)

| Item | In scope without the derivation? |
|---|---|
| 1. `phone` read-only column | 🟢 **Yes** — reads `discovery_trucks.phone` (the route already fetches it; `mobile` deliberately not shown, per the diagnosis) |
| 2. Scraped WhatsApp hint (three states) | 🔴 **BLOCKED** — needs the shared derivation (this report) |
| 3. Label `whatsapp_number`/`whatsapp_confirmed` as **mine** | 🟢 **Yes** — header text only |
| 4. `whatsapp_number` placeholder defaults to the discovery phone (stored value untouched until I confirm) | 🟢 **Yes** — the route already returns `phone`; a placeholder, not a pre-populated value |
| 5. Both new columns sortable, nulls last | ⚠️ **Partly** — the phone column yes; the **hint** column depends on item 2 |

🔴 **I did NOT build items 1/3/4/5 either, because item 2 — the scraped hint, and its 🔴 three-state rule —
is the core of this task ("AND THIS IS THE POINT"), and building around a stopped centre risks producing a
half-column layout you then rework once the derivation question is settled.** If you would rather I ship
1/3/4/5 now and add the hint after you pick A, say so and I will.

---

## The three-state requirement is noted and will be honoured once unblocked
For the record, so it is not lost: the hint must render **three** states, never two —
`advertises WhatsApp` (methods mention it) · `mobile, not advertised` (a `447` mobile with no tag) ·
`nothing` (no phone, or not a mobile). An absent scraped tag must not read as "no WhatsApp": 27 rows carry
the tag, but Churro Boyz and Big Bite Kebab are working mobiles with `accepted_methods` NULL and are still
worth messaging. This is exactly why the shared derivation matters — the `447` test is what separates
"mobile, not advertised" from "not a mobile".

---

## Verification / session
No browser check was run because nothing was built. ⚠️ **For the third time, an admin session was not
obtained** (the sole admin is your own account; minting one was blocked by policy on the previous task and
I did not retry it here). Had I built the page, I would again have been unable to render it against the live
176 rows as admin — I am flagging that now so it does not surprise you when we resume.

**Nothing changed. Nothing deployed. Awaiting your choice of A / B / C.**
