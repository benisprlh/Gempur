package id.gempur.app;

import android.content.Context;
import id.gempur.engine.DetectionPolicy;
import id.gempur.engine.DomainRules;
import id.gempur.engine.LexicalDomainModel;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONObject;

/** Private-only, separately selected offline model. No model/content/target downloads. */
public final class DomainAiRepository {
    private static final String PREFS = "gempur-domain-ai";
    private static final Object LOCK = new Object();
    private static final int MAX_CACHE = 512;
    private static boolean loadAttempted;
    private static LexicalDomainModel model;
    private static final Map<String, LexicalDomainModel.Prediction> cache = new LinkedHashMap<String, LexicalDomainModel.Prediction>(32, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, LexicalDomainModel.Prediction> eldest) { return size() > MAX_CACHE; }
    };
    private DomainAiRepository() {}

    public static boolean enabled(Context context) {
        return BuildConfig.PRIVATE_BUILD && selected(context) && PrivateMonitoring.localEnabled(context);
    }
    private static boolean selected(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false); }
    public static void setEnabled(Context context, boolean enabled) {
        if (!BuildConfig.PRIVATE_BUILD) throw new IllegalStateException("AI lokal hanya tersedia pada APK privat.");
        if (enabled && !PrivateMonitoring.localEnabled(context)) throw new IllegalStateException("Aktifkan deteksi lokal yang terlihat terlebih dahulu.");
        if (enabled && loadModel(context) == null) throw new IllegalStateException("Model lokal tidak tersedia atau tidak valid. AI belum diaktifkan.");
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", enabled).commit()) throw new IllegalStateException("Pilihan AI belum tersimpan.");
        if (!enabled) synchronized (LOCK) { cache.clear(); }
    }
    public static LexicalDomainModel.Prediction predict(Context context, String input) {
        if (!enabled(context) || !DetectionPolicy.canReviewDomain(input)) return LexicalDomainModel.Prediction.abstain();
        final String domain;
        try { domain = PrivateEventPolicy.target("domain", DomainRules.normalize(input)); }
        catch (IllegalArgumentException diagnosticsOrInvalid) { return LexicalDomainModel.Prediction.abstain(); }
        LexicalDomainModel loaded = loadModel(context);
        if (loaded == null) return LexicalDomainModel.Prediction.abstain();
        synchronized (LOCK) {
            LexicalDomainModel.Prediction prediction = cache.get(domain);
            if (prediction == null) { prediction = loaded.predict(domain); cache.put(domain, prediction); }
            return prediction;
        }
    }
    public static JSONObject status(Context context) {
        LexicalDomainModel loaded = loadModel(context);
        try {
            return new JSONObject().put("enabled", enabled(context)).put("selected", selected(context))
                    .put("modelAvailable", loaded != null).put("modelVersion", loaded == null ? "" : loaded.modelVersion)
                    .put("advisoryOnly", true).put("threshold", loaded == null ? 1 : loaded.reviewThreshold)
                    .put("featureCount", loaded == null ? 0 : loaded.featureCount)
                    .put("limit", "Skor pola nama domain, bukan kepastian atau probabilitas judi. AI hanya memberi tanda tinjauan, tidak memblokir. Nama/paket aplikasi dan isi halaman tidak dianalisis. Dukungan fitur rendah membuat model abstain.");
        } catch (org.json.JSONException impossible) { throw new IllegalStateException("Status AI belum dapat dibaca.", impossible); }
    }
    private static LexicalDomainModel loadModel(Context context) {
        synchronized (LOCK) {
            if (loadAttempted) return model;
            loadAttempted = true;
            try {
                JSONObject manifest;
                try (InputStream source = context.getAssets().open("ml/manifest.json")) { manifest = new JSONObject(new String(read(source, 65536), StandardCharsets.UTF_8)); }
                if (manifest.getInt("schemaVersion") != 1 || !"domain-model.tsv".equals(manifest.getString("modelFile"))
                        || manifest.getBoolean("autoQuarantineEligible")) throw new IllegalArgumentException("Unsupported advisory model manifest");
                byte[] bytes;
                try (InputStream source = context.getAssets().open("ml/domain-model.tsv")) { bytes = read(source, LexicalDomainModel.MAX_MODEL_BYTES); }
                if (manifest.getLong("modelBytes") != bytes.length || !digest(bytes).equals(manifest.getString("modelSha256"))) throw new IllegalArgumentException("Model integrity mismatch");
                LexicalDomainModel candidate = LexicalDomainModel.load(new ByteArrayInputStream(bytes));
                if (!candidate.modelVersion.equals(manifest.getString("modelVersion")) || candidate.featureCount != manifest.getInt("featureCount")
                        || Double.compare(candidate.reviewThreshold, manifest.getDouble("reviewThreshold")) != 0) throw new IllegalArgumentException("Model metadata mismatch");
                model = candidate;
            } catch (Exception absentOrInvalid) { model = null; } // Do not invent safety or reset user data.
            return model;
        }
    }
    private static byte[] read(InputStream source, int maximum) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = source.read(buffer)) != -1) { if (count == 0) continue; if (bytes.size() > maximum - count) throw new IllegalArgumentException("AI asset exceeds limit"); bytes.write(buffer, 0, count); }
        return bytes.toByteArray();
    }
    private static String digest(byte[] bytes) throws Exception {
        byte[] value = MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder output = new StringBuilder(64);
        for (byte item : value) output.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
        return output.toString();
    }
}
