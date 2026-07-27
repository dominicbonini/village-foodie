# Task report — XML comment build break fixed (my defect) · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only, **not
touched** — no append requested). `docs/last-report.md` belongs to a separate workstream —
not read, not written, not opened.

---

## 0. Prompt integrity — one garbled spot

> *"write your full report to docs/android-report.md, overwriting **whater** is there"*

Read as **"whatever is there"**. Same closing sentence as previous prompts. No effect.

---

## 1. My defect, and a correction to the suspected cause

I broke the build. The comment I added to `styles.xml` in the previous task contained a
literal double hyphen, which XML forbids inside `<!-- -->`, so AAPT's resource merge threw
`SAXParseException` before anything else could run.

**Correcting the premise in your prompt:** it was **not** an em-dash and not a `-- ` clause
separator. An em-dash (`—`, U+2014) is a single character and is perfectly legal in an XML
comment; my comments contained several and none of them was the problem. The actual cause
was that **I wrote the CSS custom property name literally**:

```
line 32:  --safe-area-inset-top — see the comment in lib/native/statusBar.ts for why that double-pads. -->
          ^^
```

`--safe-area-inset-top` begins with the two hyphens that make a CSS custom property a custom
property. So the token I was warning *against* using is what broke the file — the comment
forbidding the double-pad could not survive naming the thing it forbade. Verified: it was
the **only** internal `--` in either file (§3).

---

## 2. The rewrite — `android/app/src/main/res/values/styles.xml:12-38`

Rewritten with **no double hyphen anywhere**, meaning preserved in full. Dashes replaced by
commas and semicolons per your instruction; the two substantive points you named are intact:

- **the strip is exposed by SystemBars inset padding** — kept verbatim in substance: *"on
  Android 15+ Capacitor's core SystemBars plugin pads the WebView's PARENT view down by the
  status bar height and zeroes the insets handed to the WebView … The WebView therefore
  starts BELOW the status bar and cannot paint it, so the exposed strip shows the window
  background, which for Theme.AppCompat.DayNight in light mode is WHITE."*
