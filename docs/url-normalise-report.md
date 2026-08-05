# URL normalisation

**Date:** 4 August 2026.
**Migrations:** none. **SQL:** none. **`next dev` / `next build`:** not run.
No garbled spans.

---

## N0. THE DIAGNOSIS

### (a) Where the error came from — traced end to end

Dominic's instinct was right: nothing was ever fetched. The chain, in order:

**1. The server rejects it before any browser launches** —
[app/api/manage/verify-schedule-url/route.ts:161](app/api/manage/verify-schedule-url/route.ts#L161):

```ts
if (!url || !url.startsWith('http')) {
  return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
}
```

`www.example.com/events` fails `startsWith('http')`. Returns **400**, with an `error` field and — this
is the part that matters — **no `reason` field**.

**2. The client has no case for that**, in both copies of the handler:

```ts
const reason: string = data.reason || (res.status >= 500 ? 'launch_failed' : 'unreachable')
```

`data.reason` is undefined and 400 is not ≥ 500, so `reason` falls through to `'unreachable'`.

**3. Which maps to the wrong sentence:**

> `unreachable: "Couldn't reach this website. Check the URL and try again."`

So the exact string was correct code doing exactly what it was told — the fault was that a *parse
refusal* had no representation, and fell into the *network failure* bucket by default. It appeared
instantly because Puppeteer never started.

### ⚠️ A second, quieter fault the same input caused

The Facebook/Instagram guard **failed open** on a scheme-less string
([:2900](app/manage/[token]/page.tsx#L2900) and [:7924](app/manage/[token]/page.tsx#L7924)):

```ts
const isBlockedDomain = (url: string): boolean => {
  try { const hostname = new URL(url).hostname.toLowerCase(); return BLOCKED_DOMAINS.some(…) }
  catch { return false }        // 🔴 unparseable → "not blocked"
}
```

`www.facebook.com/mytruck` threw in `new URL`, was caught, and returned **false** — so it was not
recognised as blocked. It was not being allowed deliberately; it was simply unreadable. Normalising
first repairs this as a side-effect, and it is now verified: `www.facebook.com/mytruck` →
`https://www.facebook.com/mytruck`, which the guard reads correctly.

### (b) Every place an operator can type a URL

| # | Field | Where | Before | Now |
|---|---|---|---|---|
| 1 | **Schedule URL** (setup wizard, Route A) | `app/manage/[token]/page.tsx:5354`, verified by `schedVerify` | raw — the reported fault | **normalised** |
| 2 | **Schedule URL** (Settings → Your schedule) | `:8520`, `handleVerifyUrl` **and** the blur-save | raw on **both** paths | **normalised on both** |
| 3 | **Website** (Settings → Online presence) | `:8370`, blur → `saveFormField()` | raw, no validation | **normalised on save** |
| 4 | Allergen card URL (`allergen_info_url`) | `:3266` | n/a — set from a **file upload**'s returned storage URL | unchanged, correctly |
| 5 | `social_instagram` / `social_facebook` | — | **no UI exists** on Settings (allowlisted server-side only) | nothing to change |
| 6 | Menu import | `MenuUploadFields` | file or pasted text only — **no URL input** | n/a |
| 7 | Landing demo upload | `components/landing/DemoUpload.tsx` | file/text only — **no URL input** | n/a |

**So the same scheme-less failure existed in three of them, and all three now go through one helper.**

Fields 4–7 are not normalised, and each for a stated reason: #4 is machine-generated, #5 has no input,
#6–7 take no URL.

### ⚠️ Evidence that this had already started to drift

`trucks.website` is rendered as an `href` on two customer pages, and **each one carries its own copy of
the same patch**:

```tsx
// app/trucks/[slug]/TruckClient.tsx:199
href={truckInfo.websiteUrl.startsWith('http') ? truckInfo.websiteUrl : `https://${truckInfo.websiteUrl}`}
// app/venues/[slug]/VenueClient.tsx:83
const cleanWebsite = venueInfo?.website ? (venueInfo.website.startsWith('http') ? … : `https://${…}`) : ''
```

One fix, written twice, at the display end rather than the entry end. **Both are left exactly as they
are** — they are customer-facing render code (out of scope per N3) and they still correctly defend
against rows stored before today. Normalising at the input is what stops a third copy appearing.

---

## N1. NORMALISE

**The helper:** [lib/url-normalise.ts](lib/url-normalise.ts) — `normaliseUrl(input): string | null`.

**Call sites** (all four in `app/manage/[token]/page.tsx`):

| Line | Path |
|---|---|
| [:2938](app/manage/[token]/page.tsx#L2938) | wizard Route A — `schedVerify` |
| [:7937](app/manage/[token]/page.tsx#L7937) | Settings — `handleVerifyUrl` |
| [:8527](app/manage/[token]/page.tsx#L8527) | Settings — schedule URL **blur-save** |
| [:8373](app/manage/[token]/page.tsx#L8373) | Settings — **website** blur-save |

The blur-saves matter as much as the Verify buttons: without them an operator who typed `www.…` and
tabbed away would have the scheme-less string **saved** and later handed to the scraper — the same
failure, one step downstream, where no error message would reach them at all.

Both verify paths also write the corrected address back into the field, so what was checked and what is
on screen are the same string.

### 🔴 The "plausibly a hostname" test

Applied to the authority only (everything before the first `/`, `?` or `#`):

```ts
const PLAUSIBLE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?$/i
```

* two or more dot-separated labels — a bare word is a typo, not a host;
* each label is letters/digits/hyphens, and cannot start or end with a hyphen;
* the final label is **at least two letters**, so `192.168.0.1` is refused;
* an optional numeric `:port`;
* no `@` — credentials in a typed address are not something to silently forward to a scraper;
* and whatever survives must still parse via `new URL` with an `http:`/`https:` protocol.

**Verified behaviour** (run against the helper's logic):

| Input | Result |
|---|---|
| `www.example.com/events` | `https://www.example.com/events` |
| `example.com/events` | `https://example.com/events` |
| `  www.example.com/events  ` | `https://www.example.com/events` |
| `http://example.com/x` | `http://example.com/x` — **unchanged** |
| `https://example.com/x` | `https://example.com/x` — **unchanged** |
| `sub.domain.co.uk/a?b=1#c` | `https://sub.domain.co.uk/a?b=1#c` |
| `example.com:8080/x` | `https://example.com:8080/x` |
| `www.facebook.com/mytruck` | `https://www.facebook.com/mytruck` → now correctly **blocked** |
| `my events page` / `hello` / `example` / `a.b` | **null** |
| `192.168.0.1` | **null** |
| `-bad.com` / `bad-.com` | **null** |
| `ftp://` / `mailto:` / `javascript:` | **null** |
| `''` / whitespace | **null** |

**🔴 Default is https and never http.** `http://` is returned exactly as typed — an operator who wrote a
scheme has already chosen, and rewriting it would silently redirect their request; some schedule pages
genuinely are http-only. Defaulting applies only where there is no scheme to respect.

### A defect I introduced and caught before shipping

My first `HAS_SCHEME` was `/^[a-z][a-z0-9+.-]*:/i` — RFC 3986 permits a dot in a scheme name. That made
it match `example.com:` in `example.com:8080/x`, so a perfectly ordinary host:port address was refused as
"a scheme we don't accept". Found by running the helper against the table above rather than by reading
it. The dot is now excluded from the scheme class: every real scheme still matches, and host:port falls
through to the hostname test where it belongs.

### One accepted false-accept, stated rather than hidden

`notes.txt` normalises to `https://notes.txt` — the test cannot distinguish a file extension from a TLD.
That is deliberate: the DNS lookup then fails and the operator gets the honest *"we couldn't reach this
website"*, which is now true. Refusing it would mean shipping a TLD list, and being wrong about a new
TLD is worse than one wasted fetch.

---

## N2. THE ERROR MESSAGES

The five-string map was **written out twice, verbatim** — once in the wizard, once in Settings. It is now
one definition at module scope ([:81](app/manage/[token]/page.tsx#L81)) read by both, so the two surfaces
cannot tell an operator different things about the same failure.

| Case | Message |
|---|---|
| **malformed** — nothing was fetched | "That doesn't look like a web address. Try something like yourtruck.co.uk/events" |
| **unreachable** — DNS / connection / cert | "We couldn't reach this website. It may be down, or the address may be wrong." |
| **blocked** — the site answered and refused us | "We couldn't access this site — it may be blocking automated checks. Try the page that lists your schedule, or add events manually." |
| **no_content** — loaded, nothing readable | "We reached this page but couldn't read anything on it. Check it's publicly accessible." |
| **no_events** — read fine, nothing on it | "We couldn't find any upcoming events on this page. Make sure the URL points directly to where your schedule is listed." |
| **launch_failed** — our infrastructure | "Verification is temporarily unavailable. Please try again in a moment." |

Two changes beyond adding `malformed`:

* **`unreachable` no longer says "Check the URL"** — by the time it fires, the address parsed and a real
  fetch failed, so leading with the site being down is the more likely truth and stops blaming a URL that
  is probably fine.
* **`no_content` now says we reached it** — "We couldn't load this page" was ambiguous with a network
  failure; the case is specifically that we got there and found nothing readable.

**A 400 from the server now maps to `malformed`, not `unreachable`** — a 400 means the server declined to
fetch at all, so a network message would be false. This is the belt-and-braces half of the fix: client
normalisation means the server should no longer see a scheme-less URL, but if anything else ever
provokes a 400 the operator will be told the truth about it.

---

## N3. WHAT WAS NOT TOUCHED

* **Nothing after a successful fetch.** The `data.found` branches — `onVerifySuccess(data.events)` in
  Settings, and the enrol-then-show in the wizard — are unchanged.
* **No server-side or scraper code.** `app/api/manage/verify-schedule-url/route.ts`,
  `lib/schedule-extract.ts` and the scraper scripts are **not in the diff** — verified mechanically. The
  server's `!url.startsWith('http')` guard is left exactly as it is; it is now simply unreachable from
  the UI, and remains a correct backstop for any other caller.
* **The two customer-facing `startsWith('http')` render patches** in `TruckClient` and `VenueClient` —
  reported above, deliberately unchanged.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT CODE: 0

$ npx eslint "app/manage/[token]/page.tsx"
✖ 371 problems (294 errors, 77 warnings)

$ npx eslint lib/url-normalise.ts
(no output — clean)
```

| File | Baseline | Now |
|---|---|---|
| `app/manage/[token]/page.tsx` | **371** (294 errors, 77 warnings) | **371 (294 errors, 77 warnings)** — exactly the baseline |
| `lib/url-normalise.ts` | new | **0** |

### Files touched

| File | Reason |
|---|---|
| [lib/url-normalise.ts](lib/url-normalise.ts) | **NEW.** The one normaliser: trims, defaults to https, refuses anything not plausibly a hostname. |
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | Four call sites (two verify paths, two blur-saves); the duplicated message map collapsed to one module-scope definition with the new `malformed` case. |

### 🔴 Every operator-facing URL field, and whether it normalises

| Field | Normalises? |
|---|---|
| Schedule URL — setup wizard, Verify | **Yes** |
| Schedule URL — Settings, Verify | **Yes** |
| Schedule URL — Settings, blur-save | **Yes** |
| Website — Settings, blur-save | **Yes** (left as typed if unrecognisable — see below) |
| Allergen card URL | No — machine-generated from a file upload, never typed |
| Instagram / Facebook | No — **no input exists** |
| Menu import / demo upload | No — **no URL input exists** |

⚠️ **The website field is the one that corrects but never refuses.** A plausible address is normalised;
anything else is saved exactly as typed. Nothing fetches it, it is free text an operator may fill however
they like, and blocking a save would be a new obstacle where there was none. The schedule URL is the
opposite — it *is* fetched, so an unusable value is refused with the malformed message rather than saved.

### Gusto and Real Thai Food

**Improved, and nothing regressed.** They reach all three fields whenever they edit Settings, and none of
this is gated.

| | Before | After |
|---|---|---|
| Typing `www.…` into either schedule field | instant *"Couldn't reach this website"* about a site nothing had contacted | corrected to `https://www.…` and actually verified |
| Tabbing away from a scheme-less schedule URL | the broken string was **saved** and later fed to the scraper | normalised before saving, or refused with a clear message |
| Pasting a Facebook/Instagram page without a scheme | slipped past the block (the guard failed open on an unparseable string) | correctly blocked |
| A scheme-less website | stored raw; two render sites patched around it | stored as a real URL |
| A URL they already typed **with** `http://` or `https://` | worked | **byte-identical** — passed through untouched |

Values already stored stay as they are; this changes what is written from now on. The two render-side
patches remain, so historic rows keep working.
