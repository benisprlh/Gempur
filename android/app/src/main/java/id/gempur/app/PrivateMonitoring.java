package id.gempur.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Explicit private-trial facade. Ordinary distributions cannot activate this feature. */
public final class PrivateMonitoring {
    static final String PREFS = "gempur-private-monitor-state";
    static final String STATUS_CHANNEL = "gempur_private_status";
    static final String ALERT_CHANNEL = "gempur_private_alerts";
    static final int STATUS_NOTIFICATION = 301, LOCAL_NOTIFICATION = 302, COMPANION_NOTIFICATION = 303;
    static final Object NOTIFICATION_LOCK = new Object();
    private static final Object LOCAL_CONSENT_LOCK = new Object();
    // A stopped service or failed local-off save cannot reuse an earlier in-memory opt-in.
    private static volatile Object localObservationConsent;
    private PrivateMonitoring() {}

    static final class Observation {
        private final long observedAt;
        private final PrivateMonitorStore.ObservationEpoch epoch;
        private final Object localConsent;
        private final Object aiConsent;

        private Observation(long observedAt, PrivateMonitorStore.ObservationEpoch epoch, Object localConsent, Object aiConsent) {
            this.observedAt = observedAt;
            this.epoch = epoch;
            this.localConsent = localConsent;
            this.aiConsent = aiConsent;
        }

        boolean allowsAi() { return aiConsent != null; }

        private boolean stillConsented(Context context, boolean ai) {
            return localConsent == localObservationConsent && localEnabled(context)
                    && localConsent == localObservationConsent
                    && (!ai || (aiConsent != null && aiConsent == DomainAiRepository.observationConsent(context)));
        }
    }

    static Observation observe(Context context) {
        if (!BuildConfig.PRIVATE_BUILD || !isRunning()) return null;
        try {
            Object local = localObservationConsent;
            if (local == null) return null;
            PrivateMonitorStore store = new PrivateMonitorStore(context);
            PrivateMonitorStore.ObservationEpoch epoch = store.observationEpoch();
            if (epoch == null) return null;
            Object ai = DomainAiRepository.observationConsent(context);
            long observedAt = System.currentTimeMillis();
            if (!localEnabled(context) || local != localObservationConsent || store.observationEpoch() != epoch) return null;
            return new Observation(observedAt, epoch, local, ai);
        } catch (RuntimeException unavailable) {
            // Observation failure must not interrupt DNS forwarding.
            return null;
        }
    }

    static void recordObserved(Context context, String kind, String target, String reason, String verdict, String action,
            Observation observation) {
        if (!BuildConfig.PRIVATE_BUILD || observation == null) return;
        boolean ai = "ml_model".equals(reason);
        try {
            PrivateMonitorStore store = new PrivateMonitorStore(context);
            boolean created = store.recordObserved(kind, target, reason, verdict, action, observation.observedAt,
                    observation.epoch, () -> observation.stillConsented(context, ai));
            synchronized (NOTIFICATION_LOCK) {
                if (created && store.observationEpoch() == observation.epoch && observation.stillConsented(context, ai)) {
                    NotificationManager manager = context.getSystemService(NotificationManager.class);
                    manager.notify(LOCAL_NOTIFICATION, alert(context, "Deteksi lokal perlu ditinjau", "Buka Gempur untuk melihat alasan. Ini bukan bukti seseorang berjudi.").setOnlyAlertOnce(true).build());
                }
            }
        } catch (IllegalArgumentException diagnosticsOrInvalid) {
            // Synthetic diagnostics and malformed targets must never be activity reports.
        } catch (Exception failure) { state(context, "storage_error", "Deteksi tidak tersimpan. Proteksi lokal tetap berjalan."); }
    }

