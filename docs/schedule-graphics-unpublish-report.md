# Schedule graphics: taken off production, moved to a branch, localhost from now on

**3 October 2026**
**Revert commit on `main`: `deec9f5`** — pushed, and that push is the one deliberate production
deploy in this piece of work. It removes the Schedule graphics tab from the live site.
**The work is preserved in full on `schedule-graphics` at `a7391d8`.** The working copy is left on
that branch.

**No SQL was run.** `truck_places`, `truck_place_groups` and `trucks.default_group_post_wording` were
**not dropped** and are not touched by anything here.

> Nothing in the prompt arrived garbled, and nothing in it contradicted anything else.

---

## 1 · Which branch deploys to production, and how I know

🔴 **`main`. Read from Vercel's own project record, not inferred.**

```
GET https://api.vercel.com/v9/projects/<project id>?teamId=<team id>     → HTTP 200
  project name          : village-foodie
  link.type             : github
  link.repo             : dominicbonini/village-foodie
  link.productionBranch : main          ← this is the answer
```

The token for that call is `VERCEL_API_TOKEN` in `.env.local`, alongside `VERCEL_PROJECT_ID` and
`VERCEL_TEAM_ID`. It is a read-only `GET`; no key is reproduced anywhere in this report.

**Three independent corroborations**, because a single source for a fact that governs a production
push is not enough:

| | |
|---|---|
| **The deployment list agrees** | Every production deployment is from `main`. The most recent before this work was `a7391d8`, `READY`, `target: production` — so **Schedule graphics was genuinely live**, which is the premise of the whole task. |
| **GitHub's default branch is `main`** | `origin/HEAD → origin/main`, and Vercel's Production Branch defaults to the Git provider's default branch. |
| **Nothing in the repo overrides it** | `vercel.json` has no `git` key (only `functions`, `headers`, `crons`), and there is no `.vercel/` directory in the working copy. |

✅ **The brief's assumption holds, so I proceeded rather than stopping.**

---

## 2 · The branch

```
git branch schedule-graphics main      # at a7391d8
git push -u origin schedule-graphics
```

| check | result |
|---|---|
| contains `d9e3484` | ✅ ancestor of `schedule-graphics` |
| contains `a7391d8` | ✅ ancestor of `schedule-graphics` |
| **is it the production branch?** | 🔴 **No.** `link.productionBranch` is `main`, re-read from the API *after* the push and still `main`. Any deployment from `schedule-graphics` is a **preview**, not the live site. |

⚠️ **In fact no preview deployment appeared for the branch push** — the deployment list taken after it
shows six entries, all `target: production`, all from `main`. I am not asserting why: the project
record returns `link.deploymentEnabled: undefined`, so whether previews are disabled for non-production
branches is not visible from here. **It does not matter for the thing that was asked** — the branch is
not the production branch either way, and the live site is served from `main`.

🔴 **The branch was created and pushed BEFORE main was touched.** The order matters: it means the code
existed in two places on the remote before anything removed it from one of them.

---

## 3 · The revert, and the dependency check that preceded it

### What depended on `d9e3484`: **nothing**

Only **one** commit sat after it on `main`:

```
$ git log --oneline d9e3484..main
a7391d8 Record stage 1: the migration and its verification selects, …
```

`a7391d8` touches **`docs/schedule-graphics-places-report.md` and nothing else** (530 insertions, one
file). It is documentation, carries no import, no harness registration and no census change, and the
brief says not to revert it. **So there was nothing to add to the revert** — `git revert d9e3484`
applied with no conflicts.

🔴 **Proved rather than asserted.** After staging the revert:

```
$ git diff --cached 6d951a5 --stat
 docs/schedule-graphics-places-report.md | 530 ++++++++++++++++++++++++++++++++
 1 file changed, 530 insertions(+)
```

