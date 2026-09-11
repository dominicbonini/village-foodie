# `hrefFromStoredUrl` V4 — the scheme filter

**No schema change, no migration, no database write, nothing installed, `package.json` and the lockfile
untouched.** `safeHref`, the five sinks fixed last task, the dedup gate, the outreach console, the
templates system, the events tab and the schedule popup were not touched. Figures re-derived against the
live database on **12 September 2026**: **`discovery_trucks` 231 rows**, **`venues` 819 rows**,
**360 populated website values** (102 + 258).

Nothing in the brief arrived garbled and no instruction contradicted another.

---

## THE CHANGE — one function, one new branch

```ts
export function hrefFromStoredUrl(value: string | null | undefined): string {
  if (!value) return ''
  if (HAS_SCHEME.test(value) && !/^https?:/i.test(value)) return ''     // ← V4, the only new line
  return value.startsWith('http') ? value : `https://${value}`          // ← the original expression, untouched
}
```

**`HAS_SCHEME` was already declared in this file** for `normaliseUrl`, so nothing new was introduced —
no fourth helper, and `safeHref` was not substituted. The two keep their deliberately different
contracts: `safeHref` is an allow-list that refuses relative paths and anything it cannot parse;
this one still never refuses an http(s) value and still repairs a scheme-less one.

🔴 **It is a scheme filter, not a normaliser, and that is structural rather than a promise.** The final
line is the original expression, unedited. Anything the new branch does not refuse reaches it untouched,
so an accepted value *cannot* render differently from before — including the 19 values a `new URL()`
round-trip would have given a trailing slash.

---

## THE REGRESSION — all 360 live values

| | |
|---|---|
| populated website values replayed | **360** (`discovery_trucks.website` 102, `venues.website` 258) |
| **byte-identical to today** | **360 / 360** |
| differ | **0** |
| **REFUSED** | **0** |

Every value was run through the committed V3 (`git show HEAD:lib/url-normalise.ts`) and the shipped V4,
and compared string-for-string. **360 accepted, 0 refused, all byte-identical.**

### 🔴 THE INSTRUMENT WAS CHECKED BEFORE ITS OUTPUT WAS TRUSTED

A comparison harness that reports "all identical" proves nothing unless it can report the opposite. The
same harness, in the same run, was pointed at a **deliberately broken** variant — one that normalises
through `new URL()`, exactly the change this task forbids:

```
BROKEN variant  → byte-identical 341/360 · differ 19 · refused 0
   ✗ Marky D's: "https://markyds.co.uk"  today "https://markyds.co.uk"  now "https://markyds.co.uk/"
   ✗ Steak & Honour: "http://www.steakandhonour.co.uk" → "http://www.steakandhonour.co.uk/"
   … 17 more
   harness verdict: ✅ the harness DOES report failure
```

It found exactly the 19 trailing-slash differences §4 predicted, and named them. **The harness exits 0
only if V4 is 360/360 AND the broken variant was caught — it exited 0.**

⚠️ Two harness errors were caught in the previous two tasks (a `grep … | head` returning `head`'s status,
and a `for` loop failing to word-split a `[slug]` path). Both were guarded against here: exit codes were
captured from the command itself rather than through a pipe, and the lint loop printed a file-existence
check for all three paths before running.

---

## THE HOSTILE INPUTS — and the accepts

A filter that accepts everything would pass all 360 and all four hostile inputs, so **the refusals are
reported explicitly**. Run against V3 and V4 side by side:

| input | expect | V3 (today) | **V4** | |
|---|---|---|---|---|
| `data:text/html,<script>alert(1)</script>` | REFUSE | `https://data:text/html,<script>…` | **`''` — no link** | ✅ |
| `vbscript:msgbox(1)` | REFUSE | `https://vbscript:msgbox(1)` | **`''`** | ✅ |
| `javascript:alert(1)` | REFUSE | `https://javascript:alert(1)` | **`''`** | ✅ |
| `JaVaScRiPt:alert(1)` | REFUSE | `https://JaVaScRiPt:alert(1)` | **`''`** | ✅ |
| `mailto:x@y.com` | REFUSE | `https://mailto:x@y.com` | **`''`** | ✅ |
| `ftp://files.example.com/x` | REFUSE | `https://ftp://files.example.com/x` | **`''`** | ✅ |
| **`shikashack.co.uk`** | **ACCEPT** | `https://shikashack.co.uk` | **`https://shikashack.co.uk`** | ✅ |
| **`www.example.com/events`** | **ACCEPT** | `https://www.example.com/events` | **identical** | ✅ |
| **`https://markyds.co.uk`** | **ACCEPT** | `https://markyds.co.uk` | **identical** | ✅ |
| **`http://www.steakandhonour.co.uk`** | **ACCEPT** | verbatim | **identical** | ✅ |
| `''` | REFUSE | `''` | `''` | ✅ |

