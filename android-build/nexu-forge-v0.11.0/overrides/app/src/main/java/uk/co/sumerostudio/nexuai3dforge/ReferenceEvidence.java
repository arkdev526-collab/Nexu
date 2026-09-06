package uk.co.sumerostudio.nexuai3dforge;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Local bounded pixel evidence, not neural reconstruction. */
public final class ReferenceEvidence {
    public static final int MAX_BYTES=12*1024*1024;
    public final byte[] bytes;
    public final String mime,fileName;
    public final int width,height,meanR,meanG,meanB;
    private ReferenceEvidence(byte[] b,String mime,String name,int w,int h,int r,int g,int blue){bytes=b;this.mime=mime;fileName=name;width=w;height=h;meanR=r;meanG=g;meanB=blue;}
    public JSONObject evidenceJson() {
        return new JsonObject().put("view","unclassified").put("width",width).put("height",height)
            .put("meanRgb",new JSONArray(java.util.Arrays.asList(meanR/255.0,meanG/255.0,meanB/255.0)));
    }
    public static ReferenceEvidence read(ContentResolver resolver,Uri uri,String name) throws Exception {
        if(uri==null||!"content".equals(uri.getScheme()))throw new IllegalArgumentException("Choose an image using the Android document picker.");
        byte[] bytes;
        try(InputStream in=resolver.openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            if(in==null)throw new java.io.IOException("Reference could not be opened.");
            byte[] block=new byte[16384];int n,total=0;
            while((n=in.read(block))!=-1){total+=n;if(total>MAX_BYTES)throw new IllegalArgumentException("Reference image exceeds 12 MB.");out.write(block,0,n);}bytes=out.toByteArray();
        }
        String mime=magic(bytes),declared=resolver.getType(uri);
        if(declared!=null&&declared.startsWith("image/")&&!mime.equals(declared))throw new IllegalArgumentException("Image type does not match its file content.");
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
        if(bounds.outWidth<1||bounds.outHeight<1||bounds.outWidth>32768||bounds.outHeight>32768||(long)bounds.outWidth*bounds.outHeight>100_000_000)throw new IllegalArgumentException("Reference dimensions exceed the mobile safety limit.");
        BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;
        while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>256)options.inSampleSize*=2;
        Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
        if(bitmap==null)throw new IllegalArgumentException("Reference pixels could not be decoded.");
        long r=0,g=0,b=0,count=0;
        try {for(int y=0;y<bitmap.getHeight();y++)for(int x=0;x<bitmap.getWidth();x++){int c=bitmap.getPixel(x,y);if((c>>>24)<32)continue;r+=(c>>16)&255;g+=(c>>8)&255;b+=c&255;count++;}}
        finally {bitmap.recycle();}
        if(count==0)throw new IllegalArgumentException("Reference is fully transparent.");
        String extension=mime.equals("image/png")?".png":mime.equals("image/jpeg")?".jpg":".webp";
        return new ReferenceEvidence(bytes,mime,DownloadsStore.safeName(name,extension),bounds.outWidth,bounds.outHeight,(int)(r/count),(int)(g/count),(int)(b/count));
    }
    static String magic(byte[] b) {
        if(b.length>=8&&(b[0]&255)==137&&b[1]==80&&b[2]==78&&b[3]==71&&b[4]==13&&b[5]==10&&b[6]==26&&b[7]==10)return "image/png";
        if(b.length>=3&&(b[0]&255)==255&&(b[1]&255)==216&&(b[2]&255)==255)return "image/jpeg";
        if(b.length>=12&&b[0]=='R'&&b[1]=='I'&&b[2]=='F'&&b[3]=='F'&&b[8]=='W'&&b[9]=='E'&&b[10]=='B'&&b[11]=='P')return "image/webp";
        throw new IllegalArgumentException("Reference must contain PNG, JPEG or WebP image data.");
    }
}
