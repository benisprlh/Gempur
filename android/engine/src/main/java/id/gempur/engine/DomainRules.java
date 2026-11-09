package id.gempur.engine;

import java.net.IDN;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Immutable domain rules. A rule matches its domain and subdomains, never a suffix neighbour. */
public final class DomainRules {
    private final Set<String> blocked;
    private final Set<String> allowedExactly;

    private DomainRules(Set<String> domains, Set<String> exceptions) {
        blocked = Collections.unmodifiableSet(domains);
        allowedExactly = Collections.unmodifiableSet(exceptions);
    }

    public static DomainRules fromLines(Collection<String> lines) {
        if (lines == null) throw new IllegalArgumentException("Rules are required");
        LinkedHashSet<String> domains = new LinkedHashSet<>();
        for (String line : lines) {
            if (line == null || line.trim().isEmpty() || line.trim().startsWith("#")) continue;
            domains.add(normalize(line));
        }
        return new DomainRules(domains, Collections.emptySet());
    }

    public static DomainRules withExactExceptions(Collection<String> lines, Collection<String> exceptions) {
        DomainRules rules = fromLines(lines);
        Set<String> exact = new LinkedHashSet<>();
        for (String input : exceptions) exact.add(normalize(input));
        return new DomainRules(new LinkedHashSet<>(rules.blocked), exact);
    }

    /** Domain input only: no URL, port, wildcards, IP literal or URL query accepted. */
    public static String normalize(String input) {
        if (input == null) throw new IllegalArgumentException("Domain diperlukan");
        String value = input.trim();
        if (value.endsWith(".")) value = value.substring(0, value.length() - 1);
        if (value.isEmpty() || value.contains("/") || value.contains(":") || value.contains("?")
                || value.contains("#") || value.contains("@") || value.contains("*") || value.contains("\\")) {
            throw new IllegalArgumentException("Masukkan nama domain tanpa URL atau path");
        }
        try { value = IDN.toASCII(value, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("Domain tidak valid"); }
        if (value.length() > 253 || value.indexOf('.') <= 0 || value.endsWith(".")) {
            throw new IllegalArgumentException("Domain tidak valid");
        }
        String[] labels = value.split("\\.", -1);
        boolean numericOnly = true;
        for (String label : labels) {
            if (label.isEmpty() || label.length() > 63 || label.startsWith("-") || label.endsWith("-")) {
                throw new IllegalArgumentException("Domain tidak valid");
            }
            for (int i = 0; i < label.length(); i++) {
                char c = label.charAt(i);
                if (!(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '-') {
                    throw new IllegalArgumentException("Domain tidak valid");
                }
                if (!(c >= '0' && c <= '9')) numericOnly = false;
            }
        }
        if (numericOnly) throw new IllegalArgumentException("Gunakan domain, bukan alamat IP");
        return value;
    }

    public boolean isBlocked(String input) {
        if (input == null) return false;
        String candidate = input.trim();
        if (candidate.endsWith(".")) candidate = candidate.substring(0, candidate.length() - 1);
        if (candidate.length() > 253 || candidate.indexOf('/') >= 0 || candidate.indexOf(':') >= 0
                || candidate.indexOf('?') >= 0 || candidate.indexOf('#') >= 0 || candidate.indexOf('@') >= 0
                || candidate.indexOf('\\') >= 0 || candidate.indexOf('*') >= 0) return false;
        try { if (allowedExactly.contains(normalize(candidate))) return false; }
        catch (IllegalArgumentException notAHostLabel) { /* DNS service labels may contain '_'; still match their valid blocked parent. */ }
        while (true) {
            try { if (blocked.contains(normalize(candidate))) return true; }
            catch (IllegalArgumentException notAHostLabel) { /* Continue to a valid parent suffix. */ }
            int dot = candidate.indexOf('.');
            if (dot < 0) return false;
            candidate = candidate.substring(dot + 1);
        }
    }

    public List<String> domains() { return Collections.unmodifiableList(new ArrayList<>(blocked)); }
    public int size() { return blocked.size(); }
}
