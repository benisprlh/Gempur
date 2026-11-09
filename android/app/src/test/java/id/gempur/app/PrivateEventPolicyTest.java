package id.gempur.app;

import org.junit.Test;
import static org.junit.Assert.*;

public final class PrivateEventPolicyTest {
    @Test public void onlyMinimalTargetsAreAccepted() {
        assertEquals("risk-site.org", PrivateEventPolicy.target("domain", "RISK-SITE.org."));
        assertEquals("org.vendor.Game", PrivateEventPolicy.target("app", "org.vendor.Game"));
        for (String domain : new String[]{"https://risk-site.org/path", "risk-site.org?q=private", "risk-site.org/secret", "user@risk-site.org", "*.risk-site.org"}) {
            try { PrivateEventPolicy.target("domain", domain); fail(domain); } catch (IllegalArgumentException expected) {}
        }
        for (String app : new String[]{"org.vendor/app", "org.vendor?token=x", "not a package", ".org.vendor"}) {
            try { PrivateEventPolicy.target("app", app); fail(app); } catch (IllegalArgumentException expected) {}
        }
    }
    @Test public void syntheticFixturesCannotBecomeRealActivityReports() {
        for (String domain : new String[]{"gempur-block.test", "slotgacor.invalid", "suspicious.example", "example.com", "sub.example.net", "sample.localhost"}) {
            try { PrivateEventPolicy.target("domain", domain); fail(domain); } catch (IllegalArgumentException expected) {}
        }
        for (String app : new String[]{"com.example.Test", "com.gempur.fixture.casino", "id.gempur.app.private.debug", "test.slotgacor", "EXAMPLE.CasinoOnline", "invalid.JudiOnline", "localhost.CasinoOnline"}) {
            try { PrivateEventPolicy.target("app", app); fail(app); } catch (IllegalArgumentException expected) {}
        }
    }
    @Test public void unknownAndInconsistentVerdictsAreNotReports() {
        PrivateEventPolicy.validate("known_rule", "known", "blocked");
        PrivateEventPolicy.validate("name_heuristic", "suspected", "flagged");
        for (String[] pair : new String[][]{{"name_heuristic", "known"}, {"known_rule", "suspected"}, {"unknown", "unknown"}}) {
            try { PrivateEventPolicy.validate(pair[0], pair[1], "blocked"); fail(); } catch (IllegalArgumentException expected) {}
        }
    }
    @Test public void retentionAndBucketsAreBounded() {
        long now = 1_800_000_000_001L;
        assertEquals(PrivateEventPolicy.bucket(now), PrivateEventPolicy.bucket(now + 1));
        assertTrue(PrivateEventPolicy.fresh(now - PrivateEventPolicy.TTL_MS, now));
        assertFalse(PrivateEventPolicy.fresh(now - PrivateEventPolicy.TTL_MS - 1, now));
        assertFalse(PrivateEventPolicy.fresh(now + 60_001, now));
    }
    @Test public void domainAiCanOnlyReportAnAdvisorySignal() {
        PrivateEventPolicy.validate("domain", "ml_model", "suspected", "flagged");
        for (String[] fields : new String[][]{
                {"app", "suspected", "flagged"}, {"domain", "known", "flagged"},
                {"domain", "personal", "flagged"}, {"domain", "suspected", "blocked"},
                {"unknown", "suspected", "flagged"}, {null, "suspected", "flagged"}}) {
            try { PrivateEventPolicy.validate(fields[0], "ml_model", fields[1], fields[2]); fail(); }
            catch (IllegalArgumentException expected) {}
        }
        // Callers that omit kind cannot accidentally turn an app into a domain AI report.
        try { PrivateEventPolicy.validate("ml_model", "suspected", "flagged"); fail(); }
        catch (IllegalArgumentException expected) {}
    }
}
