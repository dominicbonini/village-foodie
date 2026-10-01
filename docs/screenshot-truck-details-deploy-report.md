# Screenshot truck details — the hidden-truck audit, and the deploy

**Status: audited, green, pushed, and live.** Commit `d84cad8` on `main`; production serves this build's
chunks byte for byte (§4). **No STOP condition was found in item 1.**

No real email was sent. No Gemini call was made. No SQL was run. No `outreach_templates` row was created,
edited, seeded or deactivated. `do_not_contact` is never set. The schedule extraction and
`/api/inbound-schedule` are byte-identical to their previous state, asserted in the harness.

---

## 1 · Every anonymous reader of `discovery_trucks` — and every one honours both flags

### 🔴 The finding that makes this short: there is exactly **one**

A truck created by this path is hidden by `show_on_vf = false` **and** `show_on_hg = false`. That only
works if every anonymous reader honours those columns, so I enumerated the readers rather than the pages:

```
every non-admin .ts/.tsx under app/ lib/ hooks/ components/ containing
from('discovery_trucks')  or  discovery_trucks!   →   4 files
```

| File | Anonymous? | Honours both flags? |
| --- | --- | --- |
| `app/api/discovery/events/route.ts` | **yes — the only one** | ✅ four times over, below |
| `app/api/inbound-schedule/route.ts` | no — `INBOUND_SCHEDULE_SECRET` | n/a: a producer, not a visitor surface |
| `lib/discovery-gate.ts` | no — the single writer into `discovery_events` | n/a: resolves truck ids for writes |
| `lib/self-serve-discovery-link.ts` | no — the setup flow | n/a: writes the link and the shadow exclude |

⚠️ `lib/delete-truck.ts` and `lib/provision-demo.ts` name the table only in **comments** and are therefore
not on that list — I checked, because an over-long list is as misleading as a short one. Same for
`components/embed/EmbedParts.tsx:35`, `app/domain/page.tsx:159`, `lib/safe-href.ts:14` and
`lib/url-normalise.ts:147`: comments, not queries.

### The four read sites inside that one route, each gated

The column is chosen **by host**, which is why both flags must be false —
`app/api/discovery/events/route.ts:76-77`:

```ts
const showCol = isHG ? 'show_on_hg' : 'show_on_vf'
```

| # | Read site | Line | Gate |
| --- | --- | --- | --- |
| 1 | the trucks list | `:356-359` | `!t.excluded && t[showCol] === true` |
| 2 | the discovery-events query | `:109` | `.eq(showCol, true)` |
| 3 | per-event truck profile (incl. the orphan-recovery-by-name path at `:140`) | `:160`, `:164` | `if (truck.excluded) return null` · `if (!truck[showCol]) return null` |
| 4 | the operator read-through | `:271-277` | `if (truck.excluded) return false` · `if (!truck[showCol]) return false` |

🔴 **Site 3 fails safe by its own comment** (`:155`): *"neither resolves → the show_on_* gate below drops
it (fail-safe: an unknown truck never surfaces)."* So even an event whose truck cannot be resolved is
dropped rather than shown bare.

### The pages, and why they inherit it

Every public surface reaches that route and queries no table of its own —
`hooks/useVillageData.ts:34` is the single fetch:

```ts
const res = await fetch(`/api/discovery/events?t=${Date.now()}`, { … })
```

Its consumers are the map (`app/page.tsx:51`), the trucks list (`app/trucks/page.tsx:6`), the per-truck
page (`app/trucks/[slug]/TruckClient.tsx:38`) and the venue page (`app/venues/[slug]/VenueClient.tsx:16`).

- **Per-truck page** — `TruckClient.tsx:44-47` resolves the slug with
  `allTrucks.find(t => t.cleanKey === slug)` against that filtered payload, so a hidden truck yields
  `null` and the page renders **"Truck not found"** (`:299`). ⚠️ Its `generateMetadata`
  (`app/trucks/[slug]/page.tsx:9-35`) reads a **Google Sheet CSV**, not the database — a truck created from
  a screenshot is not in that Sheet, so it gets the default card.
- **Sitemap** — `app/sitemap.ts:28` enumerates the discovery root only; `:15-17` records that
  `/trucks/[slug]` is already `X-Robots-Tag: noindex` from `vercel.json` and that `/venues/[slug]` is
  deliberately not listed. **No truck URL is published anywhere.**
- **Embed** — `app/api/embed/events/route.ts:56,77` reads `trucks` and `truck_events`, never
  `discovery_trucks`.
- **Search / autocomplete** — there is no such public route; the full non-admin route listing was checked.

**✅ Nothing was changed in any reader, and no reader needs changing.**

### Pinned, so a future reader cannot appear quietly

Nine new assertions (§3) pin the four-file set and all six gate expressions as source text. A new
non-admin file that queries `discovery_trucks` now **fails the harness** until someone has looked at its
filter — which is the real risk here, since today's answer is only today's.

