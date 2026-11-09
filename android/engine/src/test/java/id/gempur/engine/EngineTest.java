package id.gempur.engine;

import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import java.util.Random;
import static org.junit.Assert.*;

public final class EngineTest {
    @Test public void domainBoundariesAndNormalization() {
        DomainRules rules = DomainRules.fromLines(Arrays.asList("# seed", "Example.COM.", "bücher.example", "gempur-block.test"));
        assertTrue(rules.isBlocked("a.example.com"));
        assertTrue(rules.isBlocked("_service.example.com"));
        assertTrue(rules.isBlocked("EXAMPLE.com."));
        assertTrue(rules.isBlocked("xn--bcher-kva.example"));
        assertFalse(rules.isBlocked("notexample.com"));
        assertFalse(rules.isBlocked("example.com.attacker.test"));
        assertFalse(rules.isBlocked("other.test"));
        assertEquals(3, rules.size());
        try { rules.domains().add("new.test"); fail(); } catch (UnsupportedOperationException expected) {}
    }

    @Test public void domainRejectsUrlAndBadSyntax() {
        for (String invalid : Arrays.asList("", "com", "https://example.com", "example.com/path", "1.2.3.4", "*.example.com", "a..example", "-a.example", "a-.example", "x@y.example", "a.example:443", "a.example?key=secret")) {
            try { DomainRules.normalize(invalid); fail(invalid); } catch (IllegalArgumentException expected) {}
        }
    }

    @Test public void hundredBlockedAndHundredAllowedFixtures() {
        for (int i = 0; i < 100; i++) {
            DomainRules rules = DomainRules.fromLines(Collections.singleton("blocked" + i + ".test"));
            assertTrue(rules.isBlocked("sub.blocked" + i + ".test"));
            assertFalse(rules.isBlocked("allowed" + i + ".test"));
        }
    }

    @Test public void exactExceptionNeverAllowsSubdomainsOrSiblingsAndExpires() {
        DomainRules rules = DomainRules.withExactExceptions(Collections.singleton("example.test"), Collections.singleton("normal.example.test"));
        assertFalse(rules.isBlocked("normal.example.test"));
        assertTrue(rules.isBlocked("sub.normal.example.test"));
        assertTrue(rules.isBlocked("other.example.test"));
        TemporaryAllowance allowance = new TemporaryAllowance("normal.example.test", 1_000_000, 50_000, 1_060_000, 7);
        assertTrue(allowance.isActive(1_010_000, 60_000, 7));
        assertFalse(allowance.isActive(1_060_000, 110_000, 7));
        assertFalse(allowance.isActive(999_999, 60_000, 7));
        assertFalse(allowance.isActive(1_010_000, 110_000, 7));
        assertFalse(allowance.isActive(1_010_000, 60_000, 8));
    }

    @Test public void dnsQueryAndNxDomainRoundTrip() {
        byte[] query = DnsCodec.query("gempur-block.test", 0x1234);
        DnsCodec.Query parsed = DnsCodec.parseQuery(query);
        assertEquals("gempur-block.test", parsed.domain);
        assertEquals(0x1234, parsed.id);
        byte[] denied = DnsCodec.nxdomain(query);
        assertEquals(3, denied[3] & 15);
        assertTrue(DnsCodec.matchesResponse(query, denied));
        assertEquals(0, DnsCodec.u16(denied, 6));
        assertEquals(2, DnsCodec.servfail(query)[3] & 15);
        byte[] wrongId = denied.clone(); wrongId[0] ^= 1;
        assertFalse(DnsCodec.matchesResponse(query, wrongId));
    }

    @Test public void dnsRejectsMalformedQuestions() {
        byte[] valid = DnsCodec.query("gempur-block.test", 1);
        for (int n = 0; n < valid.length; n++) {
            try { DnsCodec.parseQuery(Arrays.copyOf(valid, n)); fail("truncated " + n); }
            catch (IllegalArgumentException expected) {}
        }
        byte[] compressed = valid.clone(); compressed[12] = (byte)0xc0;
        try { DnsCodec.parseQuery(compressed); fail("pointer"); } catch (IllegalArgumentException expected) {}
        byte[] response = DnsCodec.nxdomain(valid);
        try { DnsCodec.parseQuery(response); fail("response as query"); } catch (IllegalArgumentException expected) {}
        byte[] manyQuestions = valid.clone(); manyQuestions[5] = 2;
        try { DnsCodec.parseQuery(manyQuestions); fail("multiple questions"); } catch (IllegalArgumentException expected) {}
    }

    @Test public void packetRoundTripAndChecksums() {
        byte[] source = {10, 0, 0, 2}, destination = {(byte)198, 18, 0, 1};
        byte[] dns = DnsCodec.query("gempur-block.test", 42);
        byte[] bytes = Ipv4Udp.packet(source, destination, 12345, 53, dns);
        Ipv4Udp.Packet parsed = Ipv4Udp.parse(bytes, bytes.length);
        assertArrayEquals(dns, parsed.payload);
        assertEquals(53, parsed.destinationPort);
        byte[] answer = Ipv4Udp.response(parsed, DnsCodec.nxdomain(dns));
        Ipv4Udp.Packet response = Ipv4Udp.parse(answer, answer.length);
        assertArrayEquals(destination, response.source);
        assertArrayEquals(source, response.destination);
        assertEquals(12345, response.destinationPort);
        assertEquals(3, response.payload[3] & 15);
        byte[] broken = bytes.clone(); broken[broken.length - 1] ^= 1;
        try { Ipv4Udp.parse(broken, broken.length); fail("UDP checksum"); } catch (IllegalArgumentException expected) {}
        broken = bytes.clone(); broken[8] ^= 1;
        try { Ipv4Udp.parse(broken, broken.length); fail("IP checksum"); } catch (IllegalArgumentException expected) {}
    }

    @Test public void parsersRejectRandomInputsWithoutRuntimeCrashes() {
        Random random = new Random(17);
        for (int i = 0; i < 5000; i++) {
            byte[] input = new byte[random.nextInt(2048)]; random.nextBytes(input);
            try { DnsCodec.parseQuery(input); } catch (IllegalArgumentException expected) {}
            try { Ipv4Udp.parse(input, input.length); } catch (IllegalArgumentException expected) {}
        }
    }
}
