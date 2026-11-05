package com.rjmali.quizmaster;

import android.content.Context;
import android.content.Intent;
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
 * Native helpers that have no web equivalent.
 *
 * pinShortcut: Android never lets an app swap its own launcher icon for an arbitrary picture, so the
 * custom icon is offered as a pinned home-screen shortcut (updated in place when it already exists).
 */
@CapacitorPlugin(name = "QmNative")
public class QmNativePlugin extends Plugin {
    private static final String SHORTCUT_ID = "qm-custom-icon";

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
}