---

## 2 · The migrations — what I can and cannot confirm

**I cannot confirm this from here, and I am not going to imply otherwise.** Both probes sit behind
`verifyAdmin` (`socialColumnsReady` at `:98`, `logTableReady` at `:103`), no admin session is obtainable in
this environment, and the only other way to check is a production database read with the service-role key,
which your standing "runs no SQL" rule forbids. `curl` on the endpoint returns 401, as it should.

What I can state is the logic, read off the source. `route.ts:487`:

```ts
migrationNotes: [...(hasLog ? [] : [MIGRATION_LOG]), ...(hasSocial ? [] : [MIGRATION_SOCIAL])],
```

and `ScreenshotsPanel.tsx:295` renders the amber block only `{migrationNotes.length > 0 && (…)}`. So with
both migrations applied the array is empty and **no banner renders and no refusal path is reachable** —
the `!hasSocial` throw is the only writer of "run the facebook/instagram migration first" and it is
guarded by the same boolean.

**Your one-glance confirmation:** open Admin → Screenshots. **No amber box at the top = both migrations
are seen.** If you see one, it names which is missing, and nothing will have been written.

---

## 3 · Item 3 — the re-run, on an idle machine, sequentially

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **rc=0**, no output |
| `npm run build` | **rc=0** — `✓ Compiled successfully in 5.2s` |
| `node scripts/screenshot-truck-details.cjs` | **rc=0** — `✅ all 173 passed` |
| `HG_RENDER=1 node scripts/screenshot-truck-details.cjs` | **rc=0** — `173 passed` + **32** browser measurements, `✅ layout measured green in every engine that ran` |
| `node scripts/run-harnesses.cjs` | **rc=0** — **79 run · 79 passed · 0 failed** |

⚠️ **One correction to my own method, since it would have let a red run read as green.** My first tsc check
printed `tsc rc=1`, which I reported to myself as a failure and then found was the exit code of the `grep`
at the end of the pipeline — `grep -v` returns 1 when it filters every line away, which is exactly what
happens when tsc is clean. Re-measured with the output captured to a file: **rc=0, zero lines.** The
pipeline, not the compiler, was the thing returning 1.

### What grew in the harness: 164 → 173

Nine assertions, all from item 1: the four-file reader set; the host-chosen `showCol`; the trucks-list
gate; the events-query filter; the two per-event drops; the operator read-through; that every public page
goes through `useVillageData`; and that the sitemap names no truck. 🔎 Two of them were **wrong on first
run and corrected against what the repo actually contains** — my expected reader set listed
`lib/delete-truck.ts` and `lib/provision-demo.ts`, which only mention the table in comments.

The six broken variants from the previous change all still fail as they must (details→schedule routing,
overwriting a saved field, a fuzzy name auto-applied, a hidden truck published, the website on a new row,
an unnormalised Facebook URL).

---

## 4 · Item 4 — pushed, and the deploy proved by bytes

Commit **`d84cad8`**, pushed to `main`; local and `origin/main` are the same SHA.

The admin UI is behind authentication, so the deploy was verified through the public bundle, the same way
as last time. Production serves the chunk carrying this change's client code **byte for byte**:

| | local | production |
| --- | --- | --- |
| `_next/static/chunks/dadcce599e38cb73.js` | `7524318f0052e846c6a92b73894da7e0` (204,635 B) | **identical** |
| `_next/static/chunks/d8af0325aa8b535a.js` (last deploy's) | `aecda720467f075dc206c50fee6a7df3` | **identical** |

And the strings in the served file are this change's own: `Drop schedules or truck details here`,
`Needs a look`, `screenshot-log migration`.

⚠️ **The control, again, because the match means nothing without it.** A hash that cannot exist —
`/_next/static/chunks/0000000000000000.js` — returns **404**, not a body, so the server is not handing back
one fallback file for any chunk path.

🔎 `facebook/instagram migration` does **not** appear in that chunk, and that is correct rather than a
miss: `MIGRATION_SOCIAL` is a server-side constant in the route, so it reaches the browser only inside a
response body, never in the bundle.

**What this proves and what it does not.** It proves the deployed code is this commit's code. It does not
prove the tab behaves correctly against your live data — that is §2's one glance plus the eight hand-test
steps in `docs/screenshot-truck-details-report.md` §6, which still stand and which I still cannot run.

---

## 5 · Kept unchanged

The schedule extraction and `/api/inbound-schedule` behaviour (both asserted byte-identical) · one send
path · one contact writer (`logOutreachContact`) · one follow-up writer (`applyFollowUp`) · one `nextStep`
per page · every sequence guard · `EMAIL_FRAME_SANDBOX = 'allow-same-origin'` · no `outreach_templates`
row touched · `do_not_contact` never set automatically · **and every anonymous reader of
`discovery_trucks` left exactly as it was.** All pinned by the harness.
