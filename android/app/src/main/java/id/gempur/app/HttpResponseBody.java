package id.gempur.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Bounded transport body reader. An error page cannot replace an already known HTTP status. */
final class HttpResponseBody {
    static final int LIMIT = 262144;
    interface Source { InputStream open() throws IOException; }
    private HttpResponseBody() {}

    static String read(int status, Source source) throws IOException, CompanionClient.ApiException {
        // Authentication failure must reach session-stop without waiting for/parsing an error page.
        if (status == 401) throw new CompanionClient.ApiException(status, "Sesi server berakhir. Masuk ulang sebelum melanjutkan.");
        try (InputStream in = source.open()) {
            if (in == null) return "";
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = in.read(buffer)) != -1) {
                if (body.size() + count > LIMIT) throw new IOException("Respons server terlalu besar.");
                body.write(buffer, 0, count);
            }
            return new String(body.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            if (status >= 400) return ""; // Diagnostic error data is optional; preserve the HTTP rejection.
            throw unreadable; // Never turn a truncated/oversized success into a successful acknowledgement.
        }
    }
}
