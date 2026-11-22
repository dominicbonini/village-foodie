# Staged store listings (languages-world-1, 10 November 2026)

The App Store / Google Play listings for the eight new languages, in the same per-language format as the files one level
up (`data/store-listing/<appStoreLocale>.json`), plus `playLocale`. They are **staged here on purpose**:
`scripts/ios/push-listing.cjs` pushes every file in `data/store-listing/` and first checks that each listing's support,
privacy and marketing URLs (`/<countrySegment>/faq`, `/privacy`, `/<countrySegment>`) answer 200 — and a switched-off
country's pages redirect. Move a file up one level when its country is switched on and its pages answer.

| File | App Store locale | Google Play locale | Note |
|---|---|---|---|
| tr.json | tr | tr-TR | |
| ko.json | ko | ko-KR | |
| zh-TW.json | — | zh-TW | App Store has ONE Traditional Chinese listing (zh-Hant), today Hong Kong's words: Play only until that is decided |
| id.json | id | id | |
| vi.json | vi | vi | |
| he.json | he | iw-IL | |
| is.json | — | is-IS | App Store Connect has no Icelandic: Iceland sees the primary listing (en-GB) |
| sr.json | — | sr | App Store Connect has no Serbian: Serbia sees en-GB. Latin script |

English back-translations: `docs/i18n/back-store-listing/next/`. `whatsNew` says 37 languages, not 29 (the rules script's
"29" check applies to the live files only).

## languages-world-2 (11–12 November 2026)

Same staging, same rules (`node scripts/ios/listing-rules.cjs <file>` passes for each). Files are named by messages locale.

| File | App Store locale | Google Play locale | Note |
|---|---|---|---|
| uk-UA.json | uk | uk | |
| ru-KZ.json | ru | ru-RU | Kazakhstan's Russian; the ONE Russian listing is also what Russia's storefront would show (no Russia-only brands or money in it) |
| kk-KZ.json | — | kk | App Store Connect has no Kazakh listing language: Kazakhstan sees the Russian or primary listing |
| az-AZ.json | — | az-AZ | Play only |
| ka-GE.json | — | ka-GE | Play only; Georgian has no capitals, so section headings use ■ |
| hy-AM.json | — | hy-AM | Play only |

⚠️ `whatsNew` in these six says the app supports **60 languages** (the number planned when they were written). Correct it to the
real count before uploading.

## languages-world-3 (22 November 2026)

Same staging, same rules (`node scripts/ios/listing-rules.cjs <file>` passes for each, with only the two notes the earlier staged
files carry: "whatsNew should say 29 languages" and, for Play-only languages, "appStoreLocale missing"). Files are named by messages
locale; sources in docs/languages-world-2/handover/listing/src/ (c.cjs sq-AL, d.cjs, e.cjs). Uzbek and Bosnian have no listing
language in either store, so they have no file.

| File | App Store locale | Google Play locale | Note |
|---|---|---|---|
| sq-AL.json | — | sq | Play only |
| mk-MK.json | — | mk-MK | Play only |
| ca-AD.json | ca | ca | Andorra |
| hi-IN.json | hi | hi-IN | India stays on English for now (Dominic, 19 Nov) — stage until switched on |
| bn-BD.json | bn-BD | bn-BD |  |
| ur-PK.json | ur-PK | ur | Right to left; Latin brand words inline, no bidi controls. Pakistan stays on English for now (Dominic, 19 Nov) |
| ne-NP.json | — | ne-NP | Play only |
| si-LK.json | — | si-LK | Play only; zero-width joiners in conjunct letters are intentional |
| ta-LK.json | ta-IN | ta-IN | App Store / Play have only Tamil (India): Sri Lankan Tamil words kept neutral enough for India |
| km-KH.json | — | km-KH | Play only |
| lo-LA.json | — | lo-LA | Play only |
| mn-MN.json | — | mn-MN | Play only |
| fil-PH.json | — | fil | Play only; the Philippines has no country row yet |
| sw-TZ.json | — | sw | Play has ONE Swahili listing: Kenya and Tanzania both see it |
| am-ET.json | — | am | Play only |

`whatsNew` in these fifteen says **60 languages**, which is the real count now (60 iOS languages after am-ET). The six
languages-world-2 files above say 60 too, so that ⚠️ is now resolved — recheck the count before uploading if more languages land.
Every listing needs a native check (docs/languages-world-3-report.md, store listings section).
