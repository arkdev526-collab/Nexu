package uk.co.sumerostudio.nexuai3dforge;
import org.junit.Test;
import static org.junit.Assert.*;
public class JobStateTest {
    @Test public void allCompletedStatesAreTerminal(){for(String s:new String[]{"completed","completed-with-warnings","completed-blocked"}){JobState j=new JobState(new JsonObject().put("status",s).put("outputRelative","model/version"));assertTrue(j.terminal);assertTrue(j.generated);assertEquals("model/version",j.directory);}}
    @Test public void blockedIsNeverReady(){JobState j=new JobState(new JsonObject().put("status","completed-blocked"));assertTrue(j.label.startsWith("BLOCKED"));assertFalse(j.label.startsWith("READY"));}
    @Test public void cancelledAndFailedPreservePreviousVersions(){for(String s:new String[]{"cancelled","failed"}){JobState j=new JobState(new JsonObject().put("status",s));assertTrue(j.terminal);assertFalse(j.generated);}}
    @Test public void progressUsesRealStageCounts(){JobState j=new JobState(new JsonObject().put("status","running").put("stage","Modelling").put("progress",new JsonObject().put("index",4).put("total",8)));assertEquals(4,j.index);assertEquals(8,j.total);assertFalse(j.terminal);}
}
