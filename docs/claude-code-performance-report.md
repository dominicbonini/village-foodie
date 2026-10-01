# Claude Code performance diagnosis

**Date:** 2026-10-01
**Scope:** read-only diagnosis. No file, setting or folder was created, deleted, moved, renamed or edited,
other than this report. No secrets, tokens or the contents of `~/.claude.json` were printed — sizes,
counts and key names only.

## Headline

Claude Code is slow on every request because **every request in your main session carries 240,000–315,000
tokens of context**. Median context over the last 200 turns was 242,549 tokens; p90 was 303,197; max was
314,602. That single session has been open since **2026-08-20** (42 days), has grown to **247 MB across
84,422 lines**, and has been auto-compacted **32 times**.

This is not a disk, config, hook, MCP or repo problem. Every one of those was measured and cleared
(see "Ruled out" below). It is context volume, and it is per-request by nature: the model re-reads a
quarter of a million tokens before it writes anything.

---

## 1. Version and health

| Item | Value |
|---|---|
| `claude --version` (on PATH) | **2.1.241** |
| Latest published on npm | **2.1.286** |
| Update available? | **Yes — 45 releases behind** |
| PATH binary | `~/.nvm/versions/node/v22.22.3/bin/claude` (npm global) |
| Install method | npm-global |
| Commit | c87e2742fc9a |
| Platform | darwin-arm64 |
| Auto-updates | enabled, channel `latest` |
| Last successful update | **2026-08-24** — 5½ weeks ago |

**There are two installs, and they are different versions.** The session you are in right now is *not*
running the 2.1.241 on your PATH. It is running the Cursor extension's bundled binary:

```
~/.cursor/extensions/anthropic.claude-code-2.1.285-darwin-arm64/resources/native-binary/claude   (pid 6095, RUNNING)
~/.cursor/extensions/anthropic.claude-code-2.1.286-darwin-arm64/                                 (installed on disk, not yet running)
```

So: launching from the IDE gives you ~current code (2.1.285, with 2.1.286 staged for next restart);
launching `claude` from a terminal gives you 2.1.241 from August. Auto-update on the npm copy has
not succeeded since 2026-08-24 despite being enabled.

**`/doctor`:** `claude doctor` ran successfully and reported **"No installation issues found."** Search
is OK (bundled), auto-updates enabled. It noted that the fuller interactive checkup requires running
`/doctor` inside a session, which this non-interactive run could not do.

## 2. Sizes

### `~/.claude.json` — 70,519 bytes (72 KB). Clean.

Top-level keys by approximate serialized size (names and sizes only):

| Bytes | Key | Shape |
|---|---|---|
| 40,752 | `cachedGrowthBookFeatures` | dict, 769 keys |
| 4,657 | `projects` | dict, 2 keys |
| 2,651 | `clientDataCacheSlots` | dict, 9 keys |
| 2,573 | `cachedUsageUtilization` | dict, 3 keys |
| 2,273 | `cachedExperimentData` | dict, 11 keys |
| 1,030 | `tipsHistory` | dict, 42 keys |
| 950 | `tipLifetimeShownCounts` | dict, 40 keys |
| 762 | `oauthAccount` | dict, 20 keys |
| 496 | `passesEligibilityCache` | dict, 1 key |
| 300 | `cachedArtifactRoster` | dict, 5 keys |
| 291 | `cachedExperimentFeatures` | list, 11 entries |
| 192 | `pluginUsage` | dict, 2 keys |
| 178 | `skillUsage` | dict, 3 keys |
| 144 | `additionalModelOptionsCache` | list, 1 entry |
| 124 | `githubRepoPaths` | dict, 1 key |

Total ≈ 58 KB. **There is no `history` array and no oversized per-project history.** The `projects` map is
4.6 KB for 2 projects. This file is healthy and is not a factor.

### `~/.claude` — 373 MB. 15 largest children:

| Size | Child |
|---|---|
| 268.7 MB | `projects` |
| 84.3 MB | `file-history` |
| 14.1 MB | `plugins` |
| 4.4 MB | `skills` |
| 1.0 MB | `history.jsonl` (2,828 lines) |
| 0.5 MB | `cache` |
| 0.3 MB | `backups` |
| 0.1 MB | `shell-snapshots` |
| <0.1 MB | `sessions` |
| <0.1 MB | `state` |
| <0.1 MB | `settings.json` |
| <0.1 MB | `ide` |
| <0.1 MB | `.last-update-result.json` |
| <0.1 MB | `.last-cleanup` |
| <0.1 MB | `telemetry` |

`file-history` is 84.3 MB in **341 files, all belonging to the one long session** (`2c6b5a76…`).

### This repo's project folder — 269 MB, 20 files

`~/.claude/projects/-Users-dominicbonini-dev-village-foodie/`

