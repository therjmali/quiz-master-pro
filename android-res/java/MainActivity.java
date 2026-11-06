package com.rjmali.quizmaster;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public class NativeBridge {
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

        if (getBridge() != null && getBridge().getWebView() != null) {
            NativeBridge bridge = new NativeBridge();
            getBridge().getWebView().addJavascriptInterface(bridge, "RJNative");
            getBridge().getWebView().addJavascriptInterface(bridge, "QmNative");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
