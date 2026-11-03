#!/usr/bin/env bash
# Runtime smoke test on a running Android emulator/device (used in CI by android.yml).
#
#  1. installs the APK
#  2. launches it; checks the process is alive and its window is in the foreground
#  3. checks the WebView actually rendered app content (accessibility tree) and the screen is not blank
#  4. switches the device to airplane mode, force-stops and relaunches - proves a true offline cold start
#  5. keeps screenshots, UI dumps and logcat in <outDir>; failures become GitHub annotations
#
# Usage:  scripts/emulator-smoke.sh <file.apk> [packageId] [outDir]
set -uo pipefail

APK="${1:?apk path}"
PKG="${2:-com.rjmali.quizmaster}"
OUT="${3:-smoke-output}"
mkdir -p "$OUT"
FAIL=0
REPORT="$OUT/report.txt"
: > "$REPORT"

ok()   { printf 'PASS  %s\n' "$1" | tee -a "$REPORT"; }
bad()  { printf 'FAIL  %s\n' "$1" | tee -a "$REPORT"; echo "::error title=Emulator smoke test::$1"; FAIL=1; }
info() { printf 'INFO  %s\n' "$1" | tee -a "$REPORT"; }

finish() {
  # Surface the whole report (and a logcat excerpt) as annotations so it is readable without raw logs.
  local body; body=$(sed 's/%/%25/g' "$REPORT" | awk '{printf "%s%%0A", $0}')
  echo "::notice title=Smoke test report::${body}"
  if [ -s "$OUT/logcat-all.txt" ]; then
    local ex; ex=$(grep -E "$PKG|Capacitor|chromium|ActivityTaskManager|ActivityManager.*(ANR|crash)|Displayed|Force finishing" "$OUT/logcat-all.txt" | grep -v "uiautomator" | tail -30 | cut -c1-230 | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')
    echo "::notice title=Logcat (app + activity manager)::${ex}"
  fi
  local crash; crash=$(adb logcat -b crash -d 2>/dev/null | tail -30 | cut -c1-230 | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')
  [ -n "$crash" ] && echo "::notice title=Crash buffer::${crash}"
}
trap finish EXIT

adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
adb logcat -c

echo "== install"
adb install -r "$APK" 2>&1 | tee "$OUT/install.log"
if grep -q "Success" "$OUT/install.log"; then ok "APK installs"; else bad "APK install failed: $(tr '\n' ' ' < "$OUT/install.log" | cut -c1-200)"; exit 1; fi

launch() {
  local out
  out=$(adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$PKG/.MainActivity" 2>&1 | tr -d '\r' | tr '\n' ' ')
  info "am start -> ${out:0:300}"
  if grep -qiE "error|exception|not exist" <<<"$out"; then bad "activity failed to start: ${out:0:200}"; fi
}

# True only for crashes of OUR app (not of uiautomator or other processes).
app_crashed() {
  adb logcat -b crash -d 2>/dev/null | grep -A4 "FATAL EXCEPTION" | grep -q "Process: $PKG"
}

check_running() {
  local label="$1" shot="$2" ui="$3"
  sleep 25

  if [ -n "$(adb shell pidof "$PKG" | tr -d '\r')" ]; then ok "$label: process is running"; else bad "$label: process is not running"; fi

  local focus; focus=$(adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | tr -d '\r' | head -2 | tr '\n' ' ')
  info "$label: focus -> ${focus:0:200}"
  info "$label: resumed -> $(adb shell dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -2 | tr -d '\r' | tr '\n' ' ' | cut -c1-240)"
  info "$label: pid -> $(adb shell pidof "$PKG" | tr -d '\r')"
  if grep -q "$PKG" <<<"$focus"; then ok "$label: app window is in the foreground"; else bad "$label: app window is not focused"; fi

  adb exec-out screencap -p > "$shot"
  local size; size=$(stat -c%s "$shot")
  # A blank or single-colour screen compresses to a few KiB; a rendered UI is far larger.
  if [ "$size" -gt 25000 ]; then ok "$label: screen is rendered ($((size / 1024)) KiB screenshot)"; else bad "$label: screen looks blank ($size bytes)"; fi

  # The WebView must expose real web content (text / content descriptions), not just an empty shell.
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml "$ui" >/dev/null 2>&1
  local nodes; nodes=$(grep -oE '(text|content-desc)="[^"]+"' "$ui" 2>/dev/null | wc -l)
  local hasweb; hasweb=$(grep -c 'android.webkit.WebView' "$ui" 2>/dev/null || true)
  info "$label: UI dump has $nodes labelled nodes, WebView nodes: $hasweb"
  if [ "${hasweb:-0}" -ge 1 ] && [ "${nodes:-0}" -ge 3 ]; then ok "$label: WebView rendered app content ($nodes labelled nodes)"; else bad "$label: WebView shows no app content ($nodes labelled nodes)"; fi
  info "$label: sample text -> $(grep -oE '(text|content-desc)="[^"]+"' "$ui" 2>/dev/null | head -8 | tr '\n' ' ' | cut -c1-220)"
}

echo "== first launch"
launch
check_running "first launch" "$OUT/01-first-launch.png" "$OUT/01-ui.xml"
adb logcat -d > "$OUT/logcat-all.txt" || true
if app_crashed; then bad "app crashed (see logcat excerpt)"; else ok "app did not crash"; fi
if grep -qi "Loading app at https://localhost" "$OUT/logcat-all.txt"; then info "Capacitor reports serving the bundled app from https://localhost"; fi

echo "== airplane mode + cold start (offline)"
adb shell cmd connectivity airplane-mode enable >/dev/null 2>&1 || adb shell settings put global airplane_mode_on 1
sleep 4
adb shell am force-stop "$PKG"
adb logcat -c
launch
check_running "offline cold start" "$OUT/02-offline.png" "$OUT/02-ui.xml"
adb logcat -d >> "$OUT/logcat-all.txt" || true
if app_crashed; then bad "app crashed when launched offline"; else ok "app did not crash when launched offline"; fi

adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true

if [ "$FAIL" -ne 0 ]; then echo "SMOKE TEST FAILED"; exit 1; fi
echo "SMOKE TEST PASSED"
