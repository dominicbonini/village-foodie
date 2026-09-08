# Custom domain — the trailing-dot 404, the Wix copy value, one copy button, and the banner

**5 September 2026. Branch `whatsapp-connections-s1-s3` (a clean branch is impossible while the WhatsApp workstream is uncommitted). NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

## 🔴 CONFIRMED: NOTHING IN THIS BUILD CHANGES WHAT `events.pizzeriagusto.co.uk` SERVES

Stated first because it is the condition on the whole build. 🧪 **Verified by execution and by source:**

| Their live request | Effect of this build |
|---|---|
| `Host: events.pizzeriagusto.co.uk` (no trailing dot) → `hostKey` | 🧪 **Byte-identical, old and new.** The dot strip is a no-op on an undotted host — proven in Proof N. |
| `isCustomHost` → the proxy's rewrite to `/domain` | 🟢 Still `true`, still rewritten. Unchanged. |
| `truckForHost` → `.eq('custom_domain', key)` | 🟢 Same key, same row, same match. |
| `app/domain/page.tsx` render | 🟢 **File not touched.** 🧪 It imports only `orderPageUrl` from `copy.ts`, and `orderPageUrl` is untouched by this build (verified by diff). It uses none of `recordRows` / `providerFieldRows` / `dnsTargetValue` (grep: 0). |
| `proxy.ts` | 🟢 **Not touched.** |
| The setup box, the banner, the copy buttons | ⚠️ **Operator surfaces in `/manage` only.** Not imported by `app/domain` or `proxy.ts` (grep: none). A customer on their domain never reaches them. |

🟢 **The only behaviour that changes for any custom domain is one that is currently a 404 becoming a working page.** No path that serves today serves differently.

⚠️ **No span of the prompt arrived garbled.** One premise in Task 5 turned out to be slightly different from what the manual actually says — reported factually there rather than worked around.

---

# 🔴 HARNESS FRESHNESS — RUN FIRST, BEFORE ANY NUMBER BELOW

```
custom-host.ts         ✅ IDENTICAL 82f30dee296f6ddb…      (sha256 vs source)
copy.ts                non-import differences: 0
dns.ts                 non-import differences: 0
apex.ts                non-import differences: 0
--- every non-import difference, printed --- (nothing)
```
🧪 **`shasum -a256` on the one file copied verbatim, plus `diff` on the three whose import specifiers are rewritten — filtered to print any non-import line, and it printed nothing.**

**Marker grep, because a hash proves sameness and not recency:**
```
replace(/\.$/) in harness custom-host.ts:  2   (0 before this stage)
targetTrailingDot in harness dns.ts:       5   (the type + four providers)
dnsTargetValue in harness copy.ts:         4
```

---

# TASK 1 — THE `hostKey` TRAILING-DOT ASYMMETRY ✅

## Both functions, as they read BEFORE

```ts
// lib/custom-host.ts — the READ path
export function hostKey(rawHost: string | null | undefined): string {
  return (rawHost || '').toLowerCase().split(':')[0].trim()      // 🔴 no dot strip
}

// lib/custom-domain/apex.ts — checkSubdomain, the WRITE path
const raw = (input ?? '').trim().toLowerCase()
let host = raw
  .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  .split(/[/?#]/)[0]
  .split(':')[0]
  .replace(/\.$/, '')                                            // 🟢 strips it
```

**The write path stripped, the read path did not.** `app/domain/page.tsx` does `.eq('custom_domain', hostKey(host))`, so a dotted `Host:` produced a key that could never match a stored value → no row → `truckForHost` returns `null` → `notFound()` → **a bare 404, the same page a stranger gets.**

## Which behaviour is authoritative: **STRIPPING**

**Because the database already decided.** `checkSubdomain` produces the value stored in `trucks.custom_domain`, and it always strips — so a stored value can never carry a dot, and a read path that preserves one can only ever *fail* to match. Making the write path preserve instead would mean changing what is stored for every truck — a migration and a backfill — to gain nothing.

