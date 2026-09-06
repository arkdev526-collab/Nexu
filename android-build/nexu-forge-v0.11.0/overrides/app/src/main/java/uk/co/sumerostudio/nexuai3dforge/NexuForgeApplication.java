package uk.co.sumerostudio.nexuai3dforge;

import android.app.Application;

/** No WebView or network initialisation at process start. Unavailable rendering must not stop the app. */
public final class NexuForgeApplication extends Application {
    @Override public void onCreate() { super.onCreate(); }
}
