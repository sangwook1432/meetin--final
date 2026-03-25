import type { CapacitorConfig } from "@capacitor/cli";

const isProd = process.env.NODE_ENV === "production";

const config: CapacitorConfig = {
  appId: "kr.meetin.app",
  appName: "MEETIN",
  webDir: "out", // 로컬 빌드 fallback (현재는 server URL 방식 사용)

  server: {
    // 배포된 Next.js 서버 URL을 WebView로 로드
    // 앱스토어 심사 통과 후 변경 불필요 — 웹만 배포하면 앱도 자동 업데이트
    url: isProd
      ? "https://meetin.kr"        // 프로덕션 도메인 (배포 후 교체)
      : "http://localhost:3000",   // 로컬 개발
    cleartext: true,               // HTTP 허용 (개발용, 프로덕션은 HTTPS라 불필요)
    androidScheme: "https",
  },

  ios: {
    contentInset: "always",
  },

  android: {
    allowMixedContent: false,      // 프로덕션에서 HTTP 혼용 차단
  },
};

export default config;
