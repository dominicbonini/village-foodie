#!/bin/bash
# scripts/android/emulator-checks.sh — android-1-1 / disk-cleanup-1 (15 November 2026): the Android app's emulator
# checks, ONE TEMPORARY DEVICE AT A TIME, deleted straight after.
#
#   HG_APKS=<folder> HG_OUT=docs/<workstream> scripts/android/emulator-checks.sh <tag> <system-image> <device> <phone|tablet>
#   e.g. … emulator-checks.sh a14-phone "system-images;android-34;google_apis;arm64-v8a" pixel_7 phone
#
# DISK RULES (docs/reference-manual.md, "Disk space"):
#   • refuses to start below 40 GB free, and is stopped (cleanly: emulator killed, AVD deleted) below 20 GB — the
#     thresholds are scripts/_disk-guard.cjs's;
#   • one emulator at a time: refuses while another run holds the lock or any emulator is attached;
#   • the AVD (hg-<tag>) is created here with a 4 GB data partition, booted with no snapshots, and DELETED on exit
#     however the run ends;
#   • a system image this run had to download is uninstalled afterwards (HG_KEEP_IMAGE=1 keeps it).
#
# THE CHECKS (each stage runs only if its APK is in HG_APKS — minified, signed RELEASE builds, made by hand with a
# temporary CAP_SERVER_URL sync; the committed config is production and is restored after):
#   A-local-app.apk         /app → login; home → background; foreground again
#   B-local-dash.apk        the test truck's dashboard link (?tab=settings): dashboard, FLAG_KEEP_SCREEN_ON, the printing
#                           card's words (no raw printing.* keys), Carte & stock, back ×3 never leaves / never the landing
#                           page, three-button navigation + Add order, dark mode, tablet landscape and back
#   D-local-www-signup.apk  server http://www.hatchgrab.127.0.0.1.nip.io:3000/signup (a www host on this Mac via adb
#                           reverse): Terms → the in-app guard sends it to the bare host → the phone's browser
# Screenshots: $HG_OUT/<tag>-*.png, overwritten on every run (same names). Log: $HG_OUT/../ or HG_LOGS/run-<tag>.log.
set -u
TAG=${1:?tag}; IMAGE=${2:?system image}; DEVICE=${3:?device profile}; KIND=${4:?phone|tablet}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
SDK=${ANDROID_HOME:-$HOME/Library/Android/sdk}; export ANDROID_HOME=$SDK ANDROID_SDK_ROOT=$SDK
ADB=$SDK/platform-tools/adb; AM=$SDK/cmdline-tools/latest/bin/avdmanager; SM=$SDK/cmdline-tools/latest/bin/sdkmanager
APKS=${HG_APKS:?HG_APKS=<folder with the APKs>}; OUT=${HG_OUT:?HG_OUT=<screenshot folder>}
LOGS=${HG_LOGS:-${TMPDIR:-/tmp}}; LOG=$LOGS/run-$TAG.log; AVD=hg-$TAG
LOCK=${TMPDIR:-/tmp}/hg-emulator.lock
mkdir -p "$OUT" "$LOGS"; : > "$LOG"
say(){ echo "$*" | tee -a "$LOG"; }

# ── guards before anything is written ──────────────────────────────────────────────────────────────────────────────
node "$REPO/scripts/_disk-guard.cjs" check "emulator $TAG" 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" = 0 ] || exit 3
mkdir "$LOCK" 2>/dev/null || { say "🔴 another emulator run holds $LOCK — one device at a time"; exit 5; }
if $ADB devices 2>/dev/null | grep -q '^emulator-'; then rmdir "$LOCK"; say "🔴 an emulator is already running — one device at a time"; exit 5; fi

