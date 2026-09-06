package uk.co.sumerostudio.nexuai3dforge;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Per-install Android Keystore key. Endpoint metadata is authenticated with the secret. */
public final class SecurePairingStore {
    private static final String ALIAS="nexu_forge_android_pairing_v1";
    private final SharedPreferences prefs;
    public static final class Record {
        public final String host,deviceId;
        public final int port;
        public final byte[] deviceSecret;
        Record(String host,int port,String id,byte[] secret) { this.host=host; this.port=port; deviceId=id; deviceSecret=secret.clone(); }
    }
    public SecurePairingStore(Context c) { prefs=c.getSharedPreferences("nexu_forge_secure_pairing",Context.MODE_PRIVATE); }
    public synchronized void save(String host,int port,String id,byte[] secret) throws Exception {
        validate(host,port,id);
        if(secret==null || secret.length!=32) throw new IllegalArgumentException("Invalid pairing key.");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key(true));
        cipher.updateAAD(aad(host,port,id));
        byte[] encrypted=cipher.doFinal(secret);
        boolean stored=prefs.edit().putInt("format",2).putString("host",host).putInt("port",port).putString("deviceId",id)
            .putString("iv",Base64.getEncoder().encodeToString(cipher.getIV()))
            .putString("secret",Base64.getEncoder().encodeToString(encrypted)).commit();
        if(!stored) throw new java.io.IOException("Android could not save this pairing. Existing models are unaffected.");
    }
    public synchronized Record load() {
        if(!prefs.contains("secret")) return null;
        try {
            String host=prefs.getString("host",""),id=prefs.getString("deviceId",""); int port=prefs.getInt("port",0);
            validate(host,port,id);
            if(prefs.getInt("format",0)!=2) return null; // Old unauthenticated metadata needs explicit re-pairing, never silent trust.
            String ivText=prefs.getString("iv",""),cipherText=prefs.getString("secret","");
            if(ivText.length()>32 || cipherText.length()>128) throw new IllegalArgumentException("Invalid stored pairing.");
            byte[] iv=Base64.getDecoder().decode(ivText),encrypted=Base64.getDecoder().decode(cipherText);
            if(iv.length!=12 || encrypted.length!=48) throw new IllegalArgumentException("Invalid stored envelope.");
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,iv));
            cipher.updateAAD(aad(host,port,id)); byte[] secret=cipher.doFinal(encrypted);
            if(secret.length!=32) throw new IllegalArgumentException("Invalid stored key.");
            return new Record(host,port,id,secret);
        } catch(Exception e) { return null; } // Fail closed; do not delete user state after an unavailable/locked Keystore.
    }
    public synchronized void clear() {
        if(!prefs.edit().clear().commit()) throw new IllegalStateException("Android could not remove pairing preferences.");
        try { KeyStore ks=KeyStore.getInstance("AndroidKeyStore"); ks.load(null); if(ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS); }
        catch(Exception e) { throw new IllegalStateException("Pairing was forgotten, but Android could not remove the unused encryption key.",e); }
    }
    private static void validate(String host,int port,String id) {
        PrivateNetwork.requireEndpoint(host,port);
        if(id==null || !id.matches("[A-Za-z0-9_-]{4,80}")) throw new IllegalArgumentException("Invalid paired device identity.");
    }
    private static byte[] aad(String host,int port,String id) { return ("nexu-store-v2|"+host+"|"+port+"|"+id).getBytes(StandardCharsets.UTF_8); }
    private SecretKey key(boolean create) throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if(ks.containsAlias(ALIAS)) return (SecretKey)ks.getKey(ALIAS,null);
        if(!create) throw new IllegalStateException("Pairing encryption key is unavailable; pair again on this device.");
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setUserAuthenticationRequired(false).build());
        return generator.generateKey();
    }
}
