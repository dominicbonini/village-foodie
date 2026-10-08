# SOCIAL POSTS · PART 2 — A BIG FONT LIBRARY, AND UPLOADING YOUR OWN FONT

**6 October 2026 · branch `main`, local. Pushed: no. Deployed: no.**

⛔ **THERE IS SQL AND IT HAS NOT BEEN RUN.** `supabase/migrations/20261017_post_fonts.sql` — two new
tables and one new **private** bucket. **Nothing in this feature works until you apply it.** The full
SQL, with read-only checks before and a read-only verify after, is in my chat reply and in §10 below.

🔴 **The 21 bundled fonts stay, stay bundled, and keep their bare ids.** Every design saved before
today renders byte-for-byte as it did — proved by pixel comparison, not by inspection.

🔴 **Nothing is fetched while a post is being rendered.** That is the promise the whole architecture is
shaped around, and §4 sets out the three layers that keep it.

---

## 📊 1 · WHAT YOU GET

| | |
|---|---|
| **The library** | **1,819 families**, all OFL-1.1 / Apache-2.0 / UFL-1.0 |
| **Of those, with a real bold** | 781 |
| **With a real italic** | 342 — and where one exists it is **used**, not faked |
| **The four groups** | Bold & tall 486 · Handwritten 247 · Classic 350 · Clean 736 |
| **Popular picks shown first** | **42**, chosen for posters |
| **Catalogue file** | 129KB committed · **99KB** sent to the browser, once per page |
| **Uploads** | TTF or OTF, up to 5MB, up to **three** faces per family (Regular · Bold · Italic) |

---

## 🔴 2 · THE CATALOGUE — GENERATED, COMMITTED, AND LICENCE-FILTERED BY DIRECTORY

`scripts/build-font-catalogue.mjs` → `lib/weekly-post/font-catalogue.json`. Re-running it updates the
file. ⚠️ **It is a build script, not a harness** — it uses the network on purpose, it is not in
`scripts/harnesses.json`, and nothing in the product ever runs it.

### 2.1 · Three sources, and why each one

| # | What | Where from |
|---|---|---|
| 1 | family, category, available weights **and italics**, popularity | `https://fonts.google.com/metadata/fonts` — Google's own catalogue JSON (1,950 families) |
| 2 | **the licence** | the **directory names** in the `google/fonts` GitHub repository, via the git trees API |
| 3 | whether a **static TTF** is actually obtainable | one CSS request per family (§3) |

🔴 **GOOGLE'S METADATA CARRIES NO LICENCE FIELD AT ALL** — I checked its 23 keys. That is why source 2
exists, and it turns out to be the better answer anyway: **in `google/fonts` the directory *is* the
licence.** `apache/` (44 families), `ofl/` (2,007) and `ufl/` (5) — and `cc-by-sa/`, which is **not**
admitted. So the licence is a fact about where the file lives, not a string somebody typed.

⛔ **AND IT IS WHAT KEEPS GOOGLE'S OWN BRAND FONTS OUT WITHOUT NAMING THEM.** "Google Sans" appears in
the metadata with popularity rank 2. It is in none of those three directories, so it is dropped — the
filter did the work, not a blocklist I would have had to maintain.

⚠️ **The script FAILS LOUDLY on a truncated tree.** A truncated response would silently shrink the
catalogue by hundreds of fonts and look like Google had removed them.

### 2.2 · What was dropped, and why

| Dropped | Count | Why |
|---|---|---|
| **No allowed licence** | 6 | the six `Edu …` families, in none of the three directories |
| **No `latin` subset** | 121 | a Noto Tamil or Devanagari face has no Latin glyphs, so "Wednesday 14th October" would render as a row of **empty boxes**. Offering it would be offering a font that cannot draw the only thing this feature writes |
| **No regular (400) weight** | 4 | Buda (300 only), **Molle (italic only)**, Sunflower (300/500/700), UnifrakturCook (700 only). Every box asks for a regular or a bold |
| **No static TTF** | **0** | every one of the 1,819 was probed and every one passed |

**1,950 in → 1,819 out.**

### 2.3 · Two overrides on Google's category, and one is a heuristic

"Bold & tall" is not a Google category, and that is the tab a poster needs most.

1. 🔴 **The 21 bundled families keep `font-list.ts`'s own grouping.** Google files Oswald, Bebas Neue,
   Anton, Archivo Black and Teko as "Sans Serif" — true and useless: they are the five condensed
   display faces this product shipped with, chosen for exactly this job, and Google's category would
   put every one of them under **Clean**, beside Inter and Lato. It also calls Abril Fatface "Display"
   where `font-list.ts` calls it a slab, which is the better answer for a tab named **Classic**.
2. ⚠️ **A condensed or narrow sans counts as "Bold & tall" — and this one is a heuristic on the family
   NAME**, labelled as such: "Barlow Condensed", "Archivo Narrow", "Fira Sans Compressed". The cost of
   it being wrong for one family is one family in the wrong tab, and **search covers all 1,819 whichever
   tab is open**.

### 2.4 · Three things the file cannot be wrong about

| | |
|---|---|
| ⛔ **A slug collision throws at build time** | two families slugging to one font id would make the second render as the first on somebody's poster. It has never happened; it fails loudly if it does |
| ⛔ **An unprobed catalogue throws at MODULE LOAD** | `--no-probe` exists so the script can be checked without 1,819 requests, and a file written that way records `probed: false`. Loading it would mean offering fonts nobody has confirmed can be fetched |
| ⛔ **A popular pick that is not in the catalogue throws at module load** | a *skipped* pick is a list that is quietly 41 long with no sign of which one went missing — and the likeliest cause is a family losing its licence between builds, which is exactly what somebody needs to be told |

---

## 🔴 3 · THE STATIC-TTF SOURCE — THE USER AGENT IS THE WHOLE TRICK

satori needs a **static TTF or OTF**: not WOFF2, and not a variable font whose axes it would have to
instantiate. Google Fonts serves whatever format the **requesting browser** supports, decided from the
`User-Agent` — so the format is chosen by what we claim to be. **Measured, not assumed:**

