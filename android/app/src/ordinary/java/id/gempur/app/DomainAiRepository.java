package id.gempur.app;

import android.content.Context;
import id.gempur.engine.LexicalDomainModel;
import org.json.JSONObject;

/** Ordinary builds have no model assets or AI activation path. */
public final class DomainAiRepository {
    private DomainAiRepository() {}
    public static boolean enabled(Context context) { return false; }
    static Object observationConsent(Context context) { return null; }
    public static void setEnabled(Context context, boolean enabled) {
        if (enabled) throw new IllegalStateException("AI lokal hanya tersedia pada APK privat.");
    }
    public static LexicalDomainModel.Prediction predict(Context context, String domain) { return LexicalDomainModel.Prediction.abstain(); }
    public static JSONObject status(Context context) {
        try { return new JSONObject().put("enabled", false).put("selected", false).put("modelAvailable", false)
                .put("modelVersion", "").put("advisoryOnly", true).put("threshold", 1).put("featureCount", 0)
                .put("limit", "AI lokal tidak tersedia pada build biasa."); }
        catch (org.json.JSONException impossible) { throw new IllegalStateException(impossible); }
    }
}
