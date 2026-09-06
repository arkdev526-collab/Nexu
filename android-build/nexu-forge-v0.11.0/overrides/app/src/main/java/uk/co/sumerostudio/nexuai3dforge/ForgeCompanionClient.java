package uk.co.sumerostudio.nexuai3dforge;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Private-LAN v1 client. Network I/O never holds a monitor needed by the UI. */
public final class ForgeCompanionClient {
    private static final Set<String> METHODS=Set.of("status","brief","plan","build","refine.plan","refine.apply",
        "material.presets","material.plan","material.apply","grammar.catalogue","learning.stats","learning.feedback",
        "jobs","job.get","job.cancel","assets","asset.glb","reference.upload");
    private final SecurePairingStore store;
    private final AtomicLong epoch=new AtomicLong();
    private final Set<HttpURLConnection> active=ConcurrentHashMap.newKeySet();
    private volatile SecurePairingStore.Record session;
    public ForgeCompanionClient(SecurePairingStore store) { this.store=store; }
    public void restore() { long ticket=epoch.get(); SecurePairingStore.Record loaded=store.load(); if(ticket==epoch.get()) session=loaded; }
    public boolean isPaired() { return session!=null; }
    public String host() { SecurePairingStore.Record s=session; return s==null?"":s.host; }
    public int port() { SecurePairingStore.Record s=session; return s==null?53971:s.port; }
    public void cancelPending() { for(HttpURLConnection c:active) c.disconnect(); active.clear(); }
    public void forget() { epoch.incrementAndGet(); session=null; cancelPending(); synchronized(store) { store.clear(); session=null; } }
    public JSONObject health(String host,int port) throws Exception {
        return request("GET",host,port,"companion/v1/health",null,8000,8192);
    }
    public JSONObject pair(PairingInfo info,String name) throws Exception {
        long ticket=epoch.incrementAndGet();
        byte[] key=CompanionCrypto.derivePairingKey(info.secretCode);
        String id="android-"+UUID.randomUUID().toString().replace("-","");
        JSONObject env=CompanionCrypto.seal(key,new JsonObject().put("deviceId",id).put("name",deviceName(name)),"pair:"+info.offerCode);
        JSONObject root=request("POST",info.host,info.port,"companion/v1/pair",new JsonObject().put("offer",info.offerCode).put("envelope",env),35000,65536);
        JSONObject opened=CompanionCrypto.open(key,root.getJSONObject("envelope"),"pair:"+info.offerCode+":"+env.getString("nonce"));
        if(!opened.optBoolean("ok",false) || !id.equals(opened.optString("deviceId"))) throw new IllegalStateException("Pairing response did not match this device.");
        byte[] secret=CompanionCrypto.fromB64url(opened.getString("deviceSecret"));
        if(secret.length!=32 || ticket!=epoch.get()) throw new IllegalStateException("Pairing was cancelled or returned an invalid key.");
        synchronized(store) {
            if(ticket!=epoch.get()) throw new IllegalStateException("Pairing was cancelled.");
            store.save(info.host,info.port,id,secret);
            session=new SecurePairingStore.Record(info.host,info.port,id,secret);
        }
        java.util.Arrays.fill(key,(byte)0);
        return opened;
    }
    public JSONObject rpc(String method,JSONObject params) throws Exception {
        if(!METHODS.contains(method)) throw new IllegalArgumentException("Unsupported companion operation.");
        SecurePairingStore.Record s=session;
        if(s==null) throw new IllegalStateException("Pair this Android device with Windows Forge first.");
        long ticket=epoch.get();
        JSONObject env=CompanionCrypto.seal(s.deviceSecret,new JsonObject().put("method",method).put("params",params==null?new JsonObject():params),"rpc:"+s.deviceId);
        int bound="asset.glb".equals(method)?64*1024*1024:4*1024*1024;
        JSONObject root=request("POST",s.host,s.port,"companion/v1/rpc",new JsonObject().put("deviceId",s.deviceId).put("envelope",env),45000,bound);
        if(ticket!=epoch.get() || s!=session) throw new IllegalStateException("Pairing changed; the old response was discarded.");
        JSONObject opened=CompanionCrypto.open(s.deviceSecret,root.getJSONObject("envelope"),"rpc:"+s.deviceId+":"+env.getString("nonce"));
        if(!opened.optBoolean("ok",false)) throw new IllegalStateException("Windows Forge rejected the authenticated request.");
        JSONObject result=opened.optJSONObject("result");
        if(result==null) throw new IllegalStateException("Windows Forge returned an invalid result.");
        return result;
    }
    private JSONObject request(String method,String host,int port,String path,JSONObject body,int timeout,int limit) throws Exception {
        PrivateNetwork.requireEndpoint(host,port);
        if(!Set.of("companion/v1/health","companion/v1/pair","companion/v1/rpc").contains(path)) throw new IllegalArgumentException("Unknown endpoint.");
        HttpURLConnection c=(HttpURLConnection)new URL("http",host,port,"/"+path).openConnection(Proxy.NO_PROXY);
        active.add(c);
        try {
            c.setInstanceFollowRedirects(false); c.setUseCaches(false);
            c.setConnectTimeout(Math.min(timeout,10000)); c.setReadTimeout(timeout);
            c.setRequestMethod(method); c.setRequestProperty("Accept","application/json");
            c.setRequestProperty("Cache-Control","no-store"); c.setRequestProperty("Accept-Encoding","identity");
            if(body!=null) {
                byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);
                if(bytes.length>24*1024*1024) throw new IllegalArgumentException("Reference request exceeds the safe transfer size.");
                c.setDoOutput(true); c.setRequestProperty("Content-Type","application/json; charset=utf-8");
                c.setFixedLengthStreamingMode(bytes.length);
                try(OutputStream out=c.getOutputStream()) { out.write(bytes); }
            }
            int status=c.getResponseCode();
            if(status<200 || status>=300) throw new IllegalStateException("Windows Forge returned HTTP "+status+". Check pairing and the PC queue before retrying a generation. Redirects are not followed.");
            String type=c.getContentType();
            if(type==null || !type.toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) throw new IllegalStateException("The paired endpoint did not return JSON.");
            long length=c.getContentLengthLong();
            Runtime runtime=Runtime.getRuntime();
            long available=runtime.maxMemory()-(runtime.totalMemory()-runtime.freeMemory());
            int safeLimit=(int)Math.min(limit,Math.max(1_048_576,available/6));
            if(length>safeLimit) throw new IllegalStateException("This asset exceeds the current Android memory budget. Select a lower LOD or free memory, then retry. The original remains on Windows.");
            try(InputStream in=c.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[16384]; int read,total=0;
                while((read=in.read(buffer))!=-1) {
                    if(Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException("Transfer cancelled.");
                    total+=read; if(total>safeLimit) throw new IllegalStateException("Companion response exceeds the Android memory safety limit. Try a lower LOD.");
                    out.write(buffer,0,read);
                }
                return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { active.remove(c); c.disconnect(); }
    }
    private static String deviceName(String name) {
        String clean=name==null?"Android device":name.replaceAll("[\\p{Cntrl}<>]","").trim();
        return clean.isEmpty()?"Android device":clean.substring(0,Math.min(48,clean.length()));
    }
}