EMU=""; WATCH=""; INSTALLED_IMAGE=""
cleanup(){
  trap - EXIT TERM INT
  [ -n "$EMU" ] && { $ADB emu kill >/dev/null 2>&1; sleep 3; kill "$EMU" 2>/dev/null; }
  $AM delete avd -n "$AVD" >/dev/null 2>&1 && say "  AVD $AVD deleted"
  if [ -n "$INSTALLED_IMAGE" ] && [ -z "${HG_KEEP_IMAGE:-}" ]; then
    $SM --uninstall "$IMAGE" >/dev/null 2>&1; d="$SDK/$(echo "$IMAGE" | tr ';' '/')"; rm -rf "$d"; rmdir "$(dirname "$d")" "$(dirname "$(dirname "$d")")" 2>/dev/null
    say "  image $IMAGE uninstalled (downloaded by this run)"
  fi
  [ -n "$WATCH" ] && kill "$WATCH" 2>/dev/null
  rmdir "$LOCK" 2>/dev/null
}
trap cleanup EXIT
trap 'say "  stopped (signal) — cleaning up"; cleanup; exit 4' TERM INT
node "$REPO/scripts/_disk-guard.cjs" watch $$ "emulator $TAG" >>"$LOG" 2>&1 &
WATCH=$!

# ── the device ─────────────────────────────────────────────────────────────────────────────────────────────────────
if [ ! -f "$SDK/$(echo "$IMAGE" | tr ';' '/')/system.img" ]; then
  say "  installing $IMAGE (removed again after the run)"; yes | $SM "$IMAGE" >/dev/null 2>&1 || { say "🔴 could not install $IMAGE"; exit 6; }
  INSTALLED_IMAGE=1
fi
echo no | $AM create avd -n "$AVD" -k "$IMAGE" -d "$DEVICE" >/dev/null 2>&1 || { say "🔴 could not create $AVD"; exit 6; }
$SDK/emulator/emulator -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot -partition-size 4096 \
  -gpu swiftshader_indirect > "$LOGS/emu-$TAG.log" 2>&1 &
EMU=$!

shot(){ $ADB exec-out screencap -p > "$OUT/$TAG-$1.png"; say "  shot $TAG-$1.png"; }
ui(){ $ADB shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; $ADB shell cat /sdcard/ui.xml 2>/dev/null; }
centre(){ grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1 | sed -E 's/bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"/\1 \2 \3 \4/' | awk '{print int(($1+$3)/2), int(($2+$4)/2), $2, $4}'; }
find(){ ui | tr '>' '\n' | grep -E "(text|content-desc)=\"[^\"]*$1" | centre; }        # first node containing $1
findexact(){ ui | tr '>' '\n' | grep -E "(text|content-desc)=\"$1\"" | centre; }      # a node that IS $1 (a link)
has(){ ui | grep -qi "$1"; }
top(){ $ADB shell dumpsys activity activities 2>/dev/null | grep -E "topResumedActivity|mResumedActivity" | head -1 | sed 's/^ *//'; }
waitfor(){ for i in $(seq 1 "$2"); do has "$1" && return 0; sleep 1; done; return 1; }
dismiss_notif(){ for i in 1 2 3 4 5 6 7 8; do local p; p=$(find "Don.t allow"); if [ -n "$p" ]; then set -- $p; $ADB shell input tap $1 $2; say "  notification prompt: Don't allow"; sleep 1; return; fi; sleep 1; done; }
# The notification prompt, answered once and for all as "Don't allow" (USER_FIXED): it otherwise comes back after a
# configuration change (dark mode) and covers the page. Nothing is registered against the test truck either way.
deny_notif(){ $ADB shell pm revoke com.hatchgrab.app android.permission.POST_NOTIFICATIONS >/dev/null 2>&1; $ADB shell pm set-permission-flags com.hatchgrab.app android.permission.POST_NOTIFICATIONS user-set user-fixed >/dev/null 2>&1; }
check(){ if [ "${2:-}" = ok ]; then say "  ✓ $1"; else say "  ✗ $1 ${3:-}"; fi; }
ok_if(){ [ "$1" = 0 ] && echo ok; }
screen_h(){ $ADB shell wm size | grep -oE "[0-9]+x[0-9]+" | tail -1 | cut -dx -f2; }
screen_w(){ $ADB shell wm size | grep -oE "[0-9]+x[0-9]+" | tail -1 | cut -dx -f1; }

