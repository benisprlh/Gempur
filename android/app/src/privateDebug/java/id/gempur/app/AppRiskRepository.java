package id.gempur.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Process;
import android.os.SystemClock;
import android.provider.Settings;
import android.provider.Telephony;
import android.telecom.TelecomManager;
import id.gempur.engine.DetectionPolicy;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Private local name triage only. There is no verified gambling-app reputation catalog. */
public final class AppRiskRepository {
    private static final String PREFS = "gempur-app-risk";
    private static final long MAX_ALLOWANCE_MS = 30 * 60 * 1000L;
    private AppRiskRepository() {}

    public static DetectionPolicy.Decision evaluate(Context context, String packageName) {
        if (!enabled(context)) return DetectionPolicy.unknown();
        try {
            String target = DetectionPolicy.normalizePackage(packageName);
            PackageManager pm = context.getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(target, 0);
            return evaluate(context, info, pm, criticalPackages(context, pm));
        } catch (PackageManager.NameNotFoundException | RuntimeException unavailable) {
            return DetectionPolicy.unknown(); // Missing visibility/identity never becomes a gambling claim.
        }
    }

    /** Visible launchable-app subset only. The scan itself does not interrupt or upload anything. */
    public static JSONArray scan(Context context) {
        JSONArray findings = new JSONArray();
        if (!enabled(context)) return findings;
        PackageManager pm = context.getPackageManager();
        Set<String> excluded = criticalPackages(context, pm);
        Set<String> seen = new HashSet<>();
        try {
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            for (ResolveInfo resolved : pm.queryIntentActivities(launcher, 0)) {
                if (findings.length() >= 100) break;
                if (resolved == null || resolved.activityInfo == null || resolved.activityInfo.applicationInfo == null) continue;
                ApplicationInfo info = resolved.activityInfo.applicationInfo;
                if (info.packageName == null || !seen.add(info.packageName)) continue;
                try {
                    DetectionPolicy.Decision decision = evaluate(context, info, pm, excluded);
                    if ("suspected".equals(decision.verdict)) {
                        findings.put(new JSONObject().put("target", info.packageName).put("label", label(info, pm))
                                .put("reason", decision.reason).put("verdict", decision.verdict).put("action", "flagged"));
                    }
                } catch (Exception invalidOrChanged) { /* One changing package cannot fail the complete local scan. */ }
            }
        } catch (RuntimeException unavailable) { /* Limited package visibility is a coverage limit, never evidence of absence. */ }
        return findings;
    }

    private static DetectionPolicy.Decision evaluate(Context context, ApplicationInfo info, PackageManager pm, Set<String> critical) {
        boolean excluded = info == null || info.packageName == null || info.uid < Process.FIRST_APPLICATION_UID
                || (info.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0
                || critical.contains(info.packageName);
        if (excluded) return DetectionPolicy.evaluateApp("id.gempur.excluded", "", true, false, false);
        return DetectionPolicy.evaluateApp(info.packageName, label(info, pm), false, allowed(context, info.packageName), true);
    }

    private static boolean enabled(Context context) {
        return BuildConfig.PRIVATE_BUILD && PrivateMonitoring.localEnabled(context);
    }

    private static String label(ApplicationInfo info, PackageManager pm) {
        CharSequence value = info.loadLabel(pm);
        String text = value == null ? "" : value.toString();
        return text.length() > 160 ? text.substring(0, 160) : text;
    }

    private static Set<String> criticalPackages(Context context, PackageManager pm) {
        Set<String> result = new HashSet<>();
        result.add(context.getPackageName()); result.add("android"); result.add("com.android.settings");
        result.add("com.android.systemui"); result.add("com.android.permissioncontroller");
        result.add("com.google.android.permissioncontroller"); result.add("com.android.packageinstaller");
        result.add("com.google.android.packageinstaller");
        addHandlers(pm, new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), result);
        addHandlers(pm, new Intent(Intent.ACTION_DIAL, Uri.parse("tel:")), result);
        addHandlers(pm, new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")), result);
        addHandlers(pm, new Intent(Settings.ACTION_SETTINGS), result);
        try {
            String sms = Telephony.Sms.getDefaultSmsPackage(context); if (sms != null) result.add(sms);
            TelecomManager telecom = context.getSystemService(TelecomManager.class);
            String dialer = telecom == null ? null : telecom.getDefaultDialerPackage(); if (dialer != null) result.add(dialer);
        } catch (RuntimeException unavailable) { /* System flags and resolved critical handlers remain excluded. */ }
        return result;
    }

    private static void addHandlers(PackageManager pm, Intent intent, Set<String> output) {
        try {
            for (ResolveInfo found : pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)) {
                if (found.activityInfo != null && found.activityInfo.packageName != null) output.add(found.activityInfo.packageName);
            }
            ResolveInfo chosen = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (chosen != null && chosen.activityInfo != null) output.add(chosen.activityInfo.packageName);
        } catch (RuntimeException unavailable) { /* An unavailable resolver must not make a system package interruptible. */ }
    }

    public static synchronized void temporaryAllow(Context context, String packageName, long expiresAt) {
        if (!BuildConfig.PRIVATE_BUILD) throw new IllegalStateException("Koreksi aplikasi hanya tersedia pada uji privat");
        String target = DetectionPolicy.normalizePackage(packageName);
        long wall = System.currentTimeMillis(), elapsed = SystemClock.elapsedRealtime(), duration = expiresAt - wall;
        int boot = bootId(context);
        if (duration <= 0 || duration > MAX_ALLOWANCE_MS || boot < 0) throw new IllegalArgumentException("Pengecualian aplikasi harus berakhir dalam 30 menit pada boot yang sama");
        try {
            JSONObject saved = new JSONObject().put("target", target).put("createdWall", wall).put("createdElapsed", elapsed)
                    .put("expiresWall", expiresAt).put("expiresElapsed", Math.addExact(elapsed, duration)).put("bootId", boot);
            if (!prefs(context).edit().putString("temporary_allowance", saved.toString()).commit()) throw new IllegalStateException("Pengecualian aplikasi gagal disimpan");
        } catch (org.json.JSONException invalid) { throw new IllegalStateException(invalid); }
    }

    private static synchronized boolean allowed(Context context, String target) {
        try {
            JSONObject saved = new JSONObject(prefs(context).getString("temporary_allowance", "{}"));
            long wall = System.currentTimeMillis(), elapsed = SystemClock.elapsedRealtime();
            return target.equals(saved.getString("target")) && saved.getInt("bootId") >= 0 && bootId(context) == saved.getInt("bootId")
                    && wall >= saved.getLong("createdWall") && wall < saved.getLong("expiresWall")
                    && elapsed >= saved.getLong("createdElapsed") && elapsed < saved.getLong("expiresElapsed");
        } catch (Exception absentOrExpired) { return false; }
    }

    public static synchronized void clearTemporaryAllowances(Context context) {
        if (!prefs(context).edit().remove("temporary_allowance").commit()) throw new IllegalStateException("Pencabutan pengecualian aplikasi belum tersimpan");
    }

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static int bootId(Context context) { return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
}
