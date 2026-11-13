package com.rjmali.quizmaster;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class SubjectWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.rj_widget_subject);

        SharedPreferences prefs = context.getSharedPreferences("rj_widget_prefs", Context.MODE_PRIVATE);
        String raw = prefs.getString("widget_data", null);

        String shortName = "QUIZ";
        String subjectName = "Subject Mastery";
        String unitName = "Complete a quiz to track subjects";
        String unitStats = "0 / 0 Questions (0% Accuracy)";
        int progressPercent = 0;
        String subjectId = "";

        if (raw != null) {
            try {
                JSONObject obj = new JSONObject(raw);
                JSONObject subj = obj.optJSONObject("activeSubject");
                if (subj != null) {
                    shortName = subj.optString("shortName", "SUBJ");
                    subjectName = subj.optString("name", "Active Subject");
                    unitName = subj.optString("activeUnitName", "Quick Quiz Practice");
                    progressPercent = Math.min(100, Math.max(0, subj.optInt("percent", 0)));
                    int solved = subj.optInt("completedTopics", subj.optInt("solvedQuestions", 0));
                    int total = subj.optInt("totalTopics", subj.optInt("totalQuestions", 0));
                    if (total > 0) {
                        unitStats = solved + " / " + total + " Qs (" + progressPercent + "% Accuracy)";
                    } else {
                        unitStats = progressPercent + "% Subject Mastery";
                    }
                    subjectId = subj.optString("id", subj.optString("name", ""));
                } else {
                    int overall = obj.optInt("masteryPercent", obj.optInt("syllabusPercent", 0));
                    progressPercent = overall;
                    unitStats = overall + "% Overall Mastery";
                }
            } catch (Exception ignored) {}
        }

        views.setTextViewText(R.id.rj_widget_subject_badge, shortName);
        views.setTextViewText(R.id.rj_widget_subject_name, subjectName);
        views.setTextViewText(R.id.rj_widget_subject_unit_name, unitName);
        views.setTextViewText(R.id.rj_widget_subject_unit_stats, unitStats);
        views.setTextViewText(R.id.rj_widget_subject_percent, progressPercent + "%");
        views.setProgressBar(R.id.rj_widget_subject_progress, 100, progressPercent, false);

        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("rj_action", "open-subject");
        if (!subjectId.isEmpty()) intent.putExtra("rj_subject", subjectId);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            2,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.rj_widget_subject_root, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    public static void updateAll(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, SubjectWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids != null && ids.length > 0) {
                for (int id : ids) {
                    updateAppWidget(context, mgr, id);
                }
            }
        } catch (Throwable ignored) {}
    }
}
