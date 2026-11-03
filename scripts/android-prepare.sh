#!/usr/bin/env bash
# Generates the native Android project (Capacitor), applies branding and versioning.
#
# Usage:  scripts/android-prepare.sh <versionName> <versionCode>
# Needs:  a built web bundle in dist/ (run `VITE_BASE=/ npm run build` first) and `npm ci` done.
set -euo pipefail

VERSION_NAME="${1:?usage: android-prepare.sh <versionName> <versionCode>}"
VERSION_CODE="${2:?usage: android-prepare.sh <versionName> <versionCode>}"

if [ ! -f dist/index.html ]; then
  echo "dist/index.html not found - build the web bundle first (VITE_BASE=/ npm run build)" >&2
  exit 1
fi
case "$VERSION_CODE" in ''|*[!0-9]*) echo "versionCode must be an integer, got '$VERSION_CODE'" >&2; exit 1;; esac

[ -d android ] || npx cap add android
npx cap sync android

RES=android/app/src/main/res

# Launcher icons (legacy, round and adaptive foreground) + adaptive-icon background colour
for d in android-res/mipmap-*; do
  name=$(basename "$d")
  mkdir -p "$RES/$name"
  cp "$d"/*.png "$RES/$name/"
done
cp android-res/values/ic_launcher_background.xml "$RES/values/ic_launcher_background.xml"

MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle

# The app is offline-first, but optional online features (AI, sync, e-mail) need network access.
if ! grep -q 'android.permission.INTERNET' "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.INTERNET" />\n    <application#' "$MANIFEST"
fi

# System bars: match the dark app instead of the default white status/navigation bars.
STYLES="$RES/values/styles.xml"
if [ -f "$STYLES" ] && ! grep -q 'android:statusBarColor' "$STYLES"; then
  python3 - "$STYLES" <<'PY'
import re, sys
path = sys.argv[1]
xml = open(path, encoding="utf-8").read()
items = (
    '        <item name="android:statusBarColor">#0A0A10</item>\n'
    '        <item name="android:navigationBarColor">#0A0A10</item>\n'
    '        <item name="android:windowLightStatusBar">false</item>\n'
    '        <item name="android:windowLightNavigationBar">false</item>\n'
)
pattern = re.compile(r'(<style name="AppTheme\.NoActionBar"[^>]*>)(.*?)(</style>)', re.S)
if not pattern.search(xml):
    sys.exit("AppTheme.NoActionBar not found in styles.xml")
open(path, "w", encoding="utf-8").write(pattern.sub(lambda m: m.group(1) + m.group(2) + items + "    " + m.group(3), xml, count=1))
PY
fi

# Version
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE"
grep -q "versionCode ${VERSION_CODE}" "$GRADLE" || { echo "failed to set versionCode in $GRADLE" >&2; exit 1; }
grep -q "versionName \"${VERSION_NAME}\"" "$GRADLE" || { echo "failed to set versionName in $GRADLE" >&2; exit 1; }

echo "Prepared Android project: ${VERSION_NAME} (${VERSION_CODE})"
