package uk.co.sumerostudio.nexuai3dforge;
import org.junit.Test;
import static org.junit.Assert.*;
public class PrivateNetworkTest {
    @Test public void acceptsCanonicalPrivateEndpoints(){for(String s:new String[]{"127.0.0.1","10.20.30.40","172.16.0.1","172.31.255.254","192.168.1.2","169.254.1.2"})assertTrue(s,PrivateNetwork.isPrivateIpv4(s));}
    @Test public void rejectsPublicAndMetadata(){for(String s:new String[]{"8.8.8.8","172.15.0.1","172.32.0.1","192.169.1.2","169.254.169.254","169.254.170.2","0.0.0.0","255.255.255.255"})assertFalse(s,PrivateNetwork.isPrivateIpv4(s));}
    @Test public void rejectsNumericAmbiguityAndDns(){for(String s:new String[]{"127.1","2130706433","0177.0.0.1","192.168.001.1","192.168.1.256","192.168.1.-1","localhost","host.local","[::1]","192.168.1.1.example.org","http://192.168.1.1"," 192.168.1.1","192.168.1.1\n","192.168..1","192.168.1.1:80"})assertFalse(s,PrivateNetwork.isPrivateIpv4(s));}
    @Test public void rejectsInvalidPorts(){for(int p:new int[]{-1,0,80,1023,65536})assertThrows(IllegalArgumentException.class,()->PrivateNetwork.requireEndpoint("192.168.1.2",p));}
    @Test public void acceptsPortBounds(){PrivateNetwork.requireEndpoint("10.0.0.1",1024);PrivateNetwork.requireEndpoint("10.0.0.1",65535);}
}
