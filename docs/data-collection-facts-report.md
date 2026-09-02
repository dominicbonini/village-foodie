# Data collection — facts for the Play Data safety declaration

**Date:** 1 September 2026
**READ-ONLY.** No file changed, nothing committed or deployed. **No changes proposed.**
Marked **READ**, **INFERRED**, **UNKNOWN** throughout. **No credential value is reproduced anywhere below.**

---

## 🔴 The two findings that bear directly on the declaration

1. **The site sets a third-party analytics cookie and runs autocapture, with no consent gate of any
   kind.** Confirmed by reading the installed library's own defaults, not from memory.
2. 🔴 **`/privacy` states the opposite.** It says *"We do not use advertising, tracking or third-party
   analytics cookies"* — and PostHog is a third-party analytics cookie. **It also omits PostHog and
   Stripe from its provider table while Stripe is running on a LIVE key.**

---

## 1. Every PostHog initialisation

**READ — exactly one, at `app/providers.tsx:53-58`. The complete config object:**

```jsx
if (typeof window !== 'undefined' && !IS_EMBED_ENTRY && !IS_CUSTOM_HOST_ENTRY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
  })
}
```

**That is the whole object. Two options. Everything else in §2 is a library default.**

### Where it runs

🔴 **EVERY ROUTE, by construction.** It runs at **module scope**, and `app/layout.tsx` imports this file
as the root layout — so it fires on module evaluation, before any component renders. The file's own
comment (`:10-13`) records exactly this.

### What it is gated on — three conditions, none of them consent

| Gate | Line | Effect |
|---|---|---|
| `typeof window !== 'undefined'` | `:53` | Client only; no server-side capture |
| `!IS_EMBED_ENTRY` | `:35-36` | Skipped when the **entry URL** path starts `/embed` |
| `!IS_CUSTOM_HOST_ENTRY` | `:50-51` | Skipped on any host not in `lib/custom-host.ts`'s allow-list |

⚠️ **NOT gated on consent. NOT gated on environment** — there is no `NODE_ENV` or preview check, and the
comment at `:47` states previews are deliberately included. **NOT gated on platform** — no
`isNativeApp` or Capacitor test, so **it runs inside the iOS and Android shells exactly as on the web.**

⚠️ **A limit the file states itself (`:26-30`):** the embed guard reads `window.location.pathname`
**once**, at module evaluation, so it is decided by the entry URL. A client-side navigation into
`/embed` would arrive with PostHog already initialised.

⚠️ **And the bundle still loads even when init is skipped** (`:31-33`) — a static import. What does not
happen is `init`: no cookie, no autocapture, no network call.

---

## 2. What it captures, given that config

🔴 **READ FROM THE INSTALLED BUNDLE, NOT FROM MEMORY** — `node_modules/posthog-js/dist/module.no-external.js`,
**posthog-js 1.386.6**, 222,551 bytes, reading `defaultConfig`.

| Capability | ON/OFF | Source |
|---|---|---|
| **Autocapture** (clicks, taps, form interactions) | 🔴 **ON** | library default — `autocapture: !0` (i.e. `true`) |
| **Pageviews** | 🔴 **ON** | library default. `capture_pageview` is version-gated on a `defaults` option we **do not pass**, so it takes the legacy branch: `true` |
| **Pageleave** | 🔴 **ON** | library default `capture_pageleave: "if_capture_pageview"` — and pageview is on |
| **Session recording** | ⚠️ **NOT DISABLED CLIENT-SIDE** — `disable_session_recording: !1` (`false`) | library default |
| **Heatmaps** | ⚠️ **UNKNOWN** | no `capture_heatmaps` / `__preview_heatmaps` key found in this build's defaults |
| **Console logs** | ⚠️ **UNSET** — `enable_recording_console_log: void 0` (`undefined`) | library default |
| **Network capture** | ⚠️ **UNSET** — `capture_performance: void 0` (`undefined`) | library default |
| **Rageclick** | ON (version-gated default) | `rageclick: e && e>="2026-05-30" ? {...}` |
| **Surveys** | not disabled — `disable_surveys: !1` | library default |
| 🔴 **Do Not Track** | **IGNORED** — `respect_dnt: !1` (`false`) | library default |
| **Opt-out by default** | **NO** — `opt_out_capturing_by_default: !1` (`false`) | library default |
| **Text masking** | **OFF** — `mask_all_text: !1`, `mask_all_element_attributes: !1` | library default |

