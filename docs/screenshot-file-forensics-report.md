# Screenshot file forensics — where the 16:9 image came from

**Read-only. No CSS changed, no file changed, nothing deleted, nothing committed, nothing deployed.**

---

## VERIFICATION — what I actually read

**Everything below is read from bytes or from the running server. Nothing is arithmetic against belief.**

| # | Method | Why |
|---|---|---|
| 1 | **PNG IHDR chunk parsed directly** from each file | `sips` is a tool report; the IHDR is the file |
| 2 | **`curl` against your live dev server on :3000** | asks the browser's actual supplier |
| 3 | **Response bytes decoded** (PNG/WebP headers) | not the HTTP status, the image itself |
| 4 | **`.next/dev/cache/images` payloads decoded** | the cache Next 16 actually uses in dev |
| 5 | `ps` / `lsof` | confirmed your dev server, PID 94192, started **21:53** |

🔴 **I have still not rendered the page in a browser.** Your `document.querySelectorAll` measurement
remains the only observation of the DOM, and I have treated it as authoritative.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 🔴 THE ANSWER

**Both of us were right, about different things.**

- **The files on disk are 4:3.** IHDR-verified.
- **The live server serves 4:3.** Verified by reading the returned bytes.
- **Your browser was holding 16:9 bytes.** Also true.

**The 16:9 bytes are optimiser output generated at 19:00:17 — when the source at those paths genuinely
was 16:9. They are still in `.next/dev/cache/images`:**

```
21,788B  19:00:17  WEBP 640x360  (1.7778)   <- /_next/image?url=…kitchen.png&w=640
20,910B  19:00:17  WEBP 828x466  (1.7768)   <- /_next/image?url=…dashboard.png&w=828
```

🔴 **Those are exactly the two URLs your browser requested, at exactly the two widths, and both are
16:9.** Alongside them sit the current, correct entries:

```
37,175B  21:59:42  PNG 640x480  (1.3333)
36,739B  21:59:42  PNG 800x600  (1.3333)
```

**So the cache holds both generations. Your page was painted from the 19:00 one.**

---

## 1 · The actual bytes in `public/screenshots/`

**Two files. Nothing else. Dimensions read from the IHDR chunk, not from `sips`:**

| File | IHDR | Aspect | Size | Modified |
|---|---|---|---|---|
| `kitchen.png` | **640 × 480** | **1.3333** | 145,574 B | 2026-09-01 **21:12:06** |
| `dashboard.png` | **800 × 600** | **1.3333** | 158,295 B | 2026-09-01 **21:12:06** |

✅ **Both are 4:3. There is no 16:9 file at those paths and no third file.**

⚠️ **Note the filenames: `kitchen.png` and `dashboard.png` — NOT renamed.** See §2.

---

## 2 · `src` values vs the URLs the browser requested — and where your rename went

**`app/landing/page.tsx` right now:**

```
src="/screenshots/kitchen.png"      width={320} height={240}
src="/screenshots/dashboard.png"    width={400} height={300}
width={320} height={233}            ← the Gusto logo, untouched
```

**Your browser requested `%2Fscreenshots%2Fkitchen.png` and `%2Fscreenshots%2Fdashboard.png`.** ✅
**`src` and filenames agree.**

### 🔴 But your rename landed somewhere else, and that is why it busted nothing

**I found the renamed files — in the Desktop source folder, not in the repo:**

```
~/Desktop/landing page screeshots/kitchen-v2.png     2752x2064  21:08
~/Desktop/landing page screeshots/dashboard-v2.png   2752x2064  21:09
```

**Those are your two 13-inch originals, renamed in place.** 🔴 **Nothing in `public/screenshots/` was
renamed, and `page.tsx` still points at the original two paths — so the URL never changed, the cache key
never changed, and the stale entry stayed live.** **That is why restarting the dev server did not help:
the cache is on disk, not in memory.**

⚠️ **And a naming trap you will hit next:** `dashboard-v2.png` (21:09) is the **Add order** screen. The
real **Orders dashboard** with the capacity strip is the *unrenamed* `…at 21.07.46.png`. **The names now
point at the wrong screens.**

---

## 3 · The mechanism — how 16:9 bytes came to sit at those URLs

**No 16:9 file was ever at those paths at 21:12. My read-back then was correct. What I never checked was
what the browser was being handed.** Reconstructed from the cache timestamps, the file mtimes and the
restore notes:

