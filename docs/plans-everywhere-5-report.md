# plans-everywhere-5 — STOPPED at step 0: production is not on a38bfe0d (the three commits were never pushed)

20 November 2026, 09:29 UTC. **Nothing was run or changed.**

- **Not run:** the translator, `20261119_plans_everywhere_1.sql`, the live checks.
- **No database writes, no push, no deploy.**
- **Untouched:** Pizzeria Gusto and Le Roi du Churrasco.

## Summary

- **Production is still `1d916cac`** (Vercel: Ready, 19 Nov 14:09 UTC). **origin/main is also still `1d916cac`.**
- **The three commits that need deploying exist only locally**, in this working copy's `main`, 3 ahead of origin:
  - **`a38bfe0d`** — terms-postpay-1, the post-pay Terms in English + 51 languages, `TERMS_UPDATED` / `TERMS_VERSION`;
  - **`645e145a`** — the FAQ translator fix: three-letter locales, upsert, only the locales enabled countries use;
  - **`78095cc6`** — the committed file of the locale migration (already run on the database on 19 Nov).
- **Live /terms confirms it:** it still has the old wording (no "How we collect our fee on pre-orders") and the old date.
- **Why I stopped:** your standing rule is that you do every push and deploy. So I didn't push, and I didn't run the three steps that depend on the deploy:
  - **The translator:** it runs the code on GitHub, which still translates into unused locales and rejects Filipino replies.
  - **The plans migration:** it should follow the new terms going live.
  - **The live checks:** /tz/terms can't show the new wording yet.

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none in the wording. The brief opens with "Deployed", but the commits it depends on aren't on origin or in production. Running the steps anyway would act on the old code and the old terms, so I'm reporting rather than choosing.

## 1 · What I checked (read-only)

| Check | Result |
|---|---|
| `git fetch` + `git log origin/main` | origin/main = **`1d916cac`** "new plans" (then `36d3b5b5`, `1ad9b83b`) |
| Is `a38bfe0d` on origin/main? Is `645e145a`? | **No** and **no** |
| `git rev-list --left-right --count main...origin/main` | **3 0**: local main is 3 commits ahead (`78095cc6`, `645e145a`, `a38bfe0d`) and 0 behind |
| GitHub deployment records | newest `1d916cac`, **success** (19 Nov 14:09:48 UTC); nothing newer |
| `vercel ls` | newest production deployment **● Ready, 19h old**; nothing newer, failed or otherwise |
| Live www.hatchgrab.com/terms | the post-pay paragraph "How we collect our fee on pre-orders" **absent**; "19 November 2026" **absent** |

## 2 · What's needed

1. **You push** local `main`: `78095cc6`, `645e145a`, `a38bfe0d`.
2. **You deploy**, and it shows Ready.
3. Then I'll do exactly what this brief asks:
   - **Confirm:** live /terms has "How we collect our fee on pre-orders" and "19 November 2026".
   - **Step 1:** trigger the FAQ translator until it reports nothing left. Then check /tz/faq (Swahili, with the pay-at-truck answers), the four new answers in fr-FR and es-MX against the English, and /br …0002.
   - **Step 2:** run `20261119_plans_everywhere_1.sql` with `--approved-by-dominic`, the SQL shown inline.
   - **Step 3:** the live checks (/tz and /jm three plans and the post-pay box, /uk unchanged, /tz/terms) and the read-only plan counts per country.

## 3 · Hard rules

- No database reads or writes this round.
- No push and no deploy (standing rule).
- No .env file was opened.
- **Outside calls, all read-only:**
  - `git fetch`;
  - GitHub's deployment API through `gh`;
  - `vercel ls`;
  - one GET of the live /terms.
