#!/usr/bin/env bash
# Builds dist/SCP-LIFE-<version>.apk: a full-screen WebView app with the offline game and its assets (sounds, models,
# textures) in the APK, served to the WebView from a virtual https origin. Also dist/scp-life-<version>-web.zip.
# Needs (Ubuntu): apt-get install android-sdk-build-tools android-sdk-platform-23 apksigner dalvik-exchange
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION_NAME=2.3; VERSION_CODE=5
SDK=/usr/lib/android-sdk; JAR=$SDK/platforms/android-23/android.jar
DX=$(command -v dx || echo $SDK/build-tools/debian/dx)
B=android/build
rm -rf $B/gen $B/obj $B/assets $B/*.apk $B/classes.dex; mkdir -p $B/gen $B/obj $B/assets dist
python3 Tools/bundle_web.py $B/assets/index.html ${THREE_JS:-}
(cd $B/assets && rm -f ../../../dist/scp-life-$VERSION_NAME-web.zip && zip -q -r ../../../dist/scp-life-$VERSION_NAME-web.zip index.html assets)
# the AI server address + access token go into the APK only (never into the web zip or git): SCP_AI_URL / SCP_AI_TOKEN or android/ai-config.local.json
python3 -I Tools/inject_ai_config.py $B/assets/index.html
aapt2 compile --dir android/res -o $B/res.zip
aapt2 link -o $B/base.apk -I $JAR --manifest android/AndroidManifest.xml -R $B/res.zip -A $B/assets -0 ogg -0 jpg -0 glb \
  --min-sdk-version 21 --target-sdk-version 34 --version-code $VERSION_CODE --version-name $VERSION_NAME --java $B/gen
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath $JAR -classpath $JAR -d $B/obj $(find android/src $B/gen -name '*.java')
$DX --dex --output=$B/classes.dex $B/obj
cp $B/base.apk $B/unsigned.apk && (cd $B && zip -q -j unsigned.apk classes.dex)
zipalign -f -p 4 $B/unsigned.apk $B/aligned.apk
# Debug signing key kept in the repository so that new versions install over old ones (saves are kept). Not a release key.
[ -f android/debug.keystore ] || keytool -genkeypair -keystore android/debug.keystore -storepass android -keypass android -alias scplife \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=SCP LIFE debug" >/dev/null 2>&1
apksigner sign --ks android/debug.keystore --ks-key-alias scplife --ks-pass pass:android --key-pass pass:android --out dist/SCP-LIFE-$VERSION_NAME.apk $B/aligned.apk
apksigner verify dist/SCP-LIFE-$VERSION_NAME.apk && echo "apk: dist/SCP-LIFE-$VERSION_NAME.apk ($(du -k dist/SCP-LIFE-$VERSION_NAME.apk | cut -f1) KB)"
