# "Still showing the old image" — two causes, both found

**Nothing committed. Nothing deployed. No SQL, no migration.**
**Restore notes updated by ADDITION only** — `docs/landing-copy-restore-notes.md` §20, §21.

---

## VERIFICATION

**What I performed: EXECUTION.** Not a typecheck, not a source read.

| Check | How | Result |
|---|---|---|
| File on disk | **read the IHDR bytes** | `dashboard-v3.png` **800×600 = 1.3333** ✅ |
| Server payload | **`curl` at w=640/828/1080/3840** | **all 4:3, all `X-Nextjs-Cache: MISS`** ✅ |
| Served content | **opened the payload the server returned** | **the Add-order screen** ✅ |
| Landing HTML | **`curl -H "Host: www.hatchgrab.com"`** | references `dashboard-v3.png` ✅ |
| Old url after file removal | **`curl`** | 🔴 **HTTP 200, `X-Nextjs-Cache: HIT`** |

⚠️ **I have still not rendered the page in a browser.** The chain is verified file → server → decoded
pixels. **Your browser is the one layer I cannot see.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 CAUSE 1 — the rename landed on the Desktop, not in the repo

```
FOUND   ~/Desktop/landing page screeshots/dashboard-v3.png   455,356 B   mtime 21:09
REPO    public/screenshots/                                  held only dashboard.png + kitchen.png
```

**mtime 21:09 is `dashboard-v2.png`'s own mtime** — so this was a rename of the Desktop original.
**The repo never saw it, so the site could not have changed.** ⚠️ **This is the second time a rename
has landed on the Desktop copies** — the forensics report recorded the first.

**I have now done the rename in the repo.**

---

## 🔴 CAUSE 2 — the optimiser cache is keyed per WIDTH, and I only busted one

**This is the part I got wrong last round, and it is why my "verified" report did not match your screen.**

The cache key is **url + w + q**. The landing HTML emits **nine** widths in `srcSet` and uses
**`w=3840`** as the fallback `src`. **I curled `w=828` only** — so I proved one entry was fresh and
inferred the rest. **The entries the browser actually loads were never touched.**

### The proof, and it is unambiguous

**After deleting `public/screenshots/dashboard.png` from disk, its url still answered:**

```
HTTP 200 · Content-Type: image/png · X-Nextjs-Cache: HIT · 800x600
```

> 🔴 **The optimiser served an image for a file that does not exist.** Overwriting bytes at a fixed
> url has never invalidated anything — which is exactly why five overwrites in a row all "worked" on
> disk and none of them reached your screen.

---

## The fix — a new url, which invalidates every width at once

| | Before | After |
|---|---|---|
| File | `public/screenshots/dashboard.png` | **`public/screenshots/dashboard-v3.png`** (800×600, 4:3) |
| `page.tsx` src | `/screenshots/dashboard.png` | **`/screenshots/dashboard-v3.png`** |
| Old file | — | **retired to the session scratchpad, NOT deleted**; Desktop original untouched |
| alt text | *"the orders dashboard … kitchen capacity strip"* | **rewritten** — it described the wrong screen (§20) |

**Every width re-checked after the change: `w=640 → 640×480`, `w=828/1080/3840 → 800×600`, all
`MISS`, all 1.3333.**

---

## ⚠️ Something you should know about how you are viewing this

**`/landing` 308-redirects to `/`** (`proxy.ts:424`), and `/` only rewrites to the landing when
**the host contains `hatchgrab`** (`proxy.ts:438`).

> 🔴 **`http://localhost:3000/` therefore renders the Village Foodie discovery map, not the landing.**
> The landing is reachable locally only via a hatchgrab host.

**If you have been looking at `www.hatchgrab.com`, nothing I have done today is visible there** —
**`public/screenshots/` is UNTRACKED (`??`), has never been committed, and deploys are frozen.**
**I could not establish which of the two you were looking at.** It changes what you should do next.

---

## Scope

| Check | Result |
|---|---|
| Files changed | `app/landing/page.tsx` (src + alt), `public/screenshots/` |
| `landing.css` | **Untouched by this task** — aspect-ratio, object-fit unchanged |
| `kitchen.png` | **Untouched** ⚠️ still on a re-overwritable name, same class of risk |
| Phone placeholder | **Untouched** |
| Protected strings, Gusto `height={233}`, feature gate, admin gate | ✅ **Absent from the diff** |
| Committed / deployed | **Neither** |

---

## What I could not establish

1. 🔴 **Whether you are viewing localhost or production.** **If production — you will still see the
   old page, because these files have never been committed or deployed.**
2. **Whether your browser's own HTTP cache still holds the old url.** The old url is now unreferenced,
   so this should not matter — but a hard reload settles it.
3. **That the fan looks right.** **Not rendered.** Verified to the decoded bytes, no further.
