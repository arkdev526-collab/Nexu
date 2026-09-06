from pathlib import Path
import sys,xml.etree.ElementTree as E,hashlib
root=Path(sys.argv[1]);j=root/'app/src/main/java/uk/co/sumerostudio/nexuai3dforge';p=j/'MainActivity.java';s=p.read_text()
old='referenceSummary.setText(ev.fileName+" · "+ev.width+"×"+ev.height+" · local mean RGB "+ev.meanR+","+ev.meanG+","+ev.meanB)'
assert old in s
s=s.replace(old,'if(referenceSummary!=null)referenceSummary.setText(getString(R.string.reference_info,ev.fileName,ev.width,ev.height))')
p.write_text(s)
strings=root/'app/src/main/res/values/strings.xml';text=strings.read_text().replace('%1$s · %2$d tris · %3$s','%1$s · Triangles: %2$d · %3$s');strings.write_text(text)
icons=root/'app/src/main/res/mipmap-anydpi-v26';dest=root/'app/src/main/res/mipmap-anydpi';icons.rename(dest)
# Test-only JSON patch; Android uses its platform JSON at runtime.
g=root/'app/build.gradle';text=g.read_text().replace("org.json:json:20260719","org.json:json:20260814");g.write_text(text)
# Preserve original icon pixels. Monochrome uses the same artwork alpha mask.
icon=dest/'forge_launcher.xml';text=icon.read_text().replace('</adaptive-icon>','<monochrome><inset android:inset="16%"><bitmap android:src="@drawable/appicon" android:gravity="fill"/></inset></monochrome></adaptive-icon>');icon.write_text(text)
Path('evidence/final-source-sha256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  MainActivity.java\n')
