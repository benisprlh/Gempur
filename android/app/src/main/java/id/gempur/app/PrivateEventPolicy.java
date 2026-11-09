package id.gempur.app;

import id.gempur.engine.DomainRules;
import java.util.Locale;

/** Pure validation shared by the private queue; does not inspect page or app contents. */
public final class PrivateEventPolicy {
    public static final long TTL_MS = 24L * 60 * 60 * 1000;
    public static final long BUCKET_MS = 5L * 60 * 1000;
    public static final int MAX_EVENTS = 100;
    private PrivateEventPolicy() {}

    public static String target(String kind, String input) {
        if (input == null || input.length() > 253) throw new IllegalArgumentException("Invalid detection target");
        if ("domain".equals(kind)) {
            String domain = DomainRules.normalize(input);
            if (domain.equals("example.com") || domain.endsWith(".example.com")
                    || domain.equals("example.net") || domain.endsWith(".example.net")
                    || domain.equals("example.org") || domain.endsWith(".example.org")
                    || domain.endsWith(".test") || domain.endsWith(".invalid")
                    || domain.endsWith(".example") || domain.endsWith(".localhost")) {
                throw new IllegalArgumentException("Synthetic diagnostics are not activity events");
            }
            return domain;
        }
        if (!"app".equals(kind) || !input.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")) {
            throw new IllegalArgumentException("Invalid application package");
        }
        String lower = input.toLowerCase(Locale.ROOT);
        if (lower.equals("com.example") || lower.startsWith("com.example.")
                || lower.equals("com.gempur") || lower.startsWith("com.gempur.")
                || lower.equals("id.gempur") || lower.startsWith("id.gempur.")
                || lower.startsWith("test.") || lower.startsWith("example.") || lower.startsWith("invalid.") || lower.startsWith("localhost.")) {
            throw new IllegalArgumentException("Diagnostic packages are not activity events");
        }
        return input;
    }

    public static void validate(String reason, String verdict, String action) {
        if (!("known_rule".equals(reason) && "known".equals(verdict))
                && !("personal_rule".equals(reason) && "personal".equals(verdict))
                && !("name_heuristic".equals(reason) && "suspected".equals(verdict))) {
            throw new IllegalArgumentException("Detection reason and verdict disagree");
        }
        if (!"blocked".equals(action) && !"flagged".equals(action)) throw new IllegalArgumentException("Invalid detection action");
    }

    public static long bucket(long now) { return Math.floorDiv(now, BUCKET_MS) * BUCKET_MS; }
    public static boolean fresh(long created, long now) { return created <= now + 60_000 && created >= now - TTL_MS; }
}
