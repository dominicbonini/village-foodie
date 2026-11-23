# languages-switch-5: store listings say "50+ languages", Catalan goes live, and Play-only listings get their own folder

**Date:** 23 November 2026 · **Asked by:** Dominic. He answered A from docs/languages-switch-4-report.md §2, with one change:
"in every listing (new and existing) say "50+ languages" instead of a number, so it stays true as languages are added; update the
count rule to match. Put Play-only listings in their own folder as you proposed. Don't run the upload".

**Commits:**
- 389e2979: the listings, the rules, the harness and the handover sources.
- A second commit: this report and the languages-world-3 Open item.
- Both are local only. Nothing was pushed, deployed or uploaded.

**What was not touched:**
- No database row was changed. One read-only query counted `faq_translations` per locale (§3).
- No `.env*` file was opened.
- Pizzeria Gusto and Le Roi du Churrasco were not touched.

## Summary

- **Every listing now says "50+ languages", never an exact count.** That is 58 listings (30 live, 21 staged, 7 Play-only) and
  their 54 English back-translations; the 4 English listings have none.
  - `scripts/ios/listing-rules.cjs` now asks for 50+ and refuses an exact count.
- **Catalan is the 30th App Store listing:** `data/store-listing/ca.json`, moved from `next/ca-AD.json`.
- **The seven Google-Play-only listings are in `data/store-listing/play/`:** Albanian, Macedonian, Sinhala, Swahili, Khmer, Lao
  and Amharic.
  - push-listing does not read that folder. A README there says how to set each one in Play Console.
- **Checks:**
  - listing-rules: 37/37 (30 live + 7 Play). The staged files show only the expected "appStoreLocale missing".
  - ios-intl-1: 17/17.
  - printing-copy: holds.
  - The harness screen passes.
