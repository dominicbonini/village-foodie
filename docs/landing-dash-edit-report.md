# Landing page — the seven dash edits

**Date:** 30 August 2026
**Source audit:** `docs/landing-dash-audit-report.md`
**Scope:** seven string edits in `app/landing/page.tsx`. Nothing else. Not committed, not deployed.
**No build was run.** None was requested and none was needed — see §6.

---

## 1. The three protected strings

🔴 **All three are byte-identical, checked two ways** — by line number against a copy of the pre-edit
file, and by fixed-string match so a line-number shift could not hide a change:

```
✅ L64   'Online ordering — Pay at Hatch'   BYTE-IDENTICAL   (ROW_FEATURE_MAP join key)
✅ L96   <span className="no">—</span>      BYTE-IDENTICAL   (NON_SECRET_PRICE exact match)
✅ L214  the testimonial blockquote          BYTE-IDENTICAL   (a real operator's words)

fixed-string occurrence counts, before → after:
  "Online ordering — Pay at Hatch') return true"   1 → 1  ✅
  'className="no">—</span>'                        1 → 1  ✅
  "HatchGrab has made ordering so much easier"     1 → 1  ✅
```

**The file is 486 lines before and after**, so no line numbers moved at all.

---

## 2. Em dash count — counted with the TypeScript tokenizer, not grep

Same scanner as the audit: `ts.createSourceFile`, collecting only `StringLiteral`,
`NoSubstitutionTemplateLiteral`, template spans and non-whitespace `JsxText`. **Comments are excluded by
construction.**

```
BEFORE   EM (U+2014)  18     EN 0     double-hyphen 11
AFTER    EM (U+2014)  11     EN 0     double-hyphen 11
```

✅ **11 after, as specified.** 18 − 7 = 11, so every removal landed and none was removed twice.

The **11 remaining** are: the three protected strings (L64, L96, L214) and eight others the brief did not
list — L42 (metadata title), L133, L141, L142, L168, L192, L292, L379. **The 11 double-hyphens are
unchanged and are all CSS custom properties**, as the audit established.

---

## 3. The seven changed lines, as they now read

Rendered text only (tags stripped) so the sentences are legible:

**L167** — `Never promise a time you can’t hit`
> Set your kitchen’s capacity. That’s how much you can cook at once, and how long it takes. Once a collection time is full, customers can’t pick it.

**L169** — `Never type your schedule twice`
> We read your schedule straight from your website. Or send us the photo you already post to Facebook. You just review and confirm.

**L194** — `Build your menu`
> Photograph your board or paste it in. Items, prices and extras all come across on their own. You just check they’re right.

**L255**
> Name, time, what they want, and anything they’ve asked for. All on your kitchen screen before they arrive. No note gets missed. Print it as well if you’d rather have paper in your hand.

**L288**
> Pro is £29 a month with £1,500 of online orders included. Max is £49 with £2,000. Anything above that is 0.99%. Standard card processing fees apply to all online orders (currently {CARD_FEE_ONLINE_LABEL} on standard UK cards), including those within your allowance. Walk-ups carry no HatchGrab platform fee on any plan. Your card terminal&apos;s own fees still apply.

**L293**
> With Pay at Hatch, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. **It doesn’t start your subscription.** You’re only charged when you actively select a paid plan. We’ll never charge you without your clear permission. No card to start, cancel anytime.

**L465**
> Upload a photo or screenshot of your menu and we’ll turn it into a working ordering page for you to have a play around with in under 60 seconds. Your items, your prices. No sign-up, no card, nothing to install. Have a look, then decide.

---

## 4. ⚠️ Two things the brief's quoted text did not show, and how I handled them

Neither is a departure from the instruction — both are cases where the file carries markup or an entity
the brief's plain-text quotation could not represent. **Flagging rather than deciding silently.**

### L288 uses the HTML entity `&apos;`, not an apostrophe character

The file reads `your card terminal&apos;s own fees still apply`. The brief quoted it as
`your card terminal's own fees still apply`. Per *"preserve the existing apostrophe characters exactly
as the file uses them"*, **I kept `&apos;`**:

```
… on any plan. Your card terminal&apos;s own fees still apply.
```

