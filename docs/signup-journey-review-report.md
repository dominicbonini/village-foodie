# The signup journey — READ-ONLY review

**No files were changed, nothing deployed, no SQL, no migrations.** The only write is this report.

**GARBLED SPANS: none.**

---

## 🔴 THE HEADLINE

**The `/signup` → `/setup` journey cannot complete. It has been impossible since 4 August 2026.**

`app/api/setup/route.ts:70-72` requires `contact_phone`. `app/setup/page.tsx` has **exactly one input on
the page** — the truck name — and posts `{ action: 'create_truck', name }`. The key is never sent, so the
server always answers **400 "A contact phone number is required."**

**It is not a regression and not intermittent. Every attempt fails, at the same point, for everyone
arriving this way.**

🔴 **And it is worse than a dead end: the failure happens AFTER the account is created**, so the email
address is permanently consumed and the operator is bounced back to the same broken screen on every
future login. §5.

---

## 1. The journey, step by step

| Step | Screen / file | Fields it collects |
|---|---|---|
| **0. CTA** | `app/compare/CostComparison.tsx:832`, `:920`, and the nav `cta` at `app/compare/page.tsx:125` | — |
| **1. Create account** | `app/signup/page.tsx` | **email**, **password** (min 8), *promo code* (optional), *marketing tick* (optional, unticked) |
| — | `POST /api/signup` (`app/api/signup/route.ts`) | creates the auth user, inserts `operators`, writes a verification row, sends the verification email, signs the user in |
| — | on success → `router.push('/setup')` (`app/signup/page.tsx:57`) | |
| **2. Name your truck** | `app/setup/page.tsx` | 🔴 **truck name, and nothing else** |
| — | `POST /api/setup` `action=create_truck` (`app/api/setup/route.ts`) | 🔴 **rejects — no `contact_phone`** |
| **3. Menu import** | would be `/manage/{token}?import=demo` | **never reached** |
| **4. Events** | — | `app/setup/page.tsx:96`: *"The EVENT step (Step 6) isn't built yet"* |

---

## 2. 🔴 What the form collects vs what the server requires

### Step 1 — `/signup` → `/api/signup`

| Field | Server | Form | Verdict |
|---|---|---|---|
| `email` | **required**, validated (`:59`) | ✅ collected | ok |
| `password` | **required**, ≥ 8 (`:62`) | ✅ collected | ok |
| `marketing_opt_in` | optional | ✅ collected | ok |
| `signup_code` | optional (`:50`) | ✅ collected | ok |
| `demo` | optional (`:44`) | not sent on this path | ok |
| **`first_name`** | read at `:55`, optional | 🔴 **never collected** | **always null** |
| **`last_name`** | read at `:56`, optional | 🔴 **never collected** | **always null** |

⚠️ **`first_name` is not required, but it is used.** `/api/signup` imports `firstNameFrom` and the welcome
and verification emails personalise on it. On this path it is always null, so those emails address the
operator with whatever the fallback is. **A quality defect, not a blocker.**

### Step 2 — `/setup` → `/api/setup` `action=create_truck`

| Field | Server | Form | Verdict |
|---|---|---|---|
| `name` | **required**, rejected if too short (`:51-54`) | ✅ collected | ok |
| 🔴 **`contact_phone`** | **REQUIRED** (`:70-72`) **and format-validated as UK** (`:75`) | 🔴 **NO FIELD ON THE PAGE** | 🔴 **REQUIRED BUT NEVER ASKED FOR — this is the failure** |
| `phone_is_whatsapp` | optional (`:96`) | 🔴 not collected | defaults false |
| `contact_email` | optional — **falls back to `operator.email`** (`:52`) | deliberately omitted | ✅ **correct**, and the page documents why |

**Sweep result: `contact_phone` is the ONLY required-but-never-asked field.** I read every rejection
branch in both routes; there is no second one hiding. `contact_email` looks like one and is not — its
fallback is deliberate and documented at `app/setup/page.tsx:83`.

