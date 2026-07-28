# Last report — Admin sees the setup path on production without opening signup publicly

**Date:** 2026-07-28 · **Files touched:** `components/DemoGetStarted.tsx`,
`components/dashboard/DemoLoopComplete.tsx`, `app/dashboard/[token]/page.tsx`
**Verification:** `npx tsc --noEmit` → **clean, zero errors.** No `next dev`, no `next build`, no SQL.
**No env var changed. `/api/signup`'s gate untouched.**

This report **overwrites** the previous one (the order-page closed state), per the rolling convention.

---

## 0. Prompt integrity — one garbled spot, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item 1: *"I do not want a new **requestdemo load** just to hide a button"* | *"a new **request on demo load**"* | A space lost across the word boundary. The sentence needs a noun then a timing phrase, and the preceding clause — *"If it requires a fetch the demo dashboard does not already make"* — establishes exactly that concern. |

---

## Your mid-turn note, and why I built it anyway

> *"the only way into the demo currently is through admin so dont worry aobut a admin lock"*

**Understood, and it changes what this buys you — but not what I did, because the answer to item 1
turned out to be "free".** The signal is already in state on the demo dashboard; wiring it into
`canSetup` is **three props and one `||`**, with **no new request** and no new auth concept. That is
less work than the alternatives I'd otherwise have had to propose under item 3.

What it buys you given your correction:

- **Today** it is belt-and-braces. If demo access is admin-only, everyone reaching `DemoGetStarted`
  is you, so the gate never excludes anyone.
- **The moment the demo opens to the public** it becomes load-bearing — without it you'd either be
  testing signup blind, or flipping `NEXT_PUBLIC_SIGNUP_PUBLIC` at build time and showing the setup
  path to every visitor. That is the exact trap this task set out to avoid, and it arrives on the day
  you stop thinking about it.
- **It leaves nothing to re-tighten later.** No temporary flag to remember to remove.

**If you'd rather not carry it, the revert is one line** — drop `|| isAdmin` from `:208`. The props are
inert on their own.

---

# 1. REPORT — the signal exists, and it is already fetched

## Where `isAdmin` comes from

`app/dashboard/[token]/page.tsx:691–695` — an **unconditional** mount effect, with **no `isDemo`
guard**, so it already runs on a demo dashboard:

```js
  useEffect(()=>{
    // Native app sends its Bearer so /api/auth/me resolves is_admin (+ identity) without a cookie → the
    // Admin link appears in-app. Web: nativeAuthHeader() returns {} → cookie path unchanged.
    nativeAuthHeader().then(h=>fetch('/api/auth/me',{headers:h})).then(r=>r.json()).then(d=>{if(d.email)setCurrentUserEmail(d.email);if(d.first_name)setCurrentUserFirstName(d.first_name);if(d.is_admin)setIsAdmin(true)}).catch(()=>null)
  },[])
```

State declared at `:287` (`const[isAdmin,setIsAdmin]=useState(false)`), already consumed at `:1875`
(`isAdmin={!isDemo&&isAdmin}` on `UserMenu`).

**Server side**, `app/api/auth/me/route.ts` resolves the cookie session (or a native Bearer), reads
`operators.is_admin` from the database, and returns it. It is a real server-resolved fact, not a
client-side guess — and it returns `is_admin: false` for a logged-out visitor, which is every demo
visitor who isn't signed in.

## ✅ Cost: ZERO new requests

**The fetch already happens on demo dashboard load.** I did not add a request, a hook, an endpoint or
an auth check — I read a value that was already sitting in component state and passed it down. Your
item 1 constraint is met exactly.

**Where the signal is NOT available**, and both are correctly left alone:

| Surface | `isAdmin`? | Result |
| --- | --- | --- |
| Demo dashboard (`page.tsx:1811`) | ✅ already in state | setup path opens for an admin |
| `DemoLoopComplete` (same page) | ✅ passed through | same |
| KDS (`kds/page.tsx:731`) | ❌ no `/api/auth/me` call | prop omitted → `false` → today's behaviour. **I did not add the fetch** — that would be the new request you ruled out. |
| Customer order page (`order/page.tsx:2602`) | ❌ and irrelevant | passes `slug`, not `token`, so `!!token` is false and `canSetup` is false regardless |

---

# 2. THE CHANGE

## `components/DemoGetStarted.tsx:208` — the one functional line

```js
  const canSetup = (process.env.NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' || isAdmin) && !!token
```

was

```js
  const canSetup = process.env.NEXT_PUBLIC_SIGNUP_PUBLIC === 'true' && !!token
```

`&& !!token` is unchanged and still outside the OR, so the slug-only surface still cannot reach the
setup path — an admin on the customer order page gets email capture, same as anyone, because the
in-modal signup POSTs `{ demo: <token> }` and a slug can't drive that lookup.

New optional prop, defaulting false:

```js
  /** Admin session (operators.is_admin), resolved from /api/auth/me by the host surface — NOT a claim this
   *  component makes or verifies. … Defaults false, so any surface that doesn't pass it behaves exactly
   *  as it does today. */
  isAdmin?: boolean
```

