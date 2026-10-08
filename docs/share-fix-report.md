# SHARE DOWNLOADS ON A MAC — THE FIX

**6 October 2026 · V14.9 · branch `main`, local only. Nothing pushed, nothing deployed, no SQL run, no
database write, no email. No outreach row read or touched.**

---

## 🔴 1 · WHY IT HAPPENED — AND IT IS THE FIRST THING YOU ASKED

**`navigator.share()` was being called too late to count as a tap.** It was not `canShare` returning
false, and it was not the Mac refusing to share files.

Here is the code that was in **both** make screens, written out twice:

```ts
const share = async () => {
  if (!png) return
  try { await navigator.clipboard.writeText(caption) } catch { }   // await 1
  try {
    const blob = await (await fetch(png)).blob()                   // awaits 2 and 3
    const file = new File([blob], `weekly-post-${week}.png`, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] })                     // ← rejects here
      setBusyMsg('Caption copied — paste it into your post.')
      return
    }
  } catch { /* fall through to the download */ }
  download()                                                       // ← what you saw
  setBusyMsg('Caption copied, and the image has been downloaded.')
}
```

### The chain, in order

| | |
|---|---|
| 1 | `navigator.share()` requires **transient user activation** — the Web Share API rejects with `NotAllowedError` without it |
| 2 | **WebKit's test for activation is a stack test, not a timer.** You have activation while you are in the same stack as the click handler and in the same tick. Chrome runs the specification's few-second window; Safari does not |
| 3 | The handler did **three `await`s** before the share — the clipboard write, the `fetch`, and `.blob()` — so by the time `share()` ran it was in a later microtask and WebKit had already dropped the activation |
| 4 | It rejected with `NotAllowedError`, which landed in the **bare `catch`** |
| 5 | That `catch` fell through to `download()`, which is exactly what an operator sees: **press Share, get a file in Downloads** |

⛔ **So the answer to your question is (b), with an aggravating factor.** `navigator.share` was
throwing, because it was called after an `await` and Safari no longer treated it as a direct tap — and
a `catch` with no body in it turned a diagnosable rejection into a silent, wrong behaviour.
`canShare({ files })` was answering **true** on the Mac the whole time.

⚠️ **AND IT WOULD HAVE BEEN FRAGILE ON A PHONE TOO.** iOS Safari applies the same stack rule. It
happens to have been working there because the three awaits resolve very fast on a warm object URL —
the code was relying on a race it did not know it was in, which is why the fix is "do not have the
race" rather than "make the race shorter".

### Why nothing caught it

`scripts/weekly-post.cjs` had a check on this code. It read:

```js
/navigator\.clipboard\.writeText\(info\.text\)/.test(eventUi)
  && /nav\.canShare\?\.\(\{ files: \[file\] \}\)/.test(eventUi)
  && eventUi.indexOf('clipboard.writeText(info.text)') < eventUi.indexOf('canShare?.({ files: [file] })')
```

🔴 **Every clause was true, and the feature was broken.** It asserted that the two calls were present
and in the right order; it said nothing about **when** they were made, which is the only thing that
decides whether a share sheet opens. §4 is what replaced it.