### The database

⚠️ **The constraint is NOT in the database.** No migration in `supabase/migrations/` declares
`contact_phone NOT NULL` — I grepped the whole directory. **The requirement lives entirely in the route.**
That matters for the fix: it can be relaxed in one file without touching the schema.

---

## 3. Exactly where the phone is required

**`app/api/setup/route.ts:70-75`** — route validation, not a column constraint:

```ts
const contactPhone = String(body.contact_phone ?? '').trim()
if (!contactPhone)  return NextResponse.json({ ok: false, error: 'A contact phone number is required.' }, { status: 400 })
if (!isValidUKPhone(contactPhone)) return NextResponse.json({ ok: false, error: 'Enter a valid UK phone number (e.g. 07700 900123).' }, { status: 400 })
```

**Is there a field for it anywhere in the flow?** **Not on `/setup`.** The page has **one** input element
and no occurrence of "phone", "tel", "mobile" or "whatsapp".

🔴 **But it IS collected elsewhere — in a flow this journey never reaches.**
`components/DemoGetStarted.tsx` (the demo → claim modal) collects phone **and** the WhatsApp tick
(`:234-235`), and sends both with `create_truck` (`:528-540`), with a comment stating the intent:

> *"I4: contact_phone travels with create_truck so the SERVER can require it."*

**So the requirement was written for the demo flow and the `/setup` form was never updated to match.**

### When it broke, from the history

| | |
|---|---|
| `e8c5a72` — **4 Aug 2026, 09:45** | last change to `app/setup/page.tsx` |
| `888fc8a` — **4 Aug 2026, 15:25** | *"onboarding fixes"* — **added the phone requirement to `/api/setup`** |

**`888fc8a` touched twelve files and `app/setup/page.tsx` is not among them.** The requirement landed six
hours after the form was last edited, and the form was never brought along.

---

## 4. What the operator sees

| | |
|---|---|
| **Exact text** | **"A contact phone number is required."** — `app/setup/page.tsx:92` renders `data.error` verbatim |
| **Where** | a small red line under the form (`:191`) |
| **Does it name the field?** | 🔴 **Yes — and the field has never been on screen.** The operator is told to supply something the page never asked for and gives them no way to enter |
| **Is the typed name retained?** | ✅ **Yes.** `name` is React state and is never reset; only `error` is set. At least they do not retype it |
| **Can they recover?** | 🔴 **No.** Pressing the button again sends the identical body and fails identically. There is no field to fill in, no alternative route, and no link out |

**This is the worst shape an error can take:** it is specific, it is accurate, and it is unactionable.

---

## 5. 🔴 What a failed signup leaves behind

**The failure is at step 2, so step 1 has already fully succeeded.** After your attempt there is:

| | State |
|---|---|
| **Supabase auth user** | ✅ **EXISTS** |
| **`operators` row** | ✅ **EXISTS** |
| **`trucks` row** | 🔴 **NONE** |
| **`operator_email_verifications` row** | ✅ exists, verification email sent |

**There is no orphaned auth user** — `/api/signup:150` deletes the auth user if the `operators` insert
fails, and logs `ORPHAN AUTH USER` if even that fails. **That guard is real and it worked.** It simply
does not cover this failure, which happens in a different route afterwards.

### 🔴 Can the same email sign up again? No.

`/api/signup` calls `auth.admin.createUser`, which fails for an existing email, and the route returns
**409 "There's already an account with that email — sign in instead."** (`:113-114`).

**So every failed attempt permanently consumes that email address.**

### And signing in does not rescue it

- `app/login/page.tsx:66-67` redirects to `/setup` when the server says so.
- `app/manage/page.tsx:56` — *"Signed in but no operator row: `/setup` is where an account without a truck
  belongs"* — and `:56` also redirects there when `resolveOperatorTruck` finds no truck.

