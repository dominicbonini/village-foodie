# Shared nav and footer — anchors on child routes

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` NOT run.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another — but **Task 1's
literal wording turned out to carry a cost, and §2.b is the "say so and tell me what you propose"
answer.**

**Files changed:** `components/landing/LandingNav.tsx`, `components/landing/LandingFooter.tsx`,
`app/landing/cost/page.tsx`, `app/landing/cost/CostComparison.tsx`.
✅ **`app/landing/page.tsx` untouched — identical SHA-256.**

---

# §1 — TASK 0: THE AUDIT. **THREE LINKS ARE BROKEN, NOT ONE.**

```
  where  link                  href                              kind            on /landing                      on /landing/cost
  ------ --------------------- --------------------------------- --------------- -------------------------------- --------------------------------------
  NAV    logo "HatchGrab home" href="#"                          bare fragment   scrolls to top                   🔴 NOTHING — claims "home", goes nowhere
  NAV    Pricing (desktop)     href="#pricing"                   bare fragment   scrolls to #pricing              🔴 NOTHING — no #pricing on this page
  NAV    Log in (desktop)      href="/login"                     root-relative   /login                           /login ✓
  NAV    Log in (mobile)       href="/login"                     root-relative   /login                           /login ✓
  NAV    CTA                   href={cta.href}                   caller-supplied n/a — landing uses DemoCta        /signup ✓
  FOOTER Pricing               href="#pricing"                   bare fragment   scrolls to #pricing              🔴 NOTHING — no #pricing on this page
  FOOTER Privacy               href={PRIVACY_PATH} = "/privacy"  root-relative   /privacy                         /privacy ✓
  FOOTER Terms                 href={TERMS_PATH} = "/terms"      root-relative   /terms                           /terms ✓
  FOOTER Contact               href="/contact?topic=…"           root-relative   /contact ✓                       /contact ✓
```

**Bare fragments: 3. Broken on `/landing/cost`: 3 of 9.**

🔴 **THE THIRD ONE IS THE ONE YOU DID NOT EXPECT, AND IT IS WORSE THAN THE PRICING LINKS.** The nav
logo is `href="#"` with `aria-label="HatchGrab home"`. **On the landing that is survivable** — the
landing *is* home on hatchgrab.com, so a link that goes nowhere lands you where you already are. **On a
child route it is a control labelled "home" that does nothing**, and a screen-reader user is told it is
home. ⚠️ **It has been that way since long before the extraction; the extraction only gave it a second
route on which to be wrong.**

✅ **The other six are root-relative and correct on both routes.** No change was needed and none was
made.

---

# §2 — TASK 1: THE FIX, AND WHY IT IS A PROP

## 2.a Which path the anchors must use — established from `proxy.ts`, not assumed

```ts
if (pathname === '/' && isHatchGrab(host)) {
  return carrySessionCookies(NextResponse.rewrite(new URL('/landing', request.url)))
}
```

🔴 **`NextResponse.rewrite`, NOT a redirect — so on hatchgrab.com the landing renders while the URL stays
`/`.** That single fact decides the whole task, and it is why `/landing#pricing` is not free.

## 2.b 🔴 NO SINGLE HARDCODED PATH IS CORRECT EVERYWHERE — THIS IS THE ANSWER TO YOUR ⚠️

| href | landing on hatchgrab.com (URL `/`) | landing at `/landing` (dev) | from `/landing/cost` |
|---|---|---|---|
| `#pricing` (today) | scrolls ✅ | scrolls ✅ | 🔴 **nothing** |
| `/landing#pricing` | 🔴 **NAVIGATES** — URL `/` → `/landing` | scrolls ✅ | works ✅ |
| `/#pricing` | scrolls ✅ | 🔴 goes to the **Village Foodie map** | 🔴 wrong on a non-hatchgrab host |

**Row 2 is what you asked me to check for.** Addressing the landing explicitly — the literal instruction
— **changes the landing's behaviour in production**: a link to `/landing#pricing` clicked while the
address bar reads `/` is a different path, so the browser performs a full navigation instead of
scrolling. 🔴 **A nav that reloads the page it is already on, and a URL that silently changes from the
canonical root to `/landing`.** That is the regression you named.

**Row 3 fails for a different reason:** `/` is only the landing on a hatchgrab host. On
villagefoodie.co.uk — or on `localhost:3000` without the `hatchgrab.localhost` alias — `/` is the
discovery map.

## 2.c ✅ WHAT I DID: AN OPTIONAL `landingHref`, DEFAULTING TO TODAY'S BEHAVIOUR

```tsx
export function LandingNav({ cta, landingHref = '' }: { cta?: NavCta; landingHref?: string } = {})
export function LandingFooter({ landingHref = '' }: { landingHref?: string } = {})
```

- **The landing passes nothing** → `''` → the anchors stay bare fragments → **byte-identical rendered
  output, no behaviour change on either host.**
- **A child route passes `'/landing'`** → a real route on **every** host, so it works regardless of
  whether `/` happens to be the landing.

⚠️ **This is the same shape as the `cta` prop added yesterday, and for the same reason: optional, with
its absence being the landing's behaviour.** It is why `app/landing/page.tsx` needed no edit.

⚠️ **I chose this rather than proposing-and-waiting because it makes your ⚠️ condition not arise** —
the landing's behaviour does not differ, so there was nothing to stop on. **If you would rather have row
2 (one canonical href, accepting the navigation on hatchgrab.com), that is a one-line change and the
table above is the trade you would be taking.**