- 🔴 **Before you push, two blockers.** push-listing checks every listing's support, privacy and marketing URLs, and sends nothing
  if any one fails:
  - **Catalan, new with this change:** `/ad/faq` answers 404. The cause is in the FAQ, not the listing.
  - **Mexican Spanish, there before this work:** `/mx/faq` and `/mx` redirect to `/uk`, because Mexico is switched off ("Mexico
    off", 12 Nov). push-listing does not follow redirects.
  - Workaround: push with `--only` and the other 28 locales (§3).

## 0 · Flags on your message

- Nothing arrived garbled, and no instruction contradicted another.
- **Where "50+" reads badly, I used the language's own "more than 50":** Japanese 50以上, Chinese 超過 50, Korean 50개 이상,
  Arabic أكثر من 50, Hebrew יותר מ־50 and Urdu 50 سے زائد.
  - The reason: in Arabic, Hebrew and Urdu, right-to-left text would turn "50+" around as "+50". In Japanese, Chinese and Korean,
    the "more than" form is the natural one.
  - All other 52 listings say "50+". The rule accepts these seven exact forms and nothing looser.
- **One more "29 languages" outside the listings, which I left alone:**
  - `scripts/ios/review-notes-1.1.txt` line 9 says "The app in 29 languages." These are the App Review notes, not a listing.
  - Build 4 ships 60 languages. Tell me if you want it changed to "50+" too.

## 1 · "50+ languages" in every listing

### What changed

Only the first line of whatsNew changed, in every listing file:
- `data/store-listing/*.json` (30)
- `data/store-listing/next/*.json` (21)
- `data/store-listing/play/*.json` (7)

The English back-translation's first line changed to match:
- `docs/i18n/back-store-listing/…` ("HatchGrab now speaks 50+ languages." or "… more than 50 languages.").

No other field changed. A few examples:

| File | Before | After |
|---|---|---|
| en-GB.json | HatchGrab now speaks 29 languages. | HatchGrab now speaks 50+ languages. |
| de-DE.json | HatchGrab spricht jetzt 29 Sprachen. | HatchGrab spricht jetzt 50+ Sprachen. |
| ja.json | HatchGrabが29の言語に対応しました。 | HatchGrabが50以上の言語に対応しました。 |
| ar-SA.json | يدعم HatchGrab الآن 29 لغة. | يدعم HatchGrab الآن أكثر من 50 لغة. |
| next/he.json | HatchGrab זמינה עכשיו ב־37 שפות. | HatchGrab זמינה עכשיו ביותר מ־50 שפות. |
| play/km-KH.json | ឥឡូវនេះ HatchGrab មាន 60 ភាសា។ | ឥឡូវនេះ HatchGrab មាន 50+ ភាសា។ |
| next/ur-PK.json | HatchGrab اب 60 زبانوں میں دستیاب ہے۔ | HatchGrab اب 50 سے زائد زبانوں میں دستیاب ہے۔ |

The wording around the number is unchanged in each language. Where a classifier followed the number, it was dropped:
- Bengali 60টি → 50+.
- Sinhala භාෂා 60ක් → භාෂා 50+.

Both still read "50+ languages", but they need a native check like the rest.

### The rule (`scripts/ios/listing-rules.cjs`)

It used to say `/\b29\b|２９/` → "whatsNew should say 29 languages". It now runs two checks:
- **"whatsNew should say 50+ languages":** the text must contain "50+" (not preceded by another digit) or one of the six "more
  than 50" forms above.
- **"whatsNew still names an exact language count":** the text is refused if it still has 29, 37 or 60.

Tested both ways: every file passes, and an en-GB copy with "29" put back fails both checks.

### The handover

- **`docs/languages-world-2/handover/listing/src/{c,d,e}.cjs`:** the sources of the 21 staged and Play listings now say the same
  thing, so a rebuild does not bring "60" back. `build-check.cjs` now rebuilds all 21 byte-equal to the placed files and their
  back-translations.
- **`build-check.cjs`:** it drops its own "lacks 60" check and the accepted "29" note; listing-rules covers the count.
- **The staging README** (`data/store-listing/next/README.md`): it says what moved and drops the old "37" / "60" notes.

## 2 · Catalan live, Play-only listings in their own folder

### Catalan

- `next/ca-AD.json` → `data/store-listing/ca.json`, and the back-translation → `docs/i18n/back-store-listing/ca.json` (git mv).
  It is named by App Store locale, like the other 29.
- `$about` now says it is live and that its Google Play twin is set by hand.
- `scripts/ios-intl-1.cjs` §2: `LOCALES` + `'ca'`, so "one listing per App Store locale (30)" (re-pin note added).

### The Play-only folder: `data/store-listing/play/`

- **The seven listings:** sq-AL, mk-MK, si-LK, sw-TZ, km-KH, lo-LA and am-ET. Each has `appStoreLocale: null` and its
  `playLocale`.
- **Back-translations** are in `docs/i18n/back-store-listing/play/`.
- **`play/README.md`** gives each file's Play locale and country, and how to set it in Play Console. There is no Play upload
  script.

### The rules for play/

- **listing-rules:** a file in `play/` needs a `playLocale` instead of an `appStoreLocale`, and is refused if it has one.
- **The command line:** the default run now checks `play/` as well (37 files).
- **push-listing.cjs is unchanged.** It reads only `.json` files directly in `data/store-listing/`, so `play/` and `next/` never
  reach App Store Connect.
- **ios-intl-1:** a new check says the Play-only listings pass the same rules, each with a `playLocale` and an English
  back-translation (7). ios-intl-1 is 17/17.

### Still staged in next/

These are for countries not switched on to that language: hi-IN, bn-BD, ur-PK, ne-NP, ta-LK, mn-MN and fil-PH, plus the
languages-world-1/2 files.

Some of those are for countries that are already on their own language, so they could move up too. That's your call, not done:
- **Play-only:** kk-KZ, az-AZ, ka-GE, hy-AM.
- **App Store:** uk-UA (`uk`) and ru-KZ (`ru`).

## 3 · 🔴 Before the push: two listings whose pages do not answer 200

push-listing checks each listing's three URLs before it sends anything:
- support: `/<countrySegment>/faq`;
- marketing: `/<countrySegment>`;
- privacy: `/<countrySegment>/privacy`.

The check uses `https.get`, which does not follow redirects, so anything but 200 fails. I checked every live listing's FAQ URL on
23 Nov, and all answer 200 except these two:

| Listing | URL | Status | Why |
|---|---|---|---|
| ca.json (new) | /ad/faq | **404** (/ad and /ad/privacy: 200) | the FAQ, below |
| es-MX.json (there before) | /mx/faq, /mx | **302 → /uk/faq, /uk** (/mx/privacy 307) | Mexico is switched off (`enabled false`, "world-countries-5 switch-on (Mexico off)", 12 Nov) |

So `node scripts/ios/push-listing.cjs 1.1` would print 🔴 lines for `ca` and `es-MX`, then "nothing sent". The es-MX line was
there before this change.

**Why /ad/faq is 404 (outside this work):**
- `app/(public)/[country]/faq/page.tsx` answers 404 when "a country's FAQ shows nothing".
- /al, /mk, /ba, /lk and /tz/faq also answer 404. /it, /de, /fr, /es, /ua, /kz and /kh/faq answer 200.
- A read-only count of `public.faq_translations` gives:
  - ca-AD, sq-AL, mk-MK, bs-BA, si-LK, sw-TZ: **14 rows each**;
  - it-IT and uk-UA: 29;
  - km-KH: none (and /kh/faq shows a page).
- So those six locales seem to have a partial FAQ translation that shows nothing. That belongs to the FAQ translator
  (plans-everywhere-4, another session), so I did not change the site or the data.

**Your options:**
1. **Push with `--only` and the other 28 App Store locales:**
   `--only en-GB,en-US,en-AU,en-CA,fr-FR,de-DE,es-ES,it,pt-PT,pt-BR,nl-NL,sv,da,no,pl,cs,hu,sk,ro,hr,sl-SI,fi,el,ja,zh-Hant,th,ar-SA,ms`
   (no `ca`, no `es-MX`). The URL check then skips those two. The rules check still runs on all 30, and they pass.
2. **Fix the FAQ for the six locales first** (the FAQ translator's work), so Catalan goes too. Mexico stays out while it is off.
3. **Move `ca.json` back to `next/`** until `/ad/faq` answers 200. You'd still need `--only` for es-MX.

## 4 · Checks run

| Check | Result |
|---|---|
| `node scripts/ios/listing-rules.cjs` (30 live + 7 Play) | 37 ✓, 0 🔴 |
| `node scripts/ios/listing-rules.cjs data/store-listing/next/*.json` (each) | only "appStoreLocale missing" for Play-only staged languages (accepted, as before) |
| A negative test: en-GB with "29" put back | refused: "should say 50+ languages" and "still names an exact language count" |
| `node scripts/ios-intl-1.cjs` | 17/17 |
| `node scripts/printing-copy.cjs` | copy rules hold |
| `node docs/languages-world-2/handover/listing/build-check.cjs` | 21 ok; the rebuild is byte-equal to the 21 placed files and back-translations (the rebuilt copies were then removed) |
| `node scripts/run-harnesses.cjs --dry-run` | the screen passes (nothing executed) |

## 5 · Open items (docs/languages-world-3-report.md)

- **Item 5 (store listings):** now done, with the `/ad/faq` caveat (§3).
- **Item 2:** the five unused languages' Terms, still open.
- **Item 3:** native checks, still open.

## Undo (only if Dominic asks)

There is no database change to undo. For the files, `git revert 389e2979` brings back the old counts, `ca-AD.json` in `next/`, the
seven Play-only files in `next/` and the "29" rule.
