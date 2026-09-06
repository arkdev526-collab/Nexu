package uk.co.sumerostudio.nexuai3dforge;
import org.json.JSONObject;
import org.junit.Test;
import java.util.Arrays;
import static org.junit.Assert.*;
public class CompanionCryptoTest {
    private static byte[] key(){byte[] k=new byte[32];Arrays.fill(k,(byte)7);return k;}
    @Test public void realJsonImplementation(){assertEquals(42,new JsonObject().put("value",42).optInt("value"));}
    @Test public void invalidJsonValueFails(){assertThrows(IllegalArgumentException.class,()->new JsonObject().put("value",Double.NaN));}
    @Test public void authenticatedRoundTrip()throws Exception{JSONObject e=CompanionCrypto.seal(key(),new JsonObject().put("ok",true),"rpc:test");assertTrue(CompanionCrypto.open(key(),e,"rpc:test").getBoolean("ok"));}
    @Test public void contextBindsResponseToRequest()throws Exception{JSONObject e=CompanionCrypto.seal(key(),new JsonObject().put("ok",true),"rpc:test:requestA");assertThrows(Exception.class,()->CompanionCrypto.open(key(),e,"rpc:test:requestB"));}
    @Test public void authenticationRejectsTampering()throws Exception{JSONObject e=CompanionCrypto.seal(key(),new JsonObject().put("ok",true),"rpc:test");byte[] tag=CompanionCrypto.fromB64url(e.getString("tag"));tag[0]^=1;e.put("tag",CompanionCrypto.b64url(tag));assertThrows(Exception.class,()->CompanionCrypto.open(key(),e,"rpc:test"));}
    @Test public void rejectsWrongKey()throws Exception{JSONObject e=CompanionCrypto.seal(key(),new JsonObject().put("a",1),"rpc:test");assertThrows(Exception.class,()->CompanionCrypto.open(new byte[32],e,"rpc:test"));}
    @Test public void expiredAndOverflowTimestamps()throws Exception{for(long ts:new long[]{0,Long.MIN_VALUE,Long.MAX_VALUE,System.currentTimeMillis()-400000}){JSONObject e=CompanionCrypto.seal(key(),new JsonObject().put("a",1),"rpc:test");e.put("ts",ts);assertThrows(Exception.class,()->CompanionCrypto.open(key(),e,"rpc:test"));}}
    @Test public void rejectsBadNonceAndEncoding()throws Exception{JSONObject e=CompanionCrypto.seal(key(),new JsonObject().put("a",1),"rpc:test");e.put("nonce","AA");assertThrows(Exception.class,()->CompanionCrypto.open(key(),e,"rpc:test"));for(String v:new String[]{"A","AA=","A!A","A A","AB"})assertThrows(IllegalArgumentException.class,()->CompanionCrypto.fromB64url(v));}
    @Test public void usesUniqueIvsAndNonces()throws Exception{JSONObject a=CompanionCrypto.seal(key(),new JsonObject(),"rpc:test"),b=CompanionCrypto.seal(key(),new JsonObject(),"rpc:test");assertNotEquals(a.getString("iv"),b.getString("iv"));assertNotEquals(a.getString("nonce"),b.getString("nonce"));}
    @Test public void pairingDerivationIgnoresApprovedSeparators()throws Exception{assertArrayEquals(CompanionCrypto.derivePairingKey("ABCD-EFGH-JKLM-NPQR"),CompanionCrypto.derivePairingKey("abcdefghjklmnpqr"));}
}