| endpoint + UA | what comes back |
|---|---|
| `css2?family=` + a modern browser | **woff2** — satori cannot read it |
| `css?family=` + Chrome 19 / Android 4.4 | **woff** — satori cannot read it |
| `css2?family=` + **MSIE 6** | a `/l/font?kit=…` URL serving an **EOT** — the response literally says `content-disposition: attachment; filename="font.eot"` |
| **`css?family=` + Android 2.2 (Nexus One)** | ✅ **`format('truetype')`** and a real static `.ttf` on `fonts.gstatic.com/s/…` |

⛔ **IT MUST BE THE v1 `css` ENDPOINT, NOT `css2`.** `css2` with the same Android 2.2 UA still returns
the EOT kit URL. All four rows above were tried in that order; the table is what the tries said.

### 3.1 · Proved end to end before anything was built on it

I fetched Playfair Display's **italic** this way and parsed it with **our own** `readFontMetrics`:
`unitsPerEm 1000, ascender 1082, descender −251, 105 mapped codepoints`, and
`measureText('Wednesday 14th October', m, 40) = 415.5px`. So the files this source yields are files
`lib/weekly-post/ttf-metrics.ts` can measure — which is the only thing that matters, because
shrink-to-fit depends on it.

### 3.2 · What the probe found

**1,819 probes, 0 refusals** — at every level of popularity, from Roboto (rank 2) to
"Playwrite FR Moderne Guides" (rank 2,056). The v1 endpoint is universal. ⚠️ **The flag is still
recorded per family and the probe still runs**, because "never half-offer a font" has to be a fact in
the committed file rather than a conclusion from a 30-family sample.

---

## 🔴 4 · NOTHING IS FETCHED WHILE A POST IS BEING RENDERED

Three layers, fastest first:

| Layer | What | Cost |
|---|---|---|
| **1 · in-process memory** | a `Map` keyed by **storage path**, bounded at 48 files | a warm render does **zero I/O** |
| **2 · our private storage** | the `post-fonts` bucket | one `download` per face per cold start |
| **3 · Google, once ever, per face, across ALL trucks** | then written to layers 2 and 1 | one fetch, for the first truck that ever chooses that family |

⛔ **WHY THAT IS NOT AN OPTIMISATION:**

- **Determinism.** The preview an operator approves has to be the file they download, today and in a
  year. Google's URLs carry a version (`/v57/`) and that version changes. `fonts.ts` makes the same
  argument about the bundled files in its own header; this is the same argument.
- **Render time.** The brief's ceiling is 2s and a warm render is ~40ms. Three font fetches over the
  public internet inside that is a timeout waiting to happen.
- **Availability.** A truck making a post at 4pm on a Saturday must not be stopped by a DNS failure.

⚠️ **The memory cache is keyed by STORAGE PATH, which is why it is safe to share across trucks.** A
path begins with `library/` or `trucks/<truck id>/`, so one truck's entry cannot be read for another's
— they cannot produce the same key. A cache keyed by `(fontId, face)` **could**, because `u:myfont`
means a different file for every truck. That is the bug this choice avoids.

### 4.1 · The fetch happens when the font is CHOSEN

`font_choose` is called the moment the operator picks a row, and the selection **waits for it**.

- ⛔ Fetching at **save** time would put a network round trip inside "Save design".
- ⛔ Fetching at **render** time is the thing this whole feature is built not to do.
- ⛔ Selecting first and fetching afterwards would let an operator save a design naming a font whose
  files had failed to arrive, and the poster would **silently** render in Oswald.

By the time a design naming `g:lobster` is rendered, Lobster's files are already ours. The row says
"Adding…" and is disabled while it happens — the "disabled state for a font still being checked" that
part 1's own note predicted this control would need.

### 4.2 · Measured with the network mocked

`font-store.ts` takes storage, the cache table and the fetcher as **interfaces** — it imports neither
Supabase nor `fetch`. ⛔ **That is not tidiness:** "nothing is fetched while a post is being rendered"
is only *provable* if the check can **count** the fetches.

| | |
|---|---|
| first choice | `fetched: true`, **1** call to the source, files stored, a row per face with the licence |
| second choice | `fetched: false`, **still 1** call ever — it came from the cache table |
| a second render of the same design | **0** further storage reads (layer 1) |
| a family not in the catalogue | **refused**, and the source is never called |

⚠️ **The mock fetcher returns REAL font bytes** (the committed Playfair Display files), so everything
downstream — the metrics parse inside the store, the bundle, the render — is doing real work. A fetcher
returning `Buffer.alloc(100)` would have made that a check of the counting only.

---

## 🔴 5 · THE RENDERER IS HANDED ITS FONTS

Until today every font was a committed file, so `render.ts` could call `loadFontMetrics()`
synchronously in the middle of laying a box out. A library font lives in object storage and getting its
bytes is `await`. ⛔ **And `boxEl` cannot be async**: it is called inside `week.days.forEach(...)`, it
runs `fitLines` — a synchronous search over font metrics — and making it async would turn the whole
element tree into a promise graph.

🔴 **So the I/O happens first and the renderer stays synchronous.** `lib/weekly-post/font-bundle.ts` is
what one render has available; the caller loads it and passes it in. **That is the same discipline the
background picture already followed** — `render.ts` is given a data URI, not a path.

⚠️ **`RenderInput.fonts` is OPTIONAL and defaults to the committed files for whatever families the
design names.** That is what kept every existing caller — and the whole of `scripts/weekly-post.cjs`
(221 checks, 35 mutation variants) — working with no change, and what makes a library or uploaded font
an **added** capability rather than a new requirement.

### 5.1 · `resolve()` — the ladder, and every rung is a real case

| | |
|---|---|
| 1 | exactly what was asked for |
| 2 | italic asked for, **no italic file** → the upright face, **sheared** (`fauxItalic`) |
| 3 | bold asked for, **no 700 file** → the 400 file, flagged (`fauxBold`) |
| 4 | **nothing for this id at all** → **Oswald**. A truck deleted an uploaded font a design still names, and a poster in Oswald beats no poster |