**So the operator logs in, is sent to `/setup`, fills in the name, is told the phone is missing, and is
sent to `/setup` again on the next login. A closed loop, permanently, with the email spent.**

⚠️ **Anyone who has tried this on the live site is in that state now.** Recovering them means either a
manual truck row or freeing the email — a data decision, which is yours.

---

## 6. Every path into signup — and they are NOT equivalent

| Entry point | Where it goes | Works? |
|---|---|---|
| **`/compare` — nav "Start free →"** (`app/compare/page.tsx:125`) | `/signup` | 🔴 **BROKEN** |
| **`/compare` — two body CTAs** (`CostComparison.tsx:832`, `:920`) | `/signup` | 🔴 **BROKEN** |
| **The landing page — all 8 CTAs** | 🟢 **`DemoCta` → the demo modal → `DemoGetStarted`** | ✅ **works — it collects the phone** |
| Landing nav "Log in" | `/login` | n/a |

🔴 **The landing page never links to `/signup` at all** — grepped, zero occurrences. **Every direct route
into the broken flow is on `/compare`,** which is precisely where you started.

**So the two paths differ in more than a step:** the demo flow collects phone, WhatsApp tick, first name,
last name and cuisine; `/setup` collects a truck name. **One of them satisfies the server and one cannot.**

⚠️ **This is why it went unnoticed.** Until `/compare` was linked from the landing this morning, the only
public route in was the demo modal — the path that works.

---

## 7. Has the flow ever completed?

🔴 **Not since 4 August 2026, 15:25, and I can find no evidence it has run end to end since.**

The reasoning is arithmetic rather than inference: the route rejects any `create_truck` without
`contact_phone`; `/setup` cannot send one because the field does not exist; therefore no `/setup` submission
can have succeeded after `888fc8a`. **The demo path has been carrying every real signup.**

⚠️ **What I did NOT do:** I did not query the database, so I cannot say how many operators have a row with
no truck. **That query would settle both this and §5's blast radius** — how many people are stuck — and it
is the first thing I would want before choosing a fix.

---

## 8. Everything else in that journey

| | |
|---|---|
| 🔴 **No resend for signup verification** | `app/setup/page.tsx:141-142` records it: *"there is no resend path for SIGNUP verification. /api/auth/resend-verification reads `operator_email_changes` — the email-CHANGE table"*. If the verification email is lost, there is no in-product recovery |
| ⚠️ **Verification is not enforced** | Neither `/setup` nor `/api/setup` checks it. An unverified operator can proceed — sensible for onboarding friction, worth knowing it is deliberate rather than missed |
| ⚠️ **The event step does not exist** | `app/setup/page.tsx:96`: *"The EVENT step (Step 6) isn't built yet; finishing the menu wizard lands them on their dashboard"* |
| ⚠️ **`?import=demo` on a non-demo signup** | Step 2 always redirects to `/manage/{token}?import=demo` even when the operator never touched a demo. The page handles it — *"If there's no claimed demo/extraction the wizard simply shows a normal upload"* — so it degrades correctly, but the URL is misleading |
| ⚠️ **First/last name never collected** | §2. The welcome and verification emails personalise on a value this path never supplies |
| 🟢 **Not broken:** the `contact_email` omission | Deliberate and documented — the server falls back to the operator's email |

---

## What I would want to know before choosing a fix

1. 🔴 **How many operators have an `operators` row and no truck?** That is the number of people currently
   stuck, and it decides whether this needs a data repair as well as a code fix.
2. **Which is authoritative: the requirement or the form?** Adding a phone field to `/setup` and relaxing
   the requirement are both one-file changes, and they are different product decisions. The demo flow
   asks for a phone, so asking on `/setup` is the consistent answer — but that is yours to make.
3. **Whether `/compare`'s three CTAs should point at `/signup` at all**, given the landing's eight all
   open the demo modal instead.

**Nothing was changed. Nothing deployed.**
