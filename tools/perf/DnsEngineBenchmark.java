import id.gempur.engine.DnsCodec;
import id.gempur.engine.DomainRules;
import id.gempur.engine.LexicalDomainModel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/** Offline synthetic host microbenchmark. Never sends DNS or reads participant data. */
public final class DnsEngineBenchmark {
    private static volatile long sink;
    private static final String[] HOSTS = {
        "ordinary.example", "risk.example", "sub.risk.example", "risk.example.neighbour.test",
        "news-recovery.example", "xn--bcher-kva.example", "_service._tcp.risk.example",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.example"
    };
    private interface Operation { long run(int index); }
    private static String measure(String name, int samples, Operation operation) {
        long checksum = 0;
        for (int i = 0; i < 20000; i++) checksum += operation.run(i);
        sink = checksum;
        long[] timings = new long[samples];
        for (int i = 0; i < samples; i++) {
            long start = System.nanoTime();
            long result = operation.run(i);
            timings[i] = System.nanoTime() - start;
            checksum += result;
        }
        sink = checksum;
        Arrays.sort(timings);
        return "\"" + name + "\":{\"samples\":" + samples + ",\"p50Ns\":" + timings[(samples - 1) / 2]
                + ",\"p95Ns\":" + timings[(int)Math.ceil(samples * .95) - 1]
                + ",\"p99Ns\":" + timings[(int)Math.ceil(samples * .99) - 1] + ",\"checksumHex\":\"" + Long.toUnsignedString(checksum, 16) + "\"}";
    }
    public static void main(String[] args) throws Exception {
        int samples = Integer.parseInt(args[1]);
        if (samples < 100 || samples > 100000) throw new IllegalArgumentException("Bounded samples required");
        byte[][] queries = new byte[HOSTS.length][];
        for (int i = 0; i < HOSTS.length; i++) {
            // DnsCodec.query intentionally rejects service labels; make their valid wire fixture from another query.
            if (HOSTS[i].startsWith("_")) {
                queries[i] = DnsCodec.query("xservice.xtcp.risk.example", i);
                queries[i][13] = '_'; queries[i][22] = '_';
            } else queries[i] = DnsCodec.query(HOSTS[i], i);
            if (!DnsCodec.parseQuery(queries[i]).domain.equals(HOSTS[i])) throw new IllegalStateException("Fixture mismatch");
        }
        DomainRules rules = DomainRules.fromLines(List.of("risk.example"));
        if (!rules.isBlocked("sub.risk.example") || rules.isBlocked("risk.example.neighbour.test")) throw new IllegalStateException("Rule fixture mismatch");
        long start = System.nanoTime();
        LexicalDomainModel model;
        try (var input = Files.newInputStream(Path.of(args[0]))) { model = LexicalDomainModel.load(input); }
        long loadNs = System.nanoTime() - start;
        if (!Double.isFinite(model.predict("ordinary.example").score) || model.featureCount != 24000) throw new IllegalStateException("Model fixture mismatch");
        String codec = measure("dnsParse", samples, i -> { var q = DnsCodec.parseQuery(queries[i % HOSTS.length]); return q.domain.length() + q.id; });
        String matching = measure("ruleLookup", samples, i -> rules.isBlocked(HOSTS[i % HOSTS.length]) ? 1 : 0);
        String prediction = measure("modelPredictUncached", samples, i -> { var p = model.predict(HOSTS[i % HOSTS.length]); return Double.doubleToLongBits(p.score) ^ ((long)p.matchedFeatures << 32) ^ p.totalFeatures; });
        StringBuilder fixtures = new StringBuilder("[");
        for (String host : HOSTS) { if (fixtures.length() > 1) fixtures.append(','); fixtures.append('"').append(host).append('"'); }
        fixtures.append(']');
        System.out.println("{\"warmupPerStage\":20000,\"fixtureOrder\":\"fixed cyclic\",\"fixtures\":" + fixtures
                + ",\"modelLoadOnceNs\":" + loadNs + ",\"stages\":{" + codec + "," + matching + "," + prediction + "}}");
    }
}
