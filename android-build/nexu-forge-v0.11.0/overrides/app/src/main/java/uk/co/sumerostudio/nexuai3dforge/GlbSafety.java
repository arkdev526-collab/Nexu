package uk.co.sumerostudio.nexuai3dforge;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;

/** Bounded static-GLB import gate before allocation in the renderer. No external resource fetch. */
public final class GlbSafety {
    public static final int MAX_BYTES=32*1024*1024;
    private GlbSafety() { }
    public static void validate(byte[] data) throws Exception {
        if(data==null || data.length<28 || data.length>MAX_BYTES) fail("GLB must be between 28 bytes and 32 MB.");
        ByteBuffer buffer=ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        if(buffer.getInt()!=0x46546c67 || buffer.getInt()!=2 || buffer.getInt()!=data.length) fail("Expected a complete GLB version 2 file.");
        int offset=12,binBytes=-1; JSONObject json=null;
        while(offset<data.length) {
            if(data.length-offset<8) fail("Truncated GLB chunk header.");
            int size=buffer.getInt(offset),type=buffer.getInt(offset+4); offset+=8;
            if(size<0 || size%4!=0 || (long)offset+size>data.length) fail("Invalid GLB chunk bounds.");
            if(type==0x4e4f534a) {
                if(json!=null || offset!=20 || size>4*1024*1024) fail("Invalid GLB JSON chunk.");
                String text=new String(data,offset,size,StandardCharsets.UTF_8); checkNesting(text);
                json=new JSONObject(text);
            } else if(type==0x004e4942) {
                if(binBytes>=0 || json==null) fail("Duplicate or misplaced GLB binary chunk."); binBytes=size;
            }
            offset+=size;
        }
        if(json==null || binBytes<0) fail("GLB requires JSON and binary chunks.");
        JSONObject asset=json.optJSONObject("asset");
        if(asset==null || !"2.0".equals(asset.optString("version"))) fail("Unsupported glTF asset version.");
        JSONArray required=json.optJSONArray("extensionsRequired");
        if(required!=null && required.length()>0) fail("This viewport requires ordinary uncompressed static GLB. Export without required extensions.");
        JSONArray buffers=json.getJSONArray("buffers");
        if(buffers.length()!=1 || buffers.getJSONObject(0).has("uri") || buffers.getJSONObject(0).getLong("byteLength")<0 || buffers.getJSONObject(0).getLong("byteLength")>binBytes) fail("External or invalid GLB buffers are not allowed.");
        JSONArray images=json.optJSONArray("images");
        if(images!=null) for(int i=0;i<images.length();i++) if(images.getJSONObject(i).has("uri")) fail("Use embedded GLB images, not external image URIs.");
        JSONArray views=json.getJSONArray("bufferViews"),accessors=json.getJSONArray("accessors");
        if(views.length()>10000 || accessors.length()>10000) fail("GLB exceeds the viewport complexity limit.");
        for(int i=0;i<views.length();i++) {
            JSONObject v=views.getJSONObject(i); long start=v.optLong("byteOffset",0),length=v.getLong("byteLength");
            if(v.optInt("buffer",0)!=0 || start<0 || length<0 || length>binBytes || start>binBytes-length) fail("Invalid GLB buffer view.");
        }
        long total=0;
        for(int i=0;i<accessors.length();i++) {
            JSONObject a=accessors.getJSONObject(i);
            if(a.has("sparse")) fail("Sparse GLB accessors are not supported by this viewport.");
            int view=a.optInt("bufferView",-1),component=a.getInt("componentType");
            if(view<0 || view>=views.length()) fail("Invalid GLB accessor view.");
            int bytes=component==5126||component==5125?4:component==5122||component==5123?2:component==5120||component==5121?1:0;
            int fields=components(a.getString("type")); long count=a.getLong("count"),start=a.optLong("byteOffset",0);
            JSONObject v=views.getJSONObject(view); int stride=v.optInt("byteStride",bytes*fields);
            if(bytes==0 || fields==0 || count<0 || count>3_000_000 || start<0 || start>v.getLong("byteLength") || stride<bytes*fields || stride>252 || stride%bytes!=0) fail("Invalid GLB accessor format.");
            if(count>0 && start+(count-1)*stride+(long)bytes*fields>v.getLong("byteLength")) fail("GLB accessor exceeds its buffer view.");
            total+=count*fields*bytes; if(total>96L*1024*1024) fail("GLB expands beyond the mobile geometry memory budget. Choose a lower LOD.");
        }
        JSONArray meshes=json.optJSONArray("meshes");
        if(meshes==null || meshes.length()>1024) fail("GLB requires a bounded static mesh list.");
        long[] meshMemory=new long[meshes.length()]; int[] meshParts=new int[meshes.length()];
        for(int m=0;m<meshes.length();m++) {
            JSONArray primitives=meshes.getJSONObject(m).getJSONArray("primitives");
            if(primitives.length()>1024) fail("Too many GLB primitives.");
            for(int i=0;i<primitives.length();i++) {
                JSONObject primitive=primitives.getJSONObject(i);
                if(primitive.optInt("mode",4)!=4) fail("Only triangle meshes are supported by this viewport.");
                JSONObject attributes=primitive.getJSONObject("attributes");
                int pos=attributes.getInt("POSITION");
                if(pos<0||pos>=accessors.length()) fail("Invalid position accessor.");
                JSONObject position=accessors.getJSONObject(pos);
                if(!"VEC3".equals(position.getString("type"))||position.getInt("componentType")!=5126) fail("GLB position data must use float VEC3.");
                long vertices=position.getLong("count"),indices=vertices;
                if(attributes.has("NORMAL")) {
                    int normal=attributes.getInt("NORMAL");
                    if(normal<0||normal>=accessors.length()) fail("Invalid normal accessor.");
                    JSONObject n=accessors.getJSONObject(normal);
                    if(n.getLong("count")!=vertices||!"VEC3".equals(n.getString("type"))||n.getInt("componentType")!=5126) fail("Invalid GLB normals.");
                }
                if(primitive.has("indices")) {
                    int index=primitive.getInt("indices");
                    if(index<0||index>=accessors.length()) fail("Invalid index accessor.");
                    JSONObject a=accessors.getJSONObject(index); int c=a.getInt("componentType");
                    if(!"SCALAR".equals(a.getString("type"))||(c!=5121&&c!=5123&&c!=5125)) fail("Invalid GLB index data.");
                    indices=a.getLong("count");
                }
                if(indices%3!=0) fail("Incomplete GLB triangles.");
                meshMemory[m]+=vertices*40+indices*16; meshParts[m]++;
            }
        }
        JSONArray nodes=json.getJSONArray("nodes");
        long instanceMemory=0; int drawParts=0;
        for(int i=0;i<nodes.length();i++) {
            JSONObject node=nodes.getJSONObject(i);
            if(node.has("mesh")) {
                int mesh=node.getInt("mesh"); if(mesh<0||mesh>=meshes.length()) fail("Invalid node mesh reference.");
                instanceMemory+=meshMemory[mesh]; drawParts+=meshParts[mesh];
                if(instanceMemory>96L*1024*1024||drawParts>1024) fail("GLB instances exceed the mobile rendering budget. Choose a lower LOD.");
            }
        }
        if(nodes.length()>5000) fail("Too many GLB scene nodes.");
        for(int root=0;root<nodes.length();root++) {
            ArrayDeque<Integer> stack=new ArrayDeque<>(); Set<Integer> path=new HashSet<>();
            stack.push(root); int visited=0;
            while(!stack.isEmpty()) {
                int n=stack.pop(); if(n<0) {path.remove(-n-1);continue;}
                if(n>=nodes.length() || !path.add(n)) fail("Invalid or cyclic GLB scene graph.");
                if(++visited>5000 || path.size()>64) fail("GLB hierarchy is too complex.");
                stack.push(-n-1); JSONArray children=nodes.getJSONObject(n).optJSONArray("children");
                if(children!=null) for(int j=0;j<children.length();j++) { int child=children.getInt(j); if(child<0) fail("Invalid GLB child index."); stack.push(child); }
            }
        }
    }
    private static int components(String type) {
        switch(type) {case "SCALAR":return 1;case "VEC2":return 2;case "VEC3":return 3;case "VEC4":return 4;case "MAT2":return 4;case "MAT3":return 9;case "MAT4":return 16;default:return 0;}
    }
    static void checkNesting(String text) {
        int depth=0; boolean string=false,escape=false;
        for(int i=0;i<text.length();i++) {char c=text.charAt(i); if(string){if(escape)escape=false;else if(c=='\\')escape=true;else if(c=='"')string=false;}else if(c=='"')string=true;else if(c=='{'||c=='['){if(++depth>64)fail("GLB JSON is too deeply nested.");}else if(c=='}'||c==']'){if(--depth<0)fail("Malformed GLB JSON.");}}
        if(depth!=0||string)fail("Incomplete GLB JSON.");
    }
    private static void fail(String message) {throw new IllegalArgumentException(message);}
}