| Size | File | Date |
|---|---|---|
| **247.1 MB** | `2c6b5a76-3c21-463f-8152-fa895f4c4dae.jsonl` | Oct 1 01:41 |
| 5.3 MB | `2c6b5a76…/tool-results/bdnrk3124.txt` | Sep 10 17:32 |
| 0.7 MB | `2c6b5a76…/auto-mode-classifier-error.txt` | Sep 14 23:04 |
| 0.2 MB | `2cebb98a-50a3-4f7b-9d1a-29cdfb1b8757.jsonl` (this session) | Oct 1 01:42 |
| 0.1 MB | `2c6b5a76…/tool-results/b874o1kt5.txt` | Sep 15 17:05 |
| 0.1 MB | `2c6b5a76…/tool-results/b0p04epg0.txt` | Sep 8 11:08 |
| 0.1 MB | `2c6b5a76…/tool-results/bx5krpmat.txt` | Sep 16 20:00 |
| 0.1 MB | `2c6b5a76…/tool-results/bqemdh4oh.txt` | Sep 15 11:54 |
| 0.1 MB | `2c6b5a76…/tool-results/b29aflgvp.txt` | Sep 6 22:06 |
| <0.1 MB | `2c6b5a76…/tool-results/b94by2yg4.txt` | Sep 17 13:52 |

Only **two sessions** exist for this repo, and one of them is 99.8% of the bytes.

### Base64 image data in transcripts

| Transcript | Image blocks | base64 payload |
|---|---|---|
| `2c6b5a76…jsonl` | **203** | **≈ 33.9 MB** |
| `2cebb98a…jsonl` | 0 | 0 |

Largest single payload: 1,603,057 base64 characters (≈1.2 MB image). Next four: 703,753 / 668,321 /
668,321 / 656,489. The largest single JSONL *line* in the file is 1.53 MB. Content was counted, never
printed.

### Composition of the 247 MB transcript

| Count | Entry type |
|---|---|
| 54,134 | `message` |
| 27,083 | `assistant` |
| 16,779 | `attachment` |
| 14,230 | `user` |
| 13,315 | `tool_use` |
| 13,315 | `tool_result` |
| 13,234 | `total_tokens_reminder` |
| 8,161 | `thinking` |
| 1,980 | `deferred_tools_record` |
| 32 | `compact_boundary` |

Models used in it: `claude-opus-5` (23,602), `claude-fable-5-1` (2,938), `claude-opus-4-8` (1,196).
Subagent sidechain entries: **0**.

## 3. What loads into every session

**There is no `CLAUDE.md` anywhere.** Checked `~/.claude/CLAUDE.md`, `/Users/dominicbonini/CLAUDE.md`,
`~/dev/CLAUDE.md`, the repo root, `.claude/CLAUDE.md`, every nested `CLAUDE.md` in the repo, and a
`find ~ -maxdepth 4 -iname CLAUDE.md`. **Zero results.**

Consequently:

> **`docs/reference-manual.md` is NOT imported.** Stated plainly, as asked. It is 26,635 lines and
> 2,777,739 bytes (2.6 MB), it is tracked in git, and it is loaded into context only when something
> explicitly reads it. There is no `@import` of it, because there is no file that could contain one.

**@imports:** none, in any file — there are no CLAUDE.md files to hold them.

**Skills:** `~/.claude/skills` contains one entry, `synced` (4.4 MB) — the standard synced skill bundle.
**Custom commands:** `~/.claude/commands` — empty. **Agents:** `~/.claude/agents` — empty.
**Plugins:** `~/.claude/plugins` holds `known_marketplaces.json`, `marketplaces`, `synced` (14.1 MB total).

**Repo `.claude/`** contains exactly one file: `settings.local.json` (10,700 bytes), holding a single key
`permissions` with 126 `allow` entries. No `settings.json` in the repo.

## 4. Things that run on every turn

### Hooks: **none.**

| File | Hooks |
|---|---|
| `~/.claude/settings.json` | none — only `permissions.defaultMode: auto`, `tui: fullscreen`, `theme: auto`, `effortLevel: high` |
| `.claude/settings.json` | file does not exist |
| `.claude/settings.local.json` | none — only `permissions.allow` (126 entries) |

No `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop` or any other event is configured anywhere.
**Nothing shells out on every turn.**

### MCP servers: 4 configured, **4 connected, 0 timed out**

```
claude.ai Claude Docs      https://api.anthropic.com/v1/pages/mcp        ✔ Connected
claude.ai Google Drive     https://drivemcp.googleapis.com/mcp/v1        ✔ Connected
claude.ai Gmail            https://gmailmcp.googleapis.com/mcp/v1        ✔ Connected
claude.ai Google Calendar  https://calendarmcp.googleapis.com/mcp/v1     ✔ Connected
```

