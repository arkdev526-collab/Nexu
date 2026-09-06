package uk.co.sumerostudio.nexuai3dforge;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import java.time.Instant;

/** Bounded diagnostics contain operation names and exception types, never private payloads. */
public final class Diagnostics {
    private Diagnostics() { }
    public static synchronized void record(Context context,String operation,Exception error) {
        SharedPreferences prefs=context.getSharedPreferences("forge_diagnostics",Context.MODE_PRIVATE);
        String name=operation.replaceAll("[^A-Za-z0-9 ._-]","");
        if(name.length()>80)name=name.substring(0,80);
        String old=prefs.getString("events","");
        String next=old+Instant.now()+" | "+name+" | "+error.getClass().getSimpleName()+"\n";
        if(next.length()>8192)next=next.substring(next.indexOf('\n',next.length()-8192)+1);
        prefs.edit().putString("events",next).apply();
    }
    public static String report(Context context,boolean paired) {
        Runtime runtime=Runtime.getRuntime();
        return "Nexu AI 3D Forge Android\nVersion: 0.11.0 (110)\nPackage: "+context.getPackageName()
            +"\nAndroid API: "+Build.VERSION.SDK_INT+"\nBuild target: 36; min: 30; Build Tools: 36.0.0\nPairing configured: "+paired
            +"\nHeap ceiling MiB: "+runtime.maxMemory()/1048576L
            +"\nPrompts, images, keys, pairing codes, host addresses and file paths are excluded.\n\n"
            +context.getSharedPreferences("forge_diagnostics",Context.MODE_PRIVATE).getString("events","");
    }
}