🔴 **THE CRITICAL NUANCE ON THE LAST FOUR ROWS, STATED RATHER THAN GLOSSED.** `disable_session_recording:
false`, and the `undefined` values for console-log and network capture, mean **the client does not
forbid them** — whether they actually run is decided by the **PostHog project's server-side settings**,
which are not in this repository. **UNKNOWN whether session recording, console capture or network
capture are enabled on the project.** ⚠️ **For a Data safety declaration this must be checked in the
PostHog project settings, not inferred from the code** — the code permits all three.

⚠️ **Autocapture with `mask_all_text: false` records the text of elements interacted with.** **INFERRED:
on operator surfaces that includes button and menu-item labels; whether any customer-entered value is
captured depends on element types and is UNKNOWN without observing a live payload.**

---

## 3. Cookies

🔴 **YES. `persistence` is not set in the config, so it takes the library default
`persistence: "localStorage+cookie"`** — read from the bundle. **That is a cookie AND localStorage.**

**Cookie name — READ from the bundle's own expression:**

```js
"ph_" + t + "_posthog"          // t = persistence_name || this._config.token
```

**So the cookie is `ph_<project key>_posthog`.** The key is `NEXT_PUBLIC_POSTHOG_KEY` (a public
publishable key; the value is not reproduced here).

Two related defaults, both derived rather than fixed:

```
secure_cookie            "https:" === location.protocol
cross_subdomain_cookie   derived from location
```

⚠️ **INFERRED: on `https://www.hatchgrab.com` the cookie is Secure**, and — `cross_subdomain_cookie`
being derived — **likely scoped to `.hatchgrab.com`, so shared across subdomains. UNKNOWN without
observing a live `Set-Cookie`.**

⚠️ **Other browser storage in the product, not PostHog:** `localStorage` keys such as
`hg_trial_reminder_shown`, and Capacitor `Preferences` for per-device KDS settings. **Those are
first-party functional storage, not analytics.**

---

## 4. Consent, opt-out, cookie banner

## 🔴 There is none. Plainly: nothing in this product asks for, records, or offers a way to withdraw consent to analytics.

**READ — exhaustive sweep of `app/`, `components/`, `lib/`:**

```
cookie banner          0 hits        opt-out (analytics)    0 hits
CookieConsent          0 hits        accept cookies         0 hits
posthog.opt_out…       0 hits        opt_in_capturing       0 hits
DoNotTrack handling    0 hits        gdpr                   1 hit (unrelated comment)
```

The 15 matches for "consent" are **all code comments** — testimonial publication permission
(`landing/page.tsx:208`), a menu-option default (`manage:4682`), an operator-UX note
(`AddOrderPanel:2387`). **Not one is an analytics consent gate.**

⚠️ **And `respect_dnt` is `false` (§2), so a browser sending Do Not Track is captured anyway.**

---

## 5. Does it capture anything identifying a person?

### Directly — no. **READ, explicit counts across `app/`, `lib/`, `components/`:**

```
posthog.identify        0        posthog.alias           0
.identify(              0        setPersonProperties     0
posthog.reset           0
```

🔴 **There is no `identify()` call anywhere in the codebase.** With `person_profiles:
'identified_only'` and nothing ever identifying, **INFERRED: no person profile is created, and
`distinct_id` remains the library's randomly generated anonymous id — not derived from any real
identifier.**

### Indirectly — yes, and these are the ones to declare

**Every explicit `capture()` call, READ with its full property object:**

