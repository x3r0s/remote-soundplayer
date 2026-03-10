#!/bin/bash

# 설정 변수
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE_NAME="com.remotesoundplayer.app"

# 연결된 디바이스 ID 목록 추출
DEVICES=$(adb devices | grep -w "device" | grep -v "List of devices" | awk '{print $1}')

if [ -z "$DEVICES" ]; then
    echo "❌ 연결된 안드로이드 기기를 찾을 수 없습니다. (adb devices 결과를 확인해주세요)"
    exit 1
fi

echo "✅ 연결된 기기 목록:"
echo "$DEVICES"
echo "==================================="

# APK가 존재하는지 확인. 없다면 새로 빌드
if [ ! -f "$APK_PATH" ]; then
    echo "⏳ 빌드된 APK($APK_PATH)가 없습니다. 안드로이드 빌드를 시작합니다..."
    cd android && ./gradlew assembleDebug && cd ..
    
    if [ ! -f "$APK_PATH" ]; then
        echo "❌ 안드로이드 빌드에 실패했습니다. 코드를 확인해주세요."
        exit 1
    fi
    echo "✅ 빌드 완료!"
fi

# 모든 디바이스에 대해 순회하며 배포 진행
for DEVICE in $DEVICES; do
    echo "📱 기기 [$DEVICE] 배포 시작..."
    
    # 1. Metro 번들러와의 통신을 위한 로컬호스트 포트 포워딩 뚫기 (USB 케이블 연결 시 필수)
    echo "  - Metro 포팅 포워딩 (8081 -> 8081)"
    adb -s "$DEVICE" reverse tcp:8081 tcp:8081
    
    # 2. 혹시 기존에 켜져 꼬여있을 수 있으므로 앱 강제 종료
    adb -s "$DEVICE" shell am force-stop "$PACKAGE_NAME"
    
    # 3. APK 설치 동작 (설치 성공 여부 출력)
    echo "  - 앱 설치 중..."
    adb -s "$DEVICE" install -r "$APK_PATH"
    
    # 4. 메인 액티비티 런처 실행 (앱 켜기)
    echo "  - 앱 실행 중..."
    adb -s "$DEVICE" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
    
    echo "🎉 [$DEVICE] 배포 완료!"
    echo "-----------------------------------"
done

echo "🚀 모든 기기 배포 작업이 끝났습니다!"
echo "👉 앱이 Metro 번들러 서버와 정상 통신하여 번들을 로드하는지 화면을 확인해주세요."