say "== $TAG ($IMAGE, $DEVICE, $KIND) — free $(node "$REPO/scripts/_disk-guard.cjs" free)"
for i in $(seq 1 90); do $ADB get-state 2>/dev/null | grep -q device && break; kill -0 $EMU 2>/dev/null || { say "  ✗ emulator did not start: $(grep -m1 -E 'FATAL|ERROR' "$LOGS/emu-$TAG.log")"; exit 1; }; sleep 2; done
for i in $(seq 1 240); do [ "$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break; sleep 2; done
say "  booted: Android $($ADB shell getprop ro.build.version.release | tr -d '\r') (API $($ADB shell getprop ro.build.version.sdk | tr -d '\r')), WebView $($ADB shell dumpsys package com.google.android.webview 2>/dev/null | grep -m1 versionName | tr -d ' \r')"
for k in window_animation_scale transition_animation_scale animator_duration_scale; do $ADB shell settings put global $k 0; done
$ADB shell input keyevent KEYCODE_WAKEUP; $ADB shell wm dismiss-keyguard 2>/dev/null; $ADB shell svc power stayon true
$ADB reverse tcp:3000 tcp:3000 >/dev/null

# ── A: cold launch → /app → login ──────────────────────────────────────────────────────────────────────────────────
if [ -f "$APKS/A-local-app.apk" ]; then
  $ADB install -r "$APKS/A-local-app.apk" >/dev/null 2>&1 && say "  installed A (minified release, localhost /app)"; deny_notif
  $ADB shell am start -W -n com.hatchgrab.app/.MainActivity >/dev/null 2>&1
  dismiss_notif
  waitfor "Log in to your kitchen" 90; check "cold launch → /app → login" "$(ok_if $?)" "$(top)"
  shot cold-launch-login
  $ADB shell input keyevent KEYCODE_HOME; sleep 3
  case "$(top)" in *com.hatchgrab.app*) check "home sends the app to the background" no "$(top)";; *) check "home sends the app to the background" ok;; esac
  $ADB shell am start -n com.hatchgrab.app/.MainActivity >/dev/null 2>&1; sleep 3
  waitfor "Log in to your kitchen" 20; r=$?; check "foreground again: the page is intact" "$(ok_if $r)" "$(top)"
  [ $r = 0 ] || say "  app process: $($ADB shell pidof com.hatchgrab.app | tr -d '\r' || true) (empty = not running)"
  shot foreground-again
fi

