package id.gempur.engine;

import java.text.Normalizer;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Local, explainable decisions. Name-only suspicion is advisory, never an enforcement rule. */
public final class DetectionPolicy {
    private static final String GAME = "(?:slot|slots|casino|poker|judi|togel|baccarat|roulette)";
    private static final String PROMOTION = "(?:gacor|maxwin|jackpot|deposit|withdraw|taruhan|betting)";
    private static final Pattern GAME_WORD = Pattern.compile(GAME);
    private static final Pattern PROMOTION_WORD = Pattern.compile(PROMOTION);
    private static final Pattern COMPOUND = Pattern.compile("(?:" + GAME + PROMOTION + "|" + PROMOTION + GAME + ")(?:online|vip|app)?");
    private static final Set<String> CONTEXT = new HashSet<>(java.util.Arrays.asList(
            "education", "educational", "edukasi", "belajar", "learn", "learning", "tutorial",
            "research", "penelitian", "news", "berita", "analysis", "analisis", "museum", "simulator",
            "anti", "stop", "cegah", "pemulihan", "rehab", "recovery", "support", "help", "bantuan", "konseling"));
    private static final String[] HEURISTIC_EXEMPT_SUFFIXES = {"go.id", "ac.id", "sch.id", "gov", "edu",
            "bca.co.id", "bankmandiri.co.id", "bni.co.id", "bri.co.id"};
    private DetectionPolicy() {}

    public static final class Decision {
        public final boolean blocked;
        public final String reason, verdict;
        private Decision(boolean blocked, String reason, String verdict) {
            this.blocked = blocked; this.reason = reason; this.verdict = verdict;
        }
    }

    public static Decision unknown() { return new Decision(false, "unknown", "unknown"); }
    /** A learned lexical signal is advisory only; it never changes network enforcement. */
    public static Decision mlFlagged() { return new Decision(false, "ml_model", "suspected"); }

    /** Suppresses speculative ML review of protected or educational/news/support host names. */
    public static boolean canReviewDomain(String input) {
        final String domain;
        try { domain = DomainRules.normalize(input); } catch (IllegalArgumentException invalid) { return false; }
        if (isDiagnosticDomain(domain) || heuristicExemptDomain(domain)) return false;
        for (String word : domain.split("[^a-z]+")) {
            if (CONTEXT.contains(word)) return false;
        }
        return true;
    }

    public static boolean isDiagnosticDomain(String input) {
        if (input == null) return false;
        String value = input.trim().toLowerCase(Locale.ROOT);
        if (value.endsWith(".")) value = value.substring(0, value.length() - 1);
        if (value.length() > 253 || value.matches(".*[\\s/:?@#*\\\\].*")) return false;
        return value.equals("gempur-block.test") || value.endsWith(".gempur-block.test");
    }

    public static Decision evaluateDomain(String input, Collection<String> known,
            Collection<String> personal, Collection<String> exactAllowed, boolean heuristicEnabled) {
        String normalized = null;
        try { normalized = DomainRules.normalize(input); } catch (IllegalArgumentException invalid) { /* DNS service labels may still match a known parent. */ }
        // The reserved probe must remain blocked even if a caller supplies an exception.
        if (isDiagnosticDomain(input)) return new Decision(true, "known_rule", "known");
        if (normalized != null) {
            for (String allowed : safe(exactAllowed)) {
                if (normalized.equals(DomainRules.normalize(allowed))) return new Decision(false, "temporary_allowance", "allowed");
            }
        }
        if (DomainRules.fromLines(safe(known)).isBlocked(input)) return new Decision(true, "known_rule", "known");
        if (DomainRules.fromLines(safe(personal)).isBlocked(input)) return new Decision(true, "personal_rule", "personal");
        if (heuristicEnabled && normalized != null && !heuristicExemptDomain(normalized) && suspiciousName(normalized)) return new Decision(false, "name_heuristic", "suspected");
        return unknown();
    }

    // Defense in depth for essential/educational hosts. This only suppresses speculative name heuristics,
    // not an explicit known/personal rule; it is not a general assertion that these domains are safe.
    private static boolean heuristicExemptDomain(String domain) {
        for (String suffix : HEURISTIC_EXEMPT_SUFFIXES) if (domain.equals(suffix) || domain.endsWith("." + suffix)) return true;
        return false;
    }

    private static Collection<String> safe(Collection<String> input) { return input == null ? Collections.emptyList() : input; }

    /** Android application IDs are case-sensitive and are never URLs or paths. */
    public static String normalizePackage(String input) {
        if (input == null) throw new IllegalArgumentException("Nama paket diperlukan");
        String value = input.trim();
        if (value.length() > 255 || !value.matches("[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+")) {
            throw new IllegalArgumentException("Nama paket aplikasi tidak valid");
        }
        return value;
    }

    public static Decision evaluateApp(String packageName, String label, boolean excluded,
            boolean exactAllowed, boolean heuristicEnabled) {
        if (excluded) return new Decision(false, "critical_app", "unknown");
        try { normalizePackage(packageName); } catch (IllegalArgumentException invalid) { return unknown(); }
        if (exactAllowed) return new Decision(false, "temporary_allowance", "allowed");
        if (hasContext(packageName) || hasContext(label)) return unknown();
        if (heuristicEnabled && (suspiciousName(packageName) || suspiciousName(label))) {
            return new Decision(false, "name_heuristic", "suspected");
        }
        return unknown();
    }

    private static boolean hasContext(String input) {
        if (input == null || input.length() > 512) return false;
        String text = Normalizer.normalize(input, Normalizer.Form.NFKD).toLowerCase(Locale.ROOT).replaceAll("\\p{M}+", "");
        for (String word : text.split("[^a-z]+")) if (CONTEXT.contains(word)) return true;
        return false;
    }

    /** Requires a gaming term plus a distinct promotion/payment term; isolated words do not qualify. */
    private static boolean suspiciousName(String input) {
        if (input == null || input.length() > 512) return false;
        String text = Normalizer.normalize(input, Normalizer.Form.NFKD).toLowerCase(Locale.ROOT)
                .replaceAll("\\p{M}+", "");
        String[] words = text.split("[^a-z]+");
        boolean game = false, promotion = false, compound = false;
        for (String word : words) {
            if (CONTEXT.contains(word)) return false;
            game |= GAME_WORD.matcher(word).matches();
            promotion |= PROMOTION_WORD.matcher(word).matches();
            compound |= COMPOUND.matcher(word).matches();
        }
        return compound || (game && promotion);
    }
}
