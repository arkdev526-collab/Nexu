package uk.co.sumerostudio.nexuai3dforge;
import org.json.JSONObject;
import org.junit.Test;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import static org.junit.Assert.*;
public class GlbSafetyTest {
    static JSONObject fixture()throws Exception{return new JSONObject("{\"asset\":{\"version\":\"2.0\"},\"buffers\":[{\"byteLength\":36}],\"bufferViews\":[{\"buffer\":0,\"byteLength\":36}],\"accessors\":[{\"bufferView\":0,\"componentType\":5126,\"count\":3,\"type\":\"VEC3\"}],\"meshes\":[{\"primitives\":[{\"attributes\":{\"POSITION\":0}}]}],\"nodes\":[{\"mesh\":0}],\"scenes\":[{\"nodes\":[0]}],\"scene\":0}");}
    static byte[] glb(JSONObject json){byte[] j=json.toString().getBytes(StandardCharsets.UTF_8);int n=(j.length+3)&~3;byte[] text=new byte[n];Arrays.fill(text,(byte)32);System.arraycopy(j,0,text,0,j.length);ByteBuffer b=ByteBuffer.allocate(12+8+n+8+36).order(ByteOrder.LITTLE_ENDIAN);b.putInt(0x46546c67).putInt(2).putInt(b.capacity()).putInt(n).putInt(0x4e4f534a).put(text).putInt(36).putInt(0x004e4942);return b.array();}
    @Test public void ordinaryStaticGlbAccepted()throws Exception{GlbSafety.validate(glb(fixture()));}
    @Test public void truncatedHeaderRejected(){assertThrows(Exception.class,()->GlbSafety.validate(new byte[5]));}
    @Test public void wrongDeclaredLengthRejected()throws Exception{byte[] b=glb(fixture());b[8]=0;assertThrows(Exception.class,()->GlbSafety.validate(b));}
    @Test public void externalResourcesRejected()throws Exception{JSONObject j=fixture();j.getJSONArray("buffers").getJSONObject(0).put("uri","http://example.com/secret");assertThrows(Exception.class,()->GlbSafety.validate(glb(j)));}
    @Test public void excessiveAccessorRejected()throws Exception{JSONObject j=fixture();j.getJSONArray("accessors").getJSONObject(0).put("count",Integer.MAX_VALUE);assertThrows(Exception.class,()->GlbSafety.validate(glb(j)));}
    @Test public void cyclicSceneRejected()throws Exception{JSONObject j=fixture();j.getJSONArray("nodes").getJSONObject(0).put("children",new org.json.JSONArray().put(0));assertThrows(Exception.class,()->GlbSafety.validate(glb(j)));}
    @Test public void nestingLimitEnforced(){assertThrows(IllegalArgumentException.class,()->GlbSafety.checkNesting(new String(new char[65]).replace("\0","[")+new String(new char[65]).replace("\0","]")));}
    @Test public void accessorOutsideViewRejected()throws Exception{JSONObject j=fixture();j.getJSONArray("accessors").getJSONObject(0).put("byteOffset",36);assertThrows(Exception.class,()->GlbSafety.validate(glb(j)));}
    @Test public void overflowedViewRejected()throws Exception{JSONObject j=fixture();j.getJSONArray("bufferViews").getJSONObject(0).put("byteOffset",Long.MAX_VALUE);assertThrows(Exception.class,()->GlbSafety.validate(glb(j)));}
    @Test public void negativeBufferLengthRejected()throws Exception{JSONObject j=fixture();j.getJSONArray("buffers").getJSONObject(0).put("byteLength",-1);assertThrows(Exception.class,()->GlbSafety.validate(glb(j)));}
    @Test public void invalidPositionAccessorRejected()throws Exception{JSONObject j=fixture();j.getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives").getJSONObject(0).getJSONObject("attributes").put("POSITION",9);assertThrows(Exception.class,()->GlbSafety.validate(glb(j)));}
}
