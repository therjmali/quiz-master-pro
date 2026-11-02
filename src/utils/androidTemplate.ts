import { buildZip, triggerDownload } from './zipBuilder';

const PKG  = 'com.quizmasterpro.app';
const ROOT = 'QuizMasterPro-Android';
const JAVA = `${ROOT}/app/src/main/java/com/quizmasterpro/app`;
const RES  = `${ROOT}/app/src/main/res`;

export async function downloadAndroidTemplate(): Promise<void> {
  const appUrl  = window.location.origin;
  const appName = 'Quiz Master Pro';

  const files: Record<string, string> = {
    [`${ROOT}/README.md`]:                               buildReadme(appUrl, appName),
    [`${ROOT}/.gitignore`]:                              GITIGNORE,
    [`${ROOT}/build.gradle`]:                            ROOT_BUILD_GRADLE,
    [`${ROOT}/settings.gradle`]:                         buildSettingsGradle(appName),
    [`${ROOT}/gradle.properties`]:                       GRADLE_PROPERTIES,
    [`${ROOT}/gradle/wrapper/gradle-wrapper.properties`]: WRAPPER_PROPS,

    [`${ROOT}/app/build.gradle`]:                        buildAppGradle(PKG),
    [`${ROOT}/app/proguard-rules.pro`]:                  PROGUARD,
    [`${ROOT}/app/src/main/AndroidManifest.xml`]:        buildManifest(PKG, appName),

    [`${JAVA}/MainActivity.kt`]:                         buildMainActivity(PKG, appUrl, appName),
    [`${JAVA}/SplashActivity.kt`]:                       buildSplashActivity(PKG, appName),

    [`${RES}/values/strings.xml`]:                       buildStrings(appName, appUrl),
    [`${RES}/values/colors.xml`]:                        COLORS_XML,
    [`${RES}/values/themes.xml`]:                        THEMES_XML,
    [`${RES}/drawable/ic_launcher_foreground.xml`]:      ICON_SVG,
  };

  triggerDownload(buildZip(files), 'QuizMasterPro-Android.zip');
}

// ─── Gradle ──────────────────────────────────────────────────────────────────

const ROOT_BUILD_GRADLE = `// Top-level build file
plugins {
    id 'com.android.application' version '8.3.2' apply false
    id 'org.jetbrains.kotlin.android' version '1.9.24' apply false
}`;

function buildSettingsGradle(appName: string) {
  return `pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "${appName.replace(/ /g, '')}"
include ':app'`;
}

const GRADLE_PROPERTIES = `android.useAndroidX=true
android.enableJetifier=true
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.parallel=true
kotlin.code.style=official`;

const WRAPPER_PROPS = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.6-bin.zip
networkTimeout=10000
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists`;

function buildAppGradle(pkg: string) {
  return `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace '${pkg}'
    compileSdk 34

    defaultConfig {
        applicationId "${pkg}"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
        vectorDrawables.useSupportLibrary = true
    }

    buildTypes {
        debug {
            applicationIdSuffix ".debug"
            debuggable true
        }
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = '1.8' }

    buildFeatures { viewBinding false }
}

dependencies {
    implementation 'androidx.core:core-ktx:1.13.1'
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'com.google.android.material:material:1.12.0'
    implementation 'androidx.webkit:webkit:1.11.0'
    implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'
}`;
}

// ─── AndroidManifest ─────────────────────────────────────────────────────────

function buildManifest(pkg: string, appName: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.QuizMasterPro">

        <!-- Splash Screen -->
        <activity
            android:name=".SplashActivity"
            android:exported="true"
            android:theme="@style/Theme.QuizMasterPro.Splash"
            android:noHistory="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Main WebView Activity -->
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden|uiMode"
            android:exported="false"
            android:windowSoftInputMode="adjustResize"
            android:label="@string/app_name" />

    </application>

</manifest>`;
}

// ─── Kotlin Source ────────────────────────────────────────────────────────────