⚠️ And DNS agrees: `events.x.co.uk.` and `events.x.co.uk` are the same name. The dot is notation for "fully qualified", not part of the name.
⚠️ **ONE dot, not many.** `x.com..` is malformed rather than fully qualified, and quietly repairing malformed input is how a lookup starts matching things it should not. 🧪 Proven: `dnsTargetValue('x.com..')` → `'x.com.'`, and `hostKey('events.x.co.uk..')` → `'events.x.co.uk.'` — still no match, deliberately.

## 🧪 PROOF N — THE GUARD BITES

```
what checkSubdomain STORES for "events.pizzeriagusto.co.uk." → "events.pizzeriagusto.co.uk"

Host: "events.pizzeriagusto.co.uk."
  OLD hostKey → "events.pizzeriagusto.co.uk."   matches stored? false  ← 🔴 NO ROW → notFound() → BARE 404
  NEW hostKey → "events.pizzeriagusto.co.uk"    matches stored? true   ✅ SERVES THE PAGE
🔴 THEY DISAGREE: YES ✅ the guard bites
```

🟢 **And the case that matters most — unchanged:**
```
Host: "events.pizzeriagusto.co.uk"   OLD → "events.pizzeriagusto.co.uk"   NEW → identical ✅
```

| Input | OLD | NEW |
|---|---|---|
| `EVENTS.Pizzeriagusto.CO.UK.` | `events.pizzeriagusto.co.uk.` | `events.pizzeriagusto.co.uk` |
| `events.x.co.uk:443` | `events.x.co.uk` | `events.x.co.uk` |
| `  events.x.co.uk  ` | `events.x.co.uk` | `events.x.co.uk` |
| `events.x.co.uk..` | `events.x.co.uk..` | `events.x.co.uk.` (still no match — deliberate) |
| `localhost.` | `localhost.` | `localhost` |
| `www.hatchgrab.com.` | `www.hatchgrab.com.` | `www.hatchgrab.com` |
| `''` | `''` | `''` |

## Every normalisation site — counted BEFORE changing, and now agreeing

🧪 **Four sites existed. Two stripped the dot, two did not.**

| # | Site | Before | After |
|---|---|---|---|
| 1 | `lib/custom-host.ts` — `hostKey` | lower, port, trim. **No strip.** | 🟢 **+ strip** |
| 2 | `lib/custom-host.ts` — `isOwnHost` | its own `rawHost.toLowerCase().split(':')[0]` — a *second copy* of the same normalisation, minus trim, minus strip | 🟢 **now calls `hostKey`** — one reader, cannot drift again |
| 3 | `lib/custom-domain/apex.ts` — `checkSubdomain` | trim, lower, scheme/path/port, **strip** | 🟢 unchanged (it was right) |
| 4 | `app/api/cron/custom-domain-check/route.ts:154` — `expected.toLowerCase().replace(/\.$/, '')` | strips a dot from the **CNAME target**, not a host | 🟢 unchanged — different subject, already correct, and **the existing evidence that Vercel's target can carry a dot** (Task 2) |

🔴 **#2 was a real latent bug of its own**, found while counting: `isOwnHost('localhost.')` returned **false**, classifying our own dev host as an operator's custom domain. 🧪 Now `isOwnHost('localhost.')` → `true`, `isOwnHost('www.hatchgrab.com.')` → `true`, `isOwnHost('x.vercel.app.')` → `true`, and `isCustomHost('events.pizzeriagusto.co.uk.')` → `true`. **All four agree.**

---

# TASK 2 — THE COPY VALUE ✅

## The provider that requires the dot: **123 Reg**

Encoded at `lib/custom-domain/dns.ts`, in that provider's own `steps` record, in three places already:
- a step: *"Put the second value below in "Value", and add a full stop to the end of it."*
- the caveat: *"123 Reg needs a full stop at the end of the second value or it will not work."*
- a comment quoting their page verbatim: *"Be sure to add a full stop to the end … or your CNAME record will not work correctly."*

🔴 **What was missing is that none of those three was machine-readable.** The screen told the operator to add a dot in prose while handing them a value the button copied verbatim — so the instruction and the artefact disagreed, and only a human reading both carefully would notice.

## 🔴 Wix is among the FOUR providers with VERIFIED steps — not the five unchecked

