package uk.co.sumerostudio.nexuai3dforge;
import org.junit.Test;
import static org.junit.Assert.*;
public class PairingInfoTest {
    private static final String SECRET="ABCDEFGHJKLMNPQR";
    private static final String LINK="nexuforge://pair?v=1&host=192.168.1.20&port=53971&offer=ABCDEF12&secret="+SECRET;
    @Test public void manualGroupSeparators(){PairingInfo p=PairingInfo.parseManual("192.168.1.20","53971","abcdef12-abcd-efgh-jklm-npqr");assertEquals("ABCDEF12",p.offerCode);assertEquals(SECRET,p.secretCode);}
    @Test public void validUri(){PairingInfo p=PairingInfo.parseUri(LINK);assertEquals("192.168.1.20",p.host);assertEquals(53971,p.port);assertEquals(SECRET,p.secretCode);}
    @Test public void blocksPublicUri(){assertThrows(IllegalArgumentException.class,()->PairingInfo.parseUri(LINK.replace("192.168.1.20","8.8.8.8")));}
    @Test public void blocksDuplicateParameters(){assertThrows(IllegalArgumentException.class,()->PairingInfo.parseUri(LINK+"&host=10.0.0.2"));}
    @Test public void rejectsUnknownAndFragments(){for(String s:new String[]{LINK+"&x=1",LINK+"#secret",LINK.replace("//pair?","//pair/path?"),LINK.replace("//pair?","//user@pair?"),LINK.replace("v=1","v=2")})assertThrows(IllegalArgumentException.class,()->PairingInfo.parseUri(s));}
    @Test public void rejectsStrippedGarbage(){assertThrows(IllegalArgumentException.class,()->PairingInfo.parseManual("10.0.0.1","53971","ABCDEF12-ABCD!EFGHJKLMNPQR"));}
    @Test public void rejectsNonHexOffer(){assertThrows(IllegalArgumentException.class,()->PairingInfo.parseManual("10.0.0.1","53971","ABCDEFGH"+SECRET));}
    @Test public void supportsDefaultPort(){assertEquals(53971,PairingInfo.parseManual("10.0.0.1","","ABCDEF12"+SECRET).port);}
}
