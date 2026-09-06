from pathlib import Path
import sys,hashlib,re,xml.etree.ElementTree as E
root=Path(sys.argv[1]); p=root/'app/src/main/java/uk/co/sumerostudio/nexuai3dforge/MainActivity.java'
s=p.read_text()
old='else done.run();});},"3D transfer failed")'
assert s.count(old)==1
s=s.replace(old,'else done.run();});});},"3D transfer failed")')
s=s.replace('public final class MainActivity extends Activity {','''public final class MainActivity extends androidx.activity.ComponentActivity {
    private androidx.activity.OnBackPressedCallback backCallback;
    private androidx.activity.result.ActivityResultLauncher<Intent> referencePicker,modelPicker;''')
old='super.onCreate(saved);configureWindow();client='
assert old in s
s=s.replace(old,'''super.onCreate(saved);
        referencePicker=registerForActivityResult(new androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(),result->onDocumentResult(REQ_REFERENCE,result.getResultCode(),result.getData()));
        modelPicker=registerForActivityResult(new androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(),result->onDocumentResult(REQ_GLB,result.getResultCode(),result.getData()));
        configureWindow();client=''')
old='    @Override @SuppressWarnings("deprecation") public void onBackPressed(){if(currentScreen!=Screen.CREATE){showScreen(Screen.CREATE);return;}super.onBackPressed();}'
assert old in s;s=s.replace(old,'')
old='private void registerPredictiveBack(){if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->{if(currentScreen!=Screen.CREATE)showScreen(Screen.CREATE);else finish();});}'
assert old in s
s=s.replace(old,'''private void registerPredictiveBack(){backCallback=new androidx.activity.OnBackPressedCallback(currentScreen!=Screen.CREATE){@Override public void handleOnBackPressed(){showScreen(Screen.CREATE);}};getOnBackPressedDispatcher().addCallback(this,backCallback);}''')
s=s.replace('private void showScreen(Screen screen){currentScreen=screen;', 'private void showScreen(Screen screen){currentScreen=screen;if(backCallback!=null)backCallback.setEnabled(screen!=Screen.CREATE);')
old='@Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);'
assert old in s;s=s.replace(old,'private void onDocumentResult(int requestCode,int resultCode,Intent data){')
s=s.replace('startActivityForResult(i,REQ_REFERENCE)','referencePicker.launch(i)').replace('startActivityForResult(i,REQ_GLB)','modelPicker.launch(i)')
s=s.replace('getContentResolver().takePersistableUriPermission(uri,data.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION);','if((data.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0)getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);')
old='private void configureWindow(){Window w=getWindow();w.setDecorFitsSystemWindows(false);WindowInsetsController c=w.getInsetsController();'
assert old in s
s=s.replace(old,'private void configureWindow(){Window w=getWindow();if(Build.VERSION.SDK_INT<35)enableLegacyEdgeToEdge(w);WindowInsetsController c=w.getInsetsController();')
s=s.replace('    private void buildChrome(){','''    /** Only API 30–34 needs this supported legacy call; newer Android enforces edge-to-edge. */
    @SuppressWarnings("deprecation")
    private static void enableLegacyEdgeToEdge(Window window){window.setDecorFitsSystemWindows(false);}

    private void buildChrome(){''')
# Move identified user-visible text into translatable resources. Protocol port digits remain ASCII.
strings=root/'app/src/main/res/values/strings.xml'; resources=E.parse(strings).getroot()
values={
 'no_reference':'No reference selected.',
 'reference_info':'%1$s · %2$d×%3$d · local reference',
 'local_model':'Local GLB preview · not uploaded',
 'restored_model':'Restored local GLB · not uploaded',
 'restored_reference':'%1$s · restored local reference',
 'reference_unavailable':'Reference unavailable. Choose it again.',
 'asset_information':'%1$s · %2$d tris · %3$s',
 'status_paired':'LOCAL · PAIRED',
 'status_unpaired':'LOCAL · NOT PAIRED',
 'pair_information':'PAIRED\n%1$s:%2$s\nDevice key protected by Android Keystore.',
 'pair_instructions':'NOT PAIRED\nCreate a fresh pairing offer in Windows Forge.'}
for element in list(resources):
 if element.get('name')=='pair_link_title':resources.remove(element)
