package id.gempur.engine;

import org.junit.Test;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import static org.junit.Assert.*;

public final class LexicalDomainModelTest {
    private static Set<String> features(String domain) {
        String text = "^" + DomainRules.normalize(domain) + "$"; Set<String> result = new LinkedHashSet<>();
        for (int n = 3; n <= 5; n++) for (int i = 0; i <= text.length() - n; i++) result.add(text.substring(i, i + n));
        return result;
    }
    private static String model(Set<String> features, double threshold, double intercept, double weight) {
        StringBuilder text = new StringBuilder("GEMPUR_DOMAIN_MODEL_V1\nmodel_version\tunit-test-v1\nmin_ngram\t3\nmax_ngram\t5\nintercept\t")
                .append(intercept).append("\nreview_threshold\t").append(threshold)
                .append("\nmin_coverage\t0.30\nmin_matched\t10\nauto_quarantine\tfalse\nfeatures\t").append(features.size()).append('\n');
        for (String item : new TreeSet<>(features)) text.append(item).append('\t').append(weight).append('\n');
        return text.toString();
    }
    private static LexicalDomainModel load(String source) throws Exception { return LexicalDomainModel.load(new ByteArrayInputStream(source.getBytes(StandardCharsets.US_ASCII))); }
    private static void refused(String source) {
        assertThrows(IllegalArgumentException.class, () -> load(source));
    }
    @Test public void binaryUniqueNgramsAndStableSigmoidMatchManualScore() throws Exception {
        Set<String> terms = features("aaaaaaaa.com"); LexicalDomainModel model = load(model(terms, 0.8, -3, 0.2));
        LexicalDomainModel.Prediction result = model.predict("AAAAAAAA.COM.");
        assertEquals(terms.size(), result.totalFeatures); assertEquals(terms.size(), result.matchedFeatures);
        assertEquals(1 / (1 + Math.exp(-(-3 + 0.2 * terms.size()))), result.score, 1e-12);
        assertFalse(result.abstained); assertEquals(result.score >= 0.8, result.flagged); assertEquals("unit-test-v1", result.modelVersion);
    }
    @Test public void insufficientFeatureSupportAbstainsEvenForExtremeBias() throws Exception {
        Set<String> all = features("averylongunseendomainname.example"), partial = new LinkedHashSet<>();
        for (String item : all) { if (partial.size() == 10) break; partial.add(item); }
        LexicalDomainModel.Prediction sparse = load(model(partial, 0.1, 100, 1)).predict("averylongunseendomainname.example");
        assertEquals(10, sparse.matchedFeatures); assertTrue(sparse.abstained); assertFalse(sparse.flagged); assertTrue(Double.isFinite(sparse.score));
        partial.remove(partial.iterator().next());
        LexicalDomainModel.Prediction few = load(model(partial, 0, 100, 1)).predict("averylongunseendomainname.example");
        assertEquals(9, few.matchedFeatures); assertTrue(few.abstained); assertFalse(few.flagged);
    }
    @Test public void disabledThresholdNeverFlagsRoundedOneAndExtremeScoresStayFinite() throws Exception {
        Set<String> terms = features("casino-deposit.example");
        LexicalDomainModel.Prediction high = load(model(terms, 1, 100, 100)).predict("casino-deposit.example");
        assertEquals(1, high.score, 0); assertFalse(high.abstained); assertFalse(high.flagged);
        LexicalDomainModel.Prediction low = load(model(terms, 0.5, -100, -100)).predict("casino-deposit.example");
        assertEquals(0, low.score, 0); assertFalse(low.flagged);
    }
    @Test public void idnaNormalizationIsConsistentAndInvalidTargetsAbstain() throws Exception {
        LexicalDomainModel model = load(model(features("bücher.de"), 0.5, 0, 0.2));
        assertEquals(model.predict("xn--bcher-kva.de").score, model.predict(" BÜCHER.DE. ").score, 0);
        for (String invalid : new String[]{null,"","https://casino.example/path","a.example?x=1","127.0.0.1","a..example","a_b.example"}) {
            LexicalDomainModel.Prediction result = model.predict(invalid);
            assertTrue(result.abstained); assertFalse(result.flagged); assertTrue(Double.isNaN(result.score)); assertEquals(0, result.totalFeatures);
        }
        assertTrue(LexicalDomainModel.abstain().abstained);
    }
    @Test public void parserRejectsUnsupportedPolicyCountsAndTrailingData() throws Exception {
        String valid = model(features("casino-deposit.example"), 0.8, -1, 0.1);
        for (String wrong : new String[]{
                valid.replace("GEMPUR_DOMAIN_MODEL_V1", "GEMPUR_DOMAIN_MODEL_V2"), valid.replace("min_ngram\t3", "min_ngram\t2"),
                valid.replace("max_ngram\t5", "max_ngram\t6"), valid.replace("min_coverage\t0.30", "min_coverage\t0.0"),
                valid.replace("min_matched\t10", "min_matched\t0"), valid.replace("auto_quarantine\tfalse", "auto_quarantine\ttrue"),
                valid.replace("review_threshold\t0.8", "review_threshold\t-0.1"),valid.replace("review_threshold\t0.8", "review_threshold\t1.1"),
                valid.replaceFirst("features\\t[0-9]+", "features\t24001"), valid.replaceFirst("features\\t[0-9]+", "features\t0"),
                valid + "\n", valid + "extra\t1\n", valid.replace("model_version\tunit-test-v1", "model_version\t../untrusted")
        }) refused(wrong);
        assertNotNull(load(valid.replace("\n", "\r\n")));
    }
    @Test public void parserRejectsNonfiniteOverflowDuplicateAndMalformedFeatures() throws Exception {
        String valid = model(features("casino-deposit.example"), 0.8, -1, 0.1);
        for (String number : new String[]{"NaN","Infinity","1e309","101","0x1p0"}) refused(valid.replace("intercept\t-1.0", "intercept\t" + number));
        List<String> rows = new ArrayList<>(java.util.Arrays.asList(valid.split("\n")));
        rows.set(11, rows.get(10)); refused(String.join("\n", rows) + "\n");
        rows = new ArrayList<>(java.util.Arrays.asList(valid.split("\n"))); rows.set(10, "ab\t1"); refused(String.join("\n", rows) + "\n");
        rows.set(10, "^^a\t1"); refused(String.join("\n", rows) + "\n"); rows.set(10,"$ab\t1"); refused(String.join("\n", rows) + "\n");
        rows.set(10,"abc\t1e999"); refused(String.join("\n", rows) + "\n");
        byte[] nonAscii=valid.getBytes(StandardCharsets.US_ASCII);nonAscii[0]=(byte)0xff;
        assertThrows(IllegalArgumentException.class,()->LexicalDomainModel.load(new ByteArrayInputStream(nonAscii)));
        byte[] oversized=new byte[LexicalDomainModel.MAX_MODEL_BYTES+1];java.util.Arrays.fill(oversized,(byte)'a');
        assertThrows(IllegalArgumentException.class,()->LexicalDomainModel.load(new ByteArrayInputStream(oversized)));
    }
    @Test public void runtimeReviewGuardsAndAdvisoryDecisionDoNotChangeExistingEnforcement() {
        for (String protectedHost : new String[]{"slotgacor.go.id","casino-deposit.ac.id","news.casino-deposit.com","anti-judol.org","support.example.com","gempur-block.test","https://bad.example"}) assertFalse(protectedHost,DetectionPolicy.canReviewDomain(protectedHost));
        assertTrue(DetectionPolicy.canReviewDomain("unrecognizedhost.example"));
        DetectionPolicy.Decision advisory=DetectionPolicy.mlFlagged();assertFalse(advisory.blocked);assertEquals("ml_model",advisory.reason);assertEquals("suspected",advisory.verdict);
        assertTrue(DetectionPolicy.evaluateDomain("slotgacor.go.id",java.util.Collections.singleton("slotgacor.go.id"),java.util.Collections.emptyList(),java.util.Collections.emptyList(),true).blocked);
        assertFalse(DetectionPolicy.evaluateDomain("casino.example",java.util.Collections.singleton("casino.example"),java.util.Collections.emptyList(),java.util.Collections.singleton("casino.example"),true).blocked);
    }
    @Test public void trainedArtifactMatchesPythonParityVectors() throws Exception {
        LexicalDomainModel model;
        try(InputStream source=getClass().getResourceAsStream("/ml/domain-model.tsv")) {assertNotNull("Trained private model must be packaged as test resource",source);model=LexicalDomainModel.load(source);}
        int count=0;
        try(InputStream source=getClass().getResourceAsStream("/ml/parity.tsv")){
            assertNotNull("Python parity vectors required",source);
            BufferedReader reader=new BufferedReader(new InputStreamReader(source,StandardCharsets.UTF_8));
            assertEquals("domain\tscore\tmatched\ttotal\tabstained\tflagged",reader.readLine());
            String row;
            while((row=reader.readLine())!=null){String[] fields=row.split("\t",-1);assertEquals(6,fields.length);LexicalDomainModel.Prediction prediction=model.predict(fields[0]);
                if("NA".equals(fields[1]))assertTrue(Double.isNaN(prediction.score));else assertEquals(fields[0],Double.parseDouble(fields[1]),prediction.score,1e-9);
                assertEquals(Integer.parseInt(fields[2]),prediction.matchedFeatures);assertEquals(Integer.parseInt(fields[3]),prediction.totalFeatures);
                assertEquals(fields[0],Boolean.parseBoolean(fields[4]),prediction.abstained);assertEquals(fields[0],Boolean.parseBoolean(fields[5]),prediction.flagged);count++;
            }
        }
        assertTrue("Held-out and normalization vectors required",count>=10);
    }
}
