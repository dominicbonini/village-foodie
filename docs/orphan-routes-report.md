# /setup and /signup — every remaining route in, who hits it, and who is stranded

**GARBLED SPANS: none.**

⚠️ **The brief is headed BUILD, but every item says report/recommend and items 3 and 5 say explicitly
not to act. I have changed NOTHING.** No file was edited, nothing deployed, no SQL, no migrations, no
credentials. The only write is this report. Flagging the header rather than choosing to build.

---

## 1. Every remaining route into /setup and /signup

**No page, nav, footer or CTA links to either route any more.** Repo-wide grep for
`href="/setup"` / `href="/signup"` in every `.tsx`: **zero matches** (the one hit is a comment).
What remains is redirects and one email button.

### Into `/setup` — seven, in three groups

| # | Site | Trigger |
|---|---|---|
| 1 | `app/signup/page.tsx:57` — `router.push('/setup')` | account created on `/signup` |
| 2 | `app/api/auth/post-login/route.ts:90` — `{ redirect: '/setup' }` | login, **zero trucks** |
| 3 | `app/api/auth/post-login/route.ts:98` — `{ redirect: '/setup?truck=<id>' }` | login, **has trucks, all mid-setup** |
| 4 | `app/login/page.tsx:66` | consumes 2 and 3 — only when `next === '/dashboard'` |
| 5 | `app/manage/page.tsx:50` — `redirect('/setup')` | `/manage` reached, **no `operators` row** |
| 6 | `app/manage/page.tsx:56` — `redirect('/setup')` | `/manage` reached, **operator with no truck** |
| 7 | 🔴 `app/api/auth/verify-signup/route.ts:43` — `/setup?verify=<status>` | **the verification email button**, on four branches (`:45` no token, `:54` no row, `:67` no truck) |

### The indirect ones — chains that end at the same place

| Chain | Where it starts | How it lands on /setup |
|---|---|---|
| 🔴 **The welcome email** | `app/api/auth/verify-signup/route.ts:116` — `manageUrl: ${base}/manage` | button → `/manage` → `app/manage/page.tsx:56` → `/setup`. **The route's own comment says so**: *"/manage sends an operator with no truck to /setup itself"* |
| **Password reset** | `app/api/auth/forgot-password/route.ts:52` → `/reset-password?token=` | on success → `app/reset-password/page.tsx:76` → `/login?message=password_reset` → login → post-login → `/setup` |
| **Staff invite** | `app/api/manage/route.ts:1809` → `/reset-password?token=&invite=true` | lands on `/dashboard` (`reset-password/page.tsx:94`), **not** /setup — an invited staff member is attached to a truck already |
| **Email-change verification** | `/verify-email` | every link goes to `/login` (`:17,44,57,70`) — then post-login applies |
| **Proxy auth guard** | `proxy.ts` | `/manage` unauthenticated → `/login?next=/manage` → **skips post-login** (`login/page.tsx:62` only runs when `next === '/dashboard'`) → `/manage` → `:50`/`:56` → `/setup` |

### Into `/signup` — none, but the route is publicly exempt

| | |
|---|---|
| Links / redirects | 🟢 **zero**, anywhere |
| `proxy.ts:310` | `pathname.startsWith('/signup')` is on the **public** list — deliberately exempt from the auth guard |
| Direct URL | **`GET /signup` → 200** on a hatchgrab host, probed anonymously |
| `/setup` | on **neither** proxy list — no guard runs at all. **`GET /setup` → 200**, and it renders the truck-name form |

---

## 2. 🔴 Who actually hits each one — the cases are NOT the same

The distinction you asked for is real and it splits the seven sites cleanly in two.

### Group A — someone MID-SIGNUP (no truck, no account history)

| Site | Who | State |
|---|---|---|
| 1 · `signup/page.tsx:57` | just created an account seconds ago | auth user ✓, `operators` ✓, trucks ✗ |
| 7 · `verify-signup:43` | clicked the verification email; **no session needed** | same |
| 5 · `manage/page.tsx:50` | signed in, **no `operators` row at all** | auth user ✓, operators ✗ |

🔴 **All three land on the dead form.** `/setup` posts `{action, name}` and `/api/setup:70-72` requires
`contact_phone`, which the page has no field for → 400 *"A contact phone number is required."*

⚠️ **Site 5 is rarer than it looks and partly self-healing.** `post-login:65-77` **repairs a missing
`operators` row** by inserting one — but that repair runs in the login path and then finds no trucks, so
it converts a Group-A user into a Group-B user and sends them to `/setup` anyway.

### Group B — someone who ALREADY HAS AN ACCOUNT