| file:line | Event | Properties |
|---|---|---|
| `app/page.tsx:151` | `searched_postcode` | 🔴 **`{ postcode: cleanCode, distance_filter }`** |
| `app/page.tsx:164` | `clicked_newsletter_subscribe` | 🔴 **`{ postcode: currentCode }`** |
| `app/venues/[slug]/VenueClient.tsx:57` | `clicked_share_venue_profile` | `{ venue }` |
| `VenueClient.tsx:75` | `clicked_newsletter_subscribe` | `{ source, venue }` |
| `VenueClient.tsx:178` | `clicked_call_venue` | `{ venue }` |
| `VenueClient.tsx:184` | `clicked_venue_website` | `{ venue }` |
| `app/trucks/[slug]/TruckClient.tsx:71` | `clicked_newsletter_subscribe` | `{ source, truck }` |
| `components/EventListCard.tsx:53` | `clicked_share` | `{ truck_name, venue }` |
| `EventListCard.tsx:94` | `clicked_add_to_calendar` | `{ calendar_type, truck_name, venue }` |
| `EventListCard.tsx:116` | `clicked_contact_button` | (object, truck/venue context) |
| `EventListCard.tsx:264` | `clicked_directions` | `{ truck_name }` |

🔴 **A POSTCODE IS PERSONAL DATA UNDER UK GDPR** when it can be combined with other data. Two events
capture a **visitor-entered postcode**, which is a location identifier at household granularity in the
UK. **For the Data safety form this is "Approximate location" at minimum, and arguably precise.**

⚠️ **No email, name, phone, operator token or order detail appears in any explicit `capture()`.** But
**autocapture is on and unmasked** (§2), so **UNKNOWN whether it incidentally captures form-field text
on operator or checkout surfaces** — that requires observing a live payload, which I did not do.

⚠️ **IP address is collected by PostHog by construction** — it is the request source; nothing in this
config disables it.

---

## 6. Where the data goes

**READ — `NEXT_PUBLIC_POSTHOG_HOST` in `.env.local`:**