# ── B: the test truck's dashboard ──────────────────────────────────────────────────────────────────────────────────
if [ -f "$APKS/B-local-dash.apk" ]; then
  $ADB install -r "$APKS/B-local-dash.apk" >/dev/null 2>&1 && say "  installed B (minified release, localhost dashboard)"; deny_notif
  $ADB shell am force-stop com.hatchgrab.app; $ADB shell am start -W -n com.hatchgrab.app/.MainActivity >/dev/null 2>&1
  dismiss_notif
  waitfor "Pizza Kitchen" 120; check "dashboard loads (Pizza Kitchen)" "$(ok_if $?)"
  waitfor "Auto-accept orders" 30; dismiss_notif
  shot dashboard-settings
  kso=$($ADB shell dumpsys window windows 2>/dev/null | grep -A3 "com.hatchgrab.app/com.hatchgrab.app.MainActivity" | grep -c KEEP_SCREEN_ON)
  [ "$kso" = 0 ] && kso=$($ADB shell dumpsys window 2>/dev/null | grep -c "KEEP_SCREEN_ON")
  check "keep screen on: the window holds FLAG_KEEP_SCREEN_ON" "$([ "$kso" -gt 0 ] && echo ok)" "count=$kso"
  for i in $(seq 1 14); do p=$(find "Kitchen ticket printing"); if [ -n "$p" ]; then set -- $p; [ "$4" -lt $(( $(screen_h)*85/100 )) ] && break; fi; W=$(screen_w); $ADB shell input swipe $((W/2)) 1500 $((W/2)) 700 400; sleep 1; done
  has "Kitchen ticket printing" && has "Automatically print a kitchen ticket"; check "Paramètres: the printing card, with its words" "$(ok_if $?)"
  ui | grep -qE 'text="printing\.[a-zA-Z]' && check "no raw printing.* keys" no || check "no raw printing.* keys" ok
  shot settings-printing
  p=$(find "Menu &amp; Stock"); [ -z "$p" ] && p=$(find "Stock")
  if [ -n "$p" ]; then set -- $p; $ADB shell input tap $1 $2; sleep 3; fi
  waitfor "Buscaiola" 20 && has "Items"; check "Carte & stock opens (the items)" "$(ok_if $?)"
  shot stock
  for n in 1 2 3; do $ADB shell input keyevent KEYCODE_BACK; sleep 2; done
  case "$(top)" in *com.hatchgrab.app*) app=ok;; *) app=no;; esac
  check "back ×3 on the dashboard: the app is still in front" $app "$(top)"
  has "Pizza Kitchen"; check "…and still on the dashboard (not the landing page)" "$(ok_if $?)"
  has "Upload your menu" && check "…the landing page never appears" no || check "…the landing page never appears" ok
  shot after-back
  $ADB shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.threebutton >/dev/null 2>&1; sleep 3
  p=$(find "Add order"); if [ -n "$p" ]; then set -- $p; $ADB shell input tap $1 $2; sleep 3; fi
  shot threebutton-add-order
  $ADB shell cmd uimode night yes >/dev/null; sleep 3
  shot dark-mode
  $ADB shell cmd uimode night no >/dev/null
  $ADB shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural >/dev/null 2>&1; sleep 2
  if [ "$KIND" = tablet ]; then
    # A tablet's NATURAL orientation may be landscape (Pixel Tablet: 2560x1600), so user_rotation 0 is not "portrait":
    # the rotation for each orientation is worked out from the natural size.
    NW=$(screen_w); NH=$(screen_h); if [ "$NW" -gt "$NH" ]; then LAND=0; PORT=1; else LAND=1; PORT=0; fi
    $ADB shell settings put system accelerometer_rotation 0
    $ADB shell settings put system user_rotation $PORT; sleep 4
    has "Pizza Kitchen"; check "tablet: portrait, the dashboard there" "$(ok_if $?)"
    shot portrait
    $ADB shell settings put system user_rotation $LAND; sleep 4
    has "Pizza Kitchen"; check "tablet: rotated to landscape, the dashboard still there" "$(ok_if $?)"
    shot landscape
    $ADB shell settings put system user_rotation $PORT; sleep 4
    has "Pizza Kitchen"; check "tablet: back to portrait, the dashboard still there" "$(ok_if $?)"
    shot portrait-again
  fi
fi

# ── D: a www host → Terms → the phone's browser (the bare-domain hand-off) ─────────────────────────────────────────
if [ -f "$APKS/D-local-www-signup.apk" ]; then
  $ADB install -r "$APKS/D-local-www-signup.apk" >/dev/null 2>&1 && say "  installed D (minified release, www.hatchgrab.127.0.0.1.nip.io /signup)"; deny_notif
  $ADB shell am force-stop com.hatchgrab.app; $ADB shell am start -W -n com.hatchgrab.app/.MainActivity >/dev/null 2>&1
  dismiss_notif
  p=""; for i in $(seq 1 90); do p=$(findexact "Terms"); [ -n "$p" ] && break; sleep 1; done
  shot signup
  if [ -n "$p" ]; then set -- $p; $ADB shell input tap $1 $2; sleep 8; fi
  t=$(top); case "$t" in *com.hatchgrab.app*) br=no;; *) br=ok;; esac
  check "a customer link (Terms) opens in the phone's browser, not the app" $br "$t"
  say "  in front: $t"
  shot browser
  $ADB shell am start -n com.hatchgrab.app/.MainActivity >/dev/null 2>&1; sleep 3
  has "Terms"; check "back in the app: still on signup" "$(ok_if $?)"
fi

# Crashes: Android's crash buffer for the whole run (a native crash or an uncaught Java exception in the app).
crashes=$($ADB logcat -d -b crash 2>/dev/null | grep -c "com.hatchgrab.app")
check "no app crash in the whole run (logcat crash buffer)" "$([ "$crashes" = 0 ] && echo ok)" "$crashes crash lines"
[ "$crashes" = 0 ] || $ADB logcat -d -b crash 2>/dev/null | grep -A20 "com.hatchgrab.app" | head -40 >> "$LOG"

say "== done $TAG: $(grep -c '✓' "$LOG") passed, $(grep -c '✗' "$LOG") failed"
