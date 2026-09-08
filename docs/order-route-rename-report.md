# Rename the scan/decider route: /o/<slug> → /order/<slug>

**Built, not deployed.** tsc clean. Verified locally against the running dev server (port 3000). Scope respected: only the routes, the proxy/vercel registrations, the QR builder, and the copy were changed.

## 🔴 FLAG — a forced implementation detail (URL is exactly `/order/<slug>`)
`app/order/[id]/manage/page.tsx` already owns the `app/order/` dynamic segment name `[id]`. Next.js forbids two different dynamic segment names at one path level, so the decider **must** live at **`app/order/[id]/page.tsx`** (not `[slug]`). The **URL is still exactly `/order/<slug>`**; only the internal param is named `id` and carries the slug. `/order/<orderId>/manage` is a deeper path and does not collide with the `/order/<slug>` leaf. `/order/<x>` (bare) was a 404 slot before — nothing served it (only `lib/email.ts:368` builds `/order/<key>/manage`), so nothing is shadowed.

## Item 2 — the `/o/` sweep (counted BEFORE changing anything): 15 occurrences
| # | Location | Kind | What I did |
|---|---|---|---|
| 1-3 | `app/o/[slug]/page.tsx` :1,7,23 | route + comments | **Rewritten** → permanent shim (item 3) |
| 4 | `app/dashboard/[token]/page.tsx:1673` | comment | Left — out of scope (dashboard file); now slightly stale, harmless |
| 5 | `app/trucks/[slug]/order/layout.tsx:18` | comment | Left — out of scope; stale, harmless |
| 6 | `app/manage/[token]/page.tsx:8901` | comment | Left — out of scope; stale, harmless |
| 7 | `lib/provision-truck.ts:35` | "no i/l/o/u" (base32 alphabet) | **Not a path** — irrelevant |
| 8-9 | `lib/custom-domain/copy.ts` :263,269 | copy comments | **Updated** → `/order/<slug>` + char count (item 6) |
| 10 | `lib/custom-domain/copy.ts:277` | `scanUrl` return | **Repointed** → `/order/${slug}` (item 4) |
| 11 | `lib/custom-domain/redirect-target.ts:13` | comment | Left — item 1 forbids touching this file; stale, harmless |
| 12-13 | `proxy.ts` :31,33 | comments | Left — still accurate about `/o/` |
| 14 | `proxy.ts:39` | `isGeneralPublic` registration | **Kept + added** `/order` leaf |
| 15 | `vercel.json:32` | `/o/(.*)` noindex rule | **Kept + added** `/order/(.*)` |

## Item 1 — decider created, logic moved not reimplemented
`app/order/[id]/page.tsx` holds the same `customDomainFor(slug)` call, `force-dynamic`, and 307 redirect the old `/o/` route had — moved verbatim. **`lib/custom-domain/redirect-target.ts` (the five conditions) is untouched.**

## Item 2 — registered `/order/` in every place `/o/` appears
- **`vercel.json`** — added a `/order/(.*)` `X-Robots-Tag: noindex, noarchive` rule, byte-identical to the `/o/(.*)` one. (It also covers `/order/[id]/manage` — correct: a per-order page should be noindex.)
- **`proxy.ts` `isGeneralPublic`** — added `/order` metering. 🔴 **Leaf-only** (`p === '/order' || /^\/order\/[^/]+$/.test(p)`), NOT `startsWith('/order/')`: unlike `/o/`, the `/order/` prefix has a deeper child (`/order/<id>/manage`), and a `startsWith` would have silently pulled that page into the 60/min limiter — a scope change `/o/` never made. The leaf match keeps the metered scope identical to `/o/`.
- **route metadata** — `/order/[id]/page.tsx` carries `metadata = { robots: { index:false, follow:false } }` (same as `/o/`).
- **`lib/custom-host.ts` allowlist** — `/o/` is **not** in `CUSTOM_HOST_ALLOWED` (only `/`, `/api/embed/events`, `/_next/static/`, …). The decider runs on the hatchgrab host, never a custom host, so `/order/` mirrors `/o/` and is **not** added — no change needed.
- **`isPublic` list** — as the report noted, **`/o/` is not in it**. 🔴 Verified further: **`isPublic` (proxy.ts:308) is defined and never consumed** (one reference in the whole file — the definition). So membership is behaviourally moot; `/order/` is likewise not added, matching `/o/`.

