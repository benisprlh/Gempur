package id.gempur.app;

import android.content.Context;
import id.gempur.engine.DetectionPolicy;
import org.json.JSONArray;

/** Ordinary builds contain no installed-app scanner or Accessibility app guard. */
public final class AppRiskRepository {
    private AppRiskRepository() {}

    public static DetectionPolicy.Decision evaluate(Context context, String packageName) {
        return DetectionPolicy.unknown();
    }

    public static JSONArray scan(Context context) { return new JSONArray(); }

    public static void temporaryAllow(Context context, String packageName, long expiresAt) {
        throw new IllegalStateException("Koreksi aplikasi hanya tersedia pada uji privat");
    }

    public static void clearTemporaryAllowances(Context context) { /* No private app allowance exists here. */ }
}
