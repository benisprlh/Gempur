package id.gempur.app;

import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class CompanionClient {
    public static final class ApiException extends Exception {
        public final int status;
        ApiException(int status,String message){super(message);this.status=status;}
    }
    private final LocalStore store;
    public CompanionClient(LocalStore store){this.store=store;}
    public static String validateEndpoint(String candidate, boolean debug) {
        try {
            URI u=new URI(candidate.trim());
            boolean local = "localhost".equals(u.getHost()) || "127.0.0.1".equals(u.getHost()) || "10.0.2.2".equals(u.getHost());
            if(u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||u.getHost()==null)throw new Exception();
            if(!"https".equals(u.getScheme()) && !(debug&&local&&"http".equals(u.getScheme())))throw new Exception();
            if(u.getPath()!=null&&!u.getPath().isEmpty()&&!"/".equals(u.getPath()))throw new Exception();
            return u.getScheme()+"://"+u.getRawAuthority();
        }catch(Exception e){throw new IllegalArgumentException("Gunakan alamat HTTPS server tanpa path atau token.");}
    }
    static boolean confirmsAutomationOff(Object enabled, Object version, int scopeCount, int stoppedVersion) {
        if (!Boolean.FALSE.equals(enabled) || scopeCount != 0 || stoppedVersion < -1
                || !(version instanceof Integer || version instanceof Long)) {
            return false;
        }
        long returnedVersion = ((Number) version).longValue();
        return returnedVersion > stoppedVersion && returnedVersion <= Integer.MAX_VALUE;
    }
    // Compare immutable dispatch values; neither an old success nor a typed error may cross accounts.
    static boolean sameRemoteValues(String[] dispatched, String[] current) {
        if (dispatched == null || current == null || dispatched.length != 8 || current.length != 8) return false;
        for (int i = 0; i < 8; i++) if (dispatched[i] == null || current[i] == null) return false;
        return java.util.Arrays.equals(dispatched, current);
    }
    static String[] remoteValues(JSONObject account) {
        String[] values = new String[8];
        String[] keys = {"endpoint", "token", "pendingRevocation", "pairingId", "deviceId", "role", "consentVersion", "pendingAutomationOffPairing"};
        for (int i = 0; i < keys.length; i++) values[i] = account.optString(keys[i]);
        return values;
    }
    private void requireCurrent(String[] dispatched) throws Exception {
        if (!sameRemoteValues(dispatched, remoteValues(store.remoteContext())))
            throw new Exception("Konteks akun berubah; respons lama tidak digunakan.");
    }
    static JSONObject decodeResponse(int status, String body) throws Exception {
        if (status >= 400) {
            String message = "Server belum dapat memproses permintaan.";
            try {
                JSONObject error = body.isEmpty() ? null : new JSONObject(body).optJSONObject("error");
                if (error != null) message = error.optString("message", "Permintaan gagal.");
            } catch (Exception invalidErrorBody) { /* Known HTTP rejection outranks an optional error message. */ }
            throw new ApiException(status, message);
        }
        return body.isEmpty() ? new JSONObject() : new JSONObject(body);
    }
    public synchronized JSONObject request(String method,String path,JSONObject payload) throws Exception{
        return requestPinned(method,path,payload,null);
    }
    public synchronized JSONObject requestPinned(String method,String path,JSONObject payload,JSONObject expectedRemoteContext) throws Exception{
        JSONObject account=store.remoteContext();
        String[] dispatched = remoteValues(account);
        if (expectedRemoteContext != null && !sameRemoteValues(dispatched, remoteValues(expectedRemoteContext)))
            throw new Exception("Konteks akun berubah; permintaan lama tidak dikirim.");
        String pending=account.optString("pendingRevocation");
        if(!pending.isEmpty() && !("DELETE".equals(method)&&path.equals("/api/pairings/"+pending)))
            throw new Exception("Berbagi dihentikan di HP ini. Sinkronkan pencabutan akses terlebih dahulu.");
        String base=account.optString("endpoint");
        if(base.isEmpty())throw new Exception("Atur server pendamping terlebih dahulu.");
        HttpURLConnection connection=(HttpURLConnection)new URL(base+path).openConnection();
        try{
            connection.setRequestMethod(method);connection.setConnectTimeout(12000);connection.setReadTimeout(12000);connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept","application/json");
            if(!account.optString("token").isEmpty())connection.setRequestProperty("Authorization","Bearer "+account.optString("token"));
            if(payload!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
                byte[]bytes=payload.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);
                try(java.io.OutputStream out=connection.getOutputStream()){out.write(bytes);}}
            int status=connection.getResponseCode();
            if(status>=300&&status<400)throw new Exception("Redirect server ditolak. Periksa alamat HTTPS.");
            String body=HttpResponseBody.read(status, () -> status>=400?connection.getErrorStream():connection.getInputStream());
            JSONObject result = decodeResponse(status, body);
            requireCurrent(dispatched);
            return result;
        } catch (Exception responseOrTransportFailure) {
            // A 401 from an old token must not stop the newly selected account/session.
            // If the vault cannot be read, fail without propagating an unbound authentication error.
            requireCurrent(dispatched);
            throw responseOrTransportFailure;
        } finally { connection.disconnect(); }
    }
}