Its record carries `// Read 28 Aug 2026 from support.wix.com/en/article/adding-or-updating-cname-records-in-your-wix-account`. ⚠️ **Said plainly, because the manual's own warning cuts the other way here:** *"Two of the four that were checked turned out to be wrong."* Wix being in the checked group is **not** a guarantee — it is a 50% historical error rate on that very group, and this build adds one more claim about Wix (`targetTrailingDot: false`) that comes from **your observation**, not from their help page.

## What the clipboard held before, per provider — and whether display and copy could differ

🔎 They **could not** differ, and still cannot: the row is one object, `{r.value}` is rendered and `value={r.value}` is passed to the button. That is preserved deliberately — an operator who distrusts the button and retypes what they can see must get a working record.

🔴 **The bug was that the one value was wrong for three providers out of four.** `recommendedCNAME` comes back from Vercel and **can carry a trailing dot** — 🧪 `dig` shows the target as `42b6747fc9c9cf2e.vercel-dns-017.com.`, and the cron already strips one before comparing. Nothing on the operator's side did.

## 🧪 PROOF O — the copied value now, given a dotted target from Vercel

| Provider | `targetTrailingDot` | Copied NOW | Copied BEFORE |
|---|---|---|---|
| Cloudflare | false | `…vercel-dns-017.com` ✅ | `…vercel-dns-017.com.` 🔴 |
| GoDaddy | false | `…vercel-dns-017.com` ✅ | `…vercel-dns-017.com.` 🔴 |
| **123 Reg** | **true** | **`…vercel-dns-017.com.`** ✅ | `…vercel-dns-017.com.` (also right) |
| **Wix** | false | **`…vercel-dns-017.com`** ✅ | `…vercel-dns-017.com.` 🔴 ← **what the operator pasted and Wix refused** |
| unknown provider (generic) | — | `…vercel-dns-017.com` ✅ | dotted 🔴 |
| IONOS (labels only, no steps) | — | `…vercel-dns-017.com` ✅ | dotted 🔴 |

🧪 **And an already-dotless target is untouched** — Cloudflare/GoDaddy/Wix get it verbatim, 123 Reg still gets its dot appended. So the fix is correct whichever way Vercel answers.

## The mechanism — the existing per-provider record, not a parallel one

`ProviderSteps` gained one **required** field, `targetTrailingDot: boolean`. 🔴 **Required, not optional, so a new provider cannot inherit a default nobody chose** — the same discipline the file's existing discriminated union already enforces. One function reads it:

```ts
export function dnsTargetValue(cnameTarget: string, steps?: ProviderSteps | null): string {
  const canonical = (cnameTarget || '').trim().replace(/\.$/, '')
  if (!canonical) return canonical
  return steps?.targetTrailingDot ? `${canonical}.` : canonical
}
```

Both row builders route through it, so the screen **and** the escape-hatch email (which lifts its values out of the same `rows`) are fixed by one change.

🔴 **THE DOT WAS NOT STRIPPED GLOBALLY, AND THIS IS WHY THAT MATTERS.** A blanket strip breaks 123 Reg **silently**: the record saves, resolves to the wrong name, and the only symptom is a domain that never starts working — while our own hint, *copy this exactly*, tells the operator they did it right. Nothing would report it.

---

# TASK 3 — ONE COPY BUTTON ✅

## The audit — how each signalled success BEFORE

| Call site | Signal | Verdict |
|---|---|---|
| `CustomDomainSetup` — provider rows | `Copied ✓` for 2.5s | worked, but **keyed on the row LABEL** |
| `CustomDomainSetup` — generic rows | the same eight lines, duplicated | same key space as above |
| `app/admin/page.tsx:576` (`copyToken`) | sets `tokenCopied` **unconditionally** | 🔴 **claims success even when the write rejects** |
| `app/admin/page.tsx:1630` (temp password) | 🔴 **NOTHING AT ALL** | no state, no label change, no toast |
| `components/dashboard/DemoWelcome.tsx:78` | sets `copied` unconditionally | 🔴 same false-success shape |
| `app/manage/…:8945` (order link) | `setCopiedOrderLink`, in a `try` | ✅ correct |
| `app/manage/…:9381` (`copyKdsLink`) | toast, **no `try`** | ⚠️ a rejection is an unhandled promise and shows nothing |
| `dashboard/…:1686`, `TruckClient`, `VenueClient`, `EventListCard` | `alert()` / state, in a `try` | ✅ |