| Time | Event | State at `public/screenshots/*.png` |
|---|---|---|
| **18:26** | `public/screenshots/` created, empty | — |
| **~18:30** | `cp` of the two **2560×1440 Android captures** (16:9) | 🔴 **16:9** |
| **19:00:17** | 🔴 **You loaded the page. Next optimised the 16:9 sources and wrote `640×360` and `828×466` WebP into the cache** | 16:9 |
| ~19:1x | `sips -c 1440 1920 kitchen.png` → 1920×1440 | 4:3 (kitchen) |
| ~19:3x | `cp` 11-inch KDS, `sips -c 1668 2224` → 2224×1668 | 4:3 (kitchen) |
| ~20:0x | `cp` both 11-inch **uncropped** | 1.4508 |
| **21:12:06** | `cp` both 13-inch, `sips -Z 640` / `sips -Z 800` | ✅ **4:3 — current** |
| **21:53** | You restarted `next dev` (PID 94192) | 4:3 |
| **21:59:42** | Fresh optimiser entries written: `640×480`, `800×600` PNG | ✅ 4:3 |

🔴 **The 19:00:17 entries were never invalidated, because the cache key is derived from the URL and the
request parameters. Same URL + same `w` + same `q` = same key.** Overwriting the file five times changed
the bytes but never the key.

**Two things kept them on your screen:**

1. **`Cache-Control: public, max-age=0, must-revalidate`** — read from the live response. **The browser
   must revalidate, but only on a *reload*.** A page left open, or a soft navigation, keeps the already-
   decoded image indefinitely.
2. 🔴 **Your reported natural sizes are 320×180 and 400×225 — the `next/image` `width`/`height` from the
   16:9 round.** `page.tsx` has said `320×240` / `400×300` since 21:12. **So the DOM you measured was
   rendered from HTML predating that edit.** **The page itself was stale, not only the images** — which
   is why the numbers matched that round so precisely. Your instinct that it was not a coincidence was
   right.

⚠️ **The honest part: nothing about this was discoverable from my side by reading the repo, and I never
looked anywhere else. §7.**

---

## 4 · The true 13-inch captures

**Every 2752×2064 file in both locations, IHDR-verified:**

| Path | Modified | Size | Screen |
|---|---|---|---|
| `~/Desktop/landing page screeshots/kitchen-v2.png` | **21:08** | 601,211 B | 🔴 **KDS** *(renamed from `…21.08.35.png`)* |
| `~/Desktop/landing page screeshots/…at 21.07.46.png` | **21:07** | 559,176 B | 🔴 **ORDERS DASHBOARD** — capacity strip |
| `~/Desktop/landing page screeshots/dashboard-v2.png` | **21:09** | 455,356 B | ⚠️ **Add order** *(renamed from `…21.09.28.png`)* |
| `~/Downloads/…13-inch…at 18.48.45.png` | 18:48 | 441,435 B | Add order (earlier) |
| `~/Downloads/…13-inch…at 18.47.30.png` | 18:47 | 557,682 B | *(not opened)* |
| `~/Desktop/…13-inch…2026-08-20 at 11.20.20.png` | 20 Aug | 585,641 B | unrelated, old |
| `~/Desktop/…13-inch…2026-08-20 at 11.20.57.png` | 20 Aug | 509,973 B | unrelated, old |

**The two you want:**

- **KDS →** `~/Desktop/landing page screeshots/kitchen-v2.png`
- **Orders dashboard →** `~/Desktop/landing page screeshots/Simulator Screenshot - iPad Pro 13-inch (M5) - 2026-09-01 at 21.07.46.png`

⚠️ **Identification is from having opened 21:07.46, 21:08.35 and 21:09.28 earlier in this session.** The
two `-v2` names are your renames of the latter two; **I matched them by size and mtime, not by
re-opening them.**

---

## 5 · Do the correct sources still exist? — ✅ **YES**

**All three 13-inch captures from 21:07–21:09 are present and untouched. Nothing needs re-shooting.**

**And the two files already in `public/screenshots/` are correct 4:3 derivatives of them** — 640×480 and
800×600, IHDR-verified, served correctly by your dev server right now.

> 🔴 **THERE IS NOTHING WRONG WITH THE FILES. There is nothing to replace. The wrong bytes are in two
> caches — the browser's and `.next/dev/cache/images`.**

---

## 6 · What I would do — and how I would verify it

**In order. I have run none of this.**

### Step 1 — prove it is the cache, changing nothing (30 seconds)

