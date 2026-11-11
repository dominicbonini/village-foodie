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