function buildMainActivity(pkg: string, appUrl: string, appName: string) {
  return `package ${pkg}

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loadingBar: ProgressBar

    companion object {
        // ✏️  Update this URL if you move your app to a different host
        const val APP_URL = "${appUrl}"
        const val APP_NAME = "${appName}"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge immersive display
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor     = Color.TRANSPARENT
        window.navigationBarColor = Color.parseColor("#0F0F1A")

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0F0F1A"))
        }

        // Indigo progress bar at the top
        loadingBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, 8)
            max = 100
            progressTintList           = android.content.res.ColorStateList.valueOf(Color.parseColor("#6366F1"))
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.TRANSPARENT)
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            settings.apply {
                javaScriptEnabled      = true
                domStorageEnabled      = true
                databaseEnabled        = true
                allowFileAccess        = true
                useWideViewPort        = true
                loadWithOverviewMode   = true
                setSupportZoom(false)
                builtInZoomControls    = false
                displayZoomControls    = false
                cacheMode              = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode       = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                userAgentString        = "\${userAgentString} QuizMasterPro/1.0"
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // Keep navigation inside the WebView
                    val host = request.url.host ?: return false
                    return !APP_URL.contains(host)
                }
                override fun onPageFinished(view: WebView, url: String) {
                    loadingBar.animate().alpha(0f).setDuration(300).withEndAction {
                        loadingBar.visibility = View.GONE
                        loadingBar.alpha = 1f
                    }.start()
                }
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) {
                        view.loadData(
                            "<html><body style='background:#0F0F1A;color:#fff;font-family:sans-serif;padding:40px;text-align:center'>" +
                            "<h2 style='color:#6366F1'>⚡ Quiz Master Pro</h2>" +
                            "<p>Connection failed. Check your internet and try again.</p>" +
                            "<button onclick='location.reload()' style='background:#6366F1;color:#fff;border:none;padding:12px 24px;border-radius:12px;font-size:16px;margin-top:16px'>Retry</button>" +
                            "</body></html>",
                            "text/html", "UTF-8"
                        )
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    loadingBar.progress  = newProgress
                    loadingBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                }
                override fun onConsoleMessage(msg: ConsoleMessage) = true
            }
        }

        root.addView(webView)
        root.addView(loadingBar)
        setContentView(root)

        // Handle system bar insets
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.updatePadding(top = bars.top)
            insets
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl(APP_URL)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onResume()  { super.onResume();  webView.onResume();  }
    override fun onPause()   { super.onPause();   webView.onPause();   }
    override fun onDestroy() { super.onDestroy(); webView.destroy();   }
}`;
}

function buildSplashActivity(pkg: string, appName: string) {
  return `package ${pkg}

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor     = Color.parseColor("#0F0F1A")
        window.navigationBarColor = Color.parseColor("#0F0F1A")

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0F0F1A"))
        }

        val dp = resources.displayMetrics.density

        val icon = TextView(this).apply {
            text     = "🎯"
            textSize = 80f
            gravity  = Gravity.CENTER
            setPadding(0, 0, 0, (16 * dp).toInt())
        }

        val title = TextView(this).apply {
            text     = "${appName}"
            textSize = 30f
            gravity  = Gravity.CENTER
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        val sub = TextView(this).apply {
            text     = "Premium Edition"
            textSize = 15f
            gravity  = Gravity.CENTER
            setTextColor(Color.parseColor("#8B8FA8"))
            setPadding(0, (8 * dp).toInt(), 0, 0)
        }

        layout.addView(icon)
        layout.addView(title)
        layout.addView(sub)
        setContentView(layout)

        layout.postDelayed({
            startActivity(Intent(this, MainActivity::class.java))
            @Suppress("DEPRECATION")
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }, 1400)
    }
}`;
}

// ─── Resources ───────────────────────────────────────────────────────────────

