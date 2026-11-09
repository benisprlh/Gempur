package id.gempur.engine;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/** Immutable offline lexical risk model. Scores are not asserted category probabilities. */
public final class LexicalDomainModel {
    public static final int MAX_MODEL_BYTES = 2 * 1024 * 1024;
    public static final int MAX_FEATURES = 24000;
    private static final Pattern NUMBER = Pattern.compile("[-+]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?");
    private static final Pattern FEATURE = Pattern.compile("[a-z0-9.^$-]{3,5}");
    public final String modelVersion;
    public final double reviewThreshold;
    public final int featureCount;
    private final double intercept;
    private final Map<String, Double> weights;

    private LexicalDomainModel(String version, double threshold, double intercept, Map<String, Double> weights) {
        this.modelVersion = version;
        this.reviewThreshold = threshold;
        this.intercept = intercept;
        this.weights = Collections.unmodifiableMap(new HashMap<>(weights));
        this.featureCount = weights.size();
    }

    public static final class Prediction {
        public final double score;
        public final int matchedFeatures, totalFeatures;
        public final boolean abstained, flagged;
        public final String modelVersion;
        private Prediction(double score, int matched, int total, boolean abstained, boolean flagged, String version) {
            this.score = score; this.matchedFeatures = matched; this.totalFeatures = total;
            this.abstained = abstained; this.flagged = flagged; this.modelVersion = version;
        }
        public static Prediction abstain() { return new Prediction(Double.NaN, 0, 0, true, false, ""); }
    }
    public static Prediction abstain() { return Prediction.abstain(); }

    /** The caller owns the stream. No deserialization, code loading, or network access. */
    public static LexicalDomainModel load(InputStream input) throws IOException {
        if (input == null) throw new IllegalArgumentException("Model stream required");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int size;
        while ((size = input.read(buffer)) != -1) {
            if (size == 0) continue;
            if (output.size() > MAX_MODEL_BYTES - size) throw new IllegalArgumentException("Model exceeds byte limit");
            for (int i = 0; i < size; i++) {
                int c = buffer[i] & 255;
                if (c > 126 || (c < 32 && c != '\n' && c != '\r' && c != '\t')) throw new IllegalArgumentException("Model must be bounded ASCII TSV");
            }
            output.write(buffer, 0, size);
        }
        String raw = new String(output.toByteArray(), StandardCharsets.US_ASCII);
        String[] rows = raw.split("\\r?\\n", -1);
        int length = rows.length;
        if (length > 0 && rows[length - 1].isEmpty()) length--;
        if (length < 10 || !"GEMPUR_DOMAIN_MODEL_V1".equals(rows[0])) throw new IllegalArgumentException("Unsupported model format");
        String version = header(rows[1], "model_version");
        if (!version.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,79}")) throw new IllegalArgumentException("Invalid model version");
        if (!"3".equals(header(rows[2], "min_ngram")) || !"5".equals(header(rows[3], "max_ngram"))) throw new IllegalArgumentException("Unsupported feature extraction");
        double bias = number(header(rows[4], "intercept"), 100);
        double threshold = number(header(rows[5], "review_threshold"), 1);
        if (threshold < 0 || !"0.30".equals(header(rows[6], "min_coverage")) || !"10".equals(header(rows[7], "min_matched"))
                || !"false".equals(header(rows[8], "auto_quarantine"))) throw new IllegalArgumentException("Unsupported model policy");
        String countText = header(rows[9], "features");
        if (!countText.matches("[1-9][0-9]{0,4}")) throw new IllegalArgumentException("Invalid feature count");
        int count = Integer.parseInt(countText);
        if (count > MAX_FEATURES || length != 10 + count) throw new IllegalArgumentException("Feature count does not match bounded model");
        Map<String, Double> weights = new HashMap<>();
        for (int i = 10; i < length; i++) {
            String[] pair = rows[i].split("\\t", -1);
            if (pair.length != 2 || !validFeature(pair[0]) || weights.containsKey(pair[0])) throw new IllegalArgumentException("Invalid or duplicate feature");
            weights.put(pair[0], number(pair[1], 100));
        }
        return new LexicalDomainModel(version, threshold, bias, weights);
    }

    private static String header(String row, String name) {
        String[] pair = row.split("\\t", -1);
        if (pair.length != 2 || !name.equals(pair[0])) throw new IllegalArgumentException("Invalid model header");
        return pair[1];
    }
    private static double number(String input, double maximum) {
        if (input.length() > 64 || !NUMBER.matcher(input).matches()) throw new IllegalArgumentException("Invalid model number");
        double value;
        try { value = Double.parseDouble(input); } catch (NumberFormatException invalid) { throw new IllegalArgumentException("Invalid model number", invalid); }
        if (!Double.isFinite(value) || Math.abs(value) > maximum) throw new IllegalArgumentException("Model number outside bounds");
        return value;
    }
    private static boolean validFeature(String feature) {
        if (!FEATURE.matcher(feature).matches()) return false;
        int start = feature.indexOf('^'), finish = feature.indexOf('$');
        return (start == -1 || (start == 0 && feature.lastIndexOf('^') == 0))
                && (finish == -1 || (finish == feature.length() - 1 && feature.lastIndexOf('$') == finish));
    }

    public Prediction predict(String input) {
        final String domain;
        try { domain = DomainRules.normalize(input); } catch (IllegalArgumentException invalid) { return Prediction.abstain(); }
        String bounded = "^" + domain + "$";
        // Match the export verifier's lexical summation order for deterministic cross-runtime scores.
        Set<String> features = new TreeSet<>();
        for (int n = 3; n <= 5; n++) for (int i = 0; i <= bounded.length() - n; i++) features.add(bounded.substring(i, i + n));
        double sum = intercept; int matched = 0;
        for (String feature : features) {
            Double weight = weights.get(feature);
            if (weight != null) { sum += weight; matched++; }
        }
        double score = sum >= 0 ? 1.0 / (1.0 + Math.exp(-sum)) : Math.exp(sum) / (1.0 + Math.exp(sum));
        boolean abstained = matched < 10 || features.isEmpty() || ((double) matched / features.size()) < 0.30;
        // Threshold 1 is an explicit disabled-review sentinel, even if sigmoid rounds to 1.
        boolean flagged = !abstained && reviewThreshold < 1 && score >= reviewThreshold;
        return new Prediction(score, matched, features.size(), abstained, flagged, modelVersion);
    }
}
