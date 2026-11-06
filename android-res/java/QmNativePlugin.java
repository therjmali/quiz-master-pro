package com.rjmali.quizmaster;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;

/**
 * Native helpers that bridge Android features (custom launcher shortcut & Android AppWidgets).
 */
@CapacitorPlugin(name = "QmNative")
public class QmNativePlugin extends Plugin {
    private static final String SHORTCUT_ID = "qm-custom-icon";
    private static final String PREFS_WIDGET = "rj_widget_prefs";
    private static final String KEY_WIDGET_DATA = "widget_data";

    @PluginMethod
    public void pinShortcut(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", false);
        result.put("pinned", false);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(result);
            return;
        }
        String iconBase64 = call.getString("icon");
        String label = call.getString("label", "R.J QUIZ");
        if (iconBase64 == null || iconBase64.isEmpty()) {
            call.reject("icon is required");
            return;
        }

        try {
            Context context = getContext();
            ShortcutManager manager = context.getSystemService(ShortcutManager.class);
            if (manager == null || !manager.isRequestPinShortcutSupported()) {
                call.resolve(result);
                return;
            }
            result.put("supported", true);

            byte[] bytes = Base64.decode(iconBase64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("icon could not be decoded");
                return;
            }

            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch == null) {
                call.reject("launch intent not found");
                return;
            }
            launch.setAction(Intent.ACTION_MAIN);

            ShortcutInfo info = new ShortcutInfo.Builder(context, SHORTCUT_ID)
                .setShortLabel(label)
                .setLongLabel(label)
                .setIcon(Icon.createWithBitmap(bitmap))
                .setIntent(launch)
                .build();

            boolean alreadyPinned = false;
            for (ShortcutInfo existing : manager.getPinnedShortcuts()) {
                if (SHORTCUT_ID.equals(existing.getId())) { alreadyPinned = true; break; }
            }
            boolean ok;
            if (alreadyPinned) {
                ok = manager.updateShortcuts(Collections.singletonList(info));
            } else {
                ok = manager.requestPinShortcut(info, null);
            }
            result.put("pinned", ok);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("pinShortcut failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            JSObject obj = call.getData();
            if (obj != null) {
                data = obj.toString();
            }
        }
        if (data == null) {
            data = "{}";
        }

        try {
            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_WIDGET_DATA, data).apply();

            StudyWidgetProvider.updateAll(context);
            FocusWidgetProvider.updateAll(context);
            SubjectWidgetProvider.updateAll(context);
            ExamWidgetProvider.updateAll(context);

            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("updateWidgetData failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isPinWidgetSupported(PluginCall call) {
        JSObject res = new JSObject();
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                AppWidgetManager mgr = getContext().getSystemService(AppWidgetManager.class);
                supported = mgr != null && mgr.isRequestPinAppWidgetSupported();
            } catch (Throwable ignored) {}
        }
        res.put("supported", supported);
        call.resolve(res);
    }

    @PluginMethod
    public void requestPinWidget(PluginCall call) {
        String widgetType = call.getString("type", "study");
        JSObject res = new JSObject();
        boolean ok = false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Context ctx = getContext();
                AppWidgetManager mgr = ctx.getSystemService(AppWidgetManager.class);
                if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
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
                    ComponentName provider = new ComponentName(ctx, providerClass);
                    ok = mgr.requestPinAppWidget(provider, null, null);
                }
            } catch (Throwable ignored) {}
        }

        res.put("pinned", ok);
        call.resolve(res);
    }
}