The reverted tree is **byte-identical to `6d951a5`** — the last commit before the feature — apart from
that one doc. That is the strongest available statement that the revert is exact and complete: nothing
of `d9e3484` is left behind, and nothing unrelated came with it.

### What went, and why each is right to revert rather than keep

| reverted | note |
|---|---|
| `lib/schedule-graphics/places.ts`, `components/manage/ScheduleGraphicsTab.tsx` | the feature |
| `app/api/manage/route.ts` (−266 lines: the import, four `sg_*` actions, the staff-gate entries) | the feature |
| `app/manage/[token]/page.tsx` (the `Tab` type, the nav entry, the render, the import) | the feature |
| `lib/features.ts` (`'schedule_graphics'`) | the gate |
| `scripts/harnesses.json` (two registrations) **+ both script files** | 🔴 reverted **together**, so the list and the directory stay in step. The runner reports an unregistered `scripts/*.cjs` as drift; it printed none. |
| `supabase/migrations/20261003_truck_places.sql` | 🔴 **the FILE only.** See §4. |
| `scripts/_outreach-schema-census.cjs`, `scripts/outreach-schema-census.cjs` | one self-consistent unit — see below |

### ⚠️ One real fix is given up on main, and it should be named

The census changes revert as a single consistent unit: the two schedule-graphics tables leave `TABLES`,
and the `V9b` broken variant plus the scope controls that were added *for them* leave with them. But
the same commit also carried the **scoped write-payload reader** — the fix for the census reporting
`truck_places.website`, caused by a file-wide regex over five locals named `patch`.

🔴 **Reverting it returns `main` to the file-wide scan.** That is acceptable and not a regression in
practice: the false positive needed a `truck_places` write in the same file as four other `patch`
declarations, and `truck_places` is no longer censused on `main` at all. **`main` is exactly the state
that passed at `6d951a5`.** The fix is kept on `schedule-graphics` and returns with the feature.

I did **not** cherry-pick it onto `main`. The brief's instruction was to include extra only *"if
anything depends on d9e3484"* for the build or the sweep — nothing does, and both are green without it.
Splitting a self-consistent census change across two branches would make the next merge harder for no
present benefit.

### The sweep on main, after the revert

```
tsc --noEmit            clean
node scripts/run-harnesses.cjs
  list: scripts/harnesses.json — 81 harnesses
  81 run · 81 passed · 0 failed
  ✅ every listed harness passed
```

**81, down from 82** — `schedule-graphics-places.cjs` went with the revert. No unregistered-script
drift warning.

---

## 4 · The database

🔴 **No SQL was run, and nothing was dropped.** `truck_places`, `truck_place_groups` and
`trucks.default_group_post_wording` stay exactly as they are — applied or not. They are harmless: no
code on `main` reads or writes them, and `getTruck` selects `*`, so an unreferenced extra column on
`trucks` cannot produce a `42703` anywhere.

### ✅ Confirmed: no code on main references them

Searched `app/`, `lib/`, `components/`, `scripts/`, `supabase/`, `hooks/`, `types.ts`:

| searched for | files on `main` |
|---|---|
| `truck_places` | **0** |
| `truck_place_groups` | **0** |
| `default_group_post_wording` | **0** |
| `schedule_graphics` | **0** |
| `ScheduleGraphicsTab` | **0** |

And repo-wide (excluding `.git`, `node_modules`, `.next`, `out`, `ios`, `android`), the **only** file on
`main` that mentions any of them is:

```
docs/schedule-graphics-places-report.md
```

⚠️ **That doc now describes code that is not on `main`,** and its migration file is gone from `main`
too. That is deliberate — the brief says not to revert it, and it is the only written account of what
was built and where it went. §7 records how to read it.

---

## 5 · The two branches

### `main` — last 5

