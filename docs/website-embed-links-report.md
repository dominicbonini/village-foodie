# Website-embed — Stage 1b, two link fixes

**WHICH OF THE THREE I DID: A TYPECHECK AND FIVE EXECUTIONS.** `npx tsc --noEmit` exits 0. The parity
harness was rewritten for this stage and run at 1,296 cases; the four Stage 1 harnesses were re-run
unchanged and all still pass.

🔴 **Nothing was deployed. No migration was run.** `supabase/migrations/20260826_trucks_embed_enabled.sql`
remains written and unapplied; no SQL of any kind was executed against that database.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 0. Scope — two files

| File | Change |
|---|---|
| `components/TruckListCard.tsx` | two new props, both defaulting `false`; the venue lines lifted into one shared constant |
| `app/embed/[slug]/EmbedSchedule.tsx` | passes both props; its `🔴 recorded, not fixed` header replaced with what was done |

**Verified unchanged versus HEAD:** `app/trucks/[slug]/TruckClient.tsx` ·
`app/trucks/[slug]/order/page.tsx` · `lib/plan-features.ts` · `lib/domain.ts`. By mtime, no other file
in the repository was touched during this stage — `app/embed/[slug]/page.tsx`, `proxy.ts`,
`lib/features.ts`, `lib/ratelimit.ts`, `app/providers.tsx` and `vercel.json` all carry Stage 1
timestamps.

---

## 1. The Order/Pre-order CTA opens in a new tab

`components/TruckListCard.tsx`, on the existing `<a>`:

```tsx
                        // `undefined` when the prop is off, and React omits an undefined attribute
                        // entirely — so the three existing call sites emit an unchanged <a>.
                        target={openOrderInNewTab ? '_blank' : undefined}
                        rel={openOrderInNewTab ? 'noopener noreferrer' : undefined}
```

**`rel` travels with `target`, always, and they are one decision rather than two.** A `_blank` link
without `noopener` hands the opened page a live `window.opener` handle back to the frame that opened
it; `noreferrer` additionally stops the operator's page URL reaching us as a `Referer`.

⚠️ **Why this matters more than tidiness, and it is worth stating plainly.** The href is relative, so
in an iframe it resolves against our origin and loads the whole ordering flow inside the operator's
widget-sized box — **card entry included**, because the order page mounts Stripe's own iframe inside
it. Asking a customer to type a card two frames deep inside a third party's page is the part that had
to change; the cramped layout is the lesser half. With `_blank`, checkout happens top-level on
hatchgrab.com, where the address bar shows our domain.

---

## 2. The venue name is plain text in the embed

The venue lines were lifted into one constant so the linked and plain renderings cannot drift:

```tsx
  const venueLines = (
    <>
      <h3 className={`… group-hover:text-orange-600 transition-colors ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>
        {event.venueName}
      </h3>
      {areaLine && ( <p className="…">{areaLine}</p> )}
    </>
  );
```

and the block became:

```tsx
                    {plainVenueName ? (
                        // No anchor, no href, no title, no cursor-pointer — see plainVenueName above.
                        <div className="block min-w-0">{venueLines}</div>
                    ) : (
                        <Link
                            href={`/venues/${getVenueSlug(event.venueName, event.village || '')}`}
                            className="group block min-w-0 cursor-pointer"
                            title={`View venue details for ${event.venueName}`}
                        >
                            {venueLines}
                        </Link>
                    )}
```

🔴 **Plain text, not a disabled link.** There is no destination worth offering: the operator put this
widget on their site to show their schedule, not to route their customers into our directory.
Dropping the anchor also drops `cursor-pointer` and the hover colour, so it stops *looking* clickable
— a link that looks live and goes nowhere is worse than plain text.

⚠️ `group-hover:text-orange-600` is deliberately left on the `h3` in **both** branches. With no
`group` ancestor it simply never matches, and keeping it identical is what lets the two branches be
diffed against each other by eye.

---

## 3. 🔴 THE PROOF — 1,296 CASES, EMPTY DIFF

The git-HEAD component and the working-tree component were both transpiled and **run**, and the
**whole rendered tree** was serialised and compared. Stage 1's harness compared only the button's
label and colour; that is no longer sufficient evidence, because this stage changed the venue markup
**structurally**.

**Case count: 1,296** — the 3 pre-existing call-site prop shapes × 432 input combinations:

| Axis | Values |
|---|---|
| host (`isHatchGrab()` stub) | `false`, `true` |
| `event.source` | `operator`, `discovery` |
| `event.status` | `open`, `confirmed` |
| `event.orderLinkHg` | `true`, `false`, `undefined` |
| `event.orderLinkVf` | `true`, `false`, `undefined` |
| `event.village` | `'Kedington'`, `''`, `'The Bell'` (drives `showVillage`) |
| `event.postcode` | `'CB9 7'`, `''` (drives the `areaLine` null-safety) |

The three shapes are verbatim from the source: `TruckClient.tsx:301` `{event, slug}` ·
`order/page.tsx:2485` `{…hideOrderButton, compact, cornerAction}` · `order/page.tsx:2510`
`{…forceOrderButton}`.

```
TruckListCard — git HEAD vs working tree, FULL RENDERED TREE diffed
  1296 cases = 3 pre-existing call-site prop shapes x 432 input combinations
  (host x source x status x orderLinkHg x orderLinkVf x village x postcode)

  TREE DIFFERENCES: 0
  isHatchGrab() call-count differences: 0
  PASS — THE DIFF WAS EMPTY across all 1296 cases