All four are remote claude.ai connectors; none is a local stdio server, so none spawns a process per
session. Health check returned promptly for all four. Note: Gmail, Google Drive and Google Calendar
report as connected but need OAuth re-authorization before their tools can actually be *used* in a
non-interactive session — that is an authorization gap, not a latency source. Their tool schemas are
deferred rather than preloaded (1,980 `deferred_tools_record` entries in the transcript), so they cost
little context.

## 5. The repo

Total working tree: **2.4 GB**. Top-level:

| Size | Folder | Git status |
|---|---|---|
| 1,148.4 MB | `node_modules` | ignored ✔ |
| 978.5 MB | `.next` | ignored ✔ |
| 143.3 MB | `android` | tracked (69 files); `android/build` ignored ✔ |
| 81.7 MB | `.git` | — |
| 41.4 MB | `public` | tracked (224 files) |
| 22.2 MB | `docs` | tracked (942 files) |
| 4.7 MB | `scripts` | tracked (119 files) |
| 4.1 MB | `app` | tracked (142 files) |
| 3.0 MB | `lib` | tracked (239 files) |
| 2.0 MB | `components` | tracked (90 files) |
| 0.9 MB | `supabase` | tracked (158 files) |
| 0.4 MB | `devserver.log` | ignored ✔ |
| 0.4 MB | `ios` | tracked (25 files) |

**`.gitignore` coverage** (`git check-ignore`): `node_modules` ✔, `.next` ✔, `android/build` ✔, `out` ✔,
`build` ✔, `coverage` ✔, `devserver.log` ✔, `.env*` ✔, `scripts/backfill-output/` ✔, `/logs/` ✔,
Android signing keystores ✔. Not ignored: `dist`, `ios/build` (neither currently exists), and `public`
and `docs`, which are intentionally tracked content.

**Untracked files from `git status --porcelain`: 1.** Total porcelain lines: 2.

```
 M docs/reference-manual.md
?? docs/reference-manual-v13-7-report.md
```

Largest tracked files: `public/logos/village-foodie` (3.7 MB), `docs/reference-manual.md` (2.6 MB),
`scripts/fixtures/batch-rolling-golden.json` (1.7 MB), `public/photos/jez.jpg` (1.4 MB),
`public/logos/naama.jpg` (1.1 MB), `public/logos/pigsin.jpg` (1.0 MB).

**The repo is not slowing anything down, and this was measured rather than assumed:**

```
rg --files | wc -l   →  2,043 files in 0.024s
git status --porcelain →  0.027s
```

Ignore rules are working; search tools never walk the 2.1 GB of `node_modules` + `.next`.

## 6. Conclusion

### Ranked causes

#### 1. A 42-day session carrying ~250–315k tokens on every request — **dominant cause**

Evidence:
- `cache_read_input_tokens` over the last 200 turns: **min 22,841 · median 242,549 · p90 303,197 · max 314,602**.
- The three most recent turns read 307,163 / 313,900 / 314,602 tokens respectively.
- Session opened **2026-08-20**, last written **2026-10-01 01:41** — 42 days continuous.
- 84,422 lines, 247 MB, 13,315 tool calls, **32 `compact_boundary` events**.
- The `min` of 22,841 is what a turn costs *immediately after* a compaction. The median is **10.6× that**.

Every request re-reads a quarter-million tokens of cached prefix before the first output token. Thirty-two
compactions mean the session refills to ~300k and gets squeezed, over and over. This fully explains
"slow on *every* request", and it explains why it got gradually worse rather than breaking suddenly.

#### 2. 203 screenshots / ≈33.9 MB of base64 in that session's context — the reason it refills so fast

Each screenshot costs on the order of 1,500–2,500 tokens and stays in context until the next compaction;
the largest single payload is ≈1.2 MB of image data. Together with 13,315 tool results and 16,779
attachment entries, this is the mechanism that drives cause #1.

#### 3. The npm CLI is 45 releases behind (2.1.241, last updated 2026-08-24)

Only bites when you launch `claude` from a terminal rather than the IDE. The running IDE binary is
2.1.285 with 2.1.286 already on disk. Six weeks of performance fixes are missing from the terminal path.

#### 4. Local memory pressure — contributes to UI sluggishness, not token latency

`vm.swapusage`: **2,868 MB of 4,096 MB swap in use**, 1,227 MB free. Load average 3.82. Only 5,041 pages
free. Heavy residents: Claude desktop app 637 MB, Chrome helper 496 MB (29.6% CPU), WebKit 462 MB,
Cursor processes ~870 MB combined, plus **two Claude Code extension copies at 224 MB + 241 MB on disk**.
Bitdefender real-time scanning (`BDLDaemon`, 190 MB) is active and will scan the 247 MB JSONL as it is
appended. Disk itself is fine: 101 GB free, 12% used.

#### 5. `effortLevel: high` — measured, and **not** a significant factor

