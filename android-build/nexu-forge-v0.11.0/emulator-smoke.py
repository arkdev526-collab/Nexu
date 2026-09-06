"""Isolated emulator smoke gate, using a debug-signed test build of the release source.
No production signing material is used. This is not physical-device qualification.
"""
import pathlib,subprocess,time,re,xml.etree.ElementTree as E,json,shlex
out=pathlib.Path('evidence/emulator');out.mkdir(parents=True,exist_ok=True)
package='uk.co.sumerostudio.nexuai3dforge.debug';activity='uk.co.sumerostudio.nexuai3dforge.MainActivity'
results=[]
def adb(*args,timeout=40,check=True):
 p=subprocess.run(['adb',*args],capture_output=True,timeout=timeout)
 if check and p.returncode:raise RuntimeError(p.stdout.decode(errors='replace')+p.stderr.decode(errors='replace'))
 return p.stdout.decode(errors='replace').strip()
def launch():
 result=adb('shell','am','start','-W','-n',package+'/'+activity);(out/'last-launch.txt').write_text(result)
 time.sleep(4);assert adb('shell','pidof',package),'Application process did not survive first launch'
def dump(name):
 adb('shell','uiautomator','dump','/sdcard/forge-window.xml')
 xml=adb('shell','cat','/sdcard/forge-window.xml');(out/(name+'.xml')).write_text(xml)
 screenshot=subprocess.run(['adb','exec-out','screencap','-p'],capture_output=True,timeout=20,check=True).stdout
 (out/(name+'.png')).write_bytes(screenshot)
 return E.fromstring(xml)
def click_text(text):
 x=dump('before-'+re.sub('[^a-zA-Z]','',text))
 nodes=[n for n in x.iter('node') if n.get('text')==text and n.get('clickable')=='true']
 assert nodes,'Button not visible: '+text
 bounds=list(map(int,re.findall(r'\d+',nodes[0].get('bounds'))));x1,y1,x2,y2=bounds
 adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(2)
def passed(name):results.append({'check':name,'result':'PASS'});(out/'results.json').write_text(json.dumps(results,indent=2))
try:
 deadline=time.monotonic()+240
 while time.monotonic()<deadline:
  if adb('shell','getprop','sys.boot_completed',timeout=10,check=False)=='1':break
  time.sleep(2)
 else:raise RuntimeError('Android emulator did not complete boot')
 adb('shell','input','keyevent','82')
 adb('shell','wm','size','1080x1920');adb('shell','wm','density','360')
 installed=adb('install','-r','project/app/build/outputs/apk/debug/app-debug.apk',timeout=100)
 assert 'Success' in installed;passed('Debug test APK installation on API 36 emulator')
 adb('logcat','-c');launch();phone=dump('phone-first-launch')
 assert any(n.get('text')=='NEXU AI 3D FORGE' for n in phone.iter('node'));passed('First launch and native branded phone layout')
 click_text('Library');assert adb('shell','pidof',package);dump('phone-library');passed('Library navigation without pairing')
 adb('shell','input','keyevent','4');time.sleep(2);back=dump('phone-back')
 assert any(n.get('text')=='Create' and n.get('selected')=='true' for n in back.iter('node'));passed('Android back returns Library to Create')
 click_text('Pair');pair=dump('phone-pair');assert any('Pair Windows Forge' in n.get('text','') for n in pair.iter('node'));passed('Native pairing screen')
 adb('shell','input','keyevent','3');time.sleep(2);adb('shell','am','force-stop',package);launch()
 restored=dump('phone-restart');assert any(n.get('text')=='Pair' and n.get('selected')=='true' for n in restored.iter('node'));passed('Process restart restores selected workspace')
 # Public destination must fail locally before any request can be sent.
 uri='nexuforge://pair?v=1&host=8.8.8.8&port=53971&offer=ABCDEF12&secret=ABCDEFGHJKLMNPQR'
 adb('shell','am','start','-n',package+'/'+activity,'-a','android.intent.action.VIEW','-d',shlex.quote(uri));time.sleep(2)
 rejected=dump('rejected-public-pairing');assert any('Invalid pairing link' in n.get('text','') for n in rejected.iter('node'));passed('Public-host deep link rejected without connection')
 adb('shell','input','keyevent','4');time.sleep(1);click_text('Create')
 adb('shell','wm','size','2048x1536');adb('shell','wm','density','200');time.sleep(5);tablet=dump('tablet-landscape')
 assert adb('shell','pidof',package);assert any(n.get('text')=='NEXU AI 3D FORGE' for n in tablet.iter('node'));passed('Tablet resize recreates native workspace without crash')
 adb('shell','settings','put','system','font_scale','2.0');time.sleep(5);dump('tablet-200-percent-text');assert adb('shell','pidof',package);passed('200 percent Android text scale remains running')
 # Capture application crashes separately from unrelated emulator service diagnostics.
 logs=adb('logcat','-d','-b','crash');(out/'crash-buffer.txt').write_text(logs)
 assert package not in logs,'Application crash recorded'
 passed('No app crash in exercised lifecycle and navigation paths')
 (out/'scope.txt').write_text('API 36 emulator; debug variant of corrected release source. No real PC/Blender generation, physical touch/accessibility, release-certificate install or production-key update test is claimed.\n')
except Exception as error:
 (out/'failure.txt').write_text(type(error).__name__+': '+str(error))
 (out/'logcat.txt').write_text(adb('logcat','-d',timeout=40,check=False))
 raise
finally:
 (out/'results.json').write_text(json.dumps(results,indent=2))
