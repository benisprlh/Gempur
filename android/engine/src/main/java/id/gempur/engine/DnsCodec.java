package id.gempur.engine;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Strict, allocation-bounded parser for a single ordinary uncompressed DNS question. */
public final class DnsCodec {
    private DnsCodec() {}

    public static final class Query {
        public final int id;
        public final String domain;
        public final int type;
        public final int queryClass;
        public final int questionEnd;
        private Query(int id, String domain, int type, int queryClass, int questionEnd) {
            this.id = id; this.domain = domain; this.type = type;
            this.queryClass = queryClass; this.questionEnd = questionEnd;
        }
    }

    public static Query parseQuery(byte[] bytes) { return parseQuestion(bytes, false); }

    private static Query parseQuestion(byte[] bytes, boolean response) {
        if (bytes == null || bytes.length < 17 || bytes.length > 65507) throw invalid();
        int flags = u16(bytes, 2);
        if (((flags & 0x8000) != 0) != response || (flags & 0x7800) != 0 || u16(bytes, 4) != 1) throw invalid();
        if (!response && (u16(bytes, 6) != 0 || u16(bytes, 8) != 0)) throw invalid();
        int p = 12;
        StringBuilder domain = new StringBuilder();
        while (true) {
            if (p >= bytes.length) throw invalid();
            int length = bytes[p++] & 255;
            if (length == 0) break;
            // Compression in questions is not supported; never follow arbitrary pointers.
            if (length > 63 || p + length > bytes.length) throw invalid();
            if (domain.length() > 0) domain.append('.');
            for (int i = 0; i < length; i++) {
                int c = bytes[p++] & 255;
                if (c < 33 || c > 126 || c == '.') throw invalid();
                domain.append((char)c);
            }
            if (domain.length() > 253) throw invalid();
        }
        if (p + 4 > bytes.length || domain.length() == 0) throw invalid();
        int type = u16(bytes, p), queryClass = u16(bytes, p + 2);
        if (queryClass != 1 || type == 0) throw invalid();
        // Service discovery names containing '_' are allowed to pass upstream but are never rules.
        return new Query(u16(bytes, 0), domain.toString().toLowerCase(java.util.Locale.ROOT), type, queryClass, p + 4);
    }

    public static boolean matchesResponse(byte[] query, byte[] response) {
        try {
            Query a = parseQuery(query), b = parseQuestion(response, true);
            return a.id == b.id && a.domain.equals(b.domain) && a.type == b.type && a.queryClass == b.queryClass;
        } catch (IllegalArgumentException invalid) { return false; }
    }

    public static byte[] nxdomain(byte[] query) { return error(query, 3); }
    public static byte[] servfail(byte[] query) { return error(query, 2); }

    private static byte[] error(byte[] query, int code) {
        Query parsed = parseQuery(query);
        byte[] result = Arrays.copyOf(query, parsed.questionEnd);
        int flags = 0x8000 | 0x0080 | (u16(query, 2) & 0x0100) | code;
        put16(result, 2, flags);
        put16(result, 4, 1);
        put16(result, 6, 0); put16(result, 8, 0); put16(result, 10, 0);
        return result;
    }

    /** Safe fixture query used by diagnostics/tests; it never requires a gambling destination. */
    public static byte[] query(String domain, int id) {
        String normalized = DomainRules.normalize(domain);
        byte[] labels = normalized.getBytes(StandardCharsets.US_ASCII);
        byte[] output = new byte[12 + labels.length + 2 + 4];
        put16(output, 0, id); put16(output, 2, 0x0100); put16(output, 4, 1);
        int p = 12;
        for (String label : normalized.split("\\.")) {
            byte[] data = label.getBytes(StandardCharsets.US_ASCII);
            output[p++] = (byte)data.length;
            System.arraycopy(data, 0, output, p, data.length); p += data.length;
        }
        output[p++] = 0;
        put16(output, p, 1); put16(output, p + 2, 1);
        return output;
    }

    public static int u16(byte[] data, int index) {
        return ((data[index] & 255) << 8) | (data[index + 1] & 255);
    }
    public static void put16(byte[] data, int index, int value) {
        data[index] = (byte)(value >>> 8); data[index + 1] = (byte)value;
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Unsupported or invalid DNS packet"); }
}