```
deec9f5 Revert "Schedule graphics, stage 1: the section shell, the plan gate, and places with their Facebook groups"
a7391d8 Record stage 1: the migration and its verification selects, the matching rule, and the census false positive
d9e3484 Schedule graphics, stage 1: the section shell, the plan gate, and places with their Facebook groups
6d951a5 Record the diagnosis, every bad column, the census, and the deploy proved by a deleted line's absence
29e1b74 A select named a column that does not exist, and the refusal that followed stopped every send
```

⚠️ `d9e3484` is still **in main's history** — a revert adds a commit, it does not rewrite history. The
code is not in the working tree; the commit remains reachable, which is what makes the revert itself
revertable.

### `schedule-graphics` — last 5

```
a7391d8 Record stage 1: the migration and its verification selects, the matching rule, and the census false positive
d9e3484 Schedule graphics, stage 1: the section shell, the plan gate, and places with their Facebook groups
6d951a5 Record the diagnosis, every bad column, the census, and the deploy proved by a deleted line's absence
29e1b74 A select named a column that does not exist, and the refusal that followed stopped every send
683eed3 Record the hidden-truck audit: one anonymous reader, gated four times
```

**The working copy is on `schedule-graphics`, clean**, with all four feature files present
(`lib/schedule-graphics/places.ts`, `components/manage/ScheduleGraphicsTab.tsx`,
`supabase/migrations/20261003_truck_places.sql`, `scripts/schedule-graphics-places.cjs`).

### The production deploy

One read of the deployment list after pushing, **not a poll and not waited on**:

```
target      state      branch             sha
production  BUILDING   main               deec9f5   ← the revert
production  READY      main               a7391d8
production  READY      main               d9e3484
```

🔴 **It was building when I looked. I did not wait for it, so I am not claiming it is live.** When it
reaches `READY`, the Schedule graphics tab is gone from the live site.

---

## 6 · Localhost — exactly how to test

### The commands

From the project folder, in Terminal:

```bash
cd ~/dev/village-foodie
git checkout schedule-graphics      # already there; this is the safety check
git status                          # expect: "On branch schedule-graphics", clean
npm run dev
```

That runs `next dev` (Next.js 16.1.6, Turbopack) and prints:

```
- Local:        http://localhost:3000
- Environments: .env.local
```

Stop it with **Ctrl-C**.

### The URL

```
http://localhost:3000/manage/<dashboard_token>
```

🔴 **Use the same token you already use in production** — same path, same token, only the host changes.
It works because localhost reads the same database (below), so the truck row and its
`dashboard_token` are the identical row.

Swap `https://www.hatchgrab.com` for `http://localhost:3000` in the manage URL you already have for
**Village Spice**. Schedule graphics is the 🎨 tab, between **Schedule** and **Deals**.

### 🔴 Which database localhost uses

**Supabase project ref: `ffphgwonshgxamtvefcv`** — both `SUPABASE_URL` (server) and
`NEXT_PUBLIC_SUPABASE_URL` (browser) in `.env.local` point at it, and they agree. No key is printed
here.

> ## 🔴 **THIS IS THE PRODUCTION DATABASE.**
> **Anything you do on localhost writes real production rows.** There is no local or staging database:
> `ffphgwonshgxamtvefcv` is the only Supabase project ref that appears anywhere in this repository (22
> occurrences, one project), and `docs/reference-manual.md` names it as the project every migration is
> applied to and verified on — *"on the Supabase dashboard confirm project ref `ffphgwonshgxamtvefcv`
> first"*, with counts across the three live trucks.
>
> **So the test-truck-only rule applies on localhost exactly as it does on production: Village Spice
> only. Pizzeria Gusto must not be touched.** Opening the Schedule graphics tab on a truck *writes* —
> it seeds a `truck_places` row per pitch in that truck's schedule.

⚠️ **How certain is this?** The project ref is read directly from `.env.local`, so "localhost uses
`ffphgwonshgxamtvefcv`" is certain. That this ref is the production database rests on the repo
evidence above rather than on reading Vercel's production env var: the API returned those values still
encrypted (the token lacks the decrypt scope), so I could not compare them directly and have not
claimed to.

