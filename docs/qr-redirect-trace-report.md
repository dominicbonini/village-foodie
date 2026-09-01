# The QR redirect target — a trace

**WHICH OF THE THREE I PERFORMED: A PARSE.** No typecheck, no execution. This is a read: every claim is
a quotation from a file on disk. **Nothing was run, no request was made, no page was loaded, and no file
was changed except this report.**

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 🔴 THE HEADLINE

**A customer who scans the QR code at the hatch, for a truck whose custom domain is live and confirmed,
CANNOT REACH THE ORDERING PAGE AT ALL.** The Order button on the page they land on sends them back to
the page they are already on.

It is **not** a browser redirect loop — no `ERR_TOO_MANY_REDIRECTS`, no spinner, no error of any kind.
Each hop is individually valid. The customer taps **Order**, the screen changes, and they are looking at
the same schedule again. **There is no error state to report and nothing in a log to notice.**

---

## 1. WHAT EXACT URL DOES THE REDIRECT TARGET?

🔴 **THE ROOT OF THEIR DOMAIN. Not the same path.**

`app/trucks/[slug]/order/layout.tsx:96`:

```ts
  if (host) redirect(`https://${host}/`)
```

`host` comes from `customDomainFor(slug)` (`:60-78`), which returns `truck.custom_domain` — the bare
host, e.g. `schedule.theirtruck.co.uk`. **The construction appends a single `/` and nothing else.**

⚠️ **THE QUERY STRING IS DROPPED.** The layout reads only `params.slug` — `grep` for `searchParams` in
that file returns nothing — so `?event_id=…` does not survive the redirect. **This matters in §4:** the
one piece of state that would let the destination know which event the customer wanted is discarded.

---

## 2. IF IT TARGETED THE SAME PATH — WHAT WOULD THEIR DOMAIN SERVE?

**It does not target the same path, so this case does not arise.** Answered anyway, because it is the
obvious "fix" and it is worse:

`proxy.ts:115-117`, on a custom host:

```ts
    if (!isAllowedOnCustomHost(pathname)) {
      return new NextResponse('Not found', { status: 404 })
    }
```

and `lib/custom-host.ts:63-90`:

```ts
export const CUSTOM_HOST_ALLOWED = {
  ROOT: '/',                        // the schedule page
  EVENTS: '/api/embed/events',      // the one endpoint the page fetches
} as const

export function isAllowedOnCustomHost(pathname: string): boolean {
  return pathname === CUSTOM_HOST_ALLOWED.ROOT
      || pathname === CUSTOM_HOST_ALLOWED.EVENTS
      || isAcmeChallenge(pathname)
}
```

🔴 **`/trucks/<slug>/order` matches none of the three, so a customer would get a bare `404 Not found`
on the operator's own domain** — no branding, no explanation, no way back. **Redirecting to the root is
the better of the two, and the current behaviour is not the naive mistake.** The defect is elsewhere.

---

## 3. WHAT A CUSTOMER WHO SCANNED THE QR WANTING TO ORDER EXPERIENCES

Step by step, each step quoted:

| # | What happens | Where |
|---|---|---|
| 1 | They scan. The printed code encodes `https://www.hatchgrab.com/trucks/<slug>/order` | `app/manage/[token]/page.tsx` — `orderUrl` |
| 2 | The layout resolves the truck, finds a live confirmed domain, and issues **307** to `https://<their-domain>/` | `layout.tsx:96` |
| 3 | The proxy sees a custom host, allows `/`, and **rewrites to `/domain`** | `proxy.ts:141-143` |
| 4 | `/domain` resolves the host to the truck and renders the schedule | `app/domain/page.tsx:135-180` |
| 5 | They see the truck's name, logo, upcoming events, and an **Order** button per event | `EmbedSchedule` → `TruckListCard` |
| 6 | They tap **Order** | — |
| 7 | 🔴 **They arrive back at step 2.** | §4 |

🔴 **THEY NEVER REACH A POINT WHERE THEY CAN PAY.** Steps 2-7 are a closed cycle. The ordering page
(`app/trucks/[slug]/order/page.tsx` — the only surface in the codebase that takes payment) is never
rendered, because its own layout redirects away before it can be.

⚠️ **What they actually perceive:** one tap, a brief navigation, and the same page again. Most people
will tap it two or three times, conclude the button is broken, and either walk off or ask at the hatch.
**The operator's first signal is a customer telling them.**

---

## 4. THE ORDER BUTTONS — WHERE THEY POINT, AND WHETHER THAT PATH IS REDIRECTED

**Both halves confirmed, and yes: a customer is sent back and forth.**

**Where they point.** `app/domain/page.tsx:179` passes our own origin into the schedule component:

```tsx
      <EmbedSchedule slug={truck.slug ?? ''} truckName={truck.name} orderOrigin={HATCHGRAB_URL} />
```

with `HATCHGRAB_URL` at `:36` = `process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'`.
That threads through `EmbedSchedule:85` to `components/TruckListCard.tsx:194`:

```tsx
                        href={`${orderOrigin ?? ''}/trucks/${slug}/order?event_id=${event.id}`}
```

**So the button points at `https://www.hatchgrab.com/trucks/<slug>/order?event_id=<id>`.**

⚠️ **AND THAT ABSOLUTE ORIGIN IS CORRECT AND MUST NOT BE REMOVED.** The comment above it at
`app/domain/page.tsx:176-178` records why: the href is relative by default, so without `orderOrigin` it
would resolve to **their** host, where the deny list would 404 it (§2). The prop is doing its job.

