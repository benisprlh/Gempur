package id.gempur.app;

import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
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
    public synchronized JSONObject request(String method,String path,JSONObject payload) throws Exception{
        return requestPinned(method,path,payload,null);
    }
    public synchronized JSONObject requestPinned(String method,String path,JSONObject payload,JSONObject expectedRemoteContext) throws Exception{
        JSONObject account=store.remoteContext();
        if(expectedRemoteContext!=null)for(String key:new String[]{"endpoint","token","pendingRevocation","pairingId","deviceId","role","consentVersion","pendingAutomationOffPairing"})
            if(!account.optString(key).equals(expectedRemoteContext.optString(key)))throw new Exception("Konteks akun berubah; permintaan lama tidak dikirim.");
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
            InputStream input=status>=400?connection.getErrorStream():connection.getInputStream();
            ByteArrayOutputStream body=new ByteArrayOutputStream();
            if(input!=null)try(InputStream in=input){byte[]buf=new byte[4096];int count;while((count=in.read(buf))!=-1){if(body.size()+count>262144)throw new Exception("Respons server terlalu besar.");body.write(buf,0,count);}}
            JSONObject result=body.size()==0?new JSONObject():new JSONObject(body.toString(StandardCharsets.UTF_8.name()));
            if(status>=400){JSONObject error=result.optJSONObject("error");throw new ApiException(status,error==null?"Server belum dapat memproses permintaan.":error.optString("message","Permintaan gagal."));}
            return result;
        }finally{connection.disconnect();}
    }
}

