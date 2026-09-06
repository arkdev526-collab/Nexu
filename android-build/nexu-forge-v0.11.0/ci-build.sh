#!/usr/bin/env bash
set -euo pipefail
mkdir -p evidence tools
BASE="$PWD/android-build/nexu-forge-v0.11.0"
# Current vendor patch. The setup-java pinned catalogue does not yet list it.
JDK_FILE=microsoft-jdk-21.0.12-linux-x64.tar.gz
JDK_DIR="$RUNNER_TEMP/forge-jdk"
mkdir -p "$JDK_DIR" "$RUNNER_TEMP/forge-gpg"
chmod 700 "$RUNNER_TEMP/forge-gpg"
curl --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 15 --max-time 180 -fLsS "https://aka.ms/download-jdk/$JDK_FILE" -o "$JDK_DIR/$JDK_FILE"
curl --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 15 --max-time 60 -fLsS "https://aka.ms/download-jdk/$JDK_FILE.sha256sum.txt" -o evidence/jdk-vendor.sha256
curl --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 15 --max-time 60 -fLsS "https://aka.ms/download-jdk/$JDK_FILE.sig" -o "$JDK_DIR/archive.sig"
curl --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 60 -fLsS https://download.visualstudio.microsoft.com/download/pr/b90071e2-e0cf-4411-98be-dbeb09d67bf0/8622862bcd54206e158c5abca0582c9b/464279_464280_aoc_20210208.asc -o "$JDK_DIR/vendor.asc"
DIGEST=$(grep -Eo '[0-9a-fA-F]{64}' evidence/jdk-vendor.sha256 | head -n1)
test ${#DIGEST} -eq 64
printf '%s  %s\n' "$DIGEST" "$JDK_DIR/$JDK_FILE" | sha256sum -c - > evidence/jdk-hash-verification.txt
gpg --homedir "$RUNNER_TEMP/forge-gpg" --batch --import "$JDK_DIR/vendor.asc" 2> evidence/jdk-key-import.txt
gpg --homedir "$RUNNER_TEMP/forge-gpg" --batch --status-fd 1 --verify "$JDK_DIR/archive.sig" "$JDK_DIR/$JDK_FILE" > evidence/jdk-signature-verification.txt 2>&1
grep -q 'VALIDSIG' evidence/jdk-signature-verification.txt
tar -xzf "$JDK_DIR/$JDK_FILE" -C "$JDK_DIR"
JAVA=$(find "$JDK_DIR" -mindepth 3 -maxdepth 3 -path '*/bin/java' -type f | head -n1)
test -n "$JAVA"
export JAVA_HOME="$(dirname "$(dirname "$JAVA")")"
export PATH="$JAVA_HOME/bin:$PATH"
java -version 2> evidence/java-version.txt
grep -q '21.0.12' evidence/java-version.txt
python3 - <<'PY'
import pathlib,base64,hashlib,zipfile,io,shutil
root=pathlib.Path('android-build/nexu-forge-v0.11.0')
parts=sorted(root.glob('project.b64.part-*'));assert len(parts)==11
first=parts[0].read_bytes().strip();assert len(first)==6001 and first[-1:]==b'I'
data=base64.b64decode(first[:-1]+b''.join(p.read_bytes().strip() for p in parts[1:]),validate=True)
digest=hashlib.sha256(data).hexdigest();assert digest=='d4f72e0cf2454f826c9554b42399dc29065e44bd1e163a1d6570560fd994508a'
archive=zipfile.ZipFile(io.BytesIO(data));assert archive.testzip() is None
for n in archive.namelist():assert not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts
archive.extractall('project');shutil.copytree(root/'overrides','project',dirs_exist_ok=True)
pathlib.Path('evidence/baseline-recovery.txt').write_text('Original archive SHA256: '+digest+'\nAll CRCs pass. Desktop source unchanged.\n')
PY
python3 "$BASE/finish.py" project
python3 "$BASE/regression-fixes.py" project
python3 "$BASE/final-fixes.py" project
if [ -f "$BASE/rc-fixes.py" ]; then python3 "$BASE/rc-fixes.py" project; fi
MANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
set +o pipefail
yes | "$MANAGER" --licenses > evidence/sdk-licences.log
set -o pipefail
"$MANAGER" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
"$MANAGER" --list_installed > evidence/sdk-installed.txt
BT="$ANDROID_HOME/build-tools/36.0.0"
cp "$ANDROID_HOME/platforms/android-36/android.jar" "$BT/lib/apksigner.jar" "$BT/zipalign" "$BT/aapt2" tools/
for LIB in $(ldd "$BT/zipalign" | awk '/libc\+\+|libc\+\+abi|libunwind/ {print $3}'); do cp -L "$LIB" tools/; done
curl --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 180 -fLsS https://services.gradle.org/distributions/gradle-9.5.0-bin.zip -o "$RUNNER_TEMP/gradle.zip"
echo "553c78f50dafcd54d65b9a444649057857469edf836431389695608536d6b746  $RUNNER_TEMP/gradle.zip" | sha256sum -c - > evidence/gradle-download-verification.txt
unzip -q "$RUNNER_TEMP/gradle.zip" -d "$RUNNER_TEMP"
export PATH="$RUNNER_TEMP/gradle-9.5.0/bin:$PATH"
gradle --version > evidence/gradle-version.txt
gradle -p project wrapper --gradle-version 9.5.0 --distribution-type bin --gradle-distribution-sha256-sum 553c78f50dafcd54d65b9a444649057857469edf836431389695608536d6b746 --no-daemon
gradle -p project clean testReleaseUnitTest lintRelease assembleRelease --write-locks --no-daemon --stacktrace --warning-mode all 2>&1 | tee evidence/build.log
python3 - <<'PY'
import pathlib,xml.etree.ElementTree as E
files=list(pathlib.Path('project/app/build/test-results').rglob('TEST-*.xml'));assert files
results=[E.parse(f).getroot() for f in files];n=sum(int(r.get('tests','0')) for r in results)
assert n>=38 and all(int(r.get('failures','0'))==0 and int(r.get('errors','0'))==0 and int(r.get('skipped','0'))==0 for r in results)
issues=E.parse('project/app/build/reports/lint-results-release.xml').getroot().findall('issue')
assert not [i for i in issues if i.get('severity') in ('Error','Fatal')]
pathlib.Path('evidence/tests-lint-summary.txt').write_text(f'{n} executed tests: PASS\nLint errors: 0\nOther findings: {len(issues)}\n')
PY
APK=project/app/build/outputs/apk/release/app-release-unsigned.apk
"$BT/zipalign" -P 16 -f -v 4 "$APK" evidence/Nexu-AI-3D-Forge-Android-v0.11.0-unsigned-aligned.apk > evidence/zipalign-build.txt
"$BT/zipalign" -c -P 16 -v 4 evidence/*-unsigned-aligned.apk > evidence/zipalign-verify.txt
"$BT/aapt2" dump badging evidence/*-unsigned-aligned.apk > evidence/apk-metadata.txt
grep -q "name='uk.co.sumerostudio.nexuai3dforge' versionCode='110' versionName='0.11.0'" evidence/apk-metadata.txt
grep -q "sdkVersion:'30'" evidence/apk-metadata.txt
grep -q "targetSdkVersion:'36'" evidence/apk-metadata.txt
sha256sum evidence/*-unsigned-aligned.apk > evidence/unsigned-apk.sha256
# Debug variant uses an ephemeral test identity, never the release signing key.
gradle -p project assembleDebug --write-locks --no-daemon > evidence/debug-assembly.log 2>&1
"$MANAGER" 'emulator' 'system-images;android-36;google_apis;x86_64' > evidence/emulator-install.log
echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd --force -n forge_api36 -k 'system-images;android-36;google_apis;x86_64' > evidence/avd-create.log
if [ -e /dev/kvm ]; then sudo setfacl -m "u:$(whoami):rw" /dev/kvm; fi
"$ANDROID_HOME/emulator/emulator" -avd forge_api36 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect > evidence/emulator.log 2>&1 &
timeout 240 adb wait-for-device
python3 "$BASE/emulator-smoke.py"
adb emu kill