🔴 **IS THAT PATH SUBJECT TO THE REDIRECT? YES — IT IS THE EXACT PATH THE LAYOUT GUARDS.**
`app/trucks/[slug]/order/layout.tsx` wraps `/trucks/[slug]/order`, and the button targets
`/trucks/<slug>/order`. The query string is ignored by the layout, so the guard fires identically.

**The cycle, stated plainly:**

```
  QR scan  →  hatchgrab.com/trucks/rtf/order
              ↓ 307  (layout.tsx:96)
           schedule.theirtruck.co.uk/
              ↓ rewrite  (proxy.ts:142)
           /domain  →  the schedule page, with Order buttons
              ↓ click  (TruckListCard.tsx:194)
           hatchgrab.com/trucks/rtf/order?event_id=X
              ↓ 307  (layout.tsx:96 — the query is discarded)
           schedule.theirtruck.co.uk/          ← exactly where they were
```

🔴 **NOTHING BREAKS THE CYCLE, BECAUSE NOTHING DISTINGUISHES THE TWO ARRIVALS.** The layout's five
conditions are properties of the *truck row*, not of the request — there is no referrer test, no
cookie, no query parameter, no "came from their domain" signal. **The second arrival is identical to
the first, so it gets the identical answer.** The dropped `event_id` is the clearest symptom: the one
thing that would make the second request different is thrown away by the redirect that caused it.

⚠️ **The browser will not flag it.** Each navigation is one 307 followed by a 200. There is no
`ERR_TOO_MANY_REDIRECTS`, because the return leg is a **user click**, not a redirect. **This will not
appear in any error monitoring.**

---

## 5. IS THERE ANY PATH BY WHICH A CUSTOMER CANNOT REACH THE ORDERING PAGE AT ALL?

🔴 **YES, AND IT IS NOT A NARROW ONE: FOR AN AFFECTED TRUCK, EVERY PATH IS BLOCKED.**

`/trucks/[slug]/order` is the **only** ordering surface in the codebase — `app/order/[id]/manage` is the
post-order management page, not an entry point, and no other `page.tsx` touches the payment helpers.
Since the redirect sits on that route's layout, it fires for **every** arrival regardless of origin:

| How a customer gets there | Outcome |
|---|---|
| Scanning the printed QR at the hatch | 307 → schedule page |
| Tapping **Order** on their custom domain | 307 → schedule page (§4) |
| Tapping **Order** on `hatchgrab.com/trucks/<slug>` | 307 → schedule page |
| A link shared on social, in an email, in a WhatsApp reply | 307 → schedule page |
| A bookmark, or typing the address | 307 → schedule page |

**There is no route to payment for that truck while the condition holds.**

⚠️ **THE CONDITION IS EXACTLY THE SUCCESS STATE, WHICH IS WHAT MAKES THIS SHARP.** The redirect requires
all five of: a domain set, verified by a machine, **confirmed by a person**, plan still granting it, and
the last daily check healthy (`layout.tsx:60-78`). 🔴 **So ordering breaks at the precise moment an
operator finishes setting their domain up successfully** — and the confirm step, whose entire purpose is
an operator saying *"I looked at my page and it is right"*, is one of the five things that arms it.

✅ **AND THE BLAST RADIUS TODAY IS ZERO, BY ARTEFACT.** Nothing here is deployed: the layout is
untracked, `app/api/manage/route.ts` is uncommitted, and the three `custom_domain` migrations are
unapplied — so **no truck can hold a `custom_domain`, let alone a confirmed one.** No customer has ever
hit this. ⚠️ **I did not query the database to confirm that**; it follows from the migrations being
unapplied.

---

## 6. THINGS I NOTICED WHILE TRACING, RECORDED NOT FIXED

1. ⚠️ **The QR settings copy now makes a promise this breaks.** The card says *"This QR code now sends
   customers to `<their domain>`"* — true — and the surrounding copy frames the code as the ordering
   code. **A scan reaches the schedule, not the order page.** Whatever is decided, that copy and this
   behaviour have to agree.
2. ⚠️ **The schedule page is not a bad landing place — it is arguably the better one.** A customer at
   the hatch on a Saturday sees today's event with an Order button beside it. **The defect is only that
   the button cannot complete.** That is worth weighing before treating "redirect to the root" as the
   thing to undo.
3. ⚠️ **`/trucks/<slug>` — the profile page — is not on the custom-host allow list either**, so the
   lapsed-plan fallback link at `app/domain/page.tsx:161`, which points at
   `${HATCHGRAB_URL}/trucks/<name-slug>`, correctly leaves their host. Not affected by this, noted so it
   is not confused with it.
4. ⚠️ **`createSlug(truck.name)` at `:161` and `truck.slug` at `:179` are different slug spaces**, which
   the manual records as a known trap. Pre-existing, unrelated, untouched.

**No fix is proposed and nothing was changed.**

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING WAS RUN.** No page was loaded, no QR was scanned, no redirect was followed. **The cycle
   in §4 is traced through five files, not reproduced.**
2. **No browser behaviour was confirmed.** That a 307 followed by a click is not flagged as a redirect
   loop is standard behaviour, **not something I demonstrated.**
3. **The database was not queried**, so §5's "blast radius is zero" rests on the migrations being
   unapplied rather than on a count of rows.
4. **I did not test what an affected customer sees on a phone** — whether the return navigation is
   visually obvious or looks like a page that simply did not respond.
5. **The five redirect conditions were read, not exercised** in this workstream; they were proved by
   execution in `docs/embed-removal-final-report.md`.
