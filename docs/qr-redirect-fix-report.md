# Scoping the QR redirect — STOPPED, with the enumeration you asked for

**WHICH OF THE THREE I PERFORMED: A PARSE.** No typecheck, no execution. **Item 3's check produced a
stop condition, so item 2 was never built and there was nothing to execute.** Every claim below is a
quotation from a file on disk.

🔴 **NOTHING WAS CHANGED.** No file was edited, no deploy, no migration. The only file this workstream
created is this report.

**Nothing in the prompt arrived garbled.**

---

## 🔴 THE STOP — A LAYOUT CANNOT SEE `searchParams`

You wrote: *"Read how this framework passes them to a layout rather than assuming — if a layout cannot
see them, SAY SO and stop rather than moving the check somewhere I did not ask for."*

**It cannot.** This is not recalled — it is quoted from **this repository's own generated route types**,
`.next/types/routes.d.ts:134-153`, produced by Next 16.1.6:

```ts
  interface PageProps<AppRoute extends AppRoutes> {
    params: Promise<ParamMap[AppRoute]>
    searchParams: Promise<Record<string, string | string[] | undefined>>   // ← pages have it
  }

  type LayoutProps<LayoutRoute extends LayoutRoutes> = {
    params: Promise<ParamMap[LayoutRoute]>
    children: React.ReactNode                                              // ← layouts do not
  } & {
    [K in LayoutSlotMap[LayoutRoute]]: React.ReactNode
  }
```

`PageProps` declares `searchParams`. **`LayoutProps` declares `params` and `children` and nothing
else.** `.next/types/validator.ts:25` type-checks every layout in this app against `LayoutProps`, so the
omission is enforced, not incidental.

⚠️ **AND THE REASON IS WHY MOVING THE CHECK WOULD BE WRONG RATHER THAN MERELY OUT OF SCOPE.** Layouts do
not re-render on navigation within their segment — that is what makes them layouts. A layout that read
the query string would be reading a stale one on any client-side navigation, which is a worse defect
than the one being fixed: intermittent, dependent on how the customer arrived, and invisible in testing.

**So item 2 cannot be implemented where you scoped it, and I have not implemented it anywhere else.**

---

## 1. EVERY LINK TO `/trucks/<slug>/order`, AND WHETHER IT CARRIES `event_id`

Worked back from the surfaces. **One construction carries `event_id`. Fourteen do not.**

### ✅ CARRIES `event_id` — would reach the ordering page under the proposed rule

| Where | Line | URL |
|---|---|---|
| The Order button — schedule page, truck profile, embed, custom domain | `components/TruckListCard.tsx:194` | `${orderOrigin ?? ''}/trucks/${slug}/order?event_id=${event.id}` |

**That is the one the trace identified**, and the fix would work for it.

### 🔴 NO `event_id` — would still redirect

| # | Where | Line | What it is | What it would now do |
|---|---|---|---|---|
| 1 | **The printed QR code** | `app/manage/[token]/page.tsx:8822` | `orderUrl` | ✅ **Intended** — lands on their schedule |
| 2 | The copy-link row beside the QR | same `orderUrl` | operator shares this | Lands on their schedule |
| 3 | Dashboard header order link + QR | `app/dashboard/[token]/page.tsx:1441` | `customerOrderUrl` | Lands on their schedule |
| 4 | **Village Foodie discovery feed** | `app/api/discovery/events/route.ts:287` | `orderUrl` per event | ⚠️ A VF customer clicking Order leaves VF for the operator's domain |
| 5 | **WhatsApp auto-reply — order link** | `app/api/webhooks/whatsapp/route.ts:82` | `orderUrl` | Lands on their schedule |
| 6 | **WhatsApp auto-reply — schedule link** | `:81` | `scheduleUrl` | Lands on their schedule (arguably right) |
| 7 | **Meta WhatsApp — order link** | `app/api/webhooks/meta/whatsapp/route.ts:452` | `orderUrl` | Lands on their schedule |
| 8 | Meta WhatsApp — schedule link | `:451` | `scheduleUrl` | Lands on their schedule |
| 9 | Meta WhatsApp — capability message | `:416` | order URL | Lands on their schedule |
| 10 | WhatsApp preview (operator test) | `app/api/manage/whatsapp-preview/route.ts:158` | `orderUrl` | Lands on their schedule |
| 11 | Admin "create truck" response | `app/api/admin/create-truck/route.ts:178` | convenience link | Lands on their schedule |
| 12 | Admin "provision demo" response | `app/api/admin/provision-demo/route.ts:114` | convenience link | Lands on their schedule |
| 13 | **"Back to truck" links inside the order page** | `app/trucks/[slug]/order/page.tsx:2148, 2218, 2233, 4045, 4143` | five of them | ⚠️ **A customer already ordering who taps Back is ejected to the operator's domain** |
| 14 | **Post-payment fallback** | `app/api/payments/return/route.ts:132` | `menuUrl`, used when there is no draft key | 🔴 **See below** |

