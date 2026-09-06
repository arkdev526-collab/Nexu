from pathlib import Path
import sys,xml.etree.ElementTree as E,hashlib
root=Path(sys.argv[1]);j=root/'app/src/main/java/uk/co/sumerostudio/nexuai3dforge';p=j/'MainActivity.java';s=p.read_text()
old='referenceSummary.setText(ev.fileName+" · "+ev.width+"×"+ev.height+" · local mean RGB "+ev.meanR+","+ev.meanG+","+ev.meanB)'
assert old in s
s=s.replace(old,'if(referenceSummary!=null)referenceSummary.setText(getString(R.string.reference_info,ev.fileName,ev.width,ev.height))')
# API 36 PhoneWindow.getInsetsController dereferences its DecorView. During
# Activity.onCreate, before setContentView, that DecorView need not exist.
# Apply appearance from the view's actual inset delivery instead, with a null
# guard during detach. This preserves edge-to-edge without swallowing a crash.
old='private void configureWindow(){Window w=getWindow();if(Build.VERSION.SDK_INT<35)enableLegacyEdgeToEdge(w);WindowInsetsController c=w.getInsetsController();if(c!=null)c.setSystemBarsAppearance(0,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}'
assert s.count(old)==1
s=s.replace(old,'private void configureWindow(){if(Build.VERSION.SDK_INT<35)enableLegacyEdgeToEdge(getWindow());}\n\n    /** System-bar control belongs to an attached view, never a not-yet-created window decor. */\n    private static void applySystemBarAppearance(View view){WindowInsetsController controller=view.getWindowInsetsController();if(controller!=null)controller.setSystemBarsAppearance(0,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}')
old='v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom));return insets;'
assert s.count(old)==1
s=s.replace(old,'v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom));applySystemBarAppearance(v);return insets;')
assert '.getInsetsController()' not in s
assert 'view.getWindowInsetsController()' in s and 'if(controller!=null)' in s
p.write_text(s)
Path('evidence/startup-regression.txt').write_text('PASS: no pre-decor Window.getInsetsController call; attached-view WindowInsetsController is null-guarded; system-bar appearance applied in real inset callback. API 36 first-launch emulator test remains mandatory.\n')
strings=root/'app/src/main/res/values/strings.xml';text=strings.read_text().replace('%1$s · %2$d tris · %3$s','%1$s · Triangles: %2$d · %3$s');strings.write_text(text)
icons=root/'app/src/main/res/mipmap-anydpi-v26';dest=root/'app/src/main/res/mipmap-anydpi';icons.rename(dest)
# Test-only JSON patch; Android uses its platform JSON at runtime.
g=root/'app/build.gradle';text=g.read_text().replace('org.json:json:20260719','org.json:json:20260814');g.write_text(text)
# Preserve original icon pixels. Monochrome uses the same artwork alpha mask.
icon=dest/'forge_launcher.xml';text=icon.read_text().replace('</adaptive-icon>','<monochrome><inset android:inset="16%"><bitmap android:src="@drawable/appicon" android:gravity="fill"/></inset></monochrome></adaptive-icon>');icon.write_text(text)
Path('evidence/final-source-sha256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  MainActivity.java\n')