```
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

## **PostHog Cloud, EU region.** Not self-hosted.

⚠️ **UNKNOWN — the value set in Vercel's production environment.** I read `.env.local` only. **The
production region should be confirmed there before the declaration is filed.**

---

## 7. Every other third party receiving user data

| Provider | What it receives | Routes / surfaces | Declared in `/privacy`? |
|---|---|---|---|
| **Supabase** | All account, truck, event, menu and **order** data; auth | Everything | ✅ yes — "United Kingdom (London)" |
| **Vercel** | Hosting: all request data, IP, headers | Everything | ✅ yes — "United Kingdom (London)" |
| **Brevo** | Recipient email, name, order contents in transactional mail (13 call sites to `api.brevo.com`) | Order confirmation, cancellation, domain instructions, signup | ✅ yes — "European Union" |
| **Google (Gemini)** | **Uploaded menu images/PDFs and their extracted text** (`generativelanguage.googleapis.com`, 5 sites) | Menu import, demo upload | ✅ yes — "United States" |
| **Apple / Google (APNs, FCM)** | Device push tokens; notification content | Native shells | ✅ yes — "United States" |
| 🔴 **PostHog** | **Pageviews, autocaptured interactions, IP, postcode searches, a cookie** | Every route except `/embed` and custom hosts | 🔴 **NO — absent from the table, and contradicted by §5's cookie sentence** |
| 🔴 **Stripe** | **Card payments, customer name/email on orders, Connect account data** | The customer ordering and payment path | 🔴 **NO — and the policy says a payment processor is a FUTURE addition** |
| ⚠️ **Vercel (domains API)** | Operator's custom domain name (`api.vercel.com`, 2 sites) | Custom-domain provisioning | partial — Vercel is listed as a host, not as a domains processor |
| ⚠️ **Meta** | WhatsApp/Messenger message content (`graph.facebook.com`) | Auto-replies | 🔴 **NO** |
| ⚠️ **Google Fonts** | Requests from the visitor's browser at render (`next/font/google` in 4 files) | Landing, contact, cost pages | 🔴 **NO** |

✅ **No Vercel Analytics or Speed Insights** — neither `@vercel/analytics` nor `@vercel/speed-insights`
is installed or imported. **This is the one analytics provider that is genuinely absent.**

⚠️ **`next/font/google` is self-hosted at build time by Next.js**, so **INFERRED: no runtime request to
Google from the visitor's browser. UNKNOWN without observing the network panel.**

🔴 **STRIPE IS ON A LIVE KEY.** `STRIPE_SECRET_KEY` in `.env.local` begins `sk_live_` — **real card
payments are processing** (value not reproduced). **The policy's line at `:114` — "As our service grows
we may add providers, including a payment processor" — describes as future something that is present and
live.**

---

## 8. What `/privacy` says, and whether it matches

**READ — `content/legal/privacy-policy.md:88-92`, verbatim** (rendered at `app/(legal)/privacy/page.tsx`):

> We collect basic technical data automatically: IP address, browser type, device type, pages viewed,
> and the site you arrived from. We use this to keep the sites working and secure, and to understand
> which pages are useful.
>
> **Cookies.** We use cookies that are strictly necessary to make the sites work — signing you in,
> keeping your basket, and remembering your preferences. We do not use advertising, tracking or
> third-party analytics cookies, and we do not track you across other websites.
>
> You can block or delete cookies in your browser settings, though parts of the site may stop working
> if you block the necessary ones.

**"PostHog" and "analytics" appear nowhere else in `content/legal/`.**

### Does it match §§2–4?

| Policy statement | Reality | Match? |
|---|---|---|
| *"cookies that are strictly necessary"* | `ph_<key>_posthog` is an analytics cookie, not strictly necessary | 🔴 **NO** |
| *"We do not use … third-party analytics cookies"* | PostHog Cloud EU is a third party; `persistence: "localStorage+cookie"` sets its cookie | 🔴 **NO — directly contradicted** |
| *"we do not track you across other websites"* | The cookie is first-party to our domain, and the embed and custom-host guards keep it off operators' sites | ✅ **appears accurate** |
| *"IP address, browser type, device type, pages viewed, and the site you arrived from"* | All true of PostHog, and it also collects **autocaptured interactions** and **searched postcodes** | ⚠️ **incomplete, not wrong** |
| *"to understand which pages are useful"* | Fair description of pageview analytics | ✅ accurate as far as it goes |
| §6 provider table | **Omits PostHog and Stripe** | 🔴 **NO** |
| §6 *"we may add … a payment processor"* | Stripe is live now | 🔴 **NO** |

## 🔴 Stated plainly: the cookie sentence in `/privacy` is factually contradicted by the code, and the provider table is missing two live processors — one of which handles card payments.

⚠️ **The §27 backlog already records part of this** — *"the /privacy provider table still needs Gemini
and Stripe adding"*. **Gemini has since been added; Stripe has not, and PostHog was never on that list.**

---

## What I could not establish

1. **UNKNOWN — whether session recording, console-log capture or network capture are enabled in the
   PostHog project.** The client permits all three (§2). **Must be read in PostHog's project settings.**
2. **UNKNOWN — whether autocapture incidentally records form-field text** on operator or checkout
   surfaces. `mask_all_text` is `false`. **Requires observing a live payload.**
3. **UNKNOWN — `NEXT_PUBLIC_POSTHOG_HOST` in the Vercel production environment.** I read `.env.local`.
4. **UNKNOWN — the live cookie's exact `Domain` and `SameSite`.** Both are derived at runtime.
5. **UNKNOWN — whether Google Fonts makes any runtime request.** `next/font/google` self-hosts at build.
6. **NOT OBSERVED — no page was loaded, no network panel inspected, no cookie jar read.** Every fact
   above is READ from source, from `.env.local`, or from the installed `posthog-js` bundle's own
   defaults.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** One boundary I held
deliberately: item 8 asks whether the policy matches items 2–4, and I have also reported that its
**provider table** omits PostHog and Stripe — that is beyond the literal question but is the same
document and the same declaration, and omitting it would have made this report misleading for the
purpose you stated.
