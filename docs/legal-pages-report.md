# Legal pages — the real documents, published

**Date:** 6 August 2026. Supersedes the previous legal-pages report.
**Part A is now DONE.** B, C and D were completed earlier today and are unchanged.
No `next dev` / `next build`. No garbled spans.

**Sources found at `~/Downloads/privacy-policy.md` and `~/Downloads/terms-and-conditions.md`** — outside the repo, which is why the earlier search inside it came back empty.

---

## 🔴 INTEGRITY GATE — CENSUS BEFORE AND AFTER

### BEFORE — the source files in `~/Downloads`

**`privacy-policy.md`** — 9,438 bytes · 9,426 chars · 174 lines

| U+ | Count | Name |
|---|---|---|
| 2014 | **6** | EM DASH |

*Distinct non-ASCII: 1. Total: 6.*

**`terms-and-conditions.md`** — 19,189 bytes · 19,146 chars · 230 lines

| U+ | Count | Name |
|---|---|---|
| 2014 | **16** | EM DASH |
| 1F534 | **2** | LARGE RED CIRCLE |
| 00A3 | **1** | POUND SIGN |
| 26A0 | **1** | WARNING SIGN |
| FE0F | **1** | VARIATION SELECTOR-16 |

*Distinct non-ASCII: 5. Total: 21.*

**Curly quotes in both: U+2018 = 0, U+2019 = 0, U+201C = 0, U+201D = 0. U+FFFD = 0.** Both sources are straight-quoted and clean.

### AFTER — the in-repo copies at `content/legal/`

| Document | Distinct | Total | Dropped | New | Identical to source |
|---|---|---|---|---|---|
| `privacy-policy.md` | **1** | **6** | 🔴 **NONE** | **NONE** | ✅ **YES** |
| `terms-and-conditions.md` | **5** | **21** | 🔴 **NONE** | **NONE** | ✅ **YES** |

**No character's count dropped. No character appeared. Curly quotes still 0; U+FFFD still 0.**

✅ **Stronger than a census: the files are byte-identical.** `shasum -a 256` matches on both — the copy was `cp -p`, not a retype or a reflow. **I never opened these in an editor and never touched their text.**

---

## 🔴 THE MARKERS IN THE TERMS ARE COPY, NOT EDITORIAL NOTES

The terms contain 🔴 ×2 and ⚠️ ×1. I checked what they were attached to before deciding they render:

| Line | Clause |
|---|---|
| 36 | 🔴 *"**We do not verify allergen or ingredient information. We cannot, and we do not attempt to.**"* |
| 80 | ⚠️ *"**Plan for this.** Some features your service depends on are only on paid plans…"* |
| 88 | 🔴 *"**Your customers' money goes directly to you.**"* |

**All three are substantive clauses carrying emphasis, not TODO markers.** They render as written. The terms page carries a comment saying so, so nobody strips them later as "leftover annotations".

---

## A. THE PAGES — rendered from the markdown, not retyped

### 🔴 The single-source decision, and the two options I rejected

**`content/legal/*.md` ARE the source of truth. The pages read them at build time.**

| Option | Rejected because |
|---|---|
| **Hand-convert the markdown to JSX** | Creates a **second copy of legal text** kept in step by hand — the drift failure this codebase records repeatedly (three DemoModeBanners, two PLAN_PRICES). It also makes every future amendment a transcription exercise **on a document where a dropped "not" is a legal problem** |
| **Add `react-markdown` + `remark-gfm`** | A parser, a GFM plugin and their transitive tree shipped to a public route, to render a construct set that is **fully enumerable**. More code, not less |

**Chosen: `lib/legal-markdown.tsx`**, a purpose-built renderer for exactly what these documents use. I enumerated every construct in both files first:

| Construct | privacy | terms | Supported |
|---|---|---|---|
| H1/H2/H3 | 13 | 16 | ✅ |
| `**bold**` | 25 | 56 | ✅ |
| `- ` lists | ✓ | ✓ | ✅ |
| `\|` tables | 18 rows | 0 | ✅ |
| `---` rule | 12 | 13 | ✅ |
| links, code, blockquotes, ordered lists, nested lists, italics | **0** | **0** | n/a |

⚠️ **Anything unsupported passes through as LITERAL TEXT rather than being dropped.** That is the correct failure direction for legal copy: an unrendered construct is visible and reportable; a swallowed clause is not. If an amendment introduces a link, it will look wrong — which is the signal to extend the renderer.

