#!/bin/bash
# Build Android APK locally
# Prerequisites: Android SDK installed, ANDROID_HOME set

set -e

export ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

echo "Using Android SDK at: $ANDROID_HOME"

if [ ! -d "$ANDROID_HOME/platform-tools" ]; then
  echo "ERROR: Android SDK not found at $ANDROID_HOME"
  echo "Install it via Android Studio, or download command-line tools:"
  echo "  https://developer.android.com/studio#command-tools"
  exit 1
fi

cd "$(dirname "$0")/android"
./gradlew assembleDebug --no-daemon

echo ""
echo "Debug APK built at:"
echo "  $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Install on connected device/emulator:"
echo "  adb install -r app/build/outputs/apk/debug/app-debug.apk"