```

**The diff was empty.** Both the rendered tree and the number of times `isHatchGrab()` was invoked
matched on every one of the 1,296 cases.

### The two normalisations in the serialiser, and why each is legitimate

Stated because a comparison is only as honest as what it chooses to ignore. Both mirror React's own
behaviour, and **nothing else is normalised** — class strings, hrefs, titles and text all compare
literally.

1. **Fragments are spliced away.** This stage lifts the venue lines into a `<>…</>`, and a fragment
   emits no DOM node. Leaving it in the serialisation would report a difference the browser never
   sees. This is the one place the authoring shape genuinely changed without the output changing, so
   it is the normalisation doing real work — and it is exactly the one to be suspicious of, which is
   why the `<Link>` wrapper, its `href`, its `className` and its `title` are all still compared
   literally inside it.
2. **`undefined` props are dropped.** React omits an attribute whose value is `undefined`. This is
   precisely the mechanism by which `target`/`rel` stay absent on the existing call sites, so it is
   asserted directly as well — see the last row below.

### The new props, when ON — the /embed shape, executed

Run with the host stub set to **Village Foodie**, to prove the behaviour is prop-driven and not
host-driven:

```
  PASS  Order CTA present
  PASS  target="_blank"                                          "_blank"
  PASS  rel="noopener noreferrer"                                "noopener noreferrer"
  PASS  NO <Link> anywhere in the tree (venue name is not a link)
  PASS  no /venues/ href anywhere
  PASS  no "View venue details" title anywhere
  PASS  venue NAME still rendered as text
  PASS  area line still rendered
  PASS  isHatchGrab() never called                                calls=0
  PASS  props OFF → venue <Link> is back, with its /venues/ href
  PASS  props OFF → the CTA has NO target and NO rel attribute
        {"className":"shrink-0 inline-flex items-center justify-center min-w-[104px] GREEN font-semibold
          px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap","href":"/trucks/rtf/order?event_id=e1"}
```

The last two rows are the ones that matter for the default-off claim: with the props omitted, the
venue link returns **with its `/venues/` href intact**, and the CTA's serialised attributes contain
**only** `className` and `href` — no `target` key, no `rel` key.

### Stage 1's harnesses, re-run against the changed component

```
  embed-gate     PASS (re-run, unchanged)      — 12/12 gate cases, chrome CLEAN
  embed-api      PASS (re-run, unchanged)
  posthog        PASS (re-run, unchanged)
  proxy-embed    PASS (re-run, unchanged)      — 11/11 bucket+key, 5 regression checks
```

---

## 4. What this closes, and what it does not

✅ **Both items in `docs/website-embed-build-report.md` §7 are now closed.** That section can be read
as superseded by this one.

⚠️ **The `/venues/<slug>` page itself is unchanged and still carries full Village Foodie chrome.** The
embed no longer *routes* anyone there; nothing about that page was touched, and it remains reachable
from `/trucks/[slug]` exactly as before.

⚠️ **`_blank` from inside a cross-origin iframe is a browser behaviour I did not observe.** The
attributes are proven present in the rendered tree; whether a given browser or an operator's own
`sandbox` attribute on the `<iframe>` permits the new tab to open is not something a module-level
execution can answer. **An operator who frames us with `sandbox` and without `allow-popups` would
break the Order button** — that is a real deployment note for whatever documentation ships with the
embed snippet, and it is not a code change.

---

## 5. What remains unverified

1. **Nothing was rendered in a browser and no iframe was loaded.** Every result above is a typecheck
   plus module-level execution with a stubbed React runtime.
2. **No new tab was ever opened.** See §4.
3. **The migration is still unapplied**, so `trucks.embed_enabled` does not exist and `/embed` would
   fall through to its fallback for every truck until it is run.
4. **`next build` was not run** — `tsc --noEmit` is a typecheck, not a build.
5. **No live data was read.** Every event and truck in every harness was constructed.