⚠️ **The inline bold parser splits and rejoins rather than regex-replacing**, so every segment of the original string is emitted exactly once and no character can be lost. An unmatched `**` renders as itself.

### ✅ FIDELITY PROVEN, NOT ASSERTED

I rendered both documents through the real renderer, walked the React tree collecting every string leaf, normalised both sides, and compared:

```
##### privacy #####  source=8975  rendered=8975  VERBATIM: ✅ YES
##### terms   #####  source=18621 rendered=18621 VERBATIM: ✅ YES

OVERALL: ✅ BOTH DOCUMENTS RENDER VERBATIM — no character added, dropped or reordered
```

⚠️ **This check failed twice before it passed, and both failures were in my test, not the renderer** — first because my tree-walker joined block elements with no separator, then because my source-normaliser did not strip the `| --- | --- |` table separator row (which the renderer correctly discards as formatting). **I fixed the check rather than the renderer both times**, and I am recording that because a fidelity test that is adjusted until it passes is worth less than one that passes first time. The final comparison strips only markdown *syntax* and collapses whitespace.

### The pages

Both are ~15 lines: read the `.md`, render it, wrap in `LegalPage`. **No document text appears in any `.tsx`.**

🔴 **Neither page passes `title` or `updated`.** Each document carries its own `# Privacy Policy` / `# Terms of Service` and `**Last updated:** 6 August 2026`. Rendering the page's own heading on top would restate the document's words back at it and could drift from them. `LegalPage`'s `title`/`updated` props are now **optional** and unused by these two.

**`lib/legal.ts` dates updated to `6 August 2026`**, with a note that the `.md` line is the source of truth and both must move together on an amendment.

---

## B / C / D — unchanged from this morning, still in force

- **Shared layout** `app/(legal)/layout.tsx` — sticky, fixed 4.5rem height, 1140px container. The logo was moving because the old header was **not sticky**, had **no fixed height**, and sat in a **672px column** against the site's 1140px. All three fixed; both pages get identical chrome from a layout they cannot escape.
- **`lib/legal.ts`** — `grep` still confirms **zero inline `/privacy` or `/terms` literals** anywhere in `app/` or `components/`.
- **Five link sites live**: landing footer · signup · demo modal ×3 · **UserMenu (the 5.1.1(i) in-app requirement)** · the layout footer.

---

## VERIFICATION

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Lint |
|---|---|
| `lib/legal-markdown.tsx` *(new)* | **clean** ✅ |
| `app/(legal)/privacy/page.tsx` | **clean** ✅ |
| `app/(legal)/terms/page.tsx` | **clean** ✅ |
| `components/legal/LegalPage.tsx` | **clean** ✅ |
| `lib/legal.ts` | **clean** ✅ |

**Reachability unchanged:** `/privacy` and `/terms` are in neither `isPublic` nor `isProtected` in `proxy.ts`, so the auth guard never fires — **public, no login, any device, and inside the native app.**

### GUSTO

✅ **No change to their live path from this step.** The only Gusto-visible change in the whole legal workstream remains the **two rows added to the account dropdown** this morning, already reported. This step touched only the two legal pages, their renderer, `LegalPage`'s optional props, and `lib/legal.ts`'s dates — **nothing on an operator screen.**

### Files added/changed in this step

`content/legal/privacy-policy.md` **new, byte-identical to source** · `content/legal/terms-and-conditions.md` **new, byte-identical** · `lib/legal-markdown.tsx` **new** · `app/(legal)/privacy/page.tsx` · `app/(legal)/terms/page.tsx` · `components/legal/LegalPage.tsx` · `lib/legal.ts`

### ⚠️ Two things worth your attention, neither a blocker

1. 🔴 **The privacy policy commits to things that do not exist yet.** §8 says *"Operators can request account deletion **from within the app**"* — **there is no account deletion anywhere** (§27: nine content-level `delete_*` actions, no `delete_account`). The policy is now a published promise, which makes 5.1.1(v) a harder deadline than it was this morning. §7's retention periods (12-month order-detail anonymisation, 90-day logs) are likewise **not implemented by anything**.
2. **The documents name `privacy@hatchgrab.com`.** `HATCHGRAB_SENDER.email` is still `hello@villagefoodie.co.uk` (§27), and hatchgrab.com mail is not set up — **so the address published in the policy may not currently receive mail.** Worth checking before launch.