    /** Invoke only from an explicit foreground user action, after the disclosure. */
    public static void start(Context context) {
        requirePrivate();
        if (!notificationsVisible(context)) throw new IllegalStateException("Aktifkan izin dan kedua kanal notifikasi Gempur privat terlebih dahulu.");
        context.startForegroundService(new Intent(context, PrivateAutomationService.class).setAction(PrivateAutomationService.ACTION_START));
    }
    /** Stops local private automation immediately. UI separately synchronizes remote grant revocation. */
    public static void stop(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return;
        boolean flagsSaved = saveLocalOff(context, true);
        disableSharing(context);
        context.stopService(new Intent(context, PrivateAutomationService.class));
        cancelAlerts(context);
        state(context, flagsSaved ? "stopped" : "storage_error", flagsSaved ? "Layanan privat dihentikan di HP ini." : "Layanan dihentikan, tetapi pilihan belum tersimpan. Periksa penyimpanan HP.");
    }
    public static boolean isRunning() { return BuildConfig.PRIVATE_BUILD && PrivateAutomationService.isRunning(); }
    public static boolean localEnabled(Context context) {
        return BuildConfig.PRIVATE_BUILD && localObservationConsent != null && isRunning()
                && prefs(context).getBoolean("local_enabled", false) && notificationsVisible(context);
    }
    public static void setLocalEnabled(Context context, boolean enabled) {
        requirePrivate();
        if (!enabled) {
            boolean flagsSaved = saveLocalOff(context, false);
            disableSharing(context);
            if (!flagsSaved) throw new IllegalStateException("Pilihan deteksi belum tersimpan.");
            return;
        }
        synchronized (LOCAL_CONSENT_LOCK) {
            if (!notificationsVisible(context)) throw new IllegalStateException("Izinkan notifikasi Gempur privat sebelum mengaktifkan deteksi.");
            localObservationConsent = null;
            if (!prefs(context).edit().putBoolean("local_enabled", true).commit()) throw new IllegalStateException("Pilihan deteksi belum tersimpan.");
            localObservationConsent = new Object();
        }
    }
    private static boolean saveLocalOff(Context context, boolean stopCompanion) {
        synchronized (LOCAL_CONSENT_LOCK) {
            localObservationConsent = null;
            SharedPreferences.Editor edit = prefs(context).edit().putBoolean("local_enabled", false);
            if (stopCompanion) edit.putBoolean("companion_watching", false);
            return edit.commit();
        }
    }
    public static boolean companionWatching(Context context) { return BuildConfig.PRIVATE_BUILD && prefs(context).getBoolean("companion_watching", false); }
    public static void setCompanionWatching(Context context, boolean enabled) {
        requirePrivate();
        if (enabled && !notificationsVisible(context)) throw new IllegalStateException("Izinkan notifikasi sebelum menyalakan pendamping.");
        if (!prefs(context).edit().putBoolean("companion_watching", enabled).commit()) throw new IllegalStateException("Pilihan pendamping belum tersimpan.");
    }
    public static long sharingEpoch(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return -1;
        try { return new PrivateMonitorStore(context).epoch(); }
        catch (Exception failure) { throw unavailable(failure); }
    }
    public static JSONObject sharing(Context context) {
        try { return BuildConfig.PRIVATE_BUILD ? new PrivateMonitorStore(context).sharing() : new JSONObject().put("enabled", false); }
        catch (Exception failure) { throw unavailable(failure); }
    }
    public static void enableSharing(Context context, String pairingId, int consentVersion, int automationVersion, JSONArray scopes) {
        long epoch = sharingEpoch(context);
        if (!enableSharingIfCurrent(context, epoch, pairingId, consentVersion, automationVersion, scopes)) throw new IllegalStateException("Pilihan berbagi berubah. Tinjau ulang sebelum mengaktifkan.");
    }
    public static boolean enableSharingIfCurrent(Context context, long epoch, String pairingId, int consentVersion, int automationVersion, JSONArray scopes) {
        requirePrivate();
        if (!localEnabled(context)) throw new IllegalStateException("Aktifkan deteksi lokal dan notifikasi terlebih dahulu.");
        try {
            JSONObject account = new LocalStore(context).remoteContext();
            if (account.optString("token").isEmpty() || account.optString("deviceId").isEmpty() || !pairingId.equals(account.optString("pairingId"))
                    || !Integer.toString(consentVersion).equals(account.optString("consentVersion")) || !account.optString("pendingRevocation").isEmpty()
                    || !account.optString("pendingAutomationOffPairing").isEmpty()) throw new IllegalStateException("Sinkronkan sesi dan persetujuan pasangan terlebih dahulu.");
            String endpoint = CompanionClient.validateEndpoint(account.optString("endpoint"), BuildConfig.DEBUG);
            return new PrivateMonitorStore(context).enable(epoch, pairingId, consentVersion, automationVersion, scopes, endpoint, account.optString("deviceId"));
        }
        catch (Exception failure) { throw unavailable(failure); }
    }
    public static void disableSharing(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return;
        try { new PrivateMonitorStore(context).disable(); }
        catch (Exception failure) {
            // Fail closed even if a corrupt vault prevents queue mutation.
            boolean flagsSaved = saveLocalOff(context, true);
            state(context, "storage_error", flagsSaved ? "Penyimpanan privat perlu diperiksa; pengiriman dihentikan." : "Penyimpanan dan pilihan privat gagal ditulis. Hentikan layanan dan periksa penyimpanan HP.");
        }
        clearAllowances(context);
    }
    public static JSONObject pendingServerOff(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return new JSONObject();
        try { return new PrivateMonitorStore(context).pendingServerOff(); }
        catch (Exception failure) { throw unavailable(failure); }
    }
    public static void acknowledgeServerOff(Context context, JSONObject expectedPending) {
        if (!BuildConfig.PRIVATE_BUILD) return;
        try { new PrivateMonitorStore(context).acknowledgeServerOff(expectedPending); }
        catch (Exception failure) { throw unavailable(failure); }
    }
    public static JSONArray events(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return new JSONArray();
        try { return new PrivateMonitorStore(context).events(); }
        catch (Exception failure) { throw unavailable(failure); }
    }
    public static JSONObject status(Context context) {
        try {
            JSONObject result = new JSONObject().put("running", isRunning()).put("state", prefs(context).getString("state", "stopped"))
                    .put("message", prefs(context).getString("message", "")).put("updatedAt", prefs(context).getLong("updated_at", 0))
                    .put("localEnabled", localEnabled(context)).put("companionWatching", companionWatching(context));
            if (BuildConfig.PRIVATE_BUILD) result.put("overflowCount", new PrivateMonitorStore(context).overflow());
            return result;
        } catch (Exception failure) { throw unavailable(failure); }
    }
    public static void clear(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return;
        stop(context);
        try { new PrivateMonitorStore(context).clear(); }
        catch (Exception failure) { throw unavailable(failure); }
    }
    static void state(Context context, String state, String message) {
        prefs(context).edit().putString("state", state).putString("message", message).putLong("updated_at", System.currentTimeMillis()).apply();
    }
    static boolean notificationsVisible(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return false;
        manager.createNotificationChannel(new NotificationChannel(STATUS_CHANNEL, "Layanan privat terlihat", NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel(ALERT_CHANNEL, "Deteksi dan permintaan tinjauan", NotificationManager.IMPORTANCE_DEFAULT));
        NotificationChannel status = manager.getNotificationChannel(STATUS_CHANNEL), alerts = manager.getNotificationChannel(ALERT_CHANNEL);
        return manager.areNotificationsEnabled() && status != null && status.getImportance() != NotificationManager.IMPORTANCE_NONE
                && alerts != null && alerts.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
    static Notification.Builder alert(Context context, String title, String text) {
        Intent intent = new Intent(context, MainActivity.class).putExtra("private_tab", true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(context, 310, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification publicVersion = new Notification.Builder(context, ALERT_CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Gempur").setContentText("Ada pembaruan privat.").build();
        return new Notification.Builder(context, ALERT_CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title).setContentText(text).setContentIntent(open).setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion);
    }
    static void cancelAlerts(Context context) {
        synchronized (NOTIFICATION_LOCK) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) { manager.cancel(LOCAL_NOTIFICATION); manager.cancel(COMPANION_NOTIFICATION); }
        }
    }
    static void serviceStopped(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return;
        boolean flagsSaved = saveLocalOff(context, true);
        disableSharing(context);
        cancelAlerts(context);
        if (!flagsSaved) state(context, "storage_error", "Layanan berhenti, tetapi pilihan belum tersimpan. Periksa penyimpanan HP.");
    }
    static void clearAllowances(Context context) {
        if (!BuildConfig.PRIVATE_BUILD) return;
        try { RuleRepository.clearTemporaryAllowances(context); AppRiskRepository.clearTemporaryAllowances(context); }
        catch (Exception failure) { state(context, "allowance_storage_error", "Pencabutan koreksi lokal belum tersimpan. Periksa penyimpanan dan masa berlaku izin."); }
    }
    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static void requirePrivate() { if (!BuildConfig.PRIVATE_BUILD) throw new IllegalStateException("Fitur ini hanya tersedia di APK uji privat."); }
    private static IllegalStateException unavailable(Exception cause) { return new IllegalStateException("Data privat belum dapat diproses. Tidak ada data yang dihapus otomatis.", cause); }
}