🔴 **Oswald is always loaded, whatever the design says.** It is the fallback and the "Powered by
HatchGrab" mark's family; a bundle without it cannot answer `resolve()` for a font that has gone.

### 5.2 · ⛔ satori is told the **font id** for anything not bundled

satori matches `fontFamily` against a registered font's `name`, so the name only has to be consistent
— and **unique**. "The real family name" is not unique: a truck can upload a file whose name table says
**"Oswald"** — their own licensed cut, or a modified one. Registering both under "Oswald" would make
satori pick arbitrarily: **their uploaded font silently replacing the bundled one across every design
they have, or the reverse.**

⚠️ **The 21 bundled families keep their real names**, because every pre-existing design renders through
them and that output must not change by one pixel. Their ids are unique too, so the real name buys only
byte-identity — which is the whole promise.

Asserted: an uploaded font named "Oswald" resolves to `u:oswald` while the bundled one resolves to
`Oswald`, and no `(name, weight, style)` is registered twice.

### 5.3 · Real italics

| | |
|---|---|
| 🔴 **342 library families have a real italic file, and it is used** | `fontStyle: 'italic'` with the italic face registered |
| ⚠️ **The 12° shear is now the FALLBACK ONLY** | applied **only** when `resolve()` returns `fauxItalic` |
| ⛔ **The shear can never land on top of a real italic** | that would double the slant. The renderer asks the bundle rather than reading `box.italic` |
| 🔴 **The Italic button is now in the TOOLBAR**, beside Bold | and like Bold it appears **only** where the family has the file. Part 1 had italic in Advanced only, because none of the 21 has one |

Proved in pixels: the italic face and the upright face of one family render differently.

### 5.4 · Shrink-to-fit uses the chosen font's metrics

⛔ **THIS IS THE ONE THAT FAILS SILENTLY ON FINISHED ARTWORK.** Measure with Oswald — a narrow
condensed face — and draw with a wide one, and the text overflows a box on a poster that goes straight
to customers with no error anywhere.

🔴 **`boxEl` resolves the face ONCE and takes the metrics from it**, so the font that is measured is the
font that is drawn. Asserted three ways: the two faces genuinely measure >10% apart on the same string;
`boxEl` reads `face.metrics`; and `fitLines` returns a **different fitted size** for the same box in
the two faces.

---

## 🔴 6 · THE PICKER

A button that opens a panel — **not a `<select>`**, because a native select cannot draw each option in
its own font, which is the one thing a font picker has to do.

| | |
|---|---|
| **Search** | `Search 1,819 fonts` — 🔴 **the real count, derived from the catalogue**, so the sentence cannot go stale |
| **Tabs** | All · Bold & tall · Handwritten · Classic · Clean · **Yours (n)**. They **wrap** — six do not fit one line at 390px, and a scrolling strip would hide "Yours", the one tab somebody who has uploaded a font is looking for |
| **Before any search** | **"Popular for posters"** — the 42 picks, **not** the first 42 of the catalogue |
| **Each row** | the name in **small grey**, the **sample date drawn in that font** underneath, and the licence quietly on the right |
| **Recently used** | at the top, **read off the truck's own saved designs** |
| **Selected** | highlighted with an orange ring |
| **Below the list** | `⤒ Upload your own font` and *"TTF or OTF file. Tick to confirm you own or have a licence to use it."* |

### 6.1 · Why the picks are chosen rather than computed

⛔ **GOOGLE'S POPULARITY ORDER IS THE WRONG ORDER FOR THIS SCREEN.** Its top twenty are Roboto, Open
Sans, Noto Sans, Lato, Montserrat, Inter — the fonts **the web** is set in. A food truck's poster is a
headline on a photograph, and what works there is condensed display faces, fat slabs and brush scripts.
Ordering by web popularity would put forty body-text sans faces in front of an operator looking for
something that shouts.

So `PICK_NAMES` is the brief's ten plus thirty-two more of the same kinds, **spread across all four
groups** so whichever tab they open first has something in it before they type.

### 6.2 · How a row previews its font — two different answers

| | |
|---|---|
| **A library family** (including all 21 bundled, which are Google families) | the browser loads Google's **web font CSS** and the row is drawn in the real face |
| **A font the truck uploaded** | a small **PNG from our own renderer** (`font_sample`) |

⚠️ **THERE IS NO CONTENT-SECURITY-POLICY IN THIS PRODUCT.** Checked, not assumed: nothing in
`next.config.ts`, nothing in `vercel.json`, and **there is no middleware file at all**. So **nothing was
loosened** to allow the preview CSS. ⚠️ It does mean the operator's browser contacts Google when they
open the list — a display-only request; **no font is fetched that way for rendering.**

⛔ **WHY AN UPLOADED FONT GETS A PICTURE INSTEAD.** An uploaded font may be commercially licensed. A URL
the browser can read is a URL **anyone** can read, and serving somebody else's paid font from our domain
is redistribution. **This feature never gives the browser a URL for a font file** — there is no signed
read URL for a font anywhere in it, which is asserted. The PNG shows the operator their font without
handing out the font, and it has the advantage of being **the truth**: the same satori that will draw
the poster.

### 6.3 · Bounded, so the list cannot download the internet

⛔ **1,819 ROWS WOULD BE 1,819 `@font-face` DOWNLOADS** — tens of megabytes, and the list unusable while
it happened. So the list is capped at **60** rows and the cap is the feature: 42 before anybody
searches, 60 matches after. ⚠️ **The match count is shown when it exceeds the cap**, so a short list is
never mistaken for the whole answer.

⚠️ **One `<link>` for the whole visible page**, replaced on every keystroke rather than appended —
otherwise typing would leave a hundred stylesheets on the page. `display=swap`, so a row is never blank
while its font arrives. ⚠️ **`text=` is deliberately NOT used**: subsetting would be smaller but would
make every row's stylesheet URL depend on the sample text, so changing the date style would re-download
all sixty.

