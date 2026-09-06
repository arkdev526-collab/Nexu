package uk.co.sumerostudio.nexuai3dforge;
import org.json.JSONObject;

/** A terminal result is not the same as a QA pass. Matches the Windows v0.10.1 contract. */
public final class JobState {
    public final String status,label,directory;
    public final boolean terminal,generated;
    public final int index,total;
    public JobState(JSONObject job) {
        status=job.optString("status","unknown");
        generated=status.equals("completed")||status.equals("completed-with-warnings")||status.equals("completed-blocked");
        terminal=generated||status.equals("failed")||status.equals("cancelled");
        directory=job.optString("outputRelative","");
        JSONObject progress=job.optJSONObject("progress");
        total=progress==null?0:Math.max(0,Math.min(100,progress.optInt("total",0)));
        index=progress==null?0:Math.max(0,Math.min(total,progress.optInt("index",0)));
        label=status.equals("completed-blocked")?"BLOCKED — inspect QA before using this asset":status.equals("completed-with-warnings")?"READY WITH WARNINGS":status.equals("completed")?"READY":status.equals("failed")?"FAILED — your previous versions are safe":status.equals("cancelled")?"CANCELLED — your previous versions are safe":job.optString("stage","Waiting for Windows Forge");
    }
}
