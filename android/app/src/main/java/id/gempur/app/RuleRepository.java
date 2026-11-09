package id.gempur.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AtomicFile;
import android.util.Base64;
import id.gempur.engine.DetectionPolicy;
import id.gempur.engine.DomainRules;
import id.gempur.engine.TemporaryAllowance;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Local seed/custom rules. Remote updates require a separately provisioned pinned release key. */
public final class RuleRepository {
    private static final String PREFS = "gempur-rules";
    private static final int MAX_PAYLOAD = 5 * 1024 * 1024;
    private static final String KEY_ASSET = "rules-public.pem";
    private RuleRepository() {}

    public static synchronized DomainRules load(Context context) {
        List<String> lines = trusted(context);
        lines.addAll(list(context));
        return DomainRules.withExactExceptions(lines, activeExceptions(context));
    }

    public static DetectionPolicy.Decision evaluate(Context context, String domain) {
        // Read the private store before taking the rules lock; stop/revoke may clear rules after updating consent.
        boolean heuristicEnabled = BuildConfig.PRIVATE_BUILD && PrivateMonitoring.localEnabled(context);
        synchronized (RuleRepository.class) {
            return DetectionPolicy.evaluateDomain(domain, trusted(context), list(context), activeExceptions(context), heuristicEnabled);
        }
    }

    private static List<String> activeExceptions(Context context) {
        List<String> exceptions = new ArrayList<>();
        try {
            JSONObject saved = new JSONObject(prefs(context).getString("temporary_allowance", "{}"));
            TemporaryAllowance allowance = new TemporaryAllowance(saved.getString("domain"), saved.getLong("createdWall"),
                    saved.getLong("createdElapsed"), saved.getLong("expiresWall"), saved.getInt("bootId"));
            if (!DetectionPolicy.isDiagnosticDomain(allowance.domain)
                    && allowance.isActive(System.currentTimeMillis(), SystemClock.elapsedRealtime(), bootId(context))) exceptions.add(allowance.domain);
        } catch (Exception absentOrExpired) { /* No active exception. */ }
        return exceptions;
    }

    private static List<String> trusted(Context context) {
        List<String> lines = bundled(context);
        try {
            JSONObject envelope = new JSONObject(new String(read(new AtomicFile(new File(context.getFilesDir(), "rules-signed.json")).openRead(), MAX_PAYLOAD * 2), StandardCharsets.UTF_8));
            byte[] payload = Base64.decode(envelope.getString("payload"), Base64.DEFAULT);
            byte[] signature = Base64.decode(envelope.getString("signature"), Base64.DEFAULT);
            JSONObject candidate = verify(context, payload, signature);
            long candidateVersion = candidate.getLong("version");
            long installedVersion = prefs(context).getLong("signed_version", 0);
            if (candidateVersion >= installedVersion) lines = domains(candidate);
        } catch (Exception unavailableOrInvalid) {
            // Bundled rules are trusted as part of the signed APK; never accept unverified network data.
        }
        // Diagnostics must remain local and safe even when an updated list omits the fixture.
        if (!lines.contains("gempur-block.test")) lines.add("gempur-block.test");
        return lines;
    }

    public static List<String> list(Context context) {
        Set<String> saved = prefs(context).getStringSet("custom_domains", Collections.emptySet());
        List<String> output = new ArrayList<>(saved);
        Collections.sort(output);
        return output;
    }

    public static synchronized void add(Context context, String input) {
        String domain = DomainRules.normalize(input);
        Set<String> saved = new LinkedHashSet<>(list(context));
        if (saved.size() >= 1000 && !saved.contains(domain)) throw new IllegalArgumentException("Maksimal 1.000 domain tambahan");
        saved.add(domain);
        if (!prefs(context).edit().putStringSet("custom_domains", saved).commit()) throw new IllegalStateException("Aturan gagal disimpan");
    }

    public static synchronized void remove(Context context, String input) {
        Set<String> saved = new LinkedHashSet<>(list(context)); saved.remove(DomainRules.normalize(input));
        if (!prefs(context).edit().putStringSet("custom_domains", saved).commit()) throw new IllegalStateException("Aturan gagal disimpan");
    }

    public static int bundledCount(Context context) { return DomainRules.fromLines(bundled(context)).size(); }
    public static boolean isBundledDomain(Context context, String domain) {
        return DomainRules.fromLines(trusted(context)).isBlocked(domain);
    }

