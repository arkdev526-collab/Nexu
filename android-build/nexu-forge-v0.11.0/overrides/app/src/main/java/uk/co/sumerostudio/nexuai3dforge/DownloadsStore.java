package uk.co.sumerostudio.nexuai3dforge;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

/** Writes a new Downloads item; no existing user file is overwritten. Call off the UI thread. */
public final class DownloadsStore {
    public static final class Saved {
        public final Uri uri; public final String name,sha256,mime;
        Saved(Uri uri,String name,String hash,String mime){this.uri=uri;this.name=name;sha256=hash;this.mime=mime;}
    }
    private DownloadsStore() { }
    public static Saved write(ContentResolver resolver,String name,String mime,byte[] bytes) throws Exception {
        if(!mime.equals("model/gltf-binary")&&!mime.equals("text/plain")) throw new IllegalArgumentException("Unsupported export type.");
        if(mime.equals("model/gltf-binary")) GlbSafety.validate(bytes);
        String safe=safeName(name,mime.equals("text/plain")?".txt":".glb");
        ContentValues values=new ContentValues(); values.put(MediaStore.Downloads.DISPLAY_NAME,safe);
        values.put(MediaStore.Downloads.MIME_TYPE,mime);
        values.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Nexu AI 3D Forge");
        values.put(MediaStore.Downloads.IS_PENDING,1);
        Uri uri=resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
        if(uri==null) throw new java.io.IOException("Android could not create the Downloads item.");
        boolean published=false;
        try {
            try(OutputStream out=resolver.openOutputStream(uri,"w")) {
                if(out==null) throw new java.io.IOException("Downloads destination is unavailable.");
                out.write(bytes); out.flush();
            }
            byte[] expected=MessageDigest.getInstance("SHA-256").digest(bytes);
            MessageDigest actual=MessageDigest.getInstance("SHA-256"); long count=0;
            try(InputStream in=resolver.openInputStream(uri)) {
                if(in==null) throw new java.io.IOException("Could not verify exported file.");
                byte[] buffer=new byte[16384]; int n;
                while((n=in.read(buffer))!=-1) {count+=n;if(count>bytes.length)throw new java.io.IOException("Export size mismatch.");actual.update(buffer,0,n);}
            }
            if(count!=bytes.length || !MessageDigest.isEqual(expected,actual.digest())) throw new java.io.IOException("Export verification failed. The incomplete file was removed.");
            ContentValues done=new ContentValues();done.put(MediaStore.Downloads.IS_PENDING,0);
            if(resolver.update(uri,done,null,null)!=1) throw new java.io.IOException("Android could not publish the verified export.");
            published=true;return new Saved(uri,safe,hex(expected),mime);
        } finally {if(!published)resolver.delete(uri,null,null);}
    }
    static String safeName(String input,String extension) {
        String name=input==null?"ForgeAsset":input.replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]","_").trim();
        if(name.toLowerCase(java.util.Locale.ROOT).endsWith(extension))name=name.substring(0,name.length()-extension.length());
        name=name.replaceAll("^[. ]+|[. ]+$","");if(name.isEmpty())name="ForgeAsset";
        if(name.length()>100)name=name.substring(0,100);
        return name+extension;
    }
    public static String hex(byte[] bytes) {StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
}
