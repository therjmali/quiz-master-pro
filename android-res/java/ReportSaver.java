package com.rjmali.quizmaster;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Saves reports the user asked for into the public Downloads folder (Downloads/R.J QUIZ) - no storage permission needed on
 * Android 10+ - and opens / shares / checks / deletes them again. Everything is local; nothing is uploaded.
 */
final class ReportSaver {
    private ReportSaver() {}

    static final String FOLDER = "R.J QUIZ";

    private static String result(boolean ok, String uri, String where, String error) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok);
            o.put("uri", uri);
            o.put("where", where);
            o.put("error", error);
            return o.toString();
        } catch (Throwable t) {
            return "{\"ok\":false,\"uri\":\"\",\"where\":\"\",\"error\":\"internal\"}";
        }
    }

    private static String safeName(String name) {
        StringBuilder sb = new StringBuilder();
        String n = (name == null || name.trim().isEmpty()) ? "report" : name.trim();
        for (int i = 0; i < n.length(); i++) {
            char c = n.charAt(i);
            boolean bad = c < 32 || c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|';
            sb.append(bad ? '_' : c);
        }
        return sb.toString();
    }

    /** Returns a JSON string: {ok, uri, where, error}. */
    static String save(Context ctx, String name, String mime, String base64) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            String safe = safeName(name);
            String type = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = ctx.getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                v.put(MediaStore.MediaColumns.MIME_TYPE, type);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return result(false, "", "", "Could not create the file in Downloads.");
                try {
                    OutputStream os = cr.openOutputStream(uri);
                    if (os == null) throw new java.io.IOException("Could not open the new file.");
                    try { os.write(data); os.flush(); } finally { os.close(); }
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    cr.update(uri, done, null, null);
                } catch (Throwable t) {
                    try { cr.delete(uri, null, null); } catch (Throwable ignored) {}
                    throw t;
                }
                return result(true, uri.toString(), "Downloads/" + FOLDER, "");
            }
            // Android 7-9: keep it in the app's own folder (no permission) and hand it out through the FileProvider.
            File dir = new File(ctx.getCacheDir(), "reports");
            if (!dir.exists() && !dir.mkdirs()) return result(false, "", "", "Could not create the reports folder.");
            File f = new File(dir, safe);
            FileOutputStream fos = new FileOutputStream(f);
            try { fos.write(data); fos.flush(); } finally { fos.close(); }
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            return result(true, uri.toString(), "app storage (use Share to copy it out)", "");
        } catch (Throwable t) {
            String m = t.getMessage();
            return result(false, "", "", (m == null || m.isEmpty()) ? t.getClass().getSimpleName() : m);
        }
    }

    static boolean open(Context ctx, String uriStr, String mime) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse(uriStr), mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    static boolean share(Context ctx, String uriStr, String mime, String title) {
        try {
            Intent s = new Intent(Intent.ACTION_SEND);
            s.setType(mime);
            s.putExtra(Intent.EXTRA_STREAM, Uri.parse(uriStr));
            s.putExtra(Intent.EXTRA_SUBJECT, title);
            s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(s, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ctx.startActivity(chooser);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    static boolean exists(Context ctx, String uriStr) {
        ParcelFileDescriptor pfd = null;
        try {
            pfd = ctx.getContentResolver().openFileDescriptor(Uri.parse(uriStr), "r");
            return pfd != null;
        } catch (Throwable t) {
            return false;
        } finally {
            if (pfd != null) { try { pfd.close(); } catch (Throwable ignored) {} }
        }
    }

    static boolean delete(Context ctx, String uriStr) {
        try {
            return ctx.getContentResolver().delete(Uri.parse(uriStr), null, null) > 0;
        } catch (Throwable t) {
            return false;
        }
    }
}