### 🔴 AND ONE THE RULE AS WRITTEN WOULD BREAK — THE PAYMENT CONFIRMATION

`app/trucks/[slug]/order/page.tsx:1880`, immediately after a card payment succeeds:

```ts
      window.location.href = `${window.location.origin}/trucks/${encodeURIComponent(slug)}/order?confirm=${encodeURIComponent(outcome.orderKey || …)}`
```

and the page reads it at `:232`:

```ts
  const confirmOrderKey = searchParams.get('confirm')
```

🔴 **THAT URL CARRIES `confirm`, NOT `event_id`.** Under *"redirect unless `event_id` is present"*, a
customer who has **just paid** would be redirected to the operator's schedule page and **would never see
their confirmation.** Their money has moved; the screen that tells them so does not load.

⚠️ The same applies to `app/api/payments/return/route.ts:132`, whose `menuUrl` is the destination of a
**303 from Stripe's own redirect** for 3DS and wallet flows. It carries neither parameter.

**Neither of these is hypothetical or rare — the first is every successful card order.** The rule needs
to be "redirect only a bare arrival" in the literal sense — **no query string that the ordering page
acts on** — rather than "no `event_id`". At minimum `confirm` must pass through too.

⚠️ **I am reporting this, not designing around it.** You asked for the enumeration so you could see what
you were choosing; this is the part of it that changes the answer.

---

## 2. WHAT I DID NOT DO

Item 2 was not implemented, for the reason in the stop. **No fix was applied anywhere** — not in the
layout, not in the page, not in the proxy, not in middleware.

---

## 3. WHERE THE CHECK *COULD* GO — options, not a choice

None of these is in scope for this brief; listing them so the next prompt can name one.

| Option | Where | Cost / risk |
|---|---|---|
| **A. In the page** | `app/trucks/[slug]/order/page.tsx` receives `searchParams` as `PageProps` | ⚠️ It is `'use client'` — it cannot issue a server redirect, so this means either converting it or adding a server wrapper, which is the layout problem again |
| **B. In a server page wrapper** | A new server component between layout and page | Sees `searchParams` properly. ⚠️ Restructures the route |
| **C. In `proxy.ts`** | Edge middleware sees the full URL including the query | 🔴 It has **no database access by design**, and the five conditions are all truck-row reads. It cannot decide this |
| **D. Keep the layout, invert the trigger** | Redirect on something the layout *can* see | 🔴 It can see only `params` and `children`. There is nothing there that distinguishes the two arrivals |

⚠️ **Option C deserves the flag: the redirect target is per-truck state, and the one place that can read
the query has no way to read the truck.** That is the shape of the problem, and it is why the redirect
ended up in a layout in the first place.

---

## 4. SCOPE CONFIRMATIONS (PARSE)

Requested in the verification list; they hold trivially because nothing was changed, but stated because
you asked.

- ✅ **The allow list is untouched** — `lib/custom-host.ts`, not opened.
- ✅ **The schedule page is untouched** — `app/domain/page.tsx`, not opened.
- ✅ **`TruckListCard` is untouched** — its `event_id` link at `:194` is exactly as the trace found it.
- ✅ **The QR URL is untouched** — `app/manage/[token]/page.tsx:8822`, unchanged.
- ✅ **The redirect status code is unchanged** — `redirect()` at `layout.tsx:96`, still 307, because the
  file was not edited.
- ✅ **The layout is byte-identical to what the trace report described.**

---

## 5. WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING WAS RUN.** No typecheck was needed because no code changed; no page was loaded and no
   redirect followed.
2. **The `LayoutProps` finding is read from generated types, not from a failed build.** I did not write
   a layout that reads `searchParams` and watch it fail to compile — which would be the stronger proof.
   ⚠️ The generated file is from a **previous** build of this app; if a newer Next changed the contract,
   this reflects what is on disk rather than what a fresh build would emit.
3. **The enumeration is from `grep` over `app`, `lib` and `components`.** A link built at runtime from
   parts, or one living in `content/`, `scripts/` or a database column, would not appear. ⚠️ In
   particular I did **not** audit `order_link_hg` / `order_link_vf` column values, which gate whether
   some of these CTAs render at all.
4. **The payment-confirmation break (§1) is traced, not reproduced.** No payment was made.
5. **I did not check whether any of the fourteen already redirect today** in a way that matters — they
   all hit the same layout, so they all do, but the customer consequence of each was reasoned rather
   than observed.
