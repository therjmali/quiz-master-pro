#!/usr/bin/env bash
# Runtime smoke test on a running Android emulator/device (used in CI by android.yml).
#
#  1. installs the APK
#  2. launches it and checks the process is alive and its window is in the foreground
#  3. checks logcat for crashes and for Capacitor serving the bundled app from https://localhost
#  4. switches the device to airplane mode, force-stops and relaunches - proves true offline start
#  5. saves screenshots and rejects a blank (single-colour) screen
#
# Usage:  scripts/emulator-smoke.sh <file.apk> [packageId] [outDir]
set -euo pipefail

APK="${1:?apk path}"
PKG="${2:-com.rjmali.quizmaster}"
OUT="${3:-smoke-output}"
mkdir -p "$OUT"
FAIL=0
ok()  { printf 'PASS  %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; FAIL=1; }

adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
adb logcat -c

echo "== install"
adb install -r "$APK" | tee "$OUT/install.log"
grep -q "Success" "$OUT/install.log" && ok "APK installs" || bad "APK install failed"

launch() { adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; }

check_running() {
  local label="$1" shot="$2"
  sleep 20
  if adb shell pidof "$PKG" >/dev/null 2>&1; then ok "$label: process is running"; else bad "$label: process is not running"; fi
  if adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | grep -q "$PKG"; then
    ok "$label: app window is in the foreground"
  else
    bad "$label: app window is not focused"
  fi
  adb exec-out screencap -p > "$shot"
  local size; size=$(stat -c%s "$shot")
  # A blank or single-colour screen compresses to a few KiB; a rendered UI is far larger.
  if [ "$size" -gt 25000 ]; then ok "$label: screen is rendered ($((size / 1024)) KiB screenshot)"; else bad "$label: screen looks blank ($size bytes)"; fi
}

echo "== first launch (online)"
launch
check_running "online launch" "$OUT/01-online.png"

adb logcat -d > "$OUT/logcat-online.txt" || true
if grep -q "FATAL EXCEPTION" "$OUT/logcat-online.txt"; then bad "crash found in logcat"; grep -A12 "FATAL EXCEPTION" "$OUT/logcat-online.txt" | head -40; else ok "no fatal exception in logcat"; fi
if grep -qiE "Loading app at https://localhost" "$OUT/logcat-online.txt"; then ok "Capacitor serves the bundled app from https://localhost"; else bad "Capacitor did not report serving the bundled app"; fi

echo "== airplane mode + cold start (offline)"
adb shell cmd connectivity airplane-mode enable || adb shell settings put global airplane_mode_on 1
sleep 3
adb shell am force-stop "$PKG"
adb logcat -c
launch
check_running "offline launch" "$OUT/02-offline.png"

adb logcat -d > "$OUT/logcat-offline.txt" || true
if grep -q "FATAL EXCEPTION" "$OUT/logcat-offline.txt"; then bad "crash found in offline logcat"; else ok "no fatal exception when launched offline"; fi

adb shell cmd connectivity airplane-mode disable || true

if [ "$FAIL" -ne 0 ]; then echo "SMOKE TEST FAILED"; exit 1; fi
echo "SMOKE TEST PASSED"