**In the browser: DevTools → Network → tick *Disable cache* → hard-reload (⌘⇧R).** Then re-run your
`querySelectorAll`. **If natural becomes 640×480 / 800×600, it was the cache and steps 2–3 are
unnecessary.**

### Step 2 — clear the stale optimiser entries, with the dev server accounted for

🔴 **Your dev server is PID 94192 and holds this directory. Stop it first — do not delete underneath a
running server:**

```bash
# in the terminal running `next dev`: Ctrl-C
rm -rf .next/dev/cache/images
npm run dev
```

⚠️ **This deletes 16 entries, of which 12 are unrelated (the Gusto logo, icons, other pages). They
regenerate on next request. I did NOT delete it.**

### Step 3 — only if the files themselves ever need replacing

```bash
cd /Users/dominicbonini/dev/village-foodie
F="$HOME/Desktop/landing page screeshots"
cp "$F/kitchen-v2.png" public/screenshots/kitchen.png
cp "$F/Simulator Screenshot - iPad Pro 13-inch (M5) - 2026-09-01 at 21.07.46.png" public/screenshots/dashboard.png
sips -Z 640 public/screenshots/kitchen.png
sips -Z 800 public/screenshots/dashboard.png
```

### 🔴 How I will verify — reading the file back, not trusting the command

```bash
python3 - <<'PY'
import struct
for p in ('public/screenshots/kitchen.png','public/screenshots/dashboard.png'):
    d=open(p,'rb').read(24)
    assert d[:8]==b'\x89PNG\r\n\x1a\n', p
    w,h=struct.unpack('>II', d[16:24])
    print(f"{p}: {w}x{h} aspect {w/h:.4f} {'OK 4:3' if abs(w/h-4/3)<1e-6 else 'WRONG'}")
PY
```

**And then the step I have never taken — ask the server, not the file:**

```bash
curl -s "http://localhost:3000/_next/image?url=%2Fscreenshots%2Fkitchen.png&w=640&q=75" -o /tmp/k.bin
python3 -c "import struct;d=open('/tmp/k.bin','rb').read(64);print(d[:4], struct.unpack('>II',d[16:24]) if d[:4]==b'\x89PNG' else 'webp')"
```

🔴 **A `sips` exit code is not evidence. A `sips -g` read-back proves the file. Only the `curl` proves
what the browser gets.**

---

## 7 · The method failure, for the manual

🔴 **Every report in this chain reasoned about a rendered page from artefacts that were one or more
layers removed from it, and never once asked the thing that was actually wrong.** I verified source files
with `sips`, verified CSS by reading it, computed box geometry from `aspect-ratio` declarations, and then
asserted what the browser would show — six rounds of increasingly confident arithmetic against a page I
had never fetched. The decisive evidence was a single `curl` to `localhost:3000` and a decode of the
returned bytes: it takes about five seconds, it was available from the first round, and it would have
shown a 16:9 payload sitting behind a 4:3 file immediately. **The specific failure is that I treated
"the file on disk is correct" as equivalent to "the browser receives a correct image", when between them
sit an optimiser, a disk cache keyed on URL rather than content, an HTTP cache, and a server-rendered
HTML page that can itself be stale — four layers, each capable of holding a different answer, none of
which I inspected.** The rule this yields: **when a symptom is visual, the first measurement must come
from the rendering client or the server that feeds it — never from the source artefact — and every
subsequent claim about appearance must name which layer it was measured at.** I should have done this at
the very first round, the moment "the ratios match but it looks cropped" appeared: that sentence is
itself the signal that the artefact and the render disagree, and it should have ended the arithmetic
rather than prompting five more rounds of it. **Your `querySelectorAll` measurement did in one message
what six of my reports failed to do.**

---

## What I could not establish

1. **Which screen `dashboard-v2.png` and `kitchen-v2.png` show** — matched by size and mtime against
   files I opened earlier, **not re-opened just now.**
2. **Whether the stale HTML came from a Fast Refresh gap, a bfcache restore, or an unreloaded tab.**
   **The DOM you measured predates the 21:12 edit; the reason it survived is outside the repository.**
3. **Whether clearing the cache fixes it** — §6 step 1 settles that, and I have not run it.
4. **Whether `public/screenshots/dashboard.png` is the Orders dashboard or the Add order screen.** My
   notes say I copied 21:07.46 (Orders dashboard); **I did not decode the current file's content to
   confirm it.**