## 2.d ✅ THE LANDING'S RENDERED HREFS ARE PROVEN UNCHANGED

The file is untouched (identical SHA-256), but the **components** changed, so the file hash is not the
proof — **the rendered `href` values are.** Each expression evaluated at both prop values:

```
  link              before        default (landing)   identical   /landing/cost
  nav logo          #             #                   true        /landing
  nav Pricing       #pricing      #pricing            true        /landing#pricing
  footer Pricing    #pricing      #pricing            true        /landing#pricing

  => landing rendered hrefs unchanged: true
```

✅ **`landingHref || '#'` on the logo rather than a template literal**, so the child route gets
`/landing` and not a dangling `/landing#`.

✅ **And the target exists:** `app/landing/page.tsx` carries `<section id="pricing">`, so
`/landing#pricing` lands on a real anchor rather than at the top of the page.

## 2.e Every changed line, both components

```
  LandingNav.tsx
  <  export function LandingNav({ cta }: { cta?: NavCta } = {}) {
  >  export function LandingNav({ cta, landingHref = '' }: { cta?: NavCta; landingHref?: string } = {}) {
  <        <a href="#" className="nav-logo" aria-label="HatchGrab home">
  >        <a href={landingHref || '#'} className="nav-logo" aria-label="HatchGrab home">
  <          <a href="#pricing" className="btn btn-quiet nav-hide-sm">Pricing</a>
  >          <a href={`${landingHref}#pricing`} className="btn btn-quiet nav-hide-sm">Pricing</a>

  LandingFooter.tsx
  <  export function LandingFooter() {
  >  export function LandingFooter({ landingHref = '' }: { landingHref?: string } = {}) {
  <            <a href="#pricing">Pricing</a>
  >            <a href={`${landingHref}#pricing`}>Pricing</a>
```

**Five lines, all of them the signature or an `href`. No class, no markup, no other link touched.**

---

# §3 — TASK 2: THE HEADLINE

**Was:** `How much of your takings` / `are you handing over?`
**Now:** `What do your online` / `orders actually cost?`

✅ **Two lines, `<br />` between them, the second still in `ORANGE`** — the structure is unchanged.

**The split moved to keep them balanced:** 19 characters against 21, where the old pair was 24 against
21. **The orange line still carries the verb**, which is what made the original's second line the one
worth colouring.

✅ **Your reason is recorded at the site** so it is not reverted as taste: the old wording *"implies
the reader has been careless with their own money, and a combative frame primes a reader to discount the
result that follows. This page's whole job is to be believed; the figure carries the argument on its own
and does not need help from the question."*

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Task 0 audit | every `href` in both components, resolved for both routes | ✅ **table in §1 — 3 broken of 9** |
| Which path the anchors need | read `proxy.ts`'s root branch | ✅ **`rewrite`, so the URL stays `/`** |
| Landing behaviour unchanged | evaluate each `href` expression at `landingHref=''` | ✅ **all three identical** |
| Landing file untouched | `diff` + SHA-256 | ✅ **empty, `e6f092f1…` both** |
| Anchor target exists | grep the landing | ✅ **`<section id="pricing">`** |
| Changed lines | full diff of both components | ✅ **5, all signature or `href`** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean on all four files** |

⚠️ **A NOTE ON HOW THE TYPECHECK EARNED ITS KEEP HERE.** My first attempt applied the cost page's props
before the components accepted them — the components' edit had aborted on a mismatched indent. **The
typecheck failed with `Property 'landingHref' does not exist`**, which is exactly the state that would
otherwise have shipped as a runtime no-op: props passed and silently ignored, anchors still broken, page
still rendering.

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **No link has been clicked**, on either
   route, on either host.
2. 🔴 **THE SCROLL-VERSUS-NAVIGATE BEHAVIOUR IS REASONED FROM THE URL, NOT WATCHED.** The claim that a
   fragment-only change scrolls while a path change navigates is standard browser behaviour and the
   `rewrite` is read from source — **but I have not seen the address bar on hatchgrab.com, and that is
   the fact the whole §2.b table rests on.** ⚠️ **If you check one thing when you run it, check that the
   landing's URL is `/` and not `/landing`.**
3. ⚠️ **`/landing#pricing` from the cost page has not been followed.** It should navigate to the landing
   and scroll to the pricing section; the anchor exists, but the jump has not been seen.
4. ⚠️ **The logo fix is untested on a child route.** It now points at `/landing`, which is a route
   change rather than a scroll — **the first time that control has ever navigated anywhere.**
5. ⚠️ **The headline's two-line balance is arithmetic on character counts**, not a look at the rendered
   `md:text-5xl`. Character count is a poor proxy for rendered width in a bold display face.
6. ⚠️ **Everything else carries forward:** the `.hg-landing` chrome scoping unrendered, the bracket
   background uncompiled, the range focus ring, 375px behaviour, and the gate, which has still never
   fired.

## 🔴 ONE THING FOR YOU

**Whether to take row 2 of §2.b instead** — one canonical `/landing#pricing` everywhere, accepting that
the landing's own nav navigates rather than scrolls on hatchgrab.com. **I took the option that leaves the
landing untouched, because that was the 🔴 constraint; the other is defensible if you would rather have
one href than a prop.**
