package uk.co.sumerostudio.nexuai3dforge;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Interoperable with the protected Windows companion-crypto.mjs v1 wire format. */
public final class CompanionCrypto {
    public static final long WINDOW_MS=300_000L;
    private static final int MAX_PLAINTEXT=46*1024*1024;
    private static final SecureRandom RANDOM=new SecureRandom();
    private CompanionCrypto() { }
    public static byte[] derivePairingKey(String code) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(("nexu-forge-pair-v1:"+PairingInfo.normalizeSecret(code)).getBytes(StandardCharsets.UTF_8));
    }
    public static JSONObject seal(byte[] key, JSONObject payload, String context) throws Exception {
        requireKey(key); requireContext(context);
        long ts=System.currentTimeMillis();
        String nonce=b64url(random(16)); byte[] iv=random(12);
        byte[] plain=payload.toString().getBytes(StandardCharsets.UTF_8);
        if(plain.length>MAX_PLAINTEXT) throw new IllegalArgumentException("Companion payload exceeds its safety limit.");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
        cipher.updateAAD(aad(context,ts,nonce));
        byte[] encrypted=cipher.doFinal(plain);
        Arrays.fill(plain,(byte)0);
        return new JsonObject().put("v",1).put("ts",ts).put("nonce",nonce).put("iv",b64url(iv))
            .put("ciphertext",b64url(Arrays.copyOf(encrypted,encrypted.length-16)))
            .put("tag",b64url(Arrays.copyOfRange(encrypted,encrypted.length-16,encrypted.length)));
    }
    public static JSONObject open(byte[] key, JSONObject envelope, String context) throws Exception {
        return openAt(key,envelope,context,System.currentTimeMillis());
    }
    static JSONObject openAt(byte[] key, JSONObject envelope, String context,long now) throws Exception {
        requireKey(key); requireContext(context);
        if(envelope==null || envelope.optInt("v",0)!=1) throw new IllegalArgumentException("Unsupported companion envelope.");
        Object rawTs=envelope.opt("ts");
        if(!(rawTs instanceof Number)) throw new IllegalArgumentException("Invalid response timestamp.");
        long ts=((Number)rawTs).longValue();
        if(ts<=0 || ts<now-WINDOW_MS || ts>now+WINDOW_MS || ((Number)rawTs).doubleValue()!=ts)
            throw new IllegalArgumentException("Companion response expired. Check the clocks on Android and Windows.");
        String nonce=envelope.getString("nonce");
        if(fromB64url(nonce).length!=16) throw new IllegalArgumentException("Invalid response nonce.");
        byte[] iv=fromB64url(envelope.getString("iv")),tag=fromB64url(envelope.getString("tag"));
        String encoded=envelope.getString("ciphertext");
        if(encoded.length()>((long)MAX_PLAINTEXT*4+2)/3) throw new IllegalArgumentException("Companion ciphertext exceeds its safety limit.");
        byte[] ciphertext=fromB64url(encoded);
        if(iv.length!=12 || tag.length!=16) throw new IllegalArgumentException("Invalid authenticated envelope.");
        byte[] combined=Arrays.copyOf(ciphertext,ciphertext.length+16);
        System.arraycopy(tag,0,combined,ciphertext.length,16);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
        cipher.updateAAD(aad(context,ts,nonce));
        // No payload is returned until authentication succeeds.
        byte[] plain=cipher.doFinal(combined);
        try { return new JSONObject(new String(plain,StandardCharsets.UTF_8)); }
        finally { Arrays.fill(plain,(byte)0); }
    }
    public static String b64url(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public static byte[] fromB64url(String value) {
        if(value==null || value.isEmpty() || !value.matches("[A-Za-z0-9_-]+") || value.length()%4==1)
            throw new IllegalArgumentException("Invalid base64url field.");
        byte[] decoded=Base64.getUrlDecoder().decode(value);
        if(!b64url(decoded).equals(value)) throw new IllegalArgumentException("Non-canonical base64url field.");
        return decoded;
    }
    private static byte[] aad(String context,long ts,String nonce) { return (context+"|1|"+ts+"|"+nonce).getBytes(StandardCharsets.UTF_8); }
    private static void requireContext(String context) { if(context==null || context.isEmpty() || context.length()>200 || context.indexOf('|')>=0) throw new IllegalArgumentException("Invalid companion context."); }
    private static byte[] random(int size) { byte[] bytes=new byte[size]; RANDOM.nextBytes(bytes); return bytes; }
    private static void requireKey(byte[] key) { if(key==null || key.length!=32) throw new IllegalArgumentException("Companion key must be 32 bytes."); }
}