## Why this is not a client-trusted auth flag

Your item 3 was explicit, so it is argued in the file (`:203–214`) rather than assumed. **The server
already sanctions this exact path** — `app/api/signup/route.ts:51–61`:

```js
  // ── GATE ────────────────────────────────────────────────────────────────────────────────────────
  if (process.env.SIGNUP_PUBLIC !== 'true') {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    const { data: caller } = user
      ? await supabase.from('operators').select('is_admin').eq('auth_user_id', user.id).maybeSingle()
      : { data: null }
    if (!caller?.is_admin) {
      return NextResponse.json({ ok: false, error: 'Sign-up isn’t open yet.' }, { status: 403 })
    }
  }
```

It re-reads the session **server-side** and checks `operators.is_admin` **against the database**. So:

- **An admin completing signup while `SIGNUP_PUBLIC` is unset is expected behaviour**, not a hole —
  the server was always going to allow it. The client flag only decides whether we *render the door
  the server would have opened anyway.*
- **Forging `isAdmin` in the browser gains a button and then a 403.** Which is what a non-admin gets
  today, minus the button. No privilege is transferred.
- The component's own header already frames this correctly — *"It's a mirror, not the source of truth:
  the server flag still enforces; this only decides whether we OFFER the door."* The OR extends the
  mirror to cover the second case the server already accepts.

## What I did NOT change

- **`SIGNUP_PUBLIC` and `NEXT_PUBLIC_SIGNUP_PUBLIC` values** — untouched, in code and in config. I did
  not read or write any Vercel setting.
- **`/api/signup`'s gate** — not opened for writing. The block quoted above is exactly as it was.
- **No new endpoint, no new fetch, no new auth check**, per item 3.

---

# 3. ✅ ITEM 4 — with neither the flag nor an admin session, behaviour is IDENTICAL to today

The truth table, with `token` present (dashboard/KDS):

| `NEXT_PUBLIC_SIGNUP_PUBLIC` | `isAdmin` | `canSetup` | What renders |
| --- | --- | --- | --- |
| unset / not `'true'` | `false` | **`false`** | **Email capture only — today's behaviour exactly** |
| unset / not `'true'` | `true` | `true` | Setup wizard (new: the production-test path) |
| `'true'` | `false` | `true` | Setup wizard (unchanged) |
| `'true'` | `true` | `true` | Setup wizard (unchanged) |

**Row 1 is the public's experience and it is bit-identical to before**, because `false || false ===
false` — the same value the old expression produced, feeding the same `canSetup`. Concretely, an
ordinary visitor still gets:

- heading **"Save your demo"**, sub *"We'll keep it for 14 days and email you a link straight back."*
  (`:602`, `:606–608`)
- the email field, the privacy line, and **"Send me the link"** as the single solid button (`:973–976`)
- **no "Set up my truck →" button, no wizard stepper, no dead-end** — the whole point of the gate.

`canSetup` is the only consumer of these props; there is no second code path that reads `isAdmin`
directly. So a non-admin's render is not merely equivalent, it is the same branch.

---

# 4. Files changed

| File | Change |
| --- | --- |
| `components/DemoGetStarted.tsx` | +14/−1. Optional `isAdmin` prop; `|| isAdmin` in `canSetup`; the not-a-hole rationale. |
| `components/dashboard/DemoLoopComplete.tsx` | +4. Optional `isAdmin` prop, passed through to its `DemoGetStarted`. |
| `app/dashboard/[token]/page.tsx` | +5/−1. `isAdmin` passed to both demo surfaces on this page, with a note that the value costs no request. |
| `docs/last-report.md` | This file, overwritten. |

**Three files, one behavioural line. No env var, no server gate, no new request.**

---

## 5. What I could not do / did not do

- **Could not run `next dev` or `next build`** — instructed not to. `tsc --noEmit` is clean. Two things
  to confirm on the deployed site, both quick:
  1. **Signed in as admin on hatchgrab.com, open a demo dashboard** → "Set up my truck →" should
     appear. If it doesn't, check `/api/auth/me` returns `is_admin: true` for that account — the
     effect swallows errors with `.catch(()=>null)`, so a failed call silently leaves `isAdmin` false.
  2. **In a private window (logged out), same demo** → email capture only.
- **⚠️ There is a brief render before `/api/auth/me` resolves** where `isAdmin` is still `false`, so
  an admin may see the email-capture layout for a moment before the setup button appears. Harmless for
  a test path; worth knowing so it isn't read as the gate failing.
- **Did not add the signal to the KDS.** `kds/page.tsx` makes no `/api/auth/me` call, and adding one
  is the new request you ruled out. An admin testing from the KDS banner gets email capture; use the
  dashboard banner or the loop-complete card.
- **Did not touch the order page.** `slug`-only, so `!!token` keeps `canSetup` false there — correct
  and unchanged.
- **Did not commit anything.** This joins the session's unstaged work (demo restart, seeder scaling,
  order-page closed state) and the staged deletion of `lib/demo-event-refresh.ts`.