- **this makes it continuous with the app header** — kept: *"Painting the window background
  with the header navy makes the strip CONTINUOUS WITH THE APP HEADER (AppHeader =
  bg-slate-900 = #0F172A) instead of a white band above it."*

Also preserved: why `AppTheme.NoActionBar` specifically (BridgeActivity applies it at
create) and why the other two themes were left alone; the "cosmetic continuity, not true
immersion" caveat; and the cross-reference to `lib/native/statusBar.ts`.

**Specific rewordings, so you can see nothing was quietly dropped:**

| Before | After |
| --- | --- |
| `--safe-area-inset-top` | "the injected safe area inset custom property" (named in prose, cross-referenced to `statusBar.ts` which may safely contain it) |
| `BridgeActivity.java:25-26` | "BridgeActivity.java lines 25 to 26" |
| `status-bar height`, `near-invisible`, `non-passthrough`, `manifest-level`, `double-pads` | `status bar height`, `near invisible`, `non passthrough`, `manifest level`, `double pads` |
| em-dash clause separators | commas and semicolons |

Hyphens that are part of an identifier and cannot be reworded are retained as **single**
hyphens and are harmless: `bg-slate-900`, `@capacitor/android`, `lib/native/statusBar.ts`.

**I also added a guard at the top of the comment** so this cannot recur silently:

> ⚠️ **NO DOUBLE HYPHENS ANYWHERE IN THIS FILE'S COMMENTS.** XML forbids the two hyphen
> sequence inside a comment (SAXParseException at resource merging, which breaks the Gradle
> build before anything else runs). That is why CSS custom property names are written in
> prose below rather than literally. Use commas or semicolons, never a pair of hyphens.

---

## 3. Every comment I added to `android/**/*.xml` this session — each one inspected

**Files I touched this session: exactly two.** `styles.xml` (edited) and `colors.xml`
(created). No other file under `android/` was modified — the manifest and the rest were
read-only. So the audit surface is these two files, and I inspected **every** comment in
both, mine and the scaffold's.

| File | Comment | Lines | Author | Internal `--`? | Action |
| --- | --- | --- | --- | --- | --- |
| `styles.xml` | `<!-- Base application theme. -->` | 4 | Capacitor scaffold | **No** | none |
| `styles.xml` | `<!-- Customize your theme here. -->` | 6 | Capacitor scaffold | **No** | none |
| `styles.xml` | The `AppTheme.NoActionBar` explanatory block | **12-38** | **mine** | **YES — line 32, `--safe-area-inset-top`** | **rewritten (§2)** |
| `colors.xml` | The `hgHeaderNavy` block | **4-8** | **mine** | **No** | none needed; left as written |

**`colors.xml` was clean.** Its comment contains one em-dash (line 6, *"continuous with the
app header — see styles.xml"*) and several single hyphens (`status-bar`, `bg-slate-900`,
`lib/brand.ts`), none of which form a `--` pair. I did **not** edit it, per "change nothing
else". Note it is now **committed** (tracked as of `a4f3881 "android white bar"`), so it
went into your tree in its verified-clean form.

**One offending comment in total. One rewrite.**

---

## 4. Verification — an actual XML parse, not a grep

A grep for `--` is not sufficient here: it cannot distinguish a delimiter (`<!--`, `-->`)
from an internal violation, and a line carrying both would mask the second. So I parsed both
files with Python's XML parser and separately extracted every comment body:

```
android/app/src/main/res/values/styles.xml: comments=3 internal '--' violations=0
   XML well-formed ✓
android/app/src/main/res/values/colors.xml: comments=1 internal '--' violations=0
   XML well-formed ✓
```

The method: regex every `<!--…-->` span, test each **body** (delimiters excluded) for `--`,
then `xml.dom.minidom.parseString` the whole file. **Zero violations, both files
well-formed.** This is the same class of check that failed in AAPT (a conforming XML parser
rejecting `--` in a comment), so it exercises the actual failure mode rather than
approximating it.

**What this does NOT prove:** that the Gradle build now succeeds. I cannot run gradle, and
resource merging does more than parse XML. It proves the specific `SAXParseException` you
hit cannot recur from these two files. See §6 for the one pre-existing issue that could
still bite.

---

## 5. Files changed

| File | Change |
| --- | --- |
| `android/app/src/main/res/values/styles.xml` | Comment block at `:12-38` rewritten, no double hyphen; guard note added at the top. **The `<style>` elements and every `<item>` are byte-identical**, including `android:windowBackground` → `@color/hgHeaderNavy`. File is 49 lines. |
| `docs/android-report.md` | This file, overwritten. |

**Nothing else changed.** `colors.xml`, `lib/native/statusBar.ts`, `docs/android.md`, and
every source file are untouched this task. No `tsc` was run — no TypeScript changed.

---

## 6. Flagged

- **The `--` rule applies to my comments in `AndroidManifest.xml` too, if I ever add any.**
  I have not, and did not this session. Worth knowing the constraint is file-type wide, not
  specific to `styles.xml`: any `android/**/*.xml` comment I write must avoid the pair. The
  guard note now lives in `styles.xml` where the mistake happened.
- **Still outstanding from §5 of the previous report, and it may be your next build error:**
  `styles.xml:7-9` references `@color/colorPrimary`, `@color/colorPrimaryDark` and
  `@color/colorAccent`, and I can find **no definition for any of them** anywhere under
  `android/`. My `colors.xml` deliberately defines only `hgHeaderNavy` and does not shadow
  them. If the build now gets past resource merging and fails on unresolved colours, that is
  this — and adding the three to `colors.xml` is the fix. I have **not** done so, because
  you said change nothing else and because guessing their values would put invented brand
  colours into the theme.
- **`lib/native/statusBar.ts` legitimately still contains `--safe-area-inset-top`** (in the
  prohibition comment). That is correct and must stay: it is TypeScript, where the token is
  not only legal but the precise thing being warned about. Only the XML copy had to lose it.
- **My fault, plainly.** The XML comment restriction is not obscure and I should have
  avoided a literal CSS custom property name inside one. The typecheck I ran last task
  covered the TypeScript and gave no signal on the XML, which I noted at the time
  ("the two Android XML files are not type-checked or compiled by anything I am permitted to
  run") — I flagged the gap and then shipped a defect straight through it. The parse check in
  §4 is the check I should have run then, and it costs nothing.

---

## 7. What I could not do / did not do

- **Could not run gradle or any build** — so "the build now succeeds" is unproven; what is
  proven is that both files parse cleanly as XML (§4).
- **Did not touch `colors.xml`** — inspected, verified clean, left exactly as committed.
- **Did not touch `lib/native/statusBar.ts`**, `docs/android.md`, or any source file.
- **Did not fix the missing `colorPrimary` / `colorPrimaryDark` / `colorAccent`
  definitions** — flagged in §6, out of scope for "change nothing else".
- **Did not touch `docs/last-report.md`** — not read, not written, not opened.
