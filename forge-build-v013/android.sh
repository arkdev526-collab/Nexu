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
test "$DIGEST" = f2a84ad31ebeaf3a26252dd86a4a8e1b74aefb6bfc8e55fd20190110d1353c0f
printf '%s  %s\n' "$DIGEST" "$JDK_DIR/$JDK_FILE" | sha256sum -c - > evidence/jdk-hash-verification.txt
gpg --homedir "$RUNNER_TEMP/forge-gpg" --batch --import "$JDK_DIR/vendor.asc" 2> evidence/jdk-key-import.txt
gpg --homedir "$RUNNER_TEMP/forge-gpg" --batch --status-fd 1 --verify "$JDK_DIR/archive.sig" "$JDK_DIR/$JDK_FILE" > evidence/jdk-signature-verification.txt 2>&1
grep -q 'VALIDSIG B602433384B8991302924D8235531D315B21C189' evidence/jdk-signature-verification.txt
tar -xzf "$JDK_DIR/$JDK_FILE" -C "$JDK_DIR"
JAVA=$(find "$JDK_DIR" -mindepth 3 -maxdepth 3 -path '*/bin/java' -type f | head -n1)
test -n "$JAVA"
export JAVA_HOME="$(dirname "$(dirname "$JAVA")")"
export PATH="$JAVA_HOME/bin:$PATH"
java -version 2> evidence/java-version.txt
grep -q '21.0.12' evidence/java-version.txt

echo '03b0a1265ca53c4d0565ac89742a5dcdc8f15cd7c32c6615b443b960fafd5152  forge-build-v013/source.zip' | sha256sum -c -
unzip -q forge-build-v013/source.zip -d project
MANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
"$MANAGER" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
cd project/Android
bash gradlew --no-daemon clean testReleaseUnitTest lintRelease assembleRelease assembleDebug --write-locks --stacktrace 2>&1 | tee ../../evidence/android-build.txt
python3 -m unittest discover -s tools -p test_release_apk.py 2>&1 | tee ../../evidence/signing-tests.txt
BT="$ANDROID_HOME/build-tools/36.0.0"
"$BT/apksigner" verify --verbose --print-certs app/build/outputs/apk/debug/app-debug.apk > ../../evidence/preview-signature.txt
"$BT/aapt2" dump badging app/build/outputs/apk/debug/app-debug.apk > ../../evidence/preview-metadata.txt
grep -q "name='uk.co.sumerostudio.nexuai3dforge.preview.v0130'" ../../evidence/preview-metadata.txt
cp app/build/outputs/apk/debug/app-debug.apk ../../evidence/Nexu-AI-3D-Forge-Android-v0.13.0-Preview.apk
cp app/build/outputs/apk/release/app-release-unsigned.apk ../../evidence/Forge-v0.13.0-UNSIGNED-NOT-INSTALLABLE.apk
(cd ../../evidence && sha256sum *.apk > android-sha256.txt)