| Site | Who | Does /setup work for them? |
|---|---|---|
| 2 · `post-login:90` | logs in, **owns zero trucks** | 🔴 **NO — dead form.** Identical outcome to Group A |
| 6 · `manage/page.tsx:56` | reaches `/manage`, **owns zero trucks** | 🔴 **NO — dead form** |
| 3 · `post-login:98` | logs in, **owns a truck, mid-wizard** | 🟢 **YES — /setup is a PASS-THROUGH for them** |

### 🟢 The one case that already works, and it matters

**Site 3 is not a dead end and must not be re-pointed as if it were.** `/setup`'s mount effect calls
`/api/setup?check=truck` (`app/setup/page.tsx:61-76`); that endpoint runs `resolveOperatorTruck`
(`app/api/setup/route.ts:171-175`), finds their truck, and the page **redirects to
`/manage/<token>?import=demo` before the form ever renders**. It never asks for a name and never posts.

**So the real split is not "mid-signup vs established" — it is `trucks.length === 0` vs `> 0`.**
Anyone with at least one truck passes straight through. **Only a truckless operator hits the wall**, and
they arrive from both groups.

| | Truckless | Has ≥1 truck |
|---|---|---|
| Sites 1, 2, 5, 6, 7 + welcome email + password reset | 🔴 **dead form, 400, no way forward** | n/a |
| Site 3 | n/a | 🟢 pass-through to Manage |

---

## 3. Where a truckless operator should go — recommendation

### 🔴 First, the thing that would look like the answer and is not

**Do NOT re-point these redirects at the demo modal today. It would move the dead end, not remove it.**

`components/DemoGetStarted.tsx:463-476` — the claim flow **always begins by calling `/api/signup`** and
never checks for an existing session (grepped: no `getUser()`/`getSession()` anywhere in the file). For
someone who already has an account, `/api/signup` returns **409** *"There's already an account with that
email — sign in instead."* The modal catches it, sets `existing`, and offers exactly one affordance:
a **"Sign in"** link to `/login` (`:915`, `:1057`).

**`/login` for a truckless operator → post-login → `/setup` → the same 400.** Sending them to the demo
modal closes a slightly larger loop; it does not open one.

### My recommendation: repair `/setup`, do not re-point anything

**Add the contact-phone field to `app/setup/page.tsx`.** One input, one file, and **every one of the
seven sites above becomes correct with no redirect changed.**

Why this rather than a new destination:

1. 🟢 **`/setup` is the right home for this state and always was.** `manage/page.tsx:50`'s own comment
   says it: *"/setup is where an account without a truck belongs, and it re-checks for a truck on mount,
   so it degrades sensibly rather than looping."* The destination is not what is broken — one missing
   input is.
2. 🟢 **The server already collects everything else it needs.** `/api/setup` `create_truck` takes
   `name`, `contact_phone` and `phone_is_whatsapp`, binds `operator_id` and sets `setup_step: 'menu'`
   (`route.ts:87-117`), then hands off to the same Manage wizard the demo path uses. **The only gap is
   the form.**
3. 🟢 **It is low-risk by construction.** `/api/setup:57-64` records that this route *"is reached ONLY
   by an operator who has no truck yet: Pizzeria Gusto and Real Thai Food have never called it and
   cannot."* Adding a field to it cannot touch a live truck.
4. 🟢 **It fixes the stranded population and the future arrivals in the same change.** Re-pointing
   redirects fixes neither until the demo flow becomes session-aware.
5. ⚠️ **It does not contradict your `/compare` decision.** That decision was about which door a *new
   visitor* walks through, and the demo path is still the better front door — it collects phone,
   WhatsApp preference, names and cuisine. This is about the *back* door, for people already inside.

### If you would rather retire `/setup` entirely

Then the prerequisite is **making the claim flow session-aware**: when a session already exists and the
operator has no truck, skip `/api/signup` and go straight to `create_truck` (which already asks for the
phone). Only then can the seven redirects point at the demo entry. **That is the larger of the two
changes and the one with more surface to get wrong** — the signup step also records terms acceptance
(`/api/signup:119-120`), which would need handling separately for an existing account.

---

## 4. 🔴 Is anyone stranded? Yes — and there is no self-serve route out. None.

**Stating it plainly, as asked: for a person with an account and no truck, no route through the product
works today. Not one.**