### L293's target span is wrapped in `<b><u>`

The line reads:

```jsx
Add online card payments any time — <b><u>adding online payments doesn’t start your subscription</u></b>.
```

The emphasis sits **on the subscription claim**, which is the reassurance the sentence exists to make.
The brief's replacement text (`It doesn't start your subscription.`) is exactly the span inside the
`<b><u>`. **I kept the wrapper around the new words**, so the emphasis stays on the same claim:

```jsx
Add online card payments any time. <b><u>It doesn’t start your subscription</u></b>.
```

⚠️ **Dropping the `<b><u>` would have been an unrequested change to a page element**, and moving it
would have shifted emphasis onto different words. If you would rather the emphasis went elsewhere — or
came off entirely — that is a one-line change and I have not made it.

### Apostrophes elsewhere

Every replacement uses the **curly `’` (U+2019)** the file already uses, not the straight apostrophes
the brief's plain-text quotations contain. Affected: `That’s` (L167, new word), `they’re` (L194),
`they’ve` (L255), `doesn’t` (L293). **No apostrophe was normalised in either direction.**

---

## 5. Scope — no other file was modified

**`git status --porcelain=v1` lists 68 modified tracked files, and that count is unchanged by this
workstream** — the tree was already dirty with 68 from earlier work, so `git status` alone cannot
answer the question. The decisive evidence is which files were **written**:

```
find . -newer <marker set to 2026-08-30 00:00:00>   (node_modules/.next/.git/android build excluded)
  → ./app/landing/page.tsx
```

**Exactly one file.** ⚠️ **An earlier attempt at this check used `-newermt '-20 minutes'`, which does not
parse on BSD `find` and returned an empty list including the file I had just edited** — that result was
invalid and is discarded; the reference-file form above is the one relied on.

**The files the brief named as off-limits, with mtimes predating this session:**

```
components/landing/DemoUpload.tsx      2026-07-31 17:18:58
app/landing/cost/CostComparison.tsx    2026-08-25 09:43:43
lib/features.ts                        2026-08-26 21:26:51
lib/plan-features.ts                   2026-08-29 00:12:12
components/landing/LandingNav.tsx      2026-08-24 09:52:20
components/landing/LandingFooter.tsx   2026-08-24 09:52:20
app/landing/landing.css                2026-08-29 12:03:48
app/landing/layout.tsx                 2026-08-20 18:17:12

app/landing/page.tsx                   2026-08-30 00:06:38   ← the only file written
```

**Nothing was reformatted, reordered, linted or tidied.** The diff is seven single-line hunks
(`167c167`, `169c169`, `194c194`, `255c255`, `288c288`, `293c293`, `465c465`) and no others.

---

## 6. What was and was not run

**Method:** each edit was applied by exact-string replacement with an assertion that the old text
occurred **exactly once** before writing. All seven asserted successfully, so no edit was applied to a
near-match and none was applied twice. **Had any string not matched, the script would have thrown before
writing anything** — the brief's stop condition was armed throughout and never fired.

🔴 **NO BUILD WAS RUN.** Not `next build`, not `tsc`, not `eslint`. None was requested.

⚠️ **And a clean build would not have been evidence of anything that matters here.** These are seven
prose strings inside existing JSX text nodes; no identifier, prop or tag changed, so a compiler could
only have confirmed the file still parses. **Whether the new sentences read well is yours to judge from
§3, which is why the lines are quoted in full rather than summarised.**

---

## 7. What remains unobserved

1. **No page was rendered.** The quoted text in §3 is the source with tags stripped, not a browser
   render. **INFERRED, not observed: that each sentence reaches the screen as written** — these are
   static JSX text nodes with no conditional around them.
2. **UNKNOWN — how the new sentence lengths affect line wrapping** at any viewport. Four of the seven
   edits add a word or two (`That’s`, `Or send us`, `All on`), so a wrap point may move.
3. **The landing page remains admin-gated and `noindex`**, unchanged by this workstream — so none of this
   copy is public yet.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** The two markup
details in §4 were not contradictions but gaps between the brief's plain-text quotations and what the
file contains; both are resolved in the direction the brief's own preservation rule requires, and both
are flagged rather than assumed.
