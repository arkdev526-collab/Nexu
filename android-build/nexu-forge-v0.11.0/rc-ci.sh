#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_HOME:?Android SDK path must be provided by the runner}"
: "${RUNNER_TEMP:?Isolated runner temporary directory is required}"
# One explicit tool/home authority for avdmanager, emulator and every adb subprocess.
# Do not rely on a hosted runner's PATH or conflicting legacy ANDROID_SDK_HOME.
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
unset ANDROID_SDK_HOME
export ANDROID_USER_HOME="$RUNNER_TEMP/nexu-forge-android-user"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
export ANDROID_SERIAL=emulator-5554
mkdir -p "$ANDROID_AVD_HOME" evidence
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
old='create avd --force -n forge_api36 -k'
assert text.count(old)==1
text=text.replace(old,'create avd --force -n forge_api36 -p "$ANDROID_AVD_HOME/forge_api36.avd" -k')
old='if [ -e /dev/kvm ]; then'
assert text.count(old)==1
text=text.replace(old,'''test -x "$ANDROID_HOME/platform-tools/adb"
test "$(command -v adb)" = "$ANDROID_HOME/platform-tools/adb"
test -s "$ANDROID_AVD_HOME/forge_api36.ini"
"$ANDROID_HOME/emulator/emulator" -list-avds | tee evidence/avd-discovery.txt
grep -qx forge_api36 evidence/avd-discovery.txt
adb version > evidence/adb-version.txt
if [ -e /dev/kvm ]; then''')
text=text.replace('-avd forge_api36 -no-window','-avd forge_api36 -port 5554 -no-window')
text=text.replace('-gpu swiftshader_indirect','-gpu swiftshader')
Path('/tmp/forge-ci-corrected.sh').write_text(text)
Path('evidence/build-path-regression.txt').write_text('Explicit platform-tools PATH; common AVD home and avdmanager path; AVD discovery assertion; API/minSdk checks retained.\n')
PY
bash /tmp/forge-ci-corrected.sh
