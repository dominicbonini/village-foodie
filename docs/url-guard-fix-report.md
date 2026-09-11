# The untrusted-URL guard — applied to the five unguarded sinks

**No schema change, no migration, no database write, nothing installed, `package.json` and the lockfile
untouched.** The dedup gate, the templates system, the events tab and the schedule popup were not
touched. Every figure re-derived against the live database on **12 September 2026**:
**`discovery_trucks` 231 rows**, **`venues` 819 rows**.

---

## ⚠️ ONE CONSTRAINT READ AGAINST A SPECIFIC INSTRUCTION — FLAGGED, NOT RESOLVED SILENTLY

The constraints say *"do not touch … the outreach console"*; item 1 says *"EXPORT `safeHref` **from**
`components/admin/OutreachPanel.tsx` into a shared module"*, which cannot be done without editing that
file. I read the specific instruction as governing the general one and made the **minimum possible**
edit there: the 14-line function was deleted and an import added in its place. **No behaviour, markup,
class or copy in the outreach console changed** — its two call sites still call `safeHref` with the same
arguments and receive the same values. If you intended the constraint to win, this is the one edit to
revert.

---

# 1 · ONE IMPLEMENTATION, MOVED — NOT A SIXTH COPY

**New file: `lib/safe-href.ts`.** The function was **moved, not rewritten**.

🧪 **Byte-identity proof.** The 14 lines that were lines 1405–1418 of `OutreachPanel.tsx` were extracted
and compared with the body now in `lib/safe-href.ts`:

```
original bytes: 936   moved bytes: 936
IDENTICAL after removing the `export` keyword: YES ✅
```

**The only edit to the code is the word `export`.** Every comment inside it, including the two 🔴 notes
about relative paths and the http(s) allow-list, moved with it verbatim. A file header was added *above*
the function recording why it was moved and why it is **not** interchangeable with `hrefFromStoredUrl`.

🧪 **It is now the only copy**: `grep` finds no `function safeHref(` anywhere outside `lib/safe-href.ts`.

**Why moved rather than re-implemented:** §51.7 of the reference manual records a "reuse" that turned out
to be a fourth independent implementation of something the repo already had, and nobody noticed because
both versions looked plausible. This repo already carries three overlapping URL helpers. A hand-written
fourth would have been the same mistake, so the bytes were carried across and proved equal.

## The five sinks, after

| # | file · sink | column | surface |
|---|---|---|---|
| 1 | `EventListCard` — menu button, via `menuHref` | `discovery_trucks.menu_url` | public |
| 2 | `EventListCard` — order button, via `orderHref` | `discovery_trucks.order_url` | public |
| 3 | `TruckClient` — menu button | `discovery_trucks.menu_url` | public |
| 4 | `TruckClient` — order CTA | `discovery_trucks.order_url` | public |
| 5 | `app/admin/page.tsx` — truck editor's schedule link | `discovery_trucks.schedule_url` | admin |

🧪 **No raw sink survives among the five** — a grep for the old unguarded expressions returns **exit 1,
0 lines**, against a control pattern in the same run that returns exit 0 with 5 lines.

⚠️ **One pre-filter was replaced, deliberately.** The order button was gated on
`ev.orderUrl.includes('http')` — a substring test that `"httpx:evil"` satisfies. It is now gated on
`safeHref` having returned a value, which parses the string and checks the protocol. The guard is
strictly stronger; nothing that passed before and is a real http(s) URL is now refused.

---

# 2 · WHAT A REFUSED URL RENDERS AS

| # | sink | refused value renders as | why |
|---|---|---|---|
| 1–4 | the four **public** buttons | **nothing — the button is not rendered at all** | All four already sat inside a truthiness gate, so gating on the *guard's result* instead of the raw column removes the whole control. A dead button on a public page is worse than no button: a customer taps it and nothing happens, and they blame the truck |
| 5 | the **admin** schedule link | **the stored string as plain text**, prefixed ⚠️, with a title explaining it | This is the screen on which an operator would *fix* the value, so hiding it would be the wrong answer — it would read as "no URL" when the truth is "a URL we will not link to" |

The admin sink now has **three** states rather than two: a usable URL renders as a link, a present-but-
refused value renders unlinked and flagged, and an empty column still renders `—`.

## 🧪 THE PROOF — executed against the shipped `lib/safe-href.ts`

The module was compiled with the repo's own TypeScript and run. **The accepts are half the proof**: a
guard that refuses everything would look identical to one that works.

| input | expected | `safeHref()` returned | |
|---|---|---|---|
| `javascript:alert(1)` | REFUSE | `null` | ✅ |
| `data:text/html,<script>alert(1)</script>` | REFUSE | `null` | ✅ |
| `vbscript:msgbox(1)` | REFUSE | `null` | ✅ |
| `/admin/evil` | REFUSE | `null` | ✅ |
| `shikashack.co.uk` | **ACCEPT** | `https://shikashack.co.uk/` | ✅ |
| `https://example.com/menu` | **ACCEPT** | `https://example.com/menu` | ✅ |
| `http://legacy.example.co.uk/x?a=1` | **ACCEPT** | `http://legacy.example.co.uk/x?a=1` | ✅ |

**The script exits 0 only if every case matches its expectation. It exited 0.**

Rendered through `react-dom/server` using the exact gating pattern the sinks use:

```
javascript:alert(1)                       → (nothing — button not rendered)
data:text/html,<script>alert(1)</script>  → (nothing — button not rendered)
vbscript:msgbox(1)                        → (nothing — button not rendered)
/admin/evil                               → (nothing — button not rendered)
shikashack.co.uk                          → <a href="https://shikashack.co.uk/" …>Menu</a>
https://example.com/menu                  → <a href="https://example.com/menu" …>Menu</a>
```

