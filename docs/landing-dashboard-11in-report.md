# Dashboard swapped to the 11-inch capture, frame reshaped to fit

**Nothing committed. Nothing deployed. No SQL, no migration.**
**Restore notes updated by ADDITION only** — `docs/landing-copy-restore-notes.md` §22.

---

## VERIFICATION

**What I performed: EXECUTION.** Not a typecheck, not a source read.

| Check | How | Result |
|---|---|---|
| Source capture | **read the IHDR bytes** | `Dashboard 11in.png` **2420×1668 = 1.4508** (iPad Pro 11-inch) ✅ |
| Installed file | **read the IHDR bytes** | `dashboard-v4.png` **800×551 = 1.451906** ✅ |
| Server payload | **`curl` at w=640/828/1080/3840** | all correct ratio, **all `X-Nextjs-Cache: MISS`** ✅ |
| Served content | **opened the payload the server returned** | the Add-order screen, customer *Chloe*, **£50.00** ✅ |
| Landing HTML | **`curl -H "Host: www.hatchgrab.com"`** | references `dashboard-v4.png`, emits `width="800" height="551"` ✅ |

⚠️ **I have still not rendered the page in a browser.** Verified file → server → decoded pixels.

**No span of the prompt arrived garbled.**

---

## The contradiction I stopped on, and your decision

**Three of your instructions could not all hold once the image was 11-inch:**

| | |
|---|---|
| *"restore `aspect-ratio: 4/3` on both frames"* | assumed a 13-inch (4:3) capture |
| *"dont crop"* | rules out cutting 1.4519 down to 1.3333 |
| **the new capture is 1.4508** | **not 4:3** |

**You chose: reshape the dashboard frame.** ✅ **Applied.**

---

## The change — three numbers made identical

```
CSS   .shot-dash  aspect-ratio: 800/551   = 1.451906
TSX   <Image>     width={800} height={551} = 1.451906
FILE  dashboard-v4.png  800x551            = 1.451906
```

> ✅ **All three agree exactly, so `object-fit: contain` letterboxes by 0px.** On your measured 398px
> card the image renders **398 × 274.1** and fills the frame.

**I used the file's intrinsic 800×551 rather than 400×276** deliberately: `400/276 = 1.44928` would have
disagreed with the CSS by 0.1%. **`sizes` is unchanged, so the srcset and the rendered width are unaffected.**

---

## ⚠️ The cost you accepted

**`.shot-kds` is still `aspect-ratio: 4/3` holding a 13-inch capture.** **The two tiles in the fan are now
different shapes** — 1.3333 and 1.4519. **This is the trade-off in the option you picked**, and it is
reversible either way: a kitchen capture at 2420×1668 makes them match, or `dashboard-v3.png` (retired to
the scratchpad, not deleted) restores 4:3.

---

## Scope

| Check | Result |
|---|---|
| Files changed | `app/landing/page.tsx` (src + width/height), `app/landing/landing.css` (one value), `public/screenshots/` |
| `object-fit` | ✅ **Untouched** — still `contain` |
| `.shot-kds`, phone placeholder | ✅ **Untouched** |
| `'Online ordering — Pay at Hatch'`, testimonial | ✅ **Absent from the diff** |
| Gusto `width={320} height={233}` | ✅ **Absent from the diff** — the only `gusto` hit is a comment that mentions it |
| `lib/features.ts`, `app/landing/layout.tsx` | ✅ **Untouched** |
| Committed / deployed | **Neither** |

---

## What I could not establish

1. 🔴 **Whether you are viewing localhost or production.** `public/screenshots/` is **still untracked and
   has never been deployed**, and `/` only renders the landing when the host contains `hatchgrab`
   (`proxy.ts:438`). **On `www.hatchgrab.com` none of this is visible.**
2. **That the fan reads well with two different tile shapes.** **Not rendered — that one is yours to judge.**