### 6.4 · One owner of the font data

🔴 **The fetch is hoisted to the EDITOR** (`useFontLibrary`), because **two** things need it and they are
in different places on the screen: the picker's list, and the toolbar's Bold/Italic buttons. A picker
that owned the data would have to publish it upwards, and the toolbar would be drawing buttons from a
copy one render behind — which is how a Bold button appears for a single-weight family for one frame.

⚠️ **The request is cached at MODULE scope**, because `DesignEditor` is remounted whenever the design
being edited changes (part 1, §7) — a hook that fetched in an effect would re-fetch 99KB every time the
operator switched from Standard to a place's design.

⚠️ **The picker's rows are drawn with the DESIGN'S OWN date wording** — `dateSampleFor()` is one function
with two readers, the grey sample beside "Date" and every row of the picker. An operator comparing fonts
against "Wednesday 14th October" and then seeing "Wed 14/10" on their poster is comparing the wrong
thing.

---

## 🔴 7 · UPLOADING YOUR OWN FONT

| | |
|---|---|
| **Accepted** | TTF or OTF, up to **5MB** — checked in the browser (for speed), on the server (from the bytes), **and** by a table constraint |
| **A WOFF/WOFF2** | refused with the brief's sentence: *"Please upload a TTF or OTF file — you can usually download one from where you bought the font."* Refused twice: by **name** before the upload, and by **magic** after — a renamed `.woff2` gets past the first |
| **Also refused** | a `.ttc` collection (**by name**, so the operator is not told "unknown magic"), junk, an empty file, and a **valid magic with no tables behind it** — the hostile case, not the clumsy one |
| **The tick** | required. The file input is **disabled until it is ticked**, so there is no path where a font is uploaded and then refused — and the server removes the object and repeats the sentence anyway, because a client gate is advice |
| **When it was ticked** | `licence_confirmed_at`, **NOT NULL**, from the **server's** clock — not a timestamp the browser sent, which would be a claim about when somebody says they agreed |

### 7.1 · The family and face come from the font, never the filename

⛔ **THE FILENAME IS NOT EVIDENCE.** It is whatever the file was called on their machine, it is supplied
by the browser, and "Bold" in it may be a lie. Read from the font's own tables:

| | |
|---|---|
| **family** | `name` table — 🔴 **ids 16/17 beat 1/2 where they exist, and that is the SPEC, not a preference.** A family with more than four faces cannot express itself in ids 1 and 2, so a nine-weight family ships id 1 = "Roboto Light" and id 16 = "Roboto". Reading only id 1 would file **every weight as a separate family** — nine "families" of one face each, which the Regular/Bold/Italic grouping cannot work with |
| **weight** | `OS/2`'s weight class (≥600 ⇒ Bold), falling back to the subfamily words |
| **italic** | `head.macStyle` bit 1 **or** the words — plenty of oblique faces set one and not the other |

🔴 **What it decided is RETURNED AND SAID**: *"Added "My Shop Font" as its Regular."* A font that calls
itself "SemiBold" lands on Bold, and an operator who uploaded it as their regular needs to see that
rather than wonder later why their text is heavy.

⚠️ **Parsed with the same reader the renderer uses.** A file `readFontMetrics` cannot read would lay out
as nothing, so it is refused here rather than stored and discovered on a poster. Also refused: a font
with **no measurable letters** ("it may be an icon font").

### 7.2 · Three faces, uploaded separately

`(400, normal)`, `(700, normal)`, `(400, italic)` — enforced by a **table constraint**, not left to the
route. ⚠️ **There is no bold italic**, because no control can select one; `bold + italic` draws the
italic face at its own weight, which is what a word processor does.

After the first upload: *"Add the bold or italic version of "My Shop Font" (optional) — tick again and
choose the file."* ⚠️ **"(optional)" is in the words**: a family with one file works perfectly.

⚠️ **A later face inherits the display name they already chose** rather than resetting it to the font's
own.

### 7.3 · Removing one

🔴 **The confirm NAMES the designs** (`font_usage`): *"your weekly post design"*, *"your single event
post design"*, *"your design for The Kings Arms"*. "Are you sure?" is a question nobody can answer.

⛔ **THE DESIGNS ARE NOT REWRITTEN, AND THAT IS DELIBERATE.** A box that named the font keeps naming it,
and the renderer falls back to **Oswald**. Rewriting every saved layout would be a write across three
tables in a path whose only job is a delete — and it would destroy the operator's choice of font in
designs they may be about to re-upload the font for. **Said in the confirm, and here.**

⚠️ **The files go first, then the rows.** The other order would leave a row pointing at an object that
is gone — which renders as a missing font with no way to tell it from a storage outage.

⚠️ **A render whose font cannot be loaded gets a WARNING, not an error**: *"A font this design uses
(u:myfont) could not be loaded — those boxes are in Oswald."* Throwing would mean they could not make a
post at all until they had found and fixed every box.

---

## 🔴 8 · FONT IDS — ONE STRING FIELD, THREE KINDS OF FONT

| id | what | where the bytes are |
|---|---|---|
| `oswald` | one of the **21 bundled** | committed in `assets/fonts/weekly-post/` |
| `g:lobster` | a **library** family | our private storage, fetched once ever |
| `u:myshopfont` | a font the **truck uploaded** | our private storage, per truck |

⛔ **THE BUNDLED IDS ARE BARE AND MUST STAY BARE.** Every design saved before today stores `oswald`,
`bebasneue`, `playfairdisplay`… — a prefixed scheme would have orphaned every one of them. So "no
prefix" **is** the bundled form.

### 8.1 · The validator now checks SHAPE, not membership

