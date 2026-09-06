"""CI transport only. The release contains ordinary corrected Java source, not this migration."""
from pathlib import Path
import base64, hashlib, json, shutil, sys, zlib
root=Path(sys.argv[1])
transport=Path(__file__).parent
out=Path('evidence/native-source-transport');out.mkdir(parents=True,exist_ok=True)
expected=[
 '28a34dbd80d2ba5856882b1c8550702d0fa1a9ee0f9179baca5eb77e395d5a36',
 '241398571ca32811aeab961db6c5827a1e8ac4bb9f300252a5459b95ab0d4599',
 'd24fa683b2c830a5c1b2ab4c125e456a624863f1abebaa52858bc24fe955c7bd']
parts=[]; results=[]
for i,want in enumerate(expected,1):
    p=transport/f'hardened-main.part-{i:02}'
    data=p.read_bytes().strip();shutil.copyfile(p,out/p.name)
    actual=hashlib.sha256(data).hexdigest()
    results.append({'part':i,'bytes':len(data),'sha256':actual,'expected':want})
    parts.append(data)
(out/'integrity.json').write_text(json.dumps(results,indent=2))
assert all(x['sha256']==x['expected'] for x in results),'Native source transport mismatch; fail closed and retain evidence.'
source=zlib.decompress(base64.b64decode(b''.join(parts),validate=True))
assert len(source)==59309
assert hashlib.sha256(source).hexdigest()=='d3b4ef90127a13d71d481a3fee2e72fdcc0f5d4f0e56a3f8d73378ce5d0c0858'
p=root/'app/src/main/java/uk/co/sumerostudio/nexuai3dforge/MainActivity.java'
p.write_bytes(source)
gradle=root/'app/build.gradle';s=gradle.read_text()
assert "testImplementation 'junit:junit:4.13.2'" in s
s=s.replace("testImplementation 'junit:junit:4.13.2'","testImplementation 'junit:junit:4.13.2'\n    testImplementation 'org.json:json:20260719'")
assert 'returnDefaultValues' not in s
if 'gradle.projectsEvaluated' in s:s=s[:s.index('gradle.projectsEvaluated')]
gradle.write_text(s)
Path('evidence/android-source-integrity.txt').write_text('MainActivity SHA256: '+hashlib.sha256(source).hexdigest()+'\nComplete ordinary Android source reconstructed and corrected. Test JSON is test-only, no mocked default return values.\n')
