# Google Play-only store listings (languages-switch-5, 23 November 2026)

These languages have a Google Play listing language but **no App Store Connect listing language**, so their files have
`appStoreLocale: null` and a `playLocale`. They live here, not in `data/store-listing/`, because `scripts/ios/push-listing.cjs`
pushes every file in that folder to App Store Connect and refuses the whole push if one has no App Store locale. It does not read
this folder.

**There is no Play upload script:** set each one by hand in Play Console (Store presence → Main store listing → add the language)
with the Android 1.1 release — name → App name, `shortDescription` → Short description, `description` → Full description; the
Play Console has no subtitle, keywords or promotional text, and What's new goes with the release (`whatsNew`).

| File | Google Play locale | Country (switched on) |
|---|---|---|
| sq-AL.json | sq | Albania (languages-switch-1) |
| mk-MK.json | mk-MK | North Macedonia (languages-switch-1) |
| si-LK.json | si-LK | Sri Lanka (languages-switch-2); zero-width joiners in conjunct letters are intentional |
| sw-TZ.json | sw | Tanzania (languages-switch-2); Play has ONE Swahili listing, so Kenya sees it too |
| km-KH.json | km-KH | Cambodia (languages-switch-4) |
| lo-LA.json | lo-LA | Laos (languages-switch-4) |
| am-ET.json | am | Ethiopia (languages-switch-4) |

The App Store listings' Google Play twins (one level up) are set by hand the same way. English back-translations:
`docs/i18n/back-store-listing/play/`. Rules: `node scripts/ios/listing-rules.cjs` checks these too (a `playLocale` instead of an
`appStoreLocale`); `scripts/ios-intl-1.cjs` §2 checks them and their back-translations. Every listing needs a native check.