function buildStrings(appName: string, appUrl: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${appName}</string>
    <string name="app_url">${appUrl}</string>
    <string name="loading">Loading…</string>
    <string name="retry">Retry</string>
</resources>`;
}

const COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="background">#0F0F1A</color>
    <color name="primary">#6366F1</color>
    <color name="surface">#141420</color>
    <color name="on_primary">#FFFFFF</color>
    <color name="status_bar">#0F0F1A</color>
</resources>`;

const THEMES_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.QuizMasterPro" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <item name="colorPrimary">@color/primary</item>
        <item name="colorPrimaryVariant">@color/primary</item>
        <item name="colorOnPrimary">@color/on_primary</item>
        <item name="android:windowBackground">@color/background</item>
        <item name="android:statusBarColor">@color/status_bar</item>
        <item name="android:navigationBarColor">@color/background</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>

    <style name="Theme.QuizMasterPro.Splash" parent="Theme.QuizMasterPro">
        <item name="android:windowBackground">@color/background</item>
        <item name="android:windowFullscreen">false</item>
    </style>
</resources>`;

const ICON_SVG = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#6366F1"
        android:pathData="M54,54m-50,0a50,50 0,1 1,100 0a50,50 0,1 1,-100 0"/>
    <text android:x="30" android:y="68" android:textSize="44sp">🎯</text>
</vector>`;

const PROGUARD = `-keep class ${PKG}.** { *; }
-keepclassmembers class * extends android.webkit.WebViewClient { public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap); public boolean *(android.webkit.WebView, java.lang.String); }
-keepclassmembers class * extends android.webkit.WebChromeClient { public void *(android.webkit.WebView, java.lang.String); }
-dontwarn okhttp3.**`;

const GITIGNORE = `*.iml
.gradle
/local.properties
/.idea
.DS_Store
/build
/captures
.externalNativeBuild
.cxx
local.properties
**/.DS_Store
*.keystore
*.jks`;

// ─── README ──────────────────────────────────────────────────────────────────

function buildReadme(appUrl: string, appName: string) {
  return `# 📱 ${appName} — Android Project

---

## 🚀 METHOD 1: Add to Home Screen (EASIEST — 30 seconds, no APK needed!)

> **Best for anyone without a PC!**

1. Open **Google Chrome** on your Android phone
2. Go to: \`${appUrl}\`
3. Tap the **⋮ three-dot menu** (top-right corner)
4. Tap **"Add to Home Screen"**
5. Tap **"Add"** in the popup
6. ✅ Done! App icon appears on your home screen — works full-screen just like a real app!

---

## 🔥 METHOD 2: Generate APK Online (No PC, No Android Studio!)

> **Best for getting a real .apk file without any tools!**

### Option A — WebIntoApp.com (Recommended, FREE)
1. Open **https://webintoapp.com** on any device
2. Paste your app URL: \`${appUrl}\`
3. Set app name: **${appName}**
4. Tap **"Create App"** → wait ~2 minutes → **Download APK**
5. Transfer APK to your Android phone
6. Enable: **Settings → Security → Install Unknown Apps**
7. Tap the APK file → **Install** ✅

### Option B — AppsGeyser.com (FREE)
1. Open **https://appsgeyser.com**
2. Choose **"Website"** template
3. Enter URL: \`${appUrl}\`
4. Download and install the APK

---

## ⚡ METHOD 3: Build APK with Android Studio

### Prerequisites
- **Android Studio** Hedgehog 2023.1+ (free download from developer.android.com)
- **JDK 17** (bundled with modern Android Studio)
- **Android SDK** (installed via Android Studio)

### Steps

1. **Open in Android Studio**
   \`\`\`
   File → Open → select this folder (QuizMasterPro-Android)
   \`\`\`

2. **Wait for Gradle sync** *(2–5 min on first open — Android Studio downloads dependencies)*

3. **Build the APK**
   \`\`\`
   Build → Build Bundle(s) / APK(s) → Build APK(s)
   \`\`\`

4. **Find your APK**
   \`\`\`
   app/build/outputs/apk/debug/app-debug.apk
   \`\`\`

5. **Install on your Android phone**
   - Enable *Settings → Security → Install Unknown Apps*
   - Transfer the APK to your phone via USB or cloud
   - Tap the APK file to install
   - **Or via ADB:** \`adb install app/build/outputs/apk/debug/app-debug.apk\`

---

## 📋 App Details

| Property      | Value                    |
|---------------|--------------------------|
| App URL       | ${appUrl}     |
| Package       | ${PKG}        |
| Min Android   | 7.0 (API 24)             |
| Target Android | 14 (API 34)             |
| Language      | Kotlin                   |
| Architecture  | WebView + Kotlin wrapper |

---

## ✅ Features Included

- **Full-screen WebView** — no browser address bar
- **Splash screen** — branded loading screen with 🎯 icon
- **Back-button navigation** — navigates history, then exits
- **Progress bar** — indigo loading indicator while pages load
- **Error page** — friendly retry screen if connection fails
- **Edge-to-edge display** — uses full screen including status bar area
- **State restoration** — survives screen rotation
- **No Zite branding** — completely white-labeled

---

## 🎨 Customization

### Change App Name
Edit \`app/src/main/res/values/strings.xml\`:
\`\`\`xml
<string name="app_name">Your App Name</string>
\`\`\`

### Change App URL
Edit \`app/src/main/java/${PKG.replace(/\./g, '/')}/MainActivity.kt\`:
\`\`\`kotlin
const val APP_URL = "https://your-new-url.com"
\`\`\`

### Change App Icon
Replace \`app/src/main/res/mipmap-*/ic_launcher.png\` with your PNG icons:
- \`mipmap-mdpi/ic_launcher.png\` — 48×48
- \`mipmap-hdpi/ic_launcher.png\` — 72×72
- \`mipmap-xhdpi/ic_launcher.png\` — 96×96
- \`mipmap-xxhdpi/ic_launcher.png\` — 144×144
- \`mipmap-xxxhdpi/ic_launcher.png\` — 192×192

### Change Package Name
Refactor \`${PKG}\` across all files to your desired package (e.g., \`com.myname.quizapp\`).

---

## 🚀 Release Build (for Play Store)

\`\`\`
Build → Generate Signed Bundle / APK → APK
\`\`\`

1. Create a keystore (keep it safe — you need it for all future updates)
2. Build a **release** APK
3. Upload to Google Play Console

---

## Support

App URL: ${appUrl}
`;
}
