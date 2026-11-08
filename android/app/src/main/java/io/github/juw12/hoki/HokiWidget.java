package io.github.juw12.hoki;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.widget.RemoteViews;

import java.time.LocalDate;

/**
 * Home-screen widget: the waving cat (a ViewFlipper of pre-rendered frames that the launcher
 * animates on its own) plus today's luck count. Tapping the widget adds one luck, like the app.
 */
public class HokiWidget extends AppWidgetProvider {

    static final String ACTION_TAP = "io.github.juw12.hoki.TAP";
    private static final String PREFS = "hoki";
    private static final String KEY_DAY = "day";
    private static final String KEY_TODAY = "today";
    private static final String KEY_TOTAL = "total";
    private static final int[] LUCKY = {8, 28, 88, 168, 288, 888, 1688, 8888};
    private static final String[] BLESSINGS = {"\u798f", "\u8d22", "\u8fd0", "\u559c"};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            manager.updateAppWidget(id, buildViews(context, null));
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_TAP.equals(intent.getAction())) {
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int today = todayCount(prefs) + 1;
        int total = prefs.getInt(KEY_TOTAL, 0) + 1;
        prefs.edit()
                .putString(KEY_DAY, LocalDate.now().toString())
                .putInt(KEY_TODAY, today)
                .putInt(KEY_TOTAL, total)
                .apply();

        String message;
        if (isLucky(today)) {
            message = "\u53d1 " + today + " today!";
        } else {
            message = "+1 " + BLESSINGS[total % BLESSINGS.length] + "  \u00b7  " + today + " today";
        }
        buzz(context, isLucky(today));

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HokiWidget.class));
        for (int id : ids) {
            // Partial update: only the text changes, so the cat keeps waving without a restart.
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_hoki);
            views.setTextViewText(R.id.luck_text, message);
            manager.partiallyUpdateAppWidget(id, views);
        }
    }

    static RemoteViews buildViews(Context context, String message) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_hoki);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int today = todayCount(prefs);
        String text = message != null ? message
                : today == 0 ? context.getString(R.string.tap_hint) : today + " luck today";
        views.setTextViewText(R.id.luck_text, text);

        Intent tap = new Intent(context, HokiWidget.class).setAction(ACTION_TAP);
        PendingIntent pending = PendingIntent.getBroadcast(
                context, 0, tap, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        return views;
    }

    private static int todayCount(SharedPreferences prefs) {
        String day = prefs.getString(KEY_DAY, "");
        return LocalDate.now().toString().equals(day) ? prefs.getInt(KEY_TODAY, 0) : 0;
    }

    private static boolean isLucky(int count) {
        for (int lucky : LUCKY) {
            if (lucky == count) {
                return true;
            }
        }
        return false;
    }

    private static void buzz(Context context, boolean big) {
        Vibrator vibrator = context.getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) {
            return;
        }
        long ms = big ? 60 : 12;
        vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
