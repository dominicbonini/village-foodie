# The Danger Zone auth fix — both legs, implemented

**Date:** 25 August 2026
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **NOTHING IS OBSERVED ON A DEVICE.** I ran `npx tsc --noEmit` and a set of code-only scans. I did not
run `next dev`, did not deploy, and did not open the app on any hardware. **The Danger Zone is still
absent on your iPad and will be until this is deployed.**

✅ **NO NATIVE CHANGE. `git status` confirms nothing under `ios/`, no `Info.plist`, no `.entitlements`
and no `capacitor.config` was modified.** Three files changed, all web. It reaches the device by deploy.

---

# §1 — THE DIAGNOSIS THIS IMPLEMENTS, QUOTED

From `docs/settings-visibility-report.md` §1.6:

> **Two edits, both existing patterns, neither native:**
>
> 1. **`components/manage/DeleteAccountSection.tsx`** — send the header the other six session callers
>    already send: `nativeAuthHeader()` from `lib/native/session` on both fetches. **Returns `{}` on web,
>    so web behaviour is unchanged.**
> 2. **`app/api/account/request-deletion/route.ts`** — give `resolveOperator()` the same Bearer fallback
>    `app/api/auth/me/route.ts` already has: if no cookie user and an `Authorization: Bearer` is present,
>    `supabase.auth.getUser(jwt)`.
>
> 🔴 **BOTH ARE NEEDED. Neither alone changes anything** — a header nobody reads, or a reader nobody
> sends to.

And on the third item, which this task also asked for:

> ⚠️ **A third, non-blocking improvement I did not include in "smallest": log the failure.** A component
> that can vanish without a trace will hide the next instance of this too.

---

# §2 — LEG 1: THE COMPONENT SENDS THE HEADER

`components/manage/DeleteAccountSection.tsx` — **`nativeAuthHeader` now appears 3 times in code**
(the import plus both fetches), where it appeared 0 times before.

**The GET**, in the shape the manage page's `/api/auth/me` call already uses:

```ts
    nativeAuthHeader()
      .then(h => fetch('/api/account/request-deletion', { headers: h }))
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
```

**The POST**, in the shape the other five session callers use:

```ts
        headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
```

✅ **WEB IS UNCHANGED.** `nativeAuthHeader()` returns `{}` when there is no native session, so the
browser sends byte-identical requests.

⚠️ **The `useCallback`'s eslint property is preserved** — `setState` still lands inside a promise
callback, which is what `react-hooks/set-state-in-effect` asks for. The extra link in the chain does not
change that, and the comment above it still holds.

---

# §3 — LEG 2: THE ROUTE READS IT

`app/api/account/request-deletion/route.ts` — **`getUser(jwt)` now appears twice in code, where it
appeared 0 times before.** Copied from `app/api/auth/me/route.ts`, which was **not opened for editing**
(`git status` confirms it is unmodified):

```ts
  if (!authUserId) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
      if (bearerUser) authUserId = bearerUser.id
    }
  }
```

✅ **REACHED ONLY WHEN THE COOKIE PATH YIELDS NO USER**, exactly as `auth/me` does it. A browser with a
session never enters the branch.

`resolveOperator()` now takes the request, and `GET()` passes it:

```ts
  async function resolveOperator(req: NextRequest)
  export async function GET(req: NextRequest) { const operator = await resolveOperator(req) …
```

## 3.1 🔴 IT HAD TO GO IN **TWICE**, AND THAT IS A FINDING, NOT A CHOICE OF MINE

**`POST` does not call `resolveOperator`. It resolves the caller inline.** The comment on
`resolveOperator` claims *"ONE resolver, used by both handlers, so the GET preview and the POST can
never disagree about who is allowed to see or do this."* 🔴 **That comment has always been false** —
the code-only scan shows `resolveOperator(` appearing twice both before and after, and neither
occurrence is in `POST`.

**So the fallback is applied in both places — five identical lines, once each.**

🔴 **I DID NOT COLLAPSE POST INTO `resolveOperator`, DELIBERATELY.** `POST` distinguishes **401** (not
signed in) from **403** (signed in but no operators row — a staff or manager). `resolveOperator` returns
`null` for both and cannot tell them apart, so folding them together would have changed the 403 **you
told me not to touch**. The scan confirms both statuses survive: `status: 401` 1→1, `status: 403` 2→2.

## 3.2 ⚠️ ONE BEHAVIOUR CHANGE INSIDE `resolveOperator` THAT I AM FLAGGING RATHER THAN BURYING

`return null` in the route went **2 → 1**. The old `catch { return null }` around the cookie client is
now `catch { /* fall through */ }`, with a single `if (!authUserId) return null` after the Bearer branch.

**It had to change: a throw from `createSupabaseServerClient()` used to return immediately and would
have skipped the Bearer path entirely.** ✅ **On web the outcome is identical** — no Bearer, so it
still resolves to `null`. **On native it is the difference between the fallback running and not.**

---

# §4 — THE ADDITION: THE FAILURE IS NOW AUDIBLE

**`console.error` in the component: 0 → 1.**

```ts
        console.error(
          '[account-deletion] summary fetch failed — the Danger Zone and the Delete account control will NOT render:',
          err instanceof Error ? err.message : err,
        )
        setLoadFailed(true)
```

