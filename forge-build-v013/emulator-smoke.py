import subprocess,time,xml.etree.ElementTree as ET,pathlib
out=pathlib.Path('evidence');out.mkdir(exist_ok=True)
package='uk.co.sumerostudio.nexuai3dforge.preview.v0130'
def adb(*args):return subprocess.check_output(['adb',*args],timeout=30).decode(errors='replace')
for _ in range(120):
 if adb('shell','getprop','sys.boot_completed').strip()=='1':break
 time.sleep(2)
else:raise RuntimeError('Android boot timeout')
adb('logcat','-c');adb('install','-r','project/Android/app/build/outputs/apk/debug/app-debug.apk')
adb('shell','am','start','-W','-n',package+'/uk.co.sumerostudio.nexuai3dforge.MainActivity');time.sleep(3)
def hierarchy():
 adb('shell','uiautomator','dump','/sdcard/forge-ui.xml')
 return adb('shell','cat','/sdcard/forge-ui.xml')
def tap(label):
 import re
 xml=hierarchy()
 nodes=[n for n in ET.fromstring(xml).iter('node') if n.get('text')==label]
 assert nodes,'Missing '+label
 coords=list(map(int,re.findall(r'\d+',nodes[0].get('bounds'))));adb('shell','input','tap',str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2));time.sleep(1)
tap('Screen');assert 'Pause / Resume' in hierarchy();tap('Pause / Resume');tap('Fit / Fill screen');tap('Reconnect screen')
tap('Pair');assert 'Scan to pair' in hierarchy()
(out/'android-ui.xml').write_text(hierarchy())
with (out/'android-preview.png').open('wb') as f:subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True,timeout=30)
logs=adb('logcat','-d','-s','AndroidRuntime:E');(out/'android-runtime.txt').write_text(logs);assert 'FATAL EXCEPTION' not in logs,logs
(out/'emulator-result.txt').write_text('API 36 emulator: install, launch, Screen controls and QR pairing entry verified; no fatal AndroidRuntime exception. Real camera QR and PC capture not exercised.\n')
