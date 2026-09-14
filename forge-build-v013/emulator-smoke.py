import subprocess,time,re,xml.etree.ElementTree as ET,pathlib
out=pathlib.Path('evidence');out.mkdir(exist_ok=True)
package='uk.co.sumerostudio.nexuai3dforge.preview.v0130'
def adb(*args):return subprocess.check_output(['adb',*args],timeout=30).decode(errors='replace')
def hierarchy():
 adb('shell','uiautomator','dump','/sdcard/forge-ui.xml')
 return adb('shell','cat','/sdcard/forge-ui.xml')
def nodes(label):
 return [n for n in ET.fromstring(hierarchy()).iter('node') if n.get('text','').casefold()==label.casefold()]
def tap(label):
 found=nodes(label)
 assert found,'Missing '+label
 coords=list(map(int,re.findall(r'\d+',found[0].get('bounds'))))
 adb('shell','input','tap',str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2));time.sleep(1)
def snapshot(name):
 (out/(name+'.xml')).write_text(hierarchy())
 with (out/(name+'.png')).open('wb') as f:subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True,timeout=30)
for _ in range(120):
 if adb('shell','getprop','sys.boot_completed').strip()=='1':break
 time.sleep(2)
else:raise RuntimeError('Android boot timeout')
adb('logcat','-c')
try:
 adb('install','-r','project/Android/app/build/outputs/apk/debug/app-debug.apk')
 adb('shell','input','keyevent','82')
 adb('shell','am','start','-W','-n',package+'/uk.co.sumerostudio.nexuai3dforge.MainActivity');time.sleep(3)
 tap('Screen')
 snapshot('android-screen')
 assert nodes('Pause / Resume'),'Screen controls missing'
 tap('Pause / Resume');tap('Fit / Fill screen');tap('Reconnect screen')
 tap('Pair')
 assert nodes('Scan to pair'),'QR scan entry missing'
 snapshot('android-preview')
 logs=adb('logcat','-d','-s','AndroidRuntime:E')
 assert 'FATAL EXCEPTION' not in logs,logs
 (out/'emulator-result.txt').write_text('PASS: API 36 emulator installed and launched Preview, opened Screen, tapped Pause/Resume, Fit/Fill and Reconnect, opened Pair and verified Scan to pair. No fatal AndroidRuntime exception. Device is unpaired: real screen frames and camera QR were not exercised.\n')
finally:
 try:snapshot('android-final')
 except Exception as error:(out/'snapshot-error.txt').write_text(str(error))
 (out/'android-runtime.txt').write_text(adb('logcat','-d','-s','AndroidRuntime:E'))
