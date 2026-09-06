#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
from pathlib import Path
p=Path('android-build/nexu-forge-v0.11.0/ci-build.sh');text=p.read_text()
old='grep -q "sdkVersion:\'30\'" evidence/apk-metadata.txt'
assert text.count(old)==1
text=text.replace(old,'grep -q "minSdkVersion:\'30\'" evidence/apk-metadata.txt')
old='test ${#DIGEST} -eq 64'
assert text.count(old)==1
text=text.replace(old,old+'\ntest "$DIGEST" = f2a84ad31ebeaf3a26252dd86a4a8e1b74aefb6bfc8e55fd20190110d1353c0f')
old="grep -q 'VALIDSIG' evidence/jdk-signature-verification.txt"
assert old in text
text=text.replace(old,"grep -q 'VALIDSIG B602433384B8991302924D8235531D315B21C189' evidence/jdk-signature-verification.txt")
Path('/tmp/forge-ci-corrected.sh').write_text(text)
PY
bash /tmp/forge-ci-corrected.sh
