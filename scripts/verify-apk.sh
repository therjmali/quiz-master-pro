#!/usr/bin/env bash
# Static verification of a built APK. Fails (non-zero) on any problem.
#
# Usage:  scripts/verify-apk.sh <file.apk> <expectedVersionName> <expectedVersionCode> [packageId]
# Needs:  Android build-tools on PATH or under $ANDROID_HOME (aapt2, apksigner), unzip.
set -euo pipefail

APK="${1:?apk path}"; WANT_NAME="${2:?versionName}"; WANT_CODE="${3:?versionCode}"
WANT_PKG="${4:-com.rjmali.quizmaster}"

BT=""
if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/build-tools" ]; then
  BT="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
fi
tool() { if command -v "$1" >/dev/null 2>&1; then command -v "$1"; elif [ -n "$BT" ] && [ -x "$BT/$1" ]; then echo "$BT/$1"; else echo "missing tool: $1" >&2; exit 1; fi; }
AAPT2="$(tool aapt2)"; APKSIGNER="$(tool apksigner)"

FAIL=0
ok()   { printf '  PASS  %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=1; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "Verifying $APK"
BADGING="$("$AAPT2" dump badging "$APK")"
LIST="$(unzip -Z1 "$APK")"

check "package id is $WANT_PKG"        "grep -q \"package: name='$WANT_PKG'\" <<<\"\$BADGING\""
check "versionName is $WANT_NAME"      "grep -q \"versionName='$WANT_NAME'\" <<<\"\$BADGING\""
check "versionCode is $WANT_CODE"      "grep -q \"versionCode='$WANT_CODE'\" <<<\"\$BADGING\""
check "launchable activity declared"   "grep -q 'launchable-activity' <<<\"\$BADGING\""
check "app label is R.J QUIZ"          "grep -q \"application-label:'R.J QUIZ'\" <<<\"\$BADGING\""
check "classes.dex present"            "grep -q '^classes.*\\.dex$' <<<\"\$LIST\""
check "bundled web app: index.html"    "grep -qx 'assets/public/index.html' <<<\"\$LIST\""
check "bundled web app: manifest"      "grep -qx 'assets/public/manifest.webmanifest' <<<\"\$LIST\""
check "bundled web app: offline sw.js" "grep -qx 'assets/public/sw.js' <<<\"\$LIST\""
check "bundled fonts (>= 8 woff2)"     "[ \"\$(grep -c '^assets/public/assets/.*\\.woff2$' <<<\"\$LIST\")\" -ge 8 ]"
check "launcher icons present"         "grep -q '^res/mipmap-.*ic_launcher.*\\.png$' <<<\"\$LIST\""
check "capacitor config bundled"       "grep -qx 'assets/capacitor.config.json' <<<\"\$LIST\""

# The bundled page must not depend on any remote script or stylesheet.
INDEX="$(unzip -p "$APK" assets/public/index.html)"
REMOTE="$(grep -oE '<(script|link)[^>]+(src|href)="https?://[^"]+"' <<<"$INDEX" || true)"
if [ -z "$REMOTE" ]; then ok "index.html has no remote script/style dependencies"; else bad "index.html references remote resources: $REMOTE"; fi

# Signature (v2+) must verify.
if "$APKSIGNER" verify --min-sdk-version 24 "$APK" >/dev/null 2>&1; then ok "APK signature verifies"; else bad "APK signature does not verify"; fi

SIZE=$(stat -c%s "$APK")
echo "  INFO  size $(( SIZE / 1024 )) KiB, $(grep -c . <<<"$LIST") entries"
echo "$BADGING" | grep -E "^(sdkVersion|targetSdkVersion|uses-permission)" | sed 's/^/  INFO  /'

if [ "$FAIL" -ne 0 ]; then echo "APK verification FAILED"; exit 1; fi
echo "APK verification passed"
