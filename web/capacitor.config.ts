import type { CapacitorConfig } from '@capacitor/cli';

// ── 빌드 모드 감지 ──────────────────────────────────────────────────────────
// CAPACITOR_SERVER_URL 환경변수로 배포 URL 주입 (CI/CD 파이프라인 사용)
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  // ── 앱 기본 정보 ──────────────────────────────────────────────────────────
  appId:   'com.ssolap.app',
  appName: 'SSOLAP',

  // ── 웹 빌드 출력 디렉토리 (Next.js 일반 빌드 out/ 또는 .next/static) ─────
  // 로컬 번들 모드 시 webDir 사용, 서버 URL 모드에서는 무시됨
  webDir: 'out',

  // ── 서버 설정 ──────────────────────────────────────────────────────────────
  server: serverUrl
    ? {
        // 프로덕션: 배포된 Next.js 서버에서 앱 로드
        url: serverUrl,
        cleartext: false,
      }
    : {
        // 개발: 안드로이드 에뮬레이터에서 로컬 Next.js (10.0.2.2 = 호스트 PC)
        // 실 기기 테스트 시에는 PC의 실제 IP로 변경
        url: 'http://10.0.2.2:3000',
        cleartext: true,
      },

  // ── Android 플랫폼 설정 ─────────────────────────────────────────────────────
  android: {
    buildOptions: {
      keystorePath:     undefined,  // 릴리즈 서명 시 경로 설정
      keystoreAlias:    undefined,
      keystorePassword: undefined,
      releaseType:      'APK',
    },
  },

  // ── 플러그인 설정 ──────────────────────────────────────────────────────────
  plugins: {
    SplashScreen: {
      launchShowDuration:       0,
      backgroundColor:          '#0A0A14',
      androidSplashResourceName:'splash',
      showSpinner:              false,
    },
  },
};

export default config;
