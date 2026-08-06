# Landing — social auto-replies copy change

**Date:** 6 August 2026. **One file changed by this task: `app/landing/page.tsx`.** No `cap sync` / `next dev` / `next build`. No garbled spans in the brief.

---

# THE CHANGE

**Before** — `app/landing/page.tsx:193`
```jsx
<div className="does-item"><h3>Social media auto-replies</h3><p>“Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re at the grill. Messenger and Instagram coming soon.</p></div>
```

**After** — `app/landing/page.tsx:202`
```jsx
<div className="does-item"><h3>Social media auto-replies</h3><p>“Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill. Messenger and Instagram coming soon.</p></div>
```

**Middle sentence: 9 → 14 words.** Nothing else on the line moved.

## Byte-level proof that only the middle sentence changed

| Element | Byte-identical? |
|---|---|
| `<h3>Social media auto-replies</h3>` | ✅ |
| `“Where are you tonight?”` | ✅ |
| `“Do you do gluten free?”` | ✅ |
| 🔴 **`Messenger and Instagram coming soon.`** | ✅ **byte-identical** |

```
old middle sentence present in AFTER : False   (expected False)
new middle sentence present in AFTER : True    (expected True)
```

## Apostrophes — no escaping needed, and that is not an oversight

```
U+2019 curly apostrophes in the line: 1
straight ASCII apostrophes         : 0   ← react/no-unescaped-entities cannot fire
&apos; entities                    : 0
```

⚠️ **The brief warned about `&apos;`, and the correct answer here was to use neither.** This line already used a **curly `’` (U+2019)** in `you’re`, as does every other line in that block. `react/no-unescaped-entities` only flags **straight** `'` and `"`, so a curly apostrophe is the "equivalent" the brief allowed — and it matches house style, whereas `&apos;` would have been the only entity among literal curly quotes on the same line. **Lint confirms clean.**

## Recorded in a comment above the block
```
⚠️ "driving to the pitch or at the grill" — NOT just "at the grill". On its own that is a
generic busy-kitchen claim any hospitality product could make. DRIVING is specific to a food
truck and is the moment an operator genuinely CANNOT reply, which is the whole point of the
feature. Keeping both covers the two states a truck operator is actually in.
🔴 THE MIXED TENSES ARE DELIBERATE. WhatsApp is PRESENT tense because it ships at launch;
Messenger and Instagram carry "coming soon" because they may not. Same standing editorial
rule as FOOTNOTES[3] in lib/plan-features.ts — the landing page describes the product AT
LAUNCH — applied to two features with different readiness. It is NOT an inconsistency; do
not "harmonise" the tenses.
```

---

# VERIFY

## Build
```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline (`HEAD`) | Now | |
|---|---|---|---|
| `app/landing/page.tsx` | clean | **clean** | ✅ |

Baseline from `HEAD` via stash, compared rule by rule — clean before and after.

## Two greps that look wrong and are not

⚠️ **`grep -c "driving to the pitch"` returns 2.** Line **193** is the explanatory comment; line **202** is the rendered copy. One occurrence in the product text, as intended.

⚠️ **`git diff --stat HEAD` lists `lib/plan-features.ts` as modified — this task did not open it.** That file carries the **previous** task's footnote-3 change, which is still uncommitted (HEAD is `3b1b1d1`, committed before that task ran). Confirmed by reading the diff: it contains **only** the footnote-3 comment block and its one-line text replacement — nothing from this task. `docs/pricing-dry-report.md` likewise shows as modified because it is this report.

**The only file this task edited is `app/landing/page.tsx`.**

### Constraints honoured
One sentence changed · heading, both quoted customer questions and `Messenger and Instagram coming soon.` all byte-identical · nothing outside `app/landing/page.tsx` opened · `lib/plan-features.ts` not read or written by this task · no figure or fee literal involved.
