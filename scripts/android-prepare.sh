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
# Values: background and widget strings
mkdir -p "$RES/values"
cp android-res/values/*.xml "$RES/values/"

# Drawables (shapes) + widget layouts + AppWidget XML
mkdir -p "$RES/drawable" "$RES/layout" "$RES/xml"
if [ -d android-res/drawable ]; then
  cp android-res/drawable/*.xml "$RES/drawable/"
fi
if [ -d android-res/layout ]; then
  cp android-res/layout/*.xml "$RES/layout/"
fi
if [ -d android-res/xml ]; then
  cp android-res/xml/*.xml "$RES/xml/"
fi

# Native code: MainActivity registers QmNative + AppWidget providers
APP_ID=$(sed -n "s/.*appId: *'\([^']*\)'.*/\1/p" capacitor.config.ts | head -1)
JAVA_DIR="android/app/src/main/java/$(echo "$APP_ID" | tr . /)"
mkdir -p "$JAVA_DIR"
cp android-res/java/*.java "$JAVA_DIR/"

MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle

# Full sensor orientation: phone + tablet, portrait + landscape.
# The web layer handles dynamic re-layout via CSS (dvh/dvw, flexbox, orientation media
# queries) — no app restart or state loss on rotation.  screenOrientation="any" allows
# the device to rotate freely; CSS @media (orientation: landscape) handles the layout.
if grep -q 'android:screenOrientation' "$MANIFEST"; then
  sed -i 's#android:screenOrientation="[^"]*"#android:screenOrientation="any"#' "$MANIFEST"
else
  sed -i '/<activity /a\        android:screenOrientation="any"' "$MANIFEST"
fi

# Handle configuration changes at the native level so the WebView does NOT reload on
# rotation / screen-size change.  This preserves quiz state (current question, answers,
# timer, zoom level) across orientation switches on tablets and phones.
if grep -q 'android:configChanges' "$MANIFEST"; then
  sed -i 's#android:configChanges="[^"]*"#android:configChanges="orientation|screenSize|smallestScreenSize|keyboard|keyboardHidden|locale"#g' "$MANIFEST"
else
  sed -i '/<activity /a\        android:configChanges="orientation|screenSize|smallestScreenSize|keyboard|keyboardHidden|locale"' "$MANIFEST"
fi

# The app is offline-first, but optional online features (AI, sync, e-mail) need network access.
if ! grep -q 'android.permission.INTERNET' "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.INTERNET" />\n    <application#' "$MANIFEST"
fi

# Android Home Screen AppWidgets
if ! grep -q "StudyWidgetProvider" "$MANIFEST"; then
  sed -i 's#</application>#    <receiver android:name=".StudyWidgetProvider" android:exported="true">\n        <intent-filter>\n            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n        </intent-filter>\n        <meta-data android:name="android.appwidget.provider" android:resource="@xml/rj_study_widget_info" />\n    </receiver>\n    <receiver android:name=".FocusWidgetProvider" android:exported="true">\n        <intent-filter>\n            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n        </intent-filter>\n        <meta-data android:name="android.appwidget.provider" android:resource="@xml/rj_focus_widget_info" />\n    </receiver>\n    <receiver android:name=".SubjectWidgetProvider" android:exported="true">\n        <intent-filter>\n            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n        </intent-filter>\n        <meta-data android:name="android.appwidget.provider" android:resource="@xml/rj_subject_widget_info" />\n    </receiver>\n    <receiver android:name=".ExamWidgetProvider" android:exported="true">\n        <intent-filter>\n            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n        </intent-filter>\n        <meta-data android:name="android.appwidget.provider" android:resource="@xml/rj_exam_widget_info" />\n    </receiver>\n    </application>#' "$MANIFEST"
fi

# Version
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE"
grep -q "versionCode ${VERSION_CODE}" "$GRADLE" || { echo "failed to set versionCode in $GRADLE" >&2; exit 1; }
grep -q "versionName \"${VERSION_NAME}\"" "$GRADLE" || { echo "failed to set versionName in $GRADLE" >&2; exit 1; }

echo "Prepared Android project: ${VERSION_NAME} (${VERSION_CODE})"