| What they can reach | Outcome |
|---|---|
| `/setup` directly (200, unguarded) | 🔴 400 *"A contact phone number is required."* — no field to fill in |
| Log in | 🔴 → `/setup` → same 400 |
| `/manage` | 🔴 → `:56` → `/setup` → same 400 |
| The verification email button | 🔴 → `/setup?verify=ok` → same 400 |
| The welcome email button | 🔴 → `/manage` → `:56` → `/setup` → same 400 |
| Password reset | 🔴 → `/login` → `/setup` → same 400 |
| **The demo modal** (the path that works for everyone else) | 🔴 **409 on their own email** — it starts by creating an account. Offers "Sign in", which returns them to `/setup` |
| Sign up again, same email | 🔴 **409** — `/api/signup:113-114`. The address is permanently consumed |

**The loop is closed in every direction.** The error is specific, accurate and unactionable, and the page
retains their typed truck name while refusing it.

### The only two ways out, and neither is theirs to take

1. **A different email address.** Signing up again from scratch works — through the demo modal — but
   abandons the original account, and their real address stays spent.
2. **An admin intervention.** `app/api/admin/execute-account-deletion` can delete the account, which
   frees the email; they then re-sign-up via the demo path.

⚠️ **The admin console cannot simply attach a truck to them.** I checked both routes:
- `app/api/admin/create-operator/route.ts:48` calls `auth.admin.createUser({ email })`, which **fails
  for an existing email** (400) — it creates a *new* account for an *existing* truck, the opposite
  direction.
- `app/api/admin/create-truck/route.ts:100` calls `provisionTruck` with `kind/name/slug/plan/
  visibility/contactEmail/cuisineType/van` — **no operator binding at all**. An admin-created truck is
  unowned until `create-operator` links one, which needs a fresh email.

**So the rescue is: delete the account, or use SQL.** Both are out-of-product. **There is no route that
lets the operator recover their own account, and no admin button that does it either.**

### ⚠️ How many people this is, I do not know and did not find out

**One query would answer it — operators with a row and no truck — and I ran none.** No SQL was permitted
and I did not read the database. Every statement above is from source.

⚠️ **The exposure is bounded but not zero.** The break has stood since 4 August 2026, and until
`/compare` was linked from the landing this month the only public door was the demo modal, which works.
So the population is probably small. **"Probably small" is an inference, not a count** — and each person
in it has a permanently unusable email address, which is not a small thing for them.

---

## 5. Leave, redirect, or remove — the trade-offs

### `/setup`

| Option | For | Against |
|---|---|---|
| 🟢 **Leave and repair** (my recommendation) | Every redirect becomes correct; unstrands the existing population; one field, one file; cannot affect a live truck | Keeps a page you have decided not to send new visitors to |
| **Leave broken** | No work | 🔴 Seven live routes, two emails and every login for a truckless operator land on a page that cannot complete. **This is today's state and it is the worst option** |
| **Redirect to the demo modal** | Looks like it routes around the break | 🔴 **Does not work** — 409 on their own email (§3). Also breaks **site 3**, the pass-through that works today: a mid-wizard operator would be sent to build a *second*, anonymous truck |
| **Remove** | Deletes a broken page | 🔴 **Seven redirects would 404**, including two email buttons and every truckless login. Removal is only safe *after* all seven have somewhere real to go |

### `/signup`

| Option | For | Against |
|---|---|---|
| 🟢 **Leave in place** (recommendation) | Nothing links to it; costs nothing; `/api/signup` is still the account-creation endpoint the demo flow calls | A URL-reachable page whose "Create account" button leads to the broken `/setup` |
| **Redirect to the landing / demo modal** | Anyone with a bookmark reaches the working path | Loses the plain email+password route, which is the only one that works for someone who genuinely wants an account without a demo |
| **Remove** | 🔴 Do not — `app/signup/page.tsx:57` is the only caller of `/setup` from a fresh account, and `/api/signup` (a different file) must stay regardless | Would need `proxy.ts:310` amended too |

### The general point you raised

**"Reachable by URL" and "linked" are genuinely different, and the difference is who arrives.** A
linked page catches people who are just browsing — that traffic is now zero. A URL-reachable page
catches people with a bookmark, a browser autocomplete, or an old email — **which is exactly the
stranded population**. Unlinking `/setup` therefore protects new visitors and does nothing for the
people already behind it. **That is why I would repair it rather than hide it further.**

---

## What I did not do

- **Changed nothing.** No redirect re-pointed, no file edited, nothing deployed, nothing committed.
- **Ran no SQL**, so the stranded count is unknown (§4).
- **Did not run the flows.** Every claim is read from source, except two live probes on a hatchgrab
  host: `GET /setup` → 200 and `GET /signup` → 200, anonymous.

**The one thing I would do first: fix the phone field. It closes seven routes at once.**
