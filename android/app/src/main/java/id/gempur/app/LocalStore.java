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
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Instant;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Process-locked, fresh transactions. Never overwrite a newer Activity's encrypted data. */
public final class LocalStore {
    private static final Object LOCK = new Object();
    private static final String ALIAS = "gempur.local.v1";
    private final AtomicFile file;
    public LocalStore(Context context) throws Exception {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "vault.v1"));
        synchronized (LOCK) { load(); } // Corruption is never replaced with an empty vault.
    }
    private SecretKey key() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(ks.containsAlias(ALIAS))return (SecretKey)ks.getKey(ALIAS,null);
        KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return gen.generateKey();
    }
    private JSONObject load() throws Exception {
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile().getPath()+".bak").exists())return new JSONObject();
        JSONObject envelope=new JSONObject(new String(file.readFully(),StandardCharsets.UTF_8));
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(envelope.getString("iv"),Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    public String get(String name) {
        synchronized(LOCK){try{return load().optString(name,"");}catch(Exception e){throw new IllegalStateException("Vault lokal belum dapat dibaca; data tidak direset.",e);}}
    }
    public void put(String name,String text) throws Exception {
        synchronized(LOCK){JSONObject value=load();value.put(name,text);save(value);}
    }
    /** One origin/capability snapshot: never combine a new token with an old endpoint. */
    public JSONObject remoteContext() throws Exception {
        synchronized(LOCK){JSONObject value=load(),context=new JSONObject();
            for(String name:new String[]{"endpoint","token","pendingRevocation","pairingId","deviceId","role","consentVersion","pendingAutomationOffPairing"})context.put(name,value.optString(name,""));
            return context;
        }
    }
    public JSONObject checkIn(int urge,String outcome) throws Exception {
        synchronized(LOCK){JSONObject value=load();JSONObject note=new JSONObject().put("createdAt",Instant.now().toString()).put("urge",urge).put("outcome",outcome);
            JSONArray kept=retainedNotes(value);kept.put(note);value.put("notes",kept);save(value);return note;
        }
    }
    private JSONArray retainedNotes(JSONObject value) throws Exception {
        JSONArray old=value.optJSONArray("notes"),kept=new JSONArray();if(old==null)return kept;
        long cutoff=System.currentTimeMillis()-30L*24*3600*1000;
        for(int i=0;i<old.length();i++){JSONObject note=old.getJSONObject(i);if(Instant.parse(note.getString("createdAt")).toEpochMilli()>=cutoff)kept.put(note);}
        return kept;
    }
    public JSONArray notes() throws Exception {
        synchronized(LOCK){JSONObject value=load();JSONArray kept=retainedNotes(value),old=value.optJSONArray("notes");
            if(old!=null&&kept.length()!=old.length()){value.put("notes",kept);save(value);}return new JSONArray(kept.toString());
        }
    }
    public String notesExport() throws Exception {
        synchronized(LOCK){return new JSONObject().put("format","gempur-checkins-v1").put("checkins",notes()).toString(2);}
    }
    public void clearNotes() throws Exception {synchronized(LOCK){JSONObject value=load();value.remove("notes");save(value);}}
    public void clearRemote() throws Exception {
        synchronized(LOCK){JSONObject value=load();for(String name:new String[]{"token","pairingId","deviceId","role","consentVersion"})value.remove(name);save(value);}
    }
    public void wipe() throws Exception {synchronized(LOCK){save(new JSONObject());}}
    private void save(JSONObject value) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        JSONObject envelope=new JSONObject().put("version",1).put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
            .put("data",Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        FileOutputStream out=null;
        try{out=file.startWrite();out.write(envelope.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(out);}
        catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
    }
}