🔴 **The custom-domain duplication was a real defect, not just repetition:** both tables keyed on `copied === r.label`, and **the two tables share one key space** — a provider whose name and value fields carry the same word would have lit both buttons at once.

⚠️ **Only the custom-domain buttons were changed.** The others are outside this build's scope; the two that claim false success and the one that signals nothing are **reported, not fixed**.

## 🔴 THE SAFARI AUDIT — THE HONEST ANSWER IS "NOT PRESENT"

🔎 **I audited all ten `clipboard.writeText` call sites. NOT ONE has an `await` before the write.** Every one either calls it synchronously or has the write as the first `await` in the handler — and `await navigator.clipboard.writeText(x)` evaluates the call *before* suspending, so the gesture is still live.

🔴 **So this does NOT explain an earlier copy button that appeared to do nothing, and I am not going to say it does.** The likelier explanations, from the audit above: `app/admin/page.tsx:1630` **has no success signal whatsoever** (it copies and says nothing), and two more set "copied" unconditionally so a genuinely failed copy still looks successful. **A button that signals nothing is indistinguishable from a button that does nothing.**

The new component is written so the trap **cannot** be introduced later: the handler is **not `async` at all**, and a comment at the call says why.

## What was built

`components/dashboard/CopyButton.tsx`, used by both record tables:
- 🟢 Label → **`Copied ✓`** for **2000 ms**, then reverts.
- 🟢 **Width reserved** — all three labels (`Copy` / `Copied ✓` / `Copy failed`) occupy **one CSS grid cell**, the widest sets the width, the inactive ones are `invisible` (keeps layout; `hidden` would not). No JS measurement, correct on first paint, no reflow of the row beside it.
- 🟢 **Never `disabled`** — people copy twice.
- 🟢 `role="status"` + `aria-live="polite"` in an `sr-only` region, naming the field (`"Value copied"`). Announced on success **and** on failure; **never colour alone** — the word and the tick carry it visually.
- 🟢 **Visible failure state**: red, `Copy failed`, and the announcement says what to do instead. Covers a rejected promise, a throw, **and `navigator.clipboard` being `undefined`** (insecure context, permissions policy, some private modes).
- 🟢 Timer cleared on unmount.

---

# TASK 4 — THE BANNER ✅

## Every surface that renders it — 🧪 there is exactly one

🧪 `grep -rn "is not working yet\|is live. Have a look"` across `app`, `components`, `lib` → **`app/manage/[token]/page.tsx` only**, plus the copy in `lib/custom-domain/copy.ts`. The dashboard does not render it; `app/domain` does not; admin has its own separate table. **One surface, so the change reaches all of them.**

## What changed

`domainNotice` was `'waiting' | 'ready' | null`. **The `waiting` arm is gone from the banner** — it now derives `'ready' | null` only, and the amber/⏳ markup went with it.

