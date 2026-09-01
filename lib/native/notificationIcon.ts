// ── THE STATUS-BAR NOTIFICATION ICON, NAMED ONCE. ────────────────────────────────────────────────────
// 🔴 THIS FILE EXISTS BECAUSE THE VALUE WAS A LITERAL IN FOUR PLACES AND THREE OF THEM DRIFTED.
// `capacitor.config.ts` was corrected from the scaffold's 'ic_stat_icon_config_sample' to the real asset,
// and the two hardcoded 'ic_launcher' literals in lib/native/notifications.ts were missed in that pass —
// which is exactly what a string repeated in four files produces. There is now one definition and four
// references to it, so a fifth cannot be added by copying a literal that is no longer written anywhere.
//
// ⚠️ IT IS AN ANDROID RESOURCE NAME, NOT A FILENAME AND NOT A PATH. The plugin resolves it with
// `Resources.getIdentifier(name, "drawable", packageName)` (LocalNotification.java:337 →
// AssetUtil.getResourceID), so it must match a resource in `res/drawable-*` with NO extension.
// The asset is android/app/src/main/res/drawable-{m,h,x,xx,xxx}hdpi/ic_stat_hatchgrab.png, present at all
// five densities, and it is confirmed in the built APK's resource table as `drawable/ic_stat_hatchgrab`.
//
// ⚠️ WHY NOT `ic_launcher`. Android reads ONLY the alpha channel of a status-bar icon and tints it with
// `iconColor`. A full-colour launcher icon is opaque across its whole square, so it flattens to a SOLID
// WHITE SQUARE. `ic_stat_hatchgrab` is a flat white-on-transparent silhouette, which is the shape the
// platform actually wants. (`ic_launcher` also lives in `mipmap/`, not `drawable/`, so the literal never
// resolved at all — see docs/android-notification-fixes-report.md. It was misleading rather than live,
// and it would have become live the moment anything added a `drawable/ic_launcher`.)
//
// ⚠️ ANDROID ONLY. The iOS plugin has no `smallIcon` concept — `grep -rn "smallIcon"
// node_modules/@capacitor/local-notifications/ios/` returns nothing — so passing this on iOS is inert,
// which is why it is passed unconditionally rather than behind a platform test.
//
// ⚠️ NO IMPORTS IN THIS FILE, DELIBERATELY. `capacitor.config.ts` is loaded by @capacitor/cli, not by
// Next, so it cannot use the `@/…` path alias and must not pull in a module that imports
// `@capacitor/core`. Keeping this file dependency-free is what lets the config reference it directly.
export const NOTIFICATION_SMALL_ICON = 'ic_stat_hatchgrab'