## Item 3 — `/o/<slug>` reduced to a permanent shim → `/order/<slug>`
`app/o/[slug]/page.tsx` now just `redirect('/order/<slug>')`. Kept forever (no deprecation date), keeps its own `metadata.robots`, its `/o/(.*)` vercel rule and its `/o` proxy metering. 🔴 **307, not 308, deliberately** — "permanent" here means the route is kept forever, not the HTTP status; a browser-cached 308 on a *printed* code is the trap the whole design forbids, and the real per-scan decision now happens at `/order/<slug>` anyway. **FLAG:** if you meant HTTP-308, say so and I'll switch it — I read "permanent shim" as lifetime and kept the codebase's documented 307 discipline.

## Item 4 — both QR constructions repointed
Changed the single builder `scanUrl` (`copy.ts:280`) → `/order/${slug}`. Both dashboard surfaces read one value, `customerOrderUrl = scanUrl(truck.slug, customerUrlBase)` (`dashboard/[token]/page.tsx:1680`): the **copy-link** (`handleCopyOrderLink`, :1683) and the **fullscreen QR** (`handleShowQR` → `generateQRWithLogo(orderUrl=customerOrderUrl)`, :1751). One source → **both encode `/order/<slug>`.** (V11.51's "updated only one" trap is avoided by construction — there is one builder.)

## Item 5 — the ~10 inline `/trucks/<slug>/order` sites untouched
Confirmed: my changed-files list is `app/order/[id]/page.tsx` (new), `app/o/[slug]/page.tsx`, `proxy.ts`, `vercel.json`, `lib/custom-domain/copy.ts` — none of the inline serving-URL builders (payments/return, embed, discovery, admin create/provision, whatsapp/meta webhooks, whatsapp-preview) are among them. They point at the serving route, which did not change.

## Item 6 — operator-facing copy updated
`copy.ts` doc/copy comments that named the address updated to `/order/<slug>` (incl. the QR-length note, now 46 vs 53 chars). The operator-facing URLs themselves are produced by `scanUrl`/`orderPageUrl`, so they follow automatically.

## VERIFY (locally exercised on the running dev server, port 3000)
| Check | Result |
|---|---|
| `/order/pizzeria-gusto` status + target | **307 → `/trucks/pizzeria-gusto/order`** — same as `/o/` produced today (no custom domain set) ✅ |
| `/o/pizzeria-gusto` | **307 → `/order/pizzeria-gusto`** ✅ |
| `/trucks/pizzeria-gusto/order` | **200**, unchanged ✅ |
| noindex header on `/order/` | 🔴 **Could NOT observe locally** — `vercel.json` header rules apply only at the Vercel edge, **not in `next dev`**. Proven, not assumed: `/trucks/…/order` **also** returns no `x-robots-tag` locally, so the header is edge-only. It is registered for `/order/(.*)` identically to `/o/(.*)` and `/trucks/(.*)` (both measured returning `noindex, noarchive` live last task) **and** on the route metadata. Observing it on `/order/` requires a deploy, which is out of scope. |
| both QR encode `/order/<slug>` | ✅ one shared builder (`scanUrl`, now emits `/order/${slug}` — confirmed at source line 280) feeds both the copy-link and the fullscreen QR |

**Deployed nothing.** No file changed outside the routes, the proxy/vercel registrations, the QR builder and the copy.

## FLAGS
- Segment name forced to `[id]` (framework constraint) — URL unchanged; flagged above.
- `/o/` shim is 307 (permanent *lifetime*, not HTTP-308) — flagged for your call.
- noindex on `/order/` is not locally observable (edge-only header) — reported as unobserved, not inferred-as-present.
- No garbled spans.

*2026-09-04. Built + locally verified; not deployed.*