    public static synchronized void temporaryAllow(Context context, String domain, long expiresAt) {
        String normalized = DomainRules.normalize(domain);
        if (DetectionPolicy.isDiagnosticDomain(normalized)) throw new IllegalArgumentException("Domain diagnostik tidak dapat dikecualikan");
        if (!BuildConfig.PRIVATE_BUILD && isBundledDomain(context, normalized)) throw new IllegalArgumentException("Domain judi yang dikenal tidak dapat dikecualikan");
        TemporaryAllowance allowance = new TemporaryAllowance(normalized, System.currentTimeMillis(), SystemClock.elapsedRealtime(), expiresAt, bootId(context));
        try {
            JSONObject saved = new JSONObject();
            saved.put("domain", allowance.domain); saved.put("createdWall", allowance.createdWall);
            saved.put("createdElapsed", allowance.createdElapsed); saved.put("expiresWall", allowance.expiresWall); saved.put("bootId", allowance.bootId);
            if (!prefs(context).edit().putString("temporary_allowance", saved.toString()).commit()) throw new IllegalStateException("Pengecualian gagal disimpan");
        } catch (org.json.JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    public static synchronized void clearTemporaryAllowances(Context context) {
        if (!prefs(context).edit().remove("temporary_allowance").commit()) throw new IllegalStateException("Pencabutan pengecualian belum tersimpan");
    }
    private static int bootId(Context context) { return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
    public static int ruleCount(Context context) { return load(context).size(); }
    public static long signedVersion(Context context) {
        long version = prefs(context).getLong("signed_version", 0);
        try {
            JSONObject envelope = new JSONObject(new String(read(new AtomicFile(new File(context.getFilesDir(), "rules-signed.json")).openRead(), MAX_PAYLOAD * 2), StandardCharsets.UTF_8));
            JSONObject checked = verify(context, Base64.decode(envelope.getString("payload"), Base64.DEFAULT), Base64.decode(envelope.getString("signature"), Base64.DEFAULT));
            version = Math.max(version, checked.getLong("version"));
        } catch (Exception unavailable) { /* Stored monotonic floor remains even if the file cannot be read. */ }
        return version;
    }

    public static boolean signedUpdatesConfigured(Context context) {
        try (InputStream input = context.getAssets().open(KEY_ASSET)) { return input.read() >= 0; }
        catch (Exception absent) { return false; }
    }

    /** Called only after an intentional import/download; key is never supplied by the incoming bundle. */
    public static synchronized void installSigned(Context context, byte[] payload, byte[] signature) throws Exception {
        JSONObject candidate = verify(context, payload, signature);
        long version = candidate.getLong("version");
        if (version <= signedVersion(context)) throw new SecurityException("Versi aturan lama atau sudah dipasang");
        List<String> checked = domains(candidate);
        if (checked.isEmpty()) throw new SecurityException("Daftar kosong ditolak");
        JSONObject envelope = new JSONObject();
        envelope.put("payload", Base64.encodeToString(payload, Base64.NO_WRAP));
        envelope.put("signature", Base64.encodeToString(signature, Base64.NO_WRAP));
        AtomicFile file = new AtomicFile(new File(context.getFilesDir(), "rules-signed.json"));
        FileOutputStream output = null;
        try {
            output = file.startWrite(); output.write(envelope.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(output);
        } catch (Exception failed) { if (output != null) file.failWrite(output); throw failed; }
        if (!prefs(context).edit().putLong("signed_version", version).commit()) {
            throw new IllegalStateException("Aturan tersimpan tetapi metadata versi belum tersimpan; coba buka ulang");
        }
    }

    private static JSONObject verify(Context context, byte[] payload, byte[] signatureBytes) throws Exception {
        if (payload == null || payload.length == 0 || payload.length > MAX_PAYLOAD || signatureBytes == null || signatureBytes.length > 2048) throw new SecurityException("Paket aturan tidak valid");
        String pem;
        try { pem = new String(read(context.getAssets().open(KEY_ASSET), 16384), StandardCharsets.US_ASCII); }
        catch (Exception absent) { throw new SecurityException("Kunci pembaruan rilis belum dikonfigurasi", absent); }
        byte[] der = Base64.decode(pem.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", ""), Base64.DEFAULT);
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der)));
        verifier.update(payload);
        if (!verifier.verify(signatureBytes)) throw new SecurityException("Tanda tangan aturan tidak valid");
        JSONObject parsed = new JSONObject(new String(payload, StandardCharsets.UTF_8));
        if (parsed.getLong("version") < 1) throw new SecurityException("Versi harus positif");
        domains(parsed); return parsed;
    }

    private static List<String> domains(JSONObject parsed) throws Exception {
        JSONArray array = parsed.getJSONArray("domains");
        if (array.length() > 100000) throw new SecurityException("Terlalu banyak aturan");
        List<String> output = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) output.add(DomainRules.normalize(array.getString(i)));
        return output;
    }

    private static List<String> bundled(Context context) {
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(context.getAssets().open("domains.txt"), StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (!trimmed.isEmpty() && !trimmed.startsWith("#")) lines.add(DomainRules.normalize(trimmed));
            }
        } catch (Exception failed) { throw new IllegalStateException("Daftar blok bawaan tidak dapat dibaca", failed); }
        return lines;
    }

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static byte[] read(InputStream stream, int limit) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > limit) throw new SecurityException("Paket terlalu besar");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }
}
