package id.gempur.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-started visible polling, not push delivery and never a hidden permanent runner. */
public final class PrivateAutomationService extends Service {
    public static final String ACTION_START = "id.gempur.app.PRIVATE_AUTOMATION_START";
    public static final String ACTION_STOP = "id.gempur.app.PRIVATE_AUTOMATION_STOP";
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    private ScheduledExecutorService worker;
    private final DetectionAlertCooldown detectionAlerts = new DetectionAlertCooldown();
    private long nextAttemptAt = 0;
    private int failures = 0;
    public static boolean isRunning() { return RUNNING.get(); }

    @Override public void onCreate() { super.onCreate(); RUNNING.set(false); }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!BuildConfig.PRIVATE_BUILD || intent == null || !ACTION_START.equals(intent.getAction())) {
            PrivateMonitoring.stop(this); stopSelf(); return START_NOT_STICKY;
        }
        if (!PrivateMonitoring.notificationsVisible(this)) {
            permissionLost(); return START_NOT_STICKY;
        }
        if (RUNNING.get()) return START_NOT_STICKY;
        startForeground(PrivateMonitoring.STATUS_NOTIFICATION, statusNotification());
        RUNNING.set(true);
        PrivateMonitoring.state(this, "starting", "Layanan privat terlihat. Pengiriman dan notifikasi dapat tertunda.");
        worker = Executors.newSingleThreadScheduledExecutor();
        worker.scheduleWithFixedDelay(this::tick, 0, 30, TimeUnit.SECONDS);
        return START_NOT_STICKY;
    }

    private Notification statusNotification() {
        PendingIntent stop = PendingIntent.getService(this, 311, new Intent(this, PrivateAutomationService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent openIntent = new Intent(this, MainActivity.class).putExtra("private_tab", true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(this, 312, openIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, PrivateMonitoring.STATUS_CHANNEL).setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle("Gempur privat aktif").setContentText("Deteksi/pendamping sesuai pilihan Anda. Ketuk untuk meninjau atau hentikan.")
                .setContentIntent(open).setDeleteIntent(stop).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE)
                .addAction(new Notification.Action.Builder(null, "Hentikan privat", stop).build()).build();
    }

    private void tick() {
        if (!RUNNING.get()) return;
        if (!PrivateMonitoring.notificationsVisible(this)) { permissionLost(); return; }
        if (System.currentTimeMillis() < nextAttemptAt) return;
        try {
            JSONObject grant = PrivateMonitoring.sharing(this);
            boolean watching = PrivateMonitoring.companionWatching(this);
            boolean sharing = grant.optBoolean("enabled");
            if (!sharing && !watching) {
                PrivateMonitoring.state(this, "local_only", "Deteksi lokal saja; tidak ada pengiriman otomatis ke pendamping.");
                return;
            }
            JSONObject account = new LocalStore(this).remoteContext(); // One atomic, read-only account snapshot.
            if (account.optString("token").isEmpty() || account.optString("endpoint").isEmpty() || !account.optString("pendingRevocation").isEmpty()
                    || !account.optString("pendingAutomationOffPairing").isEmpty()) {
                PrivateMonitoring.disableSharing(this);
                PrivateMonitoring.setCompanionWatching(this, false);
                PrivateMonitoring.state(this, "account_required", "Sesi belum siap atau pencabutan belum selesai. Tidak ada data dikirim.");
                return;
            }
            String role = account.optString("role"); if (role.isEmpty()) role = "participant";
            if (sharing && "participant".equals(role)) upload(account, grant);
            else if (sharing) endGrant(grant);
            if (watching && "companion".equals(role)) pollCompanion(account);
            else if (watching) PrivateMonitoring.setCompanionWatching(this, false);
            failures = 0; nextAttemptAt = 0;
        } catch (CompanionClient.ApiException rejected) {
            if (rejected.status == 401) {
                PrivateMonitoring.stop(this);
                PrivateMonitoring.state(this, "session_ended", "Sesi server berakhir. Masuk ulang sebelum mengaktifkan privat.");
            } else {
                failures++;
                nextAttemptAt = System.currentTimeMillis() + (rejected.status == 429 ? 5 * 60_000 : backoff());
                PrivateMonitoring.state(this, rejected.status == 429 ? "server_busy" : "server_rejected", "Server belum menerima pembaruan. Proteksi lokal tetap tersedia; periksa koneksi dan izin berbagi.");
            }
        } catch (Exception unavailable) {
            failures++; nextAttemptAt = System.currentTimeMillis() + backoff();
            PrivateMonitoring.state(this, "offline_or_unavailable", "Pembaruan belum tersinkron. Antrean berbatas waktu; tidak ada klaim pendamping sudah menerima.");
        }
    }

    private void upload(JSONObject account, JSONObject grant) throws Exception {
        PrivateMonitorStore store = new PrivateMonitorStore(this);
        if (!grant.optString("pairingId").equals(account.optString("pairingId"))
                || !grant.optString("endpoint").equals(account.optString("endpoint")) || !grant.optString("accountId").equals(account.optString("deviceId"))
                || !Integer.toString(grant.optInt("consentVersion")).equals(account.optString("consentVersion"))) {
            endGrant(grant);
            PrivateMonitoring.state(this, "grant_changed", "Pasangan/izin berubah. Tinjau ulang berbagi otomatis."); return;
        }
        JSONArray events = store.batch(grant);
        if (events.length() == 0) { PrivateMonitoring.state(this, "sharing_ready", "Berbagi otomatis aktif; belum ada antrean yang perlu dikirim."); return; }
        if (!dispatchStillCurrent(account, grant)) return;
        JSONObject request = new JSONObject().put("pairingId", grant.getString("pairingId")).put("consentVersion", grant.getInt("consentVersion"))
                .put("automationVersion", grant.getInt("automationVersion")).put("events", events);
        try {
            JSONObject result = new CompanionClient(new LocalStore(this)).requestPinned("POST", "/api/detections", request, account);
            if (!dispatchStillCurrent(account, grant)) return;
            JSONArray accepted = result.getJSONArray("acceptedEventIds");
            // Only acknowledge IDs from this exact immutable batch; unexpected server IDs cannot mutate other events.
            Set<String> sent = new java.util.HashSet<>(); for (int i = 0; i < events.length(); i++) sent.add(events.getJSONObject(i).getString("eventId"));
            JSONArray checked = new JSONArray(); for (int i = 0; i < accepted.length(); i++) { String id = accepted.getString(i); if (sent.contains(id)) checked.put(id); }
            store.accepted(grant, checked);
            PrivateMonitoring.state(this, "server_received", "Server menerima deteksi yang disepakati. Ini belum membuktikan notifikasi terkirim atau dibaca.");
        } catch (CompanionClient.ApiException rejected) {
            if (rejected.status == 400 || rejected.status == 403 || rejected.status == 404 || rejected.status == 409) {
                endGrant(grant);
                PrivateMonitoring.state(this, "grant_ended", "Pengiriman dihentikan karena izin/protokol berubah. Tinjau ulang di HP ini.");
                return;
            }
            throw rejected;
        }
    }

    private boolean dispatchStillCurrent(JSONObject previous, JSONObject grant) throws Exception {
        if (!PrivateMonitoring.notificationsVisible(this)) { permissionLost(); return false; }
        if (!RUNNING.get() || !PrivateMonitoring.localEnabled(this)) return false;
        JSONObject current = PrivateMonitoring.sharing(this);
        JSONObject account = new LocalStore(this).remoteContext();
        return PrivateMonitorStore.sameGrant(current, grant) && account.optString("token").equals(previous.optString("token"))
                && account.optString("endpoint").equals(previous.optString("endpoint")) && account.optString("pairingId").equals(grant.optString("pairingId"))
                && account.optString("endpoint").equals(grant.optString("endpoint")) && account.optString("deviceId").equals(grant.optString("accountId"))
                && account.optString("consentVersion").equals(Integer.toString(grant.optInt("consentVersion")))
                && account.optString("pendingRevocation").isEmpty() && account.optString("pendingAutomationOffPairing").isEmpty();
    }

    private void pollCompanion(JSONObject account) throws Exception {
        String pairId = account.optString("pairingId");
        if (!pairId.matches("pair_[a-f0-9]{32}")) {
            PrivateMonitoring.setCompanionWatching(this, false);
            PrivateMonitoring.state(this, "pairing_required", "Pilih pasangan aktif sebelum menyalakan notifikasi pendamping."); return;
        }
        CompanionClient api = new CompanionClient(new LocalStore(this));
        JSONObject me = api.requestPinned("GET", "/api/me", null, account);
        if (!"companion".equals(me.getJSONObject("device").optString("role"))) { PrivateMonitoring.setCompanionWatching(this, false); return; }
        JSONObject pairing = null; JSONArray pairings = me.getJSONArray("pairings");
        for (int i = 0; i < pairings.length(); i++) { JSONObject candidate = pairings.getJSONObject(i); if (pairId.equals(candidate.optString("id")) && "active".equals(candidate.optString("status"))) pairing = candidate; }
        if (pairing == null) {
            PrivateMonitoring.setCompanionWatching(this, false); PrivateMonitoring.cancelAlerts(this);
            PrivateMonitoring.clearAllowances(this);
            PrivateMonitoring.state(this, "pairing_ended", "Akses pendamping tidak lagi aktif."); return;
        }
        if (!watchStillCurrent(account)) return;
        JSONObject inbox = api.requestPinned("GET", "/api/detections?pairingId=" + pairId, null, account);
        if (!watchStillCurrent(account)) return;
        JSONObject dashboard = api.requestPinned("GET", "/api/pairings/" + pairId + "/dashboard", null, account);
        if (!watchStillCurrent(account)) return;
        PrivateMonitorStore store = new PrivateMonitorStore(this);
        Set<String> notified = store.notified(pairId);
        JSONArray detectionIds = new JSONArray();
        JSONArray requestIds = new JSONArray();
        JSONArray detections = inbox.optJSONArray("detections");
        long cutoff = System.currentTimeMillis() - PrivateEventPolicy.TTL_MS;
        if (detections != null) for (int i = 0; i < detections.length(); i++) {
            JSONObject event = detections.getJSONObject(i); String id = event.optString("id");
            long occurred; try { occurred = Instant.parse(event.getString("occurredAt")).toEpochMilli(); } catch (Exception invalid) { continue; }
            if (id.matches("detection_[a-f0-9]{32}") && event.isNull("readAt") && occurred >= cutoff
                    && occurred <= System.currentTimeMillis() + 60_000 && notified.add(id)) detectionIds.put(id);
        }
        JSONArray exceptions = dashboard.optJSONArray("exceptions");
        if (exceptions != null) for (int i = 0; i < exceptions.length(); i++) {
            JSONObject exception = exceptions.getJSONObject(i); String id = exception.optString("id");
            if (id.matches("exception_[a-f0-9]{32}") && "pending".equals(exception.optString("state"))
                    && notified.add(id)) requestIds.put(id);
        }
        JSONArray supports = dashboard.optJSONArray("supports");
        if (supports != null) for (int i = 0; i < supports.length(); i++) {
            JSONObject support = supports.getJSONObject(i); String id = support.optString("id");
            if (id.matches("support_[a-f0-9]{32}") && "received".equals(support.optString("status"))
                    && notified.add(id)) requestIds.put(id);
        }
        synchronized (PrivateMonitoring.NOTIFICATION_LOCK) {
            if (requestIds.length() > 0 && watchStillCurrent(account)) {
                getSystemService(NotificationManager.class).notify(PrivateMonitoring.COMPANION_REQUEST_NOTIFICATION,
                        PrivateMonitoring.alert(this, "Ada permintaan peserta", "Buka Gempur untuk meninjau permintaan.").build());
                store.markNotified(pairId, requestIds);
            }
            if (detectionIds.length() > 0 && detectionAlerts.canPost(SystemClock.elapsedRealtime())
                    && watchStillCurrent(account)) {
                getSystemService(NotificationManager.class).notify(PrivateMonitoring.COMPANION_NOTIFICATION,
                        PrivateMonitoring.alert(this, "Ada temuan untuk ditinjau", "Buka Gempur untuk melihat temuan.")
                                .setOnlyAlertOnce(true).build());
                detectionAlerts.posted(SystemClock.elapsedRealtime());
                // Record only IDs submitted to Android. Deferred IDs remain eligible on later polls.
                store.markNotified(pairId, detectionIds);
            }
        }
        PrivateMonitoring.state(this, "companion_polling", "Pendamping diperiksa berkala sekitar 30 detik saat layanan terlihat. Notifikasi dapat tertunda.");
    }

    private boolean watchStillCurrent(JSONObject previous) throws Exception {
        if (!PrivateMonitoring.notificationsVisible(this)) { permissionLost(); return false; }
        if (!RUNNING.get() || !PrivateMonitoring.companionWatching(this)) return false;
        JSONObject account = new LocalStore(this).remoteContext();
        return "companion".equals(account.optString("role")) && account.optString("pairingId").equals(previous.optString("pairingId"))
                && account.optString("token").equals(previous.optString("token")) && account.optString("endpoint").equals(previous.optString("endpoint"))
                && account.optString("pendingRevocation").isEmpty();
    }
    private long backoff() { return Math.min(5 * 60_000L, 30_000L * (1L << Math.min(failures, 4))); }
    private void endGrant(JSONObject grant) throws Exception {
        if (new PrivateMonitorStore(this).disableIfCurrent(grant)) PrivateMonitoring.clearAllowances(this);
    }
    private void permissionLost() {
        PrivateMonitoring.stop(this);
        PrivateMonitoring.state(this, "notification_permission_required", "Izin/kanal notifikasi dinonaktifkan; pengiriman privat dan antrean dihentikan.");
        stopSelf();
    }
    @Override public void onDestroy() {
        RUNNING.set(false); if (worker != null) worker.shutdownNow();
        PrivateMonitoring.serviceStopped(this);
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}