✅ **Shaped like the `/api/dashboard` logs, which name the consequence rather than the mechanic** —
compare `'[dashboard] ACTIVE ORDERS query failed for event … — the live board will render EMPTY:'`.

✅ **IT STILL RETURNS `null`.** `return null` in the component is 1→1 and
`if (loadFailed || !summary) return null` is intact. **This adds a trace; it changes nothing that
renders.**

---

# §5 — WHAT WAS NOT TOUCHED

| Contract | Result |
|---|---|
| What the component renders, its copy, gates, confirmation behaviour | ✅ **Everything from `if (summary.pending) {` to end of file is BYTE-IDENTICAL** |
| `canConfirm` / typed-name gate | ✅ unchanged, verbatim |
| `confirm: 'DELETE'` POST body | ✅ 1→1 |
| `lib/account-deletion.ts` | ✅ **not modified** (`git status`) |
| The owner gate in the parent | ✅ `userRole === 'owner' && <DeleteAccountSection` unchanged |
| The manager branch / operators-row 403 | ✅ `status: 403` 2→2 |
| `app/api/auth/me/route.ts` | ✅ **not modified** — copied from, not edited |
| `app/dashboard/[token]/page.tsx:854` | ✅ **not fixed — see §7 backlog**, as instructed |
| Anything native | ✅ **nothing under `ios/`, no plist, no entitlement, no capacitor config** |

⚠️ **`app/manage/[token]/page.tsx` shows as modified in `git status`. That is the PREVIOUS task's work
(the Auto-replies native hide and the billing copy), not this one. This task did not open it.**

---

# §6 — RAN vs READ

| | |
|---|---|
| **RAN** | `npx tsc --noEmit` → **exit 0**. A line-by-line comment-aware scanner over both files, before and after, for the token counts in §2–§5. `git status`. |
| **READ** | `docs/settings-visibility-report.md` §1.6, `app/api/auth/me/route.ts`, the six existing caller sites, the `/api/dashboard` log shapes. |
| **NOT DONE** | 🔴 **No `next dev`. No deploy. No device.** |

🔴 **`tsc` EXIT 0 IS NOT DONE.** It proves both files parse and type-check. **It cannot tell you a
Bearer is actually attached in the WKWebView, that the route accepts it, or that the section appears.**
🔴 **A fix in the repo is not deployed — this is not on your iPad yet.**

---

# §7 — BACKLOG, RECORDED NOT FIXED

⚠️ **`app/dashboard/[token]/page.tsx:854` — a bare `fetch('/api/auth/update-profile', …)` with no
`nativeAuthHeader()`.** The route **does** have a Bearer fallback; the caller sends nothing, so the
dashboard's profile-name save fails in the shell.

**It is a true relative of this defect and it fails LOUDLY — it has error handling and surfaces, rather
than vanishing.** ✅ **Deliberately not fixed in this pass, at your instruction, to keep the diff
minimal inside an App Store review window.** ⚠️ It is the last known bare session-caller in the app.

---

# §8 — WHAT TO DO ON THE iPad AFTER YOU DEPLOY

1. **Deploy, and confirm the deploy finished** before touching the iPad. The shell loads the deployed
   URL — until the deploy is live, the device is running the old code and nothing below means anything.
2. **Force the shell to re-fetch.** Fully quit the app (swipe it away from the app switcher) and reopen
   it — a warm webview can hold the old bundle.
3. **Sign in as `tester@hatchgrab.com`** and open **Manage → Settings**.
4. **Scroll to the very bottom of the Settings tab.** The Danger Zone is the last block on the tab, below
   everything else.
5. ✅ **IF BOTH LEGS WORK, YOU SEE:** a card headed **"Danger zone"** in red uppercase with a warning
   triangle, and inside it a single non-destructive button. **Nothing should be pre-opened.** Tapping it
   opens the confirmation dialog, which must show **the truck name** and require it typed exactly before
   the destructive button enables. ⚠️ **Do not complete it** — this is the review account.
6. 🔴 **IF IT IS STILL ABSENT, THE LOG NOW TELLS YOU WHY — THIS IS WHAT THE ADDITION IS FOR.** Attach
   the iPad to a Mac, open **Safari → Develop → [your iPad] → the HatchGrab webview**, and read the
   console:
   - 🔴 **A line reading `[account-deletion] summary fetch failed — the Danger Zone and the Delete
     account control will NOT render: 403`** → **authentication is still failing.** That means one leg
     is not actually live: either the deploy did not include both files, or the shell had no session to
     put in the header. **Check the deploy first, then sign out and back in on the device** so the shell
     writes a fresh Supabase session into Preferences.
   - ⚠️ **The same line reading `401`** → the header arrived but the JWT was rejected — an expired
     session. **Sign out and back in.**
   - 🔴 **NO log line at all, and still no Danger Zone** → the component never mounted, so this is **not
     the auth defect**. The gate above it is `userRole === 'owner'`; look there, not here.
7. **Confirm the web is unaffected.** Open Manage → Settings in a desktop browser on the same account —
   the Danger Zone should look exactly as it did before, and the console should show **no**
   `[account-deletion]` line.

🔴 **STEP 6 IS THE POINT OF THE WHOLE ADDITION.** Before today this failure produced no log, no toast
and no empty state — **the section simply was not there, and nothing anywhere said why.** That is how it
survived from V11.4 until you looked at an iPad.