**Sources for the activation rule:**
[WebKit bug 197779 — `navigator.share` after an async fetch](https://bugs.webkit.org/show_bug.cgi?id=197779) ·
[WebKit: The User Activation API](https://webkit.org/blog/13862/the-user-activation-api/) ·
[W3C Web Share API — "if the window does not have transient activation, reject with NotAllowedError"](https://www.w3.org/TR/2022/WD-web-share-20220701/) ·
[Tom MacWright on Safari's stricter activation model](https://macwright.com/2022/07/11/activation) ·
[web.dev — Web Share API, `canShare()` and files (Safari 14+)](https://web.dev/articles/web-share)

---

## 🔴 2 · THE FIX — ONE COMPONENT, AND A SYNCHRONOUS TAP

**New: `components/manage/PostShareBar.tsx`.** It is the only caller of `navigator.share` in the
product, and both make screens mount it.

### 2.1 · The file is prepared before the tap

Both screens already had the PNG as a **blob** — `renderPng` reads `await r.blob()` and hands it to
`URL.createObjectURL`. It now returns that blob as well as the URL, and each screen keeps it in state
beside `png`, set **from the same response**, so Share and Download can never be two different
pictures.

The bar turns it into a `File` and answers "can this be shared?" in `useMemo`, during render:

```ts
const file = useMemo(
  () => (blob ? new File([blob], fileName, { type: blob.type || 'image/png' }) : null),
  [blob, fileName])

const canShareFile = useMemo(() => {
  if (!file || typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  return typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) === true
}, [file])
```

| | |
|---|---|
| ⛔ **`canShare` is called with the real file** | not with an empty `new File([], 'x.png')`. It is specified to answer on the data it is given, so a probe with a different file answers a different question |
| ⚠️ **`useMemo`, not an effect** | an effect would mean a second render before the bar is right. The `react-hooks/set-state-in-effect` rule flagged the first draft and **the rule was right** — the values are pure functions of the blob |
| ⛔ **`navigator` is guarded, and there is no hydration mismatch** | `blob` is only ever set from a fetch in the parent's effect, so on the server **and** on the first client render it is `null`, `file` is `null`, and the Share button is absent in both |
| ⚠️ **No `fetch` anywhere in the tap** | the `fetch(png)` that used to burn two of the three awaits is gone entirely |

### 2.2 · The handler is not `async`

```ts
const share = () => {
  if (!file) return
  void navigator.clipboard.writeText(caption).catch(() => { /* the sheet still opens */ })
  navigator.share({ files: [file] })
    .then(() => onStatus(`${captionWord} copied — paste it into your post.`))
    .catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return
      download()
      onStatus(`Sharing was refused, so the picture has been downloaded. ${captionWord} copied.`)
    })
}
```

🔴 **Both platform calls are statements of the click handler.** Nothing is awaited until after
`share()` has been handed the file, so the call is in the click's own stack and in the same tick —
which is the condition WebKit actually tests.

⛔ **The order of the two is not arbitrary, and it is the reverse of what you might guess.** The
caption still goes to the clipboard **first**, for the reason the old comment gave: Instagram and
Facebook take the image from a share sheet and leave the caption to be pasted, and doing it afterwards
is too late because the sheet takes the page out of focus. The new reason it is safe to keep that order
is that **`clipboard.writeText` CHECKS activation and `share` CONSUMES it** — so writing first costs
nothing, and sharing first would have cost the clipboard. ⚠️ Neither is awaited before the other; both
promises are created inside the tap and only their results are handled later.

⛔ **A cancelled sheet is no longer a download.** The old code downloaded on **any** rejection, so
closing the share sheet left a file in Downloads nobody asked for. `AbortError` is the operator saying
no, and is now handled as nothing at all.

---

## 🔴 3 · WHERE A FILE CANNOT BE SHARED, THERE IS NO "Share" BUTTON

Desktop Chrome and Firefox have `navigator.share` but **not** file sharing, so `canShare({ files })` is
false and the old button could only ever have downloaded.

| `canShareFile` | The row |
|---|---|
| **true** (Safari on macOS 14+, iPhone, iPad) | **Download picture** · **Copy caption** · **Share** |
| **false** (desktop Chrome, Firefox) | **Download picture** · **Copy caption** |

- **"Copy caption" confirms on itself** — the label becomes **"Copied ✓"** for two seconds, and the
  screen's own status line says *"Caption copied."* (or *"Post text copied."* in the event modal). The
  timer is cleared on unmount, so a modal closed mid-confirmation cannot set state on a component that
  has gone.
- ⚠️ **On phones and iPads, Share is unchanged in behaviour**: caption to the clipboard, then the sheet,
  with the image in it.
- ⛔ **Feature detection, never a user-agent string.** The component does not contain the words
  `userAgent`, `Macintosh`, `iPhone` or `Safari`, and §4 asserts that it does not.

### What this changed on the two screens

| | Before | After |
|---|---|---|
| **Weekly post** | `Download image` · `Share` | the shared bar |
| **Single event post** | `Download image` · `Copy text` · `Share` | the shared bar |

⚠️ **"Download image" became "Download picture" and "Copy text" became "Copy caption"**, which are the
words in your brief. The weekly post's **Caption for your page** panel keeps its own small
*Copy caption* link — it sits beside the caption textarea, which is where you look when you are editing
the caption, and it is left alone deliberately rather than removed to avoid a second button with the
same name.

### One component, not two fixes

`share()` and `download()` are **deleted from both screens**, each with a tombstone saying why. The
weekly post no longer imports `Btn` at all (its only two were Download and Share); the event modal's
`copy()` helper went with its one caller. Neither file contains `navigator.share` any more.

---

## ✅ 4 · THE HARNESS THAT WAS PASSING ON A BROKEN SHARE

`scripts/weekly-post.cjs`'s check is **re-aimed at what made it fail**, not at which strings appear:

| Asserted now | Why |
|---|---|
| `const share = () => {` exists, and the file has **no** `const share = async` | the handler is not async — that is the fix, stated as code |
| **not one `await`** inside the handler body | the bug itself, as an absence |
| `void navigator.clipboard.writeText(caption)` comes **before** `navigator.share(` | the documented order, and the activation reason for it |
| `e.name === 'AbortError') return` | a cancelled sheet downloads nothing |
| `new File([blob], fileName` outside the handler | the file is ready before the tap |
| `navigator.share` appears in **neither** make screen | one caller in the product |
| both screens mount `<PostShareBar blob={pngBlob} url={png}` | one report, one fix |
| `{canShareFile && <Btn label="Share"` and both other labels | no Share button where a file cannot be shared |
| the component contains no `userAgent\|Macintosh\|iPhone\|Safari` | feature detection, asserted as an absence |

⚠️ **The handler is sliced to a bounded end anchor** (`\n  }` at the function's indentation), so
*"no `await` in `share`"* cannot be satisfied by the slice stopping early. **The absence has a positive
claim beside it** — the three `.test`s on the call itself — because an absence alone would also pass on
a handler that had been deleted.

### 🔴 4.1 · The eighth time prose has decided a claim about code

The *"`navigator.share` appears in neither make screen"* clause **failed on correct code** on its first
run. Both screens now carry a tombstone explaining why their `share()` went, and each tombstone
**names `navigator.share`** — so the raw-source absence test found the comment. Fixed by stripping
comments first, which is this build's standing rule and the eighth separate instance of it.

⚠️ **And a second one, in a fixture.** The note added to `scripts/schedule-places-render.cjs`'s markup
quoted the component's name in **backticks**, inside a JS template literal — which ended the string and
made the file a syntax error. The note now says the name plainly and says why.

---

## ✅ 5 · WHAT WAS RUN

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `node scripts/run-harnesses.cjs` | **98 run · 98 passed · 0 failed** |
| `scripts/weekly-post.cjs` on its own | **222 passed**, 35/35 variants still fail as required |
| `npx next build` | **✓ Compiled successfully** |
| ESLint, the three touched files | **0 errors.** 3 warnings, all the project's baseline `<img>` class — no new warning |

**No new harness, no render sweep, no reference-manual entry**, as you asked.

### ⚠️ 5.1 · Two things I could not measure, stated plainly

1. **The button row is one button wider.** The event modal's right-hand column at 390px now holds three
   buttons where it held three (same count) and the weekly post's holds three where it held two. I did
   **not** measure it: the row is `flex flex-wrap gap-2`, so it **wraps** rather than clipping, and the
   longest label — *"Download picture"* at `text-sm px-4` — is about 140px against a 390px viewport. The
   geometry cannot clip. ⛔ **But that is an argument, not a measurement**, and I am flagging it as one.
2. 🔴 **`scripts/schedule-places-render.cjs` cannot run, for a reason that has nothing to do with this
   fix.** I updated its fixture's button labels (it hard-coded *"Download image / Copy text / Share"*),
   then ran it, and it refuses before any measurement:

   ```
   🔴 the fixture cannot be built: no the setup grid found in the source
   ```

   It lifts `grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_260px] gap-4` out of `WeeklyPost.tsx`,
   and **part 1 deleted that three-column setup screen** when the editor became two columns. The string
   exists nowhere in the product. It is on the by-hand list in `scripts/harnesses.json`, so the sweep
   never ran it and nothing reported the breakage — the same way it had *"not run at all for days"*
   before the Social posts build repaired it. **Repairing it means re-measuring the whole part-1 editor
   layout, which is not a quick fix**, so it is in §7 for you to decide rather than something I did
   quietly or left unmentioned.

---

## 🧪 6 · THE LOCALHOST TEST LIST — PIZZA KITCHEN ONLY

`npm run dev` · Manage → **Schedule → Social posts**. Pizza Kitchen, slug `test-kitchen`, id
`test-truck`. **Do not open Pizzeria Gusto or any other truck.**

### 6.1 · Safari on the Mac — the reported bug

| | Do | Expect |
|---|---|---|
| 1 | **Make a post → Weekly post → Make this week's post** | the picture builds, and the row under it reads **Download picture · Copy caption · Share** |
| 2 | Press **Share** | 🔴 **the macOS share sheet opens with the PNG in it.** No file appears in Downloads |
| 3 | Pick Mail (or anything) and send/cancel | the picture is attached. Nothing is downloaded either way |
| 4 | Press **Share**, then press **Escape** / close the sheet | ⛔ **nothing happens** — no download, no message. Cancelling is not a failure |
| 5 | Paste into any text field | the caption is on the clipboard, from the Share press |
| 6 | Press **Copy caption** | the button reads **Copied ✓** for two seconds, and the status line says *"Caption copied."* |
| 7 | Press **Download picture** | the PNG lands in Downloads, named `weekly-post-<week>.png` |
| 8 | **Make a post → Single event post** (any Pizza Kitchen event) | same three buttons |
| 9 | Press **Share** in the modal | the share sheet opens with the event picture; the clipboard holds the **post text** |
| 10 | Press **Copy caption** there | **Copied ✓**, and the status line says *"Post text copied."* |

### 6.2 · A browser that cannot share a file — the second half of the brief

| | Do | Expect |
|---|---|---|
| 11 | Open the same two screens in **Chrome on the Mac** | ⛔ **there is no Share button.** Only **Download picture** and **Copy caption** |
| 12 | Press each | the file downloads; the caption copies with **Copied ✓** |
| 13 | Firefox, if you have it | the same two buttons |

### 6.3 · iPhone / iPad — the behaviour that must not have changed

| | Do | Expect |
|---|---|---|
| 14 | On your phone, open the manage link and make a weekly post | **Download picture · Copy caption · Share** |
| 15 | Press **Share** | the iOS share sheet opens **with the image**, as before |
| 16 | Share to Instagram | the image arrives; paste the caption — it is already on the clipboard |
| 17 | Same two steps on a single event post | the same, with the post text on the clipboard |

### 6.4 · Nothing else moved

| | Do | Expect |
|---|---|---|
| 18 | On the weekly post, **Post for each event** → **Copy text** / **Image** / **Share** | unchanged: Copy text copies, Image and Share both open that event's modal |
| 19 | The **Caption for your page** panel's own *Copy caption* link | still there, still works |
| 20 | **Designs** → both design boxes, and a place's pictures | untouched by this change |

---

## 📋 7 · OPEN ITEMS FOR YOU

1. 🔴 **`scripts/schedule-places-render.cjs` is broken by part 1 and is not in the sweep.** Its fixture
   lifts a three-column grid that the shared editor replaced. Its labels are now correct for this
   change, but it cannot build its fixture. **It needs the part-1 editor layout re-measured** — say the
   word and I will do it as its own job.
2. ⚠️ **Whether to keep the weekly post's second *Copy caption***, next to the caption textarea. I left
   it; it is one more button with the same name on the same screen.
3. ⚠️ **The wider button row is reasoned, not measured** — see §5.1. If you want it measured, that is
   the same job as item 1.