**6 refusals, 4 accepts, harness exit 0.** The scheme-less value is still accepted and still prefixed —
that is the contract being preserved, and it is the case that would have failed had I reached for
`safeHref` instead.

### 🔴 WHAT V4 ACTUALLY CLOSES — stated honestly, because it is narrower than it sounds

At **these three sinks** `data:` and `vbscript:` were **already inert**, by accident: V3 prefixed
`https://` onto anything not starting with "http", turning `data:…` into the broken-but-harmless
`https://data:…`. So the executable hole was at the five RAW sinks fixed last task, not here.

What V4 genuinely changes at these three:

1. **A real gap in the `startsWith('http')` test.** A scheme-like value beginning with "http" was
   returned **verbatim** — 🧪 `httpx:alert(1)` → `"httpx:alert(1)"` under V3, `""` under V4; likewise
   `httpsx:evil`. That is the one class that reached an `href` unaltered.
2. **Junk now renders as no link rather than a nonsense link.**
3. **The rule is explicit instead of accidental**, so it survives anyone editing the prefix line.

🧪 Values that only *look* like the gap are unaffected: `httpfoo.com` (no colon, so no scheme) and
`http:example.com` / `https:example.com` (the http scheme written without slashes) all render exactly as
before — the branch matches the scheme **name**, not `://`.

---

## WHAT A REFUSED VALUE RENDERS AS, AT EACH OF THE THREE

| sink | refused value renders as | why |
|---|---|---|
| **A · `TruckClient` website link** (public) | **the address as plain text, unlinked** | This is the only sink whose visible content *is* the address. Removing the element removes information the customer could still read or type; removing only the `href` removes the danger without the loss. 🔴 The gate also had to move from the raw column to the helper's result, because `<a href="">` links to the **current page** — worse than either alternative |
| **B · `VenueClient` venue website** (public) | **nothing — the button is not rendered** | Its content is the fixed label "🌐 Website". There is nothing to preserve unlinked, and a button that does nothing is worse than no button. 🧪 **This sink needed no edit at all** — it was already gated on `cleanWebsite`, the helper's result, so a refusal makes it falsy and it disappears. `git diff` for that file is empty |
| **C · `EventListCard` truck-name link** (public) | **the truck name, unlinked, in the `<span>` that already existed** | The element wraps the truck's **name**. Dropping it would delete the name from the card — a real cost, and the strongest case of the three for keeping the text. The non-link branch was already in the code; only the gate changed |

🧪 **Rendered through `react-dom/server` using each sink's exact pattern:**

```
A  "https://markyds.co.uk"   → <a href="https://markyds.co.uk" …><span>https://markyds.co.uk</span></a>
A  "vbscript:msgbox(1)"      → <p class="text-slate-500"><span>vbscript:msgbox(1)</span></p>
B  "https://markyds.co.uk"   → <a href="https://markyds.co.uk" …>🌐 Website</a>
B  "vbscript:msgbox(1)"      → (nothing — button not rendered)
C  "https://markyds.co.uk"   → <a href="https://markyds.co.uk" …>Marky D's</a>
C  "vbscript:msgbox(1)"      → <span class="text-slate-900">Marky D's</span>
```

## The inline copy is gone

🧪 `components/EventListCard.tsx` no longer contains
`startsWith('http') ? primaryEvent.websiteUrl : …` — grep **exit 1, 0 lines**, against a control grep for
`hrefFromStoredUrl` in the same file returning **exit 0, 4 lines**. It was the third hand-written copy of
that expression in the repo; there is now **one implementation**, and the scheme filter reaches this sink
because of it.

---

## CHECKS

**`npx tsc --noEmit` exits 0.** **Lint unchanged: 12 problems (7 errors, 5 warnings) before and after**
across the three modified files — the baseline was measured by putting the committed versions in place,
linting, and restoring; the restore was then verified by grepping the V4 branch back into place and
re-running both harnesses green.

**Files changed:** `lib/url-normalise.ts` (the one function), `components/EventListCard.tsx` (inline copy
→ helper, gate on the result), `app/trucks/[slug]/TruckClient.tsx` (gate on the result, unlinked
fallback). **`app/venues/[slug]/VenueClient.tsx` was not edited** and did not need to be.

**Not done:** no schema change, no migration, no database write, no install, no dependency change,
`safeHref` untouched, and the five sinks from last task untouched.