for name,text in values.items():E.SubElement(resources,'string',name=name).text=text
E.indent(resources);strings.write_text(E.tostring(resources,encoding='unicode')+'\n')
s=s.replace('referenceSummary.setText("No reference selected.")','referenceSummary.setText(R.string.no_reference)')
s=s.replace('referenceSummary.setText(ev.fileName+" · "+ev.width+"×"+ev.height+" · local reference")','referenceSummary.setText(getString(R.string.reference_info,ev.fileName,ev.width,ev.height))')
s=s.replace('selectedAssetLabel.setText("Local GLB preview · not uploaded")','selectedAssetLabel.setText(R.string.local_model)').replace('selectedAssetLabel.setText("Restored local GLB · not uploaded")','selectedAssetLabel.setText(R.string.restored_model)')
s=s.replace('referenceSummary.setText(reference.fileName+" · restored local reference")','referenceSummary.setText(getString(R.string.restored_reference,reference.fileName))')
s=s.replace('referenceSummary.setText(value==null?"Reference unavailable. Choose it again.":value.fileName+" · restored reference")','referenceSummary.setText(value==null?getString(R.string.reference_unavailable):getString(R.string.restored_reference,value.fileName))')
s=s.replace('selectedAssetLabel.setText(selectedAsset.optString("displayName",selectedAsset.optString("assetName","Asset"))+" · "+selectedAsset.optInt("triangles",0)+" tris · "+selectedAsset.optString("qaLabel","QA pending"))','selectedAssetLabel.setText(getString(R.string.asset_information,selectedAsset.optString("displayName",selectedAsset.optString("assetName","Asset")),selectedAsset.optInt("triangles",0),selectedAsset.optString("qaLabel","QA pending")))')
s=s.replace('topStatus.setText(client.isPaired()?"LOCAL · PAIRED":"LOCAL · NOT PAIRED")','topStatus.setText(client.isPaired()?R.string.status_paired:R.string.status_unpaired)')
s=s.replace('pairStatus.setText(client.isPaired()?"PAIRED\\n"+client.host()+":"+client.port()+"\\nDevice key protected by Android Keystore.":"NOT PAIRED\\nCreate a fresh pairing offer in Windows Forge.")','pairStatus.setText(client.isPaired()?getString(R.string.pair_information,client.host(),String.format(Locale.ROOT,"%d",client.port())):getString(R.string.pair_instructions))')
s=s.replace('pairPort.setText(Integer.toString(client.port()))','pairPort.setText(String.format(Locale.ROOT,"%d",client.port()))')
p.write_text(s)
# Add the supported AndroidX lifecycle/back/result implementation, not a second UI framework.
g=root/'app/build.gradle';text=g.read_text();text=text.replace('dependencies {',"dependencies {\n    implementation 'androidx.activity:activity:1.13.0'")
g.write_text(text)
props=root/'gradle.properties';props.write_text(props.read_text()+'\nandroid.useAndroidX=true\n')
manifest=root/'app/src/main/AndroidManifest.xml';text=manifest.read_text().replace('android:screenOrientation="unspecified"','').replace('@drawable/appicon','@mipmap/forge_launcher');manifest.write_text(text)
icons=root/'app/src/main/res/mipmap-anydpi-v26';icons.mkdir(exist_ok=True)
(icons/'forge_launcher.xml').write_text('''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/forge_bg"/><foreground><inset android:inset="16%"><bitmap android:src="@drawable/appicon" android:gravity="fill"/></inset></foreground></adaptive-icon>\n''')
colours=root/'app/src/main/res/values/colors.xml';col=E.parse(colours).getroot()
for element in list(col):
 if element.get('name') not in ('forge_bg','forge_accent'):col.remove(element)
colours.write_text(E.tostring(col,encoding='unicode')+'\n')
v=root/'app/src/main/assets/viewer.html';t=v.read_text()
t=t.replace('window.forgeOrbit=(delta)=>{viewer.yaw+=delta;viewer.render();};window.forgeZoom=(factor)=>{viewer.distance*=factor;viewer.render();};','window.forgeOrbit=(delta)=>{viewport.customEye=null;viewport.projection="perspective";viewport.yaw+=delta;viewport.render();};window.forgeZoom=(factor)=>{viewport.distance=Math.max(.03,Math.min(10000,viewport.distance*factor));viewport.render();};')
t=t.replace('maximum-scale=1,user-scalable=no','user-scalable=yes');v.write_text(t)
assert 'onBackPressed()' not in s and 'startActivityForResult(' not in s
Path('evidence/android-source-integrity.txt').write_text('Android source-level compatibility repairs.\nMainActivity SHA256: '+hashlib.sha256(p.read_bytes()).hexdigest()+'\nViewport SHA256: '+hashlib.sha256(v.read_bytes()).hexdigest()+'\nAndroidX Activity 1.13.0: lifecycle-aware back and document results. API 30 retained.\n')
