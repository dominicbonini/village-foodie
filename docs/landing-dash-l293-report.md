# Landing page — L293, the wrapped clause restored

**Date:** 31 August 2026
**Follows:** `docs/landing-dash-edit-report.md` §4, which flagged this wrapper as the one judgement call in the seven-edit batch.
**Scope:** one string edit in `app/landing/page.tsx` line 293. Nothing else. Not committed, not deployed.

This restores the fuller wording inside the `<b><u>` — the clause my previous edit had shortened to
*"It doesn't start your subscription"* when it collapsed the em dash into a sentence break. The pronoun
had to reach back across a full stop to find its subject; naming the action again removes that.

---

## 1. Line 293, before and after

**BEFORE**

```jsx
<span>With Pay at Hatch, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. <b><u>It doesn’t start your subscription</u></b>. You’re only charged when you actively select a paid plan. We’ll never charge you without your clear permission. No card to start, cancel anytime.</span>
```

**AFTER**

```jsx
<span>With Pay at Hatch, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. <b><u>Adding online payments doesn’t start your subscription</u></b>. You’re only charged when you actively select a paid plan. We’ll never charge you without your clear permission. No card to start, cancel anytime.</span>
```

**As it reads on screen:**

> …Prefer to take payment up front? Add online card payments any time. **<u>Adding online payments doesn’t start your subscription</u>**. You’re only charged when you actively select a paid plan…

### What was held constant

- ✅ **The `<b><u>` wrapper is in the same place, around the same clause.** It opens immediately after
  `any time. ` and closes immediately before the full stop, exactly as before — only the words inside it
  changed.
- ✅ **The full stop after "any time" is kept**, as introduced by the previous edit.
- ✅ **The apostrophe encoding is untouched:** `doesn’t` uses **U+2019**, matching the other two on the
  line (`You’re`, `We’ll`). Verified after the edit — **3 × U+2019, 0 straight apostrophes, no `&apos;`
  entity** — identical to before. Nothing was normalised in either direction.

⚠️ **This is not a byte-level revert to the pre-batch text.** The original read
`— <b><u>adding online payments doesn’t start your subscription</u></b>` with a lowercase *a* after an
em dash. It is now sentence-initial, so it is capitalised: **`Adding`**, as the brief specifies.

---

## 2. Verification

**Method.** Applied by exact-string replacement, asserting the old text occurred **exactly once** before
writing. It matched once, so the edit could not have hit a near-match or been applied twice. Had it not
matched, the script would have thrown before writing anything.

### Em dash count — TypeScript tokenizer, not grep

Same scanner as the audit and the previous edit (`ts.createSourceFile`, collecting only string,
template and non-whitespace JSX-text nodes, so comments are excluded by construction):

```
EM (U+2014)     11
EN (U+2013)      0
DOUBLE-HYPHEN   11
```

✅ **Still 11**, unchanged. **INFERRED and expected: this edit neither added nor removed a dash** — it
substitutes words inside an existing clause. The count is reported because it was asked for, not because
it was at risk.

### The three protected lines

```
✅ L64   'Online ordering — Pay at Hatch'   BYTE-IDENTICAL
✅ L96   <span className="no">—</span>      BYTE-IDENTICAL
✅ L214  the testimonial blockquote          BYTE-IDENTICAL
```

### No other line changed

```
diff: 1 hunk (293c293)
file length: 486 → 486 lines
```

**One hunk, one line, no line numbers moved.**

### No other file changed

```
find . -newer <marker at 2026-08-31 00:00:00>   (node_modules/.next/.git/android build excluded)
  → ./app/landing/page.tsx
```

**Exactly one file written.**

⚠️ **`git status --porcelain=v1` reports 68 modified tracked files, and that number is unchanged by this
workstream.** The tree was already dirty with 68 from earlier work, so the count on its own proves
nothing either way. Among those 68 are `app/landing/landing.css`, `lib/features.ts` and
`lib/plan-features.ts` — **none touched here**; their modifications predate this session and the `find`
above is what establishes that. Quoting the count as requested, with that caveat stated rather than left
to be inferred.

---

## 3. What was not done

- **No build, no typecheck, no lint.** None requested. This is one prose substitution inside an existing
  JSX text node — no identifier, prop or tag changed — so a compiler could only confirm the file still
  parses, which is not the question.
- **No page was rendered.** ⚠️ **INFERRED, not observed: that the clause reaches the screen as written.**
  It is a static JSX text node with no conditional around it.
- **UNKNOWN — whether the longer clause changes where the line wraps** at any viewport. It adds 23
  characters inside an underlined span, so an underline may now break across two lines where it did not
  before. Not measured; flagged because it is the one visible consequence I cannot rule out from source.
- **The landing page remains admin-gated and `noindex`**, so none of this copy is public.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** The one point worth
naming — that the restored wording is capitalised where the pre-batch original was not — follows from
the brief's own quoted replacement text and from the full stop it tells me to keep.
