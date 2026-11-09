package id.gempur.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.time.Instant;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Private local data. Never backed up. A corrupt vault is not silently replaced. */
public final class LocalStore {
    private final AtomicFile file;
    private final String alias = "gempur.local.v1";
    private JSONObject value;
    public LocalStore(Context context) throws Exception {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "vault.v1"));
        if (file.getBaseFile().exists()) {
            JSONObject envelope = new JSONObject(new String(file.readFully(), java.nio.charset.StandardCharsets.UTF_8));
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
            value = new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
        } else { value = new JSONObject(); }
    }
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(alias)) return (SecretKey)ks.getKey(alias, null);
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return gen.generateKey();
    }
    public synchronized String get(String key) { return value.optString(key, ""); }
    public synchronized void put(String key, String text) throws Exception { value.put(key, text); save(); }
    public synchronized JSONObject checkIn(int urge, String outcome) throws Exception {
        JSONObject note = new JSONObject().put("createdAt", Instant.now().toString()).put("urge",urge).put("outcome",outcome);
        JSONArray kept = new JSONArray(); JSONArray old = notes();
        long cutoff = System.currentTimeMillis()-30L*24*3600*1000;
        for(int i=0;i<old.length();i++) { JSONObject n=old.getJSONObject(i); if(Instant.parse(n.getString("createdAt")).toEpochMilli()>=cutoff)kept.put(n); }
        kept.put(note); value.put("notes",kept); save(); return note;
    }
    public synchronized JSONArray notes() throws Exception {
        JSONArray old=value.optJSONArray("notes");JSONArray kept=new JSONArray();
        if(old==null)return kept;
        long cutoff=System.currentTimeMillis()-30L*24*3600*1000;
        for(int i=0;i<old.length();i++)if(Instant.parse(old.getJSONObject(i).getString("createdAt")).toEpochMilli()>=cutoff)kept.put(old.getJSONObject(i));
        if(kept.length()!=old.length()){value.put("notes",kept);save();}
        return new JSONArray(kept.toString());
    }
    public synchronized String notesExport() throws Exception { return new JSONObject().put("format","gempur-checkins-v1").put("checkins",notes()).toString(2); }
    public synchronized void clearNotes() throws Exception { value.remove("notes"); save(); }
    public synchronized void clearRemote() throws Exception { value.remove("token");value.remove("pairingId");value.remove("deviceId");save(); }
    public synchronized void wipe() throws Exception { value=new JSONObject();save(); }
    private void save() throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
        JSONObject envelope=new JSONObject().put("version",1).put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
            .put("data",Base64.encodeToString(cipher.doFinal(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP));
        FileOutputStream out=null;
        try {out=file.startWrite();out.write(envelope.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));file.finishWrite(out);}
        catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
    }
}

