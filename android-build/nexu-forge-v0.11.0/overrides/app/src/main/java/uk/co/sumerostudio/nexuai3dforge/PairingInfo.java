package uk.co.sumerostudio.nexuai3dforge;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Validated pairing intent. Parsing never connects or changes the trusted device. */
public final class PairingInfo {
    public final String host, offerCode, secretCode;
    public final int port;
    public PairingInfo(String host, int port, String offerCode, String secretCode) {
        PrivateNetwork.requireEndpoint(host, port);
        if (offerCode == null || !offerCode.matches("[A-F0-9]{8}")) throw new IllegalArgumentException("The offer must be eight hexadecimal characters.");
        if (secretCode == null || !secretCode.matches("[A-Z2-9]{16}")) throw new IllegalArgumentException("The pairing secret must contain 16 characters.");
        this.host=host; this.port=port; this.offerCode=offerCode; this.secretCode=secretCode;
    }
    public static PairingInfo parseManual(String host, String port, String pairingCode) {
        String code=normalizePairing(pairingCode);
        if(code.length()!=24) throw new IllegalArgumentException("Use the complete 8-character offer and 16-character secret from Windows Forge.");
        return new PairingInfo(host == null ? "" : host.trim(), parsePort(port), code.substring(0,8), code.substring(8));
    }
    public static PairingInfo parseUri(String text) {
        if (text == null || text.length() > 512) throw new IllegalArgumentException("Pairing link is missing or too long.");
        try {
            URI uri=new URI(text.trim());
            if (!"nexuforge".equalsIgnoreCase(uri.getScheme()) || !"pair".equalsIgnoreCase(uri.getRawAuthority())
                || (uri.getRawPath()!=null && !uri.getRawPath().isEmpty()) || uri.getRawFragment()!=null)
                throw new IllegalArgumentException("This is not a Nexu Forge pairing link.");
            Map<String,String> values=new HashMap<>();
            String query=uri.getRawQuery();
            if(query==null) throw new IllegalArgumentException("Pairing link has no details.");
            Set<String> allowed=Set.of("v","host","port","offer","secret");
            for(String part:query.split("&",-1)) {
                int split=part.indexOf('=');
                if(split<=0) throw new IllegalArgumentException("Malformed pairing parameter.");
                String name=URLDecoder.decode(part.substring(0,split),StandardCharsets.UTF_8.name());
                String value=URLDecoder.decode(part.substring(split+1),StandardCharsets.UTF_8.name());
                if(!allowed.contains(name) || values.put(name,value)!=null) throw new IllegalArgumentException("Duplicate or unknown pairing parameter.");
            }
            if(values.size()!=5 || !"1".equals(values.get("v"))) throw new IllegalArgumentException("Incomplete or unsupported pairing link.");
            return new PairingInfo(values.get("host"),parsePort(values.get("port")),normalizePairing(values.get("offer")),normalizeSecret(values.get("secret")));
        } catch(IllegalArgumentException e) { throw e; }
        catch(Exception e) { throw new IllegalArgumentException("Invalid pairing link.",e); }
    }
    private static int parsePort(String text) {
        String value=text==null?"":text.trim();
        if(value.isEmpty()) return 53971;
        if(!value.matches("[0-9]{4,5}")) throw new IllegalArgumentException("Invalid companion port.");
        int port=Integer.parseInt(value);
        if(port<1024 || port>65535) throw new IllegalArgumentException("Invalid companion port.");
        return port;
    }
    static String normalizePairing(String text) {
        if(text==null || text.length()>80) throw new IllegalArgumentException("Pairing code is missing or too long.");
        String clean=text.trim().toUpperCase(Locale.ROOT);
        if(!clean.matches("[A-Z0-9 -]*")) throw new IllegalArgumentException("Pairing code contains invalid characters.");
        return clean.replace("-","").replace(" ","");
    }
    static String normalizeSecret(String text) {
        String value=normalizePairing(text);
        if(!value.matches("[A-Z2-9]{16}")) throw new IllegalArgumentException("Invalid pairing secret.");
        return value;
    }
}
