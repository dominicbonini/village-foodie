# The landing page at an unlisted URL

# 🔴 THE URL

    https://hatchgrab.com/1ng7n4p5omux2gdk9kqvwz

**22 characters from `secrets.choice` over lowercase + digits — about 113 bits. Not a word, not a
date, not derivable.** ⚠️ **UNLISTED IS NOT PRIVATE: anyone with the link can forward it. Accepted.**

**File created — ONE:** `app/1ng7n4p5omux2gdk9kqvwz/page.tsx` (17 lines).
**Also written:** `docs/landing-unlisted-report.md`.
🔴 **NO AUTH, NO PASSWORD, NO COOKIE GATE, NO MIDDLEWARE.** The dashboard, the KDS, the ordering pages
and `app/api` are untouched. No SQL, no migration. **Nothing committed, staged, reverted, stashed or
cleaned.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1

## Q1 — 🔴 THE ROOT DOES **NOT** SERVE THE LANDING PAGE, SO THE UNLISTED URL IS NOT DECORATIVE

`app/page.tsx` is the **Village Foodie consumer site** — `useVillageData`, `EventListCard`, the map,
the venue search. **It has no `.hg-landing` markup and imports none of the landing CSS.** ✅ **So no
root decision is needed and none was made: the root keeps serving what it serves today.**

## Q2 — WHERE THE LANDING PAGE LIVES

`app/landing/page.tsx` (the page + its metadata), `app/landing/landing.css` (scoped to `.hg-landing`,
loaded only by this route) and `app/landing/layout.tsx`.
✅ **EXECUTED: `grep -rn "/landing"` across `app/`, `components/`, `lib/` and `public/` finds NO
internal link to it** — every hit is a comment or the CSS's own header. **Nothing in the nav, the
footer, an email or a redirect points at `/landing`.**

## Q3 — 🔴 `noindex` IS PAGE-LEVEL AND SURVIVES THE MOVE

```ts
  robots: { index: false, follow: false },
```
**It lives in `app/landing/page.tsx`'s own `metadata` export — not site-wide.** ✅ **The new route
re-exports that same `metadata` object, so the unlisted URL carries the identical directive.**
✅ **There is no `app/sitemap.ts` and no sitemap entry in `vercel.json` (grep: 0 hits), so neither path
can appear in one.**

## Q4 — 🔴 AND THE ONE THAT MATTERS: `/landing` IS ADMIN-ONLY IN PRODUCTION

```tsx
export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/')
  }
```
🔴 **A REVIEWER GIVEN `/landing` TODAY WOULD BE REDIRECTED TO THE VILLAGE FOODIE HOME PAGE AND NEVER SEE
IT.** **That gate is why an unlisted path was needed at all, and it is untouched** — `/landing` stays
admin-only. **No other alias, rewrite or redirect serves this page.**

## Q5 — NOTHING DEPENDS ON THE OLD PATH
✅ **EXECUTED — no internal link exists (Q2), so no email, QR, app field or Village Foodie page can be
pointing at it from inside this repo.** ⚠️ **What I cannot see: anything OUTSIDE the repo — a link in
your notes, a browser bookmark, an App Store field. `/landing` still works for you as an admin, so none
of those break either way.**

---

# STAGE 2 — WHAT WAS BUILT

```tsx
export { default, metadata } from '../landing/page'
```

🔴 **THE SAME MODULE, NOT A COPY.** The page, its `noindex` metadata and `./landing.css` come from one
file, so the two paths cannot drift. **A duplicated 36KB page would have been the defect this avoids.**

**No layout file was created for the new route**, so it inherits the root layout and **not** the
landing layout's admin gate — which is the entire point. ✅ **No link anywhere points at the new path:
it exists only as a URL you hand out, and deleting the directory retires it.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0; `npx eslint` on the new file reports nothing.**

| Claim | Method |
|---|---|
| The page renders at the new path | ✅ **SOURCE READ** — a Next App Router `page.tsx` re-exporting the landing page's default export. 🔴 **NOT RENDERED — no `next dev`, no `next build`, no request made** |
| `noindex` is still on it | ✅ **EXECUTED (source)** — `metadata` is re-exported from the same module that declares `robots: { index: false, follow: false }` |
| What the root now serves | ✅ **EXECUTED** — unchanged: `app/page.tsx`, the Village Foodie site |
| Every internal link accounted for | ✅ **EXECUTED** — there are none to account for; grep finds no link to `/landing` anywhere |
| Nothing requires a login | ✅ **EXECUTED (source)** — the new route has no layout of its own, so `verifyAdmin` never runs for it; no middleware, cookie or password was added |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED OR REQUESTED.** The first real check is opening the URL in a private window
  after deploy — **if it redirects to the Village Foodie home page, the gate is catching it and the
  route needs its own empty layout.**
- ⚠️ **It is live only after the next deploy.**
- ⚠️ **The page still carries its own unverified-award note and the `Contact` `href="#"`** — both
  pre-existing and both visible to anyone you send this to.

---

# INTEGRITY

```
app/1ng7n4p5omux2gdk9kqvwz/page.tsx   NEW · 1,165 bytes · 17 lines · 0 non-ASCII classes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```
✅ **Pure ASCII by construction — there is no before/after census because the file is new, and no
existing file was edited.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/landing-unlisted-report.md   bytes 6,875
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. Code points only.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 14 | 0 | 14 |
| U+26A0 (warning sign) | 5 | 5 | 0 |
| U+2705 (check mark button) | 13 | 0 | 13 |

U+26A0 is the only TEXT-presentation base and every occurrence is PAIRED with U+FE0F.

## Working tree

```
 M app/dashboard/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M docs/reference-manual.md
 M lib/capacity-breach.ts
 M lib/copy/offlineProtection.ts
 M supabase/.temp/cli-latest
?? app/1ng7n4p5omux2gdk9kqvwz/
?? docs/breach-attribution-report.md
?? docs/breach-dismiss-report.md
?? docs/breach-grouping-report.md
?? docs/heartbeat-deploy-report.md
?? docs/landing-unlisted-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? app/1ng7n4p5omux2gdk9kqvwz/` | 🔴 **THIS TASK — the only source file created; no existing file was modified** |
| 🔴 `?? docs/landing-unlisted-report.md` | 🔴 **THIS TASK** — this file |
| the `M` files and the other `?? docs/*.md` | ✅ pre-existing — earlier tasks this session |
| `M supabase/.temp/cli-latest` | ⚠️ pre-existing — written by the Supabase CLI during the deploy check, not by an edit |

No `git stash`, `git checkout` or `git restore` was run at any point.