Worth stating because it looks like an obvious suspect. Over the last 200 turns, thinking averaged only
**388 tokens** (max 4,028). That is negligible against a 242,000-token prefix. Leave it alone.

### Explicitly ruled out, with evidence

| Suspect | Verdict |
|---|---|
| `~/.claude.json` bloat | 70 KB, no history arrays — **clean** |
| `reference-manual.md` being imported | **Not imported** — no CLAUDE.md exists at all |
| CLAUDE.md / @import chains | **None exist anywhere** |
| Hooks firing per turn | **None configured** in any of the three settings files |
| MCP servers hanging | **4/4 connected, 0 timeouts**, all remote, schemas deferred |
| Repo size / bad gitignore | `rg --files` 0.024s, `git status` 0.027s — **not a factor** |
| Disk I/O on the big transcript | `cat` 247 MB = 0.062s; JSON-parse all 84,422 lines = 0.96s — **~1s once at startup, not per request** |
| Custom skills/commands/agents | None beyond the standard synced bundle |
| Disk space | 101 GB free — **fine** |

### Fixes, as steps you would take yourself

Ordered by payoff. Each is targeted; none moves a whole folder.

---

**Fix 1 — Start a fresh session for new work. (Fixes ~90% of the problem, costs nothing, reversible.)**

1. In your current session, type `/compact` if you want one last squeezed summary, or just note down
   where you are.
2. Exit that session.
3. Start a new one in the repo — do **not** `--resume` into `2c6b5a76…`.
4. Paste in a short primer of what you are working on, or ask the new session to read the specific docs
   it needs.

What it loses: **nothing on disk.** The old session stays fully intact and resumable. You lose only the
*live working context* — the model will not remember the last six weeks of conversation until you tell it
or point it at files. Expect per-turn context to drop from ~242k to ~20–30k, roughly a 10× reduction in
the work done before each reply.

Note that you are *already* in a fresh session as of today (`2cebb98a…`, 155 lines, 0.4 MB, no images).
If this session already feels faster than the old one, that is the confirmation.

---

**Fix 2 — Working habit: keep sessions to a task, not to a project.**

1. Start a new session per feature or per day.
2. When you have pasted several screenshots, finish that thread and start fresh — images are the single
   heaviest thing you can put in context.
3. Watch for the context indicator; when it is consistently past ~50%, that is the signal to split.

What it loses: nothing. This is purely preventive, and it is what stops cause #1 recurring.

---

**Fix 3 — Update the npm CLI so the terminal path matches the IDE path.**

1. `npm i -g @anthropic-ai/claude-code@latest`
2. Verify: `claude --version` should print 2.1.286.
3. Restart Cursor so the already-downloaded 2.1.286 extension binary replaces the running 2.1.285.
4. Optionally check why auto-update stalled on 2026-08-24: `cat ~/.claude/.last-update-result.json`.

What it loses: **nothing** — not sign-in, not MCP config, not settings, not session history. Those live in
`~/.claude.json` and `~/.claude/`, which an npm package update does not touch. You stay signed in.

---

**Fix 4 — Relieve memory pressure before a long session.**

1. Quit Chrome, or close the heavy tabs (one helper is at 496 MB and 29.6% CPU).
2. Quit the Claude desktop app if you are working in Cursor (637 MB).
3. Restart Cursor — this also activates the newer extension binary from Fix 3.

What it loses: open tabs and app state. No Claude Code data.

---

**Fix 5 — Optional, only if you want the 353 MB back. Not needed for speed.**

Do this **after** you are confident you will never resume the August session. Speed-wise, Fix 1 already
got you everything; this is purely disk reclamation, and 101 GB is free, so there is no pressure to.

1. Confirm what you would remove:
   `ls -lh ~/.claude/projects/-Users-dominicbonini-dev-village-foodie/2c6b5a76-3c21-463f-8152-fa895f4c4dae.jsonl`
   `du -sh ~/.claude/file-history/2c6b5a76-3c21-463f-8152-fa895f4c4dae`
2. If you want a safety copy first, copy the JSONL somewhere outside `~/.claude`.
3. Remove the session transcript, its sibling directory, and its file-history directory.

What it loses: **`--resume` for that session, permanently**, and the undo/file-history record for the 341
files it touched. Your repo, git history, settings, MCP config and sign-in are all untouched. This is the
one irreversible step here, which is why it is last and gated on Fix 1 having already solved the problem.

---

### Prompt integrity

No span of the request arrived garbled. One apparent tension is worth naming rather than acting on
silently: section 6 says "Take NO action", while the closing instruction says to write this report file.
These do not actually conflict — "take no action" scopes to the remedies in section 6, and writing the
report is an explicit, separately-stated final instruction. I therefore wrote this file and took no
remedial action of any kind. If you intended "no action" to include the report, say so and I will not
write it next time.
