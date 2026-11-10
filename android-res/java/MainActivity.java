package com.rjmali.quizmaster;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.Arrays;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Overlap of the system bars with the WebView, in dp: {top, right, bottom, left}. */
    private volatile int[] insetsDp = new int[] {0, 0, 0, 0};

    /**
     * Measures how much of the WebView is covered by the status / navigation bars (edge-to-edge) and
     * hands it to the web layer. Android WebViews frequently report env(safe-area-inset-*) as 0, which
     * drew the status bar over the app header. Measuring the real overlap works on every WebView
     * version and is 0 automatically when the content already sits below the bars.
     */
    private void measureInsets() {
        try {
            if (getBridge() == null) return;
            final WebView wv = getBridge().getWebView();
            final View decor = getWindow().getDecorView();
            if (wv == null || decor.getWidth() == 0 || decor.getHeight() == 0) return;
            WindowInsetsCompat root = ViewCompat.getRootWindowInsets(decor);
            if (root == null) return;
            Insets bars = root.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int[] loc = new int[2];
            wv.getLocationInWindow(loc);
            int top = Math.max(0, bars.top - loc[1]);
            int left = Math.max(0, bars.left - loc[0]);
            int right = Math.max(0, bars.right - (decor.getWidth() - (loc[0] + wv.getWidth())));
            int bottom = Math.max(0, bars.bottom - (decor.getHeight() - (loc[1] + wv.getHeight())));
            float d = getResources().getDisplayMetrics().density;
            int[] next = new int[] {Math.round(top / d), Math.round(right / d), Math.round(bottom / d), Math.round(left / d)};
            if (Arrays.equals(next, insetsDp)) return;
            insetsDp = next;
            final String js = "try{var s=document.documentElement.style;"
                + "s.setProperty('--qmp-native-inset-top','" + next[0] + "px');"
                + "s.setProperty('--qmp-native-inset-right','" + next[1] + "px');"
                + "s.setProperty('--qmp-native-inset-bottom','" + next[2] + "px');"
                + "s.setProperty('--qmp-native-inset-left','" + next[3] + "px');}catch(e){}";
            wv.post(new Runnable() { @Override public void run() { wv.evaluateJavascript(js, null); } });
        } catch (Throwable ignored) {}
    }

    /** Progress / result events of the in-app updater, pushed to the web layer (window.__qmUpdate). */
    private final ApkUpdater.Listener updateListener = new ApkUpdater.Listener() {
        @Override public void onEvent(String state, long done, long total, String error) {
            js("window.__qmUpdate&&window.__qmUpdate({state:" + q(state) + ",done:" + done + ",total:" + total + ",error:" + q(error) + "})");
        }
    };

    private void js(final String script) {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            final WebView wv = getBridge().getWebView();
            wv.post(new Runnable() { @Override public void run() { wv.evaluateJavascript(script, null); } });
        } catch (Throwable ignored) {}
    }

    /** JSON-quotes a string for safe inclusion in a script (null becomes null). */
    private static String q(String v) {
        if (v == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < v.length(); i++) {
            char c = v.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                default:
                    if (c < 0x20) sb.append(' '); else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    public class NativeBridge {
        /** JSON {top,right,bottom,left} in dp - read by the web layer after every (re)load. */
        @JavascriptInterface
        public String getInsets() {
            int[] i = insetsDp;
            return "{\"top\":" + i[0] + ",\"right\":" + i[1] + ",\"bottom\":" + i[2] + ",\"left\":" + i[3] + "}";
        }

        /* ── In-app updates (downloads the new APK from this project's GitHub releases) ── */
        @JavascriptInterface
        public boolean canInstallPackages() {
            return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
        }

        @JavascriptInterface
        public void openInstallPermission() {
            runOnUiThread(new Runnable() { @Override public void run() { ApkUpdater.openPermissionSettings(MainActivity.this); } });
        }

        @JavascriptInterface
        public void downloadUpdate(String url, String sha256) {
            ApkUpdater.download(getApplicationContext(), url, sha256, updateListener);
        }

        @JavascriptInterface
        public void installUpdate() {
            runOnUiThread(new Runnable() { @Override public void run() { ApkUpdater.install(MainActivity.this, updateListener); } });
        }

        @JavascriptInterface
        public void updateWidgetData(String json) {
            try {
                SharedPreferences prefs = getSharedPreferences("rj_widget_prefs", Context.MODE_PRIVATE);
                prefs.edit().putString("widget_data", json).apply();
                StudyWidgetProvider.updateAll(MainActivity.this);
                FocusWidgetProvider.updateAll(MainActivity.this);
                SubjectWidgetProvider.updateAll(MainActivity.this);
                ExamWidgetProvider.updateAll(MainActivity.this);
            } catch (Throwable ignored) {}
        }

        @JavascriptInterface
        public boolean isPinWidgetSupported() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
            try {
                AppWidgetManager mgr = getSystemService(AppWidgetManager.class);
                return mgr != null && mgr.isRequestPinAppWidgetSupported();
            } catch (Throwable t) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean requestPinWidget(String widgetType) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
            try {
                AppWidgetManager mgr = getSystemService(AppWidgetManager.class);
                if (mgr == null || !mgr.isRequestPinAppWidgetSupported()) return false;
                Class<?> providerClass;
                if ("focus".equalsIgnoreCase(widgetType)) {
                    providerClass = FocusWidgetProvider.class;
                } else if ("subject".equalsIgnoreCase(widgetType)) {
                    providerClass = SubjectWidgetProvider.class;
                } else if ("exam".equalsIgnoreCase(widgetType)) {
                    providerClass = ExamWidgetProvider.class;
                } else {
                    providerClass = StudyWidgetProvider.class;
                }
                ComponentName provider = new ComponentName(MainActivity.this, providerClass);
                return mgr.requestPinAppWidget(provider, null, null);
            } catch (Throwable t) {
                return false;
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QmNativePlugin.class);
        super.onCreate(savedInstanceState);
        ApkUpdater.cleanupStale(getApplicationContext());

        if (getBridge() != null && getBridge().getWebView() != null) {
            NativeBridge bridge = new NativeBridge();
            getBridge().getWebView().addJavascriptInterface(bridge, "RJNative");
            getBridge().getWebView().addJavascriptInterface(bridge, "QmNative");
        }

        getWindow().getDecorView().getViewTreeObserver().addOnGlobalLayoutListener(new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
            @Override public void onGlobalLayout() { measureInsets(); }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        measureInsets();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