It was `FONT_BY_ID.has(v.fontId)` — the 21 and nothing else. That cannot hold: `layout.ts` is **pure,
synchronous and imported by the editor**, so it has no catalogue (129KB, server-side) and no database (a
truck's uploads are rows).

🔴 **Split three ways, and all three are needed:**

| Where | What | Why |
|---|---|---|
| `font-refs.ts` (pure, browser-safe) | the **shape** | so a `jsonb` column can never hold `"../../etc/passwd"` or 4KB of junk — **and the slug ends up in a storage object path**, so it must be lowercase alphanumeric |
| the server | **existence** | which is also where the **licence rule** is enforced, at the point of choosing |
| the renderer | a **fallback** | because a font can legitimately disappear |

Asserted: all three shapes round-trip, and `../../etc/passwd`, `g:../x`, `u:a/b`, `g:`, `My Font`, an
80-character slug, `''`, `null`, `42` and `{}` all fall back to Oswald.

---

## 🔴 9 · WHAT A TRUCK CANNOT REACH

| | |
|---|---|
| ⛔ **One truck cannot load another's uploaded font** | the same `u:myshopfont` id resolves for its owner and falls back to Oswald for anyone else — asserted both ways |
| ⛔ **An upload path is built server-side and starts with the truck id** | a client-supplied path is authority over exactly the object it names, and this bucket holds every truck's fonts |
| ⛔ **`font_confirm` refuses a path outside `trucks/<truck id>/`** first, before anything is read | otherwise it would parse — and then publish under this truck's name — somebody else's file |
| ⛔ **`font_sample` only ever draws the truck's OWN fonts**, with the text capped at 60 characters | it is not a general text renderer |
| ⛔ **The bucket is private and nothing in the product makes it public** | asserted against the migration |
| ⛔ **Everything stays behind the existing gates** | `gated()` runs once at the top of POST, so all seven new actions are behind `places_posts_preview` **and** `schedule_graphics`. There is no second entry point to that file |

### 9.1 · A note on how RLS is enforced here, because it is worth being precise

§4 asks that a truck's fonts be "readable and writable only by that truck's server routes". There is
**no `auth.uid()` in this product** — an operator is authenticated by `trucks.dashboard_token`, not by a
Supabase session, so there is no JWT claim a policy could compare `truck_id` against. The enforcement
is:

1. no client role can read or write these tables **at all** (the policy **plus** the `REVOKE` — enabling
   RLS alone leaves Supabase's default grants in place, so the capability stays reachable with the anon
   key and merely default-denied);
2. every reader and writer is `/api/weekly-post`, holding the service-role key;
3. that route resolves the truck from the token **first** and filters every query by
   `.eq('truck_id', truck.id)` — the same pattern as every other truck-owned table here.

⚠️ **A `using (truck_id = …)` policy would be theatre**: the only role that can reach the table is the
one RLS does not apply to.

---

## 📜 10 · THE SQL — FOR YOU TO RUN

`supabase/migrations/20261017_post_fonts.sql`. **Idempotent.** The full file is in my chat reply with
read-only checks before and a read-only verify after. In summary:

| | |
|---|---|
| `storage.buckets` | `post-fonts`, **public: false** |
| `public.font_library_cache` | family · weight · style · storage_path · licence · source_url · fetched_at. **No `truck_id`** — shared. Unique on `(family, weight, style)` |
| `public.truck_fonts` | truck_id · family · display_name · weight · style · storage_path · file_bytes · **licence_confirmed_at NOT NULL** · created_at. Unique on `(truck_id, family, weight, style)` |
| RLS | enabled on both, service-role policy, `REVOKE` from anon/authenticated/public |
| Existing tables | **none altered.** `truck_post_designs.layout` gains optional font references inside the jsonb it already holds, which needs no DDL |
| Last line | `notify pgrst, 'reload schema'` — without it both tables read as absent and the picker silently falls back to the 21 bundled families |

⚠️ **If your SQL-editor role cannot write `storage.buckets`**, that one statement errors and the rest
still applies — create it by hand: Storage › New bucket, name `post-fonts`, **Public: OFF**. That is
what happened for `truck-media` and `outreach-attachments`.

⚠️ **`truck_id` is TEXT.** `trucks.id` is text — live ids are slugs like `pizzeria-gusto` — and
declaring it `uuid` fails the migration outright. Same rule as `truck_places` and `truck_post_designs`.

---

## ✅ 11 · WHAT WAS RUN

| | |
|---|---|
| `tsc --noEmit` | **clean** |
| `npx next build` | **✓ Compiled successfully** |
| **ESLint — product code** | **identical: 774 errors in `app`+`components`+`lib` both ways.** Warnings +1 — one `<img>` (the uploaded-font preview), the project's baseline warning class |
| **ESLint — whole repo** | errors +4, all `no-require-imports` in the new harness — the class that already accounts for 525 errors across the 96 existing ones |
| **Full sweep** | `node scripts/run-harnesses.cjs` — **97 run · 97 passed · 0 failed** |
| **New harness** | `scripts/design-fonts.cjs` — **88 checks**, registered (**97** listed) |
| **Unchanged output, proved** | `weekly-post.cjs` **221** checks · **35/35** mutation variants · `design-editor.cjs` **60** checks, including the byte-identical render of a pre-part-1 stored layout |
| **Browser** | the picker measured in **WebKit** at **1100×800 and 390×844**, with its own control |
| **Catalogue build** | 1,950 in → **1,819 out**, **0** refused by the probe |
| **Route smoke test** | `npx next start -p 3127` (PID recorded, stopped by that PID) · `font_catalogue` with an invalid token → **401 `Invalid token`**. ⚠️ That proves the route and the 129KB catalogue module **load** under the Next runtime; it does **not** prove the catalogue payload, which needs an operator token and the migration — that is §12 |

### 11.1 · The brief's seven unit-level checks, each one named

| Asked for | Where |
|---|---|
| the catalogue only contains allowed licences | §1 — and *"there are more than a thousand of them, so the rule is not vacuous"* beside it |
| a library fetch stores static TTFs and is **reused from cache** on the second call, network mocked | §4 — fetch count 1 after two calls |
| an uploaded TTF parses and gets its name | §3 — family from the name table, weight from `OS/2` |
| a WOFF2 and a junk file are refused | §3 — plus WOFF, `.ttc`, empty, and a valid magic with no tables |
| the renderer draws with a library font **and** an uploaded font (pixels differ from Oswald) | §5 — and the two differ from **each other** |
| shrink-to-fit uses the new font's metrics | §6 — the fitted size differs between faces for the same box |
| a real italic file is used when present | §6 — and the shear is proved to be the fallback only |

### 11.2 · 🔴 Four harness faults, and one safety guard that refused me twice

1. ⛔ **A COMMENT THAT OPENS A FAKE BLOCK COMMENT HIDES REAL CODE FROM EVERY COMMENT-STRIPPING CHECK.**
   A user-agent table in `font-store.ts` ended a line with a glob — a star followed by `.ttf` — inside a
   `//` comment. A slash-star sequence there opens a **block** comment as far as a naive stripper is
   concerned, and the next closing delimiter was **seventeen lines down**, so `codeOf()` deleted two
   exports. The harness then reported that **no file in `lib/` fetches a font** — false, and it read
   like a product bug.
   🔴 **SWEPT: CLOSED — 5 members, all fixed.** Four were **pre-existing and unrelated**:
   `lib/ratelimit.ts` (three lines), `lib/stripe/connect.ts`, `lib/native/useGatedActionResult.tsx` and
   `lib/weekly-post/render.ts`. All comment-only edits. §7 of the new harness now **forbids the pattern
   across `lib/` and `components/`**. ⚠️ **Sixth variation of "a comment interfered with a check on
   code" in this project — and the first where the comment HID code rather than satisfying a check.**
2. ⚠️ **AND THE FIX HIT THE SAME CLASS IMMEDIATELY, TWICE.** The tombstone explaining the glob contained
   the glob; and a comment inside the new sweep contained a regex literal whose closing delimiter ended
   the block comment early, breaking the harness outright. **Neither note may show the sequence it is
   about**, and both now say so.
3. ⚠️ **A UNIQUENESS ASSERTION AT THE WRONG GRANULARITY.** "satori's family names are unique" failed on
   **correct** code: one family legitimately appears twice, at 400 and at 700. satori's complaint is
   about a family offered twice at the **same weight and style**, which is what the key must be.
4. ⚠️ **A COUNT THAT WENT TO ZERO.** `weekly-post.cjs` asserted `FONT_CHOICES` was looped in exactly one
   file. The picker does not read that list at all now, so the honest count is **zero** — which would
   also pass if the picker had been **deleted**. Restated as four claims together: nothing reads the
   bundled list, exactly one file fetches the catalogue, exactly one defines the picker, and the editor
   mounts it.
5. 🔴 **THE HARNESS RUNNER'S SAFETY SCREEN REFUSED MY NEW HARNESS — TWICE — AND IT WAS RIGHT BOTH
   TIMES.** `run-harnesses.cjs` screens every listed file's source and refuses any containing one of
   four substrings, *"including one in a comment, because a file that so much as discusses building a
   production client is not a file this runner should execute unattended."* That guard exists because a
   script once overwrote 132 rows of a live table.
   - **First refusal:** the harness named the Google font host in an assertion.
   - **Second refusal:** the **note explaining the first refusal** listed the screen's own banned words.
   - ⛔ **Neither was fixed by loosening the screen, and neither by obfuscating the string.** Assembling
     a banned value out of pieces to slip past a safety check would be worse than the thing the check is
     for. The assertion now compares `font-store.ts`'s endpoint against the host recorded **in the
     generated catalogue** — which is a *stronger* claim: if either is changed without the other, it
     fails.

---

## 📄 12 · THE LOCALHOST TEST LIST — PIZZA KITCHEN ONLY, SAFARI ON MAC

### ⛔ 12.0 · RUN THE SQL FIRST

| # | Do |
|---|---|
| 1 | Run `supabase/migrations/20261017_post_fonts.sql` (the full text is in my chat reply) |
| 2 | Confirm the verify block at the end lists **two tables** and the **`post-fonts` bucket with `public = false`** |
| 3 | If the `storage.buckets` insert errored: Storage › New bucket › `post-fonts`, **Public: OFF** |
| 4 | `npm run dev`, open `/manage/<Pizza Kitchen's token>` → **Schedule › Social posts → Designs**, and **⌘⌥R** |

⚠️ **Until step 1 is done**, the picker shows only the 21 bundled families and an upload is refused with
*"Uploaded fonts need a database update — run supabase/migrations/20261017_post_fonts.sql first."*

### 12.1 · Search the library and pick a new font

| # | Do | Expect |
|---|---|---|
| 5 | Open the weekly design → select **Date** → press the **Font** control | a panel, not a dropdown |
| 6 | Read the search box | **`Search 1,819 fonts`** |
| 7 | Look at the list before typing | **"Popular for posters"** — about forty rows, **each drawn in its own font**, with the name small and grey above the sample |
| 8 | Read a row's sample | **`Wednesday 14th October`** — your design's own date wording |
| 9 | Press the tabs | **All · Bold & tall · Handwritten · Classic · Clean · Yours**. "Bold & tall" has Oswald, Bebas Neue, Anton, Teko; "Handwritten" has Pacifico, Caveat, Permanent Marker |
| 10 | Type `lob` | **Lobster** first — not a font that merely contains those letters mid-word |
| 11 | Type `conden` | a long list of condensed faces, with the count below it |
| 12 | Press **Lobster** | the row says "Adding…" briefly — **this is the one fetch, ever, for all trucks** — then the panel closes |
| 13 | Look at the picture | **the date is now in Lobster** |
| 14 | Press the Font control again and pick Lobster again | **instant.** No "Adding…" — it is cached |
| 15 | **Save design** | "Design saved." |
| 16 | ‹ Designs, reopen the weekly design | **still Lobster**, in the list's sample and on the picture |
| 17 | **⌘⌥R**, open it again | still Lobster |
| 18 | Open the picker | Lobster is at the top under **"Recently used"**, highlighted |
| 19 | Make a post with the weekly design (Make a post › Weekly) and look at the downloaded PNG | Lobster is on the real poster, not just the preview |

### 12.2 · A family with a real italic

| # | Do | Expect |
|---|---|---|
| 20 | Date selected → Font → search **Playfair Display** → pick it | the date changes |
| 21 | Look at the **Style** cell in the toolbar | **three buttons now: B, I and AA Capitals** |
| 22 | Press **I** | the date is in a **real italic** — the letterforms are redrawn, not slanted |
| 23 | Now pick **Oswald** | the **I button disappears** — Oswald has no italic file, and a sheared fake is not offered as one |
| 24 | Pick **Pacifico** | the **B button disappears too** — single weight |
| 25 | Pick Playfair Display again, press **I**, then Advanced › LETTERS | **Italic is ticked there too** — it is the same setting |
| 26 | Save, reopen | the italic is still on |

### 12.3 · Upload a TTF

⚠️ **Use a font you own.** Any `.ttf` from `/System/Library/Fonts/Supplemental/` will do for a test.

| # | Do | Expect |
|---|---|---|
| 27 | Open the picker and scroll to the bottom | the tick, `⤒ Upload your own font`, and *"TTF or OTF file. Tick to confirm you own or have a licence to use it."* |
| 28 | **Press the upload label without ticking** | **nothing happens** — it is disabled until the tick |
| 29 | Tick the box, press the label, choose a `.ttf` | "Checking the font…", then **`Added "<its own name>" as its Regular.`** — the name came from the font, not the filename |
| 30 | Look at the picture | **the date is in your font immediately** |
| 31 | Read the note under the upload row | *"Add the bold or italic version of "…" (optional) — tick again and choose the file."* |
| 32 | Press the **Yours** tab | your font is there, with **"· yours"** after the name and **"Your own"** where a licence would be. Its sample is a **picture** of your font, not web text |
| 33 | Tick again and upload the **Bold** of the same family | **`Added "…" as its Bold.`** — and it stays **one** entry in Yours |
| 34 | Select the Date and look at **Style** | the **B button has appeared** for your font |
| 35 | Save, ⌘⌥R, reopen | your font is still chosen, and still in **Yours** |
| 36 | Make a post and download it | **your font is on the real poster** |

### 12.4 · The refusals

| # | Do | Expect |
|---|---|---|
| 37 | Tick, then choose a **`.woff2`** file | *"Please upload a TTF or OTF file — you can usually download one from where you bought the font."* **Nothing is uploaded** |
| 38 | Rename a `.woff2` to `.ttf` and upload it | **the same sentence** — the server read the magic, and it removed the file |
| 39 | Rename a `.jpg` to `.ttf` and upload it | *"That file could not be read as a font — …"* |
| 40 | Try a font over 5MB | *"That font is N.NMB. The limit is 5MB."* |
| 41 | Try a `.ttc` (e.g. a system collection) | it says it is a **font collection**, not "unknown magic" |

### 12.5 · Remove it, with the warning and the fallback

| # | Do | Expect |
|---|---|---|
| 42 | Make sure your uploaded font is used by the **weekly** design, and save |  |
| 43 | Open the picker → **Yours** → your font's remove control | 🔴 **a confirm that NAMES the designs** — *"your weekly post design"* |
| 44 | Confirm | the font disappears from **Yours** |
| 45 | Look at the weekly design's picture | **the date is in Oswald**, and a warning says *"A font this design uses (u:…) could not be loaded — those boxes are in Oswald."* |
| 46 | Open the picker | your font is **not** under "Recently used" any more — a font that cannot be loaded is not offered again |
| 47 | Pick a library font and save | the warning goes |
| 48 | Re-upload the same font file | it comes back, and any design still naming it uses it again |

### 12.6 · Narrow

**Develop › Enter Responsive Design Mode → 390 × 844.**

| # | Do | Expect |
|---|---|---|
| 49 | Open the weekly design, tap the **Date** chip, press **Font** | the panel opens **inside** the screen |
| 50 | Try to scroll the page sideways | **it does not** |
| 51 | Scroll the list | it scrolls **inside the panel** — the page behind it does not move |
| 52 | Look at the tabs | they **wrap onto two rows**; all six are reachable, "Yours" included |
| 53 | Look at a row with a long name (search `cormorant`) | **one line** — the name truncates, the sample and the licence stay put |
| 54 | Scroll to the bottom of the panel | the tick, the upload label and its sentence are all inside it |

---

## 📋 13 · OPEN ITEMS FOR YOU

| | |
|---|---|
| ⛔ **THE SQL** | **not run.** `supabase/migrations/20261017_post_fonts.sql` — inline in my chat reply |
| **Deploy** | **not done — you deploy by hand** |
| ⚠️ **The picker contacts Google from the operator's browser** | display-only preview CSS for the ≤60 visible rows. There is no CSP in this product, so nothing was loosened. **No font is fetched that way for rendering** |
| ⚠️ **Removing an uploaded font does not rewrite designs** | the boxes keep naming it and fall back to Oswald. Deliberate — §7.3 |
| ⚠️ **No bold italic** | no control can select one; `bold + italic` draws the italic face at its own weight |
| ⚠️ **The first truck to choose a family pays the fetch** | one CSS request plus up to three file downloads, inside `font_choose`. Typically well under a second; it is a one-off per family **for the whole product** |
| ⚠️ **Re-running the catalogue builder is a 1,819-request job** | about two minutes. It is a build script and is not in the harness list |
| ⚠️ **`font_library_cache` has no eviction** | fonts are small (30–200KB) and the set is bounded by what trucks choose. If it ever matters, a row's `fetched_at` is there to sweep by |
| ⚠️ **4 of the 1,950 families are unreachable** | Buda, Molle, Sunflower and UnifrakturCook — no regular weight. §2.2 |
| From part 1 | `countryForTruck()` still returns `'GB'` for everyone; the two deliberate render changes ("From 5pm" → a range, raised ordinals always on) stand |

---

## ⛔ 14 · ALSO FIXED: "Designs" DESELECTED THE "Social posts" PILL

**Reported mid-build:** *"when in social posts there are 2 tabs make a post and designs. if i click on
designs then 'social posts' tab that i'm in shows deselected."*

It did, and here is exactly why.

| | |
|---|---|
| **Schedule has THREE pills** | Events · Event types · **Social posts** |
| **…and FOUR sections** | `events` · `event-types` · `posts` (Make a post) · **`designs`** |
| **The pill row tested** | `shownSection === sec.id` |
| **So on Designs** | `'designs' === 'posts'` is **false** — and the operator was on a screen **no pill claimed** |

Both areas are in the URL deliberately (part 1: *"send me the designs screen" has to be a link
somebody can send*), so `designs` is a real section — it just had no pill of its own, and nothing
mapped it to the one it lives inside.

### ⛔ 14.1 · And the code already claimed this worked

`SCHEDULE_SECTIONS`' own comment read:

> ⛔ ONE PILL FOR BOTH AREAS, and its id is the area the pill opens. **The pill is also the active one
> while `designs` is showing — see `shownSection` below.**

**`shownSection` did no such mapping.** It only handles the gated-bookmark fall-through
(`!canPlacesPosts && posts|designs ⇒ events`). The second sentence was an intention written as a
statement of fact, with a pointer at code that does not do it.

🔴 **A COMMENT THAT ASSERTS A BEHAVIOUR IS NOT AN IMPLEMENTATION OF IT**, and a *"see X below"* aimed
at code that does not do X is **worse than no comment**, because it stops the next person looking —
which is exactly what it did to me when I read that file in part 1. **Nothing checked it.**

### 14.2 · The fix

The answer to "which pill is lit?" is a **property of the section**, so it is data, in
`lib/manage-links.ts` beside `canonicalScheduleSection` — the one module the page and the harness both
read, for the same reason that function lives there:

```ts
const PILL_FOR_SECTION: Record<ScheduleSection, ScheduleSection> = {
  events: 'events', 'event-types': 'event-types', posts: 'posts',
  designs: 'posts',          // 🔴 the one entry that is not the identity
}
export const scheduleSectionPill = (s: ScheduleSection): ScheduleSection => PILL_FOR_SECTION[s] ?? s
```

The row now computes `litPill = scheduleSectionPill(shownSection)` **once**, outside the map, and both
the `aria-selected` and the class read it — one answer for the whole row, so the two cannot drift.

⚠️ **Nothing else changed.** The bodies below still switch on the raw `shownSection`, which is correct:
Designs must still render Designs.

### 14.3 · Swept, and the class has exactly one member

The other two sub-tab bars on that page were checked for the same mismatch:

| Bar | Pills vs sections | Verdict |
|---|---|---|
| **Menu** | 4 pills, 4 sections — `items · capacity · extras · deals`, one each | ✅ cannot have the fault |
| **Settings** | a scroll-spy over its own section ids (`activeId`) | ✅ not a section/pill mapping at all |
| **Schedule** | **3 pills, 4 sections** | ⛔ the one member — fixed |

### 14.4 · Four checks, and the function is now RUN rather than grepped

`scripts/social-posts.cjs` (**96** checks, was 92):

- the map has `designs: 'posts'` **and** the three identities;
- the call site uses `litPill` for **both** the `aria-selected` and the class;
- ⛔ **`shownSection === sec.id` is gone from the pill row** — an absence, asserted beside those
  positives, because the map alone would pass with the row still comparing the raw section;
- 🔴 **`lib/manage-links.ts` is COMPILED AND CALLED.** It is a pure string builder — no React, no
  `window`, no router, which §3 of that harness already asserted — so
  `scheduleSectionPill('designs') === 'posts'` is now a **behavioural** fact. ⚠️ And the other three
  are asserted as the identity, so a fix that lit Social posts for *every* section would fail — which
  a check looking only at `designs` would have passed;
- ⚠️ the end-to-end journey of an old bookmark: `?section=places` → `canonicalScheduleSection` →
  `designs` → `scheduleSectionPill` → **Social posts lit**;
- ⚠️ and the row really has exactly three pills, read out of the page's own list, so "lights one of the
  three" is a claim about what is drawn rather than about a list typed into the harness.

### ⚠️ 14.5 · And an allowlist caught the change, which is what it is for

`scripts/schedule-graphics-places.cjs` has a guard against **lost lines** in that 14,000-line page,
with an allowlist of deliberate replacements. One entry said the pill row's line
`aria-selected={section === sec.id}` had been replaced by **`shownSection === sec.id`** — the very
expression that was wrong.

🔴 **The moment the fix landed, that entry failed**, with its own message: *"EDIT CLAIMED BUT NOT
PRESENT"*. That is the guard's stated purpose — *"an entry excuses a lost line only while its
replacement exists. A typo, a revert or a later rename turns the excuse back into a failure — which is
the difference between a changelog and a check."* The claim now names `litPill === sec.id` and records
why the old one was wrong.

⚠️ **It is also the second time in this build that a stale CLAIM about the pill row went unnoticed** —
once as a comment in the page (§14.1), once as an allowlist entry here. The comment had nothing
checking it; the allowlist entry checked itself.

**Verified:** `tsc --noEmit` clean · `npx next build` ✓ · product-code ESLint unchanged (774 errors in
`app`+`components`+`lib`) · `social-posts.cjs` 96/96 · `schedule-graphics-places.cjs` 258/258 · full
sweep **97/97**.

⚠️ **One thing to confirm by eye** (step 55 below), because the pill's *colour* is a computed style and
this is a logic fix: the pill should look identical on Make a post and on Designs.

| # | Do | Expect |
|---|---|---|
| 55 | Schedule › **Social posts** → press **Designs** | the **Social posts** pill stays **lit**, and looks exactly as it does on Make a post |
| 56 | **⌘⌥R** on `?tab=schedule&section=designs` | still lit after a reload |
| 57 | Open an old `?section=places` bookmark | lands on **Designs** with **Social posts** lit |
| 58 | Press **Events**, then **Social posts**, then **Designs** | the lit pill follows, and only ever one is lit |