### Operator login

🔴 **The manage token alone is NOT enough on localhost.** `resolveTruckAccess` in
`app/api/manage/route.ts` is deny-by-default: with no resolved session it answers **401 "Sign in
required"**, and that applies to the `GET` that loads the page as well as to every write. A token is
not a grant. (The one exception is a demo truck, keyed on the truck-id prefix — not Village Spice.)

**So, once per localhost session:**

1. Open **`http://localhost:3000/login`** and sign in with your operator account — the same email and
   password as production, because it is the same database.
2. Then open `http://localhost:3000/manage/<dashboard_token>`.

⚠️ **Signing in on production does not carry over.** The session is a cookie, and cookies are
per-origin: `localhost:3000` and `www.hatchgrab.com` are different origins, so you sign in once on
each. Access resolves as owner of that truck, a crew member on it, or a platform admin.

### Before the tab will work at all

⏳ **The migration must be applied** — `supabase/migrations/20261003_truck_places.sql`, the SQL is in
§2 of `docs/schedule-graphics-places-report.md`. Until it is, the tab loads and says *"Couldn't load
places. If this is new, the schedule-graphics migration may not be applied yet."* It fails closed and
writes nothing.

### Running the checks locally

```bash
node scripts/schedule-graphics-places.cjs     # 79 checks, 14 broken variants — no DB, no network
node scripts/run-harnesses.cjs                # the full sweep: 82 on this branch
npx next build && node scripts/schedule-graphics-render.cjs   # layout, Chromium + WebKit
```

---

## 7 · 🔴 The standing rule for this workstream

**Later prompts can rely on this. It is the rule until Dominic says otherwise.**

1. **All Schedule graphics work is committed to the `schedule-graphics` branch only.**
2. **Never push to, merge into, or rebase onto `main` for this workstream** — not even "just the
   harness", not even "just a doc" — **unless the prompt contains the word "deploy".** `main` is the
   production branch; a push to it is a live deploy.
3. **Reports for this workstream end with how to test on localhost, not with "I will check Vercel".**
   There is nothing to check on Vercel: the branch is not deployed to production.
4. **The database is production** (`ffphgwonshgxamtvefcv`). Localhost writes real rows, so
   **Village Spice only** — on localhost as much as anywhere.
5. **`docs/schedule-graphics-places-report.md` on `main` describes code that is not on `main`.** Read
   it on the `schedule-graphics` branch, where the code it describes exists.
6. **Before starting work:** `git checkout schedule-graphics && git status`. Before committing, check
   `git branch --show-current` says `schedule-graphics`.

---

## 8 · Noticed, not changed

- **`docs/schedule-graphics-places-report.md` is on `main` and describes code that is not.** Kept
  deliberately — the brief says to revert `d9e3484` only. Its §8 "what to check after deploy" list is
  now a **localhost** list; §6 of this report supersedes it.
- **The tables may already exist in the production database**, and `main`'s migration record no longer
  describes them. Nothing checks that direction — the schema census reads *code → migrations*, never
  *database → migrations* — so no harness fails, but the repository on `main` is no longer a complete
  description of the live schema. It becomes complete again when the branch merges.
- **`d9e3484` remains reachable in `main`'s history.** Intended: a revert is a commit, so this is
  itself revertable, which is what makes "deploy it later" cheap.
- **No preview deployment appeared for the `schedule-graphics` push.** Not investigated — the branch
  is not the production branch, which is the only property that was required.
- **`VERCEL_API_TOKEN` in `.env.local` can read project settings and deployments** but not decrypt env
  values. Worth knowing for future deploy questions: branch and deployment facts are answerable from
  here; environment-variable values are not.
- **The scoped write-payload reader in the schema census exists only on `schedule-graphics` now.** If
  another workstream hits a `patch`-shaped false positive on `main` before this branch merges, the fix
  is a cherry-pick of that part of `d9e3484` — not a re-write.
