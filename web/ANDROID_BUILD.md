# SSOLAP Android APK 빌드 가이드

## 개요

SSOLAP Android 앱은 Capacitor를 통해 Next.js 웹앱을 네이티브 APK로 패키징합니다.
앱은 **서버 URL 모드**로 동작 — APK가 배포된 Next.js 서버에서 앱을 로드합니다.

---

## 1. 사전 준비

### 1-1. JDK 17 설치

- 다운로드: https://adoptium.net/ (Eclipse Temurin 17 LTS 권장)
- 설치 후 확인:
  ```bash
  java -version  # openjdk 17.x.x 출력 확인
  ```

### 1-2. Android Studio 설치

- 다운로드: https://developer.android.com/studio
- 설치 중 SDK Components 선택:
  - ✅ Android SDK
  - ✅ Android SDK Build-Tools 36
  - ✅ Android Emulator (선택사항)

### 1-3. 환경 변수 설정 (Windows)

시스템 환경 변수에 추가:
```
ANDROID_HOME = C:\Users\{사용자명}\AppData\Local\Android\Sdk
JAVA_HOME    = C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot
```

PATH에 추가:
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\tools
```

---

## 2. 개발 빌드 (Debug APK)

```bash
# 프로젝트 루트 (web/)
cd C:\Users\Jinha\SSOLAP\web

# android/ 디렉토리로 이동
cd android

# Debug APK 빌드
./gradlew assembleDebug
```

APK 위치: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 3. 앱 설정

### 3-1. 개발 서버 연결 (에뮬레이터)

`capacitor.config.ts`의 `server.url`이 `http://10.0.2.2:3000`으로 설정되어 있습니다.
- `10.0.2.2` = Android 에뮬레이터에서 호스트 PC의 localhost
- 개발 서버 먼저 실행: `npm run dev` (포트 3000)

### 3-2. 실 기기 테스트

실 기기의 경우 PC와 같은 Wi-Fi에서:
1. PC IP 확인: `ipconfig` → 192.168.x.x
2. `capacitor.config.ts`의 `server.url`을 `http://192.168.x.x:3000`으로 변경
3. `npx cap sync android`
4. `cd android && ./gradlew assembleDebug`

### 3-3. 프로덕션 빌드

배포 서버 주소로 변경 후 빌드:
```bash
# server.url을 프로덕션 URL로 설정
CAPACITOR_SERVER_URL=https://ssolap.com npx cap sync android
cd android && ./gradlew assembleRelease
```

---

## 4. Android Studio에서 빌드 (GUI)

```bash
npx cap open android
```
→ Android Studio가 열리면:
- Build → Build Bundle(s) / APK(s) → Build APK(s)
- 또는 Run → Run 'app'으로 에뮬레이터 실행

---

## 5. 현재 Capacitor 구성

| 설정 | 값 |
|------|----|
| App ID | `com.ssolap.app` |
| App Name | `SSOLAP` |
| Capacitor 버전 | 8.x |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 36 (Android 16) |
| 서버 모드 | 개발: `http://10.0.2.2:3000` |

---

## 6. 문제 해결

### Gradle 빌드 실패: SDK not found
```bash
# Android SDK 경로 확인
echo %ANDROID_HOME%
# android/local.properties 파일에 직접 지정
echo sdk.dir=C\:\\Users\\{사용자명}\\AppData\\Local\\Android\\Sdk > android/local.properties
```

### CORS 오류 (APK → API 호출)
FastAPI의 CORS 설정에 `capacitor://localhost` 추가:
```python
# api/app/main.py
origins = [
    "http://localhost:3000",
    "capacitor://localhost",
    "https://localhost",
]
```