## 🔴 THE CONTROL — the same inputs with NO guard, so React cannot be mistaken for the fix

```
javascript:alert(1)                       → href="javascript:throw new Error('React has blocked …')"
data:text/html,<script>alert(1)</script>  → href="data:text/html,&lt;script&gt;alert(1)…"   PASSED THROUGH
vbscript:msgbox(1)                        → href="vbscript:msgbox(1)"                        PASSED THROUGH
/admin/evil                               → href="/admin/evil"                               PASSED THROUGH
shikashack.co.uk                          → href="shikashack.co.uk"                          PASSED THROUGH (relative)
```

**React 19.2.3 blocks exactly one of the four.** `data:`, `vbscript:` and the relative forms are refused
by `safeHref` and by nothing else. That is the difference the guard makes, measured rather than asserted.

---

# 3 · STILL OUTSTANDING — the three sinks deliberately left alone

🧪 `git diff` reports **no change** to `lib/url-normalise.ts` or `app/venues/[slug]/VenueClient.tsx`, and
both remaining call sites are verbatim where they were:

| sink | guard today | status |
|---|---|---|
| `TruckClient` — website link (`discovery_trucks.website`) | `hrefFromStoredUrl` | 🔴 **OUTSTANDING — your decision** |
| `VenueClient` — venue website (`venues.website`) | `hrefFromStoredUrl` | 🔴 **OUTSTANDING** |
| `EventListCard` — truck-name website link (`discovery_trucks.website`) | hand-written inline prefix, a third copy of the same expression | 🔴 **OUTSTANDING** |

---

# 4 · WHAT TIGHTENING `hrefFromStoredUrl` WOULD ACTUALLY CHANGE

**Report only — nothing was changed.** Every populated value in the two columns those three sinks read
was run through **both** helpers and compared.

| column | populated | byte-identical under both | differ |
|---|---|---|---|
| `discovery_trucks.website` | **102** | 83 | **19** |
| `venues.website` | **258** | **258** | **0** |
| **total** | **360** | 341 | **19** |

## 🔴 THE HEADLINE: NOT ONE LIVE VALUE WOULD BE REFUSED

All 19 differences are **the same difference** — `new URL()` normalises a bare origin by appending a
trailing slash:

| stored | renders today | under the allow-list |
|---|---|---|
| `https://markyds.co.uk` | `https://markyds.co.uk` | `https://markyds.co.uk/` |
| `https://hotdogmafia.co.uk` | `https://hotdogmafia.co.uk` | `https://hotdogmafia.co.uk/` |
| `http://www.steakandhonour.co.uk` | `http://www.steakandhonour.co.uk` | `http://www.steakandhonour.co.uk/` |
| `shikashack.co.uk` | `https://shikashack.co.uk` | `https://shikashack.co.uk/` |

The full 19: **Marky D's, Crepes and Wraps, The Little Pizza Oven, The Tapas Truck, Suffolk Pizza, Steak &
Honour, Shika Shack, Roosters Smoke House, Howe & Co, Pizzeria Gusto, The Purple Pepper, Mac Street
Kitchen, Pimp My Fish, Hot Dog Mafia, The Forge Kitchen, Home Brew Burgers, Tacoman, Perky Beans,
Pig-Casso's** — all `discovery_trucks.website`, all trailing-slash only. `https://x.co.uk` and
`https://x.co.uk/` are the same request; no customer-visible change.

⚠️ **And `shikashack.co.uk` is not broken on the public pages today.** `hrefFromStoredUrl` already
prefixes `https://`, so it renders as a working absolute link there. The relative-link failure §35
recorded was on the **admin** page, which used a raw href — and that sink is now guarded.

## What this means for your decision

- **The risk of tightening is not in today's data — it is zero there.** 0 refusals out of 360, and the
  only behaviour change is a trailing slash on 19 links.
- **The argument for leaving it is about tomorrow's data**, and it is the argument its own source makes:
  it renders values on customer-facing pages where dropping a link the customer used to see is worse than
  the odd broken one. A future value that the allow-list refuses would vanish rather than render broken.
- **A middle option exists and I have not built it:** keep `hrefFromStoredUrl`'s never-refuse contract
  for `http`/`https` values and refuse only *other schemes* — which today changes nothing at all, and
  closes the `data:`/`vbscript:` hole on those three sinks. Say the word and it is a small change to one
  function with these 360 values as the regression set.

---

# CHECKS

**`npx tsc --noEmit` exits 0.** **Lint is unchanged: 38 problems (30 errors, 8 warnings) before and
after**, across the four modified files — the baseline was measured by restoring the committed versions
in place, linting them, and putting mine back; `lib/safe-href.ts` adds none of its own.

⚠️ **A harness error was caught and corrected mid-task**, in the spirit of the sweep that found a
`grep … | head` reporting the wrong status: a `for f in $F` loop failed to word-split a path containing
`[slug]`, so the first lint baseline attempt never swapped any file and its "identical" result would have
been meaningless. It was re-run with a shell array, and the files were verified intact afterwards.

**Files changed:** `lib/safe-href.ts` (new), `components/admin/OutreachPanel.tsx` (function removed,
import added), `components/EventListCard.tsx`, `app/trucks/[slug]/TruckClient.tsx`, `app/admin/page.tsx`.

**Not done:** no schema change, no migration, no database write, no install, no dependency change, and
the three `hrefFromStoredUrl` / inline-prefix sinks were not touched.