The message was **not deleted — it moved, in full**, into the setup box in Settings, which is the one surface that can actually help (the record values, the provider's steps, and the escape hatch to email a web person are all in that box). It is not dismissible there: it sits inside a box the operator opened on purpose.

🟢 **A bonus the move paid for.** The setup box now renders `notificationCopy().waiting` — a function that until today **had no caller anywhere in the codebase**. The banner inlined its own near-copy of the same sentence, so there were two records of one fact and the one nobody read was free to drift. **One reader now.**

## 🔴 THE THIRD STATE — REPORTED, UNTOUCHED

**What the banner does today in "worked, then stopped": NOTHING. It is silent, and it was silent before this build.**

The derivation ends the banner permanently once `custom_domain_confirmed_at` is set. So a truck that went live, confirmed, and then broke weeks later gets **no banner, and no email — the cron sends no failure mail by design.** The data to detect it exists (`custom_domain_last_ok_at` + `STOPPED_AFTER_MS`, which `app/admin/page.tsx:856` already uses to compute `down`), but **nothing operator-facing reads it.**

🟢 **Left exactly as it was, as instructed.** A comment at the derivation records the gap and says explicitly not to "fix" it in passing. **It is your decision.**

---

# TASK 5 — THE MANUAL POINTER

🔴 **A CORRECTION TO THE PREMISE, STATED PLAINLY.** You said the manual records the typo *"at a location that does not match the code"*. **It does not record a location at all.** I found the typo described in **three** places and **none carries a file or a line**:

| Manual line | What it says | Location given |
|---|---|---|
| **~454** (open items) | *"the proxy's path matcher has a typo — two exclusions concatenated with the separator missing"* | **none** |
| **~12336** (V-summary) | same wording | **none** |
| **~16541 / ~22550** (§35 detail) | *"Two exclusions in the matcher were concatenated with the separator missing"*; elsewhere *"the proxy's `config.matcher` excludes it"* | **`config.matcher`, no line** |

The only file-level pointer is at **~14266**, and it is **correct**: *"**proxy.ts** (repo root — Next 16's renamed `middleware.ts`; exports `proxy` + `config.matcher`)"*.

🔎 **The actual location is `proxy.ts:455`**, inside `export const config` at `:453-457`:
```js
export const config = {
  matcher: [
    '/((?!_next_next/image|favicon.ico|apple-touch-icon.png|logos|photos|sw.js|manifest.json|offline.html).*)',
  ],
}
```
🟢 The manual's description is **accurate**: `_next_next/image` is one token where two exclusions belong, and the eight remaining alternatives are the "eight path families" that never reach the deny list.

## The delta — 🔴 YOURS TO APPLY, I did not edit the manual

Add the pointer to the §35 detail entry. **Change:**

> **Two exclusions in the matcher were concatenated with the separator missing, making the first inert.**

**To:**

> **Two exclusions in the matcher were concatenated with the separator missing, making the first inert** — `proxy.ts:455`, inside `export const config` at `:453-457`, where the pattern reads `'/((?!_next_next/image|favicon.ico|…).*)'`. **The token `_next_next/image` is where `_next/static` and `_next/image` belong as two alternatives.** *(Location added 5 September 2026 — the typo was described in three places and pinned in none, so a reader had to grep for it.)*

🔴 **THE TYPO IS NOT FIXED, DELIBERATELY**, and the manual's own reason stands: repairing it makes the whole framework path invisible to the proxy on **every** host — a widening dressed as a correction, and strictly worse than the bug. **Open.**

---

# VERIFICATION

| Check | Method | Result |
|---|---|---|
| **Harness freshness (hash + non-import diff + marker)** | 🧪 **Executed FIRST** | ✅ |
| `npx tsc --noEmit` | 🧪 Executed | **exit 0, clean** |
| **Trailing-dot guard bites (old vs new disagree)** | 🧪 **Executed (N)** | ✅ 404 → serves |
| **Undotted host byte-identical** | 🧪 **Executed (N)** | ✅ live truck unaffected |
| **`isOwnHost`/`hostKey` agree on 4 dotted hosts** | 🧪 **Executed (N)** | ✅ |
| **Copied value per provider, dotted input** | 🧪 **Executed (O)** | ✅ 4 providers + 2 generic |
| **Copied value per provider, dotless input** | 🧪 **Executed (O)** | ✅ |
| **Displayed == copied** | 🔎 Source-read | one `RecordRow.value`, passed to both |
| **`dnsTargetValue` guards** (empty, `..`, spaces) | 🧪 **Executed (O)** | `''`, `x.com.`, `x.com` |
| **Safari `await`-before-write audit, 10 sites** | 🔎 Source-read | 🔴 **none found — the trap is not present** |
| **Copy-button signal audit, 10 sites** | 🔎 Source-read | 2 claim false success, 1 signals nothing |
| **Banner surfaces** | 🧪 Executed grep | exactly 1 |
| **Live page untouched** | 🔎 Source-read + grep | `app/domain`, `proxy.ts` not modified; `orderPageUrl` untouched |
| **Worked-then-stopped untouched** | 🔎 Source-read | still silent, comment added |
| **CopyButton rendered in a browser** | ❌ **NOT DONE** | see below |

## Safari-on-macOS click-through — localhost:3000

⚠️ **I rendered none of this.** Hard-refresh (⌘⇧R). Manage → Settings → the custom-domain card.

**The wizard**
1. On a truck with **no** domain: card shows **Set up**. Press it → the address step. **See:** `events.<their domain>` with nothing to type. **Wrong if** a free-text box appears.
2. Continue to the record step. **See:** the provider's name if detected, their numbered steps, then the field rows.

**The copy buttons** — this is the part to look at hardest
3. **Press Copy on the value row.** **See:** the label becomes **`Copied ✓`** on a green ground for ~2s, then reverts. 🔴 **Wrong if the button changes width or the row jogs** — the width is reserved and must not move by a pixel.
4. **Press it again immediately.** **See:** it works again. **Wrong if** it is disabled or inert.
5. **Paste into a text editor.** **See:** for a **Wix** or **Cloudflare** or **GoDaddy** truck, **no trailing full stop**. For a **123 Reg** truck, **a trailing full stop**. 🔴 **This is the fix — check the actual character.**
6. **Compare what you pasted with what is on screen.** **See:** identical. **Wrong if** they differ at all.
7. **The failure state.** Open Safari's Develop menu → any page served over plain `http://` from a non-localhost origin, or run `Object.defineProperty(navigator,'clipboard',{value:undefined})` in the console, then press Copy. **See:** the button turns **red** and reads **`Copy failed`**, reverting after 2s. 🔴 **Wrong if it silently does nothing** — that is the whole point of the state.
8. **VoiceOver (⌘F5), press Copy.** **See:** *"Value copied"* announced, without focus moving. **Wrong if** silence, or if the only signal is the colour.

**The setup box (Task 4)**
9. On a truck **mid-setup** (`custom_domain` set, `custom_domain_verified_at` null): **See** an amber ⏳ panel **inside the card**: *"<address> is not working yet"* and *"You started setting this up on <date>…"*. **Wrong if** it is missing, or if the date is absent when `setup_started_at` exists.
10. 🔴 **Now check the top of the page.** **See: NO amber domain banner on any tab.** **Wrong if** the old *"is not working yet"* strip is still across the top — that is what this change removes.

**The banner (Task 4)**
11. On a truck that is **live and not yet confirmed** (like Pizzeria Gusto today): **See** the green ✅ banner, the address as a link, *"is live. Have a look at it, then tell us it is right in Settings."*, and a ✕ that dismisses for the session. **Unchanged by this build.**
12. On a truck that is **live and confirmed**: **See no banner.** Unchanged.
13. 🔴 **Worked-then-stopped** (confirmed, then `last_ok_at` goes stale): **See no banner — and that is correct for this build.** It is your open decision, deliberately untouched.

**What cannot be tested on localhost:** the 404 fix itself. A dotted `Host:` header needs a real request; `curl -H "Host: events.pizzeriagusto.co.uk." http://localhost:3000/` will exercise the proxy but the row lookup needs the live database. **Proof N covers the logic; the round trip needs production.**

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged. No commit, no push, no deploy.**

## 🟢 CUSTOM-DOMAIN GROUP — stage these together

```
components/dashboard/CopyButton.tsx          NEW (untracked)
components/dashboard/CustomDomainSetup.tsx   +63 / -…
lib/custom-domain/copy.ts                    +45 / -…      ⚠️ see the mixed-file note
lib/custom-domain/dns.ts                     +27
lib/custom-host.ts                           +41 / -…
                                             4 tracked files, 152 insertions(+), 24 deletions(-)
```

## 🔴 TWO FILES CANNOT BE STAGED CLEANLY — READ THIS BEFORE YOU STAGE

| File | Carries |
|---|---|
| **`lib/custom-domain/copy.ts`** | **this build** (`dnsTargetValue` + both row builders) **AND the pre-existing uncommitted work** — it was one of the "pre-existing six" (its share was ~6+/3−) |
| **`app/manage/[token]/page.tsx`** | **this build** (the banner narrowing, the `setupStartedAt` prop) **AND the entire WhatsApp S1–S5 workstream** |

**Staging either file stages both workstreams' changes to it.** There is no way around that without `git add -p`, which is yours to run. **I am reporting it, not choosing.**

## 🟢 Everything else — verified this run

| Group | Diff | Status |
|---|---|---|
| **Pre-existing, the FIVE not touched here** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/App/App.xcodeproj/project.pbxproj`, `proxy.ts`, `vercel.json` | **5 files, 46+/53−** | 🟢 **byte-for-byte unchanged** — order scan-route rename, derivation extraction, `ios/` project file, and **`proxy.ts` untouched** |
| **Copy workstream** — `lib/plan-features.ts`, `app/landing/page.tsx`, `lib/landing-table.ts`, `lib/meta/webhook-signature.ts` | **4 files, 142+/49−** | 🟢 **unchanged** |
| **WhatsApp libs** — `lib/whatsapp/connection-state.ts`, `app/api/manage/route.ts` | 2 files, 126+ | 🟢 **unchanged** |
| `lib/whatsapp/{connection-read,token-crypto,embedded-signup}.ts`, `app/api/manage/whatsapp-signup/`, both migrations | — | 🟢 **unchanged** |
| `docs/reference-manual.md` | 565+/4− | 🟢 **unchanged — I did not edit the manual** |
| Outreach files, `app/order/[id]/page.tsx`, `lib/outreach.ts`, `lib/whatsapp-hint.ts` | — | 🟢 still untracked, unstaged |

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Nothing was rendered in a browser.** The `CopyButton`'s reserved width, its colours, the aria-live announcement and the failure state are **source-read only**. The width reservation in particular is a CSS-grid claim I have reasoned about and not seen — **step 3 of the click-through is the one that proves it.**
- 🔴 **The 404 fix has not been exercised end to end.** Proof N proves the key now matches; **no dotted request has been made against production.** A browser only sends a dotted `Host:` if someone types the FQDN with a final dot, so this is a latent path either way.
- 🔴 **I did not verify what `getDomainConfig().recommendedCNAME` actually returns.** The dotted-target premise rests on `dig` output and on the cron already stripping a dot — strong, but **not the API response itself**, which needs `VERCEL_API_TOKEN`. ⚠️ **The fix is correct either way** — Proof O covers dotted and dotless input.
- 🔴 **`targetTrailingDot: false` for Wix, Cloudflare and GoDaddy is asserted, not re-verified from their help pages.** For Wix it rests on **your observation** that Wix rejected the dotted value. For Cloudflare and GoDaddy it rests on their pages saying nothing about a dot. ⚠️ **The manual's own base rate applies: two of the four checked providers turned out wrong.**
- 🔴 **The five providers without verified steps still carry unchecked labels**, unchanged by this build. They take the generic dotless path, which is right for every provider we know of except 123 Reg.
- ⚠️ **I did not run the app.** No dev server, no click-through, no screenshot.
- ⚠️ **The two false-success copy buttons and the one silent button are unfixed** — outside this build's scope, reported above.

# FLAGS

- 🟢 **CONFIRMED: nothing here changes what `events.pizzeriagusto.co.uk` serves today.** Proven by execution for the host key and by source for every other path.
- 🔴 **A second latent bug found while counting: `isOwnHost` had its own copy of the normalisation** and classified `localhost.` as a customer's domain. Fixed by making it call `hostKey`.
- 🔴 **The Safari trap is NOT present at any of the ten call sites** — so it does **not** explain the copy button that appeared dead. The likelier cause is `app/admin/page.tsx:1630`, which copies and signals nothing at all.
- 🔴 **The manual does not state a wrong location for the matcher typo — it states none.** The delta above adds `proxy.ts:455`. **The typo stays unfixed, deliberately.**
- 🔴 **`lib/custom-domain/copy.ts` and `app/manage/[token]/page.tsx` each carry two workstreams** and cannot be staged cleanly without `git add -p`.
- 🔴 **The worked-then-stopped banner state is untouched and still completely silent.** Your decision.
- ⚠️ **The on-demand verification check was not built**, as instructed.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. The live page is untouched.*
