package id.gempur.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Separate private-trial vault. Every transaction reloads under one process-wide lock. */
final class PrivateMonitorStore {
    private static final Object LOCK = new Object();
    private static final String KEY_ALIAS = "gempur.private.monitor.v1";
    private static final long SEEN_TTL = 7L * 24 * 60 * 60 * 1000;
    private final AtomicFile file;
    interface Transaction<T> { T apply(JSONObject value) throws Exception; }

    PrivateMonitorStore(Context context) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "private-monitor.v1"));
    }

    private <T> T transaction(boolean save, Transaction<T> action) throws Exception {
        synchronized (LOCK) {
            JSONObject value = load();
            boolean pruned = prune(value, System.currentTimeMillis());
            T result = action.apply(value);
            if (save || pruned) write(value);
            return result;
        }
    }

    long epoch() throws Exception { return transaction(false, value -> value.optLong("epoch", 0)); }
    JSONObject sharing() throws Exception { return transaction(false, value -> copy(value.optJSONObject("sharing"))); }

    boolean enable(long expectedEpoch, String pairingId, int consentVersion, int automationVersion, JSONArray scopes, String endpoint, String accountId) throws Exception {
        if (pairingId == null || !pairingId.matches("pair_[a-f0-9]{32}") || consentVersion < 1 || automationVersion < 1) {
            throw new IllegalArgumentException("Pairing/grant belum valid");
        }
        Set<String> kinds = new HashSet<>();
        for (int i = 0; i < scopes.length(); i++) {
            String kind = scopes.getString(i);
            if (!kind.equals("domain") && !kind.equals("app")) throw new IllegalArgumentException("Cakupan berbagi tidak valid");
            kinds.add(kind);
        }
        if (kinds.isEmpty() || kinds.size() != scopes.length()) throw new IllegalArgumentException("Pilih cakupan berbagi");
        JSONArray normalized = new JSONArray(); if (kinds.contains("domain")) normalized.put("domain"); if (kinds.contains("app")) normalized.put("app");
        return transaction(true, value -> {
            if (value.optLong("epoch", 0) != expectedEpoch) return false;
            JSONObject pending = value.optJSONObject("pendingServerOff");
            if (pending != null && !pending.optString("pairingId").isEmpty()) throw new IllegalStateException("Sinkronkan penghentian berbagi sebelumnya terlebih dahulu");
            JSONObject next = new JSONObject().put("enabled", true).put("pairingId", pairingId)
                    .put("consentVersion", consentVersion).put("automationVersion", automationVersion).put("scopes", normalized)
                    .put("endpoint", endpoint).put("accountId", accountId);
            JSONObject old = value.optJSONObject("sharing");
            if (sameGrant(old, next) && normalized.toString().equals(old.optJSONArray("scopes").toString())) return true;
            clearBindings(value);
            value.put("sharing", next).put("epoch", value.optLong("epoch", 0) + 1);
            return true;
        });
    }

    void disable() throws Exception { transaction(true, value -> { disable(value); return null; }); }
    boolean disableIfCurrent(JSONObject grant) throws Exception {
        return transaction(true, value -> { if (sameGrant(value.optJSONObject("sharing"), grant)) { disable(value); return true; } return false; });
    }
    private static void disable(JSONObject value) throws Exception {
        JSONObject grant = value.optJSONObject("sharing");
        if (grant != null && grant.optBoolean("enabled") && value.optJSONObject("pendingServerOff") == null) {
            value.put("pendingServerOff", new JSONObject().put("pairingId", grant.getString("pairingId"))
                    .put("endpoint", grant.getString("endpoint")).put("deviceId", grant.getString("accountId"))
                    .put("automationVersion", grant.getInt("automationVersion")).put("revocationId", UUID.randomUUID().toString()));
        }
        clearBindings(value);
        value.put("sharing", new JSONObject().put("enabled", false)).put("epoch", value.optLong("epoch", 0) + 1);
    }
    JSONObject pendingServerOff() throws Exception {
        return transaction(false, value -> {
            JSONObject pending = value.optJSONObject("pendingServerOff");
            return pending == null ? new JSONObject() : new JSONObject(pending.toString());
        });
    }
    void acknowledgeServerOff(JSONObject expected) throws Exception {
        transaction(true, value -> {
            JSONObject pending = value.optJSONObject("pendingServerOff");
            if (pending != null && expected != null && !expected.optString("revocationId").isEmpty()
                    && pending.optString("revocationId").equals(expected.optString("revocationId"))
                    && pending.optString("pairingId").equals(expected.optString("pairingId"))
                    && pending.optString("endpoint").equals(expected.optString("endpoint"))
                    && pending.optString("deviceId").equals(expected.optString("deviceId"))
                    && pending.optInt("automationVersion") == expected.optInt("automationVersion")) {
                value.remove("pendingServerOff"); value.put("epoch", value.optLong("epoch", 0) + 1);
            }
            return null;
        });
    }
    private static void clearBindings(JSONObject value) throws Exception {
        JSONArray events = value.optJSONArray("events");
        if (events == null) return;
        for (int i = 0; i < events.length(); i++) { JSONObject event = events.getJSONObject(i); event.remove("grant"); event.remove("upload"); event.put("pending", false); }
    }
    static boolean sameGrant(JSONObject left, JSONObject right) {
        return left != null && right != null && left.optBoolean("enabled") && right.optBoolean("enabled")
                && left.optString("pairingId").equals(right.optString("pairingId"))
                && left.optString("endpoint").equals(right.optString("endpoint")) && left.optString("accountId").equals(right.optString("accountId"))
                && left.optInt("consentVersion") == right.optInt("consentVersion")
                && left.optInt("automationVersion") == right.optInt("automationVersion");
    }
    static boolean hasScope(JSONObject grant, String kind) {
        if (grant == null || !grant.optBoolean("enabled")) return false;
        JSONArray scopes = grant.optJSONArray("scopes"); if (scopes == null) return false;
        for (int i = 0; i < scopes.length(); i++) if (kind.equals(scopes.optString(i))) return true;
        return false;
    }

    boolean record(String kind, String target, String reason, String verdict, String action) throws Exception {
        String normalized = PrivateEventPolicy.target(kind, target); PrivateEventPolicy.validate(reason, verdict, action);
        final long now = System.currentTimeMillis(), bucket = PrivateEventPolicy.bucket(now);
        return transaction(true, value -> {
            JSONArray events = value.optJSONArray("events"); if (events == null) events = new JSONArray();
            JSONObject grant = value.optJSONObject("sharing");
            for (int i = events.length() - 1; i >= 0; i--) {
                JSONObject old = events.getJSONObject(i);
                boolean bindingMatches = hasScope(grant, kind) ? sameGrant(old.optJSONObject("grant"), grant) : old.optJSONObject("grant") == null;
                if (old.optLong("bucket") == bucket && kind.equals(old.optString("kind")) && normalized.equals(old.optString("target"))
                        && reason.equals(old.optString("reason")) && verdict.equals(old.optString("verdict")) && action.equals(old.optString("action")) && bindingMatches) {
                    // A frozen upload is immutable across retries. Later burst counts are local only.
                    old.put("count", Math.min(1000, old.optInt("count", 1) + 1));
                    return false;
                }
            }
            JSONObject event = new JSONObject().put("eventId", UUID.randomUUID().toString()).put("kind", kind).put("target", normalized)
                    .put("reason", reason).put("verdict", verdict).put("action", action).put("occurredAt", Instant.ofEpochMilli(bucket).toString())
                    .put("createdAtMs", now).put("bucket", bucket).put("count", 1).put("pending", false).put("serverAccepted", false);
            if (hasScope(grant, kind)) event.put("grant", copy(grant)).put("pending", true);
            events.put(event);
            while (events.length() > PrivateEventPolicy.MAX_EVENTS) {
                events.remove(0); value.put("overflowCount", value.optLong("overflowCount", 0) + 1);
            }
            value.put("events", events); return true;
        });
    }

    JSONArray batch(JSONObject grant) throws Exception {
        return transaction(true, value -> {
            JSONArray batch = new JSONArray();
            if (!sameGrant(value.optJSONObject("sharing"), grant)) return batch;
            JSONArray events = value.optJSONArray("events"); if (events == null) return batch;
            for (int i = 0; i < events.length() && batch.length() < 10; i++) {
                JSONObject event = events.getJSONObject(i);
                if (!event.optBoolean("pending") || !sameGrant(event.optJSONObject("grant"), grant) || !hasScope(grant, event.optString("kind"))) continue;
                JSONObject upload = event.optJSONObject("upload");
                if (upload == null) {
                    upload = new JSONObject();
                    for (String key : new String[]{"eventId", "kind", "target", "reason", "verdict", "action", "occurredAt", "count"}) upload.put(key, event.get(key));
                    event.put("upload", upload);
                }
                batch.put(copy(upload));
            }
            return batch;
        });
    }

    void accepted(JSONObject grant, JSONArray ids) throws Exception {
        Set<String> accepted = new HashSet<>(); for (int i = 0; i < ids.length(); i++) accepted.add(ids.getString(i));
        transaction(true, value -> {
            if (!sameGrant(value.optJSONObject("sharing"), grant)) return null;
            JSONArray events = value.optJSONArray("events"); if (events == null) return null;
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.getJSONObject(i);
                if (sameGrant(event.optJSONObject("grant"), grant) && accepted.contains(event.optString("eventId"))) event.put("pending", false).put("serverAccepted", true);
            }
            return null;
        });
    }

    JSONArray events() throws Exception {
        return transaction(false, value -> {
            JSONArray result = new JSONArray(), events = value.optJSONArray("events");
            if (events == null) return result;
            for (int i = events.length() - 1; i >= 0; i--) {
                JSONObject event = events.getJSONObject(i), item = new JSONObject();
                for (String key : new String[]{"eventId", "kind", "target", "reason", "verdict", "action", "occurredAt", "count", "pending", "serverAccepted"}) item.put(key, event.get(key));
                result.put(item);
            }
            return result;
        });
    }
    long overflow() throws Exception { return transaction(false, value -> value.optLong("overflowCount", 0)); }

    Set<String> notified(String pairingId) throws Exception {
        return transaction(false, value -> {
            Set<String> result = new HashSet<>(); JSONArray seen = value.optJSONArray("notified");
            if (seen != null) for (int i = 0; i < seen.length(); i++) { JSONObject item = seen.getJSONObject(i); if (pairingId.equals(item.optString("pairingId"))) result.add(item.getString("id")); }
            return result;
        });
    }
    void markNotified(String pairingId, JSONArray ids) throws Exception {
        transaction(true, value -> {
            JSONArray seen = value.optJSONArray("notified"); if (seen == null) seen = new JSONArray();
            for (int i = 0; i < ids.length(); i++) seen.put(new JSONObject().put("id", ids.getString(i)).put("pairingId", pairingId).put("at", System.currentTimeMillis()));
            while (seen.length() > 500) seen.remove(0);
            value.put("notified", seen); return null;
        });
    }

    void clear() throws Exception {
        synchronized (LOCK) {
            JSONObject old = load(); disable(old);
            JSONObject cleared = new JSONObject().put("epoch", old.optLong("epoch", 0)).put("sharing", new JSONObject().put("enabled", false));
            JSONObject pending = old.optJSONObject("pendingServerOff");
            if (pending != null) cleared.put("pendingServerOff", pending);
            write(cleared);
        }
    }

    private static boolean prune(JSONObject value, long now) throws Exception {
        JSONArray old = value.optJSONArray("events"), kept = new JSONArray();
        int originalEvents = old == null ? 0 : old.length();
        if (old != null) for (int i = 0; i < old.length(); i++) {
            JSONObject event = old.getJSONObject(i); if (PrivateEventPolicy.fresh(event.optLong("bucket", event.optLong("createdAtMs", 0)), now)) kept.put(event);
        }
        value.put("events", kept);
        boolean changed = kept.length() != originalEvents;
        old = value.optJSONArray("notified"); kept = new JSONArray();
        int originalSeen = old == null ? 0 : old.length();
        if (old != null) for (int i = 0; i < old.length(); i++) { JSONObject item = old.getJSONObject(i); if (item.optLong("at") >= now - SEEN_TTL && item.optLong("at") <= now + 60_000) kept.put(item); }
        value.put("notified", kept);
        return changed || kept.length() != originalSeen;
    }
    private JSONObject load() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return new JSONObject();
        byte[] raw = file.readFully(); if (raw.length > 512 * 1024) throw new IllegalStateException("Private vault too large");
        JSONObject envelope = new JSONObject(new String(raw, StandardCharsets.UTF_8));
        if (envelope.getInt("version") != 1) throw new IllegalStateException("Private vault version unsupported");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }
    private void write(JSONObject value) throws Exception {
        byte[] plaintext = value.toString().getBytes(StandardCharsets.UTF_8);
        if (plaintext.length > 350 * 1024) throw new IllegalStateException("Private vault capacity exceeded");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject envelope = new JSONObject().put("version", 1).put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .put("data", Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP));
        FileOutputStream out = null;
        try { out = file.startWrite(); out.write(envelope.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(out); }
        catch (Exception failure) { if (out != null) file.failWrite(out); throw failure; }
    }
    private static SecretKey key() throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        if (keys.containsAlias(KEY_ALIAS)) return (SecretKey) keys.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private static JSONObject copy(JSONObject value) throws Exception { return value == null ? new JSONObject().put("enabled", false) : new JSONObject(value.toString()); }
}
