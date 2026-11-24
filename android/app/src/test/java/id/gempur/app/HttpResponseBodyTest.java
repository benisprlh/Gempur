package id.gempur.app;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import static org.junit.Assert.*;

public final class HttpResponseBodyTest {
    @Test public void authenticationFailureNeverOpensOrParsesAnErrorPage() throws Exception {
        try {
            HttpResponseBody.read(401, () -> { fail("401 body source must remain unopened"); return null; });
            fail("Authentication rejection expected");
        } catch (CompanionClient.ApiException rejected) { assertEquals(401, rejected.status); }
    }
    @Test public void successfulBodiesRemainBoundedAndAreClosed() throws Exception {
        byte[] exact = new byte[HttpResponseBody.LIMIT];
        assertEquals(exact.length, HttpResponseBody.read(200, () -> new ByteArrayInputStream(exact)).length());
        final boolean[] closed = {false};
        try {
            HttpResponseBody.read(200, () -> new ByteArrayInputStream(new byte[HttpResponseBody.LIMIT + 1]) {
                @Override public void close() { closed[0] = true; }
            });
            fail("Oversized success must fail");
        } catch (IOException expected) { assertTrue(closed[0]); }
    }
    @Test public void utf8EmptyAndAbsentBodyKeepExistingTransportSemantics() throws Exception {
        String value = "{\"message\":\"izin peserta\"}";
        assertEquals(value, HttpResponseBody.read(200, () -> new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8))));
        assertEquals("", HttpResponseBody.read(204, () -> null));
        assertEquals("", HttpResponseBody.read(400, () -> null));
    }
    @Test public void diagnosticBodyFailuresCannotEraseKnownHttpRejection() throws Exception {
        for (int status : new int[]{400, 403, 404, 409, 429, 500}) {
            assertEquals("", HttpResponseBody.read(status, () -> { throw new IOException("open failed"); }));
            assertEquals("", HttpResponseBody.read(status, () -> new InputStream() {
                @Override public int read() throws IOException { throw new IOException("read failed"); }
            }));
            assertEquals("", HttpResponseBody.read(status, () -> new ByteArrayInputStream(new byte[0]) {
                @Override public void close() throws IOException { throw new IOException("close failed"); }
            }));
            assertEquals("", HttpResponseBody.read(status, () -> new ByteArrayInputStream(new byte[HttpResponseBody.LIMIT + 1])));
        }
    }
    @Test public void successfulBodyOpenReadAndCloseFailuresNeverBecomeAcknowledgements() throws Exception {
        HttpResponseBody.Source[] sources = {
            () -> { throw new IOException("open failed"); },
            () -> new InputStream() { @Override public int read() throws IOException { throw new IOException("read failed"); } },
            () -> new ByteArrayInputStream(new byte[0]) { @Override public void close() throws IOException { throw new IOException("close failed"); } }
        };
        for (HttpResponseBody.Source source : sources) {
            try { HttpResponseBody.read(200, source); fail("Transport failure expected"); }
            catch (IOException expected) { assertNotNull(expected.getMessage()); }
        }
    }
}
